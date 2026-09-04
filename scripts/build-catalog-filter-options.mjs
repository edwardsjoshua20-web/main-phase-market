import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DATA_ROOT = path.resolve(process.cwd(), 'public', 'data');
const GAME_FOLDERS = ['mtg', 'pokemon', 'yugioh', 'lorcana', 'fab', 'onepiece', 'starwars'];
const FAB_RARITIES = { B: 'Basic', C: 'Common', F: 'Fabled', L: 'Legendary', M: 'Majestic', P: 'Promo', R: 'Rare', S: 'Super Rare', T: 'Token', V: 'Marvel' };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function addValue(target, value) {
  const normalized = String(value ?? '').trim();
  if (normalized) target.add(normalized);
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

function readCards(folder) {
  if (folder !== 'mtg') {
    const cards = readJson(path.join(PUBLIC_DATA_ROOT, folder, 'cards.json'));
    return Array.isArray(cards) ? cards : [];
  }

  const bucketRoot = path.join(PUBLIC_DATA_ROOT, folder, 'search-lite');
  return fs.readdirSync(bucketRoot)
    .filter((name) => name.endsWith('.json'))
    .flatMap((name) => readJson(path.join(bucketRoot, name)));
}

function isYugiohRarity(set) {
  const rarity = String(set?.set_rarity || '').trim();
  return Boolean(rarity && (set?.set_rarity_code || /(?:common|rare|short print|starfoil|extra secret)$/i.test(rarity)));
}

function collectOptions(folder) {
  const cards = readCards(folder);
  const sets = readJson(path.join(PUBLIC_DATA_ROOT, folder, 'sets.json'));
  const rarities = new Set();
  const finishes = new Set();
  const languages = new Set();
  const setNames = new Set();

  for (const set of Array.isArray(sets) ? sets : []) {
    addValue(setNames, set.name || set.set_name);
  }

  for (const card of cards) {
    if (folder === 'yugioh') {
      for (const set of card.card_sets || []) {
        if (isYugiohRarity(set)) addValue(rarities, set.set_rarity);
      }
    } else if (folder === 'fab') {
      for (const printing of card.printings || []) {
        addValue(rarities, FAB_RARITIES[String(printing.rarity || '').toUpperCase()] || printing.rarity);
        const foiling = String(printing.foiling || '').toUpperCase();
        if (foiling === 'S') finishes.add('nonfoil');
        if (foiling && foiling !== 'S') finishes.add('foil');
      }
    } else {
      addValue(rarities, card.rarity);
    }

    if (folder === 'mtg') {
      for (const finish of card.finishes || []) addValue(finishes, finish);
      addValue(languages, card.lang);
    } else {
      addValue(finishes, card.finish || card.foiling);
      addValue(languages, card.language || card.lang);
    }
  }

  if (finishes.size === 0) finishes.add('nonfoil');
  if (languages.size === 0) languages.add('en');

  return {
    generated_at: new Date().toISOString(),
    sets: sorted(setNames),
    rarities: sorted(rarities),
    finishes: sorted(finishes),
    languages: sorted(languages)
  };
}

for (const folder of GAME_FOLDERS) {
  const outputPath = path.join(PUBLIC_DATA_ROOT, folder, 'filter-options.json');
  const options = collectOptions(folder);
  fs.writeFileSync(outputPath, `${JSON.stringify(options, null, 2)}\n`);
  console.log(`${folder}: ${options.sets.length} sets, ${options.rarities.length} rarities, ${options.finishes.length} finishes, ${options.languages.length} languages`);
}
