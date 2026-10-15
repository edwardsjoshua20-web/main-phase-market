import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { PHASE4_COMMANDERS } from './fixtures/mechanical-chemistry-phase4-fixtures.mjs';
import { buildMechanicalRecommendations, buildSemanticCardProfile, MECHANICAL_CHEMISTRY_SCHEMA_VERSION } from '../src/services/commander/mechanicalChemistryCore.js';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const DEFAULT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase4' : path.join(REPO_ROOT, '.devcache', 'mechanical-chemistry', 'phase4');
function safeRoot(value) { const resolved = path.resolve(value); if (process.platform === 'win32' && /^c:/i.test(resolved.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${resolved}`); return resolved; }
function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`); }
function sizeOf(root) { if (!fs.existsSync(root)) return 0; return fs.readdirSync(root, { withFileTypes: true }).reduce((sum, entry) => sum + (entry.isDirectory() ? sizeOf(path.join(root, entry.name)) : fs.statSync(path.join(root, entry.name)).size), 0); }
function loadCommunity(commanderId) {
  const file = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'commander-details', `${commanderId}.json`);
  if (!fs.existsSync(file)) return new Map();
  const detail = readJson(file);
  const rows = [...(detail.top_synergy_cards || []), ...(detail.observed_cards || []), ...(detail.new_cards || []), ...(detail.game_changers || []), ...(detail.categories || []).flatMap((section) => section.cards || [])];
  const map = new Map();
  for (const row of rows) if (!map.has(row.oracle_id) || Number(row.deck_count || 0) > Number(map.get(row.oracle_id)?.deck_count || 0)) map.set(row.oracle_id, row);
  return map;
}
function compactProfile(profile) {
  const compactFeatures = (features) => features.map(({ key, confidence, magnitude, scaling, repeatable, direction, object_class, counter_type, source_kind }) => ({ key, confidence, magnitude, scaling, repeatable, direction, object_class, counter_type, source_kind }));
  return { oracle_id: profile.oracle_id, name: profile.name, mana_value: profile.mana_value, color_identity: profile.color_identity, types: profile.types, subtypes: profile.subtypes, produces: compactFeatures(profile.produces), wants: compactFeatures(profile.wants), rewards: compactFeatures(profile.rewards), enables: compactFeatures(profile.enables), roles: compactFeatures(profile.roles), resources: compactFeatures(profile.resources), conversions: profile.conversions, delivery: profile.delivery, graveyard_quality: profile.graveyard_quality, sacrifice_outlet: profile.sacrifice_outlet, tribal_roles: profile.tribal_roles, semantic_uncertainty: profile.semantic_uncertainty, parser_certainty: profile.parser_certainty };
}
function featureIndex(profiles) {
  const index = {};
  for (const profile of profiles) for (const group of ['produces', 'wants', 'rewards', 'enables', 'roles', 'resources']) for (const feature of profile[group]) (index[`${group}:${feature.key}`] ||= []).push(profile.oracle_id);
  return index;
}
function classifyPopularWeak(card) {
  const reasonKinds = new Set((card.mechanical_reasons || []).map((entry) => entry.relationship));
  if (!card.mechanical_reasons?.length) return 'unsupported parser gap';
  if (card.commander_centrality === 'Generic Utility') return 'generic staple';
  if (reasonKinds.has('fills_support_role')) return 'role/support card';
  if (card.semantic_uncertainty?.level !== 'low') return 'parser gap or ambiguous wording';
  return 'real synergy not fully captured';
}

