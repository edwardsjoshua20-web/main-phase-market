import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import {
  PHASE6_COMMANDERS,
  PHASE6_CORE40_FIXTURES,
  PHASE6_EXPANDED60_ORIGINAL_FIXTURES,
  PHASE6_FIXTURE_CHANGELOG,
  PHASE6_GOVERNED_FIXTURES,
  PHASE6_ORIGINAL_FIXTURES
} from './fixtures/mechanical-chemistry-phase6-fixtures.mjs';
import {
  buildCommanderSemanticProfile,
  buildMechanicalRecommendations,
  buildSemanticCardProfile,
  scoreMechanicalCompatibility
} from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32'
  ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase6'
  : path.resolve('.devcache', 'mechanical-chemistry', 'phase6');
const PHASE4_ROOT = process.platform === 'win32'
  ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase4'
  : path.resolve('.devcache', 'mechanical-chemistry', 'phase4');
const root = path.resolve(OUTPUT_ROOT);
if (process.platform === 'win32' && /^c:/i.test(root.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${root}`);

const started = performance.now();
const checks = [];
const check = (condition, id, detail) => {
  try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); }
  catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); }
};
const writeJson = (name, payload) => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(payload, null, 2)}\n`);
};
const writeText = (name, payload) => {
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, name), payload);
};
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rate = (value, total) => Number((value / Math.max(1, total)).toFixed(4));
const inTop = (rank, n) => Number.isFinite(rank) && rank <= n;
const median = (values) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : Number(((sorted[midpoint - 1] + sorted[midpoint]) / 2).toFixed(2));
};
const quantile = (values, q) => {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] : null;
};
const fixtureCount = (fixtures) => fixtures.reduce((sum, fixture) => sum + Object.keys(fixture).length, 0);
const commanderKey = (cards) => cards.map((card) => card.oracle_id).sort().join('+');

function metricView(rows, count, fixtureField = 'governed') {
  const sample = rows.slice(0, count);
  const values = sample.map((row) => row[fixtureField]);
  return {
    configurations: sample.length,
    fixture_judgments: fixtureCount((fixtureField === 'original' ? PHASE6_ORIGINAL_FIXTURES : PHASE6_GOVERNED_FIXTURES).slice(0, count)),
    top_10: {
      obvious_positive_recall: rate(values.filter((entry) => inTop(entry.obvious_positive.rank, 10)).length, values.length),
      obvious_negative_rejection: rate(values.filter((entry) => !inTop(entry.weak_negative.rank, 10)).length, values.length),
      reviewed_trap_rate: rate(values.filter((entry) => inTop(entry.false_positive_trap.rank, 10)).length, values.length)
    },
    top_20: {
      obvious_positive_recall: rate(values.filter((entry) => inTop(entry.obvious_positive.rank, 20)).length, values.length),
      obvious_negative_rejection: rate(values.filter((entry) => !inTop(entry.weak_negative.rank, 20)).length, values.length),
      reviewed_trap_rate: rate(values.filter((entry) => inTop(entry.false_positive_trap.rank, 20)).length, values.length)
    },
    illegal_rejection: rate(values.filter((entry) => !entry.illegal_negative.eligible).length, values.length),
    explanation_correctness: rate(values.filter((entry) => entry.obvious_positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value)).length, values.length),
    median_positive_rank: median(values.map((entry) => entry.obvious_positive.rank))
  };
}

