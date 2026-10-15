import { getMtgCommanderPage, getMtgMechanicalChemistry } from '@/lib/mtgCommanderCatalog';
import {
  buildCommanderStrategySummary,
  buildUnifiedCommanderRecommendations
} from '@/services/commander/commanderRecommendationService';

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
    mechanicalChemistry: null,
    mechanicalStrategies: [],
    mechanicalRecommendations: [],
    mechanicalCategories: [],
    unifiedRecommendations: [],
    unifiedStrategies: [],
    unifiedRecommendationMetrics: null,
    strategySummary: '',
    topSynergy: [],
    observedCards: [],
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
    hasLocalData: false,
    hasAnalyticsData: false,
    sampleConfidence: null,
    analyticsSuppressed: false,
    averageDeckKind: null
  };
}

export function normalizeCommanderPagePayload(pagePayload, mechanicalChemistry = null) {
  const unified = buildUnifiedCommanderRecommendations({
    mechanicalChemistry,
    communityRecommendations: pagePayload?.top_synergy_cards || [],
    gameChangers: pagePayload?.game_changers || []
  });
  const unifiedByOracleId = new Map(unified.recommendations.map((card) => [card.oracle_id, card]));
  const withUnifiedEvidence = (cards = []) => cards.map((card) => ({
    ...card,
    ...(unifiedByOracleId.get(card.oracle_id) || {})
  }));
  return {
    commander: pagePayload?.commander || null,
    mechanicalChemistry,
    mechanicalStrategies: mechanicalChemistry?.strategies || [],
    mechanicalRecommendations: mechanicalChemistry?.recommendations || [],
    mechanicalCategories: mechanicalChemistry?.categories || [],
    unifiedRecommendations: unified.recommendations,
    unifiedStrategies: unified.strategies,
    unifiedRecommendationMetrics: unified.metrics,
    strategySummary: buildCommanderStrategySummary(mechanicalChemistry?.commander_names, unified.strategies),
    topSynergy: withUnifiedEvidence(pagePayload?.top_synergy_cards),
    observedCards: withUnifiedEvidence(pagePayload?.observed_cards),
    newCards: withUnifiedEvidence(pagePayload?.new_cards),
    gameChangers: withUnifiedEvidence(pagePayload?.game_changers),
    categories: (pagePayload?.categories || []).map((section) => ({
      ...section,
      cards: withUnifiedEvidence(section.cards)
    })),
    averageDeckSections: pagePayload?.average_deck_sections || [],
    deckRows: pagePayload?.deck_rows || [],
    topCommanders: pagePayload?.top_commanders || [],
    averageDeckProfile: pagePayload?.average_deck_profile || EMPTY_AVERAGE_DECK_PROFILE,
    themeOptions: pagePayload?.theme_options || [],
    activeTheme: pagePayload?.active_theme || '',
    activeMode: pagePayload?.active_mode || 'commander',
    totalDecks: pagePayload?.total_decks || 0,
    hasLocalData: Boolean(pagePayload?.has_local_data),
    hasAnalyticsData: Boolean(pagePayload?.has_analytics_data),
    sampleConfidence: pagePayload?.sample_confidence || null,
    analyticsSuppressed: Boolean(pagePayload?.analytics_suppressed),
    averageDeckKind: pagePayload?.average_deck_kind || null
  };
}

export async function loadCommanderDetailPage(oracleId, options = {}) {
  const [pagePayload, mechanicalChemistry] = await Promise.all([
    getMtgCommanderPage(oracleId, options),
    options.mode === 'card' ? Promise.resolve(null) : getMtgMechanicalChemistry(oracleId)
  ]);
  return normalizeCommanderPagePayload(pagePayload, mechanicalChemistry);
}

export function buildCommanderNavSections({
  activeMode,
  averageDeckSections,
  categories,
  gameChangers,
  unifiedRecommendations,
  newCards,
  observedCards,
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
    if (topSynergy.length > 0) sections.push({ id: 'recommended', label: 'Recommended Chemistry' });
    if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
    if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
    return sections;
  }

  const sections = [];
  if (unifiedRecommendations?.length > 0) sections.push({ id: 'recommended', label: 'Recommended Chemistry' });
  if (observedCards.length > 0) sections.push({ id: 'observed', label: 'Observed Cards' });
  if (gameChangers.length > 0) sections.push({ id: 'game-changers', label: 'Game Changers' });
  if (newCards.length > 0) sections.push({ id: 'new-cards', label: 'New Cards' });
  for (const label of ALLOWED_CATEGORY_ORDER) {
    const section = categories.find((entry) => entry.label === label);
    if (section) sections.push({ id: `category-${section.category}`, label: section.label });
  }
  return sections;
}

export function getVisibleCommanderCategories(categories) {
  const allowedLabels = new Set(ALLOWED_CATEGORY_ORDER);
  return categories.filter((section) => allowedLabels.has(section.label));
}
