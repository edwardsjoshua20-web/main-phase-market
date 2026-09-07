import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { normalizeDeckGame } from '@/lib/deckSections';

const GAME_GROUPS = [
  { key: 'magic', label: 'Magic: The Gathering' },
  { key: 'pokemon', label: 'Pokémon' },
  { key: 'yugioh', label: 'Yu-Gi-Oh!' },
  { key: 'lorcana', label: 'Disney Lorcana' },
  { key: 'flesh_and_blood', label: 'Flesh and Blood' },
  { key: 'onepiece', label: 'One Piece' },
  { key: 'starwars', label: 'Star Wars Unlimited' },
];

function getDeckCardCount(deck) {
  return deck?.items?.reduce((sum, item) => sum + (item.quantity || 1), 0) || 0;
}

function formatLabel(value, fallback = 'Casual') {
  const label = String(value || fallback).replace(/[_-]+/g, ' ').trim();
  return label.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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
  const [collapsedGames, setCollapsedGames] = useState(() => new Set());
  const activeGame = normalizeDeckGame(activeDeck?.game);

  useEffect(() => {
    if (!activeDeck?.id || !activeGame) return;
    setCollapsedGames((current) => {
      if (!current.has(activeGame)) return current;
      const next = new Set(current);
      next.delete(activeGame);
      return next;
    });
  }, [activeDeck?.id, activeGame]);

  const groupedDecks = useMemo(() => {
    const groups = new Map();

    decks.forEach((deck) => {
      const game = normalizeDeckGame(deck.game);
      if (!groups.has(game)) groups.set(game, []);
      groups.get(game).push(deck);
    });

    const knownGroups = GAME_GROUPS
      .filter(({ key }) => groups.has(key))
      .map(({ key, label }) => ({ key, label, decks: groups.get(key) }));
    const knownKeys = new Set(GAME_GROUPS.map(({ key }) => key));
    const otherGroups = [...groups.entries()]
      .filter(([key]) => !knownKeys.has(key))
      .map(([key, gameDecks]) => ({ key, label: formatLabel(key, 'Other'), decks: gameDecks }))
      .sort((a, b) => a.label.localeCompare(b.label));

    return [...knownGroups, ...otherGroups];
  }, [decks]);

  const toggleGame = (game) => {
    setCollapsedGames((current) => {
      const next = new Set(current);
      if (next.has(game)) next.delete(game);
      else next.add(game);
      return next;
    });
  };

  return (
    <aside className="sticky top-24 h-[calc(100vh-120px)] w-44 flex-shrink-0 self-start overflow-y-auto border-r border-slate-700/60 bg-slate-900/80 px-2 py-2" aria-label="My decks">
      <div className="flex items-center justify-between gap-1 pb-1.5">
        <h2 className="whitespace-nowrap text-[11px] font-bold uppercase text-slate-300">My Decks</h2>
        <button
          type="button"
          onClick={onCreateNew}
          className="flex h-6 shrink-0 items-center gap-0.5 px-1 text-[11px] font-semibold text-blue-300 transition-colors hover:text-blue-100"
        >
          <Plus className="h-3 w-3" /> New Deck
        </button>
      </div>

      {creatingDeck && (
        <div className="mb-2 border-y border-slate-700/60 py-2">
          <Input
            placeholder="Deck name..."
            value={newDeckName}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
            className="h-7 rounded-sm border-slate-700 bg-slate-950/70 px-2 text-xs text-white placeholder:text-slate-500"
          />
          <div className="mt-1.5 flex gap-1">
            <button
              type="button"
              onClick={onConfirmCreate}
              disabled={!newDeckName.trim()}
              className="flex-1 rounded-sm bg-blue-700 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-blue-600 disabled:opacity-50"
            >
              Create
            </button>
            <button
              type="button"
              onClick={onCancelCreate}
              className="flex-1 rounded-sm bg-slate-800 py-1 text-[11px] text-slate-300 transition-colors hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="border-t border-slate-700/60">
        {groupedDecks.map((group) => {
          const collapsed = collapsedGames.has(group.key);
          return (
            <section key={group.key} className="border-b border-slate-700/60 py-1">
              <button
                type="button"
                onClick={() => toggleGame(group.key)}
                className="flex w-full items-center gap-1 py-1 text-left text-[10px] font-semibold text-slate-400 transition-colors hover:text-slate-200"
                aria-expanded={!collapsed}
              >
                {collapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                <span className="tabular-nums text-slate-500">{group.decks.length}</span>
              </button>

              {!collapsed && (
                <div className="pb-0.5">
                  {group.decks.map((deck) => {
                    const renderedDeck = activeDeck?.id === deck.id ? activeDeck : deck;
                    const selected = activeDeck?.id === deck.id;
                    const cardCount = getDeckCardCount(renderedDeck);
                    return (
                      <button
                        key={deck.id}
                        type="button"
                        onClick={() => onSelectDeck(deck)}
                        className={`relative w-full py-1.5 pl-4 pr-1.5 text-left transition-colors ${
                          selected
                            ? 'bg-blue-950/70 text-white before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-blue-400'
                            : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                        }`}
                        aria-current={selected ? 'true' : undefined}
                      >
                        <span className="block truncate text-xs font-semibold">{deck.name}</span>
                        <span className="block truncate text-[10px] leading-4 text-slate-500">
                          {formatLabel(deck.deck_format)} · {cardCount} {cardCount === 1 ? 'card' : 'cards'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        {groupedDecks.length === 0 && (
          <p className="px-1 py-3 text-center text-[11px] text-slate-500">No decks yet</p>
        )}
      </div>
    </aside>
  );
}