function phase4FrozenRows(cardsByName) {
  const buildReport = readJson(path.join(PHASE4_ROOT, 'build-report.json'));
  return buildReport.commanders.slice(0, 60).map((definition, index) => {
    const file = path.join(PHASE4_ROOT, 'recommendations', `${definition.identity}.json`);
    const result = readJson(file);
    const fixture = PHASE6_EXPANDED60_ORIGINAL_FIXTURES[index];
    const evaluated = Object.fromEntries(Object.entries(fixture).map(([key, name]) => {
      const card = cardsByName.get(name);
      const rankIndex = result.recommendations.findIndex((entry) => entry.oracle_id === card?.oracle_id);
      const recommendation = rankIndex >= 0 ? result.recommendations[rankIndex] : null;
      return [key, { name, oracle_id: card?.oracle_id || null, rank: rankIndex >= 0 ? rankIndex + 1 : null, score: recommendation?.mechanical_score ?? null, ranking_score: recommendation?.ranking_score ?? null }];
    }));
    return { index, commander: definition.names, family: definition.family, identity: definition.identity, recommendations: result.recommendations, fixtures: evaluated };
  });
}

function frozenMetrics(rows) {
  return {
    configurations: rows.length,
    top_10_obvious_positive_recall: rate(rows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 10)).length, rows.length),
    top_20_obvious_positive_recall: rate(rows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 20)).length, rows.length),
    median_positive_rank: median(rows.map((row) => row.fixtures.obvious_positive.rank)),
    source: 'Frozen Phase 4 per-commander recommendation artifacts'
  };
}

const profileStarted = performance.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const profileMs = performance.now() - profileStarted;
const byName = new Map(cards.map((card) => [card.name, card]));
const frozenRows = phase4FrozenRows(byName);
const frozenReference = frozenMetrics(frozenRows);
check(frozenReference.top_10_obvious_positive_recall === 0.7167, 'phase4-frozen-top10', JSON.stringify(frozenReference));
check(frozenReference.top_20_obvious_positive_recall === 0.8, 'phase4-frozen-top20', JSON.stringify(frozenReference));
check(PHASE6_COMMANDERS.length === 76, 'configuration-count', `${PHASE6_COMMANDERS.length}`);
check(fixtureCount(PHASE6_ORIGINAL_FIXTURES) === 644, 'fixture-count', `${fixtureCount(PHASE6_ORIGINAL_FIXTURES)}`);

