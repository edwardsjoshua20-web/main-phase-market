import { getCatalogAssetUrl, getSiteAssetUrl } from '@/config/publicAssetUrls';
import { listingOwner } from '@/services/listing/listingOwner';
import { fetchJsonWithEmbeddedFallback, getEmbeddedUpcomingReleasesManifest } from '@/services/siteStaticSnapshots';

const GAME_ROUTE_ALIASES = {
  mtg: 'magic',
  magic: 'magic',
  fab: 'fab',
  flesh_and_blood: 'fab',
  'flesh-and-blood': 'fab',
  yugioh: 'yugioh',
  'yu-gi-oh': 'yugioh',
  pokemon: 'pokemon',
  lorcana: 'lorcana',
  onepiece: 'onepiece',
  'one-piece': 'onepiece',
  starwars: 'starwars',
  'star-wars': 'starwars'
};

const GAME_LABELS = {
  magic: 'Magic: The Gathering',
  fab: 'Flesh and Blood',
  yugioh: 'Yu-Gi-Oh!',
  pokemon: 'Pokemon TCG',
  lorcana: 'Disney Lorcana',
  onepiece: 'One Piece TCG',
  starwars: 'Star Wars Unlimited'
};

const CATALOG_ASSET_GAMES = {
  magic: 'mtg'
};

function cleanText(value) {
  return String(value || '').trim();
}

export function slugifySetValue(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
}

export function routeGameKey(value) {
  const normalized = cleanText(value).toLowerCase().replace(/\s+/g, '-');
  return GAME_ROUTE_ALIASES[normalized] || normalized || 'magic';
}

