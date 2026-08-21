import {
  getReleaseState,
  getReleaseStateLabel,
  getTodayStart,
  isHomepagePromotableReleaseState
} from '@/services/releases/releaseState';

const FALLBACK_THEME_MAP = {
  magic: {
    label: 'Magic: The Gathering',
    fallbackImage: 'https://cards.scryfall.io/art_crop/front/9/7/97567879-c547-4fa1-89ae-a9e6dd8a7e88.jpg'
  },
  pokemon: {
    label: 'Pokémon TCG',
    fallbackImage: 'https://images.pokemontcg.io/sv1/logo.png'
  },
  yugioh: {
    label: 'Yu-Gi-Oh!',
    fallbackImage: 'https://images.ygoprodeck.com/images/cards/46986414.jpg'
  },
  lorcana: {
    label: 'Disney Lorcana',
    fallbackImage: '/images/game-lorcana.png'
  },
  onepiece: {
    label: 'One Piece TCG',
    fallbackImage: 'https://en.onepiece-cardgame.com/images/common/logo.png'
  },
  fab: {
    label: 'Flesh and Blood',
    fallbackImage: 'https://dhhim4ltzu1pj.cloudfront.net/media/images/global/fab_logo.original.png'
  },
  starwars: {
    label: 'Star Wars Unlimited',
    fallbackImage: 'https://starwarsunlimited.com/images/logos/swu-logo.png'
  },
  other: {
    label: 'TCG',
    fallbackImage: 'https://cards.scryfall.io/art_crop/front/9/7/97567879-c547-4fa1-89ae-a9e6dd8a7e88.jpg'
  }
};

const HERO_FALLBACK_IMAGES = {
  magic: FALLBACK_THEME_MAP.magic.fallbackImage,
  other: FALLBACK_THEME_MAP.other.fallbackImage
};

function parseReleaseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function normalizeReleaseDateValue(value) {
  const parsed = parseReleaseDate(value);
  return parsed ? parsed.toISOString() : null;
}

function isLikelyLogoOrSymbol(url = '') {
  const lower = String(url || '').toLowerCase();
  return lower.includes('logo')
    || lower.includes('symbol')
    || lower.includes('icon')
    || lower.includes('/sets/')
    || lower.endsWith('.svg');
}

function getFirstImage(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim()) || null;
}

export function inferGameKey(input = {}) {
  const rawGame = String(input.game || input.source_game || '').trim().toLowerCase();
  if (rawGame === 'mtg') return 'magic';
  if (rawGame === 'flesh_and_blood') return 'fab';
  if (rawGame) return rawGame;

  const text = `${input.name || ''} ${input.description || ''} ${input.set_name || ''}`.toLowerCase();
  if (text.includes('lorcana')) return 'lorcana';
  if (text.includes('one piece')) return 'onepiece';
  if (text.includes('flesh and blood') || text.includes('fab')) return 'fab';
  if (text.includes('star wars')) return 'starwars';
  if (text.includes('pokemon')) return 'pokemon';
  if (text.includes('yu-gi-oh') || text.includes('yugioh')) return 'yugioh';
  if (text.includes('magic')) return 'magic';
  return 'other';
}

export function getReleaseTheme(input = {}) {
  return FALLBACK_THEME_MAP[inferGameKey(input)] || FALLBACK_THEME_MAP.other;
}

export function getReleaseImage(input = {}) {
  const theme = getReleaseTheme(input);
  return [
    input.hero_image_url,
    input.promo_image_url,
    input.set_image_url,
    input.set_logo,
    input.images?.logo,
    input.images?.symbol,
    input.images?.icon,
    input.image_large,
    input.image_normal,
    input.image_small,
    input.image_url,
    theme.fallbackImage
  ].find(Boolean);
}

export function getReleaseHeroImage(input = {}) {
  const game = inferGameKey(input);
  const candidate = getFirstImage([
    input.hero_image_url,
    input.heroImageUrl,
    input.promo_image_url,
    input.promoImageUrl,
    input.key_art,
    input.keyArt,
    input.images?.hero,
    input.images?.banner,
    input.images?.key_art,
    input.images?.large,
    input.image_large
  ]);

  if (candidate && !isLikelyLogoOrSymbol(candidate)) {
    return candidate;
  }

  return HERO_FALLBACK_IMAGES[game] || null;
}

