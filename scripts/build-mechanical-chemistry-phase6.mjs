import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE6_COMMANDERS } from './fixtures/mechanical-chemistry-phase6-fixtures.mjs';
import { buildMechanicalRecommendations, buildSemanticCardProfile, MECHANICAL_CHEMISTRY_SCHEMA_VERSION } from '../src/services/commander/mechanicalChemistryCore.js';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const DEFAULT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase6' : path.join(REPO_ROOT, '.devcache', 'mechanical-chemistry', 'phase6');
function safeRoot(value) { const resolved = path.resolve(value); if (process.platform === 'win32' && /^c:/i.test(resolved.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${resolved}`); return resolved; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value, pretty = false) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, pretty ? 2 : 0)}\n`); }
function sizeOf(directory) { if (!fs.existsSync(directory)) return 0; return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? sizeOf(path.join(directory, entry.name)) : fs.statSync(path.join(directory, entry.name)).size), 0); }
function loadCommunity(commanderId) {
  const file = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'commander-details', `${commanderId}.json`);
  if (!fs.existsSync(file)) return new Map();
  const detail = readJson(file);
  const rows = [...(detail.top_synergy_cards || []), ...(detail.observed_cards || []), ...(detail.new_cards || []), ...(detail.game_changers || []), ...(detail.categories || []).flatMap((section) => section.cards || [])];
  return new Map(rows.filter((row) => row.oracle_id).map((row) => [row.oracle_id, row]));
}
function compactFeatures(features = []) {
  return features.map((feature) => ({ k: feature.key, c: feature.confidence, m: feature.magnitude, s: feature.scaling, r: feature.repeatable, d: feature.direction, o: feature.object_class, t: feature.counter_type, x: feature.source_kind }));
}
function compactProfile(profile) {
  return { id: profile.oracle_id, n: profile.name, mv: profile.mana_value, ci: profile.color_identity, ty: profile.types, st: profile.subtypes, p: compactFeatures(profile.produces), w: compactFeatures(profile.wants), rw: compactFeatures(profile.rewards), e: compactFeatures(profile.enables), ro: compactFeatures(profile.roles), rs: compactFeatures(profile.resources), cv: profile.conversions, dl: profile.delivery, gy: profile.graveyard_quality, so: profile.sacrifice_outlet, sa: profile.sacrifice_activation, cp: profile.control_profile, etb: profile.etb_profile, tm: profile.tribal_roles, u: profile.semantic_uncertainty, pc: profile.parser_certainty };
}
function buildIndex(profiles) {
  const index = {};
  const groups = [['p', 'produces'], ['w', 'wants'], ['rw', 'rewards'], ['e', 'enables'], ['ro', 'roles'], ['rs', 'resources']];
  for (const profile of profiles) for (const [field, label] of groups) for (const feature of profile[field]) (index[`${label}:${feature.k}`] ||= []).push(profile.id);
  return index;
}
function compactResult(result) {
  const recommendations = result.recommendations.map((card) => ({
    oracle_id: card.oracle_id, card_name: card.card_name, image_url: card.image_url, mana_cost: card.mana_cost,
    cmc: card.cmc, type_line: card.type_line, mechanical_score: card.mechanical_score,
    ranking_score: card.ranking_score, mechanical_fit_label: card.mechanical_fit_label,
    confidence: card.confidence, commander_centrality: card.commander_centrality,
    role: card.category, roles: card.roles,
    why_it_works: card.mechanical_reasons[0]?.explanation || null,
    mechanical_reasons: card.mechanical_reasons,
    warnings: card.mechanical_penalties.map((penalty) => penalty.explanation),
    community_inclusion: card.community_inclusion, community_observation_count: card.community_observation_count,
    score_components: card.score_components, ranking_quality: card.ranking_quality
  }));
  return {
    schema_version: result.schema_version, generated_at: result.generated_at,
    commander_profile: {
      commander_identity: result.commander_profile.commander_identity,
      commander_names: result.commander_profile.commander_names,
      color_identity: result.commander_profile.color_identity,
      semantic_coverage: result.commander_profile.semantic_coverage
    },
    release_policy: result.release_policy, suppressed: result.suppressed,
    ranking_strategy: result.ranking_strategy, recommendations,
    categories: result.categories.map((section) => ({ category: section.category, label: section.label, oracle_ids: section.cards.map((card) => card.oracle_id) }))
  };
}

