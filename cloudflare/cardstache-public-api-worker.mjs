const SUPABASE_FUNCTION_ORIGIN = 'https://wwvvyrhlybwijqlhubdv.supabase.co/functions/v1/cardstache-public-api';
const MAINPHASE_STATIC_ORIGIN = 'https://main-phase-market.pages.dev';
const LEGALITY_BATCH_MAX = 1000;
const SUPPORTED_GAMES = new Set(['magic', 'pokemon', 'yugioh', 'lorcana', 'onepiece', 'flesh_and_blood', 'starwars']);
const MAGIC_FORMATS = new Set(['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander']);

let mtgLegalityIndexPromise;

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
    mtgLegalityIndexPromise = fetch(`${MAINPHASE_STATIC_ORIGIN}/data/legality/mtg.json`)
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
    ...(reason ? { reason } : {})
  };
}

async function checkLegality(input) {
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
    return errorResponse(request, error);
  }
}

async function augmentServiceStatus(request, upstreamResponse) {
  const response = upstreamResponse.clone();
  if (!response.ok) return upstreamResponse;
  try {
    const body = await response.json();
    const index = await mtgLegalityIndex();
    body.data = {
      ...body.data,
      legality: {
        status: index.metadata.canonicalCardCount > 0 ? 'partial' : 'unavailable',
        games: [
          { game: 'magic', status: index.metadata.canonicalCardCount > 0 ? 'ready' : 'unavailable', sourceVersion: index.metadata.sourceVersion, generatedAt: index.metadata.lastVerified, canonicalCardCount: index.metadata.canonicalCardCount },
          { game: 'pokemon', status: 'unknown-until-production-index', sourceVersion: null, generatedAt: null },
          { game: 'yugioh', status: 'unknown-until-production-index', sourceVersion: null, generatedAt: null, region: 'TCG' },
          { game: 'flesh_and_blood', status: 'unknown-until-production-index', sourceVersion: null, generatedAt: null },
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
