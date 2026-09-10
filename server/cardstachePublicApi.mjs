import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { canonicalGame, rankCatalogResults } from '../src/services/search/searchCore.js';
import { buildCardIdentity, normalizeFinish } from '../src/services/pricing/cardIdentity.js';
import { pricingOwner } from '../src/services/pricing/pricingOwner.js';
import { ensureMtgSearchIndex, searchMtgAdvancedIndex, searchMtgIndex } from './mtgSearchIndex.mjs';
import { ensurePokemonSearchIndex, searchPokemonAdvancedIndex, searchPokemonIndex } from './pokemonSearchIndex.mjs';
import { ensureYugiohSearchIndex, searchYugiohAdvancedIndex, searchYugiohIndex } from './yugiohSearchIndex.mjs';
import { ensureFabSearchIndex, searchFabAdvancedIndex, searchFabIndex } from './fabSearchIndex.mjs';
import { ensureLorcanaSearchIndex, searchLorcanaAdvancedIndex, searchLorcanaIndex } from './lorcanaSearchIndex.mjs';
import { ensureOnePieceSearchIndex, searchOnePieceAdvancedIndex, searchOnePieceIndex } from './onepieceSearchIndex.mjs';
import { ensureStarWarsSearchIndex, searchStarWarsAdvancedIndex, searchStarWarsIndex } from './starwarsSearchIndex.mjs';

const API_VERSION = '1';
const PUBLIC_DATA_ROOT = path.join(process.cwd(), 'public', 'data');
const PUBLIC_DATA_BASE_URL = String(
  process.env.MPM_PUBLIC_DATA_BASE_URL
  || 'https://wwvvyrhlybwijqlhubdv.supabase.co/storage/v1/object/public/main-phase-market-public/data'
).replace(/\/+$/, '');
const SUPPORTED_GAMES = new Set(['magic', 'pokemon', 'yugioh', 'lorcana', 'onepiece', 'flesh_and_blood', 'starwars']);
const SEARCH_LIMIT_DEFAULT = 9;
const SEARCH_LIMIT_MAX = 45;
const SEARCH_SOURCE_LIMIT = 500;
const SUMMARY_BATCH_MAX = 100;
const PRICING_BATCH_MAX = 200;
const RATE_WINDOW_MS = 60_000;
const RATE_LIMIT = Math.max(20, Number(process.env.MPM_PUBLIC_API_RATE_LIMIT || 120));
const RATE_BUCKETS = new Map();
const sourceCache = new Map();
const mtgLiteCache = { promise: null, rows: null, byId: null, byGroup: null };
const mtgFallbackDetailCache = new Map();
const mtgPrintingShardCache = new Map();
const setMetadataCache = new Map();

const gameAdapters = {
  magic: { ensure: ensureMtgSearchIndex, search: searchMtgIndex, advanced: searchMtgAdvancedIndex },
  pokemon: { ensure: ensurePokemonSearchIndex, search: searchPokemonIndex, advanced: searchPokemonAdvancedIndex },
  yugioh: { ensure: ensureYugiohSearchIndex, search: searchYugiohIndex, advanced: searchYugiohAdvancedIndex },
  flesh_and_blood: { ensure: ensureFabSearchIndex, search: searchFabIndex, advanced: searchFabAdvancedIndex },
  lorcana: { ensure: ensureLorcanaSearchIndex, search: searchLorcanaIndex, advanced: searchLorcanaAdvancedIndex },
  onepiece: { ensure: ensureOnePieceSearchIndex, search: searchOnePieceIndex, advanced: searchOnePieceAdvancedIndex },
  starwars: { ensure: ensureStarWarsSearchIndex, search: searchStarWarsIndex, advanced: searchStarWarsAdvancedIndex }
};

const allowedFilters = new Set(['name', 'set', 'collectorNumber', 'type', 'rarity', 'language', 'exact', 'gameFields']);
const allowedGameFields = {
  magic: new Set(['oracleText', 'colors', 'cmc', 'power', 'toughness']),
  pokemon: new Set(['supertype', 'types']),
  yugioh: new Set(['race', 'attribute', 'atk', 'def', 'level', 'archetype']),
  lorcana: new Set(['ink', 'cost', 'strength', 'willpower', 'lore']),
  onepiece: new Set(['colors', 'category', 'cost', 'power', 'effect']),
  flesh_and_blood: new Set(['color', 'pitch', 'cost', 'power', 'defense', 'types']),
  starwars: new Set(['aspects', 'traits', 'cost', 'power', 'hp', 'arena'])
};

