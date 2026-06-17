import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const fabCardsPath = path.join(process.cwd(), 'public', 'data', 'fab', 'cards.json');
const fabSetsPath = path.join(process.cwd(), 'public', 'data', 'fab', 'sets.json');
const fabImagesDir = path.join(process.cwd(), 'public', 'data', 'fab', 'images');
const INDEX_VERSION = 1;

const FAB_RARITY_MAP = {
  C: 'Common',
  R: 'Rare',
  S: 'Super Rare',
  M: 'Majestic',
  L: 'Legendary',
  F: 'Fabled',
  P: 'Promo',
  T: 'Token'
};

let ensurePromise = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function pathExtension(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function getPrimaryPrinting(card) {
  return Array.isArray(card?.printings) ? card.printings.find((printing) => printing?.image_url) || card.printings[0] : null;
}

function getFabRarityLabel(rarityCode) {
  return FAB_RARITY_MAP[String(rarityCode || '').toUpperCase()] || String(rarityCode || '');
}

function getLocalFabImageUrl(card) {
  const primaryPrinting = getPrimaryPrinting(card);
  const sourceUrl = primaryPrinting?.image_url;
  if (!sourceUrl) return null;

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card?.unique_id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const diskPath = path.join(fabImagesDir, prefix, `${encodeURIComponent(cardId)}${extension}`);

  if (!fs.existsSync(diskPath)) return null;
  try {
    if (fs.statSync(diskPath).size === 0) return null;
  } catch {
    return null;
  }

  return `/data/fab/images/${prefix}/${encodeURIComponent(cardId)}${extension}`;
}

function buildSetsByCode() {
  const sets = readJson(fabSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.code || ''), set]));
}

