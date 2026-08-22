import { getSiteAssetUrl } from '@/config/publicAssetUrls';
import { listingOwner } from '@/services/listing/listingOwner';
import { fetchJsonWithEmbeddedFallback, getEmbeddedUpcomingReleasesManifest } from '@/services/siteStaticSnapshots';
import {
  balanceHomepageReleases,
  fallbackHomepageReleases,
  filterUpcomingReleases,
  normalizeHomepageRelease
} from '@/services/homepage/homepageReleaseFeed';

async function fetchStaticUpcomingReleaseManifest() {
  try {
    const payload = await fetchJsonWithEmbeddedFallback(
      getSiteAssetUrl('upcoming-releases.json'),
      getEmbeddedUpcomingReleasesManifest(),
      { cache: 'no-store' }
    );
    const releases = Array.isArray(payload?.releases) ? payload.releases : [];
    return balanceHomepageReleases(
      filterUpcomingReleases(releases.map((entry) => normalizeHomepageRelease(entry, 'manifest'))),
      12
    );
  } catch {
    return [];
  }
}

async function fetchUpcomingProductsFromBackend() {
  try {
    const products = await listingOwner.filterProductListings({ is_preorder: true }, 'release_date', 20);
    return balanceHomepageReleases(
      filterUpcomingReleases(
        (products || []).map((product) => normalizeHomepageRelease(product, 'product'))
      ),
      12
    );
  } catch {
    return [];
  }
}

function releaseMatchKeys(release = {}) {
  return [
    release.releaseKey,
    release.id,
    release.parentKey,
    release.setCode ? `${release.game}:${release.setCode}` : null,
    release.name && release.game ? `${release.game}:${String(release.name).toLowerCase()}` : null
  ].filter(Boolean);
}

function buildProductReleaseMap(productReleases = []) {
  const map = new Map();
  for (const product of productReleases) {
    for (const key of releaseMatchKeys(product)) {
      if (!map.has(key)) map.set(key, product);
    }
  }
  return map;
}

function enrichManifestReleasesWithProducts(manifestReleases = [], productReleases = []) {
  if (manifestReleases.length === 0) return productReleases;

  const productMap = buildProductReleaseMap(productReleases);
  return manifestReleases.map((release) => {
    const product = releaseMatchKeys(release).map((key) => productMap.get(key)).find(Boolean);
    if (!product) return release;

    return {
      ...release,
      hasPreorderListing: release.hasPreorderListing || product.hasPreorderListing,
      hasActiveListing: release.hasActiveListing || product.hasActiveListing,
      links: {
        ...release.links,
        preorder: product.links?.preorder || product.links?.shopSearch || release.links?.preorder || null,
        shopSearch: product.links?.shopSearch || release.links?.shopSearch
      }
    };
  });
}

export async function getHomepageContent() {
  const [productReleases, manifestReleases] = await Promise.all([
    fetchUpcomingProductsFromBackend(),
    fetchStaticUpcomingReleaseManifest()
  ]);

  const preferredReleases = manifestReleases.length > 0
    ? enrichManifestReleasesWithProducts(manifestReleases, productReleases)
    : productReleases;
  const eligibleHeroReleases = filterUpcomingReleases(preferredReleases)
    .filter((release) => release.heroEligible !== false && release.heroImageUrl);
  const heroReleases = eligibleHeroReleases.length > 0
    ? balanceHomepageReleases(eligibleHeroReleases, 12)
    : fallbackHomepageReleases;

  return {
    heroReleases,
    upcomingReleases: balanceHomepageReleases(preferredReleases.length > 0 ? preferredReleases : heroReleases, 6, { fillRemaining: false }),
    sources: {
      products: productReleases.length,
      manifest: manifestReleases.length
    }
  };
}

