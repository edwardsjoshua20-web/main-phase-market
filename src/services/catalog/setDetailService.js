import { getCatalogAssetUrl, getSiteAssetUrl } from '@/config/publicAssetUrls';
import { listingOwner } from '@/services/listing/listingOwner';
import { getReleaseState, getReleaseStateLabel } from '@/services/releases/releaseState';
import { enrichCatalogResultsWithInventory } from '@/services/search/searchCore';
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

const SEARCH_GAMES = {
  fab: 'flesh_and_blood'
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

function uniqueBy(items = [], keyForItem = (item) => item) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyForItem(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function setCodeFor(row = {}) {
  const direct = firstText([row.set_code, row.code, row.ptcgoCode, row.pack_id]);
  if (direct) return direct;
  const id = firstText([row.id]);
  if (id.includes(':')) return id.split(':').pop();
  return firstText([id, row.uuid]);
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
    sourceUrl: firstImage([row.source_url, row.sourceUrl]),
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
    releaseState: row.release_state || row.releaseState || null,
    releaseStateLabel: row.release_state_label || row.releaseStateLabel || null,
    sourceAssets: normalizeSourceAssets(row),
    groupedReleaseIds: Array.isArray(row.grouped_release_ids) ? row.grouped_release_ids : [],
    variantCount: row.variant_count || row.variantCount || null,
    shopSearchUrl: row.links?.shopSearch || null,
    sourceUrl: firstImage([row.source_url, row.sourceUrl]),
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

async function fetchCatalogCards(game) {
  try {
    const assetGame = CATALOG_ASSET_GAMES[game] || game;
    const response = await fetch(getCatalogAssetUrl(assetGame, 'cards.json'), { cache: 'no-store' });
    if (!response.ok) return [];
    const rows = await response.json();
    return Array.isArray(rows) ? rows : [];
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
    releaseState: primary.releaseState || getReleaseState(primary.releaseDate || catalogSet?.releaseDate || null),
    releaseStateLabel: primary.releaseStateLabel || getReleaseStateLabel(primary.releaseState || getReleaseState(primary.releaseDate || catalogSet?.releaseDate || null)),
    description: primary.description || catalogSet?.description || '',
    cardCount: primary.cardCount || catalogSet?.cardCount || null,
    setImageUrl: primary.setImageUrl || catalogSet?.setImageUrl || null,
    heroImageUrl: primary.heroImageUrl || catalogSet?.heroImageUrl || primary.setImageUrl || catalogSet?.setImageUrl || null,
    heroVisualMode: release?.heroVisualMode || null,
    sourceAssets,
    representativeImages: sourceAssets.filter((asset) => asset.kind === 'card').slice(0, 5),
    productPageUrl: primary.sourceUrl || catalogSet?.sourceUrl || catalogSet?.productPageUrl || null,
    cardDatabaseUrl: catalogSet?.cardDatabaseUrl || null,
    groupedReleaseIds: release?.groupedReleaseIds || [],
    variantCount: release?.variantCount || null,
    shopSearchUrl: release?.shopSearchUrl || `/Shop?type=single_card&game=${encodeURIComponent(game)}&search=${encodeURIComponent(primary.name)}`,
    source: release ? 'release-manifest' : 'catalog-set'
  };
}

function imageForCatalogCard(card = {}, printing = {}) {
  return firstImage([
    printing.image_url,
    printing.image,
    printing.image_large,
    printing.image_normal,
    printing.images?.large,
    printing.images?.normal,
    card.product_image,
    card.card_image,
    card.image_url,
    card.english_image_url,
    card.image_normal,
    card.image_large,
    card.image_small,
    card.thumbnail_url,
    card.images?.large,
    card.images?.normal,
    card.images?.small,
    card.image_uris?.png,
    card.image_uris?.large,
    card.image_uris?.normal,
    card.card_faces?.[0]?.image_uris?.png,
    card.card_faces?.[0]?.image_uris?.large,
    card.card_faces?.[0]?.image_uris?.normal,
    card.card_images?.[0]?.image_url,
    card.card_images?.[0]?.image_url_small
  ]);
}

function normalizeRarity(value) {
  return cleanText(value);
}

function sortCardNumber(left = '', right = '') {
  return String(left).localeCompare(String(right), undefined, { numeric: true, sensitivity: 'base' });
}

function normalizeYugiohSetCards(rows = [], detail = {}) {
  const setCode = cleanText(detail.setCode).toUpperCase();
  if (!setCode) return [];

  const grouped = new Map();
  rows.forEach((card) => {
    (card.card_sets || [])
      .filter((printing) => cleanText(printing.set_code).toUpperCase().startsWith(`${setCode}-`))
      .forEach((printing) => {
        const number = cleanText(printing.set_code);
        const key = `${card.id || card.name}:${number}`;
        const existing = grouped.get(key);
        const rarity = normalizeRarity(printing.set_rarity);
        if (existing) {
          if (rarity && !existing.rarities.includes(rarity)) existing.rarities.push(rarity);
          existing.printingCount += 1;
          return;
        }

        grouped.set(key, {
          id: `yugioh:${card.id || cleanText(card.name)}:${number}`,
          game: 'yugioh',
          name: cleanText(card.name),
          set_name: detail.name,
          set_code: setCode,
          collector_number: number,
          card_number: number,
          rarity,
          rarities: rarity ? [rarity] : [],
          printingCount: 1,
          image_url: imageForCatalogCard(card),
          type_line: cleanText(card.type),
          raw: card
        });
      });
  });

  return [...grouped.values()].sort((left, right) => sortCardNumber(left.collector_number, right.collector_number));
}

function normalizeFabSetCards(rows = [], detail = {}) {
  const setCode = cleanText(detail.setCode).toUpperCase();
  if (!setCode) return [];

  const grouped = new Map();
  rows.forEach((card) => {
    (card.printings || [])
      .filter((printing) => cleanText(printing.set_id).toUpperCase() === setCode)
      .forEach((printing) => {
        const number = cleanText(printing.id || printing.card_number);
        const key = `${cleanText(card.name)}:${number || printing.unique_id || card.unique_id}`;
        const rarity = normalizeRarity(printing.rarity);
        const imageUrl = imageForCatalogCard(card, printing);
        const existing = grouped.get(key);
        if (existing) {
          if (rarity && !existing.rarities.includes(rarity)) existing.rarities.push(rarity);
          if (!existing.image_url && imageUrl) existing.image_url = imageUrl;
          existing.printingCount += 1;
          return;
        }

        grouped.set(key, {
          id: `fab:${printing.unique_id || card.unique_id || key}`,
          game: SEARCH_GAMES.fab,
          name: cleanText(card.name),
          set_name: detail.name,
          set_code: setCode,
          collector_number: number,
          card_number: number,
          rarity,
          rarities: rarity ? [rarity] : [],
          printingCount: 1,
          image_url: imageUrl,
          type_line: cleanText(card.type_text),
          raw: card
        });
      });
  });

  return [...grouped.values()].sort((left, right) => sortCardNumber(left.collector_number, right.collector_number));
}

function normalizeMagicSetCards(rows = [], detail = {}) {
  const setCode = cleanText(detail.setCode).toUpperCase();
  if (!setCode) return [];

  return rows
    .filter((card) => cleanText(card.set_code || card.set).toUpperCase() === setCode)
    .map((card) => ({
      id: `magic:${card.id || card.oracle_id || cleanText(card.name)}:${card.collector_number || card.number || ''}`,
      game: 'magic',
      name: cleanText(card.name || card.printed_name),
      set_name: detail.name,
      set_code: setCode,
      collector_number: cleanText(card.collector_number || card.number),
      card_number: cleanText(card.collector_number || card.number),
      rarity: normalizeRarity(card.rarity),
      rarities: normalizeRarity(card.rarity) ? [normalizeRarity(card.rarity)] : [],
      printingCount: 1,
      image_url: imageForCatalogCard(card),
      type_line: cleanText(card.type_line || card.type),
      raw: card
    }))
    .sort((left, right) => sortCardNumber(left.collector_number, right.collector_number));
}

function normalizeGenericSetCards(rows = [], detail = {}) {
  const setCode = cleanText(detail.setCode).toUpperCase();
  const setNames = [detail.name, detail.setName].map((value) => cleanText(value).toLowerCase()).filter(Boolean);

  return rows
    .filter((card) => {
      const cardSetCode = cleanText(card.set_code || card.set_id || card.set).toUpperCase();
      if (setCode && cardSetCode === setCode) return true;
      const cardSetName = cleanText(card.set_name || card.setName).toLowerCase();
      return cardSetName && setNames.includes(cardSetName);
    })
    .map((card) => ({
      id: `${detail.game}:${card.id || card.api_id || cleanText(card.name)}`,
      game: detail.game,
      name: cleanText(card.name || card.product_name),
      set_name: detail.name,
      set_code: detail.setCode,
      collector_number: cleanText(card.collector_number || card.card_number || card.number),
      card_number: cleanText(card.collector_number || card.card_number || card.number),
      rarity: normalizeRarity(card.rarity),
      rarities: normalizeRarity(card.rarity) ? [normalizeRarity(card.rarity)] : [],
      printingCount: 1,
      image_url: imageForCatalogCard(card),
      type_line: cleanText(card.type_line || card.type),
      raw: card
    }))
    .sort((left, right) => sortCardNumber(left.collector_number, right.collector_number));
}

function normalizeSetCards(rows = [], detail = {}) {
  if (detail.game === 'yugioh') return normalizeYugiohSetCards(rows, detail);
  if (detail.game === 'fab') return normalizeFabSetCards(rows, detail);
  if (detail.game === 'magic') return normalizeMagicSetCards(rows, detail);
  return normalizeGenericSetCards(rows, detail);
}

function buildCatalogCardSummary(detail = {}, cards = []) {
  const expectedCount = detail.cardCount || null;
  const knownCount = cards.length;
  const printingCount = cards.reduce((total, card) => total + (Number(card.printingCount) || 1), 0);
  const hasKnownCards = knownCount > 0;
  const isComplete = Boolean(expectedCount && knownCount >= expectedCount);
  const isPartial = Boolean(expectedCount && hasKnownCards && knownCount < expectedCount);

  return {
    expectedCount,
    knownCount,
    printingCount,
    status: hasKnownCards ? (isComplete ? 'complete' : isPartial ? 'partial' : 'known') : 'unavailable',
    heroLabel: hasKnownCards
      ? `${knownCount} known card${knownCount === 1 ? '' : 's'}`
      : expectedCount
        ? `Set size ${expectedCount}`
        : '',
    setSizeLabel: expectedCount ? `${expectedCount} card${expectedCount === 1 ? '' : 's'}` : '',
    knownLabel: hasKnownCards
      ? `${knownCount}${expectedCount && knownCount < expectedCount ? ` of ${expectedCount}` : ''} card${knownCount === 1 ? '' : 's'} known`
      : 'Card list not yet available',
    printingLabel: printingCount > knownCount
      ? `${printingCount} catalog printing${printingCount === 1 ? '' : 's'}`
      : ''
  };
}

function representativeImagesFor(detail = {}, setCards = []) {
  const releaseImages = (detail.representativeImages || []).slice(0, 5);
  if (releaseImages.length > 0) return releaseImages;

  const cardImages = uniqueBy(
    setCards
      .filter((card) => card.image_url)
      .map((card) => ({
        kind: 'card',
        name: card.name,
        imageUrl: card.image_url
      })),
    (asset) => asset.imageUrl
  ).slice(0, 5);
  if (cardImages.length > 0) return cardImages;

  return detail.setImageUrl
    ? [{ kind: 'set', name: detail.name, imageUrl: detail.setImageUrl }]
    : [];
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
  let setCards = [];
  let allListings = [];

  try {
    allListings = await listingOwner.listStorefrontListings({ game: 'all', sellableOnly: true, limit: 5000 });
    activeListings = allListings.filter((listing) => listingMatchesSet(listing, detail));
  } catch {
    allListings = [];
    activeListings = [];
  }

  try {
    const catalogCards = await fetchCatalogCards(routeGame);
    setCards = enrichCatalogResultsWithInventory(normalizeSetCards(catalogCards, detail), allListings);
  } catch {
    setCards = [];
  }

  const cardCatalog = buildCatalogCardSummary(detail, setCards);

  return {
    ...detail,
    representativeImages: representativeImagesFor(detail, setCards),
    cardCatalog,
    setCards,
    availability: {
      activeListingCount: activeListings.length,
      sampleListings: activeListings.slice(0, 6)
    }
  };
}
