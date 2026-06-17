import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { searchAllGamesLocal } from '@/lib/localSearch';
import { getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { gameAssets } from '@/config/appAssets';

const PRODUCT_TYPES = [
  { label: 'Single Cards', icon: '🃏', path: '/MobileShop?type=single_card' },
  { label: 'Booster Boxes', icon: '📦', path: '/MobileShop?type=booster_box' },
  { label: 'Dice', icon: '🎲', path: '/MobileShop?type=dice' },
  { label: 'Playmats & Accessories', icon: '🎴', path: '/MobileShop?type=accessories' },
  { label: 'Starter Decks', icon: '🗂️', path: '/MobileShop?type=starter_deck' },
];

const GAMES = [
  {
    game: 'magic',
    label: 'Magic: The Gathering',
    iconUrl: gameAssets.magic,
  },
  {
    game: 'pokemon',
    label: 'Pokémon TCG',
    iconUrl: gameAssets.pokemon,
  },
  {
    game: 'yugioh',
    label: 'Yu-Gi-Oh!',
    iconUrl: gameAssets.yugioh,
  },
  {
    game: 'lorcana',
    label: 'Disney Lorcana',
    iconUrl: gameAssets.lorcana,
  },
  {
    game: 'onepiece',
    label: 'One Piece TCG',
    iconUrl: gameAssets.onepiece,
  },
  {
    game: 'flesh_and_blood',
    label: 'Flesh & Blood',
    iconUrl: gameAssets.fleshAndBlood,
  },
];

export default function MobileBrowse() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchRef = React.useRef(null);

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

  const handleSearchChange = async (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (!val.trim()) { setSearchResults([]); return; }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAllGamesLocal(val, 8);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-16">
      <MobileHeader
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
        onSearchSubmit={() => { if (searchQuery.trim()) navigate(`/MobileShop?search=${encodeURIComponent(searchQuery)}`); }}
        menuOpen={menuOpen}
        onMenuChange={setMenuOpen}
        user={user}
        onLogin={() => backend.auth.redirectToLogin(window.location.href)}
        onLogout={() => backend.auth.logout()}
        searchResults={searchResults}
        onResultClick={(r) => { setSearchQuery(''); setSearchResults([]); navigate(`/MobileShop?search=${encodeURIComponent(r.name)}&game=${r.game}`); }}
        onClearSearch={() => { setSearchQuery(''); setSearchResults([]); }}
        searching={searching}
      />

      <main className="flex-1 px-4 py-5">
        {/* Shop by Type */}
        <h2 className="font-bold text-gray-900 text-base mb-3">Shop by Type</h2>
        <div className="grid grid-cols-2 gap-3 mb-7">
          {PRODUCT_TYPES.map(({ label, icon, path }) => (
            <Link key={label} to={path}
              className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col items-center text-center active:opacity-80 shadow-sm">
              <div className="text-3xl mb-2">{icon}</div>
              <p className="font-semibold text-sm text-gray-900">{label}</p>
            </Link>
          ))}
        </div>

        {/* Shop by Game */}
        <h2 className="font-bold text-gray-900 text-base mb-3">Shop by Game</h2>
        <div className="space-y-2">
          {GAMES.map(({ game, label, iconUrl }) => (
            <Link key={game} to={`/MobileShop?game=${game}`}
              className="flex items-center gap-4 bg-gray-800 text-white rounded-xl px-4 py-3.5 active:opacity-70 border border-gray-600">
              <img src={iconUrl} alt={label} className="w-8 h-8 object-contain" />
              <span className="font-semibold text-sm">{label}</span>
            </Link>
          ))}
        </div>
      </main>

      <MobileBottomNav
        cartCount={cartItems.reduce((s, i) => s + i.quantity, 0)}
        wishlistCount={wishlistItems.length}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="Shop"
      />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems}
        onUpdateQuantity={() => {}} onRemove={() => {}} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={wishlistItems}
        onAddToCart={() => {}} onRemove={() => {}} user={user} />
    </div>
  );
}


