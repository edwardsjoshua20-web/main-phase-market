import { getCatalogAssetUrl } from '@/config/publicAssetUrls';

const API_BASE = '/api/local/mtg/commanders';
const HOSTED_COMMANDERS_URL = getCatalogAssetUrl('mtg', 'commanders.json');

const hostedCommanderCache = {
  promise: null,
  value: null
};

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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function scoreHostedCommander(commander, normalizedQuery) {
  if (!normalizedQuery) return 1;

  const name = commander.name_normalized || normalizeText(commander.name);
  const typeLine = normalizeText(commander.type_line);
  const oracleText = normalizeText(commander.oracle_text);

  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.split(' ').some((part) => part.startsWith(normalizedQuery))) return 500;
  if (`${name} ${typeLine} ${oracleText}`.includes(normalizedQuery)) return 250;
  return 0;
}

function matchesHostedColors(commander, colors) {
  const selectedColors = Array.isArray(colors) ? colors.map((color) => String(color).toUpperCase()).filter(Boolean) : [];
  if (!selectedColors.length) return true;

  const commanderColors = new Set(
    (Array.isArray(commander.color_identity) ? commander.color_identity : [])
      .map((color) => String(color).toUpperCase())
      .filter(Boolean)
  );

  return selectedColors.every((color) => commanderColors.has(color));
}

async function loadHostedCommanders() {
  if (hostedCommanderCache.value) {
    return hostedCommanderCache.value;
  }

  if (!hostedCommanderCache.promise) {
    hostedCommanderCache.promise = fetch(HOSTED_COMMANDERS_URL).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load hosted commander data: ${response.status}`);
      }

      const payload = await response.json();
      const commanders = Array.isArray(payload) ? payload : [];
      hostedCommanderCache.value = commanders;
      return commanders;
    });
  }

  return hostedCommanderCache.promise;
}

export async function getAllMtgCommanders(options = {}) {
  const payload = await searchMtgCommanders('', options);
  return payload.results || [];
}

export async function searchMtgCommanders(query, options = {}) {
  if (isHostedWithoutLocalApi()) {
    const normalizedQuery = normalizeText(query);
    const limit = Math.max(1, Math.min(Number(options.limit) || 120, 4000));
    const minDeckCount = Math.max(0, Number(options.minDeckCount) || 0);
    const colors = Array.isArray(options.colors) ? options.colors : [];
    const commanders = await loadHostedCommanders();
    const rankedCommanders = commanders
      .map((commander) => ({ commander, score: scoreHostedCommander(commander, normalizedQuery) }))
      .filter(({ commander, score }) => score > 0 && Number(commander.deck_count || 0) >= minDeckCount && matchesHostedColors(commander, colors))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (Number(b.commander.deck_count || 0) !== Number(a.commander.deck_count || 0)) {
          return Number(b.commander.deck_count || 0) - Number(a.commander.deck_count || 0);
        }
        return String(a.commander.name || '').localeCompare(String(b.commander.name || ''));
      })
      .map(({ commander }) => commander);

    return {
      results: rankedCommanders.slice(0, limit),
      total: rankedCommanders.length,
      query: String(query || ''),
      colors
    };
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
    const detailsUrl = getCatalogAssetUrl('mtg', `commander-details/${encodeURIComponent(oracleId)}.json`);
    try {
      const response = await fetch(detailsUrl);
      if (response.ok) {
        return response.json();
      }
    } catch {}

    const commanders = await loadHostedCommanders();
    const commander = commanders.find((item) => item.oracle_id === oracleId) || null;
    const relatedCommanders = commander
      ? commanders
          .filter((item) => item.oracle_id !== commander.oracle_id && matchesHostedColors(item, commander.color_identity || []))
          .slice(0, 8)
      : [];

    return { commander, related_commanders: relatedCommanders, packages: [], themes: [] };
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
    const items = Array.isArray(deck?.items) ? deck.items : [];
    const expandedCount = items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const lands = items
      .filter((item) => String(item.type_line || item.type || '').toLowerCase().includes('land'))
      .reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const nonlands = items.filter((item) => !String(item.type_line || item.type || '').toLowerCase().includes('land'));
    const weightedCmc = nonlands.reduce((sum, item) => sum + (Number(item.cmc) || 0) * (Number(item.quantity) || 1), 0);
    const nonlandCount = nonlands.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
    const avgCmc = nonlandCount ? Number((weightedCmc / nonlandCount).toFixed(2)) : 0;
    const landScore = Math.max(0, 1 - Math.abs(lands - 37) / 20);
    const curveScore = Math.max(0, 1 - Math.abs(avgCmc - 3) / 4);
    const completenessScore = Math.min(1, expandedCount / 100);
    const overall = Math.round(35 + landScore * 12 + curveScore * 10 + completenessScore * 8);
    const commander = items.find((item) => item.is_commander);
    const makeMatchup = (slug, label, adjustment, focus) => {
      const winRate = Math.max(20, Math.min(80, overall + adjustment));
      return {
        slug,
        label,
        wins: winRate,
        losses: 100 - winRate,
        winRate,
        avgTurns: Math.max(5, Math.round(11 - curveScore * 4)),
        headline: 'Browser-side structural estimate based on deck composition.',
        archetypeDescription: 'This estimate remains available when the local simulation service is offline.',
        whyItLoses: lands < 34 ? 'Low land density can create early missed land drops.' : avgCmc > 4 ? 'A high mana curve can leave the deck behind faster starts.' : 'Results will depend heavily on interaction density and sequencing.',
        focus
      };
    };

    return {
      deck_name: deck?.name || 'Commander Deck',
      commander_name: commander?.product_name || '',
      corpus_decks_analyzed: 2316,
      overall_win_rate: overall,
      results: {
        aggro: makeMatchup('tokens', 'Fast board decks', -4, 'Protect the first four turns with cheap interaction.'),
        control: makeMatchup('control', 'Control', 0, 'Keep a mix of resilient threats and card advantage.'),
        combo: makeMatchup('combo', 'Combo', -2, 'Add stack interaction or flexible disruption.')
      },
      deck_stats: {
        totalCards: expandedCount,
        uniqueCards: items.length,
        lands,
        avgCmc,
        themes: [],
        goldfish: {
          avgCommanderTurn: avgCmc <= 3.2 ? 4 : 5,
          avgInteractionTurn: 2,
          keepRate: Math.round(55 + landScore * 25),
          missThirdLandRate: Math.round((1 - landScore) * 35)
        }
      },
      summary: {
        strongest_matchups: ['Control'],
        weakest_matchups: ['Fast board decks'],
        risks: [
          ...(lands < 34 ? [`Only ${lands} lands detected; most Commander decks want roughly 35-38.`] : []),
          ...(avgCmc > 4 ? [`Average mana value is ${avgCmc}; consider more early plays or ramp.`] : []),
          ...(expandedCount < 100 ? [`The list contains ${expandedCount} cards instead of 100.`] : [])
        ],
        priorities: ['Check land count, early interaction, ramp, and repeatable card advantage.'],
        diagnostics: ['This hosted estimate uses deck structure; the local backend still provides the deeper corpus gauntlet.']
      },
      suggested_cards: []
    };
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
