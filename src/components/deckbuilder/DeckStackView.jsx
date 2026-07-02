import React from 'react';
import CardStack from './CardStack';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { buildPackedColumns } from '@/lib/deckColumnLayout';
import { getDeckSectionOrder, groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';

function CommanderStack({ commanderItem }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
      <div style={{ marginBottom: 8 }}>
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
  const stackHeight = 311 + Math.max(cards.length - 1, 0) * 42;
  const priceBarAllowance = cards.length > 0 ? 36 : 0;
  const headerAllowance = 36;
  const sectionGapAllowance = 24;

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

      return buildPackedColumns([...orderedSections, ...remainingStacks], stackSectionHeight, 5);
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

    return buildPackedColumns([...orderedSections, ...remainingStacks], stackSectionHeight, 4);
  })();

  return (
    <div className="flex-1 px-6 py-6 overflow-auto">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(260px,300px))] items-start gap-5">
        {stackColumns.map((column, columnIndex) => (
          <div key={columnIndex} className="flex min-w-0 flex-col gap-6">
            {column.map((section) => {
              if (section.type === 'commander') {
                return <CommanderStack key="commander" commanderItem={commanderItem} />;
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
