import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { backend } from '@/services/backend';
import { useQuery } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
  Camera,
  X,
  Image as ImageIcon,
} from 'lucide-react';
import MobileHeader from '@/components/mobile/MobileHeader';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import CartDrawer from '@/components/store/CartDrawer';
import WishlistDrawer from '@/components/store/WishlistDrawer';
import { getFabCardById } from '@/lib/fabLocalCatalog';
import { searchAllGamesLocal, searchGameLocal } from '@/lib/localSearch';
import { getLorcanaCardById } from '@/lib/lorcanaLocalCatalog';
import { getMtgPrintingsByOracleId } from '@/lib/mtgLocalCatalog';
import { getOnePieceCardById } from '@/lib/onePieceLocalCatalog';
import { getPokemonCardById } from '@/lib/pokemonLocalCatalog';
import { getStarWarsCardById } from '@/lib/starwarsLocalCatalog';
import { getYugiohCardById } from '@/lib/yugiohLocalCatalog';
import { ManaCost, MtgSymbolText } from '@/components/lib/MtgSymbolText';
import { PokemonSymbol, PokemonSymbolRow } from '@/components/lib/PokemonSymbol';
import { groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';
import { getGuestCart, getGuestWishlist } from '@/components/utils/guestStorage';
import { toast } from 'sonner';

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
  pokemon: ['Standard', 'Expanded', 'Unlimited', 'Limited', 'Gym Leader Challenge', 'Casual'],
  yugioh: ['Advanced', 'Traditional', 'Speed Duel', 'Rush Duel', 'Casual'],
  lorcana: ['Core Constructed', 'Infinity Constructed', 'Limited', 'Casual'],
  onepiece: ['Constructed', 'Sealed', 'Casual'],
  flesh_and_blood: ['Blitz', 'Classic Constructed', 'Commoner', 'Living Legend', 'Casual'],
  starwars: ['Premier', 'Twin Suns', 'Trilogy', 'Limited', 'Casual']
};

const CONDITION_OPTIONS = ['Near Mint', 'Lightly Played', 'Moderately Played', 'Heavily Played', 'Damaged'];
const FINISH_OPTIONS = ['nonfoil', 'foil', 'etched'];

const formatDeckFormat = (value) => {
  if (!value) return 'Commander';
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
};

const getGameLabel = (game) => GAME_OPTIONS.find((option) => option.value === game)?.label || formatDeckFormat(game);

const getCardName = (card) => card?.name || card?.product_name || 'Unknown Card';
const getCardImage = (card) => card?.image_url || card?.product_image || '';
const getCardSet = (card) => card?.set_name || card?.product_type || card?.game || 'Card';
const getCardSetCode = (card) => card?.set_code || '';
const getCardNumber = (card) => card?.collector_number || card?.card_number || card?.number || '';
const getCardType = (card) => card?.type_line || card?.type || card?.product_type || 'Card';
const getCardPrice = (card) => card?.price != null ? `$${Number(card.price).toFixed(2)}` : 'Market varies';
const getCardGame = (card) => card?.game || card?.product_type || '';

const buildDetailFields = (card) => {
  const pairs = [
    ['Type', getCardType(card)],
    ['Set', getCardSet(card)],
    ['Number', getCardNumber(card) || '-'],
    ['Market', getCardPrice(card)],
    ['Rarity', card?.rarity || '-'],
    ['Released', card?.released_at || '-'],
    ['Mana Cost', card?.mana_cost || ''],
    ['Power', card?.power ?? ''],
    ['Toughness', card?.toughness ?? ''],
    ['HP', card?.hp ?? ''],
    ['Cost', card?.cost ?? ''],
    ['Arena', card?.arena || ''],
    ['Attribute', card?.attribute || ''],
    ['Artist', card?.artist || '']
  ];

  return pairs.filter(([, value]) => value !== '' && value !== null && value !== undefined);
};

