import React, { useState } from 'react';
import { X, Plus, Loader2, Sparkles, Star, Zap, Shield, Swords, FlameKindling, Wand2, Gem, TreePine, Layers, CircleDollarSign } from 'lucide-react';

const CATEGORY_CONFIG = {
  new_cards: { label: 'New Cards', icon: Sparkles, color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-700' },
  high_synergy: { label: 'High Synergy', icon: Zap, color: 'text-yellow-400', bg: 'bg-yellow-900/30', border: 'border-yellow-700' },
  top_cards: { label: 'Top Cards', icon: Star, color: 'text-blue-400', bg: 'bg-blue-900/30', border: 'border-blue-700' },
  game_changers: { label: 'Game Changers', icon: FlameKindling, color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-700' },
  creatures: { label: 'Creatures', icon: Swords, color: 'text-orange-400', bg: 'bg-orange-900/30', border: 'border-orange-700' },
  instants: { label: 'Instants', icon: Zap, color: 'text-cyan-400', bg: 'bg-cyan-900/30', border: 'border-cyan-700' },
  sorceries: { label: 'Sorceries', icon: Wand2, color: 'text-purple-400', bg: 'bg-purple-900/30', border: 'border-purple-700' },
  utility_artifacts: { label: 'Utility Artifacts', icon: Gem, color: 'text-slate-300', bg: 'bg-slate-800/50', border: 'border-slate-600' },
  enchantments: { label: 'Enchantments', icon: Shield, color: 'text-pink-400', bg: 'bg-pink-900/30', border: 'border-pink-700' },
  planeswalkers: { label: 'Planeswalkers', icon: Star, color: 'text-violet-400', bg: 'bg-violet-900/30', border: 'border-violet-700' },
  utility_lands: { label: 'Utility Lands', icon: TreePine, color: 'text-emerald-400', bg: 'bg-emerald-900/30', border: 'border-emerald-700' },
  mana_artifacts: { label: 'Mana Artifacts', icon: CircleDollarSign, color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-700' },
  lands: { label: 'Lands', icon: Layers, color: 'text-teal-400', bg: 'bg-teal-900/30', border: 'border-teal-700' },
};

const CATEGORY_ORDER = [
  'new_cards', 'high_synergy', 'top_cards', 'game_changers',
  'creatures', 'instants', 'sorceries', 'utility_artifacts',
  'enchantments', 'planeswalkers', 'utility_lands', 'mana_artifacts', 'lands'
];

function SynergyCard({ card, onAdd, alreadyInDeck }) {
  return (
    <div className="flex flex-col flex-shrink-0 w-48">
      <div className="relative group rounded-xl overflow-hidden border-2 border-gray-700 hover:border-blue-400 transition-all bg-gray-800 shadow-lg">
        {card.image_url ? (
          <img src={card.image_url} alt={card.name} className="w-full aspect-[2/3] object-cover" loading="lazy" />
        ) : (
          <div className="w-full aspect-[2/3] bg-gray-700 flex items-center justify-center p-3">
            <span className="text-gray-400 text-sm text-center">{card.name}</span>
          </div>
        )}

        {/* Price badge */}
        {card.price != null && (
          <div className="absolute bottom-2 left-2 bg-black/80 text-green-300 text-xs font-bold px-2 py-1 rounded">
            ${card.price.toFixed(2)}
          </div>
        )}

        {/* Already in deck badge */}
        {alreadyInDeck && (
          <div className="absolute top-2 right-2 bg-green-600 text-white text-sm font-bold w-7 h-7 rounded-full flex items-center justify-center shadow">
            ✓
          </div>
        )}

        {/* Add button on hover */}
        {!alreadyInDeck && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(card); }}
              className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-lg"
            >
              <Plus className="w-4 h-4" /> Add
            </button>
          </div>
        )}
      </div>

      {/* Card info below */}
      <div className="mt-3 px-2 pb-2">
        <p className="text-white text-xs font-semibold leading-tight line-clamp-2">{card.name}</p>
        <p className="text-gray-400 text-xs leading-tight mt-2 line-clamp-3">{card.reason}</p>
      </div>
    </div>
  );
}

export default function DeckSynergyPanel({ recommendations, commanderName, deck, onAddCard, onClose }) {
  const [activeCategory, setActiveCategory] = useState('new_cards');
  // Track which categories have been "visited" (loaded their cards)
  const [loadedCategories, setLoadedCategories] = useState(new Set(['new_cards']));

  const existingIds = new Set((deck?.items || []).map(i => i.product_id));
  const existingNames = new Set((deck?.items || []).map(i => i.product_name?.toLowerCase()));

  const handleSelectCategory = (cat) => {
    setActiveCategory(cat);
    setLoadedCategories(prev => new Set([...prev, cat]));
  };

  const config = CATEGORY_CONFIG[activeCategory] || { label: activeCategory, color: 'text-gray-400', bg: 'bg-gray-800', border: 'border-gray-600', icon: Layers };
  const allCategoryCards = recommendations?.[activeCategory] || [];
  // Only render cards if this category has been loaded
  const currentCards = loadedCategories.has(activeCategory) ? allCategoryCards : [];
  const isLoading = !loadedCategories.has(activeCategory);

  const handleAdd = (card) => {
    onAddCard({
      id: card.scryfall_id,
      name: card.name,
      image_url: card.image_url,
      price: card.price || 0,
      type: card.type_line || '',
      mana_cost: card.mana_cost || '',
      cmc: card.cmc ?? 0,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-xl w-[95vw] h-[90vh] flex flex-col overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-yellow-400" />
            <div>
              <h2 className="text-white font-bold text-lg">Synergy Recommendations</h2>
              {commanderName && <p className="text-gray-400 text-sm">Commander: {commanderName}</p>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar: categories */}
          <div className="w-56 flex-shrink-0 border-r border-gray-700 overflow-y-auto py-2">
            {CATEGORY_ORDER.map(cat => {
              const cfg = CATEGORY_CONFIG[cat];
              const cards = recommendations?.[cat] || [];
              if (!cards.length) return null;
              const Icon = cfg.icon;
              return (
                <button
                  key={cat}
                  onClick={() => handleSelectCategory(cat)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm transition-colors ${
                    activeCategory === cat
                      ? `${cfg.bg} ${cfg.color} font-semibold border-r-2 ${cfg.border}`
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{cfg.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right: card grid */}
          <div className="flex-1 overflow-y-auto p-8">
            <div className="flex items-center gap-2 mb-6">
              {(() => { const Icon = config.icon; return <Icon className={`w-5 h-5 ${config.color}`} />; })()}
              <h3 className={`font-semibold text-base ${config.color}`}>{config.label}</h3>
            </div>
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-gray-400 text-sm">Loading {config.label}...</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                {currentCards.map((card, idx) => (
                  <SynergyCard
                    key={idx}
                    card={card}
                    onAdd={handleAdd}
                    alreadyInDeck={existingIds.has(card.scryfall_id) || existingNames.has(card.name?.toLowerCase())}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}