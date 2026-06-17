import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const pokemonCardsPath = path.join(process.cwd(), 'public', 'data', 'pokemon', 'cards.json');
const pokemonSetsPath = path.join(process.cwd(), 'public', 'data', 'pokemon', 'sets.json');
const pokemonImagesDir = path.join(process.cwd(), 'public', 'data', 'pokemon', 'images');
const INDEX_VERSION = 1;

let ensurePromise = null;

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['â€™]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function pathExtension(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function getSetId(card) {
  if (card?.set?.id) return String(card.set.id);
  return String(card?.id || '').split('-')[0] || '';
}

function getLocalPokemonImageUrl(card, kind = 'large') {
  const sourceUrl = card?.images?.[kind];
  if (!sourceUrl) return null;

  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathname.endsWith('.jpg') || pathname.endsWith('.jpeg') ? '.jpg' : pathExtension(pathname) || '.png';
  } catch {}

  const encodedId = encodeURIComponent(String(card.id || 'unknown'));
  const prefix = String(card.id || 'unknown').slice(0, 2).toLowerCase();
  const diskPath = path.join(pokemonImagesDir, kind, prefix, `${encodedId}${extension}`);

  if (!fs.existsSync(diskPath)) {
    return null;
  }

  try {
    if (fs.statSync(diskPath).size === 0) {
      return null;
    }
  } catch {
    return null;
  }

  return `/data/pokemon/images/${kind}/${prefix}/${encodedId}${extension}`;
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function buildSetsById() {
  const sets = loadJson(pokemonSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.id || ''), set]));
}

