import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/yugioh');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const API_ROOT = getGameSourceConfig('yugioh', 'api')?.url || 'https://db.ygoprodeck.com/api/v7';
const PAGE_SIZE = Number(process.env.YUGIOH_PAGE_SIZE || 250);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 yugioh backfill',
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
    id: Number(card?.id || 0),
    name: card?.name || '',
    type: card?.type || '',
    frameType: card?.frameType || '',
    desc: card?.desc || '',
    race: card?.race || '',
    archetype: card?.archetype || '',
    atk: card?.atk ?? null,
    def: card?.def ?? null,
    level: card?.level ?? null,
    attribute: card?.attribute || '',
    scale: card?.scale ?? null,
    linkval: card?.linkval ?? null,
    linkmarkers: Array.isArray(card?.linkmarkers) ? card.linkmarkers : [],
    banlist_info: card?.banlist_info || {},
    card_sets: Array.isArray(card?.card_sets) ? card.card_sets : [],
    card_images: Array.isArray(card?.card_images) ? card.card_images : [],
    card_prices: Array.isArray(card?.card_prices) ? card.card_prices : []
  };
}

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
    if (nameCompare !== 0) return nameCompare;
    return Number(a.id || 0) - Number(b.id || 0);
  });
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  const firstPage = await fetchJson(`${API_ROOT}/cardinfo.php?num=${PAGE_SIZE}&offset=0`);
  const totalCount = Number(firstPage?.meta?.total_rows || 0);
  const cards = (firstPage?.data || []).map(normalizeCard);

  console.log(`Fetched page 1. Live Yu-Gi-Oh total: ${totalCount}.`);

  for (let offset = PAGE_SIZE; offset < totalCount; offset += PAGE_SIZE) {
    const payload = await fetchJson(`${API_ROOT}/cardinfo.php?num=${PAGE_SIZE}&offset=${offset}`);
    cards.push(...(payload?.data || []).map(normalizeCard));
    const fetchedSoFar = Math.min(offset + PAGE_SIZE, totalCount);
    if (fetchedSoFar % 1000 === 0 || fetchedSoFar >= totalCount) {
      console.log(`Fetched ${fetchedSoFar}/${totalCount} Yu-Gi-Oh cards...`);
    }
  }

  const finalCards = sortCards(cards);
  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(finalCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    api_root: API_ROOT,
    page_size: PAGE_SIZE,
    live_total_count: totalCount,
    final_card_count: finalCards.length
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('Yu-Gi-Oh card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('Yu-Gi-Oh card backfill failed:', error);
  process.exitCode = 1;
});
