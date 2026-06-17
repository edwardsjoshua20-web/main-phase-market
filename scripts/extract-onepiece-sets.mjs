import fs from 'node:fs';
import path from 'node:path';

const INPUT_CARDS_PATH = path.resolve(process.cwd(), 'public/data/onepiece/cards.json');
const OUTPUT_ROOT = path.resolve(process.cwd(), 'public/data/onepiece');
const OUTPUT_SETS_PATH = path.join(OUTPUT_ROOT, 'sets.json');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function main() {
  if (!fs.existsSync(INPUT_CARDS_PATH)) {
    throw new Error(`One Piece cards file not found: ${INPUT_CARDS_PATH}`);
  }

  ensureDir(OUTPUT_ROOT);
  const cards = JSON.parse(fs.readFileSync(INPUT_CARDS_PATH, 'utf8'));
  const setMap = new Map();

  for (const card of Array.isArray(cards) ? cards : []) {
    const setCode = String(card?.set_code || card?.id || '').split('-')[0] || '';
    if (!setCode) continue;
    if (!setMap.has(setCode)) {
      setMap.set(setCode, {
        code: setCode,
        pack_id: String(card?.pack_id || ''),
        name: setCode,
        card_count: 0
      });
    }
    setMap.get(setCode).card_count += 1;
  }

  const sets = [...setMap.values()].sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')));
  fs.writeFileSync(OUTPUT_SETS_PATH, JSON.stringify(sets, null, 2));
  console.log(`One Piece set extraction complete. Wrote ${sets.length} sets.`);
}

main();
