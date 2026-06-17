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
  `);

  ensureColumn('mtg_commander_corpus_decks', 'total_cards', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('mtg_commander_corpus_decks', 'unresolved_cards', 'INTEGER NOT NULL DEFAULT 0');
  ensureColumn('mtg_commander_corpus_decks', 'quality_status', `TEXT NOT NULL DEFAULT 'unknown'`);
  ensureColumn('mtg_commander_corpus_decks', 'validation_notes', 'TEXT');
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
    unresolved_cards, quality_status, validation_notes, imported_at
  ) VALUES (
    @deck_key, @source_id, @source_name, @source_deck_id, @source_url, @deck_name,
    @commander_oracle_id, @commander_name, @commander_name_normalized, @total_cards,
    @unresolved_cards, @quality_status, @validation_notes, @imported_at
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
  cards
}) {
  return {
    source_name: sourceName,
    source_deck_id: sourceDeckId ? String(sourceDeckId) : null,
    url: sourceUrl || null,
    name: deckName || null,
    commanders,
    cards
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

    if (!resolved?.oracle_id) continue;

    const normalizedEntry = [resolved.oracle_id, quantity, resolved.name || name || ''];
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
        cards
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

      if (!resolved?.oracle_id) continue;

      const normalizedEntry = [resolved.oracle_id, quantity, resolved.name || name || ''];
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

function buildDeckKey(sourceName, deck) {
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

  const transaction = db.transaction(() => {
    for (const deck of decks) {
      const rawCommanders = parseCommanders(deck.commanders);
      const rawCards = parseCards(deck.cards);
      const unresolvedEntries = [];
      const commanders = rawCommanders
        .map((entry) => {
          const resolved = resolveMtgCard(entry);
          if (!resolved) {
            unresolvedEntries.push(entry.name || entry.oracle_id || 'Unknown commander');
            return null;
          }
          return {
            oracle_id: resolved.oracle_id,
            quantity: Number(entry.quantity) || 1,
            name: resolved.name || entry.name || ''
          };
        })
        .filter(Boolean);
      const cards = rawCards
        .map((entry) => {
          const resolved = resolveMtgCard(entry);
          if (!resolved) {
            unresolvedEntries.push(entry.name || entry.oracle_id || 'Unknown card');
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
      if (!primaryCommander?.oracle_id) continue;

      const commanderQuantity = commanders.reduce((sum, entry) => sum + (Number(entry.quantity) || 1), 0);
      const nonCommanderQuantity = cards.reduce((sum, entry) => sum + (Number(entry.quantity) || 1), 0);
      const totalCards = commanderQuantity + nonCommanderQuantity;
      const notes = [];
      if (!canResolvedCardBeCommander(primaryCommander)) {
        notes.push('commander:invalid');
      }
      if (unresolvedEntries.length > 0) {
        notes.push(`unresolved:${unresolvedEntries.length}`);
        notes.push(`names:${unresolvedEntries.join('|')}`);
      }
      if (totalCards !== 100) notes.push(`size:${totalCards}`);
      if (commanderQuantity < 1 || commanderQuantity > 2) notes.push(`commanders:${commanderQuantity}`);
      const qualityStatus = notes.length === 0 ? 'clean' : 'invalid';

      const deckKey = buildDeckKey(sourceRow.source_name, deck);
      insertDeckStmt.run({
        deck_key: deckKey,
        source_id: sourceRow.source_id,
        source_name: sourceRow.source_name,
        source_deck_id: deck.source_deck_id ? String(deck.source_deck_id) : null,
        source_url: deck.url || null,
        deck_name: deck.name || null,
        commander_oracle_id: primaryCommander.oracle_id,
        commander_name: primaryCommander.name || 'Unknown Commander',
        commander_name_normalized: normalizeText(primaryCommander.name || 'Unknown Commander'),
        total_cards: totalCards,
        unresolved_cards: unresolvedEntries.length,
        quality_status: qualityStatus,
        validation_notes: notes.length ? notes.join(',') : null,
        imported_at: importedAt
      });
      deleteDeckCardsStmt.run(deckKey);
      if (qualityStatus !== 'clean') {
        continue;
      }

      importedDecks += 1;

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
  });

  transaction();
  return { totalDecks: decks.length, importedDecks };
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
      const summary = summarizeArchidektDeckPayload(rawPayload);
      const formatLooksCommander = isCommanderLikeArchidektFormat(summary.format);
      const shouldSkip = summary.totalCards !== 100
        || summary.commanderQuantity < 1
        || summary.commanderQuantity > 2
        || summary.theorycrafted
        || !formatLooksCommander;

      if (shouldSkip) {
        const skipNotes = [];
        if (summary.totalCards !== 100) skipNotes.push(`size:${summary.totalCards}`);
        if (summary.commanderQuantity < 1 || summary.commanderQuantity > 2) skipNotes.push(`commanders:${summary.commanderQuantity}`);
        if (summary.theorycrafted) skipNotes.push('theorycrafted');
        if (!formatLooksCommander) skipNotes.push(`format:${summary.format || 'unknown'}`);

        upsertSourceStmt.run({
          ...sourceRow,
          status: 'done',
          downloaded_path: filePath,
          total_decks: 1,
          imported_decks: 0,
          last_error: null,
          updated_at: nowIso(),
          last_started_at: sourceRow.last_started_at || nowIso(),
          last_finished_at: nowIso()
        });

        return {
          source_id: sourceId,
          status: 'done',
          skipped: true,
          skipped_reason: skipNotes.join(',') || 'invalid_shape',
          total_decks: 1,
          imported_decks: 0
        };
      }

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
      return {
        source_id: sourceId,
        status: 'done',
        skipped: true,
        skipped_reason: 'dead_link:404',
        total_decks: 0,
        imported_decks: 0
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
      SUM(CASE WHEN quality_status IN ('clean', 'repaired') THEN 1 ELSE 0 END) AS usable_deck_count,
      SUM(CASE WHEN quality_status = 'invalid' THEN 1 ELSE 0 END) AS invalid_deck_count
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
    invalid_deck_count: Number(totals?.invalid_deck_count || 0),
    card_row_count: Number(cardTotals?.card_row_count || 0),
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

