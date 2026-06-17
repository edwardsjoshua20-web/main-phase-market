import fs from 'node:fs';
import path from 'node:path';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/lorcana');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const API_ROOT = 'https://api.lorcast.com/v0/cards/search';
const CARD_TYPES = ['character', 'action', 'location', 'item'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 lorcana backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.json();
}

function normalizeCard(card) {
  return {
    id: card?.id || '',
    name: card?.name || '',
    version: card?.version || '',
    ink: card?.ink || '',
    type: Array.isArray(card?.type) ? card.type : [],
    cost: card?.cost ?? null,
    inkwell: Boolean(card?.inkwell),
    strength: card?.strength ?? null,
    willpower: card?.willpower ?? null,
    lore: card?.lore ?? null,
    rarity: card?.rarity || '',
    set: card?.set || {},
    collector_number: card?.collector_number || '',
    text: card?.text || '',
    keywords: Array.isArray(card?.keywords) ? card.keywords : [],
    image_uris: card?.image_uris || {},
    classifications: Array.isArray(card?.classifications) ? card.classifications : []
  };
}

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const setCompare = String(a?.set?.code || '').localeCompare(String(b?.set?.code || ''));
    if (setCompare !== 0) return setCompare;
    const numberCompare = String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, { numeric: true, sensitivity: 'base' });
    if (numberCompare !== 0) return numberCompare;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  const cardMap = new Map();
  const perTypeCounts = {};

  for (const type of CARD_TYPES) {
    const payload = await fetchJson(`${API_ROOT}?q=type%3A${encodeURIComponent(type)}&unique=prints`);
    const results = Array.isArray(payload?.results) ? payload.results : [];
    perTypeCounts[type] = results.length;

    for (const card of results) {
      if (!card?.id) continue;
      cardMap.set(card.id, normalizeCard(card));
    }
  }

  const finalCards = sortCards([...cardMap.values()]);
  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(finalCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    api_root: API_ROOT,
    card_types: CARD_TYPES,
    per_type_counts: perTypeCounts,
    final_card_count: finalCards.length
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Lorcana card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Lorcana card backfill failed:', error);
  process.exitCode = 1;
});
