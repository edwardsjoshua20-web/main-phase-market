import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Globe, Layers, ScrollText, ShoppingCart, ShieldAlert, ShieldCheck, Zap } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createPageUrl } from '@/utils';
import { backend } from '@/services/backend';
import { inventoryListings } from '@/services/inventoryListings';
import { addToGuestCart } from '@/components/utils/guestStorage';
import { getInventoryCardLanguage } from '@/components/admin/cardInventorySnapshot';
import { getLorcanaCardById } from '@/lib/lorcanaLocalCatalog';
import { getFabCardById } from '@/lib/fabLocalCatalog';
import { getMtgPrintingsByOracleId } from '@/lib/mtgLocalCatalog';
import { getOnePieceCardById } from '@/lib/onePieceLocalCatalog';
import { getPokemonCardById } from '@/lib/pokemonLocalCatalog';
import { getStarWarsCardById } from '@/lib/starwarsLocalCatalog';
import { getYugiohCardById } from '@/lib/yugiohLocalCatalog';
import { ManaCost, PlaneswalkerLoyaltyBadge, MtgSymbolText as SharedMtgSymbolText } from '@/components/lib/MtgSymbolText';
import { PokemonSymbol, PokemonSymbolRow } from '@/components/lib/PokemonSymbol';

const LANGUAGE_LABELS = {
  en: 'English',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  pt: 'Portuguese',
  ru: 'Russian',
  zhs: 'Chinese (Simplified)',
  zht: 'Chinese (Traditional)'
};

function getLanguageLabel(code) {
  const normalized = String(code || '').toLowerCase();
  return LANGUAGE_LABELS[normalized] || normalized.toUpperCase() || 'Unknown';
}

function buildBackToSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');

  if (!searchTerm) {
    return createPageUrl('Shop');
  }

  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm)}&game=magic${advancedParams}`;
}

function buildBackToPokemonSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=pokemon${advancedParams}`;
}

function buildBackToYugiohSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=yugioh${advancedParams}`;
}

function buildBackToLorcanaSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=lorcana${advancedParams}`;
}

function buildBackToOnePieceSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=onepiece${advancedParams}`;
}

function buildBackToFabSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=flesh_and_blood${advancedParams}`;
}

function buildBackToStarWarsSearchUrl(searchTerm) {
  const urlParams = new URLSearchParams(window.location.search);
  const advancedSearch = urlParams.get('advancedSearch');
  const advancedQuery = urlParams.get('aq');
  const advancedParams = advancedSearch === '1' && advancedQuery ? `&advancedSearch=1&aq=${advancedQuery}` : '';
  return `${createPageUrl('Shop')}?type=single_card&search=${encodeURIComponent(searchTerm || '')}&game=starwars${advancedParams}`;
}

function OracleText({ text }) {
  return <SharedMtgSymbolText text={text} />;
}

function PokemonCostSymbols({ costs = [] }) {
  if (!Array.isArray(costs) || costs.length === 0) return <span className="text-gray-500">None</span>;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {costs.map((cost, index) => (
        <PokemonSymbol key={`${cost}-${index}`} type={cost} size={30} />
      ))}
    </div>
  );
}

function OutOfStockNotice() {
  return (
    <div className="mt-4 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-center text-sm font-semibold text-slate-600">
      Not in stock
    </div>
  );
}

function normalizeMatchValue(value) {
  return String(value || '').trim().toLowerCase();
}

function matchesCatalogInventoryCard(apiCard, inventoryCard, game) {
  if (!apiCard || !inventoryCard || !game) return false;
  if (normalizeMatchValue(inventoryCard.name) !== normalizeMatchValue(apiCard.name)) return false;
  if (inventoryCard.game && normalizeMatchValue(inventoryCard.game) !== normalizeMatchValue(game)) return false;

  if (game === 'magic') {
    const inventoryLanguage = getInventoryCardLanguage(inventoryCard);
    const apiLanguage = normalizeMatchValue(apiCard.lang || 'en');
    if (inventoryLanguage !== apiLanguage) return false;
  }

  const inventoryNumber = normalizeMatchValue(inventoryCard.card_number);
  const apiNumber = normalizeMatchValue(apiCard.card_number);
  if (inventoryNumber && apiNumber) {
    return inventoryNumber === apiNumber;
  }

  const inventorySet = normalizeMatchValue(inventoryCard.set_name || inventoryCard.set_code);
  const apiSet = normalizeMatchValue(apiCard.set_name || apiCard.set_code);
  if (inventorySet && apiSet) {
    return inventorySet === apiSet;
  }

  return true;
}

