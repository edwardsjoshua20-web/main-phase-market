// MTG Damage Rules - Rule 509, 510
// Implements proper damage assignment and tracking per Comprehensive Rules

// Rule 509.1: Combat damage assignment order
export function assignCombatDamage(attackingCreatures, blockingCreatures, defender) {
  const assignments = [];
  
  // Each attacking creature is either blocked or unblocked
  attackingCreatures.forEach(attacker => {
    const power = extractPower(attacker.product_name);
    
    // Find if this attacker is blocked
    const blocks = blockingCreatures.filter(b => b.blockedCreature === attacker.id);
    
    if (blocks.length === 0) {
      // Unblocked creature deals damage to defending player
      assignments.push({
        source: attacker.product_name,
        sourceId: attacker.id,
        target: 'player',
        damage: power,
        type: 'unblocked_combat_damage'
      });
    } else {
      // Blocked creature can assign damage to blocking creatures
      // Rule 510.1: Creature assigns lethal damage to each blocker, then excess to defending player
      const assignment = assignDamageToBlockers(attacker, blocks, power);
      assignments.push(...assignment);
    }
  });
  
  // Blocked creatures deal damage back
  blockingCreatures.forEach(blocker => {
    const toughness = extractToughness(blocker.product_name);
    const blockedCreature = attackingCreatures.find(a => a.id === blocker.blockedCreature);
    
    if (blockedCreature) {
      assignments.push({
        source: blocker.product_name,
        sourceId: blocker.id,
        target: blockedCreature.id,
        damage: toughness,
        type: 'blocked_combat_damage'
      });
    }
  });
  
  return assignments;
}

// Rule 510.1: Assign damage to blocking creatures
function assignDamageToBlockers(attacker, blockers, totalDamage) {
  const assignments = [];
  let remainingDamage = totalDamage;
  
  // For simplicity: distribute damage equally or to first blocker
  // In actual MTG, attacking player chooses distribution
  for (const blocker of blockers) {
    const toughness = extractToughness(blocker.product_name);
    const damageToAssign = Math.min(remainingDamage, toughness);
    
    assignments.push({
      source: attacker.product_name,
      sourceId: attacker.id,
      target: blocker.id,
      damage: damageToAssign,
      type: 'blocked_combat_damage'
    });
    
    remainingDamage -= damageToAssign;
  }
  
  // Any remaining damage goes to defending player
  if (remainingDamage > 0) {
    assignments.push({
      source: attacker.product_name,
      sourceId: attacker.id,
      target: 'player',
      damage: remainingDamage,
      type: 'excess_combat_damage'
    });
  }
  
  return assignments;
}

// Rule 510.2: Deal damage to creature
export function damageCreature(creature, damage, source = 'unknown') {
  if (!creature) return null;
  
  const newCreature = { ...creature };
  newCreature.damage = (creature.damage || 0) + damage;
  newCreature.lastDamagedBy = source;
  
  return newCreature;
}

// Rule 510.3: Deal damage to player
export function damagePlayer(currentLife, damage) {
  return Math.max(0, currentLife - damage);
}

// Rule 510.4: Mark lethal damage state
export function isLethal(creature, damage) {
  const toughness = extractToughness(creature.product_name);
  return (creature.damage || 0) + damage >= toughness;
}

// Rule 510.4: Check creature toughness (Rule 302.4)
export function getToughness(creature) {
  if (typeof creature === 'string') {
    return extractToughness(creature);
  }
  if (creature.toughness !== undefined) {
    return creature.toughness;
  }
  return extractToughness(creature.product_name);
}

// Rule 510.4: Check creature power (Rule 302.3)
export function getPower(creature) {
  if (typeof creature === 'string') {
    return extractPower(creature);
  }
  if (creature.power !== undefined) {
    return creature.power;
  }
  return extractPower(creature.product_name);
}

// Extract power from card text (e.g., "2/3" -> 2)
export function extractPower(cardName) {
  if (!cardName) return 0;
  const match = cardName.match(/\b(\d+)\/\d+\b/);
  return match ? parseInt(match[1]) : 0;
}

// Extract toughness from card text (e.g., "2/3" -> 3)
export function extractToughness(cardName) {
  if (!cardName) return 0;
  const match = cardName.match(/\b\d+\/(\d+)\b/);
  return match ? parseInt(match[1]) : 0;
}

// Rule 120.7: Lifelink (damage dealt by a creature also causes controller to gain life)
export function applyLifelink(creature, damage) {
  if (!creature.product_name?.toLowerCase().includes('lifelink')) {
    return { damage, lifeGain: 0 };
  }
  
  return {
    damage: damage,
    lifeGain: damage
  };
}

// Rule 111.7: Infect (10 poison counters = lose)
export function checkInfect(creature) {
  return creature.product_name?.toLowerCase().includes('infect') || false;
}

// Apply all damage assignments to game state
export function applyDamageAssignments(gameState, assignments) {
  let updated = { ...gameState };
  let newBattlefield = [...gameState.battlefield];
  let playerDamage = 0;
  let opponentDamage = 0;
  
  // Apply damage to creatures and track player damage
  assignments.forEach(assignment => {
    if (assignment.target === 'player') {
      playerDamage += assignment.damage;
    } else {
      // Find creature and apply damage
      const creatureIndex = newBattlefield.findIndex(c => c.id === assignment.target);
      if (creatureIndex !== -1) {
        newBattlefield[creatureIndex] = damageCreature(
          newBattlefield[creatureIndex],
          assignment.damage,
          assignment.source
        );
      }
    }
  });
  
  // Apply player damage
  updated.playerLife = damagePlayer(gameState.playerLife, playerDamage);
  
  updated.battlefield = newBattlefield;
  
  return {
    ...updated,
    lastDamageReport: {
      playerDamage,
      creatureDamage: assignments.filter(a => a.target !== 'player').length
    }
  };
}
