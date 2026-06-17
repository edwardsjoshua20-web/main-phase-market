// MTG Phase Rules - Rules 500-517
// Implements proper phase structure and phase-specific actions per Comprehensive Rules

export const PHASE_DETAILS = {
  BEGINNING: {
    name: 'Beginning Phase',
    steps: ['untap', 'upkeep', 'draw'],
    hasActions: true
  },
  UNTAP: {
    name: 'Untap Step',
    automatic: true,
    actions: ['untap_all_permanents']
  },
  UPKEEP: {
    name: 'Upkeep Step',
    hasActions: true,
    actions: ['triggered_abilities', 'priority']
  },
  DRAW: {
    name: 'Draw Step',
    automatic: true,
    actions: ['draw_card']
  },
  MAIN1: {
    name: 'Main Phase 1',
    hasActions: true,
    actions: [
      'cast_spells',
      'activate_abilities',
      'play_land',
      'priority'
    ]
  },
  COMBAT: {
    name: 'Combat Phase',
    steps: ['beginning_of_combat', 'declare_attackers', 'declare_blockers', 'combat_damage', 'end_of_combat'],
    hasActions: true
  },
  BEGIN_COMBAT: {
    name: 'Beginning of Combat Step',
    hasActions: true,
    actions: ['triggered_abilities', 'priority']
  },
  DECLARE_ATTACKERS: {
    name: 'Declare Attackers Step',
    hasActions: true,
    actions: ['declare_attackers', 'priority']
  },
  DECLARE_BLOCKERS: {
    name: 'Declare Blockers Step',
    hasActions: true,
    actions: ['declare_blockers', 'priority']
  },
  COMBAT_DAMAGE: {
    name: 'Combat Damage Step',
    automatic: true,
    actions: ['assign_damage', 'apply_damage']
  },
  END_COMBAT: {
    name: 'End of Combat Step',
    hasActions: true,
    actions: ['triggered_abilities', 'priority']
  },
  MAIN2: {
    name: 'Main Phase 2',
    hasActions: true,
    actions: [
      'cast_spells',
      'activate_abilities',
      'play_land',
      'priority'
    ]
  },
  ENDING: {
    name: 'Ending Phase',
    steps: ['end_step', 'cleanup'],
    hasActions: true
  },
  END_STEP: {
    name: 'End Step',
    hasActions: true,
    actions: ['triggered_abilities', 'priority']
  },
  CLEANUP: {
    name: 'Cleanup Step',
    automatic: true,
    actions: [
      'discard_down_to_hand_size',
      'remove_temporary_effects',
      'reset_phase_state'
    ]
  }
};

// Rule 500.1: Beginning phase
export function handleBeginningPhase(gameState) {
  const events = [];
  
  // Rule 502: Untap step - untap all permanents
  const untappedBattlefield = gameState.battlefield.map(card => ({
    ...card,
    tapped: false
  }));
  
  events.push({
    type: 'phase_action',
    step: 'untap',
    description: 'All permanents untap'
  });
  
  return {
    battlefield: untappedBattlefield,
    events
  };
}

// Rule 503: Upkeep step
export function handleUpkeepStep(gameState) {
  const events = [];
  
  // Check for upkeep triggered abilities
  // Check for upkeep costs
  
  events.push({
    type: 'upkeep_start',
    step: 'upkeep'
  });
  
  return { events };
}

// Rule 504: Draw step
export function handleDrawStep(gameState, isFirst = false) {
  const events = [];
  
  if (!isFirst) {
    // Rule 504.1: Player draws a card
    if (gameState.library.length === 0) {
      // Rule 704.5d: Drawing from empty library = lose
      events.push({
        type: 'draw_from_empty',
        severity: 'loss_of_game'
      });
    } else {
      const card = gameState.library[0];
      events.push({
        type: 'draw_card',
        card: card
      });
    }
  }
  
  return { events };
}

// Rule 506: Main phase
export function handleMainPhase(gameState) {
  // Main phases allow:
  // - Casting spells (Rule 601)
  // - Playing lands (Rule 305, max 1 per turn)
  // - Activating abilities (Rule 602)
  
  return {
    canCastSpells: true,
    canPlayLand: gameState.landsPlayedThisTurn === 0,
    canActivateAbilities: true,
    canUseInstants: false // Only during other phases with priority
  };
}

// Rule 506: Combat phase
export function handleCombatPhase(gameState) {
  const steps = [];
  
  // Rule 507: Beginning of combat step
  steps.push({
    name: 'beginning_of_combat',
    action: 'triggered_abilities'
  });
  
  // Rule 508: Declare attackers step
  steps.push({
    name: 'declare_attackers',
    action: 'choose_attackers',
    validAttackers: getValidAttackers(gameState.battlefield)
  });
  
  // Rule 509: Declare blockers step
  steps.push({
    name: 'declare_blockers',
    action: 'choose_blockers',
    validBlockers: getValidBlockers(gameState.battlefield)
  });
  
  // Rule 510: Combat damage step
  steps.push({
    name: 'combat_damage',
    action: 'apply_combat_damage'
  });
  
  // Rule 511: End of combat step
  steps.push({
    name: 'end_of_combat',
    action: 'triggered_abilities'
  });
  
  return { steps };
}

// Get valid attacking creatures
function getValidAttackers(battlefield) {
  return battlefield.filter(card => {
    const name = card.product_name?.toLowerCase() || '';
    // Can't attack if: summoning sick, already used, tapped, has restrictions
    return !card.summoningSick && 
           !name.includes('can\'t attack') &&
           !card.tapped &&
           (card.type === 'CREATURE' || name.includes('creature'));
  });
}

// Get valid blocking creatures
function getValidBlockers(battlefield) {
  return battlefield.filter(card => {
    const name = card.product_name?.toLowerCase() || '';
    return !name.includes('can\'t block') &&
           !card.tapped &&
           (card.type === 'CREATURE' || name.includes('creature'));
  });
}

// Rule 515: Ending phase
export function handleEndingPhase(gameState) {
  const events = [];
  
  // Rule 516: End step - triggered abilities resolve
  events.push({
    type: 'end_step',
    action: 'triggered_abilities'
  });
  
  // Rule 517: Cleanup step
  // - Discard down to 7 cards
  // - Remove temporary effects (damage resets, +/- effects expire, etc)
  // - Turn-based phase state resets
  
  let hand = gameState.hand;
  if (hand.length > 7) {
    const toDiscard = hand.length - 7;
    events.push({
      type: 'discard_excess',
      count: toDiscard,
      description: `Discard ${toDiscard} card(s) to hand size limit`
    });
    hand = hand.slice(0, 7);
  }
  
  // Clear temporary damage (creatures reset to 0 damage during cleanup)
  const resetBattlefield = gameState.battlefield.map(card => ({
    ...card,
    tempBonus: 0,
    tempEffects: []
  }));
  
  events.push({
    type: 'cleanup',
    description: 'Temporary effects end, damage resets'
  });
  
  return {
    hand,
    battlefield: resetBattlefield,
    events
  };
}

// Check valid actions for current phase
export function getValidActionsForPhase(phase) {
  const details = PHASE_DETAILS[phase];
  
  if (!details) return [];
  
  return details.actions || [];
}

// Rule 514: How to end the turn (for debug/testing)
export function canEndTurn(phase) {
  // Can end turn during main phases and after combat
  return phase === 'MAIN1' || phase === 'MAIN2' || phase === 'COMBAT';
}
