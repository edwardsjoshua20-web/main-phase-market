import { getCardImageUrl } from '@/lib/cardImages';
import { resolveCardPricing } from '@/services/pricing/pricingPipeline';

function normalizeFinishKey(finish) {
  if (!finish || finish === 'normal') {
    return 'nonfoil';
  }

  return finish;
}

function buildSkuPart(value, fallback) {
  return String(value || fallback || 'na')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || String(fallback || 'na');
}

function buildDescriptionParts(selectedCard, finishLabel) {
  const parts = [];

  if (finishLabel && finishLabel !== 'Normal') {
    parts.push(finishLabel);
  }

  if (selectedCard.treatments?.length) {
    parts.push(...selectedCard.treatments);
  }

  if (selectedCard.type) {
    parts.push(selectedCard.type);
  }

  if (selectedCard.game === 'magic' && selectedCard.lang && selectedCard.lang !== 'en') {
    parts.push(`Language: ${selectedCard.lang.toUpperCase()}`);
  }

  if (selectedCard.game === 'magic' && selectedCard.oracle_id) {
    parts.push(`Oracle ID: ${selectedCard.oracle_id}`);
  }

  return parts;
}

export function buildInventoryCardPayload({
  selectedCard,
  selectedCondition,
  selectedFinish,
  quantity,
  location,
  fallbackCost = 0
}) {
  const normalizedFinish = normalizeFinishKey(selectedFinish || selectedCard.finish);
  const finishLabel = selectedCard.finishLabel || (normalizedFinish === 'foil'
    ? 'Foil'
    : normalizedFinish === 'etched'
      ? 'Etched Foil'
      : 'Normal');
  const pricing = resolveCardPricing(selectedCard, { floor: 1 });
  const finalPrice = Math.max(1, Number(pricing.sellPrice || pricing.targetPrice || selectedCard.price || 0) || 0);
  const language = selectedCard.lang || 'en';
  const description = buildDescriptionParts(selectedCard, finishLabel).join(' | ');
  const setCode = buildSkuPart(selectedCard.set_code, 'unk');
  const collectorNumber = buildSkuPart(selectedCard.card_number, 'na');
  const finishPart = buildSkuPart(normalizedFinish, 'nonfoil');
  const languagePart = buildSkuPart(language, 'en');

  return {
    name: selectedCard.name,
    game: selectedCard.game,
    set_name: selectedCard.set_name,
    card_number: selectedCard.card_number,
    rarity: selectedCard.rarity,
    condition: selectedCondition,
    price: finalPrice,
    market_price: pricing.marketPrice,
    target_price: pricing.targetPrice,
    cost: Number(fallbackCost) || 0,
    quantity: quantity || 1,
    image_url: getCardImageUrl(selectedCard),
    product_image: getCardImageUrl(selectedCard),
    english_image_url: selectedCard.english_image_url || null,
    fallback_image_url: selectedCard.fallback_image_url || null,
    raw_image_url: selectedCard.raw_image_url || selectedCard.source_image_url || null,
    oracle_id: selectedCard.oracle_id || null,
    description,
    pricing_sources: pricing.sources,
    pricing_source_count: pricing.sourceCount,
    sku: `${setCode}-${collectorNumber}-${finishPart}-${languagePart}`,
    featured: false,
    status: 'active',
    location: location || ''
  };
}

export function getInventoryCardMergeKey(card) {
  return [
    card.game || '',
    card.name || '',
    card.set_name || '',
    card.card_number || '',
    card.condition || '',
    card.sku || '',
    card.description || ''
  ].join('::');
}

export function getInventoryCardFinish(card) {
  const skuParts = String(card?.sku || '').split('-').filter(Boolean);
  const finishFromSku = skuParts.length >= 2 ? skuParts[skuParts.length - 2] : '';

  if (['foil', 'nonfoil', 'etched', 'normal'].includes(finishFromSku)) {
    return finishFromSku;
  }

  const description = String(card?.description || '').toLowerCase();
  if (description.includes('etched foil')) {
    return 'etched';
  }
  if (description.includes('foil')) {
    return 'foil';
  }

  return '';
}

export function getInventoryCardLanguage(card) {
  const skuParts = String(card?.sku || '').split('-').filter(Boolean);
  const languageFromSku = skuParts.length >= 1 ? skuParts[skuParts.length - 1] : '';

  if (languageFromSku && /^[a-z]{2,3}$/i.test(languageFromSku)) {
    return languageFromSku.toLowerCase();
  }

  const match = String(card?.description || '').match(/Language:\s*([A-Z]{2,3})/i);
  return match?.[1]?.toLowerCase() || 'en';
}
