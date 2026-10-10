import { buildRulesRuling } from './instajudgeCore.js';
import { compileVerifiedMagicScenario } from './magic/runtime/scenarioCompiler.js';

export const INSTAJUDGE_ENGINE_OPERATIONS = Object.freeze({
  EVALUATE_MAGIC_QUESTION: 'evaluate_magic_question'
});

function requireText(value, label) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`${label} is required.`);
  return clean;
}

function requireVerifiedState(state) {
  if (!state || typeof state !== 'object') throw new Error('Verified canonical state is required.');
  const commanderComplete = state.format === 'commander'
    && state.commander?.card
    && state.commander?.opponent
    && Number.isFinite(state.commander?.priorDamage)
    && Number.isFinite(state.commander?.newDamage)
    && Number.isFinite(state.commander?.life);
  if (commanderComplete) return state;
  if (!state.activePlayer || !state.phase || state.priorityKnown !== true || state.stack?.known !== true) {
    throw new Error('Verified canonical state is incomplete.');
  }
  return state;
}

function requireCards(cards) {
  if (!Array.isArray(cards) || cards.length > 12) throw new Error('Canonical card references are invalid.');
  if (cards.some((card) => !card || typeof card !== 'object' || !String(card.id || card.oracle_id || card.name || '').trim())) {
    throw new Error('Canonical card references are invalid.');
  }
  return cards;
}

function evaluateMagicQuestion({ game, message, cards = [], rules = [], verifiedState, latencyMs = 0 }) {
  if (game?.id !== 'magic') throw new Error('The Magic gateway only accepts the Magic game owner contract.');
  const state = requireVerifiedState(verifiedState);
  const question = requireText(message, 'A rules question');
  const canonicalCards = requireCards(cards);
  const scenario = compileVerifiedMagicScenario({ message: question, cards: canonicalCards, verifiedState: state });
  const result = buildRulesRuling({ game, message: question, cards: canonicalCards, rules, scenario, latencyMs });
  return {
    scenario,
    result: {
      ...result,
      engineScenario: scenario,
      provenance: {
        authority: 'deterministic-magic-runtime',
        operation: INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION,
        compiler: 'compileVerifiedMagicScenario',
        evaluator: 'buildRulesRuling'
      }
    }
  };
}

export function createInstaJudgeEngineGateway() {
  return Object.freeze({
    execute(request = {}) {
      if (request.operation !== INSTAJUDGE_ENGINE_OPERATIONS.EVALUATE_MAGIC_QUESTION) {
        throw new Error('Unsupported InstaJudge engine operation.');
      }
      return evaluateMagicQuestion(request);
    },
    evaluateMagicQuestion(request) {
      return evaluateMagicQuestion(request);
    }
  });
}

export const instaJudgeEngineGateway = createInstaJudgeEngineGateway();
