import React, { useState, useEffect, useRef } from 'react';
import { backend } from '@/services/backend';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, Loader2, X } from 'lucide-react';
import { toast } from "sonner";

export default function CardSearchDropdown({ onSelectCard }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchCards = async (searchQuery) => {
    if (!searchQuery.trim() || searchQuery.length < 2) {
      setResults([]);
      return;
    }

    setLoading(true);
    try {
      const result = await backend.ai.invoke({
        prompt: `Search for trading cards matching: "${searchQuery}". 
        Use Scryfall database for Magic: The Gathering cards, official Pokémon TCG database for Pokémon cards, and Yu-Gi-Oh! official database for Yu-Gi-Oh! cards.
        Return a list of up to 10 matching cards with accurate information.
        For MTG cards: use Scryfall.com data with proper set codes, collector numbers, and official Scryfall image URLs.
        For each card, provide: exact card name, game (magic/pokemon/yugioh), full set name, card/collector number, rarity, current market price from TCGPlayer or similar, official image URL, and card text/description.
        Include multiple printings if they exist in different sets.`,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  game: { type: "string", enum: ["magic", "pokemon", "yugioh"] },
                  set_name: { type: "string" },
                  card_number: { type: "string" },
                  rarity: { type: "string" },
                  price: { type: "number" },
                  image_url: { type: "string" },
                  description: { type: "string" }
                }
              }
            }
          }
        }
      });

      setResults(result.cards || []);
      setShowResults(true);
    } catch (error) {
      toast.error('Failed to search cards');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query) {
        searchCards(query);
      } else {
        setResults([]);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelectCard = (card) => {
    onSelectCard({
      name: card.name,
      game: card.game,
      set_name: card.set_name || '',
      card_number: card.card_number || '',
      rarity: card.rarity?.toLowerCase().replace(/\s+/g, '_') || 'rare',
      price: card.price || '',
      image_url: card.image_url || '',
      description: card.description || ''
    });
    setQuery('');
    setResults([]);
    setShowResults(false);
    toast.success('Card details populated!');
  };

  const rarityColors = {
    common: 'bg-gray-100 text-gray-700',
    uncommon: 'bg-green-100 text-green-700',
    rare: 'bg-blue-100 text-blue-700',
    mythic: 'bg-purple-100 text-purple-700',
    legendary: 'bg-orange-100 text-orange-700',
  };

  return (
    <div ref={searchRef} className="relative">
      <Label className="text-gray-900 font-medium mb-2 block">
        <Search className="w-4 h-4 inline mr-1" />
        Search for Card
      </Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          placeholder="Type card name (e.g., Pikachu, Black Lotus, Blue-Eyes)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowResults(true)}
          className="pl-10 pr-10 bg-white border-gray-300"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
        {query && !loading && (
          <button
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
          {results.map((card, idx) => (
            <button
              key={idx}
              onClick={() => handleSelectCard(card)}
              className="w-full flex items-start gap-3 p-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-0 text-left"
            >
              {/* Card Image */}
              <div className="w-16 h-20 flex-shrink-0 bg-gray-100 rounded overflow-hidden border border-gray-200">
                {card.image_url ? (
                  <img 
                    src={card.image_url} 
                    alt={card.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                    No Image
                  </div>
                )}
              </div>

              {/* Card Details */}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-gray-900 text-sm mb-1 truncate">
                  {card.name}
                </h4>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                    {card.game === 'magic' ? 'MTG' : card.game === 'pokemon' ? 'Pokémon' : 'Yu-Gi-Oh!'}
                  </span>
                  {card.rarity && (
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                      rarityColors[card.rarity.toLowerCase()] || 'bg-gray-100 text-gray-700'
                    }`}>
                      {card.rarity}
                    </span>
                  )}
                  {card.price && (
                    <span className="text-xs font-bold text-green-600">
                      ${card.price.toFixed(2)}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 truncate">
                  {card.set_name} {card.card_number && `• #${card.card_number}`}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {showResults && results.length === 0 && query && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl p-4 text-center text-gray-500 text-sm">
          No cards found matching "{query}"
        </div>
      )}
    </div>
  );
}


