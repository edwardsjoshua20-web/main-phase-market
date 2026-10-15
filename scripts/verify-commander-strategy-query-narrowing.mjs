import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { buildCommanderSemanticProfile, buildSemanticCardProfile, checkMechanicalCandidateLegality } from '../src/services/commander/mechanicalChemistryCore.js';
import { buildCommanderStrategySearchIndex, compileCommanderStrategy, searchCommanderStrategies } from '../src/services/commander/commanderStrategyCompiler.js';
import { ADVANCED_SEARCH_COMPILER_CASES, COMMANDER_STRATEGY_COMPILER_FIXTURES } from './fixtures/commander-strategy-compiler-fixtures.mjs';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const ROOT = process.platform === 'win32'
  ? 'D:\\DevCache\\main-phase-market\\commander-strategy-compiler\\query-narrowing'
  : path.join(REPO_ROOT, '.devcache', 'commander-strategy-compiler', 'query-narrowing');
const PREVIEW_ROOT = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'mechanical-chemistry');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${ROOT}`);

function writeJson(target, value) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); }
function writeText(target, value) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; }
function rate(hit, total) { return Number((hit / Math.max(1, total)).toFixed(4)); }

function communityMap(commanderId) {
  const target = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'commander-details', `${commanderId}.json`);
  if (!fs.existsSync(target)) return new Map();
  const payload = JSON.parse(fs.readFileSync(target, 'utf8'));
  const rows = [...(payload.top_synergy_cards || []), ...(payload.observed_cards || []), ...(payload.categories || []).flatMap((entry) => entry.cards || [])];
  return new Map(rows.filter((entry) => entry.oracle_id).map((entry) => [entry.oracle_id, entry]));
}

function localImagePath(value) {
  const match = String(value || '').match(/cards\.scryfall\.io\/(normal|small|large)\/front\/([0-9a-f])\/([0-9a-f])\/([0-9a-f-]+)\.jpg/i);
  return match ? `/data/mtg/images/${match[1]}/${match[2]}${match[3]}/${match[4]}.jpg` : value;
}

function enrichStrategy(strategy, community) {
  return {
    ...strategy,
    recommendations: strategy.recommendations.map((card) => {
      const observed = community.get(card.oracle_id);
      return {
        ...card,
        image_normal: localImagePath(card.image_normal),
        image_small: localImagePath(card.image_small),
        image_large: localImagePath(card.image_large),
        community_inclusion: observed?.inclusion_rate ?? observed?.synergy_score ?? null,
        community_observation_count: Number(observed?.deck_count || 0)
      };
    })
  };
}

const started = performance.now();
const profileStarted = performance.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const profileMs = performance.now() - profileStarted;
const byName = new Map(cards.map((card) => [card.name, card]));
const indexStarted = performance.now();
const index = buildCommanderStrategySearchIndex(cards);
const indexMs = performance.now() - indexStarted;
const rows = [];
const previewManifest = [];

for (const fixture of COMMANDER_STRATEGY_COMPILER_FIXTURES) {
  const commanders = fixture.names.map((name) => byName.get(name)).filter(Boolean);
  assert.equal(commanders.length, fixture.names.length, `Missing commander: ${fixture.names.join(' + ')}`);
  const compilerStarted = performance.now();
  const compilation = compileCommanderStrategy(commanders);
  const compilerMs = performance.now() - compilerStarted;
  const search = searchCommanderStrategies(compilation, index, { limitPerStrategy: 20, minimumScore: 26, includeDiagnostics: true });
  const community = commanders.length === 1 ? communityMap(commanders[0].oracle_id) : new Map();
  const strategies = search.strategies.map((strategy) => enrichStrategy(strategy, community));
  const primaryId = commanders[0].oracle_id;
  const flattened = strategies.flatMap((strategy) => strategy.recommendations.map((card) => ({ ...card, strategy_label: strategy.label, strategy_importance: strategy.importance })))
    .filter((card, indexValue, values) => values.findIndex((entry) => entry.oracle_id === card.oracle_id) === indexValue);
  const preview = {
    schema_version: 2,
    architecture: 'commander-strategy-compiler',
    generated_at: new Date().toISOString(),
    commander_names: fixture.names,
    commander_identity: compilation.commander_identity,
    strategies,
    recommendations: flattened,
    categories: [],
    community_signal_blended_into_score: false
  };
  writeJson(path.join(PREVIEW_ROOT, `${primaryId}.json`), preview);
  previewManifest.push({ oracle_id: primaryId, commander_names: fixture.names, family: fixture.family });
  rows.push({
    family: fixture.family,
    commander: fixture.names,
    oracle_ids: commanders.map((card) => card.oracle_id),
    expected_strategies: fixture.strategies,
    forbidden_strategies: fixture.forbidden || [],
    inferred_strategies: compilation.strategies.filter((entry) => entry.importance !== 'Generic Utility').map((entry) => entry.strategy_id),
    members: compilation.members.map((member) => ({ name: member.name, abilities: member.abilities })),
    graph: compilation.graph,
    strategies,
    performance: { compiler_ms: Number(compilerMs.toFixed(3)), ...search.performance }
  });
}

writeJson(path.join(PREVIEW_ROOT, 'strategy-compiler-manifest.json'), { schema_version: 2, generated_at: new Date().toISOString(), commanders: previewManifest });

const allBranches = rows.flatMap((row) => row.strategies.map((strategy) => ({ row, strategy })));
const broadAudit = allBranches.filter(({ strategy }) => strategy.final_qualified_pool > 500).map(({ row, strategy }) => {
  const sample = strategy.recommendations.slice(0, 10);
  const weakOrGeneric = sample.filter((card) => strategy.importance === 'Generic Utility' || card.ranking_dimensions.directness <= 1 || card.fit_score < 60);
  return {
    commander: row.commander,
    strategy: strategy.label,
    importance: strategy.importance,
    legal_pool: strategy.total_legal_pool,
    before_narrowing: strategy.candidate_pool_before_narrowing,
    after_narrowing: strategy.semantic_pool,
    qualified_pool: strategy.final_qualified_pool,
    query_quality_warning: strategy.final_qualified_pool > 1000,
    dominant_inclusion_reasons: strategy.search_query.required_conditions,
    reviewed_sample_size: sample.length,
    obviously_weak_or_generic_count: weakOrGeneric.length,
    obviously_weak_or_generic_percent: rate(weakOrGeneric.length, sample.length),
    sample: sample.map((card) => ({ card_name: card.card_name, fit_score: card.fit_score, directness: card.ranking_dimensions.directness, why_it_works: card.why_it_works }))
  };
});

const reviewedRanks = ADVANCED_SEARCH_COMPILER_CASES.map((test) => {
  const row = rows.find((entry) => entry.commander.includes(test.commander));
  const strategy = row?.strategies.find((entry) => entry.strategy_id === test.strategy);
  const expected = byName.get(test.expected);
  const rank = strategy?.diagnostics.ranked.find((entry) => entry.oracle_id === expected?.oracle_id)?.rank || null;
  return { ...test, oracle_id: expected?.oracle_id || null, retrieved: Boolean(rank), rank };
});

const forbiddenHits = rows.flatMap((row) => row.forbidden_strategies.filter((strategy) => row.inferred_strategies.includes(strategy)));
const recommendationRows = allBranches.flatMap(({ row, strategy }) => strategy.recommendations.map((card) => ({ row, strategy, card })));
const illegalRecommendations = recommendationRows.filter(({ row, card }) => {
  const commanderProfile = buildCommanderSemanticProfile(row.oracle_ids.map((id) => index.by_id.get(id)));
  return !checkMechanicalCandidateLegality(commanderProfile, index.by_id.get(card.oracle_id)).legal;
});
const explanationFailures = recommendationRows.filter(({ card }) => !card.why_it_works || !card.strategy_label);
const primaryTrapRows = recommendationRows.filter(({ strategy, card }) => strategy.importance !== 'Generic Utility' && (card.ranking_dimensions.directness <= 0 || card.fit_score < 40));
const metrics = {
  commanders: rows.length,
  strategy_identification_accuracy: rate(rows.reduce((sum, row) => sum + row.expected_strategies.filter((strategy) => row.inferred_strategies.includes(strategy)).length, 0), rows.reduce((sum, row) => sum + row.expected_strategies.length, 0)),
  query_retrieval_recall: rate(reviewedRanks.filter((entry) => entry.retrieved).length, reviewedRanks.length),
  median_pool_before_narrowing: median(allBranches.map(({ strategy }) => strategy.candidate_pool_before_narrowing)),
  median_pool_after_narrowing: median(allBranches.map(({ strategy }) => strategy.semantic_pool)),
  max_pool_after_narrowing: Math.max(...allBranches.map(({ strategy }) => strategy.semantic_pool)),
  branches_over_500: broadAudit.length,
  branches_over_1000: broadAudit.filter((entry) => entry.query_quality_warning).length,
  top_5_recall: rate(reviewedRanks.filter((entry) => entry.rank && entry.rank <= 5).length, reviewedRanks.length),
  top_10_recall: rate(reviewedRanks.filter((entry) => entry.rank && entry.rank <= 10).length, reviewedRanks.length),
  top_20_recall: rate(reviewedRanks.filter((entry) => entry.rank && entry.rank <= 20).length, reviewedRanks.length),
  negative_rejection: rate(rows.reduce((sum, row) => sum + row.forbidden_strategies.length, 0) - forbiddenHits.length, rows.reduce((sum, row) => sum + row.forbidden_strategies.length, 0)),
  trap_rate: rate(primaryTrapRows.length, recommendationRows.filter(({ strategy }) => strategy.importance !== 'Generic Utility').length),
  illegal_rejection: rate(recommendationRows.length - illegalRecommendations.length, recommendationRows.length),
  explanation_correctness: rate(recommendationRows.length - explanationFailures.length, recommendationRows.length)
};

const performanceReport = {
  cards_profiled: cards.length,
  semantic_profile_build_ms: Number(profileMs.toFixed(2)),
  index_build_ms: Number(indexMs.toFixed(2)),
  mean_compiler_ms: Number((rows.reduce((sum, row) => sum + row.performance.compiler_ms, 0) / rows.length).toFixed(2)),
  mean_query_generation_ms: Number((rows.reduce((sum, row) => sum + row.performance.query_generation_ms, 0) / rows.length).toFixed(2)),
  mean_semantic_retrieval_ms: Number((rows.reduce((sum, row) => sum + row.performance.semantic_search_ms, 0) / rows.length).toFixed(2)),
  mean_qualification_ms: Number((rows.reduce((sum, row) => sum + row.performance.qualification_ms, 0) / rows.length).toFixed(2)),
  mean_ranking_ms: Number((rows.reduce((sum, row) => sum + row.performance.ranking_ms, 0) / rows.length).toFixed(2)),
  mean_full_recompute_ms: Number((rows.reduce((sum, row) => sum + row.performance.total_ms + row.performance.compiler_ms, 0) / rows.length).toFixed(2)),
  rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  index_posting_keys: index.postings.size,
  total_ms: Number((performance.now() - started).toFixed(2))
};

const markdown = [
  '# Commander Strategy Compiler — Query Narrowing Review', '',
  `Commanders: ${rows.length}; retrieval recall: ${(metrics.query_retrieval_recall * 100).toFixed(1)}%; median pool ${metrics.median_pool_before_narrowing} → ${metrics.median_pool_after_narrowing}.`, '',
  ...rows.slice(0, 20).flatMap((row) => [
    `## ${row.commander.join(' + ')} — ${row.family}`, '',
    '### Commander interpretation', '',
    ...row.members.flatMap((member) => [`**${member.name}**`, ...member.abilities.map((ability, indexValue) => `- Ability ${indexValue + 1}: ${ability.condition?.event || 'no trigger'} → ${ability.actions.map((entry) => entry.action).join(', ') || 'static/replacement output'}; outputs ${ability.outputs.map((entry) => entry.key).join(', ') || 'none'}.`)]), '',
    '### Inferred strategies', '',
    ...['Primary', 'Secondary', 'Supporting', 'Generic Utility'].map((importance) => `- ${importance}: ${row.strategies.filter((strategy) => strategy.importance === importance).map((strategy) => strategy.label).join(', ') || 'None'}`), '',
    '### Branches', '',
    ...row.strategies.flatMap((strategy) => [
      `#### ${strategy.label} — ${strategy.importance}`, '',
      `- Required: ${strategy.search_query.required_conditions.map((entry) => entry.kind + (entry.value ? `=${entry.value}` : entry.any ? `=${entry.any.join('/')}` : '')).join(', ')}`,
      `- Preferred: ${strategy.search_query.preferred_conditions.join(', ')}`,
      `- Candidate count: ${strategy.candidate_pool_before_narrowing} before → ${strategy.semantic_pool} after → ${strategy.final_qualified_pool} ranked.`,
      ...strategy.recommendations.slice(0, 10).map((card) => `- ${card.rank}. ${card.card_name} — ${card.mechanical_fit_label}. ${card.why_it_works}${card.community_inclusion === null ? ' Community: unavailable.' : ` Community: ${Number(card.community_inclusion * 100).toFixed(1)}%.`}`), ''
    ])
  ])
].join('\n');

