import { expireContinuousEffects } from './continuousEffects.js';
import {
  beginCombat,
  combatNeedsFirstStrikeStep,
  declareAttackers,
  declareBlockers,
  endCombat,
  executeCombatDamageStep
} from './combatRuntime.js';
import { emitEvent } from './runtimeState.js';
import {
  COMBAT_STEPS,
  MAGIC_PHASES,
  PRIORITY_POLICIES,
  TURN_STEPS,
  TURN_STEP_METADATA,
  getTurnStepMetadata,
  opponentOf
} from './turnStructure.js';

function transitionResult(state, from, to, delegatedTo = null, delegateResult = null) {
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
    delegatedTo,
    delegateResult
  };
}

function applyCanonicalStep(state, to, { nextTurn = false } = {}) {
  const from = state.game.step;
  if (nextTurn) {
    expireContinuousEffects(state, { step: TURN_STEPS.CLEANUP });
    state.game.turn += 1;
    state.game.activePlayer = opponentOf(state.game.activePlayer);
    state.game.nonactivePlayer = opponentOf(state.game.activePlayer);
    state.game.turnId = `turn-${state.game.turn}:${state.game.activePlayer}`;
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
  state.game.priorityHolder = metadata.priority === PRIORITY_POLICIES.NORMAL && metadata.actionImplemented
    ? state.game.activePlayer
    : null;
  emitEvent(state, 'TurnStepAdvanced', {
    player: state.game.activePlayer,
    metadata: { from, to, phase: metadata.phase, turn: state.game.turn, turnId: state.game.turnId }
  });
  if (state.game.priorityHolder) emitEvent(state, 'PriorityGranted', { player: state.game.priorityHolder, metadata: { turnStep: to } });
  return transitionResult(state, from, to);
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

export function advanceTurnStep(state, options = {}) {
  const from = state?.game?.step;
  const expected = getNextTurnStep(state);
  if (!expected) return { status: 'unsupported', reason: `Turn progression does not recognize the current step: ${from || 'unknown'}.` };
  if (options.to && options.to !== expected) {
    return { status: 'illegal', reason: `The legal transition from ${from} is ${expected}, not ${options.to}.`, from, expected, requested: options.to };
  }
  if (state.stack.length > 0) return { status: 'paused', reason: 'The stack must be empty before the turn can advance.', from, expected };

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
    case TURN_STEPS.UNTAP:
      return applyCanonicalStep(state, expected, { nextTurn: true });
    default:
      return applyCanonicalStep(state, expected);
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
    turnBasedActionImplemented: metadata.actionImplemented
  };
}

export { MAGIC_PHASES, PRIORITY_POLICIES, TURN_STEPS, TURN_STEP_METADATA } from './turnStructure.js';
