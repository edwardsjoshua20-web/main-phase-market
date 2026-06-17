import { CARD_TYPES, PHASES, detectCardType } from './mtgGameState';

/**
 * AI Opponent logic for MTG playtesting
 */

export const getAIDecision = (gameState) => {
  const { phase, aiHand, aiBattlefield, aiLife, playerLife, aiManaPool } = gameState;

  // Main Phase 1 - Play lands and creatures
  if (phase === PHASES.MAIN1) {
    return getMainPhaseDecision(gameState, true);
  }

  // Combat Phase - Attack decisions
  if (phase === PHASES.COMBAT) {
    return getCombatDecision(gameState);
  }

  // Main Phase 2 - Additional plays
  if (phase === PHASES.MAIN2) {
    return getMainPhaseDecision(gameState, false);
  }

  return { action: 'pass' };
};

import { getCardManaCost } from './mtgManaRules';

const getCardCost = (card) => getCardManaCost(card);

const getMainPhaseDecision = (gameState, isFirstMain) => {
  const { aiHand, aiManaPool, aiBattlefield, aiLandsPlayedThisTurn } = gameState;
  const availableMana = aiManaPool.total;

  // Prioritize playing lands first in first main (costs 0 mana, no hand needed)
  if (isFirstMain && aiLandsPlayedThisTurn === 0) {
    const landIndex = aiHand.findIndex(card => detectCardType(card.product_name) === CARD_TYPES.LAND);
    if (landIndex !== -1) {
      return { action: 'playCard', cardIndex: landIndex };
    }
  }

  // Only play spells if we have mana available
  if (availableMana === 0) return { action: 'pass' };

  // Play the most expensive creature we can afford
  let bestCreatureIdx = -1;
  let bestCreatureCost = 0;
  aiHand.forEach((card, idx) => {
    const type = detectCardType(card.product_name);
    if (type === CARD_TYPES.CREATURE) {
      const cost = getCardCost(card);
      if (cost <= availableMana && cost > bestCreatureCost) {
        bestCreatureCost = cost;
        bestCreatureIdx = idx;
      }
    }
  });
  if (bestCreatureIdx !== -1) return { action: 'playCard', cardIndex: bestCreatureIdx };

  // Play other affordable spells
  const spellIndex = aiHand.findIndex(card => {
    const type = detectCardType(card.product_name);
    if (type !== CARD_TYPES.INSTANT && type !== CARD_TYPES.SORCERY) return false;
    return getCardCost(card) <= availableMana;
  });
  if (spellIndex !== -1 && Math.random() > 0.6) {
    return { action: 'playCard', cardIndex: spellIndex };
  }

  return { action: 'pass' };
};

const getCombatDecision = (gameState) => {
  const { aiBattlefield, playerLife } = gameState;

  // Get all untapped creatures
  const attackers = aiBattlefield.filter(card => 
    card.type === CARD_TYPES.CREATURE && !card.tapped
  );

  if (attackers.length === 0) {
    return { action: 'pass' };
  }

  // Aggressive strategy: attack with all creatures unless health is critical
  if (playerLife > 5 || attackers.length >= 2) {
    return { 
      action: 'attack', 
      cardIndices: aiBattlefield
        .map((card, idx) => card.type === CARD_TYPES.CREATURE && !card.tapped ? idx : -1)
        .filter(idx => idx !== -1)
    };
  }

  return { action: 'pass' };
};

export const applyDamage = (fromCards, toLife) => {
  let damage = 0;
  fromCards.forEach(card => {
    if (card.type === CARD_TYPES.CREATURE) {
      damage += card.power || 1; // Default 1 power if not specified
    }
  });
  return Math.max(0, toLife - damage);
};

export const getAIDamage = (aiBattlefield, attackingIndices) => {
  let damage = 0;
  attackingIndices.forEach(idx => {
    const card = aiBattlefield[idx];
    if (card?.type === CARD_TYPES.CREATURE) {
      damage += card.power || 1;
    }
  });
  return damage;
};

export const shouldBlockWith = (blockCard, attackCard) => {
  // Simplified: block if toughness >= attacker power
  const blockToughness = blockCard.toughness || 1;
  const attackPower = attackCard.power || 1;
  
  return blockToughness >= attackPower;
};