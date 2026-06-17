import React, { useState, useEffect, useRef } from 'react';
import { backend } from '@/services/backend';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
  GitCompare, Swords, CheckCircle, LogIn, Star, ShieldCheck, Zap,
  ChevronRight, Lock, Camera, Loader2, ShoppingBag,
  Award, Edit2, Check, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
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
  { id: 'first_order',       label: 'First Pull',       description: 'Made your first purchase',        emoji: '🎴', color: 'bg-blue-100 border-blue-300 text-blue-700',     threshold: 1  },
  { id: 'five_orders',       label: 'Pack Ripper',      description: '5 purchases completed',           emoji: '📦', color: 'bg-green-100 border-green-300 text-green-700',  threshold: 5  },
  { id: 'ten_orders',        label: 'Decksmith',        description: '10 purchases completed',          emoji: '⚒️', color: 'bg-purple-100 border-purple-300 text-purple-700',threshold: 10 },
  { id: 'twenty_five_orders',label: 'Card Shark',       description: '25 purchases completed',          emoji: '🦈', color: 'bg-yellow-100 border-yellow-300 text-yellow-700',threshold: 25 },
  { id: 'fifty_orders',      label: 'Mythic Collector', description: '50 purchases — legendary status!',emoji: '✨', color: 'bg-orange-100 border-orange-300 text-orange-700', threshold: 50 },
];

const memberTools = [
  { icon: GitCompare,title: 'Card Comparison',     subtitle: 'Compare side-by-side',    description: 'Compare cards side-by-side — stats, rarity, price, and more.',                  color: 'bg-purple-500', lightColor: 'bg-purple-50 border-purple-200', textColor: 'text-purple-600', path: '/CardComparison',      available: true  },
  { icon: Swords,    title: 'Deck Builder',        subtitle: 'Build your decks',        description: 'Build, edit, and manage decks for the games you play without the extra clutter.', color: 'bg-green-500',  lightColor: 'bg-green-50 border-green-200',   textColor: 'text-green-600',  path: '/DeckBuilder',         available: true  },
];

