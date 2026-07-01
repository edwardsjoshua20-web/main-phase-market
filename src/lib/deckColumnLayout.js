function pickShortestColumn(heights) {
  return heights.reduce((bestIndex, height, currentIndex, allHeights) => (
    height < allHeights[bestIndex] ? currentIndex : bestIndex
  ), 0);
}

export function buildPackedColumns(sections, estimateHeight, targetColumnCount) {
  const normalizedSections = Array.isArray(sections) ? sections.filter(Boolean) : [];
  const columnCount = Math.max(1, Math.min(Number(targetColumnCount) || 1, normalizedSections.length || 1));
  const columns = Array.from({ length: columnCount }, () => []);
  const heights = Array.from({ length: columnCount }, () => 0);

  const anchoredSections = normalizedSections.filter((section) => section.anchorColumn === 0);
  const remainingSections = normalizedSections
    .filter((section) => section.anchorColumn !== 0)
    .sort((a, b) => estimateHeight(b) - estimateHeight(a));

  const placeSection = (section, preferredColumnIndex = null) => {
    const fallbackColumnIndex = pickShortestColumn(heights);
    const chosenColumnIndex = (
      Number.isInteger(preferredColumnIndex) &&
      preferredColumnIndex >= 0 &&
      preferredColumnIndex < columns.length &&
      columns[preferredColumnIndex].length === 0
    )
      ? preferredColumnIndex
      : fallbackColumnIndex;

    columns[chosenColumnIndex].push(section);
    heights[chosenColumnIndex] += estimateHeight(section);
  };

  anchoredSections.forEach((section) => placeSection(section, 0));
  remainingSections.forEach((section) => placeSection(section));

  return columns.filter((column) => column.length > 0);
}
