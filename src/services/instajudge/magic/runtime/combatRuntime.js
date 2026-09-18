import { deriveCharacteristics, derivedHasAbility, derivedHasQuality } from './continuousEffects.js';
import {
  collectTriggeredAbilities,
  dealDamageToPlayerWithResult,
  emitEvent,
  markDamageWithResult,
  putPendingTriggersOnStack,
  runStateBasedActionsRuntime
} from './runtimeState.js';
import { COMBAT_STEPS } from './turnStructure.js';

export { COMBAT_STEPS } from './turnStructure.js';

function opponentOf(playerId) {
  return playerId === 'opponent' ? 'player' : 'opponent';
}

function objectFrom(state, reference) {
  if (!reference) return null;
  if (typeof reference === 'string') return state.objects.get(reference) || null;
  return reference;
}

function currentController(state, object) {
  return deriveCharacteristics(state, object).controller;
}

function currentPower(state, object) {
  return deriveCharacteristics(state, object).power;
}

function hasAbility(state, object, ability) {
  return derivedHasAbility(state, object, ability);
}

function openPriorityWindow(state, step) {
  state.game.priorityHolder = state.game.activePlayer;
  state.game.consecutivePasses = 0;
  state.combat.priorityWindows.push(step);
  emitEvent(state, 'PriorityGranted', { player: state.game.activePlayer, metadata: { combatStep: step } });
}

function finishTurnBasedAction(state, eventIndex, step) {
  const stateBasedActions = runStateBasedActionsRuntime(state);
  const triggers = collectTriggeredAbilities(state, state.events.slice(eventIndex));
  const stackedTriggers = putPendingTriggersOnStack(state);
  openPriorityWindow(state, step);
  return { stateBasedActions, triggers, stackedTriggers };
}

export function createCombatState({ attackingPlayer = 'player', defendingPlayer = opponentOf(attackingPlayer) } = {}) {
  return {
    status: 'active',
    step: COMBAT_STEPS.BEGINNING,
    attackingPlayer,
    defendingPlayer,
    attackers: [],
    blockerAssignments: [],
    damageAssignments: [],
    damageResults: [],
    damageStepCount: 0,
    priorityWindows: [],
    hasFirstStrikeStep: false,
    unsupportedRestrictions: [],
    startedAtTurn: null
  };
}

export function beginCombat(state, options = {}) {
  const attackingPlayer = options.attackingPlayer || state.game.activePlayer;
  const defendingPlayer = options.defendingPlayer || opponentOf(attackingPlayer);
  if (!state.players[attackingPlayer] || !state.players[defendingPlayer] || attackingPlayer === defendingPlayer) {
    return { status: 'unsupported', reason: 'Combat requires one supported attacking player and one distinct defending player.' };
  }
  state.combat = createCombatState({ attackingPlayer, defendingPlayer });
  state.combat.startedAtTurn = state.game.turn;
  state.game.phase = 'combat';
  state.game.step = COMBAT_STEPS.BEGINNING;
  emitEvent(state, 'CombatBegan', { player: attackingPlayer, metadata: { defendingPlayer } });
  openPriorityWindow(state, COMBAT_STEPS.BEGINNING);
  return { status: 'ready', combat: state.combat };
}

