const SUPABASE_FUNCTION_ORIGIN = 'https://wwvvyrhlybwijqlhubdv.supabase.co/functions/v1/cardstache-public-api';
const MAINPHASE_STATIC_ORIGIN = 'https://wwvvyrhlybwijqlhubdv.supabase.co/storage/v1/object/public/main-phase-market-public/data';
const LEGALITY_BATCH_MAX = 1000;
const SUPPORTED_GAMES = new Set(['magic', 'pokemon', 'yugioh', 'lorcana', 'onepiece', 'flesh_and_blood', 'starwars']);
const MAGIC_FORMATS = new Set(['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander']);
const CATALOG_LEGALITY_CONFIG = {
  pokemon: { assetGame: 'pokemon', source: 'Pokemon TCG catalog legalities' },
  yugioh: { assetGame: 'yugioh', source: 'YGOPRODeck banlist_info.ban_tcg', region: 'TCG' },
  flesh_and_blood: { assetGame: 'fab', source: 'Flesh and Blood card source legality flags' }
};
const FAB_FORMAT_PREFIX = {
  blitz: 'blitz',
  classic_constructed: 'cc',
  commoner: 'commoner',
  living_legend: 'll',
  upf: 'upf',
  silver_age: 'silver_age'
};

let mtgLegalityIndexPromise;
const catalogIndexPromises = new Map();

class ApiError extends Error {
  constructor(status, code, message, retryable = false, retryAfterSeconds = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function requestId(request) {
  return request.headers.get('x-request-id') || crypto.randomUUID();
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

function normalizeGame(value) {
  const normalized = normalizeText(value);
  const aliases = {
    mtg: 'magic',
    magic: 'magic',
    'magic the gathering': 'magic',
    pokemon: 'pokemon',
    'pokemon tcg': 'pokemon',
    yugioh: 'yugioh',
    'yu gi oh': 'yugioh',
    lorcana: 'lorcana',
    'disney lorcana': 'lorcana',
    onepiece: 'onepiece',
    'one piece': 'onepiece',
    'one piece tcg': 'onepiece',
    fab: 'flesh_and_blood',
    'flesh and blood': 'flesh_and_blood',
    starwars: 'starwars',
    'star wars': 'starwars',
    'star wars unlimited': 'starwars'
  };
  const game = aliases[normalized] || normalized.replace(/\s+/g, '_');
  if (!SUPPORTED_GAMES.has(game)) throw new ApiError(400, 'unsupported_game', `Unsupported game: ${String(value || '') || '(missing)'}.`);
  return game;
}

function normalizeFormat(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[\s-]+/g, '_');
  const aliases = {
    edh: 'commander',
    advanced: 'advanced_tcg',
    tcg_advanced: 'advanced_tcg',
    tcg: 'advanced_tcg',
    cc: 'classic_constructed',
    ll: 'living_legend'
  };
  return aliases[key] || key;
}

function normalizeStatus(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const aliases = {
    legal: 'legal',
    unlimited: 'legal',
    forbidden: 'banned',
    banned: 'banned',
    restricted: 'restricted',
    limited: 'limited',
    semi_limited: 'semi_limited',
    semilimited: 'semi_limited',
    suspended: 'suspended',
    rotated: 'rotated',
    not_legal: 'not_legal',
    illegal: 'not_legal',
    unknown: 'unknown'
  };
  return aliases[key] || 'unknown';
}

async function readJsonBody(request) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > 512_000) throw new ApiError(413, 'invalid_request', 'Request body must be 512 KiB or smaller.');
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 512_000) throw new ApiError(413, 'invalid_request', 'Request body must be 512 KiB or smaller.');
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError(400, 'invalid_request', 'Request body must contain valid JSON.');
  }
}

async function mtgLegalityIndex() {
  if (!mtgLegalityIndexPromise) {
    mtgLegalityIndexPromise = fetch(`${MAINPHASE_STATIC_ORIGIN}/legality/mtg.json`)
      .then((response) => {
        if (!response.ok) throw new ApiError(503, 'upstream_unavailable', 'Magic legality index is not available.', true);
        return response.json();
      })
      .then((payload) => ({
        metadata: {
          source: payload.source || 'Scryfall catalog legalities',
          sourceVersion: payload.sourceVersion || null,
          lastVerified: payload.generatedAt || null,
          effectiveDate: payload.sourceGeneratedAt || payload.generatedAt || null,
          canonicalCardCount: Number(payload.cardCount || payload.records?.length || 0)
        },
        byId: new Map((payload.records || []).map((record) => [String(record.id), record]))
      }));
  }
  return mtgLegalityIndexPromise;
}