class PublicApiError extends Error {
  constructor(status, code, message, retryable = false, retryAfterSeconds = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function requestId(req) {
  return String(req.headers['x-request-id'] || '').trim().slice(0, 128) || crypto.randomUUID();
}

function isoNow() {
  return new Date().toISOString();
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function manifestFor(game) {
  const assetGame = game === 'magic' ? 'mtg' : game === 'flesh_and_blood' ? 'fab' : game;
  const preferred = game === 'magic' ? 'search-lite-manifest.json' : 'cards-manifest.json';
  return readJson(path.join(PUBLIC_DATA_ROOT, assetGame, preferred), {}) || {};
}

function imageManifestFor(game) {
  const assetGame = game === 'magic' ? 'mtg' : game === 'flesh_and_blood' ? 'fab' : game;
  return readJson(path.join(PUBLIC_DATA_ROOT, assetGame, 'images', 'mirror-manifest.json'), {}) || {};
}

function generatedAtOf(value) {
  return value?.generated_at || value?.generatedAt || value?.source_meta?.exportedAt || null;
}

function hashVersion(prefix, value) {
  return `${prefix}-${crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex').slice(0, 16)}`;
}

function catalogVersion(game) {
  const manifest = manifestFor(game);
  return hashVersion(`${game}-catalog`, {
    generatedAt: generatedAtOf(manifest),
    count: manifest.final_card_count ?? manifest.imported_cards ?? manifest.printing_count ?? 0
  });
}

function imageVersion(game) {
  const manifest = imageManifestFor(game);
  const generatedAt = generatedAtOf(manifest);
  return generatedAt ? hashVersion(`${game}-images`, { generatedAt }) : null;
}

function pricingSnapshot() {
  return readJson(path.join(PUBLIC_DATA_ROOT, 'site', 'pricing-snapshot.json'), {}) || {};
}

function pricingVersion() {
  const snapshot = pricingSnapshot();
  return generatedAtOf(snapshot) ? hashVersion('pricing', { generatedAt: generatedAtOf(snapshot), status: snapshot.status }) : null;
}

function dataVersion(game = null) {
  if (game) return catalogVersion(game);
  return hashVersion('catalog', [...SUPPORTED_GAMES].map((key) => catalogVersion(key)));
}

function envelope(data, req, game = null) {
  return {
    apiVersion: API_VERSION,
    requestId: requestId(req),
    generatedAt: isoNow(),
    dataVersion: dataVersion(game),
    pricingVersion: pricingVersion(),
    data
  };
}

function publicError(req, error) {
  const known = error instanceof PublicApiError;
  return {
    status: known ? error.status : 500,
    body: {
      apiVersion: API_VERSION,
      requestId: requestId(req),
      error: {
        code: known ? error.code : 'internal_error',
        message: known ? error.message : 'The public card service could not complete the request.',
        retryable: known ? error.retryable : false,
        retryAfterSeconds: known ? error.retryAfterSeconds : null
      }
    }
  };
}

function withTimeout(operation, timeoutMs) {
  let timer;
  return Promise.race([
    Promise.resolve().then(operation),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new PublicApiError(504, 'timeout', 'The request exceeded its processing budget.', true, 1)), timeoutMs);
      timer.unref?.();
    })
  ]).finally(() => clearTimeout(timer));
}

function setCache(res, value) {
  res.set('Cache-Control', value);
}

function sendEnvelope(req, res, data, game, cacheControl) {
  const body = envelope(data, req, game);
  const etag = `"${crypto.createHash('sha256').update(JSON.stringify(body.data) + body.dataVersion + (body.pricingVersion || '')).digest('hex')}"`;
  res.set('ETag', etag);
  setCache(res, cacheControl);
  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return;
  }
  res.json(body);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/gu, '')
    .replace(/[^\p{L}\p{N}\u2605]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeCompact(value) {
  return normalizeText(value).replace(/\s+/g, '');
}

function normalizeGame(value) {
  const game = canonicalGame(value);
  if (!SUPPORTED_GAMES.has(game)) {
    throw new PublicApiError(400, 'unsupported_game', `Unsupported game: ${String(value || '') || '(missing)'}.`);
  }
  return game;
}

function cleanString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 100) / 100 : null;
}

function validateFilters(game, filters) {
  if (filters == null) return {};
  if (typeof filters !== 'object' || Array.isArray(filters)) {
    throw new PublicApiError(400, 'invalid_request', 'filters must be an object.');
  }
  for (const key of Object.keys(filters)) {
    if (!allowedFilters.has(key)) throw new PublicApiError(400, 'unsupported_filter', `Unsupported filter: ${key}.`);
  }
  if (filters.gameFields != null) {
    if (typeof filters.gameFields !== 'object' || Array.isArray(filters.gameFields)) {
      throw new PublicApiError(400, 'invalid_request', 'filters.gameFields must be an object.');
    }
    for (const key of Object.keys(filters.gameFields)) {
      if (!allowedGameFields[game]?.has(key)) throw new PublicApiError(400, 'unsupported_filter', `Unsupported ${game} filter: ${key}.`);
    }
  }
  return filters;
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value) {
  try {
    return JSON.parse(Buffer.from(String(value || ''), 'base64url').toString('utf8'));
  } catch {
    throw new PublicApiError(400, 'invalid_request', 'cursor is invalid.');
  }
}

