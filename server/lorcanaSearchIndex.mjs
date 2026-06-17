import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const lorcanaCardsPath = path.join(process.cwd(), 'public', 'data', 'lorcana', 'cards.json');
const lorcanaSetsPath = path.join(process.cwd(), 'public', 'data', 'lorcana', 'sets.json');
const lorcanaImagesDir = path.join(process.cwd(), 'public', 'data', 'lorcana', 'images');
const INDEX_VERSION = 1;

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

function getLocalLorcanaImageUrl(card, kind = 'large') {
  const sourceUrl = kind === 'normal'
    ? card?.image_uris?.digital?.normal
    : card?.image_uris?.digital?.large || card?.image_uris?.digital?.normal;
  if (!sourceUrl) return null;

  let extension = '.avif';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.avif';
  } catch {}

  const cardId = String(card.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const folder = kind === 'normal' ? 'normal' : 'large';
  const diskPath = path.join(lorcanaImagesDir, folder, prefix, `${encodeURIComponent(cardId)}${extension}`);

  if (!fs.existsSync(diskPath)) return null;

  try {
    if (fs.statSync(diskPath).size === 0) return null;
  } catch {
    return null;
  }

  return `/data/lorcana/images/${folder}/${prefix}/${encodeURIComponent(cardId)}${extension}`;
}

function buildSetsByCode() {
  const sets = readJson(lorcanaSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.code || ''), set]));
}

