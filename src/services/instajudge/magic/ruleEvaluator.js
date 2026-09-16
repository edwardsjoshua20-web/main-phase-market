import { evaluateCommanderQuestion } from './commanderRules.js';
import { detectMagicMechanics, isComplexLayerQuestion, isReplacementChoiceQuestion } from './mechanicDetector.js';
import { createGameState } from './gameState.js';
import { normalizeMagicCard, normalizeMagicText } from './magicCards.js';
import { formatMagicRuling, publicMechanicList, selectRelevantRules } from './rulingFormatter.js';
import { parseMagicScenario } from './scenarioParser.js';
import { buildStack, resolveStack, validateTargetsOnAnnouncement } from './stackEngine.js';
import { evaluateTimingQuestion } from './timingRules.js';

function unsupported({ cards, rules, mechanics, latencyMs, trace, reason }) {
  const summary = reason || 'I cannot verify that Magic ruling from the current deterministic rules coverage.';
  return {
    game: 'magic',
    verdict: 'unverified',
    summary,
    answer: `UNVERIFIED\n\n${summary}`,
    cards,
    rules,
    mechanics: publicMechanicList(mechanics),
    clarificationNeeded: 'Please provide the exact card names and current game state, or use a simpler supported interaction.',
    diagnosticTrace: trace,
    latencyMs
  };
}

function depends({ cards, rules, mechanics, latencyMs, trace, summary, clarificationNeeded, sequence = [] }) {
  const result = {
    game: 'magic',
    verdict: 'depends',
    summary,
    sequence,
    cards,
    rules,
    mechanics: publicMechanicList(mechanics),
    clarificationNeeded,
    diagnosticTrace: trace,
    latencyMs
  };
  return { ...result, answer: formatMagicRuling(result) };
}

function confident({ verdict, cards, rules, mechanics, latencyMs, trace, summary, sequence = [] }) {
  const result = {
    game: 'magic',
    verdict,
    summary,
    sequence,
    cards,
    rules,
    mechanics: publicMechanicList(mechanics),
    diagnosticTrace: trace,
    latencyMs
  };
  return { ...result, answer: formatMagicRuling(result) };
}

function inferFinalVerdict({ scenario, state, stackResult }) {
  const text = scenario.normalizedText;
  const destroyedNames = state.permanents
    .filter((permanent) => permanent.zone === 'graveyard')
    .map((permanent) => normalizeMagicText(permanent.card.name));

  if (/\bdestroy|destroys|die|dies\b/.test(text)) {
    const protectedIllegalTarget = stackResult.sequence.some((step) => /no legal targets/i.test(step.result));
    if (protectedIllegalTarget) return 'no';
    const namedDestroyed = scenario.cards.some((card) => destroyedNames.includes(card.normalizedName));
    return namedDestroyed ? 'yes' : 'no';
  }

  if (/\bcan i respond|can .* respond|counterspell|counter target spell\b/.test(text)) return 'yes';
  if (/\bdamage|lethal\b/.test(text)) {
    const anyGraveyard = state.permanents.some((permanent) => permanent.zone === 'graveyard');
    return anyGraveyard ? 'yes' : 'depends';
  }
  return stackResult.completed ? 'yes' : 'unverified';
}

