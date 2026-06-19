const API_BASE = '/api/local/mtg/commanders';

async function parseJson(response, fallbackMessage) {
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = fallbackMessage;
    try {
      if (contentType.toLowerCase().includes('application/json')) {
        const payload = await response.json();
        if (payload?.error) {
          message = payload.error;
        }
      }
    } catch {}
    throw new Error(message);
  }

  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(fallbackMessage);
  }

  return response.json();
}

function isHostedWithoutLocalApi() {
  if (typeof window === 'undefined') return false;
  return !['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
}

export async function getAllMtgCommanders(options = {}) {
  const payload = await searchMtgCommanders('', options);
  return payload.results || [];
}

export async function searchMtgCommanders(query, options = {}) {
  if (isHostedWithoutLocalApi()) {
    return { results: [], total: 0, query: String(query || ''), colors: [] };
  }

  const response = await fetch(`${API_BASE}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: String(query || ''),
      colors: Array.isArray(options.colors) ? options.colors : [],
      limit: options.limit || 120,
      minDeckCount: Number(options.minDeckCount) || 0
    })
  });

  return parseJson(response, 'Failed to load commanders');
}

export async function getMtgCommanderPage(oracleId, options = {}) {
  if (isHostedWithoutLocalApi()) {
    return { commander: null, related_commanders: [], packages: [], themes: [] };
  }

  const params = new URLSearchParams();
  if (options.theme) {
    params.set('theme', String(options.theme));
  }
  if (options.mode) {
    params.set('mode', String(options.mode));
  }

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`${API_BASE}/${encodeURIComponent(oracleId)}${suffix}`);
  return parseJson(response, 'Failed to load commander page');
}

export async function getMtgCommanderByOracleId(oracleId) {
  const payload = await getMtgCommanderPage(oracleId);
  return payload?.commander || null;
}

export async function importMtgCommanderDeckText(text, options = {}) {
  if (isHostedWithoutLocalApi()) {
    throw new Error('Commander import is not available on the hosted site yet.');
  }

  const response = await fetch(`${API_BASE}/import-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: String(text || ''),
      deckName: options.deckName || '',
      sourceUrl: options.sourceUrl || '',
      refresh: Boolean(options.refresh)
    })
  });

  return parseJson(response, 'Failed to import commander deck text');
}

export async function rebuildMtgCommanderData() {
  if (isHostedWithoutLocalApi()) {
    throw new Error('Commander rebuild is only available in the local backend.');
  }

  const response = await fetch(`${API_BASE}/rebuild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  return parseJson(response, 'Failed to rebuild commander data');
}

export async function simulateMtgCommanderDeck(deck) {
  if (isHostedWithoutLocalApi()) {
    throw new Error('Commander simulation is not available on the hosted site yet.');
  }

  const response = await fetch(`${API_BASE}/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deck })
  });

  return parseJson(response, 'Failed to simulate commander deck');
}

export async function getRelatedMtgCommanders(commander, limit = 8) {
  if (!commander?.oracle_id) return [];
  const payload = await getMtgCommanderPage(commander.oracle_id);
  return (payload?.related_commanders || []).slice(0, limit);
}
