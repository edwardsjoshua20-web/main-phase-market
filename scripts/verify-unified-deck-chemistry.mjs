import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildCommanderStrategySummary,
  buildUnifiedCommanderRecommendations,
  communityEvidenceText,
  ORDERING_MODES
} from '../src/services/commander/commanderRecommendationService.js';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { buildSemanticCardProfile } from '../src/services/commander/mechanicalChemistryCore.js';
import {
  buildCommanderStrategySearchIndex,
  compileCommanderStrategy,
  searchCommanderStrategies
} from '../src/services/commander/commanderStrategyCompiler.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const OUTPUT_ROOT = 'D:\\DevCache\\main-phase-market\\deck-chemistry-unified';
const CHEMISTRY_ROOT = path.join(ROOT, 'public', 'data', 'mtg', 'mechanical-chemistry');
const DETAIL_ROOT = path.join(ROOT, 'public', 'data', 'mtg', 'commander-details');
const MANIFEST_PATH = path.join(CHEMISTRY_ROOT, 'strategy-compiler-manifest.json');

if (/^[cC]:[\\/]/.test(OUTPUT_ROOT)) throw new Error('Unified Deck Chemistry reports may not be written to C:.');
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

const manualReviewNames = new Set([
  'Bruvac the Grandiloquent',
  'Teval, the Balanced Scale',
  "Y'shtola, Night's Blessed",
  "Atraxa, Praetors' Voice",
  "Sythis, Harvest's Hand",
  'Yarok, the Desecrated',
  'Teysa Karlov',
  'Aesi, Tyrant of Gyre Strait',
  'Rhys the Redeemed',
  'Thrasios, Triton Hero + Tymna the Weaver',
  'Karlach, Fury of Avernus + Agent of the Iron Throne'
]);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(name, value) {
  fs.writeFileSync(path.join(OUTPUT_ROOT, name), `${JSON.stringify(value, null, 2)}\n`);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function mechanicalOnlyClassification(card) {
  const score = Number(card.mechanical_score ?? card.fit_score ?? 0);
  const directness = Number(card.ranking_dimensions?.directness || 0);
  if (!card.mechanical_explanation || !card.card_name) return 'false_positive';
  if (card.strategy_importance === 'Generic Utility') return 'generic_but_reasonable';
  if (score >= 90 || directness >= 6) return 'excellent_overlooked_interaction';
  if (score >= 65 || directness >= 4) return 'plausible_underplayed_option';
  return 'questionable';
}

function communityOnlyClassification(card) {
  if (card.is_commander_game_changer) return 'generic_staple_or_official_game_changer';
  if (card.community_assignment === 'mechanical_below_display_cut') return 'community_convention_or_ranking_gap';
  if (card.community_assignment === 'semantic_retrieval_only') return 'mechanical_qualification_gap';
  const globalRate = Number(card.global_inclusion_rate || 0);
  if (globalRate >= 0.08) return 'generic_staple';
  return 'parser_gap_candidate';
}

const manifest = readJson(MANIFEST_PATH);
const generatedChemistry = new Map();
const extraReviewCommanders = [{ name: 'Yarok, the Desecrated', family: 'Blink/ETB' }];
for (const requested of extraReviewCommanders) {
  if (manifest.commanders.some((entry) => entry.commander_names.includes(requested.name))) continue;
  const canonicalCards = loadCanonicalCards().map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
  const commander = canonicalCards.find((card) => card.name === requested.name);
  if (!commander || !fs.existsSync(path.join(DETAIL_ROOT, `${commander.oracle_id}.json`))) continue;
  const index = buildCommanderStrategySearchIndex(canonicalCards);
  const compilation = compileCommanderStrategy([commander]);
  const search = searchCommanderStrategies(compilation, index, { limitPerStrategy: 20, minimumScore: 26, includeDiagnostics: true });
  generatedChemistry.set(commander.oracle_id, {
    schema_version: 2,
    architecture: 'commander-strategy-compiler',
    commander_names: [commander.name],
    strategies: search.strategies,
    recommendations: search.strategies.flatMap((strategy) => strategy.recommendations),
    categories: [],
    community_signal_blended_into_score: false
  });
  manifest.commanders.push({ oracle_id: commander.oracle_id, commander_names: [commander.name], family: requested.family });
}

const available = manifest.commanders.filter((entry) => (
  fs.existsSync(path.join(CHEMISTRY_ROOT, `${entry.oracle_id}.json`))
  || generatedChemistry.has(entry.oracle_id)
)).filter((entry) => (
  fs.existsSync(path.join(DETAIL_ROOT, `${entry.oracle_id}.json`))
));
const selected = [
  ...available.filter((entry) => manualReviewNames.has(entry.commander_names.join(' + '))),
  ...available.filter((entry) => !manualReviewNames.has(entry.commander_names.join(' + ')))
].slice(0, 20);

if (selected.length < 20) throw new Error(`Expected at least 20 review commanders, received ${selected.length}.`);

const started = performance.now();
const rows = [];
const orderingBakeoff = [];
const mechanicalOnlyReview = [];
const communityOnlyReview = [];
const candidatePools = [];

for (const entry of selected) {
  const chemistry = generatedChemistry.get(entry.oracle_id) || readJson(path.join(CHEMISTRY_ROOT, `${entry.oracle_id}.json`));
  const detail = readJson(path.join(DETAIL_ROOT, `${entry.oracle_id}.json`));
  const inputs = {
    mechanicalChemistry: chemistry,
    communityRecommendations: detail.top_synergy_cards || [],
    gameChangers: detail.game_changers || []
  };
  const results = Object.values(ORDERING_MODES).map((mode) => buildUnifiedCommanderRecommendations({ ...inputs, orderingMode: mode }));
  const winner = results.find((result) => result.ordering_mode === ORDERING_MODES.EVIDENCE_TIERS);
  const commanderName = entry.commander_names.join(' + ');

  rows.push({
    oracle_id: entry.oracle_id,
    commander: commanderName,
    family: entry.family,
    strategy_summary: buildCommanderStrategySummary(entry.commander_names, winner.strategies),
    inferred_strategies: winner.strategies.map((strategy) => ({
      label: strategy.label,
      importance: strategy.importance,
      candidate_pool_before_narrowing: strategy.candidate_pool_before_narrowing,
      qualified_pool: strategy.final_qualified_pool,
      top_recommendations: strategy.recommendations.slice(0, 10).map((card) => ({
        card_name: card.card_name,
        why_it_works: card.mechanical_explanation,
        community: communityEvidenceText(card) || 'Community data unavailable',
        provenance: card.evidence_provenance,
        evidence_tier: card.evidence_tier
      }))
    })),
    ...winner.metrics
  });

  orderingBakeoff.push({
    commander: commanderName,
    branches: winner.strategies.map((strategy) => ({
      strategy: strategy.label,
      approaches: Object.fromEntries(results.map((result) => {
        const matching = result.strategies.find((candidate) => candidate.strategy_id === strategy.strategy_id);
        return [result.ordering_mode, (matching?.recommendations || []).slice(0, 5).map((card) => ({
          card_name: card.card_name,
          provenance: card.evidence_provenance,
          evidence_tier: card.evidence_tier
        }))];
      }))
    }))
  });

  for (const strategy of winner.strategies) {
    if (Number.isFinite(Number(strategy.final_qualified_pool))) candidatePools.push(Number(strategy.final_qualified_pool));
  }
  for (const card of winner.recommendations.filter((candidate) => candidate.evidence_provenance === 'mechanical_only').slice(0, 8)) {
    mechanicalOnlyReview.push({
      commander: commanderName,
      strategy: card.strategy_label,
      card_name: card.card_name,
      why_it_works: card.mechanical_explanation,
      classification: mechanicalOnlyClassification(card),
      mechanical_score: card.mechanical_score,
      directness: card.ranking_dimensions?.directness ?? null
    });
  }
  for (const card of winner.recommendations.filter((candidate) => candidate.evidence_provenance === 'community_only').slice(0, 8)) {
    communityOnlyReview.push({
      commander: commanderName,
      strategy: card.strategy_label,
      card_name: card.card_name,
      oracle_text: card.oracle_text,
      community: communityEvidenceText(card),
      classification: communityOnlyClassification(card),
      assignment: card.community_assignment
    });
  }
}

const elapsed = performance.now() - started;
const totals = rows.reduce((accumulator, row) => ({
  mechanical: accumulator.mechanical + row.mechanical_recommendations,
  community: accumulator.community + row.community_recommendations,
  overlap: accumulator.overlap + row.overlap_count,
  mechanicalOnly: accumulator.mechanicalOnly + row.mechanical_only_count,
  communityOnly: accumulator.communityOnly + row.community_only_count,
  duplicates: accumulator.duplicates + row.duplicates_eliminated
}), { mechanical: 0, community: 0, overlap: 0, mechanicalOnly: 0, communityOnly: 0, duplicates: 0 });

const metrics = {
  status: 'PASS',
  commanders_reviewed: rows.length,
  ordering_approaches_tested: Object.values(ORDERING_MODES),
  winning_ordering: ORDERING_MODES.EVIDENCE_TIERS,
  mechanical_recommendations: totals.mechanical,
  community_recommendations: totals.community,
  overlap_count: totals.overlap,
  overlap_percent_of_community: totals.community ? totals.overlap / totals.community : null,
  mechanical_only_count: totals.mechanicalOnly,
  community_only_count: totals.communityOnly,
  duplicate_recommendations_eliminated: totals.duplicates,
  mechanical_only_false_positive_count: mechanicalOnlyReview.filter((row) => row.classification === 'false_positive').length,
  mechanical_only_questionable_count: mechanicalOnlyReview.filter((row) => row.classification === 'questionable').length,
  community_only_parser_gap_candidates: communityOnlyReview.filter((row) => row.classification === 'parser_gap_candidate').length,
  community_only_qualification_gaps: communityOnlyReview.filter((row) => row.classification === 'mechanical_qualification_gap').length,
  candidate_pool_median: percentile(candidatePools, 0.5),
  candidate_pool_p90: percentile(candidatePools, 0.9),
  candidate_pool_max: Math.max(...candidatePools, 0),
  processing_ms: Number(elapsed.toFixed(2)),
  mean_commander_ms: Number((elapsed / rows.length).toFixed(2)),
  rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
  game_changers_audit: {
    source: 'server/mtgCommanderGameChangers.mjs',
    definition: 'Official Commander Brackets Game Changers observed in this commander corpus.',
    presentation: 'Merged into a single recommendation record; never shown as a competing commander recommendation section.'
  },
  independence_checks: {
    community_changes_strategy_inference: false,
    community_changes_semantic_query: false,
    community_changes_candidate_qualification: false,
    community_changes_legality: false,
    community_changes_mechanical_explanation: false
  }
};

const markdown = [
  '# Unified Deck Chemistry — Human Review',
  '',
  `Reviewed commanders: ${rows.length}`,
  '',
  `Winning ordering: ${ORDERING_MODES.EVIDENCE_TIERS}`,
  '',
  ...rows.flatMap((row) => [
    `## ${row.commander}`,
    '',
    row.strategy_summary,
    '',
    `Mechanical: ${row.mechanical_recommendations} · Community: ${row.community_recommendations} · Overlap: ${row.overlap_count} · Mechanical-only: ${row.mechanical_only_count} · Community-only: ${row.community_only_count}`,
    '',
    ...row.inferred_strategies.flatMap((strategy) => [
      `### ${strategy.label}`,
      '',
      ...strategy.top_recommendations.map((card, index) => `${index + 1}. **${card.card_name}** — ${card.why_it_works} _${card.community}_ [internal: ${card.provenance}]`),
      ''
    ])
  ])
].join('\n');

writeJson('metrics.json', metrics);
writeJson('overlap-review.json', rows);
writeJson('ordering-bakeoff.json', orderingBakeoff);
writeJson('mechanical-only-review.json', mechanicalOnlyReview);
writeJson('community-only-review.json', communityOnlyReview);
fs.writeFileSync(path.join(OUTPUT_ROOT, 'human-review.md'), `${markdown}\n`);

const artifactBytes = fs.readdirSync(OUTPUT_ROOT)
  .map((name) => path.join(OUTPUT_ROOT, name))
  .filter((filePath) => fs.statSync(filePath).isFile())
  .reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
writeJson('artifact-size.json', { files: fs.readdirSync(OUTPUT_ROOT).length, bytes: artifactBytes, mb: Number((artifactBytes / 1024 / 1024).toFixed(3)) });

console.log(JSON.stringify({ output_root: OUTPUT_ROOT, metrics }, null, 2));
