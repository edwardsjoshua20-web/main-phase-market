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
    fallbackImage: 'https://www.disneylorcana.com/_next/image?url=%2Fimages%2Flogo.png&w=1920&q=75'
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

function parseReleaseDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function normalizeReleaseDateValue(value) {
  const parsed = parseReleaseDate(value);
  return parsed ? parsed.toISOString() : null;
}

export function inferGameKey(input = {}) {
  const rawGame = String(input.game || input.source_game || '').trim().toLowerCase();
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

export function normalizeHomepageRelease(input = {}, source = 'unknown') {
  const releaseDate = normalizeReleaseDateValue(
    input.release_date
    || input.releaseDate
    || input.released_at
    || input.date
  );

  const game = inferGameKey(input);
  const theme = getReleaseTheme({ ...input, game });

  return {
    id: input.id || input.code || `${source}:${input.name || 'release'}`,
    source,
    game,
    gameLabel: theme.label,
    name: input.name || input.set_name || 'Upcoming Release',
    setName: input.set_name || input.name || '',
    productType: input.product_type || 'sealed_product',
    description: input.description || '',
    releaseDate,
    supportLine: input.supportLine || [
      theme.label,
      input.set_name && input.set_name !== input.name ? input.set_name : ''
    ].filter(Boolean).join(' • '),
    imageUrl: getReleaseImage({ ...input, game }),
    heroImageUrl: input.hero_image_url || input.promo_image_url || input.set_image_url || null,
    preorder: Boolean(input.is_preorder ?? true),
    featured: Boolean(input.featured ?? false),
    links: {
      shopSearch: `/Shop?search=${encodeURIComponent(input.name || input.set_name || '')}`,
      preorder: '/Shop?preorder=true'
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
    const releaseDate = parseReleaseDate(release.releaseDate);
    if (!releaseDate) return false;
    return releaseDate >= todayStart;
  });
}

export const fallbackHomepageReleases = sortUpcomingReleases([
  normalizeHomepageRelease({
    id: 'fallback-lorcana',
    name: 'Fabled',
    set_name: 'Disney Lorcana',
    game: 'lorcana',
    release_date: '2026-08-29',
    set_image_url: 'https://www.disneylorcana.com/_next/image?url=%2Fimages%2Flogo.png&w=1920&q=75',
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