function cursorOffset(cursor, game, query, filters) {
  if (!cursor) return 0;
  const parsed = decodeCursor(cursor);
  if (parsed.v !== dataVersion(game)) throw new PublicApiError(409, 'cursor_expired', 'The catalog changed; restart this search.');
  if (parsed.g !== game || parsed.q !== normalizeText(query) || parsed.f !== hashVersion('filters', filters)) {
    throw new PublicApiError(400, 'invalid_request', 'cursor does not belong to this search.');
  }
  return Math.max(0, Number(parsed.o) || 0);
}

function assetUrl(value) {
  const text = cleanString(value);
  if (!text) return null;
  if (text.startsWith('/data/')) return `${PUBLIC_DATA_BASE_URL}/${text.slice('/data/'.length)}`;
  if (text.startsWith('data/')) return `${PUBLIC_DATA_BASE_URL}/${text.slice('data/'.length)}`;
  if (text.startsWith(`${PUBLIC_DATA_BASE_URL}/`)) return text;
  return null;
}

function sourceExtension(value, fallback) {
  try {
    return path.extname(new URL(String(value || '')).pathname).toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function managedImageUrl(game, kind, id, sourceUrl, suffix = '') {
  if (!id) return null;
  const assetGame = game === 'magic' ? 'mtg' : game === 'flesh_and_blood' ? 'fab' : game;
  const extension = sourceExtension(sourceUrl, game === 'yugioh' ? '.jpg' : '.png');
  const safeId = encodeURIComponent(String(id));
  const prefix = String(id).slice(0, 2).toLowerCase();
  const relative = game === 'starwars'
    ? `${assetGame}/images/${prefix}/${safeId}${suffix}${extension}`
    : `${assetGame}/images/${kind}/${prefix}/${safeId}${extension}`;
  return fs.existsSync(path.join(PUBLIC_DATA_ROOT, ...relative.split('/')))
    ? `${PUBLIC_DATA_BASE_URL}/${relative}`
    : null;
}

function buildImage(row, game) {
  const direct = {
    small: assetUrl(row.image_small || row.images?.small),
    normal: assetUrl(row.image_normal || row.image_url),
    large: assetUrl(row.image_large || row.images?.large),
    artCrop: assetUrl(row.image_art_crop),
    back: assetUrl(row.image_back_url || row.back_image_url)
  };
  const rawId = row.image_id || row.id || row.api_id || row.uuid || row.unique_id;
  if (game === 'pokemon') {
    direct.small ||= managedImageUrl(game, 'small', rawId, row.images?.small);
    direct.large ||= managedImageUrl(game, 'large', rawId, row.images?.large);
    direct.normal ||= direct.large || direct.small;
  } else if (game === 'yugioh') {
    const image = row.card_images?.[0] || {};
    const imageId = image.id || rawId;
    direct.small ||= managedImageUrl(game, 'small', imageId, image.image_url_small);
    direct.large ||= managedImageUrl(game, 'full', imageId, image.image_url);
    direct.normal ||= direct.large || direct.small;
  } else if (game === 'starwars') {
    direct.normal ||= managedImageUrl(game, '', rawId, row.frontImageUrl || row.image_url);
    direct.large ||= direct.normal;
    direct.back ||= managedImageUrl(game, '', rawId, row.backImageUrl, '-back');
  } else if (game === 'magic') {
    direct.normal ||= managedImageUrl(game, 'normal', rawId, row.image_normal || row.image_url);
    direct.large ||= direct.normal;
    direct.small ||= direct.normal;
  }
  direct.normal ||= direct.large || direct.small;
  direct.large ||= direct.normal;
  direct.small ||= direct.normal;
  return { ...direct, version: imageVersion(game) || dataVersion(game) };
}

function setMetadata(game, row) {
  if (!setMetadataCache.has(game)) {
    const assetGame = game === 'flesh_and_blood' ? 'fab' : game;
    const rows = readJson(path.join(PUBLIC_DATA_ROOT, assetGame, 'sets.json'), []);
    setMetadataCache.set(game, Array.isArray(rows) ? rows : []);
  }
  const sets = setMetadataCache.get(game);
  if (game === 'pokemon') {
    const inferredId = String(row.id || '').replace(/-[^-]+$/, '');
    return sets.find((item) => String(item.id) === String(row.set_id || row.set?.id || inferredId)) || null;
  }
  const code = String(row.set_code || row.setCode || row.set?.code || '').toLowerCase();
  return sets.find((item) => String(item.code || '').toLowerCase() === code) || null;
}

function identityFrom(row, game, options = {}) {
  const printingId = String(options.printingId || row.printing_id || row.id || row.api_id || row.uuid || row.unique_id || '');
  const cardId = String(options.cardId || row.oracle_id || row.card_id || row.api_id || row.id || row.unique_id || printingId);
  const setMeta = setMetadata(game, row);
  const setId = cleanString(options.setId ?? row.set_id ?? (game === 'pokemon' ? setMeta?.id : null));
  const setCode = cleanString(options.setCode ?? row.set_code ?? row.setCode ?? row.set?.code ?? setMeta?.ptcgoCode ?? row.pack_id);
  const collectorNumber = cleanString(options.collectorNumber ?? row.collector_number ?? row.card_number ?? row.number ?? row.cardNumber ?? (game === 'onepiece' ? row.id : null));
  const language = String(options.language || row.lang || row.language || 'en').trim().toLowerCase() || 'en';
  const finish = normalizeFinish(options.finish || row.finish || 'nonfoil');
  const canonical = buildCardIdentity({
    game,
    id: printingId,
    api_id: printingId,
    oracle_id: game === 'magic' ? cardId : '',
    name: row.name,
    set_id: setId,
    set_code: setCode,
    set_name: row.set_name || row.set?.name,
    card_number: collectorNumber,
    finish,
    language
  });
  return { game, printingId, cardId, setId, setCode, collectorNumber, language, finish, identityKey: canonical.key };
}

function pricingInput(row, identity) {
  const ygoPrice = row.card_prices?.[0];
  const pokemonPrices = row.tcgplayer?.prices || {};
  const pokemonMarket = pokemonPrices.normal?.market || pokemonPrices.holofoil?.market || pokemonPrices.reverseHolofoil?.market || row.cardmarket?.prices?.averageSellPrice;
  return {
    ...row,
    id: identity.printingId,
    api_id: identity.printingId,
    oracle_id: identity.game === 'magic' ? identity.cardId : row.oracle_id,
    game: identity.game,
    set_code: identity.setCode,
    card_number: identity.collectorNumber,
    finish: identity.finish,
    language: identity.language,
    market_price: row.market_price ?? row.price ?? pokemonMarket ?? ygoPrice?.tcgplayer_price ?? ygoPrice?.cardmarket_price ?? null
  };
}

function quoteFor(row, identity) {
  const pricing = pricingOwner.resolvePricingState(pricingInput(row, identity), { floor: 0 });
  const updatedAt = row.pricing_updated_at || row.updated_at || row.updated_date || generatedAtOf(pricingSnapshot()) || null;
  const staleAt = updatedAt ? new Date(new Date(updatedAt).getTime() + 24 * 60 * 60 * 1000).toISOString() : null;
  const amount = positiveNumber(pricing.market_price ?? pricing.display_price);
  return {
    identityKey: identity.identityKey,
    currency: 'USD',
    amount,
    status: amount == null ? 'unavailable' : staleAt && Date.parse(staleAt) < Date.now() ? 'stale' : 'current',
    updatedAt,
    staleAt,
    sourceCount: Number(pricing.source_count || 0)
  };
}

function summaryFrom(row, game, options = {}) {
  const identity = identityFrom(row, game, options);
  const setMeta = setMetadata(game, row);
  return {
    identity,
    name: String(row.name || row.product_name || 'Unknown card'),
    printedName: cleanString(row.printed_name),
    setName: cleanString(options.setName ?? row.set_name ?? row.set?.name ?? setMeta?.name),
    typeLine: cleanString(row.type_line ?? row.type ?? row.type_text ?? row.supertype),
    rarity: cleanString(options.rarity ?? row.rarity ?? row.set_rarity),
    releasedAt: cleanString(row.released_at ?? row.release_date ?? row.set?.releaseDate ?? setMeta?.releaseDate ?? setMeta?.release_date),
    image: buildImage(row, game),
    price: quoteFor(row, identity)
  };
}

function detailFrom(row, game, options = {}) {
  const summary = summaryFrom(row, game, options);
  const attacks = Array.isArray(row.attacks) ? row.attacks.map((item) => `${item.name || ''}${item.damage ? ` ${item.damage}` : ''}\n${item.text || ''}`.trim()).filter(Boolean) : [];
  const abilities = Array.isArray(row.abilities) ? row.abilities.map((item) => `${item.name || ''}\n${item.text || ''}`.trim()).filter(Boolean) : [];
  const rulesText = game === 'pokemon'
    ? [...abilities, ...attacks].join('\n\n')
    : row.oracle_text ?? row.desc ?? row.text ?? row.functional_text ?? row.functional_text_plain ?? row.effect ?? row.frontText ?? null;
  const gameData = gameDataFor(row, game);
  return {
    ...summary,
    manaCost: cleanString(row.mana_cost),
    rulesText: cleanString(rulesText),
    flavorText: game === 'yugioh' ? null : cleanString(row.flavor_text ?? row.flavorText),
    artist: cleanString(row.artist ?? row.illustrator),
    legalities: safeStringMap(row.legalities),
    finishes: Array.isArray(row.finishes) ? row.finishes.map(String) : [summary.identity.finish],
    gameData
  };
}

function safeStringMap(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, item]) => ['string', 'number', 'boolean'].includes(typeof item)).map(([key, item]) => [key, String(item)]));
}

