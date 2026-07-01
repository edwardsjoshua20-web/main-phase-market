import React from 'react';
import CardStack from './CardStack';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';

const cardTypeCategories = {
  magic: ['Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Planeswalkers', 'Battles', 'Lands'],
  pokemon: ['Pokemon', 'Trainer', 'Energy'],
  yugioh: ['Monsters', 'Spells', 'Traps'],
  lorcana: ['Characters', 'Actions', 'Songs', 'Items', 'Locations'],
  onepiece: ['Leader', 'Characters', 'Events', 'Stages', 'DON!!'],
  flesh_and_blood: ['Hero', 'Weapon', 'Equipment', 'Actions', 'Instants', 'Allies'],
  starwars: ['Leader', 'Base', 'Units', 'Events', 'Upgrades']
};

const getCardType = (cardTypeString, game) => {
  if (!cardTypeString) return 'Other';
  const frontFace = cardTypeString.split('//')[0];
  const t = frontFace.toLowerCase();

  if (game === 'magic') {
    if (t.includes('land')) return 'Lands';
    if (t.includes('creature')) return 'Creatures';
    if (t.includes('planeswalker')) return 'Planeswalkers';
    if (t.includes('battle')) return 'Battles';
    if (t.includes('instant')) return 'Instants';
    if (t.includes('sorcery')) return 'Sorceries';
    if (t.includes('enchantment')) return 'Enchantments';
    if (t.includes('artifact')) return 'Artifacts';
  } else if (game === 'pokemon') {
    if (t.includes('energy')) return 'Energy';
    if (t.includes('trainer')) return 'Trainer';
    if (t.includes('pok')) return 'Pokemon';
  } else if (game === 'yugioh') {
    if (t.includes('spell')) return 'Spells';
    if (t.includes('trap')) return 'Traps';
    if (t.includes('monster') || t.includes('effect') || t.includes('fusion') || t.includes('synchro') || t.includes('xyz') || t.includes('link') || t.includes('ritual') || t.includes('normal') || t.includes('gemini') || t.includes('union') || t.includes('spirit') || t.includes('toon') || t.includes('flip')) return 'Monsters';
  } else if (game === 'lorcana') {
    if (t.includes('location')) return 'Locations';
    if (t.includes('item')) return 'Items';
    if (t.includes('song')) return 'Songs';
    if (t.includes('action')) return 'Actions';
    if (t.includes('character')) return 'Characters';
  } else if (game === 'onepiece') {
    if (t.includes('leader')) return 'Leader';
    if (t.includes('stage')) return 'Stages';
    if (t.includes('event')) return 'Events';
    if (t.includes('don')) return 'DON!!';
    if (t.includes('character')) return 'Characters';
  } else if (game === 'flesh_and_blood') {
    if (t.includes('hero')) return 'Hero';
    if (t.includes('weapon')) return 'Weapon';
    if (t.includes('equipment')) return 'Equipment';
    if (t.includes('ally')) return 'Allies';
    if (t.includes('instant')) return 'Instants';
    if (t.includes('action') || t.includes('attack reaction') || t.includes('reaction')) return 'Actions';
  } else if (game === 'starwars') {
    if (t.includes('leader')) return 'Leader';
    if (t.includes('base')) return 'Base';
    if (t.includes('upgrade')) return 'Upgrades';
    if (t.includes('event')) return 'Events';
    if (t.includes('unit')) return 'Units';
  }
  return 'Other';
};

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

function buildBalancedColumns(sections, groupedCards, targetColumnCount) {
  const seededColumns = Array.from({ length: targetColumnCount }, () => []);
  const seededHeights = Array.from({ length: targetColumnCount }, () => 0);

  sections.forEach((section, index) => {
    const smallestColumnIndex = seededHeights.reduce((bestIndex, height, currentIndex, allHeights) => (
      height < allHeights[bestIndex] ? currentIndex : bestIndex
    ), 0);

    const preferredColumnIndex = index < targetColumnCount ? index : smallestColumnIndex;
    const chosenColumnIndex = seededColumns[preferredColumnIndex].length === 0
      ? preferredColumnIndex
      : smallestColumnIndex;

    seededColumns[chosenColumnIndex].push(section);
    seededHeights[chosenColumnIndex] += estimateSectionHeight(section, groupedCards);
  });

  return seededColumns.filter((column) => column.length > 0);
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

  const groupedCards = nonCommanderItems.reduce((acc, item) => {
    const type = getCardType(item.type || item.type_line, game);
    if (!acc[type]) acc[type] = [];
    acc[type].push(item);
    return acc;
  }, {});

  const orderedTypes = cardTypeCategories[game] || [];
  const stackColumns = (() => {
    const makeStack = (type) => groupedCards[type]?.length ? { type: 'stack', label: type } : null;
    const commanderSection = isCommanderFormat ? { type: 'commander' } : null;

    if (game === 'magic') {
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

      return buildBalancedColumns([...orderedSections, ...remainingStacks], groupedCards, 4);
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

    return buildBalancedColumns([...orderedSections, ...remainingStacks], groupedCards, 4);
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
