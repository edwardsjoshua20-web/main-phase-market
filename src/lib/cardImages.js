function cleanUrl(value) {
  const url = String(value || '').trim();
  return url && url !== 'null' && url !== 'undefined' ? url : null;
}

export function getCardImageCandidates(card) {
  if (!card) return [];

  const candidates = [
    card.image_url,
    card.english_image_url,
    card.image_normal,
    card.image_large,
    card.image_small,
    card.product_image,
    card.card_image,
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
    card.raw_image_url
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