async function optionalJson(url) {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
}

async function catalogLegalityIndex(game) {
  const config = CATALOG_LEGALITY_CONFIG[game];
  if (!config) return null;
  if (!catalogIndexPromises.has(game)) {
    catalogIndexPromises.set(game, Promise.all([
      optionalJson(`${MAINPHASE_STATIC_ORIGIN}/${config.assetGame}/cards.json`),
      optionalJson(`${MAINPHASE_STATIC_ORIGIN}/${config.assetGame}/cards-manifest.json`)
    ]).then(([cards, manifest]) => {
      if (!Array.isArray(cards)) throw new ApiError(503, 'upstream_unavailable', `${game} legality source cards are not available.`, true);
      const byId = new Map();
      for (const card of cards) {
        const ids = [
          card?.id,
          card?.card_id,
          card?.api_id,
          card?.unique_id,
          card?.uuid
        ].map((id) => String(id || '').trim()).filter(Boolean);
        for (const id of ids) byId.set(id, card);
      }
      const generatedAt = manifest?.generated_at || manifest?.generatedAt || null;
      return {
        metadata: {
          source: config.source,
          sourceVersion: generatedAt ? `${game}-${generatedAt}` : null,
          lastVerified: generatedAt,
          effectiveDate: generatedAt,
          region: config.region || null,
          canonicalCardCount: byId.size
        },
        byId
      };
    }));
  }
  return catalogIndexPromises.get(game);
}

function validateLegalityIdentity(value, index = 0) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_request', `identities[${index}] must be an object.`);
  }
  const identity = value.identity && typeof value.identity === 'object' && !Array.isArray(value.identity) ? value.identity : {};
  const game = normalizeGame(value.game || identity.game);
  const canonicalCardId = String(value.canonicalCardId || value.cardId || value.oracleId || identity.canonicalCardId || identity.cardId || identity.oracleId || '').trim();
  const printingId = String(value.printingId || identity.printingId || '').trim();
  const format = normalizeFormat(value.format || identity.format);
  if (!canonicalCardId && !printingId) throw new ApiError(400, 'invalid_request', `identities[${index}].canonicalCardId or identities[${index}].printingId is required.`);
  if (!format) throw new ApiError(400, 'invalid_request', `identities[${index}].format is required.`);
  return {
    game,
    canonicalCardId,
    ...(printingId ? { printingId } : {}),
    format
  };
}

function unknownLegality(input, metadata = {}, reason = 'No authoritative legality data is available for this game/format.') {
  return {
    game: input.game,
    canonicalCardId: input.canonicalCardId,
    ...(input.printingId ? { printingId: input.printingId } : {}),
    format: input.format,
    status: 'unknown',
    source: metadata.source || null,
    sourceVersion: metadata.sourceVersion || null,
    lastVerified: metadata.lastVerified || null,
    effectiveDate: metadata.effectiveDate || null,
    ...(metadata.region ? { region: metadata.region } : {}),
    ...(reason ? { reason } : {})
  };
}

function legalityResult(input, card, overrides = {}) {
  return {
    game: input.game,
    canonicalCardId: input.canonicalCardId,
    ...(input.printingId ? { printingId: input.printingId } : {}),
    format: input.format,
    status: overrides.status || 'unknown',
    ...(Number.isFinite(overrides.restrictionLimit) ? { restrictionLimit: overrides.restrictionLimit } : {}),
    source: overrides.source || null,
    sourceVersion: overrides.sourceVersion || null,
    lastVerified: overrides.lastVerified || null,
    effectiveDate: overrides.effectiveDate || null,
    ...(overrides.region ? { region: overrides.region } : {}),
    ...(overrides.reason ? { reason: overrides.reason } : {})
  };
}

function yugiohBanlistStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { status: 'legal', limit: 3 };
  if (raw === 'forbidden') return { status: 'banned', limit: 0 };
  if (raw === 'limited') return { status: 'limited', limit: 1 };
  if (raw === 'semi-limited' || raw === 'semi_limited') return { status: 'semi_limited', limit: 2 };
  return { status: 'unknown', limit: null };
}

