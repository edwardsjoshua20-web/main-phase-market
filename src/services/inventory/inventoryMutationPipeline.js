import { inventoryOwner } from '@/services/inventory/inventoryOwner';

export async function upsertInventoryCards(cardsToAdd, existingCards = []) {
  return inventoryOwner.upsertCardListings(cardsToAdd, existingCards);
}
