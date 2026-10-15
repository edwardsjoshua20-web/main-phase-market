import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE5_COMMANDERS, PHASE5_FIXTURES } from './fixtures/mechanical-chemistry-phase5-fixtures.mjs';
import { buildMechanicalRecommendations, buildSemanticCardProfile } from '../src/services/commander/mechanicalChemistryCore.js';

const rawCards = loadCanonicalCards();
const byName = new Map(rawCards.map((card) => [card.name, card]));
const cards = rawCards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));

function tier(card) {
  const values = card.mechanical_reasons.map((edge) => ({ direct_engine: 4, strong_support: 3, conditional_support: 2, generic_utility: 1, weak_thematic_overlap: 0 }[edge.strength_tier] || 0));
  return Math.max(0, ...values);
}

function directEdges(card) {
  return card.mechanical_reasons.filter((edge) => edge.strength_tier === 'direct_engine');
}

function strongEdges(card) {
  return card.mechanical_reasons.filter((edge) => edge.strength_tier === 'strong_support');
}

function penaltyBurden(card, relationship) {
  return Math.abs(card.mechanical_penalties.filter((penalty) => !relationship || penalty.relationship === relationship).reduce((sum, penalty) => sum + Number(penalty.weight || 0), 0));
}

function compareQuality(a, b) {
  const left = [tier(a), directEdges(a).length, strongEdges(a).length, a.commander_centrality_score, a.confidence_score, a.delivery?.reliability || 0, -penaltyBurden(a, 'anti_synergy'), -a.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(a.score_components?.effective_cost || 0), a.ranking_score, a.mechanical_score];
  const right = [tier(b), directEdges(b).length, strongEdges(b).length, b.commander_centrality_score, b.confidence_score, b.delivery?.reliability || 0, -penaltyBurden(b, 'anti_synergy'), -b.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(b.score_components?.effective_cost || 0), b.ranking_score, b.mechanical_score];
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return right[index] - left[index];
  return String(a.oracle_id).localeCompare(String(b.oracle_id));
}

function groupKey(card) {
  const primary = card.mechanical_reasons.find((edge) => edge.strength_tier === 'direct_engine') || card.mechanical_reasons[0];
  const feature = String(primary?.feature || 'utility').split('->')[0].split(':')[0];
  return `${tier(card)}:${card.category}:${feature}`;
}

const phase5Relationships = new Set([
  'typed_graveyard_demand', 'typed_etb_alignment', 'exact_tribal_payoff', 'exceptional_single_member_support',
  'universal_tribal_conversion', 'control_tax_alignment', 'interaction_reward_alignment', 'sacrifice_demand_alignment',
  'activated_ability_reuse', 'pair_contribution_quality', 'sacrifice_activation_alignment', 'combat_damage_multiplier_alignment',
  'commander_self_etb_reuse', 'background_granted_etb_reuse', 'commander_self_etb_multiplier', 'background_granted_etb_multiplier'
]);

function policyScore(card, scale = 1) {
  const added = Object.entries(card.score_components?.relationship_totals || {}).filter(([relationship]) => phase5Relationships.has(relationship)).reduce((sum, [, weight]) => sum + Number(weight || 0), 0);
  return Number((card.ranking_score - added * (1 - scale)).toFixed(2));
}

function specificityScore(card, scale = 1) {
  return Number((card.ranking_score - Number(card.score_components?.specificity_bonus || 0) * (1 - scale)).toFixed(2));
}

