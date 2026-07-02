import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue } from
"@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";
import { Search, X, Package, Loader2, ChevronDown, ChevronRight, Mail, Layers, Box, Dice1, Heart, ShoppingCart } from 'lucide-react';
import QuickViewDialog from '@/components/store/QuickViewDialog';
import AdvancedSearch from '@/components/store/AdvancedSearch';
import { searchYugiohSets } from '@/lib/yugiohLocalCatalog';
import { toast } from 'sonner';
import {
  GAME_OPTIONS,
  buildFilterParams,
  enrichSearchResultsWithInventory,
  hasActiveFilters,
  isValidEmail
} from '@/pages/shop/shopUtils';
import { inventoryListings } from '@/services/inventoryListings';
import { performShopCardSearch } from '@/services/search/shopSearch';
import { addToGuestCart } from '@/components/utils/guestStorage';
import { createPageUrl } from '@/utils';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';


export default function Shop() {
  const HOVER_OPEN_DELAY_MS = 180;
  const HOVER_CLOSE_DELAY_MS = 120;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [hoveredCard, setHoveredCard] = useState(null);

  const filters = {
    search: searchParams.get('search') || '',
    type: searchParams.get('type') || 'all',
    game: searchParams.get('game') || 'all',
    sort: searchParams.get('sort') || 'newest',
    rarity: searchParams.get('rarity') || 'all',
    set: searchParams.get('set') || 'all',
    priceMin: searchParams.get('priceMin') || '',
    priceMax: searchParams.get('priceMax') || '',
    inStock: searchParams.get('inStock') === 'true',
    setType: searchParams.get('setType') || 'all'
  };

  const [quickViewItem, setQuickViewItem] = useState(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await backend.auth.isAuthenticated();
        if (isAuth) {
          const userData = await backend.auth.getCurrentUser();
          setUser(userData);
        }
      } catch (error) {
        // User is not logged in (expected for public app)
        setUser(null);
      }
    };
    loadUser();
  }, []);

  // Auto-trigger search when Shop loads with search param
  const advancedSearchOpen = searchParams.get('advancedSearch') === '1';
  const advancedApiQuery = searchParams.get('aq');

  useEffect(() => {
    if (!advancedSearchOpen && filters.type === 'single_card' && filters.search) {
      setCardSearchQuery(filters.search);
      setCardSearchPage(0);
      const game = filters.game === 'all' ? 'magic' : filters.game;
      triggerSearch(filters.search, game);
    }
  }, [advancedSearchOpen, filters.search, filters.type, filters.game]);

  // Auto-set type=single_card when advancedSearch=1
  useEffect(() => {
    if (advancedSearchOpen && filters.type !== 'single_card') {
      setSearchParams((prev) => {
        /** @type {Record<string, string>} */
        const p = {};
        prev.forEach((value, key) => {
          p[key] = value;
        });
        p.type = 'single_card';
        if (!p.game) p.game = 'magic';
        return p;
      });
    }
  }, [advancedSearchOpen]);

  useEffect(() => {
    if (!searchParams.get('type') && !advancedSearchOpen) {
      setSearchParams((prev) => {
        /** @type {Record<string, string>} */
        const p = {};
        prev.forEach((value, key) => {
          p[key] = value;
        });
        p.type = 'single_card';
        if (!p.game) p.game = 'magic';
        return p;
      });
    }
  }, [advancedSearchOpen, searchParams, setSearchParams]);

  useEffect(() => {
    return () => {
      if (boxSearchTimeoutRef.current) {
        clearTimeout(boxSearchTimeoutRef.current);
      }
      clearHoverTimer(hoveredCardTimerRef);
      clearHoverTimer(hoveredCardImageTimerRef);
      clearHoverTimer(hoveredBoxImageTimerRef);
    };
  }, []);



  // Card Search State
  const [_cardSearchQuery, setCardSearchQuery] = useState('');
  const [cardSearchResults, setCardSearchResults] = useState([]);
  const [_searchingCards, setSearchingCards] = useState(false);
  const [showCardResults, setShowCardResults] = useState(false);
  const [advancedSearchMeta, setAdvancedSearchMeta] = useState({ total: 0, page: 0, limit: 36, hasMore: false });
  const [advancedSearchCollapsed, setAdvancedSearchCollapsed] = useState(false);
  const [hoveredCardImage, setHoveredCardImage] = useState(null);
  const [singlesSearchDraft, setSinglesSearchDraft] = useState(filters.search || '');

  // Booster Box Search State
  const [boxSearchQuery, setBoxSearchQuery] = useState('');
  const [boxSearchResults, setBoxSearchResults] = useState([]);
  const [searchingBoxes, setSearchingBoxes] = useState(false);
  const [showBoxResults, setShowBoxResults] = useState(false);
  const [selectedBoxForContact, setSelectedBoxForContact] = useState(null);
  const [boxCustomerEmail, setBoxCustomerEmail] = useState('');
  const [hoveredBoxImage, setHoveredBoxImage] = useState(null);

  // All MTG Sets State
  const [allMTGSets, setAllMTGSets] = useState([]);
  const [loadingMTGSets, setLoadingMTGSets] = useState(false);

  // Product type view state

  // Card search pagination
  const [cardSearchPage, setCardSearchPage] = useState(0);
  const CARDS_PER_PAGE = 20;

  useEffect(() => {
    if (advancedSearchOpen && advancedApiQuery && filters.type === 'single_card') {
      const game = filters.game === 'all' ? 'magic' : filters.game;
      setCardSearchQuery(filters.search || 'Advanced Search');
      triggerSearch(filters.search || 'Advanced Search', game, advancedApiQuery, { page: cardSearchPage });
      setShowCardResults(true);
    }
  }, [advancedApiQuery, advancedSearchOpen, cardSearchPage, filters.game, filters.search, filters.type]);

  useEffect(() => {
    if (advancedSearchOpen && !advancedApiQuery) {
      setCardSearchResults([]);
      setShowCardResults(false);
      setCardSearchPage(0);
      setAdvancedSearchMeta({ total: 0, page: 0, limit: 36, hasMore: false });
      setAdvancedSearchCollapsed(false);
    }
  }, [advancedApiQuery, advancedSearchOpen]);

  useEffect(() => {
    if (!advancedSearchOpen) {
      setAdvancedSearchCollapsed(false);
    }
  }, [advancedSearchOpen]);

  useEffect(() => {
    setSinglesSearchDraft(filters.search || '');
  }, [filters.search]);

  // Game browse pagination & search
  const [gameBrowsePage, setGameBrowsePage] = useState(0);
  const [gameBrowseSearch, setGameBrowseSearch] = useState('');
  const GAME_BROWSE_PER_PAGE = 20;
  const boxSearchTimeoutRef = useRef(null);
  const hoveredCardTimerRef = useRef(null);
  const hoveredCardImageTimerRef = useRef(null);
  const hoveredBoxImageTimerRef = useRef(null);

  const clearHoverTimer = (timerRef) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleHoverState = (timerRef, setter, nextValue, delay) => {
    clearHoverTimer(timerRef);
    timerRef.current = setTimeout(() => {
      setter(nextValue);
      timerRef.current = null;
    }, delay);
  };

  const handleCardPreviewEnter = (card) => {
    if (!getCardImageUrl(card)) return;
    scheduleHoverState(hoveredCardTimerRef, setHoveredCard, card, HOVER_OPEN_DELAY_MS);
  };

  const handleCardPreviewLeave = () => {
    scheduleHoverState(hoveredCardTimerRef, setHoveredCard, null, HOVER_CLOSE_DELAY_MS);
  };

  const getResultGridImageUrl = getCardImageUrl;
  const getResultPreviewImageUrl = getCardImageUrl;

  const handleCardImagePreviewEnter = (imageUrl) => {
    if (!imageUrl) return;
    scheduleHoverState(hoveredCardImageTimerRef, setHoveredCardImage, imageUrl, HOVER_OPEN_DELAY_MS);
  };

  const handleCardImagePreviewLeave = () => {
    scheduleHoverState(hoveredCardImageTimerRef, setHoveredCardImage, null, HOVER_CLOSE_DELAY_MS);
  };

  const handleBoxImagePreviewEnter = (imageUrl) => {
    if (!imageUrl) return;
    scheduleHoverState(hoveredBoxImageTimerRef, setHoveredBoxImage, imageUrl, HOVER_OPEN_DELAY_MS);
  };

  const handleBoxImagePreviewLeave = () => {
    scheduleHoverState(hoveredBoxImageTimerRef, setHoveredBoxImage, null, HOVER_CLOSE_DELAY_MS);
  };

  const handleResultImageError = (event, item) => {
    handleCardImageError(event, item, (image) => {
      image.parentElement?.querySelector('[data-image-fallback]')?.classList.remove('hidden');
    });
  };

  const openMagicCardDetail = (result) => {
    if (!result?.oracle_id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?oracle_id=${encodeURIComponent(result.oracle_id)}&set=${encodeURIComponent(result.set_code || '')}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openPokemonCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?pokemon_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openYugiohCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?yugioh_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openLorcanaCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?lorcana_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openOnePieceCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?onepiece_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openFabCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?fab_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  const openStarWarsCardDetail = (result) => {
    if (!result?.id) return;
    const advancedParams = advancedSearchOpen && advancedApiQuery ? `&advancedSearch=1&aq=${advancedApiQuery}` : '';
    const detailUrl = `${createPageUrl('CardDetail')}?starwars_id=${encodeURIComponent(result.id)}&search=${encodeURIComponent(filters.search || result.name || '')}${advancedParams}`;
    navigate(detailUrl);
  };

  // Reset game browse page when game filter changes
  useEffect(() => {
    setGameBrowsePage(0);
    setGameBrowseSearch('');
  }, [filters.game]);

  // Fetch inventory
  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['shop-cards', filters.game],
    queryFn: async () => {
      const allCards = await inventoryListings.list('-created_date', 500);
      return allCards.filter((c) => c.status === 'active' && (filters.game === 'all' || c.game === filters.game));
    }
  });

  // Fetch Pokemon inventory
  const { data: pokemonCards = [] } = useQuery({
    queryKey: ['pokemon-inventory'],
    queryFn: async () => {
      return await backend.data.PokemonCard.list('-created_date', 500);
    }
  });

  const { data: products = [], isLoading: productsLoading } = useQuery({
    queryKey: ['shop-products', filters.game],
    queryFn: async () => {
      const allProducts = await backend.data.Product.list('-created_date', 100);
      return allProducts.filter((p) => p.status === 'active' && p.quantity > 0 && (filters.game === 'all' || p.game === filters.game));
    }
  });

  const addToCartMutation = useMutation({
    mutationFn: async (/** @type {any} */ card) => {
      if (user?.email) {
        await backend.data.CartItem.create({
          card_id: card.id,
          card_name: card.name,
          card_image: card.image_url,
          price: card.price,
          quantity: 1,
          user_email: user.email
        });
        return;
      }

      addToGuestCart({
        card_id: card.id,
        card_name: card.name,
        card_image: card.image_url,
        price: card.price,
        quantity: 1
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
      toast.success('Added to cart');
    }
  });

  const handleAddCardToCart = (card, event) => {
    event?.preventDefault();
    event?.stopPropagation();
    if (!card) return;
    addToCartMutation.mutate(card);
  };

  const addToWishlistMutation = useMutation({
    mutationFn: (/** @type {any} */ card) => backend.data.Wishlist.create({
      user_email: user.email,
      product_id: card.id,
      product_name: card.name,
      product_image: card.image_url,
      price: card.price,
      product_type: 'card'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success('Added to wishlist');
    }
  });

  const triggerSearch = async (query, game, apiQuery = null, options = {}) => {
    if (!apiQuery && (!query || query.length < 2)) return;
    setSearchingCards(true);
    setShowCardResults(true);
    try {
      const searchGame = game || (filters.game === 'all' ? 'magic' : filters.game);
      const { results, meta } = await performShopCardSearch({
        query,
        game: searchGame,
        apiQuery,
        page: options.page || 0,
        limit: 36
      });

      const formattedResults = enrichSearchResultsWithInventory(results, cards, pokemonCards);
      setAdvancedSearchMeta(meta);

      setCardSearchResults(formattedResults);
    } catch (error) {
      console.error('Search failed:', error);
      setCardSearchResults([]);
    } finally {
      setSearchingCards(false);
    }
  };

  const searchCards = async (query) => {
    const game = filters.game === 'all' ? 'magic' : filters.game;
    await triggerSearch(query, game);
  };

  const submitAvailabilityRequest = async ({
    item,
    customerEmail: email,
    requestType,
    setName,
    cardNumber = null,
    rarity,
    wishlistProductType,
    wishlistPrice = null,
    onComplete
  }) => {
    if (!item) return;
    if (!isValidEmail(email)) {
      toast.error('Please enter a valid email address');
      return;
    }

    try {
      await backend.actions.invoke('sendProductRequest', {
        productName: item.name,
        setName,
        cardNumber,
        rarity,
        requestType,
        customerEmail: email
      });

      toast.success(
        `Thank you! Your request has been sent to our team. We will notify you at ${email} when this ${requestType} is available.`,
        { duration: 5000 }
      );

      if (user) {
        try {
          await backend.data.Wishlist.create({
            user_email: user.email,
            product_id: item.id,
            product_name: item.name,
            product_image: item.image_url,
            price: wishlistPrice ?? item.price ?? 0,
            product_type: wishlistProductType
          });
          queryClient.invalidateQueries({ queryKey: ['wishlist'] });
        } catch (wishlistError) {
          console.log(`${requestType} already in wishlist or error:`, wishlistError);
        }
      }

      setTimeout(() => {
        onComplete?.();
      }, 1500);
    } catch (error) {
      console.error('Request failed:', error);
      console.error('Error details:', error.response?.data || error.message);
      toast.error('Failed to send request: ' + (error.response?.data?.error || error.message));
    }
  };

  const searchBoosterBoxes = async (query) => {
    if (!query || query.length < 2) {
      setBoxSearchResults([]);
      setShowBoxResults(false);
      return;
    }

    setSearchingBoxes(true);
    setShowBoxResults(true);

    try {
      let formattedResults = [];
      const gameFilter = filters.game === 'all' ? 'pokemon' : filters.game;

      if (gameFilter === 'magic') {
        formattedResults = [];
      } else if (gameFilter === 'pokemon') {
        // Search Pokémon TCG API for Pokemon sets/booster boxes
        const response = await fetch(`https://api.pokemontcg.io/v2/sets?q=name:${encodeURIComponent(query)}`);
        const data = await response.json();

        if (data.data) {
          // Group unique sets
          const setMap = new Map();
          data.data.forEach((set) => {
            const setKey = set.name || 'Unknown';
            if (!setMap.has(setKey)) {
              const inStock = products.find((p) =>
              p.product_type === 'booster_box' &&
              p.set_name === set.name &&
              p.quantity > 0
              );

              setMap.set(setKey, {
                id: set.id,
                name: set.name || 'Unknown Set',
                set_code: set.id ? set.id.substring(0, 3).toUpperCase() : 'UNK',
                image_url: set.images?.logo,
                release_date: set.releaseDate || null,
                game: 'pokemon',
                inStock: !!inStock,
                stockProduct: inStock
              });
            }
          });
          formattedResults = Array.from(setMap.values());
        }
      } else if (gameFilter === 'yugioh') {
        const data = await searchYugiohSets(query, 200);
        if (data) {
          formattedResults = data.map((set) => {
            const inStock = products.find((p) =>
            p.product_type === 'booster_box' &&
            p.set_name === set.name &&
            p.quantity > 0
            );

            return {
              id: set.set_code,
              name: set.name,
              set_code: set.set_code,
              image_url: null,
              release_date: set.release_date || null,
              game: 'yugioh',
              inStock: !!inStock,
              stockProduct: inStock
            };
          });
        }
      }

      setBoxSearchResults(formattedResults);
    } catch (error) {
      console.error('Booster box search failed:', error);
      setBoxSearchResults([]);
    } finally {
      setSearchingBoxes(false);
    }
  };

  const handleBoxSearchChange = (e) => {
    const value = e.target.value;
    setBoxSearchQuery(value);

    if (boxSearchTimeoutRef.current) clearTimeout(boxSearchTimeoutRef.current);
    boxSearchTimeoutRef.current = setTimeout(() => searchBoosterBoxes(value), 500);
  };

  const handleBoxContactRequest = (box) => {
    setSelectedBoxForContact(box);
    setBoxCustomerEmail('');
  };

  const handleSendBoxContactRequest = async () => {
    await submitAvailabilityRequest({
      item: selectedBoxForContact,
      customerEmail: boxCustomerEmail,
      requestType: 'box',
      setName: selectedBoxForContact?.set_code,
      rarity: selectedBoxForContact?.game?.toUpperCase(),
      wishlistProductType: 'product',
      wishlistPrice: 0,
      onComplete: () => {
        setSelectedBoxForContact(null);
        setBoxCustomerEmail('');
      }
    });
  };

  const clearFilters = () => {
    if (advancedSearchOpen) {
      setCardSearchResults([]);
      setShowCardResults(false);
      setCardSearchPage(0);
      setAdvancedSearchMeta({ total: 0, page: 0, limit: 36, hasMore: false });
      setAdvancedSearchCollapsed(false);
      setSearchParams({
        ...buildFilterParams({
          ...filters,
          type: 'single_card',
          game: filters.game === 'all' ? 'magic' : filters.game,
          search: '',
          set: 'all',
          rarity: 'all',
          priceMin: '',
          priceMax: '',
          inStock: false,
          sort: 'newest'
        }),
        advancedSearch: '1'
      });
      return;
    }

    setSearchParams(buildFilterParams({
      ...filters,
      type: 'single_card',
      game: filters.game === 'all' ? 'magic' : filters.game,
      search: '',
      rarity: 'all',
      set: 'all',
      priceMin: '',
      priceMax: '',
      inStock: false,
      sort: 'newest',
      setType: 'all'
    }));
  };

  const totalAdvancedPages = Math.max(1, Math.ceil((advancedSearchMeta.total || 0) / (advancedSearchMeta.limit || 36)));

  const getVisiblePageNumbers = (currentPage, totalPages, maxVisible = 5) => {
    const safeTotal = Math.max(1, totalPages);
    if (safeTotal <= maxVisible) {
      return Array.from({ length: safeTotal }, (_, index) => index);
    }

    const halfWindow = Math.floor(maxVisible / 2);
    let start = Math.max(0, currentPage - halfWindow);
    let end = start + maxVisible - 1;

    if (end >= safeTotal) {
      end = safeTotal - 1;
      start = Math.max(0, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  };

  const renderPageNumberButtons = ({
    currentPage,
    totalPages,
    onPageChange,
    activeClassName,
    idleClassName
  }) => {
    const pageNumbers = getVisiblePageNumbers(currentPage, totalPages);
    const showLeadingFirst = pageNumbers[0] > 0;
    const showLeadingEllipsis = pageNumbers[0] > 1;
    const showTrailingEllipsis = pageNumbers[pageNumbers.length - 1] < totalPages - 2;
    const showTrailingLast = pageNumbers[pageNumbers.length - 1] < totalPages - 1;

    return (
      <div className="flex items-center gap-1">
        {showLeadingFirst && (
          <Button
            type="button"
            variant={currentPage === 0 ? 'default' : 'ghost'}
            size="sm"
            className={currentPage === 0 ? activeClassName : idleClassName}
            onClick={() => {
              window.scrollTo(0, 0);
              onPageChange(0);
            }}
          >
            1
          </Button>
        )}
        {showLeadingEllipsis && <span className="px-1 text-sm opacity-70">…</span>}
        {pageNumbers.map((page) => {
          const isActive = page === currentPage;
          return (
            <Button
              key={page}
              type="button"
              variant={isActive ? 'default' : 'ghost'}
              size="sm"
              className={isActive ? activeClassName : idleClassName}
              onClick={() => {
                window.scrollTo(0, 0);
                onPageChange(page);
              }}
            >
              {page + 1}
            </Button>
          );
        })}
        {showTrailingEllipsis && <span className="px-1 text-sm opacity-70">…</span>}
        {showTrailingLast && (
          <Button
            type="button"
            variant={currentPage === totalPages - 1 ? 'default' : 'ghost'}
            size="sm"
            className={currentPage === totalPages - 1 ? activeClassName : idleClassName}
            onClick={() => {
              window.scrollTo(0, 0);
              onPageChange(totalPages - 1);
            }}
          >
            {totalPages}
          </Button>
        )}
      </div>
    );
  };

  const renderAdvancedPagination = () => {
    if (!(advancedSearchOpen && advancedApiQuery) || totalAdvancedPages <= 1) {
      return null;
    }

    return (
      <div className="flex items-center justify-center gap-2 flex-1 min-w-[260px]">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-white hover:bg-gray-600"
          onClick={() => { window.scrollTo(0, 0); setCardSearchPage((prev) => Math.max(0, prev - 1)); }}
          disabled={cardSearchPage === 0}
        >
          Prev
        </Button>
        {renderPageNumberButtons({
          currentPage: cardSearchPage,
          totalPages: totalAdvancedPages,
          onPageChange: setCardSearchPage,
          activeClassName: 'h-7 min-w-7 bg-white text-gray-900 hover:bg-white',
          idleClassName: 'h-7 min-w-7 text-white hover:bg-gray-600'
        })}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-white hover:bg-gray-600"
          onClick={() => { window.scrollTo(0, 0); setCardSearchPage((prev) => Math.min(totalAdvancedPages - 1, prev + 1)); }}
          disabled={!advancedSearchMeta.hasMore}
        >
          Next
        </Button>
      </div>
    );
  };

  const updateFilters = (newFilters) => {
      setSearchParams(buildFilterParams(newFilters));
  };

  const submitSinglesSearch = () => {
    const query = singlesSearchDraft.trim();
    const game = filters.game === 'all' ? 'magic' : filters.game;
    updateFilters({
      ...filters,
      type: 'single_card',
      game,
      search: query,
      set: 'all',
      rarity: 'all'
    });
    setCardSearchPage(0);
    setShowCardResults(Boolean(query));
  };

  const showClearFilters = hasActiveFilters(filters);

  // Show card search when filtering for single cards
  const showCardSearch = filters.type === 'single_card';
  const showBoxSearch = filters.type === 'booster_box';

  // Fetch all MTG sets when booster box page loads
  useEffect(() => {
    if (!showBoxSearch || filters.game !== 'magic') {
      setAllMTGSets([]);
      setLoadingMTGSets(false);
      return;
    }

    if (allMTGSets.length === 0) {
      setLoadingMTGSets(true);

      const fetchSets = async () => {
        try {
          const setsResponse = await fetch('https://api.scryfall.com/sets');
          const setsData = await setsResponse.json();

          if (setsData.data) {
            // Filter for sets that would have booster boxes
            const boostedSets = setsData.data.
            filter((set) => set.set_type === 'expansion' || set.set_type === 'core' || set.set_type === 'draft_innovation').
            sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime()).
            slice(0, 50); // Get top 50 most recent sets

            const setsWithStock = boostedSets.map((set) => {
              const listedProduct = products.find((p) =>
              p.product_type === 'booster_box' &&
              p.set_name === set.name
              );

              // Construct TCGPlayer-style product image URL
              const boxImageUrl = `https://product-images.tcgplayer.com/fit-in/437x437/${set.code.toLowerCase()}-booster-box.jpg`;

              return {
                id: set.id,
                name: set.name,
                set_code: set.code.toUpperCase(),
                image_url: boxImageUrl,
                release_date: set.released_at,
                game: 'magic',
                inStock: Boolean(listedProduct && listedProduct.quantity > 0),
                stockProduct: listedProduct || null
              };
            });

            setAllMTGSets(setsWithStock);
          }
        } catch (error) {
          console.error('Failed to fetch MTG sets:', error);
        } finally {
          setLoadingMTGSets(false);
        }
      };

      fetchSets();
    }
  }, [showBoxSearch, products]);

  // Derive enriched search results by merging API results with inventory - runs whenever either changes
  const enrichedCardSearchResults = useMemo(() => {
    return enrichSearchResultsWithInventory(cardSearchResults, cards, pokemonCards)
      .sort((a, b) => (b.inStock ? 1 : 0) - (a.inStock ? 1 : 0));
  }, [cardSearchResults, cards, pokemonCards]);

  const groupedMagicSearchResults = useMemo(() => {
    if (filters.game !== 'magic' || enrichedCardSearchResults.length === 0) {
      return [];
    }

    if (enrichedCardSearchResults.every((card) => card.groupKey && Array.isArray(card.languageCodes))) {
      return enrichedCardSearchResults;
    }

    const groups = new Map();

    for (const card of enrichedCardSearchResults) {
      const groupKey = [
        card.oracle_id || card.name,
        card.set_code || card.set_name || 'UNK',
        card.card_number || ''
      ].join('::');

      const existing = groups.get(groupKey) || {
        key: groupKey,
        set_name: card.set_name,
        set_code: card.set_code,
        card_number: card.card_number,
        rarity: card.rarity,
        released_at: card.released_at,
        variants: []
      };

      existing.variants.push(card);
      groups.set(groupKey, existing);
    }

    return [...groups.values()]
      .map((group) => {
        const variants = [...group.variants].sort((a, b) => {
          const aEnglish = String(a.lang || '').toLowerCase() === 'en';
          const bEnglish = String(b.lang || '').toLowerCase() === 'en';
          if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
          if (a.inStock !== b.inStock) return a.inStock ? -1 : 1;
          return String(a.lang || '').localeCompare(String(b.lang || ''));
        });

        const primary = variants[0];
        const languageCodes = [...new Set(variants.map((variant) => String(variant.lang || '').toUpperCase()))];

        return {
          ...primary,
          groupKey: group.key,
          variants,
          languageCodes,
          variantCount: variants.length
        };
      })
      .sort((a, b) => {
        const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
        if (nameCompare !== 0) return nameCompare;
        const dateCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.set_name || '').localeCompare(String(b.set_name || ''));
      });
  }, [enrichedCardSearchResults, filters.game]);

  const activeCardSearchResults = useMemo(() => {
    return groupedMagicSearchResults.length > 0 ? groupedMagicSearchResults : enrichedCardSearchResults;
  }, [groupedMagicSearchResults, enrichedCardSearchResults]);

  // Get unique sets and rarities for filter dropdowns
  // When searching, show only sets from search results; otherwise show all sets from inventory
  const uniqueSets = filters.search && activeCardSearchResults.length > 0 ?
  [...new Set(activeCardSearchResults.map((c) => c.set_name))].sort() :
  [...new Set(cards.filter((c) => c.status === 'active').map((c) => c.set_name))].sort();
  const uniqueRarities = filters.search && activeCardSearchResults.length > 0 ?
  [...new Set(activeCardSearchResults.map((c) => c.rarity))].filter(Boolean).sort() :
  [...new Set(cards.map((c) => c.rarity))].filter(Boolean).sort();
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (filters.inStock && c.quantity === 0) return false;
      if (filters.rarity !== 'all' && c.rarity !== filters.rarity) return false;
      if (filters.set !== 'all' && c.set_name !== filters.set) return false;
      if (filters.search && !c.name?.toLowerCase().includes(filters.search.toLowerCase())) return false;

      const price = c.price || 0;
      if (filters.priceMin && price < parseFloat(filters.priceMin)) return false;
      if (filters.priceMax && price > parseFloat(filters.priceMax)) return false;

      return true;
    }).sort((a, b) => {
      if (filters.sort === 'price-low') return (a.price || 0) - (b.price || 0);
      if (filters.sort === 'price-high') return (b.price || 0) - (a.price || 0);
      if (filters.sort === 'name') return a.name.localeCompare(b.name);
      return (b.price || 0) - (a.price || 0); // default: highest price first
    });
  }, [cards, filters]);

  // Game browse: cards filtered by game + local search, sorted by price desc
  const gameBrowseCards = useMemo(() => {
    if (filters.game === 'all') return [];
    return cards.
    filter((c) => c.status === 'active' && c.quantity > 0 && (
    !gameBrowseSearch || c.name?.toLowerCase().includes(gameBrowseSearch.toLowerCase()))).
    sort((a, b) => (b.price || 0) - (a.price || 0));
  }, [cards, filters.game, gameBrowseSearch]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (filters.type !== 'all') {
        if (filters.type === 'merch' && !p.product_type.startsWith('merch_')) return false;
        if (filters.type !== 'merch' && p.product_type !== filters.type) return false;
      }
      if (filters.search && !p.name?.toLowerCase().includes(filters.search.toLowerCase())) return false;
      return true;
    });
  }, [products, filters]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-8">
        <div className="mb-5 rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Main Phase Market Shop</p>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950">Shop singles, sealed, and table gear.</h1>
                <p className="mt-1 text-sm text-slate-600">Use the top search for exact cards, or pick a lane below.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={filters.type === 'single_card' ? 'default' : 'outline'}
                className={filters.type === 'single_card' ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}
                onClick={() => updateFilters({ ...filters, type: 'single_card', search: filters.search, game: filters.game === 'all' ? 'magic' : filters.game })}
              >
                <Layers className="mr-2 h-4 w-4" />
                Singles
              </Button>
              <Button
                type="button"
                variant={filters.type === 'booster_box' ? 'default' : 'outline'}
                className={filters.type === 'booster_box' ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}
                onClick={() => updateFilters({ ...filters, type: 'booster_box', search: '', game: filters.game === 'all' ? 'magic' : filters.game })}
              >
                <Box className="mr-2 h-4 w-4" />
                Sealed
              </Button>
              <Button
                type="button"
                variant={filters.type === 'starter_deck' ? 'default' : 'outline'}
                className={filters.type === 'starter_deck' ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}
                onClick={() => updateFilters({ ...filters, type: 'starter_deck', search: '' })}
              >
                <Package className="mr-2 h-4 w-4" />
                Starter Decks
              </Button>
              <Button
                type="button"
                variant={filters.type === 'dice' ? 'default' : 'outline'}
                className={filters.type === 'dice' ? 'bg-slate-950 text-white hover:bg-slate-800' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}
                onClick={() => updateFilters({ ...filters, type: 'dice', search: '' })}
              >
                <Dice1 className="mr-2 h-4 w-4" />
                Accessories
              </Button>
            </div>
          </div>
        </div>

        {filters.type === 'single_card' && !advancedSearchOpen &&
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submitSinglesSearch();
          }}
          className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                <Input
                value={singlesSearchDraft}
                onChange={(event) => setSinglesSearchDraft(event.target.value)}
                placeholder="Search singles by card name..."
                className="h-12 pl-11 text-base" />
              </div>
              <Button type="submit" className="h-12 bg-slate-950 px-6 text-white hover:bg-slate-800">
                Search Singles
              </Button>
              <Button
              type="button"
              variant="outline"
              className="h-12 border-slate-300 px-6"
              onClick={() => {
                setSearchParams({
                  ...buildFilterParams({
                    ...filters,
                    type: 'single_card',
                    game: filters.game === 'all' ? 'magic' : filters.game,
                    search: '',
                    set: 'all',
                    rarity: 'all'
                  }),
                  advancedSearch: '1'
                });
              }}>
                Advanced Search
              </Button>
            </div>
          </form>
        }

        {/* Advanced Search Panel */}
        {filters.type === 'single_card' && advancedSearchOpen &&
        <div className="mb-4">
            {advancedApiQuery &&
          <div className="mb-3 flex items-center justify-between rounded-lg border border-gray-300 bg-white px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">Advanced Search Results</p>
                  <p className="text-xs text-gray-500">
                    {filters.search || 'Advanced Search'}
                    {advancedSearchMeta.total > 0 ? ` • ${advancedSearchMeta.total} matches` : ''}
                  </p>
                </div>
                <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-gray-300"
              onClick={() => setAdvancedSearchCollapsed((prev) => !prev)}>
                  {advancedSearchCollapsed ?
                <>
                      <ChevronDown className="w-4 h-4 mr-1" />
                      Show Filters
                    </> :
                <>
                      <ChevronRight className="w-4 h-4 mr-1" />
                      Hide Filters
                    </>}
                </Button>
              </div>
          }
            <div className={advancedSearchCollapsed && advancedApiQuery ? 'hidden' : ''}>
              <AdvancedSearch
              initialGame={filters.game === 'all' ? 'magic' : filters.game}
              onSearch={(apiQuery, displayName, gameOverride) => {
                const searchGame = gameOverride || (filters.game === 'all' ? 'magic' : filters.game);
                setCardSearchQuery(displayName || apiQuery);
                setCardSearchPage(0);
                setCardSearchResults([]); // clear old results before new search
                setAdvancedSearchMeta({ total: 0, page: 0, limit: 36, hasMore: false });
                setSearchParams({
                ...buildFilterParams({
                  ...filters,
                  type: 'single_card',
                  game: searchGame,
                  search: displayName || 'Advanced Search',
                  set: 'all'
                }),
                advancedSearch: '1',
                aq: apiQuery
                });
                triggerSearch(displayName || apiQuery, searchGame, apiQuery, { page: 0 });
                setShowCardResults(true);
                setAdvancedSearchCollapsed(true);
                window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
              }} />
            </div>
          </div>
        }

        {filters.type === 'starter_deck' &&
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1.25fr_0.9fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Starter Decks</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Starter and prebuilt decks.</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  This section will show real starter deck inventory as it is added.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Commander Precons', 'Out-of-box Commander decks when stocked.'],
                    ['Pokemon Battle Decks', 'Battle-ready Pokemon decks when stocked.'],
                    ['Lorcana Starter Decks', 'Lorcana starters when stocked.'],
                    ['Custom Built Decks', 'Built-to-order decks can return after launch.']
                  ].map(([title, copy]) => (
                    <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="font-semibold text-slate-900">{title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-700">Built For You</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">Want a deck built and shipped?</h3>
                <p className="mt-2 text-sm text-slate-700">
                  Custom deck requests are hidden for launch until the live order flow is ready.
                </p>
              </div>
            </div>
          </div>
        }

        {filters.type === 'dice' &&
        <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="grid gap-5 lg:grid-cols-[1.2fr_0.9fr]">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Accessories</p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Mats, sleeves, dice, and table gear.</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  Accessories will become clickable once live inventory is connected.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ['Dice & Counters', 'Spin-downs, metal counters, life trackers, and token markers.'],
                    ['Playmats', 'Clean table presence for Commander nights and tournament play.'],
                    ['Sleeves & Deck Boxes', 'Protection upgrades people buy alongside singles.'],
                    ['Binders & Storage', 'Long-boxes, binders, pages, and collection supplies.']
                  ].map(([title, copy]) => (
                    <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h3 className="font-semibold text-slate-900">{title}</h3>
                      <p className="mt-1 text-sm text-slate-600">{copy}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-sky-700">Easy Upsells</p>
                <h3 className="mt-2 text-xl font-bold text-slate-950">This is where basket-building happens.</h3>
                <p className="mt-2 text-sm text-slate-700">Hidden from checkout until real inventory is attached.</p>
              </div>
            </div>
          </div>
        }

        {/* Top Filter Bar - Desktop only, full filters */}
        {filters.type === 'single_card' &&
        <div className="bg-gray-700 border border-gray-600 rounded-lg sticky top-16 z-40 py-2 mb-6 hidden md:block">
             <div className="px-4 flex items-center gap-2">
               <span className="text-xs font-semibold text-white px-2 uppercase tracking-wide">
                  {filters.game === 'pokemon' ? 'Pokémon' : filters.game === 'yugioh' ? 'Yu-Gi-Oh!' : filters.game === 'lorcana' ? 'Disney Lorcana' : filters.game === 'onepiece' ? 'One Piece TCG' : filters.game === 'flesh_and_blood' ? 'Flesh & Blood' : filters.game === 'starwars' ? 'Star Wars Unlimited' : filters.game === 'all' ? 'All Games' : 'Magic: The Gathering'}
               </span>

               <Select value={filters.sort} onValueChange={(v) => updateFilters({ ...filters, sort: v })}>
                  <SelectTrigger className="w-[160px] h-7 bg-gray-600 border-gray-500 text-white text-xs">
                   <SelectValue />
                 </SelectTrigger>
                 <SelectContent>
                   <SelectItem value="newest">Newest</SelectItem>
                   <SelectItem value="price-low">Price: Low to High</SelectItem>
                   <SelectItem value="price-high">Price: High to Low</SelectItem>
                   <SelectItem value="name">Name (A-Z)</SelectItem>
                 </SelectContent>
               </Select>

               {uniqueRarities.length > 0 &&
            <Select value={filters.rarity} onValueChange={(v) => updateFilters({ ...filters, rarity: v })}>
                   


                   <SelectContent>
                     <SelectItem value="all">All Rarities</SelectItem>
                     {uniqueRarities.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                   </SelectContent>
                 </Select>
            }

               {uniqueSets.length > 0 &&
            <Select value={filters.set} onValueChange={(v) => updateFilters({ ...filters, set: v })}>
                    <SelectTrigger className="w-[160px] h-7 bg-gray-600 border-gray-500 text-white text-xs">
                     <SelectValue placeholder="Set" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="all">All Sets</SelectItem>
                     {uniqueSets.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                   </SelectContent>
                 </Select>
            }

               {advancedSearchOpen && advancedApiQuery && renderAdvancedPagination()}
               {showClearFilters &&
               <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs hover:bg-gray-600 text-white">
                      <X className="w-3 h-3 mr-1" />
                      Clear Results
                    </Button>
               }
                </div>
             </div>
          }

        {/* Card Search Results Grid */}
        {filters.type === 'single_card' && activeCardSearchResults.length > 0 &&
        (() => {
          const filteredResults = activeCardSearchResults.filter((card) => filters.set === 'all' || card.set_name === filters.set);
          const pagedResults = advancedSearchOpen && advancedApiQuery ?
          filteredResults :
          filteredResults.slice(cardSearchPage * CARDS_PER_PAGE, (cardSearchPage + 1) * CARDS_PER_PAGE);
          return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-3">
            {pagedResults.map((result, idx) => {
              const gridImageUrl = getResultGridImageUrl(result);
              const previewImageUrl = getResultPreviewImageUrl(result);

              return (
          <div
            key={`${result.id}-${idx}`}
            onClick={() => {
              if (groupedMagicSearchResults.length > 0 && result.oracle_id) {
                openMagicCardDetail(result);
                return;
              }

              if (result.game === 'pokemon' && result.id) {
                openPokemonCardDetail(result);
                return;
              }

              if (result.game === 'yugioh' && result.id) {
                openYugiohCardDetail(result);
                return;
              }

              if (result.game === 'lorcana' && result.id) {
                openLorcanaCardDetail(result);
                return;
              }

              if (result.game === 'onepiece' && result.id) {
                openOnePieceCardDetail(result);
                return;
              }

              if (result.game === 'flesh_and_blood' && result.id) {
                openFabCardDetail(result);
                return;
              }

              if (result.game === 'starwars' && result.id) {
                openStarWarsCardDetail(result);
              }
            }}
            onMouseEnter={() => handleCardImagePreviewEnter(previewImageUrl)}
            onMouseLeave={handleCardImagePreviewLeave}
            className={`group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 ${(groupedMagicSearchResults.length > 0 && result.oracle_id) || ((result.game === 'pokemon' || result.game === 'yugioh' || result.game === 'lorcana' || result.game === 'onepiece' || result.game === 'flesh_and_blood' || result.game === 'starwars') && result.id) ? 'cursor-pointer' : ''}`}>

                <div className="aspect-square bg-gray-100 relative overflow-hidden">
                    {gridImageUrl ?
                <img
                  src={gridImageUrl}
                  alt={result.name}
                  className="w-full h-full object-contain p-2"
                  loading={idx < 8 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(e) => handleResultImageError(e, result, gridImageUrl)} /> : null}

              <div data-image-fallback className={`${gridImageUrl ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-gray-400`}>No Image</div>
                  {result.inStock && <Badge className="absolute top-2 right-2 bg-green-600 text-white">In Stock</Badge>}
                </div>
                <div className="p-3">
                  <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{result.name}</h3>
                  {result.set_name && <p className="text-xs text-gray-500 mt-1">{result.set_name}</p>}
                  {Array.isArray(result.languageCodes) && result.languageCodes.length > 0 &&
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {result.languageCodes[0]}
                      </Badge>
                      {result.languageCodes.length > 1 &&
                    <span className="text-[11px] text-gray-500">
                          +{result.languageCodes.length - 1} more
                        </span>
                    }
                    </div>
                  }
                  {result.variantCount > 1 &&
                  <p className="text-[11px] text-gray-400 mt-1">
                    {result.variantCount} language variants
                  </p>
                  }
                  {result.rarity && <p className="text-xs text-gray-400 mt-0.5">{result.rarity}</p>}
                  <div className="mt-3">
                    {result.stockCard ?
                <>
                        <p className="text-lg font-bold text-blue-600">${result.stockCard.price?.toFixed(2)}</p>
                        <Button
                    onClick={(event) => handleAddCardToCart(result.stockCard, event)}
                    size="sm"
                    className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">

                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Add to Cart
                        </Button>
                      </> :

                <>
                        {result.price != null &&
                  <p className="text-sm text-gray-500 mb-1">Market: <span className="font-semibold text-gray-700">${result.price.toFixed(2)}</span></p>
                  }
                      </>
                }
                  </div>
                </div>
              </div>);
            })}
          </div>
          );
        })()
        }

        {filters.type === 'single_card' && showCardResults && !_searchingCards && activeCardSearchResults.length === 0 &&
        <div className="mt-6 p-8 text-center border rounded-lg bg-white">
            <p className="text-gray-700 font-medium">No cards matched your current search.</p>
            <p className="text-sm text-gray-500 mt-1">Try removing a filter or broadening the search.</p>
          </div>
        }

        {/* Pagination */}
        {filters.type === 'single_card' && activeCardSearchResults.length > 0 &&
        (() => {
          if (advancedSearchOpen && advancedApiQuery) {
            const totalPages = Math.max(1, Math.ceil((advancedSearchMeta.total || 0) / (advancedSearchMeta.limit || 36)));
            return totalPages > 1 ?
            <div className="flex items-center justify-center gap-3 mt-8 pt-6 border-t flex-wrap">
                <Button
              variant="outline"
              size="sm"
              onClick={() => {window.scrollTo(0, 0);setCardSearchPage((prev) => Math.max(0, prev - 1));}}
              disabled={cardSearchPage === 0}>
                  Prev
                </Button>
                {renderPageNumberButtons({
                currentPage: cardSearchPage,
                totalPages,
                onPageChange: setCardSearchPage,
                activeClassName: 'h-9 min-w-9 bg-blue-600 text-white hover:bg-blue-600',
                idleClassName: 'h-9 min-w-9'
              })}
                <Button
              variant="outline"
              size="sm"
              onClick={() => {window.scrollTo(0, 0);setCardSearchPage((prev) => Math.min(totalPages - 1, prev + 1));}}
              disabled={!advancedSearchMeta.hasMore}>
                  Next
                </Button>
              </div> :
            null;
          }

          const filteredResults = activeCardSearchResults.filter((card) => filters.set === 'all' || card.set_name === filters.set);
          return filteredResults.length > CARDS_PER_PAGE ?
          <div className="flex items-center justify-center gap-1 mt-8 pt-6 border-t flex-wrap">
                <Button
              variant="outline"
              size="sm"
              onClick={() => {window.scrollTo(0, 0);setCardSearchPage((prev) => Math.max(0, prev - 1));}}
              disabled={cardSearchPage === 0}>

                  Previous
                </Button>
                {Array.from({ length: Math.ceil(filteredResults.length / CARDS_PER_PAGE) }, (_, i) => i).map((page) =>
            <Button
              key={page}
              variant={cardSearchPage === page ? 'default' : 'outline'}
              size="sm"
              className={cardSearchPage === page ? 'bg-blue-600 text-white' : ''}
              onClick={() => {window.scrollTo(0, 0);setCardSearchPage(page);}}>

                    {page + 1}
                  </Button>
            )}
                <Button
              variant="outline"
              size="sm"
              onClick={() => {window.scrollTo(0, 0);setCardSearchPage((p) => p + 1);}}
              disabled={(cardSearchPage + 1) * CARDS_PER_PAGE >= filteredResults.length}>

                  Next
                </Button>
              </div> :
          null;
        })()
        }

        {/* Hover Card Preview */}
        {hoveredCardImage &&
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="bg-white rounded-lg shadow-2xl p-3 max-w-xs pointer-events-none border-4 border-blue-500">
              <img
              src={hoveredCardImage}
              alt="Card preview"
              className="w-full h-auto rounded-lg" />

            </div>
          </div>
        }

        {/* Booster Box Search Section */}
        {showBoxSearch &&
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Browse sealed product</h2>
            <p className="text-sm text-gray-500 mb-4">
              Search sets from {filters.game === 'pokemon' ? 'Pokémon TCG' : filters.game === 'yugioh' ? 'Yu-Gi-Oh!' : filters.game === 'lorcana' ? 'Disney Lorcana' : filters.game === 'onepiece' ? 'One Piece TCG' : filters.game === 'flesh_and_blood' ? 'Flesh & Blood' : filters.game === 'starwars' ? 'Star Wars Unlimited' : 'available games'} to see availability
            </p>
            
            {filters.game === 'magic' &&
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 mb-5">
                {allMTGSets.map((set) =>
            <div key={set.id} className="group overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg">
                    <div className="relative aspect-square overflow-hidden bg-slate-100">
                      <img
                  src={set.image_url}
                  alt={`${set.name} Booster Box`}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    const image = /** @type {HTMLImageElement} */ (e.currentTarget);
                    image.style.display = 'none';
                    const fallback = image.nextElementSibling;
                    if (fallback instanceof HTMLElement) {
                      fallback.style.display = 'flex';
                    }
                  }} />
                      <div className="hidden absolute inset-0 flex-col items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 p-4">
                        <Box className="mb-2 h-14 w-14 text-slate-500" />
                        <p className="text-center text-xs font-semibold text-slate-700">Booster Box</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <h4 className="line-clamp-2 text-sm font-semibold text-slate-950">{set.name}</h4>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{set.set_code}</span>
                        {set.release_date && <span>{new Date(set.release_date).getFullYear()}</span>}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                            {set.stockProduct?.price != null ? 'Price' : 'Status'}
                          </p>
                          <p className={`text-lg font-bold ${set.stockProduct?.price != null ? 'text-slate-950' : 'text-slate-500'}`}>
                            {set.stockProduct?.price != null ? `$${set.stockProduct.price.toFixed(2)}` : 'Not in stock'}
                          </p>
                        </div>
                        <Badge className={set.inStock ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}>
                          {set.inStock ? `${set.stockProduct?.quantity || 0} in stock` : 'None in stock'}
                        </Badge>
                      </div>
                    </div>
                  </div>
            )}
              </div>
            }

            {filters.game !== 'magic' &&
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
              value={boxSearchQuery}
              onChange={handleBoxSearchChange}
              placeholder="Search for a set (e.g., Bloomburrow, Twilight Masquerade)..."
              className="pl-10 pr-10 h-12 text-lg"
              onFocus={() => boxSearchResults.length > 0 && setShowBoxResults(true)} />

              {searchingBoxes &&
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 animate-spin text-blue-500" />
            }
              {!searchingBoxes && boxSearchResults.length > 0 &&
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            }
            </div>
            }

            {/* Box Image Preview on Hover */}
            {hoveredBoxImage &&
          <div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
                <img
              src={hoveredBoxImage}
              alt="Box preview"
              className="w-80 h-auto rounded-lg shadow-2xl border-4 border-white" />

              </div>
          }

            {/* Booster Box Search Results */}
            {/* Booster Box Search Results */}
            {showBoxResults && boxSearchResults.length > 0 &&
          <div className="mt-4 border rounded-lg bg-white shadow-lg max-h-[600px] overflow-hidden">
                <div className="p-3 border-b bg-gray-50">
                  <p className="text-sm font-medium text-gray-700">
                    Found {boxSearchResults.length} set{boxSearchResults.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <ScrollArea className="h-[500px]">
                  <div className="p-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {boxSearchResults.map((result, idx) =>
                <div
                  key={`${result.id}-${idx}`}
                  className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow">

                        <div className="w-full h-48 bg-gray-100 relative">
                          <img
                      src={result.image_url}
                      alt={`${result.name} Booster Box`}
                      className="w-full h-full object-cover cursor-pointer"
                      onMouseEnter={() => handleBoxImagePreviewEnter(result.image_url)}
                      onMouseLeave={handleBoxImagePreviewLeave}
                      onError={(e) => {
                        const image = /** @type {HTMLImageElement} */ (e.currentTarget);
                        image.style.display = 'none';
                        const fallback = image.nextElementSibling;
                        if (fallback instanceof HTMLElement) {
                          fallback.style.display = 'flex';
                        }
                      }} />

                          <div className="hidden absolute inset-0 bg-gradient-to-br from-purple-100 to-blue-100 flex-col items-center justify-center p-3">
                            <Box className="w-12 h-12 text-blue-600 mb-2" />
                            <p className="text-xs font-semibold text-gray-700 text-center">
                              Booster Box
                            </p>
                          </div>
                        </div>
                        <div className="p-4">
                        <h4 className="font-semibold text-gray-900 text-sm mb-2">
                          {result.name}
                        </h4>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-gray-200 px-2 py-0.5 rounded">
                            {result.set_code}
                          </span>
                          {result.release_date &&
                      <span className="text-xs text-gray-500">
                              {new Date(result.release_date).getFullYear()}
                            </span>
                      }
                        </div>
                        
                        <div className="mt-3">
                          {result.inStock ?
                      <div className="space-y-1">
                              <Badge className="bg-green-600 text-white">In Stock</Badge>
                              <p className="text-sm text-gray-600">
                                ${result.stockProduct.price.toFixed(2)} • {result.stockProduct.quantity} available
                              </p>
                            </div> :

                      <div className="space-y-2">
                              <Badge variant="secondary" className="bg-red-100 text-red-700">
                                Out of Stock
                              </Badge>
                              <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleBoxContactRequest(result)}
                          className="w-full">

                                <Mail className="w-4 h-4 mr-2" />
                                Request This Box
                              </Button>
                            </div>
                      }
                        </div>
                        </div>
                      </div>
                )}
                  </div>
                </ScrollArea>
              </div>
          }

            {showBoxResults && !searchingBoxes && boxSearchQuery && boxSearchResults.length === 0 &&
          <div className="mt-4 p-8 text-center border rounded-lg bg-gray-50">
                <p className="text-gray-500">No sets found for "{boxSearchQuery}"</p>
                <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
              </div>
          }
          </div>
        }




        {/* Game Browse Grid - when a game is selected with no specific product type filter */}
        {filters.game !== 'all' && filters.game !== 'magic' && filters.type === 'all' &&
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
            <div className="flex flex-col items-center gap-3 mb-6">
              <div className="text-center">
                <h2 className="text-lg font-semibold text-gray-900">
                  {GAME_OPTIONS.find((g) => g.value === filters.game)?.label || filters.game} Cards
                </h2>
                <p className="text-sm text-gray-500 mt-1">{gameBrowseCards.length} cards in stock, sorted by price</p>
              </div>
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                value={gameBrowseSearch}
                onChange={(e) => {setGameBrowseSearch(e.target.value);setGameBrowsePage(0);}}
                placeholder="Search by card name..."
                className="pl-10" />

              </div>
            </div>

            {cardsLoading ?
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...Array(10)].map((_, i) =>
            <div key={i} className="bg-white rounded-lg overflow-hidden border border-gray-200">
                    <Skeleton className="aspect-square bg-gray-100" />
                    <div className="p-3 space-y-2">
                      <Skeleton className="h-4 bg-gray-100 w-3/4" />
                      <Skeleton className="h-3 bg-gray-100 w-1/2" />
                      <Skeleton className="h-6 bg-gray-100 w-1/3" />
                    </div>
                  </div>
            )}
              </div> :
          gameBrowseCards.length > 0 ?
          <>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {gameBrowseCards.slice(gameBrowsePage * GAME_BROWSE_PER_PAGE, (gameBrowsePage + 1) * GAME_BROWSE_PER_PAGE).map((card) =>
              <div
                key={card.id}
                onMouseEnter={() => handleCardPreviewEnter(card)}
                onMouseLeave={handleCardPreviewLeave}
                className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200">

                      <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        {card.image_url ?
                  <img src={card.image_url} alt={card.name} className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" /> :

                  <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                  }
                      </div>
                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 text-sm line-clamp-2">{card.name}</h3>
                        {card.set_name && <p className="text-xs text-gray-500 mt-1 line-clamp-1">{card.set_name}</p>}
                        <div className="flex items-center justify-between mt-2 mb-2">
                          <span className="text-lg font-bold text-blue-600">${card.price?.toFixed(2)}</span>
                          <span className="text-xs text-gray-500">{card.quantity} in stock</span>
                        </div>
                        <Button
                    onClick={(event) => handleAddCardToCart(card, event)}
                    size="sm"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">

                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Add to Cart
                        </Button>
                      </div>
                    </div>
              )}
                </div>

                {/* Pagination */}
                {gameBrowseCards.length > GAME_BROWSE_PER_PAGE &&
            <div className="flex items-center justify-center gap-2 mt-8 pt-6 border-t flex-wrap">
                    <Button
                variant="outline" size="sm"
                onClick={() => {window.scrollTo(0, 0);setGameBrowsePage((p) => Math.max(0, p - 1));}}
                disabled={gameBrowsePage === 0}>
                Previous</Button>
                    {Array.from({ length: Math.ceil(gameBrowseCards.length / GAME_BROWSE_PER_PAGE) }, (_, i) => i).map((page) =>
              <Button
                key={page}
                variant={gameBrowsePage === page ? 'default' : 'outline'}
                size="sm"
                className={gameBrowsePage === page ? 'bg-blue-600 text-white' : ''}
                onClick={() => {window.scrollTo(0, 0);setGameBrowsePage(page);}}>
                {page + 1}</Button>
              )}
                    <Button
                variant="outline" size="sm"
                onClick={() => {window.scrollTo(0, 0);setGameBrowsePage((p) => p + 1);}}
                disabled={(gameBrowsePage + 1) * GAME_BROWSE_PER_PAGE >= gameBrowseCards.length}>
                Next</Button>
                  </div>
            }
              </> :

          <div className="text-center py-12">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">{gameBrowseSearch ? `No cards found for "${gameBrowseSearch}"` : 'No cards in stock for this game'}</p>
              </div>
          }
          </div>
        }

        {/* Products Grid - For non-booster items - hide when card search results are showing, game browse is active, or advanced search is open */}
         {!showBoxSearch && !(showCardSearch && showCardResults && enrichedCardSearchResults.length > 0) && !(filters.game !== 'all' && filters.type === 'all') && !advancedSearchOpen &&
        <div className="bg-white rounded-lg border border-gray-200 p-4">
             {cardsLoading || productsLoading ?
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {[...Array(10)].map((_, i) =>
            <div key={i} className="bg-white rounded-lg overflow-hidden border border-gray-200">
                     <Skeleton className="aspect-square bg-gray-100" />
                     <div className="p-3 space-y-2">
                       <Skeleton className="h-4 bg-gray-100 w-3/4" />
                       <Skeleton className="h-3 bg-gray-100 w-1/2" />
                       <Skeleton className="h-6 bg-gray-100 w-1/3" />
                     </div>
                   </div>
            )}
               </div> :
          filters.type === 'single_card' && !filters.search ?
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {/* Show in-stock singles instead of turning the shop into a price flex. */}
                 {cards.
             filter((c) => c.status === 'active' && c.quantity > 0 && (filters.game === 'all' || c.game === filters.game)).
            slice(0, 20).
            map((card) =>
            <div
              key={card.id}
              onMouseEnter={() => handleCardPreviewEnter(card)}
              onMouseLeave={handleCardPreviewLeave}
              className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 relative">

                      <div className="aspect-square bg-gray-100 relative overflow-hidden">
                        {card.image_url ?
                <img
                  src={card.image_url}
                  alt={card.name}
                  className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" /> :


                <div className="w-full h-full flex items-center justify-center text-gray-400">
                            No Image
                          </div>
                }
                      </div>

                      <div className="p-3">
                        <h3 className="font-medium text-gray-900 text-sm line-clamp-2">
                          {card.name}
                        </h3>
                        {card.set_name &&
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{card.set_name}</p>
                }
                        <div className="flex items-center justify-between mt-2 mb-2">
                          <span className="text-lg font-bold text-blue-600">
                            ${card.price?.toFixed(2)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {card.quantity} in stock
                          </span>
                        </div>
                        <div className="flex gap-1">
                          <Button
                    onClick={(e) => {
                      e.preventDefault();
                      addToCartMutation.mutate(card);
                    }}
                    disabled={card.quantity === 0}
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">

                            <ShoppingCart className="w-3 h-3 mr-1" />
                            Cart
                          </Button>
                          <Button
                    onClick={(e) => {
                      e.preventDefault();
                      addToWishlistMutation.mutate(card);
                    }}
                    variant="outline"
                    size="sm"
                    className="px-2 h-8 border-red-500 text-red-500 hover:bg-red-50">

                            <Heart className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
            )}
              </div> :
          filteredCards.length > 0 ?
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* Show Cards when game is filtered */}
                {filteredCards.map((card) =>
            <div
              key={card.id}
              className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 relative">

                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                      {card.image_url ?
                <img
                  src={card.image_url}
                  alt={card.name}
                  className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" /> :


                <div className="w-full h-full flex items-center justify-center text-gray-400">
                          No Image
                        </div>
                }
                    </div>

                    <div className="p-3">
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-2">
                        {card.name}
                      </h3>
                      {card.set_name &&
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{card.set_name}</p>
                }
                      <div className="flex items-center justify-between mt-2 mb-2">
                        <span className="text-lg font-bold text-blue-600">
                          ${card.price?.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {card.quantity} in stock
                        </span>
                      </div>
                      <div className="flex gap-1">
                          <Button
                    onClick={(event) => handleAddCardToCart(card, event)}
                    disabled={card.quantity === 0}
                    size="sm"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs h-8">

                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Cart
                        </Button>
                      </div>
                    </div>
                  </div>
            )}
              </div> :
          filteredProducts.length > 0 ?
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {/* Show Products */}
                {filteredProducts.map((product) =>
            <div key={product.id} className="group bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg hover:border-blue-300 transition-all duration-200 relative">
                    <div className="aspect-square bg-gray-100 relative overflow-hidden">
                      {product.image_url ?
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover p-2 group-hover:scale-105 transition-transform duration-300" /> :


                <div className="w-full h-full flex items-center justify-center text-gray-400">
                          No Image
                        </div>
                }
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                        <Button size="icon" variant="secondary" className="h-8 w-8 bg-white" onClick={() => setQuickViewItem(product)}>
                          <ShoppingCart className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="p-3">
                      <h3 className="font-medium text-gray-900 text-sm line-clamp-2">
                        {product.name}
                      </h3>
                      {product.description &&
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{product.description}</p>
                }
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-lg font-bold text-blue-600">
                          ${product.price?.toFixed(2)}
                        </span>
                        <span className="text-xs text-gray-500">
                          {product.quantity} in stock
                        </span>
                      </div>
                    </div>
                  </div>
            )}
              </div> :

          !filters.search &&
          <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-500">
                    {filters.type === 'starter_deck' ? 'No starter decks are live in inventory yet' :
                    filters.type === 'dice' ? 'No accessories are live in inventory yet' :
                    'No products currently in stock'}
                  </p>
                  <p className="text-sm text-gray-400 mt-1">
                    {filters.type === 'single_card' ? 'Use the search above to find specific cards' :
                    filters.type === 'starter_deck' ? 'Use the custom deck section above while we build out the live shelf.' :
                    filters.type === 'dice' ? 'Use this lane as the future home for mats, sleeves, dice, and table gear.' :
                    'Check back soon for new inventory!'}
                  </p>
                </div>

          }
          </div>
        }
      </div>

      {/* Contact Request Dialog - Booster Boxes */}
      <Dialog open={!!selectedBoxForContact} onOpenChange={() => setSelectedBoxForContact(null)}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Request Booster Box</DialogTitle>
            <DialogDescription>
              Enter your email and we'll notify you when this box is available.
            </DialogDescription>
          </DialogHeader>
          {selectedBoxForContact &&
          <div className="space-y-4">
              <div className="flex gap-4">
                {selectedBoxForContact.image_url &&
              <img
                src={selectedBoxForContact.image_url}
                alt={selectedBoxForContact.name}
                className="w-32 h-auto rounded shadow" />

              }
                <div>
                  <h4 className="font-semibold text-gray-900">{selectedBoxForContact.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">
                    {selectedBoxForContact.set_code}
                  </p>
                  <p className="text-xs text-gray-500 mt-1 uppercase">
                    {selectedBoxForContact.game}
                  </p>
                </div>
              </div>
              <div>
                <label htmlFor="box-request-email" className="text-sm font-medium text-gray-700 mb-2 block">
                  Your Email Address
                </label>
                <Input
                id="box-request-email"
                name="box-request-email"
                type="email"
                placeholder="your.email@example.com"
                value={boxCustomerEmail}
                onChange={(e) => setBoxCustomerEmail(e.target.value)}
                className="w-full" />

              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setSelectedBoxForContact(null)}>
                  Cancel
                </Button>
                <Button onClick={handleSendBoxContactRequest} className="bg-blue-600 hover:bg-blue-700">
                  Send Request
                </Button>
              </div>
            </div>
          }
        </DialogContent>
      </Dialog>

      {/* Hover Card Preview */}
      {hoveredCard && getCardImageUrl(hoveredCard) &&
      <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-lg shadow-2xl p-3 max-w-xs pointer-events-none border-4 border-blue-500">
            <img
            src={getCardImageUrl(hoveredCard)}
            alt={hoveredCard.name}
            onError={(event) => handleCardImageError(event, hoveredCard)}
            className="w-full h-auto rounded-lg mb-2" />

            <h3 className="font-bold text-sm text-gray-900 mb-1">{hoveredCard.name}</h3>
            {hoveredCard.set_name &&
          <p className="text-xs text-gray-600 mb-2">{hoveredCard.set_name}</p>
          }
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold text-blue-600">
                ${hoveredCard.price?.toFixed(2)}
              </span>
              {hoveredCard.condition &&
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                  {hoveredCard.condition}
                </span>
            }
            </div>
          </div>
        </div>
      }

      {/* Quick View Dialog */}
      <QuickViewDialog
        item={quickViewItem}
        open={!!quickViewItem}
        onClose={() => setQuickViewItem(null)}
        user={user} />

    </div>);

}




