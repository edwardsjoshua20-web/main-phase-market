import { legalityOwner } from '../legality/legalityOwner.js';
import { gameKnowledgeOwner } from '../knowledge/gameKnowledgeOwner.js';
import { searchOwner } from '../search/searchOwner.js';
import {
  INSTAJUDGE_GAMES,
  buildLegalityRuling,
  buildRulesRuling,
  buildUnsupportedResult,
  detectLegalityFormat,
  extractPossibleCardNames,
  getInstaJudgeGame,
  isLegalityQuestion,
  normalizeJudgeText,
  rankRulesForScenario
} from './instajudgeCore.js';

const SEARCH_GAME_BY_ID = Object.freeze({
  magic: 'magic',
  pokemon: 'pokemon',
  yugioh: 'yugioh',
  lorcana: 'lorcana',
  flesh_and_blood: 'flesh_and_blood',
  onepiece: 'onepiece',
  starwars: 'starwars'
});

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function cleanText(value) {
  return String(value || '').trim();
}

function canonicalCardId(card = {}) {
  return cleanText(
    card.oracle_id
    || card.card_id
    || card.api_id
    || card.unique_id
    || card.uuid
    || card.id
    || card.name
  );
}

function cardText(card = {}) {
  const raw = card.raw || {};
  return cleanText(card.oracle_text || card.rules_text || card.description || card.text || raw.oracle_text || raw.rules_text || raw.description || raw.text);
}

function normalizeCard(card = {}, requestedName = '') {
  return {
    id: cleanText(card.id || card.searchIdentity || card.name),
    name: cleanText(card.name || requestedName),
    game: card.game,
    setCode: cleanText(card.set_code || card.set || card.raw?.set_code || card.raw?.set),
    collectorNumber: cleanText(card.collector_number || card.card_number || card.number || card.raw?.collector_number || card.raw?.number),
    typeLine: cleanText(card.type_line || card.type || card.raw?.type_line || card.raw?.type),
    oracleText: cardText(card),
    manaCost: cleanText(card.mana_cost || card.manaCost || card.raw?.mana_cost),
    colors: card.colors || card.raw?.colors || [],
    colorIdentity: card.color_identity || card.colorIdentity || card.raw?.color_identity || [],
    power: card.power ?? card.raw?.power ?? null,
    toughness: card.toughness ?? card.raw?.toughness ?? null,
    powerToughness: cleanText(card.power_toughness || card.powerToughness || card.pt || card.raw?.power_toughness),
    oracle_id: cleanText(card.oracle_id || card.raw?.oracle_id),
    legalities: card.legalities || card.raw?.legalities || null,
    ban_tcg: card.ban_tcg || card.raw?.ban_tcg || card.raw?.banlist_info?.ban_tcg || null,
    raw: card
  };
}

function isExactEnough(candidate, result) {
  const wanted = normalizeJudgeText(candidate);
  const found = normalizeJudgeText(result?.name);
  return Boolean(wanted && found && (wanted === found || found.includes(wanted) || wanted.includes(found)));
}

