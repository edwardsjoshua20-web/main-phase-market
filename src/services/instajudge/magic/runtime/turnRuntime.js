import { deriveCharacteristics, expireContinuousEffects } from './continuousEffects.js';
import {
  beginCombat,
  combatNeedsFirstStrikeStep,
  declareAttackers,
  declareBlockers,
  endCombat,
  executeCombatDamageStep
} from './combatRuntime.js';
import { discardCards, drawCards } from './effectRuntime.js';
import {
  collectTriggeredAbilities,
  emitEvent,
  putPendingTriggersOnStack,
  runStateBasedActionsRuntime
} from './runtimeState.js';
import {
  COMBAT_STEPS,
  MAGIC_PHASES,
  PRIORITY_POLICIES,
  TURN_STEPS,
  TURN_STEP_METADATA,
  createLandPlayState,
  getTurnStepMetadata,
  opponentOf
} from './turnStructure.js';

function actionKey(state) {
  const cleanupIteration = state.game.step === TURN_STEPS.CLEANUP
    ? `:${state.game.cleanupState?.iteration || 1}`
    : '';
  return `${state.game.turn}:${state.game.activePlayer}:${state.game.step}${cleanupIteration}`;
}

function initializeTurnBasedActionState(state) {
  const key = actionKey(state);
  if (state.game.turnBasedActionState?.key === key) return state.game.turnBasedActionState;
  state.game.turnBasedActionState = {
    key,
    status: state.game.turnBasedAction ? 'pending' : 'complete',
    result: null
  };
  return state.game.turnBasedActionState;
}

function completeTurnBasedAction(state, result) {
  state.game.turnBasedActionState.status = 'complete';
  state.game.turnBasedActionState.result = result;
  return result;
}

function pendingChoiceResult(state, choice) {
  const existing = state.pendingChoices.findIndex((candidate) => candidate.id === choice.id);
  if (existing >= 0) state.pendingChoices[existing] = choice;
  else state.pendingChoices.push(choice);
  return {
    status: 'depends',
    verdict: 'depends',
    clarificationNeeded: choice.clarificationNeeded,
    choices: choice.choices,
    pendingChoice: choice
  };
}

function clearPendingChoice(state, choiceId) {
  state.pendingChoices = state.pendingChoices.filter((choice) => choice.id !== choiceId);
}

