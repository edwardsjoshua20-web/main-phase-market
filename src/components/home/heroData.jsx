import { createPageUrl } from '@/utils';

export const gameThemeMap = {
  magic: {
    label: 'Magic: The Gathering',
    gradient: 'from-blue-950 via-slate-900 to-indigo-950',
    badge: 'bg-blue-400 text-slate-950',
    fallbackImage: 'https://cards.scryfall.io/art_crop/front/9/7/97567879-c547-4fa1-89ae-a9e6dd8a7e88.jpg'
  },
  pokemon: {
    label: 'Pokémon TCG',
    gradient: 'from-yellow-900 via-red-900 to-slate-950',
    badge: 'bg-yellow-400 text-slate-950',
    fallbackImage: 'https://images.pokemontcg.io/sv1/logo.png'
  },
  yugioh: {
    label: 'Yu-Gi-Oh!',
    gradient: 'from-purple-950 via-fuchsia-950 to-slate-950',
    badge: 'bg-fuchsia-400 text-slate-950',
    fallbackImage: 'https://images.ygoprodeck.com/images/cards/46986414.jpg'
  },
  other: {
    label: 'TCG',
    gradient: 'from-emerald-950 via-teal-950 to-slate-950',
    badge: 'bg-emerald-400 text-slate-950',
    fallbackImage: 'https://cards.scryfall.io/art_crop/front/9/7/97567879-c547-4fa1-89ae-a9e6dd8a7e88.jpg'
  }
};

const keywordThemes = {
  'Disney Lorcana': {
    label: 'Disney Lorcana',
    gradient: 'from-pink-950 via-purple-950 to-slate-950',
    badge: 'bg-pink-400 text-slate-950',
    fallbackImage: 'https://www.disneylorcana.com/_next/image?url=%2Fimages%2Flogo.png&w=1920&q=75'
  },
  'One Piece': {
    label: 'One Piece TCG',
    gradient: 'from-red-950 via-orange-950 to-slate-950',
    badge: 'bg-red-400 text-slate-950',
    fallbackImage: 'https://en.onepiece-cardgame.com/images/common/logo.png'
  },
  'Flesh and Blood': {
    label: 'Flesh and Blood',
    gradient: 'from-orange-950 via-amber-950 to-slate-950',
    badge: 'bg-amber-400 text-slate-950',
    fallbackImage: 'https://fabtcg.com/assets/images/global/logos/fab-logo.png'
  }
};

export function getHeroTheme(product) {
  const desc = product.description || '';
  for (const [keyword, theme] of Object.entries(keywordThemes)) {
    if (desc.includes(keyword)) return theme;
  }
  return gameThemeMap[product.game] || gameThemeMap.other;
}

export function getHeroImage(product) {
  const theme = getHeroTheme(product);
  const preferredImages = [
    product.hero_image_url,
    product.promo_image_url,
    product.set_image_url
  ].filter(Boolean);

  if (preferredImages.length > 0) return preferredImages[0];

  const safeFallbackImages = [
    product.image_large,
    product.image_normal,
    product.image_small,
    product.image_url
  ].filter(Boolean);

  return safeFallbackImages[0] || theme.fallbackImage;
}

export function getHeroTiming(product) {
  if (!product.release_date) return 'Featured release';
  const releaseDate = new Date(product.release_date);
  const isUpcoming = releaseDate > new Date();
  return isUpcoming
    ? `Preorder ${releaseDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
    : 'Now available';
}

export function getHeroSupportLine(product) {
  const theme = getHeroTheme(product);
  if (product.set_name) return `${theme.label} • ${product.set_name}`;
  if (product.product_type === 'booster_box') return `${theme.label} sealed product`;
  if (product.product_type === 'starter_deck') return `${theme.label} starter deck`;
  if (product.product_type === 'bundle') return `${theme.label} bundle`;
  return `${theme.label} release`;
}

export function getHeroCtas(product) {
  const sealedHref = ['booster_box', 'starter_deck', 'bundle', 'sealed_product'].includes(product.product_type)
    ? createPageUrl('Shop') + `?search=${encodeURIComponent(product.name)}`
    : createPageUrl('Shop') + '?type=booster_box';

  return {
    sealedHref,
    singlesHref: createPageUrl('Shop') + `?search=${encodeURIComponent(product.name)}&type=single_card`
  };
}

export const fallbackHeroReleases = [
  {
    name: 'Teenage Mutant Ninja Turtles',
    game: 'magic',
    release_date: '2026-03-06',
    description: 'Magic: The Gathering upcoming set',
    product_type: 'booster_box',
    set_name: 'Universes Beyond'
  },
  {
    name: 'Prismatic Evolutions',
    game: 'pokemon',
    release_date: '2026-01-17',
    description: 'Pokémon TCG upcoming set',
    product_type: 'booster_box',
    set_name: 'Scarlet & Violet'
  },
  {
    name: 'Maze of Muertos',
    game: 'yugioh',
    release_date: '2026-02-20',
    description: 'Yu-Gi-Oh! upcoming booster set',
    product_type: 'booster_box'
  }
];