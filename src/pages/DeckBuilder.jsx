import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Plus, Search, Swords, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';
import { searchGameLocal } from '@/lib/localSearch';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { calculateDeckValue } from '@/services/pricing/pricingPipeline';

const GAME_OPTIONS = [
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokemon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Disney Lorcana' },
  { value: 'onepiece', label: 'One Piece' },
  { value: 'flesh_and_blood', label: 'Flesh and Blood' },
  { value: 'starwars', label: 'Star Wars Unlimited' }
];

const DECK_FORMAT_OPTIONS = {
  magic: ['Commander', 'Standard', 'Modern', 'Pioneer', 'Legacy', 'Pauper', 'Casual'],
  pokemon: ['Standard', 'Expanded', 'Unlimited', 'Gym Leader Challenge', 'Casual'],
  yugioh: ['Advanced', 'Traditional', 'Goat', 'Edison', 'Casual'],
  lorcana: ['Core Constructed', 'Infinity Constructed', 'Casual'],
  onepiece: ['Standard', 'Block Constructed', 'Casual'],
  flesh_and_blood: ['Classic Constructed', 'Blitz', 'Commoner', 'Living Legend', 'Casual'],
  starwars: ['Premier', 'Twin Suns', 'Casual']
};

const getGameLabel = (game) => GAME_OPTIONS.find((option) => option.value === normalizeDeckGame(game))?.label || 'Magic: The Gathering';

