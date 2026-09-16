import { normalizeMagicText } from './magicCards.js';

const MECHANIC_PATTERNS = Object.freeze([
  ['targeting', /\btarget\b|\btargets\b|\blegal target\b/],
  ['protection', /\bprotection from\b|\bgains protection\b/],
  ['hexproof', /\bhexproof\b/],
  ['shroud', /\bshroud\b/],
  ['ward', /\bward\b/],
  ['destroy', /\bdestroy\b|\bdestroys\b/],
  ['indestructible', /\bindestructible\b/],
  ['sacrifice', /\bsacrifice\b|\bsacrifices\b/],
  ['exile', /\bexile\b|\bexiles\b/],
  ['damage', /\bdamage\b|\bdeals\b|\blethal\b/],
  ['countering', /\bcounter target spell\b|\bcounter\b/],
  ['spells', /\bspell\b|\bcast\b|\bcasts\b/],
  ['abilities', /\bactivated ability\b|\bability\b|\babilities\b|:/],
  ['triggers', /\bwhen\b|\bwhenever\b|\bat the beginning\b/],
  ['replacement-effects', /\binstead\b|\bprevent\b|\bwould\b/],
  ['state-based-actions', /\blethal\b|\b0 or less toughness\b|\bstate based\b/],
  ['copy-effects', /\bcopy\b|\bbecomes a copy\b/],
  ['zone-changes', /\bgraveyard\b|\bexile\b|\bhand\b|\blibrary\b|\bcommand zone\b/],
  ['commander', /\bcommander\b|\bcommand zone\b|\bcommander tax\b|\bcommander damage\b/],
  ['timing', /\bpriority\b|\brespond\b|\bsorcery timing\b|\binstant timing\b|\bactivate\b|\bmain phase\b/],
  ['layers', /\blayer\b|\bcontinuous effect\b|\bbase power\b|\bbecomes\b|\bloses all abilities\b/]
]);

export function detectMagicMechanics({ message = '', cards = [] } = {}) {
  const text = [
    message,
    ...cards.flatMap((card) => [card.name, card.typeLine, card.oracleText])
  ].map(normalizeMagicText).join(' ');

  const mechanics = new Set();
  for (const [mechanic, pattern] of MECHANIC_PATTERNS) {
    if (pattern.test(text)) mechanics.add(mechanic);
  }
  return [...mechanics];
}

export function isComplexLayerQuestion(message = '') {
  const text = normalizeMagicText(message);
  return /\blayer\b|\btimestamp\b|\bdependency\b|\bcopy effect\b|\bloses all abilities\b/.test(text)
    && /\b(becomes|base power|base toughness|copy|control|type|color)\b/.test(text);
}

export function isReplacementChoiceQuestion(message = '') {
  const text = normalizeMagicText(message);
  return /\binstead\b|\bwould\b|\breplacement\b|\bcommander.*(graveyard|exile|hand|library|command zone)\b/.test(text);
}
