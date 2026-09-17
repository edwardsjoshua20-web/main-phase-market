import { isInstant, isSorcery, normalizeMagicCard } from '../magicCards.js';
import { COST_TYPES, PAYMENT_STATUS, createTriggeredPaymentCost, normalizeCost, payCost } from './costSystem.js';
import { createGameObject, emitEvent, moveObject, registerGameObject, runStateBasedActionsRuntime } from './runtimeState.js';

export const STACK_OBJECT_TYPES = Object.freeze({
  SPELL: 'Spell',
  ACTIVATED_ABILITY: 'ActivatedAbility',
  TRIGGERED_ABILITY: 'TriggeredAbility'
});

let nextStackId = 1;
let nextOrder = 1;

export function resetStackRuntimeIds() {
  nextStackId = 1;
  nextOrder = 1;
}

export function createStackObject({ kind, sourceObject, controller, targets = [], modes = [], costs = [], chosenValues = {}, effectIR = [], ruleReferences = [] } = {}) {
  return {
    id: `stack-${nextStackId++}`,
    kind,
    sourceObject,
    controller,
    targets,
    modes,
    costs: costs.map(normalizeCost).filter(Boolean),
    chosenValues,
    effectIR,
    order: nextOrder++,
    ruleReferences,
    status: 'on-stack'
  };
}

export function pushStackObject(state, stackObject) {
  state.stack.push(stackObject);
  state.game.consecutivePasses = 0;
  emitEvent(state, 'StackObjectAdded', {
    source: stackObject.sourceObject,
    controller: stackObject.controller,
    metadata: { stackObjectId: stackObject.id, stackObjectType: stackObject.kind, order: stackObject.order }
  });
  return stackObject;
}

export function counterStackObject(state, stackObject, source = null) {
  const index = state.stack.findIndex((entry) => entry.id === stackObject?.id);
  if (index < 0) return { countered: false, reason: 'The stack object is no longer on the stack.' };
  state.stack.splice(index, 1);
  stackObject.status = 'countered';
  emitEvent(state, 'StackObjectCountered', {
    source: source?.sourceObject || source,
    affected: stackObject.sourceObject,
    controller: stackObject.controller,
    metadata: { stackObjectId: stackObject.id, stackObjectType: stackObject.kind }
  });
  if (stackObject.kind === STACK_OBJECT_TYPES.SPELL && stackObject.sourceObject?.zone === 'stack') {
    moveObject(state, stackObject.sourceObject, 'graveyard', 'countered');
  }
  return { countered: true, stackObject };
}

export function grantPriority(state, playerId = state.game.activePlayer) {
  state.game.priorityHolder = playerId;
  state.game.consecutivePasses = 0;
  emitEvent(state, 'PriorityGranted', { player: playerId });
  return playerId;
}

export function takePriorityAction(state, playerId, action = null) {
  if (state.game.priorityHolder !== playerId) return { allowed: false, reason: `${playerId} does not have priority.` };
  state.game.consecutivePasses = 0;
  state.game.priorityHolder = playerId;
  emitEvent(state, 'PriorityActionTaken', { player: playerId, metadata: { action: action?.type || action || null } });
  return { allowed: true };
}

const STEP_ORDER = Object.freeze(['beginning', 'precombat-main', 'combat', 'postcombat-main', 'ending']);

export function advanceGameStep(state) {
  const current = state.game.step || (state.game.phase === 'main' ? 'precombat-main' : state.game.phase || 'beginning');
  const index = Math.max(0, STEP_ORDER.indexOf(current));
  const next = STEP_ORDER[index + 1] || 'beginning';
  if (next === 'beginning') {
    state.game.turn += 1;
    state.game.activePlayer = opponentOf(state.game.activePlayer);
  }
  state.game.step = next;
  state.game.phase = next.includes('main') ? 'main' : next;
  emitEvent(state, 'StepAdvanced', { player: state.game.activePlayer, metadata: { from: current, to: next, turn: state.game.turn } });
  grantPriority(state, state.game.activePlayer);
  return next;
}

export function passPriority(state, playerId, { resolve = resolveTopOfStack } = {}) {
  if (state.game.priorityHolder !== playerId) return { allowed: false, reason: `${playerId} does not have priority.` };
  state.game.consecutivePasses += 1;
  emitEvent(state, 'PriorityPassed', { player: playerId, metadata: { consecutivePasses: state.game.consecutivePasses } });
  if (state.game.consecutivePasses < 2) {
    state.game.priorityHolder = opponentOf(playerId);
    return { allowed: true, resolved: false };
  }
  state.game.consecutivePasses = 0;
  if (state.stack.length === 0) return { allowed: true, resolved: false, advancedTo: advanceGameStep(state) };
  const result = resolve(state);
  grantPriority(state, state.game.activePlayer);
  return { allowed: true, resolved: true, result };
}

