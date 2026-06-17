import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { Search, Loader2, Heart, Eye, SquareStack, Trophy, Plus } from 'lucide-react';

const GAME_LABELS = {
  magic: 'Magic',
  pokemon: 'Pokemon',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Lorcana',
  onepiece: 'One Piece',
  flesh_and_blood: 'Flesh and Blood',
  other: 'Other'
};

const GAME_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'magic', label: 'Magic' },
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' }
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Liked' },
  { value: 'views', label: 'Most Viewed' }
];

export default function MobileCommunityDecks() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [gameFilter, setGameFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selectedDeck, setSelectedDeck] = useState(null);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  const { data: cartItems = [] } = useQuery({ queryKey: ['cart', user?.email], queryFn: () => backend.data.CartItem.filter({ user_email: user.email }), enabled: !!user?.email });
  const { data: wishlistItems = [] } = useQuery({ queryKey: ['wishlist', user?.email], queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }), enabled: !!user?.email });
  const guestCart = getGuestCart();
  const guestWishlist = getGuestWishlist();

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['community-decks', gameFilter],
    queryFn: () => {
      const filter = { is_published: true };
      if (gameFilter !== 'all') filter.game = gameFilter;
      return backend.data.CommunityDeck.filter(filter, '-created_date', 80);
    }
  });

  const likeMutation = useMutation({
    mutationFn: async (deck) => {
      if (!user) return;
      const liked = (deck.liked_by || []).includes(user.email);
      const likedBy = liked ? deck.liked_by.filter((email) => email !== user.email) : [...(deck.liked_by || []), user.email];
      await backend.data.CommunityDeck.update(deck.id, { likes: likedBy.length, liked_by: likedBy });
    },
    onSuccess: () => qc.invalidateQueries(['community-decks'])
  });

  const filtered = useMemo(() => {
    const searched = decks.filter((deck) => (
      !search
      || deck.title?.toLowerCase().includes(search.toLowerCase())
      || deck.commander_name?.toLowerCase().includes(search.toLowerCase())
      || deck.user_name?.toLowerCase().includes(search.toLowerCase())
    ));

    return [...searched].sort((a, b) => {
      if (sort === 'popular') return (b.likes || 0) - (a.likes || 0);
      if (sort === 'views') return (b.views || 0) - (a.views || 0);
      return new Date(b.created_date || 0) - new Date(a.created_date || 0);
    });
  }, [decks, search, sort]);

  const totalLikes = filtered.reduce((sum, deck) => sum + (deck.likes || 0), 0);

  return (
    <div className="min-h-screen bg-white flex flex-col pb-16">
      <MobileHeader user={user} onLogin={() => backend.auth.redirectToLogin(window.location.href)} onLogout={() => backend.auth.logout()} menuOpen={menuOpen} onMenuChange={setMenuOpen} searchResults={[]} searching={false} />

      <main className="flex-1 py-3">
        <section className="px-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Community Decks</div>
              <div className="mt-1 text-base font-black text-slate-900">{filtered.length} decks - {totalLikes} likes</div>
            </div>
            {user && (
              <Button onClick={() => navigate('/CommunityDecks')} className="h-9 bg-slate-900 px-3 text-white hover:bg-slate-800">
                <Plus className="mr-2 h-4 w-4" />
                Share
              </Button>
            )}
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-3">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search decks, commanders, or creators..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 border-slate-200 bg-white pl-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 px-0">
              <Select value={gameFilter} onValueChange={setGameFilter}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAME_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SORT_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-600" /></div>
        ) : filtered.length === 0 ? (
          <div className="border-y border-slate-200 bg-white px-6 py-12 text-center">
            <SquareStack className="w-10 h-10 mx-auto mb-3 text-slate-300" />
            <p className="text-base font-bold text-slate-900">No decks yet</p>
            <p className="mt-2 text-sm text-slate-500">Try another search, or be the first to share one.</p>
          </div>
        ) : (
          <div className="border-y border-slate-200 bg-white">
            {filtered.map((deck) => {
              const hasLiked = user && (deck.liked_by || []).includes(user.email);
              const cardCount = (deck.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

              return (
                <button
                  key={deck.id}
                  onClick={() => setSelectedDeck(deck)}
                  className="w-full border-b border-slate-200 px-4 py-3 text-left transition-colors last:border-b-0 active:bg-slate-50"
                >
                  <div className="grid grid-cols-[0.28rem_minmax(0,1fr)_4.8rem] gap-3">
                    <div className="h-full min-h-14 w-1 rounded-full bg-gradient-to-b from-amber-400 via-orange-500 to-slate-900" />
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="truncate text-base font-black leading-tight text-slate-950">{deck.title}</p>
                        <span className="shrink-0 text-xs font-semibold text-slate-400">{deck.format || GAME_LABELS[deck.game] || deck.game || 'Deck'}</span>
                      </div>
                      {deck.commander_name && <p className="mt-1 truncate text-sm text-slate-600">{deck.commander_name}</p>}
                      <div className="mt-1 truncate text-xs text-slate-500">
                        {deck.user_name || 'Community'} - {cardCount} cards - {deck.views || 0} views
                      </div>
                    </div>
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        if (user) likeMutation.mutate(deck);
                      }}
                      className={`flex items-center justify-end gap-1 text-sm font-bold ${
                        hasLiked ? 'text-red-600' : 'text-slate-500'
                      }`}
                    >
                      <Heart className="h-4 w-4" fill={hasLiked ? 'currentColor' : 'none'} />
                      {deck.likes || 0}
                    </button>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>

      {selectedDeck && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="bg-white rounded-t-[28px] w-full max-h-[88vh] overflow-y-auto">
            {selectedDeck.commander_image && (
              <div className="h-52 bg-slate-900 relative">
                <img src={selectedDeck.commander_image} alt={selectedDeck.commander_name || selectedDeck.title} className="w-full h-full object-cover opacity-80" onError={(event) => { event.currentTarget.style.display = 'none'; }} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
                <div className="absolute bottom-4 left-4 right-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-300">
                    {selectedDeck.format || GAME_LABELS[selectedDeck.game] || 'Community Deck'}
                  </div>
                  <p className="mt-1 text-xl font-black text-white leading-tight">{selectedDeck.title}</p>
                </div>
              </div>
            )}

            <div className="p-5">
              {!selectedDeck.commander_image && <h2 className="font-black text-xl text-slate-900 mb-2">{selectedDeck.title}</h2>}

              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 mb-4">
                <span>by {selectedDeck.user_name || 'Community'}</span>
                <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{selectedDeck.views || 0}</span>
                <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" />{selectedDeck.likes || 0}</span>
              </div>

              {selectedDeck.commander_name && (
                <p className="text-sm text-slate-700 mb-3 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  {selectedDeck.commander_name}
                </p>
              )}

              {selectedDeck.description && <p className="text-sm text-slate-600 mb-4 leading-relaxed">{selectedDeck.description}</p>}

              {(selectedDeck.tags || []).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedDeck.tags.map((tag) => (
                    <span key={tag} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">#{tag}</span>
                  ))}
                </div>
              )}

              {(selectedDeck.items || []).length > 0 && (
                <div className="border-y border-slate-200 bg-white">
                  <p className="bg-slate-100 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Deck List ({selectedDeck.items.length})</p>
                  <div className="max-h-64 overflow-y-auto">
                    {selectedDeck.items.map((item, index) => (
                      <div key={`${item.product_name}-${index}`} className="grid grid-cols-[2.2rem_minmax(0,1fr)] border-b border-slate-200 px-3 py-2 text-sm last:border-b-0">
                        <span className="text-slate-500">{item.quantity || 1}x</span>
                        <span className="truncate font-semibold text-slate-900">{item.product_name || item.card_name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={() => setSelectedDeck(null)} className="mt-5 w-full bg-slate-900 text-white font-semibold py-3 rounded-2xl">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav cartCount={(user ? cartItems : guestCart).reduce((sum, item) => sum + item.quantity, 0)} wishlistCount={(user ? wishlistItems : guestWishlist).length} onCartClick={() => setCartOpen(true)} onWishlistClick={() => setWishlistOpen(true)} currentPage="CommunityDecks" />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={user ? cartItems : guestCart} onUpdateQuantity={() => {}} onRemove={() => {}} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={user ? wishlistItems : guestWishlist} onAddToCart={() => {}} onRemove={() => {}} user={user} />
    </div>
  );
}
