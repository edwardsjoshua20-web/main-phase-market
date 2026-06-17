import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.mjs';
import { ensureCommanderCorpusTables } from './mtgCommanderCorpus.mjs';

const mtgSearchDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'search');
const INDEX_VERSION = 4;
const COMMANDER_CATEGORY_ORDER = [
  'creatures',
  'instants',
  'sorceries',
  'artifacts',
  'utility artifacts',
  'mana artifacts',
  'enchantments',
  'planeswalkers',
  'lands',
  'utility lands'
];
const COMMANDER_THEME_DEFINITIONS = [
  { slug: 'mill', label: 'Mill', priority: 100 },
  { slug: 'petitioners', label: 'Persistent Petitioners', priority: 98 },
  { slug: 'reanimator', label: 'Reanimator', priority: 96 },
  { slug: 'aristocrats', label: 'Aristocrats', priority: 94 },
  { slug: 'enchantress', label: 'Enchantress', priority: 92 },
  { slug: 'control', label: 'Control', priority: 90 },
  { slug: 'combo', label: 'Combo', priority: 88 },
  { slug: 'lands', label: 'Lands', priority: 82 },
  { slug: 'artifacts', label: 'Artifacts', priority: 80 },
  { slug: 'tokens', label: 'Tokens', priority: 78 },
  { slug: 'counters', label: '+1/+1 Counters', priority: 76 },
  { slug: 'spellslinger', label: 'Spellslinger', priority: 70 },
  { slug: 'storm', label: 'Storm', priority: 66 },
  { slug: 'burn', label: 'Burn', priority: 64 }
];
const COLOR_BITS = {
  W: 1,
  U: 2,
  B: 4,
  R: 8,
  G: 16
};
const VALID_CORPUS_DECK_SQL = `quality_status IN ('clean', 'repaired')`;

let ensurePromise = null;
let cardLookupCache = null;
let simulationGauntletCache = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['â€™]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function computeColorMask(colors = []) {
  return [...new Set(colors.map((color) => String(color || '').toUpperCase()).filter(Boolean))]
    .reduce((mask, color) => mask | (COLOR_BITS[color] || 0), 0);
}

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function loadAllMtgRows() {
  if (!fs.existsSync(mtgSearchDir)) {
    return [];
  }

  const files = fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'));
  return files.flatMap((file) => {
    const filePath = path.join(mtgSearchDir, file);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  });
}

function getCanonicalName(row) {
  const rawName = String(row?.name || '').trim();
  if (!rawName.includes('//')) return rawName;

  const parts = rawName
    .split('//')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return rawName;

  const normalizedParts = parts.map((part) => normalizeText(part));
  if (normalizedParts[0] && normalizedParts.every((part) => part === normalizedParts[0])) {
    return parts[0];
  }

  return rawName;
}

function isEnglish(row) {
  return String(row?.lang || '').toLowerCase() === 'en';
}

function hasImage(row) {
  return Boolean(row?.image_normal || row?.image_small);
}

function canCardBeCommander(row) {
  const typeLine = String(row?.type_line || '').toLowerCase();
  const oracleText = String(row?.oracle_text || '').toLowerCase();
  const isLegendary = typeLine.includes('legendary');
  const isCreature = typeLine.includes('creature');
  const isBackground = typeLine.includes('background');
  const isVehicle = typeLine.includes('vehicle');
  const isSpacecraft = typeLine.includes('spacecraft');
  const explicitCommanderText = oracleText.includes('can be your commander')
    || oracleText.includes('choose a background')
    || oracleText.includes('doctor\'s companion')
    || oracleText.includes('friends forever')
    || oracleText.includes('partner');

  return Boolean(
    row?.can_be_commander
    || (isLegendary && isCreature)
    || (isLegendary && (isVehicle || isSpacecraft))
    || isBackground
    || explicitCommanderText
  );
}

function comparePreferredCommanderPrinting(a, b) {
  const aEnglish = isEnglish(a);
  const bEnglish = isEnglish(b);
  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;

  const aImage = hasImage(a);
  const bImage = hasImage(b);
  if (aImage !== bImage) return aImage ? -1 : 1;

  const aDate = String(a.released_at || '');
  const bDate = String(b.released_at || '');
  if (aDate !== bDate) return bDate.localeCompare(aDate);

  return String(a.set_name || '').localeCompare(String(b.set_name || ''));
}

function pickPrimaryPrinting(rows) {
  const sorted = [...rows].sort(comparePreferredCommanderPrinting);
  return sorted[0] || null;
}

function buildCardLookup(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const oracleId = String(row?.oracle_id || '').trim();
    if (!oracleId) continue;
    if (!grouped.has(oracleId)) {
      grouped.set(oracleId, []);
    }
    grouped.get(oracleId).push(row);
  }

  const lookup = new Map();
  for (const [oracleId, variants] of grouped.entries()) {
    const primary = pickPrimaryPrinting(variants);
    if (!primary) continue;
    lookup.set(oracleId, {
      oracle_id: oracleId,
      name: getCanonicalName(primary),
      name_normalized: normalizeText(getCanonicalName(primary)),
      image_url: primary.image_normal || primary.image_small || null,
      image_art_crop: primary.image_art_crop || null,
      mana_cost: primary.mana_cost || '',
      type_line: primary.type_line || '',
      oracle_text: primary.oracle_text || '',
      released_at: primary.released_at || null,
      color_identity: Array.isArray(primary.color_identity) ? primary.color_identity : []
    });
  }

  return lookup;
}

function persistCardLookup(lookup) {
  const records = [...lookup.values()].map((card) => ({
    oracle_id: card.oracle_id,
    name: card.name,
    name_normalized: card.name_normalized,
    image_url: card.image_url || null,
    image_art_crop: card.image_art_crop || null,
    mana_cost: card.mana_cost || '',
    type_line: card.type_line || '',
    oracle_text: card.oracle_text || '',
    released_at: card.released_at || null,
    color_identity_json: JSON.stringify(card.color_identity || [])
  }));

  const tx = db.transaction((items) => {
    truncateCardLookupStmt.run();
    for (const item of items) {
      insertCardLookupStmt.run(item);
    }
  });

  tx(records);
}

function loadCardLookupFromDb() {
  const rows = selectAllCardLookupRowsStmt.all();
  if (rows.length === 0) {
    return null;
  }

  const lookup = new Map();
  for (const row of rows) {
    lookup.set(row.oracle_id, {
      oracle_id: row.oracle_id,
      name: row.name,
      name_normalized: row.name_normalized,
      image_url: row.image_url || null,
      image_art_crop: row.image_art_crop || null,
      mana_cost: row.mana_cost || '',
      type_line: row.type_line || '',
      oracle_text: row.oracle_text || '',
      released_at: row.released_at || null,
      color_identity: parseJsonArray(row.color_identity_json)
    });
  }

  return lookup;
}

function getCardLookup() {
  if (!cardLookupCache) {
    cardLookupCache = loadCardLookupFromDb();
    if (!cardLookupCache) {
      cardLookupCache = buildCardLookup(loadAllMtgRows());
      persistCardLookup(cardLookupCache);
      checkpointWal();
    }
  }
  return cardLookupCache;
}

function getCardLookupByNormalizedName() {
  const byName = new Map();
  for (const card of getCardLookup().values()) {
    const key = normalizeText(card.name || '');
    if (!key || byName.has(key)) continue;
    byName.set(key, card);
  }
  return byName;
}

function categorizeCard(typeLine, oracleText) {
  const type = String(typeLine || '').toLowerCase();
  const text = String(oracleText || '').toLowerCase();

  if (type.includes('land')) {
    if (
      text.includes('enters the battlefield tapped')
      || text.includes('sacrifice')
      || text.includes('search your library')
      || text.includes('return target')
      || text.includes('surveil')
      || text.includes('draw')
      || text.includes('create ')
      || text.includes('each opponent')
      || text.includes('whenever ')
    ) {
      return 'utility lands';
    }
    return 'lands';
  }

  if (type.includes('creature')) return 'creatures';
  if (type.includes('instant')) return 'instants';
  if (type.includes('sorcery')) return 'sorceries';
  if (type.includes('planeswalker')) return 'planeswalkers';
  if (type.includes('enchantment')) return 'enchantments';

  if (type.includes('artifact')) {
    const producesMana = /\{t\}\s*:\s*add\b/.test(text) || text.includes('add one mana') || text.includes('add two mana');
    if (producesMana) return 'mana artifacts';

    const utilitySignals = [
      'draw',
      'search your library',
      'destroy target',
      'exile target',
      'sacrifice',
      'whenever ',
      'at the beginning',
      'create ',
      'return target'
    ];
    if (utilitySignals.some((signal) => text.includes(signal))) {
      return 'utility artifacts';
    }

    return 'artifacts';
  }

  return 'other';
}

function categoryLabel(category) {
  const labels = {
    creatures: 'Creatures',
    instants: 'Instants',
    sorceries: 'Sorceries',
    artifacts: 'Artifacts',
    'utility artifacts': 'Utility Artifacts',
    'mana artifacts': 'Mana Artifacts',
    enchantments: 'Enchantments',
    planeswalkers: 'Planeswalkers',
    lands: 'Lands',
    'utility lands': 'Utility Lands'
  };

  return labels[category] || category;
}

function mapCommanderRow(row) {
  if (!row) return null;
  return {
    oracle_id: row.oracle_id,
    name: row.name,
    name_normalized: row.name_normalized,
    image_url: row.image_url || null,
    image_art_crop: row.image_art_crop || null,
    mana_cost: row.mana_cost || '',
    type_line: row.type_line || '',
    oracle_text: row.oracle_text || '',
    released_at: row.released_at || null,
    color_identity: parseJsonArray(row.color_identity_json),
    deck_count: Number(row.deck_count || 0),
    rank: Number(row.rank || 0)
  };
}

function mapStatRow(row) {
  return {
    oracle_id: row.card_oracle_id,
    card_name: row.card_name,
    image_url: row.image_url || null,
    mana_cost: row.mana_cost || '',
    type_line: row.type_line || '',
    oracle_text: row.oracle_text || '',
    color_identity: parseJsonArray(row.color_identity_json),
    deck_count: Number(row.deck_count || 0),
    total_commander_decks: Number(row.total_commander_decks || 0),
    inclusion_rate: Number(row.inclusion_rate || 0),
    global_deck_count: Number(row.global_deck_count || 0),
    total_global_decks: Number(row.total_global_decks || 0),
    global_inclusion_rate: Number(row.global_inclusion_rate || 0),
    synergy_score: Number(row.synergy_score || 0),
    confidence_score: Number(row.confidence_score || 0),
    weighted_score: Number(row.weighted_score || 0),
    category: row.category || 'other',
    label: categoryLabel(row.category || 'other'),
    released_at: row.released_at || null
  };
}

function isBasicLandName(name) {
  const normalized = normalizeText(name);
  return normalized === 'plains'
    || normalized === 'island'
    || normalized === 'swamp'
    || normalized === 'mountain'
    || normalized === 'forest'
    || normalized === 'wastes'
    || normalized === 'snow covered plains'
    || normalized === 'snow covered island'
    || normalized === 'snow covered swamp'
    || normalized === 'snow covered mountain'
    || normalized === 'snow covered forest';
}