function specificityRanking(candidates, scale, crowdingPenalty = 0) {
  const groups = new Map();
  for (const card of [...candidates].sort((a, b) => specificityScore(b, scale) - specificityScore(a, scale) || b.mechanical_score - a.mechanical_score || a.cmc - b.cmc || String(a.oracle_id).localeCompare(String(b.oracle_id)))) {
    const key = groupKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const result = [];
  while (result.length < candidates.length) {
    const available = [...groups.values()].map((rows) => rows[0] && ({ card: rows[0], rows, adjusted: specificityScore(rows[0], scale) - (rows.selected || 0) * crowdingPenalty })).filter(Boolean)
      .sort((a, b) => b.adjusted - a.adjusted || String(a.card.oracle_id).localeCompare(String(b.card.oracle_id)));
    if (!available.length) break;
    const winner = available[0];
    result.push(winner.rows.shift());
    winner.rows.selected = (winner.rows.selected || 0) + 1;
  }
  return result;
}

function policyRanking(candidates, scale, crowdingPenalty = 0) {
  const groups = new Map();
  for (const card of [...candidates].sort((a, b) => policyScore(b, scale) - policyScore(a, scale) || b.mechanical_score - a.mechanical_score || a.cmc - b.cmc || String(a.oracle_id).localeCompare(String(b.oracle_id)))) {
    const key = groupKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const result = [];
  while (result.length < candidates.length) {
    const available = [...groups.values()].map((rows) => rows[0] && ({ card: rows[0], rows, adjusted: policyScore(rows[0], scale) - (rows.selected || 0) * crowdingPenalty })).filter(Boolean)
      .sort((a, b) => b.adjusted - a.adjusted || String(a.card.oracle_id).localeCompare(String(b.card.oracle_id)));
    if (!available.length) break;
    const winner = available[0];
    result.push(winner.rows.shift());
    winner.rows.selected = (winner.rows.selected || 0) + 1;
  }
  return result;
}

function tupleCompare(a, b, bucketSize) {
  const bucketA = Math.floor(a.ranking_score / bucketSize);
  const bucketB = Math.floor(b.ranking_score / bucketSize);
  if (bucketA !== bucketB) return bucketB - bucketA;
  const left = [a.commander_centrality_score, a.score_components?.direct_edges || 0, a.confidence_score, a.score_components?.independent_edges || 0, a.delivery?.reliability || 0, -a.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(a.score_components?.effective_cost || 0), a.ranking_score, a.mechanical_score];
  const right = [b.commander_centrality_score, b.score_components?.direct_edges || 0, b.confidence_score, b.score_components?.independent_edges || 0, b.delivery?.reliability || 0, -b.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(b.score_components?.effective_cost || 0), b.ranking_score, b.mechanical_score];
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return right[index] - left[index];
  return String(a.oracle_id).localeCompare(String(b.oracle_id));
}

function tupleRanking(candidates, bucketSize, crowdingPenalty = 0) {
  const groups = new Map();
  for (const card of [...candidates].sort((a, b) => tupleCompare(a, b, bucketSize))) {
    const key = groupKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const result = [];
  while (result.length < candidates.length) {
    const available = [...groups.values()].map((rows) => rows[0] && ({ card: rows[0], rows, adjusted: rows[0].ranking_score - (rows.selected || 0) * crowdingPenalty })).filter(Boolean)
      .sort((a, b) => {
        const bucketA = Math.floor(a.adjusted / bucketSize);
        const bucketB = Math.floor(b.adjusted / bucketSize);
        return bucketB - bucketA || tupleCompare(a.card, b.card, bucketSize);
      });
    if (!available.length) break;
    const winner = available[0];
    result.push(winner.rows.shift());
    winner.rows.selected = (winner.rows.selected || 0) + 1;
  }
  return result;
}

function hybridRanking(candidates) {
  const scalar = diversifiedRanking(candidates, 4);
  const tuple = tupleRanking(candidates, 8, 4);
  const head = scalar.slice(0, 10);
  const selected = new Set(head);
  for (const card of tuple) {
    if (head.length >= 20) break;
    if (!selected.has(card)) { head.push(card); selected.add(card); }
  }
  return [...head, ...scalar.filter((card) => !selected.has(card))];
}

function diversifiedRanking(candidates, crowdingPenalty = 0) {
  const groups = new Map();
  for (const card of [...candidates].sort((a, b) => b.ranking_score - a.ranking_score || b.mechanical_score - a.mechanical_score || a.cmc - b.cmc || String(a.oracle_id).localeCompare(String(b.oracle_id)))) {
    const key = groupKey(card);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(card);
  }
  const result = [];
  while (result.length < candidates.length) {
    const available = [...groups.values()].map((rows) => rows[0] && ({ card: rows[0], rows, adjusted: rows[0].ranking_score - (rows.selected || 0) * crowdingPenalty })).filter(Boolean)
      .sort((a, b) => b.adjusted - a.adjusted || b.card.ranking_score - a.card.ranking_score || String(a.card.oracle_id).localeCompare(String(b.card.oracle_id)));
    if (!available.length) break;
    const winner = available[0];
    result.push(winner.rows.shift());
    winner.rows.selected = (winner.rows.selected || 0) + 1;
  }
  return result;
}

function quotaRanking(candidates, limits = { top10Category: 3, top10Group: 2, top20Category: 5, top20Group: 4 }) {
  const source = [...candidates].sort((a, b) => b.ranking_score - a.ranking_score || b.mechanical_score - a.mechanical_score || a.cmc - b.cmc || String(a.oracle_id).localeCompare(String(b.oracle_id)));
  const chosen = [];
  const remaining = new Set(source);
  const categoryCounts = new Map();
  const groupCounts = new Map();
  const fill = (target, categoryLimit, groupLimit) => {
    for (const card of source) {
      if (chosen.length >= target) break;
      if (!remaining.has(card)) continue;
      const group = groupKey(card);
      if ((categoryCounts.get(card.category) || 0) >= categoryLimit || (groupCounts.get(group) || 0) >= groupLimit) continue;
      chosen.push(card);
      remaining.delete(card);
      categoryCounts.set(card.category, (categoryCounts.get(card.category) || 0) + 1);
      groupCounts.set(group, (groupCounts.get(group) || 0) + 1);
    }
  };
  fill(10, limits.top10Category, limits.top10Group);
  fill(20, limits.top20Category, limits.top20Group);
  return [...chosen, ...source.filter((card) => remaining.has(card))];
}

const penalties = [0, 4, 8, 12, 16, 20, 30, 40];
const totals = new Map(penalties.map((penalty) => [penalty, { top10: 0, top20: 0 }]));
const quotaOptions = {
  q1: { top10Category: 3, top10Group: 2, top20Category: 5, top20Group: 4 },
  q2: { top10Category: 4, top10Group: 3, top20Category: 6, top20Group: 5 },
  q3: { top10Category: 3, top10Group: 3, top20Category: 6, top20Group: 5 },
};
const quotaTotals = new Map(Object.keys(quotaOptions).map((key) => [key, { top10: 0, top20: 0 }]));
const policyOptions = { drop: [0, 0], drop_crowd4: [0, 4], quarter: [0.25, 0], quarter_crowd4: [0.25, 4], half: [0.5, 0], half_crowd4: [0.5, 4] };
const policyTotals = new Map(Object.keys(policyOptions).map((key) => [key, { top10: 0, top20: 0 }]));
const tupleOptions = { b2: [2, 0], b4: [4, 0], b6: [6, 0], b8: [8, 0], b10: [10, 0], b4c4: [4, 4], b6c4: [6, 4], b8c4: [8, 4] };
const tupleTotals = new Map(Object.keys(tupleOptions).map((key) => [key, { top10: 0, top20: 0 }]));
const specificityOptions = { s0: [0, 0], s0c4: [0, 4], s25: [0.25, 0], s25c4: [0.25, 4], s50: [0.5, 0], s50c4: [0.5, 4], s75c4: [0.75, 4] };
const specificityTotals = new Map(Object.keys(specificityOptions).map((key) => [key, { top10: 0, top20: 0 }]));
const layerTotals = { core40: { count: 0, current10: 0, current20: 0, crowd4_10: 0, crowd4_20: 0, tuple10: 0, tuple20: 0 }, expanded60: { count: 0, current10: 0, current20: 0, crowd4_10: 0, crowd4_20: 0, tuple10: 0, tuple20: 0 }, all76: { count: 0, current10: 0, current20: 0, crowd4_10: 0, crowd4_20: 0, tuple10: 0, tuple20: 0 } };
for (const value of Object.values(layerTotals)) { value.hybrid10 = 0; value.hybrid20 = 0; }
const familyTotals = new Map();
let positiveCount = 0;
const rows = [];
for (let index = 0; index < PHASE5_COMMANDERS.length; index += 1) {
  const definition = PHASE5_COMMANDERS[index];
  const fixture = PHASE5_FIXTURES[index];
  const commanders = definition.names.map((name) => byName.get(name));
  const result = buildMechanicalRecommendations(commanders, cards, { limit: 5000, minimumScore: 16 });
  const variants = new Map(penalties.map((penalty) => [penalty, diversifiedRanking(result.recommendations, penalty)]));
  const quotaVariants = new Map(Object.entries(quotaOptions).map(([key, limits]) => [key, quotaRanking(result.recommendations, limits)]));
  const policyVariants = new Map(Object.entries(policyOptions).map(([key, [scale, crowding]]) => [key, policyRanking(result.recommendations, scale, crowding)]));
  const tupleVariants = new Map(Object.entries(tupleOptions).map(([key, [bucket, crowding]]) => [key, tupleRanking(result.recommendations, bucket, crowding)]));
  const hybrid = hybridRanking(result.recommendations);
  const specificityVariants = new Map(Object.entries(specificityOptions).map(([key, [scale, crowding]]) => [key, specificityRanking(result.recommendations, scale, crowding)]));
  const positives = Array.isArray(fixture.obvious_positive) ? fixture.obvious_positive : [fixture.obvious_positive];
  for (const name of positives.filter(Boolean)) {
    positiveCount += 1;
    const currentRank = result.recommendations.findIndex((card) => card.card_name === name) + 1 || null;
    const ranks = Object.fromEntries(penalties.map((penalty) => [penalty, variants.get(penalty).findIndex((card) => card.card_name === name) + 1 || null]));
    const quotaRanks = Object.fromEntries([...quotaVariants].map(([key, ranked]) => [key, ranked.findIndex((card) => card.card_name === name) + 1 || null]));
    const policyRanks = Object.fromEntries([...policyVariants].map(([key, ranked]) => [key, ranked.findIndex((card) => card.card_name === name) + 1 || null]));
    const tupleRanks = Object.fromEntries([...tupleVariants].map(([key, ranked]) => [key, ranked.findIndex((card) => card.card_name === name) + 1 || null]));
    const hybridRank = hybrid.findIndex((card) => card.card_name === name) + 1 || null;
    const specificityRanks = Object.fromEntries([...specificityVariants].map(([key, ranked]) => [key, ranked.findIndex((card) => card.card_name === name) + 1 || null]));
    for (const penalty of penalties) {
      if (ranks[penalty] && ranks[penalty] <= 10) totals.get(penalty).top10 += 1;
      if (ranks[penalty] && ranks[penalty] <= 20) totals.get(penalty).top20 += 1;
    }
    for (const key of Object.keys(quotaOptions)) {
      if (quotaRanks[key] && quotaRanks[key] <= 10) quotaTotals.get(key).top10 += 1;
      if (quotaRanks[key] && quotaRanks[key] <= 20) quotaTotals.get(key).top20 += 1;
    }
    for (const key of Object.keys(policyOptions)) {
      if (policyRanks[key] && policyRanks[key] <= 10) policyTotals.get(key).top10 += 1;
      if (policyRanks[key] && policyRanks[key] <= 20) policyTotals.get(key).top20 += 1;
    }
    for (const key of Object.keys(tupleOptions)) {
      if (tupleRanks[key] && tupleRanks[key] <= 10) tupleTotals.get(key).top10 += 1;
      if (tupleRanks[key] && tupleRanks[key] <= 20) tupleTotals.get(key).top20 += 1;
    }
    for (const key of Object.keys(specificityOptions)) {
      if (specificityRanks[key] && specificityRanks[key] <= 10) specificityTotals.get(key).top10 += 1;
      if (specificityRanks[key] && specificityRanks[key] <= 20) specificityTotals.get(key).top20 += 1;
    }
    const layers = ['all76', ...(index < 60 ? ['expanded60'] : []), ...(index < 40 ? ['core40'] : [])];
    for (const layer of layers) {
      const bucket = layerTotals[layer];
      bucket.count += 1;
      if (currentRank && currentRank <= 10) bucket.current10 += 1;
      if (currentRank && currentRank <= 20) bucket.current20 += 1;
      if (ranks[4] && ranks[4] <= 10) bucket.crowd4_10 += 1;
      if (ranks[4] && ranks[4] <= 20) bucket.crowd4_20 += 1;
      if (tupleRanks.b8c4 && tupleRanks.b8c4 <= 10) bucket.tuple10 += 1;
      if (tupleRanks.b8c4 && tupleRanks.b8c4 <= 20) bucket.tuple20 += 1;
      if (hybridRank && hybridRank <= 10) bucket.hybrid10 += 1;
      if (hybridRank && hybridRank <= 20) bucket.hybrid20 += 1;
    }
    const family = familyTotals.get(definition.family) || { count: 0, current10: 0, current20: 0, crowd4_10: 0, crowd4_20: 0, tuple10: 0, tuple20: 0, hybrid10: 0, hybrid20: 0 };
    family.count += 1;
    if (currentRank && currentRank <= 10) family.current10 += 1;
    if (currentRank && currentRank <= 20) family.current20 += 1;
    if (ranks[4] && ranks[4] <= 10) family.crowd4_10 += 1;
    if (ranks[4] && ranks[4] <= 20) family.crowd4_20 += 1;
    if (tupleRanks.b8c4 && tupleRanks.b8c4 <= 10) family.tuple10 += 1;
    if (tupleRanks.b8c4 && tupleRanks.b8c4 <= 20) family.tuple20 += 1;
    if (hybridRank && hybridRank <= 10) family.hybrid10 += 1;
    if (hybridRank && hybridRank <= 20) family.hybrid20 += 1;
    familyTotals.set(definition.family, family);
    rows.push({ commander: definition.names, family: definition.family, card: name, current_rank: currentRank, proposed_ranks: ranks, quota_ranks: quotaRanks, policy_ranks: policyRanks, tuple_ranks: tupleRanks, hybrid_rank: hybridRank, specificity_ranks: specificityRanks });
  }
}

const normalize = (entry) => Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, key === 'count' ? value : Number((value / entry.count).toFixed(4))]));
const output = { configurations: PHASE5_COMMANDERS.length, positives: positiveCount, variants: Object.fromEntries(penalties.map((penalty) => [penalty, { top_10: totals.get(penalty).top10 / positiveCount, top_20: totals.get(penalty).top20 / positiveCount }])), quotas: Object.fromEntries(Object.keys(quotaOptions).map((key) => [key, { top_10: quotaTotals.get(key).top10 / positiveCount, top_20: quotaTotals.get(key).top20 / positiveCount }])), policies: Object.fromEntries(Object.keys(policyOptions).map((key) => [key, { top_10: policyTotals.get(key).top10 / positiveCount, top_20: policyTotals.get(key).top20 / positiveCount }])), tuples: Object.fromEntries(Object.keys(tupleOptions).map((key) => [key, { top_10: tupleTotals.get(key).top10 / positiveCount, top_20: tupleTotals.get(key).top20 / positiveCount }])), specificity: Object.fromEntries(Object.keys(specificityOptions).map((key) => [key, { top_10: specificityTotals.get(key).top10 / positiveCount, top_20: specificityTotals.get(key).top20 / positiveCount }])), layers: Object.fromEntries(Object.entries(layerTotals).map(([key, value]) => [key, normalize(value)])), families: Object.fromEntries([...familyTotals].map(([key, value]) => [key, normalize(value)])) };
if (process.argv.includes('--rows')) output.rows = rows;
console.log(JSON.stringify(output, null, 2));
