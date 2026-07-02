import { getMtgCommanderPage } from '@/lib/mtgCommanderCatalog';

const EMPTY_AVERAGE_DECK_PROFILE = {
  total_decks: 0,
  average_cards: 0,
  type_distribution: [],
  mana_curve: []
};

const ALLOWED_CATEGORY_ORDER = [
  'Creatures',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Utility Artifacts',
  'Mana Artifacts',
  'Enchantments',
  'Planeswalkers',
  'Lands',
  'Utility Lands'
];

export function createEmptyCommanderPageState() {
  return {
    commander: null,
    topSynergy: [],
    newCards: [],
    gameChangers: [],
    categories: [],
    averageDeckSections: [],
    deckRows: [],
    topCommanders: [],
    averageDeckProfile: EMPTY_AVERAGE_DECK_PROFILE,
    themeOptions: [],
    activeTheme: '',
    activeMode: 'commander',
    totalDecks: 0,
    hasLocalData: false
  };
}

export function normalizeCommanderPagePayload(pagePayload) {
  return {
    commander: pagePayload?.commander || null,
    topSynergy: pagePayload?.top_synergy_cards || [],
    newCards: pagePayload?.new_cards || [],
    gameChangers: pagePayload?.game_changers || [],
    categories: pagePayload?.categories || [],
    averageDeckSections: pagePayload?.average_deck_sections || [],
    deckRows: pagePayload?.deck_rows || [],
    topCommanders: pagePayload?.top_commanders || [],
    averageDeckProfile: pagePayload?.average_deck_profile || EMPTY_AVERAGE_DECK_PROFILE,
    themeOptions: pagePayload?.theme_options || [],
    activeTheme: pagePayload?.active_theme || '',
    activeMode: pagePayload?.active_mode || 'commander',
    totalDecks: pagePayload?.total_decks || 0,
    hasLocalData: Boolean(pagePayload?.has_local_data)
  };
}

export async function loadCommanderDetailPage(oracleId, options = {}) {
  const pagePayload = await getMtgCommanderPage(oracleId, options);
  return normalizeCommanderPagePayload(pagePayload);
}

export function buildCommanderNavSections({
  activeMode,
  averageDeckSections,
  categories,
  gameChangers,
  newCards,
  topCommanders,
  topSynergy
}) {
  if (activeMode === 'average-deck') {
    return averageDeckSections.map((section) => ({
      id: `average-${section.type.toLowerCase()}`,
      label: section.label
    }));
  }

  if (activeMode === 'decks') {
    return [];
  }

  if (activeMode === 'card') {
    const sections = [];
    if (topCommanders.length > 0) sections.push({ id: 'top-commanders', label: 'Top Commanders' });
    if (topSynergy.length > 0) sections.push({ id: 'recommended', label: 'Recommended Cards' });
    if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
    if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
    return sections;
  }

  const sections = [];
  if (topSynergy.length > 0) sections.push({ id: 'recommended', label: 'Recommended by Synergy' });
  if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
  if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
  for (const label of ALLOWED_CATEGORY_ORDER) {
    const section = categories.find((entry) => entry.label === label);
    if (section) {
      sections.push({ id: `category-${section.category}`, label: section.label });
    }
  }
  return sections;
}

export function getVisibleCommanderCategories(categories) {
  const allowedLabels = new Set(ALLOWED_CATEGORY_ORDER);
  return categories.filter((section) => allowedLabels.has(section.label));
}
