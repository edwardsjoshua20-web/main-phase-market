import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, Plus, Trash2, TrendingUp, TrendingDown, BookOpen, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';

const GAMES = [
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh & Blood' },
];

const CONDITIONS = ['mint', 'near_mint', 'lightly_played', 'played', 'poor'];

export default function CollectionTracker() {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [purchasePrice, setPurchasePrice] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [condition, setCondition] = useState('near_mint');
  const [filterGame, setFilterGame] = useState('all');
  const [searchPage, setSearchPage] = useState(0);
  const SEARCH_PER_PAGE = 20;
  const queryClient = useQueryClient();



  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
      setIsLoadingAuth(false);
    });
  }, []);

  const { data: collection = [], isLoading } = useQuery({
    queryKey: ['collection', user?.email],
    queryFn: () => backend.data.Collection.filter({ user_email: user.email }, '-created_date'),
    enabled: !!user?.email,
  });

  const addMutation = useMutation({
    mutationFn: (data) => backend.data.Collection.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['collection']);
      toast.success('Card added to collection!');
      setAddOpen(false);
      setSelectedCard(null);
      setSearchQuery('');
      setSearchResults([]);
      setPurchasePrice('');
      setQuantity(1);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => backend.data.Collection.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['collection']),
  });

  const searchCards = async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); setSearchPage(0); return; }
    setSearching(true);
    setSearchPage(0);
    try {
      if (selectedGame === 'magic') {
        // Fetch all pages from Scryfall
        let allCards = [];
        let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released`;
        while (url) {
          const res = await fetch(url);
          const data = await res.json();
          if (!data.data) break;
          allCards = allCards.concat(data.data);
          url = data.has_more ? data.next_page : null;
          if (allCards.length >= 500) break; // safety cap
        }
        setSearchResults(allCards.map(c => ({
          name: c.name, set_name: c.set_name, card_number: c.collector_number,
          rarity: c.rarity, image_url: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
          market_price: c.prices?.usd ? parseFloat(c.prices.usd) : null,
        })));
      } else if (selectedGame === 'yugioh') {
        const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults((data.data || []).map(c => ({
          name: c.name, set_name: c.card_sets?.[0]?.set_name || '', card_number: c.id,
          rarity: c.card_sets?.[0]?.set_rarity || '', image_url: c.card_images?.[0]?.image_url,
          market_price: c.card_prices?.[0]?.tcgplayer_price ? parseFloat(c.card_prices[0].tcgplayer_price) : null,
        })));
      } else if (selectedGame === 'pokemon') {
        const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(q)}*&pageSize=250&orderBy=-set.releaseDate`);
        const data = await res.json();
        setSearchResults((data.data || []).map(c => {
          const price = c.tcgplayer?.prices?.holofoil?.market || c.tcgplayer?.prices?.normal?.market || c.tcgplayer?.prices?.reverseHolofoil?.market || c.cardmarket?.prices?.averageSellPrice || null;
          return { name: c.name, set_name: c.set?.name || '', card_number: c.number, rarity: c.rarity, image_url: c.images?.small, market_price: price ? parseFloat(price) : null };
        }));
      } else if (selectedGame === 'lorcana') {
        const cards = await backend.data.LorcanaCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.set_name, card_number: c.collector_number, rarity: c.rarity, image_url: c.image_url, market_price: null })));
      } else if (selectedGame === 'onepiece') {
        const cards = await backend.data.OnePieceCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.pack_id || '', card_number: c.api_id, rarity: c.rarity, image_url: c.image_url, market_price: null })));
      } else if (selectedGame === 'flesh_and_blood') {
        const cards = await backend.data.FleshAndBloodCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.set_id || '', card_number: c.unique_id, rarity: '', image_url: c.image_url, market_price: null })));
      }
    } catch (e) { setSearchResults([]); }
    setSearching(false);
  };

  const handleAdd = () => {
    if (!selectedCard) return;
    addMutation.mutate({
      user_email: user.email,
      card_name: selectedCard.name,
      game: selectedGame,
      set_name: selectedCard.set_name,
      card_number: selectedCard.card_number,
      rarity: selectedCard.rarity,
      condition,
      quantity,
      purchase_price: purchasePrice ? parseFloat(purchasePrice) : null,
      current_market_price: selectedCard.market_price,
      image_url: selectedCard.image_url,
    });
  };

  const filtered = filterGame === 'all' ? collection : collection.filter(c => c.game === filterGame);
  const totalPaid = collection.reduce((s, c) => s + (c.purchase_price || 0) * (c.quantity || 1), 0);
  const totalMarket = collection.reduce((s, c) => s + (c.current_market_price || 0) * (c.quantity || 1), 0);
  const totalCards = collection.reduce((s, c) => s + (c.quantity || 1), 0);

  if (isLoadingAuth) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  if (!user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Members Only</h2>
        <p className="text-gray-500 mb-6">Sign in to track your card collection.</p>
        <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-gray-800 hover:bg-gray-700">
          <LogIn className="w-4 h-4 mr-2" /> Sign In
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">My Collection</h1>
            <p className="text-gray-500 mt-1">{totalCards} cards tracked</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-gray-800 hover:bg-gray-700">
            <Plus className="w-4 h-4 mr-2" /> Add Card
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{totalCards}</p>
            <p className="text-sm text-gray-500">Total Cards</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">${totalPaid.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Amount Paid</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <p className={`text-2xl font-bold ${totalMarket >= totalPaid ? 'text-green-600' : 'text-red-500'}`}>${totalMarket.toFixed(2)}</p>
            <p className="text-sm text-gray-500">Market Value</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4">
          <Select value={filterGame} onValueChange={setFilterGame}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Games</SelectItem>
              {GAMES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Collection Grid */}
        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No cards yet. Add your first card!</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {filtered.map(card => {
              const gain = card.current_market_price && card.purchase_price ? card.current_market_price - card.purchase_price : null;
              return (
                <div key={card.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
                  <div className="aspect-square bg-gray-100 relative">
                    {card.image_url ? <img src={card.image_url} alt={card.card_name} className="w-full h-full object-contain p-2" /> : <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">No Image</div>}
                    {card.quantity > 1 && <Badge className="absolute top-1 right-1 bg-gray-800 text-white text-xs">x{card.quantity}</Badge>}
                  </div>
                  <div className="p-3">
                    <p className="font-semibold text-gray-900 text-sm line-clamp-1">{card.card_name}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{card.set_name}</p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{card.condition?.replace('_', ' ')}</p>
                    {card.purchase_price && <p className="text-xs text-gray-500 mt-1">Paid: <span className="font-medium">${card.purchase_price.toFixed(2)}</span></p>}
                    {card.current_market_price && <p className="text-xs mt-0.5">Market: <span className="font-medium text-blue-600">${card.current_market_price.toFixed(2)}</span></p>}
                    {gain !== null && (
                      <p className={`text-xs font-semibold mt-0.5 flex items-center gap-0.5 ${gain >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {gain >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {gain >= 0 ? '+' : ''}${gain.toFixed(2)}
                      </p>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(card.id)} className="w-full mt-2 h-7 text-red-500 hover:text-red-700 hover:bg-red-50 text-xs">
                      <Trash2 className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Card Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>Add Card to Collection</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedGame} onValueChange={(v) => { setSelectedGame(v); setSearchResults([]); setSelectedCard(null); setSearchQuery(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GAMES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
            </Select>

            {!selectedCard ? (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    className="pl-9"
                    placeholder="Search for a card..."
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); clearTimeout(window._collectionSearch); window._collectionSearch = setTimeout(() => searchCards(e.target.value), 400); }}
                  />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 border rounded-lg">
                    <div className="max-h-52 overflow-y-auto">
                      {searchResults.slice(searchPage * SEARCH_PER_PAGE, (searchPage + 1) * SEARCH_PER_PAGE).map((r, i) => (
                        <button key={i} onClick={() => setSelectedCard(r)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-left">
                          {r.image_url && <img src={r.image_url} alt={r.name} className="w-10 h-10 object-contain rounded" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900">{r.name}</p>
                            <p className="text-xs text-gray-500">{r.set_name}</p>
                          </div>
                          {r.market_price && <span className="ml-auto text-sm font-semibold text-blue-600">${r.market_price.toFixed(2)}</span>}
                        </button>
                      ))}
                    </div>
                    {searchResults.length > SEARCH_PER_PAGE && (
                      <div className="flex items-center justify-between px-3 py-2 border-t bg-gray-50 text-xs text-gray-500">
                        <span>{searchPage * SEARCH_PER_PAGE + 1}–{Math.min((searchPage + 1) * SEARCH_PER_PAGE, searchResults.length)} of {searchResults.length}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setSearchPage(p => Math.max(0, p - 1))} disabled={searchPage === 0} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100">← Prev</button>
                          <button onClick={() => setSearchPage(p => p + 1)} disabled={(searchPage + 1) * SEARCH_PER_PAGE >= searchResults.length} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100">Next →</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex gap-3 p-3 bg-gray-50 rounded-lg items-center">
                {selectedCard.image_url && <img src={selectedCard.image_url} alt={selectedCard.name} className="w-16 h-16 object-contain rounded" />}
                <div className="flex-1">
                  <p className="font-semibold text-gray-900">{selectedCard.name}</p>
                  <p className="text-xs text-gray-500">{selectedCard.set_name}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCard(null); setSearchQuery(''); }}>Change</Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Condition</label>
                <Select value={condition} onValueChange={setCondition}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONDITIONS.map(c => <SelectItem key={c} value={c}>{c.replace('_', ' ')}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Quantity</label>
                <Input type="number" min="1" value={quantity} onChange={e => setQuantity(parseInt(e.target.value) || 1)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Purchase Price (optional)</label>
              <Input type="number" placeholder="$0.00" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!selectedCard || addMutation.isPending} className="bg-gray-800 hover:bg-gray-700">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add to Collection'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


