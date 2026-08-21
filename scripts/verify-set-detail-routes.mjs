import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'site', 'upcoming-releases.json');

const TARGETS = [
  ['yugioh', 'magnificent-monsters'],
  ['fab', 'armory-deck-malice'],
  ['magic', 'reality-fracture'],
  ['magic', 'mystery-booster-commander-edition'],
  ['yugioh', 'magnificent-maestros'],
  ['fab', 'armory-deck-dr-mortimer'],
  ['magic', 'star-trek'],
  ['magic', 'stardates'],
  ['fab', 'mastery-pack-assassin']
];

const ASSET_GAME = {
  magic: 'mtg'
};

function fail(message) {
  console.error(`[set-detail:verify] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
}

function routeGame(game) {
  if (game === 'flesh_and_blood') return 'fab';
  return game || 'magic';
}

function setCode(row = {}) {
  return row.set_code || row.code || row.id || row.ptcgoCode || row.uuid || row.pack_id || '';
}

function setName(row = {}) {
  return row.name || row.set_name || row.setName || row.title || setCode(row);
}

function catalogRows(game) {
  const assetGame = ASSET_GAME[game] || game;
  const filePath = path.join(ROOT, 'public', 'data', assetGame, 'sets.json');
  const rows = readJson(filePath);
  return Array.isArray(rows) ? rows : [];
}

function catalogCards(game) {
  const assetGame = ASSET_GAME[game] || game;
  const filePath = path.join(ROOT, 'public', 'data', assetGame, 'cards.json');
  const rows = readJson(filePath);
  return Array.isArray(rows) ? rows : [];
}

function countSetCards(game, code, cards = []) {
  const setCode = String(code || '').trim().toUpperCase();
  if (!setCode) return { knownCards: 0, printings: 0, images: 0 };

  if (game === 'yugioh') {
    const grouped = new Map();
    let printings = 0;
    for (const card of cards) {
      for (const printing of card.card_sets || []) {
        if (!String(printing.set_code || '').trim().toUpperCase().startsWith(`${setCode}-`)) continue;
        printings += 1;
        const number = String(printing.set_code || '').trim();
        const key = `${card.id || card.name}:${number}`;
        if (!grouped.has(key)) {
          grouped.set(key, Boolean(card.card_images?.[0]?.image_url || card.image_url));
        }
      }
    }
    return {
      knownCards: grouped.size,
      printings,
      images: [...grouped.values()].filter(Boolean).length
    };
  }

  if (game === 'fab') {
    const grouped = new Map();
    let printings = 0;
    for (const card of cards) {
      for (const printing of card.printings || []) {
        if (String(printing.set_id || '').trim().toUpperCase() !== setCode) continue;
        printings += 1;
        const number = String(printing.id || printing.card_number || '').trim();
        const key = `${card.name}:${number || printing.unique_id || card.unique_id}`;
        const hasImage = Boolean(printing.image_url || printing.image || card.image_url);
        if (!grouped.has(key)) grouped.set(key, hasImage);
      }
    }
    return {
      knownCards: grouped.size,
      printings,
      images: [...grouped.values()].filter(Boolean).length
    };
  }

  const grouped = new Map();
  for (const card of cards) {
    if (String(card.set_code || card.set || '').trim().toUpperCase() !== setCode) continue;
    const number = String(card.collector_number || card.number || '').trim();
    const key = `${card.id || card.oracle_id || card.name}:${number}`;
    grouped.set(key, Boolean(card.image_url || card.image_normal || card.images?.normal || card.image_uris?.normal));
  }
  return {
    knownCards: grouped.size,
    printings: grouped.size,
    images: [...grouped.values()].filter(Boolean).length
  };
}

const manifest = readJson(MANIFEST_PATH);
if (!manifest || !Array.isArray(manifest.releases)) {
  fail(`Missing release manifest at ${MANIFEST_PATH}`);
}

const report = TARGETS.map(([game, slug]) => {
  const release = manifest.releases.find((entry) => {
    if (routeGame(entry.game) !== game) return false;
    return [entry.name, entry.set_name, entry.set_code, entry.code, entry.id].some((value) => slugify(value) === slug);
  });
  const catalog = catalogRows(game).find((entry) => {
    if (release && setCode(entry) && setCode(release) && String(setCode(entry)).toLowerCase() === String(setCode(release)).toLowerCase()) return true;
    return [setName(entry), entry.set_name, setCode(entry)].some((value) => slugify(value) === slug);
  });

  if (!release && !catalog) {
    fail(`/set/${game}/${slug} does not resolve from release manifest or catalog set data.`);
  }

  const sourceAssets = Array.isArray(release?.hero_source_assets) ? release.hero_source_assets : [];
  const hasVisual = Boolean(release?.hero_image_url || release?.set_image_url || catalog?.set_image || catalog?.set_logo || catalog?.image_url || sourceAssets.length);
  const cardCount = release?.card_count || catalog?.card_count || catalog?.total_cards || catalog?.num_of_cards || null;
  const cards = countSetCards(game, release?.set_code || setCode(catalog), catalogCards(game));

  if (cards.knownCards === 0 && !cardCount && !hasVisual) {
    fail(`/set/${game}/${slug} has neither a known set size, catalog card records, nor visual release data.`);
  }
  if (cards.knownCards > 0 && cards.images === 0) {
    fail(`/set/${game}/${slug} resolved catalog cards but no usable card images.`);
  }

  return {
    route: `/set/${game}/${slug}`,
    name: release?.name || setName(catalog),
    source: release ? 'release-manifest' : 'catalog-set',
    setCode: release?.set_code || setCode(catalog) || null,
    hasVisual,
    setSize: cardCount,
    knownCards: cards.knownCards,
    catalogPrintings: cards.printings,
    knownCardImages: cards.images,
    cardListState: cards.knownCards > 0 ? 'cards-renderable' : 'card-list-not-yet-available'
  };
});

console.log(JSON.stringify({
  checked: report.length,
  routes: report
}, null, 2));