async function checkCatalogBackedLegality(input) {
  const index = await catalogLegalityIndex(input.game);
  const metadata = index?.metadata || {};
  const card = index?.byId.get(input.canonicalCardId || input.printingId);
  if (!card) return unknownLegality(input, metadata, 'Card identity is not present in the production legality source index.');

  if (input.game === 'pokemon') {
    const legalities = card.legalities && typeof card.legalities === 'object' ? card.legalities : null;
    if (!legalities || !Object.prototype.hasOwnProperty.call(legalities, input.format)) {
      return unknownLegality(input, metadata, 'Pokemon legality is unavailable for this card/format in the current source data.');
    }
    const status = normalizeStatus(legalities[input.format]);
    return legalityResult(input, card, { ...metadata, status, reason: status === 'not_legal' ? 'The source legality map marks this format as not legal.' : null });
  }

  if (input.game === 'yugioh') {
    if (input.format !== 'advanced_tcg') {
      return unknownLegality(input, metadata, 'Yu-Gi-Oh! legality is only source-backed for the TCG Advanced list right now.');
    }
    const resolved = yugiohBanlistStatus(card.ban_tcg || card.banlist_info?.ban_tcg);
    return legalityResult(input, card, { ...metadata, status: resolved.status, restrictionLimit: resolved.limit });
  }

  if (input.game === 'flesh_and_blood') {
    const prefix = FAB_FORMAT_PREFIX[input.format];
    if (!prefix) {
      return unknownLegality(input, metadata, 'Flesh and Blood format is not supported by the current source data.');
    }
    const hasAnyField = [`${prefix}_legal`, `${prefix}_banned`, `${prefix}_suspended`, `${prefix}_restricted`, `${prefix}_living_legend`]
      .some((field) => Object.prototype.hasOwnProperty.call(card, field));
    if (!hasAnyField) {
      return unknownLegality(input, metadata, 'Flesh and Blood legality fields are missing for this card/format.');
    }
    let status = card[`${prefix}_legal`] === false ? 'not_legal' : 'legal';
    let restrictionLimit = null;
    if (card[`${prefix}_living_legend`]) status = 'rotated';
    if (card[`${prefix}_suspended`]) status = 'suspended';
    if (card[`${prefix}_banned`]) status = 'banned';
    if (card[`${prefix}_restricted`]) {
      status = 'restricted';
      restrictionLimit = 1;
    }
    return legalityResult(input, card, {
      ...metadata,
      status,
      restrictionLimit,
      reason: status === 'rotated' ? 'Source marks this identity as Living Legend for this format.' : null
    });
  }

  return unknownLegality(input, metadata);
}

async function checkLegality(input) {
  if (CATALOG_LEGALITY_CONFIG[input.game]) {
    return checkCatalogBackedLegality(input);
  }
  if (input.game !== 'magic') {
    return unknownLegality(input, {
      source: `${input.game} MainPhase catalog legality fields`,
      sourceVersion: null,
      lastVerified: null,
      effectiveDate: null
    });
  }
  const index = await mtgLegalityIndex();
  if (!input.canonicalCardId && input.printingId) {
    const detailResponse = await fetch(`${SUPABASE_FUNCTION_ORIGIN}/api/public/v1/catalog/prints/magic/${encodeURIComponent(input.printingId)}`);
    if (detailResponse.ok) {
      const detail = await detailResponse.json();
      input = {
        ...input,
        canonicalCardId: String(detail?.data?.identity?.cardId || '').trim()
      };
    }
  }
  if (!MAGIC_FORMATS.has(input.format)) {
    return unknownLegality(input, index.metadata, 'Magic format is not supported by the canonical legality owner yet.');
  }
  const record = index.byId.get(input.canonicalCardId);
  if (!record?.legalities || !Object.prototype.hasOwnProperty.call(record.legalities, input.format)) {
    return unknownLegality(input, index.metadata, 'Magic legality fields are missing for this card identity.');
  }
  return {
    game: input.game,
    canonicalCardId: input.canonicalCardId,
    ...(input.printingId ? { printingId: input.printingId } : {}),
    format: input.format,
    status: record.legalities[input.format],
    source: index.metadata.source,
    sourceVersion: index.metadata.sourceVersion,
    lastVerified: index.metadata.lastVerified,
    effectiveDate: index.metadata.effectiveDate
  };
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((item) => item.toString(16).padStart(2, '0')).join('');
}

async function envelope(request, data, dataVersion = null, pricingVersion = null) {
  return {
    apiVersion: '1',
    requestId: requestId(request),
    generatedAt: new Date().toISOString(),
    dataVersion: dataVersion || `legality-${(await sha256(JSON.stringify(data))).slice(0, 16)}`,
    pricingVersion,
    data
  };
}

async function json(request, data, status = 200, cacheControl = 'public, max-age=3600, stale-while-revalidate=86400', dataVersion = null, pricingVersion = null) {
  return new Response(JSON.stringify(await envelope(request, data, dataVersion, pricingVersion)), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl }
  });
}

