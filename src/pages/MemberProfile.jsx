import React, { useState, useEffect, useRef } from 'react';
import { backend } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LogIn, Camera, Loader2, ShoppingBag, Star, Award, Edit2, Check, X } from 'lucide-react';
import MemberBadge, { BADGES, getEarnedBadges, getNextBadge } from '@/components/member/MemberBadge';
import { toast } from 'sonner';

const GAME_LABELS = {
  magic: 'Magic: The Gathering',
  pokemon: 'Pokémon TCG',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  onepiece: 'One Piece TCG',
  flesh_and_blood: 'Flesh & Blood',
};

export default function MemberProfile() {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
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
        // Fetch order count
        setLoadingOrders(true);
        const userOrders = await backend.data.Order.filter({ customer_email: me.email });
        setOrders(userOrders);
        setLoadingOrders(false);
      }
      setIsLoadingAuth(false);
    });
  }, []);

  const handleAvatarClick = () => fileInputRef.current?.click();

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
      console.error('Member profile avatar upload failed:', err);
      toast.error('Failed to upload image');
    }
    setUploading(false);
  };

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await backend.auth.updateProfile({ bio: editBio, favorite_game: editGame });
      setUser(prev => ({ ...prev, ...updated, bio: editBio, favorite_game: editGame }));
      setEditing(false);
      toast.success('Profile updated!');
    } catch (err) {
      console.error('Member profile save failed:', err);
      toast.error('Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditBio(user.bio || '');
    setEditGame(user.favorite_game || '');
    setEditing(false);
  };

  if (isLoadingAuth) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Star className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Members Only</h2>
        <p className="text-gray-500 mb-6">Sign in to view your profile.</p>
        <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-gray-800 hover:bg-gray-700">
          <LogIn className="w-4 h-4 mr-2" /> Sign In
        </Button>
      </div>
    </div>
  );

  const orderCount = orders.length;
  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0);
  const earnedBadges = getEarnedBadges(orderCount);
  const nextBadge = getNextBadge(orderCount);
  const initials = user.full_name
    ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : '?';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-10 sm:py-14 px-4">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center sm:items-end gap-5 sm:gap-6">
          {/* Avatar */}
          <div className="relative shrink-0 group" onClick={handleAvatarClick}>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            <div className="w-28 h-28 rounded-full border-4 border-yellow-400 overflow-hidden cursor-pointer shadow-xl">
              {uploading ? (
                <div className="w-full h-full bg-gray-700 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 animate-spin text-yellow-400" />
                </div>
              ) : user.avatar_url ? (
                <img src={user.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-yellow-400 flex items-center justify-center text-gray-900 text-3xl font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="absolute bottom-1 right-1 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center cursor-pointer shadow-md group-hover:bg-yellow-300 transition-colors">
              <Camera className="w-4 h-4 text-gray-900" />
            </div>
          </div>

          {/* Name / Email */}
          <div className="flex-1 text-center sm:text-left">
            <div className="inline-flex items-center gap-1.5 bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-xs font-bold mb-2">
              <Star className="w-3 h-3" /> Member
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold break-words">{user.full_name}</h1>
            <p className="text-gray-400 text-sm mt-1">{user.email}</p>
            {user.favorite_game && (
              <p className="text-yellow-400 text-sm mt-1 font-medium">🎮 {GAME_LABELS[user.favorite_game] || user.favorite_game}</p>
            )}
          </div>

          {/* Edit button */}
          <div className="shrink-0 w-full sm:w-auto">
            {!editing ? (
              <Button variant="outline" size="sm" onClick={() => setEditing(true)} className="w-full sm:w-auto border-gray-600 text-white hover:bg-gray-700">
                <Edit2 className="w-3.5 h-3.5 mr-1.5" /> Edit Profile
              </Button>
            ) : (
              <div className="flex gap-2 w-full sm:w-auto">
                <Button size="sm" onClick={handleSaveProfile} disabled={saving} className="flex-1 sm:flex-none bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5 mr-1" />} Save
                </Button>
                <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="flex-1 sm:flex-none text-gray-300 hover:bg-gray-700">
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Edit form */}
        {editing && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <h2 className="font-bold text-gray-900 text-lg">Edit Profile</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <Input
                value={editBio}
                onChange={e => setEditBio(e.target.value)}
                placeholder="Tell the community about yourself..."
                maxLength={160}
              />
              <p className="text-xs text-gray-400 mt-1">{editBio.length}/160</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Favorite Game</label>
              <Select value={editGame} onValueChange={setEditGame}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick your game..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(GAME_LABELS).map(([val, label]) => (
                    <SelectItem key={val} value={val}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {/* Bio display */}
        {!editing && user.bio && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <p className="text-gray-600 italic">"{user.bio}"</p>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            {loadingOrders ? <Loader2 className="w-6 h-6 animate-spin text-gray-400 mx-auto mb-2" /> : (
              <p className="text-4xl font-bold text-gray-900 mb-1">{orderCount}</p>
            )}
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5"><ShoppingBag className="w-4 h-4" /> Orders Placed</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-4xl font-bold text-gray-900 mb-1">${totalSpent.toFixed(0)}</p>
            <p className="text-sm text-gray-500">Total Spent</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 text-center">
            <p className="text-4xl font-bold text-yellow-500 mb-1">{earnedBadges.length}</p>
            <p className="text-sm text-gray-500 flex items-center justify-center gap-1.5"><Award className="w-4 h-4" /> Badges Earned</p>
          </div>
        </div>

        {/* Next badge progress */}
        {nextBadge && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h3 className="font-bold text-gray-900 mb-3">Next Badge</h3>
            <div className="flex items-center gap-4">
              <span className="text-3xl">{nextBadge.emoji}</span>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{nextBadge.label}</p>
                <p className="text-sm text-gray-500 mb-2">{nextBadge.description}</p>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div
                    className="bg-yellow-400 h-2.5 rounded-full transition-all"
                    style={{ width: `${Math.min(100, (orderCount / nextBadge.threshold) * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1">{orderCount} / {nextBadge.threshold} orders</p>
              </div>
            </div>
          </div>
        )}

        {/* All Badges */}
        <div className="bg-white rounded-2xl border border-gray-200 p-6">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-500" /> Badges
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {BADGES.map(badge => (
              <MemberBadge
                key={badge.id}
                badge={badge}
                locked={orderCount < badge.threshold}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}


