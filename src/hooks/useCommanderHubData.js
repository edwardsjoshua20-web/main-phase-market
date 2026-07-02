import { useEffect, useMemo, useState } from 'react';
import { searchMtgCommanders } from '@/lib/mtgCommanderCatalog';

export function useCommanderHubData() {
  const [featuredCommanders, setFeaturedCommanders] = useState([]);
  const [browseResults, setBrowseResults] = useState([]);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [browseLoading, setBrowseLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadFeatured() {
      try {
        const payload = await searchMtgCommanders('', { limit: 10, minDeckCount: 1 });
        if (!mounted) return;
        setFeaturedCommanders((payload.results || []).slice(0, 10));
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
          limit: 1000,
          minDeckCount: 1
        });
        if (!mounted) return;
        setBrowseResults(payload.results || []);
        setBrowseTotal(payload.total || 0);
      } finally {
        if (mounted) setBrowseLoading(false);
      }
    }, search.trim() ? 120 : 0);

    return () => {
      mounted = false;
      clearTimeout(timeoutId);
    };
  }, [search]);

  const rankedFeatured = useMemo(
    () => featuredCommanders.map((commander, index) => ({ ...commander, rank: index + 1 })),
    [featuredCommanders]
  );

  return {
    featuredCommanders,
    browseResults,
    browseTotal,
    featuredLoading,
    browseLoading,
    search,
    setSearch,
    rankedFeatured
  };
}
