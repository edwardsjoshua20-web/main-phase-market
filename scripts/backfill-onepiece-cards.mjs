import fs from 'node:fs';
import path from 'node:path';
import { getGameSourceConfig } from './lib/source-registry.mjs';

const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/onepiece');
const OUTPUT_CARDS_PATH = path.join(OUTPUT_ROOT, 'cards.json');
const OUTPUT_MANIFEST_PATH = path.join(OUTPUT_ROOT, 'cards-manifest.json');
const RAW_BASE = getGameSourceConfig('onepiece', 'cardsApi')?.url || 'https://raw.githubusercontent.com/buhbbl/punk-records/main/english/cards';
const CONCURRENCY = Number(process.env.ONEPIECE_BACKFILL_CONCURRENCY || 8);

const PACKS = [
  ['569101', 'OP01', 130], ['569102', 'OP02', 130], ['569103', 'OP03', 130], ['569104', 'OP04', 130],
  ['569105', 'OP05', 130], ['569106', 'OP06', 130], ['569107', 'OP07', 130], ['569108', 'OP08', 130],
  ['569109', 'OP09', 130], ['569110', 'OP10', 130], ['569111', 'OP11', 130], ['569112', 'OP12', 130],
  ['569113', 'OP13', 130], ['569201', 'EB01', 70], ['569202', 'EB02', 70],
  ['569001', 'ST01', 20], ['569002', 'ST02', 20], ['569003', 'ST03', 20], ['569004', 'ST04', 20],
  ['569005', 'ST05', 20], ['569006', 'ST06', 20], ['569007', 'ST07', 20], ['569008', 'ST08', 20],
  ['569009', 'ST09', 20], ['569010', 'ST10', 20], ['569011', 'ST11', 20], ['569012', 'ST12', 20],
  ['569013', 'ST13', 20], ['569014', 'ST14', 20], ['569015', 'ST15', 20], ['569016', 'ST16', 20],
  ['569017', 'ST17', 20], ['569018', 'ST18', 20], ['569019', 'ST19', 20], ['569020', 'ST20', 20],
  ['569021', 'ST21', 20], ['569022', 'ST22', 20], ['569023', 'ST23', 20], ['569024', 'ST24', 20],
  ['569025', 'ST25', 20], ['569026', 'ST26', 20], ['569027', 'ST27', 20], ['569028', 'ST28', 20]
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'MainPhaseMarket/1.0 onepiece backfill',
      Accept: 'application/json;q=0.9,*/*;q=0.8'
    }
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.json();
}

async function runPool(items, concurrency, worker) {
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current, index);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, () => runWorker()));
}

function normalizeCard(card, packId, setCode) {
  return {
    id: card?.id || '',
    name: card?.name || '',
    category: card?.category || '',
    colors: Array.isArray(card?.colors) ? card.colors : [],
    cost: card?.cost ?? null,
    power: card?.power ?? null,
    counter: card?.counter ?? null,
    rarity: card?.rarity || '',
    types: Array.isArray(card?.types) ? card.types : [],
    effect: card?.effect || '',
    trigger: card?.trigger || '',
    pack_id: String(card?.pack_id || packId || ''),
    set_code: setCode,
    image_url: card?.img_full_url || card?.img_url || `${RAW_BASE}/${packId}/${card?.id}.png`
  };
}

function sortCards(cards) {
  return [...cards].sort((a, b) => {
    const setCompare = String(a.set_code || '').localeCompare(String(b.set_code || ''));
    if (setCompare !== 0) return setCompare;
    return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true, sensitivity: 'base' });
  });
}

async function main() {
  ensureDir(OUTPUT_ROOT);

  const candidates = [];
  for (const [packId, setCode, maxNum] of PACKS) {
    for (let n = 1; n <= maxNum; n += 1) {
      const num = String(n).padStart(3, '0');
      candidates.push({ packId, setCode, cardId: `${setCode}-${num}` });
    }
  }

  const foundCards = [];
  const missingCandidates = [];

  await runPool(candidates, CONCURRENCY, async ({ packId, setCode, cardId }, completed) => {
    try {
      const card = await fetchJson(`${RAW_BASE}/${packId}/${cardId}.json`);
      if (card) {
        foundCards.push(normalizeCard(card, packId, setCode));
      } else {
        missingCandidates.push(cardId);
      }

      if (completed % 250 === 0 || completed === candidates.length) {
        console.log(`Checked ${completed}/${candidates.length} One Piece candidates...`);
      }
    } catch (error) {
      console.error(`One Piece fetch failed for ${cardId}: ${error.message}`);
    }
  });

  const deduped = new Map();
  for (const card of foundCards) {
    if (card?.id) deduped.set(card.id, card);
  }

  const finalCards = sortCards([...deduped.values()]);
  fs.writeFileSync(OUTPUT_CARDS_PATH, JSON.stringify(finalCards, null, 2));

  const manifest = {
    generated_at: new Date().toISOString(),
    source_root: RAW_BASE,
    candidate_total: candidates.length,
    found_cards: foundCards.length,
    final_card_count: finalCards.length,
    missing_candidates: missingCandidates.length
  };

  fs.writeFileSync(OUTPUT_MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log('One Piece card backfill complete.');
  console.log(JSON.stringify(manifest, null, 2));
}

main().catch((error) => {
  console.error('One Piece card backfill failed:', error);
  process.exitCode = 1;
});
