import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');
const OUTPUT_DIR = path.join(PUBLIC_DATA_ROOT, 'site');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'upcoming-releases.json');

const GAME_SOURCES = [
  { game: 'fab', file: path.join(PUBLIC_DATA_ROOT, 'fab', 'sets.json') },
  { game: 'lorcana', file: path.join(PUBLIC_DATA_ROOT, 'lorcana', 'sets.json') },
  { game: 'pokemon', file: path.join(PUBLIC_DATA_ROOT, 'pokemon', 'sets.json') },
  { game: 'onepiece', file: path.join(PUBLIC_DATA_ROOT, 'onepiece', 'sets.json') },
  { game: 'starwars', file: path.join(PUBLIC_DATA_ROOT, 'starwars', 'sets.json') },
  { game: 'yugioh', file: path.join(PUBLIC_DATA_ROOT, 'yugioh', 'sets.json') }
];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function imageForSet(set) {
  return set.set_logo || set.images?.logo || set.images?.symbol || set.image || null;
}

function supportLineForSet(game, set) {
  const labelMap = {
    fab: 'Flesh and Blood',
    lorcana: 'Disney Lorcana',
    onepiece: 'One Piece TCG',
    pokemon: 'Pokémon TCG',
    starwars: 'Star Wars Unlimited',
    yugioh: 'Yu-Gi-Oh!'
  };

  const gameLabel = labelMap[game] || 'TCG';
  return [gameLabel, set.series || set.code || 'Upcoming release'].filter(Boolean).join(' • ');
}

function normalizeSet(game, set) {
  const releaseDate = normalizeDate(set.releaseDate || set.released_at || set.date || set.release_date);
  if (!releaseDate) return null;

  return {
    id: `${game}:${set.id || set.code || set.name}`,
    game,
    name: set.name || set.code || 'Upcoming Release',
    set_name: set.series || set.name || '',
    release_date: releaseDate,
    set_image_url: imageForSet(set),
    supportLine: supportLineForSet(game, set),
    is_preorder: true,
    source: 'local-set-manifest'
  };
}

function sortReleases(releases) {
  return [...releases].sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime());
}

function main() {
  const today = new Date();
  const allReleases = GAME_SOURCES.flatMap(({ game, file }) => {
    const rows = readJsonIfExists(file);
    return (Array.isArray(rows) ? rows : [])
      .map((set) => normalizeSet(game, set))
      .filter(Boolean);
  });

  const futureReleases = allReleases.filter((set) => new Date(set.release_date) >= today);
  const releases = futureReleases.length > 0
    ? sortReleases(futureReleases).slice(0, 12)
    : [...allReleases]
        .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
        .slice(0, 12)
        .reverse();

  ensureDir(OUTPUT_DIR);

  const payload = {
    generatedAt: new Date().toISOString(),
    releases
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Built upcoming releases manifest with ${payload.releases.length} releases at ${OUTPUT_PATH}`);
}

main();
