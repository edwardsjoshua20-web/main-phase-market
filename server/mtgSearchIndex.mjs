import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.mjs';

const mtgSearchDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'search');
const INDEX_VERSION = 1;

const COLOR_BITS = {
  W: 1,
  U: 2,
  B: 4,
  R: 8,
  G: 16
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

function getCanonicalName(row) {
  const rawName = String(row?.name || '').trim();
  if (!rawName.includes('//')) return rawName;

  const parts = rawName
    .split('//')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return rawName;

  const normalizedParts = parts.map((part) => normalizeText(part));
  const firstPart = normalizedParts[0];
  if (firstPart && normalizedParts.every((part) => part === firstPart)) {
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

function compareExactPrintings(a, b) {
  const aEnglish = isEnglish(a);
  const bEnglish = isEnglish(b);
  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;

  const aDate = String(a.released_at || '');
  const bDate = String(b.released_at || '');
  if (aDate !== bDate) return bDate.localeCompare(aDate);

  const aSet = String(a.set_name || '');
  const bSet = String(b.set_name || '');
  if (aSet !== bSet) return aSet.localeCompare(bSet);

  return String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, {
    numeric: true,
    sensitivity: 'base'
  });
}

function computeColorMask(colors = []) {
  return [...new Set(colors.map((color) => String(color || '').toUpperCase()).filter(Boolean))]
    .reduce((mask, color) => mask | (COLOR_BITS[color] || 0), 0);
}

function buildGroupRows(rows) {
  const groups = new Map();

  for (const row of rows) {
    if (!hasImage(row)) continue;

    const groupKey = [
      row.oracle_id || getCanonicalName(row),
      row.set_code || row.set_name || 'UNK',
      row.collector_number || ''
    ].join('::');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(row);
  }

  return [...groups.entries()].map(([groupKey, variants]) => {
    const sortedVariants = [...variants].sort(compareExactPrintings);
    const primary = sortedVariants[0];
    const canonicalName = getCanonicalName(primary);
    const colors = [...new Set((primary.colors || []).map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
    const languageCodes = [...new Set(sortedVariants.map((variant) => String(variant.lang || '').toUpperCase()).filter(Boolean))]
      .sort((a, b) => {
        if (a === 'EN' && b !== 'EN') return -1;
        if (b === 'EN' && a !== 'EN') return 1;
        return a.localeCompare(b);
      });

    return {
      group_key: groupKey,
      oracle_id: primary.oracle_id || '',
      set_code: primary.set_code || 'UNK',
      set_name: primary.set_name || 'Unknown Set',
      collector_number: primary.collector_number || '',
      name: canonicalName,
      raw_name: primary.name || canonicalName,
      name_normalized: normalizeText(canonicalName),
      search_text: normalizeText(primary.search_text || canonicalName),
      oracle_text: primary.oracle_text || '',
      oracle_text_normalized: normalizeText(primary.oracle_text || ''),
      type_line: primary.type_line || '',
      type_line_normalized: normalizeText(primary.type_line || ''),
      rarity: String(primary.rarity || '').toLowerCase(),
      released_at: primary.released_at || '',
      mana_cost: primary.mana_cost || '',
      cmc: Number.isFinite(Number(primary.cmc)) ? Number(primary.cmc) : null,
      power: primary.power ?? '',
      toughness: primary.toughness ?? '',
      color_mask: computeColorMask(colors),
      color_count: colors.length,
      colors_json: JSON.stringify(colors),
      image_url: primary.image_normal || primary.image_small || null,
      image_small: primary.image_small || primary.image_normal || null,
      language_codes_json: JSON.stringify(languageCodes),
      variant_count: languageCodes.length || 1,
      has_english_variant: languageCodes.includes('EN') ? 1 : 0,
      lang: String(primary.lang || '').toLowerCase() || 'unknown',
      price: primary.prices?.usd ? Number.parseFloat(primary.prices.usd) : null,
      has_image: 1
    };
  });
}

function loadAllMtgRows() {
  const files = fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'));
  return files.flatMap((file) => {
    const filePath = path.join(mtgSearchDir, file);
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  });
}

function buildMatchClauses(filters) {
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
  addContains('oracle_text_normalized', filters.oracleText);
  addContains('type_line_normalized', filters.typeLine);
  addContains('set_search', filters.set);

  const keywords = Array.isArray(filters.keywords) ? filters.keywords.filter(Boolean) : [];
  for (const keyword of keywords) {
    addContains('oracle_text_normalized', keyword);
  }

  if (filters.rarity) {
    index += 1;
    params[`p${index}`] = String(filters.rarity).toLowerCase();
    clauses.push(`rarity = @p${index}`);
  }

  const addNumeric = (column, value, op = '=') => {
    if (value === null || value === undefined || value === '') return;
    index += 1;
    params[`p${index}`] = Number(value);
    clauses.push(`${column} ${op} @p${index}`);
  };

  addNumeric('cmc', filters.cmc, filters.cmcOp || '=');
  addNumeric('power_num', filters.power, filters.powerOp || '=');
  addNumeric('toughness_num', filters.toughness, filters.toughnessOp || '=');

  const selectedColors = Array.isArray(filters.colors) ? filters.colors.filter(Boolean) : [];
  if (selectedColors.length) {
    const colorMask = computeColorMask(selectedColors);
    index += 1;
    params[`p${index}`] = colorMask;
    const maskRef = `@p${index}`;

    if (filters.colorMode === 'exactly') {
      clauses.push(`color_mask = ${maskRef}`);
    } else if (filters.colorMode === 'at_most') {
      clauses.push(`(color_mask | ${maskRef}) = ${maskRef}`);
    } else {
      clauses.push(`(color_mask & ${maskRef}) = ${maskRef}`);
    }
  }

  return {
    whereSql: clauses.length ? `WHERE has_image = 1 AND ${clauses.join(' AND ')}` : 'WHERE has_image = 1',
    params,
    selectedColors
  };
}

function mapRow(row) {
  return {
    id: row.group_key,
    groupKey: row.group_key,
    oracle_id: row.oracle_id,
    name: row.name,
    raw_name: row.raw_name,
    lang: row.lang || 'en',
    set_name: row.set_name,
    set_code: row.set_code,
    card_number: row.collector_number,
    rarity: row.rarity,
    image_url: row.image_url,
    raw_image_url: row.image_url,
    english_image_url: row.image_url,
    image_small: row.image_small,
    highres_image: Boolean(row.image_url),
    has_localized_image: true,
    price: row.price,
    allPrices: { usd: row.price, usd_foil: null, usd_etched: null },
    allFinishes: ['nonfoil'],
    type: row.type_line,
    mana_cost: row.mana_cost,
    cmc: row.cmc ?? 0,
    colors: JSON.parse(row.colors_json || '[]'),
    color_identity: JSON.parse(row.colors_json || '[]'),
    oracle_text: row.oracle_text,
    released_at: row.released_at || null,
    legal_commander: false,
    can_be_commander: false,
    finishes: ['nonfoil'],
    finish: 'nonfoil',
    finishLabel: 'Normal',
    game: 'magic',
    languageCodes: JSON.parse(row.language_codes_json || '[]'),
    variantCount: row.variant_count || 1
  };
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function ensureSearchTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mtg_search_printings (
      group_key TEXT PRIMARY KEY,
      oracle_id TEXT NOT NULL,
      set_code TEXT NOT NULL,
      set_name TEXT NOT NULL,
      collector_number TEXT,
      name TEXT NOT NULL,
      raw_name TEXT,
      name_normalized TEXT NOT NULL,
      search_text TEXT NOT NULL,
      oracle_text TEXT,
      oracle_text_normalized TEXT,
      type_line TEXT,
      type_line_normalized TEXT,
      set_search TEXT NOT NULL,
      rarity TEXT,
      released_at TEXT,
      mana_cost TEXT,
      cmc REAL,
      power TEXT,
      toughness TEXT,
      power_num REAL,
      toughness_num REAL,
      color_mask INTEGER NOT NULL,
      color_count INTEGER NOT NULL,
      colors_json TEXT NOT NULL,
      image_url TEXT,
      image_small TEXT,
      language_codes_json TEXT NOT NULL,
      variant_count INTEGER NOT NULL,
      has_english_variant INTEGER NOT NULL DEFAULT 0,
      lang TEXT NOT NULL,
      price REAL,
      has_image INTEGER NOT NULL DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_mtg_search_name ON mtg_search_printings (name_normalized);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_text ON mtg_search_printings (search_text);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_rarity ON mtg_search_printings (rarity);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_set ON mtg_search_printings (set_code, released_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_colors ON mtg_search_printings (color_mask, color_count);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_release ON mtg_search_printings (released_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mtg_search_oracle ON mtg_search_printings (oracle_id);
    CREATE TABLE IF NOT EXISTS mtg_search_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn('mtg_search_printings', 'has_english_variant', 'INTEGER NOT NULL DEFAULT 0');
}

ensureSearchTables();

const readMetaStmt = db.prepare(`SELECT value FROM mtg_search_meta WHERE key = ?`);
const writeMetaStmt = db.prepare(`
  INSERT INTO mtg_search_meta (key, value)
  VALUES (?, ?)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value
`);
const countSearchRowsStmt = db.prepare(`SELECT COUNT(*) AS count FROM mtg_search_printings`);
const truncateSearchStmt = db.prepare(`DELETE FROM mtg_search_printings`);
const insertSearchStmt = db.prepare(`
  INSERT INTO mtg_search_printings (
    group_key, oracle_id, set_code, set_name, collector_number, name, raw_name,
    name_normalized, search_text, oracle_text, oracle_text_normalized, type_line,
    type_line_normalized, set_search, rarity, released_at, mana_cost, cmc, power,
    toughness, power_num, toughness_num, color_mask, color_count, colors_json,
    image_url, image_small, language_codes_json, variant_count, has_english_variant, lang, price, has_image
  ) VALUES (
    @group_key, @oracle_id, @set_code, @set_name, @collector_number, @name, @raw_name,
    @name_normalized, @search_text, @oracle_text, @oracle_text_normalized, @type_line,
    @type_line_normalized, @set_search, @rarity, @released_at, @mana_cost, @cmc, @power,
    @toughness, @power_num, @toughness_num, @color_mask, @color_count, @colors_json,
    @image_url, @image_small, @language_codes_json, @variant_count, @has_english_variant, @lang, @price, @has_image
  )
`);

function rebuildIndex() {
  const rows = loadAllMtgRows();
  const groupedRows = buildGroupRows(rows).map((row) => ({
    ...row,
    set_search: normalizeText(`${row.set_code} ${row.set_name}`),
    power_num: row.power === '' ? null : Number(row.power),
    toughness_num: row.toughness === '' ? null : Number(row.toughness)
  }));

  const tx = db.transaction((records) => {
    truncateSearchStmt.run();
    for (const record of records) {
      insertSearchStmt.run(record);
    }
    writeMetaStmt.run('mtg_search_index_version', String(INDEX_VERSION));
    writeMetaStmt.run('mtg_search_row_count', String(records.length));
  });

  tx(groupedRows);
}

export function ensureMtgSearchIndex() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = Promise.resolve().then(() => {
    ensureSearchTables();

    const version = Number(readMetaStmt.get('mtg_search_index_version')?.value || 0);
    const rowCount = Number(countSearchRowsStmt.get()?.count || 0);

    if (version !== INDEX_VERSION || rowCount === 0) {
      rebuildIndex();
    }
  });

  return ensurePromise;
}

export function searchMtgIndex(query, limit = 100) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery) return [];

  const exact = normalizedQuery;
  const startsWith = `${normalizedQuery}%`;
  const contains = `%${normalizedQuery}%`;
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  const exactStmt = db.prepare(`
    SELECT *
    FROM mtg_search_printings
    WHERE has_image = 1
      AND name_normalized = @exact
    ORDER BY
      CASE WHEN lang = 'en' THEN 0 ELSE 1 END,
      released_at DESC,
      set_name ASC
    LIMIT @limit
  `);

  const exactRows = exactStmt.all({
    exact,
    limit: safeLimit
  });

  if (exactRows.length > 0) {
    const englishPreferredRows = exactRows.some((row) => row.has_english_variant)
      ? exactRows.filter((row) => row.has_english_variant)
      : exactRows;
    return englishPreferredRows.map(mapRow);
  }

  const stmt = db.prepare(`
    SELECT *
    FROM mtg_search_printings
    WHERE has_image = 1
      AND (
        name_normalized LIKE @contains
        OR search_text LIKE @contains
        OR oracle_text_normalized LIKE @contains
      )
    ORDER BY
      CASE
        WHEN name_normalized = @exact THEN 0
        WHEN name_normalized LIKE @startsWith THEN 1
        WHEN search_text LIKE @startsWith THEN 2
        WHEN search_text LIKE @contains THEN 3
        ELSE 4
      END,
      CASE WHEN lang = 'en' THEN 0 ELSE 1 END,
      released_at DESC,
      set_name ASC
    LIMIT @limit
  `);

  const rows = stmt.all({
    exact,
    startsWith,
    contains,
    limit: safeLimit
  });

  const englishPreferredRows = rows.some((row) => row.has_english_variant)
    ? rows.filter((row) => row.has_english_variant)
    : rows;

  return englishPreferredRows.map(mapRow);
}

export function searchMtgAdvancedIndex(filters = {}, page = 0, limit = 100) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 48, 250));
  const safePage = Math.max(0, Number(page) || 0);
  const { whereSql, params, selectedColors } = buildMatchClauses(filters);
  const exactColorMask = computeColorMask(selectedColors);

  const countStmt = db.prepare(`
    SELECT COUNT(*) AS count
    FROM mtg_search_printings
    ${whereSql}
  `);

  const total = Number(countStmt.get(params)?.count || 0);

  const rowsStmt = db.prepare(`
    SELECT *
    FROM mtg_search_printings
    ${whereSql}
    ORDER BY
      CASE
        WHEN @selectedColorCount = 0 THEN 0
        WHEN color_mask = @exactColorMask THEN 0
        ELSE 1
      END,
      CASE WHEN lang = 'en' THEN 0 ELSE 1 END,
      color_count ASC,
      name_normalized ASC,
      released_at DESC,
      set_name ASC
    LIMIT @limit OFFSET @offset
  `);

  const results = rowsStmt.all({
    ...params,
    selectedColorCount: selectedColors.length,
    exactColorMask,
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
