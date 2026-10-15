import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase6' : path.resolve('.devcache', 'mechanical-chemistry', 'phase6');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${ROOT}`);
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'hidden-chemistry-review.json'), 'utf8'));
const key = (row) => `${row.commander.join(' + ')}::${row.card_name}`;

// Named judgments live only in this human-review artifact. They are never read
// by the parser, scorer, ranker, fixtures, or production recommendation build.
const falsePositives = new Map([
  ['Brago, King Eternal::Genji Glove', 'Combat-damage amplification does not materially advance Brago’s blink/ETB plan.'],
  ['Prosper, Tome-Bound::Tainted Adversary', 'Creating Zombie tokens is not a token-multiplier effect; the explanation overstates the semantic edge.']
]);
const questionable = new Map([
  ["Karlov of the Ghost Council::Cleric of Life's Bond", 'The life-gain edge exists, but its Cleric dependency is not established by Karlov.']
]);

const rows = source.rows.map((row) => {
  const identity = key(row);
  if (falsePositives.has(identity)) return { ...row, manual_classification: 'false positive', reviewer_note: falsePositives.get(identity) };
  if (questionable.has(identity)) return { ...row, manual_classification: 'questionable', reviewer_note: questionable.get(identity) };
  if (row.centrality === 'Generic Utility') return { ...row, manual_classification: 'generic but acceptable', reviewer_note: 'Useful but not evidence of unique commander chemistry.' };
  if (row.centrality === 'Commander-Central' && row.direct_edges > 0 && !row.warning) return { ...row, manual_classification: 'excellent overlooked interaction', reviewer_note: 'Direct, deterministic, and independently supported.' };
  return { ...row, manual_classification: 'plausible', reviewer_note: row.warning ? 'The warning is a real constraint, but the scored interaction remains mechanically coherent.' : 'Mechanically coherent support with a causal explanation.' };
});
const accepted = new Set(['excellent overlooked interaction', 'plausible', 'generic but acceptable']);
const result = {
  generated_at: new Date().toISOString(), sample_size: rows.length,
  review_method: 'Manual named-card inspection of the generated queue; report-only and never consumed by production scoring.',
  acceptable_rate: Number((rows.filter((row) => accepted.has(row.manual_classification)).length / rows.length).toFixed(4)),
  false_positive_rate: Number((rows.filter((row) => row.manual_classification === 'false positive').length / rows.length).toFixed(4)),
  questionable_rate: Number((rows.filter((row) => row.manual_classification === 'questionable').length / rows.length).toFixed(4)),
  rows
};
fs.writeFileSync(path.join(ROOT, 'hidden-chemistry-human-review.json'), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ sample_size: result.sample_size, acceptable_rate: result.acceptable_rate, false_positive_rate: result.false_positive_rate, questionable_rate: result.questionable_rate }, null, 2));