export default function CardDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const cardId = urlParams.get('id');
  const oracleId = urlParams.get('oracle_id');
  const pokemonId = urlParams.get('pokemon_id');
  const yugiohId = urlParams.get('yugioh_id');
  const lorcanaId = urlParams.get('lorcana_id');
  const onePieceId = urlParams.get('onepiece_id');
  const fabId = urlParams.get('fab_id');
  const starWarsId = urlParams.get('starwars_id');
  const initialSetCode = String(urlParams.get('set') || '').toUpperCase();
  const initialSearch = urlParams.get('search') || '';
  const [selectedSetCode, setSelectedSetCode] = useState(initialSetCode);
  const [selectedLanguage, setSelectedLanguage] = useState('en');
  const [pokemonImageLoaded, setPokemonImageLoaded] = useState(false);
  const [user, setUser] = useState(null);
  const [isCompactLayout, setIsCompactLayout] = useState(() => window.innerWidth < 768);
  const queryClient = useQueryClient();

  const isMtgCatalogMode = Boolean(oracleId);
  const isPokemonCatalogMode = Boolean(pokemonId);
  const isYugiohCatalogMode = Boolean(yugiohId);
  const isLorcanaCatalogMode = Boolean(lorcanaId);
  const isOnePieceCatalogMode = Boolean(onePieceId);
  const isFabCatalogMode = Boolean(fabId);
  const isStarWarsCatalogMode = Boolean(starWarsId);

  const { data: inventoryCard, isLoading: inventoryLoading } = useQuery({
    queryKey: ['card', cardId],
    queryFn: () => inventoryListings.getById(cardId),
    enabled: !isMtgCatalogMode && !isPokemonCatalogMode && !isYugiohCatalogMode && !isLorcanaCatalogMode && !isOnePieceCatalogMode && !isFabCatalogMode && !!cardId
  });

  const { data: inventoryRows = [] } = useQuery({
    queryKey: ['detail-inventory-listings'],
    queryFn: () => inventoryListings.list('-created_date', 5000),
    enabled: isMtgCatalogMode || isPokemonCatalogMode || isYugiohCatalogMode || isLorcanaCatalogMode || isOnePieceCatalogMode || isFabCatalogMode || isStarWarsCatalogMode
  });

  const { data: mtgPrintings = [], isLoading: mtgLoading } = useQuery({
    queryKey: ['mtg-card-detail', oracleId],
    queryFn: () => getMtgPrintingsByOracleId(oracleId),
    enabled: isMtgCatalogMode && !!oracleId
  });

  const { data: pokemonCard, isLoading: pokemonLoading } = useQuery({
    queryKey: ['pokemon-card-detail', pokemonId],
    queryFn: () => getPokemonCardById(pokemonId),
    enabled: isPokemonCatalogMode && !!pokemonId
  });

  const { data: yugiohCard, isLoading: yugiohLoading } = useQuery({
    queryKey: ['yugioh-card-detail', yugiohId],
    queryFn: () => getYugiohCardById(yugiohId),
    enabled: isYugiohCatalogMode && !!yugiohId
  });

  const { data: lorcanaCard, isLoading: lorcanaLoading } = useQuery({
    queryKey: ['lorcana-card-detail', lorcanaId],
    queryFn: () => getLorcanaCardById(lorcanaId),
    enabled: isLorcanaCatalogMode && !!lorcanaId
  });

  const { data: onePieceCard, isLoading: onePieceLoading } = useQuery({
    queryKey: ['onepiece-card-detail', onePieceId],
    queryFn: () => getOnePieceCardById(onePieceId),
    enabled: isOnePieceCatalogMode && !!onePieceId
  });

  const { data: fabCard, isLoading: fabLoading } = useQuery({
    queryKey: ['fab-card-detail', fabId],
    queryFn: () => getFabCardById(fabId),
    enabled: isFabCatalogMode && !!fabId
  });

  const { data: starWarsCard, isLoading: starWarsLoading } = useQuery({
    queryKey: ['starwars-card-detail', starWarsId],
    queryFn: () => getStarWarsCardById(starWarsId),
    enabled: isStarWarsCatalogMode && !!starWarsId
  });

  useEffect(() => {
    setPokemonImageLoaded(false);
  }, [pokemonId, pokemonCard?.image_url]);

  useEffect(() => {
    const loadUser = async () => {
      try {
        const isAuth = await backend.auth.isAuthenticated();
        if (isAuth) {
          const userData = await backend.auth.getCurrentUser();
          setUser(userData);
          return;
        }
      } catch {
        // Public browsing is expected here.
      }

      setUser(null);
    };

    loadUser();
  }, []);

  useEffect(() => {
    const handleResize = () => setIsCompactLayout(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const printingGroups = useMemo(() => {
    if (!isMtgCatalogMode) return [];

    const groups = new Map();

    for (const printing of mtgPrintings) {
      const key = `${printing.set_code || 'UNK'}::${printing.card_number || ''}`;
      const existing = groups.get(key) || {
        key,
        set_code: printing.set_code,
        set_name: printing.set_name,
        card_number: printing.card_number,
        rarity: printing.rarity,
        released_at: printing.released_at,
        printings: []
      };

      existing.printings.push(printing);
      groups.set(key, existing);
    }

    return [...groups.values()]
      .map((group) => ({
        ...group,
        printings: [...group.printings].sort((a, b) => {
          const aEnglish = String(a.lang || '').toLowerCase() === 'en';
          const bEnglish = String(b.lang || '').toLowerCase() === 'en';
          if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
          return String(a.lang || '').localeCompare(String(b.lang || ''));
        })
      }))
      .sort((a, b) => {
        const dateCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
        if (dateCompare !== 0) return dateCompare;
        return String(a.set_name || '').localeCompare(String(b.set_name || ''));
      });
  }, [isMtgCatalogMode, mtgPrintings]);

  useEffect(() => {
    if (!isMtgCatalogMode || printingGroups.length === 0) return;

    const availableSetCodes = printingGroups.map((group) => String(group.set_code || '').toUpperCase());
    const preferredSetCode = availableSetCodes.includes(initialSetCode) ? initialSetCode : availableSetCodes[0];
    setSelectedSetCode((current) => current || preferredSetCode);
  }, [isMtgCatalogMode, printingGroups, initialSetCode]);

  const activePrintingGroup = useMemo(() => {
    if (!isMtgCatalogMode || printingGroups.length === 0) return null;
    return printingGroups.find((group) => String(group.set_code || '').toUpperCase() === String(selectedSetCode || '').toUpperCase()) || printingGroups[0];
  }, [isMtgCatalogMode, printingGroups, selectedSetCode]);

  useEffect(() => {
    if (!activePrintingGroup) return;

    const availableLanguages = activePrintingGroup.printings.map((printing) => String(printing.lang || '').toLowerCase());
    const preferredLanguage = availableLanguages.includes('en') ? 'en' : availableLanguages[0];
    setSelectedLanguage((current) => availableLanguages.includes(String(current || '').toLowerCase()) ? current : preferredLanguage);
  }, [activePrintingGroup]);

  const activePrinting = useMemo(() => {
    if (!activePrintingGroup) return null;

    return activePrintingGroup.printings.find((printing) => String(printing.lang || '').toLowerCase() === String(selectedLanguage || '').toLowerCase())
      || activePrintingGroup.printings[0]
      || null;
  }, [activePrintingGroup, selectedLanguage]);

  const requestItem = isPokemonCatalogMode ? pokemonCard : isYugiohCatalogMode ? yugiohCard : isLorcanaCatalogMode ? lorcanaCard : isOnePieceCatalogMode ? onePieceCard : isFabCatalogMode ? fabCard : isStarWarsCatalogMode ? starWarsCard : activePrinting;
  const requestGame = isPokemonCatalogMode
    ? 'pokemon'
    : isYugiohCatalogMode
      ? 'yugioh'
      : isLorcanaCatalogMode
        ? 'lorcana'
        : isOnePieceCatalogMode
          ? 'onepiece'
          : isFabCatalogMode
            ? 'flesh_and_blood'
            : isStarWarsCatalogMode
              ? 'starwars'
              : isMtgCatalogMode
                ? 'magic'
                : null;
  const stockListing = useMemo(() => {
    if (!requestItem || !requestGame) return null;

    const match = inventoryRows.find((inventoryRow) => matchesCatalogInventoryCard(requestItem, inventoryRow, requestGame));
    return match?.in_stock ? match : null;
  }, [inventoryRows, requestGame, requestItem]);
  const canAddToCart = Boolean(stockListing);

  const addToCartMutation = useMutation({
    mutationFn: async (card) => {
      if (!card) {
        throw new Error('This card is not currently in stock');
      }

      const cartItem = {
        card_id: card.id,
        card_name: card.name,
        card_image: card.image_url,
        price: card.price,
        quantity: 1
      };

      if (user?.email) {
        await backend.data.CartItem.create({
          ...cartItem,
          user_email: user.email
        });
        return;
      }

      addToGuestCart(cartItem);
    },
    onSuccess: () => {
      if (user?.email) {
        queryClient.invalidateQueries({ queryKey: ['cart'] });
      }
      toast.success('Added to cart');
    },
    onError: (error) => {
      toast.error(error?.message || 'Failed to add card to cart');
    }
  });

  const handleAddToCart = () => {
    if (!stockListing) {
      toast.error('This card is not currently in stock');
      return;
    }

    addToCartMutation.mutate(stockListing);
  };

  const isLoading = isMtgCatalogMode ? mtgLoading : isPokemonCatalogMode ? pokemonLoading : isYugiohCatalogMode ? yugiohLoading : isLorcanaCatalogMode ? lorcanaLoading : isOnePieceCatalogMode ? onePieceLoading : isFabCatalogMode ? fabLoading : isStarWarsCatalogMode ? starWarsLoading : inventoryLoading;
  const detailGridClass = isCompactLayout ? 'grid gap-6' : 'grid lg:grid-cols-[420px,1fr] gap-8 lg:gap-12';
  const detailMediaPanelClass = `self-start bg-white rounded-2xl border border-gray-200 p-4 h-fit ${isCompactLayout ? '' : 'sticky top-24'}`;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Skeleton className="h-8 w-40 bg-gray-100 mb-8" />
          <div className={detailGridClass}>
            <Skeleton className="aspect-[3/4] bg-gray-100 rounded-xl" />
            <div className="space-y-4">
              <Skeleton className="h-10 bg-gray-100 w-3/4" />
              <Skeleton className="h-6 bg-gray-100 w-1/2" />
              <Skeleton className="h-40 bg-gray-100 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPokemonCatalogMode) {
    if (!pokemonCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToPokemonSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToPokemonSearchUrl(initialSearch || pokemonCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className={detailMediaPanelClass}>
              {pokemonCard.image_url ? (
                <div className="relative">
                  {pokemonCard.image_small && (
                    <img
                      src={pokemonCard.image_small}
                      alt={pokemonCard.name}
                      className={`w-full h-auto object-contain rounded-xl transition-opacity duration-200 ${pokemonImageLoaded ? 'opacity-0 absolute inset-0' : 'opacity-100'}`}
                      loading="eager"
                      decoding="async"
                    />
                  )}
                  <img
                    src={pokemonCard.image_url}
                    alt={pokemonCard.name}
                    className={`w-full h-auto object-contain rounded-xl transition-opacity duration-200 ${pokemonImageLoaded ? 'opacity-100' : 'opacity-0'}`}
                    loading="eager"
                    decoding="async"
                    onLoad={() => setPokemonImageLoaded(true)}
                  />
                </div>
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
              )}
              {!canAddToCart && <OutOfStockNotice />}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">Pokémon TCG</Badge>
                <Badge className="bg-blue-100 text-blue-700">{pokemonCard.set_name}</Badge>
                {pokemonCard.rarity && <Badge className="bg-amber-100 text-amber-700">{pokemonCard.rarity}</Badge>}
                {pokemonCard.supertype && <Badge className="bg-emerald-100 text-emerald-700">{pokemonCard.supertype}</Badge>}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{pokemonCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {pokemonCard.set_name}
                  {pokemonCard.card_number ? ` • #${pokemonCard.card_number}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-gray-500">Type</p>
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <PokemonSymbolRow types={pokemonCard.types} size={28} />
                      <p className="text-gray-900 font-medium">
                        {[pokemonCard.supertype, ...pokemonCard.subtypes].filter(Boolean).join(' — ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-gray-500">HP</p>
                    <p className="text-gray-900 font-medium">{pokemonCard.hp || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set</p>
                    <p className="text-gray-900 font-medium">{pokemonCard.set_name || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Released</p>
                    <p className="text-gray-900 font-medium">{pokemonCard.released_at || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{pokemonCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Card Number</p>
                    <p className="text-gray-900 font-medium">{pokemonCard.card_number || '-'}</p>
                  </div>
                  {pokemonCard.evolvesFrom && (
                    <div>
                      <p className="text-gray-500">Evolves From</p>
                      <p className="text-gray-900 font-medium">{pokemonCard.evolvesFrom}</p>
                    </div>
                  )}
                  {pokemonCard.evolvesTo?.length > 0 && (
                    <div>
                      <p className="text-gray-500">Evolves To</p>
                      <p className="text-gray-900 font-medium">{pokemonCard.evolvesTo.join(', ')}</p>
                    </div>
                  )}
                  {pokemonCard.regulationMark && (
                    <div>
                      <p className="text-gray-500">Regulation Mark</p>
                      <p className="text-gray-900 font-medium">{pokemonCard.regulationMark}</p>
                    </div>
                  )}
                  {pokemonCard.artist && (
                    <div>
                      <p className="text-gray-500">Artist</p>
                      <p className="text-gray-900 font-medium">{pokemonCard.artist}</p>
                    </div>
                  )}
                </div>

                {pokemonCard.rules?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Rules</p>
                    <div className="space-y-2">
                      {pokemonCard.rules.map((rule, index) => (
                        <p key={`${rule}-${index}`} className="text-gray-900">{rule}</p>
                      ))}
                    </div>
                  </div>
                )}

                {pokemonCard.abilities?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Abilities</p>
                    <div className="space-y-3">
                      {pokemonCard.abilities.map((ability, index) => (
                        <div key={`${ability.name}-${index}`} className="rounded-xl border border-gray-200 p-4">
                          <p className="font-semibold text-gray-900">{ability.name}</p>
                          {ability.type && <p className="text-xs text-blue-600 font-medium mt-1">{ability.type}</p>}
                          {ability.text && <p className="text-gray-700 mt-2">{ability.text}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pokemonCard.attacks?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Attacks</p>
                    <div className="space-y-3">
                      {pokemonCard.attacks.map((attack, index) => (
                        <div key={`${attack.name}-${index}`} className="rounded-xl border border-gray-200 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-gray-900">{attack.name || 'Attack'}</p>
                              {attack.text && <p className="text-gray-700 mt-2">{attack.text}</p>}
                            </div>
                            {attack.damage && <Badge className="bg-red-100 text-red-700">{attack.damage}</Badge>}
                          </div>
                          <div className="mt-3">
                            <p className="text-xs font-medium tracking-wide text-gray-500 uppercase mb-2">Energy Cost</p>
                            <PokemonCostSymbols costs={attack.cost} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-3 gap-4">
                    <div className="rounded-2xl border border-gray-200 p-4">
                      <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        Weaknesses
                      </div>
                    {pokemonCard.weaknesses?.length > 0 ? pokemonCard.weaknesses.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="flex items-center gap-2.5 text-gray-700">
                        <PokemonSymbol type={item.type} size={28} />
                        <span>{item.value}</span>
                      </div>
                    )) : <p className="text-gray-500">None</p>}
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Resistances
                    </div>
                    {pokemonCard.resistances?.length > 0 ? pokemonCard.resistances.map((item, index) => (
                      <div key={`${item.type}-${index}`} className="flex items-center gap-2.5 text-gray-700">
                        <PokemonSymbol type={item.type} size={28} />
                        <span>{item.value}</span>
                      </div>
                    )) : <p className="text-gray-500">None</p>}
                  </div>

                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Retreat Cost
                    </div>
                    <PokemonCostSymbols costs={pokemonCard.retreatCost} />
                  </div>
                </div>

                {pokemonCard.flavorText && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Flavor Text</p>
                    <p className="text-gray-700 italic">{pokemonCard.flavorText}</p>
                  </div>
                )}
              </div>
              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isYugiohCatalogMode) {
    if (!yugiohCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToYugiohSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToYugiohSearchUrl(initialSearch || yugiohCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className={detailMediaPanelClass}>
              {yugiohCard.image_url ? (
                <img
                  src={yugiohCard.image_url}
                  alt={yugiohCard.name}
                  className="w-full h-auto object-contain rounded-xl"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
              )}
              {!canAddToCart && <OutOfStockNotice />}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">Yu-Gi-Oh!</Badge>
                {yugiohCard.set_name && <Badge className="bg-blue-100 text-blue-700">{yugiohCard.set_name}</Badge>}
                {yugiohCard.rarity && <Badge className="bg-amber-100 text-amber-700">{yugiohCard.rarity}</Badge>}
                {yugiohCard.attribute && <Badge className="bg-violet-100 text-violet-700">{yugiohCard.attribute}</Badge>}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{yugiohCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {yugiohCard.set_name || 'Yu-Gi-Oh!'}
                  {yugiohCard.set_code ? ` • ${yugiohCard.set_code}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Race</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.race || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Attribute</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.attribute || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Archetype</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.archetype || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">ATK / DEF</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.atk ?? '—'} / {yugiohCard.def ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Level / Rank</p>
                    <p className="text-gray-900 font-medium">{yugiohCard.level ?? '—'}</p>
                  </div>
                  {yugiohCard.scale !== null && (
                    <div>
                      <p className="text-gray-500">Scale</p>
                      <p className="text-gray-900 font-medium">{yugiohCard.scale}</p>
                    </div>
                  )}
                  {yugiohCard.linkval !== null && (
                    <div>
                      <p className="text-gray-500">Link Rating</p>
                      <p className="text-gray-900 font-medium">{yugiohCard.linkval}</p>
                    </div>
                  )}
                  {yugiohCard.ban_tcg && (
                    <div>
                      <p className="text-gray-500">TCG Status</p>
                      <p className="text-gray-900 font-medium">{yugiohCard.ban_tcg}</p>
                    </div>
                  )}
                  {yugiohCard.released_at && (
                    <div>
                      <p className="text-gray-500">Released</p>
                      <p className="text-gray-900 font-medium">{yugiohCard.released_at}</p>
                    </div>
                  )}
                </div>

                {yugiohCard.desc && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Card Text</p>
                    <p className="text-gray-900 whitespace-pre-line">{yugiohCard.desc}</p>
                  </div>
                )}

                {yugiohCard.linkmarkers?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Link Markers</p>
                    <p className="text-gray-900">{yugiohCard.linkmarkers.join(', ')}</p>
                  </div>
                )}

                {yugiohCard.card_sets?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Available Sets</p>
                    <div className="flex flex-wrap gap-2">
                      {yugiohCard.card_sets.slice(0, 16).map((set) => (
                        <Badge key={`${set.set_code}-${set.set_rarity}`} className="bg-gray-100 text-gray-700">
                          {set.set_name} {set.set_rarity ? `• ${set.set_rarity}` : ''}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isLorcanaCatalogMode) {
    if (!lorcanaCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToLorcanaSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToLorcanaSearchUrl(initialSearch || lorcanaCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className={detailMediaPanelClass}>
              {lorcanaCard.image_url ? (
                <img
                  src={lorcanaCard.image_url}
                  alt={lorcanaCard.name}
                  className="w-full h-auto object-contain rounded-xl"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
              )}
              {!canAddToCart && <OutOfStockNotice />}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">Disney Lorcana</Badge>
                {lorcanaCard.set_name && <Badge className="bg-blue-100 text-blue-700">{lorcanaCard.set_name}</Badge>}
                {lorcanaCard.rarity && <Badge className="bg-amber-100 text-amber-700">{lorcanaCard.rarity}</Badge>}
                {lorcanaCard.ink && <Badge className="bg-violet-100 text-violet-700">{lorcanaCard.ink}</Badge>}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{lorcanaCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {lorcanaCard.set_name}
                  {lorcanaCard.collector_number ? ` • #${lorcanaCard.collector_number}` : ''}
                  {lorcanaCard.version ? ` • ${lorcanaCard.version}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.types?.join(' — ') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Ink</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.ink || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cost</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.cost ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Rarity</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.rarity || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lore</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.lore ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Strength / Willpower</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.strength ?? '—'} / {lorcanaCard.willpower ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Inkwell</p>
                    <p className="text-gray-900 font-medium">{lorcanaCard.inkwell ? 'Yes' : 'No'}</p>
                  </div>
                </div>

                {lorcanaCard.text && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Card Text</p>
                    <p className="text-gray-900 whitespace-pre-line">{lorcanaCard.text}</p>
                  </div>
                )}

                {lorcanaCard.keywords?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {lorcanaCard.keywords.map((keyword) => (
                        <Badge key={keyword} className="bg-gray-100 text-gray-700">{keyword}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {lorcanaCard.classifications?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Classifications</p>
                    <div className="flex flex-wrap gap-2">
                      {lorcanaCard.classifications.map((classification) => (
                        <Badge key={classification} className="bg-gray-100 text-gray-700">{classification}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isOnePieceCatalogMode) {
    if (!onePieceCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToOnePieceSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToOnePieceSearchUrl(initialSearch || onePieceCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className={detailMediaPanelClass}>
              {onePieceCard.image_url ? (
                <img
                  src={onePieceCard.image_url}
                  alt={onePieceCard.name}
                  className="w-full h-auto object-contain rounded-xl"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
              )}
              {!canAddToCart && <OutOfStockNotice />}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">One Piece TCG</Badge>
                {onePieceCard.set_name && <Badge className="bg-blue-100 text-blue-700">{onePieceCard.set_name}</Badge>}
                {onePieceCard.rarity && <Badge className="bg-amber-100 text-amber-700">{onePieceCard.rarity}</Badge>}
                {onePieceCard.colors?.map((color) => <Badge key={color} className="bg-red-100 text-red-700">{color}</Badge>)}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{onePieceCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {onePieceCard.set_name}
                  {onePieceCard.id ? ` • ${onePieceCard.id}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Category</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.category || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Types</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.types?.join(' — ') || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cost</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.cost ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Rarity</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.rarity || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Power</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.power ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Counter</p>
                    <p className="text-gray-900 font-medium">{onePieceCard.counter ?? '—'}</p>
                  </div>
                </div>
                {onePieceCard.effect && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Effect</p>
                    <p className="text-gray-900 whitespace-pre-line">{onePieceCard.effect.replace(/<br\s*\/?>/gi, '\n')}</p>
                  </div>
                )}

                {onePieceCard.trigger && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Trigger</p>
                    <p className="text-gray-900 whitespace-pre-line">{onePieceCard.trigger.replace(/<br\s*\/?>/gi, '\n')}</p>
                  </div>
                )}
              </div>

              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isFabCatalogMode) {
    if (!fabCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToFabSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToFabSearchUrl(initialSearch || fabCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className={detailMediaPanelClass}>
              {fabCard.image_url ? (
                <img
                  src={fabCard.image_url}
                  alt={fabCard.name}
                  className="w-full h-auto object-contain rounded-xl"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
              )}
              {!canAddToCart && <OutOfStockNotice />}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">Flesh and Blood</Badge>
                {fabCard.set_name && <Badge className="bg-blue-100 text-blue-700">{fabCard.set_name}</Badge>}
                {fabCard.rarity && <Badge className="bg-amber-100 text-amber-700">{fabCard.rarity}</Badge>}
                {fabCard.color && <Badge className="bg-red-100 text-red-700">{fabCard.color}</Badge>}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{fabCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {fabCard.set_name || 'Flesh and Blood'}
                  {fabCard.card_number ? ` • ${fabCard.card_number}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="text-gray-900 font-medium">{fabCard.type_text || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Pitch</p>
                    <p className="text-gray-900 font-medium">{fabCard.pitch || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{fabCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cost</p>
                    <p className="text-gray-900 font-medium">{fabCard.cost || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Rarity</p>
                    <p className="text-gray-900 font-medium">{fabCard.rarity || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Power / Defense</p>
                    <p className="text-gray-900 font-medium">{fabCard.power || '—'} / {fabCard.defense || '—'}</p>
                  </div>
                  {(fabCard.health || fabCard.intelligence) && (
                    <div>
                      <p className="text-gray-500">Health / Intellect</p>
                      <p className="text-gray-900 font-medium">{fabCard.health || '—'} / {fabCard.intelligence || '—'}</p>
                    </div>
                  )}
                  {fabCard.arcane && (
                    <div>
                      <p className="text-gray-500">Arcane</p>
                      <p className="text-gray-900 font-medium">{fabCard.arcane}</p>
                    </div>
                  )}
                </div>
                  {fabCard.artist && (
                    <div>
                      <p className="text-gray-500">Artist</p>
                      <p className="text-gray-900 font-medium">{fabCard.artist}</p>
                    </div>
                  )}
                  {fabCard.released_at && (
                    <div>
                      <p className="text-gray-500">Released</p>
                      <p className="text-gray-900 font-medium">{String(fabCard.released_at).slice(0, 10)}</p>
                    </div>
                  )}
                </div>

                {fabCard.functional_text && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Card Text</p>
                    <p className="text-gray-900 whitespace-pre-line">{fabCard.functional_text}</p>
                  </div>
                )}

                {fabCard.keywords?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {fabCard.keywords.map((keyword) => (
                        <Badge key={keyword} className="bg-gray-100 text-gray-700">{keyword}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {fabCard.traits?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Traits</p>
                    <div className="flex flex-wrap gap-2">
                      {fabCard.traits.map((trait) => (
                        <Badge key={trait} className="bg-gray-100 text-gray-700">{trait}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <ShieldCheck className="w-4 h-4 text-green-500" />
                      Format Legality
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>Blitz: {fabCard.blitz_legal ? 'Legal' : 'Not legal'}</p>
                      <p>Classic Constructed: {fabCard.cc_legal ? 'Legal' : 'Not legal'}</p>
                      <p>Commoner: {fabCard.commoner_legal ? 'Legal' : 'Not legal'}</p>
                      <p>Living Legend: {fabCard.ll_legal ? 'Legal' : 'Not legal'}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <Layers className="w-4 h-4 text-blue-500" />
                      Classification
                    </div>
                    <p className="text-gray-700 text-sm">{fabCard.types?.join(' • ') || '—'}</p>
                  </div>
                </div>
              </div>

              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
      </div>
    );
  }

  if (isStarWarsCatalogMode) {
    if (!starWarsCard) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={buildBackToStarWarsSearchUrl(initialSearch)}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
            </Link>
          </div>
        </div>
      );
    }

    const backToSearchUrl = buildBackToStarWarsSearchUrl(initialSearch || starWarsCard.name);

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={backToSearchUrl}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Search
            </Button>
          </Link>

          <div className={detailGridClass}>
            <div className="self-start space-y-4">
              <div className={detailMediaPanelClass}>
                {starWarsCard.image_url ? (
                  <img
                    src={starWarsCard.image_url}
                    alt={starWarsCard.name}
                    className="w-full h-auto object-contain rounded-xl"
                    loading="eager"
                    decoding="async"
                  />
                ) : (
                  <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
                )}
                {!canAddToCart && <OutOfStockNotice />}
              </div>

              {starWarsCard.image_back_url && (
                <div className="bg-white rounded-2xl border border-gray-200 p-4">
                  <p className="text-sm font-medium text-gray-600 mb-3">Card Back / Reverse Side</p>
                  <img
                    src={starWarsCard.image_back_url}
                    alt={`${starWarsCard.name} back`}
                    className="w-full h-auto object-contain rounded-xl"
                    loading="lazy"
                    decoding="async"
                  />
                </div>
              )}
            </div>

            <div className="space-y-6">
              <div className="flex flex-wrap gap-2">
                <Badge className="bg-gray-100 text-gray-700">Star Wars Unlimited</Badge>
                {starWarsCard.set_name && <Badge className="bg-blue-100 text-blue-700">{starWarsCard.set_name}</Badge>}
                {starWarsCard.rarity && <Badge className="bg-amber-100 text-amber-700">{starWarsCard.rarity}</Badge>}
                {starWarsCard.arena && <Badge className="bg-indigo-100 text-indigo-700">{starWarsCard.arena}</Badge>}
              </div>

              <div>
                <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{starWarsCard.name}</h1>
                <p className="text-gray-500 text-lg mt-2">
                  {starWarsCard.subtitle || starWarsCard.set_name}
                  {starWarsCard.card_number ? ` • #${starWarsCard.card_number}` : ''}
                </p>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
                <div className="flex items-center gap-2 text-gray-900 font-semibold">
                  <ScrollText className="w-4 h-4 text-blue-600" />
                  Card Details
                </div>
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Type</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.type || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Set Code</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.set_code || '-'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Cost</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.cost ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Power / HP</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.power ?? '—'} / {starWarsCard.hp ?? '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Arena</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.arena || '—'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Variant</p>
                    <p className="text-gray-900 font-medium">{starWarsCard.variant_type || '—'}</p>
                  </div>
                  {starWarsCard.artist && (
                    <div>
                      <p className="text-gray-500">Artist</p>
                      <p className="text-gray-900 font-medium">{starWarsCard.artist}</p>
                    </div>
                  )}
                  {starWarsCard.released_at && (
                    <div>
                      <p className="text-gray-500">Released</p>
                      <p className="text-gray-900 font-medium">{String(starWarsCard.released_at).slice(0, 10)}</p>
                    </div>
                  )}
                </div>

                {starWarsCard.aspects?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Aspects</p>
                    <div className="flex flex-wrap gap-2">
                      {starWarsCard.aspects.map((aspect) => (
                        <Badge key={aspect} className="bg-gray-100 text-gray-700">{aspect}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {starWarsCard.traits?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Traits</p>
                    <div className="flex flex-wrap gap-2">
                      {starWarsCard.traits.map((trait) => (
                        <Badge key={trait} className="bg-gray-100 text-gray-700">{trait}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {starWarsCard.keywords?.length > 0 && (
                  <div>
                    <p className="text-gray-500 text-sm mb-2">Keywords</p>
                    <div className="flex flex-wrap gap-2">
                      {starWarsCard.keywords.map((keyword) => (
                        <Badge key={keyword} className="bg-gray-100 text-gray-700">{keyword}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {starWarsCard.text && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Card Text</p>
                    <p className="text-gray-900 whitespace-pre-line">{starWarsCard.text}</p>
                  </div>
                )}

                {starWarsCard.back_text && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Reverse Side Text</p>
                    <p className="text-gray-900 whitespace-pre-line">{starWarsCard.back_text}</p>
                  </div>
                )}

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <Layers className="w-4 h-4 text-blue-500" />
                      Card Flags
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>Unique: {starWarsCard.is_unique ? 'Yes' : 'No'}</p>
                      <p>Leader: {starWarsCard.is_leader ? 'Yes' : 'No'}</p>
                      <p>Base: {starWarsCard.is_base ? 'Yes' : 'No'}</p>
                      <p>Double-Sided: {starWarsCard.double_sided ? 'Yes' : 'No'}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-200 p-4">
                    <div className="flex items-center gap-2 mb-2 text-gray-900 font-semibold">
                      <Zap className="w-4 h-4 text-yellow-500" />
                      Identifiers
                    </div>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p>Card ID: {starWarsCard.card_id || '—'}</p>
                      <p>API ID: {starWarsCard.external_id || '—'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {canAddToCart && (
                <div className="bg-white rounded-2xl border border-gray-200 p-6">
                  <Button
                    size="lg"
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleAddToCart}
                    disabled={addToCartMutation.isPending}
                  >
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Add to Cart
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isMtgCatalogMode) {
    const card = inventoryCard;

    if (!card) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
            <Link to={createPageUrl('Shop')}>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Shop</Button>
            </Link>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-gray-50">
        <div className="w-full px-4 py-8">
          <Link to={createPageUrl('Shop')}>
            <Button variant="ghost" className="mb-6 -ml-2">
              <ChevronLeft className="w-4 h-4 mr-1" />
              Back to Shop
            </Button>
          </Link>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              {card.image_url ? <img src={card.image_url} alt={card.name} className="w-full h-auto object-contain" /> : <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>}
            </div>
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-gray-900">{card.name}</h1>
              <p className="text-gray-500">{card.set_name}</p>
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <p className="text-3xl font-bold text-gray-900">${card.price?.toFixed(2)}</p>
                <p className="text-sm text-gray-500 mt-2">{card.quantity} available</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!activePrinting || !activePrintingGroup) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-gray-900 text-2xl font-bold mb-4">Card not found</h2>
          <Link to={buildBackToSearchUrl(initialSearch)}>
            <Button className="bg-blue-600 hover:bg-blue-700 text-white">Back to Search</Button>
          </Link>
        </div>
      </div>
    );
  }

  const backToSearchUrl = buildBackToSearchUrl(initialSearch || activePrinting.name);
  const shouldUsePrintingDropdown = printingGroups.length > 5;
  const hasLoyalty = activePrinting.loyalty !== null && activePrinting.loyalty !== undefined && String(activePrinting.loyalty) !== '';
  const hasPowerToughness =
    activePrinting.power !== null &&
    activePrinting.power !== undefined &&
    activePrinting.toughness !== null &&
    activePrinting.toughness !== undefined &&
    String(activePrinting.power) !== '' &&
    String(activePrinting.toughness) !== '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="w-full px-4 py-8">
        <Link to={backToSearchUrl}>
          <Button variant="ghost" className="mb-6 -ml-2">
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back to Search
          </Button>
        </Link>

        <div className={detailGridClass}>
          <div className={detailMediaPanelClass}>
            {activePrinting.image_url ? (
              <img
                src={activePrinting.image_url}
                alt={activePrinting.raw_name || activePrinting.name}
                className="w-full h-auto object-contain rounded-xl"
              />
            ) : (
              <div className="aspect-[3/4] flex items-center justify-center text-gray-400">No Image</div>
            )}
            {!canAddToCart && <OutOfStockNotice />}
          </div>

          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-gray-100 text-gray-700">Magic: The Gathering</Badge>
              <Badge className="bg-blue-100 text-blue-700">{activePrinting.set_name}</Badge>
              <Badge className="bg-slate-100 text-slate-700">{getLanguageLabel(activePrinting.lang)}</Badge>
              {activePrinting.rarity && <Badge className="bg-emerald-100 text-emerald-700">{activePrinting.rarity}</Badge>}
            </div>

            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{activePrinting.name}</h1>
              <p className="text-gray-500 text-lg mt-2">
                {activePrinting.set_name}
                {activePrinting.card_number ? ` • #${activePrinting.card_number}` : ''}
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3 text-gray-900 font-semibold">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Choose Printing
                </div>
                {shouldUsePrintingDropdown ? (
                  <Select value={activePrintingGroup.set_code} onValueChange={setSelectedSetCode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a set" />
                    </SelectTrigger>
                    <SelectContent>
                      {printingGroups.map((group) => (
                        <SelectItem key={group.key} value={group.set_code}>
                          {group.set_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {printingGroups.map((group) => {
                      const isActive = String(group.set_code || '').toUpperCase() === String(activePrintingGroup.set_code || '').toUpperCase();
                      return (
                        <button
                          key={group.key}
                          type="button"
                          onClick={() => setSelectedSetCode(group.set_code)}
                          className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${isActive ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`}
                        >
                          {group.set_name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5">
                <div className="flex items-center gap-2 mb-3 text-gray-900 font-semibold">
                  <Globe className="w-4 h-4 text-blue-600" />
                  Choose Language
                </div>
                <div className="flex flex-wrap gap-2">
                  {activePrintingGroup.printings.map((printing) => {
                    const languageCode = String(printing.lang || '').toLowerCase();
                    const isActive = languageCode === String(selectedLanguage || '').toLowerCase();
                    return (
                      <button
                        key={`${printing.id}-${languageCode}`}
                        type="button"
                        onClick={() => setSelectedLanguage(languageCode)}
                        className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${isActive ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'}`}
                      >
                        {getLanguageLabel(languageCode)}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
              <div className="flex items-center gap-2 text-gray-900 font-semibold">
                <ScrollText className="w-4 h-4 text-blue-600" />
                Card Details
              </div>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Mana Cost</p>
                  <div className="mt-1">
                    <ManaCost manaCost={activePrinting.mana_cost} />
                  </div>
                </div>
                <div>
                  <p className="text-gray-500">Type</p>
                  <p className="text-gray-900 font-medium">{activePrinting.type || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Set</p>
                  <p className="text-gray-900 font-medium">{activePrinting.set_name || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Released</p>
                  <p className="text-gray-900 font-medium">{activePrinting.released_at || '—'}</p>
                </div>
                <div>
                  <p className="text-gray-500">Market</p>
                  <p className="text-gray-900 font-medium">{activePrinting.price != null ? `$${activePrinting.price.toFixed(2)}` : 'N/A'}</p>
                </div>
                {hasLoyalty && (
                  <div>
                    <p className="text-gray-500">Loyalty</p>
                    <div className="mt-1 flex items-center gap-2">
                      <PlaneswalkerLoyaltyBadge value={activePrinting.loyalty} kind="start" className="h-10 w-auto" />
                      <span className="text-gray-900 font-medium">{activePrinting.loyalty}</span>
                    </div>
                  </div>
                )}
                {hasPowerToughness && (
                  <div>
                    <p className="text-gray-500">Power / Toughness</p>
                    <p className="text-gray-900 font-medium">{activePrinting.power} / {activePrinting.toughness}</p>
                  </div>
                )}
              </div>
              {activePrinting.oracle_text && (
                <div>
                  <p className="text-gray-500 text-sm mb-1">Oracle Text</p>
                  <OracleText text={activePrinting.oracle_text} />
                </div>
              )}
            </div>

            {canAddToCart && (
              <div className="bg-white rounded-2xl border border-gray-200 p-6">
                <Button
                  size="lg"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={handleAddToCart}
                  disabled={addToCartMutation.isPending}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Add to Cart
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
