export function normalizeReleaseDate(dateValue) {
  if (!dateValue || typeof dateValue !== 'string') return null;
  const parsed = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getTodayStart() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getUpcomingHeroReleases(products = []) {
  const todayStart = getTodayStart();

  return products
    .filter((product) => {
      if (!product?.is_preorder) return false;
      const releaseDate = normalizeReleaseDate(product.release_date);
      if (!releaseDate) return false;
      return releaseDate > todayStart;
    })
    .sort((a, b) => {
      const aDate = normalizeReleaseDate(a.release_date);
      const bDate = normalizeReleaseDate(b.release_date);
      return aDate.getTime() - bDate.getTime();
    });
}