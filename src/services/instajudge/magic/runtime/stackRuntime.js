import { isInstant, isPermanentType, isSorcery, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { COST_TYPES, PAYMENT_STATUS, checkManaAvailability, createAdditionalCost, createManaCost, createTriggeredPaymentCost, normalizeCost, payCost, summarizeManaCosts } from './costSystem.js';
import { deriveCharacteristics } from './continuousEffects.js';
import { parseOracleSemantics } from './oracleSemantics.js';
import { commanderCastPermission, recordCommanderCastFromCommandZone } from './commanderRuntime.js';
import { clearPendingRuntimeChoice, createGameObject, emitEvent, getPendingRuntimeChoice, moveObject, moveObjectWithResult, registerGameObject, runStateBasedActionsRuntime, setPendingRuntimeChoice } from './runtimeState.js';
import { advanceTurnStep } from './turnRuntime.js';
import { TURN_STEPS } from './turnStructure.js';
import { nextPlayerInTurnOrder, playersStillInGame, priorityStartPlayer } from './multiplayerRuntime.js';

export const STACK_OBJECT_TYPES = Object.freeze({
  SPELL: 'Spell',
  ACTIVATED_ABILITY: 'ActivatedAbility',
  TRIGGERED_ABILITY: 'TriggeredAbility'
});

export const TIMING_MODES = Object.freeze({
  INSTANT: 'instant',
  SORCERY: 'sorcery',
  ACTIVATED_ABILITY: 'activated-ability',
  MANA_ABILITY: 'mana-ability'
});

export const TIMING_REASON_CODES = Object.freeze({
  INSTANT_TIMING_ALLOWED: 'INSTANT_TIMING_ALLOWED',
  SORCERY_TIMING_ALLOWED: 'SORCERY_TIMING_ALLOWED',
  ACTIVATED_ABILITY_TIMING_ALLOWED: 'ACTIVATED_ABILITY_TIMING_ALLOWED',
  NO_PRIORITY_WINDOW: 'NO_PRIORITY_WINDOW',
  WRONG_PRIORITY_HOLDER: 'WRONG_PRIORITY_HOLDER',
  WRONG_ACTIVE_PLAYER: 'WRONG_ACTIVE_PLAYER',
  WRONG_PHASE: 'WRONG_PHASE',
  STACK_NOT_EMPTY: 'STACK_NOT_EMPTY',
  MISSING_TIMING_STATE: 'MISSING_TIMING_STATE',
  UNSUPPORTED_SPELL_TYPE: 'UNSUPPORTED_SPELL_TYPE',
  UNSUPPORTED_TIMING_RESTRICTION: 'UNSUPPORTED_TIMING_RESTRICTION',
  UNSUPPORTED_MANA_ABILITY_TIMING: 'UNSUPPORTED_MANA_ABILITY_TIMING',
  NOT_ACTIVATED_ABILITY: 'NOT_ACTIVATED_ABILITY',
  PENDING_CHOICE: 'PENDING_CHOICE'
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
  const holder = playerId && state.players[playerId]?.inGame !== false ? playerId : priorityStartPlayer(state);
  state.game.priorityHolder = holder;
  state.game.consecutivePasses = 0;
  emitEvent(state, 'PriorityGranted', { player: holder });
  return holder;
}

export function takePriorityAction(state, playerId, action = null) {
  const pendingChoice = getPendingRuntimeChoice(state);
  if (pendingChoice) {
    return {
      allowed: false,
      status: 'depends',
      reason: 'A pending runtime choice must be resolved before another priority action can be taken.',
      pendingChoice
    };
  }
  if (state.game.priorityHolder !== playerId) return { allowed: false, reason: `${playerId} does not have priority.` };
  state.game.consecutivePasses = 0;
  state.game.priorityHolder = playerId;
  emitEvent(state, 'PriorityActionTaken', { player: playerId, metadata: { action: action?.type || action || null } });
  return { allowed: true };
}

export function advanceGameStep(state) {
  const result = advanceTurnStep(state);
  return result.status === 'advanced' ? result.to : null;
}

export function passPriority(state, playerId, { resolve = resolveTopOfStack } = {}) {
  const pendingChoice = getPendingRuntimeChoice(state);
  if (pendingChoice) return { allowed: false, status: 'depends', reason: 'A pending runtime choice must be resolved before priority can pass.', pendingChoice };
  if (state.game.priorityHolder !== playerId) return { allowed: false, reason: `${playerId} does not have priority.` };
  state.game.consecutivePasses += 1;
  emitEvent(state, 'PriorityPassed', { player: playerId, metadata: { consecutivePasses: state.game.consecutivePasses } });
  const requiredPasses = playersStillInGame(state).length;
  if (state.game.consecutivePasses < requiredPasses) {
    state.game.priorityHolder = nextPlayerInTurnOrder(state, playerId);
    return { allowed: true, resolved: false };
  }
  state.game.consecutivePasses = 0;
  if (state.stack.length === 0) {
    state.game.priorityHolder = null;
    return { allowed: true, resolved: false, advancedTo: advanceGameStep(state) };
  }
  const result = resolve(state);
  if (result?.status === 'depends') {
    state.game.priorityHolder = null;
    return { allowed: true, resolved: false, status: 'depends', result, pendingChoice: getPendingRuntimeChoice(state) };
  }
  grantPriority(state, priorityStartPlayer(state));
  return { allowed: true, resolved: true, result };
}

function timingState(state, playerId) {
  const step = state?.game?.step || null;
  const cleanupException = step === TURN_STEPS.CLEANUP && state.game.cleanupState?.priorityActive === true;
  const combatWindow = state?.game?.phase === 'combat'
    ? Boolean(state.combat?.priorityWindows?.includes(step))
    : null;
  const actionComplete = state?.game?.turnBasedActionState?.status !== 'pending';
  const priorityWindowOpen = step === TURN_STEPS.UNTAP
    ? false
    : step === TURN_STEPS.CLEANUP
      ? cleanupException
      : state?.game?.phase === 'combat'
        ? combatWindow
        : step === TURN_STEPS.DRAW
          ? actionComplete && state.game.priorityHolder != null
          : state?.game?.priorityHolder != null;
  return {
    activePlayer: state?.game?.activePlayer || null,
    actingPlayer: playerId || null,
    priorityHolder: state?.game?.priorityHolder || null,
    priorityWindowOpen,
    phase: state?.game?.phase || null,
    step,
    stackEmpty: (state?.stack?.length || 0) === 0,
    stackDepth: state?.stack?.length || 0,
    combatWindow,
    cleanupException
  };
}

function timingResult({ allowed, status, code, reason, requiredTiming, currentTimingState, missing = [] }) {
  return {
    allowed,
    status,
    code,
    reason,
    requiredTiming,
    currentTimingState,
    missing,
    support: status === 'unverified' ? 'unsupported' : status === 'depends' ? 'missing-state' : 'proven'
  };
}

function denied(code, reason, requiredTiming, currentTimingState) {
  return timingResult({ allowed: false, status: 'denied', code, reason, requiredTiming, currentTimingState });
}

function unverified(code, reason, requiredTiming, currentTimingState) {
  return timingResult({ allowed: null, status: 'unverified', code, reason, requiredTiming, currentTimingState });
}

function ordinaryFlashStatus(card) {
  const oracleText = String(card.oracleText || '');
  if (!/\bflash\b/i.test(oracleText)) return { hasFlash: false, unsupported: false };
  if (/as though (?:it|they|those|this spell) (?:had|have) flash|spells? you cast have flash|gains? flash|with flash/i.test(oracleText)) {
    return { hasFlash: false, unsupported: true };
  }
  return {
    hasFlash: /(?:^|[\n,.;]\s*)flash(?:\s*[,.;\n]|$)/i.test(oracleText.trim()),
    unsupported: false
  };
}

function castingTimingMode(cardInput) {
  const card = normalizeMagicCard(cardInput || {});
  const type = card.normalizedType;
  const text = card.normalizedText;
  if (!type) return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_SPELL_TYPE, reason: 'The spell type cannot be determined safely.' };
  if (/\bland\b/.test(type)) return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_SPELL_TYPE, reason: 'Playing a land is a special action and is deferred beyond Phase 8C.' };
  if (/\b(?:cast this spell only|this spell can only be cast|you may cast this spell only)\b/.test(text)) {
    return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, reason: 'This spell has a casting restriction outside the supported timing model.' };
  }
  if (isInstant(card)) return { status: 'ready', mode: TIMING_MODES.INSTANT, card };
  const flash = ordinaryFlashStatus(card);
  if (flash.unsupported) return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, reason: 'This flash-like casting permission is not represented safely.' };
  if (flash.hasFlash) return { status: 'ready', mode: TIMING_MODES.INSTANT, card, flash: true };
  if (isSorcery(card) || isPermanentType(card)) return { status: 'ready', mode: TIMING_MODES.SORCERY, card };
  return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_SPELL_TYPE, reason: `The runtime does not recognize ${card.typeLine || 'this card'} as a supported spell type.` };
}

