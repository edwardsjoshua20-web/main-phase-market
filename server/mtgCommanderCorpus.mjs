import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db } from './db.mjs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const mtgSearchDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'search');
const mtgAliasPath = path.join(process.cwd(), 'server', 'data', 'mtg-name-aliases.json');
let mtgNameLookup = null;
let mtgOracleLookup = null;
let mtgAliasLookup = null;

function nowIso() {
  return new Date().toISOString();
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['â€™]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeLookupText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/[–—]/g, '-')
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function readJson(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function readJsonText(text) {
  const cleanText = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  return JSON.parse(cleanText);
}

function isCloudflareBlockPage(text) {
  const value = String(text || '');
  return value.includes('Attention Required! | Cloudflare')
    || value.includes('Sorry, you have been blocked')
    || value.includes('cf-error-details');
}

function buildMtgNameLookup() {
  if (!fs.existsSync(mtgSearchDir)) {
    return new Map();
  }

  const files = fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'));
  const byName = new Map();

  for (const file of files) {
    const rows = readJson(path.join(mtgSearchDir, file));
    for (const row of rows) {
      if (!row?.oracle_id || !row?.name) continue;
      const aliases = new Set([row.name]);
      if (String(row.name).includes(' // ')) {
        for (const part of String(row.name).split(' // ')) {
          if (part.trim()) aliases.add(part.trim());
        }
      }
      if (Array.isArray(row.face_names)) {
        for (const part of row.face_names) {
          if (String(part || '').trim()) aliases.add(String(part).trim());
        }
      }
      if (Array.isArray(row.alternate_names)) {
        for (const part of row.alternate_names) {
          if (String(part || '').trim()) aliases.add(String(part).trim());
        }
      }
      for (const alias of aliases) {
        const normalized = normalizeLookupText(alias);
        if (normalized && !byName.has(normalized)) {
          byName.set(normalized, {
            oracle_id: row.oracle_id,
            name: row.name
          });
        }
      }
    }
  }

  return byName;
}

function buildMtgOracleLookup() {
  if (!fs.existsSync(mtgSearchDir)) {
    return new Map();
  }

  const files = fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'));
  const byOracle = new Map();

  for (const file of files) {
    const rows = readJson(path.join(mtgSearchDir, file));
    for (const row of rows) {
      if (!row?.oracle_id || !row?.name) continue;
      if (!byOracle.has(row.oracle_id)) {
        byOracle.set(row.oracle_id, {
          oracle_id: row.oracle_id,
          name: row.name,
          type_line: row.type_line || '',
          oracle_text: row.oracle_text || ''
        });
      }
    }
  }

  return byOracle;
}

function buildMtgAliasLookup() {
  if (!fs.existsSync(mtgAliasPath)) {
    return new Map();
  }

  try {
    const payload = readJson(mtgAliasPath);
    return new Map(
      Object.entries(payload || {}).map(([alias, canonical]) => [
        normalizeLookupText(alias),
        normalizeLookupText(canonical)
      ]).filter(([alias, canonical]) => alias && canonical)
    );
  } catch {
    return new Map();
  }
}

function resolveMtgCardByName(name) {
  if (!mtgNameLookup) {
    mtgNameLookup = buildMtgNameLookup();
  }
  if (!mtgAliasLookup) {
    mtgAliasLookup = buildMtgAliasLookup();
  }

  const normalized = normalizeLookupText(name);
  if (mtgNameLookup.has(normalized)) {
    return mtgNameLookup.get(normalized) || null;
  }

  const aliasTarget = mtgAliasLookup.get(normalized);
  if (aliasTarget && mtgNameLookup.has(aliasTarget)) {
    return mtgNameLookup.get(aliasTarget) || null;
  }

  return null;
}

function resolveMtgCard(candidate) {
  if (!mtgOracleLookup) {
    mtgOracleLookup = buildMtgOracleLookup();
  }

  const oracleId = String(candidate?.oracle_id || '').trim();
  const name = String(candidate?.name || '').trim();
  if (UUID_RE.test(oracleId) && mtgOracleLookup.has(oracleId)) {
    const resolved = mtgOracleLookup.get(oracleId);
    return {
      oracle_id: resolved.oracle_id,
      name: resolved.name || name || '',
      type_line: resolved.type_line || '',
      oracle_text: resolved.oracle_text || ''
    };
  }

  const byName = resolveMtgCardByName(name);
  if (byName) {
    const oracleMeta = mtgOracleLookup.get(byName.oracle_id) || {};
    return {
      oracle_id: byName.oracle_id,
      name: byName.name || name || '',
      type_line: oracleMeta.type_line || '',
      oracle_text: oracleMeta.oracle_text || ''
    };
  }

  return null;
}

function canResolvedCardBeCommander(card) {
  const typeLine = String(card?.type_line || '').toLowerCase();
  const oracleText = String(card?.oracle_text || '').toLowerCase();
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
    (isLegendary && isCreature)
    || (isLegendary && (isVehicle || isSpacecraft))
    || isBackground
    || explicitCommanderText
  );
}

function ensureColumn(tableName, columnName, definition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function ensureCommanderCorpusTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mtg_commander_corpus_sources (
      source_id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      source_type TEXT NOT NULL,
      source_name TEXT NOT NULL DEFAULT 'archidekt',
      location TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      downloaded_path TEXT,
      total_decks INTEGER NOT NULL DEFAULT 0,
      imported_decks INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_started_at TEXT,
      last_finished_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mtg_commander_corpus_decks (
      deck_key TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_deck_id TEXT,
      source_url TEXT,
      deck_name TEXT,
      commander_oracle_id TEXT NOT NULL,
      commander_name TEXT NOT NULL,
      commander_name_normalized TEXT NOT NULL,
      total_cards INTEGER NOT NULL DEFAULT 0,
      unresolved_cards INTEGER NOT NULL DEFAULT 0,
      quality_status TEXT NOT NULL DEFAULT 'unknown',
      validation_notes TEXT,
      source_identity TEXT,
      content_hash TEXT,
      content_fingerprint TEXT,
      chemistry_weight REAL NOT NULL DEFAULT 0,
      lifecycle_status TEXT NOT NULL DEFAULT 'quarantined',
      rejection_reason TEXT,
      last_validated_at TEXT,
      retired_at TEXT,
      imported_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mtg_commander_corpus_decks_commander
    ON mtg_commander_corpus_decks (commander_oracle_id, commander_name_normalized);

    CREATE TABLE IF NOT EXISTS mtg_commander_corpus_cards (
      deck_key TEXT NOT NULL,
      card_oracle_id TEXT NOT NULL,
      card_name TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      is_commander INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (deck_key, card_oracle_id, is_commander)
    );

    CREATE INDEX IF NOT EXISTS idx_mtg_commander_corpus_cards_card
    ON mtg_commander_corpus_cards (card_oracle_id, is_commander);

    CREATE TABLE IF NOT EXISTS mtg_commander_pipeline_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  ensureColumn('mtg_commander_corpus_decks', 'total_cards', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('mtg_commander_corpus_decks', 'unresolved_cards', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('mtg_commander_corpus_decks', 'quality_status', `TEXT NOT NULL DEFAULT 'unknown'`);
  ensureColumn('mtg_commander_corpus_decks', 'validation_notes', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'source_identity', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'content_hash', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'content_fingerprint', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'chemistry_weight', 'REAL NOT NULL DEFAULT 0');
  ensureColumn('mtg_commander_corpus_decks', 'lifecycle_status', `TEXT NOT NULL DEFAULT 'quarantined'`);
  ensureColumn('mtg_commander_corpus_decks', 'rejection_reason', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'last_validated_at', 'TEXT');
  ensureColumn('mtg_commander_corpus_decks', 'retired_at', 'TEXT');

  db.exec(`
    UPDATE mtg_commander_corpus_decks
    SET source_identity = lower(source_name) || ':' || source_deck_id
    WHERE source_identity IS NULL
      AND source_deck_id IS NOT NULL
      AND trim(source_deck_id) <> '';

    UPDATE mtg_commander_corpus_decks
    SET content_hash = deck_key
    WHERE content_hash IS NULL;

    UPDATE mtg_commander_corpus_decks
    SET quality_status = 'valid', lifecycle_status = 'active', rejection_reason = NULL
    WHERE quality_status IN ('clean', 'repaired');

    UPDATE mtg_commander_corpus_decks
    SET lifecycle_status = 'quarantined'
    WHERE quality_status <> 'valid'
      AND lifecycle_status <> 'retired';

    UPDATE mtg_commander_corpus_decks
    SET rejection_reason = CASE
      WHEN validation_notes LIKE '%commander:unresolved%' THEN 'unresolved_commander'
      WHEN validation_notes LIKE '%commander:invalid%' THEN 'invalid_commander'
      WHEN validation_notes LIKE '%format:%' OR validation_notes LIKE '%theorycrafted%' THEN 'non_commander_deck'
      WHEN validation_notes LIKE '%unresolved:%' THEN 'missing_cards'
      WHEN validation_notes LIKE '%size:%' OR validation_notes LIKE '%commanders:%' THEN 'malformed_deck'
      WHEN validation_notes LIKE '%duplicate:%' THEN 'duplicate'
      WHEN validation_notes LIKE '%encoding:%' THEN 'encoding_corruption'
      WHEN lifecycle_status = 'retired' THEN 'retired_source'
      ELSE 'other'
    END
    WHERE quality_status <> 'valid'
      AND (rejection_reason IS NULL OR rejection_reason = '');

    CREATE INDEX IF NOT EXISTS idx_mtg_commander_corpus_decks_source_identity
    ON mtg_commander_corpus_decks (source_identity);

    CREATE INDEX IF NOT EXISTS idx_mtg_commander_corpus_decks_active
    ON mtg_commander_corpus_decks (lifecycle_status, quality_status, commander_oracle_id);

    CREATE INDEX IF NOT EXISTS idx_mtg_commander_corpus_decks_fingerprint
    ON mtg_commander_corpus_decks (content_fingerprint, lifecycle_status, quality_status);
  `);

  rebuildCommanderContentFingerprints({ onlyMissing: true });
}

ensureCommanderCorpusTables();

const selectSourceStmt = db.prepare(`
  SELECT *
  FROM mtg_commander_corpus_sources
  WHERE source_id = ?
`);

const listSourcesStmt = db.prepare(`
  SELECT *
  FROM mtg_commander_corpus_sources
  ORDER BY created_at ASC
`);

const upsertSourceStmt = db.prepare(`
  INSERT INTO mtg_commander_corpus_sources (
    source_id, label, source_type, source_name, location, status, downloaded_path, total_decks,
    imported_decks, last_error, created_at, updated_at, last_started_at, last_finished_at
  ) VALUES (
    @source_id, @label, @source_type, @source_name, @location, @status, @downloaded_path, @total_decks,
    @imported_decks, @last_error, @created_at, @updated_at, @last_started_at, @last_finished_at
  )
  ON CONFLICT(source_id) DO UPDATE SET
    label = excluded.label,
    source_type = excluded.source_type,
    source_name = excluded.source_name,
    location = excluded.location,
    status = excluded.status,
    downloaded_path = excluded.downloaded_path,
    total_decks = excluded.total_decks,
    imported_decks = excluded.imported_decks,
    last_error = excluded.last_error,
    updated_at = excluded.updated_at,
    last_started_at = excluded.last_started_at,
    last_finished_at = excluded.last_finished_at
`);

const insertDeckStmt = db.prepare(`
  INSERT INTO mtg_commander_corpus_decks (
    deck_key, source_id, source_name, source_deck_id, source_url, deck_name,
    commander_oracle_id, commander_name, commander_name_normalized, total_cards,
    unresolved_cards, quality_status, validation_notes, source_identity, content_hash,
    content_fingerprint, chemistry_weight, lifecycle_status, rejection_reason,
    last_validated_at, retired_at, imported_at
  ) VALUES (
    @deck_key, @source_id, @source_name, @source_deck_id, @source_url, @deck_name,
    @commander_oracle_id, @commander_name, @commander_name_normalized, @total_cards,
    @unresolved_cards, @quality_status, @validation_notes, @source_identity, @content_hash,
    @content_fingerprint, @chemistry_weight, @lifecycle_status, @rejection_reason,
    @last_validated_at, @retired_at, @imported_at
  )
  ON CONFLICT(deck_key) DO UPDATE SET
    source_id = excluded.source_id,
    source_name = excluded.source_name,
    source_deck_id = excluded.source_deck_id,
    source_url = excluded.source_url,
    deck_name = excluded.deck_name,
    commander_oracle_id = excluded.commander_oracle_id,
    commander_name = excluded.commander_name,
    commander_name_normalized = excluded.commander_name_normalized,
    total_cards = excluded.total_cards,
    unresolved_cards = excluded.unresolved_cards,
    quality_status = excluded.quality_status,
    validation_notes = excluded.validation_notes,
    source_identity = excluded.source_identity,
    content_hash = excluded.content_hash,
    content_fingerprint = excluded.content_fingerprint,
    chemistry_weight = excluded.chemistry_weight,
    lifecycle_status = excluded.lifecycle_status,
    rejection_reason = excluded.rejection_reason,
    last_validated_at = excluded.last_validated_at,
    retired_at = excluded.retired_at,
    imported_at = excluded.imported_at
`);
const deleteDeckCardsStmt = db.prepare(`DELETE FROM mtg_commander_corpus_cards WHERE deck_key = ?`);

const insertCardStmt = db.prepare(`
  INSERT INTO mtg_commander_corpus_cards (
    deck_key, card_oracle_id, card_name, quantity, is_commander
  ) VALUES (
    @deck_key, @card_oracle_id, @card_name, @quantity, @is_commander
  )
  ON CONFLICT(deck_key, card_oracle_id, is_commander) DO UPDATE SET
    quantity = excluded.quantity,
    card_name = COALESCE(excluded.card_name, mtg_commander_corpus_cards.card_name)
`);
const selectDecksBySourceStmt = db.prepare(`
  SELECT *
  FROM mtg_commander_corpus_decks
  WHERE source_id = ?
  ORDER BY imported_at DESC
`);
const selectDeckBySourceIdentityStmt = db.prepare(`
  SELECT *
  FROM mtg_commander_corpus_decks
  WHERE source_identity = ?
  ORDER BY
    CASE lifecycle_status WHEN 'active' THEN 0 WHEN 'quarantined' THEN 1 ELSE 2 END,
    imported_at DESC
  LIMIT 1
`);
const retireDeckStmt = db.prepare(`
  UPDATE mtg_commander_corpus_decks
  SET lifecycle_status = 'retired',
      rejection_reason = @reason,
      validation_notes = CASE
        WHEN validation_notes IS NULL OR validation_notes = '' THEN @note
        WHEN instr(validation_notes, @note) > 0 THEN validation_notes
        ELSE validation_notes || ',' || @note
      END,
      last_validated_at = @timestamp,
      retired_at = @timestamp
  WHERE deck_key = @deck_key
`);
const updateDeckValidationStmt = db.prepare(`
  UPDATE mtg_commander_corpus_decks
  SET commander_oracle_id = @commander_oracle_id,
      commander_name = @commander_name,
      commander_name_normalized = @commander_name_normalized,
      total_cards = @total_cards,
      quality_status = @quality_status,
      validation_notes = @validation_notes,
      lifecycle_status = @lifecycle_status,
      rejection_reason = @rejection_reason,
      last_validated_at = @last_validated_at,
      retired_at = NULL
  WHERE deck_key = @deck_key
`);

function toSourceId(entry) {
  return entry.source_id || crypto.createHash('sha1').update(`${entry.source_type}:${entry.location}`).digest('hex').slice(0, 16);
}

function parseCommanders(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  if (typeof raw[0] === 'string') {
    return [{ oracle_id: raw[0], quantity: Number(raw[1]) || 1, name: raw[2] || '' }];
  }

  return raw
    .filter((entry) => Array.isArray(entry) && entry.length >= 1)
    .map((entry) => ({
      oracle_id: entry[0],
      quantity: Number(entry[1]) || 1,
      name: entry[2] || ''
    }));
}

function parseCards(raw) {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((entry) => Array.isArray(entry) && entry.length >= 1)
    .map((entry) => ({
      oracle_id: entry[0],
      quantity: Number(entry[1]) || 1,
      name: entry[2] || ''
    }));
}

function parseDeckArray(payload) {
  if (Array.isArray(payload?.decks)) return payload.decks;
  if (Array.isArray(payload)) return payload;
  return [];
}

function parseDeckTextLine(line) {
  const match = String(line || '').trim().match(/^(\d+)\s+(.+?)$/);
  if (!match) return null;
  return {
    quantity: Number(match[1]) || 0,
    name: String(match[2] || '').trim()
  };
}

function combineDeckTextEntries(entries) {
  const combined = new Map();
  for (const entry of entries) {
    if (!entry?.name || !entry?.quantity) continue;
    const key = normalizeText(entry.name);
    if (!key) continue;
    const existing = combined.get(key);
    if (existing) {
      existing.quantity += entry.quantity;
    } else {
      combined.set(key, { ...entry });
    }
  }
  return [...combined.values()];
}

const ARCHIDEKT_EXCLUDED_CATEGORY_NAMES = new Set([
  'sideboard',
  'maybeboard',
  'maybe board',
  'considering',
  'tokens',
  'token',
  'wishlist',
  'wish list',
  'acquireboard',
  'acquire board',
  'companion'
]);

function classifyArchidektItem(item, categories) {
  const categoryNames = Array.isArray(item?.categories)
    ? item.categories.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const normalizedNames = categoryNames.map((name) => name.toLowerCase());

  if (normalizedNames.some((name) => ARCHIDEKT_EXCLUDED_CATEGORY_NAMES.has(name))) {
    return {
      include: false,
      categoryNames
    };
  }

  const includedInDeck = categoryNames.length === 0
    ? true
    : categoryNames.some((name) => categories[name]?.includedInDeck !== false);

  return {
    include: includedInDeck,
    categoryNames
  };
}

function isCommanderLikeArchidektFormat(format) {
  const value = String(format ?? '').trim().toLowerCase();
  if (!value) return true;
  if (value === '3') return true;
  return value.includes('commander') || value.includes('edh');
}

function buildPayloadFromDeckText(text, options = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const groups = [];
  let current = [];
  let currentLabel = '';

  for (const rawLine of lines) {
    const line = String(rawLine || '').trim();
    if (!line) {
      if (current.length > 0) {
        groups.push({ label: currentLabel, lines: current });
        current = [];
        currentLabel = '';
      }
      continue;
    }
    if (/:$/.test(line) && current.length === 0) {
      currentLabel = line.replace(/:$/, '').trim().toLowerCase();
      continue;
    }
    current.push(line);
  }
  if (current.length > 0) {
    groups.push({ label: currentLabel, lines: current });
  }

  if (groups.length === 0) {
    throw new Error('Paste a decklist first.');
  }

  const filteredGroups = groups.filter((group) => group?.label !== 'sideboard');
  const commanderGroup = filteredGroups.at(-1)?.lines || [];
  const mainGroups = filteredGroups.slice(0, -1).map((group) => group.lines || []);
  if (mainGroups.length === 0) {
    throw new Error('Deck text needs a main deck section followed by a commander section.');
  }

  const commanderEntries = combineDeckTextEntries(
    commanderGroup.map(parseDeckTextLine).filter(Boolean)
  );
  const cardEntries = combineDeckTextEntries(
    mainGroups.flat().map(parseDeckTextLine).filter(Boolean)
  );

  if (commanderEntries.length === 0) {
    throw new Error('No commander lines were found in the pasted text.');
  }
  if (cardEntries.length === 0) {
    throw new Error('No main deck card lines were found in the pasted text.');
  }

  return {
    decks: [
      buildNormalizedDeck({
        sourceName: 'manual',
        sourceDeckId: options.sourceDeckId || null,
        sourceUrl: options.sourceUrl || null,
        deckName: options.deckName || null,
        commanders: commanderEntries.map((entry) => ['', entry.quantity, entry.name]),
        cards: cardEntries.map((entry) => ['', entry.quantity, entry.name])
      })
    ]
  };
}

function buildNormalizedDeck({
  sourceName,
  sourceDeckId,
  sourceUrl,
  deckName,
  commanders,
  cards,
  format = null,
  theorycrafted = false
}) {
  return {
    source_name: sourceName,
    source_deck_id: sourceDeckId ? String(sourceDeckId) : null,
    url: sourceUrl || null,
    name: deckName || null,
    commanders,
    cards,
    format,
    theorycrafted: Boolean(theorycrafted)
  };
}

function serializeDeckEntries(entries) {
  if (!Array.isArray(entries)) return '[]';
  return JSON.stringify(
    entries
      .map((entry) => [
        String(entry?.[0] || ''),
        Number(entry?.[1]) || 1,
        String(entry?.[2] || '')
      ])
      .sort((left, right) => {
        const leftKey = `${left[0]}|${left[2]}|${left[1]}`;
        const rightKey = `${right[0]}|${right[2]}|${right[1]}`;
        return leftKey.localeCompare(rightKey);
      })
  );
}

function normalizeArchidektDeckPayload(payload, sourceUrl) {
  const items = Array.isArray(payload?.cards) ? payload.cards : [];
  const commanders = [];
  const cards = [];

  for (const item of items) {
    const rawCard = item?.card || {};
    const oracleCard = rawCard?.oracleCard || {};
    const name = oracleCard?.name || rawCard?.name || '';
    const resolved = resolveMtgCard({
      oracle_id: oracleCard?.uid || rawCard?.uid || '',
      name
    });
    const quantity = Number(item?.quantity) || 1;
    const isCommander = Array.isArray(item?.categories)
      && item.categories.some((category) => String(category?.name || '').toLowerCase() === 'commander');

    const normalizedEntry = resolved?.oracle_id
      ? [resolved.oracle_id, quantity, resolved.name || name || '']
      : [oracleCard?.uid || rawCard?.uid || '', quantity, name];
    if (isCommander) {
      commanders.push(normalizedEntry);
    } else {
      cards.push(normalizedEntry);
    }
  }

  return {
    decks: [
      buildNormalizedDeck({
        sourceName: 'archidekt',
        sourceDeckId: payload?.id,
        sourceUrl,
        deckName: payload?.name,
        commanders,
        cards,
        format: payload?.format,
        theorycrafted: payload?.theorycrafted
      })
    ]
  };
}

function summarizeArchidektDeckPayload(payload) {
  const items = Array.isArray(payload?.cards) ? payload.cards : [];
  let commanderQuantity = 0;
  let nonCommanderQuantity = 0;

  for (const item of items) {
    const quantity = Number(item?.quantity) || 1;
    const categoryNames = Array.isArray(item?.categories)
      ? item.categories.map((category) => String(category?.name || '').toLowerCase())
      : [];
    const isCommander = categoryNames.includes('commander');

    if (isCommander) {
      commanderQuantity += quantity;
    } else {
      nonCommanderQuantity += quantity;
    }
  }

  return {
    commanderQuantity,
    nonCommanderQuantity,
    totalCards: commanderQuantity + nonCommanderQuantity,
    theorycrafted: Boolean(payload?.theorycrafted),
    format: String(payload?.format || '')
  };
}

function normalizeMoxfieldDeckPayload(payload, sourceUrl) {
  const boards = payload?.boards && typeof payload.boards === 'object' ? payload.boards : {};
  const commanders = [];
  const cards = [];

  for (const [boardName, board] of Object.entries(boards)) {
    const entries = board?.cards && typeof board.cards === 'object'
      ? Object.values(board.cards)
      : [];
    const isCommanderBoard = String(boardName || '').toLowerCase().includes('commander');

    for (const entry of entries) {
      const rawCard = entry?.card || {};
      const name = rawCard?.name || '';
      const resolved = resolveMtgCard({
        oracle_id: rawCard?.oracleId || rawCard?.oracle_id || rawCard?.scryfallOracleId || '',
        name
      });
      const quantity = Number(entry?.quantity) || 1;

      const normalizedEntry = resolved?.oracle_id
        ? [resolved.oracle_id, quantity, resolved.name || name || '']
        : [rawCard?.oracleId || rawCard?.oracle_id || rawCard?.scryfallOracleId || '', quantity, name];
      if (isCommanderBoard) {
        commanders.push(normalizedEntry);
      } else {
        cards.push(normalizedEntry);
      }
    }
  }

  return {
    decks: [
      buildNormalizedDeck({
        sourceName: 'moxfield',
        sourceDeckId: payload?.publicId || payload?.id,
        sourceUrl,
        deckName: payload?.name,
        commanders,
        cards
      })
    ]
  };
}

function buildContentHash(sourceName, deck) {
  const seed = [
    sourceName,
    deck.source_deck_id || deck.id || '',
    deck.url || '',
    serializeDeckEntries(deck.commanders || []),
    serializeDeckEntries(deck.cards || []),
    deck.name || ''
  ].join('|');

  return crypto.createHash('sha1').update(seed).digest('hex');
}

function buildSourceIdentity(sourceRow, deck, deckIndex = 0) {
  const sourceName = normalizeText(deck.source_name || sourceRow.source_name || 'unknown').replace(/\s+/g, '-');
  const sourceDeckId = String(deck.source_deck_id || deck.id || '').trim();
  if (sourceDeckId) return `${sourceName}:${sourceDeckId}`;

  const sourceUrl = String(deck.url || '').trim().replace(/[?#].*$/, '').replace(/\/$/, '');
  if (sourceUrl) return `${sourceName}:url:${sourceUrl.toLowerCase()}`;

  return `${sourceName}:source:${sourceRow.source_id}:${deckIndex}`;
}

function buildDeckKey(sourceIdentity) {
  return crypto.createHash('sha1').update(sourceIdentity).digest('hex');
}

function normalizeFingerprintEntries(entries = []) {
  const quantities = new Map();
  for (const entry of entries) {
    const oracleId = String(entry?.oracle_id || entry?.card_oracle_id || '').trim().toLowerCase();
    const quantity = Math.max(0, Number(entry?.quantity || 0));
    if (!oracleId || quantity <= 0) continue;
    quantities.set(oracleId, (quantities.get(oracleId) || 0) + quantity);
  }
  return [...quantities.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function buildCommanderContentFingerprint({ commanders = [], cards = [] } = {}) {
  const seed = JSON.stringify({
    commanders: normalizeFingerprintEntries(commanders),
    cards: normalizeFingerprintEntries(cards)
  });
  return crypto.createHash('sha256').update(seed).digest('hex');
}

export function rebuildCommanderContentFingerprints(options = {}) {
  const onlyMissing = Boolean(options.onlyMissing);
  const decks = db.prepare(`
    SELECT deck_key
    FROM mtg_commander_corpus_decks
    ${onlyMissing ? "WHERE content_fingerprint IS NULL OR trim(content_fingerprint) = ''" : ''}
    ORDER BY deck_key
  `).all();
  const selectCards = db.prepare(`
    SELECT card_oracle_id, quantity, is_commander
    FROM mtg_commander_corpus_cards
    WHERE deck_key = ?
    ORDER BY is_commander DESC, card_oracle_id
  `);
  const updateFingerprint = db.prepare(`
    UPDATE mtg_commander_corpus_decks
    SET content_fingerprint = ?
    WHERE deck_key = ?
  `);

  const update = db.transaction(() => {
    for (const deck of decks) {
      const rows = selectCards.all(deck.deck_key);
      if (rows.length === 0) continue;
      updateFingerprint.run(buildCommanderContentFingerprint({
        commanders: rows.filter((row) => Number(row.is_commander) === 1),
        cards: rows.filter((row) => Number(row.is_commander) === 0)
      }), deck.deck_key);
    }

    db.prepare('UPDATE mtg_commander_corpus_decks SET chemistry_weight = 0').run();
    db.prepare(`
      UPDATE mtg_commander_corpus_decks
      SET chemistry_weight = 1
      WHERE lifecycle_status = 'active'
        AND quality_status = 'valid'
        AND content_fingerprint IS NOT NULL
        AND deck_key = (
          SELECT MIN(candidate.deck_key)
          FROM mtg_commander_corpus_decks candidate
          WHERE candidate.lifecycle_status = 'active'
            AND candidate.quality_status = 'valid'
            AND candidate.content_fingerprint = mtg_commander_corpus_decks.content_fingerprint
        )
    `).run();
  });
  update();

  const summary = db.prepare(`
    SELECT
      SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' THEN 1 ELSE 0 END) active_observations,
      SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' AND chemistry_weight > 0 THEN 1 ELSE 0 END) unique_configurations
    FROM mtg_commander_corpus_decks
  `).get();
  const activeObservations = Number(summary?.active_observations || 0);
  const uniqueConfigurations = Number(summary?.unique_configurations || 0);
  return {
    updated: decks.length,
    active_observations: activeObservations,
    unique_configurations: uniqueConfigurations,
    duplicate_observations: Math.max(0, activeObservations - uniqueConfigurations)
  };
}

export function setCommanderPipelineFreshness(key, value = nowIso()) {
  db.prepare(`
    INSERT INTO mtg_commander_pipeline_meta (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(String(key), typeof value === 'string' ? value : JSON.stringify(value));
}

export function getCommanderPipelineFreshness() {
  return Object.fromEntries(db.prepare('SELECT key, value FROM mtg_commander_pipeline_meta ORDER BY key').all()
    .map((row) => [row.key, row.value]));
}

export function classifyCommanderRejectionReason(notes = []) {
  const values = Array.isArray(notes) ? notes : String(notes || '').split(',').filter(Boolean);
  if (values.some((note) => note.startsWith('commander:unresolved'))) return 'unresolved_commander';
  if (values.some((note) => note.startsWith('commander:invalid'))) return 'invalid_commander';
  if (values.some((note) => note.startsWith('format:'))) return 'non_commander_deck';
  if (values.some((note) => note === 'theorycrafted')) return 'non_commander_deck';
  if (values.some((note) => note.startsWith('unresolved:'))) return 'missing_cards';
  if (values.some((note) => note.startsWith('size:') || note.startsWith('commanders:'))) return 'malformed_deck';
  if (values.some((note) => note.startsWith('duplicate:'))) return 'duplicate';
  if (values.some((note) => note.startsWith('encoding:'))) return 'encoding_corruption';
  if (values.some((note) => note.startsWith('retired:'))) return 'retired_source';
  return values.length > 0 ? 'other' : null;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function loadCommanderSourceManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  const raw = readJson(manifestPath);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry) => entry && entry.location && entry.source_type)
    .map((entry) => ({
      source_id: toSourceId(entry),
      label: entry.label || path.basename(entry.location),
      source_type: entry.source_type,
      source_name: entry.source_name || 'archidekt',
      location: entry.location
    }));
}

export function syncCommanderCorpusSources(entries) {
  ensureCommanderCorpusTables();
  const normalizedEntries = entries
    .filter((entry) => entry && entry.location && entry.source_type)
    .map((entry) => ({
      ...entry,
      source_id: toSourceId(entry)
    }));

  const transaction = db.transaction((items) => {
    for (const entry of items) {
      const existing = selectSourceStmt.get(entry.source_id);
      const timestamp = existing?.created_at || nowIso();
      upsertSourceStmt.run({
        source_id: entry.source_id,
        label: entry.label,
        source_type: entry.source_type,
        source_name: entry.source_name || existing?.source_name || 'archidekt',
        location: entry.location,
        status: existing?.status || 'queued',
        downloaded_path: existing?.downloaded_path || null,
        total_decks: existing?.total_decks || 0,
        imported_decks: existing?.imported_decks || 0,
        last_error: existing?.last_error || null,
        created_at: timestamp,
        updated_at: nowIso(),
        last_started_at: existing?.last_started_at || null,
        last_finished_at: existing?.last_finished_at || null
      });
    }
  });

  transaction(normalizedEntries);
  return listSourcesStmt.all();
}

export function cleanupCommanderCorpusSourceQueue() {
  ensureCommanderCorpusTables();
  const deleteNullQueued = db.prepare(`
    DELETE FROM mtg_commander_corpus_sources
    WHERE source_id IS NULL
      AND source_name = 'archidekt'
      AND source_type = 'archidekt_deck'
      AND status = 'queued'
  `);

  const deleteQueuedDuplicates = db.prepare(`
    DELETE FROM mtg_commander_corpus_sources
    WHERE rowid NOT IN (
      SELECT MIN(rowid)
      FROM mtg_commander_corpus_sources
      GROUP BY COALESCE(source_id, ''), location, source_type, source_name, status
    )
      AND source_name = 'archidekt'
      AND source_type = 'archidekt_deck'
      AND status = 'queued'
  `);

  const nullQueued = deleteNullQueued.run().changes;
  const duplicateQueued = deleteQueuedDuplicates.run().changes;

  return {
    nullQueued,
    duplicateQueued
  };
}

async function fetchToFile(url, downloadsDir, sourceId) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }

  const filePath = path.join(downloadsDir, `${sourceId}.json`);
  const text = await response.text();
  fs.writeFileSync(filePath, text, 'utf8');
  return filePath;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (isCloudflareBlockPage(text)) {
    throw new Error(`Cloudflare blocked access to ${url}`);
  }
  return readJsonText(text);
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
      'User-Agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  if (isCloudflareBlockPage(text)) {
    throw new Error(`Cloudflare blocked access to ${url}`);
  }
  return text;
}

function extractArchidektDeckPayload(html, sourceUrl) {
  if (typeof html !== 'string' || !html.trim()) {
    throw new Error(`Archidekt deck page was empty: ${sourceUrl}`);
  }

  const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/i);
  if (!nextDataMatch?.[1]) {
    throw new Error(`Archidekt deck page did not contain __NEXT_DATA__: ${sourceUrl}`);
  }

  let nextData;
  try {
    nextData = JSON.parse(nextDataMatch[1]);
  } catch (error) {
    throw new Error(`Failed to parse Archidekt __NEXT_DATA__: ${error.message}`);
  }

  const deck = nextData?.props?.pageProps?.redux?.deck;
  if (!deck || typeof deck !== 'object') {
    throw new Error(`Archidekt __NEXT_DATA__ did not contain deck payload: ${sourceUrl}`);
  }

  const categories = deck.categories && typeof deck.categories === 'object' ? deck.categories : {};
  const cardMap = deck.cardMap && typeof deck.cardMap === 'object' ? deck.cardMap : {};
  const items = [];

  for (const card of Object.values(cardMap)) {
    const { include, categoryNames } = classifyArchidektItem(card, categories);
    if (!include) continue;

    items.push({
      quantity: Number(card?.qty) || 1,
      categories: categoryNames.map((name) => ({ name })),
      card: {
        uid: card?.uid || '',
        name: card?.name || '',
        oracleCard: {
          uid: card?.oracleCardUid || '',
          name: card?.name || ''
        }
      }
    });
  }

  return {
    id: deck.id,
    name: deck.name,
    format: deck.format,
    theorycrafted: Boolean(deck.theorycrafted),
    cards: items
  };
}

function importDeckPayload(sourceRow, payload) {
  const decks = parseDeckArray(payload);
  const importedAt = nowIso();
  let importedDecks = 0;
  const importedSourceIdentities = [];

  const transaction = db.transaction(() => {
    for (const [deckIndex, deck] of decks.entries()) {
      const rawCommanders = parseCommanders(deck.commanders);
      const rawCards = parseCards(deck.cards);
      const unresolvedCommanders = [];
      const unresolvedCards = [];
      const commanders = rawCommanders
        .map((entry) => {
          const resolved = resolveMtgCard(entry);
          if (!resolved) {
            unresolvedCommanders.push(entry.name || entry.oracle_id || 'Unknown commander');
            return null;
          }
          return {
            oracle_id: resolved.oracle_id,
            quantity: Number(entry.quantity) || 1,
            name: resolved.name || entry.name || '',
            type_line: resolved.type_line || '',
            oracle_text: resolved.oracle_text || ''
          };
        })
        .filter(Boolean);
      const cards = rawCards
        .map((entry) => {
          const resolved = resolveMtgCard(entry);
          if (!resolved) {
            unresolvedCards.push(entry.name || entry.oracle_id || 'Unknown card');
            return null;
          }
          return {
            oracle_id: resolved.oracle_id,
            quantity: Number(entry.quantity) || 1,
            name: resolved.name || entry.name || ''
          };
        })
        .filter(Boolean);
      const primaryCommander = commanders.find((entry) => UUID_RE.test(String(entry.oracle_id || '')));
      const commanderQuantity = rawCommanders.reduce((sum, entry) => sum + (Number(entry.quantity) || 1), 0);
      const nonCommanderQuantity = rawCards.reduce((sum, entry) => sum + (Number(entry.quantity) || 1), 0);
      const totalCards = commanderQuantity + nonCommanderQuantity;
      const notes = [];
      if (!primaryCommander?.oracle_id) {
        notes.push('commander:unresolved');
      } else if (!canResolvedCardBeCommander(primaryCommander)) {
        notes.push('commander:invalid');
      }
      const unresolvedEntries = [...unresolvedCommanders, ...unresolvedCards];
      if (unresolvedEntries.length > 0) {
        notes.push(`unresolved:${unresolvedEntries.length}`);
        notes.push(`names:${unresolvedEntries.join('|')}`);
      }
      if (totalCards !== 100) notes.push(`size:${totalCards}`);
      if (commanderQuantity < 1 || commanderQuantity > 2) notes.push(`commanders:${commanderQuantity}`);
      if (deck.theorycrafted) notes.push('theorycrafted');
      if (!isCommanderLikeArchidektFormat(deck.format)) notes.push(`format:${deck.format || 'unknown'}`);
      const qualityStatus = notes.length === 0 ? 'valid' : 'invalid';
      const lifecycleStatus = qualityStatus === 'valid' ? 'active' : 'quarantined';
      const contentFingerprint = buildCommanderContentFingerprint({ commanders, cards });

      const sourceIdentity = buildSourceIdentity(sourceRow, deck, deckIndex);
      const existingDeck = selectDeckBySourceIdentityStmt.get(sourceIdentity);
      const deckKey = existingDeck?.deck_key || buildDeckKey(sourceIdentity);
      const commanderName = primaryCommander?.name
        || rawCommanders[0]?.name
        || 'Unresolved Commander';
      importedSourceIdentities.push(sourceIdentity);
      insertDeckStmt.run({
        deck_key: deckKey,
        source_id: sourceRow.source_id,
        source_name: sourceRow.source_name,
        source_deck_id: deck.source_deck_id ? String(deck.source_deck_id) : null,
        source_url: deck.url || null,
        deck_name: deck.name || null,
        commander_oracle_id: primaryCommander?.oracle_id || `unresolved:${crypto.createHash('sha1').update(commanderName).digest('hex').slice(0, 20)}`,
        commander_name: commanderName,
        commander_name_normalized: normalizeText(commanderName),
        total_cards: totalCards,
        unresolved_cards: unresolvedEntries.length,
        quality_status: qualityStatus,
        validation_notes: notes.length ? notes.join(',') : null,
        source_identity: sourceIdentity,
        content_hash: buildContentHash(sourceRow.source_name, deck),
        content_fingerprint: contentFingerprint,
        chemistry_weight: 0,
        lifecycle_status: lifecycleStatus,
        rejection_reason: classifyCommanderRejectionReason(notes),
        last_validated_at: importedAt,
        retired_at: null,
        imported_at: importedAt
      });
      deleteDeckCardsStmt.run(deckKey);
      if (qualityStatus === 'valid') importedDecks += 1;

      for (const commander of commanders) {
        if (!UUID_RE.test(String(commander.oracle_id || ''))) continue;
        insertCardStmt.run({
          deck_key: deckKey,
          card_oracle_id: commander.oracle_id,
          card_name: commander.name || null,
          quantity: Number(commander.quantity) || 1,
          is_commander: 1
        });
      }

      const commanderIds = new Set(commanders.map((entry) => String(entry.oracle_id || '')));
      for (const card of cards) {
        if (!UUID_RE.test(String(card.oracle_id || ''))) continue;
        if (commanderIds.has(String(card.oracle_id))) continue;
        insertCardStmt.run({
          deck_key: deckKey,
          card_oracle_id: card.oracle_id,
          card_name: card.name || null,
          quantity: Number(card.quantity) || 1,
          is_commander: 0
        });
      }
    }

    const currentIdentities = new Set(importedSourceIdentities);
    for (const existingDeck of selectDecksBySourceStmt.all(sourceRow.source_id)) {
      if (currentIdentities.has(existingDeck.source_identity)) continue;
      retireDeckStmt.run({
        deck_key: existingDeck.deck_key,
        reason: 'retired_source',
        note: 'retired:missing_from_source',
        timestamp: importedAt
      });
    }
  });

  transaction();
  rebuildCommanderContentFingerprints();
  return { totalDecks: decks.length, importedDecks, sourceIdentities: importedSourceIdentities };
}

export function importCommanderDeckPayload(source, payload) {
  ensureCommanderCorpusTables();
  const timestamp = nowIso();
  const sourceRow = {
    source_id: source.source_id || toSourceId(source),
    label: source.label || source.source_deck_id || 'Commander deck fixture',
    source_type: source.source_type || 'fixture',
    source_name: source.source_name || 'archidekt',
    location: source.location || source.source_url || `fixture://${source.source_id || 'deck'}`,
    status: 'running',
    downloaded_path: null,
    total_decks: 0,
    imported_decks: 0,
    last_error: null,
    created_at: timestamp,
    updated_at: timestamp,
    last_started_at: timestamp,
    last_finished_at: null
  };
  upsertSourceStmt.run(sourceRow);
  const result = importDeckPayload(sourceRow, payload);
  upsertSourceStmt.run({
    ...sourceRow,
    status: 'done',
    total_decks: result.totalDecks,
    imported_decks: result.importedDecks,
    updated_at: nowIso(),
    last_finished_at: nowIso()
  });
  return {
    ...result,
    source_id: sourceRow.source_id,
    decks: selectDecksBySourceStmt.all(sourceRow.source_id)
  };
}

export function retireCommanderSourceDecks(sourceId, reason = 'retired_source') {
  ensureCommanderCorpusTables();
  const timestamp = nowIso();
  let retired = 0;
  const transaction = db.transaction(() => {
    for (const deck of selectDecksBySourceStmt.all(sourceId)) {
      retired += retireDeckStmt.run({
        deck_key: deck.deck_key,
        reason,
        note: `retired:${reason}`,
        timestamp
      }).changes;
    }
  });
  transaction();
  rebuildCommanderContentFingerprints();
  return retired;
}

export function revalidateStoredCommanderDecks() {
  ensureCommanderCorpusTables();
  const timestamp = nowIso();
  const rows = db.prepare(`
    SELECT
      decks.*,
      COALESCE(SUM(cards.quantity), 0) stored_card_total,
      COALESCE(SUM(CASE WHEN cards.is_commander = 1 THEN cards.quantity ELSE 0 END), 0) stored_commander_total,
      COUNT(cards.card_oracle_id) stored_card_rows
    FROM mtg_commander_corpus_decks decks
    LEFT JOIN mtg_commander_corpus_cards cards ON cards.deck_key = decks.deck_key
    WHERE decks.lifecycle_status <> 'retired'
    GROUP BY decks.deck_key
  `).all();
  let active = 0;
  let quarantined = 0;
  let skippedWithoutCards = 0;

  const transaction = db.transaction(() => {
    for (const row of rows) {
      if (Number(row.stored_card_rows || 0) === 0) {
        skippedWithoutCards += 1;
        continue;
      }

      const resolvedCommander = resolveMtgCard({
        oracle_id: row.commander_oracle_id,
        name: row.commander_name
      });
      const notes = [];
      if (!resolvedCommander) notes.push('commander:unresolved');
      else if (!canResolvedCardBeCommander(resolvedCommander)) notes.push('commander:invalid');
      if (Number(row.unresolved_cards || 0) > 0) notes.push(`unresolved:${Number(row.unresolved_cards)}`);
      if (Number(row.stored_card_total || 0) !== 100) notes.push(`size:${Number(row.stored_card_total || 0)}`);
      if (Number(row.stored_commander_total || 0) < 1 || Number(row.stored_commander_total || 0) > 2) {
        notes.push(`commanders:${Number(row.stored_commander_total || 0)}`);
      }

      const qualityStatus = notes.length === 0 ? 'valid' : 'invalid';
      const lifecycleStatus = qualityStatus === 'valid' ? 'active' : 'quarantined';
      updateDeckValidationStmt.run({
        deck_key: row.deck_key,
        commander_oracle_id: resolvedCommander?.oracle_id || row.commander_oracle_id,
        commander_name: resolvedCommander?.name || row.commander_name,
        commander_name_normalized: normalizeText(resolvedCommander?.name || row.commander_name),
        total_cards: Number(row.stored_card_total || 0),
        quality_status: qualityStatus,
        validation_notes: notes.length > 0 ? notes.join(',') : null,
        lifecycle_status: lifecycleStatus,
        rejection_reason: classifyCommanderRejectionReason(notes),
        last_validated_at: timestamp
      });
      if (lifecycleStatus === 'active') active += 1;
      else quarantined += 1;
    }
  });
  transaction();

  rebuildCommanderContentFingerprints();

  return { checked: rows.length - skippedWithoutCards, active, quarantined, skippedWithoutCards };
}

export async function importCommanderDeckText(text, options = {}) {
  ensureCommanderCorpusTables();

  const payload = buildPayloadFromDeckText(text, options);
  const sourceId = crypto.createHash('sha1')
    .update(`manual_text:${options.deckName || ''}:${payload.decks[0]?.name || ''}:${JSON.stringify(payload.decks[0]?.commanders || [])}:${JSON.stringify(payload.decks[0]?.cards || [])}`)
    .digest('hex')
    .slice(0, 16);

  const sourceRow = {
    source_id: sourceId,
    label: options.label || options.deckName || 'Manual deck paste',
    source_type: 'manual_text',
    source_name: 'manual',
    location: options.sourceUrl || `manual://paste/${sourceId}`,
    status: 'queued',
    downloaded_path: null,
    total_decks: 0,
    imported_decks: 0,
    last_error: null,
    created_at: nowIso(),
    updated_at: nowIso(),
    last_started_at: null,
    last_finished_at: null
  };

  upsertSourceStmt.run(sourceRow);
  const result = importDeckPayload(sourceRow, payload);
  const importedDeck = selectDecksBySourceStmt.get(sourceId);

  upsertSourceStmt.run({
    ...sourceRow,
    status: 'done',
    total_decks: result.totalDecks,
    imported_decks: result.importedDecks,
    updated_at: nowIso(),
    last_started_at: nowIso(),
    last_finished_at: nowIso()
  });

  return {
    ...result,
    source_id: sourceId,
    deck: importedDeck || null
  };
}

export async function processCommanderCorpusSource(sourceId, options = {}) {
  ensureCommanderCorpusTables();
  const sourceRow = selectSourceStmt.get(sourceId);
  if (!sourceRow) {
    throw new Error(`Source not found: ${sourceId}`);
  }

  const downloadsDir = options.downloadsDir || path.join(process.cwd(), 'tmp', 'commander-ingest', 'downloads');
  ensureDir(downloadsDir);

  upsertSourceStmt.run({
    ...sourceRow,
    status: 'running',
    updated_at: nowIso(),
    last_started_at: nowIso(),
    last_error: null
  });

  try {
    let filePath = sourceRow.downloaded_path;
    let payload = null;
    if (sourceRow.source_type === 'url') {
      filePath = await fetchToFile(sourceRow.location, downloadsDir, sourceId);
      payload = readJson(filePath);
    } else if (sourceRow.source_type === 'archidekt_deck') {
      const rawPayload = extractArchidektDeckPayload(await fetchText(sourceRow.location), sourceRow.location);
      payload = normalizeArchidektDeckPayload(rawPayload, sourceRow.location);
    } else if (sourceRow.source_type === 'moxfield_deck') {
      payload = normalizeMoxfieldDeckPayload(
        await fetchJson(sourceRow.location),
        sourceRow.location
      );
    } else {
      filePath = sourceRow.location;
      payload = readJson(filePath);
    }
    const result = importDeckPayload(sourceRow, payload);

    upsertSourceStmt.run({
      ...sourceRow,
      status: 'done',
      downloaded_path: filePath,
      total_decks: result.totalDecks,
      imported_decks: result.importedDecks,
      last_error: null,
      updated_at: nowIso(),
      last_started_at: sourceRow.last_started_at || nowIso(),
      last_finished_at: nowIso()
    });

    return {
      source_id: sourceId,
      status: 'done',
      file_path: filePath,
      total_decks: result.totalDecks,
      imported_decks: result.importedDecks
    };
  } catch (error) {
    const errorMessage = String(error?.message || error || 'Unknown error');
    const isDeadArchidektDeck = sourceRow.source_name === 'archidekt'
      && sourceRow.source_type === 'archidekt_deck'
      && /Download failed: 404\b/i.test(errorMessage);

    upsertSourceStmt.run({
      ...sourceRow,
      status: isDeadArchidektDeck ? 'done' : 'error',
      downloaded_path: sourceRow.downloaded_path || null,
      total_decks: sourceRow.total_decks || 0,
      imported_decks: sourceRow.imported_decks || 0,
      last_error: isDeadArchidektDeck ? null : errorMessage,
      updated_at: nowIso(),
      last_started_at: sourceRow.last_started_at || nowIso(),
      last_finished_at: nowIso()
    });

    if (isDeadArchidektDeck) {
      const retiredDecks = retireCommanderSourceDecks(sourceId, 'source_not_found');
      return {
        source_id: sourceId,
        status: 'done',
        skipped: true,
        skipped_reason: 'dead_link:404',
        total_decks: 0,
        imported_decks: 0,
        retired_decks: retiredDecks
      };
    }

    throw error;
  }
}

export function getCommanderCorpusStatus() {
  ensureCommanderCorpusTables();
  const sources = listSourcesStmt.all();
  const totals = db.prepare(`
    SELECT
      COUNT(*) AS deck_count,
      COUNT(DISTINCT commander_oracle_id) AS commander_count,
      SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' THEN 1 ELSE 0 END) AS usable_deck_count,
      SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' AND chemistry_weight > 0 THEN 1 ELSE 0 END) AS unique_configuration_count,
      SUM(CASE WHEN lifecycle_status = 'quarantined' THEN 1 ELSE 0 END) AS invalid_deck_count,
      SUM(CASE WHEN lifecycle_status = 'retired' THEN 1 ELSE 0 END) AS retired_deck_count
    FROM mtg_commander_corpus_decks
  `).get();
  const cardTotals = db.prepare(`
    SELECT COUNT(*) AS card_row_count
    FROM mtg_commander_corpus_cards
    WHERE is_commander = 0
  `).get();

  return {
    deck_count: Number(totals?.deck_count || 0),
    commander_count: Number(totals?.commander_count || 0),
    usable_deck_count: Number(totals?.usable_deck_count || 0),
    unique_configuration_count: Number(totals?.unique_configuration_count || 0),
    duplicate_observation_count: Math.max(0, Number(totals?.usable_deck_count || 0) - Number(totals?.unique_configuration_count || 0)),
    invalid_deck_count: Number(totals?.invalid_deck_count || 0),
    retired_deck_count: Number(totals?.retired_deck_count || 0),
    card_row_count: Number(cardTotals?.card_row_count || 0),
    source_replay_failures: sources.filter((source) => source.status === 'error').length,
    freshness: getCommanderPipelineFreshness(),
    sources: sources.map((source) => ({
      source_id: source.source_id,
      label: source.label,
      source_name: source.source_name,
      source_type: source.source_type,
      location: source.location,
      status: source.status,
      total_decks: source.total_decks,
      imported_decks: source.imported_decks,
      last_error: source.last_error,
      updated_at: source.updated_at,
      last_finished_at: source.last_finished_at
    }))
  };
}

