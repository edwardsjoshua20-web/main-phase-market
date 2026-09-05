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
    <div className="sticky top-24 h-[calc(100vh-120px)] w-44 flex-shrink-0 self-start overflow-y-auto border-r border-gray-700 bg-gray-800 p-1.5">
      <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">My Decks</h3>
      <div className="space-y-1">
        {decks.map(deck => (
          <button
            key={deck.id}
            onClick={() => onSelectDeck(deck)}
            className={`w-full rounded-md border px-1.5 py-1 text-left text-xs transition-all ${
              activeDeck?.id === deck.id
                ? 'border-blue-400 bg-blue-900 text-white'
                : 'border-gray-700 hover:border-blue-400 hover:bg-gray-700 text-gray-300'
            }`}
          >
            <p className="font-semibold truncate">{deck.name}</p>
            <p className="text-[11px] leading-tight text-gray-400">{deck.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0} cards</p>
          </button>
        ))}
      </div>
      
      {!creatingDeck ? (
        <button
          onClick={onCreateNew}
          className="mt-1.5 w-full rounded-md bg-blue-600 py-1 text-xs text-white transition-colors hover:bg-blue-700"
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
