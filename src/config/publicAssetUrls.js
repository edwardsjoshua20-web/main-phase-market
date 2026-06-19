const hostedPublicDataBaseUrl =
  'https://wwvvyrhlybwijqlhubdv.supabase.co/storage/v1/object/public/main-phase-market-public/data';

function shouldUseHostedCatalogBase() {
  if (typeof window === 'undefined') {
    return false;
  }

  return ['main-phase-market.pages.dev', 'mainphasemarket.net', 'www.mainphasemarket.net'].includes(window.location.hostname);
}

const rawPublicDataBaseUrl = String(
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_PUBLIC_DATA_BASE_URL) ||
    (shouldUseHostedCatalogBase() ? hostedPublicDataBaseUrl : '')
)
  .trim()
  .replace(/\/+$/, '');

export const hasExternalCatalogAssetBase = Boolean(rawPublicDataBaseUrl);

function normalizeRelativePath(relativePath) {
  return String(relativePath || '')
    .trim()
    .replace(/^\/+/, '');
}

export function getPublicAssetUrl(relativePath) {
  const normalizedPath = normalizeRelativePath(relativePath);
  if (!normalizedPath) {
    return rawPublicDataBaseUrl || '/';
  }

  if (/^https?:\/\//i.test(normalizedPath)) {
    return normalizedPath;
  }

  if (!rawPublicDataBaseUrl) {
    return `/${normalizedPath}`;
  }

  return `${rawPublicDataBaseUrl}/${normalizedPath}`;
}

export function getCatalogAssetUrl(game, relativePath = '') {
  const normalizedGame = normalizeRelativePath(game);
  const normalizedPath = normalizeRelativePath(relativePath);
  const localAssetPath = normalizedPath ? `data/${normalizedGame}/${normalizedPath}` : `data/${normalizedGame}`;
  const hostedAssetPath = normalizedPath ? `${normalizedGame}/${normalizedPath}` : normalizedGame;
  const assetPath = rawPublicDataBaseUrl ? hostedAssetPath : localAssetPath;
  return getPublicAssetUrl(assetPath);
}
