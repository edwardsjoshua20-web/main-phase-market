import { searchOwner } from '@/services/search/searchOwner';
import { buildSetDetailPath, resolveSetDetail, routeGameKey, slugifySetValue } from '@/services/catalog/setDetailService';
import { ENCYCLOPEDIA_GAMES, ENCYCLOPEDIA_RULE_TOPICS } from './encyclopediaData';

const GAME_BY_ID = new Map(ENCYCLOPEDIA_GAMES.map((game) => [game.id, game]));
const GAME_BY_ROUTE = new Map(ENCYCLOPEDIA_GAMES.map((game) => [game.routeKey, game]));

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeGameKey(value) {
  const routed = routeGameKey(value);
  if (GAME_BY_ROUTE.has(routed)) return GAME_BY_ROUTE.get(routed).id;
  if (GAME_BY_ID.has(value)) return value;
  return routed === 'fab' ? 'flesh_and_blood' : routed;
}

function formatDate(value) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

function buildEncyclopediaSetPath(gameMeta, set = {}) {
  const slugSource = set.name || set.set_name || set.setName || set.set_code || set.code || set.id;
  return `/Encyclopedia/${gameMeta.routeKey}/sets/${slugifySetValue(slugSource)}`;
}

function normalizeSet(set = {}, gameMeta) {
  return {
    id: cleanText(set.id || set.set_code || set.name),
    game: gameMeta.id,
    routeGame: gameMeta.routeKey,
    name: cleanText(set.name),
    setCode: cleanText(set.set_code),
    imageUrl: set.image_url || null,
    releaseDate: formatDate(set.release_date),
    inStock: Boolean(set.inStock),
    path: buildEncyclopediaSetPath(gameMeta, set)
  };
}

function cardRouteId(card = {}) {
  return encodeURIComponent(cleanText(card.id || card.searchIdentity || card.name));
}

function normalizeCard(card = {}, gameMeta, setSlug = '') {
  const routeId = cardRouteId(card);
  return {
    ...card,
    game: card.game || gameMeta.searchGame,
    routeId,
    encyclopediaPath: `/Encyclopedia/${gameMeta.routeKey}/sets/${setSlug}/cards/${routeId}`
  };
}

function collectFieldValues(card = {}) {
  const raw = card.raw || {};
  return [
    { label: 'Set', value: card.set_name || raw.set_name || raw.setName },
    { label: 'Set Code', value: card.set_code || raw.set_code || raw.set_id || raw.set },
    { label: 'Number', value: card.collector_number || card.card_number || raw.collector_number || raw.card_number || raw.number },
    { label: 'Rarity', value: card.rarity || raw.rarity },
    { label: 'Type', value: card.type_line || raw.type_line || raw.type || raw.type_text || raw.supertype },
    { label: 'Artist', value: raw.artist || raw.illustrator },
    { label: 'Language', value: raw.lang || raw.language }
  ].filter((field) => cleanText(field.value));
}

function sourceObjectsForTopic(gameMeta, topic = {}) {
  const wanted = new Set(topic.sourceLabels || []);
  return gameMeta.sourceRefs.filter((source) => wanted.size === 0 || wanted.has(source.label));
}

function printingKey(printing = {}) {
  return [
    printing.id,
    printing.searchIdentity,
    printing.name,
    printing.set_code || printing.set,
    printing.collector_number || printing.card_number || printing.number,
    printing.lang || printing.language
  ].map(cleanText).join('|');
}

function normalizePrintings(printings = []) {
  const seen = new Set();
  return printings.filter((printing) => {
    const key = printingKey(printing);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((printing) => ({
    ...printing,
    setLabel: cleanText(printing.set_name || printing.set || printing.set_code),
    numberLabel: cleanText(printing.collector_number || printing.card_number || printing.number),
    priceLabel: Number(printing.listingSellPrice || printing.sell_price || printing.price || 0) > 0
      ? Number(printing.listingSellPrice || printing.sell_price || printing.price).toFixed(2)
      : ''
  }));
}

export const gameKnowledgeOwner = {
  supportedGames: ENCYCLOPEDIA_GAMES.map((game) => game.id),

  listGames() {
    return ENCYCLOPEDIA_GAMES.map((game) => ({
      ...game,
      rulesCount: (ENCYCLOPEDIA_RULE_TOPICS[game.id] || []).length
    }));
  },

  getGame(value) {
    return GAME_BY_ID.get(normalizeGameKey(value)) || null;
  },

  getRulesTopics(value) {
    const game = this.getGame(value);
    if (!game) return [];
    return (ENCYCLOPEDIA_RULE_TOPICS[game.id] || []).map((topic) => ({
      ...topic,
      game: game.id,
      path: `/Encyclopedia/${game.routeKey}/rules/${topic.slug}`,
      sources: sourceObjectsForTopic(game, topic)
    }));
  },

  getRulesTopic(value, topicSlug) {
    const topics = this.getRulesTopics(value);
    return topics.find((topic) => topic.slug === topicSlug) || null;
  },

  async listSets(value, options = {}) {
    const game = this.getGame(value);
    if (!game) return [];
    const sets = await searchOwner.listSets({
      game: game.searchGame,
      products: options.products || [],
      limit: Number(options.limit) || 0
    });
    return sets.map((set) => normalizeSet(set, game));
  },

  async resolveSet(value, setSlug) {
    const game = this.getGame(value);
    if (!game) return null;
    const detail = await resolveSetDetail({ game: game.routeKey, setSlug });
    if (!detail) return null;
    return {
      ...detail,
      gameMeta: game,
      legacySetPath: buildSetDetailPath({ game: game.routeKey, name: detail.name }),
      setCards: (detail.setCards || []).map((card) => normalizeCard(card, game, detail.slug || setSlug))
    };
  },

  async resolveSetCard(value, setSlug, cardId) {
    const detail = await this.resolveSet(value, setSlug);
    if (!detail) return null;
    const decodedId = decodeURIComponent(cleanText(cardId));
    const card = (detail.setCards || []).find((entry) => {
      const candidates = [entry.id, entry.searchIdentity, entry.routeId, entry.name].map(cleanText);
      return candidates.includes(decodedId) || candidates.includes(cardId);
    });
    if (!card) return null;

    let printings = [];
    try {
      const oracleId = card.raw?.oracle_id || card.oracle_id;
      if (detail.gameMeta.id === 'magic' && oracleId) {
        printings = await searchOwner.getMagicPrintingsByOracleId(oracleId);
      } else {
        printings = await searchOwner.searchCanonicalPrintings(card.name, detail.gameMeta.searchGame, { limit: 80 });
      }
    } catch {
      printings = [];
    }

    return {
      detail,
      card: {
        ...card,
        fields: collectFieldValues(card)
      },
      printings: normalizePrintings(printings)
    };
  }
};
