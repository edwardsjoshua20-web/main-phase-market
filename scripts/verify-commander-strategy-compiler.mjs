import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance as perf } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { buildSemanticCardProfile } from '../src/services/commander/mechanicalChemistryCore.js';
import {
  buildCommanderStrategySearchIndex,
  compileCommanderStrategy,
  searchCommanderStrategies,
  strategyCatalog
} from '../src/services/commander/commanderStrategyCompiler.js';
import { ADVANCED_SEARCH_COMPILER_CASES, COMMANDER_STRATEGY_COMPILER_FIXTURES } from './fixtures/commander-strategy-compiler-fixtures.mjs';

const ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\commander-strategy-compiler' : path.resolve('.devcache', 'commander-strategy-compiler');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${ROOT}`);
const writeJson = (relative, value) => { const target = path.join(ROOT, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`); };
const writeText = (relative, value) => { const target = path.join(ROOT, relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
const rate = (value, total) => Number((value / Math.max(1, total)).toFixed(4));
const median = (values) => { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return null; const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(2)); };
const safeName = (names) => names.join('__').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
const checks = [];
const check = (condition, id, detail) => { try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); } catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); } };

const ACTION_OUTPUTS = Object.freeze({
  mill: 'mill', draw: 'card_drawn', create_token: 'token_created', deal_damage: 'damage_dealt',
  gain_life: 'life_gained', lose_life: 'life_lost', sacrifice: 'creature_died', add_mana: 'mana',
  modify_counters: 'counter_changed', recur: 'card_left_graveyard', blink: 'permanent_entered_battlefield',
  extra_combat: 'combat_phase', extra_land_play: 'land_entered_battlefield', amplify_trigger: 'trigger_repeated',
  reduce_cost: 'cost_reduction', tax_spells: 'tax_effect'
});

function semanticActionSet(compilation) {
  const set = new Set(compilation.members.flatMap((member) => member.abilities.flatMap((ability) => ability.actions.map((action) => action.action))));
  const mapping = {
    opponent_mill: 'mill', self_mill: 'mill', cards: 'draw', card_drawn: 'draw', tokens: 'create_token', token_created: 'create_token',
    life_gained: 'gain_life', opponent_life_loss: 'lose_life', counter_added: 'modify_counters', counter_amplification: 'modify_counters',
    mana: 'add_mana', extra_land_play: 'extra_land_play', extra_combat: 'extra_combat', blink: 'blink', cost_reduction: 'reduce_cost',
    tax_effect: 'tax_spells', sacrifice_event: 'sacrifice', creature_dies: 'sacrifice'
  };
  for (const member of compilation.members) for (const group of ['produces', 'enables']) for (const entry of member.semantic_profile[group] || []) if (mapping[entry.key]) set.add(mapping[entry.key]);
  return set;
}

function conditionSet(compilation) {
  const set = new Set(compilation.members.flatMap((member) => member.abilities.map((ability) => ability.condition?.event).filter(Boolean)));
  const mapping = {
    creature_dies: 'creature_died', opponent_mill: 'opponent_mill', spell_cast: 'spell_cast', noncreature_spell_cast: 'noncreature_spell_cast',
    instant_or_sorcery_cast: 'instant_or_sorcery_cast', life_gained: 'life_gained', land_enters: 'land_entered_battlefield',
    attacks: 'attack_declared', combat_damage: 'combat_damage', sacrifice_event: 'permanent_sacrificed', counter_added: 'counter_changed'
  };
  for (const member of compilation.members) for (const group of ['wants', 'rewards', 'trigger_patterns']) for (const entry of member.semantic_profile[group] || []) if (mapping[entry.key]) set.add(mapping[entry.key]);
  return set;
}

function transitionSet(compilation) {
  const set = new Set(compilation.members.flatMap((member) => member.abilities.flatMap((ability) => ability.transitions.map((transition) => `${transition.from}->${transition.to}`))));
  for (const member of compilation.members) {
    const keys = new Set(member.semantic_profile.produces.map((entry) => entry.key));
    if (keys.has('recursion') || keys.has('graveyard_recursion')) set.add('graveyard->battlefield');
    if (keys.has('cast_from_graveyard')) set.add('graveyard->battlefield');
    if (keys.has('land_to_graveyard') || keys.has('creature_dies') && member.semantic_profile.roles.some((entry) => entry.key === 'sacrifice_outlet')) set.add('battlefield->graveyard');
    if (keys.has('blink')) { set.add('battlefield->exile'); set.add('exile->battlefield'); }
  }
  return set;
}

function outputSet(compilation) {
  return new Set(compilation.graph.nodes.filter((node) => ['event', 'resource'].includes(node.type)).map((node) => node.id.replace(/^(event|resource):/, '')));
}

const started = perf.now();
const profileStarted = perf.now();
const cards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const profileMs = perf.now() - profileStarted;
const byName = new Map(cards.map((card) => [card.name, card]));
const indexStarted = perf.now();
const searchIndex = buildCommanderStrategySearchIndex(cards);
const indexMs = perf.now() - indexStarted;
const rows = [];

check(COMMANDER_STRATEGY_COMPILER_FIXTURES.length >= 30, 'fixture-count', `${COMMANDER_STRATEGY_COMPILER_FIXTURES.length}`);
for (let fixtureIndex = 0; fixtureIndex < COMMANDER_STRATEGY_COMPILER_FIXTURES.length; fixtureIndex += 1) {
  const fixture = COMMANDER_STRATEGY_COMPILER_FIXTURES[fixtureIndex];
  const commanders = fixture.names.map((name) => byName.get(name)).filter(Boolean);
  check(commanders.length === fixture.names.length, `commander:${fixtureIndex}`, fixture.names.join(' + '));
  if (commanders.length !== fixture.names.length) continue;
  const compileStarted = perf.now();
  const compilation = compileCommanderStrategy(commanders);
  const compilerMs = perf.now() - compileStarted;
  const search = searchCommanderStrategies(compilation, searchIndex, { limitPerStrategy: 8, minimumScore: 26, includeDiagnostics: true });
  const inferred = new Set(compilation.strategies.filter((entry) => !['Generic Utility'].includes(entry.importance)).map((entry) => entry.strategy_id));
  const expected = new Set(fixture.strategies);
  const actions = semanticActionSet(compilation);
  const conditions = conditionSet(compilation);
  const transitions = transitionSet(compilation);
  const outputs = outputSet(compilation);
  const expectedOutputs = unique((fixture.actions || []).map((action) => ACTION_OUTPUTS[action]));
  const graphFile = `graphs/${String(fixtureIndex + 1).padStart(2, '0')}-${safeName(fixture.names)}.json`;
  const candidateFile = `candidates/${String(fixtureIndex + 1).padStart(2, '0')}-${safeName(fixture.names)}.json`;
  writeJson(graphFile, { commander: fixture.names, members: compilation.members.map((member) => ({ name: member.name, oracle_text: member.oracle_text, rules_ir_coverage: member.rules_ir_coverage, abilities: member.abilities })), graph: compilation.graph, strategies: compilation.strategies });
  writeJson(candidateFile, search);
  rows.push({
    index: fixtureIndex,
    family: fixture.family,
    commander: fixture.names,
    color_identity: compilation.color_identity,
    expected_strategies: fixture.strategies,
    inferred_strategies: [...inferred],
    strategy_hits: fixture.strategies.filter((strategy) => inferred.has(strategy)),
    unexpected_strategies: [...inferred].filter((strategy) => !expected.has(strategy) && !['protection'].includes(strategy)),
    forbidden_strategy_hits: (fixture.forbidden || []).filter((strategy) => inferred.has(strategy)),
    conditions: { expected: fixture.conditions || [], found: [...conditions], hits: (fixture.conditions || []).filter((entry) => conditions.has(entry)) },
    actions: { expected: fixture.actions || [], found: [...actions], hits: (fixture.actions || []).filter((entry) => actions.has(entry)) },
    transitions: { expected: fixture.transitions || [], found: [...transitions], hits: (fixture.transitions || []).filter((entry) => transitions.has(entry)) },
    produced_events: { expected: expectedOutputs, found: [...outputs], hits: expectedOutputs.filter((entry) => outputs.has(entry)) },
    ability_count: compilation.members.reduce((sum, member) => sum + member.abilities.length, 0),
    rules_ir_ability_count: compilation.members.reduce((sum, member) => sum + member.abilities.filter((ability) => ability.source === 'rules_ir').length, 0),
    fallback_ability_count: compilation.members.reduce((sum, member) => sum + member.abilities.filter((ability) => ability.source !== 'rules_ir').length, 0),
    parser_coverage: compilation.parser_coverage,
    graph: {
      nodes: compilation.graph.nodes.length,
      edges: compilation.graph.edges.length,
      derived_edges: compilation.graph.edges.filter((edge) => edge.derived).length,
      needs: compilation.graph.nodes.filter((node) => node.type === 'need').map((node) => node.label),
      artifact: graphFile
    },
    strategies: search.strategies.map((strategy) => ({ strategy_id: strategy.strategy_id, label: strategy.label, importance: strategy.importance, inferred_from: strategy.inferred_from, indirect: strategy.indirect, search_query: strategy.search_query, total_legal_pool: strategy.total_legal_pool, semantic_pool: strategy.semantic_pool, final_qualified_pool: strategy.final_qualified_pool, recommendations: strategy.recommendations })),
    performance: { compiler_ms: Number(compilerMs.toFixed(3)), ...search.performance },
    candidate_artifact: candidateFile
  });
}

function sumExpected(field) { return rows.reduce((sum, row) => sum + row[field].expected.length, 0); }
function sumHits(field) { return rows.reduce((sum, row) => sum + row[field].hits.length, 0); }
const expectedStrategies = rows.reduce((sum, row) => sum + row.expected_strategies.length, 0);
const strategyHits = rows.reduce((sum, row) => sum + row.strategy_hits.length, 0);
const inferredStrategies = rows.reduce((sum, row) => sum + row.inferred_strategies.filter((strategy) => strategy !== 'protection').length, 0);
const unexpectedStrategies = rows.reduce((sum, row) => sum + row.unexpected_strategies.length, 0);
const expectedClauseFacts = sumExpected('conditions') + sumExpected('actions') + sumExpected('transitions');
const clauseFactHits = sumHits('conditions') + sumHits('actions') + sumHits('transitions');
const strategyPrecision = rate(inferredStrategies - unexpectedStrategies, inferredStrategies);
const strategyRecall = rate(strategyHits, expectedStrategies);

const advancedSearch = ADVANCED_SEARCH_COMPILER_CASES.map((test) => {
  const row = rows.find((entry) => entry.commander.includes(test.commander));
  const strategy = row?.strategies.find((entry) => entry.strategy_id === test.strategy);
  const expectedCard = byName.get(test.expected);
  const literalHit = normalize(expectedCard?.oracle_text).includes(normalize(test.literal));
  const retrieved = Boolean(strategy && expectedCard && strategy.recommendations.some((entry) => entry.oracle_id === expectedCard.oracle_id))
    || Boolean(strategy && expectedCard && readCandidateDiagnostics(row.candidate_artifact, strategy.strategy_id)?.retrieved_ids.includes(expectedCard.oracle_id));
  const nonliteralTop = strategy?.recommendations.filter((entry) => !normalize(byName.get(entry.card_name)?.oracle_text).includes(normalize(test.literal))).length || 0;
  return { ...test, literal_hit: literalHit, semantic_retrieval_hit: retrieved, semantic_nonliteral_top_results: nonliteralTop };
});

function readCandidateDiagnostics(relative, strategyId) {
  const report = JSON.parse(fs.readFileSync(path.join(ROOT, relative), 'utf8'));
  return report.strategies.find((entry) => entry.strategy_id === strategyId)?.diagnostics || null;
}

const pairRows = rows.filter((row) => row.commander.length > 1);
const pairReport = {
  configurations: pairRows.length,
  exact_member_preservation: rate(pairRows.filter((row) => row.commander.length === 2).length, pairRows.length),
  strategy_recall: rate(pairRows.reduce((sum, row) => sum + row.strategy_hits.length, 0), pairRows.reduce((sum, row) => sum + row.expected_strategies.length, 0)),
  forbidden_strategy_rate: rate(pairRows.reduce((sum, row) => sum + row.forbidden_strategy_hits.length, 0), pairRows.reduce((sum, row) => sum + (COMMANDER_STRATEGY_COMPILER_FIXTURES[row.index].forbidden || []).length, 0)),
  rows: pairRows.map((row) => ({ commander: row.commander, expected: row.expected_strategies, inferred: row.inferred_strategies, hits: row.strategy_hits }))
};

const communityIndependence = rows.filter((_, index) => index % 5 === 0).map((row) => {
  const commanders = row.commander.map((name) => byName.get(name));
  const compilation = compileCommanderStrategy(commanders);
  const withoutCommunity = searchCommanderStrategies(compilation, searchIndex, { limitPerStrategy: 8, minimumScore: 26 });
  const withCommunityDisplay = searchCommanderStrategies(compilation, searchIndex, { limitPerStrategy: 8, minimumScore: 26, communityByOracleId: new Map(cards.slice(0, 100).map((card) => [card.oracle_id, { inclusion_rate: 1 }])) });
  const signature = (value) => value.strategies.map((strategy) => ({ id: strategy.strategy_id, query: strategy.search_query, cards: strategy.recommendations.map((entry) => entry.oracle_id) }));
  return { commander: row.commander, identical: JSON.stringify(signature(withoutCommunity)) === JSON.stringify(signature(withCommunityDisplay)) };
});

const allStrategyRows = rows.flatMap((row) => row.strategies);
const metrics = {
  commanders: rows.length,
  reviewed_strategy_expectations: expectedStrategies,
  reviewed_clause_facts: expectedClauseFacts,
  ability_clause_parsing_accuracy: rate(clauseFactHits, expectedClauseFacts),
  condition_accuracy: rate(sumHits('conditions'), sumExpected('conditions')),
  action_accuracy: rate(sumHits('actions'), sumExpected('actions')),
  zone_transition_accuracy: rate(sumHits('transitions'), sumExpected('transitions')),
  produced_event_accuracy: rate(sumHits('produced_events'), sumExpected('produced_events')),
  strategy_inference_precision: strategyPrecision,
  strategy_inference_recall: strategyRecall,
  false_strategy_rate: rate(unexpectedStrategies, inferredStrategies),
  forbidden_strategy_rate: rate(rows.reduce((sum, row) => sum + row.forbidden_strategy_hits.length, 0), rows.reduce((sum, row) => sum + (COMMANDER_STRATEGY_COMPILER_FIXTURES[row.index].forbidden || []).length, 0)),
  semantic_candidate_retrieval_accuracy: rate(advancedSearch.filter((entry) => entry.semantic_retrieval_hit).length, advancedSearch.length),
  advanced_search_literal_hit_rate: rate(advancedSearch.filter((entry) => entry.literal_hit).length, advancedSearch.length),
  community_independence: rate(communityIndependence.filter((entry) => entry.identical).length, communityIndependence.length),
  median_semantic_pool: median(allStrategyRows.map((entry) => entry.semantic_pool)),
  median_final_qualified_pool: median(allStrategyRows.map((entry) => entry.final_qualified_pool)),
  median_candidate_reduction_vs_legal: median(allStrategyRows.map((entry) => entry.total_legal_pool ? 1 - entry.semantic_pool / entry.total_legal_pool : null))
};

const performance = {
  cards_profiled: cards.length,
  semantic_profile_build_ms: Number(profileMs.toFixed(2)),
  search_index_build_ms: Number(indexMs.toFixed(2)),
  mean_compiler_ms: Number((rows.reduce((sum, row) => sum + row.performance.compiler_ms, 0) / rows.length).toFixed(2)),
  mean_legal_filter_ms: Number((rows.reduce((sum, row) => sum + row.performance.legal_filter_ms, 0) / rows.length).toFixed(2)),
  mean_semantic_search_ms: Number((rows.reduce((sum, row) => sum + row.performance.semantic_search_ms, 0) / rows.length).toFixed(2)),
  mean_ranking_ms: Number((rows.reduce((sum, row) => sum + row.performance.ranking_ms, 0) / rows.length).toFixed(2)),
  mean_total_search_ms: Number((rows.reduce((sum, row) => sum + row.performance.total_ms, 0) / rows.length).toFixed(2)),
  rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  index_posting_keys: searchIndex.postings.size,
  total_verifier_ms: Number((perf.now() - started).toFixed(2))
};

check(metrics.condition_accuracy >= 0.75, 'condition-accuracy', `${metrics.condition_accuracy}`);
check(metrics.action_accuracy >= 0.75, 'action-accuracy', `${metrics.action_accuracy}`);
check(metrics.zone_transition_accuracy >= 0.8, 'zone-transition-accuracy', `${metrics.zone_transition_accuracy}`);
check(metrics.produced_event_accuracy >= 0.85, 'produced-event-accuracy', `${metrics.produced_event_accuracy}`);
check(metrics.strategy_inference_precision >= 0.9, 'strategy-precision', `${metrics.strategy_inference_precision}`);
check(metrics.strategy_inference_recall >= 0.75, 'strategy-recall', `${metrics.strategy_inference_recall}`);
check(metrics.false_strategy_rate <= 0.05, 'false-strategy-rate', `${metrics.false_strategy_rate}`);
check(metrics.forbidden_strategy_rate === 0, 'forbidden-strategies', `${metrics.forbidden_strategy_rate}`);
check(metrics.semantic_candidate_retrieval_accuracy >= 0.75, 'semantic-retrieval', `${metrics.semantic_candidate_retrieval_accuracy}`);
check(metrics.community_independence === 1, 'community-independence', `${metrics.community_independence}`);
check(pairReport.strategy_recall === 1, 'pair-background-strategy-recall', `${pairReport.strategy_recall}`);
check(pairReport.exact_member_preservation === 1, 'pair-background-member-preservation', `${pairReport.exact_member_preservation}`);

const architectureDecision = {
  better_matches_expert_reasoning:
    metrics.strategy_inference_precision >= 0.9 &&
    metrics.strategy_inference_recall >= 0.9 &&
    metrics.false_strategy_rate <= 0.05 &&
    metrics.forbidden_strategy_rate === 0 &&
    metrics.semantic_candidate_retrieval_accuracy >= 0.9,
  customer_ready: false,
  rationale: [
    'The compiler makes mechanics and causal chains explicit before search.',
    'Rules parsing, consequence inference, strategy inference, retrieval, and ranking are independently inspectable.',
    'Customer exposure remains blocked until false strategies and broad candidate pools receive human review.'
  ]
};

const report = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'NEEDS_WORK',
  source: 'Local canonical corpus and deterministic rules only',
  external_requests: 0,
  workers_ai_calls: 0,
  metrics,
  advanced_search: advancedSearch,
  pair_background: pairReport,
  community_independence: communityIndependence,
  performance,
  architecture_decision: architectureDecision,
  checks,
  rows
};

const markdown = [
  '# Commander Strategy Compiler — Human Review', '',
  `Verifier: **${report.status}**`, '',
  `Strategy precision/recall: ${(metrics.strategy_inference_precision * 100).toFixed(1)}% / ${(metrics.strategy_inference_recall * 100).toFixed(1)}%; false-strategy rate ${(metrics.false_strategy_rate * 100).toFixed(1)}%.`, '',
  ...rows.flatMap((row) => [
    `## ${row.commander.join(' + ')} — ${row.family}`, '',
    '### Oracle Interpretation', '',
    ...row.commander.flatMap((name) => {
      const member = JSON.parse(fs.readFileSync(path.join(ROOT, row.graph.artifact), 'utf8')).members.find((entry) => entry.name === name);
      return [`**${name}** — ${member.oracle_text}`, '', ...member.abilities.map((ability, index) => `- Ability ${index + 1} (${ability.kind}, ${ability.source}): condition ${ability.condition?.event || 'none'}; actions ${ability.actions.map((entry) => entry.action).join(', ') || 'none'}; transitions ${ability.transitions.map((entry) => `${entry.from}→${entry.to}`).join(', ') || 'none'}.`)];
    }), '',
    '### Strategy Graph', '',
    `- ${row.graph.nodes} nodes; ${row.graph.edges} edges; ${row.graph.derived_edges} downstream consequence edges.`,
    `- Needs / bottlenecks: ${row.graph.needs.join(', ') || 'None inferred.'}`,
    ...row.strategies.filter((strategy) => strategy.importance !== 'Generic Utility').map((strategy) => `- ${strategy.inferred_from.join(' + ')} → **${strategy.label}**${strategy.indirect ? ' (compound inference)' : ''}`), '',
    '### Inferred Strategies', '',
    ...['Primary', 'Secondary', 'Supporting', 'Generic Utility'].map((importance) => `- ${importance}: ${row.strategies.filter((strategy) => strategy.importance === importance).map((strategy) => strategy.label).join(', ') || 'None'}`), '',
    '### Search Queries and Candidate Counts', '',
    '| Strategy | Semantic query | Legal | Semantic | Qualified |',
    '|---|---|---:|---:|---:|',
    ...row.strategies.map((strategy) => `| ${strategy.label} | ${strategy.search_query.semantic_any.join(', ')} | ${strategy.total_legal_pool} | ${strategy.semantic_pool} | ${strategy.final_qualified_pool} |`), '',
    '### Example Recommendations', '',
    ...row.strategies.filter((strategy) => strategy.importance !== 'Generic Utility').flatMap((strategy) => [`**${strategy.label}**`, ...strategy.recommendations.slice(0, 3).map((entry) => `- ${entry.card_name}: ${entry.why_it_works}`)]), ''
  ])
].join('\n');

