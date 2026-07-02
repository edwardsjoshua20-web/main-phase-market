import { backend } from '@/services/backend';
import { fetchJsonWithEmbeddedFallback, getEmbeddedUpcomingReleasesManifest } from '@/services/siteStaticSnapshots';
import {
  fallbackHomepageReleases,
  filterUpcomingReleases,
  normalizeHomepageRelease,
  sortUpcomingReleases
} from '@/services/homepage/homepageReleaseFeed';

async function fetchStaticUpcomingReleaseManifest() {
  try {
    const payload = await fetchJsonWithEmbeddedFallback(
      '/data/site/upcoming-releases.json',
      getEmbeddedUpcomingReleasesManifest(),
      { cache: 'no-store' }
    );
    const releases = Array.isArray(payload?.releases) ? payload.releases : [];
    return sortUpcomingReleases(releases.map((entry) => normalizeHomepageRelease(entry, 'manifest')));
  } catch {
    return [];
  }
}

async function fetchUpcomingProductsFromBackend() {
  try {
    const products = await backend.data.Product.filter({ is_preorder: true }, 'release_date', 20);
    return sortUpcomingReleases(
      filterUpcomingReleases(
        (products || []).map((product) => normalizeHomepageRelease(product, 'product'))
      )
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
  const heroReleases = preferredReleases.length > 0 ? preferredReleases : fallbackHomepageReleases;

  return {
    heroReleases,
    upcomingReleases: heroReleases.slice(0, 6),
    sources: {
      products: productReleases.length,
      manifest: manifestReleases.length
    }
  };
}
