import { getCatalogAssetUrl } from '@/config/publicAssetUrls';

const ROUTE_TO_ENCYCLOPEDIA_GAME = {
  magic: 'magic',
  pokemon: 'pokemon',
  yugioh: 'yugioh',
  lorcana: 'lorcana',
  fab: 'fab',
  onepiece: 'onepiece',
  starwars: 'starwars'
};

const shardCache = new Map();

function cleanText(value) {
  return String(value || '').trim();
}

function shardUrl(game, setSlug) {
  return getCatalogAssetUrl('encyclopedia', `${game}/sets/${setSlug}.json`);
}

function normalizeShardCard(card = {}) {
  return {
    ...card,
    encyclopediaCard: true,
    id: cleanText(card.id || card.printingId || card.name),
    name: cleanText(card.name),
    set_name: cleanText(card.set_name || card.setName),
    set_code: cleanText(card.set_code || card.setCode),
    collector_number: cleanText(card.collector_number || card.number || card.card_number),
    card_number: cleanText(card.card_number || card.number || card.collector_number),
    rarity: cleanText(card.rarity),
    type_line: cleanText(card.type_line || card.type),
    raw: card.raw || {}
  };
}

export async function fetchSetCardShard(game, setSlug) {
  const shardGame = ROUTE_TO_ENCYCLOPEDIA_GAME[game];
  const slug = cleanText(setSlug);
  if (!shardGame || !slug || shardGame === 'magic') return null;

  const cacheKey = `${shardGame}:${slug}`;
  if (shardCache.has(cacheKey)) return shardCache.get(cacheKey);

  const promise = fetch(shardUrl(shardGame, slug), { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return null;
      const payload = await response.json();
      if (!Array.isArray(payload?.cards)) return null;
      return {
        ...payload,
        cards: payload.cards.map(normalizeShardCard)
      };
    })
    .catch(() => null);

  shardCache.set(cacheKey, promise);
  return promise;
}
