import React, { useEffect, useRef, useState } from 'react';
import CardStack from './CardStack';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { buildPackedColumns } from '@/lib/deckColumnLayout';
import { getDeckSectionOrder, groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';

function getFittedColumnCount(width) {
  const availableWidth = Math.max(0, width);
  for (let count = 5; count > 1; count -= 1) {
    const cardsWidth = count * 223;
    const gapsWidth = (count - 1) * 14;
    const activeRailAllowance = 66;
    if (cardsWidth + gapsWidth + activeRailAllowance <= availableWidth) return count;
  }
  return 1;
}

function CommanderStack({ commanderItem, onChangeSet }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ marginBottom: 3 }}>
        <span style={{ color: '#fbbf24', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Commander</span>
      </div>
      {commanderItem ? (
        <div style={{ position: 'relative', width: 223 }}>
          <div style={{ width: 223, height: 311, borderRadius: 8, overflow: 'hidden', border: '2px solid #fbbf24', boxShadow: '0 0 16px rgba(251,191,36,0.4)' }}>
            {getCardImageUrl(commanderItem)
              ? <img src={getCardImageUrl(commanderItem)} alt={commanderItem.product_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(event) => handleCardImageError(event, commanderItem)} />
              : <div style={{ width: '100%', height: '100%', background: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                  <span style={{ color: '#d1d5db', fontSize: 10, textAlign: 'center' }}>{commanderItem.product_name}</span>
                </div>
            }
          </div>
          {onChangeSet && (
            <button
              type="button"
              onClick={() => onChangeSet(commanderItem)}
              style={{
                width: 223,
                marginTop: 6,
                padding: '6px 10px',
                border: '1px solid #4b5563',
                borderRadius: 6,
                background: 'rgba(17,24,39,0.9)',
                color: '#ddd6fe',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Change Printing / Art
            </button>
          )}
        </div>
      ) : (
        <div style={{
          width: 223, height: 311, borderRadius: 8,
          border: '2px dashed #fbbf24', display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(251,191,36,0.05)', gap: 8
        }}>
          <span style={{ color: '#fbbf24', fontSize: 28 }}>C</span>
          <span style={{ color: '#9ca3af', fontSize: 11, textAlign: 'center', padding: '0 12px' }}>
            Add a legendary creature, then right-click to set as Commander
          </span>
        </div>
      )}
    </div>
  );
}

function estimateSectionHeight(section, groupedCards) {
  if (!section) return 0;

  if (section.type === 'commander') {
    return 380;
  }

  const cards = groupedCards[section.label] || [];
  const stackHeight = 313 + Math.max(cards.length - 1, 0) * 42;
  const priceBarAllowance = cards.length > 0 ? 34 : 0;
  const headerAllowance = 20;
  const sectionGapAllowance = 8;

  return stackHeight + priceBarAllowance + headerAllowance + sectionGapAllowance;
}

export default function DeckStackView({
  deck,
  game,
  isCommanderFormat,
  onChangeQty,
  onRemove,
  onChangeSet,
  onSetCommander,
  storeProducts
}) {
  const canvasRef = useRef(null);
  const [targetColumnCount, setTargetColumnCount] = useState(() => getFittedColumnCount(window.innerWidth - 176));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const updateColumnCount = (width) => setTargetColumnCount(getFittedColumnCount(width));
    const observer = new ResizeObserver((entries) => updateColumnCount(entries[0]?.contentRect?.width || 0));
    updateColumnCount(canvas.getBoundingClientRect().width);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const commanderItem = isCommanderFormat ? deck?.items?.find(i => i.is_commander) : null;
  const nonCommanderItems = isCommanderFormat
    ? (deck?.items || []).filter(i => !i.is_commander)
    : (deck?.items || []);

  const normalizedGame = normalizeDeckGame(game);
  const deckGroups = groupDeckItems(nonCommanderItems, normalizedGame);
  const groupedCards = Object.fromEntries(deckGroups.map((group) => [group.label, group.items]));
  const stackSectionHeight = (section) => estimateSectionHeight(section, groupedCards);
  const orderedTypes = getDeckSectionOrder(normalizedGame).filter((label) => label !== 'Commander' && label !== 'Other');
  const stackColumns = (() => {
    const makeStack = (type) => groupedCards[type]?.length ? { type: 'stack', label: type } : null;
    const commanderSection = isCommanderFormat ? { type: 'commander', anchorColumn: 0 } : null;

    if (normalizedGame === 'magic') {
      const orderedSections = [
        commanderSection,
        makeStack('Creatures'),
        makeStack('Instants'),
        makeStack('Sorceries'),
        makeStack('Artifacts'),
        makeStack('Enchantments'),
        makeStack('Planeswalkers'),
        makeStack('Battles'),
        makeStack('Lands'),
        makeStack('Other'),
      ].filter(Boolean);

      const usedLabels = new Set(['Artifacts', 'Enchantments', 'Planeswalkers', 'Battles', 'Lands', 'Creatures', 'Instants', 'Sorceries', 'Other']);
      const remainingStacks = Object.keys(groupedCards)
        .filter((type) => !usedLabels.has(type))
        .map((type) => ({ type: 'stack', label: type }));

      return buildPackedColumns([...orderedSections, ...remainingStacks], stackSectionHeight, targetColumnCount);
    }

    const primaryTypes = orderedTypes.slice(0, 3);
    const utilityTypes = orderedTypes.slice(3);
    const usedLabels = new Set(orderedTypes);
    const orderedSections = [
      commanderSection,
      ...primaryTypes.map(makeStack),
      ...utilityTypes.map(makeStack),
    ].filter(Boolean);
    const remainingStacks = Object.keys(groupedCards)
      .filter((type) => !usedLabels.has(type))
      .map((type) => ({ type: 'stack', label: type }));

    return buildPackedColumns([...orderedSections, ...remainingStacks], stackSectionHeight, Math.min(4, targetColumnCount));
  })();

  return (
    <div ref={canvasRef} className="flex-1 overflow-auto px-1 py-3">
      <div
        className="grid items-start"
        style={{
          gridTemplateColumns: `repeat(${stackColumns.length}, minmax(223px, max-content))`,
          columnGap: 14,
        }}
      >
        {stackColumns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex min-w-0 flex-col gap-2">
            {column.map((section) => {
              if (section.type === 'commander') {
                return <CommanderStack key="commander" commanderItem={commanderItem} onChangeSet={onChangeSet} />;
              }

              return (
                <CardStack
                  key={section.label}
                  type={section.label}
                  cards={groupedCards[section.label]}
                  onChangeQty={onChangeQty}
                  onRemove={onRemove}
                  onChangeSet={onChangeSet}
                  onSetCommander={onSetCommander}
                  storeProducts={storeProducts}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
