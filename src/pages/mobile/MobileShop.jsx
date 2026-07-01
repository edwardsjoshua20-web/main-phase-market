import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import {
  Search,
  ShoppingCart,
  Mail,
  Loader2,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import AdvancedSearch from '@/components/store/AdvancedSearch';
import { searchAllGamesLocal, searchGameLocal } from '@/lib/localSearch';
import { searchFabCatalogAdvanced } from '@/lib/fabLocalCatalog';
import { searchLorcanaCatalogAdvanced } from '@/lib/lorcanaLocalCatalog';
import { searchMtgCatalogAdvanced } from '@/lib/mtgLocalCatalog';
import { searchOnePieceCatalogAdvanced } from '@/lib/onePieceLocalCatalog';
import { searchPokemonCatalogAdvanced } from '@/lib/pokemonLocalCatalog';
import { searchStarWarsCatalogAdvanced } from '@/lib/starwarsLocalCatalog';
import { searchYugiohCatalogAdvanced } from '@/lib/yugiohLocalCatalog';
import { addToGuestCart, getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { toast } from 'sonner';
import { inventoryListings } from '@/services/inventoryListings';
import { enrichSearchResultsWithInventory, findInventoryMatch } from '@/pages/shop/shopUtils';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

const GAME_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Disney Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' },
  { value: 'starwars', label: 'Star Wars Unlimited' }
];

const BROWSE_PAGE_SIZE = 24;

async function runAdvancedCatalogSearch(game, apiQuery) {
  const page = 0;
  const limit = 36;

  switch (game) {
    case 'magic':
      return (await searchMtgCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    case 'pokemon':
      return (await searchPokemonCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    case 'yugioh':
      return (await searchYugiohCatalogAdvanced(apiQuery, { page, limit })).results || [];
    case 'onepiece':
      return (await searchOnePieceCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    case 'lorcana':
      return (await searchLorcanaCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    case 'flesh_and_blood':
      return (await searchFabCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    case 'starwars':
      return (await searchStarWarsCatalogAdvanced(JSON.parse(apiQuery), { page, limit })).results || [];
    default:
      return [];
  }
}

export default function MobileShop() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const searchParam = searchParams.get('search') || '';
  const gameParam = searchParams.get('game') || 'all';
  const advancedSearchParam = searchParams.get('advancedSearch') === '1';
  const advancedApiQuery = searchParams.get('aq');
  const inStockOnly = searchParams.get('inStock') === 'true';

  const [user, setUser] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState(searchParam);
  const [headerSearchResults, setHeaderSearchResults] = useState([]);
  const [headerSearching, setHeaderSearching] = useState(false);
  const [cardResults, setCardResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState(gameParam);
  const [browsePage, setBrowsePage] = useState(0);
  const [contactCard, setContactCard] = useState(null);
  const [contactEmail, setContactEmail] = useState('');
  const [advancedSummary, setAdvancedSummary] = useState('');
  const searchTimeoutRef = useRef(null);
  const headerSearchRef = useRef(null);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  const { data: dbCartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: () => backend.data.CartItem.filter({ user_email: user.email }),
    enabled: !!user?.email
  });
  const { data: dbWishlistItems = [] } = useQuery({
    queryKey: ['wishlist', user?.email],
    queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }),
    enabled: !!user?.email
  });
  const [guestCart] = useState(getGuestCart());
  const [guestWishlist] = useState(getGuestWishlist());
  const cartItems = user ? dbCartItems : guestCart;
  const wishlistItems = user ? dbWishlistItems : guestWishlist;

  const { data: inventory = [] } = useQuery({
    queryKey: ['mobile-inventory'],
    queryFn: () => inventoryListings.filter({ status: 'active' }, '-price', 500)
  });

  const { data: pokemonInventory = [] } = useQuery({
    queryKey: ['mobile-pokemon-inventory'],
    queryFn: () => backend.data.PokemonCard.list('-created_date', 500)
  });

  useEffect(() => {
    setSearchQuery(searchParam);
    setSelectedGame(gameParam);
    setBrowsePage(0);
  }, [searchParam, gameParam]);

  useEffect(() => {
    const activeGame = gameParam === 'all' ? 'magic' : gameParam;

    if (advancedSearchParam && advancedApiQuery) {
      runAdvancedSearch(activeGame, advancedApiQuery);
      return;
    }

    setAdvancedSummary('');
    if (searchParam || gameParam !== 'all') {
      runSearch(searchParam, gameParam);
      return;
    }

    setCardResults([]);
  }, [searchParam, gameParam, advancedSearchParam, advancedApiQuery, inventory, pokemonInventory, inStockOnly]);

  const applySearchParams = (params) => {
    const next = {};
    if (params.search) next.search = params.search;
    if (params.game && params.game !== 'all') next.game = params.game;
    if (params.inStock) next.inStock = 'true';
    if (params.advancedSearch) next.advancedSearch = '1';
    if (params.aq) next.aq = params.aq;
    setSearchParams(next);
  };

  const runSearch = async (query, game) => {
    setSearching(true);
    setAdvancedSummary('');

    try {
      let results = [];

      if (query.trim().length >= 2) {
        results = game === 'all'
          ? await searchAllGamesLocal(query, 40)
          : await searchGameLocal(query, game, 40);
      }

      let enriched = results.map((card) => {
        const inv = findInventoryMatch(card, inventory, pokemonInventory);
        return {
          ...card,
          inStock: !!(inv && inv.quantity > 0),
          stockCard: inv && inv.quantity > 0 ? inv : null
        };
      });

      if (inStockOnly) {
        enriched = enriched.filter((card) => card.stockCard);
      }

      setCardResults(enriched);
    } finally {
      setSearching(false);
    }
  };

  const runAdvancedSearch = async (game, apiQuery) => {
    setSearching(true);
    try {
      let results = await runAdvancedCatalogSearch(game, apiQuery);
      results = enrichSearchResultsWithInventory(results, inventory, pokemonInventory);
      if (inStockOnly) {
        results = results.filter((card) => card.stockCard);
      }
      setCardResults(results);
      setAdvancedSummary('Advanced filters applied');
    } catch (error) {
      console.error('Mobile advanced search failed:', error);
      toast.error('Advanced search failed');
      setCardResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleHeaderSearch = async (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (!value.trim()) {
      setHeaderSearchResults([]);
      return;
    }
    if (headerSearchRef.current) clearTimeout(headerSearchRef.current);
    headerSearchRef.current = setTimeout(async () => {
      setHeaderSearching(true);
      const results = await searchAllGamesLocal(value, 8);
      setHeaderSearchResults(results);
      setHeaderSearching(false);
    }, 400);
  };

  const handlePageSearch = (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      applySearchParams({
        search: value.trim(),
        game: selectedGame,
        inStock: inStockOnly
      });
    }, 350);
  };

  const handleGameChange = (game) => {
    setSelectedGame(game);
    setBrowsePage(0);
    applySearchParams({
      search: searchQuery.trim(),
      game,
      inStock: inStockOnly
    });
  };

  const toggleInStockOnly = () => {
    applySearchParams({
      search: searchQuery.trim(),
      game: selectedGame,
      inStock: !inStockOnly,
      advancedSearch: advancedSearchParam,
      aq: advancedApiQuery || ''
    });
  };

  const clearAllFilters = () => {
    setAdvancedSummary('');
    setSearchQuery('');
    setSelectedGame('all');
    setCardResults([]);
    setSearchParams({});
    setFiltersOpen(false);
  };

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }) => {
      if (user) {
        if (quantity <= 0) await backend.data.CartItem.delete(id);
        else await backend.data.CartItem.update(id, { quantity });
      }
    },
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (id) => user ? backend.data.CartItem.delete(id) : Promise.resolve(),
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (id) => user ? backend.data.Wishlist.delete(id) : Promise.resolve(),
    onSuccess: () => user && queryClient.invalidateQueries(['wishlist'])
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: (item) => user ? backend.data.CartItem.create({ card_id: item.product_id, card_name: item.product_name, card_image: getCardImageUrl(item), price: item.price, quantity: 1, user_email: user.email }) : Promise.resolve(),
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const addToCartMutation = useMutation({
    mutationFn: async (card) => {
      const stockCard = card?.stockCard || card;
      if (!stockCard) return;

      if (user?.email) {
        await backend.data.CartItem.create({
          card_id: stockCard.id,
          card_name: stockCard.name,
          card_image: getCardImageUrl(stockCard),
          price: stockCard.price,
          quantity: 1,
          user_email: user.email
        });
        return;
      }

      addToGuestCart({
        card_id: stockCard.id,
        card_name: stockCard.name,
        card_image: getCardImageUrl(stockCard),
        price: stockCard.price,
        quantity: 1
      });
    },
    onSuccess: () => {
      if (user?.email) {
        queryClient.invalidateQueries(['cart']);
      }
      toast.success('Added to cart');
    }
  });

  const handleContactRequest = async () => {
    if (!contactEmail.includes('@')) {
      toast.error('Enter a valid email');
      return;
    }
    await backend.actions.invoke('sendProductRequest', {
      productName: contactCard.name,
      setName: contactCard.set_name,
      cardNumber: contactCard.card_number || '',
      rarity: contactCard.rarity || '',
      requestType: 'card',
      customerEmail: contactEmail
    });
    toast.success(`Stock alert created for ${contactEmail}`);
    setContactCard(null);
    setContactEmail('');
  };

  const hasSearch = Boolean(searchQuery.trim() || selectedGame !== 'all' || advancedSearchParam);
  const isBrowseMode = !advancedSearchParam && !searchQuery.trim() && selectedGame !== 'all';
  const browseInventory = isBrowseMode
    ? inventory
      .filter((item) => item?.status === 'active' && item?.game === selectedGame)
      .filter((item) => !inStockOnly || Number(item?.quantity || 0) > 0)
      .slice()
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')))
    : [];
  const browsePageCount = Math.max(1, Math.ceil(browseInventory.length / BROWSE_PAGE_SIZE));
  const clampedBrowsePage = Math.min(browsePage, browsePageCount - 1);
  const browseCards = browseInventory.slice(
    clampedBrowsePage * BROWSE_PAGE_SIZE,
    (clampedBrowsePage + 1) * BROWSE_PAGE_SIZE
  ).map((card) => ({
    ...card,
    stockCard: card,
    inStock: Number(card?.quantity || 0) > 0
  }));
  const displayedCards = isBrowseMode ? browseCards : cardResults;
  const showEmpty = !searching && displayedCards.length === 0 && hasSearch;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <MobileHeader
        searchQuery={searchQuery}
        onSearchChange={handleHeaderSearch}
        onSearchSubmit={() => {
          if (searchQuery.trim()) {
            applySearchParams({ search: searchQuery.trim(), game: selectedGame, inStock: inStockOnly });
          }
        }}
        menuOpen={menuOpen}
        onMenuChange={setMenuOpen}
        user={user}
        onLogin={() => backend.auth.redirectToLogin(window.location.href)}
        onLogout={() => backend.auth.logout()}
        searchResults={headerSearchResults}
        onResultClick={(result) => {
          setHeaderSearchResults([]);
          applySearchParams({ search: result.name, game: result.game, inStock: false });
        }}
        onClearSearch={() => {
          setHeaderSearchResults([]);
          setSearchQuery('');
        }}
        searching={headerSearching}
      />

      <main className="flex-1 px-4 py-4 space-y-4">
        <section className="border-y border-slate-200 bg-white py-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Singles</div>
                <h1 className="mt-1 text-lg font-black text-slate-900">
                  {selectedGame !== 'all'
                    ? `${GAME_OPTIONS.find((item) => item.value === selectedGame)?.label || 'Card'} singles`
                    : 'Browse singles'}
                </h1>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFiltersOpen(true)}
                className="h-10 border-slate-200 px-4"
              >
                <SlidersHorizontal className="mr-2 h-4 w-4" />
                Filter
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder={selectedGame !== 'all' ? `Search ${GAME_OPTIONS.find((item) => item.value === selectedGame)?.label || 'cards'}` : 'Search card name...'}
                value={searchQuery}
                onChange={handlePageSearch}
                className="h-11 border-slate-200 bg-white pl-10"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Select value={selectedGame} onValueChange={handleGameChange}>
                <SelectTrigger className="h-11 border-slate-200 bg-white text-left">
                  <SelectValue placeholder="Choose a game" />
                </SelectTrigger>
                <SelectContent>
                  {GAME_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-wrap gap-2">
              {advancedSearchParam && (
                <Badge className="rounded-full bg-slate-900 text-white">{advancedSummary || 'Advanced Search'}</Badge>
              )}
              {selectedGame !== 'all' && (
                <Badge variant="outline" className="rounded-full border-slate-300 bg-slate-50 text-slate-700">
                  {GAME_OPTIONS.find((item) => item.value === selectedGame)?.label}
                </Badge>
              )}
              {inStockOnly && (
                <Badge variant="outline" className="rounded-full border-emerald-300 bg-emerald-50 text-emerald-700">
                  In stock only
                </Badge>
              )}
              {hasSearch && (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-800 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>
        </section>

        {!hasSearch && (
          <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-5 text-center">
            <p className="text-sm font-semibold text-slate-900">Pick a game to start browsing singles</p>
            <p className="mt-1 text-sm text-slate-500">Use the top search if you already know the card name.</p>
          </section>
        )}

        {searching && (
          <div className="space-y-3">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="flex gap-3">
                  <Skeleton className="h-24 w-16 rounded-2xl bg-slate-100" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4 bg-slate-100" />
                    <Skeleton className="h-3 w-1/2 bg-slate-100" />
                    <Skeleton className="h-9 w-full rounded-xl bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!searching && displayedCards.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">
                {isBrowseMode
                  ? `${browseInventory.length} cards`
                  : `${cardResults.length} results`}
              </div>
              <div className="text-xs text-slate-500">
                {isBrowseMode
                  ? `Page ${clampedBrowsePage + 1} of ${browsePageCount}`
                  : advancedSearchParam ? 'Advanced search' : 'Search results'}
              </div>
            </div>

            {displayedCards.map((card, index) => (
              <article
                key={`${card.id}-${index}`}
                className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm"
              >
                <div className="flex gap-3">
                  <div className="h-24 w-16 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                    {getCardImageUrl(card) ? (
                      <img
                        src={getCardImageUrl(card)}
                        alt={card.name}
                        className="h-full w-full object-contain"
                        loading="lazy"
                        onError={(event) => handleCardImageError(event, card, (image) => {
                          image.nextSibling.style.display = 'flex';
                        })}
                      />
                    ) : null}
                    <div className={`${getCardImageUrl(card) ? 'hidden' : 'flex'} h-full w-full items-center justify-center text-[10px] text-slate-400`}>
                      No Image
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold leading-tight text-slate-900">{card.name}</h3>
                        {card.set_name && (
                          <p className="mt-1 text-xs text-slate-500">{card.set_name}</p>
                        )}
                      </div>
                      {card.stockCard ? (
                        <Badge className="rounded-full bg-emerald-600 text-white">In Stock</Badge>
                      ) : (
                        <Badge variant="outline" className="rounded-full border-slate-300 text-slate-500">
                          Need stock
                        </Badge>
                      )}
                    </div>

                    <div className="mt-3 flex items-end justify-between gap-3">
                      <div>
                        {card.stockCard ? (
                          <>
                            <p className="text-lg font-black text-slate-900">${card.stockCard.price?.toFixed(2)}</p>
                            <p className="text-xs text-slate-500">{card.stockCard.quantity || 1} available</p>
                          </>
                        ) : (
                          <>
                            {card.price != null && <p className="text-sm font-semibold text-slate-700">Market ~${card.price.toFixed(2)}</p>}
                            <p className="text-xs text-slate-500">Out of stock right now</p>
                          </>
                        )}
                      </div>

                      {card.stockCard ? (
                        <Button
                          size="sm"
                          onClick={() => addToCartMutation.mutate(card)}
                          className="h-10 rounded-2xl bg-slate-900 px-4 text-white hover:bg-slate-800"
                        >
                          <ShoppingCart className="mr-2 h-4 w-4" />
                          Add to Cart
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setContactCard(card)}
                          className="h-10 rounded-2xl border-slate-300 px-4"
                        >
                          <Mail className="mr-2 h-4 w-4" />
                          Notify Me
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            ))}

            {isBrowseMode && browsePageCount > 1 && (
              <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-white p-2 shadow-sm">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={clampedBrowsePage === 0}
                  onClick={() => setBrowsePage((current) => Math.max(0, current - 1))}
                  className="rounded-2xl"
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <div className="text-xs font-semibold text-slate-500">
                  {clampedBrowsePage + 1} / {browsePageCount}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={clampedBrowsePage >= browsePageCount - 1}
                  onClick={() => setBrowsePage((current) => Math.min(browsePageCount - 1, current + 1))}
                  className="rounded-2xl"
                >
                  Next
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            )}
          </section>
        )}

        {showEmpty && (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="text-base font-bold text-slate-900">No cards matched this search</p>
            <p className="mt-2 text-sm text-slate-500">
              Try a broader search term, switch games, or use advanced search to refine more carefully.
            </p>
          </div>
        )}
      </main>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-[28px] px-0">
          <SheetHeader className="px-4 pb-2">
            <SheetTitle>Mobile Search Filters</SheetTitle>
          </SheetHeader>

          <div className="space-y-5 px-4 pb-6">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Quick Filters</div>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-2 text-sm font-semibold text-slate-900">Game</div>
                  <Select value={selectedGame} onValueChange={handleGameChange}>
                    <SelectTrigger className="h-11 rounded-2xl border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_OPTIONS.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <button
                  type="button"
                  onClick={toggleInStockOnly}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left ${
                    inStockOnly
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-sm font-semibold">In stock only</div>
                    <div className="text-xs opacity-80">Hide cards that only support alerts</div>
                  </div>
                  <Badge className={inStockOnly ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}>
                    {inStockOnly ? 'On' : 'Off'}
                  </Badge>
                </button>

                <Button
                  type="button"
                  variant="outline"
                  onClick={clearAllFilters}
                  className="h-11 w-full rounded-2xl border-slate-200"
                >
                  Reset mobile filters
                </Button>
              </div>
            </div>

            <div>
              <AdvancedSearch
                initialGame={selectedGame === 'all' ? 'magic' : selectedGame}
                onSearch={(apiQuery, displayQuery, game) => {
                  setAdvancedSummary(displayQuery || 'Advanced Search');
                  applySearchParams({
                    search: displayQuery || 'Advanced Search',
                    game,
                    advancedSearch: true,
                    aq: apiQuery,
                    inStock: inStockOnly
                  });
                  setFiltersOpen(false);
                }}
              />
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {contactCard && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
          <div className="bg-white rounded-t-3xl w-full p-6">
            <h3 className="font-bold text-lg mb-1">Get a stock alert</h3>
            <p className="text-sm text-slate-600 mb-4">
              We will email you when {contactCard.name}{contactCard.set_name ? ` from ${contactCard.set_name}` : ''} is available.
            </p>
            <Input
              type="email"
              placeholder="you@example.com"
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
              className="mb-3"
            />
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setContactCard(null)}>Cancel</Button>
              <Button className="flex-1 bg-slate-900 hover:bg-slate-800 text-white" onClick={handleContactRequest}>Create Alert</Button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        wishlistCount={wishlistItems.length}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="Shop"
      />
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={(id, qty) => updateCartMutation.mutate({ id, quantity: qty })}
        onRemove={(id) => removeFromCartMutation.mutate(id)}
      />
      <WishlistDrawer
        open={wishlistOpen}
        onClose={() => setWishlistOpen(false)}
        items={wishlistItems}
        onAddToCart={(item) => addToCartFromWishlistMutation.mutate(item)}
        onRemove={(id) => removeFromWishlistMutation.mutate(id)}
        user={user}
      />
    </div>
  );
}