function unsupportedUntapReason(state, object) {
  const text = deriveCharacteristics(state, object).text || '';
  const continuousText = state.continuousEffects
    .filter((effect) => effect.active && (effect.appliesTo?.objectId === object.id || effect.sourceId === object.id))
    .map((effect) => effect.oracleText || '')
    .join(' ');
  if (object.phasedOut) return `${object.name} is phased out, which Phase 8B does not resolve during untap.`;
  if ((object.counters?.stun || 0) > 0) return `${object.name} has a stun counter, whose untap replacement is deferred.`;
  if (/does(?: not|n't) untap|may choose not to untap|untap .* during .* untap step/i.test(`${text} ${continuousText}`)) {
    return `${object.name} has an untap restriction or choice that Phase 8B cannot safely resolve.`;
  }
  return null;
}

function performUntapTurnBasedAction(state) {
  const permanents = state.battlefield.filter((object) => object.zone === 'battlefield'
    && deriveCharacteristics(state, object).controller === state.game.activePlayer);
  for (const object of permanents.filter((candidate) => candidate.tapped)) {
    const reason = unsupportedUntapReason(state, object);
    if (reason) return { status: 'unsupported', verdict: 'unverified', reason };
  }
  const untapped = [];
  for (const object of permanents.filter((candidate) => candidate.tapped)) {
    object.tapped = false;
    untapped.push(object);
    emitEvent(state, 'PermanentUntapped', { object, controller: state.game.activePlayer, metadata: { turnBasedAction: true } });
  }
  emitEvent(state, 'UntapStepActionCompleted', {
    player: state.game.activePlayer,
    metadata: { objectIds: untapped.map((object) => object.id) }
  });
  return { status: 'executed', untapped };
}

function performDrawTurnBasedAction(state, options) {
  const result = drawCards(state, {
    playerId: state.game.activePlayer,
    amount: 1,
    source: null,
    replacementChoices: options.drawReplacementChoices || []
  });
  if (result.status === 'depends') {
    return pendingChoiceResult(state, {
      id: `draw:${state.game.turnId}`,
      type: 'DrawReplacementChoice',
      playerId: state.game.activePlayer,
      choices: result.choices || [],
      clarificationNeeded: result.clarificationNeeded || 'How is the draw replacement choice resolved?'
    });
  }
  if (result.status === 'executed') clearPendingChoice(state, `draw:${state.game.turnId}`);
  return result;
}

function cleanupDiscardChoiceId(state) {
  return `cleanup-discard:${state.game.turnId}:${state.game.cleanupState?.iteration || 1}`;
}

function validateCleanupDiscardSelection(state, required, cardIds) {
  const uniqueIds = [...new Set(cardIds)];
  const handIds = new Set(state.players[state.game.activePlayer].hand);
  if (uniqueIds.length !== required || uniqueIds.length !== cardIds.length || uniqueIds.some((id) => !handIds.has(id))) {
    return {
      status: 'illegal',
      reason: `Cleanup requires exactly ${required} distinct card${required === 1 ? '' : 's'} from the active player's hand.`
    };
  }
  return { status: 'ready', cardIds: uniqueIds };
}

function removeMarkedDamage(state) {
  const cleared = [];
  for (const object of state.battlefield.filter((candidate) => candidate.zone === 'battlefield')) {
    if (object.damageMarked <= 0 && !object.damagedByDeathtouch) continue;
    const amount = object.damageMarked;
    object.damageMarked = 0;
    object.damagedByDeathtouch = false;
    cleared.push({ object, amount });
    emitEvent(state, 'MarkedDamageRemoved', { object, affected: object, amount, metadata: { cleanup: true } });
  }
  return cleared;
}

function performCleanupTurnBasedAction(state, options) {
  const player = state.players[state.game.activePlayer];
  const maximumHandSize = player.maximumHandSize;
  if (!(Number.isFinite(maximumHandSize) || maximumHandSize === Infinity) || maximumHandSize < 0) {
    return { status: 'unsupported', verdict: 'unverified', reason: 'The active player has no supported canonical maximum hand size.' };
  }

  const eventIndex = state.events.length;
  const discardCount = maximumHandSize === Infinity ? 0 : Math.max(0, player.hand.length - maximumHandSize);
  const discardChoiceId = cleanupDiscardChoiceId(state);
  let discardResult = { status: 'executed', discarded: [] };
  if (discardCount > 0) {
    const suppliedIds = options.discardCardIds || options.cleanup?.discardCardIds || [];
    if (suppliedIds.length === 0) {
      const hand = player.hand.map((id) => state.objects.get(id)).filter(Boolean);
      return pendingChoiceResult(state, {
        id: discardChoiceId,
        type: 'CleanupDiscardChoice',
        playerId: state.game.activePlayer,
        required: discardCount,
        choices: hand.map((card) => ({ id: card.id, name: card.name })),
        clarificationNeeded: `Which ${discardCount} card${discardCount === 1 ? '' : 's'} does ${state.game.activePlayer} discard during cleanup?`
      });
    }
    const validation = validateCleanupDiscardSelection(state, discardCount, suppliedIds);
    if (validation.status !== 'ready') return validation;
    discardResult = discardCards(state, {
      playerId: state.game.activePlayer,
      amount: discardCount,
      cardIds: validation.cardIds,
      source: null
    });
    if (discardResult.status !== 'executed') return discardResult;
  }
  clearPendingChoice(state, discardChoiceId);

  const clearedDamage = removeMarkedDamage(state);
  const expiredEffects = expireContinuousEffects(state, { step: TURN_STEPS.CLEANUP });
  if (expiredEffects > 0) {
    emitEvent(state, 'UntilEndOfTurnEffectsExpired', {
      player: state.game.activePlayer,
      amount: expiredEffects,
      metadata: { cleanup: true }
    });
  }
  const stateBasedActions = runStateBasedActionsRuntime(state);
  const triggers = collectTriggeredAbilities(state, state.events.slice(eventIndex));
  const stackedTriggers = putPendingTriggersOnStack(state);
  const repeatRequired = stateBasedActions.length > 0 || triggers.length > 0;
  state.game.cleanupState.repeatRequired = repeatRequired;
  state.game.cleanupState.priorityActive = repeatRequired;

  if (repeatRequired) {
    state.game.priorityHolder = state.game.activePlayer;
    state.game.consecutivePasses = 0;
    emitEvent(state, 'PriorityGranted', {
      player: state.game.activePlayer,
      metadata: { turnStep: TURN_STEPS.CLEANUP, cleanupIteration: state.game.cleanupState.iteration }
    });
  } else {
    state.game.priorityHolder = null;
  }

  emitEvent(state, 'CleanupIterationCompleted', {
    player: state.game.activePlayer,
    metadata: {
      iteration: state.game.cleanupState.iteration,
      discarded: discardResult.discarded.map((card) => card.id),
      damageCleared: clearedDamage.map(({ object }) => object.id),
      expiredEffects,
      stateBasedActions: stateBasedActions.length,
      triggers: triggers.length,
      repeatRequired
    }
  });
  return {
    status: 'executed',
    iteration: state.game.cleanupState.iteration,
    discarded: discardResult.discarded,
    clearedDamage,
    expiredEffects,
    stateBasedActions,
    triggers,
    stackedTriggers,
    repeatRequired,
    priorityGranted: repeatRequired
  };
}

export function executeCurrentTurnBasedAction(state, options = {}) {
  const actionState = initializeTurnBasedActionState(state);
  if (actionState.status === 'complete') {
    return { status: 'executed', alreadyCompleted: true, result: actionState.result || null };
  }
  let result;
  switch (state.game.turnBasedAction) {
    case 'untap-permanents': result = performUntapTurnBasedAction(state); break;
    case 'draw-card': result = performDrawTurnBasedAction(state, options); break;
    case 'cleanup': result = performCleanupTurnBasedAction(state, options); break;
    case null: result = { status: 'executed' }; break;
    default:
      result = { status: 'unsupported', verdict: 'unverified', reason: `Unsupported turn-based action: ${state.game.turnBasedAction}.` };
  }
  if (result.status === 'executed') {
    completeTurnBasedAction(state, result);
    if (state.game.priorityPolicy === PRIORITY_POLICIES.NORMAL && !state.game.priorityHolder) {
      state.game.priorityHolder = state.game.activePlayer;
      state.game.consecutivePasses = 0;
      emitEvent(state, 'PriorityGranted', {
        player: state.game.priorityHolder,
        metadata: { turnStep: state.game.step, afterTurnBasedAction: true }
      });
    }
    return result;
  }
  actionState.status = result.status;
  actionState.result = result;
  return result;
}

function beginCleanupIteration(state, iteration) {
  state.game.cleanupState = { iteration, repeatRequired: false, priorityActive: false };
  state.game.priorityHolder = null;
  state.game.consecutivePasses = 0;
  state.game.turnBasedActionState = null;
  initializeTurnBasedActionState(state);
  emitEvent(state, 'CleanupIterationBegan', {
    player: state.game.activePlayer,
    metadata: { iteration }
  });
}

function transitionResult(state, from, to, delegatedTo = null, delegateResult = null, turnBasedActionResult = null) {
  const metadata = TURN_STEP_METADATA[to];
  return {
    status: 'advanced',
    from,
    to,
    phase: state.game.phase,
    step: state.game.step,
    turn: state.game.turn,
    turnId: state.game.turnId,
    activePlayer: state.game.activePlayer,
    priority: metadata.priority,
    priorityAfter: metadata.priorityAfter || null,
    turnBasedAction: metadata.turnBasedAction,
    turnBasedActionImplemented: metadata.actionImplemented,
    turnBasedActionResult,
    delegatedTo,
    delegateResult
  };
}

function applyCanonicalStep(state, to, { nextTurn = false, actionOptions = {} } = {}) {
  const from = state.game.step;
  if (nextTurn) {
    state.game.turn += 1;
    state.game.activePlayer = opponentOf(state.game.activePlayer);
    state.game.nonactivePlayer = opponentOf(state.game.activePlayer);
    state.game.turnId = `turn-${state.game.turn}:${state.game.activePlayer}`;
    state.game.landPlays = createLandPlayState({ turnId: state.game.turnId });
    state.combat = null;
  }
  const metadata = TURN_STEP_METADATA[to];
  state.game.phase = metadata.phase;
  state.game.step = to;
  state.game.insideCombat = metadata.phase === MAGIC_PHASES.COMBAT;
  state.game.firstStrikeDamageRequired = false;
  state.game.priorityPolicy = metadata.priority;
  state.game.priorityAfter = metadata.priorityAfter || null;
  state.game.turnBasedAction = metadata.turnBasedAction;
  state.game.turnBasedActionImplemented = metadata.actionImplemented;
  state.game.consecutivePasses = 0;
  state.game.priorityHolder = null;
  state.game.cleanupState = to === TURN_STEPS.CLEANUP
    ? { iteration: 1, repeatRequired: false, priorityActive: false }
    : null;
  state.game.turnBasedActionState = null;
  initializeTurnBasedActionState(state);
  emitEvent(state, 'TurnStepAdvanced', {
    player: state.game.activePlayer,
    metadata: { from, to, phase: metadata.phase, turn: state.game.turn, turnId: state.game.turnId }
  });
  const actionResult = executeCurrentTurnBasedAction(state, actionOptions);
  const transition = transitionResult(state, from, to, null, null, actionResult);
  if (actionResult.status !== 'executed') return { ...transition, ...actionResult, from, to };
  if (metadata.priority === PRIORITY_POLICIES.NORMAL && !state.game.priorityHolder) {
    state.game.priorityHolder = state.game.activePlayer;
    emitEvent(state, 'PriorityGranted', { player: state.game.priorityHolder, metadata: { turnStep: to } });
  }
  return transition;
}

function combatTransition(state, from, to, delegate) {
  const result = delegate();
  if (!['ready', 'declared', 'resolved', 'complete'].includes(result.status)) return result;
  const metadata = TURN_STEP_METADATA[to];
  state.game.phase = metadata.phase;
  state.game.step = to;
  state.game.insideCombat = true;
  state.game.priorityPolicy = metadata.priority;
  state.game.priorityAfter = metadata.priorityAfter || null;
  state.game.turnBasedAction = metadata.turnBasedAction;
  state.game.turnBasedActionImplemented = metadata.actionImplemented;
  state.game.turnBasedActionState = { key: actionKey(state), status: 'complete', result };
  state.game.firstStrikeDamageRequired = state.game.firstStrikeDamageRequired
    || to === TURN_STEPS.FIRST_STRIKE_DAMAGE
    || (to === TURN_STEPS.DECLARE_BLOCKERS && combatNeedsFirstStrikeStep(state));
  emitEvent(state, 'TurnStepAdvanced', {
    player: state.game.activePlayer,
    metadata: { from, to, phase: metadata.phase, turn: state.game.turn, turnId: state.game.turnId, delegatedTo: 'combatRuntime' }
  });
  return transitionResult(state, from, to, 'combatRuntime', result);
}

export function getNextTurnStep(state) {
  const current = state?.game?.step;
  switch (current) {
    case TURN_STEPS.UNTAP: return TURN_STEPS.UPKEEP;
    case TURN_STEPS.UPKEEP: return TURN_STEPS.DRAW;
    case TURN_STEPS.DRAW: return TURN_STEPS.PRECOMBAT_MAIN;
    case TURN_STEPS.PRECOMBAT_MAIN: return TURN_STEPS.BEGINNING;
    case TURN_STEPS.BEGINNING: return TURN_STEPS.DECLARE_ATTACKERS;
    case TURN_STEPS.DECLARE_ATTACKERS: return TURN_STEPS.DECLARE_BLOCKERS;
    case TURN_STEPS.DECLARE_BLOCKERS:
      return combatNeedsFirstStrikeStep(state) ? TURN_STEPS.FIRST_STRIKE_DAMAGE : TURN_STEPS.COMBAT_DAMAGE;
    case TURN_STEPS.FIRST_STRIKE_DAMAGE: return TURN_STEPS.COMBAT_DAMAGE;
    case TURN_STEPS.COMBAT_DAMAGE: return TURN_STEPS.END;
    case TURN_STEPS.END: return TURN_STEPS.POSTCOMBAT_MAIN;
    case TURN_STEPS.POSTCOMBAT_MAIN: return TURN_STEPS.END_STEP;
    case TURN_STEPS.END_STEP: return TURN_STEPS.CLEANUP;
    case TURN_STEPS.CLEANUP: return TURN_STEPS.UNTAP;
    default: return null;
  }
}

function advanceFromCleanup(state, options) {
  let actionResult = executeCurrentTurnBasedAction(state, options);
  if (actionResult.status !== 'executed') return actionResult;
  if (state.game.cleanupState.repeatRequired) {
    if (state.stack.length > 0 || state.game.priorityHolder) {
      return { status: 'paused', reason: 'Cleanup-generated stack or priority interaction must finish before cleanup repeats.' };
    }
    beginCleanupIteration(state, state.game.cleanupState.iteration + 1);
    actionResult = executeCurrentTurnBasedAction(state, options);
    if (actionResult.status !== 'executed') return actionResult;
    if (actionResult.repeatRequired) {
      return {
        status: 'cleanup-repeated',
        step: TURN_STEPS.CLEANUP,
        iteration: state.game.cleanupState.iteration,
        turnBasedActionResult: actionResult
      };
    }
  }
  return applyCanonicalStep(state, TURN_STEPS.UNTAP, { nextTurn: true, actionOptions: options });
}

export function advanceTurnStep(state, options = {}) {
  const from = state?.game?.step;
  const expected = getNextTurnStep(state);
  if (!expected) return { status: 'unsupported', reason: `Turn progression does not recognize the current step: ${from || 'unknown'}.` };
  if (options.to && options.to !== expected) {
    return { status: 'illegal', reason: `The legal transition from ${from} is ${expected}, not ${options.to}.`, from, expected, requested: options.to };
  }
  if (state.stack.length > 0) return { status: 'paused', reason: 'The stack must be empty before the turn can advance.', from, expected };

  if (from === TURN_STEPS.CLEANUP) return advanceFromCleanup(state, options);
  const currentAction = executeCurrentTurnBasedAction(state, options);
  if (currentAction.status !== 'executed') return currentAction;

  switch (expected) {
    case TURN_STEPS.BEGINNING:
      return combatTransition(state, from, expected, () => beginCombat(state, options.combat || {}));
    case TURN_STEPS.DECLARE_ATTACKERS:
      return combatTransition(state, from, expected, () => declareAttackers(state, options.attackers || []));
    case TURN_STEPS.DECLARE_BLOCKERS:
      return combatTransition(state, from, expected, () => declareBlockers(state, options.blockers || []));
    case TURN_STEPS.FIRST_STRIKE_DAMAGE:
      return combatTransition(state, from, expected, () => executeCombatDamageStep(state, { step: COMBAT_STEPS.FIRST_STRIKE_DAMAGE, assignments: options.assignments || {} }));
    case TURN_STEPS.COMBAT_DAMAGE:
      return combatTransition(state, from, expected, () => executeCombatDamageStep(state, { step: COMBAT_STEPS.COMBAT_DAMAGE, assignments: options.assignments || {} }));
    case TURN_STEPS.END:
      return combatTransition(state, from, expected, () => endCombat(state));
    default:
      return applyCanonicalStep(state, expected, { actionOptions: options });
  }
}

export function describeTurnStep(state) {
  const metadata = getTurnStepMetadata(state?.game?.step);
  if (!metadata) return null;
  return {
    turn: state.game.turn,
    turnId: state.game.turnId,
    activePlayer: state.game.activePlayer,
    nonactivePlayer: state.game.nonactivePlayer,
    phase: metadata.phase,
    step: state.game.step,
    insideCombat: state.game.insideCombat,
    firstStrikeDamageRequired: state.game.firstStrikeDamageRequired,
    priority: metadata.priority,
    priorityAfter: metadata.priorityAfter || null,
    turnBasedAction: metadata.turnBasedAction,
    turnBasedActionImplemented: metadata.actionImplemented,
    turnBasedActionStatus: state.game.turnBasedActionState?.status || null,
    cleanupIteration: state.game.cleanupState?.iteration || null,
    cleanupRepeatRequired: state.game.cleanupState?.repeatRequired || false
  };
}

export { MAGIC_PHASES, PRIORITY_POLICIES, TURN_STEPS, TURN_STEP_METADATA } from './turnStructure.js';