export function checkTimingPermission({ state, card = null, actionType = 'Cast', playerId, factsProvided = {} } = {}) {
  const missing = [];
  if (!factsProvided.priority && !state?.game?.priorityHolder) missing.push('who has priority');
  if (actionType === 'Cast' && isSorcery(normalizeMagicCard(card || {}))) {
    if (!factsProvided.turn) missing.push('whose turn it is');
    if (!factsProvided.phase) missing.push('the current phase');
    if (!factsProvided.stack) missing.push('whether the stack is empty');
  }
  if (missing.length) return { allowed: null, status: 'depends', missing };
  if (state.game.priorityHolder !== playerId) return { allowed: false, status: 'denied', reason: `${playerId} does not have priority.` };
  if (actionType === 'Activate') return { allowed: true, status: 'allowed' };
  const normalized = normalizeMagicCard(card || {});
  if (isInstant(normalized)) return { allowed: true, status: 'allowed' };
  if (isSorcery(normalized)) {
    const ownTurn = state.game.activePlayer === playerId;
    const main = state.game.phase === 'main';
    const empty = state.stack.length === 0;
    return ownTurn && main && empty
      ? { allowed: true, status: 'allowed' }
      : { allowed: false, status: 'denied', reason: 'Sorcery timing requires your main phase, an empty stack, and priority.' };
  }
  return { allowed: null, status: 'unverified', reason: 'This action type has no certified timing rule.' };
}

function wardAbilities(target) {
  return (target?.keywordAbilities || []).filter((ability) => ability.keyword === 'ward' && ability.cost);
}

export function createWardTriggers(state, targetEvent) {
  const target = targetEvent.object || targetEvent.affected;
  const sourceStackObject = state.stack.find((entry) => entry.id === targetEvent.metadata?.stackObjectId);
  if (!target || !sourceStackObject || target.controller === sourceStackObject.controller) return [];
  const triggers = wardAbilities(target).map((ability) => createStackObject({
    kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY,
    sourceObject: target,
    controller: target.controller,
    targets: [{ type: 'StackObjectTarget', stackObjectId: sourceStackObject.id }],
    costs: [createTriggeredPaymentCost(ability.cost, { reason: 'ward', payer: sourceStackObject.controller })],
    effectIR: [{ type: 'CounterUnlessPaid', stackObjectId: sourceStackObject.id }],
    chosenValues: { triggeringEventId: targetEvent.id },
    ruleReferences: ['CR-603', 'CR-702.21']
  }));
  for (const trigger of triggers) {
    state.pendingTriggers.push(trigger);
    emitEvent(state, 'TriggerCreated', {
      source: target,
      affected: sourceStackObject.sourceObject,
      controller: trigger.controller,
      metadata: { triggerId: trigger.id, triggerEvent: 'TargetChosen', keyword: 'ward' }
    });
  }
  return triggers;
}

export function putPendingStackTriggers(state) {
  const active = state.game.activePlayer;
  const ap = state.pendingTriggers.filter((trigger) => trigger.controller === active).sort((a, b) => a.order - b.order);
  const nap = state.pendingTriggers.filter((trigger) => trigger.controller !== active).sort((a, b) => a.order - b.order);
  const ordered = [...ap, ...nap];
  state.pendingTriggers = [];
  for (const trigger of ordered) {
    pushStackObject(state, trigger);
    emitEvent(state, 'TriggerPutOnStack', { source: trigger.sourceObject, controller: trigger.controller, metadata: { triggerId: trigger.id } });
  }
  return ordered;
}

export function castSpell(state, { card, controller, targets = [], modes = [], costs = [], chosenValues = {}, paymentChoices = [], skipTiming = false, factsProvided = {}, validateTarget = null } = {}) {
  const timing = skipTiming ? { allowed: true, status: 'allowed' } : checkTimingPermission({ state, card, actionType: 'Cast', playerId: controller, factsProvided });
  if (timing.allowed !== true) return { cast: false, timing };
  const sourceObject = registerGameObject(state, createGameObject({ card, controller, owner: controller, zone: 'stack' }));
  const stackObject = createStackObject({
    kind: STACK_OBJECT_TYPES.SPELL,
    sourceObject,
    controller,
    targets,
    modes,
    costs,
    chosenValues,
    effectIR: sourceObject.semantics?.spellEffects || [],
    ruleReferences: ['CR-601', 'CR-405']
  });
  const targetChecks = targets.map((target, index) => validateTarget ? validateTarget({ sourceObject, target, effect: stackObject.effectIR[index] || stackObject.effectIR[0] }) : { legal: Boolean(target) });
  if (targetChecks.some((check) => !check.legal)) {
    moveObject(state, sourceObject, 'hand', 'casting rolled back: illegal target');
    return { cast: false, timing, targetChecks };
  }
  const costPayments = stackObject.costs.map((cost, index) => payCost({
    state,
    playerId: controller,
    cost,
    choice: paymentChoices[index] || PAYMENT_STATUS.PAID,
    sourceObject
  }));
  const failedPayment = costPayments.find((payment) => !payment.paid);
  if (failedPayment) {
    moveObject(state, sourceObject, 'hand', 'casting rolled back: cost not paid');
    return { cast: false, timing, targetChecks, costPayments, paymentFailure: failedPayment };
  }
  costPayments.forEach((payment) => emitEvent(state, 'CostPaid', { source: sourceObject, player: controller, metadata: { costType: payment.cost.type } }));
  pushStackObject(state, stackObject);
  emitEvent(state, 'SpellCast', { source: sourceObject, controller, metadata: { stackObjectId: stackObject.id } });
  const targetEvents = targets.map((target, index) => emitEvent(state, 'TargetChosen', {
    source: sourceObject,
    object: target,
    affected: target,
    controller,
    metadata: { stackObjectId: stackObject.id, targetIndex: index + 1 }
  }));
  for (const event of targetEvents) createWardTriggers(state, event);
  putPendingStackTriggers(state);
  grantPriority(state, state.game.activePlayer);
  return { cast: true, stackObject, sourceObject, targetChecks, targetEvents, costPayments };
}