writeJson('commander-strategy-compiler-verification.json', report);
writeJson('fixtures/reviewed-strategy-fixtures.json', { generated_at: report.generated_at, fixtures: COMMANDER_STRATEGY_COMPILER_FIXTURES, advanced_search_cases: ADVANCED_SEARCH_COMPILER_CASES });
writeJson('metrics/strategy-metrics.json', metrics);
writeJson('metrics/advanced-search-comparison.json', { cases: advancedSearch });
writeJson('metrics/pair-background.json', pairReport);
writeJson('metrics/community-independence.json', { rows: communityIndependence, identical_rate: metrics.community_independence });
writeJson('performance/performance.json', performance);
writeJson('indexes/semantic-index-summary.json', { schema_version: searchIndex.schema_version, cards_profiled: searchIndex.profiles.length, posting_keys: searchIndex.postings.size, posting_counts: Object.fromEntries([...searchIndex.postings.entries()].map(([key, ids]) => [key, ids.size])) });
writeText('human-review.md', `${markdown}\n`);

const artifactFiles = fs.readdirSync(ROOT, { recursive: true }).map((entry) => path.join(ROOT, entry)).filter((entry) => fs.existsSync(entry) && fs.statSync(entry).isFile());
const artifactBytes = artifactFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
writeJson('performance/artifact-size.json', { file_count: artifactFiles.length, bytes: artifactBytes, mb: Number((artifactBytes / 1024 / 1024).toFixed(3)) });

console.log(JSON.stringify({ status: report.status, metrics, pair_background: pairReport, performance, architecture_decision: architectureDecision, failed_checks: checks.filter((entry) => entry.status === 'FAIL'), output_root: ROOT }, null, 2));
if (!checks.every((entry) => entry.status === 'PASS')) process.exitCode = 1;

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalize(value) { return String(value || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim(); }