function normalizeHeroEligibility(input = {}) {
  if (input.hero_eligible === false || input.heroEligible === false) return false;
  const mode = String(input.hero_visual_mode || input.heroVisualMode || '').toLowerCase();
  if (mode === 'ineligible') return false;
  return true;
}

function normalizeReleaseName(input = {}, source = 'unknown') {
  return input.name || input.set_name || input.setName || input.title || `${source} release`;
}

function normalizeReleaseParentKey(input = {}, source = 'unknown') {
  if (input.parentKey) return input.parentKey;
  const game = inferGameKey(input);
  const releaseDate = normalizeReleaseDateValue(
    input.release_date
    || input.releaseDate
    || input.released_at
    || input.tcg_date
    || input.date
  );
  let name = normalizeReleaseName(input, source);
  if (game === 'magic') {
    name = name
      .replace(/\s+Commander(?:\s+Decks?)?$/i, '')
      .replace(/\s+Collector(?:\s+Boosters?)?$/i, '')
      .replace(/\s+Prerelease(?:\s+Packs?)?$/i, '')
      .replace(/\s+Starter(?:\s+Kits?)?$/i, '');
  }
  const slug = String(name)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'release';
  return [game, releaseDate ? releaseDate.slice(0, 10) : 'undated', slug].join(':');
}

function buildShopSearchLink(input = {}, source = 'unknown') {
  const name = normalizeReleaseName(input, source);
  const game = inferGameKey(input);
  const params = new URLSearchParams();
  params.set('type', 'single_card');
  if (game && game !== 'other') params.set('game', game);
  params.set('search', name);
  return `/Shop?${params.toString()}`;
}

function routeGameKey(game) {
  if (game === 'flesh_and_blood') return 'fab';
  return game || 'magic';
}

function buildSetDetailLink(input = {}, source = 'unknown') {
  const name = normalizeReleaseName(input, source);
  const game = routeGameKey(inferGameKey(input));
  const slug = String(name)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
  return `/set/${game}/${slug}`;
}

export function normalizeHomepageRelease(input = {}, source = 'unknown') {
  const releaseDate = normalizeReleaseDateValue(
    input.release_date
    || input.releaseDate
    || input.released_at
    || input.tcg_date
    || input.date
  );

  const game = inferGameKey(input);
  const theme = getReleaseTheme({ ...input, game });
  const name = normalizeReleaseName(input, source);
  const hasPreorderListing = Boolean(input.has_preorder_listing ?? (source === 'product' && input.is_preorder));
  const releaseState = input.release_state || input.releaseState || getReleaseState(releaseDate);
  const released = releaseState === 'RELEASED';
  const hasActiveListing = Boolean(input.has_active_listing ?? source === 'product');
  const ctaLabel = input.cta_label
    || (hasPreorderListing ? 'Preorder' : (released && hasActiveListing ? 'Shop Set' : 'View Set'));
  const shopSearch = input.links?.shopSearch || buildShopSearchLink({ ...input, game, name }, source);
  const setDetail = input.links?.setDetail || buildSetDetailLink({ ...input, game, name }, source);

  return {
    id: input.id || input.code || input.set_code || `${source}:${name}`,
    source,
    game,
    gameLabel: theme.label,
    name,
    setName: input.set_name || input.setName || input.name || '',
    parentKey: normalizeReleaseParentKey({ ...input, game, name }, source),
    productType: input.product_type || 'sealed_product',
    description: input.description || '',
    releaseDate,
    releaseState,
    releaseStateLabel: input.release_state_label || input.releaseStateLabel || getReleaseStateLabel(releaseState),
    homepagePromotable: input.homepage_promotable ?? input.homepagePromotable ?? isHomepagePromotableReleaseState(releaseState),
    supportLine: input.supportLine || [
      theme.label,
      input.set_name && input.set_name !== input.name ? input.set_name : ''
    ].filter(Boolean).join(' • '),
    imageUrl: getReleaseImage({ ...input, game }),
    heroImageUrl: getReleaseHeroImage({ ...input, game }),
    heroVisualMode: input.hero_visual_mode || input.heroVisualMode || null,
    heroEligible: normalizeHeroEligibility(input),
    heroArtReason: input.hero_art_reason || input.heroArtReason || null,
    heroGeneratedPath: input.hero_generated_path || input.heroGeneratedPath || null,
    heroFallbackImageUrl: input.game_fallback_image_url || theme.fallbackImage,
    preorder: Boolean(input.is_preorder ?? true),
    hasPreorderListing,
    hasActiveListing,
    featured: Boolean(input.featured ?? false),
    ctaLabel,
    ctaHref: ctaLabel === 'View Set' ? setDetail : (input.cta_href || input.links?.preorder || shopSearch),
    links: {
      ...(input.links || {}),
      setDetail,
      shopSearch,
      preorder: hasPreorderListing ? shopSearch : null
    },
    raw: input
  };
}

