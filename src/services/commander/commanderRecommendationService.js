const IMPORTANCE_ORDER = Object.freeze({
  Primary: 0,
  Secondary: 1,
  Supporting: 2,
  'Generic Utility': 3,
  'Community Support': 4
});

const ORDERING_MODES = Object.freeze({
  MECHANICAL_FIRST: 'mechanical_first',
  EVIDENCE_TIERS: 'evidence_tiers',
  MECHANICAL_CLOSE_COMMUNITY: 'mechanical_close_community'
});

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function importanceRank(value) {
  return IMPORTANCE_ORDER[value] ?? 99;
}

function normalizeCardName(card) {
  return String(card?.card_name || card?.name || '').trim();
}

function mechanicalExplanation(card) {
  return String(card?.why_it_works || card?.mechanical_reasons?.[0]?.explanation || '').trim();
}

function communityOnlyExplanation(card, strategy) {
  const firstSentence = String(card?.oracle_text || '')
    .replace(/\([^)]*\)/g, '')
    .split(/(?<=[.!?])\s+/)[0]
    .trim();
  const role = strategy?.label || 'the deck';
  if (firstSentence) return `Supports ${role}: ${firstSentence}`;
  return `A commonly played support option for ${role}.`;
}

function embeddedCommunityEvidence(card) {
  const inclusion = numberOrNull(card?.community_inclusion);
  const observed = numberOrNull(card?.community_observation_count);
  const inferredTotal = inclusion > 0 && observed > 0 ? Math.max(observed, Math.round(observed / inclusion)) : null;
  return {
    inclusion,
    deckCount: observed,
    totalDecks: inferredTotal,
    observationCount: observed,
    confidence: null,
    affinity: null,
    weightedScore: null
  };
}

function explicitCommunityEvidence(card) {
  return {
    inclusion: numberOrNull(card?.inclusion_rate),
    deckCount: numberOrNull(card?.deck_count),
    totalDecks: numberOrNull(card?.total_commander_decks),
    observationCount: numberOrNull(card?.observation_deck_count ?? card?.deck_count),
    confidence: numberOrNull(card?.confidence_score),
    affinity: numberOrNull(card?.synergy_score),
    weightedScore: numberOrNull(card?.weighted_score)
  };
}

function mergeCommunityEvidence(primary, fallback) {
  return {
    inclusion: primary.inclusion ?? fallback.inclusion,
    deckCount: primary.deckCount ?? fallback.deckCount,
    totalDecks: primary.totalDecks ?? fallback.totalDecks,
    observationCount: primary.observationCount ?? fallback.observationCount,
    confidence: primary.confidence ?? fallback.confidence,
    affinity: primary.affinity ?? fallback.affinity,
    weightedScore: primary.weightedScore ?? fallback.weightedScore
  };
}

function isStrongMechanical(card) {
  const score = numberOrNull(card?.mechanical_score ?? card?.fit_score) ?? 0;
  const directness = numberOrNull(card?.ranking_dimensions?.directness) ?? 0;
  return score >= 65 || directness >= 4;
}

function isStrongCommunity(evidence) {
  return (evidence.totalDecks ?? 0) >= 10
    && (evidence.deckCount ?? 0) >= 3
    && (evidence.inclusion ?? 0) >= 0.2;
}

function evidenceTier(card) {
  const mechanical = isStrongMechanical(card);
  const community = isStrongCommunity(card.community_evidence);
  if (mechanical && community) return 'strong_agreement';
  if (mechanical) return 'strong_mechanical';
  if (community) return 'strong_community';
  return 'supporting';
}

function mechanicalRank(card) {
  return numberOrNull(card?.mechanical_rank ?? card?.rank) ?? Number.MAX_SAFE_INTEGER;
}

function mechanicalScore(card) {
  return numberOrNull(card?.mechanical_score ?? card?.fit_score) ?? -Infinity;
}

function communityOrder(card) {
  return card.community_evidence?.weightedScore
    ?? card.community_evidence?.inclusion
    ?? -Infinity;
}

function compareStableName(left, right) {
  return normalizeCardName(left).localeCompare(normalizeCardName(right));
}