const formatDeckFormat = (value) => {
  if (!value) return 'Casual';
  return String(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

export default function DeckBuilder() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [creatingDeck, setCreatingDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckGame, setNewDeckGame] = useState('magic');
  const [newDeckFormat, setNewDeckFormat] = useState('Commander');
  const [activeDeck, setActiveDeck] = useState(null);
  const searchTimeoutRef = useRef(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const load = async () => {
      try {
        const isAuth = await backend.auth.isAuthenticated();
        if (isAuth) {
          const userData = await backend.auth.getCurrentUser();
          setUser(userData);
          return;
        }
        setUser(null);
      } catch (error) {
        console.error('Failed to load deck builder session:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    const formats = DECK_FORMAT_OPTIONS[newDeckGame] || ['Casual'];
    if (!formats.includes(newDeckFormat)) {
      setNewDeckFormat(formats[0]);
    }
  }, [newDeckGame, newDeckFormat]);

  const { data: lists = [] } = useQuery({
    queryKey: ['cardlists', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  useEffect(() => {
    if (!lists.length) {
      setActiveDeck(null);
      return;
    }

    const requestedDeckId = searchParams.get('deck');
    const requestedDeck = requestedDeckId ? lists.find((deck) => deck.id === requestedDeckId) : null;

    if (requestedDeck) {
      setActiveDeck((current) => current?.id === requestedDeck.id ? current : requestedDeck);
      return;
    }

    if (activeDeck) {
      const freshDeck = lists.find((deck) => deck.id === activeDeck.id);
      if (freshDeck) {
        setActiveDeck(freshDeck);
        return;
      }
    }

    setActiveDeck(lists[0]);
  }, [lists, searchParams]);

  useEffect(() => {
    if (!activeDeck?.id) return;
    if (searchParams.get('deck') === activeDeck.id) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('deck', activeDeck.id);
    setSearchParams(nextParams, { replace: true });
  }, [activeDeck?.id]);

  useEffect(() => {
    if (!activeDeck) return;
    const deckGame = normalizeDeckGame(
      activeDeck.game
      || activeDeck.items?.find((item) => item?.game || item?.product_type)?.game
      || activeDeck.items?.find((item) => item?.game || item?.product_type)?.product_type
      || 'magic'
    );
    setSelectedGame(deckGame);
  }, [activeDeck]);

  const createDeckMutation = useMutation({
    mutationFn: () => backend.data.CardList.create({
      user_email: user.email,
      name: newDeckName.trim(),
      description: `${getGameLabel(newDeckGame)} deck`,
      game: newDeckGame,
      deck_format: newDeckFormat,
      items: [],
      estimated_cost: 0
    }),
    onSuccess: (newDeck) => {
      queryClient.invalidateQueries(['cardlists']);
      setCreatingDeck(false);
      setNewDeckName('');
      setActiveDeck(newDeck);
      toast.success('Deck created!');
    }
  });

  const deleteDeckMutation = useMutation({
    mutationFn: (id) => backend.data.CardList.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['cardlists']);
      toast.success('Deck deleted');
    }
  });

  const updateDeckMutation = useMutation({
    mutationFn: ({ id, data }) => backend.data.CardList.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['cardlists']);
    }
  });

  const handleCreateDeck = () => {
    if (!newDeckName.trim() || createDeckMutation.isPending) return;
    createDeckMutation.mutate();
  };

  const handleSearchCards = async (query, game) => {
    const trimmedQuery = String(query || '').trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const results = await searchGameLocal(trimmedQuery, game, 24);
    setSearchResults(results);
    setSearching(false);
  };

  const handleSearchChange = (event) => {
    const value = event.target.value;
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => handleSearchCards(value, selectedGame), 300);
  };

  const syncDeckItems = async (updatedItems) => {
    if (!activeDeck) return;
    const estimated_cost = calculateDeckValue(updatedItems);
    await updateDeckMutation.mutateAsync({
      id: activeDeck.id,
      data: { items: updatedItems, estimated_cost }
    });
    setActiveDeck((current) => current ? { ...current, items: updatedItems, estimated_cost } : current);
  };

  const addCardToDeck = async (card) => {
    if (!activeDeck) {
      toast.error('Select a deck first');
      return;
    }

    const existing = activeDeck.items?.find((item) => item.product_id === card.id);
    let updatedItems;

    if (existing) {
      updatedItems = activeDeck.items.map((item) =>
        item.product_id === card.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item
      );
    } else {
      updatedItems = [
        ...(activeDeck.items || []),
        {
          product_id: card.id,
          api_id: card.api_id || card.id,
          oracle_id: card.oracle_id || null,
          product_name: card.name,
          product_image: card.image_url || '',
          price: card.price || 0,
          product_type: selectedGame,
          game: selectedGame,
          type: card.type_line || card.type || '',
          type_line: card.type_line || card.type || '',
          set_name: card.set_name || '',
          set_code: card.set_code || '',
          collector_number: card.collector_number || card.number || '',
          rarity: card.rarity || '',
          mana_cost: card.mana_cost || '',
          oracle_text: card.oracle_text || card.text || '',
          released_at: card.released_at || '',
          quantity: 1
        }
      ];
    }

    await syncDeckItems(updatedItems);
    toast.success(existing ? `${card.name} +1` : `Added ${card.name}`);
  };

  const removeCardFromDeck = async (productId) => {
    if (!activeDeck) return;
    const updatedItems = (activeDeck.items || []).filter((item) => item.product_id !== productId);
    await syncDeckItems(updatedItems);
  };

  const changeQty = async (productId, delta) => {
    if (!activeDeck) return;
    const updatedItems = (activeDeck.items || [])
      .map((item) => item.product_id === productId ? { ...item, quantity: (item.quantity || 1) + delta } : item)
      .filter((item) => (item.quantity || 0) > 0);
    await syncDeckItems(updatedItems);
  };

  const activeDeckGame = normalizeDeckGame(activeDeck?.game || selectedGame);
  const groupedSections = useMemo(
    () => groupDeckItems(activeDeck?.items || [], activeDeckGame),
    [activeDeck?.items, activeDeckGame]
  );
  const totalCards = (activeDeck?.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Swords className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in to use Deck Builder</h2>
          <p className="text-gray-500 mb-4">Create and manage your decks by signing in.</p>
          <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-blue-600 hover:bg-blue-700">
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between mb-6">
          <div className="flex items-center gap-3">
            <Swords className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Deck Builder</h1>
              <p className="text-sm text-gray-500">Shared deck view for mobile and desktop builds.</p>
            </div>
          </div>

          {activeDeck && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="border-blue-200 text-blue-700 hover:bg-blue-50"
                onClick={() => navigate(`/AdvancedDeckBuilder?deck=${activeDeck.id}`)}
              >
                Open Advanced View
              </Button>
              <Button
                variant="outline"
                className="border-red-200 text-red-700 hover:bg-red-50"
                onClick={() => {
                  if (confirm(`Delete "${activeDeck.name}"?`)) {
                    deleteDeckMutation.mutate(activeDeck.id);
                  }
                }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Deck
              </Button>
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-900">My Decks</h2>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setCreatingDeck((current) => !current)}>
                  <Plus className="w-4 h-4 mr-1" />
                  New
                </Button>
              </div>

              {creatingDeck && (
                <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 space-y-2">
                  <Input
                    value={newDeckName}
                    onChange={(event) => setNewDeckName(event.target.value)}
                    placeholder="Deck name..."
                    autoFocus
                  />
                  <select
                    value={newDeckGame}
                    onChange={(event) => setNewDeckGame(event.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    {GAME_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <select
                    value={newDeckFormat}
                    onChange={(event) => setNewDeckFormat(event.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    {(DECK_FORMAT_OPTIONS[newDeckGame] || ['Casual']).map((format) => (
                      <option key={format} value={format}>{format}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleCreateDeck} disabled={!newDeckName.trim()}>
                      Create
                    </Button>
                    <Button variant="outline" className="flex-1" onClick={() => setCreatingDeck(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              <ScrollArea className="h-[28rem] pr-2">
                <div className="space-y-2">
                  {lists.length === 0 ? (
                    <p className="text-sm text-gray-400 py-8 text-center">No decks yet.</p>
                  ) : (
                    lists.map((deck) => {
                      const deckCardCount = (deck.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);
                      const isActive = activeDeck?.id === deck.id;
                      return (
                        <button
                          key={deck.id}
                          type="button"
                          onClick={() => setActiveDeck(deck)}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition-colors ${
                            isActive ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                          }`}
                        >
                          <div className="font-semibold text-gray-900">{deck.name}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            {getGameLabel(deck.game || 'magic')} · {formatDeckFormat(deck.deck_format || deck.format || 'Casual')}
                          </div>
                          <div className="mt-1 text-xs text-gray-400">{deckCardCount} cards</div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>
          </aside>

          <section className="space-y-4">
            {!activeDeck ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
                <Swords className="w-14 h-14 text-gray-300 mx-auto mb-4" />
                <p className="text-lg font-semibold text-gray-900">Select a deck to open it</p>
                <p className="text-sm text-gray-500 mt-2">Any deck you build on mobile will show up here too.</p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-gray-200 bg-white p-5">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-gray-500">Deck View</div>
                      <h2 className="text-3xl font-black text-gray-950 mt-1">{activeDeck.name}</h2>
                      <p className="text-sm text-gray-500 mt-2">
                        {getGameLabel(activeDeckGame)} · {formatDeckFormat(activeDeck.deck_format || activeDeck.format || 'Casual')} · {totalCards} cards
                      </p>
                    </div>

                    <div className="flex flex-col gap-3 xl:w-[26rem]">
                      <div className="flex gap-2">
                        <select
                          value={selectedGame}
                          onChange={(event) => {
                            setSelectedGame(event.target.value);
                            setSearchQuery('');
                            setSearchResults([]);
                          }}
                          className="h-10 w-48 rounded-md border border-gray-200 bg-white px-3 text-sm"
                        >
                          {GAME_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>

                        <Button
                          variant="outline"
                          className="border-blue-200 text-blue-700 hover:bg-blue-50"
                          onClick={() => navigate(`/AdvancedDeckBuilder?deck=${activeDeck.id}`)}
                        >
                          Build Advanced
                        </Button>
                      </div>

                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <Input
                          value={searchQuery}
                          onChange={handleSearchChange}
                          placeholder={`Search ${getGameLabel(selectedGame)} cards...`}
                          className="pl-10"
                        />
                        {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />}
                      </div>
                    </div>
                  </div>
                </div>

                {searchResults.length > 0 && (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="text-sm font-semibold text-gray-900 mb-3">Search Results</div>
                    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {searchResults.map((card, index) => (
                        <div key={`${card.id}-${index}`} className="flex items-center gap-3 rounded-xl border border-gray-200 p-3">
                          <div className="h-16 w-12 overflow-hidden rounded bg-gray-100 shrink-0">
                            {getCardImageUrl(card) ? (
                              <img src={getCardImageUrl(card)} alt={card.name} className="h-full w-full object-contain" onError={(event) => handleCardImageError(event, card)} />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-gray-400">No image</div>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-gray-900">{card.name}</div>
                            <div className="truncate text-xs text-gray-500">{card.set_name || 'Card'}</div>
                            {card.type_line || card.type ? (
                              <div className="truncate text-xs text-gray-400 mt-1">{card.type_line || card.type}</div>
                            ) : null}
                          </div>
                          <Button size="sm" className="bg-blue-600 hover:bg-blue-700 shrink-0" onClick={() => addCardToDeck(card)}>
                            Add
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {groupedSections.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-gray-500">
                    Search above to start adding cards to this deck.
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    {groupedSections.map((section) => (
                      <div key={section.label} className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
                        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
                          <div className="text-sm font-black uppercase tracking-[0.14em] text-gray-700">{section.label}</div>
                          <div className="text-xs font-semibold text-gray-500">{section.totalCards} cards</div>
                        </div>
                        <div className="divide-y divide-gray-200">
                          {section.items.map((item) => (
                            <div key={item.product_id} className="grid grid-cols-[3rem_minmax(0,1fr)_6rem] items-center gap-3 px-4 py-3">
                              <div className="text-sm font-semibold text-gray-500">{item.quantity || 1}x</div>
                              <button
                                type="button"
                                onClick={() => navigate(`/CardDetail?oracle_id=${encodeURIComponent(item.oracle_id || item.product_id || '')}&search=${encodeURIComponent(item.product_name || '')}`)}
                                className="min-w-0 text-left"
                              >
                                <div className="truncate text-[15px] font-semibold text-gray-950">{item.product_name}</div>
                                {item.type || item.type_line ? (
                                  <div className="truncate text-xs text-gray-500 mt-0.5">{item.type || item.type_line}</div>
                                ) : null}
                              </button>
                              <div className="flex items-center justify-end gap-1">
                                <button type="button" onClick={() => changeQty(item.product_id, -1)} className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100">
                                  -
                                </button>
                                <button type="button" onClick={() => changeQty(item.product_id, 1)} className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-gray-600 hover:bg-gray-100">
                                  +
                                </button>
                                <button type="button" onClick={() => removeCardFromDeck(item.product_id)} className="flex h-7 w-7 items-center justify-center rounded border border-red-200 text-red-600 hover:bg-red-50">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
