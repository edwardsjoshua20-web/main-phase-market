import { normalizeMagicText } from './magicCards.js';

export function evaluateCommanderQuestion({ message = '', legalityResult = null } = {}) {
  const text = normalizeMagicText(message);
  if (!/\bcommander\b|\bcommand zone\b|\bcommander tax\b|\bcommander damage\b|\bcolor identity\b/.test(text)) return null;

  if (/\blegal\b|\blegality\b|\bdeck\b|\binclude\b|\bcolor identity\b/.test(text)) {
    return {
      verdict: legalityResult && legalityResult.status !== 'unknown'
        ? (['legal', 'restricted'].includes(legalityResult.status) ? 'yes' : 'no')
        : 'depends',
      summary: legalityResult && legalityResult.status !== 'unknown'
        ? `Commander legality is delegated to the canonical Legality Owner; the card is ${legalityResult.status}.`
        : 'Commander deck legality depends on the commander color identity and current format legality data.',
      mechanics: ['commander', 'legality'],
      clarificationNeeded: legalityResult ? null : 'Provide the exact commander and card name so legality can be checked by the Legality Owner.'
    };
  }

  if (/\btax\b|\bcast.*command zone\b/.test(text)) {
    return {
      verdict: 'depends',
      summary: 'Commander tax depends on how many previous times that same commander was cast from the command zone this game.',
      mechanics: ['commander', 'timing'],
      clarificationNeeded: 'Tell me how many times this commander has already been cast from the command zone.'
    };
  }

  if (/\bdamage\b/.test(text)) {
    return {
      verdict: 'depends',
      summary: 'Commander damage is tracked separately for each commander and each player, and only combat damage counts.',
      mechanics: ['commander', 'damage'],
      clarificationNeeded: 'Tell me how much combat damage that exact commander has dealt to that player so far.'
    };
  }

  return {
    verdict: 'depends',
    summary: 'Commander rules depend on the exact commander-zone or format fact being asked.',
    mechanics: ['commander'],
    clarificationNeeded: 'Tell me whether this is about command-zone movement, commander tax, commander damage, or deck legality.'
  };
}
