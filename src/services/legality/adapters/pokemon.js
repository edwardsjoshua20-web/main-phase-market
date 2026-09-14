import { createLegalityResult, normalizeLegalityFormat, normalizeLegalityStatus, unknownLegality } from '../legalityCore.js';

export function checkPokemonLegality(input, context = {}) {
  const format = normalizeLegalityFormat(input.format);
  const card = context.card || {};
  const metadata = context.metadata || {};
  const legalities = card.legalities && typeof card.legalities === 'object' ? card.legalities : null;
  if (!legalities || !Object.prototype.hasOwnProperty.call(legalities, format)) {
    return unknownLegality({ ...input, format }, card, metadata, 'Pokemon legality is unavailable for this card/format in the current source data.');
  }
  const status = normalizeLegalityStatus(legalities[format]);
  return createLegalityResult({ ...input, format }, {
    card,
    status,
    source: metadata.source || 'Pokemon TCG catalog legalities',
    sourceVersion: metadata.sourceVersion || null,
    lastVerified: metadata.lastVerified || null,
    reason: status === 'not_legal' ? 'The source legality map marks this format as not legal.' : null
  });
}