export function sortUpcomingReleases(releases = []) {
  return [...releases].sort((a, b) => {
    const aDate = parseReleaseDate(a.releaseDate);
    const bDate = parseReleaseDate(b.releaseDate);

    if (aDate && bDate) {
      const dateDelta = aDate.getTime() - bDate.getTime();
      if (dateDelta !== 0) return dateDelta;
    }

    if (aDate && !bDate) return -1;
    if (!aDate && bDate) return 1;

    return String(a.name || '').localeCompare(String(b.name || ''));
  });
}

export function filterUpcomingReleases(releases = [], todayStart = getTodayStart()) {
  return releases.filter((release) => {
    if (!release?.preorder) return false;
    const releaseState = release.releaseState || getReleaseState(release.releaseDate, todayStart);
    return isHomepagePromotableReleaseState(releaseState);
  });
}

function scoreReleaseRepresentative(release) {
  let score = 0;
  if (release.heroImageUrl) score += 40;
  if (release.imageUrl && !isLikelyLogoOrSymbol(release.imageUrl)) score += 12;
  if (release.imageUrl) score += 4;
  if (/commander|collector|starter|prerelease/i.test(release.name || '')) score -= 8;
  return score;
}

export function groupHomepageReleases(releases = []) {
  const groups = new Map();
  for (const release of releases) {
    const key = release.parentKey || release.id;
    const entries = groups.get(key) || [];
    entries.push(release);
    groups.set(key, entries);
  }

  return [...groups.values()].map((entries) => {
    const sorted = [...entries].sort((a, b) => {
      const scoreDelta = scoreReleaseRepresentative(b) - scoreReleaseRepresentative(a);
      if (scoreDelta !== 0) return scoreDelta;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const primary = sorted[0];
    return {
      ...primary,
      variantCount: entries.length,
      groupedReleaseIds: entries.map((entry) => entry.id)
    };
  });
}

export function balanceHomepageReleases(releases = [], limit = 12, options = {}) {
  const fillRemaining = options.fillRemaining ?? true;
  const sorted = sortUpcomingReleases(groupHomepageReleases(releases));
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

  if (fillRemaining) {
    for (const release of sorted) {
      if (selected.length >= limit) break;
      if (selectedIds.has(release.id)) continue;
      selected.push(release);
      selectedIds.add(release.id);
    }
  }

  return selected;
}

export const fallbackHomepageReleases = sortUpcomingReleases([
  normalizeHomepageRelease({
    id: 'fallback-lorcana',
    name: 'Fabled',
    set_name: 'Disney Lorcana',
    game: 'lorcana',
    release_date: '2026-08-29',
    set_image_url: '/images/game-lorcana.png',
    is_preorder: true,
    featured: true
  }, 'fallback'),
  normalizeHomepageRelease({
    id: 'fallback-fab',
    name: 'Armory Deck - Maxx',
    game: 'fab',
    release_date: '2026-09-12',
    set_image_url: 'https://dhhim4ltzu1pj.cloudfront.net/media/images/global/fab_logo.original.png',
    is_preorder: true
  }, 'fallback'),
  normalizeHomepageRelease({
    id: 'fallback-magic',
    name: 'Upcoming Magic Release',
    set_name: 'Magic: The Gathering',
    game: 'magic',
    release_date: '2026-10-03',
    is_preorder: true
  }, 'fallback')
]);
