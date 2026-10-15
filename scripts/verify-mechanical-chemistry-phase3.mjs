import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards, VALIDATION_COMMANDERS } from './build-mechanical-chemistry.mjs';
import { buildCommanderSemanticProfile, buildMechanicalRecommendations, buildSemanticCardProfile, checkMechanicalCandidateLegality, scoreMechanicalCompatibility } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3' : path.resolve('.devcache', 'mechanical-chemistry', 'phase3');

// Human review data only. Production parsing and scoring never import this module.
const REVIEW_CASES = [
  ['Pitiless Plunderer', 'Pawn of Ulamog', 'Healing Salve', 'Counterspell', "Basri's Lieutenant"],
  ['Frantic Search', 'Fact or Fiction', 'Phantom Monster', 'Swords to Plowshares', 'Opt'],
  ['Evolution Sage', 'Thrummingbird', 'Grizzly Bears', 'Lightning Bolt', 'Common Bond'],
  ['Anointed Procession', 'Second Harvest', 'Healing Salve', 'Counterspell', 'Raise the Alarm'],
  ['Sai, Master Thopterist', 'Thought Monitor', 'Phantom Monster', 'Lightning Bolt', 'Cancel'],
  ["Enchantress's Presence", 'Mesa Enchantress', 'Grizzly Bears', 'Counterspell', 'Pacifism'],
  ["Stitcher's Supplier", 'Satyr Wayfinder', 'Grizzly Bears', 'Lightning Bolt', "Tormod's Crypt"],
  ['Life from the Loam', 'World Shaper', 'Grizzly Bears', 'Counterspell', 'Evolving Wilds'],
  ['Carrion Feeder', 'Diregraf Captain', 'Unsummon', 'Lightning Bolt', 'Walking Corpse'],
  ['Flickering Ward', 'All That Glitters', 'Healing Salve', 'Counterspell', 'Pacifism'],
  ['Panharmonicon', 'Cloudblazer', 'Healing Salve', 'Lightning Bolt', 'Deputy of Acquittals'],
  ['Bruvac the Grandiloquent', 'Mind Funeral', 'Negate', 'Lightning Bolt', 'Tome Scour'],
  ['Soul Warden', "Ajani's Pridemate", 'Healing Salve', 'Counterspell', 'Revitalize'],
  ['Combat Celebrant', 'Adriana, Captain of the Guard', 'Healing Salve', 'Counterspell', 'Relentless Assault'],
  ['Counterspell', 'Azorius Signet', 'Ornithopter', 'Lightning Bolt', 'Cancel'],
  ['Sulfuric Vortex', 'Roiling Vortex', 'Ornithopter', 'Counterspell', 'Lava Axe'],
  ['Xorn', 'Big Score', 'Shock', 'Counterspell', "Pirate's Pillage"],
  ['Viscera Seer', 'Mayhem Devil', 'Grizzly Bears', 'Counterspell', "Altar's Reap"],
  ['Birds of Paradise', 'Seedborn Muse', 'Grizzly Bears', 'Lightning Bolt', 'Divination'],
  ['Professional Face-Breaker', 'Morbid Opportunist', 'Duress', 'Swords to Plowshares', 'Fervent Strike'],
  ['Captivating Vampire', 'Blood Artist', 'Walking Corpse', 'Counterspell', 'Vampire Noble'],
  ['Righteous Valkyrie', 'Youthful Valkyrie', 'Healing Salve', 'Counterspell', 'Serra Angel'],
  ['Skirk Prospector', 'Goblin Instigator', 'Shock', 'Counterspell', 'Goblin Hero'],
  ['Ingenious Infiltrator', 'Moon-Circuit Hacker', 'Cancel', 'Lightning Bolt', 'Phantom Ninja'],
  ['Aurelia, the Warleader', 'Adriana, Captain of the Guard', 'Duress', 'Counterspell', 'Hill Giant'],
  ['Panharmonicon', 'Cloudblazer', 'Healing Salve', 'Lightning Bolt', 'Momentary Blink'],
  ['Parallel Lives', 'Squirrel Nest', 'Grizzly Bears', 'Counterspell', 'Acorn Harvest'],
  ['Viscera Seer', 'Sakura-Tribe Elder', 'Grizzly Bears', 'Counterspell', 'Raise Dead'],
  ['Exploration', 'Tireless Provisioner', 'Grizzly Bears', 'Swords to Plowshares', 'Evolving Wilds'],
  ['Ethereal Armor', 'Sram, Senior Edificer', 'Healing Salve', 'Counterspell', 'Pacifism'],
  ['Expedite', 'Defiant Strike', 'Hill Giant', 'Counterspell', 'Young Pyromancer'],
  ['Underworld Dreams', 'Windfall', 'Ornithopter', 'Swords to Plowshares', 'Divination'],
  ['Faithless Looting', 'Myr Retriever', 'Grizzly Bears', 'Counterspell', 'Shatter'],
  ['Defiant Strike', 'Expedite', 'Hill Giant', 'Counterspell', 'Young Pyromancer'],
  ['Mesmeric Orb', 'Satyr Wayfinder', 'Grizzly Bears', 'Lightning Bolt', 'Bruvac the Grandiloquent'],
  ['Fume Spitter', 'Nest of Scarabs', 'Grizzly Bears', 'Counterspell', 'Common Bond'],
  ['Faithless Looting', "Sevinne's Reclamation", 'Grizzly Bears', 'Doom Blade', 'Relentless Assault'],
  ['Radiant Solar', "Stitcher's Supplier", 'Grizzly Bears', 'Lightning Bolt', 'Raise Dead'],
  ['Panharmonicon', 'Cloudblazer', 'Grizzly Bears', 'Lightning Bolt', 'Momentary Blink'],
  ['Frantic Search', 'Fact or Fiction', 'Phantom Monster', 'Swords to Plowshares', 'Opt']
];

