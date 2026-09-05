import React, { useEffect, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Check, GripVertical, Pencil, X } from 'lucide-react';
import CardStack from './CardStack';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { buildPackedColumns } from '@/lib/deckColumnLayout';
import { getDeckSectionOrder, groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';
import {
  applySectionLayout,
  createSectionLayout,
  getSectionDisplayName,
  getSectionKey,
} from '@/lib/deckSectionLayout';

function getFittedColumnCount(width) {
  const availableWidth = Math.max(0, width);
  for (let count = 5; count > 1; count -= 1) {
    const cardsWidth = count * 223;
    const gapsWidth = (count - 1) * 30;
    const activeRailAllowance = 66;
    if (cardsWidth + gapsWidth + activeRailAllowance <= availableWidth) return count;
  }
  return 1;
}

function SectionHeader({ sectionKey, displayName, totalQty, dragHandleProps, onRename }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(displayName);

  useEffect(() => setDraftName(displayName), [displayName]);

  const saveName = () => {
    const nextName = draftName.trim() || sectionKey;
    onRename(sectionKey, nextName);
    setEditing(false);
  };

  return (
    <div style={{ width: 223, minHeight: 15, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
      <button
        type="button"
        {...dragHandleProps}
        aria-label={`Move ${displayName} section`}
        title={`Move ${displayName}`}
        style={{ border: 0, padding: 0, background: 'transparent', color: '#64748b', cursor: 'grab', lineHeight: 0 }}
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
      {editing ? (
        <>
          <input
            autoFocus
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') saveName();
              if (event.key === 'Escape') {
                setDraftName(displayName);
                setEditing(false);
              }
            }}
            aria-label={`Rename ${displayName} section`}
            style={{ minWidth: 0, width: 150, height: 18, border: '1px solid #475569', borderRadius: 3, background: '#111827', color: '#fff', padding: '0 5px', fontSize: 11 }}
          />
          <button type="button" onClick={saveName} aria-label="Save section name" title="Save name" style={{ border: 0, padding: 0, background: 'transparent', color: '#86efac', lineHeight: 0, cursor: 'pointer' }}>
            <Check size={13} aria-hidden="true" />
          </button>
          <button type="button" onClick={() => { setDraftName(displayName); setEditing(false); }} aria-label="Cancel section rename" title="Cancel" style={{ border: 0, padding: 0, background: 'transparent', color: '#94a3b8', lineHeight: 0, cursor: 'pointer' }}>
            <X size={13} aria-hidden="true" />
          </button>
        </>
      ) : (
        <>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: sectionKey === 'Commander' ? '#fbbf24' : '#fff', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>
            {displayName}
          </span>
          {totalQty !== null && <span style={{ color: '#9ca3af', fontSize: 11 }}>({totalQty})</span>}
          <button
            type="button"
            onClick={() => setEditing(true)}
            aria-label={`Rename ${displayName} section`}
            title="Rename section"
            style={{ marginLeft: 'auto', border: 0, padding: 0, background: 'transparent', color: '#64748b', lineHeight: 0, cursor: 'pointer' }}
          >
            <Pencil size={11} aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  );
}

function CommanderStack({ commanderItem, onChangeSet }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
  sectionLayout,
  onSectionLayoutChange,
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
  const defaultStackColumns = (() => {
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

  const stackColumns = applySectionLayout(defaultStackColumns, sectionLayout);

  const saveColumns = (columns, displayNameOverrides = {}) => {
    if (!onSectionLayoutChange) return;
    const isRename = Object.keys(displayNameOverrides).length > 0;
    onSectionLayoutChange(
      createSectionLayout(columns, sectionLayout, displayNameOverrides),
      isRename ? { message: 'Section renamed' } : undefined
    );
  };

  const handleDragEnd = ({ source, destination }) => {
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceColumn = Number(source.droppableId.replace('deck-column-', ''));
    const destinationColumn = Number(destination.droppableId.replace('deck-column-', ''));
    const nextColumns = stackColumns.map((column) => [...column]);
    const [movedSection] = nextColumns[sourceColumn].splice(source.index, 1);
    nextColumns[destinationColumn].splice(destination.index, 0, movedSection);
    saveColumns(nextColumns);
  };

  const renameSection = (sectionKey, displayName) => {
    saveColumns(stackColumns, { [sectionKey]: displayName });
  };

  return (
    <div ref={canvasRef} className="flex-1 overflow-auto px-1 py-3">
      <DragDropContext onDragEnd={handleDragEnd}>
        <div
          className="grid items-start"
          style={{
            gridTemplateColumns: `repeat(${stackColumns.length}, minmax(223px, max-content))`,
            columnGap: 30,
          }}
        >
          {stackColumns.map((column, columnIndex) => (
            <Droppable key={columnIndex} droppableId={`deck-column-${columnIndex}`}>
              {(dropProvided, dropSnapshot) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="flex min-w-0 flex-col gap-2"
                  style={{ minHeight: 42, background: dropSnapshot.isDraggingOver ? 'rgba(59,130,246,0.06)' : 'transparent' }}
                >
                  {column.map((section, sectionIndex) => {
                    const sectionKey = getSectionKey(section);
                    const displayName = getSectionDisplayName(sectionLayout, sectionKey);
                    const totalQty = section.type === 'commander'
                      ? null
                      : groupedCards[section.label].reduce((sum, item) => sum + (item.quantity || 1), 0);

                    return (
                      <Draggable key={sectionKey} draggableId={sectionKey} index={sectionIndex}>
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            style={{
                              ...dragProvided.draggableProps.style,
                              width: 'max-content',
                              opacity: dragSnapshot.isDragging ? 0.82 : 1,
                              outline: dragSnapshot.isDragging ? '1px solid rgba(96,165,250,0.55)' : 'none',
                            }}
                          >
                            <SectionHeader
                              sectionKey={sectionKey}
                              displayName={displayName}
                              totalQty={totalQty}
                              dragHandleProps={dragProvided.dragHandleProps}
                              onRename={renameSection}
                            />
                            {section.type === 'commander' ? (
                              <CommanderStack commanderItem={commanderItem} onChangeSet={onChangeSet} />
                            ) : (
                              <CardStack
                                type={section.label}
                                cards={groupedCards[section.label]}
                                onChangeQty={onChangeQty}
                                onRemove={onRemove}
                                onChangeSet={onChangeSet}
                                onSetCommander={onSetCommander}
                                storeProducts={storeProducts}
                                hideHeader
                              />
                            )}
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {dropProvided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
