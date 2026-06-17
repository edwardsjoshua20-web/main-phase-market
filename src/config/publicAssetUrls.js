const rawPublicDataBaseUrl = String(
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_PUBLIC_DATA_BASE_URL) || ''
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
  const assetPath = normalizedPath ? `data/${normalizedGame}/${normalizedPath}` : `data/${normalizedGame}`;
  return getPublicAssetUrl(assetPath);
}
