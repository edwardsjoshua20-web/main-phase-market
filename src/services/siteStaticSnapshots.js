import embeddedSystemHealth from '../../public/data/site/system-health.json';
import embeddedUpcomingReleases from '../../public/data/site/upcoming-releases.json';
import embeddedPricingSnapshot from '../../public/data/site/pricing-snapshot.json';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isJsonResponse(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  return contentType.includes('application/json');
}

export async function fetchJsonWithEmbeddedFallback(url, fallbackValue, { cache = 'no-store' } = {}) {
  try {
    const response = await fetch(url, { cache });
    if (!response.ok || !isJsonResponse(response)) {
      return cloneJson(fallbackValue);
    }
    return await response.json();
  } catch {
    return cloneJson(fallbackValue);
  }
}

export function getEmbeddedSystemHealth() {
  return cloneJson(embeddedSystemHealth);
}

export function getEmbeddedUpcomingReleasesManifest() {
  return cloneJson(embeddedUpcomingReleases);
}

export function getEmbeddedPricingSnapshot() {
  return cloneJson(embeddedPricingSnapshot);
}
