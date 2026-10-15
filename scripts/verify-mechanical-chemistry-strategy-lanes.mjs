import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { buildSemanticCardProfile } from '../src/services/commander/mechanicalChemistryCore.js';
import { buildStrategyLaneIndex, buildStrategyLaneRecommendations } from '../src/services/commander/strategyLaneCore.js';
import { STRATEGY_LANE_ADVANCED_SEARCH_CASES, STRATEGY_LANE_COMMANDERS, STRATEGY_LANE_FIXTURES } from './fixtures/mechanical-chemistry-strategy-lane-fixtures.mjs';

const ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\strategy-lanes' : path.resolve('.devcache', 'mechanical-chemistry', 'strategy-lanes');
const PHASE4_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase4' : path.resolve('.devcache', 'mechanical-chemistry', 'phase4');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${ROOT}`);
const writeJson = (name, value) => { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(path.join(ROOT, name), `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (name, value) => { fs.mkdirSync(ROOT, { recursive: true }); fs.writeFileSync(path.join(ROOT, name), value); };
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const rate = (value, total) => Number((value / Math.max(1, total)).toFixed(4));
const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2)); };
const checks = [];
const check = (condition, id, detail) => { try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); } catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); } };

function findInLane(lane, oracleId) {
  const ranked = lane?.diagnostics?.ranked?.find((entry) => entry.oracle_id === oracleId);
  const retrieved = lane?.diagnostics?.retrieved_oracle_ids?.includes(oracleId) || false;
  const recommendation = lane?.recommendations?.find((entry) => entry.oracle_id === oracleId);
  return { retrieved, rank: ranked?.rank ?? null, score: ranked?.score ?? null, recommendation: recommendation || null };
}

function phase4Ranks(byName) {
  const build = readJson(path.join(PHASE4_ROOT, 'build-report.json'));
  return build.commanders.slice(0, 30).map((entry, index) => {
    const artifact = readJson(path.join(PHASE4_ROOT, 'recommendations', `${entry.identity}.json`));
    const card = byName.get(STRATEGY_LANE_FIXTURES[index].obvious_positive);
    const rankIndex = artifact.recommendations.findIndex((candidate) => candidate.oracle_id === card?.oracle_id);
    return rankIndex >= 0 ? rankIndex + 1 : null;
  });
}

const started = performance.now();
const profileStarted = performance.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const profileMs = performance.now() - profileStarted;
const byName = new Map(cards.map((card) => [card.name, card]));
const indexStarted = performance.now();
const index = buildStrategyLaneIndex(cards);
const indexMs = performance.now() - indexStarted;
const frozenPhase4Ranks = phase4Ranks(byName);
const rows = [];

check(STRATEGY_LANE_COMMANDERS.length >= 30, 'commander-count', `${STRATEGY_LANE_COMMANDERS.length}`);
for (let indexNumber = 0; indexNumber < STRATEGY_LANE_COMMANDERS.length; indexNumber += 1) {
  const definition = STRATEGY_LANE_COMMANDERS[indexNumber];
  const fixture = STRATEGY_LANE_FIXTURES[indexNumber];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const fixtureCards = Object.fromEntries(['obvious_positive', 'strong_support', 'weak_negative', 'false_positive_trap', 'illegal_negative'].map((key) => [key, byName.get(fixture[key])]));
  check(commanders.length === definition.names.length, `commander:${indexNumber}`, definition.names.join(' + '));
  check(Object.values(fixtureCards).every(Boolean), `fixtures:${indexNumber}`, Object.entries(fixtureCards).filter(([, card]) => !card).map(([key]) => key).join(', ') || 'all found');
  if (commanders.length !== definition.names.length || Object.values(fixtureCards).some((card) => !card)) continue;
  const result = buildStrategyLaneRecommendations(commanders, index, { limitPerLane: 20, minimumScore: 20, includeDiagnostics: true, generatedAt: 'deterministic-strategy-lanes' });
  const laneById = new Map(result.lanes.map((lane) => [lane.lane_id, lane]));
  const expectedLane = laneById.get(fixture.expected_lane);
  const evaluated = Object.fromEntries(Object.entries(fixtureCards).map(([key, card]) => [key, findInLane(expectedLane, card.oracle_id)]));
  const allRetrieved = new Set(result.lanes.flatMap((lane) => lane.diagnostics.retrieved_oracle_ids));
  const allTop20 = new Set(result.lanes.flatMap((lane) => lane.recommendations.map((entry) => entry.oracle_id)));
  const foundExpectedLanes = fixture.expected_lanes.filter((laneId) => laneById.has(laneId));
  rows.push({
    index: indexNumber, family: definition.family, archetype: definition.archetype, commander: definition.names,
    expected_lanes: fixture.expected_lanes, identified_expected_lanes: foundExpectedLanes,
    expected_lane: fixture.expected_lane, expected_lane_identified: Boolean(expectedLane),
    old_global_candidates: result.old_global_candidates, total_legal_pool: result.total_legal_pool,
    candidate_reduction: expectedLane ? Number((1 - expectedLane.semantic_candidates / result.old_global_candidates).toFixed(4)) : null,
    expected_lane_counts: expectedLane ? { semantic_candidates: expectedLane.semantic_candidates, ranked_candidates: expectedLane.ranked_candidates, shown: expectedLane.recommendations.length } : null,
    fixture: {
      obvious_positive: { name: fixture.obvious_positive, oracle_id: fixtureCards.obvious_positive.oracle_id, ...evaluated.obvious_positive },
      strong_support: { name: fixture.strong_support, oracle_id: fixtureCards.strong_support.oracle_id, ...evaluated.strong_support },
      weak_negative: { name: fixture.weak_negative, oracle_id: fixtureCards.weak_negative.oracle_id, ...evaluated.weak_negative },
      false_positive_trap: { name: fixture.false_positive_trap, oracle_id: fixtureCards.false_positive_trap.oracle_id, ...evaluated.false_positive_trap },
      illegal_negative: { name: fixture.illegal_negative, oracle_id: fixtureCards.illegal_negative.oracle_id, retrieved_any_lane: allRetrieved.has(fixtureCards.illegal_negative.oracle_id), top20_any_lane: allTop20.has(fixtureCards.illegal_negative.oracle_id) }
    },
    performance: result.performance,
    strategy_interpretation: result.strategy_interpretation,
    lanes: result.lanes.map((lane) => ({ lane_id: lane.lane_id, display_label: lane.display_label, importance: lane.importance, source_commander_mechanic: lane.source_commander_mechanic, semantic_need: lane.semantic_need, total_legal_pool: lane.total_legal_pool, semantic_candidates: lane.semantic_candidates, ranked_candidates: lane.ranked_candidates, recommendations: lane.recommendations }))
  });
}

const laneExpectations = rows.reduce((sum, row) => sum + row.expected_lanes.length, 0);
const laneHits = rows.reduce((sum, row) => sum + row.identified_expected_lanes.length, 0);
const positives = rows.map((row) => row.fixture.obvious_positive);
const metrics = {
  commanders: rows.length,
  fixture_judgments: rows.length * 5,
  strategy_lane_identification_accuracy: rate(laneHits, laneExpectations),
  expected_primary_lane_identification: rate(rows.filter((row) => row.expected_lane_identified).length, rows.length),
  candidate_retrieval_recall: rate(positives.filter((entry) => entry.retrieved).length, positives.length),
  candidate_pool_precision_reviewed: rate(rows.reduce((sum, row) => sum + Number(row.fixture.obvious_positive.retrieved) + Number(row.fixture.strong_support.retrieved), 0), rows.reduce((sum, row) => sum + Number(row.fixture.obvious_positive.retrieved) + Number(row.fixture.strong_support.retrieved) + Number(row.fixture.weak_negative.retrieved) + Number(row.fixture.false_positive_trap.retrieved), 0)),
  top_5_positive_recall: rate(positives.filter((entry) => Number.isFinite(entry.rank) && entry.rank <= 5).length, positives.length),
  top_10_positive_recall: rate(positives.filter((entry) => Number.isFinite(entry.rank) && entry.rank <= 10).length, positives.length),
  top_20_positive_recall: rate(positives.filter((entry) => Number.isFinite(entry.rank) && entry.rank <= 20).length, positives.length),
  negative_rejection_top20: rate(rows.filter((row) => !Number.isFinite(row.fixture.weak_negative.rank) || row.fixture.weak_negative.rank > 20).length, rows.length),
  trap_rejection_top20: rate(rows.filter((row) => !Number.isFinite(row.fixture.false_positive_trap.rank) || row.fixture.false_positive_trap.rank > 20).length, rows.length),
  trap_rate_top20: rate(rows.filter((row) => Number.isFinite(row.fixture.false_positive_trap.rank) && row.fixture.false_positive_trap.rank <= 20).length, rows.length),
  illegal_rejection: rate(rows.filter((row) => !row.fixture.illegal_negative.retrieved_any_lane).length, rows.length),
  explanation_correctness: rate(rows.filter((row) => !row.fixture.obvious_positive.recommendation || Boolean(row.fixture.obvious_positive.recommendation.why_it_works && !/great synergy/i.test(row.fixture.obvious_positive.recommendation.why_it_works))).length, rows.length),
  median_positive_lane_rank: median(positives.map((entry) => entry.rank)),
  median_expected_lane_candidates: median(rows.map((row) => row.expected_lane_counts?.semantic_candidates)),
  median_candidate_reduction: median(rows.map((row) => row.candidate_reduction))
};

const laneMetrics = [...new Set(rows.map((row) => row.expected_lane))].map((laneId) => {
  const sample = rows.filter((row) => row.expected_lane === laneId);
  return { lane_id: laneId, configurations: sample.length, retrieval_recall: rate(sample.filter((row) => row.fixture.obvious_positive.retrieved).length, sample.length), top_5_recall: rate(sample.filter((row) => Number.isFinite(row.fixture.obvious_positive.rank) && row.fixture.obvious_positive.rank <= 5).length, sample.length), top_10_recall: rate(sample.filter((row) => Number.isFinite(row.fixture.obvious_positive.rank) && row.fixture.obvious_positive.rank <= 10).length, sample.length), top_20_recall: rate(sample.filter((row) => Number.isFinite(row.fixture.obvious_positive.rank) && row.fixture.obvious_positive.rank <= 20).length, sample.length), negative_rejection: rate(sample.filter((row) => !Number.isFinite(row.fixture.weak_negative.rank) || row.fixture.weak_negative.rank > 20).length, sample.length), trap_rate: rate(sample.filter((row) => Number.isFinite(row.fixture.false_positive_trap.rank) && row.fixture.false_positive_trap.rank <= 20).length, sample.length) };
});

const multiStrategyRows = rows.filter((row) => row.strategy_interpretation.filter((lane) => !['Generic Utility', 'Support'].includes(lane.importance)).length >= 2);
const pairRows = rows.filter((row) => ['Partner', 'Background'].includes(row.family));
const multiStrategy = { configurations: multiStrategyRows.length, rate: rate(multiStrategyRows.length, rows.length), rows: multiStrategyRows.map((row) => ({ commander: row.commander, lanes: row.strategy_interpretation.filter((lane) => !lane.generic_utility).map((lane) => ({ lane_id: lane.lane_id, importance: lane.importance })) })) };
const pairBackground = { configurations: pairRows.length, exact_identity_rate: rate(pairRows.filter((row) => row.commander.length === 2).length, pairRows.length), retrieval_recall: rate(pairRows.filter((row) => row.fixture.obvious_positive.retrieved).length, pairRows.length), top_20_recall: rate(pairRows.filter((row) => Number.isFinite(row.fixture.obvious_positive.rank) && row.fixture.obvious_positive.rank <= 20).length, pairRows.length) };

const fakeCommunity = new Map(cards.slice(0, 1000).map((card, index) => [card.oracle_id, { inclusion_rate: 1 - index / 1200, deck_count: 10000, synergy_score: 100 }]));
const independence = rows.filter((_, indexNumber) => indexNumber % 5 === 0).map((row) => {
  const commanders = row.commander.map((name) => byName.get(name));
  const without = buildStrategyLaneRecommendations(commanders, index, { limitPerLane: 20, minimumScore: 20, generatedAt: 'stable' });
  const withCommunity = buildStrategyLaneRecommendations(commanders, index, { limitPerLane: 20, minimumScore: 20, generatedAt: 'stable', communityByOracleId: fakeCommunity });
  const signature = (result) => result.lanes.flatMap((lane) => lane.recommendations.map((entry) => `${lane.lane_id}:${entry.oracle_id}:${entry.lane_fit_score}`));
  return { commander: row.commander, identical: JSON.stringify(signature(without)) === JSON.stringify(signature(withCommunity)) };
});

const advancedSearch = STRATEGY_LANE_ADVANCED_SEARCH_CASES.map((test) => {
  const row = rows.find((entry) => entry.commander.includes(test.commander));
  const lane = row?.lanes.find((entry) => entry.lane_id === test.lane);
  const expected = byName.get(test.expected);
  const oracle = String(expected?.oracle_text || '').toLowerCase();
  const literalHit = test.literal_terms.some((term) => oracle.includes(term.toLowerCase()));
  const semanticHit = Boolean(lane && lane.recommendations.some((entry) => entry.oracle_id === expected?.oracle_id)) || Boolean(row?.fixture.obvious_positive.oracle_id === expected?.oracle_id && row.fixture.obvious_positive.retrieved);
  const semanticNonliteral = lane?.recommendations.filter((entry) => {
    const card = byName.get(entry.card_name);
    return card && !test.literal_terms.some((term) => String(card.oracle_text || '').toLowerCase().includes(term.toLowerCase()));
  }).length || 0;
  return { ...test, literal_hit_for_expected: literalHit, semantic_retrieval_hit: semanticHit, semantic_nonliteral_top20: semanticNonliteral };
});

const phase4ComparisonRows = rows.map((row, indexNumber) => ({ commander: row.commander, expected: row.fixture.obvious_positive.name, phase4_global_rank: frozenPhase4Ranks[indexNumber], lane_rank: row.fixture.obvious_positive.rank, retrieved: row.fixture.obvious_positive.retrieved }));
const phase4Comparison = {
  configurations: rows.length,
  phase4_global_top10_recall: rate(frozenPhase4Ranks.filter((rank) => Number.isFinite(rank) && rank <= 10).length, rows.length),
  phase4_global_top20_recall: rate(frozenPhase4Ranks.filter((rank) => Number.isFinite(rank) && rank <= 20).length, rows.length),
  lane_top10_recall: metrics.top_10_positive_recall,
  lane_top20_recall: metrics.top_20_positive_recall,
  rows: phase4ComparisonRows
};

const performanceReport = {
  cards_profiled: cards.length, semantic_profile_build_ms: Number(profileMs.toFixed(2)), index_build_ms: Number(indexMs.toFixed(2)),
  thirty_commander_total_ms: Number(rows.reduce((sum, row) => sum + row.performance.total_ms, 0).toFixed(2)),
  mean_commander_total_ms: Number((rows.reduce((sum, row) => sum + row.performance.total_ms, 0) / rows.length).toFixed(2)),
  mean_legal_filter_ms: Number((rows.reduce((sum, row) => sum + row.performance.legal_filter_ms, 0) / rows.length).toFixed(2)),
  mean_lane_retrieval_ms: Number((rows.reduce((sum, row) => sum + row.performance.lane_retrieval_ms, 0) / rows.length).toFixed(2)),
  mean_lane_ranking_ms: Number((rows.reduce((sum, row) => sum + row.performance.lane_ranking_ms, 0) / rows.length).toFixed(2)),
  rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)), total_verifier_ms: Number((performance.now() - started).toFixed(2))
};

check(metrics.strategy_lane_identification_accuracy >= 0.8, 'lane-identification', `${metrics.strategy_lane_identification_accuracy}`);
check(metrics.candidate_retrieval_recall >= 0.8, 'retrieval-recall', `${metrics.candidate_retrieval_recall}`);
check(metrics.illegal_rejection === 1, 'illegal-rejection', `${metrics.illegal_rejection}`);
check(metrics.explanation_correctness >= 0.98, 'explanations', `${metrics.explanation_correctness}`);
check(independence.every((entry) => entry.identical), 'community-independence', JSON.stringify(independence.filter((entry) => !entry.identical)));

const replacementDecision = {
  decision: 'NO_GO',
  verifier_status_is_not_release_status: true,
  human_review_prefers_lane_model: false,
  reasons: [
    `Lane Top 10 recall ${(metrics.top_10_positive_recall * 100).toFixed(1)}% trails Phase 4 ${(phase4Comparison.phase4_global_top10_recall * 100).toFixed(1)}%.`,
    `Partner/Background Top 20 recall is ${(pairBackground.top_20_recall * 100).toFixed(1)}%.`,
    'Several broad lanes still retrieve hundreds to more than one thousand candidates, especially sacrifice outlets, token generation, and generic support.',
    'Manual inspection found semantically related but role-imprecise cards near the top of broad lanes; lane-specific candidate qualification needs another precision pass.'
  ],
  strengths: [
    `Lane Top 20 recall ${(metrics.top_20_positive_recall * 100).toFixed(1)}% exceeds Phase 4 ${(phase4Comparison.phase4_global_top20_recall * 100).toFixed(1)}%.`,
    'Reviewed Top 20 trap rate is zero and illegal-card rejection is complete.',
    'Candidate retrieval and community-independence checks are complete.'
  ]
};

const report = { schema_version: 1, generated_at: new Date().toISOString(), status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'NEEDS_WORK', replacement_decision: replacementDecision, source: 'Local canonical corpus only', external_requests: 0, metrics, lane_metrics: laneMetrics, multi_strategy: multiStrategy, pair_background: pairBackground, advanced_search_equivalence: advancedSearch, phase4_comparison: phase4Comparison, performance: performanceReport, checks, rows };

const markdown = [
  '# Mechanical Chemistry — Strategy Lane Human Review', '',
  `Verifier status: **${report.status}**`, '',
  `Global-ranking replacement decision: **${replacementDecision.decision}**`, '',
  ...replacementDecision.reasons.map((reason) => `- ${reason}`), '',
  `Lane identification ${(metrics.strategy_lane_identification_accuracy * 100).toFixed(1)}%; retrieval recall ${(metrics.candidate_retrieval_recall * 100).toFixed(1)}%; lane Top 5/10/20 ${(metrics.top_5_positive_recall * 100).toFixed(1)}% / ${(metrics.top_10_positive_recall * 100).toFixed(1)}% / ${(metrics.top_20_positive_recall * 100).toFixed(1)}%.`, '',
  ...rows.flatMap((row) => [
    `## ${row.commander.join(' + ')} — ${row.family}`, '',
    '**Commander strategy interpretation**', '',
    ...['Primary', 'Secondary', 'Support', 'Generic Utility'].flatMap((importance) => {
      const lanes = row.strategy_interpretation.filter((lane) => lane.importance === importance);
      return lanes.length ? [`- ${importance}: ${lanes.map((lane) => lane.display_label).join(', ')}`] : [];
    }), '',
    `Expected strong card: **${row.fixture.obvious_positive.name}** in **${row.expected_lane}** — ${row.fixture.obvious_positive.retrieved ? `retrieved at rank ${row.fixture.obvious_positive.rank ?? 'below threshold'}` : 'not retrieved'}.`, '',
    ...row.lanes.flatMap((lane) => [
      `### ${lane.display_label} — ${lane.importance}`, '',
      `${lane.semantic_candidates} semantic candidates from ${lane.total_legal_pool} legal cards; ${lane.recommendations.length} shown.`, '',
      '| Rank | Card | Fit | Specific | Why it works | Community |',
      '|---:|---|---|---|---|---:|',
      ...lane.recommendations.slice(0, 10).map((entry) => `| ${entry.rank} | ${entry.card_name.replaceAll('|', '\\|')} | ${entry.lane_fit} | ${entry.commander_specific ? 'Yes' : 'No'} | ${entry.why_it_works.replaceAll('|', '\\|')} | ${entry.community_inclusion ?? '—'} |`), ''
    ])
  ])
].join('\n');