const report = { schema_version: 1, generated_at: new Date().toISOString(), metrics, performance: performanceReport, broad_lane_audit: broadAudit, reviewed_ranks: reviewedRanks, rows };
writeJson(path.join(ROOT, 'query-narrowing-verification.json'), report);
writeJson(path.join(ROOT, 'metrics.json'), metrics);
writeJson(path.join(ROOT, 'broad-lane-audit.json'), broadAudit);
writeJson(path.join(ROOT, 'advanced-search-review.json'), reviewedRanks);
writeJson(path.join(ROOT, 'performance.json'), performanceReport);
writeJson(path.join(ROOT, 'preview-manifest.json'), previewManifest);
writeText(path.join(ROOT, 'human-review.md'), `${markdown}\n`);
const files = fs.readdirSync(ROOT, { recursive: true }).map((entry) => path.join(ROOT, entry)).filter((entry) => fs.statSync(entry).isFile());
const bytes = files.reduce((sum, file) => sum + fs.statSync(file).size, 0);
writeJson(path.join(ROOT, 'artifact-size.json'), { files: files.length, bytes, mb: Number((bytes / 1024 / 1024).toFixed(3)) });

assert.ok(metrics.query_retrieval_recall >= 0.95, `Retrieval recall ${metrics.query_retrieval_recall}`);
assert.equal(metrics.illegal_rejection, 1);
assert.equal(metrics.negative_rejection, 1);
console.log(JSON.stringify({ status: 'PASS', output_root: ROOT, preview_root: PREVIEW_ROOT, metrics, performance: performanceReport }, null, 2));
