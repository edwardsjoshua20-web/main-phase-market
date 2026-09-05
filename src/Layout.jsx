import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { brandAssets } from '@/config/appAssets';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { 
  Activity,
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
  Crown,
  SlidersHorizontal,
  Truck
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
import { useCartOwner } from '@/hooks/useCartOwner';
import { useWishlistOwner } from '@/hooks/useWishlistOwner';

const adminPages = ['AdminInventory', 'AdminOrders', 'AdminOperations', 'AdminShippingFulfillment'];

const gameOptions = [
  { value: 'magic', label: 'Magic' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh & Blood' },
  { value: 'starwars', label: 'Star Wars Unlimited' },
];

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const cart = useCartOwner(user);
  const cartItems = cart.items;
  const wishlist = useWishlistOwner(user);
  const wishlistItems = wishlist.items;

  const removeFromWishlistMutation = useMutation({
    mutationFn: (id) => wishlist.removeItem(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['wishlist'] })
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: async (wishlistItem) => {
      await cart.addItem({
        card_id: wishlistItem.product_id,
        card_name: wishlistItem.product_name,
        card_image: wishlistItem.product_image,
        price: wishlistItem.price,
        product_type: wishlistItem.product_type,
      }, 1);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] })
  });

  const cartCount = cart.itemCount;

  const isAdminPage = adminPages.includes(currentPageName);

  const handleLogin = () => {
    backend.auth.redirectToLogin(window.location.href);
  };

  const handleCreateAccount = () => {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    navigate(`/MemberLogin?mode=signup&returnTo=${encodeURIComponent(returnTo)}`);
  };

  const handleLogout = () => {
    backend.auth.logout();
  };

  const primaryNavItems = [
    { label: 'Home', to: '/', pages: ['Home'] },
    { label: 'Shop', to: '/Shop', pages: ['Shop'] },
    { label: 'Deck Builder', to: '/DeckBuilder', pages: ['AdvancedDeckBuilder', 'DeckBuilder'] },
    { label: 'Commander Hub', to: '/CommanderHub', pages: ['CommanderHub', 'CommanderDetail'], desktopOnly: true },
    { label: 'Community', to: '/CommunityDecks', pages: ['CommunityDecks'], desktopOnly: true },
    { label: 'Forum', to: '/Forum', pages: ['Forum', 'ForumThread'], desktopOnly: true }
  ];

  const primaryNavClass = (item) => {
    const isActive = item.pages.includes(currentPageName);
    return [
      'relative h-8 items-center whitespace-nowrap border-b-2 px-1 text-sm font-medium transition-colors',
      isActive
        ? 'border-sky-300 text-white'
        : 'border-transparent text-slate-300 hover:text-white'
    ].join(' ');
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
            navigate(createPageUrl('Shop') + `?type=single_card&search=${encodeURIComponent(result.name)}&game=${game}&canonical=1`);
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
          cartCount={cartCount}
          wishlistCount={wishlist.count}
          onCartClick={() => setCartOpen(true)}
          onWishlistClick={() => setWishlistOpen(true)}
          currentPage={currentPageName}
        />
        <CartDrawer 
          open={cartOpen} 
          onClose={() => setCartOpen(false)}
          items={cartItems}
          onUpdateQuantity={(id, qty) => cart.setQuantity(id, qty)}
          onRemove={(id) => cart.removeItem(id)}
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
      <header className="sticky top-0 z-50 w-full border-b border-slate-950/80 bg-slate-950 shadow-sm">
        <div className="bg-[#020814]">
         <HeaderShell>
           <div className="flex flex-col md:h-[56px] md:flex-row md:items-center gap-2 py-2 md:py-0 md:gap-3 xl:gap-4">
            {/* Logo */}
            <div className="flex items-center justify-between w-full md:w-auto gap-4">
              <Link to={createPageUrl('Home')} className="flex h-12 w-12 shrink-0 items-center justify-center gap-2 md:h-[56px] md:w-auto">
                <span
                  className="flex shrink-0 items-center justify-center"
                  style={{ width: 80, height: 52 }}
                >
                  <img
                    src="/logo-mark.png?v=20260820"
                    alt="Main Phase Market"
                    style={{ width: 52, height: 52, objectFit: 'contain' }}
                  />
                </span>
                <span className="hidden text-[17px] font-semibold tracking-wide text-white sm:block">Main Phase Market</span>
              </Link>

              {/* Mobile-only actions (right side of logo row on mobile) */}
              <div className="flex items-center gap-2 md:hidden">
                {!isAdminPage && (
                  <Button variant="ghost" size="icon" className="relative text-white hover:bg-gray-700 hover:text-white h-12 w-12" onClick={() => setWishlistOpen(true)}>
                    <Heart className="w-5 h-5" />
                    {wishlist.count > 0 && <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center bg-red-400 text-white text-xs font-bold">{wishlist.count}</Badge>}
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
                          <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminShippingFulfillment"><Truck className="w-4 h-4 mr-2" />Shipping</Link></DropdownMenuItem>
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
                          <Link to="/AdminShippingFulfillment" onClick={() => setMobileMenuOpen(false)} className="text-lg text-gray-700 hover:text-blue-600">Shipping</Link>
                        </>
                      )}
                    </nav>
                  </SheetContent>
                </Sheet>
              </div>
            </div>

            {/* Search Bar */}
            <div className="flex flex-1 w-full min-w-0 gap-0 justify-center max-w-3xl mx-auto">
              <Select
                value={selectedGame}
                onValueChange={setSelectedGame}
              >
                <SelectTrigger className="h-8 w-[150px] rounded-l-[5px] rounded-r-none border border-slate-700/80 border-r-slate-700 bg-[#020814] px-3 py-0 text-sm font-medium text-slate-100 shadow-none ring-offset-transparent hover:bg-[#071323] focus:ring-0 data-[state=open]:bg-[#071323]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-[5px] border-slate-700/80 bg-[#020814] text-slate-100 shadow-xl">
                  {gameOptions.map((game) => (
                    <SelectItem
                      key={game.value}
                      value={game.value}
                      className="rounded-[4px] text-slate-100 focus:bg-white/10 focus:text-white data-[state=checked]:bg-white/10 data-[state=checked]:text-white"
                    >
                      {game.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative flex-1 search-dropdown">
                <Input
                  placeholder="Search cards..."
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onFocus={() => searchResults.length > 0 && setShowSearchResults(true)}
                  className="h-8 rounded-none rounded-r-[5px] border-slate-300 bg-slate-50 pl-4 pr-11 text-sm text-slate-900 placeholder:text-slate-500 focus:bg-white"
                />
                <button
                  onClick={handleSearchButton}
                  className="absolute right-0 top-1/2 -translate-y-1/2 h-8 px-3 border-l border-slate-300 text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors flex items-center justify-center"
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
                              onClick={() => { resetSearch(); navigate(`/Shop?type=single_card&search=${encodeURIComponent(result.name)}&game=${selectedGame}&canonical=1`); }}
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
                  className="hidden h-8 rounded-[5px] border border-slate-700/80 bg-[#020814] px-3 text-sm font-medium text-slate-100 hover:bg-[#071323] lg:inline-flex"
                >
                  <SlidersHorizontal className="w-4 h-4 mr-2" />
                  Advanced Search
                </Button>
              )}
            </div>

            {/* Desktop-only actions (far right) */}
            <div className="hidden md:flex items-center gap-0 shrink-0">
              {!isAdminPage && (
                <Button variant="ghost" size="sm" className="relative h-8 rounded-[5px] px-2 text-slate-200 hover:bg-[#071323] hover:text-white" onClick={() => setWishlistOpen(true)}>
                <Heart className="w-4 h-4 mr-1.5" />
                <span>Wishlist</span>
                {wishlist.count > 0 && <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-red-400 text-white text-[10px] font-bold">{wishlist.count}</Badge>}
              </Button>
              )}
              {!isAdminPage && (
                <span className="mx-1 h-4 w-px bg-slate-600/70" aria-hidden="true" />
              )}
              {!isAdminPage && (
                <Button variant="ghost" size="sm" className="relative h-8 rounded-[5px] px-2 text-slate-200 hover:bg-[#071323] hover:text-white" onClick={() => setCartOpen(true)}>
                  <ShoppingCart className="w-4 h-4 mr-1.5" />
                  <span>Cart</span>
                  {cartCount > 0 && <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 flex items-center justify-center rounded-full bg-yellow-400 text-gray-900 text-[10px] font-bold">{cartCount}</Badge>}
                </Button>
              )}
              {!isAdminPage && (
                <span className="mx-1 h-4 w-px bg-slate-600/70" aria-hidden="true" />
              )}
              {user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 rounded-[5px] px-2 text-slate-200 hover:bg-[#071323] hover:text-white flex items-center gap-1.5">
                      <User className="w-4 h-4" />
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
                        <DropdownMenuItem asChild className="text-gray-700 font-semibold"><Link to="/AdminShippingFulfillment"><Truck className="w-4 h-4 mr-2" />Shipping</Link></DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-gray-200" />
                      </>
                    )}
                    <DropdownMenuItem onClick={handleLogout} className="text-gray-700"><LogOut className="w-4 h-4 mr-2" />Log out</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <>
                  <Button variant="ghost" size="sm" className="h-8 rounded-[5px] px-2 text-slate-200 hover:bg-[#071323] hover:text-white" onClick={handleLogin}>
                    <LogIn className="w-4 h-4 mr-2" />Sign In
                  </Button>
                  <span className="mx-1 h-4 w-px bg-slate-600/70" aria-hidden="true" />
                  <Button variant="ghost" size="sm" className="h-8 rounded-[5px] px-2 text-slate-200 hover:bg-[#071323] hover:text-white" onClick={handleCreateAccount}>
                    Create Account
                  </Button>
                </>
              )}
            </div>
            </div>
            </HeaderShell>
        </div>

            {/* Primary Navigation */}
        <div className="bg-[#0d2032] border-t border-white/5">
          <HeaderShell>
            <nav className="flex h-8 items-center gap-5 overflow-x-auto">
              {primaryNavItems.map((item) => {
                const hideClass = item.desktopOnly ? 'hidden md:flex' : 'flex';
                return (
                  <Link key={item.to} to={item.to} className={`${hideClass} ${primaryNavClass(item)}`}>
                    {item.label}
                  </Link>
                );
              })}
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
        onUpdateQuantity={(id, qty) => cart.setQuantity(id, qty)}
        onRemove={(id) => cart.removeItem(id)}
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
        <footer className="border-t border-slate-800 bg-[#07111f] text-white">
          <FooterShell className="py-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="max-w-sm">
                  <div className="flex items-center gap-2">
                    <img
                      src={brandAssets.logo}
                      alt="Main Phase Market"
                      className="h-7 w-auto"
                    />
                    <span className="text-sm font-semibold tracking-wide">Main Phase Market</span>
                  </div>
                </div>

                <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-medium text-slate-300 md:justify-end">
                  <a href="mailto:support@mainphasemarket.com" className="hover:text-white transition-colors">Contact</a>
                  <a href="mailto:support@mainphasemarket.com?subject=Shipping%20question" className="hover:text-white transition-colors">Shipping</a>
                  <a href="mailto:support@mainphasemarket.com?subject=Return%20question" className="hover:text-white transition-colors">Returns</a>
                  <a href="/OrderStatus" className="hover:text-white transition-colors">Order Status</a>
                  <a href="/MemberBenefits" className="hover:text-white transition-colors">Member Benefits</a>
                </nav>
              </div>

              <div className="mt-4 border-t border-slate-800 pt-3">
                <p className="text-[0.68rem] leading-5 text-slate-500">
                  Magic: The Gathering and its respective properties are © Wizards of the Coast. Yu-Gi-Oh! and its respective properties are © Studio Dice / Shueisha / TV Tokyo / Konami. Pokémon and its respective properties are © Pokémon Company International. Disney Lorcana and its respective properties are © Disney. All other game names, logos, and marks are property of their respective owners.
                </p>

                <div className="mt-3 flex flex-col items-start justify-between gap-1.5 border-t border-slate-800 pt-3 text-[0.68rem] text-slate-500 md:flex-row md:items-center">
                  <p>© {new Date().getFullYear()} Main Phase Market. All rights reserved.</p>
                  <p>* All cards under $1 are sold at a $1 minimum to cover packaging and handling costs.</p>
                </div>
              </div>
          </FooterShell>
        </footer>
      )}
    </div>
  );
}



