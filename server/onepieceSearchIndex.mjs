import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const onePieceCardsPath = path.join(process.cwd(), 'public', 'data', 'onepiece', 'cards.json');
const onePieceSetsPath = path.join(process.cwd(), 'public', 'data', 'onepiece', 'sets.json');
const onePieceImagesDir = path.join(process.cwd(), 'public', 'data', 'onepiece', 'images');
const ONE_PIECE_IMAGE_VERSION = 'clean-20260408';
const INDEX_VERSION = 3;

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

function getLocalOnePieceImageUrl(card) {
  const sourceUrl = card?.image_url;
  if (!sourceUrl) return null;

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const diskPath = path.join(onePieceImagesDir, prefix, `${encodeURIComponent(cardId)}${extension}`);

  if (!fs.existsSync(diskPath)) return null;
  try {
    if (fs.statSync(diskPath).size === 0) return null;
  } catch {
    return null;
  }

  return `/data/onepiece/images/${prefix}/${encodeURIComponent(cardId)}${extension}?v=${ONE_PIECE_IMAGE_VERSION}`;
}

function buildSetsByCode() {
  const sets = readJson(onePieceSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.code || ''), set]));
}

function mapCardRecord(card, setsByCode) {
  const setCode = String(card?.set_code || String(card?.id || '').split('-')[0] || '');
  const setMeta = setsByCode.get(setCode) || null;
  const colors = Array.isArray(card?.colors) ? card.colors.filter(Boolean) : [];
  const types = Array.isArray(card?.types) ? card.types.filter(Boolean) : [];
  const imageUrl = getLocalOnePieceImageUrl(card);

  return {
    id: String(card.id || ''),
    name: String(card.name || ''),
    name_normalized: normalizeText(card.name || ''),
    search_text: normalizeText([
      card.name,
      card.effect,
      card.trigger,
      card.category,
      card.rarity,
      setCode,
      ...colors,
      ...types
    ].filter(Boolean).join(' ')),
    effect_text: normalizeText([card.effect, card.trigger].filter(Boolean).join(' ')),
    set_code: setCode,
    set_name: String(setMeta?.name || setCode),
    set_search: normalizeText(`${setMeta?.name || ''} ${setCode}`),
    category: String(card.category || ''),
    category_normalized: normalizeText(card.category || ''),
    rarity: String(card.rarity || ''),
    rarity_normalized: normalizeText(card.rarity || ''),
    colors_json: JSON.stringify(colors),
    colors_search: normalizeText(colors.join(' ')),
    types_json: JSON.stringify(types),
    types_search: normalizeText(types.join(' ')),
    cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : null,
    power: Number.isFinite(Number(card.power)) ? Number(card.power) : null,
    counter: Number.isFinite(Number(card.counter)) ? Number(card.counter) : null,
    image_url: imageUrl,
    has_image: imageUrl ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS onepiece_search_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      effect_text TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      set_search TEXT NOT NULL,
      category TEXT,
      category_normalized TEXT,
      rarity TEXT,
      rarity_normalized TEXT,
      colors_json TEXT NOT NULL,
      colors_search TEXT NOT NULL,
      types_json TEXT NOT NULL,
      types_search TEXT NOT NULL,
      cost REAL,
      power REAL,
      counter REAL,
      image_url TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_onepiece_search_name ON onepiece_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_onepiece_search_text ON onepiece_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_onepiece_search_category ON onepiece_search_cards (category_normalized);
    CREATE INDEX IF NOT EXISTS idx_onepiece_search_rarity ON onepiece_search_cards (rarity_normalized);
    CREATE TABLE IF NOT EXISTS onepiece_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM onepiece_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO onepiece_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM onepiece_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM onepiece_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO onepiece_search_cards (
    id, name, name_normalized, search_text, effect_text, set_code, set_name, set_search,
    category, category_normalized, rarity, rarity_normalized, colors_json, colors_search, types_json, types_search,
    cost, power, counter, image_url, has_image
  ) VALUES (
    @id, @name, @name_normalized, @search_text, @effect_text, @set_code, @set_name, @set_search,
    @category, @category_normalized, @rarity, @rarity_normalized, @colors_json, @colors_search, @types_json, @types_search,
    @cost, @power, @counter, @image_url, @has_image
  )
`);

function rebuildIndex() {
  const cards = readJson(onePieceCardsPath, []);
  const setsByCode = buildSetsByCode();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsByCode))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) insertStmt.run(row);
    writeMetaStmt.run('onepiece_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('onepiece_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensureOnePieceSearchIndex() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('onepiece_search_index_version')?.value || 0);
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
    set_code: row.set_code || 'OP',
    card_number: row.id || '',
    rarity: row.rarity || '',
    image_url: row.image_url || null,
    price: null,
    type: row.category || '',
    game: 'onepiece',
    colors: JSON.parse(row.colors_json || '[]'),
    cost: row.cost,
    power: row.power
  };
}

export function searchOnePieceIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM onepiece_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY set_code ASC, id ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) return exactRows.map(mapRow);

  const stmt = db.prepare(`
    SELECT *
    FROM onepiece_search_cards
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
      id ASC
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
  addContains('effect_text', filters.effect);

  if (Array.isArray(filters.colors) && filters.colors.length > 0) {
    const colorClauses = [];
    for (const color of filters.colors.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(color)}%`;
      colorClauses.push(`colors_search LIKE @p${index}`);
    }
    if (colorClauses.length) clauses.push(`(${colorClauses.join(' AND ')})`);
  }

  if (filters.category) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.category);
    clauses.push(`category_normalized = @p${index}`);
  }

  if (filters.rarity) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.rarity);
    clauses.push(`rarity_normalized = @p${index}`);
  }

  addNumeric('cost', filters.cost, filters.costOp);
  addNumeric('power', filters.power, filters.powerOp);

  return { whereSql: `WHERE ${clauses.join(' AND ')}`, params };
}

export function searchOnePieceAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM onepiece_search_cards ${whereSql}`);
  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM onepiece_search_cards
    ${whereSql}
    ORDER BY set_code ASC, id ASC
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
