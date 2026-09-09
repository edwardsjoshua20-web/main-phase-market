export const COMMANDER_ANALYTICS_VERSION = 6;

export const COMMANDER_PRESENTABLE_THEME_SLUGS = Object.freeze(new Set([
  'mill',
  'petitioners',
  'reanimator',
  'aristocrats',
  'enchantress',
  'lands',
  'tokens',
  'counters'
]));

export const COMMANDER_SAMPLE_THRESHOLDS = Object.freeze({
  lowConfidence: 5,
  usable: 10,
  strong: 20
});

export function getCommanderSampleConfidence(deckCount) {
  const normalizedDeckCount = Math.max(0, Number(deckCount) || 0);

  if (normalizedDeckCount >= COMMANDER_SAMPLE_THRESHOLDS.strong) {
    return {
      tier: 'strong',
      label: 'Strong sample',
      deck_count: normalizedDeckCount,
      analytics_eligible: true,
      ranking_eligible: true
    };
  }

  if (normalizedDeckCount >= COMMANDER_SAMPLE_THRESHOLDS.usable) {
    return {
      tier: 'usable',
      label: 'Usable sample',
      deck_count: normalizedDeckCount,
      analytics_eligible: true,
      ranking_eligible: true
    };
  }

  if (normalizedDeckCount >= COMMANDER_SAMPLE_THRESHOLDS.lowConfidence) {
    return {
      tier: 'low',
      label: 'Low confidence',
      deck_count: normalizedDeckCount,
      analytics_eligible: false,
      ranking_eligible: false
    };
  }

  return {
    tier: 'insufficient',
    label: 'Insufficient sample',
    deck_count: normalizedDeckCount,
    analytics_eligible: false,
    ranking_eligible: false
  };
}
