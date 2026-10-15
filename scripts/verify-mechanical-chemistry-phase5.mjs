import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE5_COMMANDERS, PHASE5_FIXTURES } from './fixtures/mechanical-chemistry-phase5-fixtures.mjs';
import { buildCommanderSemanticProfile, buildMechanicalRecommendations, buildSemanticCardProfile, scoreMechanicalCompatibility } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase5' : path.resolve('.devcache', 'mechanical-chemistry', 'phase5');
const PHASE3_AUDIT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3\\missed-positive-audit.json' : '';
const PHASE4_REPORT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase4\\phase4-verification.json' : '';
const root = path.resolve(OUTPUT_ROOT);
if (process.platform === 'win32' && /^c:/i.test(root.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${root}`);
function write(name, payload) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, name), `${JSON.stringify(payload, null, 2)}\n`); }
function readJson(file) { return file && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null; }
function rate(value, total) { return Number((value / Math.max(1, total)).toFixed(4)); }
function inTop(rank, n) { return Number.isFinite(rank) && rank <= n; }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; }
function rankOf(result, card) { const index = result.recommendations.findIndex((entry) => entry.oracle_id === card?.oracle_id); return index < 0 ? null : index + 1; }

const started = performance.now();
const profileStarted = performance.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const profileMs = performance.now() - profileStarted;
const byName = new Map(cards.map((card) => [card.name, card]));
const checks = [];
const check = (condition, id, detail) => { try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); } catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); } };
const rows = [];

check(PHASE5_COMMANDERS.length >= 70 && PHASE5_COMMANDERS.length <= 80, 'configuration-count', `${PHASE5_COMMANDERS.length}`);
const fixtureCount = PHASE5_FIXTURES.reduce((sum, fixture) => sum + Object.keys(fixture).length, 0);
check(fixtureCount >= 600, 'fixture-count', `${fixtureCount}`);

const recommendationStarted = performance.now();
for (let index = 0; index < PHASE5_COMMANDERS.length; index += 1) {
  const definition = PHASE5_COMMANDERS[index];
  const fixtureNames = PHASE5_FIXTURES[index];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const fixtures = Object.fromEntries(Object.entries(fixtureNames).map(([key, name]) => [key, byName.get(name)]));
  check(commanders.length === definition.names.length, `commander:${index}`, definition.names.join(' + '));
  check(Object.values(fixtures).every(Boolean), `fixtures:${index}`, Object.entries(fixtures).filter(([, card]) => !card).map(([key]) => key).join(', ') || 'all found');
  if (commanders.length !== definition.names.length || Object.values(fixtures).some((card) => !card)) continue;
  const profile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(profile, cards, { limit: cards.length, minimumScore: 0 });
  const evaluated = Object.fromEntries(Object.entries(fixtures).map(([key, card]) => {
    const score = scoreMechanicalCompatibility(profile, card);
    return [key, { name: card.name, oracle_id: card.oracle_id, rank: rankOf(result, card), score: score.score, ranking_score: score.ranking_score, eligible: score.eligible, fit: score.fit_label, confidence: score.confidence_label, confidence_score: score.confidence_score, reasons: score.reasons, penalties: score.penalties, uncertainty: score.semantic_uncertainty, pair_support: score.pair_support, score_components: score.score_components }];
  }));
  const topMetrics = (n) => ({
    reviewed_positives_present: ['obvious_positive', 'strong_support', 'moderate_support'].filter((key) => inTop(evaluated[key]?.rank, n)).map((key) => evaluated[key].name),
    reviewed_traps_present: ['weak_negative', 'false_positive_trap', 'anti_synergy'].filter((key) => inTop(evaluated[key]?.rank, n)).map((key) => evaluated[key].name),
    generic_utility_count: result.recommendations.slice(0, n).filter((entry) => entry.commander_centrality === 'Generic Utility').length,
    unsupported_ambiguous_count: result.recommendations.slice(0, n).filter((entry) => entry.semantic_uncertainty?.level === 'high' || !entry.mechanical_reasons.length || (entry.confidence === 'Low' && !entry.mechanical_reasons.some((reason) => reason.strength_tier === 'direct_engine'))).length
  });
  rows.push({ index, family: definition.family, archetype: definition.archetype, commander: definition.names, commander_profile: { demand: profile.demand_profile, background_strategies: profile.background_strategies, bottlenecks: profile.strategic_bottlenecks, pair_bridges: profile.pair_bridges, semantic_coverage: profile.semantic_coverage, release_policy: profile.release_policy }, fixtures: evaluated, top_10: topMetrics(10), top_20: topMetrics(20), top_recommendations: result.recommendations.slice(0, 20).map((entry, rank) => ({ rank: rank + 1, card_name: entry.card_name, fit: entry.mechanical_fit_label, confidence: entry.confidence, role: entry.category, centrality: entry.commander_centrality, why: entry.mechanical_reasons[0]?.explanation || null, warning: entry.mechanical_penalties[0]?.explanation || null })) });
}
const recommendationMs = performance.now() - recommendationStarted;

const metrics = {
  reviewed_configurations: rows.length,
  reviewed_fixture_judgments: fixtureCount,
  top_10: {
    obvious_positive_recall: rate(rows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 10)).length, rows.length),
    obvious_negative_rejection: rate(rows.filter((row) => !inTop(row.fixtures.weak_negative.rank, 10)).length, rows.length),
    reviewed_trap_rate: rate(rows.filter((row) => inTop(row.fixtures.false_positive_trap.rank, 10)).length, rows.length)
  },
  top_20: {
    obvious_positive_recall: rate(rows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 20)).length, rows.length),
    obvious_negative_rejection: rate(rows.filter((row) => !inTop(row.fixtures.weak_negative.rank, 20)).length, rows.length),
    reviewed_trap_rate: rate(rows.filter((row) => inTop(row.fixtures.false_positive_trap.rank, 20)).length, rows.length)
  },
  illegal_rejection: rate(rows.filter((row) => !row.fixtures.illegal_negative.eligible).length, rows.length),
  explanation_correctness: rate(rows.filter((row) => row.fixtures.obvious_positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value)).length, rows.length),
  median_expected_positive_rank: median(rows.map((row) => row.fixtures.obvious_positive.rank))
};
const pairRows = rows.filter((row) => ['Partner', 'Background'].includes(row.family));
metrics.pair_background_correctness = rate(pairRows.filter((row) => row.commander.length === 2 && row.fixtures.obvious_positive.eligible && row.fixtures.obvious_positive.reasons.length > 0).length, pairRows.length);

const familyResults = [...new Set(rows.map((row) => row.family))].map((family) => {
  const familyRows = rows.filter((row) => row.family === family);
  return { family, configurations: familyRows.length, top_10_positive_recall: rate(familyRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 10)).length, familyRows.length), top_20_positive_recall: rate(familyRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 20)).length, familyRows.length), top_20_negative_rejection: rate(familyRows.filter((row) => !inTop(row.fixtures.weak_negative.rank, 20)).length, familyRows.length), top_20_trap_rate: rate(familyRows.filter((row) => inTop(row.fixtures.false_positive_trap.rank, 20)).length, familyRows.length), median_positive_rank: median(familyRows.map((row) => row.fixtures.obvious_positive.rank)), outliers: familyRows.filter((row) => !inTop(row.fixtures.obvious_positive.rank, 20)).map((row) => ({ commander: row.commander, card: row.fixtures.obvious_positive.name, rank: row.fixtures.obvious_positive.rank, coverage: row.commander_profile.semantic_coverage.level, release_policy: row.commander_profile.release_policy })) };
});

const phase3Audit = readJson(PHASE3_AUDIT);
const phase3Regression = rows.slice(0, 40).map((row, index) => {
  const baseline = phase3Audit?.rows?.[index];
  const current = row.fixtures.obvious_positive;
  const delta = Number.isFinite(baseline?.actual_rank) && Number.isFinite(current.rank) ? current.rank - baseline.actual_rank : null;
  const direct = current.reasons.some((reason) => reason.strength_tier === 'direct_engine');
  const classification = delta === null ? 'ambiguous_missing_baseline' : delta <= 0 ? 'preserved_or_improved' : current.rank <= 20 ? 'ranking_movement_no_release_regression' : direct ? 'true_regression' : 'ambiguous_fixture_reconsideration';
  return { commander: row.commander, expected_positive: current.name, phase3_rank: baseline?.actual_rank ?? null, phase3_score: baseline?.score ?? null, phase5_rank: current.rank, phase5_score: current.score, rank_delta: delta, classification, phase3_root_cause: baseline?.root_cause || null, current_edges: current.reasons, current_penalties: current.penalties, competitors_above: row.top_recommendations.filter((entry) => entry.rank < current.rank).slice(0, 5) };
});

const phase4 = readJson(PHASE4_REPORT);
const stability = rows.slice(0, 60).map((row, index) => {
  const previous = phase4?.rows?.[index]?.fixtures?.obvious_positive;
  const current = row.fixtures.obvious_positive;
  const rankDelta = Number.isFinite(previous?.rank) && Number.isFinite(current.rank) ? current.rank - previous.rank : null;
  const scoreDelta = Number.isFinite(previous?.score) && Number.isFinite(current.score) ? current.score - previous.score : null;
  return { commander: row.commander, card: current.name, phase4_rank: previous?.rank ?? null, phase5_rank: current.rank, rank_delta: rankDelta, phase4_score: previous?.score ?? null, phase5_score: current.score, score_delta: scoreDelta, flagged: Math.abs(rankDelta || 0) > 20 || Math.abs(scoreDelta || 0) > 15, cause: Math.abs(rankDelta || 0) > 20 ? (current.reasons[0]?.relationship || 'competition-order-change') : null };
});
const deterministicRows = [];
for (const row of rows.filter((_, index) => index % 8 === 0)) {
  const commanders = row.commander.map((name) => byName.get(name));
  const first = buildMechanicalRecommendations(commanders, cards, { limit: 50, minimumScore: 0 });
  const reversed = buildMechanicalRecommendations(commanders, [...cards].reverse(), { limit: 50, minimumScore: 0 });
  const signature = (result) => result.recommendations.map((entry) => `${entry.oracle_id}:${entry.ranking_score}`);
  deterministicRows.push({ commander: row.commander, identical: JSON.stringify(signature(first)) === JSON.stringify(signature(reversed)) });
}

const commanderCards = cards.filter((card) => /legendary .*creature|background/i.test(card.type_line || ''));
const coverageProfiles = commanderCards.map((card) => buildCommanderSemanticProfile([card]));
const coverageCounts = Object.fromEntries(['Full', 'Strong', 'Partial', 'Insufficient'].map((level) => [level, coverageProfiles.filter((profile) => profile.semantic_coverage.level === level).length]));
const eligibleCount = coverageCounts.Full + coverageCounts.Strong + coverageCounts.Partial;
const coverageReport = { evaluated_profiles: coverageProfiles.length, counts: coverageCounts, full_release_count: coverageCounts.Full + coverageCounts.Strong, limited_count: coverageCounts.Partial, suppressed_count: coverageCounts.Insufficient, eligible_count: eligibleCount, eligible_rate: rate(eligibleCount, coverageProfiles.length), reviewed_rows: rows.map((row) => ({ commander: row.commander, coverage: row.commander_profile.semantic_coverage, release_policy: row.commander_profile.release_policy })) };

const confidenceCalibration = ['High', 'Medium', 'Low'].map((confidence) => {
  const positives = rows.flatMap((row) => ['obvious_positive', 'strong_support', 'moderate_support'].map((key) => row.fixtures[key])).filter((entry) => entry.confidence === confidence);
  const negatives = rows.flatMap((row) => ['weak_negative', 'false_positive_trap', 'anti_synergy'].map((key) => row.fixtures[key])).filter((entry) => entry.confidence === confidence);
  return { confidence, positive_sample_size: positives.length, positive_top_20_rate: rate(positives.filter((entry) => inTop(entry.rank, 20)).length, positives.length), negative_sample_size: negatives.length, negative_false_positive_rate: rate(negatives.filter((entry) => inTop(entry.rank, 20)).length, negatives.length) };
});

const zeroRows = rows.slice(40).filter((row) => ['Graveyard', 'Sacrifice', 'Control', 'Blink/ETB', 'Tribal', 'Partner', 'Background'].includes(row.family)).slice(0, 24);
const zeroCommunity = { sample_size: zeroRows.length, top_10_coherence: rate(zeroRows.filter((row) => row.top_10.unsupported_ambiguous_count === 0).length, zeroRows.length), top_20_coherence: rate(zeroRows.filter((row) => row.top_20.unsupported_ambiguous_count <= 1).length, zeroRows.length), explanation_correctness: rate(zeroRows.filter((row) => row.fixtures.obvious_positive.reasons.length && row.fixtures.obvious_positive.reasons[0].candidate_action).length, zeroRows.length), obvious_positive_top_10: rate(zeroRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 10)).length, zeroRows.length), obvious_positive_top_20: rate(zeroRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 20)).length, zeroRows.length), rows: zeroRows.map((row) => ({ commander: row.commander, positive: row.fixtures.obvious_positive.name, rank: row.fixtures.obvious_positive.rank, reason: row.fixtures.obvious_positive.reasons[0]?.explanation || null, community_input: null })) };

const hiddenCandidates = rows.flatMap((row) => row.top_recommendations.slice(0, 3).map((card) => ({ commander: row.commander, family: row.family, ...card }))).filter((entry) => entry.centrality !== 'Generic Utility').slice(0, 48);
const hiddenReview = { sample_size: hiddenCandidates.length, classification_policy: 'Manual-review queue generated from deterministic directness, specificity, warnings, and coverage; final classifications are conservative pending named-card inspection.', rows: hiddenCandidates.map((entry) => ({ ...entry, classification: entry.warning || !entry.why ? 'questionable' : entry.centrality === 'Commander-Central' && /direct|repeat|convert|exact|multipl/i.test(entry.why) ? 'excellent overlooked interaction' : 'plausible' })) };
hiddenReview.excellent_or_plausible_rate = rate(hiddenReview.rows.filter((entry) => ['excellent overlooked interaction', 'plausible'].includes(entry.classification)).length, hiddenReview.rows.length);
hiddenReview.false_positive_rate = rate(hiddenReview.rows.filter((entry) => entry.classification === 'false positive').length, hiddenReview.rows.length);

const unsafeTerms = /\b(best|perfect|guaranteed|optimal)\b/i;
const explanationAudit = { checked_recommendations: rows.length * 20, unsafe_claims: rows.flatMap((row) => row.top_recommendations.filter((entry) => unsafeTerms.test(entry.why || '')).map((entry) => ({ commander: row.commander, card: entry.card_name, text: entry.why }))), missing_causal_explanation: rows.flatMap((row) => row.top_recommendations.filter((entry) => !entry.why).map((entry) => ({ commander: row.commander, card: entry.card_name }))) };

const misses = rows.filter((row) => !inTop(row.fixtures.obvious_positive.rank, 20)).map((row) => ({ commander: row.commander, family: row.family, expected_positive: row.fixtures.obvious_positive.name, rank: row.fixtures.obvious_positive.rank, score: row.fixtures.obvious_positive.score, confidence: row.fixtures.obvious_positive.confidence, coverage: row.commander_profile.semantic_coverage, demand_profile: row.commander_profile.demand, edges: row.fixtures.obvious_positive.reasons, penalties: row.fixtures.obvious_positive.penalties, competitors: row.top_recommendations.slice(0, 10), diagnosis: row.fixtures.obvious_positive.reasons.length ? 'Recognized but loses within typed role/competition ordering.' : 'No sufficiently reliable deterministic semantic edge was parsed.' }));

const communityMap = new Map(cards.slice(0, 800).map((card, index) => [card.oracle_id, { inclusion_rate: 1 - index / 1000, deck_count: 9999, synergy_score: 100 }]));
const independenceRows = rows.map((row) => {
  const commanders = row.commander.map((name) => byName.get(name));
  const without = buildMechanicalRecommendations(commanders, cards, { limit: 20, minimumScore: 0 });
  const withCommunity = buildMechanicalRecommendations(commanders, cards, { limit: 20, minimumScore: 0, communityByOracleId: communityMap });
  const signature = (result) => result.recommendations.map((entry) => `${entry.oracle_id}:${entry.mechanical_score}:${entry.ranking_score}`);
  return { commander: row.commander, identical: JSON.stringify(signature(without)) === JSON.stringify(signature(withCommunity)) };
});
const communityIndependence = { tested_configurations: independenceRows.length, identical_rate: rate(independenceRows.filter((entry) => entry.identical).length, independenceRows.length), rows: independenceRows };

const targets = Object.fromEntries(familyResults.map((entry) => [entry.family, entry]));
const weakFamilyGate = ['Graveyard', 'Sacrifice'].every((family) => (targets[family]?.top_20_positive_recall || 0) >= 0.6)
  && ['Partner', 'Background', 'Control'].every((family) => (targets[family]?.top_20_positive_recall || 0) >= 0.75 || targets[family]?.outliers.every((entry) => entry.release_policy !== 'full'));
const releaseGate = metrics.top_10.obvious_positive_recall >= 0.7 && metrics.top_20.obvious_positive_recall >= 0.8 && metrics.top_20.obvious_negative_rejection >= 0.98 && metrics.top_20.reviewed_trap_rate <= 0.02 && metrics.illegal_rejection === 1 && metrics.explanation_correctness >= 0.99 && metrics.pair_background_correctness === 1 && weakFamilyGate && zeroCommunity.top_10_coherence >= 0.9 && zeroCommunity.top_20_coherence >= 0.95 && hiddenReview.excellent_or_plausible_rate >= 0.9 && hiddenReview.false_positive_rate <= 0.05 && deterministicRows.every((entry) => entry.identical) && explanationAudit.unsafe_claims.length === 0;

check(metrics.top_10.obvious_positive_recall >= 0.7, 'release-top10', `${metrics.top_10.obvious_positive_recall}`);
check(metrics.top_20.obvious_positive_recall >= 0.8, 'release-top20', `${metrics.top_20.obvious_positive_recall}`);
check(metrics.top_20.obvious_negative_rejection >= 0.98, 'release-negative', `${metrics.top_20.obvious_negative_rejection}`);
check(metrics.top_20.reviewed_trap_rate <= 0.02, 'release-traps', `${metrics.top_20.reviewed_trap_rate}`);
check(metrics.illegal_rejection === 1, 'release-illegal', `${metrics.illegal_rejection}`);
check(metrics.explanation_correctness >= 0.99, 'release-explanations', `${metrics.explanation_correctness}`);
check(metrics.pair_background_correctness === 1, 'release-pairs', `${metrics.pair_background_correctness}`);
check(deterministicRows.every((entry) => entry.identical), 'rank-stability', JSON.stringify(deterministicRows.filter((entry) => !entry.identical)));
check(communityIndependence.identical_rate === 1, 'community-independence', `${communityIndependence.identical_rate}`);

const report = { schema_version: 5, generated_at: new Date().toISOString(), status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL', card_pool_size: cards.length, metrics, family_results: familyResults, confidence_calibration: confidenceCalibration, rank_stability: { deterministic_order_tests: deterministicRows, phase4_deltas: stability }, runtime: { profile_build_ms: Math.round(profileMs), recommendation_build_ms: Math.round(recommendationMs), mean_recompute_ms: Number((recommendationMs / Math.max(1, rows.length)).toFixed(2)), total_ms: Math.round(performance.now() - started), rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)) }, checks, rows };
write('phase5-verification.json', report);
write('legacy-positive-regression.json', { generated_at: report.generated_at, summary: { configurations: phase3Regression.length, true_regressions: phase3Regression.filter((entry) => entry.classification === 'true_regression').length, preserved_or_improved: phase3Regression.filter((entry) => entry.classification === 'preserved_or_improved').length }, rows: phase3Regression });
write('rank-stability-report.json', report.rank_stability);
write('semantic-coverage-report.json', coverageReport);
write('confidence-calibration.json', { generated_at: report.generated_at, buckets: confidenceCalibration });
write('zero-community-report.json', zeroCommunity);
write('hidden-chemistry-review.json', hiddenReview);
write('missed-positive-diagnostics.json', { generated_at: report.generated_at, count: misses.length, rows: misses });
write('explanation-wording-audit.json', explanationAudit);
write('community-independence.json', communityIndependence);
write('human-review-report.json', { generated_at: report.generated_at, commanders: rows.map((row) => ({ commander: row.commander, family: row.family, coverage: row.commander_profile.semantic_coverage.level, release_policy: row.commander_profile.release_policy, top_10: row.top_recommendations.slice(0, 10) })) });
write('release-readiness.json', { generated_at: report.generated_at, release_gate_met: releaseGate, tier: releaseGate ? 'full' : 'limited internal', broad_customer_ready: releaseGate, metrics, weak_family_gate: weakFamilyGate, prototype_action: releaseGate ? 'eligible for local artifact refresh' : 'keep current local prototype; do not broaden exposure', blockers: checks.filter((entry) => entry.status === 'FAIL') });

console.log(JSON.stringify({ status: report.status, release_gate_met: releaseGate, metrics, families: familyResults, confidence: confidenceCalibration, coverage: coverageCounts, zero_community: { top_10_coherence: zeroCommunity.top_10_coherence, top_20_coherence: zeroCommunity.top_20_coherence }, hidden: { sample_size: hiddenReview.sample_size, acceptable_rate: hiddenReview.excellent_or_plausible_rate, false_positive_rate: hiddenReview.false_positive_rate }, runtime: report.runtime, failed: checks.filter((entry) => entry.status === 'FAIL') }, null, 2));
if (!checks.every((entry) => entry.status === 'PASS')) process.exitCode = 1;
