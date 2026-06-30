import React, { useState, useEffect } from 'react';
import { backend } from '@/services/backend';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Trash2, Search, Swords, X, DownloadCloud, Share2, FlaskConical, BrainCircuit, RotateCcw } from 'lucide-react';
import { searchCards } from '@/components/lib/cardSearch';
import DeckPlaytester from '@/components/deckbuilder/DeckPlaytester';
import DeckImportModal from '@/components/deckbuilder/DeckImportModal';
import DeckListSidebar from '@/components/deckbuilder/DeckListSidebar';
import DeckStackView from '@/components/deckbuilder/DeckStackView';
import AISimulationResults from '@/components/deckbuilder/AISimulationResults';
import { simulateMtgCommanderDeck } from '@/lib/mtgCommanderCatalog';
import { getMtgPrintingsByOracleId, searchMtgCatalog } from '@/lib/mtgLocalCatalog';
import { normalizeDeckGame } from '@/lib/deckSections';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { toast } from 'sonner';

const DECK_TYPE_LABELS = {
  magic: ['Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Planeswalkers', 'Battles', 'Lands'],
  pokemon: ['Pokemon', 'Trainer', 'Energy'],
  yugioh: ['Monsters', 'Spells', 'Traps'],
  lorcana: ['Characters', 'Actions', 'Items', 'Songs', 'Locations'],
  onepiece: ['Leaders', 'Characters', 'Events', 'Stages'],
  flesh_and_blood: ['Heroes', 'Weapons', 'Equipment', 'Actions', 'Instants', 'Attacks', 'Reactions'],
  starwars: ['Leaders', 'Bases', 'Units', 'Events', 'Upgrades']
};

function getCompactDeckTypeLabel(typeLine, game) {
  const normalizedGame = normalizeDeckGame(game);
  const frontFace = String(typeLine || '').split('//')[0].toLowerCase();
  if (!frontFace) return 'Other';

  if (normalizedGame === 'magic') {
    if (frontFace.includes('land')) return 'Lands';
    if (frontFace.includes('creature')) return 'Creatures';
    if (frontFace.includes('planeswalker')) return 'Planeswalkers';
    if (frontFace.includes('battle')) return 'Battles';
    if (frontFace.includes('instant')) return 'Instants';
    if (frontFace.includes('sorcery')) return 'Sorceries';
    if (frontFace.includes('enchantment')) return 'Enchantments';
    if (frontFace.includes('artifact')) return 'Artifacts';
  }

  if (normalizedGame === 'pokemon') {
    if (frontFace.includes('energy')) return 'Energy';
    if (frontFace.includes('trainer')) return 'Trainer';
    if (frontFace.includes('pok')) return 'Pokemon';
  }

  if (normalizedGame === 'yugioh') {
    if (frontFace.includes('spell')) return 'Spells';
    if (frontFace.includes('trap')) return 'Traps';
    if (frontFace.includes('monster') || frontFace.includes('effect') || frontFace.includes('fusion') || frontFace.includes('synchro') || frontFace.includes('xyz') || frontFace.includes('link') || frontFace.includes('ritual') || frontFace.includes('normal')) {
      return 'Monsters';
    }
  }

  if (normalizedGame === 'lorcana') {
    if (frontFace.includes('character')) return 'Characters';
    if (frontFace.includes('action')) return 'Actions';
    if (frontFace.includes('item')) return 'Items';
    if (frontFace.includes('song')) return 'Songs';
    if (frontFace.includes('location')) return 'Locations';
  }

  if (normalizedGame === 'onepiece') {
    if (frontFace.includes('leader')) return 'Leaders';
    if (frontFace.includes('character')) return 'Characters';
    if (frontFace.includes('event')) return 'Events';
    if (frontFace.includes('stage')) return 'Stages';
  }

  if (normalizedGame === 'flesh_and_blood') {
    if (frontFace.includes('hero')) return 'Heroes';
    if (frontFace.includes('weapon')) return 'Weapons';
    if (frontFace.includes('equipment')) return 'Equipment';
    if (frontFace.includes('instant')) return 'Instants';
    if (frontFace.includes('attack')) return 'Attacks';
    if (frontFace.includes('reaction')) return 'Reactions';
    if (frontFace.includes('action')) return 'Actions';
  }

  if (normalizedGame === 'starwars') {
    if (frontFace.includes('leader')) return 'Leaders';
    if (frontFace.includes('base')) return 'Bases';
    if (frontFace.includes('unit')) return 'Units';
    if (frontFace.includes('event')) return 'Events';
    if (frontFace.includes('upgrade')) return 'Upgrades';
  }

  return 'Other';
}

