import fs from 'node:fs';
import path from 'node:path';
import { applyHeroArtworkToReleases } from './lib/homepage-hero-art-generator.mjs';
import {
  getReleaseState,
  getReleaseStateLabel,
  isHomepagePromotableReleaseState
} from '../src/services/releases/releaseState.js';

const ROOT = process.cwd();
const PUBLIC_DATA_ROOT = path.join(ROOT, 'public', 'data');
const OUTPUT_DIR = path.join(PUBLIC_DATA_ROOT, 'site');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'upcoming-releases.json');

const GAME_SOURCES = [
  { game: 'magic', file: path.join(PUBLIC_DATA_ROOT, 'mtg', 'sets.json') },
  { game: 'pokemon', file: path.join(PUBLIC_DATA_ROOT, 'pokemon', 'sets.json') },
  { game: 'yugioh', file: path.join(PUBLIC_DATA_ROOT, 'yugioh', 'sets.json') },
  { game: 'lorcana', file: path.join(PUBLIC_DATA_ROOT, 'lorcana', 'sets.json') },
  { game: 'fab', file: path.join(PUBLIC_DATA_ROOT, 'fab', 'sets.json') },
  { game: 'onepiece', file: path.join(PUBLIC_DATA_ROOT, 'onepiece', 'sets.json') },
  { game: 'starwars', file: path.join(PUBLIC_DATA_ROOT, 'starwars', 'sets.json') }
];

const LABEL_MAP = {
  magic: 'Magic: The Gathering',
  pokemon: 'Pokemon TCG',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  fab: 'Flesh and Blood',
  onepiece: 'One Piece TCG',
  starwars: 'Star Wars Unlimited'
};

const GAME_FALLBACK_IMAGES = {
  magic: 'https://cards.scryfall.io/art_crop/front/9/7/97567879-c547-4fa1-89ae-a9e6dd8a7e88.jpg',
  pokemon: 'https://images.pokemontcg.io/sv1/logo.png',
  yugioh: 'https://images.ygoprodeck.com/images/cards/46986414.jpg',
  lorcana: 'https://www.disneylorcana.com/_next/image?url=%2Fimages%2Flogo.png&w=1920&q=75',
  onepiece: 'https://en.onepiece-cardgame.com/images/common/logo.png',
  fab: 'https://dhhim4ltzu1pj.cloudfront.net/media/images/global/fab_logo.original.png',
  starwars: 'https://starwarsunlimited.com/images/logos/swu-logo.png'
};