function errorResponse(request, error) {
  const known = error instanceof ApiError ? error : new ApiError(500, 'internal_error', 'The public API could not complete the request.', true);
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  if (known.retryAfterSeconds) headers.set('Retry-After', String(known.retryAfterSeconds));
  return new Response(JSON.stringify({
    apiVersion: '1',
    requestId: requestId(request),
    error: {
      code: known.code,
      message: known.message,
      retryable: known.retryable,
      retryAfterSeconds: known.retryAfterSeconds
    }
  }), { status: known.status, headers });
}

async function handleLegality(request, url) {
  try {
    if (request.method === 'POST' && url.pathname === '/api/public/v1/legality/check') {
      const payload = await readJsonBody(request);
      const input = validateLegalityIdentity(payload, 0);
      const result = await checkLegality(input);
      return json(request, result, 200, 'public, max-age=3600, stale-while-revalidate=86400', result.sourceVersion);
    }
    if (request.method === 'POST' && url.pathname === '/api/public/v1/legality/checks/batch') {
      const payload = await readJsonBody(request);
      if (!Array.isArray(payload.identities)) throw new ApiError(400, 'invalid_request', 'identities must be an array.');
      if (payload.identities.length > LEGALITY_BATCH_MAX) throw new ApiError(400, 'invalid_request', `A maximum of ${LEGALITY_BATCH_MAX} identities is allowed.`);
      const inputs = payload.identities.map(validateLegalityIdentity);
      const items = await Promise.all(inputs.map(checkLegality));
      return json(request, { items }, 200, 'public, max-age=3600, stale-while-revalidate=86400');
    }
    return null;
  } catch (error) {
    console.error('legality route failed', error);
    return errorResponse(request, error);
  }
}

async function augmentServiceStatus(request, upstreamResponse) {
  const response = upstreamResponse.clone();
  if (!response.ok) return upstreamResponse;
  try {
    const body = await response.json();
    const [index, pokemonIndex, yugiohIndex, fabIndex] = await Promise.all([
      mtgLegalityIndex(),
      catalogLegalityIndex('pokemon'),
      catalogLegalityIndex('yugioh'),
      catalogLegalityIndex('flesh_and_blood')
    ]);
    body.data = {
      ...body.data,
      legality: {
        status: index.metadata.canonicalCardCount > 0 ? 'partial' : 'unavailable',
        games: [
          { game: 'magic', status: index.metadata.canonicalCardCount > 0 ? 'ready' : 'unavailable', sourceVersion: index.metadata.sourceVersion, generatedAt: index.metadata.lastVerified, canonicalCardCount: index.metadata.canonicalCardCount },
          { game: 'pokemon', status: 'source-backed-card-fields', sourceVersion: pokemonIndex?.metadata.sourceVersion || null, generatedAt: pokemonIndex?.metadata.lastVerified || null, canonicalCardCount: pokemonIndex?.metadata.canonicalCardCount || 0 },
          { game: 'yugioh', status: 'source-backed-banlist-fields', sourceVersion: yugiohIndex?.metadata.sourceVersion || null, generatedAt: yugiohIndex?.metadata.lastVerified || null, canonicalCardCount: yugiohIndex?.metadata.canonicalCardCount || 0, region: 'TCG' },
          { game: 'flesh_and_blood', status: 'source-backed-card-fields', sourceVersion: fabIndex?.metadata.sourceVersion || null, generatedAt: fabIndex?.metadata.lastVerified || null, canonicalCardCount: fabIndex?.metadata.canonicalCardCount || 0 },
          { game: 'lorcana', status: 'unknown-until-official-list-source', sourceVersion: null, generatedAt: null },
          { game: 'onepiece', status: 'unknown-until-official-list-source', sourceVersion: null, generatedAt: null },
          { game: 'starwars', status: 'unknown-until-official-list-source', sourceVersion: null, generatedAt: null }
        ]
      }
    };
    return new Response(JSON.stringify(body), {
      status: upstreamResponse.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' }
    });
  } catch {
    return upstreamResponse;
  }
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/public/v1/')) return new Response('Not found', { status: 404 });
    const legalityResponse = await handleLegality(request, url);
    if (legalityResponse) return legalityResponse;

    const upstream = new URL(`${SUPABASE_FUNCTION_ORIGIN}${url.pathname}${url.search}`);
    const headers = new Headers(request.headers);
    headers.delete('authorization');
    headers.delete('cookie');
    headers.set('x-request-id', headers.get('cf-ray') || crypto.randomUUID());
    headers.set('cf-connecting-ip', request.headers.get('cf-connecting-ip') || 'unknown');

    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'manual'
    });
    if (request.method === 'GET' && url.pathname === '/api/public/v1/service/status') {
      return augmentServiceStatus(request, response);
    }
    return response;
  }
};
