import { checkFabLegality } from './adapters/fab.js';
import { checkUnknownLegality } from './adapters/genericUnknown.js';
import { checkMagicLegality } from './adapters/magic.js';
import { checkPokemonLegality } from './adapters/pokemon.js';
import { checkYugiohLegality } from './adapters/yugioh.js';
import { normalizeLegalityFormat, normalizeLegalityGame, unknownLegality } from './legalityCore.js';

const adapters = {
  magic: checkMagicLegality,
  pokemon: checkPokemonLegality,
  yugioh: checkYugiohLegality,
  flesh_and_blood: checkFabLegality,
  lorcana: checkUnknownLegality,
  onepiece: checkUnknownLegality,
  starwars: checkUnknownLegality
};

export function normalizeLegalityInput(input = {}) {
  const game = normalizeLegalityGame(input.game);
  const canonicalCardId = String(input.canonicalCardId || input.cardId || '').trim();
  const printingId = String(input.printingId || '').trim();
  const format = normalizeLegalityFormat(input.format);
  if (!game) throw new Error('game is required.');
  if (!canonicalCardId && !printingId) throw new Error('canonicalCardId or printingId is required.');
  if (!format) throw new Error('format is required.');
  return {
    game,
    canonicalCardId,
    ...(printingId ? { printingId } : {}),
    format
  };
}

export const legalityOwner = {
  check(input = {}, context = {}) {
    const normalized = normalizeLegalityInput(input);
    const adapter = adapters[normalized.game];
    if (!adapter) {
      return unknownLegality(normalized, context.card || {}, context.metadata || {}, 'Unsupported game for legality checks.');
    }
    return adapter(normalized, context);
  },

  batch(inputs = [], context = {}) {
    if (!Array.isArray(inputs)) throw new Error('inputs must be an array.');
    return inputs.map((input, index) => {
      const normalized = normalizeLegalityInput(input);
      const card = typeof context.resolveCard === 'function'
        ? context.resolveCard(normalized, index)
        : Array.isArray(context.cards)
          ? context.cards[index]
          : context.card;
      const metadata = typeof context.resolveMetadata === 'function'
        ? context.resolveMetadata(normalized, card, index)
        : context.metadata;
      return this.check(normalized, { ...context, card, metadata });
    });
  }
};

export default legalityOwner;