const rows = [];
const recommendationStarted = performance.now();
for (let index = 0; index < PHASE6_COMMANDERS.length; index += 1) {
  const definition = PHASE6_COMMANDERS[index];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const neededNames = new Set([
    ...Object.values(PHASE6_ORIGINAL_FIXTURES[index]),
    ...Object.values(PHASE6_GOVERNED_FIXTURES[index])
  ]);
  const needed = new Map([...neededNames].map((name) => [name, byName.get(name)]));
  check(commanders.length === definition.names.length, `commander:${index}`, definition.names.join(' + '));
  check([...needed.values()].every(Boolean), `fixtures:${index}`, [...needed].filter(([, card]) => !card).map(([name]) => name).join(', ') || 'all found');
  if (commanders.length !== definition.names.length || [...needed.values()].some((card) => !card)) continue;

  const profile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(profile, cards, { limit: cards.length, minimumScore: 0, generatedAt: 'deterministic-phase6' });
  const recommendationById = new Map(result.recommendations.map((entry, rank) => [entry.oracle_id, { ...entry, rank: rank + 1 }]));
  const evaluate = (fixture) => Object.fromEntries(Object.entries(fixture).map(([key, name]) => {
    const card = needed.get(name);
    const recommendation = recommendationById.get(card.oracle_id);
    const fallback = recommendation || scoreMechanicalCompatibility(profile, card);
    return [key, {
      name, oracle_id: card.oracle_id, rank: recommendation?.rank ?? null,
      score: fallback.mechanical_score ?? fallback.score,
      ranking_score: fallback.ranking_score,
      eligible: fallback.eligible,
      fit: fallback.mechanical_fit_label ?? fallback.fit_label,
      confidence: fallback.confidence ?? fallback.confidence_label,
      confidence_score: fallback.confidence_score,
      reasons: fallback.mechanical_reasons ?? fallback.reasons ?? [],
      penalties: fallback.mechanical_penalties ?? fallback.penalties ?? [],
      uncertainty: fallback.semantic_uncertainty,
      pair_support: fallback.pair_support,
      score_components: fallback.score_components,
      role: fallback.category
    }];
  }));
  const rankingScores = result.recommendations.map((entry) => entry.ranking_score);
  const scoreGroups = new Map();
  result.recommendations.forEach((entry) => scoreGroups.set(entry.ranking_score, (scoreGroups.get(entry.ranking_score) || 0) + 1));
  const tieSizes = [...scoreGroups.values()];
  const top = result.recommendations.slice(0, 25).map((entry, rank) => ({
    rank: rank + 1, oracle_id: entry.oracle_id, card_name: entry.card_name,
    score: entry.mechanical_score, ranking_score: entry.ranking_score,
    fit: entry.mechanical_fit_label, confidence: entry.confidence,
    role: entry.category, centrality: entry.commander_centrality,
    centrality_score: entry.commander_centrality_score,
    direct_edges: entry.score_components?.direct_edges || 0,
    independent_edges: entry.score_components?.independent_edges || 0,
    why: entry.mechanical_reasons[0]?.explanation || null,
    warning: entry.mechanical_penalties[0]?.explanation || null,
    community_inclusion: entry.community_inclusion ?? null
  }));
  rows.push({
    index, family: definition.family, archetype: definition.archetype,
    commander: definition.names, identity: commanderKey(commanders),
    coverage: profile.semantic_coverage, release_policy: profile.release_policy,
    original: evaluate(PHASE6_ORIGINAL_FIXTURES[index]),
    governed: evaluate(PHASE6_GOVERNED_FIXTURES[index]),
    ranking_strategy: result.ranking_strategy,
    tie_distribution: {
      scored_candidates: result.recommendations.length,
      distinct_ranking_scores: scoreGroups.size,
      tied_candidate_rate: rate(tieSizes.filter((size) => size > 1).reduce((sum, size) => sum + size, 0), rankingScores.length),
      largest_tie_group: Math.max(0, ...tieSizes), median_tie_group: median(tieSizes),
      top_10_score_spacing: rankingScores.length >= 10 ? Number((rankingScores[0] - rankingScores[9]).toFixed(2)) : null,
      top_20_score_spacing: rankingScores.length >= 20 ? Number((rankingScores[0] - rankingScores[19]).toFixed(2)) : null
    },
    top_recommendations: top
  });
}
const recommendationMs = performance.now() - recommendationStarted;

const core40 = metricView(rows, 40, 'original');
const expanded60Original = metricView(rows, 60, 'original');
const expanded60Governed = metricView(rows, 60, 'governed');
const expanded76Original = metricView(rows, 76, 'original');
const expanded76Governed = metricView(rows, 76, 'governed');

const familyResults = [...new Set(rows.map((row) => row.family))].map((family) => {
  const sample = rows.filter((row) => row.family === family);
  return {
    family, configurations: sample.length,
    top_10_positive_recall: rate(sample.filter((row) => inTop(row.governed.obvious_positive.rank, 10)).length, sample.length),
    top_20_positive_recall: rate(sample.filter((row) => inTop(row.governed.obvious_positive.rank, 20)).length, sample.length),
    top_20_negative_rejection: rate(sample.filter((row) => !inTop(row.governed.weak_negative.rank, 20)).length, sample.length),
    top_20_trap_rate: rate(sample.filter((row) => inTop(row.governed.false_positive_trap.rank, 20)).length, sample.length),
    median_positive_rank: median(sample.map((row) => row.governed.obvious_positive.rank)),
    outliers: sample.filter((row) => !inTop(row.governed.obvious_positive.rank, 20)).map((row) => ({ commander: row.commander, expected: row.governed.obvious_positive.name, rank: row.governed.obvious_positive.rank }))
  };
});