function orderingComparator(mode) {
  if (mode === ORDERING_MODES.MECHANICAL_FIRST) {
    return (left, right) => {
      const leftMechanical = Boolean(left.has_mechanical_evidence);
      const rightMechanical = Boolean(right.has_mechanical_evidence);
      if (leftMechanical !== rightMechanical) return leftMechanical ? -1 : 1;
      if (mechanicalRank(left) !== mechanicalRank(right)) return mechanicalRank(left) - mechanicalRank(right);
      if (mechanicalScore(left) !== mechanicalScore(right)) return mechanicalScore(right) - mechanicalScore(left);
      if (communityOrder(left) !== communityOrder(right)) return communityOrder(right) - communityOrder(left);
      return compareStableName(left, right);
    };
  }

  if (mode === ORDERING_MODES.MECHANICAL_CLOSE_COMMUNITY) {
    return (left, right) => {
      const leftMechanical = Boolean(left.has_mechanical_evidence);
      const rightMechanical = Boolean(right.has_mechanical_evidence);
      if (leftMechanical !== rightMechanical) return leftMechanical ? -1 : 1;
      const leftBand = Math.floor(Math.max(mechanicalScore(left), 0) / 10);
      const rightBand = Math.floor(Math.max(mechanicalScore(right), 0) / 10);
      if (leftBand !== rightBand) return rightBand - leftBand;
      if (communityOrder(left) !== communityOrder(right)) return communityOrder(right) - communityOrder(left);
      if (mechanicalRank(left) !== mechanicalRank(right)) return mechanicalRank(left) - mechanicalRank(right);
      return compareStableName(left, right);
    };
  }

  const tierOrder = {
    strong_agreement: 0,
    strong_mechanical: 1,
    strong_community: 2,
    supporting: 3
  };
  return (left, right) => {
    const tierDifference = tierOrder[left.evidence_tier] - tierOrder[right.evidence_tier];
    if (tierDifference !== 0) return tierDifference;
    if (mechanicalScore(left) !== mechanicalScore(right)) return mechanicalScore(right) - mechanicalScore(left);
    if (communityOrder(left) !== communityOrder(right)) return communityOrder(right) - communityOrder(left);
    if (mechanicalRank(left) !== mechanicalRank(right)) return mechanicalRank(left) - mechanicalRank(right);
    return compareStableName(left, right);
  };
}

function strategyMatch(strategy, oracleId) {
  const ranked = Array.isArray(strategy?.diagnostics?.ranked) ? strategy.diagnostics.ranked : [];
  const rankedIndex = ranked.findIndex((entry) => entry.oracle_id === oracleId);
  if (rankedIndex >= 0) return { strength: 0, position: rankedIndex };
  const retrieved = Array.isArray(strategy?.diagnostics?.retrieved_ids) ? strategy.diagnostics.retrieved_ids : [];
  const retrievedIndex = retrieved.indexOf(oracleId);
  if (retrievedIndex >= 0) return { strength: 1, position: retrievedIndex };
  return null;
}

function bestCommunityStrategy(strategies, oracleId) {
  return strategies
    .map((strategy) => ({ strategy, match: strategyMatch(strategy, oracleId) }))
    .filter((entry) => entry.match)
    .sort((left, right) => {
      if (left.match.strength !== right.match.strength) return left.match.strength - right.match.strength;
      if (importanceRank(left.strategy.importance) !== importanceRank(right.strategy.importance)) {
        return importanceRank(left.strategy.importance) - importanceRank(right.strategy.importance);
      }
      return left.match.position - right.match.position;
    })[0] || null;
}

