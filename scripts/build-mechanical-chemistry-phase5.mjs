import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE5_COMMANDERS } from './fixtures/mechanical-chemistry-phase5-fixtures.mjs';
import { buildMechanicalRecommendations, buildSemanticCardProfile, MECHANICAL_CHEMISTRY_SCHEMA_VERSION } from '../src/services/commander/mechanicalChemistryCore.js';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const DEFAULT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase5' : path.join(REPO_ROOT, '.devcache', 'mechanical-chemistry', 'phase5');
function safeRoot(value) { const resolved = path.resolve(value); if (process.platform === 'win32' && /^c:/i.test(resolved.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${resolved}`); return resolved; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sizeOf(directory) { if (!fs.existsSync(directory)) return 0; return fs.readdirSync(directory, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? sizeOf(path.join(directory, entry.name)) : fs.statSync(path.join(directory, entry.name)).size), 0); }
function loadCommunity(commanderId) {
  const file = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'commander-details', `${commanderId}.json`);
  if (!fs.existsSync(file)) return new Map();
  const detail = readJson(file);
  const rows = [...(detail.top_synergy_cards || []), ...(detail.observed_cards || []), ...(detail.new_cards || []), ...(detail.game_changers || []), ...(detail.categories || []).flatMap((section) => section.cards || [])];
  return new Map(rows.filter((row) => row.oracle_id).map((row) => [row.oracle_id, row]));
}
function compactFeatures(features) { return features.map(({ key, confidence, magnitude, scaling, repeatable, direction, object_class, counter_type, source_kind }) => ({ key, confidence, magnitude, scaling, repeatable, direction, object_class, counter_type, source_kind })); }
function compactProfile(profile) {
  return { oracle_id: profile.oracle_id, name: profile.name, mana_value: profile.mana_value, color_identity: profile.color_identity, types: profile.types, subtypes: profile.subtypes, produces: compactFeatures(profile.produces), wants: compactFeatures(profile.wants), rewards: compactFeatures(profile.rewards), enables: compactFeatures(profile.enables), roles: compactFeatures(profile.roles), resources: compactFeatures(profile.resources), conversions: profile.conversions, delivery: profile.delivery, graveyard_quality: profile.graveyard_quality, sacrifice_outlet: profile.sacrifice_outlet, sacrifice_activation: profile.sacrifice_activation, control_profile: profile.control_profile, etb_profile: profile.etb_profile, etb_multiplier: Boolean(profile.etb_multiplier), tribal_roles: profile.tribal_roles, semantic_uncertainty: profile.semantic_uncertainty, parser_certainty: profile.parser_certainty };
}
function buildIndex(profiles) {
  const index = {};
  for (const profile of profiles) for (const group of ['produces', 'wants', 'rewards', 'enables', 'roles', 'resources']) for (const feature of profile[group]) (index[`${group}:${feature.key}`] ||= []).push(profile.oracle_id);
  return index;
}

export function buildPhase5(options = {}) {
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
  for (const definition of PHASE5_COMMANDERS) {
    const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
    if (commanders.length !== definition.names.length) { rows.push({ ...definition, status: 'missing' }); continue; }
    const scoreStarted = performance.now();
    const community = commanders.length === 1 ? loadCommunity(commanders[0].oracle_id) : new Map();
    const result = buildMechanicalRecommendations(commanders, cards, { limit: Number(options.limit || 80), perCategory: 10, minimumScore: 16, communityByOracleId: community, suppressInsufficient: true });
    const identity = result.commander_profile.commander_identity;
    writeJson(path.join(outputRoot, 'recommendations', `${identity}.json`), result);
    rows.push({ family: definition.family, archetype: definition.archetype, names: definition.names, identity, status: result.suppressed ? 'suppressed' : 'built', release_policy: result.release_policy, coverage: result.commander_profile.semantic_coverage, runtime_ms: Number((performance.now() - scoreStarted).toFixed(1)), recommendations: result.recommendations.length });
    review.push({ commander: definition.names, family: definition.family, release_policy: result.release_policy, coverage: result.commander_profile.semantic_coverage, top_10: result.recommendations.slice(0, 10).map((card) => ({ card_name: card.card_name, fit: card.mechanical_fit_label, confidence: card.confidence, role: card.category, why_it_works: card.mechanical_reasons[0]?.explanation || null, community_inclusion: card.community_inclusion, warnings: card.mechanical_penalties.map((penalty) => penalty.explanation) })) });
  }
  writeJson(path.join(outputRoot, 'human-review-top10-built.json'), { generated_at: new Date().toISOString(), commander_count: review.length, commanders: review });
  const recommendationMs = rows.reduce((sum, row) => sum + Number(row.runtime_ms || 0), 0);
  const report = { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, generated_at: new Date().toISOString(), source: 'Local canonical MTG corpus and legality index only', external_requests: 0, card_count: cards.length, commander_count: rows.length, semantic_profile_ms: Number(profileMs.toFixed(1)), commander_recommendation_ms: Number(recommendationMs.toFixed(1)), mean_per_commander_recompute_ms: Number((recommendationMs / Math.max(1, rows.length)).toFixed(1)), total_runtime_ms: Number((performance.now() - started).toFixed(1)), memory_rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)), output_root: outputRoot, release_gate_met: Boolean(release.release_gate_met), local_prototype_refreshed: false, prototype_reason: release.release_gate_met ? 'Eligible, but publishing requires explicit --publish-preview.' : 'Release gate failed; current prototype artifacts were not replaced.', commanders: rows };
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  report.artifact_size_bytes = sizeOf(outputRoot);
  report.artifact_size_mb = Number((report.artifact_size_bytes / 1024 / 1024).toFixed(2));
  report.artifact_bytes_by_category = { profiles: fs.statSync(profilePath).size, feature_index: fs.statSync(indexPath).size, recommendations: sizeOf(path.join(outputRoot, 'recommendations')), reports: Math.max(0, sizeOf(outputRoot) - fs.statSync(profilePath).size - fs.statSync(indexPath).size - sizeOf(path.join(outputRoot, 'recommendations'))) };
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)))) console.log(JSON.stringify(buildPhase5({ outputRoot: process.argv[2] || DEFAULT_ROOT }), null, 2));