function compactArray(value) {
  return Array.isArray(value) ? value.map((item) => typeof item === 'object' ? JSON.stringify(item) : String(item)).slice(0, 50) : [];
}

function gameDataFor(row, game) {
  const fields = game === 'magic'
    ? ['power', 'toughness', 'loyalty', 'colors', 'color_identity', 'keywords']
    : game === 'pokemon'
      ? ['hp', 'level', 'types', 'subtypes', 'abilities', 'attacks', 'weaknesses', 'resistances', 'retreatCost', 'convertedRetreatCost']
      : game === 'yugioh'
        ? ['atk', 'def', 'level', 'attribute', 'race', 'archetype', 'scale', 'linkval', 'linkmarkers', 'ban_tcg']
        : game === 'lorcana'
          ? ['version', 'ink', 'cost', 'inkwell', 'strength', 'willpower', 'lore', 'keywords', 'classifications']
          : game === 'onepiece'
            ? ['colors', 'category', 'cost', 'power', 'counter', 'types', 'trigger']
            : game === 'flesh_and_blood'
              ? ['color', 'pitch', 'cost', 'power', 'defense', 'health', 'types', 'traits', 'card_keywords', 'type_text']
              : ['subtitle', 'aspects', 'traits', 'keywords', 'cost', 'power', 'hp', 'arena', 'variantType', 'doubleSided'];
  const result = {};
  for (const key of fields) {
    const value = row[key];
    if (value == null) continue;
    if (Array.isArray(value)) result[key] = compactArray(value);
    else if (['string', 'number', 'boolean'].includes(typeof value)) result[key] = value;
  }
  return result;
}