function safeWrite(name, payload) {
  const root = path.resolve(OUTPUT_ROOT);
  if (process.platform === 'win32' && /^c:/i.test(root.replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${root}`);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, name), `${JSON.stringify(payload, null, 2)}\n`);
}
function rate(value, total) { return Number((value / Math.max(1, total)).toFixed(4)); }
function median(values) { const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); return sorted.length ? sorted[Math.floor(sorted.length / 2)] : null; }
function rankOf(result, card) { const rank = result.recommendations.findIndex((entry) => entry.oracle_id === card?.oracle_id); return rank < 0 ? null : rank + 1; }
function inTop(rank, top) { return rank !== null && rank <= top; }

const started = performance.now();
const rawCards = loadCanonicalCards();
const cards = rawCards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const byName = new Map(cards.map((card) => [card.name, card]));
const rows = [];
const checks = [];
const check = (condition, id, detail) => { try { assert.ok(condition, detail); checks.push({ id, status: 'PASS', detail }); } catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); } };

check(VALIDATION_COMMANDERS.length === 40, 'configuration-count', `${VALIDATION_COMMANDERS.length}`);
check(REVIEW_CASES.length === 40, 'review-case-count', `${REVIEW_CASES.length}`);

for (let index = 0; index < VALIDATION_COMMANDERS.length; index += 1) {
  const definition = VALIDATION_COMMANDERS[index];
  const commanders = definition.names.map((name) => byName.get(name)).filter(Boolean);
  const [positiveName, supportName, weakName, illegalName, trapName] = REVIEW_CASES[index];
  const fixtures = {
    obvious_positive: byName.get(positiveName), strong_support: byName.get(supportName), generic_utility: byName.get('Arcane Signet'),
    weak_negative: byName.get(weakName), illegal_negative: byName.get(illegalName), false_positive_trap: byName.get(trapName),
    parser_probe: byName.get(positiveName), role_negative: byName.get(weakName)
  };
  check(commanders.length === definition.names.length, `commander:${index}`, definition.names.join(' + '));
  check(Object.values(fixtures).every(Boolean), `fixtures:${index}`, Object.entries(fixtures).filter(([, card]) => !card).map(([key]) => key).join(', ') || 'all found');
  if (commanders.length !== definition.names.length || Object.values(fixtures).some((card) => !card)) continue;
  const profile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(profile, cards, { limit: cards.length, minimumScore: 0 });
  const evaluated = Object.fromEntries(Object.entries(fixtures).map(([key, card]) => {
    const score = scoreMechanicalCompatibility(profile, card);
    return [key, { name: card.name, rank: rankOf(result, card), score: score.score, eligible: score.eligible, confidence: score.confidence_label, reasons: score.reasons, penalties: score.penalties }];
  }));
  check(!evaluated.illegal_negative.eligible, `illegal:${index}`, `${illegalName}: ${evaluated.illegal_negative.eligible}`);
  check(evaluated.obvious_positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value), `explanation:${index}`, positiveName);
  rows.push({
    archetype: definition.archetype, commander: definition.names, fixtures: evaluated,
    top_10: {
      reviewed_positives_present: [evaluated.obvious_positive, evaluated.strong_support].filter((entry) => inTop(entry.rank, 10)).map((entry) => entry.name),
      reviewed_traps_present: inTop(evaluated.false_positive_trap.rank, 10) ? [trapName] : [],
      generic_utility_count: result.recommendations.slice(0, 10).filter((entry) => entry.commander_centrality === 'Generic Utility').length,
      unsupported_ambiguous_count: result.recommendations.slice(0, 10).filter((entry) => entry.confidence === 'Low' || !entry.mechanical_reasons.length).length
    },
    top_20: {
      reviewed_positives_present: [evaluated.obvious_positive, evaluated.strong_support].filter((entry) => inTop(entry.rank, 20)).map((entry) => entry.name),
      reviewed_traps_present: inTop(evaluated.false_positive_trap.rank, 20) ? [trapName] : [],
      generic_utility_count: result.recommendations.slice(0, 20).filter((entry) => entry.commander_centrality === 'Generic Utility').length,
      unsupported_ambiguous_count: result.recommendations.slice(0, 20).filter((entry) => entry.confidence === 'Low' || !entry.mechanical_reasons.length).length
    }
  });
}

const positiveRanks = rows.map((row) => row.fixtures.obvious_positive.rank);
const metrics = {
  reviewed_configurations: rows.length,
  reviewed_fixture_judgments: rows.length * 8,
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
  median_expected_positive_rank: median(positiveRanks)
};

const partner = buildCommanderSemanticProfile(VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Partner pair').names.map((name) => byName.get(name)));
const background = buildCommanderSemanticProfile(VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Background pair').names.map((name) => byName.get(name)));
metrics.pair_background_correctness = rate([
  partner.members.length === 2 && ['W', 'U', 'B', 'G'].every((color) => partner.color_identity.includes(color)) && !partner.color_identity.includes('R'),
  background.members.length === 2 && background.color_identity.join('') === 'BR'
].filter(Boolean).length, 2);

check(metrics.top_10.obvious_positive_recall >= 0.5, 'release-top10', `${metrics.top_10.obvious_positive_recall}`);
check(metrics.top_20.obvious_positive_recall >= 0.7, 'release-top20', `${metrics.top_20.obvious_positive_recall}`);
check(metrics.top_20.obvious_negative_rejection >= 0.975, 'release-negative', `${metrics.top_20.obvious_negative_rejection}`);
check(metrics.top_20.reviewed_trap_rate <= 0.025, 'release-traps', `${metrics.top_20.reviewed_trap_rate}`);
check(metrics.illegal_rejection === 1, 'release-illegal', `${metrics.illegal_rejection}`);
check(metrics.explanation_correctness === 1, 'release-explanations', `${metrics.explanation_correctness}`);
check(metrics.pair_background_correctness === 1, 'release-pairs', `${metrics.pair_background_correctness}`);

const confidenceCalibration = ['High', 'Medium', 'Low'].map((label) => {
  const positives = rows.map((row) => row.fixtures.obvious_positive).filter((entry) => entry.confidence === label);
  const negatives = rows.flatMap((row) => [row.fixtures.weak_negative, row.fixtures.false_positive_trap]).filter((entry) => entry.confidence === label);
  return {
    confidence: label,
    positive_sample_size: positives.length,
    positive_top_20_rate: rate(positives.filter((entry) => inTop(entry.rank, 20)).length, positives.length),
    negative_sample_size: negatives.length,
    negative_false_positive_rate: rate(negatives.filter((entry) => inTop(entry.rank, 20)).length, negatives.length)
  };
});
const familyResults = rows.map((row) => ({ archetype: row.archetype, commander: row.commander, positive_rank: row.fixtures.obvious_positive.rank, top_10_hit: inTop(row.fixtures.obvious_positive.rank, 10), top_20_hit: inTop(row.fixtures.obvious_positive.rank, 20), trap_top_20: inTop(row.fixtures.false_positive_trap.rank, 20), illegal_rejected: !row.fixtures.illegal_negative.eligible }));
const status = checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL';
const report = { schema_version: 3, status, generated_at: new Date().toISOString(), runtime_ms: Number((performance.now() - started).toFixed(1)), card_pool_size: cards.length, metrics, confidence_calibration: confidenceCalibration, rows, checks };
safeWrite('phase3-verification.json', report);
safeWrite('commander-family-results.json', { generated_at: report.generated_at, families: familyResults });
safeWrite('confidence-calibration.json', { generated_at: report.generated_at, methodology: 'Positive calibration is reported separately from weak/trap rejection so class balance cannot make Medium appear better merely because it contains more negatives.', public_exposure_recommendation: 'Keep confidence internal: the Medium-positive sample is too small for a stable public claim.', buckets: confidenceCalibration });
console.log(JSON.stringify({ status, metrics, confidence_calibration: confidenceCalibration, failed_checks: checks.filter((entry) => entry.status === 'FAIL') }, null, 2));
if (status !== 'PASS') process.exitCode = 1;
