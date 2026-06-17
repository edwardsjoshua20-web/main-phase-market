// MTG State-Based Actions - Rule 704
// Checks performed automatically whenever a player gets priority

export function checkStateBasedActions(game) {
  const events = [];
  
  // Rule 704.5a: Lethal damage (creature with damage >= toughness dies)
  const deadCreatures = checkLethalDamage(game.battlefield);
  deadCreatures.forEach(card => {
    events.push({
      type: 'creature_dies',
      card: card,
      reason: 'lethal_damage'
    });
  });
  
  // Rule 704.5b: Zero or less toughness (creature dies)
  game.battlefield.forEach(card => {
    const toughness = extractToughness(card.product_name);
    if (toughness <= 0) {
      events.push({
        type: 'creature_dies',
        card: card,
        reason: 'zero_toughness'
      });
    }
  });
  
  // Rule 704.5c: Loss from life total
  if (game.playerLife <= 0) {
    events.push({
      type: 'player_loses',
      player: 'player',
      reason: 'life_total_zero'
    });
  }
  
  if (game.opponentLife <= 0) {
    events.push({
      type: 'opponent_loses',
      player: 'opponent',
      reason: 'life_total_zero'
    });
  }
  
  // Rule 704.5d: Player drew from empty library
  if (game.library.length === 0 && game.needsDraw) {
    events.push({
      type: 'player_loses',
      player: 'player',
      reason: 'empty_library'
    });
  }
  
  // Rule 704.5e: Ten or more poison counters
  if (game.poisonCounters >= 10) {
    events.push({
      type: 'player_loses',
      player: 'player',
      reason: 'poison_counters'
    });
  }
  
  // Rule 704.5f: Opponent has ten or more poison counters
  if (game.opponentPoisonCounters >= 10) {
    events.push({
      type: 'opponent_loses',
      player: 'opponent',
      reason: 'poison_counters'
    });
  }
  
  // Rule 704.5g: Planeswalker with 0 loyalty dies
  game.battlefield.forEach(card => {
    if (card.type === 'PLANESWALKER' && (card.loyalty || 0) <= 0) {
      events.push({
        type: 'permanent_dies',
        card: card,
        reason: 'zero_loyalty'
      });
    }
  });
  
  // Rule 704.5h: If permanent has both colors can't be one of them (shouldn't happen in normal play)
  
  // Rule 704.5i: Aura attached to illegal object becomes unattached
  game.battlefield.forEach(card => {
    if (card.type === 'ENCHANTMENT' && card.attachedTo) {
      const target = game.battlefield.find(c => c.id === card.attachedTo);
      if (!target) {
        events.push({
          type: 'aura_unattaches',
          card: card,
          reason: 'invalid_target'
        });
      }
    }
  });
  
  // Rule 704.5k: Equipment attached to illegal object
  game.battlefield.forEach(card => {
    if (card.type === 'ARTIFACT' && card.subtype?.includes('Equipment') && card.attachedTo) {
      const target = game.battlefield.find(c => c.id === card.attachedTo);
      if (!target) {
        events.push({
          type: 'equipment_unattaches',
          card: card,
          reason: 'invalid_target'
        });
      }
    }
  });
  
  return events;
}

function checkLethalDamage(creatures) {
  return creatures.filter(c => {
    const toughness = extractToughness(c.product_name);
    return c.damage >= toughness;
  });
}

function extractToughness(cardName) {
  const match = cardName.match(/\d+\/(\d+)/);
  return match ? parseInt(match[1]) : 1;
}

// Apply state-based actions to game state
export function applyStateBasedActions(game, events) {
  let newGame = { ...game };
  let newBattlefield = [...game.battlefield];
  
  events.forEach(event => {
    if (event.type === 'creature_dies' || event.type === 'permanent_dies') {
      // Move to graveyard
      newBattlefield = newBattlefield.filter(c => c.id !== event.card.id);
      newGame.graveyard = [...(newGame.graveyard || []), event.card];
    }
  });
  
  newGame.battlefield = newBattlefield;
  
  // Check for game over
  const lossEvents = events.filter(e => e.type === 'player_loses' || e.type === 'opponent_loses');
  if (lossEvents.length > 0) {
    newGame.gameOver = true;
    newGame.winner = lossEvents[0].player === 'player' ? 'opponent' : 'player';
  }
  
  return newGame;
}

export { checkLethalDamage, extractToughness };