function shouldOmitFromRecommendations(row) {
  const typeLine = String(row?.type_line || '').toLowerCase();
  return typeLine.includes('basic land') || isBasicLandName(row?.card_name || '');
}

function classifyDeckType(typeLine) {
  const type = String(typeLine || '').toLowerCase();
  if (type.includes('land')) return 'Land';
  if (type.includes('creature')) return 'Creature';
  if (type.includes('artifact')) return 'Artifact';
  if (type.includes('enchantment')) return 'Enchantment';
  if (type.includes('instant')) return 'Instant';
  if (type.includes('sorcery')) return 'Sorcery';
  if (type.includes('planeswalker')) return 'Planeswalker';
  if (type.includes('battle')) return 'Battle';
  return 'Battle';
}

function parseManaValue(manaCost) {
  const symbols = String(manaCost || '').match(/\{([^}]+)\}/g) || [];
  if (symbols.length === 0) return null;

  let total = 0;
  for (const symbol of symbols) {
    const token = symbol.replace(/[{}]/g, '').toUpperCase();
    if (/^\d+$/.test(token)) {
      total += Number(token);
      continue;
    }
    if (token === 'X' || token === 'Y' || token === 'Z') {
      continue;
    }
    total += 1;
  }

  return total;
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getTypeLine(card) {
  return String(card?.type_line || '').toLowerCase();
}

function getOracleText(card) {
  return String(card?.oracle_text || '').toLowerCase();
}

function isLandCard(card) {
  return getTypeLine(card).includes('land');
}

function isRampCard(card) {
  const text = getOracleText(card);
  return /\{t\}\s*:\s*add\b/.test(text)
    || text.includes('search your library for a basic land')
    || (text.includes('search your library for up to') && text.includes('land'))
    || text.includes('add one mana of any color')
    || text.includes('add one mana of any type')
    || text.includes('add two mana in any combination')
    || text.includes('play an additional land');
}

function isDrawCard(card) {
  const text = getOracleText(card);
  return text.includes('draw a card')
    || text.includes('draw two cards')
    || text.includes('draw three cards')
    || text.includes('investigate');
}

function isSustainedDrawCard(card) {
  const text = getOracleText(card);
  return (text.includes('whenever') && text.includes('draw a card'))
    || text.includes('at the beginning of your upkeep, draw')
    || text.includes('at the beginning of your end step, draw')
    || text.includes('whenever you cast') && text.includes('draw a card')
    || text.includes('whenever an opponent') && text.includes('draw a card');
}

function isRemovalCard(card) {
  const text = getOracleText(card);
  return text.includes('destroy target')
    || text.includes('exile target')
    || (text.includes('return target') && text.includes('owner\'s hand'))
    || text.includes('fight target')
    || text.includes('damage to any target');
}

function isSweeperCard(card) {
  const text = getOracleText(card);
  return text.includes('destroy all creatures')
    || text.includes('exile all creatures')
    || text.includes('destroy all artifacts')
    || text.includes('destroy all enchantments')
    || text.includes('each creature')
    || text.includes('all creatures get');
}

function isCounterCard(card) {
  const text = getOracleText(card);
  return text.includes('counter target spell')
    || text.includes('counter target activated ability')
    || text.includes('counter target triggered ability');
}

function isInteractionCard(card) {
  return isRemovalCard(card) || isSweeperCard(card) || isCounterCard(card);
}

function isCheapInteractionCard(card) {
  const manaValue = parseManaValue(card?.mana_cost || '');
  return isInteractionCard(card) && manaValue !== null && manaValue <= 3;
}

function isProtectionCard(card) {
  const text = getOracleText(card);
  return text.includes('hexproof')
    || text.includes('indestructible')
    || text.includes('phase out')
    || text.includes('protection from')
    || text.includes('ward ');
}

function isGraveyardRecursionCard(card) {
  const text = getOracleText(card);
  return text.includes('from your graveyard to the battlefield')
    || text.includes('return target card from your graveyard')
    || text.includes('shuffle your graveyard into your library');
}

function isGraveyardHateCard(card) {
  const text = getOracleText(card);
  return text.includes('exile target card from a graveyard')
    || text.includes('cards in graveyards')
    || text.includes('if a card would be put into an opponent\'s graveyard');
}

function isLifegainCard(card) {
  const text = getOracleText(card);
  return text.includes('gain 3 life')
    || text.includes('gain 4 life')
    || text.includes('gain 5 life')
    || text.includes('you gain life');
}

function isArtifactHateCard(card) {
  const text = getOracleText(card);
  return text.includes('destroy target artifact')
    || text.includes('exile target artifact')
    || text.includes('each artifact');
}

function isEnchantmentHateCard(card) {
  const text = getOracleText(card);
  return text.includes('destroy target enchantment')
    || text.includes('exile target enchantment')
    || text.includes('each enchantment');
}

function getRampManaGain(card) {
  const text = getOracleText(card);
  if (text.includes('add two mana')) return 2;
  return 1;
}

function pickMulliganBottomIndex(hand) {
  let worstIndex = 0;
  let worstScore = -Infinity;

  hand.forEach((card, index) => {
    const manaValue = parseManaValue(card?.mana_cost || '') ?? 0;
    const score = isLandCard(card) ? manaValue - 10 : manaValue + (isRampCard(card) ? -2 : 0) + (isCheapInteractionCard(card) ? -1 : 0);
    if (score > worstScore) {
      worstScore = score;
      worstIndex = index;
    }
  });

  return worstIndex;
}

function shouldMulliganHand(hand) {
  const lands = hand.filter(isLandCard).length;
  const cheapRamp = hand.filter((card) => isRampCard(card) && (parseManaValue(card?.mana_cost || '') ?? 99) <= 2).length;
  const castableCards = hand.filter((card) => !isLandCard(card) && (parseManaValue(card?.mana_cost || '') ?? 99) <= 3).length;
  return lands < 2 || lands > 5 || (lands === 2 && cheapRamp === 0 && castableCards < 2);
}

function shuffleArray(values) {
  const array = [...values];
  for (let index = array.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [array[index], array[swapIndex]] = [array[swapIndex], array[index]];
  }
  return array;
}

function buildSimulationLibrary(deck) {
  const commander = Array.isArray(deck?.cards) ? deck.cards.find((card) => card.is_commander) || null : null;
  const library = [];
  for (const card of Array.isArray(deck?.cards) ? deck.cards : []) {
    if (card.is_commander) continue;
    const quantity = Math.max(0, Number(card.quantity || 0));
    for (let count = 0; count < quantity; count += 1) {
      library.push({
        ...card,
        manaValue: parseManaValue(card.mana_cost || '')
      });
    }
  }
  return {
    commander: commander ? { ...commander, manaValue: parseManaValue(commander.mana_cost || '') ?? 0 } : null,
    library
  };
}

function simulateGoldfishRun(deck) {
  const { commander, library: baseLibrary } = buildSimulationLibrary(deck);
  const library = shuffleArray(baseLibrary);
  let hand = library.splice(0, 7);
  let mulligansTaken = 0;

  if (shouldMulliganHand(hand)) {
    mulligansTaken = 1;
    const secondLibrary = shuffleArray(baseLibrary);
    hand = secondLibrary.splice(0, 7);
    const bottomIndex = pickMulliganBottomIndex(hand);
    hand.splice(bottomIndex, 1);
    library.length = 0;
    library.push(...secondLibrary);
  }

  let landsInPlay = 0;
  let bonusManaSources = 0;
  let commanderCastTurn = null;
  let firstInteractionTurn = null;
  let drawEngineTurn = null;
  let keptOpeningHand = !shouldMulliganHand(hand);
  const manaByTurn = {};
  let missedThirdLandDrop = false;
  let missedFourthLandDrop = false;

  for (let turn = 1; turn <= 10; turn += 1) {
    if (turn > 1 && library.length > 0) {
      hand.push(library.shift());
    }

    const landIndex = hand.findIndex((card) => isLandCard(card));
    if (landIndex >= 0) {
      hand.splice(landIndex, 1);
      landsInPlay += 1;
    }

    let availableMana = landsInPlay + bonusManaSources;
    manaByTurn[turn] = availableMana;

    if (turn === 3 && availableMana < 3) missedThirdLandDrop = true;
    if (turn === 4 && availableMana < 4) missedFourthLandDrop = true;

    if (firstInteractionTurn === null) {
      const hasInteraction = hand.some((card) => isCheapInteractionCard(card) && (card.manaValue ?? 99) <= availableMana);
      if (hasInteraction) {
        firstInteractionTurn = turn;
      }
    }

    if (drawEngineTurn === null) {
      const hasEngine = hand.some((card) => isSustainedDrawCard(card) && (card.manaValue ?? 99) <= availableMana);
      if (hasEngine) {
        drawEngineTurn = turn;
      }
    }

    let manaToSpend = availableMana;
    let castSomething = true;
    while (castSomething) {
      castSomething = false;
      const rampIndex = hand.findIndex((card) => isRampCard(card) && (card.manaValue ?? 99) <= manaToSpend);
      if (rampIndex >= 0) {
        const rampCard = hand[rampIndex];
        manaToSpend -= rampCard.manaValue ?? 0;
        bonusManaSources += getRampManaGain(rampCard);
        hand.splice(rampIndex, 1);
        castSomething = true;
      }
    }

    if (commander && commanderCastTurn === null && commander.manaValue <= availableMana) {
      commanderCastTurn = turn;
    }
  }

  return {
    keptOpeningHand,
    mulligansTaken,
    commanderCastTurn: commanderCastTurn ?? 11,
    firstInteractionTurn: firstInteractionTurn ?? 11,
    drawEngineTurn: drawEngineTurn ?? 11,
    manaByTurn,
    missedThirdLandDrop,
    missedFourthLandDrop
  };
}

