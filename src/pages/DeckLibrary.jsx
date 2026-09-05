import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Loader2, Plus, X } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { backend } from '@/services/backend';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { normalizeDeckGame } from '@/lib/deckSections';

const GAMES = [
  { id: 'magic', label: 'Magic: The Gathering', logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg', logoClass: 'brightness-0 invert opacity-85', formats: ['commander', 'standard', 'modern', 'pioneer', 'legacy', 'pauper', 'casual'], editorReady: true },
  { id: 'pokemon', label: 'Pokémon', logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg', logoClass: 'opacity-90', formats: ['standard', 'expanded', 'unlimited', 'gym_leader_challenge', 'casual'] },
  { id: 'yugioh', label: 'Yu-Gi-Oh!', logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png', logoClass: 'opacity-90', formats: ['advanced', 'traditional', 'goat', 'edison', 'casual'] },
  { id: 'lorcana', label: 'Disney Lorcana', logoSrc: '/images/disney-lorcana-logo.png', logoClass: 'opacity-90', formats: ['core_constructed', 'infinity_constructed', 'casual'] },
  { id: 'flesh_and_blood', label: 'Flesh and Blood', logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024', logoClass: 'opacity-90', formats: ['classic_constructed', 'blitz', 'commoner', 'living_legend', 'casual'] },
  { id: 'onepiece', label: 'One Piece', logoSrc: '/images/oplogo.webp', logoClass: 'brightness-0 invert opacity-80', formats: ['standard', 'block_constructed', 'casual'] },
  { id: 'starwars', label: 'Star Wars Unlimited', logoSrc: '/images/star-wars-unlimited-logo.png', logoClass: 'brightness-0 invert opacity-80', formats: ['premier', 'twin_suns', 'casual'] },
];

function formatLabel(value) {
  return String(value || 'casual')
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function getDeckCount(deck) {
  return (deck?.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

function getDeckArtwork(deck) {
  const items = deck?.items || [];
  const isCommander = String(deck?.deck_format || '').toLowerCase() === 'commander';
  const commanderName = String(deck?.commander_name || '').trim().toLowerCase();
  const commander = isCommander
    ? items.find((item) => item.is_commander)
      || items.find((item) => commanderName && String(item.product_name || item.name || '').trim().toLowerCase() === commanderName)
    : null;
  const representative = commander || items.find((item) => getCardImageUrl(item));
  return representative ? getCardImageUrl(representative) : '';
}

function getDeckStatus(deck) {
  const explicitStatus = deck?.legality_status || deck?.validation_status;
  return explicitStatus ? formatLabel(explicitStatus) : '';
}

function DeckEntry({ deck, game, onOpen }) {
  const artwork = getDeckArtwork(deck);
  const artworkCard = (deck.items || []).find((item) => getCardImageUrl(item));
  const status = getDeckStatus(deck);
  return (
    <article className="group grid min-h-[68px] grid-cols-[92px_minmax(0,1fr)_auto] overflow-hidden bg-white/[0.018] transition-colors hover:bg-white/[0.04]">
      <div className="relative bg-[#08111d]">
        {artwork ? <img src={artwork} alt="" className="absolute inset-0 h-full w-full object-cover object-[center_24%]" onError={(event) => handleCardImageError(event, artworkCard || {})} /> : <div className="absolute inset-0 bg-[#132033]" />}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0d1724]/45" />
      </div>
      <div className="min-w-0 px-2.5 py-2">
        <h3 className="truncate text-[13px] font-semibold leading-5 text-white">{deck.name}</h3>
        <p className="text-[10px] leading-4 text-slate-400">{formatLabel(deck.deck_format)} · {getDeckCount(deck)} cards</p>
        {status && <p className="text-[9px] font-semibold uppercase leading-4 tracking-wide text-slate-500">{status}</p>}
      </div>
      <button type="button" onClick={() => onOpen(deck, game)} className="mx-2 inline-flex h-7 items-center gap-1 self-center px-1.5 text-[10px] font-semibold text-slate-300 transition-colors hover:text-white">
        Open <ArrowRight size={13} aria-hidden="true" />
      </button>
    </article>
  );
}

export default function DeckLibrary() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [createGame, setCreateGame] = useState(null);
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckFormat, setNewDeckFormat] = useState('casual');

  useEffect(() => {
    let active = true;
    backend.auth.isAuthenticated()
      .then(async (isAuthenticated) => isAuthenticated ? backend.auth.getCurrentUser() : null)
      .then((currentUser) => { if (active) setUser(currentUser); })
      .catch((error) => {
        console.error('Failed to load deck library session:', error);
        if (active) setUser(null);
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const { data: decks = [], isLoading: loadingDecks } = useQuery({
    queryKey: ['cardlists', user?.email],
    queryFn: () => backend.data.CardList.filter({ user_email: user.email }),
    enabled: !!user?.email,
  });

  const groupedDecks = useMemo(() => Object.fromEntries(
    GAMES.map((game) => [game.id, decks.filter((deck) => normalizeDeckGame(deck.game) === game.id)])
  ), [decks]);

  const selectedDeck = decks.find((deck) => deck.id === searchParams.get('deck'));
  const selectedGame = selectedDeck ? GAMES.find((game) => game.id === normalizeDeckGame(selectedDeck.game)) : null;

  const createDeckMutation = useMutation({
    mutationFn: ({ game, name, format }) => backend.data.CardList.create({ user_email: user.email, name, description: `${game.label} deck`, game: game.id, deck_format: format, items: [], estimated_cost: 0 }),
    onSuccess: async (deck, variables) => {
      await queryClient.invalidateQueries({ queryKey: ['cardlists', user?.email] });
      setCreateGame(null);
      setNewDeckName('');
      toast.success('Deck created');
      if (variables.game.editorReady) navigate(`/AdvancedDeckBuilder?deck=${encodeURIComponent(deck.id)}`);
      else setSearchParams({ deck: deck.id });
    },
    onError: (error) => toast.error(error?.message || 'Deck creation failed'),
  });

  const beginCreate = (game) => {
    setCreateGame(game);
    setNewDeckName('');
    setNewDeckFormat(game.formats[0]);
  };

  const openDeck = (deck, game) => {
    if (game.editorReady) navigate(`/AdvancedDeckBuilder?deck=${encodeURIComponent(deck.id)}`);
    else setSearchParams({ deck: deck.id });
  };

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center bg-[#07111d]"><Loader2 className="h-7 w-7 animate-spin text-cyan-300" /></div>;

  if (!user) {
    return (
      <div className="flex min-h-[65vh] items-center justify-center bg-[#07111d] px-4 text-center text-white">
        <div><h1 className="text-2xl font-semibold">Sign in to view your deck library</h1><button type="button" onClick={() => backend.auth.redirectToLogin(window.location.href)} className="mt-5 bg-cyan-600 px-5 py-2 text-sm font-semibold hover:bg-cyan-500" style={{ borderRadius: 3 }}>Sign In</button></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#07111d] text-white">
      <section className="relative h-[148px] overflow-hidden border-b border-slate-700/70 bg-[#06101d]">
        <img src="/images/home-tools/deck-builder-blue-wave.png" alt="" className="absolute inset-0 h-full w-full object-cover object-center opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050c16] via-[#07111d]/88 to-[#07111d]/15" />
        <div className="relative mx-auto flex h-full max-w-[1680px] flex-col justify-center px-5 lg:px-8"><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Deck Builder</h1><p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100/70 sm:text-sm">Build · Test · Manage</p></div>
      </section>

      <main className="mx-auto max-w-[1680px] px-5 py-5 lg:px-8">
        <div className="mb-3 flex items-end justify-between gap-4 border-b border-slate-700/60 pb-2.5"><h2 className="text-lg font-semibold">Your Deck Library</h2><span className="text-[11px] text-slate-500">{decks.length} saved {decks.length === 1 ? 'deck' : 'decks'}</span></div>

        {loadingDecks ? <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-cyan-300" /></div> : (
          <div className="grid items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {GAMES.map((game) => (
              <section key={game.id} className="min-w-0">
                <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-slate-700/50 px-1 py-2">
                  <div className="flex min-w-0 items-center gap-2.5"><div className="flex h-8 w-20 shrink-0 items-center"><img src={game.logoSrc} alt="" className={`max-h-7 max-w-20 object-contain object-left ${game.logoClass}`} /></div><h3 className="truncate text-xs font-semibold text-slate-100">{game.label}</h3></div>
                  <button type="button" onClick={() => beginCreate(game)} className="inline-flex h-7 shrink-0 items-center gap-1 px-1.5 text-[9px] font-semibold text-slate-300 hover:bg-slate-700/40 hover:text-white"><Plus size={11} /> New Deck</button>
                </div>
                {groupedDecks[game.id]?.length ? <div className="divide-y divide-slate-700/35">{groupedDecks[game.id].map((deck) => <DeckEntry key={deck.id} deck={deck} game={game} onOpen={openDeck} />)}</div> : <div className="flex min-h-[68px] items-center px-1 text-[11px] text-slate-500">No saved decks for this game.</div>}
              </section>
            ))}
          </div>
        )}
      </main>

      {createGame && (
        <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/75 p-4" onClick={() => setCreateGame(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-deck-title" className="w-full max-w-sm border border-slate-600 bg-[#0b1523] p-4 shadow-2xl" style={{ borderRadius: 4 }} onClick={(event) => event.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-wide text-slate-500">{createGame.label}</p><h2 id="new-deck-title" className="text-lg font-semibold">New Deck</h2></div><button type="button" onClick={() => setCreateGame(null)} aria-label="Close new deck" className="text-slate-400 hover:text-white"><X size={16} /></button></div>
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Deck name</label><input autoFocus value={newDeckName} onChange={(event) => setNewDeckName(event.target.value)} className="mt-1 h-10 w-full border border-slate-600 bg-[#07111d] px-3 text-sm text-white outline-none focus:border-cyan-600" style={{ borderRadius: 3 }} placeholder="Deck name" />
            <label className="mt-4 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">Format</label><select value={newDeckFormat} onChange={(event) => setNewDeckFormat(event.target.value)} className="mt-1 h-10 w-full border border-slate-600 bg-[#07111d] px-3 text-sm text-white outline-none focus:border-cyan-600" style={{ borderRadius: 3 }}>{createGame.formats.map((format) => <option key={format} value={format}>{formatLabel(format)}</option>)}</select>
            {!createGame.editorReady && <p className="mt-3 text-[11px] leading-5 text-amber-200/80">This creates a private saved deck shell. The full {createGame.label} editor is not available yet.</p>}
            <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setCreateGame(null)} className="h-9 px-3 text-xs font-semibold text-slate-400 hover:text-white">Cancel</button><button type="button" disabled={!newDeckName.trim() || createDeckMutation.isPending} onClick={() => createDeckMutation.mutate({ game: createGame, name: newDeckName.trim(), format: newDeckFormat })} className="h-9 bg-cyan-600 px-4 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-45" style={{ borderRadius: 3 }}>{createDeckMutation.isPending ? 'Creating…' : 'Create Deck'}</button></div>
          </div>
        </div>
      )}

      {selectedDeck && selectedGame && !selectedGame.editorReady && (
        <div className="fixed inset-0 z-[310] flex items-center justify-center bg-black/70 p-4" onClick={() => setSearchParams({})}>
          <div role="dialog" aria-modal="true" aria-labelledby="saved-shell-title" className="w-full max-w-lg overflow-hidden border border-slate-600 bg-[#0b1523] shadow-2xl" style={{ borderRadius: 4 }} onClick={(event) => event.stopPropagation()}>
            <div className="grid grid-cols-[112px_minmax(0,1fr)]"><div className="relative min-h-44 bg-[#07111d]">{getDeckArtwork(selectedDeck) && <img src={getDeckArtwork(selectedDeck)} alt="" className="absolute inset-0 h-full w-full object-cover" />}</div><div className="p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] uppercase tracking-wide text-slate-500">{selectedGame.label}</p><h2 id="saved-shell-title" className="mt-1 text-lg font-semibold">{selectedDeck.name}</h2></div><button type="button" onClick={() => setSearchParams({})} aria-label="Close saved deck" className="text-slate-400 hover:text-white"><X size={16} /></button></div><p className="mt-3 text-xs text-slate-300">{formatLabel(selectedDeck.deck_format)} · {getDeckCount(selectedDeck)} cards</p><p className="mt-4 text-[11px] leading-5 text-slate-400">This deck is saved to your account. The full {selectedGame.label} editor is not available yet.</p></div></div>
          </div>
        </div>
      )}

    </div>
  );
}
