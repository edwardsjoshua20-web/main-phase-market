import {
  embeddedPricingSnapshot,
  embeddedSystemHealth,
  embeddedUpcomingReleases
} from '@/services/siteStaticSnapshots.generated';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function isJsonResponse(response) {
  const contentType = String(response?.headers?.get?.('content-type') || '').toLowerCase();
  return contentType.includes('application/json');
}

async function readJsonLenient(response) {
  if (!response) return null;

  try {
    if (isJsonResponse(response)) {
      return await response.json();
    }

    const rawText = await response.text();
    if (!rawText) return null;
    return JSON.parse(rawText);
  } catch {
    return null;
  }
}

function withCacheBust(url, enabled) {
  if (!enabled) return url;

  try {
    const resolved = new URL(url, typeof window !== 'undefined' ? window.location.origin : 'https://mainphasemarket.net');
    resolved.searchParams.set('_ts', String(Date.now()));
    if (typeof window === 'undefined') {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    if (resolved.origin === window.location.origin) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`;
    }
    return resolved.toString();
  } catch {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}_ts=${Date.now()}`;
  }
}

export async function fetchJsonWithEmbeddedFallback(url, fallbackValue, { cache = 'no-store', bustCache = false } = {}) {
  const requestUrl = withCacheBust(url, bustCache || cache === 'no-store');

  try {
    const response = await fetch(requestUrl, {
      cache,
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0',
        Pragma: 'no-cache'
      }
    });

    if (!response.ok) {
      return cloneJson(fallbackValue);
    }

    const payload = await readJsonLenient(response);
    if (payload == null) {
      return cloneJson(fallbackValue);
    }

    return payload;
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
