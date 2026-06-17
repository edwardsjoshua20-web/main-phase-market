// MTG Mana Abilities - Rules 605, 107.4
// Implements proper mana tapping and mana pool management per Comprehensive Rules

const MANA_COLORS = {
  WHITE: 'W',
  BLUE: 'U',
  BLACK: 'B',
  RED: 'R',
  GREEN: 'G',
  COLORLESS: 'C'
};

// Extract mana abilities from card name (simplified for basic lands)
export function extractManaAbility(cardName) {
  const name = cardName.toLowerCase();
  
  // Basic lands produce their respective colors
  if (name.includes('forest')) return { [MANA_COLORS.GREEN]: 1 };
  if (name.includes('island')) return { [MANA_COLORS.BLUE]: 1 };
  if (name.includes('swamp')) return { [MANA_COLORS.BLACK]: 1 };
  if (name.includes('mountain')) return { [MANA_COLORS.RED]: 1 };
  if (name.includes('plains')) return { [MANA_COLORS.WHITE]: 1 };
  
  // Dual lands
  if (name.includes('marsh')) return { [MANA_COLORS.BLACK]: 1, [MANA_COLORS.GREEN]: 1 };
  if (name.includes('tundra')) return { [MANA_COLORS.WHITE]: 1, [MANA_COLORS.BLUE]: 1 };
  if (name.includes('taiga')) return { [MANA_COLORS.RED]: 1, [MANA_COLORS.GREEN]: 1 };
  if (name.includes('badlands')) return { [MANA_COLORS.RED]: 1, [MANA_COLORS.BLACK]: 1 };
  if (name.includes('savanna')) return { [MANA_COLORS.WHITE]: 1, [MANA_COLORS.GREEN]: 1 };
  if (name.includes('scrubland')) return { [MANA_COLORS.WHITE]: 1, [MANA_COLORS.BLACK]: 1 };
  
  // Generic mana producer
  return { [MANA_COLORS.COLORLESS]: 1 };
}

// Tap a land for mana (Rule 605.1a)
export function tapLandForMana(land) {
  const name = land.product_name?.toLowerCase() || '';
  
  // Basic lands produce their respective colors
  if (/(forest)/.test(name)) return { G: 1 };
  if (/(island)/.test(name)) return { U: 1 };
  if (/(swamp)/.test(name)) return { B: 1 };
  if (/(mountain)/.test(name)) return { R: 1 };
  if (/(plains)/.test(name)) return { W: 1 };
  
  // Default to colorless
  return { C: 1 };
}

// Create mana pool structure
export function createManaPool() {
  return {
    [MANA_COLORS.WHITE]: 0,
    [MANA_COLORS.BLUE]: 0,
    [MANA_COLORS.BLACK]: 0,
    [MANA_COLORS.RED]: 0,
    [MANA_COLORS.GREEN]: 0,
    [MANA_COLORS.COLORLESS]: 0,
    total: 0
  };
}

// Add mana to pool from activated ability
export function addManaToPool(pool, manaProduced) {
  const newPool = { ...pool };
  let totalAdded = 0;
  
  Object.entries(manaProduced).forEach(([color, amount]) => {
    if (color !== 'total') {
      newPool[color] += amount;
      totalAdded += amount;
    }
  });
  
  newPool.total += totalAdded;
  return newPool;
}

// Check if pool has sufficient mana for cost (Rule 202.3)
// Simulates spending: colored requirements must be met exactly, then generic from any remaining
export function hasSufficientMana(pool, manaCost) {
  const { generic = 0, colors = {} } = manaCost;
  
  // Step 1: Check that each specific color requirement can be met
  for (const [color, required] of Object.entries(colors)) {
    if (required === 0) continue;
    if ((pool[color] || 0) < required) return false;
  }
  
  // Step 2: After paying colored costs, check if enough total mana remains for generic
  const colorManaSpent = Object.values(colors).reduce((a, b) => a + b, 0);
  const remainingTotal = pool.total - colorManaSpent;
  return remainingTotal >= generic;
}

// Spend mana from pool (Rule 202.2)
// Colored requirements are paid first, then generic is paid from any remaining mana
export function spendMana(pool, manaCost) {
  const { generic = 0, colors = {} } = manaCost;
  let newPool = { ...pool };
  
  // Step 1: Spend specific colored mana requirements
  Object.entries(colors).forEach(([color, amount]) => {
    if (amount > 0) {
      newPool[color] = Math.max(0, newPool[color] - amount);
    }
  });
  
  // Step 2: Pay generic cost from any available mana (colorless first, then colored)
  let genericRemaining = generic;
  const payOrder = ['C', 'W', 'U', 'B', 'R', 'G'];
  for (const color of payOrder) {
    if (genericRemaining <= 0) break;
    const available = newPool[color] || 0;
    const spent = Math.min(available, genericRemaining);
    newPool[color] = available - spent;
    genericRemaining -= spent;
  }
  
  // Recalculate total
  newPool.total = Object.keys(newPool)
    .filter(k => k !== 'total')
    .reduce((sum, color) => sum + (newPool[color] || 0), 0);
  
  return newPool;
}

// Parse mana cost from a mana cost string like "{4}", "{1}{U}", "{2}{G}{B}"
// This should be called with card.mana_cost (from Scryfall), NOT the card name.
export function parseManaCostString(manaCostStr) {
  if (!manaCostStr) return { generic: 0, colors: {}, total: 0 };
  const matches = manaCostStr.match(/\{([^}]+)\}/g) || [];
  const result = { generic: 0, colors: {}, total: 0 };

  matches.forEach(match => {
    const sym = match.slice(1, -1);
    if (!isNaN(sym)) {
      result.generic += parseInt(sym);
      result.total += parseInt(sym);
    } else if (['W', 'U', 'B', 'R', 'G', 'C'].includes(sym)) {
      result.colors[sym] = (result.colors[sym] || 0) + 1;
      result.total += 1;
    }
    // X, hybrid, phyrexian etc. treated as 0 for now
  });

  return result;
}

// Get the converted mana cost (total mana value) of a card object.
// Uses card.mana_cost string first, then falls back to numeric fields.
export function getCardManaCost(card) {
  if (card.mana_cost) {
    const parsed = parseManaCostString(card.mana_cost);
    return parsed.total;
  }
  // Scryfall numeric fields
  if (card.cmc !== undefined && card.cmc !== null) return Math.round(card.cmc);
  if (card.mana_value !== undefined && card.mana_value !== null) return Math.round(card.mana_value);
  if (card.converted_mana_cost !== undefined && card.converted_mana_cost !== null) return Math.round(card.converted_mana_cost);
  // Last resort: 1
  return 1;
}

// Legacy: parse mana cost symbols from a card name string (mostly unused now)
export function parseManaCost(cardNameOrCost) {
  return parseManaCostString(cardNameOrCost);
}

export { MANA_COLORS };