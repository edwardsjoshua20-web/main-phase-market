import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Heart, Eye, Search, Plus, Swords, TrendingUp, Star, Filter, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import DeckDetailModal from '@/components/community/DeckDetailModal';

const FORMATS = ['all', 'commander', 'standard', 'modern', 'pioneer', 'legacy', 'casual'];
const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'popular', label: 'Most Liked' },
  { value: 'trending', label: 'Most Viewed' },
];

export default function CommunityDecks() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [search, setSearch] = useState('');
  const [format, setFormat] = useState('all');
  const [sort, setSort] = useState('newest');
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [myDecks, setMyDecks] = useState([]);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) {
        const me = await backend.auth.getCurrentUser();
        setUser(me);
        const lists = await backend.data.CardList.filter({ user_email: me.email });
        setMyDecks(lists);
      }
      setAuthChecked(true);
    });
  }, []);

  const { data: decks = [], isLoading } = useQuery({
    queryKey: ['communityDecks'],
    queryFn: () => backend.data.CommunityDeck.filter({ is_published: true }, '-created_date', 100),
  });

  const likeMutation = useMutation({
    mutationFn: async (deck) => {
      if (!user) { toast.error('Sign in to like decks'); return; }
      const alreadyLiked = deck.liked_by?.includes(user.email);
      const newLikedBy = alreadyLiked
        ? (deck.liked_by || []).filter(e => e !== user.email)
        : [...(deck.liked_by || []), user.email];
      await backend.data.CommunityDeck.update(deck.id, {
        likes: newLikedBy.length,
        liked_by: newLikedBy
      });
    },
    onSuccess: () => queryClient.invalidateQueries(['communityDecks']),
  });

  const filtered = decks
    .filter(d => {
      const matchesSearch = !search || d.title.toLowerCase().includes(search.toLowerCase()) || d.commander_name?.toLowerCase().includes(search.toLowerCase()) || d.user_name?.toLowerCase().includes(search.toLowerCase());
      const matchesFormat = format === 'all' || d.format === format;
      return matchesSearch && matchesFormat;
    })
    .sort((a, b) => {
      if (sort === 'popular') return (b.likes || 0) - (a.likes || 0);
      if (sort === 'trending') return (b.views || 0) - (a.views || 0);
      return new Date(b.created_date) - new Date(a.created_date);
    });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Header */}
      <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white py-12 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 bg-yellow-400 text-gray-900 px-3 py-1 rounded-full text-sm font-bold mb-3">
                <Star className="w-4 h-4" /> Community Hub
              </div>
              <h1 className="text-4xl font-bold mb-2">Deck Showcase</h1>
              <p className="text-gray-400 text-lg">Discover, share, and discuss decks built by the community.</p>
            </div>
            <div className="flex gap-3">
              {user ? (
                <Button onClick={() => setPublishOpen(true)} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold h-12 px-6">
                  <Plus className="w-4 h-4 mr-2" /> Publish Your Deck
                </Button>
              ) : authChecked && (
                <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold h-12 px-6">
                  <LogIn className="w-4 h-4 mr-2" /> Sign In to Share
                </Button>
              )}
              <Button onClick={() => navigate('/AdvancedDeckBuilder')} variant="outline" className="border-gray-600 text-white bg-gray-700 hover:bg-gray-600 h-12 px-6">
                <Swords className="w-4 h-4 mr-2" /> Build a Deck
              </Button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex gap-6 mt-8 text-sm text-gray-400">
            <span className="flex items-center gap-1.5"><Swords className="w-4 h-4" /> {decks.length} decks shared</span>
            <span className="flex items-center gap-1.5"><Heart className="w-4 h-4" /> {decks.reduce((s, d) => s + (d.likes || 0), 0)} total likes</span>
            <span className="flex items-center gap-1.5"><TrendingUp className="w-4 h-4" /> Active community</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search decks, commanders, builders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={format} onValueChange={setFormat}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map(f => <SelectItem key={f} value={f}>{f === 'all' ? 'All Formats' : f.charAt(0).toUpperCase() + f.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Deck Grid */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-200 h-64 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <Swords className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">{decks.length === 0 ? 'No decks published yet' : 'No decks match your search'}</h3>
            <p className="text-gray-400 mb-6">{decks.length === 0 ? 'Be the first to share your deck with the community!' : 'Try adjusting your filters.'}</p>
            {user && <Button onClick={() => setPublishOpen(true)} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold"><Plus className="w-4 h-4 mr-2" /> Publish First Deck</Button>}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map(deck => (
              <DeckCard key={deck.id} deck={deck} user={user} onLike={() => likeMutation.mutate(deck)} onClick={() => setSelectedDeck(deck)} />
            ))}
          </div>
        )}
      </div>

      {/* Publish Modal */}
      {publishOpen && (
        <PublishDeckModal
          open={publishOpen}
          onClose={() => setPublishOpen(false)}
          user={user}
          myDecks={myDecks}
          onPublished={() => {
            setPublishOpen(false);
            queryClient.invalidateQueries(['communityDecks']);
            toast.success('Deck published to the community!');
          }}
        />
      )}

      {/* Deck Detail Modal */}
      {selectedDeck && (
        <DeckDetailModal
          deck={selectedDeck}
          user={user}
          onClose={() => setSelectedDeck(null)}
          onLike={() => likeMutation.mutate(selectedDeck)}
        />
      )}
    </div>
  );
}

