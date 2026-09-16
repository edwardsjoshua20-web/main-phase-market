import { isInstant, isSorcery, normalizeMagicText } from './magicCards.js';

export function evaluateTimingQuestion({ message = '', cards = [] } = {}) {
  const text = normalizeMagicText(message);
  if (!/\b(can|may|when|respond|priority|timing|cast|activate)\b/.test(text)) return null;

  const namedCard = cards.find((card) => text.includes(card.normalizedName));
  if (namedCard && isSorcery(namedCard) && /\b(opponent turn|combat|response|respond)\b/.test(text)) {
    return {
      verdict: 'no',
      summary: `${namedCard.name} is a sorcery, so it cannot normally be cast as a response or outside sorcery timing.`,
      mechanics: ['timing', 'spells'],
      sequence: [`${namedCard.name} has sorcery timing.`, 'A sorcery normally needs the caster main phase, an empty stack, and priority.']
    };
  }

  if (namedCard && isInstant(namedCard)) {
    return {
      verdict: 'yes',
      summary: `${namedCard.name} is an instant, so it can usually be cast when its controller has priority.`,
      mechanics: ['timing', 'spells'],
      sequence: [`${namedCard.name} has instant timing.`, 'Its controller still needs priority and legal targets if it targets.']
    };
  }

  if (/\brespond\b|\bpriority\b/.test(text)) {
    return {
      verdict: 'yes',
      summary: 'A player can respond when they have priority before the top object on the stack resolves.',
      mechanics: ['timing', 'stack', 'priority'],
      sequence: ['A spell or ability is on the stack.', 'Players receive priority before it resolves.', 'An instant or legal activated ability may be used in that priority window.']
    };
  }

  return null;
}