export function evaluateMagicScenario({ message = '', cards = [], rules = [], legalityResult = null, latencyMs = 0 } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const mechanics = detectMagicMechanics({ message, cards: normalizedCards });
  const selectedRules = selectRelevantRules(mechanics, rules);
  const trace = [];

  if (normalizedCards.length === 0) {
    return unsupported({
      cards: [],
      rules: selectedRules,
      mechanics,
      latencyMs,
      trace,
      reason: 'I cannot verify a Magic ruling until at least one card identity is resolved from the catalog.'
    });
  }

  if (isComplexLayerQuestion(message)) {
    return unsupported({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics: [...mechanics, 'layers'],
      latencyMs,
      trace,
      reason: 'This looks like a complex layer interaction, and the current Magic engine does not yet cover that fully.'
    });
  }

  const commander = evaluateCommanderQuestion({ message, cards: normalizedCards, legalityResult });
  if (commander) {
    const result = commander.verdict === 'depends'
      ? depends({
        cards: normalizedCards,
        rules: selectRelevantRules(commander.mechanics, rules),
        mechanics: commander.mechanics,
        latencyMs,
        trace,
        summary: commander.summary,
        clarificationNeeded: commander.clarificationNeeded
      })
      : confident({
        verdict: commander.verdict,
        cards: normalizedCards,
        rules: selectRelevantRules(commander.mechanics, rules),
        mechanics: commander.mechanics,
        latencyMs,
        trace,
        summary: commander.summary
      });
    return result;
  }

  const timing = evaluateTimingQuestion({ message, cards: normalizedCards });
  if (timing && !/\btarget|destroy|damage|protection|hexproof|shroud|ward\b/i.test(message)) {
    return confident({
      verdict: timing.verdict,
      cards: normalizedCards,
      rules: selectRelevantRules(timing.mechanics, rules),
      mechanics: timing.mechanics,
      latencyMs,
      trace,
      summary: timing.summary,
      sequence: timing.sequence
    });
  }

  if (isReplacementChoiceQuestion(message) && !/\bcommander\b/i.test(message)) {
    return depends({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics: [...mechanics, 'replacement-effects'],
      latencyMs,
      trace,
      summary: 'Replacement effects can change the event before it happens, but this scenario needs the exact affected object/player choice.',
      clarificationNeeded: 'Tell me which replacement or prevention effects apply and who controls or is affected by each one.'
    });
  }

  if (/\bhexproof|shroud|ward\b/i.test(message)
    && !normalizedCards.some((card) => card.abilities?.some((ability) => ['hexproof', 'shroud', 'ward'].includes(ability)))) {
    return unsupported({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics: [...mechanics, /\bward\b/i.test(message) ? 'ward' : /\bshroud\b/i.test(message) ? 'shroud' : 'hexproof'],
      latencyMs,
      trace,
      reason: 'This question depends on a hexproof, shroud, or ward object that was not resolved as a specific card or permanent.'
    });
  }

  const scenario = parseMagicScenario({ message, cards: normalizedCards });
  trace.push({ type: 'scenario', stackObjects: scenario.stackObjects.map((object) => ({ card: object.card.name, targets: object.targets.map((target) => target.name), controller: object.controller })) });

  if (scenario.stackObjects.length === 0) {
    return unsupported({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics,
      latencyMs,
      trace,
      reason: 'I resolved cards, but could not reconstruct a supported spell or ability sequence from the scenario.'
    });
  }

  const state = createGameState({ cards: scenario.permanentCards, message });
  const stack = buildStack(scenario);
  const announcementChecks = validateTargetsOnAnnouncement(stack, state);
  trace.push({ type: 'announcement-target-checks', checks: announcementChecks.map((entry) => ({ object: entry.object.card.name, targetCheck: entry.targetCheck })) });

  const failedAnnouncement = announcementChecks.find((entry) => entry.targetCheck.allIllegal);
  if (failedAnnouncement) {
    return confident({
      verdict: 'no',
      cards: normalizedCards,
      rules: selectedRules,
      mechanics: [...mechanics, 'targeting'],
      latencyMs,
      trace,
      summary: `${failedAnnouncement.object.card.name} cannot be put on the stack with only illegal targets.`,
      sequence: failedAnnouncement.targetCheck.checks.flatMap((check) => check.failures)
    });
  }

  const stackResult = resolveStack({ stack, state, scenario });
  trace.push(...stackResult.trace, ...state.diagnostics);

  const unresolved = stackResult.unresolved[0];
  if (unresolved?.result?.needsClarification) {
    return depends({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics,
      latencyMs,
      trace,
      summary: unresolved.result.summary,
      clarificationNeeded: unresolved.result.needsClarification,
      sequence: stackResult.sequence
    });
  }

  if (unresolved?.result?.unsupported) {
    return unsupported({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics,
      latencyMs,
      trace,
      reason: unresolved.result.summary
    });
  }

  const verdict = inferFinalVerdict({ scenario, state, stackResult });
  if (verdict === 'unverified') {
    return unsupported({
      cards: normalizedCards,
      rules: selectedRules,
      mechanics,
      latencyMs,
      trace,
      reason: 'The stack resolved, but this scenario is outside the current verdict mapping.'
    });
  }

  return confident({
    verdict,
    cards: normalizedCards,
    rules: selectedRules,
    mechanics,
    latencyMs,
    trace,
    summary: stackResult.sequence.at(-1)?.result || 'The deterministic Magic engine resolved the supported sequence.',
    sequence: stackResult.sequence.flatMap((step) => [step.result, ...(step.stateBasedActions || [])]).filter(Boolean)
  });
}
