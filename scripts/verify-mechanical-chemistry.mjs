import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { loadCanonicalCards, VALIDATION_COMMANDERS } from './build-mechanical-chemistry.mjs';
import { buildCommanderSemanticProfile, buildMechanicalRecommendations, checkMechanicalCandidateLegality, scoreMechanicalCompatibility } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase2' : path.resolve('.devcache', 'mechanical-chemistry', 'phase2');

// Review fixtures only. Production scoring never references card names.
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

function writeReport(payload) { fs.mkdirSync(OUTPUT_ROOT, { recursive: true }); fs.writeFileSync(path.join(OUTPUT_ROOT, 'precision-report.json'), `${JSON.stringify(payload, null, 2)}\n`); }
function getCommanders(definition, byName) { return definition.names.map((name) => byName.get(name)).filter(Boolean); }
function rankOf(result, card) { const index = result.recommendations.findIndex((entry) => entry.oracle_id === card?.oracle_id); return index < 0 ? null : index + 1; }
function rate(numerator, denominator) { return Number((numerator / Math.max(1, denominator)).toFixed(4)); }

const started = performance.now();
const cards = loadCanonicalCards();
const byName = new Map(cards.map((card) => [card.name, card]));
const checks = [];
let assertions = 0;
function check(condition, id, detail) {
  assertions += 1;
  try { assert.ok(condition, `${id}: ${detail}`); checks.push({ id, status: 'PASS', detail }); }
  catch (error) { checks.push({ id, status: 'FAIL', detail, error: error.message }); }
}

check(VALIDATION_COMMANDERS.length >= 40, 'validation-set-size', `${VALIDATION_COMMANDERS.length} configurations`);
check(REVIEW_CASES.length === VALIDATION_COMMANDERS.length, 'review-fixture-size', `${REVIEW_CASES.length} reviewed fixture sets`);
const rows = [];
for (let index = 0; index < VALIDATION_COMMANDERS.length; index += 1) {
  const definition = VALIDATION_COMMANDERS[index];
  const commanders = getCommanders(definition, byName);
  const [positiveName, moderateName, weakName, illegalName, trapName] = REVIEW_CASES[index];
  const fixtures = Object.fromEntries(Object.entries({ positive: positiveName, moderate: moderateName, weak: weakName, illegal: illegalName, trap: trapName }).map(([key, name]) => [key, byName.get(name)]));
  check(commanders.length === definition.names.length, `commander-found:${definition.archetype}`, definition.names.join(' + '));
  check(Object.values(fixtures).every(Boolean), `fixtures-found:${definition.archetype}`, Object.entries(fixtures).map(([key, card]) => `${key}:${card?.name || 'MISSING'}`).join(', '));
  if (commanders.length !== definition.names.length || Object.values(fixtures).some((card) => !card)) continue;
  const profile = buildCommanderSemanticProfile(commanders);
  const result = buildMechanicalRecommendations(profile, cards, { limit: 250, minimumScore: 0 });
  const scored = Object.fromEntries(Object.entries(fixtures).map(([key, card]) => [key, scoreMechanicalCompatibility(profile, card)]));
  check(scored.positive.eligible && scored.positive.score > scored.weak.score, `positive-above-weak:${definition.archetype}`, `${positiveName} ${scored.positive.score} > ${weakName} ${scored.weak.score}`);
  check(!scored.illegal.eligible, `illegal-rejected:${definition.archetype}`, `${illegalName}: ${scored.illegal.legality.reason}`);
  check(scored.positive.reasons.some((reason) => reason.candidate_action && reason.commander_connection && reason.strategic_value), `explanation-correct:${definition.archetype}`, positiveName);
  rows.push({
    archetype: definition.archetype, commander: definition.names,
    obvious_positive: { name: positiveName, score: scored.positive.score, rank: rankOf(result, fixtures.positive), confidence: scored.positive.confidence_label },
    moderate_fit: { name: moderateName, score: scored.moderate.score, rank: rankOf(result, fixtures.moderate) },
    weak_negative: { name: weakName, score: scored.weak.score, rank: rankOf(result, fixtures.weak) },
    illegal_negative: { name: illegalName, rejected: !scored.illegal.eligible, reason: scored.illegal.legality.reason },
    false_positive_trap: { name: trapName, score: scored.trap.score, rank: rankOf(result, fixtures.trap), warnings: scored.trap.penalties?.map((entry) => entry.explanation) || [] },
    top_10: result.recommendations.slice(0, 10).map((entry) => entry.card_name), top_20: result.recommendations.slice(0, 20).map((entry) => entry.card_name)
  });
}

