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

export function getCustomSections(layout) {
  return Array.isArray(layout?.customSections)
    ? layout.customSections.filter((section) => section && typeof section.key === 'string')
    : [];
}

export function getSectionAssignments(layout) {
  return layout?.assignments && typeof layout.assignments === 'object'
    ? layout.assignments
    : {};
}

export function applySectionLayout(defaultColumns, layout) {
  const entries = getSectionLayoutEntries(layout);
  if (!entries.length) return defaultColumns;

  const columns = Array.from({ length: Math.max(1, defaultColumns.length) }, () => []);
  const sectionsByKey = new Map(defaultColumns.flat().map((section) => [getSectionKey(section), section]));
  const placed = new Set();
  const commander = sectionsByKey.get('Commander');
  if (commander) {
    columns[0].push(commander);
    placed.add('Commander');
  }

  [...entries]
    .sort((a, b) => (a.column - b.column) || (a.order - b.order))
    .forEach((entry) => {
      if (entry.key === 'Commander') return;
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
    customSections: getCustomSections(previousLayout).map((section) => ({
      ...section,
      ...(displayNameOverrides[section.key] ? { displayName: displayNameOverrides[section.key] } : {}),
    })),
    assignments: getSectionAssignments(previousLayout),
    sections: columns.flatMap((column, columnIndex) => column.map((section, order) => {
      const key = getSectionKey(section);
      const displayName = displayNameOverrides[key] ?? previousNames.get(key);
      return {
        key,
        column: key === 'Commander' ? 0 : columnIndex,
        order: key === 'Commander' ? 0 : order,
        ...(displayName && displayName !== key ? { displayName } : {}),
      };
    })),
  };
}

export function addCustomSection(layout, columns, key, displayName) {
  const baseLayout = createSectionLayout(columns, layout);
  const customSections = getCustomSections(baseLayout);
  if (customSections.some((section) => section.key === key)) return baseLayout;

  const targetColumn = Math.max(0, columns.length - 1);
  return {
    ...baseLayout,
    customSections: [...customSections, { key, displayName }],
    sections: [
      ...baseLayout.sections,
      { key, displayName, column: targetColumn, order: columns[targetColumn]?.length || 0 },
    ],
  };
}

export function removeCustomSection(layout, key) {
  const assignments = Object.fromEntries(
    Object.entries(getSectionAssignments(layout)).filter(([, sectionKey]) => sectionKey !== key)
  );
  return {
    ...layout,
    customSections: getCustomSections(layout).filter((section) => section.key !== key),
    sections: getSectionLayoutEntries(layout).filter((section) => section.key !== key),
    assignments,
  };
}

export function assignCardsToSection(layout, productIds, sectionKey) {
  const assignments = { ...getSectionAssignments(layout) };
  productIds.forEach((productId) => {
    if (sectionKey) assignments[productId] = sectionKey;
    else delete assignments[productId];
  });
  return { ...layout, assignments };
}

export function createSectionTemplate(layout, game, name) {
  return {
    id: `section-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    game,
    createdAt: new Date().toISOString(),
    sections: getSectionLayoutEntries(layout).map(({ key, column, order, displayName }) => ({ key, column, order, ...(displayName ? { displayName } : {}) })),
    customSections: getCustomSections(layout).map((section) => ({ ...section })),
  };
}

export function applySectionTemplate(layout, template) {
  const currentCustom = getCustomSections(layout);
  const customByName = new Map(currentCustom.map((section) => [section.displayName.toLowerCase(), section]));
  const keyMap = new Map();
  const mergedCustom = [...currentCustom];

  (template?.customSections || []).forEach((section) => {
    const existing = customByName.get(String(section.displayName || '').toLowerCase());
    if (existing) {
      keyMap.set(section.key, existing.key);
      return;
    }
    const next = { ...section, key: `custom:${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    keyMap.set(section.key, next.key);
    mergedCustom.push(next);
  });

  return {
    version: DECK_SECTION_LAYOUT_VERSION,
    customSections: mergedCustom,
    assignments: getSectionAssignments(layout),
    sections: (template?.sections || []).map((section) => ({
      ...section,
      key: keyMap.get(section.key) || section.key,
      ...(keyMap.has(section.key) ? { displayName: mergedCustom.find((custom) => custom.key === keyMap.get(section.key))?.displayName } : {}),
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
