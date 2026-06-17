// MTG Game State & Rules Management

export const CARD_TYPES = {
  LAND: 'land',
  CREATURE: 'creature',
  INSTANT: 'instant',
  SORCERY: 'sorcery',
  ENCHANTMENT: 'enchantment',
  ARTIFACT: 'artifact',
  PLANESWALKER: 'planeswalker'
};

export const MANA_COLORS = {
  WHITE: 'W',
  BLUE: 'U',
  BLACK: 'B',
  RED: 'R',
  GREEN: 'G',
  COLORLESS: 'C'
};

export const PHASES = {
  BEGINNING: 'beginning',
  MAIN1: 'main1',
  COMBAT: 'combat',
  MAIN2: 'main2',
  ENDING: 'ending'
};

// Detect card type - per MTG Comprehensive Rules 600.1
export function detectCardType(cardName) {
  if (!cardName) return CARD_TYPES.CREATURE;
  const name = cardName.toLowerCase().trim();
  
  // Rule 305: Lands - Check for land type keywords FIRST before other checks
  const isLand = /(forest|island|swamp|mountain|plains|basic|land)/.test(name);
  console.log(`[CARD TYPE DEBUG] Name: "${cardName}", Lowercase: "${name}", IsLand: ${isLand}`);
  if (isLand) return CARD_TYPES.LAND;
  
  // Rule 307: Instants
  if (name.includes('instant')) return CARD_TYPES.INSTANT;
  // Rule 307: Sorceries
  if (name.includes('sorcery')) return CARD_TYPES.SORCERY;
  // Rule 308: Enchantments
  if (name.includes('enchantment')) return CARD_TYPES.ENCHANTMENT;
  // Rule 301: Artifacts
  if (name.includes('artifact')) return CARD_TYPES.ARTIFACT;
  // Rule 306: Planeswalkers
  if (name.includes('planeswalker')) return CARD_TYPES.PLANESWALKER;
  
  // Default to creature (Rule 302)
  return CARD_TYPES.CREATURE;
}

// Initialize game state (Commander format: 40 life, 100 card singleton deck)
export function createGameState(deck) {
  return {
    playerHand: [],
    playerLibrary: [],
    playerBattlefield: [],
    playerGraveyard: [],
    playerExile: [],
    playerManaPool: createManaPool(),
    playerLife: 40,
    playerCanPlayLand: true,
    playerLandsPlayedThisTurn: 0,
    
    opponentHand: [],
    opponentLibrary: [],
    opponentBattlefield: [],
    opponentGraveyard: [],
    opponentExile: [],
    opponentManaPool: createManaPool(),
    opponentLife: 40,
    opponentCanPlayLand: true,
    opponentLandsPlayedThisTurn: 0,
    
    turn: 1,
    phase: PHASES.BEGINNING,
    activePlayer: 'player',
    stack: [],
    winner: null
  };
}

// Create mana pool
export function createManaPool() {
  return {
    total: 0,
    byColor: {
      [MANA_COLORS.WHITE]: 0,
      [MANA_COLORS.BLUE]: 0,
      [MANA_COLORS.BLACK]: 0,
      [MANA_COLORS.RED]: 0,
      [MANA_COLORS.GREEN]: 0,
      [MANA_COLORS.COLORLESS]: 0
    }
  };
}

// Tap land for mana
export function tapLandForMana(card) {
  const name = card.product_name?.toLowerCase() || '';
  const pool = createManaPool();
  pool.total = 1;
  
  if (name.includes('forest')) pool.byColor[MANA_COLORS.GREEN] = 1;
  else if (name.includes('island')) pool.byColor[MANA_COLORS.BLUE] = 1;
  else if (name.includes('swamp')) pool.byColor[MANA_COLORS.BLACK] = 1;
  else if (name.includes('mountain')) pool.byColor[MANA_COLORS.RED] = 1;
  else if (name.includes('plains')) pool.byColor[MANA_COLORS.WHITE] = 1;
  else pool.byColor[MANA_COLORS.COLORLESS] = 1;
  
  return pool;
}

// Check if can cast spell
export function canCastSpell(cardType, manaAvailable, phase, landsPlayedThisTurn = 0) {
  // Lands are NOT spells - they can be played once per turn during main phases
  if (cardType === CARD_TYPES.LAND) {
    return (phase === PHASES.MAIN1 || phase === PHASES.MAIN2) && landsPlayedThisTurn === 0;
  }
  // Sorceries can only be cast in main phases
  if (cardType === CARD_TYPES.SORCERY) {
    return phase === PHASES.MAIN1 || phase === PHASES.MAIN2;
  }
  // Instants can be cast anytime (simplified)
  if (cardType === CARD_TYPES.INSTANT) {
    return true;
  }
  // Creatures/other can be cast in main phases
  return phase === PHASES.MAIN1 || phase === PHASES.MAIN2;
}

// Add mana to pool
export function addManaToPool(pool, manaToAdd) {
  const updated = { ...pool };
  updated.total += manaToAdd.total || 1;
  for (const color in manaToAdd.byColor) {
    updated.byColor[color] = (updated.byColor[color] || 0) + (manaToAdd.byColor[color] || 0);
  }
  return updated;
}

// Spend mana from pool
export function spendManaFromPool(pool, amount) {
  if (pool.total >= amount) {
    return {
      ...pool,
      total: pool.total - amount
    };
  }
  return pool;
}

// Check win condition
export function checkWinCondition(playerLife, opponentLife) {
  if (playerLife <= 0) return 'opponent';
  if (opponentLife <= 0) return 'player';
  return null;
}

// Process phase transitions
export function nextPhase(currentPhase) {
  const phaseOrder = [PHASES.BEGINNING, PHASES.MAIN1, PHASES.COMBAT, PHASES.MAIN2, PHASES.ENDING];
  const currentIndex = phaseOrder.indexOf(currentPhase);
  return phaseOrder[(currentIndex + 1) % phaseOrder.length];
}