function buildGoldfishReport(deck, iterations = 120) {
  const runs = Array.from({ length: iterations }, () => simulateGoldfishRun(deck));
  const averageTurn = (key) => Number((averageNumeric(runs.map((run) => run[key]).filter((value) => value < 11)) || 0).toFixed(1));
  const averageManaAtTurn = (turn) => Number((averageNumeric(runs.map((run) => run.manaByTurn[turn] || 0)) || 0).toFixed(1));

  return {
    sampleSize: iterations,
    keepRate: Math.round((runs.filter((run) => run.keptOpeningHand).length / iterations) * 100),
    mulliganRate: Math.round((runs.filter((run) => run.mulligansTaken > 0).length / iterations) * 100),
    avgCommanderTurn: averageTurn('commanderCastTurn'),
    avgInteractionTurn: averageTurn('firstInteractionTurn'),
    avgDrawEngineTurn: averageTurn('drawEngineTurn'),
    avgManaTurn3: averageManaAtTurn(3),
    avgManaTurn4: averageManaAtTurn(4),
    avgManaTurn6: averageManaAtTurn(6),
    missThirdLandRate: Math.round((runs.filter((run) => run.missedThirdLandDrop).length / iterations) * 100),
    missFourthLandRate: Math.round((runs.filter((run) => run.missedFourthLandDrop).length / iterations) * 100)
  };
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureCommanderTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mtg_commander_index (
      oracle_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      image_url TEXT,
      image_art_crop TEXT,
      mana_cost TEXT,
      type_line TEXT,
      oracle_text TEXT,
      released_at TEXT,
      color_identity_json TEXT NOT NULL,
      color_mask INTEGER NOT NULL DEFAULT 0,
      deck_count INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_mtg_commander_index_name ON mtg_commander_index (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_mtg_commander_index_decks ON mtg_commander_index (deck_count DESC, name_normalized ASC);
    CREATE INDEX IF NOT EXISTS idx_mtg_commander_index_colors ON mtg_commander_index (color_mask, deck_count DESC);

    CREATE TABLE IF NOT EXISTS mtg_commander_card_stats (
      commander_oracle_id TEXT NOT NULL,
      commander_name TEXT NOT NULL,
      card_oracle_id TEXT NOT NULL,
      card_name TEXT NOT NULL,
      card_name_lower TEXT NOT NULL,
      image_url TEXT,
      mana_cost TEXT,
      type_line TEXT,
      oracle_text TEXT,
      color_identity_json TEXT NOT NULL,
      deck_count INTEGER NOT NULL DEFAULT 0,
      total_commander_decks INTEGER NOT NULL DEFAULT 0,
      inclusion_rate REAL NOT NULL DEFAULT 0,
      global_deck_count INTEGER NOT NULL DEFAULT 0,
      total_global_decks INTEGER NOT NULL DEFAULT 0,
      global_inclusion_rate REAL NOT NULL DEFAULT 0,
      synergy_score REAL NOT NULL DEFAULT 0,
      confidence_score REAL NOT NULL DEFAULT 0,
      weighted_score REAL NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'other',
      released_at TEXT,
      PRIMARY KEY (commander_oracle_id, card_oracle_id)
    );
    CREATE INDEX IF NOT EXISTS idx_mtg_commander_stats_commander ON mtg_commander_card_stats (commander_oracle_id, weighted_score DESC);
    CREATE INDEX IF NOT EXISTS idx_mtg_commander_stats_category ON mtg_commander_card_stats (commander_oracle_id, category, weighted_score DESC);

    CREATE TABLE IF NOT EXISTS mtg_commander_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mtg_card_lookup (
      oracle_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      image_url TEXT,
      image_art_crop TEXT,
      mana_cost TEXT,
      type_line TEXT,
      oracle_text TEXT,
      released_at TEXT,
      color_identity_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mtg_card_lookup_name ON mtg_card_lookup (name_normalized);
  `);

  ensureColumn('mtg_commander_card_stats', 'released_at', 'TEXT');
}

ensureCommanderCorpusTables();
ensureCommanderTables();

const readMetaStmt = db.prepare(`SELECT value FROM mtg_commander_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO mtg_commander_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countCommanderIndexStmt = db.prepare(`SELECT COUNT(*) AS count FROM mtg_commander_index`);
const countCommanderStatsStmt = db.prepare(`SELECT COUNT(*) AS count FROM mtg_commander_card_stats`);
const countCorpusDecksStmt = db.prepare(`SELECT COUNT(*) AS count FROM mtg_commander_corpus_decks WHERE ${VALID_CORPUS_DECK_SQL}`);
const countCardLookupStmt = db.prepare(`SELECT COUNT(*) AS count FROM mtg_card_lookup`);
const truncateCommanderIndexStmt = db.prepare(`DELETE FROM mtg_commander_index`);
const truncateCommanderStatsStmt = db.prepare(`DELETE FROM mtg_commander_card_stats`);
const truncateCardLookupStmt = db.prepare(`DELETE FROM mtg_card_lookup`);
const insertCommanderIndexStmt = db.prepare(`
  INSERT INTO mtg_commander_index (
    oracle_id, name, name_normalized, image_url, image_art_crop, mana_cost, type_line,
    oracle_text, released_at, color_identity_json, color_mask, deck_count
  ) VALUES (
    @oracle_id, @name, @name_normalized, @image_url, @image_art_crop, @mana_cost, @type_line,
    @oracle_text, @released_at, @color_identity_json, @color_mask, @deck_count
  )
`);
const insertCommanderStatStmt = db.prepare(`
  INSERT INTO mtg_commander_card_stats (
    commander_oracle_id, commander_name, card_oracle_id, card_name, card_name_lower, image_url,
    mana_cost, type_line, oracle_text, color_identity_json, deck_count, total_commander_decks,
    inclusion_rate, global_deck_count, total_global_decks, global_inclusion_rate, synergy_score,
    confidence_score, weighted_score, category, released_at
  ) VALUES (
    @commander_oracle_id, @commander_name, @card_oracle_id, @card_name, @card_name_lower, @image_url,
    @mana_cost, @type_line, @oracle_text, @color_identity_json, @deck_count, @total_commander_decks,
    @inclusion_rate, @global_deck_count, @total_global_decks, @global_inclusion_rate, @synergy_score,
    @confidence_score, @weighted_score, @category, @released_at
  )
`);
const insertCardLookupStmt = db.prepare(`
  INSERT INTO mtg_card_lookup (
    oracle_id, name, name_normalized, image_url, image_art_crop, mana_cost,
    type_line, oracle_text, released_at, color_identity_json
  ) VALUES (
    @oracle_id, @name, @name_normalized, @image_url, @image_art_crop, @mana_cost,
    @type_line, @oracle_text, @released_at, @color_identity_json
  )
`);
const selectAllCardLookupRowsStmt = db.prepare(`
  SELECT *
  FROM mtg_card_lookup
`);

function rebuildCommanderIndex() {
  const rows = loadAllMtgRows();
  const grouped = new Map();

  for (const row of rows) {
    if (!canCardBeCommander(row)) continue;

    const oracleId = String(row?.oracle_id || '').trim();
    if (!oracleId || !hasImage(row)) continue;

    if (!grouped.has(oracleId)) {
      grouped.set(oracleId, []);
    }
    grouped.get(oracleId).push(row);
  }

  const deckCounts = new Map(
    db.prepare(`
      SELECT commander_oracle_id, COUNT(*) AS deck_count
      FROM mtg_commander_corpus_decks
      WHERE ${VALID_CORPUS_DECK_SQL}
      GROUP BY commander_oracle_id
    `).all().map((row) => [row.commander_oracle_id, Number(row.deck_count || 0)])
  );

  const records = [];
  for (const [oracleId, variants] of grouped.entries()) {
    const primary = pickPrimaryPrinting(variants);
    if (!primary) continue;

    const colors = Array.isArray(primary.color_identity) ? primary.color_identity : [];
    const name = getCanonicalName(primary);

    records.push({
      oracle_id: oracleId,
      name,
      name_normalized: normalizeText(name),
      image_url: primary.image_normal || primary.image_small || null,
      image_art_crop: primary.image_art_crop || null,
      mana_cost: primary.mana_cost || '',
      type_line: primary.type_line || '',
      oracle_text: primary.oracle_text || '',
      released_at: primary.released_at || null,
      color_identity_json: JSON.stringify(colors),
      color_mask: computeColorMask(colors),
      deck_count: deckCounts.get(oracleId) || 0
    });
  }

  const tx = db.transaction((items) => {
    truncateCommanderIndexStmt.run();
    for (const item of items) {
      insertCommanderIndexStmt.run(item);
    }
  });

  tx(records);
}

function rebuildCommanderStats() {
  const rows = loadAllMtgRows();
  const cardLookup = buildCardLookup(rows);
  persistCardLookup(cardLookup);
  const totalGlobalDecks = Number(countCorpusDecksStmt.get()?.count || 0);

  if (totalGlobalDecks === 0) {
    truncateCommanderStatsStmt.run();
    return;
  }

  const globalCounts = new Map(
    db.prepare(`
      SELECT card_oracle_id, COUNT(DISTINCT cards.deck_key) AS deck_count
      FROM mtg_commander_corpus_cards cards
      INNER JOIN mtg_commander_corpus_decks decks
        ON decks.deck_key = cards.deck_key
      WHERE cards.is_commander = 0
        AND decks.${VALID_CORPUS_DECK_SQL}
      GROUP BY card_oracle_id
    `).all().map((row) => [row.card_oracle_id, Number(row.deck_count || 0)])
  );

  const commanderRows = db.prepare(`
    SELECT commander_oracle_id, commander_name, COUNT(*) AS deck_count
    FROM mtg_commander_corpus_decks
    WHERE ${VALID_CORPUS_DECK_SQL}
    GROUP BY commander_oracle_id, commander_name
  `).all();

  truncateCommanderStatsStmt.run();

  const insertRowsForCommander = db.transaction((records) => {
    for (const record of records) {
      insertCommanderStatStmt.run(record);
    }
  });

  const cardCountsStmt = db.prepare(`
    SELECT
      cards.card_oracle_id AS card_oracle_id,
      MAX(COALESCE(cards.card_name, '')) AS card_name,
      COUNT(DISTINCT cards.deck_key) AS deck_count
    FROM mtg_commander_corpus_cards cards
    INNER JOIN mtg_commander_corpus_decks decks
      ON decks.deck_key = cards.deck_key
    WHERE cards.is_commander = 0
      AND decks.commander_oracle_id = ?
      AND decks.${VALID_CORPUS_DECK_SQL}
    GROUP BY cards.card_oracle_id
  `);

  for (const commander of commanderRows) {
    const totalCommanderDecks = Number(commander.deck_count || 0);
    if (totalCommanderDecks <= 0) continue;

    const cardRows = cardCountsStmt.all(commander.commander_oracle_id);
    const records = [];

    for (const row of cardRows) {
      const deckCount = Number(row.deck_count || 0);
      if (deckCount <= 0) continue;

      const cardMeta = cardLookup.get(row.card_oracle_id) || {
        oracle_id: row.card_oracle_id,
        name: row.card_name || 'Unknown Card',
        name_normalized: normalizeText(row.card_name || 'Unknown Card'),
        image_url: null,
        image_art_crop: null,
        mana_cost: '',
        type_line: '',
        oracle_text: '',
        released_at: null,
        color_identity: []
      };

      const inclusionRate = deckCount / totalCommanderDecks;
      const globalDeckCount = globalCounts.get(row.card_oracle_id) || 0;
      const globalInclusionRate = totalGlobalDecks > 0 ? globalDeckCount / totalGlobalDecks : 0;
      const synergyScore = inclusionRate - globalInclusionRate;
      const confidenceScore = Math.tanh(deckCount / 20);
      const weightedScore = synergyScore * confidenceScore;
      const category = categorizeCard(cardMeta.type_line, cardMeta.oracle_text);

      if (category === 'other') continue;

      records.push({
        commander_oracle_id: commander.commander_oracle_id,
        commander_name: commander.commander_name,
        card_oracle_id: row.card_oracle_id,
        card_name: cardMeta.name || row.card_name || 'Unknown Card',
        card_name_lower: cardMeta.name_normalized || normalizeText(row.card_name || 'Unknown Card'),
        image_url: cardMeta.image_url || null,
        mana_cost: cardMeta.mana_cost || '',
        type_line: cardMeta.type_line || '',
        oracle_text: cardMeta.oracle_text || '',
        color_identity_json: JSON.stringify(cardMeta.color_identity || []),
        deck_count: deckCount,
        total_commander_decks: totalCommanderDecks,
        inclusion_rate: inclusionRate,
        global_deck_count: globalDeckCount,
        total_global_decks: totalGlobalDecks,
        global_inclusion_rate: globalInclusionRate,
        synergy_score: synergyScore,
        confidence_score: confidenceScore,
        weighted_score: weightedScore,
        category,
        released_at: cardMeta.released_at || null
      });
    }

    if (records.length > 0) {
      insertRowsForCommander(records);
    }
  }
}

function checkpointWal() {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {}
}

export function ensureMtgCommanderEngine() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = Promise.resolve().then(() => {
    ensureCommanderTables();

    const version = Number(readMetaStmt.get('mtg_commander_index_version')?.value || 0);
    const commanderIndexCount = Number(countCommanderIndexStmt.get()?.count || 0);
    const commanderStatsCount = Number(countCommanderStatsStmt.get()?.count || 0);
    const corpusDeckCount = Number(countCorpusDecksStmt.get()?.count || 0);
    const cardLookupCount = Number(countCardLookupStmt.get()?.count || 0);

    const requiresFullRebuild = version !== INDEX_VERSION;

    if (commanderIndexCount === 0 || requiresFullRebuild) {
      rebuildCommanderIndex();
    }

    if (commanderStatsCount === 0 || requiresFullRebuild) {
      if (corpusDeckCount > 0) {
        rebuildCommanderStats();
      } else {
        truncateCommanderStatsStmt.run();
      }
      checkpointWal();
    }

    if (cardLookupCount === 0) {
      getCardLookup();
      checkpointWal();
    }

    if (version !== INDEX_VERSION) {
      writeMetaStmt.run('mtg_commander_index_version', String(INDEX_VERSION));
    }
    writeMetaStmt.run('mtg_commander_index_row_count', String(Number(countCommanderIndexStmt.get()?.count || 0)));
    writeMetaStmt.run('mtg_commander_stats_row_count', String(Number(countCommanderStatsStmt.get()?.count || 0)));
  });

  ensurePromise.then(() => {
    warmSimulationGauntletsSoon();
  }).catch(() => {});

  return ensurePromise;
}

export async function refreshMtgCommanderEngine() {
  ensurePromise = null;
  simulationGauntletCache = null;
  writeMetaStmt.run('mtg_commander_index_version', '0');
  return ensureMtgCommanderEngine();
}

export function searchMtgCommanderEngine(query = '', colors = [], limit = 120, minDeckCount = 0) {
  const normalizedQuery = normalizeText(query);
  const selectedColors = Array.isArray(colors)
    ? [...new Set(colors.map((color) => String(color || '').toUpperCase()).filter(Boolean))]
    : [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 120, 1000));
  const safeMinDeckCount = Math.max(0, Number(minDeckCount) || 0);

  const clauses = ['deck_count >= @minDeckCount'];
  const params = {
    minDeckCount: safeMinDeckCount
  };

  if (normalizedQuery) {
    params.exact = normalizedQuery;
    params.startsWith = `${normalizedQuery}%`;
    params.contains = `%${normalizedQuery}%`;
    clauses.push(`(
      name_normalized = @exact
      OR name_normalized LIKE @startsWith
      OR name_normalized LIKE @contains
      OR oracle_text LIKE @contains
    )`);
  }

  if (selectedColors.length > 0) {
    params.colorMask = computeColorMask(selectedColors);
    clauses.push('(color_mask & @colorMask) = @colorMask');
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const total = Number(db.prepare(`
    SELECT COUNT(*) AS count
    FROM mtg_commander_index
    ${whereSql}
  `).get(params)?.count || 0);

  const rows = db.prepare(`
    SELECT *,
      (
        SELECT COUNT(*) + 1
        FROM mtg_commander_index ranked
        WHERE ranked.deck_count > mtg_commander_index.deck_count
      ) AS rank
    FROM mtg_commander_index
    ${whereSql}
    ORDER BY
      CASE
        WHEN @hasQuery = 0 THEN 0
        WHEN name_normalized = @exact THEN 0
        WHEN name_normalized LIKE @startsWith THEN 1
        WHEN name_normalized LIKE @contains THEN 2
        ELSE 3
      END,
      deck_count DESC,
      released_at DESC,
      name_normalized ASC
    LIMIT @limit
  `).all({
    ...params,
    exact: params.exact || '',
    startsWith: params.startsWith || '',
    contains: params.contains || '',
    hasQuery: normalizedQuery ? 1 : 0,
    limit: safeLimit
  });

  return {
    query: String(query || ''),
    total,
    results: rows.map(mapCommanderRow)
  };
}

function selectCommanderRow(oracleId) {
  return db.prepare(`
    SELECT *,
      (
        SELECT COUNT(*) + 1
        FROM mtg_commander_index ranked
        WHERE ranked.deck_count > mtg_commander_index.deck_count
      ) AS rank
    FROM mtg_commander_index
    WHERE oracle_id = ?
  `).get(oracleId);
}

function selectCommanderStats(oracleId) {
  return db.prepare(`
    SELECT *
    FROM mtg_commander_card_stats
    WHERE commander_oracle_id = ?
    ORDER BY weighted_score DESC, deck_count DESC, card_name_lower ASC
  `).all(oracleId);
}

function buildCategorySections(statRows) {
  const grouped = new Map();

  for (const row of statRows) {
    if (shouldOmitFromRecommendations(row)) continue;
    const card = mapStatRow(row);
    if (!COMMANDER_CATEGORY_ORDER.includes(card.category)) continue;
    if (!grouped.has(card.category)) {
      grouped.set(card.category, []);
    }
    grouped.get(card.category).push(card);
  }

  return COMMANDER_CATEGORY_ORDER
    .filter((category) => grouped.has(category))
    .map((category) => ({
      category,
      label: categoryLabel(category),
      cards: grouped.get(category).slice(0, 15)
    }));
}

function buildTopSynergy(statRows) {
  return statRows
    .filter((row) => !shouldOmitFromRecommendations(row))
    .filter((row) => Number(row.weighted_score || 0) > 0)
    .slice(0, 20)
    .map(mapStatRow);
}

function buildNewCards(statRows) {
  return [...statRows]
    .filter((row) => !shouldOmitFromRecommendations(row))
    .filter((row) => row.released_at)
    .sort((a, b) => {
      const dateCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
      if (dateCompare !== 0) return dateCompare;
      const scoreCompare = Number(b.weighted_score || 0) - Number(a.weighted_score || 0);
      if (scoreCompare !== 0) return scoreCompare;
      return Number(b.deck_count || 0) - Number(a.deck_count || 0);
    })
    .slice(0, 15)
    .map(mapStatRow);
}

function buildGameChangers(statRows, totalDecks) {
  const maxDeckCount = Math.max(2, Math.min(12, Math.floor(totalDecks * 0.45)));

  return statRows
    .filter((row) => !shouldOmitFromRecommendations(row))
    .filter((row) => Number(row.weighted_score || 0) > 0)
    .filter((row) => Number(row.deck_count || 0) >= 2)
    .filter((row) => Number(row.deck_count || 0) <= maxDeckCount)
    .slice(0, 15)
    .map(mapStatRow);
}

function buildRelatedCommanders(commanderRow, statRows) {
  const signatureCards = statRows
    .filter((row) => Number(row.weighted_score || 0) > 0)
    .slice(0, 8)
    .map((row) => row.card_oracle_id);

  if (signatureCards.length === 0) {
    return [];
  }

  const colorMask = Number(commanderRow.color_mask || 0);
  const placeholders = signatureCards.map((_, index) => `@card${index}`).join(', ');
  const params = {
    oracleId: commanderRow.oracle_id,
    colorMask
  };
  signatureCards.forEach((cardId, index) => {
    params[`card${index}`] = cardId;
  });

  const rows = db.prepare(`
    SELECT
      idx.*,
      (
        SELECT COUNT(*) + 1
        FROM mtg_commander_index ranked
        WHERE ranked.deck_count > idx.deck_count
      ) AS rank,
      COUNT(*) AS shared_cards
    FROM mtg_commander_card_stats stats
    INNER JOIN mtg_commander_index idx
      ON idx.oracle_id = stats.commander_oracle_id
    WHERE stats.card_oracle_id IN (${placeholders})
      AND stats.commander_oracle_id <> @oracleId
      AND idx.deck_count > 0
      AND (idx.color_mask & @colorMask) = @colorMask
    GROUP BY idx.oracle_id
    ORDER BY shared_cards DESC, idx.deck_count DESC, idx.name_normalized ASC
    LIMIT 6
  `).all(params);

  return rows.map((row) => ({
    ...mapCommanderRow(row),
    shared_cards: Number(row.shared_cards || 0)
  }));
}

function buildAverageDeckProfile(oracleId) {
  const totalDecks = Number(
    db.prepare(`
      SELECT COUNT(*) AS count
      FROM mtg_commander_corpus_decks
      WHERE commander_oracle_id = ?
        AND ${VALID_CORPUS_DECK_SQL}
    `).get(oracleId)?.count || 0
  );

  if (totalDecks === 0) {
    return {
      total_decks: 0,
      average_cards: 0,
      type_distribution: [],
      mana_curve: []
    };
  }

  const cardLookup = getCardLookup();
  const rows = db.prepare(`
    SELECT
      cards.card_oracle_id,
      SUM(cards.quantity) AS total_quantity
    FROM mtg_commander_corpus_cards cards
    INNER JOIN mtg_commander_corpus_decks decks
      ON decks.deck_key = cards.deck_key
    WHERE decks.commander_oracle_id = ?
      AND cards.is_commander = 0
      AND decks.${VALID_CORPUS_DECK_SQL}
    GROUP BY cards.card_oracle_id
  `).all(oracleId);

  const typeTotals = new Map();
  const manaTotals = new Map();
  let totalCards = 0;

  for (const row of rows) {
    const quantity = Number(row.total_quantity || 0);
    if (quantity <= 0) continue;

    const card = cardLookup.get(row.card_oracle_id);
    const typeLabel = classifyDeckType(card?.type_line || '');
    typeTotals.set(typeLabel, (typeTotals.get(typeLabel) || 0) + quantity);
    totalCards += quantity;

    if (typeLabel === 'Land') {
      continue;
    }

    const manaValue = parseManaValue(card?.mana_cost || '');
    if (manaValue === null) continue;
    const bucket = Math.min(manaValue, 7);
    manaTotals.set(bucket, (manaTotals.get(bucket) || 0) + quantity);
  }

  const typeOrder = ['Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'];
  const typeDistribution = typeOrder
    .filter((label) => typeTotals.has(label))
    .map((label) => ({
      name: label,
      total_quantity: Number(typeTotals.get(label) || 0),
      average_count: Number(((typeTotals.get(label) || 0) / totalDecks).toFixed(1))
    }))
    .filter((entry) => entry.average_count > 0);

  const manaCurve = Array.from({ length: 8 }, (_, index) => ({
    mana: index === 7 ? '7+' : String(index),
    bucket: index,
    total_quantity: Number(manaTotals.get(index) || 0),
    average_count: Number(((manaTotals.get(index) || 0) / totalDecks).toFixed(1))
  }));

  return {
    total_decks: totalDecks,
    average_cards: Number((totalCards / totalDecks).toFixed(1)),
    type_distribution: typeDistribution,
    mana_curve: manaCurve
  };
}

function getCommanderDeckRows(oracleId) {
  return db.prepare(`
    SELECT deck_key, deck_name, source_name, source_url
    FROM mtg_commander_corpus_decks
    WHERE commander_oracle_id = ?
      AND ${VALID_CORPUS_DECK_SQL}
    ORDER BY imported_at DESC, deck_key ASC
  `).all(oracleId);
}

function getCommanderDeckCards(oracleId) {
  return db.prepare(`
    SELECT
      decks.deck_key,
      cards.card_oracle_id,
      cards.quantity
    FROM mtg_commander_corpus_cards cards
    INNER JOIN mtg_commander_corpus_decks decks
      ON decks.deck_key = cards.deck_key
    WHERE decks.commander_oracle_id = ?
      AND cards.is_commander = 0
      AND decks.${VALID_CORPUS_DECK_SQL}
    ORDER BY decks.deck_key ASC
  `).all(oracleId);
}

function getDeckRowsByCard(oracleId) {
  return db.prepare(`
    SELECT DISTINCT
      decks.deck_key,
      decks.deck_name,
      decks.source_name,
      decks.source_url,
      decks.commander_oracle_id
    FROM mtg_commander_corpus_cards cards
    INNER JOIN mtg_commander_corpus_decks decks
      ON decks.deck_key = cards.deck_key
    WHERE cards.card_oracle_id = ?
      AND cards.is_commander = 0
      AND decks.${VALID_CORPUS_DECK_SQL}
    ORDER BY decks.imported_at DESC, decks.deck_key ASC
  `).all(oracleId);
}

function getDeckCardsByDeckKeys(deckKeys) {
  if (!Array.isArray(deckKeys) || deckKeys.length === 0) {
    return [];
  }

  const placeholders = deckKeys.map(() => '?').join(', ');
  return db.prepare(`
    SELECT
      decks.deck_key,
      cards.card_oracle_id,
      cards.quantity
    FROM mtg_commander_corpus_cards cards
    INNER JOIN mtg_commander_corpus_decks decks
      ON decks.deck_key = cards.deck_key
    WHERE decks.deck_key IN (${placeholders})
      AND cards.is_commander = 0
      AND decks.${VALID_CORPUS_DECK_SQL}
    ORDER BY decks.deck_key ASC
  `).all(...deckKeys);
}

function getGlobalCardCounts() {
  return new Map(
    db.prepare(`
      SELECT card_oracle_id, COUNT(DISTINCT cards.deck_key) AS deck_count
      FROM mtg_commander_corpus_cards cards
      INNER JOIN mtg_commander_corpus_decks decks
        ON decks.deck_key = cards.deck_key
      WHERE cards.is_commander = 0
        AND decks.${VALID_CORPUS_DECK_SQL}
      GROUP BY card_oracle_id
    `).all().map((row) => [row.card_oracle_id, Number(row.deck_count || 0)])
  );
}

function buildDeckCorpus(oracleId) {
  const deckRows = getCommanderDeckRows(oracleId);
  const cardRows = getCommanderDeckCards(oracleId);
  const cardLookup = getCardLookup();
  const byDeck = new Map(deckRows.map((deck) => [deck.deck_key, {
    deck_key: deck.deck_key,
    deck_name: deck.deck_name || '',
    source_name: deck.source_name || '',
    source_url: deck.source_url || '',
    cards: []
  }]));

  for (const row of cardRows) {
    if (!byDeck.has(row.deck_key)) continue;
    const cardMeta = cardLookup.get(row.card_oracle_id);
    byDeck.get(row.deck_key).cards.push({
      deck_key: row.deck_key,
      card_oracle_id: row.card_oracle_id,
      quantity: Number(row.quantity || 1),
      name: cardMeta?.name || '',
      type_line: cardMeta?.type_line || '',
      oracle_text: cardMeta?.oracle_text || '',
      mana_cost: cardMeta?.mana_cost || '',
      released_at: cardMeta?.released_at || null,
      color_identity: cardMeta?.color_identity || [],
      image_url: cardMeta?.image_url || null
    });
  }

  return [...byDeck.values()];
}

function buildDeckCorpusFromRows(deckRows) {
  const deckKeys = deckRows.map((deck) => deck.deck_key).filter(Boolean);
  const cardRows = getDeckCardsByDeckKeys(deckKeys);
  const cardLookup = getCardLookup();
  const byDeck = new Map(deckRows.map((deck) => [deck.deck_key, {
    deck_key: deck.deck_key,
    deck_name: deck.deck_name || '',
    source_name: deck.source_name || '',
    source_url: deck.source_url || '',
    commander_oracle_id: deck.commander_oracle_id || '',
    cards: []
  }]));

  for (const row of cardRows) {
    if (!byDeck.has(row.deck_key)) continue;
    const cardMeta = cardLookup.get(row.card_oracle_id);
    byDeck.get(row.deck_key).cards.push({
      deck_key: row.deck_key,
      card_oracle_id: row.card_oracle_id,
      quantity: Number(row.quantity || 1),
      name: cardMeta?.name || '',
      type_line: cardMeta?.type_line || '',
      oracle_text: cardMeta?.oracle_text || '',
      mana_cost: cardMeta?.mana_cost || '',
      released_at: cardMeta?.released_at || null,
      color_identity: cardMeta?.color_identity || [],
      image_url: cardMeta?.image_url || null
    });
  }

  return [...byDeck.values()];
}

function buildCardDeckCorpus(oracleId) {
  const deckRows = getDeckRowsByCard(oracleId);
  return buildDeckCorpusFromRows(deckRows);
}

function sumDeckQuantity(deckCards, predicate) {
  return deckCards.reduce((sum, card) => (
    predicate(card) ? sum + Number(card.quantity || 0) : sum
  ), 0);
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(needle));
}

function inferDeckThemes(deck) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  const cardCount = cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
  const instantSorceryCount = sumDeckQuantity(cards, (card) => {
    const type = String(card.type_line || '').toLowerCase();
    return type.includes('instant') || type.includes('sorcery');
  });
  const artifactCount = sumDeckQuantity(cards, (card) => String(card.type_line || '').toLowerCase().includes('artifact'));
  const enchantmentCount = sumDeckQuantity(cards, (card) => String(card.type_line || '').toLowerCase().includes('enchantment'));
  const landCount = sumDeckQuantity(cards, (card) => String(card.type_line || '').toLowerCase().includes('land'));
  const burnCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return text.includes('deals 1 damage')
      || text.includes('deals 2 damage')
      || text.includes('deals 3 damage')
      || text.includes('damage to each opponent')
      || text.includes('damage to any target');
  });
  const stormCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return text.includes('storm')
      || text.includes('copy target instant or sorcery spell')
      || text.includes('copy that spell')
      || text.includes('whenever you cast an instant or sorcery spell');
  });
  const comboCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    const name = String(card.name || '').toLowerCase();
    return text.includes('search your library')
      || text.includes('you may cast')
      || text.includes('draw a card whenever')
      || name.includes('curiosity')
      || name.includes('ophidian eye')
      || name.includes('underworld breach');
  });
  const millCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    const name = String(card.name || '').toLowerCase();
    return text.includes('mill ')
      || text.includes('mills ')
      || text.includes('their graveyard')
      || text.includes('into their graveyard')
      || name.includes('mindcrank')
      || name.includes('fraying sanity')
      || name.includes('mesmeric orb')
      || name.includes('maddening cacophony');
  });
  const petitionersCount = sumDeckQuantity(cards, (card) => normalizeText(card.name || '') === 'persistent petitioners');
  const controlCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    const name = String(card.name || '').toLowerCase();
    return text.includes('counter target')
      || text.includes('return target spell')
      || text.includes('destroy all creatures')
      || text.includes('exile all')
      || text.includes('tap all creatures')
      || text.includes('can\'t attack')
      || text.includes('can\'t cast')
      || name.includes('cyclonic rift');
  });
  const tokenCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return text.includes('create ') && text.includes(' token');
  });
  const landsCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    const name = String(card.name || '').toLowerCase();
    return text.includes('landfall')
      || text.includes('play an additional land')
      || text.includes('search your library for a land')
      || name.includes('scapeshift')
      || name.includes('crucible of worlds');
  });
  const reanimatorCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return includesAny(text, [
      'return target creature card from your graveyard',
      'return target permanent card from your graveyard',
      'put target creature card from a graveyard onto the battlefield',
      'reanimate',
      'from your graveyard to the battlefield'
    ]);
  });
  const aristocratsCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return (text.includes('sacrifice') && text.includes('creature'))
      || text.includes('whenever another creature dies')
      || text.includes('whenever a creature dies');
  });
  const enchantressCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return text.includes('whenever you cast an enchantment spell')
      || text.includes('whenever an enchantment enters')
      || text.includes('enchantment spells you cast');
  });
  const countersCount = sumDeckQuantity(cards, (card) => {
    const text = String(card.oracle_text || '').toLowerCase();
    return text.includes('+1/+1 counter')
      || text.includes('proliferate')
      || text.includes('double the number of each kind of counter');
  });

  const themeSet = new Set();
  if (millCount >= 8) themeSet.add('mill');
  if (petitionersCount >= 12) themeSet.add('petitioners');
  if (controlCount >= 8) themeSet.add('control');
  if (instantSorceryCount >= 24) themeSet.add('spellslinger');
  if (stormCount >= 3 || (instantSorceryCount >= 28 && stormCount >= 1)) themeSet.add('storm');
  if (burnCount >= 6) themeSet.add('burn');
  if (comboCount >= 5) themeSet.add('combo');
  if (artifactCount >= 18 || sumDeckQuantity(cards, (card) => String(card.oracle_text || '').toLowerCase().includes('artifact')) >= 8) {
    themeSet.add('artifacts');
  }
  if (tokenCount >= 8) themeSet.add('tokens');
  if (landCount >= 40 || landsCount >= 8) themeSet.add('lands');
  if (reanimatorCount >= 5) themeSet.add('reanimator');
  if (aristocratsCount >= 6) themeSet.add('aristocrats');
  if (enchantmentCount >= 14 || enchantressCount >= 4) themeSet.add('enchantress');
  if (countersCount >= 6) themeSet.add('counters');

  if (themeSet.size === 0) {
    if (instantSorceryCount >= Math.max(18, Math.floor(cardCount * 0.22))) themeSet.add('spellslinger');
    else if (artifactCount >= Math.max(14, Math.floor(cardCount * 0.18))) themeSet.add('artifacts');
    else if (enchantmentCount >= Math.max(12, Math.floor(cardCount * 0.16))) themeSet.add('enchantress');
    else if (controlCount >= 6) themeSet.add('control');
  }

  return [...themeSet];
}

