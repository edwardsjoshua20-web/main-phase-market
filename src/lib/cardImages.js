function cleanUrl(value) {
  const url = String(value || '').trim();
  return url && url !== 'null' && url !== 'undefined' ? url : null;
}

function extractUuidFromText(value) {
  const text = cleanUrl(value);
  if (!text) return null;

  const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  return match ? match[0] : null;
}

function getUuidCandidate(card) {
  const directValue = cleanUrl(card?.product_id || card?.id || card?.card_id);
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(directValue || '')) {
    return directValue;
  }

  return (
    extractUuidFromText(card?.image_url) ||
    extractUuidFromText(card?.product_image) ||
    extractUuidFromText(card?.card_image) ||
    extractUuidFromText(card?.english_image_url) ||
    extractUuidFromText(card?.image_normal) ||
    extractUuidFromText(card?.image_large) ||
    extractUuidFromText(card?.image_small) ||
    extractUuidFromText(card?.thumbnail_url) ||
    extractUuidFromText(card?.images?.large) ||
    extractUuidFromText(card?.images?.normal) ||
    extractUuidFromText(card?.images?.small) ||
    extractUuidFromText(card?.image_uris?.png) ||
    extractUuidFromText(card?.image_uris?.large) ||
    extractUuidFromText(card?.image_uris?.normal) ||
    extractUuidFromText(card?.image_uris?.small) ||
    extractUuidFromText(card?.card_faces?.[0]?.image_uris?.png) ||
    extractUuidFromText(card?.card_faces?.[0]?.image_uris?.large) ||
    extractUuidFromText(card?.card_faces?.[0]?.image_uris?.normal) ||
    extractUuidFromText(card?.card_faces?.[0]?.image_uris?.small) ||
    null
  );
}

function isMagicCard(card) {
  const game = String(card?.game || card?.product_type || '').trim().toLowerCase();
  return game === 'magic' || game === 'mtg';
}

export function getCardImageCandidates(card) {
  if (!card) return [];

  const scryfallId = isMagicCard(card) ? getUuidCandidate(card) : null;
  const candidates = [
    card.product_image,
    card.card_image,
    card.image_url,
    card.english_image_url,
    card.image_normal,
    card.image_large,
    card.image_small,
    card.thumbnail_url,
    card.images?.large,
    card.images?.normal,
    card.images?.small,
    card.image_uris?.png,
    card.image_uris?.large,
    card.image_uris?.normal,
    card.image_uris?.small,
    card.card_faces?.[0]?.image_uris?.png,
    card.card_faces?.[0]?.image_uris?.large,
    card.card_faces?.[0]?.image_uris?.normal,
    card.card_faces?.[0]?.image_uris?.small,
    card.fallback_image_url,
    card.source_image_url,
    card.raw_image_url,
    scryfallId ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=normal` : null,
    scryfallId ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=large` : null,
    scryfallId ? `https://api.scryfall.com/cards/${scryfallId}?format=image&version=small` : null
  ].map(cleanUrl).filter(Boolean);

  return [...new Set(candidates)];
}

export function getCardImageUrl(card) {
  return getCardImageCandidates(card)[0] || null;
}

export function handleCardImageError(event, card, onExhausted) {
  const image = event.currentTarget;
  const candidates = getCardImageCandidates(card);
  const currentIndex = Number(image.dataset.imageCandidateIndex || 0);
  const nextUrl = candidates[currentIndex + 1];

  if (nextUrl) {
    image.dataset.imageCandidateIndex = String(currentIndex + 1);
    image.src = nextUrl;
    return;
  }

  image.style.display = 'none';
  onExhausted?.(image);
}
