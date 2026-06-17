// MTG Combat Rules - Rules 506, 509
// Implements proper combat mechanics per Comprehensive Rules

export const COMBAT_PHASES = {
  DECLARE_ATTACKERS: 'declare_attackers',
  DECLARE_BLOCKERS: 'declare_blockers',
  COMBAT_DAMAGE: 'combat_damage',
  RESOLVE: 'resolve'
};

// Rule 509.1: Declare attackers
export function declareAttackers(hand, battlefield, defendingPlayer) {
  // Filter creatures that can attack (not summoning sick, has not attacked yet)
  const validAttackers = battlefield.filter(card => {
    // Rule 302.6: Creatures can attack unless they have haste or entered under control this turn
    // Simplified: check if card has attack ability
    const name = card.product_name?.toLowerCase() || '';
    return !name.includes('no attack') && 
           !card.cantAttack && 
           !card.tapped && 
           (card.type === 'CREATURE' || name.includes('creature'));
  });
  
  return {
    validAttackers,
    declared: []
  };
}

// Rule 509.2: Declare blockers
export function declareBlockers(attacking, defending) {
  // Filter creatures that can block (not tapped, not already blocking, has no restrictions)
  const validBlockers = defending.filter(card => {
    const name = card.product_name?.toLowerCase() || '';
    return !name.includes('no block') && 
           !card.cantBlock && 
           !card.tapped &&
           (card.type === 'CREATURE' || name.includes('creature'));
  });
  
  return {
    validBlockers,
    blocks: [] // Structure: { blockingCreature, blockedCreature }
  };
}

// Rule 510: Combat damage assignment
export function assignCombatDamage(attackers, blockers) {
  const damage = {
    toPlayer: 0,
    toCreatures: {}
  };
  
  attackers.forEach(attacker => {
    const power = extractPower(attacker.product_name);
    
    // Check if this attacker is blocked
    const blockingCreature = blockers.find(b => b.blockedCreature === attacker.id);
    
    if (blockingCreature) {
      // Damage goes to blocking creature
      damage.toCreatures[blockingCreature.id] = (damage.toCreatures[blockingCreature.id] || 0) + power;
    } else {
      // Unblocked damage goes to defending player
      damage.toPlayer += power;
    }
  });
  
  // Blocked creatures also deal damage back
  blockers.forEach(block => {
    const toughness = extractToughness(block.product_name);
    if (!damage.toCreatures[block.id]) {
      damage.toCreatures[block.id] = 0;
    }
    damage.toCreatures[block.id] += toughness;
  });
  
  return damage;
}

// Extract power from card text (simplified)
function extractPower(cardName) {
  const match = cardName.match(/(\d+)\/\d+/);
  return match ? parseInt(match[1]) : 0;
}

// Extract toughness from card text (simplified)
function extractToughness(cardName) {
  const match = cardName.match(/\d+\/(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Rule 510.2: Apply combat damage
export function applyDamage(creature, damage) {
  if (!creature.damage) creature.damage = 0;
  creature.damage += damage;
  
  const toughness = extractToughness(creature.product_name);
  const isDead = creature.damage >= toughness;
  
  return {
    ...creature,
    damage: creature.damage,
    isDead
  };
}

// Rule 510.3: Check for lethal damage
export function checkLethalDamage(creatures) {
  return creatures.filter(c => {
    const toughness = extractToughness(c.product_name);
    return c.damage >= toughness;
  });
}