function buildThemeSummary(decks) {
  const counts = new Map(COMMANDER_THEME_DEFINITIONS.map((theme) => [theme.slug, 0]));
  const totalDecks = decks.length;
  const minimumDeckCount = totalDecks >= 8 ? 2 : 1;

  for (const deck of decks) {
    for (const slug of inferDeckThemes(deck)) {
      counts.set(slug, (counts.get(slug) || 0) + 1);
    }
  }

  return COMMANDER_THEME_DEFINITIONS
    .map((theme) => ({
      ...theme,
      deck_count: Number(counts.get(theme.slug) || 0),
      prevalence: totalDecks > 0 ? Number(counts.get(theme.slug) || 0) / totalDecks : 0
    }))
    .filter((theme) => theme.deck_count >= minimumDeckCount)
    .sort((a, b) => {
      const aScore = (a.priority || 0) * 1000 + a.deck_count * 10 + a.prevalence;
      const bScore = (b.priority || 0) * 1000 + b.deck_count * 10 + b.prevalence;
      return bScore - aScore || b.deck_count - a.deck_count || a.label.localeCompare(b.label);
    })
    .slice(0, 4)
    .map(({ prevalence, priority, ...theme }) => theme);
}

function filterDecksByTheme(decks, activeTheme) {
  if (!activeTheme) return decks;
  return decks.filter((deck) => inferDeckThemes(deck).includes(activeTheme));
}

