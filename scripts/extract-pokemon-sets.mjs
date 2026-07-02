import fs from 'node:fs';
import path from 'node:path';
import { resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const DEFAULT_SOURCE_PATH = resolveConfiguredSourcePath('pokemon', 'catalogSource');
const DEFAULT_CARDS_PATH = path.resolve(process.cwd(), 'public/data/pokemon/cards.json');
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/pokemon');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function isLikelySetEntry(entry) {
  return Boolean(
    entry &&
    entry.id &&
    entry.name &&
    !entry.supertype &&
    !entry.number &&
    !entry.images?.small &&
    !entry.images?.large
  );
}

function mergeSet(existing, incoming) {
  return {
    id: incoming.id || existing.id,
    name: incoming.name || existing.name,
    series: incoming.series || existing.series || '',
    printedTotal: incoming.printedTotal ?? existing.printedTotal ?? null,
    total: incoming.total ?? existing.total ?? null,
    legalities: incoming.legalities || existing.legalities || {},
    ptcgoCode: incoming.ptcgoCode || existing.ptcgoCode || '',
    releaseDate: incoming.releaseDate || existing.releaseDate || '',
    updatedAt: incoming.updatedAt || existing.updatedAt || '',
    images: incoming.images || existing.images || {}
  };
}

function compareSets(a, b) {
  const dateCompare = String(a.releaseDate || '').localeCompare(String(b.releaseDate || ''));
  if (dateCompare !== 0) return dateCompare;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

async function main() {
  const sourcePath = process.env.POKEMON_SOURCE_PATH || process.argv[2] || DEFAULT_SOURCE_PATH;
  const cardsPath = process.env.POKEMON_CARDS_PATH || process.argv[3] || DEFAULT_CARDS_PATH;

  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Pokemon source file not found: ${sourcePath}`);
  }
  if (!fs.existsSync(cardsPath)) {
    throw new Error(`Pokemon cards file not found: ${cardsPath}`);
  }

  ensureDir(OUTPUT_ROOT);

  const sourceEntries = readJson(sourcePath);
  const cards = readJson(cardsPath);
  const setsById = new Map();

  for (const entry of sourceEntries) {
    if (!isLikelySetEntry(entry)) continue;
    const existing = setsById.get(entry.id) || {};
    setsById.set(entry.id, mergeSet(existing, entry));
  }

  for (const card of cards) {
    if (!card?.set?.id) continue;
    const existing = setsById.get(card.set.id) || {};
    setsById.set(card.set.id, mergeSet(existing, card.set));
  }

  const finalSets = [...setsById.values()].sort(compareSets);
  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(finalSets, null, 2));

  console.log(`Pokemon set extraction complete. Wrote ${finalSets.length} sets to ${OUTPUT_SETS_PATH}`);
}

main().catch((error) => {
  console.error('Pokemon set extraction failed:', error);
  process.exitCode = 1;
});