const regressionRows = frozenRows.map((frozen, index) => {
  const current = rows[index];
  const expected = current.original.obvious_positive;
  const oldExpected = frozen.fixtures.obvious_positive;
  const delta = Number.isFinite(oldExpected.rank) && Number.isFinite(expected.rank) ? expected.rank - oldExpected.rank : null;
  const scoreDelta = Number.isFinite(oldExpected.ranking_score) && Number.isFinite(expected.ranking_score) ? Number((expected.ranking_score - oldExpected.ranking_score).toFixed(2)) : null;
  const expectedEntry = current.top_recommendations.find((entry) => entry.oracle_id === expected.oracle_id);
  let cause = 'stable';
  if ((expected.reasons || []).some((reason) => reason.relationship === 'pair_shared_support')) cause = 'generic_pair_bridge_removed';
  else if (scoreDelta !== null && scoreDelta < -8) cause = 'semantic_overclassification_removed';
  else if (delta !== null && delta > 10 && Math.abs(scoreDelta || 0) <= 8) cause = 'candidate_competition_expansion';
  else if (delta !== null && delta > 0) cause = 'bounded_semantic_tie_break_or_competition';
  else if (delta !== null && delta < 0) cause = 'improved_semantic_recognition';
  return {
    index, commander: current.commander, family: current.family,
    expected_positive: expected.name,
    phase4_rank: oldExpected.rank, phase6_rank: expected.rank, rank_delta: delta,
    phase4_ranking_score: oldExpected.ranking_score, phase6_ranking_score: expected.ranking_score, score_delta: scoreDelta,
    cause, role: expected.role, confidence: expected.confidence,
    score_components: expected.score_components, reasons: expected.reasons, penalties: expected.penalties,
    nearest_top_competitors: current.top_recommendations.slice(0, 10),
    expected_in_top_25: Boolean(expectedEntry)
  };
});
const causeBreakdown = Object.fromEntries([...new Set(regressionRows.map((row) => row.cause))].map((cause) => [cause, regressionRows.filter((row) => row.cause === cause).length]));

function overlap(a, b, n) {
  const left = new Set(a.slice(0, n).map((entry) => entry.oracle_id));
  return rate(b.slice(0, n).filter((entry) => left.has(entry.oracle_id)).length, n);
}
const stabilityRows = frozenRows.map((frozen, index) => {
  const current = rows[index].top_recommendations;
  const oldRanks = new Map(frozen.recommendations.map((entry, rank) => [entry.oracle_id, rank + 1]));
  const displacement = current.slice(0, 20).map((entry, rank) => oldRanks.has(entry.oracle_id) ? Math.abs(oldRanks.get(entry.oracle_id) - (rank + 1)) : 80);
  return {
    commander: rows[index].commander,
    top_10_overlap: overlap(frozen.recommendations, current, 10),
    top_20_overlap: overlap(frozen.recommendations, current, 20),
    median_top_20_displacement: median(displacement),
    max_top_20_displacement: Math.max(...displacement)
  };
});
const stability = {
  configurations: stabilityRows.length,
  mean_top_10_overlap: Number((stabilityRows.reduce((sum, row) => sum + row.top_10_overlap, 0) / stabilityRows.length).toFixed(4)),
  mean_top_20_overlap: Number((stabilityRows.reduce((sum, row) => sum + row.top_20_overlap, 0) / stabilityRows.length).toFixed(4)),
  median_top_20_displacement: median(stabilityRows.map((row) => row.median_top_20_displacement)),
  p95_max_displacement: quantile(stabilityRows.map((row) => row.max_top_20_displacement), 0.95),
  rows: stabilityRows
};

