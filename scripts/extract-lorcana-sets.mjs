import fs from 'node:fs';
import path from 'node:path';

const INPUT_CARDS_PATH = path.resolve(process.cwd(), 'public/data/lorcana/cards.json');
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/lorcana');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  if (!fs.existsSync(INPUT_CARDS_PATH)) {
    throw new Error(`Lorcana cards file not found: ${INPUT_CARDS_PATH}`);
  }

  ensureDir(OUTPUT_ROOT);
  const cards = JSON.parse(fs.readFileSync(INPUT_CARDS_PATH, 'utf8'));
  const setMap = new Map();

  for (const card of Array.isArray(cards) ? cards : []) {
    const set = card?.set || {};
    const setCode = String(set.code || '');
    if (!setCode) continue;
    if (!setMap.has(setCode)) {
      setMap.set(setCode, {
        code: setCode,
        name: set.name || '',
        number: set.number ?? null,
        card_count: 0
      });
    }
    setMap.get(setCode).card_count += 1;
  }

  const sets = [...setMap.values()].sort((a, b) => {
    const numCompare = Number(a.number || 0) - Number(b.number || 0);
    if (numCompare !== 0) return numCompare;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(sets, null, 2));
  console.log(`Lorcana set extraction complete. Wrote ${sets.length} sets.`);
}

main();
