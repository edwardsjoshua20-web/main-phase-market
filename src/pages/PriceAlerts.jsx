import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, Plus, Trash2, Search, Loader2, LogIn, CheckCircle, PauseCircle } from 'lucide-react';
import { toast } from 'sonner';

const GAMES = [
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh & Blood' },
];

export default function PriceAlerts() {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCard, setSelectedCard] = useState(null);
  const [targetPrice, setTargetPrice] = useState('');
  const [searchPage, setSearchPage] = useState(0);
  const SEARCH_PER_PAGE = 20;
  const queryClient = useQueryClient();



  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
      setIsLoadingAuth(false);
    });
  }, []);

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ['price-alerts', user?.email],
    queryFn: () => backend.data.PriceAlert.filter({ user_email: user.email }, '-created_date'),
    enabled: !!user?.email,
  });

  const addMutation = useMutation({
    mutationFn: (data) => backend.data.PriceAlert.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['price-alerts']);
      toast.success('Price alert created! We\'ll email you when the price drops.');
      setAddOpen(false);
      setSelectedCard(null);
      setSearchQuery('');
      setSearchResults([]);
      setTargetPrice('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => backend.data.PriceAlert.delete(id),
    onSuccess: () => queryClient.invalidateQueries(['price-alerts']),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, status }) => backend.data.PriceAlert.update(id, { status }),
    onSuccess: () => queryClient.invalidateQueries(['price-alerts']),
  });

  const searchCards = async (q) => {
    if (!q || q.length < 2) { setSearchResults([]); setSearchPage(0); return; }
    setSearching(true);
    setSearchPage(0);
    try {
      if (selectedGame === 'magic') {
        let allCards = [];
        let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&unique=prints&order=released`;
        while (url) {
          const res = await fetch(url);
          const data = await res.json();
          if (!data.data) break;
          allCards = allCards.concat(data.data);
          url = data.has_more ? data.next_page : null;
          if (allCards.length >= 500) break;
        }
        setSearchResults(allCards.map(c => ({
          name: c.name, set_name: c.set_name,
          image_url: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
          market_price: c.prices?.usd ? parseFloat(c.prices.usd) : null,
        })));
      } else if (selectedGame === 'yugioh') {
        const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults((data.data || []).map(c => ({
          name: c.name, set_name: c.card_sets?.[0]?.set_name || '',
          image_url: c.card_images?.[0]?.image_url,
          market_price: c.card_prices?.[0]?.tcgplayer_price ? parseFloat(c.card_prices[0].tcgplayer_price) : null,
        })));
      } else if (selectedGame === 'pokemon') {
        const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(q)}*&pageSize=250&orderBy=-set.releaseDate`);
        const data = await res.json();
        setSearchResults((data.data || []).map(c => {
          const price = c.tcgplayer?.prices?.holofoil?.market || c.tcgplayer?.prices?.normal?.market || c.tcgplayer?.prices?.reverseHolofoil?.market || c.cardmarket?.prices?.averageSellPrice || null;
          return { name: c.name, set_name: c.set?.name || '', image_url: c.images?.small, market_price: price ? parseFloat(price) : null };
        }));
      } else if (selectedGame === 'lorcana') {
        const cards = await backend.data.LorcanaCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.set_name, image_url: c.image_url, market_price: null })));
      } else if (selectedGame === 'onepiece') {
        const cards = await backend.data.OnePieceCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.pack_id || '', image_url: c.image_url, market_price: null })));
      } else if (selectedGame === 'flesh_and_blood') {
        const cards = await backend.data.FleshAndBloodCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map(c => ({ name: c.name, set_name: c.set_id || '', image_url: c.image_url, market_price: null })));
      }
    } catch (e) { setSearchResults([]); }
    setSearching(false);
  };

  const handleAdd = () => {
    if (!selectedCard || !targetPrice) return;
    addMutation.mutate({
      user_email: user.email,
      card_name: selectedCard.name,
      game: selectedGame,
      set_name: selectedCard.set_name,
      image_url: selectedCard.image_url,
      target_price: parseFloat(targetPrice),
      last_known_price: selectedCard.market_price,
      status: 'active',
    });
  };

  if (isLoadingAuth) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;

  if (!user) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <Bell className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Members Only</h2>
        <p className="text-gray-500 mb-6">Sign in to set up price alerts.</p>
        <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-gray-800 hover:bg-gray-700">
          <LogIn className="w-4 h-4 mr-2" /> Sign In
        </Button>
      </div>
    </div>
  );

  const activeAlerts = alerts.filter(a => a.status === 'active');
  const triggeredAlerts = alerts.filter(a => a.status === 'triggered');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Price Alerts</h1>
            <p className="text-gray-500 mt-1">{activeAlerts.length} active alert{activeAlerts.length !== 1 ? 's' : ''}</p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-gray-800 hover:bg-gray-700">
            <Plus className="w-4 h-4 mr-2" /> New Alert
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>
        ) : alerts.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 mb-2">No price alerts yet.</p>
            <p className="text-sm text-gray-400">Set a target price and we'll email you when a card drops!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map(alert => (
              <div key={alert.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 ${alert.status === 'triggered' ? 'border-green-300 bg-green-50' : 'border-gray-200'}`}>
                {alert.image_url && <img src={alert.image_url} alt={alert.card_name} className="w-14 h-14 object-contain rounded" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-gray-900">{alert.card_name}</p>
                    <Badge variant="secondary" className="text-xs capitalize">{alert.game}</Badge>
                    {alert.status === 'triggered' && <Badge className="bg-green-600 text-white text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Triggered!</Badge>}
                    {alert.status === 'paused' && <Badge variant="secondary" className="text-xs">Paused</Badge>}
                  </div>
                  {alert.set_name && <p className="text-xs text-gray-500 mt-0.5">{alert.set_name}</p>}
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-sm text-gray-600">Alert at: <span className="font-bold text-blue-600">${alert.target_price?.toFixed(2)}</span></p>
                    {alert.last_known_price && <p className="text-sm text-gray-400">Last seen: ${alert.last_known_price?.toFixed(2)}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {alert.status === 'active' && (
                    <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: alert.id, status: 'paused' })} className="text-xs h-8">
                      <PauseCircle className="w-3 h-3 mr-1" /> Pause
                    </Button>
                  )}
                  {alert.status === 'paused' && (
                    <Button variant="outline" size="sm" onClick={() => toggleMutation.mutate({ id: alert.id, status: 'active' })} className="text-xs h-8">
                      <Bell className="w-3 h-3 mr-1" /> Resume
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => deleteMutation.mutate(alert.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="bg-white max-w-lg">
          <DialogHeader><DialogTitle>Create Price Alert</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedGame} onValueChange={(v) => { setSelectedGame(v); setSearchResults([]); setSelectedCard(null); setSearchQuery(''); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{GAMES.map(g => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
            </Select>

            {!selectedCard ? (
              <div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input className="pl-9" placeholder="Search for a card..." value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); clearTimeout(window._alertSearch); window._alertSearch = setTimeout(() => searchCards(e.target.value), 400); }} />
                  {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
                </div>
                {searchResults.length > 0 && (
                  <div className="mt-2 border rounded-lg">
                    <div className="max-h-52 overflow-y-auto">
                      {searchResults.slice(searchPage * SEARCH_PER_PAGE, (searchPage + 1) * SEARCH_PER_PAGE).map((r, i) => (
                        <button key={i} onClick={() => { setSelectedCard(r); if (r.market_price) setTargetPrice((r.market_price * 0.8).toFixed(2)); }} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-left">
                          {r.image_url && <img src={r.image_url} alt={r.name} className="w-10 h-10 object-contain rounded" />}
                          <div className="flex-1 min-w-0"><p className="text-sm font-medium">{r.name}</p><p className="text-xs text-gray-500">{r.set_name}</p></div>
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
                  <p className="font-semibold">{selectedCard.name}</p>
                  {selectedCard.market_price && <p className="text-sm text-gray-500">Current market: <span className="font-medium text-blue-600">${selectedCard.market_price.toFixed(2)}</span></p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCard(null); setSearchQuery(''); }}>Change</Button>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-gray-700 mb-1 block">Alert me when price drops to or below</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <Input className="pl-7" type="number" placeholder="0.00" value={targetPrice} onChange={e => setTargetPrice(e.target.value)} />
              </div>
              <p className="text-xs text-gray-400 mt-1">You'll receive an email at {user.email} when triggered.</p>
            </div>

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAdd} disabled={!selectedCard || !targetPrice || addMutation.isPending} className="bg-gray-800 hover:bg-gray-700">
                {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Alert'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}


