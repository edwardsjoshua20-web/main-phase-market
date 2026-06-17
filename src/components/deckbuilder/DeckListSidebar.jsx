import React from 'react';
import { Input } from '@/components/ui/input';

export default function DeckListSidebar({ 
  decks, 
  activeDeck, 
  onSelectDeck, 
  onCreateNew,
  creatingDeck,
  newDeckName,
  onNameChange,
  onConfirmCreate,
  onCancelCreate
}) {
  return (
    <div className="w-44 flex-shrink-0 bg-gray-800 border-r border-gray-700 p-3 overflow-y-auto">
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">My Decks</h3>
      <div className="space-y-1.5">
        {decks.map(deck => (
          <button
            key={deck.id}
            onClick={() => onSelectDeck(deck)}
            className={`w-full text-left p-2 rounded-lg border text-xs transition-all ${
              activeDeck?.id === deck.id
                ? 'border-blue-400 bg-blue-900 text-white'
                : 'border-gray-700 hover:border-blue-400 hover:bg-gray-700 text-gray-300'
            }`}
          >
            <p className="font-semibold truncate">{deck.name}</p>
            <p className="text-gray-400 mt-0.5">{deck.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} cards</p>
          </button>
        ))}
      </div>
      
      {!creatingDeck ? (
        <button
          onClick={onCreateNew}
          className="w-full mt-2 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + New Deck
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <Input
            placeholder="Deck name..."
            value={newDeckName}
            onChange={(e) => onNameChange(e.target.value)}
            autoFocus
            className="text-xs px-2 py-1.5 bg-gray-700 border border-gray-600 text-white placeholder:text-gray-400"
          />
          <div className="flex gap-1">
            <button 
              onClick={onConfirmCreate}
              disabled={!newDeckName.trim()} 
              className="flex-1 py-1 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded"
            >
              Create
            </button>
            <button 
              onClick={onCancelCreate}
              className="flex-1 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}