async function loadSource(game) {
  const assetGame = game === 'flesh_and_blood' ? 'fab' : game;
  if (sourceCache.has(assetGame)) return sourceCache.get(assetGame);
  const promise = Promise.resolve().then(() => {
    const rows = readJson(path.join(PUBLIC_DATA_ROOT, assetGame, 'cards.json'), []);
    return Array.isArray(rows) ? rows : Array.isArray(rows?.data) ? rows.data : [];
  });
  sourceCache.set(assetGame, promise);
  return promise;
}

async function loadMtgLite() {
  if (mtgLiteCache.rows) return mtgLiteCache;
  if (!mtgLiteCache.promise) {
    mtgLiteCache.promise = Promise.resolve().then(() => {
      const dir = path.join(PUBLIC_DATA_ROOT, 'mtg', 'search-lite');
      const rows = fs.readdirSync(dir).filter((name) => name.endsWith('.json')).flatMap((name) => readJson(path.join(dir, name), []));
      const byId = new Map();
      const byGroup = new Map();
      for (const row of rows) {
        byId.set(String(row.id), row);
        const key = [row.oracle_id, normalizeCompact(row.set_code), normalizeCompact(row.collector_number)].join('::');
        if (!byGroup.has(key)) byGroup.set(key, row);
      }
      mtgLiteCache.rows = rows;
      mtgLiteCache.byId = byId;
      mtgLiteCache.byGroup = byGroup;
      return mtgLiteCache;
    });
  }
  return mtgLiteCache.promise;
}

function loadMtgPrintingShard(oracleId) {
  const prefix = String(oracleId || '').slice(0, 2).toLowerCase();
  if (!/^[0-9a-f]{2}$/.test(prefix)) return [];
  if (!mtgPrintingShardCache.has(prefix)) {
    const manifest = readJson(path.join(PUBLIC_DATA_ROOT, 'mtg', 'printing-index-manifest.json'), {});
    const fields = Array.isArray(manifest.fields) ? manifest.fields : [];
    const packedRows = readJson(path.join(PUBLIC_DATA_ROOT, 'mtg', 'printing-index', `${prefix}.json`), []);
    const rows = Array.isArray(packedRows)
      ? packedRows.map((packed) => Object.fromEntries(fields.map((field, index) => [field, packed[index]])))
      : [];
    mtgPrintingShardCache.set(prefix, rows);
  }
  return mtgPrintingShardCache.get(prefix);
}

function mtgPrintingForGroup(row) {
  const oracleId = String(row.oracle_id || '');
  const setCode = normalizeCompact(row.set_code);
  const collectorNumber = normalizeCompact(row.card_number || row.collector_number);
  const matches = loadMtgPrintingShard(oracleId).filter((printing) => (
    String(printing.oracle_id || '') === oracleId
    && normalizeCompact(printing.set_code) === setCode
    && normalizeCompact(printing.collector_number) === collectorNumber
  ));
  const language = String(row.lang || 'en').toLowerCase();
  return matches.find((printing) => String(printing.lang || '').toLowerCase() === language)
    || matches.find((printing) => String(printing.lang || '').toLowerCase() === 'en')
    || matches[0]
    || null;
}

async function resolveMtgSearchRows(rows) {
  const lite = await loadMtgLite();
  return rows.map((row) => {
    const printing = mtgPrintingForGroup(row);
    if (printing) return printing;
    return lite.byGroup.get([row.oracle_id, normalizeCompact(row.set_code), normalizeCompact(row.card_number)].join('::')) || row;
  });
}

function ygoPrintingId(card, printing) {
  return [card.id, printing?.set_code || 'base', printing?.set_rarity_code || ''].map((value) => String(value || '').replace(/:/g, '-')).join(':');
}