function dedupeCards(cards = []) {
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = `${card.game}:${canonicalCardId(card) || card.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

async function resolveCandidate(game, candidate) {
  const searchGame = SEARCH_GAME_BY_ID[game.id] || game.id;
  const results = await searchOwner.searchPreviewByGame(candidate, searchGame, 5, { includeInventory: false });
  const exact = results.find((result) => isExactEnough(candidate, result));
  const chosen = exact || results[0] || null;
  return chosen ? normalizeCard(chosen, candidate) : null;
}

async function resolveCards(game, message, session = {}) {
  const remembered = Array.isArray(session.resolvedCards) ? session.resolvedCards : [];
  const candidates = extractPossibleCardNames(message);
  const resolved = [];

  for (const candidate of candidates) {
    try {
      const card = await resolveCandidate(game, candidate);
      if (card) resolved.push(card);
    } catch {
      // Card lookup must fail closed; unresolved names are handled by the final ruling result.
    }
  }

  return dedupeCards([...resolved, ...remembered]).slice(0, 6);
}

function retrieveRules(game, message) {
  const topics = gameKnowledgeOwner.getRulesTopicsByCategory(game.id, 'reference');
  const ranked = rankRulesForScenario(game.id, message, topics);
  if (ranked.length > 0) return ranked;
  return gameKnowledgeOwner.searchRulesTopics(game.id, message).slice(0, 3);
}

function legalityMetadata(game) {
  if (game.id === 'magic') {
    return {
      source: 'Scryfall catalog legalities',
      sourceVersion: 'MainPhase Magic catalog legality projection',
      lastVerified: game.sourceRefs?.find((source) => /Scryfall/i.test(source.label))?.freshness || null
    };
  }
  if (game.id === 'pokemon') return { source: 'Pokemon TCG catalog legalities', sourceVersion: 'MainPhase Pokemon catalog legality projection' };
  if (game.id === 'yugioh') return { source: 'YGOPRODeck banlist_info.ban_tcg', sourceVersion: 'MainPhase Yu-Gi-Oh! catalog legality projection', region: 'TCG' };
  if (game.id === 'flesh_and_blood') return { source: 'Flesh and Blood catalog legality fields', sourceVersion: 'MainPhase FAB catalog legality projection' };
  return { source: `${game.label} MainPhase catalog legality fields` };
}

function updatedSession(session = {}, result = {}) {
  const priorCards = Array.isArray(session.resolvedCards) ? session.resolvedCards : [];
  return {
    ...session,
    game: result.game || session.game,
    resolvedCards: dedupeCards([...(result.cards || []), ...priorCards]).slice(0, 8),
    lastRuling: result
  };
}

export const instaJudgeOwner = {
  listGames() {
    return INSTAJUDGE_GAMES.map((game) => ({ ...game }));
  },

  getGame(value) {
    return getInstaJudgeGame(value);
  },

  createSession(initial = {}) {
    return {
      game: initial.game || null,
      resolvedCards: [],
      lastRuling: null
    };
  },

  selectGame(session = {}, gameId) {
    const game = this.getGame(gameId);
    if (!game) return { session, game: null };
    return {
      game,
      session: {
        ...session,
        game: game.id,
        resolvedCards: [],
        lastRuling: null
      }
    };
  },

  async ask({ session = {}, gameId, message }) {
    const startedAt = nowMs();
    const game = this.getGame(gameId || session.game);
    const cleanMessage = cleanText(message);

    if (!game) {
      return {
        session,
        result: {
          game: null,
          verdict: 'unverified',
          answer: "I can't start a ruling until a TCG is selected.",
          cards: [],
          rules: [],
          clarificationNeeded: 'Choose a game first.',
          latencyMs: Math.round(nowMs() - startedAt)
        }
      };
    }

    if (!cleanMessage) {
      const result = buildUnsupportedResult({ game, cards: [], rules: [], latencyMs: Math.round(nowMs() - startedAt) });
      return { session: updatedSession({ ...session, game: game.id }, result), result };
    }

    const [cards, rules] = await Promise.all([
      resolveCards(game, cleanMessage, session),
      Promise.resolve(retrieveRules(game, cleanMessage))
    ]);

    let result;
    if (isLegalityQuestion(cleanMessage)) {
      const format = detectLegalityFormat(cleanMessage);
      const card = cards[0];
      if (!card) {
        result = {
          game: game.id,
          verdict: 'unverified',
          answer: "I can't verify legality until I can resolve the card identity from the catalog.",
          cards: [],
          rules,
          clarificationNeeded: 'Please provide the exact card name.',
          latencyMs: Math.round(nowMs() - startedAt)
        };
      } else {
        let legality;
        try {
          legality = legalityOwner.check({
            game: game.id,
            canonicalCardId: canonicalCardId(card),
            printingId: card.id,
            format
          }, {
            card: { ...card.raw, ...card },
            metadata: legalityMetadata(game)
          });
        } catch (error) {
          legality = { status: 'unknown', format, reason: error.message };
        }
        result = buildLegalityRuling({ game, card, legality, rules, latencyMs: Math.round(nowMs() - startedAt) });
      }
    } else {
      result = buildRulesRuling({ game, message: cleanMessage, cards, rules, latencyMs: Math.round(nowMs() - startedAt) });
    }

    return {
      session: updatedSession({ ...session, game: game.id }, result),
      result
    };
  }
};

export default instaJudgeOwner;