const PRESENTATION_PATTERNS = Object.freeze({
  mill: /\bmill(?:s|ed|ing)?\b/i,
  self_mill: /\bmill(?:s|ed|ing)?\b[^.]{0,80}\b(?:your|you)\b|\b(?:your|you)\b[^.]{0,80}\bmill(?:s|ed|ing)?\b/i,
  card_draw: /\bdraw\b[^.]{0,40}\bcard/i,
  tokens: /\bcreate\b[^.]{0,80}\btoken|\bpopulate\b|\btoken[^.]{0,60}\bcopy/i,
  counters: /\bproliferate\b|\b(?:put|double|move|remove)[^.]{0,60}\bcounter/i,
  sacrifice: /\bsacrifice\b/i,
  aristocrats: /\bsacrifice\b|\bdies\b|\bput into a graveyard from the battlefield\b/i,
  death_triggers: /\bdies\b|\bput into a graveyard from the battlefield\b/i,
  recursion: /\b(?:return|cast|play)\b[^.]{0,90}\bfrom (?:your |a )?graveyard\b/i,
  graveyard_lands: /\bland card\b[^.]{0,90}\bgraveyard|\bgraveyard\b[^.]{0,90}\bland card|\bplay a land\b[^.]{0,90}\bgraveyard/i,
  landfall: /\blandfall\b|\bland\b[^.]{0,60}\benters\b/i,
  spellslinger: /\binstant or sorcery\b|\bnoncreature spell\b|\bcast\b[^.]{0,60}\bspell/i,
  protection: /\bhexproof\b|\bindestructible\b|\bphase out\b|\bprotection from\b/i,
  control: /\bcounter target\b|\bdestroy target\b|\bexile target\b|\bcan't attack\b|\bunless[^.]{0,40}\bpays?\b/i,
  ramp: /\badd\b[^.]{0,30}\bmana\b|\btreasure token\b|\bsearch your library\b[^.]{0,80}\bland\b[^.]{0,50}\bbattlefield\b|\bcosts?\b[^.]{0,40}\bless to cast\b/i,
  lifegain: /\bgain\b[^.]{0,30}\blife\b|\blifelink\b/i,
  life_loss: /\bloses?\b[^.]{0,20}\blife\b|\bdeals?\b[^.]{0,40}\bdamage to (?:an|each|target) opponent/i,
  etb: /\benters the battlefield\b|\benters\b[^.]{0,40}\bunder your control\b|\bexile\b[^.]{0,80}\breturn\b/i,
  blink: /\bexile\b[^.]{0,80}\breturn\b/i,
  enchantments: /\benchantment spell\b|\bwhenever you cast an enchantment\b/i,
  aura_voltron: /\benchant creature\b|\baura\b|\bequipped creature\b/i,
  combat: /\badditional combat\b|\bwhenever[^.]{0,60}\battacks\b|\bcombat damage\b/i,
  extra_combat: /\badditional combat\b|\bafter this phase[^.]{0,60}\bcombat phase\b/i,
  treasure: /\btreasure token\b/i,
  tribal: /\bcreatures? you control\b[^.]{0,50}\b(?:get|have|gain)\b/i
});

function bestPresentationStrategy(strategies, card) {
  const text = `${card?.type_line || ''}. ${card?.oracle_text || ''}`;
  return strategies
    .filter((strategy) => PRESENTATION_PATTERNS[strategy.strategy_id]?.test(text))
    .sort((left, right) => importanceRank(left.importance) - importanceRank(right.importance))[0] || null;
}

function preferredMechanicalRecord(existing, candidate) {
  if (!existing) return candidate;
  if (importanceRank(candidate.strategy_importance) !== importanceRank(existing.strategy_importance)) {
    return importanceRank(candidate.strategy_importance) < importanceRank(existing.strategy_importance) ? candidate : existing;
  }
  if (mechanicalScore(candidate) !== mechanicalScore(existing)) {
    return mechanicalScore(candidate) > mechanicalScore(existing) ? candidate : existing;
  }
  return mechanicalRank(candidate) < mechanicalRank(existing) ? candidate : existing;
}

function buildMechanicalRecord(card, strategy) {
  return {
    ...card,
    card_name: normalizeCardName(card),
    strategy_id: strategy.strategy_id,
    strategy_label: strategy.label,
    strategy_importance: strategy.importance,
    strategy_inference: Array.isArray(strategy.inferred_from) ? strategy.inferred_from : [],
    mechanical_rank: numberOrNull(card.rank),
    mechanical_fit: card.mechanical_fit_label || null,
    mechanical_explanation: mechanicalExplanation(card),
    mechanical_confidence: numberOrNull(card.confidence),
    has_mechanical_evidence: true,
    has_community_evidence: false,
    community_evidence: embeddedCommunityEvidence(card),
    statistical_affinity: null,
    evidence_provenance: 'mechanical_only',
    branch_memberships: [strategy.strategy_id]
  };
}

