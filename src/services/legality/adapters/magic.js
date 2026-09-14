import { createLegalityResult, normalizeLegalityFormat, normalizeLegalityStatus, unknownLegality } from '../legalityCore.js';

export const MAGIC_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'];

export function checkMagicLegality(input, context = {}) {
  const format = normalizeLegalityFormat(input.format);
  const card = context.card || {};
  const metadata = context.metadata || {};
  const oracleId = String(input.canonicalCardId || card.oracle_id || '').trim();
  const indexed = context.indexes?.magic?.byOracleId?.get?.(oracleId);
  const legalities = card.legalities || indexed?.legalities || null;

  if (!MAGIC_FORMATS.includes(format)) {
    return unknownLegality({ ...input, format }, card, metadata, 'Magic format is not supported by the canonical legality owner yet.');
  }

  if (legalities && Object.prototype.hasOwnProperty.call(legalities, format)) {
    return createLegalityResult({ ...input, format }, {
      card: { ...card, oracle_id: oracleId || card.oracle_id },
      status: normalizeLegalityStatus(legalities[format]),
      source: metadata.source || 'Scryfall catalog legalities',
      sourceVersion: metadata.sourceVersion || indexed?.sourceVersion || null,
      lastVerified: metadata.lastVerified || indexed?.lastVerified || null,
      effectiveDate: metadata.effectiveDate || indexed?.effectiveDate || null
    });
  }

  if (format === 'commander' && typeof card.legal_commander === 'boolean') {
    return createLegalityResult({ ...input, format }, {
      card,
      status: card.legal_commander ? 'legal' : 'not_legal',
      source: metadata.source || 'MainPhase MTG catalog commander projection',
      sourceVersion: metadata.sourceVersion || null,
      lastVerified: metadata.lastVerified || null,
      reason: 'Resolved from existing Commander legality projection.'
    });
  }

  return unknownLegality({ ...input, format }, card, metadata, 'Magic legality fields are missing for this card identity.');
}
