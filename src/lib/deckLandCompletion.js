const BASIC_LANDS = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
  C: 'Wastes',
};

function parseColorIdentity(value) {
  if (Array.isArray(value)) return value.map((color) => String(color).toUpperCase()).filter((color) => BASIC_LANDS[color]);
  const raw = String(value || '').toUpperCase();
  return [...new Set((raw.match(/[WUBRG]/g) || []).filter((color) => BASIC_LANDS[color]))];
}

function countManaPips(items, allowedColors) {
  const counts = Object.fromEntries(allowedColors.map((color) => [color, 0]));
  items.forEach((item) => {
    const quantity = item.quantity || 1;
    const symbols = String(item.mana_cost || '').match(/\{([^}]+)\}/g) || [];
    symbols.forEach((symbol) => {
      const colors = [...new Set((symbol.match(/[WUBRG]/g) || []).filter((color) => allowedColors.includes(color)))];
      colors.forEach((color) => { counts[color] += quantity / colors.length; });
    });
  });
  return counts;
}

export function createBasicLandDistribution(deck, slots) {
  const commander = (deck.items || []).find((item) => item.is_commander);
  const commanderColors = parseColorIdentity(commander?.color_identity || commander?.colors || commander?.color);
  const detectedColors = commanderColors.length
    ? commanderColors
    : [...new Set((deck.items || []).flatMap((item) => parseColorIdentity(item.color_identity || item.colors || item.color || item.mana_cost)))];
  const colors = detectedColors.length ? detectedColors : ['C'];
  const pipCounts = countManaPips(deck.items || [], colors);
  const weightTotal = colors.reduce((sum, color) => sum + pipCounts[color], 0);
  const weights = Object.fromEntries(colors.map((color) => [color, weightTotal > 0 ? pipCounts[color] : 1]));
  const normalizedTotal = colors.reduce((sum, color) => sum + weights[color], 0);
  const raw = colors.map((color) => ({ color, exact: slots * weights[color] / normalizedTotal }));
  const quantities = Object.fromEntries(raw.map(({ color, exact }) => [BASIC_LANDS[color], Math.floor(exact)]));
  let remainder = slots - Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  raw.sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact))).forEach(({ color }) => {
    if (remainder <= 0) return;
    quantities[BASIC_LANDS[color]] += 1;
    remainder -= 1;
  });
  return quantities;
}
