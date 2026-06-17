import React, { useEffect, useState } from 'react';
import { backend } from '@/services/backend';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { GitCompare, Search, Plus, X, Loader2, LogIn } from 'lucide-react';
import { toast } from 'sonner';
import { ManaCost, MtgSymbolText, PlaneswalkerLoyaltyBadge } from '@/components/lib/MtgSymbolText';

const GAMES = [
  { value: 'magic', label: 'Magic: The Gathering' },
  { value: 'pokemon', label: 'Pokémon' },
  { value: 'yugioh', label: 'Yu-Gi-Oh!' },
  { value: 'lorcana', label: 'Lorcana' }
];

export default function CardComparison() {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);

  useEffect(() => {
    backend.auth.isAuthenticated().then(async (auth) => {
      if (auth) setUser(await backend.auth.getCurrentUser());
      setIsLoadingAuth(false);
    });
  }, []);

  const [selectedGame, setSelectedGame] = useState('magic');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [comparedCards, setComparedCards] = useState([]);
  const [searchPage, setSearchPage] = useState(0);
  const SEARCH_PER_PAGE = 20;

  const searchCards = async (q) => {
    if (!q || q.length < 2) {
      setSearchResults([]);
      setSearchPage(0);
      return;
    }

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

        setSearchResults(allCards.map((c) => ({
          name: c.name,
          set_name: c.set_name,
          rarity: c.rarity,
          type_line: c.type_line,
          mana_cost: c.mana_cost,
          oracle_text: c.oracle_text,
          power: c.power,
          toughness: c.toughness,
          loyalty: c.loyalty,
          image_url: c.image_uris?.normal || c.card_faces?.[0]?.image_uris?.normal,
          market_price: c.prices?.usd ? parseFloat(c.prices.usd) : null,
          game: 'magic'
        })));
      } else if (selectedGame === 'yugioh') {
        const res = await fetch(`https://db.ygoprodeck.com/api/v7/cardinfo.php?fname=${encodeURIComponent(q)}`);
        const data = await res.json();
        setSearchResults((data.data || []).map((c) => ({
          name: c.name,
          set_name: c.card_sets?.[0]?.set_name || '',
          rarity: c.card_sets?.[0]?.set_rarity || '',
          type_line: c.type,
          oracle_text: c.desc,
          atk: c.atk,
          def: c.def,
          level: c.level,
          attribute: c.attribute,
          image_url: c.card_images?.[0]?.image_url,
          market_price: c.card_prices?.[0]?.tcgplayer_price ? parseFloat(c.card_prices[0].tcgplayer_price) : null,
          game: 'yugioh'
        })));
      } else if (selectedGame === 'pokemon') {
        const res = await fetch(`https://api.pokemontcg.io/v2/cards?q=name:${encodeURIComponent(q)}*&pageSize=250&orderBy=-set.releaseDate`);
        const data = await res.json();
        setSearchResults((data.data || []).map((c) => ({
          name: c.name,
          set_name: c.set?.name || '',
          rarity: c.rarity,
          type_line: c.supertype,
          image_url: c.images?.small,
          market_price: null,
          game: 'pokemon'
        })));
      } else if (selectedGame === 'lorcana') {
        const cards = await backend.data.LorcanaCard.filter({ name_lower: { $regex: q.toLowerCase(), $options: 'i' } }, '-created_date', 500);
        setSearchResults(cards.map((c) => ({
          name: c.name,
          set_name: c.set_name,
          rarity: c.rarity,
          type_line: (c.types || []).join(', '),
          oracle_text: c.text,
          image_url: c.image_url,
          market_price: null,
          game: 'lorcana',
          cost: c.cost,
          lore: c.lore,
          strength: c.strength,
          willpower: c.willpower
        })));
      }
    } catch {
      setSearchResults([]);
    }

    setSearching(false);
  };

  const addToComparison = (card) => {
    if (comparedCards.length >= 4) {
      toast.error('Maximum 4 cards for comparison');
      return;
    }

    if (comparedCards.find((c) => c.name === card.name && c.set_name === card.set_name)) {
      toast.error('Card already in comparison');
      return;
    }

    setComparedCards((prev) => [...prev, card]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const removeCard = (idx) => setComparedCards((prev) => prev.filter((_, i) => i !== idx));

  const getRows = () => {
    if (!comparedCards.length) return [];

    const game = comparedCards[0].game;
    if (game === 'magic') {
      return [
        { label: 'Set', key: 'set_name' },
        { label: 'Rarity', key: 'rarity' },
        { label: 'Type', key: 'type_line' },
        { label: 'Mana Cost', key: 'mana_cost' },
        { label: 'Loyalty', key: 'loyalty' },
        { label: 'Power / Toughness', render: (c) => c.power ? `${c.power} / ${c.toughness}` : '—' },
        { label: 'Oracle Text', key: 'oracle_text' },
        { label: 'Market Price', render: (c) => c.market_price ? `$${c.market_price.toFixed(2)}` : '—' }
      ];
    }

    if (game === 'yugioh') {
      return [
        { label: 'Set', key: 'set_name' },
        { label: 'Rarity', key: 'rarity' },
        { label: 'Type', key: 'type_line' },
        { label: 'Attribute', key: 'attribute' },
        { label: 'Level', key: 'level' },
        { label: 'ATK / DEF', render: (c) => c.atk !== undefined ? `${c.atk} / ${c.def}` : '—' },
        { label: 'Effect', key: 'oracle_text' },
        { label: 'Market Price', render: (c) => c.market_price ? `$${c.market_price.toFixed(2)}` : '—' }
      ];
    }

    if (game === 'lorcana') {
      return [
        { label: 'Set', key: 'set_name' },
        { label: 'Rarity', key: 'rarity' },
        { label: 'Type', key: 'type_line' },
        { label: 'Cost', key: 'cost' },
        { label: 'Lore', key: 'lore' },
        { label: 'Strength', key: 'strength' },
        { label: 'Willpower', key: 'willpower' },
        { label: 'Text', key: 'oracle_text' }
      ];
    }

    return [
      { label: 'Set', key: 'set_name' },
      { label: 'Rarity', key: 'rarity' },
      { label: 'Type', key: 'type_line' }
    ];
  };

  const renderCellValue = (row, card, comparisonGame) => {
    if (row.render) {
      return <span className="whitespace-pre-wrap">{row.render(card)}</span>;
    }

    if (comparisonGame === 'magic' && row.key === 'mana_cost') {
      return <ManaCost manaCost={card[row.key]} />;
    }

    if (comparisonGame === 'magic' && row.key === 'oracle_text') {
      return <MtgSymbolText text={card[row.key]} className="space-y-2 text-sm text-gray-800 leading-relaxed" symbolClassName="h-4 w-4" />;
    }

    if (comparisonGame === 'magic' && row.key === 'loyalty') {
      return card[row.key] ? (
        <div className="flex items-center gap-2">
          <PlaneswalkerLoyaltyBadge value={card[row.key]} kind="start" className="h-9 w-auto" />
          <span className="whitespace-pre-wrap">{card[row.key]}</span>
        </div>
      ) : (
        <span className="whitespace-pre-wrap">—</span>
      );
    }

    return <span className="whitespace-pre-wrap">{card[row.key] ?? '—'}</span>;
  };

  if (isLoadingAuth) {
    return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <GitCompare className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Members Only</h2>
          <p className="text-gray-500 mb-6">Sign in to use the card comparison tool.</p>
          <Button onClick={() => backend.auth.redirectToLogin(window.location.href)} className="bg-gray-800 hover:bg-gray-700">
            <LogIn className="w-4 h-4 mr-2" /> Sign In
          </Button>
        </div>
      </div>
    );
  }

  const rows = getRows();
  const comparisonGame = comparedCards[0]?.game;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Card Comparison</h1>
          <p className="text-gray-500 mt-1">Compare up to 4 cards side by side</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex gap-3 flex-wrap">
            <Select value={selectedGame} onValueChange={(v) => { setSelectedGame(v); setSearchResults([]); setSearchQuery(''); setComparedCards([]); }}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>{GAMES.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
            </Select>
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                className="pl-9"
                placeholder="Search and add a card to compare..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  clearTimeout(window._compareSearch);
                  window._compareSearch = setTimeout(() => searchCards(e.target.value), 400);
                }}
              />
              {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />}
            </div>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-3 border rounded-lg">
              <div className="max-h-52 overflow-y-auto">
                {searchResults.slice(searchPage * SEARCH_PER_PAGE, (searchPage + 1) * SEARCH_PER_PAGE).map((result, index) => (
                  <button key={index} onClick={() => addToComparison(result)} className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 border-b last:border-0 text-left">
                    {result.image_url && <img src={result.image_url} alt={result.name} className="w-10 h-10 object-contain rounded" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{result.name}</p>
                      <p className="text-xs text-gray-500">{result.set_name}</p>
                    </div>
                    <Plus className="w-4 h-4 text-gray-400" />
                  </button>
                ))}
              </div>
              {searchResults.length > SEARCH_PER_PAGE && (
                <div className="flex items-center justify-between px-3 py-2 border-t bg-gray-50 text-xs text-gray-500">
                  <span>{searchPage * SEARCH_PER_PAGE + 1}-{Math.min((searchPage + 1) * SEARCH_PER_PAGE, searchResults.length)} of {searchResults.length}</span>
                  <div className="flex gap-2">
                    <button onClick={() => setSearchPage((page) => Math.max(0, page - 1))} disabled={searchPage === 0} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100">Prev</button>
                    <button onClick={() => setSearchPage((page) => page + 1)} disabled={(searchPage + 1) * SEARCH_PER_PAGE >= searchResults.length} className="px-2 py-1 rounded border disabled:opacity-40 hover:bg-gray-100">Next</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {comparedCards.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
            <GitCompare className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">Search for cards above to start comparing</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left p-4 text-sm font-semibold text-gray-500 w-32">Attribute</th>
                  {comparedCards.map((card, index) => (
                    <th key={index} className="p-4 min-w-48">
                      <div className="relative">
                        <button onClick={() => removeCard(index)} className="absolute -top-1 -right-1 w-5 h-5 bg-gray-200 hover:bg-red-100 hover:text-red-600 rounded-full flex items-center justify-center">
                          <X className="w-3 h-3" />
                        </button>
                        {card.image_url && <img src={card.image_url} alt={card.name} className="w-24 h-24 object-contain mx-auto mb-2 rounded" />}
                        <p className="font-semibold text-gray-900 text-sm">{card.name}</p>
                        <p className="text-xs text-gray-500">{card.set_name}</p>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className={rowIndex % 2 === 0 ? 'bg-gray-50' : 'bg-white'}>
                    <td className="p-4 text-sm font-medium text-gray-600 align-top">{row.label}</td>
                    {comparedCards.map((card, cardIndex) => (
                      <td key={cardIndex} className="p-4 text-sm text-gray-800 align-top">
                        {renderCellValue(row, card, comparisonGame)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