function DeckCard({ deck, user, onLike, onClick }) {
  const liked = user && deck.liked_by?.includes(user.email);
  const cardCount = deck.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group" onClick={onClick}>
      {/* Commander image banner */}
      <div className="relative h-36 bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden">
        {deck.commander_image ? (
          <img src={deck.commander_image} alt={deck.commander_name} className="w-full h-full object-cover object-top opacity-80 group-hover:opacity-100 transition-opacity group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Swords className="w-12 h-12 text-gray-600" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3">
          {deck.commander_name && <p className="text-white text-xs font-semibold truncate">{deck.commander_name}</p>}
          <Badge className="text-xs bg-gray-900/80 text-gray-300 border-0 mt-0.5">{deck.format || 'Commander'}</Badge>
        </div>
      </div>

      <div className="p-4">
        <h3 className="font-bold text-gray-900 text-base leading-tight mb-1 line-clamp-1">{deck.title}</h3>
        <p className="text-xs text-gray-500 mb-2">by {deck.user_name || deck.user_email?.split('@')[0]}</p>
        {deck.description && <p className="text-sm text-gray-500 line-clamp-2 mb-3">{deck.description}</p>}

        {deck.tags?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mb-3">
            {deck.tags.slice(0, 3).map(tag => (
              <span key={tag} className="text-xs bg-blue-50 text-blue-600 border border-blue-200 px-2 py-0.5 rounded-full">{tag}</span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-xs text-gray-400 border-t border-gray-100 pt-3">
          <span>{cardCount} cards</span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{deck.views || 0}</span>
            <button onClick={e => { e.stopPropagation(); onLike(); }}
              className={`flex items-center gap-1 transition-colors ${liked ? 'text-red-500' : 'hover:text-red-400'}`}>
              <Heart className={`w-3.5 h-3.5 ${liked ? 'fill-current' : ''}`} />{deck.likes || 0}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublishDeckModal({ open, onClose, user, myDecks, onPublished }) {
  const [selectedList, setSelectedList] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handlePublish = async () => {
    if (!selectedList || !title) { toast.error('Please select a deck and add a title'); return; }
    setSubmitting(true);
    try {
      const list = myDecks.find(d => d.id === selectedList);
      const commanderItem = list?.items?.find(i => i.is_commander);

      await backend.data.CommunityDeck.create({
        user_email: user.email,
        user_name: user.full_name,
        user_avatar: user.avatar_url || null,
        title,
        description,
        commander_name: list?.commander_name || commanderItem?.product_name || '',
        commander_image: commanderItem?.product_image || '',
        format: list?.deck_format || 'commander',
        game: 'magic',
        items: list?.items || [],
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        likes: 0,
        liked_by: [],
        views: 0,
        is_published: true,
        card_list_id: list?.id
      });

      onPublished();
    } catch (error) {
      console.error('Community deck publish failed:', error);
      toast.error(error?.message || 'Publishing deck failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Publish Your Deck</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Select Deck</label>
            <Select value={selectedList} onValueChange={setSelectedList}>
              <SelectTrigger><SelectValue placeholder="Choose from your decks..." /></SelectTrigger>
              <SelectContent>
                {myDecks.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Title</label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Give your deck a catchy title..." />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Description</label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your strategy, win conditions, or what makes this deck unique..." rows={3} />
          </div>
          <div>
            <label className="text-sm font-semibold text-gray-700 mb-1.5 block">Tags (comma separated)</label>
            <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="aggro, budget, tokens, combo..." />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handlePublish} disabled={submitting} className="bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-bold">
              {submitting ? 'Publishing...' : 'Publish to Community'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


