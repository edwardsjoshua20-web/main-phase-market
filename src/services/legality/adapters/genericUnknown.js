import { normalizeLegalityFormat, unknownLegality } from '../legalityCore.js';

export function checkUnknownLegality(input, context = {}) {
  const format = normalizeLegalityFormat(input.format);
  return unknownLegality({ ...input, format }, context.card || {}, context.metadata || {}, 'No canonical current legality list is available for this game in MainPhase data yet.');
}