const DECK_FORMATS_BY_GAME = {
  magic: {
    commander: { name: 'Commander', minCards: 100, maxCards: 100, singleton: true, maxCopies: 1, desc: '100-card singleton deck with a legendary creature commander' },
    standard: { name: 'Standard', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from current legal sets' },
    modern: { name: 'Modern', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from Modern-legal sets onward' },
    pioneer: { name: 'Pioneer', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck from Pioneer-legal sets' },
    legacy: { name: 'Legacy', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck with Legacy legality' },
    vintage: { name: 'Vintage', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck with Vintage restrictions' },
    pauper: { name: 'Pauper', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ card deck using common-rarity legality' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 4, desc: 'Unrestricted casual play' }
  },
  pokemon: {
    standard: { name: 'Standard', minCards: 60, maxCards: 60, singleton: false, maxCopies: 4, desc: '60-card Pokemon deck; basic Energy can exceed normal copy limits' },
    expanded: { name: 'Expanded', minCards: 60, maxCards: 60, singleton: false, maxCopies: 4, desc: '60-card Expanded deck; basic Energy can exceed normal copy limits' },
    unlimited: { name: 'Unlimited', minCards: 60, maxCards: 60, singleton: false, maxCopies: 4, desc: '60-card legacy card pool deck' },
    limited: { name: 'Limited', minCards: 40, maxCards: 40, singleton: false, maxCopies: Infinity, desc: '40-card sealed or draft deck' },
    gym_leader_challenge: { name: 'Gym Leader Challenge', minCards: 60, maxCards: 60, singleton: true, maxCopies: 1, desc: '60-card singleton community format' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 4, desc: 'Casual Pokemon deck' }
  },
  yugioh: {
    advanced: { name: 'Advanced', minCards: 40, maxCards: 60, singleton: false, maxCopies: 3, desc: '40-60 card Main Deck using the current Forbidden & Limited List' },
    traditional: { name: 'Traditional', minCards: 40, maxCards: 60, singleton: false, maxCopies: 3, desc: '40-60 card Main Deck where Forbidden cards are Limited instead' },
    speed_duel: { name: 'Speed Duel', minCards: 20, maxCards: 30, singleton: false, maxCopies: 3, desc: '20-30 card Speed Duel deck' },
    rush_duel: { name: 'Rush Duel', minCards: 40, maxCards: 60, singleton: false, maxCopies: 3, desc: '40-60 card Rush Duel deck' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 3, desc: 'Casual Yu-Gi-Oh! deck' }
  },
  lorcana: {
    core_constructed: { name: 'Core Constructed', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ cards, up to two ink colors, up to four copies' },
    infinity_constructed: { name: 'Infinity Constructed', minCards: 60, maxCards: Infinity, singleton: false, maxCopies: 4, desc: '60+ cards using the larger non-rotating card pool' },
    limited: { name: 'Limited', minCards: 40, maxCards: Infinity, singleton: false, maxCopies: Infinity, desc: 'Draft or sealed deck built from opened product' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 4, desc: 'Casual Lorcana deck' }
  },
  onepiece: {
    constructed: { name: 'Constructed', minCards: 61, maxCards: 61, singleton: false, maxCopies: 4, desc: '1 Leader, 50-card deck, and 10 DON!! cards' },
    sealed: { name: 'Sealed', minCards: 41, maxCards: Infinity, singleton: false, maxCopies: Infinity, desc: 'Limited event deck with leader and opened product' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 4, desc: 'Casual One Piece deck' }
  },
  flesh_and_blood: {
    blitz: { name: 'Blitz', minCards: 53, maxCards: 53, singleton: false, maxCopies: 1, desc: '1 young hero plus a 52-card pool; start with exactly 40 deck cards' },
    classic_constructed: { name: 'Classic Constructed', minCards: 81, maxCards: 81, singleton: false, maxCopies: 3, desc: '1 adult hero plus an 80-card pool; start with at least 60 deck cards' },
    commoner: { name: 'Commoner', minCards: 53, maxCards: 53, singleton: false, maxCopies: 2, desc: 'Blitz-style common/rare card-pool restrictions' },
    living_legend: { name: 'Living Legend', minCards: 81, maxCards: 81, singleton: false, maxCopies: 3, desc: 'Classic Constructed-style format with Living Legend legality' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 3, desc: 'Casual Flesh and Blood card pool' }
  },
  starwars: {
    premier: { name: 'Premier', minCards: 52, maxCards: Infinity, singleton: false, maxCopies: 3, desc: '1 Leader, 1 Base, and at least 50 draw-deck cards' },
    twin_suns: { name: 'Twin Suns', minCards: 83, maxCards: Infinity, singleton: true, maxCopies: 1, desc: '2 Leaders, 1 Base, and at least 80 singleton cards' },
    trilogy: { name: 'Trilogy', minCards: 52, maxCards: Infinity, singleton: false, maxCopies: 3, desc: 'Premier-style deck used as part of a three-deck lineup' },
    limited: { name: 'Limited', minCards: 32, maxCards: Infinity, singleton: false, maxCopies: Infinity, desc: 'Draft or sealed with 1 Leader, 1 Base, and 30+ draw cards' },
    casual: { name: 'Casual', minCards: 0, maxCards: Infinity, singleton: false, maxCopies: 3, desc: 'Casual Star Wars: Unlimited deck' }
  }
};

function normalizeDeckFormatKey(value) {
  return String(value || 'casual')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function getDeckFormatMap(game = 'magic') {
  const normalizedGame = normalizeDeckGame(game);
  return DECK_FORMATS_BY_GAME[normalizedGame] || DECK_FORMATS_BY_GAME.magic;
}

function getDefaultDeckFormat(game = 'magic') {
  return Object.keys(getDeckFormatMap(game))[0] || 'casual';
}

function getDeckFormatConfig(value, game = 'magic') {
  const normalized = normalizeDeckFormatKey(value);
  const formats = getDeckFormatMap(game);
  return formats[normalized] || {
    name: String(value || 'Casual'),
    minCards: 0,
    maxCards: Infinity,
    singleton: false,
    maxCopies: 4,
    desc: 'Custom format'
  };
}

function getDeckItemType(item) {
  return String(item?.type_line || item?.type || item?.product_type || '').toLowerCase();
}

function getDeckItemCopyKey(item) {
  return String(item?.card_number || item?.api_id || item?.product_id || item?.product_name || '')
    .trim()
    .toLowerCase();
}

function getDeckItemNameKey(item) {
  return String(item?.product_name || item?.name || item?.card_number || item?.product_id || '')
    .trim()
    .toLowerCase();
}

function countCards(items, predicate) {
  return items
    .filter(predicate)
    .reduce((sum, item) => sum + (item.quantity || 1), 0);
}

const ANY_NUMBER_CARD_NAMES = new Set([
  'dragons approach',
  'hare apparent',
  'persistent petitioners',
  'rat colony',
  'relentless rats',
  'shadowborn apostle',
  'slime against humanity',
  'templar knight'
]);

function allowsAnyNumberOfCopies(item) {
  const name = getDeckItemNameKey(item).replace(/['’]/g, '');
  const oracleText = String(item?.oracle_text || '').toLowerCase();
  return ANY_NUMBER_CARD_NAMES.has(name) || oracleText.includes('a deck can have any number of cards named');
}

function findCopyLimitErrors(items, maxCopies, options = {}) {
  if (!Number.isFinite(maxCopies)) return [];
  const { keyBy = getDeckItemNameKey, ignore = () => false, label = 'card' } = options;
  const counts = new Map();

  for (const item of items) {
    if (ignore(item) || allowsAnyNumberOfCopies(item)) continue;
    const key = keyBy(item);
    if (!key) continue;
    const current = counts.get(key) || { name: item.product_name || item.name || key, quantity: 0 };
    current.quantity += item.quantity || 1;
    counts.set(key, current);
  }

  return [...counts.values()]
    .filter((entry) => entry.quantity > maxCopies)
    .map((entry) => `${entry.name} has ${entry.quantity} copies; ${label} limit is ${maxCopies}`);
}

export default function AdvancedDeckBuilder() {
  const [searchParams, setSearchParams] = useSearchParams();
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
  const [cardDisplayMode, setCardDisplayMode] = useState('grid'); // 'grid' or 'text'
  const [showSetModal, setShowSetModal] = useState(null); // { productId, productName }
  const [setVariants, setSetVariants] = useState([]);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [showPlaytester, setShowPlaytester] = useState(false);
  const [showSimulationResults, setShowSimulationResults] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [simulationResults, setSimulationResults] = useState(null);
  const [showFormatChangeModal, setShowFormatChangeModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newFormat, setNewFormat] = useState(deckFormat);
  const [quickAddSuggestions, setQuickAddSuggestions] = useState([]);
  const [selectedQuickCard, setSelectedQuickCard] = useState(null);
  const [showQuickAddDropdown, setShowQuickAddDropdown] = useState(false);
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.innerWidth < 768);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleResize = () => {
      const compact = window.innerWidth < 768;
      setIsCompactLayout(compact);
      setCardDisplayMode(compact ? 'text' : 'grid');
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
        console.error('Failed to load advanced deck builder session:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // When a deck is loaded, backfill missing MTG type/image data from the local catalog.
  useEffect(() => {
    if (!activeDeck?.id) return;

    const missingType = activeDeck.items?.filter(i =>
      normalizeDeckGame(i.product_type || i.game || activeDeck.game || selectedGame) === 'magic'
      && (
        !i.type
        || !i.type_line
        || (i.product_image && i.product_image.includes('/small/'))
      )
    );
    if (!missingType || missingType.length === 0) return;

    const backfillTypes = async () => {
      const results = await Promise.all(
        missingType.map(async (i) => {
          try {
            let resolved = null;

            if (i.oracle_id) {
              const printings = await getMtgPrintingsByOracleId(i.oracle_id);
              resolved = printings.find((printing) => printing.id === i.product_id)
                || printings.find((printing) => String(printing.set_code || '').toUpperCase() === String(i.set_code || '').toUpperCase())
                || printings[0]
                || null;
            }

            if (!resolved && i.product_name) {
              const matches = await searchMtgCatalog(i.product_name, 20);
              resolved = matches.find((card) => card.id === i.product_id)
                || matches.find((card) => card.oracle_id && card.oracle_id === i.oracle_id)
                || matches.find((card) => String(card.set_code || '').toUpperCase() === String(i.set_code || '').toUpperCase())
                || matches[0]
                || null;
            }

            if (!resolved && i.product_id) {
              try {
                const response = await fetch(`https://api.scryfall.com/cards/${i.product_id}`);
                if (response.ok) {
                  const data = await response.json();
                  const normalImage = data.image_uris?.normal || data.card_faces?.[0]?.image_uris?.normal || null;
                  resolved = {
                    type: data.card_faces?.[0]?.type_line || data.type_line || '',
                    image_url: normalImage,
                    oracle_id: data.oracle_id || i.oracle_id || null,
                    set_code: String(data.set || i.set_code || '').toUpperCase(),
                  };
                }
              } catch {
                // Keep the existing item data when Scryfall is unavailable.
              }
            }

            return {
              product_id: i.product_id,
              type: resolved?.type || i.type || '',
              type_line: resolved?.type || i.type_line || i.type || '',
              image: resolved?.image_url || i.product_image,
              oracle_id: resolved?.oracle_id || i.oracle_id || null,
              set_code: resolved?.set_code || i.set_code || '',
            };
          } catch {
            return {
              product_id: i.product_id,
              type: i.type || '',
              type_line: i.type_line || i.type || '',
              image: i.product_image,
              oracle_id: i.oracle_id || null,
              set_code: i.set_code || '',
            };
          }
        })
      );

      const fixMap = Object.fromEntries(results.map(r => [r.product_id, r]));
      const updatedItems = activeDeck.items.map(i => {
        const fix = fixMap[i.product_id];
        if (!fix) return i;
        return {
          ...i,
          type: fix.type || i.type,
          type_line: fix.type_line || i.type_line || i.type,
          oracle_id: fix.oracle_id || i.oracle_id,
          set_code: fix.set_code || i.set_code,
          product_image: fix.image || i.product_image
        };
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

  useEffect(() => {
    if (!decks.length) return;
    const requestedDeckId = searchParams.get('deck');
    if (requestedDeckId) {
      const requestedDeck = decks.find((deck) => deck.id === requestedDeckId);
      if (requestedDeck && activeDeck?.id !== requestedDeck.id) {
        setActiveDeck(requestedDeck);
      }
      return;
    }
    if (!activeDeck) {
      setActiveDeck(decks[0]);
    }
  }, [decks, searchParams]);

  useEffect(() => {
    if (!activeDeck?.id) return;
    if (searchParams.get('deck') === activeDeck.id) return;
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set('deck', activeDeck.id);
    setSearchParams(nextParams, { replace: true });
  }, [activeDeck?.id]);

  const createDeckMutation = useMutation({
    mutationFn: () => backend.data.CardList.create({
      user_email: user.email,
      name: newDeckName.trim(),
      description: `${selectedGame.charAt(0).toUpperCase() + selectedGame.slice(1)} deck`,
      game: selectedGame,
      deck_format: getDeckFormatMap(selectedGame)[normalizeDeckFormatKey(deckFormat)] ? deckFormat : getDefaultDeckFormat(selectedGame),
      items: [],
      estimated_cost: 0
    }),
    onSuccess: (newDeck) => {
      queryClient.invalidateQueries(['cardlists']);
      setNewDeckName('');
      setCreatingDeck(false);
      setActiveDeck(newDeck);
      setDeckFormat(getDefaultDeckFormat(selectedGame));
      toast.success('Deck created!');
    },
    onError: (error) => {
      console.error('Deck creation failed:', error);
      toast.error(error?.message || 'Deck creation failed');
    }
  });

  const handleCreateDeck = () => {
    if (createDeckMutation.isPending) return;
    const trimmedName = String(newDeckName || '').trim();
    if (!trimmedName) return;
    createDeckMutation.mutate();
  };

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
    if (normalizeDeckFormatKey(activeDeck.deck_format) === 'commander') {
      const isBasicLand = card.type?.toLowerCase().includes('basic');
      const existing = activeDeck.items?.find(i => i.product_id === card.id);
      
      if (existing && !isBasicLand && !allowsAnyNumberOfCopies(card)) {
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
        product_image: getCardImageUrl(card),
        image_url: card.image_url || null,
        english_image_url: card.english_image_url || null,
        image_small: card.image_small || null,
        fallback_image_url: card.fallback_image_url || null,
        price: card.price || 0,
        product_type: selectedGame,
        type: card.type,
        quantity: qty,
        mana_cost: card.mana_cost || '',
        cmc: card.cmc ?? 0,
        oracle_text: card.oracle_text || '',
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

  const clearDeckCards = async () => {
    if (!activeDeck?.items?.length) {
      toast.error('This deck is already empty');
      return;
    }

    if (!confirm(`Remove all cards from "${activeDeck.name}"?`)) {
      return;
    }

    await backend.data.CardList.update(activeDeck.id, {
      items: [],
      estimated_cost: 0,
    });

    setActiveDeck({
      ...activeDeck,
      items: [],
      estimated_cost: 0,
    });
    queryClient.invalidateQueries(['cardlists']);
    toast.success('All cards removed from deck');
  };

  const handleSearchCards = async (query) => {
    const trimmedQuery = String(query || '').trim();
    if (trimmedQuery.length < 2) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const results = await searchCards(trimmedQuery, selectedGame, 18);
    setSearchResults(results);
    setSearching(false);
  };

  const exportDeck = () => {
    if (!activeDeck?.items?.length) {
      toast.error('There are no cards to export');
      return;
    }

    const lines = [...activeDeck.items]
      .sort((a, b) => String(a.product_name || '').localeCompare(String(b.product_name || '')))
      .map((item) => `${item.quantity || 1} ${item.product_name}`)
      .join('\n');
    const blob = new Blob([`${activeDeck.name}\n${activeDeck.deck_format || ''}\n\n${lines}\n`], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${String(activeDeck.name || 'deck').replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'deck'}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.success('Deck exported');
  };

  const handleSimulation = async () => {
    if (!activeDeck?.items?.length) {
      toast.error('Build or import a deck first');
      return;
    }
    if (selectedGame !== 'magic') {
      toast.error('Gauntlet simulation is only wired for MTG right now');
      return;
    }

    setSimulationLoading(true);
    try {
      const payload = await simulateMtgCommanderDeck(activeDeck);
      setSimulationResults(payload);
      setShowSimulationResults(true);
    } catch (error) {
      toast.error(error.message || 'Simulation failed');
    } finally {
      setSimulationLoading(false);
    }
  };

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    clearTimeout(window._advSearchTimeout);
    window._advSearchTimeout = setTimeout(() => handleSearchCards(val), 500);
  };

  const validateDeckLegality = (deckData) => {
    const game = normalizeDeckGame(deckData.game || selectedGame);
    const formatKey = normalizeDeckFormatKey(deckData.deck_format || getDefaultDeckFormat(game));
    const fmt = getDeckFormatConfig(formatKey, game);
    const items = deckData.items || [];
    const totalCards = items.reduce((sum, i) => sum + (i.quantity || 1), 0) || 0;
    const errors = [];

    if (totalCards < fmt.minCards) {
      errors.push(`Deck too small (${totalCards}/${fmt.minCards} cards)`);
    }
    if (fmt.maxCards !== Infinity && totalCards > fmt.maxCards) {
      errors.push(`Deck too large (${totalCards}/${fmt.maxCards} cards)`);
    }

    if (game === 'magic') {
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, {
        ignore: (item) => getDeckItemType(item).includes('basic') && getDeckItemType(item).includes('land'),
        label: fmt.name
      }));
    }

    if (game === 'pokemon') {
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, {
        ignore: (item) => getDeckItemType(item).includes('basic energy'),
        label: fmt.name
      }));
    }

    if (game === 'yugioh') {
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, { label: fmt.name }));
    }

    if (game === 'lorcana') {
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, { label: fmt.name }));
      const inkColors = new Set(items.map((item) => String(item.ink || item.color || '').trim()).filter(Boolean));
      if (formatKey.includes('constructed') && inkColors.size > 2) {
        errors.push(`Lorcana constructed decks can use at most 2 ink colors (${inkColors.size} found)`);
      }
    }

    if (game === 'onepiece' && formatKey === 'constructed') {
      const leaders = countCards(items, (item) => getDeckItemType(item).includes('leader'));
      const donCards = countCards(items, (item) => getDeckItemType(item).includes('don'));
      const mainDeckCards = totalCards - leaders - donCards;
      const leaderItem = items.find((item) => getDeckItemType(item).includes('leader'));
      const leaderColors = new Set((leaderItem?.colors || leaderItem?.color || [])
        .flat()
        .map((color) => String(color).toLowerCase())
        .filter(Boolean));
      if (leaders !== 1) errors.push(`One Piece Constructed needs exactly 1 Leader (${leaders} found)`);
      if (donCards !== 10) errors.push(`One Piece Constructed needs exactly 10 DON!! cards (${donCards} found)`);
      if (mainDeckCards !== 50) errors.push(`One Piece Constructed needs exactly 50 main-deck cards (${mainDeckCards} found)`);
      if (leaderColors.size > 0) {
        const offColor = items.find((item) => {
          const type = getDeckItemType(item);
          if (type.includes('leader') || type.includes('don')) return false;
          const cardColors = (item.colors || item.color || []).flat().map((color) => String(color).toLowerCase()).filter(Boolean);
          return cardColors.length > 0 && cardColors.some((color) => !leaderColors.has(color));
        });
        if (offColor) {
          errors.push(`One Piece card color does not match leader colors: ${offColor.product_name}`);
        }
      }
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, {
        keyBy: getDeckItemCopyKey,
        ignore: (item) => {
          const type = getDeckItemType(item);
          return type.includes('leader') || type.includes('don');
        },
        label: fmt.name
      }));
    }

    if (game === 'flesh_and_blood') {
      const heroes = countCards(items, (item) => getDeckItemType(item).includes('hero'));
      const heroItem = items.find((item) => getDeckItemType(item).includes('hero'));
      const heroClass = getDeckItemType(heroItem).split(/\s+/)[0] || '';
      if (['blitz', 'classic_constructed', 'commoner', 'living_legend'].includes(formatKey) && heroes !== 1) {
        errors.push(`Flesh and Blood ${fmt.name} needs exactly 1 hero (${heroes} found)`);
      }
      if (heroClass) {
        const offClass = items.find((item) => {
          const type = getDeckItemType(item);
          if (type.includes('hero')) return false;
          return !type.includes(heroClass) && !type.includes('generic');
        });
        if (offClass) {
          errors.push(`FAB card does not match hero class or Generic pool: ${offClass.product_name}`);
        }
      }
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, {
        ignore: (item) => {
          const type = getDeckItemType(item);
          return type.includes('hero') || type.includes('weapon') || type.includes('equipment');
        },
        label: fmt.name
      }));
    }

    if (game === 'starwars') {
      const leaders = countCards(items, (item) => getDeckItemType(item).includes('leader'));
      const bases = countCards(items, (item) => getDeckItemType(item).includes('base'));
      const drawDeckCards = totalCards - leaders - bases;
      if (formatKey === 'premier' || formatKey === 'trilogy') {
        if (leaders !== 1) errors.push(`${fmt.name} needs exactly 1 Leader (${leaders} found)`);
        if (bases !== 1) errors.push(`${fmt.name} needs exactly 1 Base (${bases} found)`);
        if (drawDeckCards < 50) errors.push(`${fmt.name} needs at least 50 draw-deck cards (${drawDeckCards} found)`);
      }
      if (formatKey === 'twin_suns') {
        if (leaders !== 2) errors.push('Twin Suns needs exactly 2 Leaders');
        if (bases !== 1) errors.push(`Twin Suns needs exactly 1 Base (${bases} found)`);
        if (drawDeckCards < 80) errors.push(`Twin Suns needs at least 80 draw-deck cards (${drawDeckCards} found)`);
      }
      errors.push(...findCopyLimitErrors(items, fmt.maxCopies, {
        ignore: (item) => {
          const type = getDeckItemType(item);
          return type.includes('leader') || type.includes('base');
        },
        label: fmt.name
      }));
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
    toast.success(`Format changed to ${getDeckFormatConfig(newFmt, updatedDeck.game || selectedGame).name}`);
  };

  const totalCards = activeDeck?.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0;

  useEffect(() => {
    if (!activeDeck?.game) return;
    const nextGame = normalizeDeckGame(activeDeck.game);
    if (nextGame !== selectedGame) {
      setSelectedGame(nextGame);
      setSearchResults([]);
      setSearchQuery('');
    }
  }, [activeDeck?.id, activeDeck?.game]);

  useEffect(() => {
    const formats = getDeckFormatMap(selectedGame);
    if (!formats[normalizeDeckFormatKey(deckFormat)]) {
      setDeckFormat(getDefaultDeckFormat(selectedGame));
    }
  }, [selectedGame, deckFormat]);

  const deckGame = normalizeDeckGame(selectedGame);

  const isCommanderFormat = normalizeDeckFormatKey(activeDeck?.deck_format) === 'commander';
  const commanderDeckItem = isCommanderFormat ? activeDeck?.items?.find((item) => item.is_commander) || null : null;
  const compactDeckGroups = (() => {
    if (!activeDeck?.items?.length) return [];

    const sourceItems = isCommanderFormat
      ? activeDeck.items.filter((item) => !item.is_commander)
      : activeDeck.items;

    const groupedItems = sourceItems.reduce((acc, item) => {
      const typeLabel = getCompactDeckTypeLabel(item.type || item.type_line, deckGame);
      if (!acc[typeLabel]) {
        acc[typeLabel] = [];
      }
      acc[typeLabel].push(item);
      return acc;
    }, {});

    const preferredOrder = DECK_TYPE_LABELS[deckGame] || [];
    const orderedLabels = [...preferredOrder.filter((label) => groupedItems[label]?.length), ...Object.keys(groupedItems).filter((label) => !preferredOrder.includes(label))];

    return orderedLabels.map((label) => ({
      label,
      items: groupedItems[label],
      totalCards: groupedItems[label].reduce((sum, item) => sum + (item.quantity || 1), 0),
    }));
  })();

  const deckListColumns = (() => {
    const groupMap = Object.fromEntries(compactDeckGroups.map((group) => [group.label, group]));
    const takeGroup = (label) => groupMap[label] ? { type: 'group', group: groupMap[label] } : null;
    const commanderSection = isCommanderFormat ? { type: 'commander' } : null;

    if (deckGame === 'magic') {
      const usedLabels = new Set(['Artifacts', 'Enchantments', 'Planeswalkers', 'Battles', 'Lands', 'Creatures', 'Instants', 'Sorceries']);
      const utilityColumn = [
        commanderSection,
        takeGroup('Artifacts'),
        takeGroup('Enchantments'),
        takeGroup('Planeswalkers'),
        takeGroup('Battles'),
        takeGroup('Lands'),
      ].filter(Boolean);
      const remaining = compactDeckGroups
        .filter((group) => !usedLabels.has(group.label))
        .map((group) => ({ type: 'group', group }));

      return [
        utilityColumn,
        [takeGroup('Creatures')].filter(Boolean),
        [takeGroup('Instants')].filter(Boolean),
        [takeGroup('Sorceries')].filter(Boolean),
        remaining,
      ].filter((column) => column.length > 0);
    }

    const genericSections = [
      commanderSection,
      ...compactDeckGroups.map((group) => ({ type: 'group', group })),
    ].filter(Boolean);

    return genericSections.map((section) => [section]);
  })();

  const handleImportCards = async (importedItems) => {
    if (!activeDeck) return;
    // Import should fill missing cards, not double cards already in the deck.
    let updatedItems = [...(activeDeck.items || [])];
    let addedCount = 0;
    let skippedCount = 0;
    for (const item of importedItems) {
      const existing = updatedItems.find(i => i.product_id === item.product_id);
      if (existing) {
        skippedCount += item.quantity || 1;
      } else {
        updatedItems.push(item);
        addedCount += item.quantity || 1;
      }
    }
    const newCost = updatedItems.reduce((sum, i) => sum + ((i.price || 0) * (i.quantity || 1)), 0);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems, estimated_cost: newCost });
    setActiveDeck({ ...activeDeck, items: updatedItems, estimated_cost: newCost });
    queryClient.invalidateQueries(['cardlists']);
    setShowImportModal(false);
    toast.success(
      skippedCount > 0 ?
      `Imported ${addedCount} new cards and skipped ${skippedCount} already in deck.` :
      `Imported ${addedCount} cards!`
    );
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
                  {activeDeck ? `${activeDeck.name} - ${getDeckFormatConfig(activeDeck.deck_format || getDefaultDeckFormat(deckGame), deckGame).name}` : 'Advanced Deck Builder'}
                </h1>
                {activeDeck && (
                  <p className="text-xs text-gray-400">{totalCards} cards | {activeDeck.items?.length || 0} unique</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeDeck && (
                <>
                  <Button
                    size="sm" variant="outline"
                    className="h-8 text-xs bg-yellow-700 border-yellow-600 text-white hover:bg-yellow-600 disabled:opacity-60"
                    onClick={handleSimulation}
                    disabled={simulationLoading}
                  >
                    {simulationLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <BrainCircuit className="w-3 h-3 mr-1" />}AI Simulate
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-blue-900 border-blue-700 text-blue-100 hover:bg-blue-800"
                    onClick={() => setCardDisplayMode((current) => current === 'grid' ? 'text' : 'grid')}
                  >
                    {cardDisplayMode === 'grid' ? 'Deck View' : 'Advanced View'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600" onClick={exportDeck}>
                    <Share2 className="w-3 h-3 mr-1" />Export
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-amber-900 border-amber-700 text-amber-100 hover:bg-amber-800"
                    onClick={clearDeckCards}
                  >
                    <RotateCcw className="w-3 h-3 mr-1" />Clear Cards
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
                <option value="pokemon">Pokemon</option>
                <option value="yugioh">Yu-Gi-Oh!</option>
                <option value="lorcana">Lorcana</option>
                <option value="onepiece">One Piece</option>
                <option value="flesh_and_blood">Flesh and Blood</option>
                <option value="starwars">Star Wars</option>
              </select>
            </div>
          </div>

          {/* Search and Controls */}
          <div className={`flex gap-3 ${isCompactLayout ? 'flex-col items-stretch' : 'items-center'}`}>
            {activeDeck && (() => {
              const validation = validateDeckLegality(activeDeck);
              return (
                <div className={`bg-gray-700 rounded-lg py-2 px-3 border border-blue-500 border-dashed ${isCompactLayout ? 'space-y-2' : 'flex items-center gap-3'}`}>
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-xs text-gray-400">Format:</span>
                    <button
                      onClick={() => { setNewFormat(activeDeck.deck_format || getDefaultDeckFormat(deckGame)); setShowFormatChangeModal(true); }}
                      className="text-xs font-semibold text-blue-300 hover:text-blue-100 transition-colors bg-blue-900 px-2 py-1 rounded hover:bg-blue-800"
                    >
                      {getDeckFormatConfig(activeDeck.deck_format || getDefaultDeckFormat(deckGame), deckGame).name}
                    </button>
                  </div>
                  {!isCompactLayout && <span className="text-xs text-gray-500">|</span>}
                  <div className={`text-xs font-semibold px-2 py-1 rounded ${validation.isLegal ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                    {validation.isLegal ? 'Legal' : 'Not Legal'}
                  </div>
                  {!validation.isLegal && (
                    <div className="text-xs text-red-200 max-w-md">
                      {validation.errors.slice(0, 2).join(' | ')}
                    </div>
                  )}
                  {!isCompactLayout && <span className="text-xs text-gray-500">|</span>}
                  <div className="text-xs text-gray-300 font-semibold">Deck Value: ${activeDeck.estimated_cost?.toFixed(2) || '0.00'}</div>
                </div>
              );
            })()}
            <div className={`relative flex-1 ${isCompactLayout ? 'w-full' : 'max-w-xs'}`}>
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
            <div className={`relative flex-1 ${isCompactLayout ? 'w-full' : 'max-w-xs'}`}>
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={handleSearchChange}
                onFocus={() => searchResults.length > 0 && setSearchResults(searchResults)}
                placeholder="Search cards..."
                className="pl-9 h-8 text-sm border-gray-600 bg-gray-700 text-white placeholder:text-gray-400"
              />
              {searching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-400" />}
              {/* Photo search results - floating overlay */}
              {(searchResults.length > 0 || (searching && searchQuery.length >= 2)) && (
                <div className={`absolute top-full left-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-2xl z-50 max-h-[70vh] overflow-y-auto ${isCompactLayout ? 'right-0 w-full' : 'w-[600px]'}`}>
                  <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
                    <span className="text-xs font-semibold text-gray-300">Results for "{searchQuery}" - click to add</span>
                    <button onClick={() => { setSearchResults([]); setSearchQuery(''); }} className="text-gray-400 hover:text-white">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {searching ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                    </div>
                  ) : (
                    <div className={isCompactLayout ? 'divide-y divide-gray-700' : 'grid grid-cols-3 gap-3 p-3'}>
                      {searchResults.map(card => {
                        const inDeck = activeDeck?.items?.find(i => i.product_id === card.id);
                        return isCompactLayout ? (
                          <button
                            key={card.id}
                            onClick={() => addCardToDeck(card)}
                            className="w-full flex items-center gap-3 px-3 py-3 text-left hover:bg-gray-700 transition-colors"
                          >
                            <div className="w-12 h-16 rounded overflow-hidden bg-gray-700 shrink-0">
                              {getCardImageUrl(card) ? (
                                <img src={getCardImageUrl(card)} alt={card.name} onError={(event) => handleCardImageError(event, card)} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 px-1 text-center">{card.name}</div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-white truncate">{card.name}</p>
                              <p className="text-xs text-gray-400 truncate">{card.set_name || 'Unknown set'}</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {inDeck && (
                                <span className="bg-green-600 text-white font-bold text-xs w-5 h-5 rounded-full flex items-center justify-center">
                                  {inDeck.quantity || 1}
                                </span>
                              )}
                              <Plus className="w-4 h-4 text-blue-300" />
                            </div>
                          </button>
                        ) : (
                          <div
                            key={card.id}
                            className="relative group rounded overflow-hidden border border-gray-700 hover:border-blue-400 cursor-pointer transition-all"
                            onClick={() => addCardToDeck(card)}
                            title={card.name}
                          >
                            {getCardImageUrl(card) ? (
                              <img src={getCardImageUrl(card)} alt={card.name} onError={(event) => handleCardImageError(event, card)} className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity" />
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
        <div className={`min-h-[calc(100vh-140px)] ${isCompactLayout ? 'px-4 py-5' : 'flex'}`}>
          {!isCompactLayout && (
            <DeckListSidebar
              decks={decks}
              activeDeck={activeDeck}
              onSelectDeck={setActiveDeck}
              onCreateNew={() => setCreatingDeck(true)}
              creatingDeck={creatingDeck}
              newDeckName={newDeckName}
              onNameChange={setNewDeckName}
              onConfirmCreate={handleCreateDeck}
              onCancelCreate={() => setCreatingDeck(false)}
            />
          )}

          {isCompactLayout ? (
            <div className="space-y-5">
              <div className="bg-gray-800 rounded-lg border border-gray-700 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{activeDeck.name}</h2>
                      <p className="text-sm text-gray-400 mt-1">
                        {getDeckFormatConfig(activeDeck.deck_format || getDefaultDeckFormat(deckGame), deckGame).name} · {totalCards} cards
                      </p>
                    </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setShowFormatChangeModal(true)}
                    className="border-gray-600 bg-gray-700 text-gray-100 hover:bg-gray-600"
                  >
                    Format
                  </Button>
                </div>
              </div>

              {compactDeckGroups.map((group) => (
                <div key={group.label} className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">{group.label}</h3>
                    <span className="text-xs text-gray-400">
                      {group.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} cards
                    </span>
                  </div>
                  <div className="divide-y divide-gray-700">
                    {group.items.map((item) => (
                      <div key={item.product_id} className="flex items-center gap-3 px-4 py-3">
                        <div className="w-10 h-14 rounded overflow-hidden bg-gray-700 shrink-0">
                          {getCardImageUrl(item) ? (
                            <img src={getCardImageUrl(item)} alt={item.product_name} onError={(event) => handleCardImageError(event, item)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 px-1 text-center">
                              {item.product_name}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white truncate">{item.product_name}</p>
                          <p className="text-xs text-gray-400 truncate">{item.type || 'Card'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => changeQty(item.product_id, (item.quantity || 1) - 1)}
                            className="w-7 h-7 rounded bg-gray-700 hover:bg-gray-600 text-white flex items-center justify-center"
                          >
                            -
                          </button>
                          <span className="w-6 text-center text-sm font-semibold text-white">{item.quantity || 1}</span>
                          <button
                            onClick={() => changeQty(item.product_id, (item.quantity || 1) + 1)}
                            className="w-7 h-7 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeCardFromDeck(item.product_id)}
                            className="w-7 h-7 rounded bg-red-600/20 hover:bg-red-600/30 text-red-300 flex items-center justify-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : cardDisplayMode === 'grid' ? (
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
          ) : (
            <div className="flex-1 px-6 py-6 overflow-auto">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] items-start gap-5">
                {deckListColumns.map((column, columnIndex) => (
                  <div key={columnIndex} className="flex min-w-0 flex-col gap-5">
                    {column.map((section) => {
                      if (section.type === 'commander') {
                        return (
                          <div key="commander">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-amber-300">Commander</span>
                              <span className="text-[11px] text-gray-400">{commanderDeckItem ? `${commanderDeckItem.quantity || 1} card` : 'Empty'}</span>
                            </div>
                            <div className="overflow-hidden rounded-lg border border-amber-500/40 bg-gray-900/70">
                              {commanderDeckItem ? (
                                <div className="grid grid-cols-[3rem_minmax(0,1fr)_5.5rem] items-center gap-3 border-b border-gray-700/60 px-4 py-3 last:border-b-0">
                                  <div className="text-sm font-semibold text-amber-200">{commanderDeckItem.quantity || 1}x</div>
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-semibold text-white">{commanderDeckItem.product_name}</p>
                                    <p className="truncate text-xs text-gray-400">{commanderDeckItem.type || commanderDeckItem.type_line || 'Card'}</p>
                                  </div>
                                  <div className="flex items-center justify-end gap-1">
                                    <button
                                      onClick={() => changeQty(commanderDeckItem.product_id, (commanderDeckItem.quantity || 1) - 1)}
                                      className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 text-white hover:bg-gray-600"
                                    >
                                      -
                                    </button>
                                    <button
                                      onClick={() => changeQty(commanderDeckItem.product_id, (commanderDeckItem.quantity || 1) + 1)}
                                      className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700"
                                    >
                                      +
                                    </button>
                                    <button
                                      onClick={() => removeCardFromDeck(commanderDeckItem.product_id)}
                                      className="flex h-7 w-7 items-center justify-center rounded bg-red-600/20 text-red-300 hover:bg-red-600/30"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="px-4 py-6 text-sm text-gray-400">
                                  Set one card as commander to pin it here.
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }

                      const group = section.group;
                      return (
                        <div key={group.label}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-white">{group.label}</span>
                            <span className="text-[11px] text-gray-400">({group.totalCards})</span>
                          </div>
                          <div className="overflow-hidden rounded-lg border border-gray-700 bg-gray-900/70">
                            {group.items.map((item) => (
                              <div key={item.product_id} className="grid grid-cols-[3rem_minmax(0,1fr)_5.5rem] items-center gap-3 border-b border-gray-700/60 px-4 py-3 last:border-b-0">
                                <div className="text-sm font-semibold text-gray-300">
                                  {item.quantity || 1}x
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-white">{item.product_name}</p>
                                  <p className="truncate text-xs text-gray-400">{item.type || item.type_line || 'Card'}</p>
                                </div>
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={() => changeQty(item.product_id, (item.quantity || 1) - 1)}
                                    className="flex h-7 w-7 items-center justify-center rounded bg-gray-700 text-white hover:bg-gray-600"
                                  >
                                    -
                                  </button>
                                  <button
                                    onClick={() => changeQty(item.product_id, (item.quantity || 1) + 1)}
                                    className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white hover:bg-blue-700"
                                  >
                                    +
                                  </button>
                                  <button
                                    onClick={() => removeCardFromDeck(item.product_id)}
                                    className="flex h-7 w-7 items-center justify-center rounded bg-red-600/20 text-red-300 hover:bg-red-600/30"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
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
                    <option value="pokemon">Pokemon</option>
                    <option value="yugioh">Yu-Gi-Oh!</option>
                    <option value="lorcana">Lorcana</option>
                    <option value="onepiece">One Piece</option>
                    <option value="flesh_and_blood">Flesh and Blood</option>
                    <option value="starwars">Star Wars</option>
                  </select>
                  <select
                    value={deckFormat}
                    onChange={e => setDeckFormat(e.target.value)}
                    className="w-full h-9 text-sm border border-gray-600 rounded px-2 bg-gray-700 text-white"
                  >
                    {Object.entries(getDeckFormatMap(selectedGame)).map(([key, fmt]) => (
                      <option key={key} value={key}>{fmt.name}</option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateDeck} disabled={!newDeckName.trim() || createDeckMutation.isPending} className="bg-blue-600 hover:bg-blue-700 flex-1">
                      {createDeckMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
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
                              {getCardImageUrl(item) ? (
                                <img src={getCardImageUrl(item)} alt={item.product_name} onError={(event) => handleCardImageError(event, item)} className="w-full aspect-[2/3] object-cover group-hover:opacity-70 transition-opacity" />
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
                                    -
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
                                {getCardImageUrl(card) ? (
                                  <img src={getCardImageUrl(card)} alt={card.name} onError={(event) => handleCardImageError(event, card)} className="w-full aspect-[2/3] object-cover group-hover:opacity-75 transition-opacity" />
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
      {showSimulationResults && simulationResults && (
        <AISimulationResults
          simulation={simulationResults}
          onClose={() => setShowSimulationResults(false)}
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
              {Object.entries(getDeckFormatMap(deckGame)).map(([key, fmt]) => (
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
                      {fmt.singleton ? 'Singleton format' : 'Up to 4 copies of each card'} | {fmt.minCards}-{fmt.maxCards === Infinity ? 'Unlimited' : fmt.maxCards} cards
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


