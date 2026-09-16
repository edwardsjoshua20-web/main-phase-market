const COLOR_BY_SYMBOL = Object.freeze({
  W: 'white',
  U: 'blue',
  B: 'black',
  R: 'red',
  G: 'green'
});

const COLOR_WORDS = Object.freeze(['white', 'blue', 'black', 'red', 'green', 'colorless']);

export function normalizeMagicText(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9+/'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clean(value = '') {
  return String(value || '').trim();
}

function readRaw(card = {}, key) {
  return card[key] ?? card.raw?.[key] ?? null;
}

export function getOracleText(card = {}) {
  return clean(
    card.oracleText
    || card.oracle_text
    || card.rulesText
    || card.rules_text
    || card.text
    || readRaw(card, 'oracle_text')
    || readRaw(card, 'rules_text')
    || readRaw(card, 'text')
  );
}

export function getTypeLine(card = {}) {
  return clean(
    card.typeLine
    || card.type_line
    || card.type
    || readRaw(card, 'type_line')
    || readRaw(card, 'type')
    || readRaw(card, 'card_type')
  );
}

export function getManaCost(card = {}) {
  return clean(card.manaCost || card.mana_cost || readRaw(card, 'mana_cost'));
}

export function getPowerToughness(card = {}) {
  const pt = clean(card.powerToughness || card.power_toughness || card.pt || readRaw(card, 'power_toughness'));
  if (pt && /^\d+\s*\/\s*\d+$/.test(pt)) {
    const [power, toughness] = pt.split('/').map((part) => Number(part.trim()));
    return { raw: pt, power, toughness };
  }
  if (pt && /^(\*|\d+\s*\/\s*\*|\*\s*\/\s*\d+)$/i.test(pt)) return { raw: pt, power: null, toughness: null };
  const power = Number(card.power ?? readRaw(card, 'power'));
  const toughness = Number(card.toughness ?? readRaw(card, 'toughness'));
  if (Number.isFinite(power) && Number.isFinite(toughness)) return { raw: `${power}/${toughness}`, power, toughness };
  return { raw: pt || '', power: null, toughness: null };
}

function colorsFromManaCost(manaCost = '') {
  const colors = new Set();
  for (const symbol of String(manaCost).matchAll(/\{([WUBRG])\}/gi)) {
    const color = COLOR_BY_SYMBOL[symbol[1].toUpperCase()];
    if (color) colors.add(color);
  }
  return [...colors];
}

function colorsFromCard(card = {}) {
  const direct = card.colors || readRaw(card, 'colors');
  if (Array.isArray(direct) && direct.length) {
    return [...new Set(direct.map((color) => COLOR_BY_SYMBOL[String(color).toUpperCase()] || String(color).toLowerCase()).filter(Boolean))];
  }
  const colorText = clean(card.color || readRaw(card, 'color')).toLowerCase();
  if (colorText) return COLOR_WORDS.filter((color) => colorText.includes(color));
  return colorsFromManaCost(getManaCost(card));
}

export function normalizeMagicCard(card = {}) {
  const typeLine = getTypeLine(card);
  const oracleText = getOracleText(card);
  const powerToughness = getPowerToughness(card);
  const normalizedText = normalizeMagicText(oracleText);
  const abilities = [
    normalizedText.includes('indestructible') ? 'indestructible' : null,
    normalizedText.includes('hexproof') ? 'hexproof' : null,
    normalizedText.includes('shroud') ? 'shroud' : null,
    normalizedText.includes('ward') ? 'ward' : null,
    normalizedText.includes('deathtouch') ? 'deathtouch' : null,
    normalizedText.includes('first strike') ? 'first strike' : null,
    normalizedText.includes('double strike') ? 'double strike' : null
  ].filter(Boolean);
  return {
    ...card,
    id: clean(card.id || card.oracle_id || card.name),
    name: clean(card.name),
    game: 'magic',
    typeLine,
    oracleText,
    manaCost: getManaCost(card),
    colors: colorsFromCard(card),
    power: powerToughness.power,
    toughness: powerToughness.toughness,
    powerToughness: powerToughness.raw,
    abilities: [...new Set([...(card.abilities || []), ...abilities])],
    normalizedName: normalizeMagicText(card.name),
    normalizedText,
    normalizedType: normalizeMagicText(typeLine),
    raw: card.raw || card
  };
}

export function isPermanentType(card = {}) {
  return /\b(creature|artifact|enchantment|planeswalker|battle|land)\b/i.test(card.typeLine || getTypeLine(card));
}

export function isCreature(card = {}) {
  return /\bcreature\b/i.test(card.typeLine || getTypeLine(card));
}

export function isInstant(card = {}) {
  return /\binstant\b/i.test(card.typeLine || getTypeLine(card));
}

export function isSorcery(card = {}) {
  return /\bsorcery\b/i.test(card.typeLine || getTypeLine(card));
}

export function hasKeyword(card = {}, keyword) {
  return normalizeMagicText(getOracleText(card)).includes(normalizeMagicText(keyword));
}

export function sourceHasQuality(source = {}, quality = '') {
  const wanted = normalizeMagicText(quality);
  if (!wanted) return false;
  if (wanted === 'colorless') return !source.colors?.length;
  if (source.colors?.includes(wanted)) return true;
  if (normalizeMagicText(source.typeLine).includes(wanted)) return true;
  if (normalizeMagicText(source.name).includes(wanted)) return true;
  return false;
}
