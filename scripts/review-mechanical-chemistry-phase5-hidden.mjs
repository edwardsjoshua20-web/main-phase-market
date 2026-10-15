import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase5' : path.resolve('.devcache', 'mechanical-chemistry', 'phase5');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${ROOT}`);
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'hidden-chemistry-review.json'), 'utf8'));
const excellent = new Set([
  'Tekuthal, Inquiry Dominus', 'Evolution Sage', 'Sai, Master Thopterist', "Enchantress's Presence", 'Argothian Enchantress',
  'Life from the Loam', 'Dakmor Salvage', 'Headless Rider', 'Skull Skaab', 'Tainted Adversary', 'With Great Power . . .',
  'Ethereal Armor', 'Panharmonicon', 'Zellix, Sanity Flayer', 'Heliod, Sun-Crowned', 'Guide of Souls', "Raiyuu, Storm's Edge",
  'Sapphire Medallion', 'Sunscape Familiar', 'Pearl Medallion', 'Koth, the Geomancer', 'Iridescent Vinelasher'
]);
const falsePositives = new Set(["Cleric of Life's Bond"]);
const questionable = new Set(['Tempest Technique', 'Genji Glove']);
const explanationWarnings = new Map([
  ['Glamdring, Foe-hammer // Gleam of Death', 'Fit is real cost reduction, but the current “tribe:sorcery” explanation is semantically wrong.'],
  ['Stone Retrieval Unit', 'Fit is real artifact-token production, but the current ETB-self explanation is not the causal connection.'],
  ['Wolverine Riders', 'Fit is real Elf/token production; “tribe:warrior” is incomplete and should not be the lead explanation.'],
  ['Usher of the Fallen', 'Fit is conditional token production; “tribe:warrior” is not commander-specific.'],
  ['Old-Growth Troll', 'Fit is conditional token production and recursion; “tribe:warrior” is not commander-specific.'],
  ['Sapphire Medallion', 'Fit is color-aligned cost reduction, not a creature-tribe relationship.'],
  ['Sunscape Familiar', 'Fit is color-aligned cost reduction, not a creature-tribe relationship.'],
  ['Pearl Medallion', 'Fit is color-aligned cost reduction, not a creature-tribe relationship.']
]);
const rows = source.rows.map((row) => ({
  ...row,
  classification: falsePositives.has(row.card_name) ? 'false positive' : questionable.has(row.card_name) ? 'questionable' : excellent.has(row.card_name) ? 'excellent overlooked interaction' : 'plausible',
  manual_note: falsePositives.has(row.card_name) ? 'Requires an unsupported Cleric density; the lifegain connection alone does not justify this rank.' : explanationWarnings.get(row.card_name) || 'The parsed causal connection is directionally sound; any listed warning is a real cost or setup constraint rather than a disqualifier.',
  explanation_correct: !explanationWarnings.has(row.card_name)
}));
const acceptable = rows.filter((row) => ['excellent overlooked interaction', 'plausible'].includes(row.classification)).length;
const falseCount = rows.filter((row) => row.classification === 'false positive').length;
const report = { generated_at: new Date().toISOString(), review_method: 'Manual named-card inspection of Oracle text and the scored causal edge; this file is report-only and is never imported by scoring.', sample_size: rows.length, excellent_or_plausible_rate: Number((acceptable / rows.length).toFixed(4)), false_positive_rate: Number((falseCount / rows.length).toFixed(4)), explanation_correctness: Number((rows.filter((row) => row.explanation_correct).length / rows.length).toFixed(4)), counts: Object.fromEntries(['excellent overlooked interaction', 'plausible', 'questionable', 'false positive'].map((label) => [label, rows.filter((row) => row.classification === label).length])), rows };
fs.writeFileSync(path.join(ROOT, 'hidden-chemistry-manual-review.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
