export const DECK_SECTION_LAYOUT_VERSION = 1;

export function getSectionKey(section) {
  if (section?.canonicalKey) return section.canonicalKey;
  if (section?.label) return section.label;
  if (section?.group?.label) return section.group.label;
  return section?.type === 'commander' ? 'Commander' : '';
}

export function getSectionLayoutEntries(layout) {
  if (!layout || layout.version !== DECK_SECTION_LAYOUT_VERSION || !Array.isArray(layout.sections)) return [];
  return layout.sections.filter((entry) => entry && typeof entry.key === 'string');
}

export function getSectionDisplayName(layout, key) {
  const entry = getSectionLayoutEntries(layout).find((candidate) => candidate.key === key);
  return String(entry?.displayName || key).trim() || key;
}

export function applySectionLayout(defaultColumns, layout) {
  const entries = getSectionLayoutEntries(layout);
  if (!entries.length) return defaultColumns;

  const columns = Array.from({ length: Math.max(1, defaultColumns.length) }, () => []);
  const sectionsByKey = new Map(defaultColumns.flat().map((section) => [getSectionKey(section), section]));
  const placed = new Set();

  [...entries]
    .sort((a, b) => (a.column - b.column) || (a.order - b.order))
    .forEach((entry) => {
      const section = sectionsByKey.get(entry.key);
      if (!section || placed.has(entry.key)) return;
      const column = Math.max(0, Math.min(columns.length - 1, Number(entry.column) || 0));
      columns[column].push(section);
      placed.add(entry.key);
    });

  defaultColumns.forEach((defaultColumn, columnIndex) => {
    defaultColumn.forEach((section) => {
      const key = getSectionKey(section);
      if (placed.has(key)) return;
      columns[Math.min(columnIndex, columns.length - 1)].push(section);
      placed.add(key);
    });
  });

  return columns;
}

export function createSectionLayout(columns, previousLayout, displayNameOverrides = {}) {
  const previousNames = new Map(
    getSectionLayoutEntries(previousLayout).map((entry) => [entry.key, entry.displayName])
  );

  return {
    version: DECK_SECTION_LAYOUT_VERSION,
    sections: columns.flatMap((column, columnIndex) => column.map((section, order) => {
      const key = getSectionKey(section);
      const displayName = displayNameOverrides[key] ?? previousNames.get(key);
      return {
        key,
        column: columnIndex,
        order,
        ...(displayName && displayName !== key ? { displayName } : {}),
      };
    })),
  };
}

export function sortSectionsByLayout(sections, layout, getKey = getSectionKey) {
  const positions = new Map(
    getSectionLayoutEntries(layout)
      .sort((a, b) => (a.column - b.column) || (a.order - b.order))
      .map((entry, index) => [entry.key, index])
  );

  return [...sections].sort((a, b) => {
    const positionA = positions.get(getKey(a));
    const positionB = positions.get(getKey(b));
    if (positionA === undefined && positionB === undefined) return 0;
    if (positionA === undefined) return 1;
    if (positionB === undefined) return -1;
    return positionA - positionB;
  });
}