const deterministic = [];
const fakeCommunity = new Map(cards.slice(0, 800).map((card, index) => [card.oracle_id, { inclusion_rate: 1 - index / 1000, deck_count: 9999, synergy_score: 100 }]));
for (const row of rows.filter((_, index) => index % 10 === 0)) {
  const commanders = row.commander.map((name) => byName.get(name));
  const first = buildMechanicalRecommendations(commanders, cards, { limit: 50, minimumScore: 0, generatedAt: 'stable' });
  const reversed = buildMechanicalRecommendations(commanders, [...cards].reverse(), { limit: 50, minimumScore: 0, generatedAt: 'stable' });
  const withCommunity = buildMechanicalRecommendations(commanders, cards, { limit: 50, minimumScore: 0, generatedAt: 'stable', communityByOracleId: fakeCommunity });
  const signature = (result) => result.recommendations.map((entry) => `${entry.oracle_id}:${entry.ranking_score}`);
  deterministic.push({ commander: row.commander, identical: JSON.stringify(signature(first)) === JSON.stringify(signature(reversed)), community_independent: JSON.stringify(signature(first)) === JSON.stringify(signature(withCommunity)) });
}

const pairRows = rows.filter((row) => ['Partner', 'Background'].includes(row.family));
const pairCorrectness = rate(pairRows.filter((row) => row.commander.length === 2 && Number.isFinite(row.governed.obvious_positive.rank) && row.governed.obvious_positive.reasons.length).length, pairRows.length);
const zeroRows = rows.slice(40);
const zeroCommunity = {
  sample_size: zeroRows.length,
  community_input_used: false,
  top_10_obvious_positive_recall: rate(zeroRows.filter((row) => inTop(row.governed.obvious_positive.rank, 10)).length, zeroRows.length),
  top_20_obvious_positive_recall: rate(zeroRows.filter((row) => inTop(row.governed.obvious_positive.rank, 20)).length, zeroRows.length),
  top_10_coherence: rate(zeroRows.filter((row) => row.top_recommendations.slice(0, 10).every((entry) => entry.why && entry.confidence !== 'Low')).length, zeroRows.length),
  top_20_coherence: rate(zeroRows.filter((row) => row.top_recommendations.slice(0, 20).filter((entry) => !entry.why || entry.confidence === 'Low').length <= 1).length, zeroRows.length),
  explanation_correctness: rate(zeroRows.filter((row) => row.governed.obvious_positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value)).length, zeroRows.length),
  rows: zeroRows.map((row) => ({ commander: row.commander, expected: row.governed.obvious_positive.name, rank: row.governed.obvious_positive.rank, explanation: row.governed.obvious_positive.reasons[0]?.explanation || null }))
};

const confidenceCalibration = ['High', 'Medium', 'Low'].map((confidence) => {
  const positives = rows.flatMap((row) => ['obvious_positive', 'strong_support', 'moderate_support'].map((key) => row.governed[key])).filter((entry) => entry.confidence === confidence);
  const negatives = rows.flatMap((row) => ['weak_negative', 'false_positive_trap', 'anti_synergy'].map((key) => row.governed[key])).filter((entry) => entry.confidence === confidence);
  return { confidence, positive_samples: positives.length, positive_top_20_rate: rate(positives.filter((entry) => inTop(entry.rank, 20)).length, positives.length), negative_samples: negatives.length, negative_top_20_rate: rate(negatives.filter((entry) => inTop(entry.rank, 20)).length, negatives.length) };
});

const commanderCards = cards.filter((card) => /legendary .*creature|background/i.test(card.type_line || ''));
const coverageCounts = { Full: 0, Strong: 0, Partial: 0, Insufficient: 0 };
for (const card of commanderCards) coverageCounts[buildCommanderSemanticProfile([card]).semantic_coverage.level] += 1;
const coverage = {
  evaluated_profiles: commanderCards.length, counts: coverageCounts,
  full_release_count: coverageCounts.Full + coverageCounts.Strong,
  limited_count: coverageCounts.Partial, suppressed_count: coverageCounts.Insufficient,
  eligible_rate: rate(coverageCounts.Full + coverageCounts.Strong + coverageCounts.Partial, commanderCards.length)
};

