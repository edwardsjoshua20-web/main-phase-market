// MTG Triggered Abilities - Rule 603
// Implements triggered ability handling per Comprehensive Rules

export const TRIGGER_EVENTS = {
  ENTERS_BATTLEFIELD: 'enters_battlefield',
  LEAVES_BATTLEFIELD: 'leaves_battlefield',
  CREATURE_ATTACKS: 'creature_attacks',
  CREATURE_BLOCKS: 'creature_blocks',
  DAMAGE_DEALT: 'damage_dealt',
  DAMAGE_TAKEN: 'damage_taken',
  SPELL_CAST: 'spell_cast',
  ABILITY_ACTIVATED: 'ability_activated',
  CREATURE_DIES: 'creature_dies',
  BEGINNING_OF_TURN: 'beginning_of_turn',
  END_OF_TURN: 'end_of_turn',
  UPKEEP: 'upkeep',
  DRAW: 'draw',
  DISCARD: 'discard',
  LANDS_PLAYED: 'lands_played'
};

// Rule 603.2: Check for triggered abilities when an event occurs
export function checkTriggeredAbilities(event, gameState) {
  const triggered = [];
  
  // Check all permanents for abilities that match this event
  [...gameState.battlefield, ...gameState.graveyard].forEach(card => {
    const abilities = extractTriggeredAbilities(card);
    
    abilities.forEach(ability => {
      if (matchesEvent(ability, event)) {
        triggered.push({
          id: Math.random(),
          source: card.product_name,
          ability: ability,
          controller: card.controller || 'player',
          event: event,
          resolved: false
        });
      }
    });
  });
  
  // Check hand for triggered abilities (instants, etc)
  gameState.hand?.forEach(card => {
    const abilities = extractTriggeredAbilities(card);
    abilities.forEach(ability => {
      if (matchesEvent(ability, event)) {
        triggered.push({
          id: Math.random(),
          source: card.product_name,
          ability: ability,
          controller: 'player',
          event: event,
          resolved: false
        });
      }
    });
  });
  
  return triggered;
}

// Extract triggered abilities from card text
function extractTriggeredAbilities(card) {
  if (!card.product_name) return [];
  
  const name = card.product_name.toLowerCase();
  const abilities = [];
  
  // Pattern matching for common triggered abilities
  if (name.includes('when') || name.includes('whenever')) {
    // "When/Whenever X happens, [effect]"
    
    if (name.includes('enters the battlefield')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.ENTERS_BATTLEFIELD,
        effect: extractEffect(name),
        text: 'When this enters the battlefield...'
      });
    }
    
    if (name.includes('leaves the battlefield')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.LEAVES_BATTLEFIELD,
        effect: extractEffect(name),
        text: 'When this leaves the battlefield...'
      });
    }
    
    if (name.includes('attacks')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.CREATURE_ATTACKS,
        effect: extractEffect(name),
        text: 'Whenever this creature attacks...'
      });
    }
    
    if (name.includes('blocks')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.CREATURE_BLOCKS,
        effect: extractEffect(name),
        text: 'Whenever this creature blocks...'
      });
    }
    
    if (name.includes('takes damage') || name.includes('dealt damage')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.DAMAGE_TAKEN,
        effect: extractEffect(name),
        text: 'Whenever this takes damage...'
      });
    }
    
    if (name.includes('beginning of turn') || name.includes('beginning of your turn')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.BEGINNING_OF_TURN,
        effect: extractEffect(name),
        text: 'At the beginning of your turn...'
      });
    }
    
    if (name.includes('end of turn')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.END_OF_TURN,
        effect: extractEffect(name),
        text: 'At the end of your turn...'
      });
    }
    
    if (name.includes('cast')) {
      abilities.push({
        trigger: TRIGGER_EVENTS.SPELL_CAST,
        effect: extractEffect(name),
        text: 'Whenever you cast a spell...'
      });
    }
  }
  
  return abilities;
}

// Match event to triggered ability
function matchesEvent(ability, event) {
  return ability.trigger === event.type;
}

// Extract effect from ability text
function extractEffect(text) {
  // Simplified extraction of ability effects
  if (text.includes('draw')) return 'draw_card';
  if (text.includes('gain life')) return 'gain_life';
  if (text.includes('destroy')) return 'destroy_target';
  if (text.includes('deal damage')) return 'deal_damage';
  if (text.includes('create')) return 'create_token';
  if (text.includes('return')) return 'return_from_graveyard';
  if (text.includes('untap')) return 'untap';
  if (text.includes('tap')) return 'tap';
  
  return 'unknown';
}

// Rule 603.4: Putting triggered abilities on stack
export function putOnStack(triggeredAbility) {
  return {
    ...triggeredAbility,
    zone: 'stack',
    resolveNext: true
  };
}

// Rule 603.7: Resolving triggered abilities
export function resolveTriggeredAbility(ability, gameState) {
  const result = {
    ability: ability,
    effects: []
  };
  
  switch (ability.effect) {
    case 'draw_card':
      result.effects.push({
        type: 'draw_card',
        controller: ability.controller,
        count: 1
      });
      break;
      
    case 'gain_life':
      result.effects.push({
        type: 'gain_life',
        controller: ability.controller,
        amount: 3 // Default, can be customized
      });
      break;
      
    case 'deal_damage':
      result.effects.push({
        type: 'deal_damage',
        target: 'opponent',
        amount: 1 // Default
      });
      break;
      
    case 'create_token':
      result.effects.push({
        type: 'create_token',
        token: 'creature',
        controller: ability.controller,
        count: 1
      });
      break;
      
    case 'destroy_target':
      result.effects.push({
        type: 'destroy_target',
        needsTarget: true
      });
      break;
      
    default:
      result.effects.push({
        type: 'unknown_effect'
      });
  }
  
  return result;
}

// Apply triggered ability effects to game state
export function applyTriggeredEffect(gameState, effect) {
  let updated = { ...gameState };
  
  switch (effect.type) {
    case 'draw_card':
      if (updated.library?.length > 0) {
        updated.hand = [...(updated.hand || []), updated.library[0]];
        updated.library = updated.library.slice(1);
      }
      break;
      
    case 'gain_life':
      if (effect.controller === 'player') {
        updated.playerLife = (updated.playerLife || 20) + effect.amount;
      } else {
        updated.opponentLife = (updated.opponentLife || 20) + effect.amount;
      }
      break;
      
    case 'deal_damage':
      if (effect.target === 'opponent') {
        updated.opponentLife = Math.max(0, (updated.opponentLife || 20) - effect.amount);
      } else {
        updated.playerLife = Math.max(0, (updated.playerLife || 20) - effect.amount);
      }
      break;
      
    case 'create_token':
      // Create simple token creature
      for (let i = 0; i < effect.count; i++) {
        updated.battlefield = [...(updated.battlefield || []), {
          product_name: `${effect.token} token`,
          type: 'CREATURE',
          controller: effect.controller,
          tapped: false,
          isToken: true
        }];
      }
      break;
  }
  
  return updated;
}