function mapCardRecord(card, setsByCode) {
  const setCode = String(card?.set?.code || '');
  const setMeta = setsByCode.get(setCode) || card?.set || {};
  const types = Array.isArray(card?.type) ? card.type.filter(Boolean) : [];
  const keywords = Array.isArray(card?.keywords) ? card.keywords.filter(Boolean) : [];
  const classifications = Array.isArray(card?.classifications) ? card.classifications.filter(Boolean) : [];
  const largeImage = getLocalLorcanaImageUrl(card, 'large');
  const normalImage = getLocalLorcanaImageUrl(card, 'normal');

  return {
    id: String(card.id || ''),
    name: String(card.name || ''),
    name_normalized: normalizeText(card.name || ''),
    search_text: normalizeText([
      card.name,
      card.version,
      card.text,
      card.ink,
      card.rarity,
      setMeta?.name,
      setCode,
      ...types,
      ...keywords,
      ...classifications
    ].filter(Boolean).join(' ')),
    body_text: normalizeText(card.text || ''),
    set_code: setCode,
    set_name: String(setMeta?.name || ''),
    set_search: normalizeText(`${setMeta?.name || ''} ${setCode}`),
    collector_number: String(card.collector_number || ''),
    version: String(card.version || ''),
    ink: String(card.ink || ''),
    ink_normalized: normalizeText(card.ink || ''),
    rarity: String(card.rarity || ''),
    rarity_normalized: normalizeText(card.rarity || ''),
    types_json: JSON.stringify(types),
    types_search: normalizeText(types.join(' ')),
    keywords_json: JSON.stringify(keywords),
    keywords_search: normalizeText(keywords.join(' ')),
    classifications_json: JSON.stringify(classifications),
    cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : null,
    lore: Number.isFinite(Number(card.lore)) ? Number(card.lore) : null,
    strength: Number.isFinite(Number(card.strength)) ? Number(card.strength) : null,
    willpower: Number.isFinite(Number(card.willpower)) ? Number(card.willpower) : null,
    inkwell: card.inkwell ? 1 : 0,
    image_url: largeImage || normalImage || null,
    image_small: normalImage || largeImage || null,
    has_image: largeImage || normalImage ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS lorcana_search_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      body_text TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      set_search TEXT NOT NULL,
      collector_number TEXT,
      version TEXT,
      ink TEXT,
      ink_normalized TEXT,
      rarity TEXT,
      rarity_normalized TEXT,
      types_json TEXT NOT NULL,
      types_search TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      keywords_search TEXT NOT NULL,
      classifications_json TEXT NOT NULL,
      cost REAL,
      lore REAL,
      strength REAL,
      willpower REAL,
      inkwell INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      image_small TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_lorcana_search_name ON lorcana_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_lorcana_search_text ON lorcana_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_lorcana_search_ink ON lorcana_search_cards (ink_normalized);
    CREATE INDEX IF NOT EXISTS idx_lorcana_search_rarity ON lorcana_search_cards (rarity_normalized);
    CREATE TABLE IF NOT EXISTS lorcana_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM lorcana_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO lorcana_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM lorcana_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM lorcana_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO lorcana_search_cards (
    id, name, name_normalized, search_text, body_text, set_code, set_name, set_search,
    collector_number, version, ink, ink_normalized, rarity, rarity_normalized, types_json, types_search,
    keywords_json, keywords_search, classifications_json, cost, lore, strength, willpower, inkwell,
    image_url, image_small, has_image
  ) VALUES (
    @id, @name, @name_normalized, @search_text, @body_text, @set_code, @set_name, @set_search,
    @collector_number, @version, @ink, @ink_normalized, @rarity, @rarity_normalized, @types_json, @types_search,
    @keywords_json, @keywords_search, @classifications_json, @cost, @lore, @strength, @willpower, @inkwell,
    @image_url, @image_small, @has_image
  )
`);

function rebuildIndex() {
  const cards = readJson(lorcanaCardsPath, []);
  const setsByCode = buildSetsByCode();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsByCode))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) {
      insertStmt.run(row);
    }
    writeMetaStmt.run('lorcana_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('lorcana_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensureLorcanaSearchIndex() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('lorcana_search_index_version')?.value || 0);
    const rowCount = Number(countRowsStmt.get()?.count || 0);

    if (version !== INDEX_VERSION || rowCount === 0) {
      rebuildIndex();
    }
  });

  return ensurePromise;
}

function mapRow(row) {
  return {
    id: row.id,
    api_id: row.id,
    name: row.name || '',
    set_name: row.set_name || '',
    set_code: row.set_code || 'LRC',
    card_number: row.collector_number || '',
    rarity: row.rarity || '',
    image_url: row.image_url || row.image_small || null,
    image_small: row.image_small || row.image_url || null,
    price: null,
    type: JSON.parse(row.types_json || '[]').join(' • '),
    game: 'lorcana',
    ink: row.ink || '',
    cost: row.cost,
    lore: row.lore
  };
}

export function searchLorcanaIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM lorcana_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY set_code ASC, collector_number ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) return exactRows.map(mapRow);

  const stmt = db.prepare(`
    SELECT *
    FROM lorcana_search_cards
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
      collector_number ASC
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
  addContains('body_text', filters.bodyText);

  if (Array.isArray(filters.inks) && filters.inks.length > 0) {
    const inkClauses = [];
    for (const ink of filters.inks.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = normalizeText(ink);
      inkClauses.push(`ink_normalized = @p${index}`);
    }
    if (inkClauses.length) clauses.push(`(${inkClauses.join(' OR ')})`);
  }

  if (filters.type) {
    index += 1;
    params[`p${index}`] = `%${normalizeText(filters.type)}%`;
    clauses.push(`types_search LIKE @p${index}`);
  }

  if (filters.rarity) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.rarity);
    clauses.push(`rarity_normalized = @p${index}`);
  }

  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywordClauses = [];
    for (const keyword of filters.keywords.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(keyword)}%`;
      keywordClauses.push(`keywords_search LIKE @p${index}`);
    }
    if (keywordClauses.length) clauses.push(`(${keywordClauses.join(' OR ')})`);
  }

  addNumeric('cost', filters.cost, filters.costOp);
  addNumeric('lore', filters.lore, filters.loreOp);

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

export function searchLorcanaAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM lorcana_search_cards
    ${whereSql}
  `);

  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM lorcana_search_cards
    ${whereSql}
    ORDER BY
      set_code ASC,
      collector_number ASC,
      name_normalized ASC
    LIMIT @limit OFFSET @offset
  `);

  const results = rowsStmt.all({
    ...params,
    limit: safeLimit,
    offset: safePage * safeLimit
  }).map(mapRow);

  return {
    results,
    total,
    page: safePage,
    limit: safeLimit,
    hasMore: (safePage + 1) * safeLimit < total
  };
}
