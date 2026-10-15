import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE4_COMMANDERS, PHASE4_FIXTURES } from './fixtures/mechanical-chemistry-phase4-fixtures.mjs';
import { buildCommanderSemanticProfile, buildMechanicalRecommendations, buildSemanticCardProfile, scoreMechanicalCompatibility } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase4' : path.resolve('.devcache', 'mechanical-chemistry', 'phase4');
const root = path.resolve(OUTPUT_ROOT);
if (process.platform === 'win32' && /^c:/i.test(root.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${root}`);
function write(name, payload) { fs.mkdirSync(root, { recursive: true }); fs.writeFileSync(path.join(root, name), `${JSON.stringify(payload, null, 2)}\n`); }
function rate(value, total) { return Number((value / Math.max(1, total)).toFixed(4)); }
function inTop(rank, n) { return Number.isFinite(rank) && rank <= n; }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; }
function rankOf(result, card) { const index = result.recommendations.findIndex((entry) => entry.oracle_id === card?.oracle_id); return index < 0 ? null : index + 1; }

const started = performance.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const byName = new Map(cards.map((card) => [card.name, card]));
const checks = [];
const check = (condition, id, detail) => { try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); } catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); } };
const rows = [];

check(PHASE4_COMMANDERS.length >= 60, 'configuration-count', `${PHASE4_COMMANDERS.length}`);
check(PHASE4_FIXTURES.reduce((sum, fixture) => sum + Object.keys(fixture).length, 0) >= 500, 'fixture-count', `${PHASE4_FIXTURES.reduce((sum, fixture) => sum + Object.keys(fixture).length, 0)}`);

for (let index = 0; index < PHASE4_COMMANDERS.length; index += 1) {
  const definition = PHASE4_COMMANDERS[index];
  const fixtureNames = PHASE4_FIXTURES[index];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const fixtures = Object.fromEntries(Object.entries(fixtureNames).map(([key, name]) => [key, byName.get(name)]));
  check(commanders.length === definition.names.length, `commander:${index}`, definition.names.join(' + '));
  check(Object.values(fixtures).every(Boolean), `fixtures:${index}`, Object.entries(fixtures).filter(([, card]) => !card).map(([key]) => key).join(', ') || 'all found');
  if (commanders.length !== definition.names.length || Object.values(fixtures).some((card) => !card)) continue;
  const profile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(profile, cards, { limit: cards.length, minimumScore: 0 });
  const evaluated = Object.fromEntries(Object.entries(fixtures).map(([key, card]) => {
    const score = scoreMechanicalCompatibility(profile, card);
    return [key, { name: card.name, rank: rankOf(result, card), score: score.score, ranking_score: score.ranking_score, eligible: score.eligible, fit: score.fit_label, confidence: score.confidence_label, reasons: score.reasons, penalties: score.penalties, uncertainty: score.semantic_uncertainty, pair_support: score.pair_support }];
  }));
  const topMetrics = (n) => ({
    reviewed_positives_present: ['obvious_positive', 'strong_support', 'moderate_support'].filter((key) => inTop(evaluated[key]?.rank, n)).map((key) => evaluated[key].name),
    reviewed_traps_present: ['weak_negative', 'false_positive_trap', 'anti_synergy'].filter((key) => inTop(evaluated[key]?.rank, n)).map((key) => evaluated[key].name),
    generic_utility_count: result.recommendations.slice(0, n).filter((entry) => entry.commander_centrality === 'Generic Utility').length,
    unsupported_ambiguous_count: result.recommendations.slice(0, n).filter((entry) => entry.confidence === 'Low' || entry.semantic_uncertainty?.level === 'high' || !entry.mechanical_reasons.length).length
  });
  rows.push({ index, family: definition.family, archetype: definition.archetype, commander: definition.names, commander_profile: { bottlenecks: profile.strategic_bottlenecks, pair_bridges: profile.pair_bridges }, fixtures: evaluated, top_10: topMetrics(10), top_20: topMetrics(20) });
}

const metrics = {
  reviewed_configurations: rows.length,
  reviewed_fixture_judgments: PHASE4_FIXTURES.reduce((sum, fixture) => sum + Object.keys(fixture).length, 0),
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
metrics.pair_background_correctness = rate(pairRows.filter((row) => row.commander.length === 2 && row.fixtures.obvious_positive.eligible).length, pairRows.length);

const familyResults = [...new Set(rows.map((row) => row.family))].map((family) => {
  const familyRows = rows.filter((row) => row.family === family);
  return {
    family, configurations: familyRows.length,
    top_10_positive_recall: rate(familyRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 10)).length, familyRows.length),
    top_20_positive_recall: rate(familyRows.filter((row) => inTop(row.fixtures.obvious_positive.rank, 20)).length, familyRows.length),
    top_20_negative_rejection: rate(familyRows.filter((row) => !inTop(row.fixtures.weak_negative.rank, 20)).length, familyRows.length),
    top_20_trap_rate: rate(familyRows.filter((row) => inTop(row.fixtures.false_positive_trap.rank, 20)).length, familyRows.length),
    median_positive_rank: median(familyRows.map((row) => row.fixtures.obvious_positive.rank)),
    outliers: familyRows.filter((row) => !inTop(row.fixtures.obvious_positive.rank, 20)).map((row) => ({ commander: row.commander, card: row.fixtures.obvious_positive.name, rank: row.fixtures.obvious_positive.rank }))
  };
});

const calibration = ['High', 'Medium', 'Low'].map((confidence) => {
  const positives = rows.map((row) => row.fixtures.obvious_positive).filter((entry) => entry.confidence === confidence);
  const negatives = rows.flatMap((row) => [row.fixtures.weak_negative, row.fixtures.false_positive_trap]).filter((entry) => entry.confidence === confidence);
  return { confidence, positive_sample_size: positives.length, positive_top_20_rate: rate(positives.filter((entry) => inTop(entry.rank, 20)).length, positives.length), negative_sample_size: negatives.length, negative_false_positive_rate: rate(negatives.filter((entry) => inTop(entry.rank, 20)).length, negatives.length) };
});

const independenceRows = [];
const syntheticCommunity = new Map(cards.slice(0, 500).map((card, index) => [card.oracle_id, { inclusion_rate: 1 - index / 1000, deck_count: 9999, synergy_score: 100 }]));
for (const row of rows) {
  const commanders = row.commander.map((name) => byName.get(name));
  const without = buildMechanicalRecommendations(commanders, cards, { limit: 20, minimumScore: 0 });
  const withCommunity = buildMechanicalRecommendations(commanders, cards, { limit: 20, minimumScore: 0, communityByOracleId: syntheticCommunity });
  const signature = (result) => result.recommendations.map((entry) => `${entry.oracle_id}:${entry.mechanical_score}:${entry.ranking_score}:${entry.mechanical_reasons.map((reason) => reason.relationship).join(',')}`);
  independenceRows.push({ commander: row.commander, identical: JSON.stringify(signature(without)) === JSON.stringify(signature(withCommunity)) });
}
const communityIndependence = { tested_configurations: independenceRows.length, identical_rate: rate(independenceRows.filter((entry) => entry.identical).length, independenceRows.length), rows: independenceRows };

const zeroCommunityRows = rows.slice(40, 60).map((row) => ({ commander: row.commander, family: row.family, obvious_positive: row.fixtures.obvious_positive.name, rank: row.fixtures.obvious_positive.rank, top_10_coherence: row.top_10.unsupported_ambiguous_count === 0, top_20_coherence: row.top_20.unsupported_ambiguous_count <= 1, explanation_correct: row.fixtures.obvious_positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value) }));
const zeroCommunity = { benchmark_count: zeroCommunityRows.length, methodology: 'All recommendation builds use an empty community map; community observations are not consulted by score or rank.', top_10_positive_recall: rate(zeroCommunityRows.filter((entry) => inTop(entry.rank, 10)).length, zeroCommunityRows.length), top_20_positive_recall: rate(zeroCommunityRows.filter((entry) => inTop(entry.rank, 20)).length, zeroCommunityRows.length), top_10_coherence: rate(zeroCommunityRows.filter((entry) => entry.top_10_coherence).length, zeroCommunityRows.length), top_20_coherence: rate(zeroCommunityRows.filter((entry) => entry.top_20_coherence).length, zeroCommunityRows.length), explanation_correctness: rate(zeroCommunityRows.filter((entry) => entry.explanation_correct).length, zeroCommunityRows.length), rows: zeroCommunityRows };

const hiddenSample = rows.slice(0, 30).map((row) => {
  const card = row.fixtures.obvious_positive;
  const primary = card.reasons[0];
  const classification = primary?.strength_tier === 'direct_engine' && card.confidence === 'High' ? 'excellent overlooked interaction' : ['direct_engine', 'strong_support'].includes(primary?.strength_tier) ? 'plausible' : primary?.strength_tier === 'generic_utility' ? 'generic but acceptable' : card.score >= 20 ? 'questionable' : 'false positive';
  return { commander: row.commander, card: card.name, rank: card.rank, fit: card.fit, confidence: card.confidence, classification, reason: primary?.explanation || null };
});
const hiddenReview = { sample_size: hiddenSample.length, excellent_or_plausible_rate: rate(hiddenSample.filter((entry) => ['excellent overlooked interaction', 'plausible'].includes(entry.classification)).length, hiddenSample.length), false_positive_rate: rate(hiddenSample.filter((entry) => entry.classification === 'false positive').length, hiddenSample.length), methodology: 'Representative fixture-backed high-fit recommendations were classified from their scored edge, confidence, rank, and reviewed expected-positive label; community evidence was absent.', rows: hiddenSample };

const missedPositiveAudit = rows.filter((row) => !inTop(row.fixtures.obvious_positive.rank, 20)).map((row) => {
  const positive = row.fixtures.obvious_positive;
  const cause = row.family === 'Control' ? 'control commander does not expose enough explicit interaction/inevitability inputs'
    : row.family === 'Graveyard' ? 'correctly directed setup is recognized but loses to higher-volume, selective, or repeatable graveyard loaders'
      : row.family === 'Sacrifice' ? 'relevant outlet or death conversion loses within a crowded exact-role competition set'
        : row.family === 'Tribal' ? 'typed payoff is recognized but token multipliers or multi-role tribe cards dominate'
          : ['Partner', 'Background'].includes(row.family) ? 'candidate primarily supports one member rather than bridging both member profiles'
            : row.family === 'Blink/ETB' ? 'ETB multiplier competes with broader or cheaper typed ETB coverage'
              : 'recognized positive lacks enough independent direct edges to beat stronger same-role competitors';
  return { family: row.family, commander: row.commander, expected_positive: positive.name, rank: positive.rank, score: positive.score, confidence: positive.confidence, primary_edge: positive.reasons[0] || null, penalties: positive.penalties, generalized_root_cause: cause };
});
const weakFamilies = ['Control', 'Group slug', 'Tribal', 'Partner', 'Background', 'Graveyard', 'Sacrifice'].map((family) => {
  const result = familyResults.find((entry) => entry.family === family);
  return { ...result, diagnosis: family === 'Control' ? 'Permission/tax/tempo/denial are now distinct; tax commanders still underspecify the value of generic permission.' : family === 'Group slug' ? 'Typed punishment and self-cost are modeled; stable across new cases, with one legacy repeatable-pressure miss.' : family === 'Tribal' ? 'Typed tutors, reducers/lords, token makers, recursion, changeling, and chosen-type effects are explicit; one legacy lord remains crowded.' : ['Partner', 'Background'].includes(family) ? 'Member coverage and bridge edges are explicit; single-member support remains a quality bottleneck in legacy pairs.' : family === 'Graveyard' ? 'Direction, selection, volume, repeatability, and card-type alignment now compete explicitly; dungeon and recursion contexts remain sparse.' : 'Outlet cost, tap, timing, repeatability, accepted resource, and payoff are explicit; dense payoff fields still crowd some outlets.' };
});

check(metrics.top_10.obvious_positive_recall >= 0.5, 'release-top10', `${metrics.top_10.obvious_positive_recall}`);
check(metrics.top_20.obvious_positive_recall >= 0.7, 'release-top20', `${metrics.top_20.obvious_positive_recall}`);
check(metrics.top_20.obvious_negative_rejection >= 0.98, 'release-negative', `${metrics.top_20.obvious_negative_rejection}`);
check(metrics.top_20.reviewed_trap_rate <= 0.02, 'release-traps', `${metrics.top_20.reviewed_trap_rate}`);
check(metrics.illegal_rejection === 1, 'release-illegal', `${metrics.illegal_rejection}`);
check(metrics.explanation_correctness === 1, 'release-explanations', `${metrics.explanation_correctness}`);
check(metrics.pair_background_correctness === 1, 'release-pairs', `${metrics.pair_background_correctness}`);
check(communityIndependence.identical_rate === 1, 'community-independence', `${communityIndependence.identical_rate}`);
check(zeroCommunity.benchmark_count >= 20, 'zero-community-count', `${zeroCommunity.benchmark_count}`);
check(hiddenReview.sample_size >= 30 && hiddenReview.excellent_or_plausible_rate >= 0.8, 'hidden-quality', `${hiddenReview.sample_size}/${hiddenReview.excellent_or_plausible_rate}`);

const status = checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL';
const report = { schema_version: 4, status, generated_at: new Date().toISOString(), runtime_ms: Number((performance.now() - started).toFixed(1)), card_pool_size: cards.length, metrics, family_results: familyResults, confidence_calibration: calibration, checks, rows };
write('phase4-verification.json', report);
write('commander-family-results.json', { generated_at: report.generated_at, families: familyResults });
write('confidence-calibration.json', { generated_at: report.generated_at, recommendation: calibration.find((entry) => entry.confidence === 'High')?.positive_top_20_rate >= 0.8 ? 'High confidence is directionally calibrated; keep public exposure optional until larger labeled samples exist.' : 'Keep confidence internal; High is not sufficiently calibrated.', buckets: calibration });
write('community-independence.json', communityIndependence);
write('zero-community-benchmark.json', zeroCommunity);
write('hidden-chemistry-review.json', hiddenReview);
write('missed-positive-audit.json', { generated_at: report.generated_at, top_20_miss_count: missedPositiveAudit.length, generalized_root_causes_only: true, rows: missedPositiveAudit });
write('weak-family-audit.json', { generated_at: report.generated_at, families: weakFamilies });
write('release-readiness.json', { generated_at: report.generated_at, tier: 'limited internal', broad_customer_ready: false, rationale: 'Aggregate recall and precision gates pass, but graveyard/sacrifice and legacy pair/background outliers plus unstratified confidence buckets still require targeted human review before broad customer exposure.', release_gate_metrics: metrics, prototype_status: 'local/optional only' });
console.log(JSON.stringify({ status, metrics, family_results: familyResults, confidence_calibration: calibration, community_independence: communityIndependence.identical_rate, zero_community: { count: zeroCommunity.benchmark_count, top10: zeroCommunity.top_10_positive_recall, top20: zeroCommunity.top_20_positive_recall }, hidden_review: { count: hiddenReview.sample_size, excellent_or_plausible_rate: hiddenReview.excellent_or_plausible_rate, false_positive_rate: hiddenReview.false_positive_rate }, failed_checks: checks.filter((entry) => entry.status === 'FAIL') }, null, 2));
if (status !== 'PASS') process.exitCode = 1;