function activatedAbilityFor({ ability, sourceObject, card }) {
  if (ability) return { status: 'ready', ability };
  const abilities = sourceObject?.semantics?.activatedAbilitiesIR
    || (card ? parseOracleSemantics(card).activatedAbilitiesIR : []);
  if (abilities.length === 1) return { status: 'ready', ability: abilities[0] };
  if (abilities.length > 1) return { status: 'unverified', reason: 'Which activated ability is being activated is not specified.' };
  return { status: 'unverified', reason: 'The runtime cannot prove that the proposed action is an activated ability.' };
}

function activatedTimingMode(input) {
  const resolved = activatedAbilityFor(input);
  if (resolved.status !== 'ready') return { ...resolved, code: TIMING_REASON_CODES.NOT_ACTIVATED_ABILITY };
  const ability = resolved.ability;
  if (ability.type !== 'ActivatedAbility' && !String(ability.text || '').includes(':')) {
    return { status: 'unverified', code: TIMING_REASON_CODES.NOT_ACTIVATED_ABILITY, reason: 'The selected ability is not proven to be activated.' };
  }
  const normalizedText = normalizeMagicText(ability.text || '');
  if (/\badd \{?[wubrgc0-9]+\}?\b/.test(normalizedText) && !/\btarget\b/.test(normalizedText)) {
    return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_MANA_ABILITY_TIMING, reason: 'Mana-ability timing remains owned by the cost/payment runtime and is not broadened in Phase 8C.', ability };
  }
  const restrictions = ability.restrictions || [];
  if (restrictions.some((restriction) => restriction.mode === 'unsupported')) {
    return { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, reason: 'The activated ability has an unsupported timing restriction.', ability };
  }
  return {
    status: 'ready',
    mode: restrictions.some((restriction) => restriction.mode === 'sorcery') ? TIMING_MODES.SORCERY : TIMING_MODES.ACTIVATED_ABILITY,
    ability
  };
}