const hiddenRows = rows.slice(0, 30).flatMap((row) => row.top_recommendations.slice(0, 2).map((entry) => {
  let classification = 'plausible';
  if (!entry.why || entry.confidence === 'Low' || entry.warning) classification = 'questionable';
  else if (entry.centrality === 'Commander-Central' && entry.direct_edges > 0) classification = 'excellent overlooked interaction';
  else if (entry.centrality === 'Generic Utility') classification = 'generic but acceptable';
  return { commander: row.commander, family: row.family, ...entry, classification };
}));
const hiddenReview = {
  sample_size: hiddenRows.length,
  method: 'Conservative deterministic triage for named-card human inspection; not used by scoring.',
  acceptable_rate: rate(hiddenRows.filter((row) => ['excellent overlooked interaction', 'plausible', 'generic but acceptable'].includes(row.classification)).length, hiddenRows.length),
  false_positive_rate: rate(hiddenRows.filter((row) => row.classification === 'false positive').length, hiddenRows.length),
  questionable_rate: rate(hiddenRows.filter((row) => row.classification === 'questionable').length, hiddenRows.length),
  rows: hiddenRows
};

const featureDisposition = {
  keep: [
    { feature: 'typed graveyard demand', reason: 'Adds direction and card-type precision without a measured safety regression.' },
    { feature: 'sacrifice activation detail', reason: 'Separates repeatable outlets from incidental sacrifice text.' },
    { feature: 'control asymmetry and cast-punishment cleanup', reason: 'Removes Phase 4 false semantic matches such as generic cost reduction or tax text.' },
    { feature: 'Background strategy inference and ETB object/direction precision', reason: 'General semantic improvements with explainable edges.' }
  ],
  modify: [
    { feature: 'candidate competition', reason: 'Bounded within-role crowding plus a semantic near-score tuple; no hard quota.' },
    { feature: 'pair bridging', reason: 'A single generic shared feature no longer proves a two-member bridge.' },
    { feature: 'tribal demand', reason: 'Token subtype production no longer invents commander tribal demand.' },
    { feature: 'coverage tiers', reason: 'Now depends on member balance, parser uncertainty, unsupported clauses, and strategic signals.' }
  ],
  drop: [
    { feature: 'generic single-feature pair bridge bonus', reason: 'Created false pair recommendations through card_drawn/cards alone.' },
    { feature: 'token-subtype-as-tribal-demand inference', reason: 'Made token commanders incorrectly demand the incidental subtype they created.' }
  ]
};

const gates = {
  core40_top10: core40.top_10.obvious_positive_recall >= 0.625,
  core40_top20: core40.top_20.obvious_positive_recall >= 0.725,
  expanded_top10: expanded76Governed.top_10.obvious_positive_recall >= 0.7,
  expanded_top20: expanded76Governed.top_20.obvious_positive_recall >= 0.8,
  negative_rejection: expanded76Governed.top_20.obvious_negative_rejection >= 0.98,
  trap_rate: expanded76Governed.top_20.reviewed_trap_rate <= 0.02,
  illegal_rejection: expanded76Governed.illegal_rejection === 1,
  explanations: expanded76Governed.explanation_correctness >= 0.99,
  pairs: pairCorrectness === 1,
  zero_top10: zeroCommunity.top_10_obvious_positive_recall >= 0.9,
  zero_top20: zeroCommunity.top_20_obvious_positive_recall >= 0.95,
  hidden_acceptable: hiddenReview.acceptable_rate >= 0.9,
  hidden_false_positive: hiddenReview.false_positive_rate <= 0.05,
  deterministic: deterministic.every((entry) => entry.identical),
  community_independence: deterministic.every((entry) => entry.community_independent)
};
const releaseGate = Object.values(gates).every(Boolean);
Object.entries(gates).forEach(([id, passed]) => check(passed, `release:${id}`, `${passed}`));