export function buildSetDetailPath(input = {}) {
  const game = routeGameKey(input.game || input.source_game);
  const name = cleanText(input.name || input.set_name || input.setName || input.title || input.code || input.set_code);
  return `/set/${game}/${slugifySetValue(name)}`;
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function firstText(values = []) {
  return values.map(cleanText).find(Boolean) || '';
}

function firstImage(values = []) {
  return values.find((value) => typeof value === 'string' && value.trim()) || null;
}

function setCodeFor(row = {}) {
  return firstText([row.set_code, row.code, row.id, row.ptcgoCode, row.uuid, row.pack_id]);
}

function nameFor(row = {}) {
  return firstText([row.name, row.set_name, row.setName, row.title, setCodeFor(row)]);
}

function imageFor(row = {}) {
  return firstImage([
    row.set_image_url,
    row.set_image,
    row.image_url,
    row.hero_image_url,
    row.heroImageUrl,
    row.promo_image_url,
    row.key_art,
    row.set_logo,
    row.images?.logo,
    row.images?.symbol,
    row.images?.icon,
    row.images?.large,
    row.image_large,
    row.image_normal,
    row.logo
  ]);
}

function cardCountFor(row = {}) {
  const value = row.card_count ?? row.total_cards ?? row.num_of_cards ?? row.cards_count ?? row.count;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizeSourceAssets(release = {}) {
  const assets = Array.isArray(release.hero_source_assets)
    ? release.hero_source_assets
    : Array.isArray(release.heroSourceAssets)
      ? release.heroSourceAssets
      : [];

  return assets
    .filter((asset) => asset?.url)
    .map((asset) => ({
      kind: asset.kind || 'image',
      name: cleanText(asset.name) || 'Featured card',
      imageUrl: asset.url,
      width: asset.width || null,
      height: asset.height || null
    }));
}

function normalizeCatalogSet(row = {}, game) {
  const name = nameFor(row);
  const setCode = setCodeFor(row);
  return {
    source: 'catalog',
    id: `${game}:${setCode || name}`,
    game,
    gameLabel: GAME_LABELS[game] || 'TCG',
    name,
    setName: firstText([row.set_name, row.series, name]),
    setCode,
    slug: slugifySetValue(name),
    releaseDate: parseDate(row.releaseDate || row.released_at || row.release_date || row.tcg_date || row.date),
    description: cleanText(row.description),
    cardCount: cardCountFor(row),
    setImageUrl: imageFor(row),
    heroImageUrl: firstImage([row.hero_image_url, row.heroImageUrl, row.promo_image_url, row.key_art, row.images?.hero, row.images?.banner]),
    productPageUrl: firstImage([row.product_page, row.productPage, row.url]),
    cardDatabaseUrl: firstImage([row.card_database, row.cardDatabase]),
    raw: row
  };
}

function normalizeManifestRelease(row = {}) {
  const game = routeGameKey(row.game);
  const name = nameFor(row);
  const setCode = setCodeFor(row);
  return {
    source: 'release',
    id: row.id || `${game}:${setCode || name}`,
    game,
    gameLabel: GAME_LABELS[game] || row.gameLabel || 'TCG',
    name,
    setName: firstText([row.set_name, row.setName, name]),
    setCode,
    slug: slugifySetValue(name),
    releaseDate: parseDate(row.release_date || row.releaseDate || row.released_at || row.tcg_date || row.date),
    description: cleanText(row.description),
    cardCount: cardCountFor(row),
    setImageUrl: imageFor(row),
    heroImageUrl: firstImage([row.hero_image_url, row.heroImageUrl]),
    heroVisualMode: row.hero_visual_mode || row.heroVisualMode || null,
    sourceAssets: normalizeSourceAssets(row),
    groupedReleaseIds: Array.isArray(row.grouped_release_ids) ? row.grouped_release_ids : [],
    variantCount: row.variant_count || row.variantCount || null,
    shopSearchUrl: row.links?.shopSearch || null,
    raw: row
  };
}

async function fetchUpcomingManifest() {
  const payload = await fetchJsonWithEmbeddedFallback(
    getSiteAssetUrl('upcoming-releases.json'),
    getEmbeddedUpcomingReleasesManifest(),
    { cache: 'no-store' }
  );
  return Array.isArray(payload?.releases) ? payload.releases.map(normalizeManifestRelease) : [];
}

async function fetchCatalogSets(game) {
  try {
    const assetGame = CATALOG_ASSET_GAMES[game] || game;
    const response = await fetch(getCatalogAssetUrl(assetGame, 'sets.json'), { cache: 'no-store' });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows.map((row) => normalizeCatalogSet(row, game)) : [];
  } catch {
    return [];
  }
}

function releaseMatches(release, game, setSlug) {
  if (routeGameKey(release.game) !== game) return false;
  const candidateSlugs = [
    release.slug,
    slugifySetValue(release.name),
    slugifySetValue(release.setName),
    slugifySetValue(release.setCode)
  ];
  return candidateSlugs.includes(setSlug);
}

function setMatches(set, setSlug) {
  return [
    set.slug,
    slugifySetValue(set.name),
    slugifySetValue(set.setName),
    slugifySetValue(set.setCode)
  ].includes(setSlug);
}

function mergeSetDetail({ release, catalogSet, game, setSlug }) {
  const primary = release || catalogSet;
  if (!primary) return null;

  const sourceAssets = release?.sourceAssets?.length ? release.sourceAssets : [];

  return {
    id: primary.id,
    game,
    gameLabel: primary.gameLabel || GAME_LABELS[game] || 'TCG',
    name: primary.name,
    setName: primary.setName || primary.name,
    setCode: primary.setCode || catalogSet?.setCode || '',
    slug: setSlug,
    releaseDate: primary.releaseDate || catalogSet?.releaseDate || null,
    description: primary.description || catalogSet?.description || '',
    cardCount: primary.cardCount || catalogSet?.cardCount || null,
    setImageUrl: primary.setImageUrl || catalogSet?.setImageUrl || null,
    heroImageUrl: primary.heroImageUrl || catalogSet?.heroImageUrl || primary.setImageUrl || catalogSet?.setImageUrl || null,
    heroVisualMode: release?.heroVisualMode || null,
    sourceAssets,
    representativeImages: sourceAssets.filter((asset) => asset.kind === 'card').slice(0, 6),
    productPageUrl: catalogSet?.productPageUrl || null,
    cardDatabaseUrl: catalogSet?.cardDatabaseUrl || null,
    groupedReleaseIds: release?.groupedReleaseIds || [],
    variantCount: release?.variantCount || null,
    shopSearchUrl: release?.shopSearchUrl || `/Shop?type=single_card&game=${encodeURIComponent(game)}&search=${encodeURIComponent(primary.name)}`,
    source: release ? 'release-manifest' : 'catalog-set'
  };
}

function listingMatchesSet(listing = {}, detail = {}) {
  if (routeGameKey(listing.game || listing.product_type) !== detail.game) return false;
  const listingSetCode = cleanText(listing.set_code || listing.set_id).toLowerCase();
  const detailSetCode = cleanText(detail.setCode).toLowerCase();
  if (listingSetCode && detailSetCode && listingSetCode === detailSetCode) return true;

  const listingSetName = cleanText(listing.set_name || listing.product_name || listing.name).toLowerCase();
  const detailNames = [detail.name, detail.setName].map((value) => cleanText(value).toLowerCase()).filter(Boolean);
  return listingSetName && detailNames.some((name) => listingSetName.includes(name) || name.includes(listingSetName));
}

export async function resolveSetDetail({ game, setSlug }) {
  const routeGame = routeGameKey(game);
  const slug = slugifySetValue(setSlug);
  const [releases, catalogSets] = await Promise.all([
    fetchUpcomingManifest(),
    fetchCatalogSets(routeGame)
  ]);

  const release = releases.find((entry) => releaseMatches(entry, routeGame, slug)) || null;
  const catalogSet = catalogSets.find((entry) => {
    if (release?.setCode && entry.setCode && cleanText(entry.setCode).toLowerCase() === cleanText(release.setCode).toLowerCase()) return true;
    return setMatches(entry, slug);
  }) || null;

  const detail = mergeSetDetail({ release, catalogSet, game: routeGame, setSlug: slug });
  if (!detail) return null;

  let activeListings = [];
  try {
    const listings = await listingOwner.listStorefrontListings({ game: 'all', sellableOnly: true, limit: 5000 });
    activeListings = listings.filter((listing) => listingMatchesSet(listing, detail));
  } catch {
    activeListings = [];
  }

  return {
    ...detail,
    availability: {
      activeListingCount: activeListings.length,
      sampleListings: activeListings.slice(0, 6)
    }
  };
}
