import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { db } from './db.mjs';

const yugiohCardsPath = path.join(process.cwd(), 'public', 'data', 'yugioh', 'cards.json');
const yugiohSetsPath = path.join(process.cwd(), 'public', 'data', 'yugioh', 'sets.json');
const yugiohImagesDir = path.join(process.cwd(), 'public', 'data', 'yugioh', 'images');
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

function pathExtension(pathname) {
  const match = String(pathname || '').match(/(\.[a-z0-9]+)$/i);
  return match ? match[1].toLowerCase() : '';
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function getCardPrimaryImage(card) {
  return Array.isArray(card?.card_images) ? card.card_images[0] || null : null;
}

function getLocalYugiohImageUrl(card, kind = 'full') {
  const image = getCardPrimaryImage(card);
  const sourceUrl = kind === 'small' ? image?.image_url_small : kind === 'cropped' ? image?.image_url_cropped : image?.image_url;
  if (!sourceUrl) return null;

  let extension = '.jpg';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    extension = pathname.endsWith('.png') ? '.png' : pathExtension(pathname) || '.jpg';
  } catch {}

  const cardId = String(image?.id || card?.id || 'unknown');
  const prefix = cardId.slice(0, 2).toLowerCase();
  const diskPath = path.join(yugiohImagesDir, kind, prefix, `${encodeURIComponent(cardId)}${extension}`);

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

  return `/data/yugioh/images/${kind}/${prefix}/${encodeURIComponent(cardId)}${extension}`;
}

function buildSetsByCode() {
  const sets = readJson(yugiohSetsPath, []);
  return new Map((Array.isArray(sets) ? sets : []).map((set) => [String(set.set_code || ''), set]));
}

function getPrimarySet(card, setsByCode) {
  const sets = Array.isArray(card?.card_sets) ? card.card_sets : [];
  if (!sets.length) return null;

  return [...sets].sort((a, b) => {
    const aMeta = setsByCode.get(String(a.set_code || ''));
    const bMeta = setsByCode.get(String(b.set_code || ''));
    const aDate = aMeta?.tcg_date || '';
    const bDate = bMeta?.tcg_date || '';
    const dateCompare = String(bDate).localeCompare(String(aDate));
    if (dateCompare !== 0) return dateCompare;
    return String(a.set_name || '').localeCompare(String(b.set_name || ''));
  })[0];
}