function expandYugioh(rows, sourceRows) {
  const byId = new Map(sourceRows.map((row) => [String(row.id), row]));
  return rows.flatMap((row) => {
    const card = byId.get(String(row.api_id || row.id));
    if (!card) return [row];
    const sets = Array.isArray(card.card_sets) && card.card_sets.length ? card.card_sets : [null];
    return sets.map((printing) => ({
      ...card,
      printing_id: ygoPrintingId(card, printing),
      set_name: printing?.set_name || null,
      set_code: printing?.set_code || null,
      card_number: printing?.set_code || null,
      rarity: printing?.set_rarity || null,
      set_rarity: printing?.set_rarity || null,
      set_price: printing?.set_price || null
    }));
  });
}

function expandFab(rows, sourceRows) {
  const byId = new Map(sourceRows.map((row) => [String(row.unique_id), row]));
  return rows.flatMap((row) => {
    const card = byId.get(String(row.api_id || row.id));
    if (!card) return [row];
    const printings = Array.isArray(card.printings) && card.printings.length ? card.printings : [null];
    return printings.map((printing) => ({
      ...card,
      printing_id: printing?.id || card.unique_id,
      card_id: card.unique_id,
      set_code: printing?.set_id || printing?.set_code || row.set_code || null,
      card_number: printing?.id || row.card_number || null,
      rarity: printing?.rarity || row.rarity || null,
      image_url: row.image_url
    }));
  });
}

function matchesFilters(row, filters) {
  const values = {
    name: row.name,
    set: `${row.set_name || row.set?.name || ''} ${row.set_code || row.set?.id || ''}`,
    collectorNumber: row.collector_number || row.card_number || row.number,
    type: row.type_line || row.type || row.type_text || row.supertype,
    rarity: row.rarity || row.set_rarity,
    language: row.lang || row.language || 'en'
  };
  for (const [key, expected] of Object.entries(filters || {})) {
    if (key === 'exact' || key === 'gameFields' || expected == null || expected === '') continue;
    const actual = normalizeText(values[key]);
    const wanted = normalizeText(expected);
    if (filters.exact ? actual !== wanted : !actual.includes(wanted)) return false;
  }
  for (const [key, expected] of Object.entries(filters?.gameFields || {})) {
    const actual = Array.isArray(row[key]) ? row[key].map(normalizeText) : normalizeText(row[key]);
    if (Array.isArray(expected)) {
      if (!expected.every((item) => Array.isArray(actual) && actual.includes(normalizeText(item)))) return false;
    } else if (!String(actual).includes(normalizeText(expected))) return false;
  }
  return true;
}

function hasPublicFilters(filters) {
  return Object.entries(filters || {}).some(([, value]) => value != null && value !== '' && value !== false);
}

function advancedNameFilter(game, query) {
  return game === 'yugioh' ? { query } : { name: query };
}

async function searchRows(game, query, filters, offset, limit) {
  const adapter = gameAdapters[game];
  await adapter.ensure();
  const searchQuery = String(filters.name || query || filters.collectorNumber || filters.set || '').trim();
  if (!searchQuery) throw new PublicApiError(400, 'invalid_request', 'query or a searchable filter is required.');

  if (!hasPublicFilters(filters) && !['yugioh', 'flesh_and_blood'].includes(game) && offset % limit === 0) {
    const page = adapter.advanced(advancedNameFilter(game, searchQuery), offset / limit, limit);
    let rows = page.results;
    if (game === 'magic') rows = await resolveMtgSearchRows(rows);
    return { rows, total: page.total };
  }

  let rows = adapter.search(searchQuery, SEARCH_SOURCE_LIMIT);
  if (game === 'magic') rows = await resolveMtgSearchRows(rows);
  if (game === 'yugioh') rows = expandYugioh(rows, await loadSource(game));
  if (game === 'flesh_and_blood') rows = expandFab(rows, await loadSource(game));
  const ranked = rankCatalogResults(rows.filter((row) => matchesFilters(row, filters)), searchQuery);
  return { rows: ranked.slice(offset, offset + limit), total: ranked.length };
}

async function findMtgPrinting(printingId) {
  const lite = await loadMtgLite();
  const direct = lite.byId.get(String(printingId));
  if (direct) return direct;
  if (String(printingId).includes('::')) {
    const [oracleId, setCode, collectorNumber] = String(printingId).split('::');
    const grouped = mtgPrintingForGroup({ oracle_id: oracleId, set_code: setCode, card_number: collectorNumber });
    if (grouped) return grouped;
  }
  if (mtgFallbackDetailCache.has(printingId)) return mtgFallbackDetailCache.get(printingId);
  const dir = path.join(PUBLIC_DATA_ROOT, 'mtg', 'printing-index');
  const manifest = readJson(path.join(PUBLIC_DATA_ROOT, 'mtg', 'printing-index-manifest.json'), {});
  const fields = manifest.fields || [];
  for (const file of fs.readdirSync(dir).filter((name) => name.endsWith('.json'))) {
    const rows = readJson(path.join(dir, file), []);
    const packed = rows.find((row) => String(row[0]) === String(printingId));
    if (packed) {
      const found = Object.fromEntries(fields.map((field, index) => [field, packed[index]]));
      found.prices = { usd: found.usd ?? null, usd_foil: found.usd_foil ?? null, usd_etched: found.usd_etched ?? null };
      mtgFallbackDetailCache.set(printingId, found);
      return found;
    }
  }
  mtgFallbackDetailCache.set(printingId, null);
  return null;
}

