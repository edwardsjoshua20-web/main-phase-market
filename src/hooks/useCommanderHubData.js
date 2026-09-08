import { useEffect, useMemo, useState } from 'react';
import { getMtgCommanderPage, searchMtgCommanders } from '@/lib/mtgCommanderCatalog';
import { getCatalogAssetUrl } from '@/config/publicAssetUrls';

export function useCommanderHubData() {
  const [featuredCommanders, setFeaturedCommanders] = useState([]);
  const [featuredDetails, setFeaturedDetails] = useState({});
  const [browseResults, setBrowseResults] = useState([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [manifest, setManifest] = useState(null);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchRequestId, setSearchRequestId] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function loadFeatured() {
      try {
        const [payload, manifestResponse] = await Promise.all([
          searchMtgCommanders('', { limit: 10, minDeckCount: 1 }),
          fetch(getCatalogAssetUrl('mtg', 'commander-manifest.json')).catch(() => null)
        ]);
        if (!mounted) return;
        const featured = (payload.results || []).slice(0, 10);
        setFeaturedCommanders(featured);

        if (manifestResponse?.ok) {
          setManifest(await manifestResponse.json());
        }

        const details = await Promise.all(
          featured.slice(0, 5).map(async (commander) => {
            try {
              return [commander.oracle_id, await getMtgCommanderPage(commander.oracle_id)];
            } catch {
              return [commander.oracle_id, null];
            }
          })
        );
        if (mounted) setFeaturedDetails(Object.fromEntries(details));
      } finally {
        if (mounted) setFeaturedLoading(false);
      }
    }

    loadFeatured();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    setBrowseLoading(true);

    const timeoutId = setTimeout(async () => {
      try {
        const payload = await searchMtgCommanders(search, {
          limit: 4000,
          minDeckCount: 1
        });
        if (!mounted) return;
        setBrowseResults(payload.results || []);
        setBrowseTotal(payload.total || 0);
      } finally {
        if (mounted) setBrowseLoading(false);
      }
    }, searchRequestId > 0 ? 0 : search.trim() ? 120 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [search, searchRequestId]);

  const rankedFeatured = useMemo(
    () => featuredCommanders.map((commander, index) => ({ ...commander, rank: index + 1 })),
    [featuredCommanders]
  );

  return {
    featuredCommanders,
    featuredDetails,
    browseResults,
    browseTotal,
    manifest,
    featuredLoading,
    browseLoading,
    search,
    setSearch,
    submitSearch: () => setSearchRequestId((current) => current + 1),
    rankedFeatured
  };
}