export function activateAbility(state, { sourceObject, controller, targets = [], costs = [], effectIR = [], factsProvided = {} } = {}) {
  const timing = checkTimingPermission({ state, actionType: 'Activate', playerId: controller, factsProvided });
  if (timing.allowed !== true) return { activated: false, timing };
  const costPayments = costs.map((cost) => payCost({ state, playerId: controller, cost, choice: PAYMENT_STATUS.PAID, sourceObject }));
  const failedPayment = costPayments.find((payment) => !payment.paid);
  if (failedPayment) return { activated: false, timing, costPayments, paymentFailure: failedPayment };
  const stackObject = createStackObject({ kind: STACK_OBJECT_TYPES.ACTIVATED_ABILITY, sourceObject, controller, targets, costs, effectIR, ruleReferences: ['CR-602', 'CR-405'] });
  pushStackObject(state, stackObject);
  emitEvent(state, 'AbilityActivated', { source: sourceObject, controller, metadata: { stackObjectId: stackObject.id } });
  const targetEvents = targets.map((target, index) => emitEvent(state, 'TargetChosen', {
    source: sourceObject,
    object: target,
    affected: target,
    controller,
    metadata: { stackObjectId: stackObject.id, targetIndex: index + 1 }
  }));
  for (const event of targetEvents) createWardTriggers(state, event);
  putPendingStackTriggers(state);
  grantPriority(state, state.game.activePlayer);
  return { activated: true, stackObject, costPayments, targetEvents };
}

export function resolveTopOfStack(state, { paymentChoices = [], resolveEffect = null } = {}) {
  const stackObject = state.stack.at(-1);
  if (!stackObject) return { resolved: false, reason: 'The stack is empty.' };
  if (stackObject.kind === STACK_OBJECT_TYPES.TRIGGERED_ABILITY && stackObject.effectIR.some((effect) => effect.type === 'CounterUnlessPaid')) {
    const effect = stackObject.effectIR.find((entry) => entry.type === 'CounterUnlessPaid');
    const payment = stackObject.costs.find((cost) => cost.type === COST_TYPES.TRIGGERED_PAYMENT);
    const choice = paymentChoices.find((entry) => entry.triggerId === stackObject.id || (entry.reason === 'ward' && entry.sourceObjectId === stackObject.sourceObject.id));
    const result = payCost({ state, playerId: payment.payer, cost: payment, choice: choice || PAYMENT_STATUS.UNSPECIFIED, sourceObject: stackObject.sourceObject });
    if (result.status === PAYMENT_STATUS.UNSPECIFIED) return { resolved: false, status: 'depends', payment: result, stackObject };
    state.stack.pop();
    stackObject.status = 'resolved';
    const original = state.stack.find((entry) => entry.id === effect.stackObjectId);
    if (!result.paid && original) counterStackObject(state, original, stackObject);
    emitEvent(state, 'AbilityResolved', {
      source: stackObject.sourceObject,
      controller: stackObject.controller,
      metadata: { triggerId: stackObject.id, paymentStatus: result.status, counteredStackObjectId: !result.paid ? original?.id || null : null }
    });
    return { resolved: true, stackObject, payment: result, countered: !result.paid ? original || null : null };
  }
  state.stack.pop();
  stackObject.status = 'resolving';
  const effectResults = [];
  if (resolveEffect) {
    for (let index = 0; index < stackObject.effectIR.length; index += 1) {
      effectResults.push(resolveEffect({ state, stackObject, effect: stackObject.effectIR[index], target: stackObject.targets[index] || stackObject.targets[0] }));
    }
  }
  if (stackObject.kind === STACK_OBJECT_TYPES.SPELL && stackObject.sourceObject.zone === 'stack') {
    moveObject(state, stackObject.sourceObject, 'graveyard', 'spell resolved');
  }
  stackObject.status = 'resolved';
  runStateBasedActionsRuntime(state);
  emitEvent(state, 'StackObjectResolved', { source: stackObject.sourceObject, controller: stackObject.controller, metadata: { stackObjectId: stackObject.id, stackObjectType: stackObject.kind } });
  return { resolved: true, stackObject, effectResults };
}

function opponentOf(playerId) {
  return playerId === 'player' ? 'opponent' : 'player';
}
