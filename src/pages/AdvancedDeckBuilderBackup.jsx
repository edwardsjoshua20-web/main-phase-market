import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Search, Swords, X, DownloadCloud, Share2, FlaskConical, BrainCircuit, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { searchCards } from '@/components/lib/cardSearch';
import DeckPlaytester from '@/components/deckbuilder/DeckPlaytester';
import DeckImportModal from '@/components/deckbuilder/DeckImportModal';
import AISimulationResults from '@/components/deckbuilder/AISimulationResults';
import DeckListSidebar from '@/components/deckbuilder/DeckListSidebar';
import DeckStackView from '@/components/deckbuilder/DeckStackView';
import { toast } from 'sonner';

const DECK_FORMATS = {
  commander: { name: 'Commander', minCards: 100, maxCards: 100, singleton: true, maxCopies: 1, desc: '100-card singleton deck with a legendary creature commander' },
  standard: { name: 'Standard', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from current legal sets' },
  modern: { name: 'Modern', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from Modern-legal sets onwards' },
  pioneer: { name: 'Pioneer', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from Return to Ravnica onwards' },
  legacy: { name: 'Legacy', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck with all non-banned cards allowed' },
  vintage: { name: 'Vintage', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck with minimal restrictions' },
  casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 4, desc: 'Unrestricted casual play' }
};

export default function AdvancedDeckBuilderBackup() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [activeDeck, setActiveDeck] = useState(null);
  const [_groupByType, _setGroupByType] = useState(true);
  const [deckFormat, setDeckFormat] = useState('casual');
  const [_showFormatModal, _setShowFormatModal] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [_cardDisplayMode, _setCardDisplayMode] = useState('grid'); // 'grid' or 'text'
  const [showSetModal, setShowSetModal] = useState(null); // { productId, productName }
  const [setVariants, setSetVariants] = useState([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPlaytester, setShowPlaytester] = useState(false);
  const [showFormatChangeModal, setShowFormatChangeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [simulating, setSimulating] = useState(false);
  const [loadingSynergy, _setLoadingSynergy] = useState(false);
  const navigate = useNavigate();
  const [newFormat, setNewFormat] = useState(deckFormat);
  const [quickAddSuggestions, setQuickAddSuggestions] = useState([]);
  const [selectedQuickCard, setSelectedQuickCard] = useState(null);
  const [showQuickAddDropdown, setShowQuickAddDropdown] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      const isAuth = await backend.auth.isAuthenticated();
      if (isAuth) {
        const userData = await backend.auth.getCurrentUser();
        setUser(userData);
      }
      setLoading(false);
    };
    load();
  }, []);

  // When a deck is loaded, backfill any items missing a `type` field by fetching from Scryfall
  useEffect(() => {
    if (!activeDeck?.id) return;

    // Also catch items with small/thumbnail images that need upgrading
    const missingType = activeDeck.items?.filter(i =>
      i.product_type === 'magic' && (!i.type || (i.product_image && i.product_image.includes('/small/')))
    );
    if (!missingType || missingType.length === 0) return;

    const backfillTypes = async () => {
      // Fetch all missing cards in parallel
      const results = await Promise.all(
        missingType.map(i =>
          fetch(`https://api.scryfall.com/cards/${i.product_id}`)
            .then(r => r.json())
            .then(data => {
              // For double-faced cards, card_faces[0].type_line has the front face type
              const type = data.card_faces?.[0]?.type_line || data.type_line || '';
              // Also upgrade image to normal quality if it's a small/thumbnail URL
              const image = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || i.product_image;
              return { product_id: i.product_id, type, image };
            })
            .catch(() => ({ product_id: i.product_id, type: '', image: i.product_image }))
        )
      );

      const fixMap = Object.fromEntries(results.map(r => [r.product_id, r]));
      const updatedItems = activeDeck.items.map(i => {
        const fix = fixMap[i.product_id];
        if (!fix) return i;
        return { ...i, type: fix.type, product_image: fix.image || i.product_image };
      });

      await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
      setActiveDeck(prev => ({ ...prev, items: updatedItems }));
    };

    backfillTypes();
  }, [activeDeck?.id]);

  const { data: lists = [] } = useQuery({
    queryKey: ['cardlists', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  const { data: storeProductsRaw = [] } = useQuery({
    queryKey: ['storeProducts'],
    queryFn: () => backend.data.Product.filter({ status: 'active' }),
    staleTime: 0,
    refetchInterval: 30 * 1000
  });

  const { data: storeCardsRaw = [] } = useQuery({
    queryKey: ['storeCards'],
    queryFn: () => backend.data.Card.filter({ status: 'active' }),
    staleTime: 0,
    refetchInterval: 30 * 1000
  });

  // Combine both Card and Product entities for stock lookup
  const storeProducts = [...storeProductsRaw, ...storeCardsRaw];

  const decks = lists;

  const createDeckMutation = useMutation({
    mutationFn: () => backend.data.CardList.create({
      user_email: user.email,
      name: newDeckName.trim(),
      description: `${selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1)} deck`,
      deck_format: deckFormat,
      items: [],
      estimated_cost: 0
    }),
    onSuccess: (newDeck) => {
      queryClient.invalidateQueries(['cardlists']);
      setNewDeckName('');
      setCreatingDeck(false);
      setActiveDeck(newDeck);
      setDeckFormat('casual');
      toast.success('Deck created!');
    }
  });

  const deleteDeckMutation = useMutation({
    mutationFn: (id) => backend.data.CardList.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['cardlists']);
      setActiveDeck(null);
      toast.success('Deck deleted');
    }
  });

  const addCardToDeck = async (card, qty = 1) => {
    if (!activeDeck) { toast.error('Select a deck first'); return; }
    
    // Commander rules: max 1 of each card (except basic lands), max 1 commander
    if (activeDeck.deck_format === 'commander') {
      const isBasicLand = card.type?.toLowerCase().includes('basic');
      const existing = activeDeck.items?.find(i => i.product_id === card.id);
      
      if (existing && !isBasicLand) {
        toast.error('Commander: Only 1 of each non-land card allowed');
        return;
      }
    }
    
    const existing = activeDeck.items?.find(i => i.product_id === card.id);
    let updatedItems;
    if (existing) {
      updatedItems = activeDeck.items.map(i =>
        i.product_id === card.id ? { ...i, quantity: (i.quantity || 1) + qty } : i
      );
    } else {
      updatedItems = [...(activeDeck.items || []), {
        product_id: card.id,
        product_name: card.name,
        product_image: card.image_url,
        price: card.price || 0,
        product_type: selectedGame,
        type: card.type,
        quantity: qty,
        mana_cost: card.mana_cost || '',
        cmc: card.cmc ?? 0,
      }];
    }
    
    const newCost = updatedItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems, estimated_cost: newCost });
    const updatedDeck = { ...activeDeck, items: updatedItems, estimated_cost: newCost };
    setActiveDeck(updatedDeck);
    queryClient.invalidateQueries(['cardlists']);
    toast.success(existing ? `${card.name} +${qty}` : `Added ${card.name}`);
  };



  const searchQuickAddCards = async (query) => {
    setSearching(true);
    const results = await searchCards(query, selectedGame, 15);
    setQuickAddSuggestions(results);
    setShowQuickAddDropdown(results.length > 0);
    setSearching(false);
  };

  const handleQuickAddChange = (e) => {
    const val = e.target.value;
    setQuickAddText(val);
    clearTimeout(window._quickAddTimeout);
    window._quickAddTimeout = setTimeout(() => searchQuickAddCards(val), 300);
  };

  const addSelectedCard = async (card) => {
    await addCardToDeck(card, 1);
    setQuickAddText('');
    setQuickAddSuggestions([]);
    setShowQuickAddDropdown(false);
    setSelectedQuickCard(null);
  };

  const handleQuickAdd = async () => {
    if (selectedQuickCard) {
      await addSelectedCard(selectedQuickCard);
    }
  };

  const fetchCardVariants = async (cardName) => {
    setLoadingVariants(true);
    try {
      let variants = [];
      if (selectedGame === 'magic') {
        const res = await fetch(`https://api.scryfall.com/cards/search?q=!"${encodeURIComponent(cardName)}"&unique=prints&order=released&sort=set`);
        const data = await res.json();
        variants = (data.data || []).map(c => ({
          id: c.id,
          name: c.name,
          set_name: c.set_name,
          set_code: c.set.toUpperCase(),
          image_url: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
          price: c.prices?.usd ? parseFloat(c.prices.usd) : null
        }));
      } else if (selectedGame === 'pokemon') {
        const res = await backend.actions.invoke('searchPokemonCards', { query: cardName });
        const pokemonCards = res.data?.data || [];
        variants = pokemonCards.map(c => ({
          id: c.id,
          name: c.name,
          set_name: c.set?.name || 'Unknown',
          image_url: c.images?.large || c.images?.small
        }));
      }
      setSetVariants(variants);
    } catch {
      toast.error('Could not load variants');
    } finally {
      setLoadingVariants(false);
    }
  };

  const updateCardVariant = async (item, newVariant) => {
    const updatedItems = activeDeck.items.map(i =>
      i.product_id === item.product_id 
        ? { ...i, product_id: newVariant.id, product_image: newVariant.image_url, price: newVariant.price || i.price }
        : i
    );
    const newCost = updatedItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems, estimated_cost: newCost });
    setActiveDeck({ ...activeDeck, items: updatedItems, estimated_cost: newCost });
    setShowSetModal(null);
    toast.success('Card variant changed');
  };

  const removeCardFromDeck = async (productId) => {
    const updatedItems = activeDeck.items.filter(i => i.product_id !== productId);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
    queryClient.invalidateQueries(['cardlists']);
  };

  const changeQty = async (productId, qty) => {
    if (qty < 1) {
      removeCardFromDeck(productId);
      return;
    }
    let updatedItems = activeDeck.items.map(i =>
      i.product_id === productId ? { ...i, quantity: qty } : i
    );
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
    queryClient.invalidateQueries(['cardlists']);
  };

  const handleSearchCards = async (query) => {
    setSearching(true);
    const results = await searchCards(query, selectedGame, 50);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    clearTimeout(window._advSearchTimeout);
    window._advSearchTimeout = setTimeout(() => handleSearchCards(val), 500);
  };

  const validateDeckLegality = (deckData) => {
    const fmt = DECK_FORMATS[deckData.deck_format || 'casual'];
    const totalCards = deckData.items?.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0;
    const errors = [];

    if (totalCards < fmt.minCards) {
      errors.push(`Deck too small (${totalCards}/${fmt.minCards} cards)`);
    }
    if (fmt.maxCards !== Infinity && totalCards > fmt.maxCards) {
      errors.push(`Deck too large (${totalCards}/${fmt.maxCards} cards)`);
    }

    return { isLegal: errors.length === 0, errors, totalCards };
  };

  const changeFormat = async (newFmt) => {
    const updatedDeck = { ...activeDeck, deck_format: newFmt };
    const validation = validateDeckLegality(updatedDeck);
    
    if (!validation.isLegal) {
      toast.error(`Format change issues: ${validation.errors[0]}`);
    }
    
    await backend.data.CardList.update(activeDeck.id, { deck_format: newFmt });
    setActiveDeck(updatedDeck);
    setNewFormat(newFmt);
    setShowFormatChangeModal(false);
    toast.success(`Format changed to ${DECK_FORMATS[newFmt].name}`);
  };

  const runSynergyRecommendations = () => {
    if (!activeDeck) return;
    navigate(`/DeckSynergy?deckId=${activeDeck.id}`);
  };

  const runSimulation = async () => {
    if (!activeDeck) return;
    setSimulating(true);
    try {
      const res = await backend.actions.invoke('simulateDeck', { deck: activeDeck, numGames: 20 });
      setSimulationResults(res.data);
      setShowSimulation(true);
    } catch (e) {
      toast.error('Simulation failed: ' + e.message);
    } finally {
      setSimulating(false);
    }
  };

  const totalCards = activeDeck?.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

  // Use the deck's stored game, fall back to selectedGame
  const deckGame = selectedGame;

  const isCommanderFormat = activeDeck?.deck_format === 'commander';

  const handleImportCards = async (importedItems) => {
    if (!activeDeck) return;
    // Merge imported items with existing deck items
    let updatedItems = [...(activeDeck.items || [])];
    for (const item of importedItems) {
      const existing = updatedItems.find(i => i.product_id === item.product_id);
      if (existing) {
        updatedItems = updatedItems.map(i => i.product_id === item.product_id ? { ...i, quantity: (i.quantity || 1) + item.quantity } : i);
      } else {
        updatedItems.push(item);
      }
    }
    const newCost = updatedItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems, estimated_cost: newCost });
    setActiveDeck({ ...activeDeck, items: updatedItems, estimated_cost: newCost });
    queryClient.invalidateQueries(['cardlists']);
    setShowImportModal(false);
    toast.success(`Imported ${importedItems.length} cards!`);
  };

  const setAsCommander = async (item) => {
    // Clear old commander, set new one
    const updatedItems = activeDeck.items.map(i => ({
      ...i,
      is_commander: i.product_id === item.product_id
    }));
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
    toast.success(`${item.product_name} set as Commander`);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  );

  if (!user) return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center">
        <Swords className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to Advanced Deck Builder</h2>
        <p className="text-gray-500 mb-4">Create and visualize your decks in a whole new way.</p>
        <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-blue-600 hover:bg-blue-700">
          Sign In
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-800 border-b border-gray-700 sticky top-0 z-40">
        <div className="max-w-full px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <Swords className="w-6 h-6 text-blue-400" />
              <div>
                <h1 className="text-xl font-bold text-white">
                  {activeDeck ? `${activeDeck.name} - ${DECK_FORMATS[activeDeck.deck_format || 'casual'].name}` : 'Advanced Deck Builder'}
                </h1>
                {activeDeck && (
                  <p className="text-xs text-gray-400">{totalCards} cards • {activeDeck.items?.length || 0} unique</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeDeck && (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="h-8 text-xs bg-green-700 border-green-600 text-white hover:bg-green-600 disabled:opacity-50"
                    onClick={runSynergyRecommendations}
                    disabled={loadingSynergy}
                  >
                    {loadingSynergy ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                    {loadingSynergy ? 'Loading...' : 'AI Synergy'}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-8 text-xs bg-yellow-700 border-yellow-600 text-white hover:bg-yellow-600 disabled:opacity-50"
                    onClick={runSimulation}
                    disabled={simulating}
                  >
                    {simulating ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <BrainCircuit className="w-3 h-3 mr-1" />}
                    {simulating ? 'Simulating...' : 'AI Simulate'}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-8 text-xs bg-purple-700 border-purple-600 text-white hover:bg-purple-600"
                    onClick={() => setShowPlaytester(true)}
                  >
                    <FlaskConical className="w-3 h-3 mr-1" />Playtester
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-teal-800 border-teal-600 text-teal-200 hover:bg-teal-700" onClick={() => setShowImportModal(true)}>
                    <DownloadCloud className="w-3 h-3 mr-1" />Import
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600">
                    <Share2 className="w-3 h-3 mr-1" />Export
                  </Button>
                  <Button
                    size="sm" 
                    variant="outline"
                    className="h-8 text-xs bg-red-900 border-red-700 text-red-200 hover:bg-red-800"
                    onClick={() => { if (confirm(`Delete "${activeDeck.name}"?`)) deleteDeckMutation.mutate(activeDeck.id); }}
                  >
                    <Trash2 className="w-3 h-3 mr-1" />Delete
                  </Button>
                </>
              )}
              <select
                value={selectedGame}
                onChange={e => { setSelectedGame(e.target.value); setSearchResults([]); setSearchQuery(''); }}
                className="h-8 text-xs border border-gray-600 rounded px-2 bg-gray-700 text-white"
              >
                <option value="magic">MTG</option>
                <option value="pokemon">Pokémon</option>
                <option value="yugioh">Yu-Gi-Oh!</option>
              </select>
            </div>
          </div>

          {/* Search and Controls */}
          <div className="flex items-center gap-3">
            {activeDeck && (() => {
              const validation = validateDeckLegality(activeDeck);
              return (
                <div className="flex items-center gap-3 px-2 bg-gray-700 rounded-lg py-2 px-3 border border-blue-500 border-dashed">
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-gray-400">Format:</span>
                    <button
                      onClick={() => { setNewFormat(activeDeck.deck_format); setShowFormatChangeModal(true); }}
                      className="text-xs font-semibold text-blue-300 hover:text-blue-100 transition-colors bg-blue-900 px-2 py-1 rounded hover:bg-blue-800"
                    >
                      {DECK_FORMATS[activeDeck.deck_format || 'casual'].name}
                    </button>
                  </div>
                  <span className="text-xs text-gray-500">|</span>
                  <div className={`text-xs font-semibold px-2 py-1 rounded ${validation.isLegal ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {validation.isLegal ? '✓ Legal' : '✗ Not Legal'}
                  </div>
                  <span className="text-xs text-gray-500">|</span>
                  <div className="text-xs text-gray-300 font-semibold">Deck Value: ${activeDeck.estimated_cost?.toFixed(2) || '0.00'}</div>
                </div>
              );
            })()}
            <div className="relative flex-1 max-w-xs">
              <Input
                value={quickAddText}
                onChange={handleQuickAddChange}
                onKeyPress={e => e.key === 'Enter' && handleQuickAdd()}
                onFocus={() => showQuickAddDropdown && setShowQuickAddDropdown(true)}
                placeholder="Quick search..."
                className="h-8 text-sm border-gray-600 bg-gray-700 text-white placeholder:text-gray-400"
              />
              {showQuickAddDropdown && quickAddSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-gray-700 border border-gray-600 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                  {quickAddSuggestions.map(card => (
                    <button
                      key={card.id}
                      onClick={() => { setSelectedQuickCard(card); setShowQuickAddDropdown(false); setQuickAddText(card.name); }}
                      className="w-full text-left px-3 py-2 text-xs text-gray-200 hover:bg-gray-600 border-b border-gray-600 last:border-b-0 transition-colors"
                    >
                      <p className="font-medium">{card.name}</p>
                      <p className="text-gray-400 text-xs">{card.set_name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs bg-blue-600 border-blue-500 text-white hover:bg-blue-700 disabled:opacity-50" onClick={handleQuickAdd} disabled={!selectedQuickCard || searching}>
              {searching ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3 mr-1" />}
              Add
            </Button>
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchResults.length > 0 && setSearchResults(searchResults)}
                placeholder="Search by photo..."
                className="pl-9 h-8 text-sm border-gray-600 bg-gray-700 text-white placeholder:text-gray-400"
              />
              {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-400" />}
              {/* Photo search results — floating overlay */}
              {(searchResults.length > 0 || (searching && searchQuery.length >= 2)) && (
                <div className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 w-[600px] max-h-[70vh] overflow-y-auto">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                    <span className="text-xs font-semibold text-gray-300">Results for "{searchQuery}" — click to add</span>
                    <button onClick={() => { setSearchResults([]); setSearchQuery(''); }} className="text-gray-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-3 p-3">
                      {searchResults.map(card => {
                        const inDeck = activeDeck?.items?.find(i => i.product_id === card.id);
                        return (
                          <div
                            key={card.id}
                            className="relative group rounded overflow-hidden border border-gray-700 hover:border-blue-400 cursor-pointer transition-all"
                            onClick={() => addCardToDeck(card)}
                            title={card.name}
                          >
                            {card.image_url ? (
                              <img src={card.image_url} alt={card.name} className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity" />
                            ) : (
                              <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center text-xs text-gray-400 text-center px-1">
                                {card.name}
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                              <Plus className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                            {inDeck && (
                              <div className="absolute top-1 left-1 bg-green-600 text-white font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center shadow">
                                {inDeck.quantity || 1}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-full mx-auto">
        {/* Show deck stack view when a deck is selected and has cards, otherwise show search/select view */}
        {(activeDeck && activeDeck.items && activeDeck.items.length > 0) ? (
        <div className="flex min-h-[calc(100vh-140px)]">
          <DeckListSidebar
            decks={decks}
            activeDeck={activeDeck}
            onSelectDeck={setActiveDeck}
            onCreateNew={() => setCreatingDeck(true)}
            creatingDeck={creatingDeck}
            newDeckName={newDeckName}
            onNameChange={setNewDeckName}
            onConfirmCreate={() => createDeckMutation.mutate()}
            onCancelCreate={() => setCreatingDeck(false)}
          />

          <DeckStackView
            deck={activeDeck}
            game={deckGame}
            isCommanderFormat={isCommanderFormat}
            onChangeQty={changeQty}
            onRemove={removeCardFromDeck}
            onChangeSet={(item) => { setShowSetModal(item); fetchCardVariants(item.product_name); }}
            onSetCommander={isCommanderFormat ? setAsCommander : null}
            storeProducts={storeProducts}
          />
        </div>
        ) : (
        <div className="px-4 py-6 h-[calc(100vh-140px)] overflow-y-auto">
          {!activeDeck ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400">
              <Swords className="w-16 h-16 mb-4 opacity-50" />
              <p className="text-sm mb-4">Create or select a deck to get started</p>
              <Button onClick={() => setCreatingDeck(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" /> New Deck
              </Button>

              {creatingDeck && (
                <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-gray-700 space-y-3 w-full max-w-xs">
                  <Input
                    placeholder="Deck name..."
                    value={newDeckName}
                    onChange={e => setNewDeckName(e.target.value)}
                    className="text-sm border-gray-600 bg-gray-700 text-white placeholder:text-gray-400"
                    autoFocus
                  />
                  <select
                    value={selectedGame}
                    onChange={e => setSelectedGame(e.target.value)}
                    className="w-full h-9 text-sm border border-gray-600 rounded px-2 bg-gray-700 text-white"
                  >
                    <option value="magic">Magic: The Gathering</option>
                    <option value="pokemon">Pokémon</option>
                    <option value="yugioh">Yu-Gi-Oh!</option>
                  </select>
                  <select
                    value={deckFormat}
                    onChange={e => setDeckFormat(e.target.value)}
                    className="w-full h-9 text-sm border border-gray-600 rounded px-2 bg-gray-700 text-white"
                  >
                    {Object.entries(DECK_FORMATS).map(([key, fmt]) => (
                      <option key={key} value={key}>{fmt.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => createDeckMutation.mutate()} disabled={!newDeckName.trim()} className="bg-blue-600 hover:bg-blue-700 flex-1">
                      Create
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setCreatingDeck(false)} className="bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600">
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <div className="mt-8 max-w-xs w-full">
                <h3 className="font-semibold text-white mb-3">My Decks</h3>
                <div className="space-y-2">
                  {decks.length === 0 ? (
                    <p className="text-sm text-gray-400">No decks yet</p>
                  ) : (
                    decks.map(deck => (
                      <button
                        key={deck.id}
                        onClick={() => setActiveDeck(deck)}
                        className="w-full text-left p-3 rounded-lg border border-gray-700 hover:border-blue-400 hover:bg-gray-700 transition-all"
                      >
                        <p className="font-medium text-white text-sm">{deck.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{deck.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} cards</p>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Decks Sidebar */}
              <div className="flex gap-6">
                <div className="w-56 flex-shrink-0">
                  <div className="bg-gray-800 rounded-lg border border-gray-700 p-4 h-fit max-h-96 overflow-y-auto sticky top-0">
                    <h3 className="font-semibold text-white mb-3 text-sm">MY DECKS</h3>
                    <div className="space-y-2">
                      {decks.map(deck => (
                        <button
                          key={deck.id}
                          onClick={() => setActiveDeck(deck)}
                          className={`w-full text-left p-2.5 rounded-lg border text-sm transition-all ${
                            activeDeck?.id === deck.id
                              ? 'border-blue-400 bg-blue-900'
                              : 'border-gray-700 hover:border-blue-400 hover:bg-gray-700'
                          }`}
                        >
                          <p className="font-medium text-white">{deck.name}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{(activeDeck?.id === deck.id ? activeDeck : deck).items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} cards</p>
                        </button>
                      ))}
                    </div>
                    <Button onClick={() => setCreatingDeck(true)} className="w-full mt-3 h-8 text-xs bg-blue-600 hover:bg-blue-700">
                      <Plus className="w-3 h-3 mr-1" /> New Deck
                    </Button>
                  </div>
                </div>

                {/* Card Grid */}
                <div className="flex-1">
                  {searchResults.length === 0 && activeDeck?.items?.length === 0 && !searching && (
                    <div className="text-center py-12 text-gray-400">
                      <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                      <p className="text-sm">Search for cards above to add them to your deck</p>
                    </div>
                  )}
                  <div className="space-y-6">
                    {activeDeck?.items?.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Your Deck</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                          {activeDeck.items.map(item => (
                            <div 
                              key={item.product_id}
                              className="relative group rounded overflow-hidden border-4 border-black hover:border-gray-600 hover:shadow-lg transition-all bg-gray-800"
                            >
                              {item.product_image ? (
                                <img src={item.product_image} alt={item.product_name} className="w-full aspect-[2/3] object-cover group-hover:opacity-70 transition-opacity" />
                              ) : (
                                <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center text-xs text-gray-400 text-center px-1">
                                  {item.product_name}
                                </div>
                              )}
                              <div className="absolute top-1 right-1 bg-blue-600 text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                                {item.quantity || 1}
                              </div>
                              <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-60 transition-all flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                <div className="flex gap-0.5">
                                  <button
                                    onClick={() => changeQty(item.product_id, (item.quantity || 1) - 1)}
                                    className="w-6 h-6 bg-red-600 hover:bg-red-700 text-white rounded text-xs flex items-center justify-center font-semibold"
                                  >
                                    −
                                  </button>
                                  <button
                                    onClick={() => changeQty(item.product_id, (item.quantity || 1) + 1)}
                                    className="w-6 h-6 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs flex items-center justify-center font-semibold"
                                  >
                                    +
                                  </button>
                                </div>
                                <button
                                  onClick={() => { setShowSetModal(item); fetchCardVariants(item.product_name); }}
                                  className="text-xs bg-purple-700 hover:bg-purple-600 text-white px-1.5 py-0.5 rounded"
                                >
                                  Change Set
                                </button>
                                <button
                                  onClick={() => removeCardFromDeck(item.product_id)}
                                  className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-1.5 py-0.5 rounded"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {searchResults.length > 0 && (
                      <div>
                        <h3 className="text-sm font-semibold text-gray-300 mb-3">Search Results</h3>
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-2">
                          {searchResults.map(card => {
                            const inDeck = activeDeck?.items?.find(i => i.product_id === card.id);
                            return (
                              <div 
                                key={card.id} 
                                className="relative group rounded overflow-hidden border border-gray-700 hover:border-blue-400 hover:shadow-lg transition-all cursor-pointer bg-gray-800"
                                onClick={() => addCardToDeck(card)}
                              >
                                {card.image_url ? (
                                  <img src={card.image_url} alt={card.name} className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity" />
                                ) : (
                                  <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center text-xs text-gray-400 text-center px-1">
                                    {card.name}
                                  </div>
                                )}
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                                  <Plus className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                {inDeck && (
                                  <div className="absolute top-1 right-1 bg-green-600 text-white font-bold text-xs w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                                    {inDeck.quantity || 1}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        )}
      </div>



      {/* AI Simulation Results */}
      {showSimulation && simulationResults && (
        <AISimulationResults
          results={simulationResults.results}
          deckStats={simulationResults.deckStats}
          analysis={simulationResults.analysis}
          overallWinRate={simulationResults.overallWinRate}
          numGames={simulationResults.numGames}
          deckName={activeDeck?.name}
          onClose={() => setShowSimulation(false)}
        />
      )}

      {/* Import Modal */}
      {showImportModal && activeDeck && (
        <DeckImportModal
          game={selectedGame}
          onImport={handleImportCards}
          onClose={() => setShowImportModal(false)}
        />
      )}

      {/* Playtester Modal */}
      {showPlaytester && activeDeck && (
        <DeckPlaytester
          deck={activeDeck}
          game={selectedGame}
          onClose={() => setShowPlaytester(false)}
        />
      )}

      {/* Set Variant Modal */}
      {showSetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" onClick={() => setShowSetModal(null)}>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Change Card Set: {showSetModal.product_name}</h2>
              <button
                onClick={() => setShowSetModal(null)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            {loadingVariants ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              </div>
            ) : setVariants.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {setVariants.map(variant => (
                  <button
                    key={variant.id}
                    onClick={() => updateCardVariant(showSetModal, variant)}
                    className="p-3 rounded-lg border-2 border-gray-700 hover:border-blue-400 hover:bg-gray-700 transition-all text-left"
                  >
                    {variant.image_url && (
                      <img src={variant.image_url} alt={variant.set_name} className="w-full aspect-[2/3] object-cover rounded mb-2" />
                    )}
                    <p className="text-xs text-gray-300 truncate font-medium">{variant.set_name}</p>
                    {variant.set_code && <p className="text-xs text-gray-400">{variant.set_code}</p>}
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-center text-gray-400 py-8">No variants found</p>
            )}
          </div>
        </div>
      )}

      {/* Format Change Modal */}
      {showFormatChangeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4" onClick={() => setShowFormatChangeModal(false)}>
          <div className="bg-gray-800 rounded-lg border border-gray-700 p-6 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Change Deck Format</h2>
              <button
                onClick={() => setShowFormatChangeModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
              {Object.entries(DECK_FORMATS).map(([key, fmt]) => (
                <button
                  key={key}
                  onClick={() => changeFormat(key)}
                  className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                    newFormat === key
                      ? 'border-blue-400 bg-blue-900 text-white'
                      : 'border-gray-700 hover:border-blue-400 hover:bg-gray-700 text-gray-300'
                  }`}
                >
                  <p className="font-medium">{fmt.name}</p>
                  <p className="text-xs text-gray-400 mt-1">{fmt.desc}</p>
                  {fmt.minCards > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {fmt.singleton ? 'Singleton format' : 'Up to 4 copies of each card'} • {fmt.minCards}-{fmt.maxCards === Infinity ? '∞' : fmt.maxCards} cards
                    </p>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowFormatChangeModal(false)}
              className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
