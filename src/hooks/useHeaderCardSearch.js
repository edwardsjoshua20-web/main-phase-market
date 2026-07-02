import { useEffect, useRef, useState } from 'react';
import { searchCatalogAcrossGames, searchCatalogByGame } from '@/services/search/catalogSearch';

export function useHeaderCardSearch({ selectedGame, searchAcrossAllGames = false, delayMs = 500 }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searching, setSearching] = useState(false);
  const timeoutRef = useRef(null);

  const clearPendingSearch = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const runSearch = async (query, acrossAll = searchAcrossAllGames) => {
    const normalizedQuery = String(query || '').trim();
    if (!normalizedQuery) {
      setSearchResults([]);
      setShowSearchResults(false);
      setSearching(false);
      return;
    }

    setSearching(true);
    setShowSearchResults(true);

    try {
      const results = acrossAll
        ? await searchCatalogAcrossGames(normalizedQuery, 2, 10)
        : await searchCatalogByGame(normalizedQuery, selectedGame, 5);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchChange = (value, acrossAll = searchAcrossAllGames) => {
    setSearchQuery(value);
    const normalizedValue = String(value || '').trim();

    if (!normalizedValue) {
      clearPendingSearch();
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    clearPendingSearch();
    timeoutRef.current = setTimeout(() => {
      runSearch(normalizedValue, acrossAll);
    }, delayMs);
  };

  const resetSearch = () => {
    clearPendingSearch();
    setSearchQuery('');
    setSearchResults([]);
    setShowSearchResults(false);
    setSearching(false);
  };

  useEffect(() => clearPendingSearch, []);

  return {
    searchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    searching,
    runSearch,
    handleSearchChange,
    resetSearch
  };
}