function parseYgoPrintingId(printingId) {
  const [cardId, setCode = '', rarityCode = ''] = String(printingId).split(':');
  return { cardId, setCode, rarityCode };
}

async function findPrinting(game, printingId) {
  if (game === 'magic') return findMtgPrinting(printingId);
  const rows = await loadSource(game);
  if (game === 'pokemon') return rows.find((row) => String(row.id) === String(printingId)) || null;
  if (game === 'yugioh') {
    const parsed = parseYgoPrintingId(printingId);
    const card = rows.find((row) => String(row.id) === parsed.cardId);
    if (!card) return null;
    const printing = (card.card_sets || []).find((row) => String(row.set_code || '').replace(/:/g, '-') === parsed.setCode && String(row.set_rarity_code || '').replace(/:/g, '-') === parsed.rarityCode)
      || (card.card_sets || []).find((row) => String(row.set_code || '').replace(/:/g, '-') === parsed.setCode)
      || null;
    if (parsed.setCode && !printing) return null;
    return { ...card, printing_id: ygoPrintingId(card, printing), set_name: printing?.set_name || null, set_code: printing?.set_code || null, card_number: printing?.set_code || null, rarity: printing?.set_rarity || null };
  }
  if (game === 'flesh_and_blood') {
    for (const card of rows) {
      const printing = (card.printings || []).find((item) => String(item.id) === String(printingId));
      if (printing) return { ...card, printing_id: printing.id, card_id: card.unique_id, set_code: printing.set_id || printing.set_code || null, card_number: printing.id, rarity: printing.rarity || null };
      if (String(card.unique_id) === String(printingId)) return card;
    }
    return null;
  }
  if (game === 'starwars') return rows.find((row) => String(row.uuid) === String(printingId)) || null;
  return rows.find((row) => String(row.id) === String(printingId)) || null;
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const key = String(req.ip || req.socket.remoteAddress || 'unknown');
  const bucket = RATE_BUCKETS.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    RATE_BUCKETS.set(key, { startedAt: now, count: 1 });
    next();
    return;
  }
  bucket.count += 1;
  if (bucket.count <= RATE_LIMIT) {
    next();
    return;
  }
  const retryAfterSeconds = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - bucket.startedAt)) / 1000));
  res.set('Retry-After', String(retryAfterSeconds));
  const error = publicError(req, new PublicApiError(429, 'rate_limited', 'Public API rate limit exceeded.', true, retryAfterSeconds));
  res.status(error.status).json(error.body);
}

function route(handler) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const response = publicError(req, error);
      if (!(error instanceof PublicApiError)) console.error(`CardStache public API ${req.method} ${req.path} failed:`, error);
      res.status(response.status).json(response.body);
    }
  };
}

function validateIdentity(value, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PublicApiError(400, 'invalid_request', `identities[${index}] must be an object.`);
  const game = normalizeGame(value.game);
  const printingId = String(value.printingId || '').trim();
  if (!printingId) throw new PublicApiError(400, 'invalid_request', `identities[${index}].printingId is required.`);
  return { ...value, game, printingId, language: String(value.language || 'en').toLowerCase(), finish: normalizeFinish(value.finish || 'nonfoil') };
}

