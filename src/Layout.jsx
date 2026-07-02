import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { brandAssets } from '@/config/appAssets';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { 
  ShoppingCart, 
  User, 
  Menu,
  Package,
  LogOut,
  LogIn,
  Search,
  Heart,
  Loader2,
  Swords,
  SquareStack,
  MessagesSquare,
  Crown,
  SlidersHorizontal
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import HeaderShell from '@/components/layout/HeaderShell';
import FooterShell from '@/components/layout/FooterShell';
import { useHeaderCardSearch } from '@/hooks/useHeaderCardSearch';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { getGuestCart, getGuestWishlist, removeFromGuestCart, removeFromGuestWishlist } from '@/components/utils/guestStorage';

const adminPages = ['AdminInventory', 'AdminOrders', 'AdminOperations'];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [guestCart, setGuestCart] = useState([]);
  const [guestWishlist, setGuestWishlist] = useState([]);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [isMobile, setIsMobile] = useState(false);
  const queryClient = useQueryClient();
  const {
    searchQuery,
    searchResults,
    showSearchResults,
    setShowSearchResults,
    searching,
    handleSearchChange: handleHeaderSearchChange,
    resetSearch
  } = useHeaderCardSearch({
    selectedGame,
    searchAcrossAllGames: isMobile,
    delayMs: 500
  });

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
    };
    
    // Check immediately
    handleResize();
    
    // Add listener for resize
    window.addEventListener('resize', handleResize);
    
    // Force recheck after a small delay in case layout shifts
    const timeoutId = setTimeout(handleResize, 100);
    
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const handleSearchChange = (e) => {
    handleHeaderSearchChange(e.target.value, isMobile);
  };

  const handleSearchButton = () => {
    if (searchQuery.trim()) {
      navigate(`/Shop?type=single_card&search=${encodeURIComponent(searchQuery)}&game=${selectedGame}`);
    }
  };

  useEffect(() => {
    const loadUser = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (isAuth) {
        const userData = await backend.auth.getCurrentUser();
        setUser(userData);
      } else {
        setGuestCart(getGuestCart());
        setGuestWishlist(getGuestWishlist());
      }
    };
    loadUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showSearchResults && !e.target.closest('.search-dropdown')) {
        setShowSearchResults(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [showSearchResults]);

  useEffect(() => {
    resetSearch();
  }, [selectedGame]);

  useEffect(() => {
    const handleGuestUpdate = () => {
      setGuestCart(getGuestCart());
      setGuestWishlist(getGuestWishlist());
    };
    window.addEventListener('guestCartUpdated', handleGuestUpdate);
    window.addEventListener('guestWishlistUpdated', handleGuestUpdate);
    return () => {
      window.removeEventListener('guestCartUpdated', handleGuestUpdate);
      window.removeEventListener('guestWishlistUpdated', handleGuestUpdate);
    };
  }, []);

  const { data: dbCartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: () => backend.data.CartItem.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const cartItems = user ? dbCartItems : guestCart;

  const { data: dbWishlistItems = [] } = useQuery({
    queryKey: ['wishlist', user?.email],
    queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const wishlistItems = user ? dbWishlistItems : guestWishlist;

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }) => {
      if (user) {
        if (quantity <= 0) {
          await backend.data.CartItem.delete(id);
        } else {
          await backend.data.CartItem.update(id, { quantity });
        }
      } else {
        const cart = getGuestCart();
        if (quantity <= 0) {
          removeFromGuestCart(id);
        } else {
          const item = cart.find(c => c.id === id);
          if (item) {
            item.quantity = quantity;
            setGuestCart(cart);
          }
        }
      }
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries(['cart']);
      }
    }
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (id) => {
      if (user) {
        return backend.data.CartItem.delete(id);
      } else {
        removeFromGuestCart(id);
        return Promise.resolve();
      }
    },
    onSuccess: () => {
      if (user) {
        queryClient.invalidateQueries(['cart']);
      }
    }
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (id) => {
      if (user) {
        await backend.data.Wishlist.delete(id);
      } else {
        removeFromGuestWishlist(id);
      }
    },
    onSuccess: () => { if (user) queryClient.invalidateQueries(['wishlist']); }
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: async (wishlistItem) => {
      if (user) {
        await backend.data.CartItem.create({
          card_id: wishlistItem.product_id,
          card_name: wishlistItem.product_name,
          card_image: wishlistItem.product_image,
          price: wishlistItem.price,
          quantity: 1,
          user_email: user.email
        });
      } else {
        const cart = getGuestCart();
        const existing = cart.find(c => c.card_id === wishlistItem.product_id);
        if (existing) {
          existing.quantity += 1;
        } else {
          cart.push({
            id: `guest-${wishlistItem.product_id}-${Date.now()}`,
            card_id: wishlistItem.product_id,
            card_name: wishlistItem.product_name,
            card_image: wishlistItem.product_image,
            price: wishlistItem.price,
            quantity: 1
          });
        }
        setGuestCart(cart);
      }
    },
    onSuccess: () => { if (user) queryClient.invalidateQueries(['cart']); }
  });

  const cartCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const isAdminPage = adminPages.includes(currentPageName);

  const handleLogin = () => {
    backend.auth.redirectToLogin(window.location.href);
  };

  const handleLogout = () => {
    backend.auth.logout();
  };

  if (isMobile) {
    return (
      <div className="min-h-screen bg-white w-full flex flex-col overflow-x-hidden pb-16">
        <MobileHeader
          searchQuery={searchQuery}
          onSearchChange={handleSearchChange}
          onSearchSubmit={handleSearchButton}
          menuOpen={mobileMenuOpen}
          onMenuChange={setMobileMenuOpen}
          user={user}
          onLogin={handleLogin}
          onLogout={handleLogout}
          searchResults={searchResults}
          onResultClick={(result) => {
            const game = result.game || 'pokemon';
            navigate(createPageUrl('Shop') + `?type=single_card&search=${encodeURIComponent(result.name)}&game=${game}`);
          }}
          onClearSearch={resetSearch}
          searching={searching}
        />
        <main className="flex-1 w-full">{children}</main>
        {/* Mobile Footer */}
        <footer className="bg-slate-900 text-white pb-16">
          <div className="px-4 py-8">
            <div className="flex items-center gap-2 mb-3">
              <img src={brandAssets.logo} alt="Main Phase Market" className="h-10 w-auto" />
              <span className="font-semibold text-base">Main Phase Market</span>
            </div>
            <p className="text-slate-400 text-xs mb-4">Your premier destination for trading card games.</p>
            <div className="grid grid-cols-2 gap-4 text-xs text-slate-400 mb-4">
              <div>
                <p className="mb-1"><strong className="text-white">Magic</strong> © Wizards of the Coast.</p>
                <p><strong className="text-white">Yu-Gi-Oh!</strong> © Konami.</p>
              </div>
              <div>
                <p className="mb-1"><strong className="text-white">Pokémon</strong> © Pokémon Company.</p>
                <p><strong className="text-white">Lorcana</strong> © Disney.</p>
              </div>
            </div>
            <p className="text-slate-500 text-xs">© {new Date().getFullYear()} Main Phase Market. All rights reserved.</p>
            <p className="text-slate-500 text-xs mt-1">* Cards under $1 sold at $1 minimum.</p>
          </div>
        </footer>
        <MobileBottomNav
          cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
          wishlistCount={wishlistItems.length}
          onCartClick={() => setCartOpen(true)}
          onWishlistClick={() => setWishlistOpen(true)}
          currentPage={currentPageName}
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

  return (
    <div className="min-h-screen bg-white w-full overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-gradient-to-br from-gray-900 via-gray-800 to-black shadow-sm w-full border-b-2 border-gray-700">
         <HeaderShell>
           <div className="flex flex-col md:flex-row md:items-center md:h-20 gap-2 py-3 md:py-0 md:gap-6">
            {/* Logo */}
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <Link to={createPageUrl('Home')} className="flex items-center gap-2 shrink-0 h-20 w-20 md:h-20 md:w-auto flex items-center justify-center">
                 <img
                   src={brandAssets.logo}
                   alt="Main Phase Market"
                   className="h-16 md:h-16 w-auto"
                 />
                <span className="text-white font-bold text-xl hidden sm:block">Main Phase Market</span>
              </Link>

              {/* Mobile-only actions (right side of logo row on mobile) */}
              <div className="flex items-center gap-2 md:hidden">
                {!isAdminPage && (
                  <Button variant="ghost" size="icon" className="relative text-white hover:bg-gray-700 hover:text-white h-12 w-12" onClick={() => setWishlistOpen(true)}>
                    <Heart className="w-5 h-5" />
                    {wishlistItems.length > 0 && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-400 text-white text-xs font-bold">{wishlistItems.length}</Badge>}
                  </Button>
                )}
                {!isAdminPage && (
                  <Button variant="ghost" size="icon" className="relative text-white hover:bg-gray-700 hover:text-white h-12 w-12" onClick={() => setCartOpen(true)}>
                    <ShoppingCart className="w-5 h-5" />
                    {cartCount > 0 && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-yellow-400 text-gray-900 text-xs font-bold">{cartCount}</Badge>}
                  </Button>
                )}
                {user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 hover:text-white flex items-center gap-1.5 px-2">
                        <User className="w-5 h-5" />
                        <span className="text-sm font-medium max-w-[80px] truncate hidden xs:inline">{user.full_name?.split(' ')[0]}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-white border-gray-200">
                      <div className="px-2 py-1.5">
                        <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </div>
                      <DropdownMenuSeparator className="bg-gray-200" />
                      <DropdownMenuItem asChild className="text-gray-700"><Link to={createPageUrl('DeckBuilder')}><Swords className="w-4 h-4 mr-2" />Deck Builder</Link></DropdownMenuItem>
                      <DropdownMenuItem asChild className="text-gray-700"><Link to={createPageUrl('AdvancedDeckBuilder')}><Swords className="w-4 h-4 mr-2" />Advanced Builder</Link></DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-gray-200" />
                      {user.role === 'admin' && (
                        <>
                          <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminInventory"><Package className="w-4 h-4 mr-2" />Inventory</Link></DropdownMenuItem>
                          <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminOperations"><Activity className="w-4 h-4 mr-2" />Operations</Link></DropdownMenuItem>
                          <DropdownMenuSeparator className="bg-gray-200" />
                        </>
                      )}
                      <DropdownMenuItem onClick={handleLogout} className="text-gray-700"><LogOut className="w-4 h-4 mr-2" />Log out</DropdownMenuItem>
                        </DropdownMenuContent>
                        </DropdownMenu>
                        ) : (
                        <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 hover:text-white" onClick={handleLogin}>
                        <LogIn className="w-4 h-4 mr-2" />Sign In
                        </Button>
                        )}
                      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon" className="text-white hover:bg-blue-500 hover:text-white h-12 w-12">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="bg-white border-gray-200">
                    <SheetHeader>
                      <SheetTitle className="text-gray-900">Menu</SheetTitle>
                    </SheetHeader>
                    <nav className="flex flex-col gap-4 mt-8">
                      <Link to={createPageUrl('Home')} onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-700 hover:text-blue-600">Shop</Link>
                      {user?.role === 'admin' && (
                        <>
                          <Link to={createPageUrl('AdminInventory')} onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-700 hover:text-blue-600">Inventory</Link>
                          <Link to={createPageUrl('AdminOrders')} onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-700 hover:text-blue-600">Orders</Link>
                          <Link to="/AdminOperations" onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-700 hover:text-blue-600">Operations</Link>
                        </>
                      )}
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-1 w-full gap-2 justify-center max-w-2xl mx-auto">
              <select
                value={selectedGame}
                onChange={(e) => setSelectedGame(e.target.value)}
                className="px-3 bg-gray-700 border border-gray-600 text-white rounded-md text-sm font-medium hover:bg-gray-600 focus:outline-none focus:bg-gray-600 cursor-pointer"
              >
                <option value="magic">Magic</option>
                <option value="pokemon">Pokémon</option>
                <option value="yugioh">Yu-Gi-Oh!</option>
                <option value="lorcana">Lorcana</option>
                <option value="onepiece">One Piece</option>
                <option value="flesh_and_blood">Flesh & Blood</option>
                <option value="starwars">Star Wars Unlimited</option>
              </select>
              <div className="relative flex-1 search-dropdown">
                <Input
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                  className="pl-4 pr-12 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 focus:bg-gray-600"
                />
                <button
                  onClick={handleSearchButton}
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-9 px-3 border-l border-gray-600 text-gray-400 hover:text-white hover:bg-gray-600 transition-colors flex items-center justify-center"
                >
                  <Search className="w-4 h-4" />
                </button>
                {showSearchResults && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-2xl z-50 search-dropdown">
                    {searchResults.length > 0 ? (
                      <>
                        <div className="max-h-[500px] overflow-y-auto">
                          {searchResults.map((result, idx) => (
                            <button
                              key={`${result.id}-${result.set_code}-${idx}`}
                              onClick={() => { resetSearch(); navigate(`/Shop?type=single_card&search=${encodeURIComponent(result.name)}&game=${selectedGame}`); }}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 border-b last:border-b-0 transition-colors text-left"
                            >
                              <div className="w-12 h-16 shrink-0 rounded border border-gray-200 bg-gray-100 overflow-hidden">
                                {getCardImageUrl(result) ? (
                                  <img
                                    src={getCardImageUrl(result)}
                                    alt={result.name}
                                    className="w-full h-full object-contain bg-white"
                                    loading="lazy"
                                    onError={(e) => handleCardImageError(e, result, (image) => {
                                      image.parentElement?.querySelector('[data-search-image-fallback]')?.classList.remove('hidden');
                                    })}
                                  />
                                ) : null}
                                <div
                                  data-search-image-fallback
                                  className={`${getCardImageUrl(result) ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-[10px] text-gray-400`}
                                >
                                  No Image
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900">{result.name}</p>
                                <p className="text-xs text-gray-500 mt-1">→ In {result.game === 'magic' ? 'Magic: The Gathering' : result.game === 'pokemon' ? 'Pokémon' : result.game === 'starwars' ? 'Star Wars Unlimited' : result.game}</p>
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {result.game === 'magic' ? 'All printings' : `${result.set_name} • ${result.set_code}`}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => navigate(`/Shop?type=single_card&search=${encodeURIComponent(searchQuery)}&game=${selectedGame}`)}
                          className="w-full p-3 text-center text-sm font-medium text-blue-600 hover:bg-blue-50 border-t border-gray-200 transition-colors"
                        >
                          View all results for "{searchQuery}"
                        </button>
                      </>
                    ) : searching ? (
                      <div className="p-8 text-center">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-500 mx-auto mb-2" />
                        <p className="text-sm text-gray-500">Searching...</p>
                      </div>
                    ) : (
                      <div className="p-6 text-center">
                        <p className="text-sm text-gray-500">No results found for "{searchQuery}"</p>
                        <p className="text-xs text-gray-400 mt-1">Try a different search term</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!isAdminPage && (
                <Button
                  type="button"
                  onClick={() => navigate(createPageUrl('Shop') + `?type=single_card&game=${selectedGame}&advancedSearch=1`)}
                  className="hidden lg:inline-flex bg-gray-700 border border-gray-600 text-white hover:bg-gray-600"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Advanced Search
                </Button>
              )}
            </div>

            {/* Desktop-only actions (far right) */}
            <div className="hidden md:flex items-center gap-1 shrink-0">
              {!isAdminPage && (
                <Button variant="ghost" size="icon" className="relative text-white hover:bg-gray-700 hover:text-white" onClick={() => setWishlistOpen(true)}>
                <Heart className="w-5 h-5" />
                {wishlistItems.length > 0 && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-400 text-white text-xs font-bold">{wishlistItems.length}</Badge>}
              </Button>
              )}
              {!isAdminPage && (
                <Button variant="ghost" size="icon" className="relative text-white hover:bg-gray-700 hover:text-white" onClick={() => setCartOpen(true)}>
                  <ShoppingCart className="w-5 h-5" />
                  {cartCount > 0 && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-yellow-400 text-gray-900 text-xs font-bold">{cartCount}</Badge>}
                </Button>
              )}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 hover:text-white flex items-center gap-1.5 px-2">
                      <User className="w-5 h-5" />
                      <span className="text-sm font-medium">{user.full_name?.split(' ')[0]}</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white border-gray-200">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                    </div>
                    <DropdownMenuItem asChild className="text-gray-700"><Link to="/MemberBenefits"><Crown className="w-4 h-4 mr-2" />Members</Link></DropdownMenuItem>
                    <DropdownMenuSeparator className="bg-gray-200" />
                    {user.role === 'admin' && (
                      <>
                        <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminInventory"><Package className="w-4 h-4 mr-2" />Inventory</Link></DropdownMenuItem>
                        <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminOperations"><Activity className="w-4 h-4 mr-2" />Operations</Link></DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-200" />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleLogout} className="text-gray-700"><LogOut className="w-4 h-4 mr-2" />Log out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button variant="ghost" size="sm" className="text-white hover:bg-gray-700 hover:text-white" onClick={handleLogin}>
                  <LogIn className="w-4 h-4 mr-2" />Sign In
                </Button>
              )}
            </div>
            </div>
            </HeaderShell>

            {/* Primary Navigation */}
        <div className="bg-gray-800 border-t border-gray-700">
          <HeaderShell>
            <nav className="flex items-center gap-6 h-11 overflow-x-auto">
              <Link to="/" className="text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                Home
              </Link>
              <Link to="/Shop" className="text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                Shop
              </Link>
              <Link to="/AdvancedDeckBuilder" className="text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                Deck Builder
              </Link>
              <Link to="/CommanderHub" className="hidden md:flex items-center gap-1.5 text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                <Swords className="w-4 h-4" /> Commander Hub
              </Link>
              <Link to="/CommunityDecks" className="hidden md:flex items-center gap-1.5 text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                <SquareStack className="w-4 h-4" /> Community
              </Link>
              <Link to="/Forum" className="hidden md:flex items-center gap-1.5 text-gray-300 hover:text-white text-sm font-medium whitespace-nowrap">
                <MessagesSquare className="w-4 h-4" /> Forum
              </Link>
            </nav>
          </HeaderShell>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full">{children}</main>

      {/* Cart Drawer */}
      <CartDrawer 
        open={cartOpen} 
        onClose={() => setCartOpen(false)}
        items={cartItems}
        onUpdateQuantity={(id, qty) => updateCartMutation.mutate({ id, quantity: qty })}
        onRemove={(id) => removeFromCartMutation.mutate(id)}
      />

      {/* Wishlist Drawer */}
      <WishlistDrawer 
        open={wishlistOpen} 
        onClose={() => setWishlistOpen(false)}
        items={wishlistItems}
        onAddToCart={(item) => addToCartFromWishlistMutation.mutate(item)}
        onRemove={(id) => removeFromWishlistMutation.mutate(id)}
        user={user}
      />

      {/* Footer */}
      {(
        <footer className="bg-slate-900 text-white">
          <FooterShell className="py-12">
              {/* Top Footer Section */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <img 
                      src={brandAssets.logo} 
                      alt="Main Phase Market" 
                      className="h-12 w-auto"
                    />
                    <span className="font-semibold text-lg">Main Phase Market</span>
                  </div>
                  <p className="text-slate-400 text-sm">
                    Your premier destination for trading card games.
                  </p>
                </div>
                <div>
                  <h4 className="font-semibold mb-3 text-white">Quick Links</h4>
                  <ul className="space-y-2 text-sm text-slate-400">
                    <li><a href="/Shop?game=magic" className="hover:text-white transition-colors">Magic: The Gathering</a></li>
                    <li><a href="/" className="hover:text-white transition-colors">Home</a></li>
                    <li><a href="/Shop" className="hover:text-white transition-colors">Shop</a></li>
                    <li><a href="/DeckBuilder" className="hover:text-white transition-colors">Deck Builder</a></li>
                    <li><a href="/Dice" className="hover:text-white transition-colors">Accessories</a></li>
                    <li><a href="/OrderStatus" className="hover:text-white transition-colors">Order Status</a></li>
                    <li><a href="/MemberBenefits" className="hover:text-white transition-colors">Member Benefits</a></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold mb-3 text-white">Games</h4>
                  <ul className="space-y-2 text-sm text-slate-400">
                    <li><a href="/Shop?game=pokemon" className="hover:text-white transition-colors">Pokémon TCG</a></li>
                    <li><a href="/Shop?game=yugioh" className="hover:text-white transition-colors">Yu-Gi-Oh!</a></li>
                    <li><a href="/Shop?game=lorcana" className="hover:text-white transition-colors">Disney Lorcana</a></li>
                    <li><a href="/Shop?game=starwars" className="hover:text-white transition-colors">Star Wars Unlimited</a></li>
                  </ul>
                </div>
              </div>

              {/* IP & Legal Notice */}
              <div className="border-t border-slate-700 pt-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-400 mb-6">
                  <div>
                    <p className="mb-2"><strong className="text-white">Magic: The Gathering</strong> and its respective properties are © Wizards of the Coast.</p>
                    <p className="mb-2"><strong className="text-white">Yu-Gi-Oh!</strong> and its respective properties are © Studio Dice / Shueisha / TV Tokyo / Konami.</p>
                  </div>
                  <div>
                    <p className="mb-2"><strong className="text-white">Pokémon</strong> and its respective properties are © Pokémon Company International.</p>
                    <p className="mb-2"><strong className="text-white">Disney Lorcana</strong> and its respective properties are © Disney.</p>
                  </div>
                </div>

                {/* Bottom Footer */}
                <div className="border-t border-slate-700 pt-6 flex flex-col md:flex-row justify-between items-center gap-4">
                  <p className="text-slate-400 text-sm">
                    © {new Date().getFullYear()} Main Phase Market. All rights reserved.
                  </p>
                  <p className="text-slate-400 text-sm">
                    * All cards under $1 are sold at a $1 minimum to cover packaging and handling costs.
                  </p>
                </div>
              </div>
          </FooterShell>
        </footer>
      )}
    </div>
  );
}



