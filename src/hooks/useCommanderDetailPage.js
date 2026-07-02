import { useEffect, useMemo, useState } from 'react';
import {
  buildCommanderNavSections,
  createEmptyCommanderPageState,
  getVisibleCommanderCategories,
  loadCommanderDetailPage
} from '@/services/commander/commanderDetailService';

export function useCommanderDetailPage({ oracleId, searchParams }) {
  const [pageState, setPageState] = useState(createEmptyCommanderPageState());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const requestedTheme = searchParams.get('theme') || '';
    const requestedMode = searchParams.get('mode') || 'commander';

    async function load() {
      setLoading(true);
      try {
        const nextState = await loadCommanderDetailPage(oracleId, {
          theme: requestedTheme,
          mode: requestedMode
        });
        if (!mounted) return;
        setPageState(nextState);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, [oracleId, searchParams]);

  const navSections = useMemo(
    () =>
      buildCommanderNavSections({
        activeMode: pageState.activeMode,
        averageDeckSections: pageState.averageDeckSections,
        categories: pageState.categories,
        gameChangers: pageState.gameChangers,
        newCards: pageState.newCards,
        topCommanders: pageState.topCommanders,
        topSynergy: pageState.topSynergy
      }),
    [pageState]
  );

  const visibleCategories = useMemo(
    () => getVisibleCommanderCategories(pageState.categories),
    [pageState.categories]
  );

  return {
    ...pageState,
    navSections,
    visibleCategories,
    loading
  };
}