function mergeCommunity(record, communityCard, gameChangerIds) {
  const evidence = mergeCommunityEvidence(explicitCommunityEvidence(communityCard), record.community_evidence);
  const merged = {
    ...communityCard,
    ...record,
    image_url: record.image_url || communityCard.image_url,
    card_name: record.card_name || normalizeCardName(communityCard),
    community_evidence: evidence,
    community_inclusion: evidence.inclusion,
    community_observation_count: evidence.observationCount,
    statistical_affinity: evidence.affinity,
    community_confidence: evidence.confidence,
    sample_size: evidence.totalDecks,
    has_community_evidence: true,
    evidence_provenance: record.has_mechanical_evidence ? 'both' : 'community_only',
    is_commander_game_changer: gameChangerIds.has(record.oracle_id)
  };
  merged.evidence_tier = evidenceTier(merged);
  return merged;
}

function strategyMetadata(strategy) {
  return {
    strategy_id: strategy.strategy_id,
    label: strategy.label,
    importance: strategy.importance,
    inferred_from: Array.isArray(strategy.inferred_from) ? strategy.inferred_from : [],
    candidate_pool_before_narrowing: strategy.candidate_pool_before_narrowing,
    semantic_pool: strategy.semantic_pool,
    final_qualified_pool: strategy.final_qualified_pool
  };
}

export function buildUnifiedCommanderRecommendations({
  mechanicalChemistry,
  communityRecommendations = [],
  gameChangers = [],
  orderingMode = ORDERING_MODES.EVIDENCE_TIERS
} = {}) {
  const strategies = Array.isArray(mechanicalChemistry?.strategies) ? mechanicalChemistry.strategies : [];
  const gameChangerIds = new Set(gameChangers.map((card) => card.oracle_id).filter(Boolean));
  const records = new Map();

  for (const strategy of strategies) {
    for (const card of strategy.recommendations || []) {
      if (!card?.oracle_id) continue;
      const candidate = buildMechanicalRecord(card, strategy);
      const preferred = preferredMechanicalRecord(records.get(card.oracle_id), candidate);
      const memberships = new Set([...(records.get(card.oracle_id)?.branch_memberships || []), strategy.strategy_id]);
      records.set(card.oracle_id, { ...preferred, branch_memberships: [...memberships] });
    }
  }

  for (const communityCard of communityRecommendations) {
    if (!communityCard?.oracle_id) continue;
    let record = records.get(communityCard.oracle_id);
    if (!record) {
      const matched = bestCommunityStrategy(strategies, communityCard.oracle_id);
      const presentationStrategy = matched ? null : bestPresentationStrategy(strategies, communityCard);
      const matchedStrategy = matched?.strategy || presentationStrategy;
      const qualifiedMechanicalMatch = matched?.match.strength === 0;
      const rankedEntry = qualifiedMechanicalMatch
        ? matchedStrategy?.diagnostics?.ranked?.[matched.match.position]
        : null;
      record = {
        ...communityCard,
        card_name: normalizeCardName(communityCard),
        strategy_id: matchedStrategy?.strategy_id || 'popular_support',
        strategy_label: matchedStrategy?.label || 'Popular Support',
        strategy_importance: matchedStrategy?.importance || 'Community Support',
        strategy_inference: matchedStrategy?.inferred_from || [],
        mechanical_rank: qualifiedMechanicalMatch ? matched.match.position + 1 : null,
        mechanical_score: numberOrNull(rankedEntry?.score),
        mechanical_fit: null,
        mechanical_explanation: communityOnlyExplanation(communityCard, matchedStrategy),
        mechanical_confidence: null,
        has_mechanical_evidence: qualifiedMechanicalMatch,
        has_community_evidence: false,
        community_evidence: embeddedCommunityEvidence(null),
        statistical_affinity: null,
        evidence_provenance: qualifiedMechanicalMatch ? 'both' : 'community_only',
        community_assignment: matched
          ? (matched.match.strength === 0 ? 'mechanical_below_display_cut' : 'semantic_retrieval_only')
          : (presentationStrategy ? 'oracle_presentation_match' : 'unassigned_popular_support'),
        branch_memberships: matchedStrategy ? [matchedStrategy.strategy_id] : ['popular_support']
      };
    }
    records.set(communityCard.oracle_id, mergeCommunity(record, communityCard, gameChangerIds));
  }

  for (const [oracleId, record] of records) {
    if (record.has_community_evidence) continue;
    const next = {
      ...record,
      is_commander_game_changer: gameChangerIds.has(oracleId),
      evidence_tier: evidenceTier(record)
    };
    records.set(oracleId, next);
  }

  const grouped = new Map();
  for (const record of records.values()) {
    const key = record.strategy_id || 'popular_support';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(record);
  }

  const strategyById = new Map(strategies.map((strategy) => [strategy.strategy_id, strategy]));
  const comparator = orderingComparator(orderingMode);
  const unifiedStrategies = [...grouped.entries()]
    .map(([strategyId, cards]) => {
      const strategy = strategyById.get(strategyId);
      return {
        ...(strategy ? strategyMetadata(strategy) : {
          strategy_id: 'popular_support',
          label: 'Popular Support',
          importance: 'Community Support',
          inferred_from: [],
          candidate_pool_before_narrowing: null,
          semantic_pool: null,
          final_qualified_pool: null
        }),
        recommendations: [...cards].sort(comparator)
      };
    })
    .sort((left, right) => {
      if (importanceRank(left.importance) !== importanceRank(right.importance)) {
        return importanceRank(left.importance) - importanceRank(right.importance);
      }
      return left.label.localeCompare(right.label);
    });

  const recommendations = unifiedStrategies.flatMap((strategy) => strategy.recommendations);
  const communityCount = communityRecommendations.filter((card) => card?.oracle_id).length;
  const bothCount = recommendations.filter((card) => card.evidence_provenance === 'both').length;
  const mechanicalOnlyCount = recommendations.filter((card) => card.evidence_provenance === 'mechanical_only').length;
  const communityOnlyCount = recommendations.filter((card) => card.evidence_provenance === 'community_only').length;

  return {
    ordering_mode: orderingMode,
    strategies: unifiedStrategies,
    recommendations,
    metrics: {
      mechanical_recommendations: recommendations.filter((card) => card.has_mechanical_evidence).length,
      community_recommendations: communityCount,
      overlap_count: bothCount,
      mechanical_only_count: mechanicalOnlyCount,
      community_only_count: communityOnlyCount,
      overlap_percent: communityCount > 0 ? bothCount / communityCount : null,
      duplicates_eliminated: Math.max(0, strategies.reduce((sum, strategy) => sum + (strategy.recommendations?.length || 0), 0) + communityCount - recommendations.length)
    }
  };
}

