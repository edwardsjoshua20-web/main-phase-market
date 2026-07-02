import { getInventoryCardMergeKey } from '@/components/admin/cardInventorySnapshot';
import { inventoryListings } from '@/services/inventoryListings';

export async function upsertInventoryCards(cardsToAdd, existingCards = []) {
  const normalizedCards = Array.isArray(cardsToAdd) ? cardsToAdd : [cardsToAdd];

  for (const cardData of normalizedCards) {
    const mergeKey = getInventoryCardMergeKey(cardData);
    const existingCard = existingCards.find((card) => getInventoryCardMergeKey(card) === mergeKey);

    if (existingCard) {
      await inventoryListings.update(existingCard.id, {
        quantity: Number(existingCard.quantity || 0) + Number(cardData.quantity || 0),
        location: cardData.location || existingCard.location
      });
      continue;
    }

    await inventoryListings.create(cardData);
  }

  return normalizedCards.length;
}