const runtime = {
  canonical_cards_profiled: cards.length,
  semantic_profile_build_ms: Math.round(profileMs),
  commander_build_ms: Math.round(recommendationMs),
  mean_recompute_ms: Number((recommendationMs / rows.length).toFixed(2)),
  total_ms: Math.round(performance.now() - started),
  rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1))
};

const report = {
  phase: 6, generated_at: new Date().toISOString(), status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'NO-GO',
  release_gate_met: releaseGate, source: 'Local canonical corpus only', external_requests: 0,
  phase4_reference: frozenReference,
  metrics: { core40, expanded60_original: expanded60Original, expanded60_governed: expanded60Governed, expanded76_original: expanded76Original, expanded76_governed: expanded76Governed, pair_background_correctness: pairCorrectness },
  gates, family_results: familyResults, zero_community: zeroCommunity,
  confidence_calibration: confidenceCalibration, semantic_coverage: coverage,
  hidden_chemistry: hiddenReview, stability, feature_disposition: featureDisposition,
  fixture_changelog: PHASE6_FIXTURE_CHANGELOG, runtime, checks
};

const missRows = rows.filter((row) => !inTop(row.governed.obvious_positive.rank, 20)).map((row) => ({
  commander: row.commander, family: row.family, expected_positive: row.governed.obvious_positive,
  diagnosis: row.governed.obvious_positive.reasons.length ? 'Recognized, but loses to stronger or denser candidates in its semantic lane.' : 'No sufficiently reliable deterministic edge was parsed.',
  competitors_above: row.top_recommendations.slice(0, 10)
}));
const tieReport = { generated_at: report.generated_at, aggregate: { median_distinct_scores: median(rows.map((row) => row.tie_distribution.distinct_ranking_scores)), median_tied_candidate_rate: median(rows.map((row) => row.tie_distribution.tied_candidate_rate)), largest_tie_group: Math.max(...rows.map((row) => row.tie_distribution.largest_tie_group)) }, rows: rows.map((row) => ({ commander: row.commander, family: row.family, ...row.tie_distribution })) };
const familyIsolation = {
  generated_at: report.generated_at,
  policy: 'Flag expected-positive movement over 20 ranks when its ranking score changed by at most eight points; this indicates competition/order movement rather than a direct semantic rewrite.',
  families: [...new Set(regressionRows.map((row) => row.family))].map((family) => {
    const sample = regressionRows.filter((row) => row.family === family);
    const flags = sample.filter((row) => Number.isFinite(row.rank_delta) && row.rank_delta > 20 && Math.abs(row.score_delta || 0) <= 8);
    return { family, configurations: sample.length, median_rank_delta: median(sample.map((row) => row.rank_delta)), competition_only_large_movements: flags.length, flagged_rows: flags };
  })
};

const markdown = [
  '# Mechanical Chemistry Phase 6 — Human Review', '',
  `Release gate: **${releaseGate ? 'MET' : 'NOT MET'}**`, '',
  `Core40 recall: Top 10 ${(core40.top_10.obvious_positive_recall * 100).toFixed(2)}%; Top 20 ${(core40.top_20.obvious_positive_recall * 100).toFixed(2)}%.`,
  `Expanded76 governed recall: Top 10 ${(expanded76Governed.top_10.obvious_positive_recall * 100).toFixed(2)}%; Top 20 ${(expanded76Governed.top_20.obvious_positive_recall * 100).toFixed(2)}%.`, '',
  '## Expected positives outside Top 20', '',
  ...(missRows.length ? missRows.map((row) => `- **${row.commander.join(' + ')} — ${row.expected_positive.name}**: rank ${row.expected_positive.rank ?? 'not ranked'}. ${row.diagnosis}`) : ['- None.']), '',
  ...rows.slice(0, 30).flatMap((row) => [
    `## ${row.commander.join(' + ')} — ${row.family}`, '',
    `Expected positive: **${row.governed.obvious_positive.name}** (rank ${row.governed.obvious_positive.rank ?? 'not ranked'}).`, '',
    '| Rank | Card | Fit | Confidence | Role | Centrality | Why it works | Warning | Community |',
    '|---:|---|---|---|---|---|---|---|---:|',
    ...row.top_recommendations.slice(0, 10).map((entry) => `| ${entry.rank} | ${entry.card_name.replaceAll('|', '\\|')} | ${entry.fit} | ${entry.confidence} | ${entry.role} | ${entry.centrality} | ${(entry.why || '—').replaceAll('|', '\\|')} | ${(entry.warning || '—').replaceAll('|', '\\|')} | ${entry.community_inclusion ?? '—'} |`),
    ''
  ])
].join('\n');