export function buildPhase6(options = {}) {
  const started = performance.now();
  const outputRoot = safeRoot(options.outputRoot || DEFAULT_ROOT);
  const releaseFile = path.join(outputRoot, 'release-readiness.json');
  const release = fs.existsSync(releaseFile) ? readJson(releaseFile) : { release_gate_met: false };
  const rawCards = loadCanonicalCards();
  const byName = new Map(rawCards.map((card) => [card.name, card]));
  const profileStarted = performance.now();
  const cards = rawCards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
  const profileMs = performance.now() - profileStarted;
  const compact = cards.map(compactProfile);
  const profilePath = path.join(outputRoot, 'semantic-profiles.compact.json');
  const indexPath = path.join(outputRoot, 'feature-index.compact.json');
  writeJson(profilePath, { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, card_count: compact.length, profiles: compact });
  writeJson(indexPath, { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, features: buildIndex(compact) });

  const rows = [];
  const review = [];
  for (const definition of PHASE6_COMMANDERS) {
    const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
    if (commanders.length !== definition.names.length) { rows.push({ ...definition, status: 'missing' }); continue; }
    const scoreStarted = performance.now();
    const community = commanders.length === 1 ? loadCommunity(commanders[0].oracle_id) : new Map();
    const result = buildMechanicalRecommendations(commanders, cards, { limit: Number(options.limit || 80), perCategory: 10, minimumScore: 16, communityByOracleId: community, suppressInsufficient: true });
    const identity = result.commander_profile.commander_identity;
    writeJson(path.join(outputRoot, 'recommendations', `${identity}.json`), compactResult(result));
    rows.push({ family: definition.family, archetype: definition.archetype, names: definition.names, identity, status: result.suppressed ? 'suppressed' : 'built', release_policy: result.release_policy, coverage: result.commander_profile.semantic_coverage, runtime_ms: Number((performance.now() - scoreStarted).toFixed(1)), recommendations: result.recommendations.length });
    review.push({ commander: definition.names, family: definition.family, release_policy: result.release_policy, coverage: result.commander_profile.semantic_coverage, top_10: result.recommendations.slice(0, 10).map((card) => ({ card_name: card.card_name, fit: card.mechanical_fit_label, confidence: card.confidence, role: card.category, centrality: card.commander_centrality, why_it_works: card.mechanical_reasons[0]?.explanation || null, community_inclusion: card.community_inclusion, warnings: card.mechanical_penalties.map((penalty) => penalty.explanation) })) });
  }
  writeJson(path.join(outputRoot, 'human-review-top10-built.json'), { generated_at: new Date().toISOString(), commander_count: review.length, commanders: review }, true);
  const recommendationMs = rows.reduce((sum, row) => sum + Number(row.runtime_ms || 0), 0);
  const report = {
    schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, generated_at: new Date().toISOString(),
    source: 'Local canonical MTG corpus and legality index only', external_requests: 0,
    card_count: cards.length, commander_count: rows.length,
    semantic_profile_ms: Number(profileMs.toFixed(1)), commander_recommendation_ms: Number(recommendationMs.toFixed(1)),
    mean_per_commander_recompute_ms: Number((recommendationMs / Math.max(1, rows.length)).toFixed(1)),
    total_runtime_ms: Number((performance.now() - started).toFixed(1)),
    memory_rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    output_root: outputRoot, release_gate_met: Boolean(release.release_gate_met), local_prototype_refreshed: false,
    prototype_reason: release.release_gate_met ? 'Eligible, but no prototype refresh was requested.' : 'Release gate failed; current prototype artifacts were not replaced.', commanders: rows
  };
  writeJson(path.join(outputRoot, 'build-report.json'), report, true);
  report.artifact_size_bytes = sizeOf(outputRoot);
  report.artifact_size_mb = Number((report.artifact_size_bytes / 1024 / 1024).toFixed(2));
  const recommendationBytes = sizeOf(path.join(outputRoot, 'recommendations'));
  report.artifact_bytes_by_category = { profiles: fs.statSync(profilePath).size, feature_index: fs.statSync(indexPath).size, recommendations: recommendationBytes, reports: Math.max(0, sizeOf(outputRoot) - fs.statSync(profilePath).size - fs.statSync(indexPath).size - recommendationBytes) };
  writeJson(path.join(outputRoot, 'build-report.json'), report, true);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)))) console.log(JSON.stringify(buildPhase6({ outputRoot: process.argv[2] || DEFAULT_ROOT }), null, 2));
