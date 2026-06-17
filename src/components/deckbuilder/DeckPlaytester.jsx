import React, { useState, useRef } from 'react';
import { X, RefreshCw, RotateCcw, Trash2, ArrowUp } from 'lucide-react';
import useGameState from '@/components/hooks/useGameState';

const CARD_W = 100;
const CARD_H = 140;

const MTG_CARD_BACK = 'https://upload.wikimedia.org/wikipedia/en/a/aa/Magic_the_gathering-card_back.jpg';

// ── Card image ────────────────────────────────────────────────────────────────
function CardImage({ card, className = '', style = {}, onClick, onContextMenu, onMouseEnter, onMouseLeave, onDragStart, draggable, tapped }) {
  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer select-none flex-shrink-0 ${className}`}
      style={{
        width: CARD_W,
        height: CARD_H,
        transition: 'transform 0.15s',
        transform: tapped ? 'rotate(90deg)' : 'rotate(0deg)',
        ...style,
      }}
      draggable={draggable}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onDragStart={onDragStart}
    >
      {card.product_image
        ? <img src={card.product_image} alt={card.product_name} className="w-full h-full object-cover" draggable={false} />
        : (
          <div className="w-full h-full bg-slate-700 flex items-center justify-center p-2 border border-slate-500">
            <span className="text-white text-xs text-center leading-tight font-medium">{card.product_name}</span>
          </div>
        )
      }
    </div>
  );
}

// ── Hover preview ─────────────────────────────────────────────────────────────
function HoverPreview({ card, x, y }) {
  if (!card) return null;
  return (
    <div className="fixed z-[200] pointer-events-none" style={{ left: x, top: y }}>
      <div className="rounded-xl border-2 border-cyan-400 overflow-hidden shadow-2xl" style={{ width: 240, height: 336 }}>
        {card.product_image
          ? <img src={card.product_image} alt={card.product_name} className="w-full h-full object-cover" />
          : (
            <div className="w-full h-full bg-slate-800 flex items-center justify-center p-4 text-center">
              <span className="text-white text-base font-medium">{card.product_name}</span>
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Context menu for battlefield cards ────────────────────────────────────────
function CardContextMenu({ card, x, y, onClose, onTap, onGraveyard, onExile, onReturnToHand }) {
  const style = { left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 200) };
  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[160] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[160px]" style={style}>
        <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-600 truncate">{card.product_name}</div>
        <button onClick={onTap} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 flex items-center gap-2">
          <RotateCcw className="w-3.5 h-3.5" /> {card.tapped ? 'Untap' : 'Tap'}
        </button>
        <button onClick={onReturnToHand} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-slate-700 flex items-center gap-2">
          <ArrowUp className="w-3.5 h-3.5" /> Return to Hand
        </button>
        <button onClick={onGraveyard} className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-slate-700 flex items-center gap-2">
          <Trash2 className="w-3.5 h-3.5" /> Send to Graveyard
        </button>
        <button onClick={onExile} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700 flex items-center gap-2">
          <X className="w-3.5 h-3.5" /> Exile
        </button>
      </div>
    </>
  );
}

// ── Hand context menu ─────────────────────────────────────────────────────────
function HandContextMenu({ card, x, y, onClose, onPlay, onDiscard, onExile }) {
  const style = { left: Math.min(x, window.innerWidth - 180), top: Math.min(y, window.innerHeight - 160) };
  return (
    <>
      <div className="fixed inset-0 z-[150]" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} />
      <div className="fixed z-[160] bg-slate-800 border border-slate-600 rounded-lg shadow-2xl py-1 min-w-[160px]" style={style}>
        <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-600 truncate">{card.product_name}</div>
        <button onClick={onPlay} className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-slate-700 font-medium flex items-center gap-2">
          ▶ Play to Battlefield
        </button>
        <button onClick={onDiscard} className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-slate-700">
          Discard
        </button>
        <button onClick={onExile} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-slate-700">
          Exile
        </button>
      </div>
    </>
  );
}

// ── Zone pile (library / graveyard / exile) ───────────────────────────────────
function ZonePile({ label, count, onClick, showBack = false, topCard = null, color = 'text-slate-300' }) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col items-center gap-1 group"
    >
      <div
        className="relative rounded-lg overflow-hidden border-2 border-slate-600 group-hover:border-cyan-400 transition-colors shadow-lg"
        style={{ width: 70, height: 98 }}
      >
        {count > 0 ? (
          showBack ? (
            <img src={MTG_CARD_BACK} alt="Library" className="w-full h-full object-cover" />
          ) : topCard?.product_image ? (
            <img src={topCard.product_image} alt={topCard.product_name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-slate-700 flex items-center justify-center">
              <span className="text-slate-400 text-xs text-center px-1">{topCard?.product_name || '...'}</span>
            </div>
          )
        ) : (
          <div className="w-full h-full bg-slate-800/60 flex items-center justify-center border border-dashed border-slate-600">
            <span className="text-slate-600 text-xs">Empty</span>
          </div>
        )}
        {count > 1 && (
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs font-bold px-1 rounded">
            {count}
          </div>
        )}
      </div>
      <span className={`text-xs font-medium ${color}`}>{label}</span>
    </button>
  );
}

// ── Zone viewer modal ─────────────────────────────────────────────────────────
function ZoneViewer({ title, cards, onClose, onReturnToHand }) {
  return (
    <div className="fixed inset-0 z-[180] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-600 rounded-xl p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-bold text-lg">{title} ({cards.length})</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {cards.length === 0
          ? <p className="text-slate-500 text-sm italic text-center py-8">Empty</p>
          : (
            <div className="flex flex-wrap gap-3">
              {cards.map((card, idx) => (
                <div key={idx} className="flex flex-col items-center gap-1">
                  <CardImage card={card} className="border border-slate-600 hover:border-cyan-400" />
                  {onReturnToHand && (
                    <button onClick={() => onReturnToHand(idx)} className="text-xs text-cyan-400 hover:text-cyan-300">
                      ↩ Hand
                    </button>
                  )}
                </div>
              ))}
            </div>
          )
        }
      </div>
    </div>
  );
}

// ── Mulligan screen ───────────────────────────────────────────────────────────
function MulliganScreen({ hand, mulliganCount, library, onKeep, onMulligan, onPutBack, putBackMode, putBackRemaining }) {
  if (putBackMode) {
    return (
      <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-yellow-500/40 rounded-xl p-8 max-w-5xl w-full">
          <h2 className="text-2xl font-bold text-white mb-1 text-center">Put Back {putBackRemaining} Card{putBackRemaining > 1 ? 's' : ''}</h2>
          <p className="text-slate-400 text-center mb-6 text-sm">Click a card to put it on the bottom of your library</p>
          <div className="flex justify-center gap-3 flex-wrap mb-4">
            {hand.map((card, idx) => (
              <div key={idx} onClick={() => onPutBack(idx)}
                className="rounded-lg border-2 border-yellow-500/60 overflow-hidden cursor-pointer hover:border-yellow-300 hover:-translate-y-2 transition-all"
                style={{ width: CARD_W * 1.5, height: CARD_H * 1.5 }}>
                {card.product_image
                  ? <img src={card.product_image} alt={card.product_name} className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-slate-800 flex items-center justify-center p-2"><span className="text-white text-xs text-center">{card.product_name}</span></div>
                }
              </div>
            ))}
          </div>
          <p className="text-yellow-400 text-xs text-center">{putBackRemaining} card{putBackRemaining > 1 ? 's' : ''} remaining</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/95 z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-cyan-500/40 rounded-xl p-8 max-w-5xl w-full">
        <h2 className="text-2xl font-bold text-white mb-1 text-center">Opening Hand</h2>
        <p className="text-slate-400 text-center mb-1 text-sm">
          {mulliganCount === 0 ? '7 cards — Keep or Mulligan?' : `Mulligan #${mulliganCount} — keeping requires putting back ${mulliganCount} card${mulliganCount > 1 ? 's' : ''}`}
        </p>
        <p className="text-slate-500 text-xs text-center mb-6">{library.length} cards in library</p>
        <div className="flex justify-center gap-4 flex-wrap mb-8">
          {hand.map((card, idx) => (
            <div key={idx} className="rounded-lg border border-slate-600 overflow-hidden flex-shrink-0"
              style={{ width: CARD_W * 1.5, height: CARD_H * 1.5 }}>
              {card.product_image
                ? <img src={card.product_image} alt={card.product_name} className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-slate-800 flex items-center justify-center p-2"><span className="text-white text-xs text-center">{card.product_name}</span></div>
              }
            </div>
          ))}
        </div>
        <div className="flex justify-center gap-4">
          <button onClick={onKeep} className="bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-3 rounded-lg text-lg transition-colors">
            Keep Hand {mulliganCount > 0 ? `(${7 - mulliganCount} cards)` : ''}
          </button>
          {mulliganCount < 6 && (
            <button onClick={onMulligan} className="bg-slate-600 hover:bg-slate-500 text-white font-semibold px-8 py-3 rounded-lg text-lg transition-colors">
              Mulligan → {6 - mulliganCount} cards
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Playtester ───────────────────────────────────────────────────────────
export default function DeckPlaytester({ deck, onClose }) {
  const g = useGameState(deck);

  // Mulligan state
  const [mulliganDone, setMulliganDone] = useState(false);
  const [mulliganCount, setMulliganCount] = useState(0);
  const [putBackMode, setPutBackMode] = useState(false);
  const [putBackRemaining, setPutBackRemaining] = useState(0);

  // UI state
  const [hover, setHover] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [graveyardOpen, setGraveyardOpen] = useState(false);
  const [exileOpen, setExileOpen] = useState(false);
  const [dragOverBattlefield, setDragOverBattlefield] = useState(false);

  const draggingCard = useRef(null);

  const handleHover = (e, card) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const previewW = 240;
    const previewH = 336;
    const left = rect.right + 12 + previewW < window.innerWidth
      ? rect.right + 12
      : rect.left - previewW - 12;
    const top = Math.max(10, Math.min(rect.top, window.innerHeight - previewH - 10));
    setHover({ card, x: left, y: top });
  };
  const clearHover = () => setHover(null);

  const openContextMenu = (e, type, card) => {
    e.preventDefault();
    e.stopPropagation();
    clearHover();
    setContextMenu({ type, card, x: e.clientX, y: e.clientY });
  };
  const closeContextMenu = () => setContextMenu(null);

  const handleDragStart = (e, card) => {
    draggingCard.current = card.uniqueId;
    e.dataTransfer.effectAllowed = 'move';
    clearHover();
  };

  const handleBattlefieldDrop = (e) => {
    e.preventDefault();
    setDragOverBattlefield(false);
    if (draggingCard.current) {
      g.playFromHand(draggingCard.current);
      draggingCard.current = null;
    }
  };

  // ── Mulligan handlers ──
  const handleKeep = () => {
    if (mulliganCount === 0) {
      setMulliganDone(true);
    } else {
      setPutBackRemaining(mulliganCount);
      setPutBackMode(true);
    }
  };

  const handleMulligan = () => {
    const newCount = mulliganCount + 1;
    setMulliganCount(newCount);
    const all = [...g.hand, ...g.library];
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    g.setHand(all.slice(0, 7));
    g.setLibrary(all.slice(7));
  };

  const handlePutBack = (idx) => {
    const card = g.hand[idx];
    g.setHand(g.hand.filter((_, i) => i !== idx));
    g.setLibrary(prev => [...prev, card]);
    const remaining = putBackRemaining - 1;
    setPutBackRemaining(remaining);
    if (remaining === 0) {
      setPutBackMode(false);
      setMulliganDone(true);
    }
  };

  if (!mulliganDone && g.hand.length > 0) {
    return (
      <div className="fixed inset-0 z-50">
        <MulliganScreen
          hand={g.hand}
          library={g.library}
          mulliganCount={mulliganCount}
          onKeep={handleKeep}
          onMulligan={handleMulligan}
          onPutBack={handlePutBack}
          putBackMode={putBackMode}
          putBackRemaining={putBackRemaining}
        />
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{
        background: 'radial-gradient(ellipse at center, #1a3a1a 0%, #0d1f0d 60%, #080f08 100%)',
        fontFamily: 'Georgia, serif',
      }}
    >
      {/* felt texture overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='4' height='4' viewBox='0 0 4 4' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 3h1v1H1V3zm2-2h1v1H3V1z' fill='%23ffffff' fill-opacity='0.4'/%3E%3C/svg%3E")`,
        }}
      />

      {/* TOP BAR */}
      <div className="relative flex-shrink-0 flex items-center justify-between px-4 py-2 bg-black/50 border-b border-white/10">
        <div className="flex items-center gap-3">
          <span className="text-white font-bold text-sm truncate max-w-[200px]">{deck.name}</span>
          <span className="text-slate-400 text-xs bg-white/5 px-2 py-0.5 rounded">Turn {g.turn}</span>
        </div>
        <span className="text-slate-500 text-xs hidden md:block">Click to tap · Right-click for options · Drag to battlefield</span>
        <div className="flex items-center gap-2">
          <button onClick={g.resetGame} className="text-slate-400 hover:text-white p-1.5 hover:bg-white/10 rounded" title="Reset game">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1.5 hover:bg-white/10 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* BATTLEFIELD + ZONES PANEL */}
      <div className="relative flex-1 flex overflow-hidden">

        {/* BATTLEFIELD */}
        <div
          className={`flex-1 p-4 overflow-y-auto transition-all ${dragOverBattlefield ? 'ring-2 ring-inset ring-cyan-400/60' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOverBattlefield(true); }}
          onDragLeave={() => setDragOverBattlefield(false)}
          onDrop={handleBattlefieldDrop}
        >
          {dragOverBattlefield && (
            <div className="absolute inset-0 bg-cyan-500/10 flex items-center justify-center z-10 pointer-events-none">
              <span className="text-cyan-300 text-xl font-bold opacity-80">Drop to Play</span>
            </div>
          )}
          <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">
            Battlefield ({g.battlefield.length})
          </p>
          <div className="flex flex-wrap gap-4 items-start content-start">
            {g.battlefield.length === 0
              ? <span className="text-slate-700 text-sm italic">Drag cards from your hand to play them</span>
              : g.battlefield.map((card) => (
                <div
                  key={card.instanceId}
                  style={{ marginTop: card.tapped ? CARD_W * 0.2 : 0, marginRight: card.tapped ? CARD_W * 0.2 : 0 }}
                >
                  <CardImage
                    card={card}
                    tapped={card.tapped}
                    className={`border-2 hover:border-cyan-400 shadow-lg ${card.tapped ? 'border-amber-600/70' : 'border-slate-700'}`}
                    onClick={() => g.tapCard(card.instanceId)}
                    onContextMenu={(e) => openContextMenu(e, 'battlefield', card)}
                    onMouseEnter={(e) => handleHover(e, card)}
                    onMouseLeave={clearHover}
                  />
                </div>
              ))
            }
          </div>
        </div>

        {/* RIGHT: Zones panel */}
        <div className="relative w-28 flex-shrink-0 flex flex-col items-center gap-4 p-3 bg-black/30 border-l border-white/10 overflow-y-auto">

          {/* Life total */}
          <div className="text-center">
            <div className="text-xs text-slate-500 mb-1">Life</div>
            <div className="text-3xl font-bold text-green-400">{g.playerLife}</div>
            <div className="flex flex-col gap-1 mt-1">
              <button onClick={() => g.setPlayerLife(l => l + 1)} className="w-10 h-7 bg-green-800 hover:bg-green-700 rounded text-white text-sm font-bold mx-auto block">+</button>
              <button onClick={() => g.setPlayerLife(l => Math.max(0, l - 1))} className="w-10 h-7 bg-red-900 hover:bg-red-800 rounded text-white text-sm font-bold mx-auto block">−</button>
            </div>
          </div>

          <div className="w-full border-t border-white/10" />

          {/* Library */}
          <ZonePile
            label={`Library (${g.library.length})`}
            count={g.library.length}
            showBack
            onClick={g.drawCard}
            color="text-cyan-400"
          />

          {/* Graveyard */}
          <ZonePile
            label={`Graveyard (${g.graveyard.length})`}
            count={g.graveyard.length}
            topCard={g.graveyard[g.graveyard.length - 1]}
            onClick={() => setGraveyardOpen(true)}
            color="text-slate-300"
          />

          {/* Exile */}
          <ZonePile
            label={`Exile (${g.exile.length})`}
            count={g.exile.length}
            topCard={g.exile[g.exile.length - 1]}
            onClick={() => setExileOpen(true)}
            color="text-orange-400"
          />
        </div>
      </div>

      {/* HAND AREA */}
      <div className="relative flex-shrink-0 bg-black/60 border-t border-white/10 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 uppercase tracking-widest">Hand ({g.hand.length})</p>
          <div className="flex items-center gap-2">
            <button onClick={g.drawCard} disabled={g.library.length === 0}
              className="text-xs bg-cyan-800 hover:bg-cyan-700 disabled:opacity-40 text-white px-3 py-1.5 rounded font-medium">
              Draw
            </button>
            <button onClick={g.nextTurn}
              className="text-xs bg-blue-700 hover:bg-blue-600 text-white px-3 py-1.5 rounded font-medium">
              Next Turn
            </button>
            <button onClick={g.untapAll}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded font-medium">
              Untap All
            </button>
            <button onClick={g.shuffleLibrary}
              className="text-xs bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded font-medium">
              Shuffle
            </button>
          </div>
        </div>

        {/* Fanned hand */}
        <div
          className="flex items-end overflow-x-auto pb-1"
          style={{ minHeight: CARD_H + 20, gap: g.hand.length > 8 ? 4 : 12 }}
        >
          {g.hand.length === 0
            ? <span className="text-slate-600 text-sm italic pb-4">No cards in hand</span>
            : g.hand.map((card, idx) => (
              <CardImage
                key={card.uniqueId}
                card={card}
                draggable
                className="border-2 border-slate-600 hover:border-cyan-400 hover:-translate-y-4 transition-all shadow-xl"
                style={{ zIndex: idx, flexShrink: 0 }}
                onDragStart={(e) => handleDragStart(e, card)}
                onClick={(e) => openContextMenu(e, 'hand', card)}
                onContextMenu={(e) => openContextMenu(e, 'hand', card)}
                onMouseEnter={(e) => handleHover(e, card)}
                onMouseLeave={clearHover}
              />
            ))
          }
        </div>
      </div>

      {/* Context menus */}
      {contextMenu?.type === 'battlefield' && (
        <CardContextMenu
          card={contextMenu.card}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onTap={() => { g.tapCard(contextMenu.card.instanceId); closeContextMenu(); }}
          onGraveyard={() => { g.sendToGraveyard(contextMenu.card.instanceId); closeContextMenu(); }}
          onExile={() => { g.sendToExile(contextMenu.card.instanceId); closeContextMenu(); }}
          onReturnToHand={() => { g.returnToHand(contextMenu.card.instanceId); closeContextMenu(); }}
        />
      )}

      {contextMenu?.type === 'hand' && (
        <HandContextMenu
          card={contextMenu.card}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={closeContextMenu}
          onPlay={() => { g.playFromHand(contextMenu.card.uniqueId); closeContextMenu(); }}
          onDiscard={() => { g.discardCard(contextMenu.card.uniqueId); closeContextMenu(); }}
          onExile={() => {
            g.setHand(prev => prev.filter(c => c.uniqueId !== contextMenu.card.uniqueId));
            g.setExile(prev => [...prev, contextMenu.card]);
            closeContextMenu();
          }}
        />
      )}

      {/* Zone viewers */}
      {graveyardOpen && (
        <ZoneViewer
          title="Graveyard"
          cards={g.graveyard}
          onClose={() => setGraveyardOpen(false)}
          onReturnToHand={(idx) => g.returnFromGraveyardToHand(idx)}
        />
      )}
      {exileOpen && (
        <ZoneViewer
          title="Exile"
          cards={g.exile}
          onClose={() => setExileOpen(false)}
        />
      )}

      {hover && <HoverPreview card={hover.card} x={hover.x} y={hover.y} />}
    </div>
  );
}