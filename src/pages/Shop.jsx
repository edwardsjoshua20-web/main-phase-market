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
import { Search, X, Package, Loader2, ChevronDown, ChevronRight, Mail, Box, Heart, ShoppingCart, Grid2X2, List, SlidersHorizontal } from 'lucide-react';
import QuickViewDialog from '@/components/store/QuickViewDialog';
import AdvancedSearch from '@/components/store/AdvancedSearch';
import CardImage from '@/components/cards/CardImage';
import { toast } from 'sonner';
import {
  GAME_OPTIONS,
  buildFilterParams,
  enrichSearchResultsWithInventory,
  hasActiveFilters,
  isValidEmail
} from '@/pages/shop/shopUtils';
import { inventoryOwner } from '@/services/inventory/inventoryOwner';
import { listingOwner } from '@/services/listing/listingOwner';
import { searchOwner } from '@/services/search/searchOwner';
import { performShopCardSearch } from '@/services/search/shopSearch';
import { useCartOwner } from '@/hooks/useCartOwner';
import { useWishlistOwner } from '@/hooks/useWishlistOwner';
import { createPageUrl } from '@/utils';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

function resolveListingSellPrice(listing = {}) {
  const safeListing = listing || {};
  const value = Number(safeListing.sell_price ?? safeListing.price ?? safeListing.display_price ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveResultSellPrice(result = {}) {
  const value = Number(result?.listingSellPrice ?? result?.customerPrice ?? 0);
  if (Number.isFinite(value) && value > 0) return value;
  return resolveListingSellPrice(result?.stockCard);
}

function resolveMarketPrice(result = {}) {
  const value = Number(result.marketPrice ?? result.market_price ?? result.price ?? 0);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function resolveReleaseYear(value) {
  const date = new Date(value || '');
  return Number.isNaN(date.getTime()) ? '' : String(date.getFullYear());
}

const STANDARD_CARD_CONDITIONS = ['near_mint', 'lightly_played', 'moderately_played', 'heavily_played', 'damaged'];
const FILTER_LABELS = Object.freeze({
  near_mint: 'Near Mint',
  lightly_played: 'Lightly Played',
  moderately_played: 'Moderately Played',
  heavily_played: 'Heavily Played',
  damaged: 'Damaged',
  nonfoil: 'Non-Foil',
  foil: 'Foil',
  etched: 'Etched Foil',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ja: 'Japanese',
  ko: 'Korean',
  ru: 'Russian',
  zhs: 'Simplified Chinese',
  zht: 'Traditional Chinese'
});

function formatFilterLabel(value) {
  const raw = String(value || '').trim();
  const normalized = raw.toLowerCase();
  if (FILTER_LABELS[normalized]) return FILTER_LABELS[normalized];
  const words = raw
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2');
  return words.split(' ').map((word) => word ? word[0].toUpperCase() + word.slice(1) : '').join(' ');
}

function filterValueMatches(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase();
}

function FilterChoice({ active, children, onClick }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-2 px-1 py-0.5 text-left text-[12px] leading-5 transition-colors ${active ? 'font-semibold text-white' : 'text-slate-400 hover:text-slate-100'}`}>
      <span className={`h-3 w-3 shrink-0 border ${active ? 'border-[#5f8198] bg-[#52738a] shadow-[inset_0_0_0_2px_#0e1723]' : 'border-slate-600 bg-transparent'}`} />
      <span className="truncate">{children}</span>
    </button>
  );
}

function FilterSection({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <details className="group border-b border-slate-700/40 py-2" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-semibold uppercase text-slate-400 marker:content-none">
        <span>{title}</span>
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1.5">{children}</div>
    </details>
  );
}

function SetFilterChoices({ options, selected, onSelect, initialCount = 12 }) {
  const [showAll, setShowAll] = useState(false);
  const visibleOptions = showAll ? options : options.slice(0, initialCount);
  const selectedIsHidden = selected !== 'all' && !visibleOptions.includes(selected);

  return (
    <>
      <FilterChoice active={selected === 'all'} onClick={() => onSelect('all')}>All Sets</FilterChoice>
      {visibleOptions.map((set) => <FilterChoice key={set} active={selected === set} onClick={() => onSelect(set)}>{set}</FilterChoice>)}
      {selectedIsHidden && <FilterChoice active onClick={() => onSelect(selected)}>{selected}</FilterChoice>}
      {options.length > initialCount && (
        <button type="button" onClick={() => setShowAll((current) => !current)} className="mt-1 px-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-200">
          {showAll ? 'Show less' : `Show more (${options.length - initialCount})`}
        </button>
      )}
    </>
  );
}

function MarketplaceListingResult({ item, resultsView, onAdd, onWishlist, onQuickView, onMouseEnter, onMouseLeave }) {
  const stockState = inventoryOwner.getStockState(item);
  const price = Number(item.price || 0);
  const detail = [item.condition, item.finish, item.language || item.lang].filter(Boolean).join(' / ');
  const language = String(item.language || item.lang || '').trim();
  const showGridLanguage = language && !['en', 'eng', 'english', 'en-us'].includes(language.toLowerCase());
  const gridDetail = [
    item.condition && formatFilterLabel(item.condition),
    item.finish && formatFilterLabel(item.finish),
    showGridLanguage && formatFilterLabel(language)
  ].filter(Boolean).join(' \u00b7 ');
  const image = item.image_url;

  if (resultsView === 'list') {
    return (
      <article onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="group grid min-w-0 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 border-b border-slate-700/45 px-1 py-2 transition-colors hover:bg-slate-800/35">
        <div className="grid h-16 w-[52px] place-items-center overflow-hidden bg-[#0b121c]">
          {image ? <img src={image} alt={item.name} className="h-full w-full object-contain p-1" /> : <span className="text-[10px] text-slate-600">No image</span>}
        </div>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-white">{item.name}</h3>
          {item.set_name && <p className="mt-0.5 truncate text-xs text-slate-400">{item.set_name}</p>}
          {detail && <p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p>}
        </div>
        <div className="flex items-center gap-3">
          <div className="min-w-20 text-right">
            <div className="text-base font-bold text-white">${price.toFixed(2)}</div>
            <div className="text-[11px] text-slate-500">{stockState.quantity} in stock</div>
          </div>
          <Button onClick={onAdd} disabled={!stockState.inStock} size="sm" className="h-8 rounded-[2px] bg-cyan-600 px-3 text-xs text-white hover:bg-cyan-500"><ShoppingCart className="mr-1 h-3 w-3" /> Cart</Button>
          <Button onClick={onWishlist} variant="ghost" size="icon" aria-label={`Add ${item.name} to wishlist`} className="h-8 w-8 text-slate-500 hover:bg-slate-800 hover:text-rose-300"><Heart className="h-3.5 w-3.5" /></Button>
        </div>
      </article>
    );
  }

  return (
    <article className="group relative overflow-hidden rounded-[2px] border border-transparent bg-[#0c141e] transition-colors hover:border-slate-700/60 hover:bg-[#101a26]">
      <div className="relative aspect-square overflow-hidden bg-[#0a111b]" onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}>
        {image ? <img src={image} alt={item.name} className="h-full w-full object-contain p-2 transition-transform duration-200 group-hover:scale-[1.025]" /> : <div className="flex h-full w-full items-center justify-center text-xs text-slate-600">No Image</div>}
        {onQuickView && <button type="button" onClick={onQuickView} aria-label={`Quick view ${item.name}`} className="absolute right-2 top-2 grid h-7 w-7 place-items-center bg-slate-950/80 text-slate-400 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"><Search className="h-3.5 w-3.5" /></button>}
      </div>
      <div className="p-2">
        <h3 className="line-clamp-2 min-h-8 text-[13px] font-semibold leading-4 text-white">{item.name}</h3>
        {item.set_name && <p className="truncate text-[11px] leading-4 text-slate-500">{item.set_name}</p>}
        {gridDetail && <p className="truncate text-[10px] leading-4 text-slate-500">{gridDetail}</p>}
        <div className="mb-1.5 mt-1 flex items-end justify-between gap-2">
          <span className="text-base font-bold text-white">${price.toFixed(2)}</span>
          <span className="text-[10px] text-slate-500">{stockState.quantity} in stock</span>
        </div>
        <div className="flex gap-1">
          <Button onClick={onAdd} disabled={!stockState.inStock} size="sm" className="h-7 flex-1 rounded-[2px] bg-cyan-600 text-[11px] text-white hover:bg-cyan-500"><ShoppingCart className="mr-1 h-3 w-3" /> Cart</Button>
          <Button onClick={onWishlist} variant="ghost" size="icon" aria-label={`Add ${item.name} to wishlist`} className="h-7 w-7 text-slate-500 hover:bg-slate-800 hover:text-rose-300"><Heart className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
    </article>
  );
}

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
    setType: searchParams.get('setType') || 'all',
    preorder: searchParams.get('preorder') === 'true',
    condition: searchParams.get('condition') || 'all',
    finish: searchParams.get('finish') || 'all',
    language: searchParams.get('language') || 'all'
  };

  const [quickViewItem, setQuickViewItem] = useState(null);
  const queryClient = useQueryClient();
  const cart = useCartOwner(user);
  const wishlist = useWishlistOwner(user);

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
  const canonicalSelection = searchParams.get('canonical') === '1';

  useEffect(() => {
    if (!advancedSearchOpen && filters.type === 'single_card' && filters.search) {
      setCardSearchQuery(filters.search);
      setCardSearchPage(0);
      const game = filters.game === 'all' ? 'magic' : filters.game;
      triggerSearch(filters.search, game, null, { canonical: canonicalSelection });
    }
  }, [advancedSearchOpen, canonicalSelection, filters.search, filters.type, filters.game]);

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
  const [resultsView, setResultsView] = useState('grid');

  const { data: catalogFilterOptions = { sets: [], rarities: [], finishes: [], languages: [] } } = useQuery({
    queryKey: ['shop-catalog-filter-options', filters.game],
    queryFn: () => searchOwner.listFilterOptions({ game: filters.game }),
    staleTime: 30 * 60 * 1000
  });

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
  const hoverSequenceRef = useRef(0);

  const clearHoverTimer = (timerRef) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const scheduleHoverState = (timerRef, setter, nextValue, delay, sequence = null) => {
    clearHoverTimer(timerRef);
    timerRef.current = setTimeout(() => {
      if (sequence != null && sequence !== hoverSequenceRef.current) {
        timerRef.current = null;
        return;
      }
      setter(nextValue);
      timerRef.current = null;
    }, delay);
  };

  const handleCardPreviewEnter = (card) => {
    if (!getCardImageUrl(card)) return;
    const sequence = ++hoverSequenceRef.current;
    clearHoverTimer(hoveredCardImageTimerRef);
    setHoveredCardImage(null);
    scheduleHoverState(hoveredCardTimerRef, setHoveredCard, card, HOVER_OPEN_DELAY_MS, sequence);
  };

  const handleCardPreviewLeave = () => {
    const sequence = ++hoverSequenceRef.current;
    scheduleHoverState(hoveredCardTimerRef, setHoveredCard, null, HOVER_CLOSE_DELAY_MS, sequence);
  };

  const getResultGridImageUrl = getCardImageUrl;

  const handleCardImagePreviewEnter = (card) => {
    if (!getCardImageUrl(card)) return;
    const sequence = ++hoverSequenceRef.current;
    clearHoverTimer(hoveredCardTimerRef);
    setHoveredCard(null);
    scheduleHoverState(hoveredCardImageTimerRef, setHoveredCardImage, card, HOVER_OPEN_DELAY_MS, sequence);
  };

  const handleCardImagePreviewLeave = () => {
    ++hoverSequenceRef.current;
    clearHoverTimer(hoveredCardImageTimerRef);
    setHoveredCardImage(null);
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

  // Reset marketplace pagination when a filter changes.
  useEffect(() => {
    setGameBrowsePage(0);
    setGameBrowseSearch('');
  }, [filters.game, filters.type, filters.rarity, filters.set, filters.priceMin, filters.priceMax, filters.inStock, filters.preorder, filters.condition, filters.finish, filters.language]);

  // Fetch inventory
  const { data: cards = [], isLoading: cardsLoading } = useQuery({
    queryKey: ['shop-cards', filters.game],
    queryFn: async () => {
      const allCards = await listingOwner.listCardListings('-created_date', 500);
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
    queryKey: ['shop-products', filters.game, filters.preorder],
    queryFn: async () => {
      const allProducts = await listingOwner.listProductListings('-created_date', 100);
      return allProducts.filter((p) => {
        const matchesPreorder = filters.preorder ? Boolean(p.is_preorder) : inventoryOwner.getStockState(p).inStock;
        return p.status === 'active' && matchesPreorder && (filters.game === 'all' || p.game === filters.game);
      });
    }
  });

  const addToCartMutation = useMutation({
    mutationFn: async (/** @type {any} */ card) => {
      const sellPrice = resolveListingSellPrice(card);
      await cart.addItem({
        card_id: card.id,
        card_name: card.name,
        card_image: card.image_url,
        price: sellPrice,
        sell_price: sellPrice,
        market_price: card.market_price ?? null,
        game: card.game,
        set_code: card.set_code,
        set_name: card.set_name,
        collector_number: card.collector_number || card.number,
        finish: card.finish,
        condition: card.condition,
        language: card.language || card.lang,
      }, 1);
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
    mutationFn: (/** @type {any} */ card) => wishlist.addItem({
      product_id: card.id,
      product_name: card.name,
      product_image: card.image_url,
      price: card.price,
      product_type: card.product_type ? 'product' : 'card',
      game: card.game,
      set_code: card.set_code,
      set_name: card.set_name,
      collector_number: card.collector_number || card.number,
      finish: card.finish,
      condition: card.condition,
      language: card.language || card.lang,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success('Added to wishlist');
    }
  });

  const triggerSearch = async (query, game, apiQuery = null, options = {}) => {
    if (!apiQuery && !searchOwner.normalizeQuery(query)) return;
    setSearchingCards(true);
    setShowCardResults(true);
    try {
      const searchGame = game || (filters.game === 'all' ? 'magic' : filters.game);
      const { results, meta } = await performShopCardSearch({
        query,
        game: searchGame,
        apiQuery,
        canonical: Boolean(options.canonical),
        page: options.page || 0,
        limit: options.canonical ? 5000 : 36
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
          await wishlist.addItem({
            product_id: item.id,
            product_name: item.name,
            product_image: item.image_url,
            price: wishlistPrice ?? item.price ?? 0,
            product_type: wishlistProductType,
            game: item.game,
            set_code: item.set_code,
            set_name: item.set_name || setName,
            collector_number: item.collector_number || item.number || cardNumber,
            finish: item.finish,
            condition: item.condition,
            language: item.language || item.lang,
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

      formattedResults = await searchOwner.searchSets({
        query,
        game: gameFilter,
        products,
        limit: 200
      });

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
          sort: 'newest',
          preorder: false,
          condition: 'all',
          finish: 'all',
          language: 'all'
        }),
        advancedSearch: '1'
      });
      return;
    }

    setCardSearchResults([]);
    setShowCardResults(false);
    setCardSearchPage(0);
    setSinglesSearchDraft('');
    setSearchParams({});
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
          const setsWithStock = await searchOwner.listSets({
            game: 'magic',
            products,
            limit: 50
          });

          setAllMTGSets(setsWithStock);
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

  const uniqueSets = catalogFilterOptions.sets;
  const uniqueRarities = catalogFilterOptions.rarities;
  const uniqueConditions = [...new Set([...STANDARD_CARD_CONDITIONS, ...cards.map((c) => c.condition).filter(Boolean)])];
  const uniqueFinishes = catalogFilterOptions.finishes;
  const uniqueLanguages = catalogFilterOptions.languages;
  const sealedSetOptions = [...new Set(allMTGSets.map((set) => set.name).filter(Boolean))].sort();
  const sealedReleaseYears = [...new Set(allMTGSets.map((set) => resolveReleaseYear(set.release_date)).filter(Boolean))].sort((a, b) => b.localeCompare(a));
  const filteredMTGSets = allMTGSets.filter((set) => {
    if (filters.set !== 'all' && set.name !== filters.set) return false;
    if (filters.setType !== 'all' && resolveReleaseYear(set.release_date) !== filters.setType) return false;
    return true;
  });
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (filters.inStock && !inventoryOwner.getStockState(c).inStock) return false;
      if (filters.rarity !== 'all' && !filterValueMatches(c.rarity, filters.rarity)) return false;
      if (filters.set !== 'all' && c.set_name !== filters.set) return false;
      if (filters.condition !== 'all' && !filterValueMatches(c.condition, filters.condition)) return false;
      if (filters.finish !== 'all' && !filterValueMatches(c.finish, filters.finish)) return false;
      if (filters.language !== 'all' && !filterValueMatches(c.language || c.lang, filters.language)) return false;
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
    filter((c) => c.status === 'active' && inventoryOwner.getStockState(c).inStock && (
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
      if (filters.preorder && !p.is_preorder) return false;
      const price = Number(p.price || 0);
      if (filters.priceMin && price < Number(filters.priceMin)) return false;
      if (filters.priceMax && price > Number(filters.priceMax)) return false;
      return true;
    });
  }, [products, filters]);

  const filteredSearchResults = activeCardSearchResults.filter((card) => {
    if (filters.set !== 'all' && card.set_name !== filters.set) return false;
    if (filters.rarity !== 'all' && !filterValueMatches(card.rarity, filters.rarity)) return false;
    if (filters.condition !== 'all' && !filterValueMatches(card.condition, filters.condition)) return false;
    if (filters.finish !== 'all' && !filterValueMatches(card.finish, filters.finish)) return false;
    if (filters.language !== 'all' && !filterValueMatches(card.language || card.lang, filters.language)) return false;
    if (filters.inStock && !card.inStock) return false;
    const resultPrice = resolveResultSellPrice(card) ?? resolveMarketPrice(card) ?? 0;
    if (filters.priceMin && resultPrice < Number(filters.priceMin)) return false;
    if (filters.priceMax && resultPrice > Number(filters.priceMax)) return false;
    return true;
  });
  const marketplaceResultCount = showBoxSearch
    ? (filters.game === 'magic' ? filteredMTGSets.length : boxSearchResults.length)
    : (showCardSearch && showCardResults
      ? filteredSearchResults.length
      : ((filters.type === 'all' || filters.type === 'single_card') ? filteredCards.length : filteredProducts.length));
  const pagedMarketplaceCards = filteredCards.slice(gameBrowsePage * GAME_BROWSE_PER_PAGE, (gameBrowsePage + 1) * GAME_BROWSE_PER_PAGE);
  const showCardFilters = filters.type === 'all' || filters.type === 'single_card';

  return (
    <div className="min-h-screen bg-[#090f18] text-slate-100">
      <section className="relative isolate w-full overflow-hidden border-b border-slate-700/70 bg-[#07111f] px-4 py-8 sm:px-6 lg:px-8">
        <img src="/images/shop-marketplace-banner.png" alt="" aria-hidden="true" className="absolute inset-0 -z-20 h-full w-full object-cover object-center" />
        <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#030812]/95 via-[#030812]/55 to-transparent" />
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">The Marketplace</h1>
      </section>

      <div className="w-full px-3 py-4 sm:px-4 lg:px-6">
        <div className="grid min-w-0 gap-6 md:grid-cols-[228px_minmax(0,1fr)] lg:grid-cols-[244px_minmax(0,1fr)]">
          <aside className="hidden min-w-0 md:block">
            <div className="sticky top-24 rounded-[2px] border border-slate-700/40 bg-[#0e1723] px-4">
              <div className="flex items-center justify-between border-b border-slate-700/40 py-2">
                <h2 className="text-[10px] font-medium uppercase text-slate-500">Filters</h2>
                <button type="button" onClick={clearFilters} disabled={!showClearFilters} className="text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-200 disabled:cursor-default disabled:opacity-35">Reset</button>
              </div>

              <div className="border-b border-slate-700/40 py-2.5">
                <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-500">Game</label>
                <Select value={filters.game} onValueChange={(game) => updateFilters({ ...filters, game, set: 'all', setType: 'all' })}>
                  <SelectTrigger className="h-8 w-full rounded-[2px] border-slate-700/50 bg-slate-950/20 px-2 text-[13px] text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-slate-700 bg-[#111b29] text-slate-100">
                    {GAME_OPTIONS.map((game) => <SelectItem key={game.value} value={game.value}>{game.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="border-b border-slate-700/40 py-2.5">
                <div className="mb-1 text-[10px] font-semibold uppercase text-slate-500">Product Type</div>
                <div>
                  {[
                    ['all', 'All Products'],
                    ['single_card', 'Single Cards'],
                    ['booster_box', 'Sealed Product'],
                    ['starter_deck', 'Starter Decks'],
                    ['dice', 'Accessories']
                  ].map(([value, label]) => (
                    <FilterChoice key={value} active={filters.type === value} onClick={() => updateFilters({ ...filters, type: value, search: '', set: 'all', setType: 'all', rarity: 'all', condition: 'all', finish: 'all', language: 'all' })}>{label}</FilterChoice>
                  ))}
                </div>
              </div>

              {showCardFilters && uniqueSets.length > 0 && <FilterSection title="Set">
                <SetFilterChoices options={uniqueSets} selected={filters.set} onSelect={(set) => updateFilters({ ...filters, set })} />
              </FilterSection>}

              {showCardFilters && uniqueRarities.length > 0 && <FilterSection title="Rarity">
                <FilterChoice active={filters.rarity === 'all'} onClick={() => updateFilters({ ...filters, rarity: 'all' })}>All Rarities</FilterChoice>
                {uniqueRarities.map((rarity) => <FilterChoice key={rarity} active={filters.rarity === rarity} onClick={() => updateFilters({ ...filters, rarity })}>{formatFilterLabel(rarity)}</FilterChoice>)}
              </FilterSection>}

              {filters.type === 'booster_box' && filters.game === 'magic' && sealedSetOptions.length > 0 && <FilterSection title="Set">
                <SetFilterChoices options={sealedSetOptions} selected={filters.set} onSelect={(set) => updateFilters({ ...filters, set })} />
              </FilterSection>}

              {filters.type === 'booster_box' && filters.game === 'magic' && sealedReleaseYears.length > 0 && <FilterSection title="Release Date">
                <FilterChoice active={filters.setType === 'all'} onClick={() => updateFilters({ ...filters, setType: 'all' })}>All Years</FilterChoice>
                {sealedReleaseYears.map((year) => <FilterChoice key={year} active={filters.setType === year} onClick={() => updateFilters({ ...filters, setType: year })}>{year}</FilterChoice>)}
              </FilterSection>}

              <FilterSection title="Price" defaultOpen>
                <div className="grid grid-cols-2 gap-2">
                  <Input inputMode="decimal" value={filters.priceMin} onChange={(event) => updateFilters({ ...filters, priceMin: event.target.value })} placeholder="Min" className="h-7 rounded-[2px] border-slate-700/50 bg-slate-950/20 px-2 text-xs text-white placeholder:text-slate-600" />
                  <Input inputMode="decimal" value={filters.priceMax} onChange={(event) => updateFilters({ ...filters, priceMax: event.target.value })} placeholder="Max" className="h-7 rounded-[2px] border-slate-700/50 bg-slate-950/20 px-2 text-xs text-white placeholder:text-slate-600" />
                </div>
              </FilterSection>

              {showCardFilters && uniqueConditions.length > 0 && <FilterSection title="Condition">
                <FilterChoice active={filters.condition === 'all'} onClick={() => updateFilters({ ...filters, condition: 'all' })}>All Conditions</FilterChoice>
                {uniqueConditions.map((value) => <FilterChoice key={value} active={filters.condition === value} onClick={() => updateFilters({ ...filters, condition: value })}>{formatFilterLabel(value)}</FilterChoice>)}
              </FilterSection>}

              {showCardFilters && (uniqueFinishes.length > 0 || uniqueLanguages.length > 0) && <FilterSection title="Finish / Language">
                {uniqueFinishes.length > 0 && <div className="pb-1.5"><div className="mb-1 px-1 text-[10px] uppercase text-slate-600">Finish</div><FilterChoice active={filters.finish === 'all'} onClick={() => updateFilters({ ...filters, finish: 'all' })}>All Finishes</FilterChoice>{uniqueFinishes.map((value) => <FilterChoice key={value} active={filters.finish === value} onClick={() => updateFilters({ ...filters, finish: value })}>{formatFilterLabel(value)}</FilterChoice>)}</div>}
                {uniqueLanguages.length > 0 && <div><div className="mb-1 px-1 text-[10px] uppercase text-slate-600">Language</div><FilterChoice active={filters.language === 'all'} onClick={() => updateFilters({ ...filters, language: 'all' })}>All Languages</FilterChoice>{uniqueLanguages.map((value) => <FilterChoice key={value} active={filters.language === value} onClick={() => updateFilters({ ...filters, language: value })}>{formatFilterLabel(value)}</FilterChoice>)}</div>}
              </FilterSection>}
            </div>
          </aside>

          <main className="min-w-0">
            <details className="mb-3 border-y border-slate-700/70 py-2 md:hidden">
              <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-white"><SlidersHorizontal className="h-4 w-4" /> Filters</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Select value={filters.game} onValueChange={(game) => updateFilters({ ...filters, game, set: 'all' })}><SelectTrigger className="h-10 rounded border-slate-600 bg-[#111b29] text-white"><SelectValue /></SelectTrigger><SelectContent>{GAME_OPTIONS.map((game) => <SelectItem key={game.value} value={game.value}>{game.label}</SelectItem>)}</SelectContent></Select>
                <Select value={filters.type} onValueChange={(type) => updateFilters({ ...filters, type, search: '' })}><SelectTrigger className="h-10 rounded border-slate-600 bg-[#111b29] text-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Products</SelectItem><SelectItem value="single_card">Single Cards</SelectItem><SelectItem value="booster_box">Sealed Product</SelectItem><SelectItem value="starter_deck">Starter Decks</SelectItem><SelectItem value="dice">Accessories</SelectItem></SelectContent></Select>
                {showClearFilters && <button type="button" onClick={clearFilters} className="text-left text-xs font-semibold uppercase text-slate-300">Reset filters</button>}
              </div>
            </details>

            <form onSubmit={(event) => { event.preventDefault(); if (showBoxSearch) searchBoosterBoxes(boxSearchQuery); else submitSinglesSearch(); }} className="mb-3 flex min-w-0 flex-col gap-2 border-b border-slate-700/60 pb-3 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input value={showBoxSearch ? boxSearchQuery : singlesSearchDraft} onChange={showBoxSearch ? handleBoxSearchChange : (event) => setSinglesSearchDraft(event.target.value)} placeholder={showBoxSearch ? 'Search sealed sets...' : 'Search the marketplace...'} className="h-10 rounded border-slate-700/35 bg-[#101924] pl-9 pr-10 text-sm text-white placeholder:text-slate-500 focus-visible:border-slate-500/70" />
                <button type="submit" aria-label="Search" className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center text-slate-300 hover:text-white"><Search className="h-4 w-4" /></button>
              </div>
              <Select value={filters.sort} onValueChange={(sort) => updateFilters({ ...filters, sort })}>
                <SelectTrigger className="h-10 w-full rounded border-slate-700/35 bg-[#101924] text-sm text-white focus:border-slate-500/70 sm:w-[170px]"><SelectValue /></SelectTrigger>
                <SelectContent className="border-slate-700 bg-[#111b29] text-slate-100"><SelectItem value="newest">Newest</SelectItem><SelectItem value="price-low">Price: Low to High</SelectItem><SelectItem value="price-high">Price: High to Low</SelectItem><SelectItem value="name">Name (A-Z)</SelectItem></SelectContent>
              </Select>
              <div className="flex h-10 shrink-0 items-center gap-0.5" aria-label="Results view">
                <button type="button" onClick={() => setResultsView('grid')} aria-label="Grid view" className={`grid h-8 w-9 place-items-center transition-colors ${resultsView === 'grid' ? 'bg-slate-700/55 text-slate-100' : 'text-slate-600 hover:bg-slate-800/40 hover:text-slate-300'}`}><Grid2X2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => setResultsView('list')} aria-label="List view" className={`grid h-8 w-9 place-items-center transition-colors ${resultsView === 'list' ? 'bg-slate-700/55 text-slate-100' : 'text-slate-600 hover:bg-slate-800/40 hover:text-slate-300'}`}><List className="h-4 w-4" /></button>
              </div>
            </form>

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

        {false && filters.type === 'starter_deck' &&
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

        {false && filters.type === 'dice' &&
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
        {false && filters.type === 'single_card' &&
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

        <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
          <span>{marketplaceResultCount.toLocaleString()} result{marketplaceResultCount === 1 ? '' : 's'}</span>
        </div>

        {/* Card Search Results Grid */}
        {filters.type === 'single_card' && activeCardSearchResults.length > 0 &&
        (() => {
          const filteredResults = filteredSearchResults;
          const pagedResults = advancedSearchOpen && advancedApiQuery ?
          filteredResults :
          filteredResults.slice(cardSearchPage * CARDS_PER_PAGE, (cardSearchPage + 1) * CARDS_PER_PAGE);
          return (
        <div className={resultsView === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'grid grid-cols-1'}>
            {pagedResults.map((result, idx) => {
              const gridImageUrl = getResultGridImageUrl(result);
              const listingSellPrice = resolveResultSellPrice(result);
              const marketPrice = resolveMarketPrice(result);
              const hasActiveListingPrice = result.inStock && listingSellPrice != null;

              if (
                idx === 0 &&
                typeof window !== 'undefined' &&
                new URLSearchParams(window.location.search).get('traceSearch') === '1'
              ) {
                console.info('[MPM search render trace:first-result]', {
                  name: result.name,
                  inStock: result.inStock,
                  stockCard: result.stockCard,
                  stockCardPrice: result.stockCard?.price,
                  stockCardSellPrice: result.stockCard?.sell_price,
                  stockCardDisplayPrice: result.stockCard?.display_price,
                  listing: result.listing,
                  listingSellPrice: result.listingSellPrice,
                  resolvedListingSellPrice: listingSellPrice,
                  customerPrice: result.customerPrice,
                  price: result.price,
                  market_price: result.market_price,
                  marketPrice: result.marketPrice
                });
              }

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
            className={`group overflow-hidden transition-colors ${resultsView === 'list' ? 'flex min-h-0 items-center border-b border-slate-700/45 bg-transparent px-1 py-2 hover:bg-slate-800/35' : 'rounded-[2px] border border-transparent bg-[#0c141e] hover:border-slate-700/60 hover:bg-[#101a26]'} ${(groupedMagicSearchResults.length > 0 && result.oracle_id) || ((result.game === 'pokemon' || result.game === 'yugioh' || result.game === 'lorcana' || result.game === 'onepiece' || result.game === 'flesh_and_blood' || result.game === 'starwars') && result.id) ? 'cursor-pointer' : ''}`}>

                <div className={`relative shrink-0 overflow-hidden bg-[#0a111b] ${resultsView === 'list' ? 'h-16 w-[52px]' : 'aspect-square w-full'}`}>
                    {gridImageUrl ?
                <img
                  src={gridImageUrl}
                  alt={result.name}
                  className="w-full h-full object-contain p-2"
                  loading={idx < 8 ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={(e) => handleResultImageError(e, result, gridImageUrl)} /> : null}

              <div data-image-fallback className={`${gridImageUrl ? 'hidden' : 'flex'} h-full w-full items-center justify-center text-xs text-slate-500`}>No Image</div>
                  {gridImageUrl &&
                  <div
                    aria-hidden="true"
                    className="absolute top-2 bottom-2 left-1/2 aspect-[63/88] -translate-x-1/2"
                    onMouseEnter={() => handleCardImagePreviewEnter(result)}
                    onMouseLeave={handleCardImagePreviewLeave} />
                  }
                  {result.inStock && <Badge className="absolute right-2 top-2 rounded-sm bg-emerald-600 text-[10px] text-white">In Stock</Badge>}
                  <button type="button" aria-label={`Add ${result.name} to wishlist`} onClick={(event) => { event.stopPropagation(); addToWishlistMutation.mutate(result.stockCard || result); }} className="absolute left-2 top-2 grid h-7 w-7 place-items-center bg-slate-950/85 text-slate-400 hover:text-rose-300"><Heart className="h-3.5 w-3.5" /></button>
                </div>
                <div className={`min-w-0 flex-1 ${resultsView === 'list' ? 'px-3 py-0' : 'p-2.5'}`}>
                  <h3 className="line-clamp-2 text-sm font-semibold text-white">{result.name}</h3>
                  {result.set_name && <p className="mt-1 line-clamp-1 text-xs text-slate-400">{result.set_name}</p>}
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
                    <p className="mt-1 text-[11px] text-slate-500">
                    {result.variantCount} language variants
                  </p>
                  }
                  {result.rarity && <p className="mt-0.5 text-xs text-slate-500">{result.rarity}</p>}
                  <div className="mt-3">
                    {result.stockCard || hasActiveListingPrice ?
                <>
                        {listingSellPrice != null &&
                    <p className="text-lg font-bold text-white">${listingSellPrice.toFixed(2)}</p>
                    }
                        {result.stockCard &&
                        <Button
                    onClick={(event) => handleAddCardToCart(result.stockCard, event)}
                    size="sm"
                    className="mt-2 h-8 w-full rounded-sm bg-cyan-600 text-xs text-white hover:bg-cyan-500">

                          <ShoppingCart className="w-3 h-3 mr-1" />
                          Add to Cart
                        </Button>
                    }
                      </> :

                <>
                        {marketPrice != null &&
                  <p className="mb-1 text-sm text-slate-500">Market: <span className="font-semibold text-slate-300">${marketPrice.toFixed(2)}</span></p>
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
        <div className="mt-6 border border-slate-700 bg-[#111a27] p-8 text-center">
            <p className="font-medium text-slate-200">No cards matched your current search.</p>
            <p className="mt-1 text-sm text-slate-500">Try removing a filter or broadening the search.</p>
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

          const filteredResults = filteredSearchResults;
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
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="pointer-events-none w-64 max-w-[calc(100vw-2rem)] rounded-[2px] border border-slate-600/35 bg-[#0d1621] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.38)]">
              <CardImage
              card={hoveredCardImage}
              alt={hoveredCardImage.name || 'Card preview'}
              className="aspect-[63/88] max-h-[calc(100vh-10rem)] w-full rounded-[2px] object-contain"
              fallbackClassName="flex aspect-[63/88] max-h-[calc(100vh-10rem)] w-full items-center justify-center bg-[#09111b] text-sm text-slate-500"
              loading="eager" />
              <div className="px-1 pb-0.5 pt-2">
                <h3 className="truncate text-sm font-semibold text-slate-100">{hoveredCardImage.name}</h3>
                {hoveredCardImage.set_name && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hoveredCardImage.set_name}</p>}
                {(resolveResultSellPrice(hoveredCardImage) ?? resolveMarketPrice(hoveredCardImage)) != null &&
                <p className="mt-1 text-base font-bold text-slate-100">${(resolveResultSellPrice(hoveredCardImage) ?? resolveMarketPrice(hoveredCardImage)).toFixed(2)}</p>}
              </div>
            </div>
          </div>
        }

        {/* Booster Box Search Section */}
        {showBoxSearch &&
        <div className="mb-6">
            
            {filters.game === 'magic' &&
            <div className={resultsView === 'grid' ? 'mb-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5' : 'mb-5 grid grid-cols-1'}>
                {filteredMTGSets.map((set) =>
            <div key={set.id} className={`group overflow-hidden transition-colors ${resultsView === 'list' ? 'flex min-h-0 items-center border-b border-slate-700/45 bg-transparent px-1 py-2 hover:bg-slate-800/35' : 'rounded-[2px] border border-slate-800 bg-[#0f1824] hover:border-slate-600 hover:bg-[#121d2b]'}`}>
                    <div className={`relative shrink-0 overflow-hidden bg-[#0a111b] ${resultsView === 'list' ? 'h-16 w-[52px]' : 'aspect-square w-full'}`}>
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
                    <div className={`min-w-0 flex-1 ${resultsView === 'list' ? 'px-3 py-0' : 'p-2.5'}`}>
                      <h4 className="line-clamp-2 text-sm font-semibold text-white">{set.name}</h4>
                      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700">{set.set_code}</span>
                        {set.release_date && <span>{new Date(set.release_date).getFullYear()}</span>}
                      </div>
                      <div className="mt-4 flex items-end justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase text-slate-500">
                            {set.stockProduct?.price != null ? 'Price' : 'Status'}
                          </p>
                          <p className={`text-lg font-bold ${set.stockProduct?.price != null ? 'text-white' : 'text-slate-500'}`}>
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

            {false && filters.game !== 'magic' &&
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
        {false && filters.game !== 'all' && filters.game !== 'magic' && filters.type === 'all' &&
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
         {!showBoxSearch && !(showCardSearch && showCardResults && enrichedCardSearchResults.length > 0) && !advancedSearchOpen &&
        <div>
             {cardsLoading || productsLoading ?
          <div className={resultsView === 'grid' ? 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'grid grid-cols-1 gap-2'}>
                 {[...Array(10)].map((_, i) =>
            <div key={i} className="overflow-hidden rounded border border-slate-700 bg-[#111a27]">
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
          <div className={resultsView === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'divide-y-0'}>
                 {pagedMarketplaceCards.map((card) =>
            <MarketplaceListingResult
              key={card.id}
              item={card}
              resultsView={resultsView}
              onMouseEnter={() => handleCardPreviewEnter(card)}
              onMouseLeave={handleCardPreviewLeave}
              onAdd={(event) => { event.preventDefault(); addToCartMutation.mutate(card); }}
              onWishlist={(event) => { event.preventDefault(); addToWishlistMutation.mutate(card); }} />
            )}
              </div> :
          (filters.type === 'all' || filters.type === 'single_card') && filteredCards.length > 0 ?
          <div className={resultsView === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'divide-y-0'}>
                {/* Show Cards when game is filtered */}
                {pagedMarketplaceCards.map((card) =>
            <MarketplaceListingResult
              key={card.id}
              item={card}
              resultsView={resultsView}
              onMouseEnter={() => handleCardPreviewEnter(card)}
              onMouseLeave={handleCardPreviewLeave}
              onAdd={(event) => handleAddCardToCart(card, event)}
              onWishlist={(event) => { event.preventDefault(); addToWishlistMutation.mutate(card); }} />
            )}
              </div> :
          filteredProducts.length > 0 ?
          <div className={resultsView === 'grid' ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6' : 'divide-y-0'}>
                {/* Show Products */}
                {filteredProducts.map((product) =>
            <MarketplaceListingResult
              key={product.id}
              item={product}
              resultsView={resultsView}
              onAdd={(event) => handleAddCardToCart(product, event)}
              onWishlist={(event) => { event.preventDefault(); addToWishlistMutation.mutate(product); }}
              onQuickView={() => setQuickViewItem(product)} />
            )}
              </div> :

          !filters.search &&
          <div className="border border-slate-700 bg-[#111a27] py-12 text-center">
                  <Package className="mx-auto mb-3 h-9 w-9 text-slate-500" />
                  <p className="text-slate-400">
                    {filters.type === 'starter_deck' ? 'No starter decks are live in inventory yet' :
                    filters.type === 'dice' ? 'No accessories are live in inventory yet' :
                    'No products currently in stock'}
                  </p>
                </div>

          }
          </div>
        }
        {!showBoxSearch && !(showCardSearch && showCardResults) && !advancedSearchOpen && filteredCards.length > GAME_BROWSE_PER_PAGE &&
        <div className="mt-5 flex flex-wrap items-center justify-center gap-1 border-t border-slate-700/70 pt-4">
          <Button type="button" variant="ghost" size="sm" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => { window.scrollTo(0, 0); setGameBrowsePage((page) => Math.max(0, page - 1)); }} disabled={gameBrowsePage === 0}>Previous</Button>
          {renderPageNumberButtons({
            currentPage: gameBrowsePage,
            totalPages: Math.ceil(filteredCards.length / GAME_BROWSE_PER_PAGE),
            onPageChange: setGameBrowsePage,
            activeClassName: 'h-8 min-w-8 rounded-sm bg-cyan-600 text-white hover:bg-cyan-500',
            idleClassName: 'h-8 min-w-8 rounded-sm text-slate-300 hover:bg-slate-800 hover:text-white'
          })}
          <Button type="button" variant="ghost" size="sm" className="text-slate-300 hover:bg-slate-800 hover:text-white" onClick={() => { window.scrollTo(0, 0); setGameBrowsePage((page) => page + 1); }} disabled={(gameBrowsePage + 1) * GAME_BROWSE_PER_PAGE >= filteredCards.length}>Next</Button>
        </div>}
          </main>
        </div>
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
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="pointer-events-none w-64 max-w-[calc(100vw-2rem)] rounded-[2px] border border-slate-600/35 bg-[#0d1621] p-2 shadow-[0_18px_45px_rgba(0,0,0,0.38)]">
            <img
            src={getCardImageUrl(hoveredCard)}
            alt={hoveredCard.name}
            onError={(event) => handleCardImageError(event, hoveredCard)}
            className="aspect-[63/88] max-h-[calc(100vh-10rem)] w-full rounded-[2px] object-contain" />

            <div className="px-1 pb-0.5 pt-2">
              <h3 className="truncate text-sm font-semibold text-slate-100">{hoveredCard.name}</h3>
              {hoveredCard.set_name && <p className="mt-0.5 truncate text-[11px] text-slate-400">{hoveredCard.set_name}</p>}
              <p className="mt-1 text-base font-bold text-slate-100">
                ${hoveredCard.price?.toFixed(2)}
              </p>
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





