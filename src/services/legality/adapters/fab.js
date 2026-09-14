import { createLegalityResult, normalizeLegalityFormat, unknownLegality } from '../legalityCore.js';

const FORMAT_PREFIX = {
  blitz: 'blitz',
  classic_constructed: 'cc',
  commoner: 'commoner',
  living_legend: 'll',
  upf: 'upf',
  silver_age: 'silver_age'
};

export function checkFabLegality(input, context = {}) {
  const format = normalizeLegalityFormat(input.format);
  const card = context.card || {};
  const metadata = context.metadata || {};
  const prefix = FORMAT_PREFIX[format];
  if (!prefix) {
    return unknownLegality({ ...input, format }, card, metadata, 'Flesh and Blood format is not supported by the current source data.');
  }

  const hasAnyField = [`${prefix}_legal`, `${prefix}_banned`, `${prefix}_suspended`, `${prefix}_restricted`, `${prefix}_living_legend`]
    .some((field) => Object.prototype.hasOwnProperty.call(card, field));
  if (!hasAnyField) {
    return unknownLegality({ ...input, format }, card, metadata, 'Flesh and Blood legality fields are missing for this card/format.');
  }

  let status = card[`${prefix}_legal`] === false ? 'not_legal' : 'legal';
  let restrictionLimit = null;
  if (card[`${prefix}_living_legend`]) status = 'rotated';
  if (card[`${prefix}_suspended`]) status = 'suspended';
  if (card[`${prefix}_banned`]) status = 'banned';
  if (card[`${prefix}_restricted`]) {
    status = 'restricted';
    restrictionLimit = 1;
  }

  return createLegalityResult({ ...input, format }, {
    card,
    status,
    restrictionLimit,
    source: metadata.source || 'Flesh and Blood card source legality flags',
    sourceVersion: metadata.sourceVersion || null,
    lastVerified: metadata.lastVerified || null,
    reason: status === 'rotated' ? 'Source marks this identity as Living Legend for this format.' : null
  });
}