function mapCardRecord(card, setsByCode) {
  const primarySet = getPrimarySet(card, setsByCode);
  const smallImage = getLocalYugiohImageUrl(card, 'small');
  const fullImage = getLocalYugiohImageUrl(card, 'full');
  const desc = String(card?.desc || '');
  const name = String(card?.name || '');
  const type = String(card?.type || '');
  const race = String(card?.race || '');
  const attribute = String(card?.attribute || '');
  const archetype = String(card?.archetype || '');

  return {
    id: String(card.id || ''),
    name,
    name_normalized: normalizeText(name),
    search_text: normalizeText([
      name,
      desc,
      type,
      race,
      attribute,
      archetype,
      primarySet?.set_name,
      primarySet?.set_code
    ].filter(Boolean).join(' ')),
    desc_text: normalizeText(desc),
    type: type,
    type_normalized: normalizeText(type),
    race: race,
    race_normalized: normalizeText(race),
    attribute: attribute,
    attribute_normalized: normalizeText(attribute),
    archetype: archetype,
    archetype_normalized: normalizeText(archetype),
    atk: Number.isFinite(Number(card?.atk)) ? Number(card.atk) : null,
    def: Number.isFinite(Number(card?.def)) ? Number(card.def) : null,
    level: Number.isFinite(Number(card?.level)) ? Number(card.level) : null,
    scale: Number.isFinite(Number(card?.scale)) ? Number(card.scale) : null,
    linkval: Number.isFinite(Number(card?.linkval)) ? Number(card.linkval) : null,
    ban_tcg: String(card?.banlist_info?.ban_tcg || ''),
    set_name: String(primarySet?.set_name || ''),
    set_code: String(primarySet?.set_code || ''),
    set_rarity: String(primarySet?.set_rarity || ''),
    set_search: normalizeText(`${primarySet?.set_name || ''} ${primarySet?.set_code || ''} ${primarySet?.set_rarity || ''}`),
    image_url: fullImage || smallImage || null,
    image_small: smallImage || fullImage || null,
    has_image: fullImage || smallImage ? 1 : 0
  };
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS yugioh_search_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      desc_text TEXT NOT NULL,
      type TEXT,
      type_normalized TEXT NOT NULL,
      race TEXT,
      race_normalized TEXT NOT NULL,
      attribute TEXT,
      attribute_normalized TEXT NOT NULL,
      archetype TEXT,
      archetype_normalized TEXT NOT NULL,
      atk REAL,
      def REAL,
      level REAL,
      scale REAL,
      linkval REAL,
      ban_tcg TEXT,
      set_name TEXT,
      set_code TEXT,
      set_rarity TEXT,
      set_search TEXT NOT NULL,
      image_url TEXT,
      image_small TEXT,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_yugioh_search_name ON yugioh_search_cards (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_yugioh_search_text ON yugioh_search_cards (search_text);
    CREATE INDEX IF NOT EXISTS idx_yugioh_search_type ON yugioh_search_cards (type_normalized);
    CREATE INDEX IF NOT EXISTS idx_yugioh_search_race ON yugioh_search_cards (race_normalized);
    CREATE INDEX IF NOT EXISTS idx_yugioh_search_attribute ON yugioh_search_cards (attribute_normalized);
    CREATE TABLE IF NOT EXISTS yugioh_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM yugioh_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO yugioh_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM yugioh_search_cards`);
const truncateStmt = db.prepare(`DELETE FROM yugioh_search_cards`);
const insertStmt = db.prepare(`
  INSERT INTO yugioh_search_cards (
    id, name, name_normalized, search_text, desc_text, type, type_normalized, race, race_normalized,
    attribute, attribute_normalized, archetype, archetype_normalized, atk, def, level, scale, linkval,
    ban_tcg, set_name, set_code, set_rarity, set_search, image_url, image_small, has_image
  ) VALUES (
    @id, @name, @name_normalized, @search_text, @desc_text, @type, @type_normalized, @race, @race_normalized,
    @attribute, @attribute_normalized, @archetype, @archetype_normalized, @atk, @def, @level, @scale, @linkval,
    @ban_tcg, @set_name, @set_code, @set_rarity, @set_search, @image_url, @image_small, @has_image
  )
`);

function rebuildIndex() {
  const cards = readJson(yugiohCardsPath, []);
  const setsByCode = buildSetsByCode();
  const records = (Array.isArray(cards) ? cards : [])
    .map((card) => mapCardRecord(card, setsByCode))
    .filter((card) => card.id && card.name);

  const tx = db.transaction((rows) => {
    truncateStmt.run();
    for (const row of rows) {
      insertStmt.run(row);
    }
    writeMetaStmt.run('yugioh_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('yugioh_search_row_count', String(rows.length));
  });

  tx(records);
}

export function ensureYugiohSearchIndex() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();
    const version = Number(readMetaStmt.get('yugioh_search_index_version')?.value || 0);
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
    set_code: row.set_code || '',
    card_number: row.set_code || row.id,
    rarity: row.set_rarity || '',
    image_url: row.image_url || row.image_small || null,
    image_small: row.image_small || row.image_url || null,
    price: null,
    type: row.type || '',
    game: 'yugioh',
    atk: row.atk,
    def: row.def,
    level: row.level
  };
}

export function searchYugiohIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;

  const exactStmt = db.prepare(`
    SELECT *
    FROM yugioh_search_cards
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY name_normalized ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({ exact, limit: safeLimit });
  if (exactRows.length > 0) {
    return exactRows.map(mapRow);
  }

  const stmt = db.prepare(`
    SELECT *
    FROM yugioh_search_cards
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
      name_normalized ASC
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
  const clauses = ['has_image = 1'];
  const params = {};
  let index = 0;

  const addContains = (column, value) => {
    if (!value) return;
    index += 1;
    params[`p${index}`] = `%${normalizeText(value)}%`;
    clauses.push(`${column} LIKE @p${index}`);
  };

  const addEquals = (column, value) => {
    if (!value) return;
    index += 1;
    params[`p${index}`] = normalizeText(value);
    clauses.push(`${column} = @p${index}`);
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

  addContains('search_text', filters.query);
  addContains('desc_text', filters.desc);
  addContains('set_search', filters.set);
  addEquals('type_normalized', filters.type);
  addEquals('race_normalized', filters.race);
  addEquals('attribute_normalized', filters.attribute);
  addContains('archetype_normalized', filters.archetype);

  if (Array.isArray(filters.keywords) && filters.keywords.length > 0) {
    const keywordClauses = [];
    for (const keyword of filters.keywords.filter(Boolean)) {
      index += 1;
      params[`p${index}`] = `%${normalizeText(keyword)}%`;
      keywordClauses.push(`desc_text LIKE @p${index}`);
    }
    if (keywordClauses.length) {
      clauses.push(`(${keywordClauses.join(' OR ')})`);
    }
  }

  addNumeric('atk', filters.atk, filters.atkOp);
  addNumeric('def', filters.def, filters.defOp);
  addNumeric('level', filters.level, filters.levelOp);

  return {
    whereSql: `WHERE ${clauses.join(' AND ')}`,
    params
  };
}

export function searchYugiohAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 36, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params } = buildMatchClauses(filters);

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM yugioh_search_cards
    ${whereSql}
  `);

  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM yugioh_search_cards
    ${whereSql}
    ORDER BY
      name_normalized ASC,
      set_name ASC
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