export function validateAttacker(state, reference) {
  const attacker = objectFrom(state, reference);
  if (!attacker || attacker.zone !== 'battlefield') return { legal: false, reason: 'The proposed attacker is not on the battlefield.' };
  const characteristics = deriveCharacteristics(state, attacker);
  if (!characteristics.types.includes('creature')) return { legal: false, reason: `${attacker.name} is not a creature.` };
  if (characteristics.controller !== state.combat?.attackingPlayer) return { legal: false, reason: `${attacker.name} is not controlled by the attacking player.` };
  if (attacker.tapped) return { legal: false, reason: `${attacker.name} is tapped.` };
  if ((attacker.summoningSick || attacker.enteredTurn === state.game.turn) && !hasAbility(state, attacker, 'haste')) {
    return { legal: false, reason: `${attacker.name} has summoning sickness and does not have haste.` };
  }
  if (hasAbility(state, attacker, 'defender') || characteristics.abilities.some((ability) => /can't attack|cannot attack/.test(ability))) {
    return { legal: false, reason: `${attacker.name} cannot attack.` };
  }
  if (attacker.attackRestrictions?.length) return { legal: null, status: 'unsupported', reason: `${attacker.name} has an unsupported attack restriction.` };
  return { legal: true, attacker, characteristics };
}

export function declareAttackers(state, declarations = []) {
  if (!state.combat) beginCombat(state);
  if (state.combat.step !== COMBAT_STEPS.BEGINNING && state.combat.step !== COMBAT_STEPS.DECLARE_ATTACKERS) {
    return { status: 'illegal', reason: 'Attackers can be declared only during the declare attackers step.' };
  }
  const normalized = declarations.map((entry) => typeof entry === 'string' || entry?.id
    ? { object: objectFrom(state, entry), attackTarget: state.combat.defendingPlayer }
    : { object: objectFrom(state, entry.objectId || entry.object), attackTarget: entry.attackTarget || state.combat.defendingPlayer });
  const checks = normalized.map((entry) => validateAttacker(state, entry.object));
  const unsupported = checks.find((check) => check.status === 'unsupported');
  if (unsupported) return unsupported;
  const illegal = checks.find((check) => !check.legal);
  if (illegal) return { status: 'illegal', reason: illegal.reason, checks };
  if (new Set(normalized.map((entry) => entry.object.id)).size !== normalized.length) return { status: 'illegal', reason: 'A creature cannot be declared as an attacker more than once.' };

  const eventIndex = state.events.length;
  state.combat.step = COMBAT_STEPS.DECLARE_ATTACKERS;
  state.game.step = COMBAT_STEPS.DECLARE_ATTACKERS;
  state.combat.attackers = normalized.map((entry, index) => {
    const attacker = entry.object;
    if (!hasAbility(state, attacker, 'vigilance')) attacker.tapped = true;
    const declaration = {
      id: `attacker-${index + 1}`,
      objectId: attacker.id,
      attackTarget: entry.attackTarget,
      blockerIds: [],
      damageOrder: [],
      blocked: false,
      wasBlocked: false
    };
    emitEvent(state, 'AttackDeclared', { source: attacker, object: attacker, controller: state.combat.attackingPlayer, metadata: { attackTarget: entry.attackTarget } });
    return declaration;
  });
  const followUp = finishTurnBasedAction(state, eventIndex, COMBAT_STEPS.DECLARE_ATTACKERS);
  return { status: 'declared', attackers: state.combat.attackers, checks, ...followUp };
}

function protectionBlocks(state, attacker, blocker) {
  const abilities = deriveCharacteristics(state, attacker).abilities.filter((ability) => ability.startsWith('protection from '));
  return abilities.some((ability) => derivedHasQuality(state, blocker, ability.replace('protection from ', '')));
}

export function validateBlocker(state, attackerReference, blockerReference) {
  const attacker = objectFrom(state, attackerReference);
  const blocker = objectFrom(state, blockerReference);
  const attackerEntry = state.combat?.attackers.find((entry) => entry.objectId === attacker?.id);
  if (!attackerEntry) return { legal: false, reason: 'The proposed blocked creature is not attacking.' };
  if (attacker.zone !== 'battlefield') return { legal: false, reason: 'The proposed blocked creature is no longer on the battlefield.' };
  if (!blocker || blocker.zone !== 'battlefield') return { legal: false, reason: 'The proposed blocker is not on the battlefield.' };
  const blockerCharacteristics = deriveCharacteristics(state, blocker);
  if (!blockerCharacteristics.types.includes('creature')) return { legal: false, reason: `${blocker.name} is not a creature.` };
  if (blockerCharacteristics.controller !== state.combat.defendingPlayer) return { legal: false, reason: `${blocker.name} is not controlled by the defending player.` };
  if (blocker.tapped) return { legal: false, reason: `${blocker.name} is tapped and cannot block.` };
  if (blockerCharacteristics.abilities.some((ability) => /can't block|cannot block/.test(ability))) return { legal: false, reason: `${blocker.name} cannot block.` };
  if (blocker.blockRestrictions?.length) return { legal: null, status: 'unsupported', reason: `${blocker.name} has an unsupported blocking restriction.` };
  if (hasAbility(state, attacker, 'flying') && !hasAbility(state, blocker, 'flying') && !hasAbility(state, blocker, 'reach')) {
    return { legal: false, reason: `${blocker.name} cannot block a creature with flying.` };
  }
  if (protectionBlocks(state, attacker, blocker)) return { legal: false, reason: `${attacker.name}'s protection prevents ${blocker.name} from blocking it.` };
  return { legal: true, attacker, blocker };
}

export function declareBlockers(state, declarations = []) {
  if (!state.combat || state.combat.step !== COMBAT_STEPS.DECLARE_ATTACKERS) {
    return { status: 'illegal', reason: 'Blockers can be declared only after attackers have been declared.' };
  }
  if (state.stack.length > 0) return { status: 'paused', reason: 'The stack must be empty before combat advances to declare blockers.' };
  const normalized = declarations.flatMap((entry) => {
    const attacker = objectFrom(state, entry.attackerId || entry.attacker);
    const blockers = (entry.blockerIds || entry.blockers || [entry.blockerId || entry.blocker]).map((blocker) => objectFrom(state, blocker)).filter(Boolean);
    return blockers.map((blocker) => ({ attacker, blocker, order: entry.order || entry.damageOrder || [] }));
  });
  const checks = normalized.map((entry) => validateBlocker(state, entry.attacker, entry.blocker));
  const unsupported = checks.find((check) => check.status === 'unsupported');
  if (unsupported) return unsupported;
  const illegal = checks.find((check) => !check.legal);
  if (illegal) return { status: 'illegal', reason: illegal.reason, checks };
  const blockerIds = normalized.map((entry) => entry.blocker.id);
  if (new Set(blockerIds).size !== blockerIds.length) return { status: 'illegal', reason: 'A blocker cannot block more than one attacker in the supported combat subset.' };

  for (const attackerEntry of state.combat.attackers) {
    const attacker = state.objects.get(attackerEntry.objectId);
    const blockers = normalized.filter((entry) => entry.attacker.id === attackerEntry.objectId);
    if (hasAbility(state, attacker, 'menace') && blockers.length === 1) {
      return { status: 'illegal', reason: `${attacker.name} has menace and cannot be blocked by only one creature.` };
    }
  }

  const eventIndex = state.events.length;
  state.combat.step = COMBAT_STEPS.DECLARE_BLOCKERS;
  state.game.step = COMBAT_STEPS.DECLARE_BLOCKERS;
  state.combat.blockerAssignments = normalized.map((entry) => ({ attackerId: entry.attacker.id, blockerId: entry.blocker.id }));
  for (const attackerEntry of state.combat.attackers) {
    const assignments = normalized.filter((entry) => entry.attacker.id === attackerEntry.objectId);
    attackerEntry.blockerIds = assignments.map((entry) => entry.blocker.id);
    attackerEntry.damageOrder = assignments[0]?.order?.length
      ? [...assignments[0].order]
      : attackerEntry.blockerIds.length === 1 ? [...attackerEntry.blockerIds] : [];
    attackerEntry.blocked = assignments.length > 0;
    attackerEntry.wasBlocked = attackerEntry.wasBlocked || attackerEntry.blocked;
    if (attackerEntry.blocked) emitEvent(state, 'AttackerBecameBlocked', { source: state.objects.get(attackerEntry.objectId), metadata: { blockerIds: attackerEntry.blockerIds } });
    for (const assignment of assignments) {
      emitEvent(state, 'BlockDeclared', { source: assignment.blocker, affected: assignment.attacker, object: assignment.blocker, controller: state.combat.defendingPlayer, metadata: { attackerId: assignment.attacker.id } });
    }
  }
  const followUp = finishTurnBasedAction(state, eventIndex, COMBAT_STEPS.DECLARE_BLOCKERS);
  return { status: 'declared', assignments: state.combat.blockerAssignments, checks, ...followUp };
}

function eligibleForDamageStep(state, object, step) {
  if (!object || object.zone !== 'battlefield') return false;
  const firstStrike = hasAbility(state, object, 'first strike');
  const doubleStrike = hasAbility(state, object, 'double strike');
  return step === COMBAT_STEPS.FIRST_STRIKE_DAMAGE ? firstStrike || doubleStrike : !firstStrike || doubleStrike;
}

function lethalDamageNeeded(state, blocker, sourceHasDeathtouch) {
  if (sourceHasDeathtouch) return 1;
  return Math.max(0, deriveCharacteristics(state, blocker).toughness - blocker.damageMarked);
}

function assignmentForAttacker(state, attackerEntry, step, supplied = null) {
  const attacker = state.objects.get(attackerEntry.objectId);
  if (!eligibleForDamageStep(state, attacker, step)) return { status: 'ready', assignments: [] };
  const power = Math.max(0, currentPower(state, attacker) || 0);
  const liveBlockers = attackerEntry.blockerIds.map((id) => state.objects.get(id)).filter((blocker) => blocker?.zone === 'battlefield');
  const trample = hasAbility(state, attacker, 'trample');
  const deathtouch = hasAbility(state, attacker, 'deathtouch');
  if (!attackerEntry.wasBlocked) return { status: 'ready', assignments: [{ source: attacker, playerId: attackerEntry.attackTarget, amount: power }] };
  if (liveBlockers.length === 0) return { status: 'ready', assignments: trample ? [{ source: attacker, playerId: attackerEntry.attackTarget, amount: power }] : [] };

  if (supplied) {
    if (liveBlockers.length > 1 && attackerEntry.damageOrder.length !== liveBlockers.length) {
      return { status: 'depends', reason: `${attacker.name}'s blocker damage order was not supplied.` };
    }
    const assignments = liveBlockers.map((blocker) => ({ source: attacker, object: blocker, amount: Number(supplied[blocker.id] || 0) }));
    const playerAmount = Number(supplied.defender || supplied.player || 0);
    const total = assignments.reduce((sum, assignment) => sum + assignment.amount, 0) + playerAmount;
    if (total !== power || assignments.some((assignment) => assignment.amount < 0) || playerAmount < 0) return { status: 'illegal', reason: `${attacker.name}'s combat damage assignment must assign exactly ${power} damage.` };
    if (playerAmount > 0 && !trample) return { status: 'illegal', reason: `${attacker.name} cannot assign combat damage to the defending player without trample.` };
    const order = attackerEntry.damageOrder.length ? attackerEntry.damageOrder : liveBlockers.map((blocker) => blocker.id);
    for (let index = 0; index < order.length; index += 1) {
      const blocker = liveBlockers.find((candidate) => candidate.id === order[index]);
      if (!blocker) continue;
      const assigned = assignments.find((candidate) => candidate.object.id === blocker.id)?.amount || 0;
      const laterAssigned = order.slice(index + 1).some((id) => (assignments.find((candidate) => candidate.object.id === id)?.amount || 0) > 0) || playerAmount > 0;
      if (laterAssigned && assigned < lethalDamageNeeded(state, blocker, deathtouch)) return { status: 'illegal', reason: `${attacker.name} must assign lethal damage to each earlier blocker before assigning damage onward.` };
    }
    if (playerAmount) assignments.push({ source: attacker, playerId: attackerEntry.attackTarget, amount: playerAmount });
    return { status: 'ready', assignments: assignments.filter((assignment) => assignment.amount > 0) };
  }

  if (liveBlockers.length > 1) return { status: 'depends', reason: `${attacker.name}'s damage assignment among multiple blockers was not supplied.` };
  const blocker = liveBlockers[0];
  const lethal = lethalDamageNeeded(state, blocker, deathtouch);
  if (trample && power > lethal) return { status: 'depends', reason: `${attacker.name}'s trample assignment between the blocker and defending player was not supplied.` };
  return { status: 'ready', assignments: [{ source: attacker, object: blocker, amount: power }] };
}

function blockerAssignments(state, step) {
  const assignments = [];
  for (const attackerEntry of state.combat.attackers) {
    const attacker = state.objects.get(attackerEntry.objectId);
    if (!attacker || attacker.zone !== 'battlefield') continue;
    for (const blockerId of attackerEntry.blockerIds) {
      const blocker = state.objects.get(blockerId);
      if (!eligibleForDamageStep(state, blocker, step)) continue;
      const amount = Math.max(0, currentPower(state, blocker) || 0);
      if (amount > 0) assignments.push({ source: blocker, object: attacker, amount });
    }
  }
  return assignments;
}

export function combatNeedsFirstStrikeStep(state) {
  if (!state.combat) return false;
  const participants = state.combat.attackers.flatMap((entry) => [state.objects.get(entry.objectId), ...entry.blockerIds.map((id) => state.objects.get(id))]);
  return participants.some((object) => object?.zone === 'battlefield' && (hasAbility(state, object, 'first strike') || hasAbility(state, object, 'double strike')));
}

export function executeCombatDamageStep(state, { step = COMBAT_STEPS.COMBAT_DAMAGE, assignments = {} } = {}) {
  if (!state.combat || ![COMBAT_STEPS.DECLARE_BLOCKERS, COMBAT_STEPS.FIRST_STRIKE_DAMAGE].includes(state.combat.step)) {
    return { status: 'illegal', reason: 'Combat damage cannot be assigned from the current combat step.' };
  }
  if (state.stack.length > 0) return { status: 'paused', reason: 'The stack must be empty before combat damage is assigned.' };
  if (step === COMBAT_STEPS.FIRST_STRIKE_DAMAGE && !combatNeedsFirstStrikeStep(state)) return { status: 'skipped', reason: 'No creature requires a first-strike combat damage step.' };

  const pending = [];
  for (const attackerEntry of state.combat.attackers) {
    const result = assignmentForAttacker(state, attackerEntry, step, assignments[attackerEntry.objectId]);
    if (result.status !== 'ready') return result;
    pending.push(...result.assignments);
  }
  pending.push(...blockerAssignments(state, step));

  const eventIndex = state.events.length;
  state.combat.step = step;
  state.game.step = step;
  state.combat.damageStepCount += 1;
  if (step === COMBAT_STEPS.FIRST_STRIKE_DAMAGE) state.combat.hasFirstStrikeStep = true;
  emitEvent(state, 'CombatDamageStepBegan', { player: state.combat.attackingPlayer, metadata: { combatStep: step, damageStepCount: state.combat.damageStepCount } });
  const results = [];
  for (const assignment of pending) {
    const source = assignment.source;
    const metadata = {
      combat: true,
      combatStep: step,
      deathtouch: hasAbility(state, source, 'deathtouch'),
      lifelink: hasAbility(state, source, 'lifelink')
    };
    const result = assignment.object
      ? markDamageWithResult(state, assignment.object, assignment.amount, source, metadata)
      : dealDamageToPlayerWithResult(state, assignment.playerId, assignment.amount, source, metadata);
    results.push({ ...assignment, result });
    state.combat.damageAssignments.push({ sourceId: source.id, targetId: assignment.object?.id || assignment.playerId, amount: assignment.amount, step });
  }
  emitEvent(state, 'CombatDamageStepCompleted', { player: state.combat.attackingPlayer, metadata: { combatStep: step, assignments: pending.length } });
  const followUp = finishTurnBasedAction(state, eventIndex, step);
  state.combat.damageResults.push(...results);
  return { status: 'resolved', step, assignments: pending, results, ...followUp };
}

export function executeCombat(state, { assignments = {} } = {}) {
  if (!state.combat || state.combat.step !== COMBAT_STEPS.DECLARE_BLOCKERS) return { status: 'illegal', reason: 'Combat must reach the post-blockers priority window before damage.' };
  const steps = [];
  if (combatNeedsFirstStrikeStep(state)) {
    const first = executeCombatDamageStep(state, { step: COMBAT_STEPS.FIRST_STRIKE_DAMAGE, assignments: assignments.firstStrike || assignments });
    steps.push(first);
    if (first.status !== 'resolved') return { status: first.status, reason: first.reason, steps };
    if (state.stack.length > 0) return { status: 'paused', reason: 'Triggered abilities and priority after first-strike damage must finish before regular combat damage.', steps };
  }
  const regular = executeCombatDamageStep(state, { step: COMBAT_STEPS.COMBAT_DAMAGE, assignments: assignments.regular || assignments });
  steps.push(regular);
  if (regular.status !== 'resolved') return { status: regular.status, reason: regular.reason, steps };
  return { status: 'resolved', steps, combat: state.combat };
}

export function endCombat(state) {
  if (!state.combat) return { status: 'illegal', reason: 'There is no active combat.' };
  if (state.stack.length > 0) return { status: 'paused', reason: 'The stack must be empty before combat advances to the end of combat step.' };
  const eventIndex = state.events.length;
  state.combat.step = COMBAT_STEPS.END;
  state.combat.status = 'complete';
  state.game.step = COMBAT_STEPS.END;
  emitEvent(state, 'EndOfCombat', { player: state.combat.attackingPlayer, metadata: { defendingPlayer: state.combat.defendingPlayer } });
  const followUp = finishTurnBasedAction(state, eventIndex, COMBAT_STEPS.END);
  return { status: 'complete', combat: state.combat, ...followUp };
}

export function removeBlockerFromCombat(state, blockerReference) {
  const blocker = objectFrom(state, blockerReference);
  if (!state.combat || !blocker) return { status: 'unsupported', reason: 'An active combat and blocker are required.' };
  const assignment = state.combat.blockerAssignments.find((entry) => entry.blockerId === blocker.id);
  if (!assignment) return { status: 'illegal', reason: `${blocker.name} is not blocking.` };
  emitEvent(state, 'BlockerRemovedFromCombat', { source: blocker, metadata: { attackerId: assignment.attackerId } });
  return { status: 'removed', blocker, attacker: state.objects.get(assignment.attackerId) };
}
