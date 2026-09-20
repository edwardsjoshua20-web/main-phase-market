import { detectMagicMechanics } from './mechanicDetector.js';
import { normalizeMagicCard } from './magicCards.js';
import { evaluateMagicRulesRuntime } from './runtime/magicRulesRuntime.js';
import { formatMagicRuling, publicMechanicList, selectRelevantRules } from './rulingFormatter.js';

function unsupported({ cards, rules, mechanics, latencyMs, trace, reason, clarificationNeeded }) {
  const summary = reason || 'I cannot verify that Magic ruling from the current deterministic rules coverage.';
  return {
    game: 'magic', verdict: 'unverified', summary, answer: `UNVERIFIED\n\n${summary}`,
    cards, rules, mechanics: publicMechanicList(mechanics),
    clarificationNeeded: clarificationNeeded || 'Please provide the exact card names and current game state, or use a supported interaction.',
    diagnosticTrace: trace, latencyMs
  };
}

function depends({ cards, rules, mechanics, latencyMs, trace, summary, clarificationNeeded, sequence = [] }) {
  const result = { game: 'magic', verdict: 'depends', summary, sequence, cards, rules, mechanics: publicMechanicList(mechanics), clarificationNeeded, diagnosticTrace: trace, latencyMs };
  return { ...result, answer: formatMagicRuling(result) };
}

function confident({ verdict, cards, rules, mechanics, latencyMs, trace, summary, sequence = [] }) {
  const result = { game: 'magic', verdict, summary, sequence, cards, rules, mechanics: publicMechanicList(mechanics), diagnosticTrace: trace, latencyMs };
  return { ...result, answer: formatMagicRuling(result) };
}

function evaluateDelegatedLegality({ message, legalityResult, cards, rules, mechanics, latencyMs }) {
  if (!legalityResult || !/\b(?:legal|legality|banned|allowed)\b/i.test(message)) return null;
  if (legalityResult.status === 'legal') return confident({ verdict: 'yes', cards, rules, mechanics: [...mechanics, 'commander'], latencyMs, trace: [{ type: 'LegalityOwnerResult', status: legalityResult.status }], summary: legalityResult.summary || 'The Legality Owner reports that this card is legal.' });
  if (['not_legal', 'banned'].includes(legalityResult.status)) return confident({ verdict: 'no', cards, rules, mechanics: [...mechanics, 'commander'], latencyMs, trace: [{ type: 'LegalityOwnerResult', status: legalityResult.status }], summary: legalityResult.summary || 'The Legality Owner reports that this card is not legal.' });
  return null;
}

export function evaluateMagicScenario({ message = '', cards = [], rules = [], legalityResult = null, latencyMs = 0 } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const mechanics = detectMagicMechanics({ message, cards: normalizedCards });
  const selectedRules = selectRelevantRules(mechanics, rules);
  const structuralCommanderQuestion = /\bcommander\b/i.test(message)
    && /\b(?:command zone|dies?|died|graveyard|exil(?:e|ed)|hand|library|second copy|another copy|tax|countered|costs?|cast|damage|combat|dealt|hits?|trample|stole|lightning bolts?|lose|kill)\b|\bis that 21\b/i.test(message);
  const structuralMultiplayerQuestion = /\b(?:three|four|five|3|4|5)[ -]player\b|\bfree-for-all\b|\bmultiplayer\b/i.test(message)
    && /\b(?:turn|priority|pass|respond|stack|attack|block|loses?|dies?|leaves?|controls?|game end|each opponent|each player|target opponent|ward|trigger|commander damage)\b/i.test(message);
  const unsupportedMultiplayerVariant = /\b(?:two-headed giant|2hg|emperor|grand melee|archenemy|limited range of influence|shared team)\b/i.test(message);
  if (normalizedCards.length === 0 && !structuralCommanderQuestion && !structuralMultiplayerQuestion && !unsupportedMultiplayerVariant) {
    return unsupported({ cards: [], rules: selectedRules, mechanics, latencyMs, trace: [], reason: 'I cannot verify a Magic ruling until at least one exact card identity is resolved from the catalog.' });
  }

  const delegatedLegality = evaluateDelegatedLegality({ message, legalityResult, cards: normalizedCards, rules: selectedRules, mechanics, latencyMs });
  if (delegatedLegality) return delegatedLegality;

  const runtime = evaluateMagicRulesRuntime({ message, cards: normalizedCards });
  if (runtime.status === 'depends') {
    return depends({ cards: normalizedCards, rules: runtime.rules, mechanics: runtime.mechanics, latencyMs, trace: runtime.trace, summary: runtime.summary, clarificationNeeded: runtime.clarificationNeeded, sequence: runtime.sequence });
  }
  if (runtime.status === 'unsupported') {
    return unsupported({ cards: normalizedCards, rules: runtime.rules, mechanics: runtime.mechanics, latencyMs, trace: runtime.trace, reason: runtime.summary, clarificationNeeded: runtime.clarificationNeeded });
  }
  return confident({ verdict: runtime.verdict, cards: normalizedCards, rules: runtime.rules, mechanics: runtime.mechanics, latencyMs, trace: runtime.trace, summary: runtime.summary, sequence: runtime.sequence });
}
