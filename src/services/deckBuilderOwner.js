import { backend } from '@/services/backend';
import { getCardImageUrl } from '@/lib/cardImages';
import { appendDeckHistory, createDeckHistoryEntry } from '@/lib/deckHistory';
import { allowsAnyNumberOfCopies } from '@/lib/deckCopyLimits';
import { normalizeDeckGame } from '@/lib/deckSections';
import { calculateDeckValue } from '@/services/pricing/pricingPipeline';
import { searchOwner } from '@/services/search/searchOwner';

function normalizeName(value) {
  return String(value || '').trim().toLowerCase().replace(/[’]/g, "'");
}

function isCommanderDeck(deck) {
  return String(deck?.deck_format || '').trim().toLowerCase() === 'commander';
}

function isSameCard(left = {}, right = {}) {
  const leftOracleId = String(left.oracle_id || '').trim();
  const rightOracleId = String(right.oracle_id || '').trim();
  if (leftOracleId && rightOracleId) return leftOracleId === rightOracleId;
  return normalizeName(left.product_name || left.name) === normalizeName(right.product_name || right.name);
}

function toDeckItem(card, game, quantity, asCommander = false) {
  return {
    product_id: card.id || card.product_id || card.oracle_id,
    product_name: card.name || card.product_name || card.card_name,
    product_image: getCardImageUrl(card),
    image_url: card.image_url || null,
    english_image_url: card.english_image_url || null,
    image_small: card.image_small || null,
    fallback_image_url: card.fallback_image_url || null,
    price: card.display_price ?? card.sell_price ?? card.price ?? card.market_price ?? 0,
    product_type: normalizeDeckGame(game),
    type: card.type || card.type_line || '',
    type_line: card.type_line || card.type || '',
    quantity,
    mana_cost: card.mana_cost || '',
    cmc: card.cmc ?? 0,
    oracle_text: card.oracle_text || '',
    oracle_id: card.oracle_id || null,
    set_code: card.set_code || '',
    color_identity: card.color_identity || [],
    ...(asCommander ? { is_commander: true } : {})
  };
}

export function buildDeckCardAddition(deck, card, options = {}) {
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const items = Array.isArray(deck?.items) ? deck.items : [];
  const sameIdentityItems = items.filter((item) => isSameCard(item, card));
  const currentQuantity = sameIdentityItems.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
  const typeLine = String(card.type || card.type_line || '').toLowerCase();
  const unlimited = typeLine.includes('basic land') || allowsAnyNumberOfCopies(card);

  if (isCommanderDeck(deck) && !unlimited && currentQuantity + quantity > 1) {
    return {
      ok: false,
      code: 'copy_limit',
      message: `Commander allows 1 copy of ${card.name || card.product_name || card.card_name}.`
    };
  }

  const productId = card.id || card.product_id || card.oracle_id;
  const existingIndex = items.findIndex((item) => item.product_id === productId);
  const existing = existingIndex >= 0 ? items[existingIndex] : null;
  const updatedItems = existing
    ? items.map((item, index) => index === existingIndex
        ? { ...item, quantity: (Number(item.quantity) || 1) + quantity, ...(options.asCommander ? { is_commander: true } : {}) }
        : options.asCommander ? { ...item, is_commander: false } : item)
    : [
        ...items.map((item) => options.asCommander ? { ...item, is_commander: false } : item),
        toDeckItem(card, deck.game || options.game || 'magic', quantity, options.asCommander)
      ];

  return {
    ok: true,
    updates: {
      items: updatedItems,
      estimated_cost: calculateDeckValue(updatedItems),
      ...(options.asCommander ? { commander_name: card.name || card.product_name || card.card_name } : {})
    },
    undo: {
      kind: 'restore_cards',
      cards: [{ product_id: productId, item: existing ? { ...existing } : null, index: existingIndex < 0 ? items.length : existingIndex }]
    }
  };
}

async function resolveMtgDeckCard(card) {
  const oracleId = String(card?.oracle_id || '').trim();
  if (!oracleId) return card;
  const printings = await searchOwner.getMagicPrintingsByOracleId(oracleId);
  return printings.find((printing) => printing.id === card.id) || printings[0] || card;
}

export const deckBuilderOwner = {
  async listUserDecks(userEmail, options = {}) {
    if (!userEmail) return [];
    const rows = await backend.data.CardList.filter({ user_email: userEmail });
    const game = options.game ? normalizeDeckGame(options.game) : null;
    const format = options.format ? String(options.format).toLowerCase() : null;
    return rows.filter((deck) => (!game || normalizeDeckGame(deck.game) === game)
      && (!format || String(deck.deck_format || '').toLowerCase() === format));
  },

  createDeck({ userEmail, name, game = 'magic', format = 'commander' }) {
    if (!userEmail) throw new Error('Sign in is required to create a deck.');
    const normalizedGame = normalizeDeckGame(game);
    return backend.data.CardList.create({
      user_email: userEmail,
      name: String(name || '').trim() || 'New Deck',
      description: `${normalizedGame === 'magic' ? 'Magic' : normalizedGame} deck`,
      game: normalizedGame,
      deck_format: format,
      items: [],
      estimated_cost: 0
    });
  },

  buildCardAddition: buildDeckCardAddition,

  async addCardToDeck(deck, card, options = {}) {
    if (!deck?.id) throw new Error('Choose a deck first.');
    const resolvedCard = normalizeDeckGame(deck.game) === 'magic' ? await resolveMtgDeckCard(card) : card;
    const change = buildDeckCardAddition(deck, resolvedCard, options);
    if (!change.ok) return change;

    const label = options.asCommander
      ? `Set ${resolvedCard.name || resolvedCard.card_name} as Commander`
      : `Added ${resolvedCard.name || resolvedCard.card_name}`;
    const historyEntry = createDeckHistoryEntry(label, change.undo);
    const savedDeck = await backend.data.CardList.update(deck.id, {
      ...change.updates,
      change_history: appendDeckHistory(deck.change_history, historyEntry)
    });
    return { ...change, savedDeck, resolvedCard };
  },

  async createDeckWithCard({ userEmail, name, card, asCommander = false }) {
    const deck = await this.createDeck({ userEmail, name, game: 'magic', format: 'commander' });
    const result = await this.addCardToDeck(deck, card, { asCommander });
    if (!result.ok) throw new Error(result.message);
    return result.savedDeck;
  }
};

export default deckBuilderOwner;