function mapCardRecord(card, setsByCode) {
  const primaryPrinting = getPrimaryPrinting(card);
  const setCode = String(primaryPrinting?.set_id || '');
  const setMeta = setsByCode.get(setCode) || null;
  const types = Array.isArray(card?.types) ? card.types.filter(Boolean) : [];
  const traits = Array.isArray(card?.traits) ? card.traits.filter(Boolean) : [];
  const keywords = Array.isArray(card?.card_keywords) ? card.card_keywords.filter(Boolean) : [];
  const imageUrl = getLocalFabImageUrl(card);

  return {
    id: String(card.unique_id || ''),
    name: String(card.name || ''),
    name_normalized: normalizeText(card.name || ''),
    search_text: normalizeText([
      card.name,
      card.color,
      card.pitch,
      card.type_text,
      card.functional_text_plain || card.functional_text,
      setCode,
      setMeta?.name,
      getFabRarityLabel(primaryPrinting?.rarity),
      ...types,
      ...traits,
      ...keywords
    ].filter(Boolean).join(' ')),
    text_body: normalizeText(card.functional_text_plain || card.functional_text || ''),
    set_code: setCode,
    set_name: String(setMeta?.name || setCode),
    set_search: normalizeText(`${setMeta?.name || ''} ${setCode}`),
    card_number: String(primaryPrinting?.id || card.unique_id || ''),
    rarity: getFabRarityLabel(primaryPrinting?.rarity),
    rarity_normalized: normalizeText(getFabRarityLabel(primaryPrinting?.rarity)),
    color: String(card.color || ''),
    color_normalized: normalizeText(card.color || ''),
    pitch: Number.isFinite(Number(card.pitch)) ? Number(card.pitch) : null,
    cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : null,
    power: Number.isFinite(Number(card.power)) ? Number(card.power) : null,
    defense: Number.isFinite(Number(card.defense)) ? Number(card.defense) : null,
    health: Number.isFinite(Number(card.health)) ? Number(card.health) : null,
    intelligence: Number.isFinite(Number(card.intelligence)) ? Number(card.intelligence) : null,
    arcane: Number.isFinite(Number(card.arcane)) ? Number(card.arcane) : null,
    type_text: String(card.type_text || ''),
    type_text_normalized: normalizeText(card.type_text || ''),
    types_json: JSON.stringify(types),
    types_search: normalizeText(types.join(' ')),
    traits_json: JSON.stringify(traits),
    traits_search: normalizeText(traits.join(' ')),
    keywords_json: JSON.stringify(keywords),
    keywords_search: normalizeText(keywords.join(' ')),
    image_url: imageUrl,
    has_image: imageUrl ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS fab_search_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      text_body TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      set_search TEXT NOT NULL,
      card_number TEXT,
      rarity TEXT,
      rarity_normalized TEXT,
      color TEXT,
      color_normalized TEXT,
      pitch REAL,
      cost REAL,
      power REAL,
      defense REAL,
      health REAL,
      intelligence REAL,
      arcane REAL,
      type_text TEXT,
      type_text_normalized TEXT,
      types_json TEXT NOT NULL,
      types_search TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      traits_search TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      keywords_search TEXT NOT NULL,
      image_url TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_fab_search_name ON fab_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_fab_search_text ON fab_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_fab_search_color ON fab_search_cards (color_normalized);
    CREATE INDEX IF NOT EXISTS idx_fab_search_rarity ON fab_search_cards (rarity_normalized);
    CREATE TABLE IF NOT EXISTS fab_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM fab_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO fab_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM fab_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM fab_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO fab_search_cards (
    id, name, name_normalized, search_text, text_body, set_code, set_name, set_search,
    card_number, rarity, rarity_normalized, color, color_normalized, pitch, cost, power,
    defense, health, intelligence, arcane, type_text, type_text_normalized, types_json,
    types_search, traits_json, traits_search, keywords_json, keywords_search, image_url, has_image
  ) VALUES (
    @id, @name, @name_normalized, @search_text, @text_body, @set_code, @set_name, @set_search,
    @card_number, @rarity, @rarity_normalized, @color, @color_normalized, @pitch, @cost, @power,
    @defense, @health, @intelligence, @arcane, @type_text, @type_text_normalized, @types_json,
    @types_search, @traits_json, @traits_search, @keywords_json, @keywords_search, @image_url, @has_image
  )
`);

function rebuildIndex() {
  const cards = readJson(fabCardsPath, []);
  const setsByCode = buildSetsByCode();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsByCode))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) insertStmt.run(row);
    writeMetaStmt.run('fab_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('fab_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensureFabSearchIndex() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('fab_search_index_version')?.value || 0);
    const rowCount = Number(countRowsStmt.get()?.count || 0);
    if (version !== INDEX_VERSION || rowCount === 0) rebuildIndex();
  });
  return ensurePromise;
}

function mapRow(row) {
  return {
    id: row.id,
    api_id: row.id,
    name: row.name || '',
    set_name: row.set_name || '',
    set_code: row.set_code || 'FAB',
    card_number: row.card_number || '',
    rarity: row.rarity || '',
    image_url: row.image_url || null,
    price: null,
    type: row.type_text || '',
    game: 'flesh_and_blood',
    color: row.color || '',
    pitch: row.pitch,
    cost: row.cost,
    power: row.power,
    defense: row.defense
  };
}

export function searchFabIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM fab_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY set_code ASC, card_number ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) return exactRows.map(mapRow);

  const stmt = db.prepare(`
    SELECT *
    FROM fab_search_cards
    WHERE has_image = 1
      AND (
        name_normalized LIKE @contains
        OR search_text LIKE @contains
        OR set_search LIKE @contains
      )
    ORDER BY
      CASE
        WHEN name_normalized = @exact THEN 0
        WHEN name_normalized LIKE @startsWith THEN 1
        WHEN search_text LIKE @startsWith THEN 2
        WHEN search_text LIKE @contains THEN 3
        ELSE 4
      END,
      set_code ASC,
      card_number ASC
    LIMIT @limit
  `);

  return stmt.all({ exact, startsWith, contains, limit: safeLimit }).map(mapRow);
}

function buildMatchClauses(filters = {}) {
  const clauses = ['has_image = 1'];
  const params = {};
  let index = 0;

  const addContains = (column, value) => {
    if (!value) return;
    index += 1;
    params[`p${index}`] = `%${normalizeText(value)}%`;
    clauses.push(`${column} LIKE @p${index}`);
  };

  const addNumeric = (column, value, op = '=') => {
    if (value === '' || value === null || value === undefined) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    index += 1;
    params[`p${index}`] = numeric;
    const operator = ['=', '>=', '<=', '>', '<'].includes(op) ? op : '=';
    clauses.push(`${column} ${operator} @p${index}`);
  };

  addContains('name_normalized', filters.name);
  addContains('text_body', filters.text);

  if (Array.isArray(filters.colors) && filters.colors.length > 0) {
    const colorClauses = [];
    for (const color of filters.colors.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = normalizeText(color);
      colorClauses.push(`color_normalized = @p${index}`);
    }
    if (colorClauses.length) clauses.push(`(${colorClauses.join(' OR ')})`);
  }

  if (filters.type) {
    index += 1;
    params[`p${index}`] = `%${normalizeText(filters.type)}%`;
    clauses.push(`(types_search LIKE @p${index} OR type_text_normalized LIKE @p${index})`);
  }

  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywordClauses = [];
    for (const keyword of filters.keywords.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(keyword)}%`;
      keywordClauses.push(`keywords_search LIKE @p${index}`);
    }
    if (keywordClauses.length) clauses.push(`(${keywordClauses.join(' AND ')})`);
  }

  if (filters.rarity) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.rarity);
    clauses.push(`rarity_normalized = @p${index}`);
  }

  addNumeric('cost', filters.cost, filters.costOp);
  addNumeric('power', filters.power, filters.powerOp);
  addNumeric('defense', filters.defense, filters.defenseOp);

  return { whereSql: `WHERE ${clauses.join(' AND ')}`, params };
}

export function searchFabAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM fab_search_cards ${whereSql}`);
  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM fab_search_cards
    ${whereSql}
    ORDER BY set_code ASC, card_number ASC
    LIMIT @limit OFFSET @offset
  `);

  const results = rowsStmt.all({ ...params, limit: safeLimit, offset: safePage * safeLimit }).map(mapRow);

  return {
    results,
    total,
    page: safePage,
    limit: safeLimit,
    hasMore: (safePage + 1) * safeLimit < total
  };
}