export function installCardstachePublicApi(app) {
  const parsePublicJson = express.json({ limit: '64kb' });
  app.use('/api/public/v1', (req, res, next) => {
    parsePublicJson(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      const status = error.type === 'entity.too.large' ? 413 : 400;
      const message = status === 413 ? 'Request body must be 64 KiB or smaller.' : 'Request body must contain valid JSON.';
      const response = publicError(req, new PublicApiError(status, 'invalid_request', message));
      res.status(response.status).json(response.body);
    });
  }, rateLimit);

  app.post('/api/public/v1/catalog/search', route(async (req, res) => withTimeout(async () => {
    const game = normalizeGame(req.body?.game);
    const query = String(req.body?.query || '').trim();
    if (query.length > 128) throw new PublicApiError(400, 'invalid_request', 'query must be 128 characters or fewer.');
    const filters = validateFilters(game, req.body?.filters);
    const limit = Math.max(1, Math.min(SEARCH_LIMIT_MAX, Number(req.body?.limit) || SEARCH_LIMIT_DEFAULT));
    const offset = cursorOffset(req.body?.cursor, game, query, filters);
    const result = await searchRows(game, query, filters, offset, limit);
    const pageRows = result.rows;
    const nextOffset = offset + pageRows.length;
    const nextCursor = nextOffset < result.total ? encodeCursor({ v: dataVersion(game), g: game, q: normalizeText(query), f: hashVersion('filters', filters), o: nextOffset }) : null;
    sendEnvelope(req, res, { items: pageRows.map((row) => summaryFrom(row, game)), total: result.total, nextCursor }, game, 'public, max-age=60, stale-while-revalidate=300');
  }, 2_000)));

  app.get('/api/public/v1/catalog/prints/:game/:printingId', route(async (req, res) => withTimeout(async () => {
    const game = normalizeGame(req.params.game);
    const printingId = String(req.params.printingId || '').trim();
    if (!printingId) throw new PublicApiError(400, 'invalid_request', 'printingId is required.');
    const row = await findPrinting(game, printingId);
    if (!row) throw new PublicApiError(404, 'not_found', 'Exact printing not found.');
    const options = { printingId, language: req.query.language || row.lang || row.language || 'en', finish: req.query.finish || row.finish || 'nonfoil' };
    sendEnvelope(req, res, detailFrom(row, game, options), game, 'public, max-age=3600, stale-while-revalidate=86400');
  }, 5_000)));

  app.post('/api/public/v1/catalog/summaries/batch', route(async (req, res) => withTimeout(async () => {
    const identities = req.body?.identities;
    if (!Array.isArray(identities)) throw new PublicApiError(400, 'invalid_request', 'identities must be an array.');
    if (identities.length > SUMMARY_BATCH_MAX) throw new PublicApiError(400, 'invalid_request', `A maximum of ${SUMMARY_BATCH_MAX} identities is allowed.`);
    const validated = identities.map(validateIdentity);
    const items = [];
    for (const identity of validated) {
      const row = await findPrinting(identity.game, identity.printingId);
      items.push({ requestedPrintingId: identity.printingId, found: Boolean(row), summary: row ? summaryFrom(row, identity.game, identity) : null, error: row ? null : 'not_found' });
    }
    sendEnvelope(req, res, { items }, null, 'private, max-age=300, stale-while-revalidate=3600');
  }, 8_000)));

  app.post('/api/public/v1/pricing/quotes/batch', route(async (req, res) => withTimeout(async () => {
    const identities = req.body?.identities;
    if (!Array.isArray(identities)) throw new PublicApiError(400, 'invalid_request', 'identities must be an array.');
    if (identities.length > PRICING_BATCH_MAX) throw new PublicApiError(400, 'invalid_request', `A maximum of ${PRICING_BATCH_MAX} identities is allowed.`);
    const validated = identities.map(validateIdentity);
    const items = [];
    for (const requested of validated) {
      const row = await findPrinting(requested.game, requested.printingId);
      const identity = row ? identityFrom(row, requested.game, requested) : identityFrom({ id: requested.printingId }, requested.game, requested);
      items.push({ identityKey: identity.identityKey, quote: row ? quoteFor(row, identity) : { identityKey: identity.identityKey, currency: 'USD', amount: null, status: 'unavailable', updatedAt: null, staleAt: null, sourceCount: 0 } });
    }
    sendEnvelope(req, res, { items }, null, 'private, max-age=300, stale-while-revalidate=86400');
  }, 8_000)));

  app.get('/api/public/v1/service/status', route(async (req, res) => withTimeout(async () => {
    const now = Date.now();
    const catalogs = [...SUPPORTED_GAMES].map((game) => {
      const manifest = manifestFor(game);
      const generatedAt = generatedAtOf(manifest);
      const age = generatedAt ? now - Date.parse(generatedAt) : Infinity;
      return {
        game,
        status: !generatedAt ? 'unavailable' : age > 14 * 24 * 60 * 60 * 1000 ? 'stale' : 'ready',
        dataVersion: catalogVersion(game),
        generatedAt,
        recordCount: Number(manifest.final_card_count ?? manifest.imported_cards ?? manifest.printing_count ?? 0),
        imageVersion: imageVersion(game)
      };
    });
    const snapshot = pricingSnapshot();
    const pricingGeneratedAt = generatedAtOf(snapshot);
    const pricingAge = pricingGeneratedAt ? now - Date.parse(pricingGeneratedAt) : Infinity;
    const games = (Array.isArray(snapshot.games) ? snapshot.games : []).map((row) => ({
      game: canonicalGame(row.game) === 'fab' ? 'flesh_and_blood' : canonicalGame(row.game),
      pricedRecords: Number(row.priced_cards || 0),
      coveragePercent: Number(row.cards_seen) > 0 ? Math.round((Number(row.priced_cards || 0) / Number(row.cards_seen)) * 1000) / 10 : null
    })).filter((row) => SUPPORTED_GAMES.has(row.game));
    const priced = games.reduce((sum, row) => sum + row.pricedRecords, 0);
    const pricingStatus = !pricingGeneratedAt ? 'unavailable' : priced === 0 ? 'empty' : pricingAge > 48 * 60 * 60 * 1000 ? 'stale' : games.some((row) => row.coveragePercent != null && row.coveragePercent < 100) ? 'partial' : 'ready';
    const status = catalogs.some((row) => row.status !== 'ready') || ['unavailable', 'empty'].includes(pricingStatus) ? 'degraded' : 'ok';
    sendEnvelope(req, res, { status, catalogs, pricing: { status: pricingStatus, pricingVersion: pricingVersion(), generatedAt: pricingGeneratedAt, games } }, null, 'public, max-age=60, stale-while-revalidate=300');
  }, 2_000)));
}
