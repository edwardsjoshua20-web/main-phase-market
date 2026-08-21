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

export async function getHomepageContent() {
  const [productReleases, manifestReleases] = await Promise.all([
    fetchUpcomingProductsFromBackend(),
    fetchStaticUpcomingReleaseManifest()
  ]);

  const preferredReleases = productReleases.length > 0 ? productReleases : manifestReleases;
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