const buildDetailText = (card) => {
  if (!card) return '';
  if (card.oracle_text) return card.oracle_text;
  if (card.description) return card.description;
  if (card.text) {
    return [card.text, card.back_text].filter(Boolean).join('\n\n');
  }
  if (card.functional_text) return card.functional_text;
  if (Array.isArray(card.rules) && card.rules.length > 0) return card.rules.join('\n');
  if (Array.isArray(card.abilities) && card.abilities.length > 0) {
    return card.abilities.map((ability) => [ability.name, ability.text].filter(Boolean).join(': ')).join('\n\n');
  }
  if (Array.isArray(card.attacks) && card.attacks.length > 0) {
    return card.attacks.map((attack) => [attack.name, attack.text].filter(Boolean).join(': ')).join('\n\n');
  }
  if (card.effect || card.trigger) {
    return [card.effect, card.trigger].filter(Boolean).join('\n\n');
  }
  return '';
};

function PokemonCostSymbols({ costs = [] }) {
  if (!Array.isArray(costs) || costs.length === 0) {
    return <span className="text-slate-500">None</span>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {costs.map((cost, index) => (
        <PokemonSymbol key={`${cost}-${index}`} type={cost} size={22} />
      ))}
    </div>
  );
}

function MobileCardDetailPanel({
  card,
  title = 'Card Details',
  onClose,
  finish,
  condition,
  onFinishChange,
  onConditionChange,
  footer
}) {
  const game = getCardGame(card);
  const { data: hydratedCard } = useQuery({
    queryKey: ['mobile-card-detail', game, card?.oracle_id, card?.api_id, card?.id, getCardSetCode(card)],
    queryFn: async () => {
      if (game === 'magic' && card?.oracle_id) {
        const printings = await getMtgPrintingsByOracleId(card.oracle_id);
        const exactSet = printings.find((printing) => String(printing.set_code || '').toUpperCase() === String(getCardSetCode(card) || '').toUpperCase());
        return exactSet || printings[0] || card;
      }
      if (game === 'pokemon') return getPokemonCardById(card.api_id || card.id);
      if (game === 'yugioh') return getYugiohCardById(card.api_id || card.id);
      if (game === 'lorcana') return getLorcanaCardById(card.api_id || card.id);
      if (game === 'onepiece') return getOnePieceCardById(card.api_id || card.id);
      if (game === 'flesh_and_blood') return getFabCardById(card.api_id || card.id);
      if (game === 'starwars') return getStarWarsCardById(card.api_id || card.id);
      return card;
    },
    enabled: Boolean(card && game)
  });

  if (!card) return null;

  const detailCard = hydratedCard || card;

  const detailFields = buildDetailFields(detailCard);
  const detailText = buildDetailText(detailCard);
  const isMagic = game === 'magic';
  const isPokemon = game === 'pokemon';

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white">
      <div className="grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center border-b border-slate-200 bg-slate-950 px-2 text-white">
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center">
          <X className="h-5 w-5" />
        </button>
        <div className="truncate text-center text-base font-black">{title}</div>
        <div />
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        <div className="bg-slate-100 px-4 py-4">
          <div className="mx-auto max-w-64 overflow-hidden rounded-xl bg-white p-3 shadow-sm">
            {getCardImage(detailCard) ? (
              <img src={getCardImage(detailCard)} alt={getCardName(detailCard)} className="h-auto w-full object-contain" />
            ) : (
              <div className="flex aspect-[3/4] items-center justify-center text-xs text-slate-400">No image</div>
            )}
          </div>
        </div>

        <section className="border-y border-slate-200 bg-white px-4 py-4">
          <h2 className="text-2xl font-black leading-tight text-slate-950">{getCardName(detailCard)}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {getCardSet(detailCard)}
            {getCardNumber(detailCard) ? ` - #${getCardNumber(detailCard)}` : ''}
          </p>
        </section>

        <section className="border-b border-slate-200 bg-white px-4 py-4">
          <div className="mb-3 text-sm font-black text-slate-950">Card Details</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {detailFields.map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
                <p className="mt-1 font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          {isMagic && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Mana Cost</p>
              <div className="mt-2">
                <ManaCost manaCost={detailCard.mana_cost} />
              </div>
            </div>
          )}

          {isPokemon && Array.isArray(detailCard.types) && detailCard.types.length > 0 && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Type</p>
              <div className="flex flex-wrap items-center gap-3">
                <PokemonSymbolRow types={detailCard.types} size={24} />
                <p className="text-sm font-semibold text-slate-900">
                  {[detailCard.supertype, ...(detailCard.subtypes || [])].filter(Boolean).join(' - ') || 'Pokemon'}
                </p>
              </div>
            </div>
          )}

          {detailText && (
            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Oracle Text</p>
              {isMagic ? (
                <MtgSymbolText
                  text={detailText}
                  className="space-y-2 text-sm leading-relaxed text-slate-800"
                  symbolClassName="h-4 w-4"
                />
              ) : (
                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-800">{detailText}</p>
              )}
            </div>
          )}
        </section>

        {isPokemon && Array.isArray(detailCard.attacks) && detailCard.attacks.length > 0 && (
          <section className="border-b border-slate-200 bg-white px-4 py-4">
            <div className="mb-3 text-sm font-black text-slate-950">Attacks</div>
            <div className="space-y-3">
              {detailCard.attacks.map((attack, index) => (
                <div key={`${attack.name || 'attack'}-${index}`} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{attack.name || 'Attack'}</p>
                      {attack.text && <p className="mt-2 text-sm text-slate-700">{attack.text}</p>}
                    </div>
                    {attack.damage && <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">{attack.damage}</span>}
                  </div>
                  <div className="mt-3">
                    <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Energy Cost</p>
                    <PokemonCostSymbols costs={attack.cost} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {isPokemon && (
          <section className="border-b border-slate-200 bg-white px-4 py-4">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Weaknesses</p>
                {Array.isArray(detailCard.weaknesses) && detailCard.weaknesses.length > 0 ? (
                  <div className="space-y-2">
                    {detailCard.weaknesses.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="flex items-center gap-2.5 text-sm text-slate-700">
                        <PokemonSymbol type={item.type} size={24} />
                        <span>{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">None</p>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Retreat Cost</p>
                <PokemonCostSymbols costs={detailCard.retreatCost} />
              </div>
            </div>
          </section>
        )}

        {(finish !== undefined || condition !== undefined) && (
          <section className="grid gap-3 border-b border-slate-200 bg-white px-4 py-4">
            {finish !== undefined && (
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Finish</label>
                {onFinishChange ? (
                  <Select value={finish} onValueChange={onFinishChange}>
                    <SelectTrigger className="mt-1 h-11 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FINISH_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{formatDeckFormat(option)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900">{formatDeckFormat(finish || 'nonfoil')}</p>
                )}
              </div>
            )}

            {condition !== undefined && (
              <div>
                <label className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Condition</label>
                {onConditionChange ? (
                  <Select value={condition} onValueChange={onConditionChange}>
                    <SelectTrigger className="mt-1 h-11 border-slate-200 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CONDITION_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>{option}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className="mt-1 font-semibold text-slate-900">{condition || 'Near Mint'}</p>
                )}
              </div>
            )}
          </section>
        )}
      </div>

      {footer && <div className="border-t border-slate-200 bg-white p-4">{footer}</div>}
    </div>
  );
}

export default function MobileDeckBuilder() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [headerSearchResults, setHeaderSearchResults] = useState([]);
  const [headerSearchQuery, setHeaderSearchQuery] = useState('');
  const [headerSearching, setHeaderSearching] = useState(false);
  const [selectedGame, setSelectedGame] = useState('magic');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [activeDeck, setActiveDeck] = useState(null);
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckGame, setNewDeckGame] = useState('magic');
  const [newDeckFormat, setNewDeckFormat] = useState('Commander');
  const [showDeckList, setShowDeckList] = useState(false);
  const [showAddCards, setShowAddCards] = useState(false);
  const [scanPreview, setScanPreview] = useState('');
  const [selectedAddCard, setSelectedAddCard] = useState(null);
  const [selectedFinish, setSelectedFinish] = useState('nonfoil');
  const [selectedCondition, setSelectedCondition] = useState('Near Mint');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [selectedDeckItem, setSelectedDeckItem] = useState(null);

  const searchRef = useRef(null);
  const headerSearchRef = useRef(null);
  const videoRef = useRef(null);
  const cameraStreamRef = useRef(null);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
    });
  }, []);

  useEffect(() => () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
  }, []);

  const { data: dbCartItems = [] } = useQuery({
    queryKey: ['cart', user?.email],
    queryFn: () => backend.data.CartItem.filter({ user_email: user.email }),
    enabled: !!user?.email
  });
  const [guestCart] = useState(getGuestCart());
  const [guestWishlist] = useState(getGuestWishlist());
  const cartItems = user ? dbCartItems : guestCart;
  const { data: dbWishlistItems = [] } = useQuery({
    queryKey: ['wishlist', user?.email],
    queryFn: () => backend.data.Wishlist.filter({ user_email: user.email }),
    enabled: !!user?.email
  });
  const wishlistItems = user ? dbWishlistItems : guestWishlist;

  const { data: decks = [], refetch: refetchDecks } = useQuery({
    queryKey: ['mobile-decks', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email
  });

  useEffect(() => {
    if (!activeDeck && decks.length > 0) {
      setActiveDeck(decks[0]);
    } else if (activeDeck) {
      const freshDeck = decks.find((deck) => deck.id === activeDeck.id);
      if (freshDeck) setActiveDeck(freshDeck);
    }
  }, [decks]);

  useEffect(() => {
    const activeGame = activeDeck?.game
      || activeDeck?.items?.find((item) => item?.game || item?.product_type)?.game
      || activeDeck?.items?.find((item) => item?.game || item?.product_type)?.product_type
      || 'magic';
    if (activeDeck) {
      setSelectedGame(activeGame);
    }
  }, [activeDeck]);

  useEffect(() => {
    const formats = DECK_FORMAT_OPTIONS[newDeckGame] || ['Casual'];
    if (!formats.includes(newDeckFormat)) {
      setNewDeckFormat(formats[0]);
    }
  }, [newDeckGame, newDeckFormat]);

  const handleSearch = async (value) => {
    setSearchQuery(value);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchRef.current) clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      setSearching(true);
      const results = await searchGameLocal(value, selectedGame, 20);
      setSearchResults(results);
      setSearching(false);
    }, 350);
  };

  const handleHeaderSearch = async (event) => {
    const value = event.target.value;
    setHeaderSearchQuery(value);
    if (!value.trim()) {
      setHeaderSearchResults([]);
      return;
    }
    if (headerSearchRef.current) clearTimeout(headerSearchRef.current);
    headerSearchRef.current = setTimeout(async () => {
      setHeaderSearching(true);
      const results = await searchAllGamesLocal(value, 8);
      setHeaderSearchResults(results);
      setHeaderSearching(false);
    }, 350);
  };

  const createDeck = async () => {
    if (!newDeckName.trim() || !user) return;
    const deck = await backend.data.CardList.create({
      user_email: user.email,
      name: newDeckName.trim(),
      description: `${GAME_OPTIONS.find((option) => option.value === newDeckGame)?.label || newDeckGame} deck`,
      game: newDeckGame,
      deck_format: newDeckFormat,
      items: []
    });
    setActiveDeck(deck);
    setNewDeckName('');
    setSelectedGame(newDeckGame);
    setShowNewDeck(false);
    refetchDecks();
    toast.success(`Deck "${deck.name}" created`);
  };

  const addCardToDeck = async (card, options = {}) => {
    if (!activeDeck) {
      toast.error('Create or select a deck first');
      return;
    }
    const finish = options.finish || card.finish || card.finishes?.[0] || 'nonfoil';
    const condition = options.condition || 'Near Mint';
    const existing = activeDeck.items?.find((item) => item.product_id === card.id);
    const updatedItems = existing
      ? activeDeck.items.map((item) => item.product_id === card.id ? { ...item, quantity: (item.quantity || 1) + 1 } : item)
      : [...(activeDeck.items || []), {
        product_id: card.id,
        api_id: card.api_id || card.id,
        oracle_id: card.oracle_id || '',
        product_name: card.name,
        product_image: card.image_url,
        price: card.price || 0,
        product_type: card.game,
        game: card.game,
        set_name: card.set_name,
        set_code: card.set_code || '',
        collector_number: card.collector_number || card.number,
        type_line: card.type_line || card.type,
        oracle_text: card.oracle_text || card.description || card.text,
        rarity: card.rarity,
        released_at: card.released_at,
        finish,
        condition,
        foil: finish === 'foil' || finish === 'etched',
        quantity: 1
      }];
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
    toast.success(`Added ${card.name}`);
  };

  const removeCardFromDeck = async (productId) => {
    if (!activeDeck) return;
    const updatedItems = activeDeck.items.filter((item) => item.product_id !== productId);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
  };

  const changeQty = async (productId, delta) => {
    if (!activeDeck) return;
    const updatedItems = activeDeck.items
      .map((item) => item.product_id === productId ? { ...item, quantity: (item.quantity || 1) + delta } : item)
      .filter((item) => item.quantity > 0);
    await backend.data.CardList.update(activeDeck.id, { items: updatedItems });
    setActiveDeck({ ...activeDeck, items: updatedItems });
  };

  const totalCards = activeDeck?.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
  const deckFormat = formatDeckFormat(activeDeck?.deck_format || activeDeck?.format || (DECK_FORMAT_OPTIONS[selectedGame]?.[0] || 'Casual'));
  const activeDeckGame = normalizeDeckGame(activeDeck?.game || selectedGame);
  const groupedDeckSections = groupDeckItems(activeDeck?.items || [], activeDeckGame);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop());
    cameraStreamRef.current = null;
    setCameraOpen(false);
  };

  const startCamera = async () => {
    setCameraError('');
    setCameraOpen(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is not available in this browser.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      cameraStreamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
      }, 0);
    } catch (error) {
      setCameraError(error.message || 'Camera access was blocked.');
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    const context = canvas.getContext('2d');
    context?.drawImage(video, 0, 0, canvas.width, canvas.height);
    setScanPreview(canvas.toDataURL('image/jpeg', 0.9));
    toast.info('Photo captured. Recognition hookup is next; use search below for now.');
    stopCamera();
  };

  const handleScanFile = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setScanPreview(reader.result?.toString() || '');
      toast.info('Photo captured. Card recognition hookup is next; use search below for now.');
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <MobileHeader
        searchQuery={headerSearchQuery}
        onSearchChange={handleHeaderSearch}
        onSearchSubmit={() => {
          if (headerSearchQuery.trim()) navigate(`/MobileShop?search=${encodeURIComponent(headerSearchQuery)}`);
        }}
        menuOpen={menuOpen}
        onMenuChange={setMenuOpen}
        user={user}
        onLogin={() => backend.auth.redirectToLogin(window.location.href)}
        onLogout={() => backend.auth.logout()}
        searchResults={headerSearchResults}
        onResultClick={(result) => {
          setHeaderSearchResults([]);
          setHeaderSearchQuery('');
          navigate(`/MobileShop?search=${encodeURIComponent(result.name)}&game=${result.game}`);
        }}
        onClearSearch={() => {
          setHeaderSearchResults([]);
          setHeaderSearchQuery('');
        }}
        searching={headerSearching}
      />

      <main className="flex-1 bg-white">
        {!user ? (
          <div className="border-y border-slate-200 py-16 text-center">
            <p className="text-slate-700 font-medium mb-3">Sign in to build and save decks</p>
            <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-slate-900 text-white hover:bg-slate-800">
              Sign In
            </Button>
          </div>
        ) : (
          <>
            <section className="border-b border-slate-200 bg-white">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-slate-100 px-4 py-1.5">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Deck List</div>
                  <div className="truncate text-sm font-bold leading-tight text-slate-950">{activeDeck ? activeDeck.name : 'No deck selected'}</div>
                  <div className="mt-0.5 text-[11px] font-medium text-slate-500">{deckFormat}</div>
                </div>
                <div className="rounded-md bg-slate-950 px-3 py-1 text-xs font-bold text-white shadow-sm">{totalCards}</div>
              </div>

              <div className="grid grid-cols-[1fr_auto] border-t border-slate-200 text-sm font-semibold">
                <button type="button" onClick={() => setShowDeckList((current) => !current)} className="border-r border-slate-200 px-3 py-1.5 text-left text-slate-900">
                  Change deck
                </button>
                <button type="button" onClick={() => setShowAddCards(true)} className="bg-slate-950 px-4 py-1.5 text-white">
                  Add Card
                </button>
              </div>

              <div className={`${showDeckList || showNewDeck ? 'grid' : 'hidden'} gap-2 border-t border-slate-200 px-4 py-3`}>
                <Select
                  value={activeDeck?.id || '__none__'}
                  onValueChange={(value) => {
                    if (value === '__none__') return;
                    const selected = decks.find((deck) => deck.id === value);
                    if (selected) setActiveDeck(selected);
                  }}
                >
                  <SelectTrigger className="h-10 border-slate-200 bg-white">
                    <SelectValue placeholder="Choose a saved deck" />
                  </SelectTrigger>
                  <SelectContent>
                    {decks.length === 0 && <SelectItem value="__none__">No decks yet</SelectItem>}
                    {decks.map((deck) => (
                      <SelectItem key={deck.id} value={deck.id}>
                        {deck.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {showNewDeck && (
                  <div className="grid gap-2">
                    <Input
                      placeholder="Deck name..."
                      value={newDeckName}
                      onChange={(event) => setNewDeckName(event.target.value)}
                      onKeyDown={(event) => event.key === 'Enter' && createDeck()}
                      className="h-10 flex-1 border-slate-200"
                    />
                    <Select value={newDeckGame} onValueChange={setNewDeckGame}>
                      <SelectTrigger className="h-10 border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {GAME_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={newDeckFormat} onValueChange={setNewDeckFormat}>
                      <SelectTrigger className="h-10 border-slate-200 bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(DECK_FORMAT_OPTIONS[newDeckGame] || ['Casual']).map((format) => (
                          <SelectItem key={format} value={format}>{format}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button onClick={createDeck} className="h-10 bg-slate-900 text-white hover:bg-slate-800">
                      Create
                    </Button>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setShowDeckList((current) => !current)}
                  className="flex items-center justify-between border-t border-slate-200 pt-2 text-left"
                >
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Saved decks</div>
                    <div className="text-xs text-slate-500">{decks.length} deck{decks.length === 1 ? '' : 's'} available</div>
                  </div>
                  {showDeckList ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                </button>

                <Button
                  variant="outline"
                  className="h-10 border-slate-200 bg-white"
                  onClick={() => setShowNewDeck((current) => !current)}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  New Deck
                </Button>

                {showDeckList && decks.length > 0 && (
                  <div className="border-b border-slate-200">
                    {decks.map((deck) => (
                      <button
                        key={deck.id}
                        onClick={() => {
                          setActiveDeck(deck);
                          setShowDeckList(false);
                        }}
                        className={`w-full border-t px-0 py-2 text-left ${
                          activeDeck?.id === deck.id
                            ? 'border-slate-900 text-slate-950'
                            : 'border-slate-200 text-slate-800'
                        }`}
                      >
                        <div className="font-semibold">{deck.name}</div>
                        <div className="text-xs text-slate-500">
                          {getGameLabel(deck.game || 'magic')} - {formatDeckFormat(deck.deck_format || deck.format || 'Casual')} - {(deck.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0)} cards
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {activeDeck && (
              <section>
                {groupedDeckSections.length > 0 ? (
                  <div className="border-y border-slate-200 bg-white">
                    {groupedDeckSections.map((section) => (
                      <div key={section.label} className="border-b border-slate-200 last:border-b-0">
                        <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">{section.label}</div>
                          <div className="text-xs font-semibold text-slate-500">{section.totalCards} cards</div>
                        </div>
                        {section.items.map((item) => {
                          const isFoil = item.foil || item.finish === 'foil' || item.finish === 'etched';
                          return (
                            <div key={item.product_id} className="grid grid-cols-[2rem_0.22rem_minmax(0,1fr)_4.7rem] items-center border-t border-slate-200">
                              <div className="px-2 text-xs font-medium text-slate-500">
                                {item.quantity || 1}x
                              </div>
                              <div className={`h-10 w-1 rounded-full ${isFoil ? 'bg-gradient-to-b from-red-500 via-yellow-400 to-blue-500' : 'bg-slate-300'}`} />
                              <button type="button" onClick={() => setSelectedDeckItem(item)} className="min-w-0 px-2 py-2 text-left">
                                <p className="truncate text-[15px] font-semibold leading-tight text-slate-950">{item.product_name}</p>
                              </button>
                              <div className="flex items-center justify-end gap-0.5 pr-2">
                                <button onClick={() => changeQty(item.product_id, -1)} className="flex h-6 w-6 items-center justify-center text-slate-400">
                                  <Minus className="h-3 w-3" />
                                </button>
                                <button onClick={() => changeQty(item.product_id, 1)} className="flex h-6 w-6 items-center justify-center text-slate-400">
                                  <Plus className="h-3 w-3" />
                                </button>
                                <button onClick={() => removeCardFromDeck(item.product_id)} className="flex h-6 w-6 items-center justify-center text-red-400">
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="border-y border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
                    Search for cards above to start building this deck.
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {showAddCards && (
        <div className="fixed inset-0 z-50 flex flex-col bg-white">
          <div className="grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center border-b border-slate-200 bg-slate-950 px-2 text-white">
            <button type="button" onClick={() => {
              stopCamera();
              setSelectedAddCard(null);
              setShowAddCards(false);
            }} className="flex h-10 w-10 items-center justify-center">
              <X className="h-5 w-5" />
            </button>
            <div className="truncate text-center text-base font-black">Add Card</div>
            <div />
          </div>

          <div className="border-b border-slate-200 bg-slate-100 px-4 py-2">
            <button
              type="button"
              onClick={startCamera}
              className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white"
            >
              <Camera className="h-4 w-4" />
              Scan with Camera
            </button>
            <label className="mt-2 flex items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600">
              <ImageIcon className="h-4 w-4" />
              Upload Photo
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleScanFile} />
            </label>
            {scanPreview && (
              <div className="mt-3 overflow-hidden rounded-md border border-slate-200 bg-white">
                <img src={scanPreview} alt="Captured card" className="max-h-48 w-full object-contain" />
              </div>
            )}
          </div>

          <div className="border-b border-slate-200 px-4 py-3">
            <Select value={selectedGame} onValueChange={(value) => {
              setSelectedGame(value);
              setSearchResults([]);
              setSearchQuery('');
            }}>
              <SelectTrigger className="h-11 border-slate-200 bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GAME_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                autoFocus
                placeholder={`Search ${GAME_OPTIONS.find((item) => item.value === selectedGame)?.label || 'cards'}...`}
                value={searchQuery}
                onChange={(event) => handleSearch(event.target.value)}
                className="h-11 border-slate-200 bg-white pl-10"
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-blue-500" />}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {searchResults.length > 0 ? (
              <div className="border-b border-slate-200 bg-white">
                {searchResults.map((card, index) => (
                  <div
                    key={`${card.id}-${index}`}
                    className="grid grid-cols-[4.6rem_minmax(0,1fr)_3.3rem] items-center gap-3 border-b border-slate-200 px-4 py-2 last:border-b-0"
                  >
                    <button type="button" onClick={() => setSelectedAddCard(card)} className="h-24 overflow-hidden rounded bg-slate-100">
                      {card.image_url ? (
                        <img src={card.image_url} alt={card.name} className="h-full w-full object-contain" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-[10px] text-slate-400">No image</div>
                      )}
                    </button>
                    <button type="button" onClick={() => setSelectedAddCard(card)} className="min-w-0 text-left">
                      <p className="truncate text-sm font-black text-slate-950">{card.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{card.set_name || card.game || 'Card'}</p>
                      {card.collector_number && <p className="mt-0.5 truncate text-xs text-slate-400">#{card.collector_number}</p>}
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await addCardToDeck(card);
                        setShowAddCards(false);
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="h-10 rounded-md bg-slate-950 text-sm font-black text-white"
                    >
                      Add
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-10 text-center text-sm text-slate-500">
                Scan a card or search by name to pick the exact printing.
              </div>
            )}
          </div>

          {selectedAddCard && (
            <MobileCardDetailPanel
              card={selectedAddCard}
              onClose={() => setSelectedAddCard(null)}
              finish={selectedFinish}
              condition={selectedCondition}
              onFinishChange={setSelectedFinish}
              onConditionChange={setSelectedCondition}
              footer={(
                <Button
                  className="h-12 w-full bg-slate-950 text-white hover:bg-slate-800"
                  onClick={async () => {
                    await addCardToDeck(selectedAddCard, { finish: selectedFinish, condition: selectedCondition });
                    setSelectedAddCard(null);
                    setShowAddCards(false);
                    setSearchQuery('');
                    setSearchResults([]);
                  }}
                >
                  Add to Deck
                </Button>
              )}
            />
          )}

          {cameraOpen && (
            <div className="absolute inset-0 z-20 flex flex-col bg-black">
              <div className="grid h-14 grid-cols-[3rem_minmax(0,1fr)_3rem] items-center px-2 text-white">
                <button type="button" onClick={stopCamera} className="flex h-10 w-10 items-center justify-center">
                  <X className="h-5 w-5" />
                </button>
                <div className="truncate text-center text-base font-black">Scan Card</div>
                <div />
              </div>
              <div className="flex flex-1 items-center justify-center">
                {cameraError ? (
                  <div className="px-6 text-center text-sm text-white">
                    <p className="font-bold">Camera could not open</p>
                    <p className="mt-2 text-white/70">{cameraError}</p>
                  </div>
                ) : (
                  <video ref={videoRef} playsInline muted className="h-full w-full object-contain" />
                )}
              </div>
              <div className="p-5">
                <Button disabled={!!cameraError} onClick={captureFrame} className="h-12 w-full bg-white text-slate-950 hover:bg-slate-100">
                  Capture
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {selectedDeckItem && (
        <MobileCardDetailPanel
          card={selectedDeckItem}
          onClose={() => setSelectedDeckItem(null)}
          finish={selectedDeckItem.finish || 'nonfoil'}
          condition={selectedDeckItem.condition || 'Near Mint'}
          footer={(
            <div className="grid grid-cols-3 text-sm font-bold">
              <button type="button" onClick={() => changeQty(selectedDeckItem.product_id, -1)} className="border-r border-slate-200 py-3 text-slate-700">
                -1
              </button>
              <button type="button" onClick={() => changeQty(selectedDeckItem.product_id, 1)} className="border-r border-slate-200 py-3 text-slate-700">
                +1
              </button>
              <button type="button" onClick={() => {
                removeCardFromDeck(selectedDeckItem.product_id);
                setSelectedDeckItem(null);
              }} className="py-3 text-red-600">
                Remove
              </button>
            </div>
          )}
        />
      )}

      <MobileBottomNav
        cartCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
        wishlistCount={wishlistItems.length}
        onCartClick={() => setCartOpen(true)}
        onWishlistClick={() => setWishlistOpen(true)}
        currentPage="DeckBuilder"
      />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} items={cartItems} onUpdateQuantity={() => {}} onRemove={() => {}} />
      <WishlistDrawer open={wishlistOpen} onClose={() => setWishlistOpen(false)} items={wishlistItems} onAddToCart={() => {}} onRemove={() => {}} user={user} />
    </div>
  );
}
