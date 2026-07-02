import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function median(values) {
  const sorted = values.filter((value) => value != null).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round(((sorted[middle - 1] + sorted[middle]) / 2) * 100) / 100;
}

function summarizeCards(game, rows, selector) {
  const prices = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const price = selector(row);
    if (price != null && price > 0) prices.push(price);
  }

  return {
    game,
    cards_seen: Array.isArray(rows) ? rows.length : 0,
    priced_cards: prices.length,
    median_market_price: median(prices),
    min_market_price: prices.length ? Math.min(...prices) : null,
    max_market_price: prices.length ? Math.max(...prices) : null
  };
}

const ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');
const OUTPUT_DIR = path.join(PUBLIC_DATA_ROOT, 'site');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'pricing-snapshot.json');
const SOURCE_SNAPSHOT_DIR = path.join(OUTPUT_DIR, 'pricing-sources');

async function loadSourceMerger() {
  const moduleUrl = pathToFileURL(path.join(ROOT, 'src', 'services', 'pricing', 'sourceSnapshotMerger.js')).href;
  return import(moduleUrl);
}

function readSourceSnapshotFile(name) {
  return readJsonIfExists(path.join(SOURCE_SNAPSHOT_DIR, `${name}.json`));
}

async function main() {
  const mtgCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'magic', 'cards.json'));
  const yugiohCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'yugioh', 'cards.json'));
  const pokemonCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'pokemon', 'cards.json'));
  const onePieceCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'onepiece', 'cards.json'));
  const lorcanaCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'lorcana', 'cards.json'));
  const fabCards = readJsonIfExists(path.join(PUBLIC_DATA_ROOT, 'fab', 'cards.json'));

  const summary = [
    summarizeCards('magic', mtgCards, (row) => toNumber(row?.prices?.usd)),
    summarizeCards('yugioh', yugiohCards, (row) => toNumber(row?.card_prices?.[0]?.tcgplayer_price)),
    summarizeCards('pokemon', pokemonCards, (row) => toNumber(row?.tcgplayer?.prices?.normal?.market || row?.tcgplayer?.prices?.holofoil?.market || row?.cardmarket?.prices?.averageSellPrice)),
    summarizeCards('onepiece', onePieceCards, (row) => toNumber(row?.price)),
    summarizeCards('lorcana', lorcanaCards, (row) => toNumber(row?.price)),
    summarizeCards('fab', fabCards, (row) => toNumber(row?.printings?.[0]?.sales?.[0]?.price))
  ];

  const { mergePricingSourceSnapshots } = await loadSourceMerger();
  const sourceSnapshots = {
    cardkingdom: readSourceSnapshotFile('cardkingdom'),
    tcgplayer: readSourceSnapshotFile('tcgplayer'),
    starcitygames: readSourceSnapshotFile('starcitygames')
  };
  const mergedSourcePricing = mergePricingSourceSnapshots(sourceSnapshots, { floor: 1, strategy: 'median' });

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    status: mergedSourcePricing.length > 0 ? 'merged-source-snapshots' : 'seeded-from-local-catalogs',
    nextStep: mergedSourcePricing.length > 0
      ? 'Attach live adapter jobs to keep source snapshots current every morning.'
      : 'Drop normalized cardkingdom.json, tcgplayer.json, and starcitygames.json snapshots into public/data/site/pricing-sources or attach live adapters.',
    games: summary,
    sourceSnapshots: {
      cardkingdom: Array.isArray(sourceSnapshots.cardkingdom) ? sourceSnapshots.cardkingdom.length : 0,
      tcgplayer: Array.isArray(sourceSnapshots.tcgplayer) ? sourceSnapshots.tcgplayer.length : 0,
      starcitygames: Array.isArray(sourceSnapshots.starcitygames) ? sourceSnapshots.starcitygames.length : 0
    },
    mergedPricingPreview: mergedSourcePricing.slice(0, 25)
  }, null, 2));

  console.log(`Built pricing snapshot at ${OUTPUT_PATH}`);
}

main();
