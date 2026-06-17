import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { Plus, Search, Loader2, MessageSquare, BookOpen, CheckCircle, Flame } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const GAME_OPTIONS = [
  { value: 'all', label: 'All Games' },
  { value: 'magic', label: 'Magic' },
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' }
];

const CATEGORY_OPTIONS = [
  { value: 'all', label: 'All Topics' },
  { value: 'rules_qa', label: 'Rules' },
  { value: 'deckbuilding', label: 'Deckbuilding' },
  { value: 'card_identification', label: 'Card Help' },
  { value: 'general', label: 'General' }
];

const CAT_META = {
  rules_qa: { label: 'Rules Q&A', color: 'bg-blue-100 text-blue-700' },
  deckbuilding: { label: 'Deckbuilding', color: 'bg-violet-100 text-violet-700' },
  card_identification: { label: 'Card Help', color: 'bg-amber-100 text-amber-700' },
  general: { label: 'General', color: 'bg-slate-100 text-slate-600' }
};

export default function MobileForum() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [game, setGame] = useState('all');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: '', content: '', game: 'magic', category: 'general' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  const { data: cartItems = [] } = useQuery({ queryKey: ['cart', user?.email], queryFn: () => backend.data.CartItem.filter({ user_email: user.email }), enabled: !!user?.email });
  const { data: wishlistItems = [] } = useQuery({ queryKey: ['wishlist', user?.email], queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }), enabled: !!user?.email });
  const guestCart = getGuestCart();
  const guestWishlist = getGuestWishlist();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['forum-posts', game, category],
    queryFn: () => {
      const filter = {};
      if (game !== 'all') filter.game = game;
      if (category !== 'all') filter.category = category;
      return backend.data.ForumPost.filter(filter, '-created_date', 60);
    },
    refetchInterval: 30000
  });

  const filtered = useMemo(() => posts.filter((post) => (
    !search
    || post.title?.toLowerCase().includes(search.toLowerCase())
    || post.content?.toLowerCase().includes(search.toLowerCase())
    || post.author_name?.toLowerCase().includes(search.toLowerCase())
  )), [posts, search]);

  const unansweredCount = filtered.filter((post) => (post.reply_count || 0) === 0).length;

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.content.trim() || !user) return;
    setSubmitting(true);
    try {
      await backend.data.ForumPost.create({
        ...form,
        author_email: user.email,
        author_name: user.full_name || user.email,
        view_count: 0,
        reply_count: 0,
        likes: 0,
        liked_by: []
      });
      qc.invalidateQueries(['forum-posts']);
      setShowNew(false);
      setForm({ title: '', content: '', game: 'magic', category: 'general' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col pb-16">
      <MobileHeader user={user} onLogin={() => backend.auth.redirectToLogin(window.location.href)} onLogout={() => backend.auth.logout()} menuOpen={menuOpen} onMenuChange={setMenuOpen} searchResults={[]} searching={false} />

      <main className="flex-1 py-3">
        <section className="px-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Main Phase Forum</div>
              <div className="mt-1 text-base font-black text-slate-900">{filtered.length} threads - {unansweredCount} open</div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate('/MobileRules')} variant="ghost" className="h-9 px-3">
                <BookOpen className="h-4 w-4" />
              </Button>
              {user && (
                <Button onClick={() => setShowNew(true)} className="h-9 bg-slate-900 px-3 text-white hover:bg-slate-800">
                  <Plus className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-white px-4 py-3">
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search topics..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 border-slate-200 bg-white pl-10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Select value={game} onValueChange={setGame}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GAME_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-11 border-slate-200 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORY_OPTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section>
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-slate-600" /></div>
          ) : filtered.length === 0 ? (
            <div className="border-y border-slate-200 bg-white px-6 py-12 text-center">
              <MessageSquare className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-base font-bold text-slate-900">No topics match right now</p>
              <p className="mt-2 text-sm text-slate-500">Try a different game, category, or search term.</p>
            </div>
          ) : filtered.map((post) => {
            const meta = CAT_META[post.category] || CAT_META.general;
            const time = post.last_reply_at || post.created_date
              ? formatDistanceToNow(new Date(post.last_reply_at || post.created_date), { addSuffix: true })
              : '';

            return (
              <button
                key={post.id}
                onClick={() => navigate(`/ForumThread?id=${post.id}`)}
                className="grid w-full grid-cols-[0.28rem_minmax(0,1fr)_3.2rem] gap-3 border-b border-slate-200 px-4 py-3 text-left transition-colors last:border-b-0 active:bg-slate-50"
              >
                <div className={`h-full min-h-14 w-1 rounded-full ${post.is_solved ? 'bg-emerald-500' : 'bg-gradient-to-b from-blue-500 via-cyan-400 to-slate-900'}`} />
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    {post.is_solved && <CheckCircle className="h-3.5 w-3.5 shrink-0 text-emerald-500" />}
                    <span className="truncate text-xs font-semibold text-slate-500">{meta.label}</span>
                    {(post.reply_count || 0) > 4 && <Flame className="h-3.5 w-3.5 text-amber-600" />}
                  </div>
                  <p className="line-clamp-2 text-sm font-bold leading-snug text-slate-950">{post.title}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                    <span className="truncate">{post.author_name}</span>
                    <span className="shrink-0">{time}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end justify-center text-slate-500">
                  <MessageSquare className="h-4 w-4" />
                  <span className="mt-1 text-xs font-bold">{post.reply_count || 0}</span>
                </div>
              </button>
            );
          })}
        </section>
      </main>

      {showNew && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="bg-white rounded-t-[28px] w-full max-h-[90vh] overflow-y-auto p-5">
            <h3 className="font-black text-lg mb-4">Start a thread</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Game</label>
                  <Select value={form.game} onValueChange={(value) => setForm((current) => ({ ...current, game: value }))}>
                    <SelectTrigger className="mt-1 h-11 rounded-2xl border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GAME_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Category</label>
                  <Select value={form.category} onValueChange={(value) => setForm((current) => ({ ...current, category: value }))}>
                    <SelectTrigger className="mt-1 h-11 rounded-2xl border-slate-200">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_OPTIONS.filter((item) => item.value !== 'all').map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Title</label>
                <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="What do you need help with?" className="mt-1" />
              </div>
              <div>
                <label className="text-xs text-slate-500 font-semibold uppercase tracking-wide">Details</label>
                <textarea
                  rows={5}
                  value={form.content}
                  onChange={(event) => setForm((current) => ({ ...current, content: event.target.value }))}
                  placeholder="Add the situation, card names, format, or what you have tried so far..."
                  className="w-full mt-1 border border-slate-200 rounded-2xl px-3 py-3 text-sm resize-none focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <Button variant="outline" className="flex-1" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button disabled={submitting || !form.title.trim() || !form.content.trim()} onClick={handleSubmit} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Post Thread'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <MobileBottomNav cartCount={(user ? cartItems : guestCart).reduce((sum, item) => sum + item.quantity, 0)} wishlistCount={(user ? wishlistItems : guestWishlist).length} onCartClick={() => setCartOpen(true)} onWishlistClick={() => setWishlistOpen(true)} currentPage="Forum" />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={user ? cartItems : guestCart} onUpdateQuantity={() => {}} onRemove={() => {}} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={user ? wishlistItems : guestWishlist} onAddToCart={() => {}} onRemove={() => {}} user={user} />
    </div>
  );
}