const RELEASE_ASSET_OVERRIDES = {
  'magic:FRA': {
    set_image_url: '/images/releases/reality-fracture-approved.png',
    hero_source_mode: 'approved-title-lockup',
    hero_source_assets: [
      {
        kind: 'logo',
        name: 'Reality Fracture approved title lockup',
        url: '/images/releases/reality-fracture-approved.png'
      }
    ],
    source_url: 'https://magic.wizards.com/en/products/reality-fracture'
  },
  'magic:MBC': {
    set_image_url: 'https://media.wizards.com/2026/images/daily/VbqFabKvbr/heqm2no634.webp',
    image_large: 'https://media.wizards.com/2026/images/daily/VbqFabKvbr/wFKXx2Jn3B.webp',
    source_url: 'https://www.magic.wizards.com/en/news/feature/whats-inside-mystery-booster-commander-edition'
  },
  'yugioh:MAMS': {
    hero_source_mode: 'three-card-composite',
    hero_source_assets: [
      {
        kind: 'card',
        name: 'Blue-Eyes White Dragon, the White Phantom Beast',
        url: 'https://images.ygoprodeck.com/images/cards/30397786.jpg'
      },
      {
        kind: 'card',
        name: 'Cyber End Dragon, the Final Strike Dragon',
        url: 'https://images.ygoprodeck.com/images/cards/30275298.jpg'
      },
      {
        kind: 'card',
        name: 'Red Nova Dragon - Burning Soul',
        url: 'https://images.ygoprodeck.com/images/cards/65541655.jpg'
      }
    ]
  }
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function firstTruthy(values) {
  return values.find((value) => typeof value === 'string' && value.trim()) || null;
}

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeDateForSet(set) {
  return normalizeDate(
    set.releaseDate
    || set.released_at
    || set.release_date
    || set.tcg_date
    || set.date
  );
}

function normalizeTitle(set) {
  return firstTruthy([
    set.name,
    set.set_name,
    set.setName,
    set.title,
    set.code,
    set.set_code,
    set.id
  ]) || 'Upcoming Release';
}

function normalizeCode(set) {
  return firstTruthy([set.code, set.set_code, set.id, set.uuid, set.ptcgoCode, set.pack_id]);
}

function imageForSet(set) {
  return firstTruthy([
    set.set_image_url,
    set.set_image,
    set.image_url,
    set.hero_image_url,
    set.promo_image_url,
    set.key_art,
    set.set_logo,
    set.images?.logo,
    set.images?.symbol,
    set.images?.icon,
    set.images?.large,
    set.images?.medium,
    set.image_large,
    set.image_normal,
    set.image,
    set.logo
  ]);
}

function isLikelyLogoOrSymbol(url = '') {
  const lower = String(url).toLowerCase();
  return lower.includes('logo')
    || lower.includes('symbol')
    || lower.includes('icon')
    || lower.includes('/sets/')
    || lower.endsWith('.svg');
}

function heroImageForSet(set) {
  const candidate = firstTruthy([
    set.hero_image_url,
    set.heroImageUrl,
    set.promo_image_url,
    set.promoImageUrl,
    set.key_art,
    set.keyArt,
    set.images?.hero,
    set.images?.banner,
    set.images?.key_art,
    set.images?.large,
    set.image_large
  ]);

  if (!candidate || isLikelyLogoOrSymbol(candidate)) return null;
  return candidate;
}

function supportLineForSet(game, set) {
  const gameLabel = LABEL_MAP[game] || 'TCG';
  return [gameLabel, set.series || normalizeCode(set) || 'Upcoming release'].filter(Boolean).join(' • ');
}

function normalizeParentName(game, name = '') {
  let value = String(name || '').trim();
  if (!value) return 'upcoming-release';

  if (game === 'magic') {
    value = value
      .replace(/\s+Commander(?:\s+Decks?)?$/i, '')
      .replace(/\s+Collector(?:\s+Boosters?)?$/i, '')
      .replace(/\s+Prerelease(?:\s+Packs?)?$/i, '')
      .replace(/\s+Starter(?:\s+Kits?)?$/i, '');
  }

  return value
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'upcoming-release';
}

function normalizeSlug(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
}

function routeGameKey(game) {
  return game === 'flesh_and_blood' ? 'fab' : (game || 'magic');
}

function normalizeSet(game, set) {
  const releaseDate = normalizeDateForSet(set);
  if (!releaseDate) return null;

  const name = normalizeTitle(set);
  const code = normalizeCode(set);
  const override = RELEASE_ASSET_OVERRIDES[`${game}:${String(code || '').toUpperCase()}`] || {};
  const enrichedSet = { ...set, ...override };
  const heroImageUrl = heroImageForSet(enrichedSet);
  const releaseState = getReleaseState(releaseDate);
  const canonicalSlug = normalizeSlug(name);
  const normalizedGame = routeGameKey(game);
  const normalizedCode = code ? String(code).toUpperCase() : null;
  const canonicalReleaseKey = [
    normalizedGame,
    normalizedCode || releaseDate.slice(0, 10),
    normalizedCode ? '' : canonicalSlug
  ].filter(Boolean).join(':');

  return {
    id: `${normalizedGame}:${normalizedCode || name}`,
    game,
    game_key: normalizedGame,
    name,
    code: normalizedCode,
    set_code: normalizedCode,
    set_name: enrichedSet.series || name,
    canonical_slug: canonicalSlug,
    canonical_release_key: canonicalReleaseKey,
    parentKey: `${game}:${releaseDate.slice(0, 10)}:${normalizeParentName(game, name)}`,
    release_date: releaseDate,
    release_state: releaseState,
    release_state_label: getReleaseStateLabel(releaseState),
    homepage_promotable: isHomepagePromotableReleaseState(releaseState),
    set_image_url: imageForSet(enrichedSet),
    hero_image_url: heroImageUrl,
    game_fallback_image_url: GAME_FALLBACK_IMAGES[game] || null,
    source_url: enrichedSet.source_url || null,
    image_large: enrichedSet.image_large || null,
    hero_source_mode: enrichedSet.hero_source_mode || null,
    hero_source_assets: Array.isArray(enrichedSet.hero_source_assets) ? enrichedSet.hero_source_assets : null,
    supportLine: supportLineForSet(game, enrichedSet),
    is_preorder: true,
    has_preorder_listing: false,
    cta_label: 'View Set',
    cta_href: `/set/${normalizedGame}/${canonicalSlug}`,
    links: {
      setDetail: `/set/${normalizedGame}/${canonicalSlug}`
    },
    source: 'local-set-manifest'
  };
}

function sortReleases(releases) {
  return [...releases].sort((a, b) => {
    const dateDelta = new Date(a.release_date).getTime() - new Date(b.release_date).getTime();
    if (dateDelta !== 0) return dateDelta;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

function scoreGroupedCandidate(release) {
  let score = 0;
  if (release.hero_image_url) score += 40;
  if (release.set_image_url && !isLikelyLogoOrSymbol(release.set_image_url)) score += 12;
  if (release.set_image_url) score += 4;
  const name = String(release.name || '').toLowerCase();
  if (/commander|collector|starter|prerelease/.test(name)) score -= 8;
  return score;
}

function groupParentReleases(releases) {
  const groups = new Map();
  for (const release of releases) {
    const key = release.parentKey || release.id;
    const entries = groups.get(key) || [];
    entries.push(release);
    groups.set(key, entries);
  }

  return [...groups.values()].map((entries) => {
    const sorted = [...entries].sort((a, b) => {
      const scoreDelta = scoreGroupedCandidate(b) - scoreGroupedCandidate(a);
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const primary = sorted[0];
    return {
      ...primary,
      variant_count: entries.length,
      grouped_release_ids: entries.map((entry) => entry.id)
    };
  });
}

function balanceReleasesByGame(releases, limit = 12) {
  const sorted = sortReleases(releases);
  const selected = [];
  const selectedIds = new Set();
  const counts = new Map();

  const pickWithLimit = (maxPerGame) => {
    for (const release of sorted) {
      if (selected.length >= limit) return;
      if (selectedIds.has(release.id)) continue;
      const count = counts.get(release.game) || 0;
      if (count >= maxPerGame) continue;
      selected.push(release);
      selectedIds.add(release.id);
      counts.set(release.game, count + 1);
    }
  };

  pickWithLimit(1);
  pickWithLimit(2);

  for (const release of sorted) {
    if (selected.length >= limit) break;
    if (selectedIds.has(release.id)) continue;
    selected.push(release);
    selectedIds.add(release.id);
  }

  return selected;
}

async function main() {
  const allReleases = GAME_SOURCES.flatMap(({ game, file }) => {
    const rows = readJsonIfExists(file);
    return (Array.isArray(rows) ? rows : [])
      .map((set) => normalizeSet(game, set))
      .filter(Boolean);
  });

  const groupedReleases = groupParentReleases(allReleases);
  const promotableReleases = groupedReleases.filter((set) => isHomepagePromotableReleaseState(set.release_state));
  const releases = promotableReleases.length > 0
    ? balanceReleasesByGame(promotableReleases, 12)
    : [...groupedReleases]
        .sort((a, b) => new Date(b.release_date).getTime() - new Date(a.release_date).getTime())
        .slice(0, 12)
        .reverse();

  ensureDir(OUTPUT_DIR);
  const heroArtwork = await applyHeroArtworkToReleases(releases, { projectRoot: ROOT });

  const payload = {
    generatedAt: new Date().toISOString(),
    heroArtworkGeneratedAt: new Date().toISOString(),
    releases: heroArtwork.releases,
    heroArtwork: heroArtwork.results
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Built upcoming releases manifest with ${payload.releases.length} releases at ${OUTPUT_PATH}`);
  for (const result of heroArtwork.results) {
    console.log(`[hero-art] ${result.game}:${result.name} mode=${result.mode} eligible=${result.eligible} reason=${result.reason}${result.generatedPath ? ` path=${result.generatedPath}` : ''}`);
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