function BadgePip({ badge, locked }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`relative flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border-2 cursor-default select-none transition-all
            ${locked ? 'bg-gray-50 border-gray-200 opacity-40 grayscale' : badge.color}`}>
            <span className="text-xl">{badge.emoji}</span>
            <span className="text-xs font-bold text-center leading-tight">{badge.label}</span>
            {locked && <span className="absolute top-0.5 right-1 text-xs">🔒</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-semibold">{badge.label}</p>
          <p className="text-xs text-gray-400">{badge.description}</p>
          {locked && <p className="text-xs text-gray-400 mt-1">Requires {badge.threshold} orders</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default function MemberBenefits() {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editBio, setEditBio] = useState('');
  const [editGame, setEditGame] = useState('');
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) {
        const me = await backend.auth.getCurrentUser();
        setUser(me);
        setEditBio(me.bio || '');
        setEditGame(me.favorite_game || '');
        const userOrders = await backend.data.Order.filter({ customer_email: me.email });
        setOrders(userOrders);
      }
      setIsLoading(false);
    });
  }, []);

  const handleSignIn = () => backend.auth.redirectToLogin(window.location.href);

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
      console.error('Member benefits avatar upload failed:', err);
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
      console.error('Member benefits profile save failed:', err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  // ── LOADING ──
  if (isLoading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  // ── LOGGED OUT: Marketing Page ──
  if (!user) return (
    <div className="min-h-screen bg-white">
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-20 px-4 text-center">
        <div className="max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
            <Star className="w-4 h-4" /> Members Only
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            Unlock the Full<br />Main Phase Experience
          </h1>
          <p className="text-gray-300 text-lg mb-8 max-w-xl mx-auto">
            Create a free account and get access to exclusive tools built for serious TCG players and collectors.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleSignIn} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold px-8 h-12 text-base">
              <LogIn className="w-4 h-4 mr-2" /> Sign Up / Log In
            </Button>
            <Link to={createPageUrl('Shop')}>
              <Button className="bg-gray-700 hover:bg-gray-600 text-white border border-gray-500 h-12 px-8 text-base w-full sm:w-auto">
                Browse Shop
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Everything Included, For Free</h2>
          <p className="text-gray-500 text-lg">All member benefits are completely free — just create an account.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {memberTools.map((tool) => {
            const Icon = tool.icon;
            return (
              <div key={tool.title} className={`border rounded-xl p-6 bg-white relative ${!tool.available ? 'border-dashed border-gray-300 opacity-70' : 'border-gray-200 hover:shadow-md transition-shadow'}`}>
                {!tool.available && <span className="absolute top-3 right-3 text-xs font-semibold bg-gray-200 text-gray-500 px-2 py-0.5 rounded-full">Coming Soon</span>}
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${tool.available ? tool.color : 'bg-gray-100'}`}>
                  <Icon className={`w-6 h-6 ${tool.available ? 'text-white' : 'text-gray-400'}`} />
                </div>
                <h3 className="font-bold text-gray-900 text-lg mb-2">{tool.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{tool.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-gray-50 border-t border-gray-200 py-12 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 text-gray-500 text-sm mb-8">
            <span className="flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-green-500" /> No credit card required</span>
            <span className="flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-500" /> Instant access</span>
            <span className="flex items-center gap-2"><Zap className="w-5 h-5 text-yellow-500" /> All features free</span>
          </div>
          <Button onClick={handleSignIn} className="bg-gray-800 hover:bg-gray-700 text-white font-bold px-10 h-12 text-base">
            <LogIn className="w-4 h-4 mr-2" /> Create Your Free Account
          </Button>
        </div>
      </div>
    </div>
  );

  // ── LOGGED IN: Member Dashboard with inline profile ──
  const initials = user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?';
  const orderCount = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const earnedBadges = BADGES.filter(b => orderCount >= b.threshold);
  const nextBadge = BADGES.find(b => orderCount < b.threshold) || null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Profile Hero */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-8 sm:py-10 px-4">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0 group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="w-24 h-24 rounded-full border-4 border-yellow-400 overflow-hidden shadow-xl">
              {uploading ? (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                </div>
              ) : user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-yellow-400 flex items-center justify-center text-gray-900 text-2xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute bottom-0.5 right-0.5 w-7 h-7 bg-yellow-400 rounded-full flex items-center justify-center shadow group-hover:bg-yellow-300 transition-colors">
              <Camera className="w-3.5 h-3.5 text-gray-900" />
            </div>
          </div>

          {/* Name / info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-xs font-bold mb-2">
              <Star className="w-3 h-3" /> Member
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold break-words">{user.full_name}</h1>
            <p className="text-gray-400 text-sm mt-0.5">{user.email}</p>
            {user.favorite_game && <p className="text-yellow-400 text-sm mt-1 font-medium">🎮 {GAME_LABELS[user.favorite_game]}</p>}
            {user.bio && !editing && <p className="text-gray-300 text-sm mt-1 italic max-w-md">"{user.bio}"</p>}
          </div>

          {/* Edit toggle */}
          <div className="shrink-0 w-full sm:w-auto">
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="w-full sm:w-auto border-gray-600 text-white bg-gray-700 hover:bg-gray-600">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="flex-1 sm:flex-none bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setEditBio(user.bio||''); setEditGame(user.favorite_game||''); }} className="flex-1 sm:flex-none text-gray-300 hover:bg-gray-700">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Inline edit form */}
        {editing && (
          <div className="max-w-5xl mx-auto mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Bio</label>
              <Input value={editBio} onChange={e => setEditBio(e.target.value)} placeholder="Tell the community about yourself..." maxLength={160}
                className="bg-gray-700 border-gray-600 text-white placeholder:text-gray-400" />
              <p className="text-xs text-gray-500 mt-1">{editBio.length}/160</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-400 mb-1 uppercase tracking-wide">Favorite Game</label>
              <Select value={editGame} onValueChange={setEditGame}>
                <SelectTrigger className="bg-gray-700 border-gray-600 text-white"><SelectValue placeholder="Pick your game..." /></SelectTrigger>
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

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-4xl font-bold text-gray-900 mb-1">{orderCount}</p>
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5"><ShoppingBag className="w-4 h-4" /> Orders</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-4xl font-bold text-gray-900 mb-1">${totalSpent.toFixed(0)}</p>
            <p className="text-sm text-gray-500">Total Spent</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-4xl font-bold text-yellow-500 mb-1">{earnedBadges.length}</p>
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5"><Award className="w-4 h-4" /> Badges</p>
          </div>
        </div>

        {/* Badges + next badge progress */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" /> Collector Badges
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-5">
            {BADGES.map(badge => (
              <BadgePip key={badge.id} badge={badge} locked={orderCount < badge.threshold} />
            ))}
          </div>
          {nextBadge && (
            <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
              <span className="text-2xl">{nextBadge.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-700">Next: <span className="text-gray-900">{nextBadge.label}</span></p>
                <div className="w-full bg-gray-100 rounded-full h-2 mt-1.5">
                  <div className="bg-yellow-400 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (orderCount / nextBadge.threshold) * 100)}%` }} />
                </div>
                <p className="text-xs text-gray-400 mt-1">{orderCount} / {nextBadge.threshold} orders</p>
              </div>
            </div>
          )}
        </div>

        {/* Tools grid */}
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Your Member Tools</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {memberTools.map((tool) => {
              const Icon = tool.icon;
              if (!tool.available) return (
                <div key={tool.title} className="relative bg-white border border-dashed border-gray-200 rounded-2xl p-6 opacity-60">
                  <div className="absolute top-3 right-3"><Lock className="w-4 h-4 text-gray-400" /></div>
                  <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6 text-gray-400" />
                  </div>
                  <h3 className="font-bold text-gray-500 text-lg mb-2">{tool.title}</h3>
                  <p className="text-gray-400 text-sm">{tool.description}</p>
                  <span className="inline-block mt-4 text-xs bg-gray-100 text-gray-500 px-3 py-1 rounded-full font-medium">Coming Soon</span>
                </div>
              );
              return (
                <Link key={tool.title} to={tool.path} className={`group relative bg-white border rounded-2xl p-6 hover:shadow-lg transition-all duration-200 ${tool.lightColor}`}>
                  <div className={`w-12 h-12 rounded-xl ${tool.color} flex items-center justify-center mb-4 shadow-sm`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <p className={`text-xs font-semibold uppercase tracking-wide mb-1 ${tool.textColor}`}>{tool.subtitle}</p>
                  <h3 className="font-bold text-gray-900 text-lg mb-2">{tool.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{tool.description}</p>
                  <div className={`flex items-center gap-1 mt-4 text-sm font-semibold ${tool.textColor}`}>
                    Open <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