function getAllValidDeckRows() {
  return db.prepare(`
    SELECT
      deck_key,
      deck_name,
      source_name,
      source_url,
      commander_oracle_id
    FROM mtg_commander_corpus_decks
    WHERE ${VALID_CORPUS_DECK_SQL}
    ORDER BY imported_at DESC, deck_key ASC
  `).all();
}

function countDeckSignal(deckCards, predicate) {
  return deckCards.reduce((sum, card) => sum + (predicate(card) ? Number(card.quantity || 0) : 0), 0);
}

function buildDeckSnapshot(deck) {
  const cards = Array.isArray(deck?.cards) ? deck.cards : [];
  const totalCards = cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
  const uniqueCards = cards.length;
  const manaCurve = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
  let totalNonLandCmc = 0;
  let totalNonLandCards = 0;
  const colorIdentity = new Set();

  for (const card of cards) {
    const quantity = Number(card.quantity || 0);
    const typeLine = String(card.type_line || '').toLowerCase();
    for (const color of Array.isArray(card.color_identity) ? card.color_identity : []) {
      if (color) colorIdentity.add(String(color).toUpperCase());
    }
    if (!typeLine.includes('land')) {
      const manaValue = parseManaValue(card.mana_cost || '');
      if (manaValue !== null) {
        const bucket = Math.min(manaValue, 7);
        manaCurve[bucket] += quantity;
        totalNonLandCmc += manaValue * quantity;
        totalNonLandCards += quantity;
      }
    }
  }

  const features = {
    totalCards,
    uniqueCards,
    avgCmc: totalNonLandCards > 0 ? Number((totalNonLandCmc / totalNonLandCards).toFixed(2)) : 0,
    manaCurve,
    lands: countDeckSignal(cards, isLandCard),
    creatures: countDeckSignal(cards, (card) => getTypeLine(card).includes('creature')),
    instants: countDeckSignal(cards, (card) => getTypeLine(card).includes('instant')),
    sorceries: countDeckSignal(cards, (card) => getTypeLine(card).includes('sorcery')),
    artifacts: countDeckSignal(cards, (card) => getTypeLine(card).includes('artifact')),
    enchantments: countDeckSignal(cards, (card) => getTypeLine(card).includes('enchantment')),
    planeswalkers: countDeckSignal(cards, (card) => getTypeLine(card).includes('planeswalker')),
    lowCurve: countDeckSignal(cards, (card) => {
      if (isLandCard(card)) return false;
      const manaValue = parseManaValue(card.mana_cost || '');
      return manaValue !== null && manaValue <= 2;
    }),
    highCurve: countDeckSignal(cards, (card) => {
      if (isLandCard(card)) return false;
      const manaValue = parseManaValue(card.mana_cost || '');
      return manaValue !== null && manaValue >= 5;
    }),
    ramp: countDeckSignal(cards, isRampCard),
    cardDraw: countDeckSignal(cards, isDrawCard),
    removal: countDeckSignal(cards, isRemovalCard),
    sweepers: countDeckSignal(cards, isSweeperCard),
    counters: countDeckSignal(cards, isCounterCard),
    tutors: countDeckSignal(cards, (card) => getOracleText(card).includes('search your library')),
    protection: countDeckSignal(cards, isProtectionCard),
    graveyardRecursion: countDeckSignal(cards, isGraveyardRecursionCard),
    graveyardHate: countDeckSignal(cards, isGraveyardHateCard),
    lifegain: countDeckSignal(cards, isLifegainCard),
    artifactHate: countDeckSignal(cards, isArtifactHateCard),
    enchantmentHate: countDeckSignal(cards, isEnchantmentHateCard),
    cheapInteraction: countDeckSignal(cards, isCheapInteractionCard),
    sustainedDraw: countDeckSignal(cards, isSustainedDrawCard),
    themes: inferDeckThemes(deck),
    colorIdentity: [...colorIdentity]
  };

  features.goldfish = buildGoldfishReport(deck);

  return features;
}