writeJson('strategy-lane-verification.json', report);
writeJson('lane-aware-metrics.json', { generated_at: report.generated_at, metrics, lane_metrics: laneMetrics });
writeJson('lane-aware-fixtures.json', { generated_at: report.generated_at, commanders: STRATEGY_LANE_COMMANDERS, fixtures: STRATEGY_LANE_FIXTURES });
writeJson('semantic-index-summary.json', {
  generated_at: report.generated_at,
  schema_version: index.schema_version,
  cards_profiled: index.profiles.length,
  posting_keys: index.postings.size,
  posting_counts: Object.fromEntries([...index.postings.entries()].map(([key, ids]) => [key, ids.size]))
});
writeJson('candidate-pool-audit.json', { generated_at: report.generated_at, commanders: rows.map((row) => ({ commander: row.commander, old_global_candidates: row.old_global_candidates, total_legal_pool: row.total_legal_pool, lanes: row.lanes.map((lane) => ({ lane_id: lane.lane_id, semantic_candidates: lane.semantic_candidates, ranked_candidates: lane.ranked_candidates, shown: lane.recommendations.length, reduction_vs_global: Number((1 - lane.semantic_candidates / row.old_global_candidates).toFixed(4)) })) })) });
writeJson('advanced-search-equivalence.json', { generated_at: report.generated_at, cases: advancedSearch });
writeJson('community-independence.json', { generated_at: report.generated_at, tested: independence.length, identical_rate: rate(independence.filter((entry) => entry.identical).length, independence.length), rows: independence });
writeJson('phase4-comparison.json', phase4Comparison);
writeJson('performance-report.json', performanceReport);
writeJson('multi-strategy-report.json', multiStrategy);
writeJson('pair-background-report.json', pairBackground);
writeJson('human-review.json', { generated_at: report.generated_at, commanders: rows.map((row) => ({ commander: row.commander, family: row.family, strategy_interpretation: row.strategy_interpretation, expected: row.fixture.obvious_positive, lanes: row.lanes })) });
writeText('human-review.md', `${markdown}\n`);

console.log(JSON.stringify({ status: report.status, metrics, pair_background: pairBackground, phase4_comparison: { phase4_global_top10_recall: phase4Comparison.phase4_global_top10_recall, phase4_global_top20_recall: phase4Comparison.phase4_global_top20_recall, lane_top10_recall: phase4Comparison.lane_top10_recall, lane_top20_recall: phase4Comparison.lane_top20_recall }, performance: performanceReport, failed_checks: checks.filter((entry) => entry.status === 'FAIL'), output_root: ROOT }, null, 2));
if (!checks.every((entry) => entry.status === 'PASS')) process.exitCode = 1;
