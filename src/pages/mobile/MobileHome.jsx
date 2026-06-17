import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import MobileQuickActions from '@/components/mobile/MobileQuickActions';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { searchAllGamesLocal } from '@/lib/localSearch';
import { getGuestCart, getGuestWishlist, removeFromGuestCart, removeFromGuestWishlist } from '@/components/utils/guestStorage';
import { inventoryListings } from '@/services/inventoryListings';

const GAME_LINKS = [
  { game: 'magic', label: 'MTG' },
  { game: 'pokemon', label: 'Pokemon' },
  { game: 'yugioh', label: 'Yu-Gi-Oh!' },
  { game: 'lorcana', label: 'Lorcana' },
  { game: 'onepiece', label: 'One Piece' },
  { game: 'flesh_and_blood', label: 'F&B' },
  { game: 'starwars', label: 'Star Wars' }
];

export default function MobileHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [user, setUser] = React.useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = React.useRef(null);

  React.useEffect(() => {
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

  const { data: featuredCards = [] } = useQuery({
    queryKey: ['mobile-featured'],
    queryFn: async () => {
      const cards = await inventoryListings.filter({ status: 'active' }, '-price', 12);
      return cards.filter((card) => card.quantity > 0).slice(0, 6);
    }
  });

  const handleSearchChange = async (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchAllGamesLocal(value, 10);
      setSearchResults(results);
      setSearching(false);
    }, 400);
  };

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }) => {
      if (user) {
        if (quantity <= 0) await backend.data.CartItem.delete(id);
        else await backend.data.CartItem.update(id, { quantity });
      } else {
        const cart = getGuestCart();
        if (quantity <= 0) removeFromGuestCart(id);
        else {
          const item = cart.find((card) => card.id === id);
          if (item) {
            item.quantity = quantity;
            localStorage.setItem('guestCart', JSON.stringify(cart));
          }
        }
      }
    },
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (id) => user ? backend.data.CartItem.delete(id) : (removeFromGuestCart(id), Promise.resolve()),
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: async (id) => {
      if (user) await backend.data.Wishlist.delete(id);
      else removeFromGuestWishlist(id);
    },
    onSuccess: () => user && queryClient.invalidateQueries(['wishlist'])
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: async (item) => {
      if (user) {
        await backend.data.CartItem.create({
          card_id: item.product_id,
          card_name: item.product_name,
          card_image: item.product_image,
          price: item.price,
          quantity: 1,
          user_email: user.email
        });
      }
    },
    onSuccess: () => user && queryClient.invalidateQueries(['cart'])
  });

  const featuredItems = featuredCards.slice(0, 6);

  return (
    <div className="min-h-screen bg-white flex flex-col pb-16">
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
        onResultClick={(result) => { setSearchQuery(''); setSearchResults([]); navigate(`/MobileShop?search=${encodeURIComponent(result.name)}&game=${result.game}`); }}
        onClearSearch={() => { setSearchQuery(''); setSearchResults([]); }}
        searching={searching}
      />

      <main className="flex-1 px-4 py-3 space-y-5">
        <section>
          <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Browse Games</div>
          <div className="overflow-hidden border-y border-slate-200 bg-white">
            {GAME_LINKS.map(({ game, label }) => (
              <Link
                key={game}
                to={`/MobileShop?game=${game}`}
                className="flex items-center justify-between border-b border-slate-200 py-3 text-sm font-semibold text-slate-900 last:border-b-0 active:bg-slate-50"
              >
                <span>{label}</span>
                <ChevronRight className="h-4 w-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </section>

        {featuredItems.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950">Hot Right Now</h2>
              <Link to="/MobileShop?game=magic" className="flex items-center gap-1 text-sm font-medium text-blue-600">
                Browse singles <ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="overflow-hidden border-y border-slate-200 bg-white">
              {featuredItems.map((card) => (
                <Link
                  key={card.id}
                  to={`/MobileShop?search=${encodeURIComponent(card.name)}`}
                  className="flex items-center gap-3 border-b border-slate-200 py-3 last:border-b-0 active:bg-slate-50"
                >
                  <div className="h-16 w-12 shrink-0 bg-slate-100">
                    {card.image_url
                      ? <img src={card.image_url} alt={card.name} className="h-full w-full object-contain p-1" />
                      : <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">No Image</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-900">{card.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{card.set_name || 'Featured inventory'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-bold text-blue-600">${card.price?.toFixed(2)}</p>
                    <ChevronRight className="ml-auto mt-1 h-4 w-4 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <MobileQuickActions />
      </main>

      <footer className="bg-slate-900 px-4 py-4 text-white">
        <p className="text-slate-400 text-xs">© {new Date().getFullYear()} Main Phase Market. All rights reserved.</p>
        <p className="text-slate-500 text-xs mt-1">* Cards under $1 sold at $1 minimum.</p>
      </footer>

      <MobileBottomNav
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        wishlistCount={wishlistItems.length}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="Home"
      />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems} onUpdateQuantity={(id, qty) => updateCartMutation.mutate({ id, quantity: qty })} onRemove={(id) => removeFromCartMutation.mutate(id)} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={wishlistItems} onAddToCart={(item) => addToCartFromWishlistMutation.mutate(item)} onRemove={(id) => removeFromWishlistMutation.mutate(id)} user={user} />
    </div>
  );
}