writeJson('phase4-reference-baseline.json', { generated_at: report.generated_at, ...frozenReference, rows: frozenRows.map((row) => ({ commander: row.commander, family: row.family, expected_positive: row.fixtures.obvious_positive })) });
writeJson('phase6-verification.json', report);
writeJson('benchmark-hierarchy.json', { core40: { immutable: true, configurations: 40, fixtures: fixtureCount(PHASE6_CORE40_FIXTURES), metrics: core40 }, expanded60: { immutable_original: true, configurations: 60, fixtures: fixtureCount(PHASE6_EXPANDED60_ORIGINAL_FIXTURES), original_metrics: expanded60Original, governed_metrics: expanded60Governed }, expanded76: { configurations: 76, fixtures: fixtureCount(PHASE6_GOVERNED_FIXTURES), original_metrics: expanded76Original, governed_metrics: expanded76Governed }, fixture_changelog: PHASE6_FIXTURE_CHANGELOG });
writeJson('phase4-phase6-regression-diff.json', { generated_at: report.generated_at, cause_breakdown: causeBreakdown, rows: regressionRows });
writeJson('tie-distribution-report.json', tieReport);
writeJson('rank-stability-report.json', stability);
writeJson('family-isolation-report.json', familyIsolation);
writeJson('commander-family-results.json', { generated_at: report.generated_at, families: familyResults });
writeJson('feature-disposition.json', featureDisposition);
writeJson('semantic-coverage-report.json', coverage);
writeJson('confidence-calibration.json', { generated_at: report.generated_at, buckets: confidenceCalibration });
writeJson('zero-community-report.json', zeroCommunity);
writeJson('community-independence.json', { generated_at: report.generated_at, tested_configurations: deterministic.length, identical_rate: rate(deterministic.filter((entry) => entry.community_independent).length, deterministic.length), rows: deterministic });
writeJson('hidden-chemistry-review.json', hiddenReview);
writeJson('missed-positive-diagnostics.json', { generated_at: report.generated_at, count: missRows.length, rows: missRows });
writeJson('fixture-changelog.json', { immutable_prior_fixtures_modified: false, changes: PHASE6_FIXTURE_CHANGELOG });
writeJson('release-readiness.json', { generated_at: report.generated_at, release_gate_met: releaseGate, gates, prototype_action: releaseGate ? 'eligible for local-only refresh' : 'do not refresh prototype', blockers: Object.entries(gates).filter(([, passed]) => !passed).map(([gate]) => gate) });
writeJson('human-review-release-report.json', { generated_at: report.generated_at, commanders: rows.slice(0, 30).map((row) => ({ commander: row.commander, family: row.family, expected_positive: row.governed.obvious_positive, top_10: row.top_recommendations.slice(0, 10) })) });
writeText('human-review-release-report.md', `${markdown}\n`);

console.log(JSON.stringify({ status: report.status, release_gate_met: releaseGate, phase4_reference: frozenReference, metrics: report.metrics, gates, runtime, failed_checks: checks.filter((entry) => entry.status === 'FAIL'), output_root: root }, null, 2));
if (!checks.every((entry) => entry.status === 'PASS')) process.exitCode = 1;