function factKnown(factsProvided, fact) {
  return factsProvided == null || factsProvided[fact] === true;
}

export function checkTimingPermission({ state, card = null, ability = null, sourceObject = null, actionType = 'Cast', playerId, factsProvided = null } = {}) {
  if (!state?.game || !playerId) {
    return unverified(TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, 'Canonical game state and an acting player are required.', null, timingState(state, playerId));
  }
  const action = String(actionType || '').toLowerCase();
  const classification = action === 'cast'
    ? castingTimingMode(card)
    : action === 'activate'
      ? activatedTimingMode({ ability, sourceObject, card })
      : { status: 'unverified', code: TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, reason: `Unsupported action type: ${actionType}.` };
  const currentTimingState = timingState(state, playerId);
  if (classification.status !== 'ready') {
    return unverified(classification.code || TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, classification.reason, null, currentTimingState);
  }
  return checkTimingModePermission({ state, requiredTiming: classification.mode, playerId, factsProvided });
}

export function checkTimingModePermission({ state, requiredTiming, playerId, factsProvided = null, actionLabel = 'Sorcery timing' } = {}) {
  if (!state?.game || !playerId) {
    return unverified(TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, 'Canonical game state and an acting player are required.', requiredTiming || null, timingState(state, playerId));
  }
  if (![TIMING_MODES.INSTANT, TIMING_MODES.SORCERY, TIMING_MODES.ACTIVATED_ABILITY].includes(requiredTiming)) {
    return unverified(TIMING_REASON_CODES.UNSUPPORTED_TIMING_RESTRICTION, `Unsupported timing mode: ${requiredTiming || 'unknown'}.`, requiredTiming || null, timingState(state, playerId));
  }
  const currentTimingState = timingState(state, playerId);
  const pendingChoice = getPendingRuntimeChoice(state);
  if (pendingChoice) {
    return timingResult({
      allowed: null,
      status: 'depends',
      code: TIMING_REASON_CODES.PENDING_CHOICE,
      reason: 'A pending runtime choice must be resolved before another priority action can be taken.',
      requiredTiming,
      currentTimingState,
      missing: [`resolve pending ${pendingChoice.type}`]
    });
  }
  const requiresSorceryTiming = requiredTiming === TIMING_MODES.SORCERY;

  if (factKnown(factsProvided, 'phase') && !currentTimingState.priorityWindowOpen) {
    return denied(TIMING_REASON_CODES.NO_PRIORITY_WINDOW, `Players do not have a supported priority window during ${currentTimingState.step || 'this step'}.`, requiredTiming, currentTimingState);
  }
  if (requiresSorceryTiming && factKnown(factsProvided, 'turn') && currentTimingState.activePlayer !== playerId) {
    return denied(TIMING_REASON_CODES.WRONG_ACTIVE_PLAYER, `${actionLabel} is available only to the active player.`, requiredTiming, currentTimingState);
  }
  if (requiresSorceryTiming && factKnown(factsProvided, 'phase')
    && ![TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(currentTimingState.step)) {
    return denied(TIMING_REASON_CODES.WRONG_PHASE, `${actionLabel} is available only during a main phase.`, requiredTiming, currentTimingState);
  }
  if (requiresSorceryTiming && factKnown(factsProvided, 'stack') && !currentTimingState.stackEmpty) {
    return denied(TIMING_REASON_CODES.STACK_NOT_EMPTY, `${actionLabel} requires an empty stack.`, requiredTiming, currentTimingState);
  }
  if (factKnown(factsProvided, 'priority') && currentTimingState.priorityHolder !== playerId) {
    return denied(TIMING_REASON_CODES.WRONG_PRIORITY_HOLDER, `${playerId} does not have priority.`, requiredTiming, currentTimingState);
  }

  const missing = [];
  if (!factKnown(factsProvided, 'priority')) missing.push('who has priority');
  if (requiresSorceryTiming && !factKnown(factsProvided, 'turn')) missing.push('whose turn it is');
  if (requiresSorceryTiming && !factKnown(factsProvided, 'phase')) missing.push('the current phase');
  if (requiresSorceryTiming && !factKnown(factsProvided, 'stack')) missing.push('whether the stack is empty');
  if (missing.length) {
    return timingResult({
      allowed: null,
      status: 'depends',
      code: TIMING_REASON_CODES.MISSING_TIMING_STATE,
      reason: 'The timing permission depends on missing canonical game state.',
      requiredTiming,
      currentTimingState,
      missing
    });
  }

  return timingResult({
    allowed: true,
    status: 'allowed',
    code: requiresSorceryTiming
      ? TIMING_REASON_CODES.SORCERY_TIMING_ALLOWED
      : requiredTiming === TIMING_MODES.ACTIVATED_ABILITY
        ? TIMING_REASON_CODES.ACTIVATED_ABILITY_TIMING_ALLOWED
        : TIMING_REASON_CODES.INSTANT_TIMING_ALLOWED,
    reason: requiresSorceryTiming
      ? `${actionLabel} is permitted because the active player has priority during a main phase with an empty stack.`
      : 'The acting player has priority in a supported priority window.',
    requiredTiming,
    currentTimingState
  });
}

function wardAbilities(state, target) {
  return deriveCharacteristics(state, target).keywordAbilities.filter((ability) => ability.keyword === 'ward' && ability.cost);
}

export function createWardTriggers(state, targetEvent) {
  const target = targetEvent.object || targetEvent.affected;
  const sourceStackObject = state.stack.find((entry) => entry.id === targetEvent.metadata?.stackObjectId);
  if (!target || !sourceStackObject) return [];
  const targetController = deriveCharacteristics(state, target).controller;
  if (targetController === sourceStackObject.controller) return [];
  const triggers = wardAbilities(state, target).map((ability) => createStackObject({
    kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY,
    sourceObject: target,
    controller: targetController,
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

export function castSpell(state, { card = null, sourceObject: suppliedSourceObject = null, controller, targets = [], modes = [], costs = [], chosenValues = {}, paymentChoices = [], availableMana = null, skipTiming = false, factsProvided = null, validateTarget = null } = {}) {
  const pendingChoice = getPendingRuntimeChoice(state);
  if (pendingChoice) {
    const timing = {
      allowed: null,
      status: 'depends',
      code: TIMING_REASON_CODES.PENDING_CHOICE,
      reason: 'A pending runtime choice must be resolved before another spell can be cast.',
      missing: [`resolve pending ${pendingChoice.type}`]
    };
    return {
      cast: false,
      status: 'depends',
      reason: timing.reason,
      timing,
      pendingChoice
    };
  }
  const castCard = card || suppliedSourceObject?.card;
  const sourceZone = suppliedSourceObject?.zone || 'hand';
  let commanderPermission = null;
  let commanderCost = null;
  let castingCosts = costs;
  if (suppliedSourceObject?.zone === 'command') {
    commanderPermission = commanderCastPermission(state, suppliedSourceObject, controller);
    if (commanderPermission.allowed !== true) return { cast: false, status: commanderPermission.status || 'unsupported', commanderPermission };
    if (chosenValues.alternativeCost || chosenValues.dynamicCostModifier || chosenValues.genericCostReduction) {
      return {
        cast: false,
        status: 'unsupported',
        commanderPermission,
        commanderCost: { status: 'unsupported', reason: 'Alternative costs and dynamic cost modifiers are not certified by the current cost owner.' }
      };
    }
    const startingManaRequirement = createManaCost(castCard?.manaCost || '');
    const taxManaCost = createManaCost(commanderPermission.tax.genericMana ? `{${commanderPermission.tax.genericMana}}` : '');
    const commanderTaxCost = createAdditionalCost([taxManaCost]);
    commanderTaxCost.reason = 'commander-tax';
    commanderTaxCost.commanderDesignationId = commanderPermission.designation.id;
    castingCosts = [startingManaRequirement, ...costs, ...(commanderPermission.tax.genericMana > 0 ? [commanderTaxCost] : [])];
    const finalManaRequirement = summarizeManaCosts(castingCosts);
    const availability = checkManaAvailability(finalManaRequirement, availableMana);
    commanderCost = {
      status: startingManaRequirement.supported && finalManaRequirement.supported && availability.supported ? 'verified' : 'unsupported',
      commanderDesignationId: commanderPermission.designation.id,
      previousCommandZoneCasts: commanderPermission.tax.previousCommandZoneCasts,
      commanderTaxGenericMana: commanderPermission.tax.genericMana,
      startingManaRequirement,
      otherAdditionalCosts: costs.map(normalizeCost).filter(Boolean),
      finalManaRequirement,
      availability
    };
    if (commanderCost.status !== 'verified') return { cast: false, status: 'unsupported', commanderPermission, commanderCost };
    if (availability.known && !availability.payable) {
      return { cast: false, status: PAYMENT_STATUS.CANNOT_PAY, commanderPermission, commanderCost, paymentFailure: { supported: true, status: PAYMENT_STATUS.CANNOT_PAY, paid: false } };
    }
  }
  const timing = skipTiming ? { allowed: true, status: 'allowed' } : checkTimingPermission({ state, card: castCard, actionType: 'Cast', playerId: controller, factsProvided });
  if (timing.allowed !== true) return { cast: false, timing };
  let sourceObject = suppliedSourceObject;
  if (sourceObject) {
    sourceObject.controller = controller;
    const movement = moveObjectWithResult(state, sourceObject, 'stack', 'casting spell', {}, { skipCommanderReturnChoice: true });
    if (movement.status !== 'committed') return { cast: false, status: movement.status, timing, movement };
  } else {
    sourceObject = registerGameObject(state, createGameObject({ card: castCard, controller, owner: controller, zone: 'stack' }));
  }
  const stackObject = createStackObject({
    kind: STACK_OBJECT_TYPES.SPELL,
    sourceObject,
    controller,
    targets,
    modes,
    costs: castingCosts,
    chosenValues,
    effectIR: sourceObject.semantics?.spellAbilities?.[0]?.effects || [],
    ruleReferences: ['CR-601', 'CR-405']
  });
  const targetChecks = targets.map((target, index) => validateTarget ? validateTarget({ sourceObject, target, effect: stackObject.effectIR[index] || stackObject.effectIR[0] }) : { legal: Boolean(target) });
  if (targetChecks.some((check) => !check.legal)) {
    moveObject(state, sourceObject, sourceZone, 'casting rolled back: illegal target', {}, { skipCommanderReturnChoice: true });
    return { cast: false, timing, targetChecks, commanderCost };
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
    moveObject(state, sourceObject, sourceZone, 'casting rolled back: cost not paid', {}, { skipCommanderReturnChoice: true });
    return { cast: false, timing, targetChecks, costPayments, paymentFailure: failedPayment, commanderCost };
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
  grantPriority(state, controller);
  if (commanderPermission?.designation) recordCommanderCastFromCommandZone(state, sourceObject);
  return { cast: true, stackObject, sourceObject, targetChecks, targetEvents, costPayments, commanderPermission, commanderCost };
}

export function activateAbility(state, { sourceObject, ability = null, controller, targets = [], costs = [], effectIR = [], factsProvided = null } = {}) {
  const timingAbility = ability || (sourceObject?.semantics?.activatedAbilitiesIR?.length === 1 ? sourceObject.semantics.activatedAbilitiesIR[0] : null);
  const timing = checkTimingPermission({ state, actionType: 'Activate', playerId: controller, sourceObject, ability: timingAbility, factsProvided });
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
  grantPriority(state, controller);
  return { activated: true, stackObject, costPayments, targetEvents };
}

export function resolveTopOfStack(state, { paymentChoices = [], resolveEffect = null } = {}) {
  const stackObject = state.stack.at(-1);
  const pendingChoice = getPendingRuntimeChoice(state);
  const resolvesWardChoice = pendingChoice?.type === 'WardPaymentChoice'
    && pendingChoice.stackObjectId === stackObject?.id
    && paymentChoices.length > 0;
  if (pendingChoice && !resolvesWardChoice) return { resolved: false, status: 'depends', reason: 'A pending runtime choice must be resolved before the stack can resolve.', pendingChoice };
  if (!stackObject) return { resolved: false, reason: 'The stack is empty.' };
  if (stackObject.kind === STACK_OBJECT_TYPES.TRIGGERED_ABILITY && stackObject.effectIR.some((effect) => effect.type === 'CounterUnlessPaid')) {
    const effect = stackObject.effectIR.find((entry) => entry.type === 'CounterUnlessPaid');
    const payment = stackObject.costs.find((cost) => cost.type === COST_TYPES.TRIGGERED_PAYMENT);
    const choice = paymentChoices.find((entry) => entry.triggerId === stackObject.id || (entry.reason === 'ward' && entry.sourceObjectId === stackObject.sourceObject.id));
    const result = payCost({ state, playerId: payment.payer, cost: payment, choice: choice || PAYMENT_STATUS.UNSPECIFIED, sourceObject: stackObject.sourceObject });
    const pendingChoiceId = `ward-payment:${stackObject.id}`;
    if (result.status === PAYMENT_STATUS.UNSPECIFIED) {
      const wardChoice = setPendingRuntimeChoice(state, {
        id: pendingChoiceId,
        type: 'WardPaymentChoice',
        stackObjectId: stackObject.id,
        sourceObjectId: stackObject.sourceObject.id,
        payer: payment.payer,
        cost: payment.cost,
        clarificationNeeded: 'Was the ward cost paid?'
      });
      return { resolved: false, status: 'depends', payment: result, stackObject, pendingChoice: wardChoice };
    }
    clearPendingRuntimeChoice(state, pendingChoiceId);
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
    moveObject(
      state,
      stackObject.sourceObject,
      isPermanentType(stackObject.sourceObject.card) ? 'battlefield' : 'graveyard',
      'spell resolved'
    );
  }
  stackObject.status = 'resolved';
  runStateBasedActionsRuntime(state);
  emitEvent(state, 'StackObjectResolved', { source: stackObject.sourceObject, controller: stackObject.controller, metadata: { stackObjectId: stackObject.id, stackObjectType: stackObject.kind } });
  return { resolved: true, stackObject, effectResults };
}
