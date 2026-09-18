export const MAGIC_PHASES = Object.freeze({
  BEGINNING: 'beginning',
  MAIN: 'main',
  COMBAT: 'combat',
  ENDING: 'ending'
});

export const COMBAT_STEPS = Object.freeze({
  BEGINNING: 'beginning-of-combat',
  DECLARE_ATTACKERS: 'declare-attackers',
  DECLARE_BLOCKERS: 'declare-blockers',
  FIRST_STRIKE_DAMAGE: 'first-strike-combat-damage',
  COMBAT_DAMAGE: 'combat-damage',
  END: 'end-of-combat'
});

export const TURN_STEPS = Object.freeze({
  UNTAP: 'untap',
  UPKEEP: 'upkeep',
  DRAW: 'draw',
  PRECOMBAT_MAIN: 'precombat-main',
  ...COMBAT_STEPS,
  POSTCOMBAT_MAIN: 'postcombat-main',
  END_STEP: 'end-step',
  CLEANUP: 'cleanup'
});

export const PRIORITY_POLICIES = Object.freeze({
  NONE: 'none',
  NORMAL: 'normal',
  COMBAT_RUNTIME: 'combat-runtime',
  CONDITIONAL: 'conditional'
});

export const TURN_STEP_METADATA = Object.freeze({
  [TURN_STEPS.UNTAP]: Object.freeze({ phase: MAGIC_PHASES.BEGINNING, priority: PRIORITY_POLICIES.NONE, turnBasedAction: 'untap-permanents', actionImplemented: false }),
  [TURN_STEPS.UPKEEP]: Object.freeze({ phase: MAGIC_PHASES.BEGINNING, priority: PRIORITY_POLICIES.NORMAL, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.DRAW]: Object.freeze({ phase: MAGIC_PHASES.BEGINNING, priority: PRIORITY_POLICIES.NORMAL, priorityAfter: 'draw-step-draw', turnBasedAction: 'draw-card', actionImplemented: false }),
  [TURN_STEPS.PRECOMBAT_MAIN]: Object.freeze({ phase: MAGIC_PHASES.MAIN, priority: PRIORITY_POLICIES.NORMAL, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.BEGINNING]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.DECLARE_ATTACKERS]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: 'declare-attackers', actionImplemented: true }),
  [TURN_STEPS.DECLARE_BLOCKERS]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: 'declare-blockers', actionImplemented: true }),
  [TURN_STEPS.FIRST_STRIKE_DAMAGE]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: 'combat-damage', actionImplemented: true }),
  [TURN_STEPS.COMBAT_DAMAGE]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: 'combat-damage', actionImplemented: true }),
  [TURN_STEPS.END]: Object.freeze({ phase: MAGIC_PHASES.COMBAT, priority: PRIORITY_POLICIES.COMBAT_RUNTIME, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.POSTCOMBAT_MAIN]: Object.freeze({ phase: MAGIC_PHASES.MAIN, priority: PRIORITY_POLICIES.NORMAL, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.END_STEP]: Object.freeze({ phase: MAGIC_PHASES.ENDING, priority: PRIORITY_POLICIES.NORMAL, turnBasedAction: null, actionImplemented: true }),
  [TURN_STEPS.CLEANUP]: Object.freeze({ phase: MAGIC_PHASES.ENDING, priority: PRIORITY_POLICIES.CONDITIONAL, turnBasedAction: 'cleanup', actionImplemented: false })
});

export const TURN_STEP_ORDER = Object.freeze([
  TURN_STEPS.UNTAP,
  TURN_STEPS.UPKEEP,
  TURN_STEPS.DRAW,
  TURN_STEPS.PRECOMBAT_MAIN,
  TURN_STEPS.BEGINNING,
  TURN_STEPS.DECLARE_ATTACKERS,
  TURN_STEPS.DECLARE_BLOCKERS,
  TURN_STEPS.FIRST_STRIKE_DAMAGE,
  TURN_STEPS.COMBAT_DAMAGE,
  TURN_STEPS.END,
  TURN_STEPS.POSTCOMBAT_MAIN,
  TURN_STEPS.END_STEP,
  TURN_STEPS.CLEANUP
]);

export function opponentOf(playerId) {
  return playerId === 'opponent' ? 'player' : 'opponent';
}

function inferredStep(phase, step) {
  if (TURN_STEP_METADATA[step]) return step;
  if (phase === MAGIC_PHASES.COMBAT || phase === 'combat') return TURN_STEPS.BEGINNING;
  if (phase === MAGIC_PHASES.ENDING || phase === 'ending') return TURN_STEPS.END_STEP;
  if (phase === MAGIC_PHASES.BEGINNING || phase === 'beginning') return TURN_STEPS.UNTAP;
  return TURN_STEPS.PRECOMBAT_MAIN;
}

export function createCanonicalTurnState({ turn = 1, activePlayer = 'player', phase = MAGIC_PHASES.MAIN, step = null, priorityHolder = null, consecutivePasses = 0 } = {}) {
  const currentStep = inferredStep(phase, step);
  const metadata = TURN_STEP_METADATA[currentStep];
  const currentTurn = Math.max(1, Number(turn) || 1);
  return {
    type: 'MagicTurnState',
    version: 1,
    turn: currentTurn,
    turnId: `turn-${currentTurn}:${activePlayer}`,
    activePlayer,
    nonactivePlayer: opponentOf(activePlayer),
    phase: metadata.phase,
    step: currentStep,
    insideCombat: metadata.phase === MAGIC_PHASES.COMBAT,
    firstStrikeDamageRequired: false,
    priorityPolicy: metadata.priority,
    priorityAfter: metadata.priorityAfter || null,
    turnBasedAction: metadata.turnBasedAction,
    turnBasedActionImplemented: metadata.actionImplemented,
    priorityHolder: metadata.priority === PRIORITY_POLICIES.NORMAL && metadata.actionImplemented
      ? priorityHolder || activePlayer
      : null,
    consecutivePasses
  };
}

export function getTurnStepMetadata(step) {
  return TURN_STEP_METADATA[step] || null;
}