function averageNumeric(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function buildThemeGauntlet(decks, theme) {
  const themedDecks = decks.filter((deck) => inferDeckThemes(deck).includes(theme.slug));
  if (themedDecks.length < 8) return null;

  const snapshots = themedDecks.map(buildDeckSnapshot);
  const commanderRows = buildTopCommanderRows(themedDecks).slice(0, 3);
  const cardCounts = new Map();

  for (const deck of themedDecks) {
    const seen = new Set();
    for (const card of deck.cards) {
      const oracleId = String(card.card_oracle_id || '').trim();
      if (!oracleId || seen.has(oracleId)) continue;
      seen.add(oracleId);
      cardCounts.set(oracleId, (cardCounts.get(oracleId) || 0) + 1);
    }
  }

  const commonCards = [...cardCounts.entries()]
    .map(([oracleId, deckCount]) => {
      const card = getCardLookup().get(oracleId);
      if (!card) return null;
      return {
        oracle_id: oracleId,
        name: card.name,
        image_url: card.image_url || null,
        deck_count: deckCount
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.deck_count - a.deck_count || a.name.localeCompare(b.name))
    .slice(0, 6);

  return {
    slug: theme.slug,
    label: theme.label,
    deck_count: themedDecks.length,
    sample_commanders: commanderRows.map((row) => row.name),
    average: {
      avgCmc: Number(averageNumeric(snapshots.map((item) => item.avgCmc)).toFixed(2)),
      lands: Number(averageNumeric(snapshots.map((item) => item.lands)).toFixed(1)),
      lowCurve: Number(averageNumeric(snapshots.map((item) => item.lowCurve)).toFixed(1)),
      highCurve: Number(averageNumeric(snapshots.map((item) => item.highCurve)).toFixed(1)),
      cardDraw: Number(averageNumeric(snapshots.map((item) => item.cardDraw)).toFixed(1)),
      ramp: Number(averageNumeric(snapshots.map((item) => item.ramp)).toFixed(1)),
      removal: Number(averageNumeric(snapshots.map((item) => item.removal)).toFixed(1)),
      sweepers: Number(averageNumeric(snapshots.map((item) => item.sweepers)).toFixed(1)),
      counters: Number(averageNumeric(snapshots.map((item) => item.counters)).toFixed(1)),
      protection: Number(averageNumeric(snapshots.map((item) => item.protection)).toFixed(1))
    },
    common_cards: commonCards
  };
}

function getSimulationGauntlets() {
  if (simulationGauntletCache) return simulationGauntletCache;

  const allDecks = buildDeckCorpusFromRows(getAllValidDeckRows());
  simulationGauntletCache = COMMANDER_THEME_DEFINITIONS
    .map((theme) => buildThemeGauntlet(allDecks, theme))
    .filter(Boolean)
    .sort((a, b) => b.deck_count - a.deck_count || a.label.localeCompare(b.label));

  return simulationGauntletCache;
}

function addUniqueNote(list, message, limit = 2) {
  if (!message) return;
  if (list.includes(message)) return;
  if (list.length >= limit) return;
  list.push(message);
}

function scoreMatchup(snapshot, gauntlet) {
  let score = 50;
  const risks = [];
  const priorities = [];
  const avg = gauntlet.average || {};
  const goldfish = snapshot.goldfish || {};
  let headline = '';
  let focus = '';

  const pressureTurnBase = {
    combo: 8,
    burn: 8,
    storm: 8,
    spellslinger: 9,
    tokens: 10,
    petitioners: 10,
    aristocrats: 10,
    counters: 10,
    artifacts: 10,
    reanimator: 10,
    mill: 11,
    enchantress: 11,
    lands: 12,
    control: 12
  };
  const pressureTurn = pressureTurnBase[gauntlet.slug] || 10;

  if ((goldfish.keepRate || 0) < 72) {
    score -= 4;
    addUniqueNote(risks, 'Your opening hands are shakier than you want for a long Commander game.');
    addUniqueNote(priorities, 'Clean up the opening hands with a smoother mana base or lower curve.');
  }

  if ((goldfish.missThirdLandRate || 0) >= 18) {
    score -= 5;
    addUniqueNote(risks, 'You miss the third land drop too often, which slows your setup.');
    addUniqueNote(priorities, 'Add another land or a cheap piece of ramp.');
  }

  if ((goldfish.avgInteractionTurn || 11) > pressureTurn - 2) {
    score -= 4;
    addUniqueNote(risks, `Your first live interaction usually shows up around turn ${goldfish.avgInteractionTurn}, which is late here.`);
    addUniqueNote(priorities, 'Add cheaper interaction so you can affect the game earlier.');
  }

  if ((goldfish.avgCommanderTurn || 11) > pressureTurn) {
    score -= 4;
    addUniqueNote(risks, `Your commander usually lands around turn ${goldfish.avgCommanderTurn}, after this matchup is already applying pressure.`);
  }

  if (snapshot.cardDraw >= avg.cardDraw) {
    score += 4;
  } else {
    score -= 4;
    addUniqueNote(risks, 'You are light on sustained card draw.');
    addUniqueNote(priorities, 'Add more repeatable card draw.');
  }

  if (snapshot.avgCmc <= avg.avgCmc + 0.15) {
    score += 3;
  } else {
    score -= 4;
    addUniqueNote(risks, 'You are a little slow into this matchup.');
  }

  if (snapshot.ramp >= avg.ramp) {
    score += 2;
  } else if (snapshot.avgCmc >= 3.5) {
    score -= 3;
    addUniqueNote(priorities, 'Add another cheap ramp piece.');
  }

  switch (gauntlet.slug) {
    case 'mill':
      if (snapshot.graveyardRecursion > 0 || snapshot.graveyardHate > 0) {
        score += 8;
        headline = 'You have some insulation against mill pressure.';
      } else {
        score -= 8;
        headline = 'Mill decks can pressure your library faster than you can stabilize.';
        addUniqueNote(risks, 'You do not have much insulation against mill.');
        addUniqueNote(priorities, 'Add graveyard recursion or reshuffle effects.');
      }
      break;
    case 'control':
      if (snapshot.protection >= 2 || snapshot.tutors >= 2) {
        score += 6;
        headline = 'You have enough resilience to keep playing through answers.';
      } else {
        score -= 5;
        headline = 'Control decks can pick apart your first real threat.';
        addUniqueNote(risks, 'Control can trade you down if your first wave gets answered.');
        addUniqueNote(priorities, 'Add resilient threats or protection.');
      }
      break;
    case 'combo':
      if (snapshot.counters + snapshot.removal >= 8) {
        score += 8;
        headline = 'You have enough interaction to make combo work for it.';
      } else {
        score -= 9;
        headline = 'Fast combo decks can slip under you.';
        addUniqueNote(risks, 'Fast combo can get under you.');
        addUniqueNote(priorities, 'Add cheap counters or instant-speed disruption.');
      }
      break;
    case 'tokens':
    case 'petitioners':
      if (snapshot.sweepers >= 2) {
        score += 8;
        headline = 'You have sweepers to punish decks that flood the board.';
      } else {
        score -= 7;
        headline = 'Creature-heavy decks can bury you if you do not clear the board.';
        addUniqueNote(risks, 'You do not have enough ways to reset a crowded board.');
        addUniqueNote(priorities, 'Add a board wipe or anti-swarm interaction.');
      }
      break;
    case 'burn':
      if (snapshot.lifegain >= 2) {
        score += 7;
        headline = 'You have at least a little cushion against burn reach.';
      } else {
        score -= 5;
        headline = 'Burn can race you if you spend too long setting up.';
        addUniqueNote(risks, 'Burn can race you if you stumble.');
        addUniqueNote(priorities, 'Add lifegain or faster stabilization.');
      }
      break;
    case 'reanimator':
    case 'aristocrats':
      if (snapshot.graveyardHate >= 2) {
        score += 7;
        headline = 'You already have tools to check graveyard loops.';
      } else {
        score -= 6;
        headline = 'Graveyard decks can keep coming back if you only answer the first wave.';
        addUniqueNote(risks, 'Graveyard engines can keep reusing threats against you.');
        addUniqueNote(priorities, 'Add graveyard hate or exile-based removal.');
      }
      break;
    case 'artifacts':
      if (snapshot.artifactHate >= 2) {
        score += 6;
        headline = 'You do have real artifact interaction.';
      } else {
        score -= 5;
        headline = 'Artifact mana and engines can snowball on you.';
        addUniqueNote(risks, 'Artifact engines may outscale you.');
        addUniqueNote(priorities, 'Add artifact removal.');
      }
      break;
    case 'enchantress':
      if (snapshot.enchantmentHate >= 2) {
        score += 6;
        headline = 'You can break up enchantment engines if you see them early.';
      } else {
        score -= 5;
        headline = 'Enchantress boards can snowball if you do not answer engines.';
        addUniqueNote(risks, 'Enchantment engines may snowball on you.');
        addUniqueNote(priorities, 'Add enchantment removal.');
      }
      break;
    case 'spellslinger':
    case 'storm':
      if (snapshot.counters >= 4) {
        score += 6;
        headline = 'You have enough stack interaction to fight on their turn.';
      } else {
        score -= 6;
        headline = 'Spell-heavy decks can force through a big turn before you can slow them down.';
        addUniqueNote(risks, 'You are a little light on stack interaction for this matchup.');
        addUniqueNote(priorities, 'Add cheap counters or instant-speed interaction.');
      }
      break;
    case 'lands':
      if (snapshot.lowCurve >= avg.lowCurve) {
        score += 4;
        headline = 'You can pressure slower land-ramp starts.';
      } else {
        score -= 3;
        headline = 'Ramp decks may get too many free setup turns.';
        addUniqueNote(risks, 'You may give ramp decks too much setup time.');
        addUniqueNote(priorities, 'Lower the curve or add faster pressure.');
      }
      break;
    case 'counters':
      headline = 'Counter-based creature decks will test how quickly you can answer board growth.';
      addUniqueNote(priorities, 'Keep efficient removal ready for snowball creatures.');
      break;
    default:
      headline = snapshot.avgCmc <= avg.avgCmc ? 'Your pacing looks fine here.' : 'This matchup gets tougher if you stumble on tempo.';
      break;
  }

  const boundedScore = Math.max(20, Math.min(80, Math.round(score)));
  const wins = Math.round((boundedScore / 100) * 12);
  const losses = Math.max(0, 12 - wins);
  const avgTurnBase = {
    combo: 9,
    burn: 9,
    storm: 9,
    spellslinger: 10,
    tokens: 11,
    petitioners: 11,
    control: 13,
    mill: 11,
    aristocrats: 11,
    reanimator: 11,
    lands: 13,
    artifacts: 11,
    enchantress: 12,
    counters: 11
  };
  const paceDrag = clampNumber(((goldfish.avgCommanderTurn || 5) - 4.5) * 0.7, -1, 2);
  const interactionDrag = clampNumber(((goldfish.avgInteractionTurn || 4) - 3.5) * 0.5, -1, 2);
  const avgTurns = Math.round(clampNumber((avgTurnBase[gauntlet.slug] || 11) + paceDrag + interactionDrag + ((100 - boundedScore) / 100), 8, 15));
  focus = priorities[0] || risks[0] || '';

  return {
    slug: gauntlet.slug,
    label: gauntlet.label,
    archetypeDescription: `${gauntlet.deck_count} similar decks. Common commanders: ${gauntlet.sample_commanders.slice(0, 2).join(', ') || 'mixed field'}.`,
    winRate: boundedScore,
    wins,
    losses,
    avgTurns,
    headline,
    focus,
    whyItLoses: risks[0] || '',
    risks: [...new Set(risks)].slice(0, 2),
    priorities: [...new Set(priorities)].slice(0, 2),
    pressureCards: gauntlet.common_cards.slice(0, 4)
  };
}

function buildSimulationDeck(inputDeck) {
  const items = Array.isArray(inputDeck?.items) ? inputDeck.items : [];
  const byName = getCardLookupByNormalizedName();
  const cards = items
    .map((item) => {
      const quantity = Math.max(0, Number(item.quantity || 0));
      if (!quantity) return null;
      const name = String(item.product_name || item.name || '').trim();
      const meta = byName.get(normalizeText(name)) || null;
      return {
        quantity,
        name: meta?.name || name,
        card_oracle_id: meta?.oracle_id || String(item.oracle_id || '').trim() || '',
        type_line: meta?.type_line || item.type || item.type_line || '',
        oracle_text: meta?.oracle_text || item.oracle_text || '',
        mana_cost: meta?.mana_cost || item.mana_cost || '',
        color_identity: meta?.color_identity || [],
        is_commander: Boolean(item.is_commander)
      };
    })
    .filter(Boolean);

  return {
    deck_key: 'uploaded-deck',
    deck_name: String(inputDeck?.name || 'Imported Deck').trim() || 'Imported Deck',
    cards
  };
}

function buildCommanderSuggestions(commanderOracleId, snapshot, deckCardNames) {
  if (!commanderOracleId) return [];
  const page = getMtgCommanderPage(commanderOracleId);
  if (!page?.has_local_data) return [];
  const cardLookup = getCardLookup();

  const recommendationPool = [
    ...(Array.isArray(page.top_synergy_cards) ? page.top_synergy_cards : []),
    ...(Array.isArray(page.new_cards) ? page.new_cards : []),
    ...(Array.isArray(page.game_changers) ? page.game_changers : [])
  ];

  return recommendationPool
    .filter((card) => {
      const key = normalizeText(card.card_name || '');
      return key && !deckCardNames.has(key);
    })
    .reduce((acc, card) => {
      if (acc.some((entry) => entry.oracle_id === card.oracle_id)) return acc;
      const meta = cardLookup.get(card.oracle_id) || null;
      const synergyScore = Number(card.synergy_score || 0);
      acc.push({
        oracle_id: card.oracle_id,
        name: card.card_name,
        image_url: card.image_url || meta?.image_url || null,
        mana_cost: meta?.mana_cost || '',
        type_line: meta?.type_line || '',
        oracle_text: meta?.oracle_text || '',
        synergy: synergyScore || null,
        recommendation_label: synergyScore >= 0.9 ? 'Very high fit' : synergyScore >= 0.75 ? 'Strong fit' : 'Worth testing',
        reason: 'Recommended from similar commander decks'
      });
      return acc;
    }, [])
    .slice(0, 6);
}

export function simulateMtgDeckGauntlet(inputDeck) {
  const simulationDeck = buildSimulationDeck(inputDeck);
  const snapshot = buildDeckSnapshot(simulationDeck);
  const gauntlets = getSimulationGauntlets().slice(0, 8);
  const matchups = gauntlets.map((gauntlet) => scoreMatchup(snapshot, gauntlet));
  const sortedMatchups = [...matchups].sort((a, b) => a.winRate - b.winRate || a.label.localeCompare(b.label));
  const commanderItem = (Array.isArray(inputDeck?.items) ? inputDeck.items : []).find((item) => item.is_commander);
  const commanderMeta = commanderItem ? getCardLookupByNormalizedName().get(normalizeText(commanderItem.product_name || '')) : null;
  const deckCardNames = new Set(simulationDeck.cards.map((card) => normalizeText(card.name || '')));
  const suggestions = buildCommanderSuggestions(commanderMeta?.oracle_id || '', snapshot, deckCardNames);
  const risks = [...new Set(sortedMatchups.flatMap((matchup) => matchup.risks))].slice(0, 4);
  const priorities = [...new Set(sortedMatchups.flatMap((matchup) => matchup.priorities))].slice(0, 4);
  const overallWinRate = Math.round(averageNumeric(matchups.map((matchup) => matchup.winRate)));
  const weakest = sortedMatchups.slice(0, 2).map((matchup) => matchup.label);
  const strongest = [...matchups].sort((a, b) => b.winRate - a.winRate).slice(0, 2).map((matchup) => matchup.label);
  const validatedDeckCount = Number(countCorpusDecksStmt.get()?.count || 0);

  return {
    deck_name: simulationDeck.deck_name,
    commander_name: commanderMeta?.name || commanderItem?.product_name || '',
    corpus_decks_analyzed: validatedDeckCount,
    overall_win_rate: overallWinRate,
    num_games: 12,
    deck_stats: {
      totalCards: snapshot.totalCards,
      uniqueCards: snapshot.uniqueCards,
      lands: snapshot.lands,
      creatures: snapshot.creatures,
      spells: snapshot.instants + snapshot.sorceries + snapshot.artifacts + snapshot.enchantments,
      avgCmc: snapshot.avgCmc,
      manaCurve: snapshot.manaCurve,
      themes: snapshot.themes,
      colorIdentity: snapshot.colorIdentity,
      goldfish: snapshot.goldfish
    },
    results: Object.fromEntries(matchups.map((matchup) => [matchup.slug, matchup])),
    summary: {
      risks,
      priorities,
      strongest_matchups: strongest,
      weakest_matchups: weakest,
      diagnostics: [
        snapshot.goldfish?.avgCommanderTurn ? `Commander usually lands around turn ${snapshot.goldfish.avgCommanderTurn}.` : '',
        snapshot.goldfish?.avgInteractionTurn ? `First cheap interaction usually shows up around turn ${snapshot.goldfish.avgInteractionTurn}.` : '',
        snapshot.goldfish?.missThirdLandRate ? `You miss the third land drop in about ${snapshot.goldfish.missThirdLandRate}% of goldfish hands.` : '',
        snapshot.goldfish?.keepRate ? `Keepable opening hands: ${snapshot.goldfish.keepRate}%.` : ''
      ].filter(Boolean)
    },
    suggested_cards: suggestions,
    analysis: [
      `This gauntlet used ${gauntlets.length} matchup archetypes built from ${validatedDeckCount} validated commander decks.`,
      strongest.length ? `Best projected matchups: ${strongest.join(', ')}.` : '',
      weakest.length ? `Most stressed matchups: ${weakest.join(', ')}.` : '',
      priorities.length ? `Best next upgrades: ${priorities.join(' ')}` : ''
    ].filter(Boolean).join('\n\n')
  };
}

function warmSimulationGauntletsSoon() {
  if (simulationGauntletCache) return;
  setTimeout(() => {
    try {
      getSimulationGauntlets();
    } catch (error) {
      console.warn('Failed to prewarm MTG simulation gauntlets:', error?.message || error);
    }
  }, 0);
}

function buildSliceStats(commanderRow, decks, totalGlobalDecks, globalCardCounts) {
  if (!decks.length) {
    return [];
  }

  const cardLookup = getCardLookup();
  const frequency = new Map();

  for (const deck of decks) {
    const seen = new Set();
    for (const card of deck.cards) {
      if (!card.card_oracle_id || seen.has(card.card_oracle_id)) continue;
      seen.add(card.card_oracle_id);
      if (!frequency.has(card.card_oracle_id)) {
        frequency.set(card.card_oracle_id, { deck_count: 0 });
      }
      frequency.get(card.card_oracle_id).deck_count += 1;
    }
  }

  return [...frequency.entries()]
    .map(([cardOracleId, value]) => {
      const cardMeta = cardLookup.get(cardOracleId);
      if (!cardMeta) return null;

      const deckCount = Number(value.deck_count || 0);
      const totalDecks = decks.length;
      const inclusionRate = totalDecks > 0 ? deckCount / totalDecks : 0;
      const globalDeckCount = Number(globalCardCounts.get(cardOracleId) || 0);
      const globalInclusionRate = totalGlobalDecks > 0 ? globalDeckCount / totalGlobalDecks : 0;
      const synergyScore = inclusionRate - globalInclusionRate;
      const confidenceScore = Math.tanh(deckCount / 20);
      const weightedScore = synergyScore * confidenceScore;
      const category = categorizeCard(cardMeta.type_line, cardMeta.oracle_text);

      return {
        commander_oracle_id: commanderRow.oracle_id,
        commander_name: commanderRow.name,
        card_oracle_id: cardOracleId,
        card_name: cardMeta.name,
        card_name_lower: normalizeText(cardMeta.name),
        image_url: cardMeta.image_url || null,
        mana_cost: cardMeta.mana_cost || '',
        type_line: cardMeta.type_line || '',
        oracle_text: cardMeta.oracle_text || '',
        color_identity_json: JSON.stringify(cardMeta.color_identity || []),
        deck_count: deckCount,
        total_commander_decks: totalDecks,
        inclusion_rate: inclusionRate,
        global_deck_count: globalDeckCount,
        total_global_decks: totalGlobalDecks,
        global_inclusion_rate: globalInclusionRate,
        synergy_score: synergyScore,
        confidence_score: confidenceScore,
        weighted_score: weightedScore,
        category,
        released_at: cardMeta.released_at || null
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.weighted_score || 0) - Number(a.weighted_score || 0));
}

function buildAverageDeckProfileFromDecks(decks) {
  if (!decks.length) {
    return {
      total_decks: 0,
      average_cards: 0,
      type_distribution: [],
      mana_curve: []
    };
  }

  const typeTotals = new Map();
  const manaTotals = new Map();
  let totalCards = 0;

  for (const deck of decks) {
    for (const card of deck.cards) {
      const quantity = Number(card.quantity || 0);
      if (quantity <= 0) continue;

      const typeLabel = classifyDeckType(card.type_line || '');
      typeTotals.set(typeLabel, (typeTotals.get(typeLabel) || 0) + quantity);
      totalCards += quantity;

      if (typeLabel === 'Land') continue;
      const manaValue = parseManaValue(card.mana_cost || '');
      if (manaValue === null) continue;
      const bucket = Math.min(manaValue, 7);
      manaTotals.set(bucket, (manaTotals.get(bucket) || 0) + quantity);
    }
  }

  const deckCount = decks.length;
  const typeOrder = ['Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'];
  const typeDistribution = typeOrder
    .filter((label) => typeTotals.has(label))
    .map((label) => ({
      name: label,
      total_quantity: Number(typeTotals.get(label) || 0),
      average_count: Number(((typeTotals.get(label) || 0) / deckCount).toFixed(1))
    }))
    .filter((entry) => entry.average_count > 0);

  const manaCurve = Array.from({ length: 8 }, (_, index) => ({
    mana: index === 7 ? '7+' : String(index),
    bucket: index,
    total_quantity: Number(manaTotals.get(index) || 0),
    average_count: Number(((manaTotals.get(index) || 0) / deckCount).toFixed(1))
  }));

  return {
    total_decks: deckCount,
    average_cards: Number((totalCards / deckCount).toFixed(1)),
    type_distribution: typeDistribution,
    mana_curve: manaCurve
  };
}

function buildAverageDeckSections(statRows, averageDeckProfile) {
  const pluralLabel = {
    Creature: 'Creatures',
    Instant: 'Instants',
    Sorcery: 'Sorceries',
    Artifact: 'Artifacts',
    Enchantment: 'Enchantments',
    Planeswalker: 'Planeswalkers',
    Land: 'Lands',
    Battle: 'Battles'
  };
  const targetCounts = new Map(
    (averageDeckProfile?.type_distribution || []).map((entry) => [entry.name, Math.max(1, Math.round(entry.average_count || 0))])
  );
  const grouped = new Map();

  for (const row of statRows) {
    const card = mapStatRow(row);
    const typeLabel = classifyDeckType(card.type_line || '');
    if (!grouped.has(typeLabel)) {
      grouped.set(typeLabel, []);
    }
    grouped.get(typeLabel).push(card);
  }

  const order = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land', 'Battle'];
  return order
    .filter((typeLabel) => grouped.has(typeLabel))
    .map((typeLabel) => ({
      type: typeLabel,
      label: pluralLabel[typeLabel] || `${typeLabel}s`,
      target_count: Number(targetCounts.get(typeLabel) || grouped.get(typeLabel).length),
      cards: grouped.get(typeLabel).slice(0, Math.max(8, Number(targetCounts.get(typeLabel) || 0)))
    }));
}

function buildDeckModeRows(decks) {
  return decks
    .map((deck) => {
      const cardCount = deck.cards.reduce((sum, card) => sum + Number(card.quantity || 0), 0);
      const sampleCards = [...deck.cards]
        .sort((a, b) => {
          const aType = classifyDeckType(a.type_line || '');
          const bType = classifyDeckType(b.type_line || '');
          if (aType !== bType) return aType.localeCompare(bType);
          return String(a.name || '').localeCompare(String(b.name || ''));
        })
        .slice(0, 8)
        .map((card) => ({
          oracle_id: card.card_oracle_id,
          card_name: card.name,
          image_url: card.image_url || null,
          mana_cost: card.mana_cost || '',
          type_line: card.type_line || '',
          quantity: Number(card.quantity || 1)
        }));

      return {
        deck_key: deck.deck_key,
        deck_name: deck.deck_name || 'Untitled Deck',
        source_name: deck.source_name || '',
        source_url: deck.source_url || '',
        card_count: cardCount,
        themes: inferDeckThemes(deck),
        sample_cards: sampleCards
      };
    })
    .sort((a, b) => b.card_count - a.card_count || a.deck_name.localeCompare(b.deck_name))
    .slice(0, 24);
}

function buildTopCommanderRows(decks) {
  const grouped = new Map();

  for (const deck of decks) {
    const commanderOracleId = String(deck.commander_oracle_id || '').trim();
    if (!commanderOracleId) continue;
    if (!grouped.has(commanderOracleId)) {
      grouped.set(commanderOracleId, 0);
    }
    grouped.set(commanderOracleId, grouped.get(commanderOracleId) + 1);
  }

  return [...grouped.entries()]
    .map(([commanderOracleId, deckCount]) => {
      const commanderRow = selectCommanderRow(commanderOracleId);
      if (!commanderRow) return null;
      return {
        ...mapCommanderRow(commanderRow),
        deck_count: Number(deckCount || 0)
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.deck_count - a.deck_count || a.name.localeCompare(b.name))
    .slice(0, 18);
}

export function getMtgCommanderPage(oracleId, options = {}) {
  const commanderRow = selectCommanderRow(oracleId);
  if (!commanderRow) {
    return null;
  }

  const activeMode = String(options.mode || 'commander').toLowerCase();
  const requestedTheme = normalizeText(options.theme || '').replace(/\s+/g, '-');
  const totalGlobalDecks = Number(countCorpusDecksStmt.get()?.count || 0);
  const baseDecks = activeMode === 'card' ? buildCardDeckCorpus(oracleId) : buildDeckCorpus(oracleId);
  const themeOptions = buildThemeSummary(baseDecks);
  const activeTheme = themeOptions.some((theme) => theme.slug === requestedTheme) ? requestedTheme : '';
  const slicedDecks = filterDecksByTheme(baseDecks, activeTheme);
  const statRows = activeMode === 'card'
    ? buildSliceStats(commanderRow, slicedDecks, totalGlobalDecks, getGlobalCardCounts())
      .filter((row) => row.card_oracle_id !== oracleId)
    : activeTheme
      ? buildSliceStats(commanderRow, slicedDecks, totalGlobalDecks, getGlobalCardCounts())
      : selectCommanderStats(oracleId);
  const commander = mapCommanderRow(commanderRow);
  const totalDecks = activeMode === 'card'
    ? slicedDecks.length
    : activeTheme
      ? slicedDecks.length
      : Number(statRows[0]?.total_commander_decks || commander.deck_count || 0);
  const hasLocalData = statRows.length > 0 && totalDecks > 0;
  const topCommanders = activeMode === 'card' && totalDecks > 0 ? buildTopCommanderRows(slicedDecks) : [];

  const topSynergyCards = hasLocalData ? buildTopSynergy(statRows) : [];
  const newCards = hasLocalData ? buildNewCards(statRows) : [];
  const gameChangers = hasLocalData ? buildGameChangers(statRows, totalDecks) : [];
  const categories = hasLocalData ? buildCategorySections(statRows) : [];
  const relatedCommanders = hasLocalData && activeMode !== 'card' ? buildRelatedCommanders(commanderRow, statRows) : [];
  const averageDeckProfile = hasLocalData ? (
    activeMode === 'card' || activeTheme ? buildAverageDeckProfileFromDecks(slicedDecks) : buildAverageDeckProfile(oracleId)
  ) : {
    total_decks: 0,
    average_cards: 0,
    type_distribution: [],
    mana_curve: []
  };
  const averageDeckSections = hasLocalData ? buildAverageDeckSections(statRows, averageDeckProfile) : [];
  const deckRows = hasLocalData ? buildDeckModeRows(activeTheme ? slicedDecks : baseDecks) : [];

  return {
    has_local_data: hasLocalData,
    active_mode: activeMode,
    active_theme: activeTheme,
    theme_options: themeOptions,
    commander,
    total_decks: totalDecks,
    top_commanders: topCommanders,
    average_deck_profile: averageDeckProfile,
    average_deck_sections: averageDeckSections,
    deck_rows: deckRows,
    top_synergy_cards: topSynergyCards,
    new_cards: newCards,
    game_changers: gameChangers,
    categories,
    related_commanders: relatedCommanders
  };
}
