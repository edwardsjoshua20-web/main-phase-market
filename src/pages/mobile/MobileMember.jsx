import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { backend } from '@/services/backend';
import {
  GitCompare, Swords, Star, Camera, Loader2, Award,
  Edit2, Check, X, LogIn, ChevronRight,
  SquareStack, MessagesSquare
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import { getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const GAME_LABELS = {
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  onepiece: 'One Piece TCG',
  flesh_and_blood: 'Flesh & Blood',
};

const BADGES = [
  { id: 'first_order',        label: 'First Pull',       emoji: '🎴', threshold: 1  },
  { id: 'five_orders',        label: 'Pack Ripper',      emoji: '📦', threshold: 5  },
  { id: 'ten_orders',         label: 'Decksmith',        emoji: '⚒️', threshold: 10 },
  { id: 'twenty_five_orders', label: 'Card Shark',       emoji: '🦈', threshold: 25 },
  { id: 'fifty_orders',       label: 'Mythic Collector', emoji: '✨', threshold: 50 },
];

const TOOLS = [
  { icon: GitCompare,    title: 'Card Comparison',       path: '/CardComparison',        color: 'bg-purple-500' },
  { icon: Swords,        title: 'Deck Builder',          path: '/MobileDeckBuilder',     color: 'bg-green-500'  },
  { icon: SquareStack,   title: 'Community Decks',       path: '/MobileCommunityDecks',  color: 'bg-indigo-500' },
  { icon: MessagesSquare,title: 'Community Forum',       path: '/MobileForum',           color: 'bg-teal-500'   },
];

export default function MobileMember() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editGame, setEditGame] = useState('');
  const [saving, setSaving] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [guestCart, setGuestCartState] = useState([]);
  const [guestWishlist, setGuestWishlistState] = useState([]);
  const fileInputRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) {
        const me = await backend.auth.getCurrentUser();
        setUser(me);
        setEditBio(me.bio || '');
        setEditGame(me.favorite_game || '');
        const userOrders = await backend.data.Order.filter({ customer_email: me.email });
        setOrders(userOrders);
      } else {
        setGuestCartState(getGuestCart());
        setGuestWishlistState(getGuestWishlist());
      }
      setIsLoading(false);
    });
  }, []);

  const { data: dbCartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: () => backend.data.CartItem.filter({ user_email: user.email }),
    enabled: !!user?.email,
  });
  const { data: dbWishlistItems = [] } = useQuery({
    queryKey: ['wishlist', user?.email],
    queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }),
    enabled: !!user?.email,
  });

  const cartItems = user ? dbCartItems : guestCart;
  const wishlistItems = user ? dbWishlistItems : guestWishlist;

  const updateCartMutation = useMutation({
    mutationFn: async ({ id, quantity }) => {
      if (quantity <= 0) await backend.data.CartItem.delete(id);
      else await backend.data.CartItem.update(id, { quantity });
    },
    onSuccess: () => queryClient.invalidateQueries(['cart']),
  });

  const removeFromCartMutation = useMutation({
    mutationFn: (id) => backend.data.CartItem.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['cart']),
  });

  const removeFromWishlistMutation = useMutation({
    mutationFn: (id) => backend.data.Wishlist.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['wishlist']),
  });

  const addToCartFromWishlistMutation = useMutation({
    mutationFn: async (item) => backend.data.CartItem.create({
      card_id: item.product_id, card_name: item.product_name,
      card_image: item.product_image, price: item.price,
      quantity: 1, user_email: user.email,
    }),
    onSuccess: () => queryClient.invalidateQueries(['cart']),
  });

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await backend.files.upload({ file });
      await backend.auth.updateProfile({ avatar_url: file_url });
      setUser(prev => ({ ...prev, avatar_url: file_url }));
      toast.success('Profile picture updated!');
    } catch (err) {
      console.error('Mobile member avatar upload failed:', err);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await backend.auth.updateProfile({ bio: editBio, favorite_game: editGame });
      setUser(prev => ({ ...prev, ...updated, bio: editBio, favorite_game: editGame }));
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err) {
      console.error('Mobile member profile save failed:', err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900">
      <Loader2 className="w-8 h-8 animate-spin text-yellow-400" />
    </div>
  );

  // Not logged in
  if (!user) return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <MobileHeader user={null} onLogin={() => backend.auth.redirectToLogin(window.location.href)} menuOpen={menuOpen} onMenuChange={setMenuOpen} searchResults={[]} searching={false} />
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center pb-24">
        <div className="w-20 h-20 rounded-full bg-yellow-400 flex items-center justify-center mb-6">
          <Star className="w-10 h-10 text-gray-900" />
        </div>
        <h1 className="text-2xl font-bold text-white mb-3">Members Area</h1>
        <p className="text-gray-400 mb-8">Sign in to access your profile, badges, and exclusive member tools.</p>
        <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-8 h-12 w-full max-w-xs">
          <LogIn className="w-4 h-4 mr-2" /> Sign In / Sign Up
        </Button>
      </div>
      <MobileBottomNav cartCount={0} wishlistCount={0} onCartClick={() => {}} onWishlistClick={() => {}} currentPage="MobileMember" />
    </div>
  );

  const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const orderCount = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const earnedBadges = BADGES.filter(b => orderCount >= b.threshold);
  const nextBadge = BADGES.find(b => orderCount < b.threshold) || null;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col pb-16">
      <MobileHeader
        user={user}
        onLogin={() => backend.auth.redirectToLogin(window.location.href)}
        onLogout={() => backend.auth.logout()}
        menuOpen={menuOpen}
        onMenuChange={setMenuOpen}
        searchResults={[]}
        searching={false}
      />

      {/* Profile Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white px-4 pt-6 pb-8">
        <div className="flex items-center gap-4 mb-4">
          {/* Avatar */}
          <div className="relative cursor-pointer group" onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="w-20 h-20 rounded-full border-4 border-yellow-400 overflow-hidden">
              {uploading ? (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-yellow-400" />
                </div>
              ) : user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-yellow-400 flex items-center justify-center text-gray-900 text-xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute bottom-0 right-0 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
              <Camera className="w-3 h-3 text-gray-900" />
            </div>
          </div>

          {/* Name */}
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-1 bg-yellow-400 text-gray-900 px-2 py-0.5 rounded-full text-xs font-bold mb-1">
              <Star className="w-3 h-3" /> Member
            </div>
            <p className="font-bold text-white text-lg leading-tight truncate">{user.full_name}</p>
            <p className="text-gray-400 text-xs truncate">{user.email}</p>
            {user.favorite_game && <p className="text-yellow-400 text-xs mt-0.5">🎮 {GAME_LABELS[user.favorite_game]}</p>}
          </div>

          {/* Edit button */}
          {!editing ? (
            <Button size="sm" onClick={() => setEditing(true)} className="bg-gray-700 hover:bg-gray-600 text-white border border-gray-600 shrink-0">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <div className="flex gap-1 shrink-0">
              <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="bg-yellow-400 text-gray-900 font-bold px-3">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditBio(user.bio||''); setEditGame(user.favorite_game||''); }} className="text-gray-300 px-2">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>

        {user.bio && !editing && <p className="text-gray-300 text-sm italic">"{user.bio}"</p>}

        {/* Edit form */}
        {editing && (
          <div className="mt-3 space-y-3">
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Bio</label>
              <Input value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="About you..." maxLength={160}
                className="mt-1 bg-gray-700 border-gray-600 text-white placeholder:text-gray-400 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Favorite Game</label>
              <Select value={editGame} onValueChange={setEditGame}>
                <SelectTrigger className="mt-1 bg-gray-700 border-gray-600 text-white text-sm"><SelectValue placeholder="Pick your game..." /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GAME_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-5 space-y-5">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { value: orderCount, label: 'Orders' },
            { value: `$${totalSpent.toFixed(0)}`, label: 'Spent' },
            { value: earnedBadges.length, label: 'Badges' },
          ].map(({ value, label }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
              <p className="text-2xl font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Badges */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="font-bold text-gray-900 mb-3 flex items-center gap-2">
            <Award className="w-4 h-4 text-yellow-500" /> Collector Badges
          </p>
          <div className="flex gap-2 flex-wrap">
            {BADGES.map(badge => {
              const locked = orderCount < badge.threshold;
              return (
                <div key={badge.id} className={`flex flex-col items-center px-2 py-2 rounded-xl border-2 min-w-[56px] text-center ${locked ? 'bg-gray-50 border-gray-200 opacity-40 grayscale' : 'bg-yellow-50 border-yellow-300'}`}>
                  <span className="text-lg">{badge.emoji}</span>
                  <span className="text-xs font-semibold leading-tight mt-1">{badge.label}</span>
                </div>
              );
            })}
          </div>
          {nextBadge && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Next: <span className="font-semibold text-gray-700">{nextBadge.label}</span> — {orderCount}/{nextBadge.threshold} orders</p>
              <div className="w-full bg-gray-100 rounded-full h-2">
                <div className="bg-yellow-400 h-2 rounded-full" style={{ width: `${Math.min(100, (orderCount / nextBadge.threshold) * 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        {/* Member Tools */}
        <div>
          <p className="font-bold text-gray-900 mb-3">Member Tools</p>
          <div className="space-y-2">
            {TOOLS.map((tool) => {
              const Icon = tool.icon;
              if (tool.locked) return (
                <div key={tool.title} className="flex items-center gap-3 bg-white border border-dashed border-gray-200 rounded-xl px-4 py-3 opacity-50">
                  <div className={`w-9 h-9 rounded-lg ${tool.color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="flex-1 font-medium text-gray-400 text-sm">{tool.title}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Soon</span>
                </div>
              );
              return (
                <Link key={tool.title} to={tool.path} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition-colors">
                  <div className={`w-9 h-9 rounded-lg ${tool.color} flex items-center justify-center shrink-0`}>
                    <Icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="flex-1 font-medium text-gray-900 text-sm">{tool.title}</span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      <MobileBottomNav
        cartCount={cartItems.reduce((s, i) => s + i.quantity, 0)}
        wishlistCount={wishlistItems.length}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="MobileMember"
      />

      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems}
        onUpdateQuantity={(id, qty) => updateCartMutation.mutate({ id, quantity: qty })}
        onRemove={(id) => removeFromCartMutation.mutate(id)} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={wishlistItems}
        onAddToCart={(item) => addToCartFromWishlistMutation.mutate(item)}
        onRemove={(id) => removeFromWishlistMutation.mutate(id)} user={user} />
    </div>
  );
}


