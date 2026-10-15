import fs from 'node:fs';
import path from 'node:path';
import { loadCanonicalCards, VALIDATION_COMMANDERS } from './build-mechanical-chemistry.mjs';
import { buildCommanderSemanticProfile, buildMechanicalRecommendations, buildSemanticCardProfile, scoreMechanicalCompatibility } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32'
  ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3'
  : path.resolve('.devcache', 'mechanical-chemistry', 'phase3');

const EXPECTED_POSITIVES = Object.freeze([
  'Pitiless Plunderer', 'Frantic Search', 'Evolution Sage', 'Anointed Procession', 'Sai, Master Thopterist',
  "Enchantress's Presence", "Stitcher's Supplier", 'Life from the Loam', 'Carrion Feeder', 'Flickering Ward',
  'Panharmonicon', 'Bruvac the Grandiloquent', 'Soul Warden', 'Combat Celebrant', 'Counterspell',
  'Sulfuric Vortex', 'Xorn', 'Viscera Seer', 'Birds of Paradise', 'Professional Face-Breaker',
  'Captivating Vampire', 'Righteous Valkyrie', 'Skirk Prospector', 'Ingenious Infiltrator', 'Aurelia, the Warleader',
  'Panharmonicon', 'Parallel Lives', 'Viscera Seer', 'Exploration', 'Ethereal Armor',
  'Expedite', 'Underworld Dreams', 'Faithless Looting', 'Defiant Strike', 'Mesmeric Orb',
  'Fume Spitter', 'Faithless Looting', 'Radiant Solar', 'Panharmonicon', 'Frantic Search'
]);

function safeRoot(target) {
  const resolved = path.resolve(target);
  if (process.platform === 'win32' && /^c:/i.test(resolved.replace(/\\/g, '/'))) throw new Error(`Refusing C: artifact output: ${resolved}`);
  return resolved;
}

function featureSummary(profile) {
  return Object.fromEntries(['produces', 'wants', 'rewards', 'enables', 'resources'].map((group) => [group, (profile[group] || []).map((entry) => ({ key: entry.key, confidence: entry.confidence, source_kind: entry.source_kind, magnitude: entry.magnitude, scaling: entry.scaling, direction: entry.direction, counter_type: entry.counter_type, qualifiers: entry.qualifiers }))]));
}

function rootCause(row) {
  const keys = new Set(Object.values(row.semantic_features).flat().map((entry) => entry.key));
  if (row.role === 'interaction' || row.role === 'ramp') return 'generic utility intentionally lacks commander centrality';
  if ([...keys].some((key) => key.includes('graveyard') || key === 'self_mill')) return 'graveyard setup competes with higher-volume or more selective loaders';
  if (row.conversions?.length) return 'resource conversion is recognized but loses within-role competition';
  if (keys.has('life_gained')) return 'repeatable lifegain source is recognized but crowded by higher-output lifegain engines';
  if (keys.has('dungeon_progress')) return 'narrow dungeon progress has limited independent semantic edges';
  if (keys.has('opponent_life_loss')) return 'shared pressure output lacks a stronger direct conversion edge';
  if ([...keys].some((key) => key.startsWith('tribe:'))) return 'narrow tribal payoff is crowded by same-tribe alternatives';
  return 'recognized support lacks enough direct, reliable commander-specific edges';
}

const outputRoot = safeRoot(process.argv[2] || OUTPUT_ROOT);
fs.mkdirSync(outputRoot, { recursive: true });
const cards = loadCanonicalCards();
const profiledCards = cards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const byName = new Map(profiledCards.map((card) => [card.name, card]));
const rows = [];

for (let index = 0; index < VALIDATION_COMMANDERS.length; index += 1) {
  const definition = VALIDATION_COMMANDERS[index];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const expected = byName.get(EXPECTED_POSITIVES[index]);
  if (commanders.length !== definition.names.length || !expected) continue;
  const commanderProfile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(commanderProfile, profiledCards, { limit: profiledCards.length, minimumScore: 0 });
  const rank = result.recommendations.findIndex((entry) => entry.oracle_id === expected.oracle_id);
  const score = scoreMechanicalCompatibility(commanderProfile, expected, { includeProfile: true });
  const row = {
    archetype: definition.archetype,
    commander: definition.names,
    expected_positive: expected.name,
    actual_rank: rank < 0 ? null : rank + 1,
    score: score.score,
    ranking_score: score.ranking_score,
    semantic_features: featureSummary(expected),
    token_semantics: expected.token_semantics,
    conversions: expected.conversions,
    role: score.category,
    interaction_tier: score.reasons[0]?.strength_tier || null,
    confidence: score.confidence_label,
    penalties: score.penalties,
    reasons: score.reasons,
    semantic_features_missing: score.reasons.some((reason) => reason.strength_tier === 'direct_engine') ? [] : ['direct commander-specific semantic bridge'],
    competitors_above: result.recommendations.slice(Math.max(0, rank - 5), Math.max(0, rank)).map((entry) => ({ card_name: entry.card_name, rank_score: entry.ranking_score, fit: entry.mechanical_score, role: entry.category, primary_edge: entry.mechanical_reasons[0]?.relationship || null }))
  };
  row.root_cause = rootCause(row);
  rows.push(row);
}

const misses = rows.filter((row) => row.actual_rank === null || row.actual_rank > 20);
const rootCauseBreakdown = Object.entries(misses.reduce((groups, row) => {
  groups[row.root_cause] ||= [];
  groups[row.root_cause].push({ commander: row.commander, card: row.expected_positive, rank: row.actual_rank });
  return groups;
}, {})).map(([cause, examples]) => ({ cause, count: examples.length, examples }));
const payload = {
  schema_version: 3,
  generated_at: new Date().toISOString(),
  reviewed_positive_count: rows.length,
  misses_top_10: rows.filter((row) => row.actual_rank === null || row.actual_rank > 10).length,
  misses_top_20: rows.filter((row) => row.actual_rank === null || row.actual_rank > 20).length,
  root_cause_breakdown: rootCauseBreakdown,
  rows
};
fs.writeFileSync(path.join(outputRoot, 'missed-positive-audit.json'), `${JSON.stringify(payload, null, 2)}\n`);
console.log(JSON.stringify({ reviewed_positive_count: payload.reviewed_positive_count, misses_top_10: payload.misses_top_10, misses_top_20: payload.misses_top_20, output: path.join(outputRoot, 'missed-positive-audit.json') }, null, 2));