export function buildPhase4(options = {}) {
  const started = performance.now();
  const outputRoot = safeRoot(options.outputRoot || DEFAULT_ROOT);
  const rawCards = loadCanonicalCards();
  const byName = new Map(rawCards.map((card) => [card.name, card]));
  const profileStarted = performance.now();
  const cards = rawCards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
  const profileMs = performance.now() - profileStarted;
  const compact = cards.map(compactProfile);
  const profilePath = path.join(outputRoot, 'semantic-profiles.compact.json');
  const indexPath = path.join(outputRoot, 'feature-index.compact.json');
  writeJson(profilePath, { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, card_count: compact.length, profiles: compact });
  writeJson(indexPath, { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, features: featureIndex(compact) });
  const commanderRows = [];
  const humanReview = [];
  const disagreement = [];
  const popularWeak = [];
  for (const definition of PHASE4_COMMANDERS) {
    const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
    if (commanders.length !== definition.names.length) { commanderRows.push({ ...definition, status: 'missing' }); continue; }
    const scoreStarted = performance.now();
    const community = commanders.length === 1 ? loadCommunity(commanders[0].oracle_id) : new Map();
    const result = buildMechanicalRecommendations(commanders, cards, { limit: Number(options.limit || 80), perCategory: 10, minimumScore: 16, communityByOracleId: community });
    const runtimeMs = performance.now() - scoreStarted;
    const identity = result.commander_profile.commander_identity;
    writeJson(path.join(outputRoot, 'recommendations', `${identity}.json`), result);
    commanderRows.push({ family: definition.family, archetype: definition.archetype, names: definition.names, identity, status: 'built', runtime_ms: Number(runtimeMs.toFixed(1)), recommendations: result.recommendations.length });
    humanReview.push({ commander: definition.names, family: definition.family, top_10: result.recommendations.slice(0, 10).map((card) => ({ card_name: card.card_name, fit: card.mechanical_fit_label, confidence: card.confidence, role: card.category, why_it_works: card.mechanical_reasons[0]?.explanation || null, community_inclusion: card.community_inclusion, warnings: card.mechanical_penalties.map((penalty) => penalty.explanation), uncertainty: card.semantic_uncertainty })) });
    disagreement.push({ commander: definition.names, high_mechanical_high_community: result.analysis.obvious_strength.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion })), high_mechanical_low_community: result.analysis.hidden_chemistry.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, reason: card.mechanical_reasons[0]?.explanation })), low_mechanical_high_community: result.analysis.popular_but_weak_mechanical_fit.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, classification: classifyPopularWeak(card) })) });
    for (const card of result.analysis.popular_but_weak_mechanical_fit.slice(0, 3)) popularWeak.push({ commander: definition.names, card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, classification: classifyPopularWeak(card), note: 'Community popularity is observational and is not treated as proof that the semantic score is wrong.' });
  }
  writeJson(path.join(outputRoot, 'human-review-top10.json'), { generated_at: new Date().toISOString(), commander_count: humanReview.length, commanders: humanReview });
  writeJson(path.join(outputRoot, 'community-disagreement.json'), { generated_at: new Date().toISOString(), mechanical_fit_uses_community: false, commanders: disagreement });
  writeJson(path.join(outputRoot, 'popular-low-mechanical-audit.json'), { generated_at: new Date().toISOString(), sample_size: popularWeak.length, rows: popularWeak });
  const recommendationMs = commanderRows.filter((row) => row.status === 'built').reduce((sum, row) => sum + row.runtime_ms, 0);
  const categoryBytes = { profiles: fs.statSync(profilePath).size, feature_index: fs.statSync(indexPath).size, recommendations: sizeOf(path.join(outputRoot, 'recommendations')), reports: sizeOf(outputRoot) - fs.statSync(profilePath).size - fs.statSync(indexPath).size - sizeOf(path.join(outputRoot, 'recommendations')) };
  const report = { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, generated_at: new Date().toISOString(), source: 'Local canonical MTG corpus and legality index only', external_requests: 0, card_count: cards.length, commander_count: commanderRows.filter((row) => row.status === 'built').length, semantic_profile_ms: Number(profileMs.toFixed(1)), sixty_commander_recommendation_ms: Number(recommendationMs.toFixed(1)), mean_per_commander_recompute_ms: Number((recommendationMs / Math.max(1, commanderRows.length)).toFixed(1)), total_runtime_ms: Number((performance.now() - started).toFixed(1)), memory_rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)), artifact_bytes_by_category: categoryBytes, phase3_artifact_bytes: 367124480, compact_profile_reduction_vs_phase3: Number((1 - categoryBytes.profiles / 220200000).toFixed(4)), output_root: outputRoot, commanders: commanderRows };
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  report.artifact_size_bytes = sizeOf(outputRoot);
  report.artifact_size_mb = Number((report.artifact_size_bytes / 1024 / 1024).toFixed(2));
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)))) console.log(JSON.stringify(buildPhase4({ outputRoot: process.argv[2] || DEFAULT_ROOT }), null, 2));
