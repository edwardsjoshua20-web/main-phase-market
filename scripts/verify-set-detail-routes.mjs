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

  return {
    route: `/set/${game}/${slug}`,
    name: release?.name || setName(catalog),
    source: release ? 'release-manifest' : 'catalog-set',
    setCode: release?.set_code || setCode(catalog) || null,
    hasVisual,
    cardCount
  };
});

console.log(JSON.stringify({
  checked: report.length,
  routes: report
}, null, 2));