function comparePokemonCards(a, b) {
  const dateCompare = String(b.release_date || b.released_at || '').localeCompare(String(a.release_date || a.released_at || ''));
  if (dateCompare !== 0) return dateCompare;

  const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
  if (nameCompare !== 0) return nameCompare;

  return String(a.card_number || '').localeCompare(String(b.card_number || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function mapCardRecord(card, setsById) {
  const setMeta = card?.set || setsById.get(getSetId(card)) || null;
  const setId = getSetId(card);
  const types = Array.isArray(card?.types) ? card.types.filter(Boolean) : [];
  const subtypes = Array.isArray(card?.subtypes) ? card.subtypes.filter(Boolean) : [];
  const largeImage = getLocalPokemonImageUrl(card, 'large');
  const smallImage = getLocalPokemonImageUrl(card, 'small');

  return {
    id: String(card.id || ''),
    name: String(card.name || ''),
    name_normalized: normalizeText(card.name || ''),
    search_text: normalizeText([
      card.name,
      card.number,
      card.supertype,
      ...subtypes,
      ...types,
      card.hp,
      setMeta?.name,
      setId
    ].filter(Boolean).join(' ')),
    set_id: setId,
    set_code: String(setMeta?.ptcgoCode || setId || '').toUpperCase(),
    set_name: String(setMeta?.name || setId || 'Unknown Set'),
    set_search: normalizeText(`${setMeta?.name || ''} ${setId || ''} ${setMeta?.ptcgoCode || ''}`),
    release_date: String(setMeta?.releaseDate || ''),
    card_number: String(card.number || ''),
    rarity: String(card.rarity || ''),
    rarity_normalized: normalizeText(card.rarity || ''),
    supertype: String(card.supertype || ''),
    supertype_normalized: normalizeText(card.supertype || ''),
    types_json: JSON.stringify(types),
    types_search: normalizeText(types.join(' ')),
    hp: String(card.hp || ''),
    hp_num: Number.isFinite(Number(card.hp)) ? Number(card.hp) : null,
    image_url: largeImage || smallImage || null,
    image_small: smallImage || largeImage || null,
    has_image: largeImage || smallImage ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS pokemon_search_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      set_id TEXT NOT NULL,
      set_code TEXT,
      set_name TEXT NOT NULL,
      set_search TEXT NOT NULL,
      release_date TEXT,
      card_number TEXT,
      rarity TEXT,
      rarity_normalized TEXT,
      supertype TEXT,
      supertype_normalized TEXT,
      types_json TEXT NOT NULL,
      types_search TEXT NOT NULL,
      hp TEXT,
      hp_num REAL,
      image_url TEXT,
      image_small TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_pokemon_search_name ON pokemon_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_pokemon_search_text ON pokemon_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_pokemon_search_set ON pokemon_search_cards (set_name, release_date DESC);
    CREATE INDEX IF NOT EXISTS idx_pokemon_search_supertype ON pokemon_search_cards (supertype_normalized);
    CREATE INDEX IF NOT EXISTS idx_pokemon_search_rarity ON pokemon_search_cards (rarity_normalized);
    CREATE TABLE IF NOT EXISTS pokemon_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM pokemon_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO pokemon_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM pokemon_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM pokemon_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO pokemon_search_cards (
    id, name, name_normalized, search_text, set_id, set_code, set_name, set_search,
    release_date, card_number, rarity, rarity_normalized, supertype, supertype_normalized,
    types_json, types_search, hp, hp_num, image_url, image_small, has_image
  ) VALUES (
    @id, @name, @name_normalized, @search_text, @set_id, @set_code, @set_name, @set_search,
    @release_date, @card_number, @rarity, @rarity_normalized, @supertype, @supertype_normalized,
    @types_json, @types_search, @hp, @hp_num, @image_url, @image_small, @has_image
  )
`);

function rebuildIndex() {
  const cards = loadJson(pokemonCardsPath, []);
  const setsById = buildSetsById();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsById))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) {
      insertStmt.run(row);
    }
    writeMetaStmt.run('pokemon_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('pokemon_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensurePokemonSearchIndex() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('pokemon_search_index_version')?.value || 0);
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
    set_name: row.set_name || 'Unknown Set',
    set_code: row.set_code || row.set_id || 'UNK',
    card_number: row.card_number || '',
    rarity: row.rarity || '',
    image_url: row.image_url || row.image_small || null,
    image_small: row.image_small || row.image_url || null,
    price: null,
    type: [row.supertype, ...JSON.parse(row.types_json || '[]')].filter(Boolean).join(' • '),
    game: 'pokemon',
    supertype: row.supertype || '',
    types: JSON.parse(row.types_json || '[]'),
    hp: row.hp || '',
    released_at: row.release_date || ''
  };
}

export function searchPokemonIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM pokemon_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY
      release_date DESC,
      set_name ASC,
      card_number ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) {
    return exactRows.map(mapRow);
  }

  const stmt = db.prepare(`
    SELECT *
    FROM pokemon_search_cards
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
      release_date DESC,
      set_name ASC,
      card_number ASC
    LIMIT @limit
  `);

  return stmt.all({
    exact,
    startsWith,
    contains,
    limit: safeLimit
  }).map(mapRow);
}

function buildMatchClauses(filters = {}) {
  const clauses = [];
  const params = {};
  let index = 0;

  const addContains = (column, value) => {
    if (!value) return;
    index += 1;
    params[`p${index}`] = `%${normalizeText(value)}%`;
    clauses.push(`${column} LIKE @p${index}`);
  };

  addContains('name_normalized', filters.name);
  addContains('set_search', filters.set);

  if (filters.supertype) {
    index += 1;
    params[`p${index}`] = normalizeText(filters.supertype);
    clauses.push(`supertype_normalized = @p${index}`);
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

  return {
    whereSql: clauses.length ? `WHERE has_image = 1 AND ${clauses.join(' AND ')}` : 'WHERE has_image = 1',
    params
  };
}

export function searchPokemonAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM pokemon_search_cards
    ${whereSql}
  `);

  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM pokemon_search_cards
    ${whereSql}
    ORDER BY
      release_date DESC,
      name_normalized ASC,
      set_name ASC,
      card_number ASC
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
