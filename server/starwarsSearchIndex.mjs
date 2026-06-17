import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const starWarsCardsPath = path.join(process.cwd(), 'public', 'data', 'starwars', 'cards.json');
const starWarsSetsPath = path.join(process.cwd(), 'public', 'data', 'starwars', 'sets.json');
const starWarsImagesDir = path.join(process.cwd(), 'public', 'data', 'starwars', 'images');
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

function getLocalStarWarsImageUrl(card, side = 'front') {
  const sourceUrl = side === 'back' ? card?.backImageUrl : card?.frontImageUrl;
  if (!sourceUrl) return null;

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathExtension(pathname) || '.png';
  } catch {}

  const cardId = String(card?.uuid || card?.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const suffix = side === 'back' ? '-back' : '';
  const diskPath = path.join(starWarsImagesDir, prefix, `${encodeURIComponent(cardId)}${suffix}${extension}`);

  if (!fs.existsSync(diskPath)) return null;
  try {
    if (fs.statSync(diskPath).size === 0) return null;
  } catch {
    return null;
  }

  return `/data/starwars/images/${prefix}/${encodeURIComponent(cardId)}${suffix}${extension}`;
}

function buildSetsByCode() {
  const sets = readJson(starWarsSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.code || ''), set]));
}

function mapCardRecord(card, setsByCode) {
  const setCode = String(card?.setCode || '');
  const setMeta = setsByCode.get(setCode) || null;
  const aspects = Array.isArray(card?.aspects) ? card.aspects.filter(Boolean) : [];
  const traits = Array.isArray(card?.traits) ? card.traits.filter(Boolean) : [];
  const keywords = Array.isArray(card?.keywords) ? card.keywords.filter(Boolean) : [];
  const imageUrl = getLocalStarWarsImageUrl(card);
  const backImageUrl = getLocalStarWarsImageUrl(card, 'back');

  return {
    id: String(card.uuid || ''),
    card_id: String(card.id || ''),
    name: String(card.name || ''),
    subtitle: String(card.subtitle || ''),
    name_normalized: normalizeText(`${card.name || ''} ${card.subtitle || ''}`),
    search_text: normalizeText([
      card.name,
      card.subtitle,
      card.type,
      card.text,
      card.backText,
      card.rarity,
      card.setCode,
      setMeta?.name,
      card.arena,
      ...aspects,
      ...traits,
      ...keywords
    ].filter(Boolean).join(' ')),
    text_body: normalizeText([card.text, card.backText].filter(Boolean).join(' ')),
    set_code: setCode,
    set_name: String(setMeta?.name || setCode),
    set_search: normalizeText(`${setMeta?.name || ''} ${setCode}`),
    card_number: String(card.cardNumber || ''),
    type: String(card.type || ''),
    type_normalized: normalizeText(card.type || ''),
    rarity: String(card.rarity || ''),
    rarity_normalized: normalizeText(card.rarity || ''),
    arena: String(card.arena || ''),
    arena_normalized: normalizeText(card.arena || ''),
    cost: Number.isFinite(Number(card.cost)) ? Number(card.cost) : null,
    power: Number.isFinite(Number(card.power)) ? Number(card.power) : null,
    hp: Number.isFinite(Number(card.hp)) ? Number(card.hp) : null,
    aspects_json: JSON.stringify(aspects),
    aspects_search: normalizeText(aspects.join(' ')),
    traits_json: JSON.stringify(traits),
    traits_search: normalizeText(traits.join(' ')),
    keywords_json: JSON.stringify(keywords),
    keywords_search: normalizeText(keywords.join(' ')),
    artist: String(card.artist || ''),
    variant_type: String(card.variantType || ''),
    is_unique: card?.isUnique ? 1 : 0,
    is_leader: card?.isLeader ? 1 : 0,
    is_base: card?.isBase ? 1 : 0,
    double_sided: card?.doubleSided ? 1 : 0,
    image_url: imageUrl,
    back_image_url: backImageUrl,
    has_image: imageUrl ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS starwars_search_cards (
      id TEXT PRIMARY KEY,
      card_id TEXT,
      name TEXT NOT NULL,
      subtitle TEXT,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      text_body TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT,
      set_search TEXT NOT NULL,
      card_number TEXT,
      type TEXT,
      type_normalized TEXT,
      rarity TEXT,
      rarity_normalized TEXT,
      arena TEXT,
      arena_normalized TEXT,
      cost REAL,
      power REAL,
      hp REAL,
      aspects_json TEXT NOT NULL,
      aspects_search TEXT NOT NULL,
      traits_json TEXT NOT NULL,
      traits_search TEXT NOT NULL,
      keywords_json TEXT NOT NULL,
      keywords_search TEXT NOT NULL,
      artist TEXT,
      variant_type TEXT,
      is_unique INTEGER NOT NULL DEFAULT 0,
      is_leader INTEGER NOT NULL DEFAULT 0,
      is_base INTEGER NOT NULL DEFAULT 0,
      double_sided INTEGER NOT NULL DEFAULT 0,
      image_url TEXT,
      back_image_url TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_starwars_search_name ON starwars_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_starwars_search_text ON starwars_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_starwars_search_type ON starwars_search_cards (type_normalized);
    CREATE INDEX IF NOT EXISTS idx_starwars_search_rarity ON starwars_search_cards (rarity_normalized);
    CREATE INDEX IF NOT EXISTS idx_starwars_search_arena ON starwars_search_cards (arena_normalized);
    CREATE TABLE IF NOT EXISTS starwars_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM starwars_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO starwars_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM starwars_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM starwars_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO starwars_search_cards (
    id, card_id, name, subtitle, name_normalized, search_text, text_body, set_code, set_name, set_search,
    card_number, type, type_normalized, rarity, rarity_normalized, arena, arena_normalized, cost, power, hp,
    aspects_json, aspects_search, traits_json, traits_search, keywords_json, keywords_search, artist, variant_type,
    is_unique, is_leader, is_base, double_sided, image_url, back_image_url, has_image
  ) VALUES (
    @id, @card_id, @name, @subtitle, @name_normalized, @search_text, @text_body, @set_code, @set_name, @set_search,
    @card_number, @type, @type_normalized, @rarity, @rarity_normalized, @arena, @arena_normalized, @cost, @power, @hp,
    @aspects_json, @aspects_search, @traits_json, @traits_search, @keywords_json, @keywords_search, @artist, @variant_type,
    @is_unique, @is_leader, @is_base, @double_sided, @image_url, @back_image_url, @has_image
  )
`);

function rebuildIndex() {
  const cards = readJson(starWarsCardsPath, []);
  const setsByCode = buildSetsByCode();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsByCode))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) insertStmt.run(row);
    writeMetaStmt.run('starwars_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('starwars_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensureStarWarsSearchIndex() {
  if (ensurePromise) return ensurePromise;
  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('starwars_search_index_version')?.value || 0);
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
    subtitle: row.subtitle || '',
    set_name: row.set_name || '',
    set_code: row.set_code || '',
    card_number: row.card_number || '',
    rarity: row.rarity || '',
    image_url: row.image_url || null,
    image_back_url: row.back_image_url || null,
    price: null,
    type: row.type || '',
    game: 'starwars',
    aspects: JSON.parse(row.aspects_json || '[]'),
    traits: JSON.parse(row.traits_json || '[]'),
    cost: row.cost,
    power: row.power,
    hp: row.hp,
    arena: row.arena || ''
  };
}

export function searchStarWarsIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM starwars_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY set_code ASC, card_number ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) return exactRows.map(mapRow);

  const stmt = db.prepare(`
    SELECT *
    FROM starwars_search_cards
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

  if (filters.type) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.type);
    clauses.push(`type_normalized = @p${index}`);
  }

  if (filters.arena) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.arena);
    clauses.push(`arena_normalized = @p${index}`);
  }

  if (filters.rarity) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.rarity);
    clauses.push(`rarity_normalized = @p${index}`);
  }

  if (Array.isArray(filters.aspects) && filters.aspects.length > 0) {
    const aspectClauses = [];
    for (const aspect of filters.aspects.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(aspect)}%`;
      aspectClauses.push(`aspects_search LIKE @p${index}`);
    }
    if (aspectClauses.length) clauses.push(`(${aspectClauses.join(' AND ')})`);
  }

  if (Array.isArray(filters.traits) && filters.traits.length > 0) {
    const traitClauses = [];
    for (const trait of filters.traits.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(trait)}%`;
      traitClauses.push(`traits_search LIKE @p${index}`);
    }
    if (traitClauses.length) clauses.push(`(${traitClauses.join(' AND ')})`);
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

  addNumeric('cost', filters.cost, filters.costOp);
  addNumeric('power', filters.power, filters.powerOp);
  addNumeric('hp', filters.hp, filters.hpOp);

  return { whereSql: `WHERE ${clauses.join(' AND ')}`, params };
}

export function searchStarWarsAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`SELECT COUNT(*) AS count FROM starwars_search_cards ${whereSql}`);
  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM starwars_search_cards
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
