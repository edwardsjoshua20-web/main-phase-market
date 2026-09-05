import React, { useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Draggable, Droppable } from '@hello-pangea/dnd';
import { Check, Clock3, GripVertical, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import CardStack from './CardStack';
import { getCardImageUrl, handleCardImageError } from '@/lib/cardImages';
import { buildPackedColumns } from '@/lib/deckColumnLayout';
import { getDeckSectionOrder, groupDeckItems, normalizeDeckGame } from '@/lib/deckSections';
import {
  applySectionLayout,
  addCustomSection,
  assignCardsToSection,
  createSectionLayout,
  getCustomSections,
  getSectionAssignments,
  getSectionDisplayName,
  getSectionKey,
  removeCustomSection,
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

function SectionHeader({ sectionKey, displayName, totalQty, dragHandleProps, onRename, onDelete }) {
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
      {dragHandleProps ? (
        <button
          type="button"
          {...dragHandleProps}
          aria-label={`Move ${displayName} section`}
          title={`Move ${displayName}`}
          style={{ border: 0, padding: 0, background: 'transparent', color: '#64748b', cursor: 'grab', lineHeight: 0 }}
        >
          <GripVertical size={13} aria-hidden="true" />
        </button>
      ) : <span aria-hidden="true" style={{ width: 13 }} />}
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
          {onDelete && (
            <button type="button" onClick={onDelete} aria-label={`Delete ${displayName} section`} title="Delete custom section" style={{ border: 0, padding: 0, background: 'transparent', color: '#9f5b63', lineHeight: 0, cursor: 'pointer' }}>
              <Trash2 size={11} aria-hidden="true" />
            </button>
          )}
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
  sectionTemplates = [],
  history = [],
  onSectionLayoutChange,
  onSaveTemplate,
  onApplyTemplate,
  onDeleteTemplate,
  onUndoHistory,
  onChangeQty,
  onBulkQuantity,
  onBulkRemove,
  onRemove,
  onChangeSet,
  onSetCommander,
  storeProducts
}) {
  const canvasRef = useRef(null);
  const selectionAnchorRef = useRef(null);
  const [targetColumnCount, setTargetColumnCount] = useState(() => getFittedColumnCount(window.innerWidth - 176));
  const [isSectionDragging, setIsSectionDragging] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState(() => new Set());
  const [showAddSection, setShowAddSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const updateColumnCount = (width) => setTargetColumnCount(getFittedColumnCount(width));
    const observer = new ResizeObserver((entries) => updateColumnCount(entries[0]?.contentRect?.width || 0));
    updateColumnCount(canvas.getBoundingClientRect().width);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setSelectedProductIds((current) => new Set(
      [...current].filter((id) => deck?.items?.some((item) => item.product_id === id))
    ));
  }, [deck?.items]);

  const commanderItem = isCommanderFormat ? deck?.items?.find(i => i.is_commander) : null;
  const nonCommanderItems = isCommanderFormat
    ? (deck?.items || []).filter(i => !i.is_commander)
    : (deck?.items || []);

  const normalizedGame = normalizeDeckGame(game);
  const deckGroups = groupDeckItems(nonCommanderItems, normalizedGame);
  const canonicalByProduct = new Map(
    deckGroups.flatMap((group) => group.items.map((item) => [item.product_id, group.label]))
  );
  const assignments = getSectionAssignments(sectionLayout);
  const customSections = getCustomSections(sectionLayout);
  const customSectionKeys = new Set(customSections.map((section) => section.key));
  const groupedCards = Object.fromEntries(deckGroups.map((group) => [group.label, []]));
  customSections.forEach((section) => { groupedCards[section.key] = []; });
  nonCommanderItems.forEach((item) => {
    const assignedSection = assignments[item.product_id];
    const targetSection = assignedSection && groupedCards[assignedSection]
      ? assignedSection
      : canonicalByProduct.get(item.product_id) || 'Other';
    if (!groupedCards[targetSection]) groupedCards[targetSection] = [];
    groupedCards[targetSection].push(item);
  });
  const stackSectionHeight = (section) => estimateSectionHeight(section, groupedCards);
  const orderedTypes = getDeckSectionOrder(normalizedGame).filter((label) => label !== 'Commander' && label !== 'Other');
  const defaultStackColumns = (() => {
    const makeStack = (type) => groupedCards[type]?.length ? { type: 'stack', label: type, canonicalKey: type } : null;
    const commanderSection = isCommanderFormat ? { type: 'commander', canonicalKey: 'Commander', anchorColumn: 0 } : null;
    const customStacks = customSections.map((section) => ({ type: 'custom', label: section.key, canonicalKey: section.key }));

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
        .filter((type) => !usedLabels.has(type) && !customSectionKeys.has(type))
        .map((type) => ({ type: 'stack', label: type }));

      return buildPackedColumns([...orderedSections, ...remainingStacks, ...customStacks], stackSectionHeight, targetColumnCount);
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
      .filter((type) => !usedLabels.has(type) && !customSectionKeys.has(type))
      .map((type) => ({ type: 'stack', label: type }));

    return buildPackedColumns([...orderedSections, ...remainingStacks, ...customStacks], stackSectionHeight, Math.min(4, targetColumnCount));
  })();

  const stackColumns = applySectionLayout(defaultStackColumns, sectionLayout);
  const commanderSection = stackColumns.flat().find((section) => getSectionKey(section) === 'Commander');
  const movableColumns = stackColumns.map((column) => column.filter((section) => getSectionKey(section) !== 'Commander'));
  const visibleCardIds = useMemo(
    () => stackColumns.flatMap((column) => column.flatMap((section) => (groupedCards[getSectionKey(section)] || []).map((item) => item.product_id))),
    [stackColumns, groupedCards]
  );

  const saveColumns = (columns, displayNameOverrides = {}, options = {}) => {
    if (!onSectionLayoutChange) return;
    const isRename = Object.keys(displayNameOverrides).length > 0;
    onSectionLayoutChange(
      createSectionLayout(columns, sectionLayout, displayNameOverrides),
      { ...options, ...(isRename && !options.message ? { message: 'Section renamed' } : {}) }
    );
  };

  const handleDragEnd = ({ source, destination }) => {
    setIsSectionDragging(false);
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceColumn = Number(source.droppableId.replace('deck-column-', ''));
    const destinationColumn = Number(destination.droppableId.replace('deck-column-', ''));
    const nextMovableColumns = movableColumns.map((column) => [...column]);
    const [movedSection] = nextMovableColumns[sourceColumn].splice(source.index, 1);
    nextMovableColumns[destinationColumn].splice(destination.index, 0, movedSection);
    const nextColumns = nextMovableColumns.map((column, index) => (
      index === 0 && commanderSection ? [commanderSection, ...column] : column
    ));
    saveColumns(nextColumns, {}, { message: 'Section moved', historyLabel: `Moved ${getSectionDisplayName(sectionLayout, getSectionKey(movedSection))}` });
  };

  const renameSection = (sectionKey, displayName) => {
    saveColumns(stackColumns, { [sectionKey]: displayName }, { historyLabel: `Renamed section to ${displayName}` });
  };

  const createCustomSection = () => {
    const displayName = newSectionName.trim();
    if (!displayName) return;
    const key = `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    onSectionLayoutChange(addCustomSection(sectionLayout, stackColumns, key, displayName), {
      message: 'Custom section created',
      historyLabel: `Created ${displayName}`,
    });
    setNewSectionName('');
    setShowAddSection(false);
  };

  const deleteCustomSection = (key, displayName) => {
    if (!window.confirm(`Delete section "${displayName}"? Its cards will return to their default groups.`)) return;
    onSectionLayoutChange(removeCustomSection(sectionLayout, key), {
      message: 'Cards returned to default groups',
      historyLabel: `Deleted ${displayName}`,
    });
  };

  const handleCardSelect = (item, event) => {
    if (isSectionDragging || (!event.ctrlKey && !event.metaKey && !event.shiftKey)) return;
    event.stopPropagation();
    const next = new Set(selectedProductIds);
    if (event.shiftKey && selectionAnchorRef.current) {
      const start = visibleCardIds.indexOf(selectionAnchorRef.current);
      const end = visibleCardIds.indexOf(item.product_id);
      if (start >= 0 && end >= 0) {
        visibleCardIds.slice(Math.min(start, end), Math.max(start, end) + 1).forEach((id) => next.add(id));
      }
    } else if (next.has(item.product_id)) next.delete(item.product_id);
    else next.add(item.product_id);
    selectionAnchorRef.current = item.product_id;
    setSelectedProductIds(next);
  };

  const moveSelected = (sectionKey) => {
    if (!selectedProductIds.size) return;
    const baseLayout = sectionLayout || createSectionLayout(stackColumns, null);
    onSectionLayoutChange(assignCardsToSection(baseLayout, [...selectedProductIds], sectionKey), {
      message: 'Cards moved',
      historyLabel: `Moved ${selectedProductIds.size} card${selectedProductIds.size === 1 ? '' : 's'}`,
    });
    setSelectedProductIds(new Set());
  };

  const compatibleTemplates = sectionTemplates.filter((template) => normalizeDeckGame(template.game) === normalizedGame);
  const selectedTemplate = compatibleTemplates.find((template) => template.id === selectedTemplateId) || null;
  const saveTemplate = () => {
    const name = templateName.trim();
    if (!name) return;
    onSaveTemplate?.(name, stackColumns);
    setTemplateName('');
    setShowSaveTemplate(false);
  };

  return (
    <div ref={canvasRef} className="relative flex-1 overflow-auto px-1 py-3">
      <div className="mb-2 flex min-h-7 flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => setShowAddSection((value) => !value)} className="inline-flex h-7 items-center gap-1 border border-slate-600/70 bg-slate-800/80 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-700" style={{ borderRadius: 3 }}>
          <Plus size={12} /> Section
        </button>
        {showAddSection && (
          <div className="flex items-center gap-1">
            <input autoFocus value={newSectionName} onChange={(event) => setNewSectionName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') createCustomSection();
              if (event.key === 'Escape') setShowAddSection(false);
            }} placeholder="Section name" className="h-7 w-36 border border-slate-600 bg-slate-900 px-2 text-[11px] text-white outline-none focus:border-blue-500" style={{ borderRadius: 3 }} />
            <button type="button" onClick={createCustomSection} aria-label="Create section" className="flex h-7 w-7 items-center justify-center border border-slate-600 bg-slate-800 text-emerald-300" style={{ borderRadius: 3 }}><Check size={12} /></button>
          </div>
        )}
        <button type="button" onClick={() => { setShowSaveTemplate((value) => !value); setTemplateName(`${deck?.name || 'Deck'} Template`); }} className="inline-flex h-7 items-center gap-1 border border-slate-600/70 bg-slate-800/80 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-700" style={{ borderRadius: 3 }}>
          <Save size={12} /> Template
        </button>
        {showSaveTemplate && (
          <div className="flex items-center gap-1">
            <input autoFocus value={templateName} onChange={(event) => setTemplateName(event.target.value)} onKeyDown={(event) => {
              if (event.key === 'Enter') saveTemplate();
              if (event.key === 'Escape') setShowSaveTemplate(false);
            }} aria-label="Template name" className="h-7 w-40 border border-slate-600 bg-slate-900 px-2 text-[11px] text-white outline-none focus:border-blue-500" style={{ borderRadius: 3 }} />
            <button type="button" onClick={saveTemplate} aria-label="Save template" className="flex h-7 w-7 items-center justify-center border border-slate-600 bg-slate-800 text-emerald-300" style={{ borderRadius: 3 }}><Check size={12} /></button>
          </div>
        )}
        {compatibleTemplates.length > 0 && (
          <div className="flex items-center gap-1">
            <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)} className="h-7 border border-slate-600/70 bg-slate-800/80 px-2 text-[10px] font-semibold text-slate-200" style={{ borderRadius: 3 }} aria-label="Select section template">
              <option value="" disabled>Select template</option>
              {compatibleTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
            </select>
            <button type="button" disabled={!selectedTemplate} onClick={() => onApplyTemplate?.(selectedTemplate)} aria-label="Apply section template" title="Apply template" className="flex h-7 w-7 items-center justify-center border border-slate-600 bg-slate-800 text-blue-300 disabled:cursor-not-allowed disabled:opacity-40" style={{ borderRadius: 3 }}><Check size={12} /></button>
            <button type="button" disabled={!selectedTemplate} onClick={() => {
              if (!window.confirm(`Delete template "${selectedTemplate?.name}"?`)) return;
              onDeleteTemplate?.(selectedTemplate);
              setSelectedTemplateId('');
            }} aria-label="Delete section template" title="Delete template" className="flex h-7 w-7 items-center justify-center border border-slate-600 bg-slate-800 text-red-300 disabled:cursor-not-allowed disabled:opacity-40" style={{ borderRadius: 3 }}><Trash2 size={12} /></button>
          </div>
        )}
        <div className="relative">
          <button type="button" onClick={() => setShowHistory((value) => !value)} className="inline-flex h-7 items-center gap-1 border border-slate-600/70 bg-slate-800/80 px-2 text-[10px] font-semibold text-slate-200 hover:bg-slate-700" style={{ borderRadius: 3 }}>
            <Clock3 size={12} /> History
          </button>
          {showHistory && (
            <div className="absolute left-0 top-8 z-[250] w-72 border border-slate-600 bg-slate-950 p-2 shadow-2xl" style={{ borderRadius: 4 }}>
              {history.length ? history.slice(0, 10).map((entry, index) => (
                <div key={entry.id} className="flex items-center gap-2 border-b border-slate-800 px-1 py-1.5 last:border-0">
                  <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-medium text-slate-200">{entry.label}</p><p className="text-[9px] text-slate-500">{new Date(entry.createdAt).toLocaleString()}</p></div>
                  {index === 0 && entry.undo && <button type="button" onClick={() => { onUndoHistory?.(entry); setShowHistory(false); }} className="text-[10px] font-semibold text-blue-300 hover:text-blue-200">Undo</button>}
                </div>
              )) : <p className="px-1 py-2 text-[11px] text-slate-500">No recent changes</p>}
            </div>
          )}
        </div>
        {selectedProductIds.size > 0 && (
          <div className="ml-1 flex flex-wrap items-center gap-1 border-l border-slate-600 pl-2">
            <span className="text-[10px] font-semibold text-cyan-200">{selectedProductIds.size} selected</span>
            <select defaultValue="none" onChange={(event) => { moveSelected(event.target.value === 'default' ? '' : event.target.value); event.target.value = 'none'; }} className="h-7 border border-slate-600 bg-slate-800 px-1 text-[10px] text-white" style={{ borderRadius: 3 }} aria-label="Move selected cards">
              <option value="none" disabled>Move to...</option>
              <option value="default">Default groups</option>
              {stackColumns.flat().filter((section) => getSectionKey(section) !== 'Commander').map((section) => <option key={getSectionKey(section)} value={getSectionKey(section)}>{getSectionDisplayName(sectionLayout, getSectionKey(section))}</option>)}
            </select>
            <button type="button" onClick={() => onBulkQuantity?.([...selectedProductIds], -1)} className="h-7 border border-slate-600 bg-slate-800 px-2 text-[10px] text-white" style={{ borderRadius: 3 }}>-1</button>
            <button type="button" onClick={() => onBulkQuantity?.([...selectedProductIds], 1)} className="h-7 border border-slate-600 bg-slate-800 px-2 text-[10px] text-white" style={{ borderRadius: 3 }}>+1</button>
            <button type="button" onClick={() => { onBulkRemove?.([...selectedProductIds]); setSelectedProductIds(new Set()); }} className="inline-flex h-7 items-center gap-1 border border-red-900 bg-red-950/70 px-2 text-[10px] text-red-200" style={{ borderRadius: 3 }}><Trash2 size={11} /> Remove</button>
            <button type="button" onClick={() => setSelectedProductIds(new Set())} className="px-1 text-[10px] text-slate-400 hover:text-white">Clear</button>
          </div>
        )}
      </div>
      <DragDropContext onDragStart={() => setIsSectionDragging(true)} onDragEnd={handleDragEnd}>
        <div
          className="grid items-start"
          style={{
            gridTemplateColumns: `repeat(${stackColumns.length}, minmax(223px, max-content))`,
            columnGap: 30,
          }}
        >
          {movableColumns.map((column, columnIndex) => (
            <Droppable key={columnIndex} droppableId={`deck-column-${columnIndex}`}>
              {(dropProvided, dropSnapshot) => (
                <div
                  ref={dropProvided.innerRef}
                  {...dropProvided.droppableProps}
                  className="flex min-w-0 flex-col gap-2"
                  style={{
                    minHeight: isSectionDragging ? 180 : 42,
                    outline: isSectionDragging ? `1px dashed ${dropSnapshot.isDraggingOver ? '#60a5fa' : '#334155'}` : 'none',
                    outlineOffset: 3,
                    background: dropSnapshot.isDraggingOver ? 'rgba(59,130,246,0.09)' : 'transparent',
                  }}
                >
                  {columnIndex === 0 && commanderSection && (
                    <div style={{ width: 'max-content' }}>
                      <SectionHeader sectionKey="Commander" displayName={getSectionDisplayName(sectionLayout, 'Commander')} totalQty={null} onRename={renameSection} />
                      <CommanderStack commanderItem={commanderItem} onChangeSet={onChangeSet} />
                    </div>
                  )}
                  {column.map((section, sectionIndex) => {
                    const sectionKey = getSectionKey(section);
                    const displayName = getSectionDisplayName(sectionLayout, sectionKey);
                    const cards = groupedCards[sectionKey] || [];
                    const totalQty = cards.reduce((sum, item) => sum + (item.quantity || 1), 0);

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
                              onDelete={section.type === 'custom' ? () => deleteCustomSection(sectionKey, displayName) : null}
                            />
                            {cards.length ? (
                              <CardStack
                                type={sectionKey}
                                cards={cards}
                                onChangeQty={onChangeQty}
                                onRemove={onRemove}
                                onChangeSet={onChangeSet}
                                onSetCommander={onSetCommander}
                                storeProducts={storeProducts}
                                hideHeader
                                interactionDisabled={isSectionDragging}
                                selectedProductIds={selectedProductIds}
                                onCardSelect={handleCardSelect}
                              />
                            ) : (
                              <div style={{ width: 223, height: 42, border: '1px dashed #334155', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 10 }}>Empty section</div>
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