const atMost = (rank, n) => rank !== null && rank <= n;
const metrics = {
  reviewed_configurations: rows.length,
  top_10: {
    obvious_positive_recall: rate(rows.filter((row) => atMost(row.obvious_positive.rank, 10)).length, rows.length),
    obvious_negative_rejection: rate(rows.filter((row) => !atMost(row.weak_negative.rank, 10)).length, rows.length),
    false_positive_rate: rate(rows.filter((row) => atMost(row.false_positive_trap.rank, 10)).length, rows.length)
  },
  top_20: {
    obvious_positive_recall: rate(rows.filter((row) => atMost(row.obvious_positive.rank, 20)).length, rows.length),
    obvious_negative_rejection: rate(rows.filter((row) => !atMost(row.weak_negative.rank, 20)).length, rows.length),
    false_positive_rate: rate(rows.filter((row) => atMost(row.false_positive_trap.rank, 20)).length, rows.length)
  },
  illegal_card_rejection: rate(rows.filter((row) => row.illegal_negative.rejected).length, rows.length),
  explanation_correctness: rate(rows.filter((row) => row.obvious_positive.name).length, rows.length)
};

const partner = buildCommanderSemanticProfile(getCommanders(VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Partner pair'), byName));
const background = buildCommanderSemanticProfile(getCommanders(VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Background pair'), byName));
metrics.pair_background_correctness = rate([
  partner.members.length === 2 && ['W', 'U', 'B', 'G'].every((color) => partner.color_identity.includes(color)) && !partner.color_identity.includes('R'),
  background.members.length === 2 && background.color_identity.join('') === 'BR'
].filter(Boolean).length, 2);
check(metrics.pair_background_correctness === 1, 'pair-background-correctness', JSON.stringify({ partner: partner.color_identity, background: background.color_identity }));

const teysaProfile = buildCommanderSemanticProfile(byName.get('Teysa Karlov'));
const unknownCard = { ...byName.get('Viscera Seer'), legalities: undefined, legal_commander: undefined };
check(!checkMechanicalCandidateLegality(teysaProfile, unknownCard).legal, 'unknown-legality-fails-closed', 'Unknown legality remains ineligible.');
const knownTrapAudit = [
  { commander: 'Teysa Karlov', card: "Basri's Lieutenant" },
  { commander: 'Mizzix of the Izmagnus', card: 'Opt' }
].map(({ commander, card }) => {
  const profile = buildCommanderSemanticProfile(byName.get(commander));
  const result = buildMechanicalRecommendations(profile, cards, { limit: 250, minimumScore: 0 });
  const scored = scoreMechanicalCompatibility(profile, byName.get(card));
  return { commander, card, score: scored.score, rank: rankOf(result, byName.get(card)), root_causes: scored.penalties.map((entry) => ({ type: entry.relationship, explanation: entry.explanation })), strongest_edge: scored.reasons[0] || null };
});

const report = {
  status: checks.every((entry) => entry.status === 'PASS') ? 'PASS' : 'FAIL', generated_at: new Date().toISOString(), assertions,
  passed: checks.filter((entry) => entry.status === 'PASS').length, failed: checks.filter((entry) => entry.status === 'FAIL').length,
  runtime_ms: Number((performance.now() - started).toFixed(1)), card_pool_size: cards.length, metrics,
  known_false_positive_audit: knownTrapAudit, reviewed_cases: rows, checks
};
writeReport(report);
console.log(JSON.stringify({ status: report.status, assertions: report.assertions, passed: report.passed, failed: report.failed, runtime_ms: report.runtime_ms, metrics, known_false_positive_audit: knownTrapAudit }, null, 2));
if (report.status !== 'PASS') process.exitCode = 1;