export function buildCommanderStrategySummary(commanderNames, strategies) {
  const name = Array.isArray(commanderNames) && commanderNames.length > 0 ? commanderNames.join(' and ') : 'This commander';
  const primary = strategies.filter((strategy) => strategy.importance === 'Primary').map((strategy) => strategy.label).slice(0, 3);
  const support = strategies
    .filter((strategy) => ['Secondary', 'Supporting'].includes(strategy.importance))
    .map((strategy) => strategy.label)
    .slice(0, 3);
  if (!primary.length) return `${name} has recommendations grouped by the jobs they perform in the deck.`;
  const primaryText = primary.length === 1 ? primary[0] : `${primary.slice(0, -1).join(', ')} and ${primary.at(-1)}`;
  const supportText = support.length === 0
    ? ''
    : `, with ${support.length === 1 ? support[0] : `${support.slice(0, -1).join(', ')} and ${support.at(-1)}`} as supporting strategies`;
  return `${name} primarily supports ${primaryText}${supportText}.`;
}

export function communityEvidenceText(card) {
  const evidence = card?.community_evidence || explicitCommunityEvidence(card);
  const deckCount = numberOrNull(evidence.deckCount);
  const totalDecks = numberOrNull(evidence.totalDecks);
  const inclusion = numberOrNull(evidence.inclusion);
  if (deckCount > 0 && totalDecks > 0) {
    if (totalDecks < 20) return `Seen in ${Math.round(deckCount)} of ${Math.round(totalDecks)} observed decks`;
    const percent = Math.round((inclusion ?? deckCount / totalDecks) * 100);
    return `Played in ${percent}% of observed decks · ${Math.round(deckCount)} of ${Math.round(totalDecks)}`;
  }
  if (deckCount > 0) return `Seen in ${Math.round(deckCount)} observed decks`;
  return '';
}

export { ORDERING_MODES };
