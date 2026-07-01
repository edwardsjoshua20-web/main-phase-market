import React, { useState, useRef } from 'react';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

const CARD_WIDTH = 223;
const CARD_HEIGHT = 311;
const PEEK = 42;
const CONTROLS_WIDTH = 48;

function PriceBar({ item, storeProducts }) {
  const price = item.price;
  const hasPrice = price !== null && price !== undefined && price > 0;

  // Look up actual store inventory by card name (case-insensitive, partial match)
  const cardName = item.product_name?.toLowerCase().trim() || '';
  const storeMatch = storeProducts?.find(p => {
    const storeName = p.name?.toLowerCase().trim() || '';
    if (!storeName || !cardName || p.quantity <= 0) return false;
    return storeName === cardName || storeName.includes(cardName) || cardName.includes(storeName);
  });
  const inStock = !!storeMatch;
  const storePrice = storeMatch?.price;

  return (
    <div style={{
      width: CARD_WIDTH,
      marginTop: 6,
      background: 'rgba(17,24,39,0.85)',
      borderRadius: 6,
      padding: '5px 8px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 6,
      border: '1px solid #374151',
    }}>
      <span style={{ color: hasPrice ? '#34d399' : '#6b7280', fontSize: 11, fontWeight: 700 }}>
        {storePrice ? `Store: $${storePrice.toFixed(2)}` : hasPrice ? `Mkt: $${price.toFixed(2)}` : 'N/A'}
      </span>
      <span style={{
        fontSize: 9,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        color: inStock ? '#86efac' : '#f87171',
        background: inStock ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
        borderRadius: 4,
        padding: '2px 5px',
      }}>
        {inStock ? 'In Stock' : 'Not in Store'}
      </span>
    </div>
  );
}

export default function CardStack({ type, cards, onChangeQty, onRemove, onChangeSet, onSetCommander, storeProducts }) {
  const [activeIdx, setActiveIdx] = useState(null);
  const closeTimerRef = useRef(null);

  const totalQty = cards.reduce((s, c) => s + (c.quantity || 1), 0);
  const stackHeight = CARD_HEIGHT + (cards.length - 1) * PEEK + 8;

  const open = (idx) => {
    clearTimeout(closeTimerRef.current);
    setActiveIdx(idx);
  };

  const scheduleClose = () => {
    clearTimeout(closeTimerRef.current);
    closeTimerRef.current = setTimeout(() => setActiveIdx(null), 300);
  };

  const cancelClose = () => clearTimeout(closeTimerRef.current);

  // Width the stack occupies: collapsed = just the card, expanded = card + controls
  const stackWidth = activeIdx !== null ? CARD_WIDTH + CONTROLS_WIDTH + 18 : CARD_WIDTH;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: stackWidth, transition: 'width 0.22s ease', flexShrink: 0 }}>
      <div style={{ marginBottom: 8 }}>
        <span style={{ color: '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{type}</span>
        <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 8 }}>({totalQty})</span>
      </div>

      <div style={{ position: 'relative', height: stackHeight, width: '100%' }}>
        {cards.map((item, idx) => {
          const isActive = activeIdx === idx;
          const top = idx * PEEK;

          return (
            <div
              key={item.product_id}
              style={{
                position: 'absolute',
                top,
                left: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                zIndex: isActive ? 100 : idx + 1,
              }}
              onMouseLeave={scheduleClose}
              onMouseEnter={isActive ? cancelClose : undefined}
            >
              {/* Card visual + price bar */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  onMouseEnter={() => !isActive && open(idx)}
                  style={{
                    width: CARD_WIDTH,
                    height: CARD_HEIGHT,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: isActive ? '2px solid #60a5fa' : '2px solid #374151',
                    boxShadow: isActive ? '0 8px 24px rgba(0,0,0,0.6)' : '0 2px 8px rgba(0,0,0,0.4)',
                    cursor: 'pointer',
                    flexShrink: 0,
                    position: 'relative',
                  }}
                >
                  {getCardImageUrl(item) ? (
                    <img
                      src={getCardImageUrl(item)}
                      alt={item.product_name}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      draggable={false}
                      onError={(event) => handleCardImageError(event, item)}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                      <span style={{ color: '#d1d5db', fontSize: 10, textAlign: 'center', lineHeight: 1.3 }}>{item.product_name}</span>
                    </div>
                  )}

                  {/* Quantity badge */}
                  <div style={{
                    position: 'absolute', top: 3, left: 3,
                    background: '#2563eb', color: '#fff',
                    borderRadius: '50%', width: 17, height: 17,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                    pointerEvents: 'none',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
                  }}>
                    {item.quantity || 1}
                  </div>
                </div>
                {/* Price bar — only visible on the active (top) card */}
                {isActive && <PriceBar item={item} storeProducts={storeProducts} />}
              </div>

              {/* Controls — slide in next to card when active */}
              {isActive && (
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  background: 'rgba(17,24,39,0.9)',
                  borderRadius: 8,
                  padding: 6,
                  flexShrink: 0,
                }}>
                  <button onClick={e => { e.stopPropagation(); onChangeQty(item.product_id, (item.quantity || 1) + 1); }}
                    style={{ width: 32, height: 32, background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                  <div style={{ width: 32, height: 32, background: '#4b5563', color: '#fff', borderRadius: 6, fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {item.quantity || 1}
                  </div>
                  <button onClick={e => { e.stopPropagation(); onChangeQty(item.product_id, (item.quantity || 1) - 1); }}
                    style={{ width: 32, height: 32, background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  {onChangeSet && (
                    <button onClick={e => { e.stopPropagation(); onChangeSet(item); }}
                      style={{ width: 32, height: 32, background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 8, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                      title="Change Set">Set</button>
                  )}
                  {onSetCommander && (
                    <button onClick={e => { e.stopPropagation(); onSetCommander(item); }}
                      style={{ width: 32, height: 32, background: '#92400e', color: '#fbbf24', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
                      title="Set as Commander">👑</button>
                  )}
                  <button onClick={e => { e.stopPropagation(); onRemove(item.product_id); }}
                    style={{ width: 32, height: 32, background: '#374151', color: '#9ca3af', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 2 }}
                    title="Remove">✕</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
