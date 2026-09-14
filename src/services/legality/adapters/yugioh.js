import { createLegalityResult, normalizeLegalityFormat, unknownLegality } from '../legalityCore.js';

function normalizeBanlistStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return { status: 'legal', limit: 3 };
  if (raw === 'forbidden') return { status: 'banned', limit: 0 };
  if (raw === 'limited') return { status: 'limited', limit: 1 };
  if (raw === 'semi-limited' || raw === 'semi_limited') return { status: 'semi_limited', limit: 2 };
  return { status: 'unknown', limit: null };
}

export function checkYugiohLegality(input, context = {}) {
  const format = normalizeLegalityFormat(input.format);
  const card = context.card || {};
  const metadata = { region: 'TCG', ...(context.metadata || {}) };
  if (format !== 'advanced_tcg') {
    return unknownLegality({ ...input, format }, card, metadata, 'Yu-Gi-Oh! legality is only source-backed for the TCG Advanced list right now.');
  }
  const resolved = normalizeBanlistStatus(card.ban_tcg || card.banlist_info?.ban_tcg);
  return createLegalityResult({ ...input, format }, {
    card,
    status: resolved.status,
    restrictionLimit: resolved.limit,
    source: metadata.source || 'YGOPRODeck banlist_info.ban_tcg',
    sourceVersion: metadata.sourceVersion || null,
    lastVerified: metadata.lastVerified || null,
    region: metadata.region
  });
}
