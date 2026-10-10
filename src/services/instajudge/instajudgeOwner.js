import {
  INSTAJUDGE_GAMES,
  buildLegalityRuling,
  buildUnsupportedResult,
  detectLegalityFormat,
  extractPossibleCardNames,
  getInstaJudgeGame,
  isLegalityQuestion,
  normalizeJudgeText,
  rankRulesForScenario
} from './instajudgeCore.js';
import {
  collectMagicConversationState,
  createMagicConversationState,
  getMissingRequiredMagicState,
  looksLikeQuestion,
  magicStateSummary,
  nextMagicStatePrompt,
  stateSummaryText
} from './magic/conversationState.js';
import { instaJudgeInterpretationClient } from './interpretation/interpretationClient.js';
import { applyConfirmedMagicCorrection, validateAndAdaptMagicInterpretation } from './interpretation/interpretationAdapter.js';
import { instaJudgeEngineGateway } from './engineGateway.js';
import { INSTAJUDGE_MESSAGE_ROUTES, routeInstaJudgeMessage } from './messageRouter.js';

const SEARCH_GAME_BY_ID = Object.freeze({
  magic: 'magic',
  pokemon: 'pokemon',
  yugioh: 'yugioh',
  lorcana: 'lorcana',
  flesh_and_blood: 'flesh_and_blood',
  onepiece: 'onepiece',
  starwars: 'starwars'
});

const MAGIC_HELP_INTENTS = Object.freeze([
  { value: 'rules_question', label: 'Ask a rules question' },
  { value: 'check_play', label: 'Check a play' },
  { value: 'combat_ruling', label: 'Combat ruling' },
  { value: 'timing_priority', label: 'Timing / priority' }
]);

function nowMs() {
  return typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
}

function cleanText(value) {
  return String(value || '').trim();
}

function canonicalCardId(card = {}) {
  return cleanText(
    card.oracle_id
    || card.card_id
    || card.api_id
    || card.unique_id
    || card.uuid
    || card.id
    || card.name
  );
}

function cardText(card = {}) {
  const raw = card.raw || {};
  return cleanText(card.oracle_text || card.rules_text || card.description || card.text || raw.oracle_text || raw.rules_text || raw.description || raw.text);
}

function normalizeCard(card = {}, requestedName = '') {
  return {
    id: cleanText(card.id || card.searchIdentity || card.name),
    name: cleanText(card.name || requestedName),
    game: card.game,
    setCode: cleanText(card.set_code || card.set || card.raw?.set_code || card.raw?.set),
    collectorNumber: cleanText(card.collector_number || card.card_number || card.number || card.raw?.collector_number || card.raw?.number),
    typeLine: cleanText(card.type_line || card.type || card.raw?.type_line || card.raw?.type),
    oracleText: cardText(card),
    manaCost: cleanText(card.mana_cost || card.manaCost || card.raw?.mana_cost),
    colors: card.colors || card.raw?.colors || [],
    colorIdentity: card.color_identity || card.colorIdentity || card.raw?.color_identity || [],
    power: card.power ?? card.raw?.power ?? null,
    toughness: card.toughness ?? card.raw?.toughness ?? null,
    powerToughness: cleanText(card.power_toughness || card.powerToughness || card.pt || card.raw?.power_toughness),
    oracle_id: cleanText(card.oracle_id || card.raw?.oracle_id),
    legalities: card.legalities || card.raw?.legalities || null,
    ban_tcg: card.ban_tcg || card.raw?.ban_tcg || card.raw?.banlist_info?.ban_tcg || null,
    raw: card
  };
}

function isExactEnough(candidate, result) {
  const wanted = strictNameKey(candidate);
  const found = strictNameKey(result?.name);
  return Boolean(wanted && found && wanted === found);
}

function strictNameKey(value = '') {
  return normalizeJudgeText(value)
    .replace(/[^a-z0-9]+/g, '')
    .trim();
}

function dedupeCards(cards = []) {
  const seen = new Set();
  const unique = [];
  for (const card of cards) {
    const key = `${card.game}:${canonicalCardId(card) || card.name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }
  return unique;
}

async function resolveCandidate(game, candidate, searchOwner) {
  const searchGame = SEARCH_GAME_BY_ID[game.id] || game.id;
  const results = await searchOwner.searchPreviewByGame(candidate, searchGame, 5, { includeInventory: false });
  const exact = results.find((result) => isExactEnough(candidate, result));
  return exact ? normalizeCard(exact, candidate) : null;
}

function candidateSearchVariants(candidate) {
  const words = cleanText(candidate).split(/\s+/).filter(Boolean).slice(0, 6);
  const variants = [words.join(' ')];
  for (let length = words.length - 1; length >= 1; length -= 1) {
    for (let start = 0; start + length <= words.length; start += 1) {
      variants.push(words.slice(start, start + length).join(' '));
    }
  }
  return [...new Set(variants.filter((value) => value.length >= 3))];
}

function collectorCardCandidates(message, pendingStateKey) {
  if (!['combat-attackers', 'combat-blockers', 'stack-items', 'stack-response-item', 'stack-response-target', 'commander-card'].includes(pendingStateKey)) return [];
  if (['stack-items', 'stack-response-item', 'stack-response-target'].includes(pendingStateKey)) {
    const text = cleanText(message);
    const structured = text.match(/^(.+?)(?:\s*,?\s+(?:targeting|targets?|on|is targeting)\s+)(.+)$/i);
    if (structured) {
      return [structured[1], structured[2]]
        .map((value) => cleanText(value).replace(/[.?!]+$/, ''))
        .filter((value) => value.length >= 3);
    }
  }
  const candidate = cleanText(message)
    .replace(/^(?:my\s+)?commander\s*[:,-]?\s*/i, '')
    .replace(/^(?:my|your|their|opponent'?s?)\s+/i, '')
    .replace(/^(?:(?:attacking|blocking)\s+)?(?:attacker|blocker|creature|spell|ability)\s*[,;:-]?\s*/i, '')
    .trim();
  return candidate.length >= 3 ? [candidate] : [];
}

async function resolveCards(game, message, searchOwner, pendingStateKey = null) {
  const candidates = [...new Set([
    ...extractPossibleCardNames(message),
    ...collectorCardCandidates(message, pendingStateKey)
  ])];
  const resolved = [];

  for (const candidate of candidates) {
    const variants = candidateSearchVariants(candidate);
    for (const [index, variant] of variants.entries()) {
      try {
        const card = await resolveCandidate(game, variant, searchOwner);
        if (card) resolved.push(card);
        if (card && index === 0) break;
      } catch {
        // Card lookup must fail closed; unresolved names are handled by the final ruling result.
      }
    }
  }

  return dedupeCards(resolved).slice(0, 6);
}

function retrieveRules(game, message, gameKnowledgeOwner) {
  const topics = gameKnowledgeOwner.getRulesTopicsByCategory(game.id, 'reference');
  const ranked = rankRulesForScenario(game.id, message, topics);
  if (ranked.length > 0) return ranked;
  return gameKnowledgeOwner.searchRulesTopics(game.id, message).slice(0, 3);
}

function legalityMetadata(game) {
  if (game.id === 'magic') {
    return {
      source: 'Scryfall catalog legalities',
      sourceVersion: 'MainPhase Magic catalog legality projection',
      lastVerified: game.sourceRefs?.find((source) => /Scryfall/i.test(source.label))?.freshness || null
    };
  }
  if (game.id === 'pokemon') return { source: 'Pokemon TCG catalog legalities', sourceVersion: 'MainPhase Pokemon catalog legality projection' };
  if (game.id === 'yugioh') return { source: 'YGOPRODeck banlist_info.ban_tcg', sourceVersion: 'MainPhase Yu-Gi-Oh! catalog legality projection', region: 'TCG' };
  if (game.id === 'flesh_and_blood') return { source: 'Flesh and Blood catalog legality fields', sourceVersion: 'MainPhase FAB catalog legality projection' };
  return { source: `${game.label} MainPhase catalog legality fields` };
}

function updatedSession(session = {}, result = {}) {
  return {
    ...session,
    game: result.game || session.game,
    resolvedCards: dedupeCards(result.cards || []).slice(0, 8),
    lastRuling: result
  };
}

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `ruling-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSessionState(game = null) {
  return {
    id: createSessionId(),
    game,
    stage: game === 'magic' ? 'intent' : 'questioning',
    helpIntent: null,
    magicState: game === 'magic' ? createMagicConversationState() : null,
    pendingQuestion: null,
    pendingStateKey: null,
    pendingCorrection: null,
    pendingClarification: null,
    pendingRulesRequest: null,
    stageBeforeCorrection: null,
    verifiedState: false,
    resolvedCards: [],
    conversation: [],
    lastRuling: null,
    history: [],
    aiUsage: { calls: 0, failures: 0 },
    interaction: null
  };
}

function conversationResult({
  game = 'magic',
  answer,
  kind,
  choices = [],
  state = null,
  cards = [],
  rules = [],
  clarificationNeeded = null,
  diagnosticTrace = [],
  stateKey = null,
  interactionField = null,
  inputRepairEligible = false
}) {
  return {
    game, answer, kind, choices, cards, rules, clarificationNeeded, diagnosticTrace,
    stateKey, interactionField, inputRepairEligible,
    stateSummary: state ? magicStateSummary(state) : null
  };
}

function withConversation(session, role, text) {
  return { ...session, conversation: [...(session.conversation || []), { role, text }] };
}

function promptResult(prompt, state) {
  return conversationResult({
    answer: prompt.text,
    kind: 'state-question',
    choices: prompt.choices,
    state,
    stateKey: prompt.key,
    interactionField: prompt.key
  });
}

function intentResult() {
  return conversationResult({
    answer: "Hi, I'm InstaJudge. What do you need help with?",
    kind: 'intent-question',
    choices: MAGIC_HELP_INTENTS.map((intent) => intent.label),
    stateKey: 'intent',
    interactionField: 'intent'
  });
}

function matchingMagicHelpIntent(message) {
  const normalized = normalizeJudgeText(message).replace(/\s*\/\s*/g, ' / ');
  return MAGIC_HELP_INTENTS.find((intent) => normalizeJudgeText(intent.label).replace(/\s*\/\s*/g, ' / ') === normalized) || null;
}

function shouldInterpretMessage(route) {
  return [
    INSTAJUDGE_MESSAGE_ROUTES.FREEFORM_STATE,
    INSTAJUDGE_MESSAGE_ROUTES.RULES_QUESTION,
    INSTAJUDGE_MESSAGE_ROUTES.CORRECTION,
    INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION,
    INSTAJUDGE_MESSAGE_ROUTES.CASUAL_CONVERSATION
  ].includes(route);
}

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function snapshotSession(session) {
  const { history: _history, ...snapshot } = session;
  return clone(snapshot);
}

function recordSnapshot(session, answerId) {
  if (!answerId) return session;
  return { ...session, history: [...(session.history || []), { answerId, before: snapshotSession(session) }].slice(-40) };
}

function restoredStageResult(session) {
  const state = session.magicState || createMagicConversationState();
  if (session.stage === 'intent') return intentResult();
  if (session.stage === 'confirming-correction' && session.pendingCorrection) return correctionPromptResult(session.pendingCorrection, state);
  if (session.stage === 'verifying') return verificationResult(state);
  if (session.stage === 'questioning') return conversationResult({ answer: 'What do you want me to rule on?', kind: 'ruling-question', state });
  const prompt = nextMagicStatePrompt(state);
  return prompt ? promptResult(prompt, state) : verificationResult(state);
}

function correctionPromptResult(correction, state, lead = '') {
  if (correction.status === 'awaiting_value') {
    const choices = {
      turn: ['Mine', "Opponent's"],
      phase: ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup'],
      priority: ['Me', 'Opponent', 'Not sure'],
      stack: ['Empty', 'Not empty']
    }[correction.field] || [];
    if (!correction.field) {
      return conversationResult({
        answer: `${lead ? `${lead} ` : ''}Sure - what do you need to change?`,
        kind: 'correction-value', choices: [], state,
        stateKey: 'correction-value', interactionField: 'correction'
      });
    }
    const fieldLabel = correction.field === 'turn'
      ? 'whose turn should it be'
      : correction.field === 'priority'
        ? 'who should have priority'
        : `what should ${correction.field} be`;
    return conversationResult({
      answer: `${lead ? `${lead} ` : ''}Sure - ${fieldLabel}?`,
      kind: 'correction-value', choices, state,
      stateKey: `correction-value:${correction.field}`,
      interactionField: correction.field
    });
  }
  return conversationResult({
    answer: `${lead ? `${lead} ` : ''}You want to change ${correction.label}, right?`,
    kind: 'correction-confirmation', choices: ['Yes, change it', 'No, keep it'], state,
    stateKey: 'correction-confirmation', interactionField: correction.field || 'correction'
  });
}

function pendingCollectorContext(session) {
  const prompt = session.magicState ? nextMagicStatePrompt(session.magicState) : null;
  return {
    stage: session.stage,
    pendingStateKey: session.pendingStateKey,
    pendingQuestion: session.pendingQuestion,
    verifiedState: session.verifiedState,
    prompt: prompt?.text || null,
    choices: prompt?.choices || []
  };
}

function activeInteractionResult(session = {}) {
  if (session.game !== 'magic') return null;
  const state = session.magicState || createMagicConversationState();
  if (session.stage === 'intent') return intentResult();
  if (session.stage === 'confirming-correction' && session.pendingCorrection) {
    return correctionPromptResult(session.pendingCorrection, state);
  }
  if (session.stage === 'verifying') return verificationResult(state);
  if (['collecting', 'editing'].includes(session.stage)) {
    const prompt = nextMagicStatePrompt(state);
    return prompt ? promptResult(prompt, state) : null;
  }
  return null;
}

function authoritativeInteraction(session = {}, result = null) {
  const active = result || activeInteractionResult(session);
  const correctionContext = session.pendingCorrection?.collectorContext || null;
  const activeCollector = ['intent', 'collecting', 'editing', 'clarifying', 'verifying'].includes(session.stage) && active
    ? {
        stage: session.stage,
        key: session.pendingStateKey || active.stateKey || null,
        prompt: active.answer || null,
        choices: active.choices || []
      }
    : null;
  return {
    mode: session.stage || 'idle',
    activeCollector,
    suspendedCollector: correctionContext ? {
      stage: correctionContext.stage || session.stageBeforeCorrection || 'collecting',
      key: correctionContext.pendingStateKey || null,
      prompt: correctionContext.prompt || null,
      choices: correctionContext.choices || []
    } : null,
    pendingCorrection: session.pendingCorrection || null,
    pendingClarification: session.pendingClarification || (session.stage === 'clarifying' ? session.pendingQuestion : null),
    pendingRulesRequest: session.pendingRulesRequest || null,
    visiblePromptField: active?.interactionField || active?.stateKey || null,
    quickReplyField: (active?.choices || []).length > 0 ? (active?.interactionField || active?.stateKey || null) : null,
    conversationContext: (session.conversation || []).slice(-6)
  };
}

function withAuthoritativeInteraction(session, result) {
  return { ...session, interaction: authoritativeInteraction(session, result) };
}

function inferredPromptField(answer = '') {
  const text = normalizeJudgeText(answer);
  if (/what spell or ability.*add.*stack/.test(text)) return 'stack-response-item';
  if (/what spell or ability.*stack/.test(text)) return 'stack-items';
  if (/what does it target|which.*target/.test(text)) return 'stack-response-target';
  if (/what creature.*attacking|which.*attackers?/.test(text)) return 'combat-attackers';
  if (/what creature.*blocking|which.*blockers?/.test(text)) return 'combat-blockers';
  if (/whose turn|change.*turn|turn.*change/.test(text)) return 'turn';
  if (/what phase|which phase|phase or step/.test(text)) return 'phase';
  if (/combat step|beginning phase step|ending phase step/.test(text)) return 'step';
  if (/who.*priority|priority holder/.test(text)) return 'priority';
  if (/is the stack empty|stack status/.test(text)) return 'stack';
  if (/what is your commander/.test(text)) return 'commander-card';
  if (/current life total/.test(text)) return 'commander-life';
  return null;
}

export function assertInstaJudgeInteractionInvariant(session = {}, result = {}) {
  const active = activeInteractionResult(session);
  if (!active) return true;
  if (result.stateKey !== active.stateKey) {
    throw new Error(`InstaJudge interaction mismatch: expected ${active.stateKey}, received ${result.stateKey || 'none'}.`);
  }
  if (result.interactionField !== active.interactionField) {
    throw new Error(`InstaJudge field mismatch: expected ${active.interactionField}, received ${result.interactionField || 'none'}.`);
  }
  if (JSON.stringify(result.choices || []) !== JSON.stringify(active.choices || [])) {
    throw new Error(`InstaJudge quick replies do not match the active ${active.interactionField} interaction.`);
  }
  const promptField = !result.aiConversation && ['state-question', 'conversation-interruption', 'correction-value', 'correction-confirmation'].includes(result.kind)
    ? inferredPromptField(result.answer)
    : null;
  if (promptField && promptField !== active.interactionField) {
    throw new Error(`InstaJudge prompt field ${promptField} does not match active field ${active.interactionField}.`);
  }
  const interaction = session.interaction || authoritativeInteraction(session, result);
  if (interaction.visiblePromptField !== active.interactionField) {
    throw new Error(`InstaJudge authoritative prompt field mismatch: expected ${active.interactionField}, received ${interaction.visiblePromptField || 'none'}.`);
  }
  const expectedQuickReplyField = (active.choices || []).length > 0 ? active.interactionField : null;
  if (interaction.quickReplyField !== expectedQuickReplyField) {
    throw new Error(`InstaJudge authoritative quick-reply field mismatch for ${active.interactionField}.`);
  }
  return true;
}

function hasConversationAction(conversation, type) {
  return Boolean(conversation?.proposedActions?.some((action) => action.type === type));
}

function conversationalLead(conversation, fallback = '') {
  return cleanText(conversation?.reply) || fallback;
}

function withoutRestatedGuidedPrompt(reply, base) {
  let clean = cleanText(reply);
  if (!clean || !base?.answer) return clean;
  const escapedPrompt = base.answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  clean = clean.replace(new RegExp(`\\s*${escapedPrompt}\\s*$`, 'i'), '').trim();
  const fieldPatterns = {
    turn: /\s*(?:now[,;]?\s*)?(?:to\s+[^?.,]+[,;]?\s*)?(?:could you (?:please )?|please )?(?:tell me )?whose turn (?:is it|should it be)\??.*$/i,
    phase: /\s*(?:now[,;]?\s*)?(?:to\s+[^?.,]+[,;]?\s*)?(?:could you (?:please )?|please )?(?:tell me )?what phase or step (?:are you|you're) in\??.*$/i,
    priority: /\s*(?:now[,;]?\s*)?(?:could you (?:please )?|please )?(?:tell me )?who (?:currently )?has priority\??.*$/i,
    stack: /\s*(?:now[,;]?\s*)?(?:could you (?:please )?|please )?(?:tell me )?is the stack empty\??.*$/i
  };
  clean = clean.replace(fieldPatterns[base.interactionField] || /$^/, '').trim();
  const collectorReclaim = {
    turn: /\b(?:tell|choose|select|answer|figure|trying|resume|continue|return|ready|need)\b[^.!?]*\bwhose turn\b/i,
    phase: /\b(?:tell|choose|select|answer|resume|continue|return|ready|need)\b[^.!?]*\b(?:phase|step)\b/i,
    priority: /\b(?:tell|choose|select|answer|resume|continue|return|ready|need)\b[^.!?]*\bpriority\b/i,
    stack: /\b(?:tell|choose|select|answer|resume|continue|return|ready|need)\b[^.!?]*\bstack\b/i
  };
  const reclaimPattern = collectorReclaim[base.interactionField];
  if (!reclaimPattern) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]*/g) || [clean];
  const reclaimIndex = sentences.findIndex((sentence) => reclaimPattern.test(sentence));
  return (reclaimIndex >= 0 ? sentences.slice(0, reclaimIndex).join('') : clean).trim();
}

function proposedConversationCorrection(conversation) {
  const action = conversation?.proposedActions?.find((item) => item.type === 'propose_correction');
  if (!action?.field || !action?.value) return null;
  return directCorrection(action.field, action.value);
}

function resultWithNaturalReply(base, conversation, { appendPrompt = true, fallback = '' } = {}) {
  const rawReply = conversationalLead(conversation, fallback);
  const silentlyHeld = ['continue_conversation', 'hold_collector', 'continue_collector'].includes(conversation?.conversationControl);
  const filteredReply = appendPrompt || silentlyHeld ? withoutRestatedGuidedPrompt(rawReply, base) : rawReply;
  const reply = filteredReply || (silentlyHeld ? 'I hear you.' : '');
  if (!reply) return base;
  const answer = appendPrompt && base.answer
    ? `${reply} ${base.answer}`.trim()
    : reply;
  return { ...base, answer, aiConversation: {
    intent: conversation?.intent || 'unknown',
    conversationControl: conversation?.conversationControl || 'continue_conversation',
    proposedActions: conversation?.proposedActions || [],
    rulesRequest: conversation?.rulesRequest || null,
    interpretation: conversation?.interpretation || null
  } };
}

function fieldValue(state, field) {
  if (field === 'turn') return state.activePlayer;
  if (field === 'phase') return state.phase;
  if (field === 'step') return state.step;
  if (field === 'priority') return state.priorityKnown ? state.priorityHolder : null;
  if (field === 'stack') return state.stack?.known ? (state.stack.empty ? 'empty' : 'not empty') : null;
  return null;
}

function correctionFieldFromMessage(message = '') {
  const normalized = normalizeJudgeText(message);
  if (/\bturn\b/.test(normalized)) return 'turn';
  if (/\bphase\b/.test(normalized)) return 'phase';
  if (/\bstep\b/.test(normalized)) return 'step';
  if (/\bpriority\b/.test(normalized)) return 'priority';
  if (/\bstack\b/.test(normalized)) return 'stack';
  if (/\btarget/.test(normalized)) return 'target';
  return null;
}

function directCorrection(field, message) {
  const clean = cleanText(message);
  if (!field || !clean) return null;
  return { field, message: clean, label: `${field === 'priority' ? 'priority' : `the ${field}`} to ${clean}` };
}

function isAffirmativeConfirmation(message = '') {
  return /^(?:yes|yes please|yes,? change it|yeah,? go ahead|go ahead|do it|please do|yeah|yep|sure)$/i.test(cleanText(message).replace(/[.!?]+$/, ''));
}

function isCancelledConfirmation(message = '') {
  return /^(?:no|no,? keep it|no,? leave it|leave it|never mind|nevermind|actually never mind|cancel|don't|do not)$/i.test(cleanText(message).replace(/[.!?]+$/, ''));
}

function interruptionCopy(message, prompt) {
  const normalized = normalizeJudgeText(message);
  if (/why do you need/.test(normalized)) {
    const reason = prompt?.key === 'phase' || prompt?.key === 'step'
      ? 'Timing and legal actions can change from one phase or step to another.'
      : prompt?.key === 'priority'
        ? 'Priority tells me who is allowed to act next.'
        : prompt?.key === 'stack'
          ? 'The stack tells me whether another spell or ability must resolve first.'
          : 'That detail can change the ruling.';
    return `${reason} ${prompt?.text || ''}`.trim();
  }
  if (/what do you mean|how do i tell/.test(normalized)) {
    const explanation = prompt?.key === 'priority'
      ? 'Priority is the chance to cast a spell, activate an ability, or pass.'
      : 'Give me the game state as it is right now; the available choices cover the usual cases.';
    return `${explanation} ${prompt?.text || ''}`.trim();
  }
  if (/what was (?:the|i) question|what was i answering|wait,? what/.test(normalized)) return prompt?.text || 'Tell me what you want to revisit.';
  if (/can i change|change my answer/.test(normalized)) return `Yes. Tell me which earlier answer needs to change. ${prompt?.text || ''}`.trim();
  if (/thanks?|thank you|appreciate/.test(normalized)) return `You're welcome. ${prompt?.text || ''}`.trim();
  return `I heard you. ${prompt?.text || ''}`.trim();
}

function resumeAfterCorrection(session, state, lead = '') {
  const context = session.pendingCorrection?.collectorContext || {};
  const restored = {
    ...session,
    stage: context.stage || session.stageBeforeCorrection || 'collecting',
    pendingStateKey: context.pendingStateKey || null,
    pendingQuestion: context.pendingQuestion || null,
    pendingCorrection: null,
    stageBeforeCorrection: null,
    magicState: state,
    verifiedState: context.verifiedState ?? false
  };
  const base = restoredStageResult(restored);
  return {
    session: restored,
    result: { ...base, answer: `${lead ? `${lead} ` : ''}${base.answer}`.trim() }
  };
}

function resolveMagicHelpIntent(message) {
  const normalized = normalizeJudgeText(message).replace(/\s*\/\s*/g, ' / ');
  const exact = matchingMagicHelpIntent(message);
  if (exact) return exact;
  if (/\bcombat\b/.test(normalized)) return MAGIC_HELP_INTENTS[2];
  if (/\b(?:timing|priority)\b/.test(normalized)) return MAGIC_HELP_INTENTS[3];
  if (/\b(?:check|play)\b/.test(normalized)) return MAGIC_HELP_INTENTS[1];
  return MAGIC_HELP_INTENTS[0];
}

function verificationResult(state) {
  return conversationResult({
    answer: `${stateSummaryText(state)}\n\nConfirm this state before I rule.`,
    kind: 'state-verification', choices: ['Looks Right', 'Edit State'], state, cards: state.cards,
    stateKey: 'verification', interactionField: 'verification'
  });
}

function appendAssistant(session, result) {
  return withConversation(session, 'assistant', result.answer);
}

function appendAssistants(session, results) {
  return results.reduce((current, result) => appendAssistant(current, result), session);
}

export function createInstaJudgeOwner({ searchOwner = null, gameKnowledgeOwner = null, legalityOwner = null, interpretationService = null, engineGateway = instaJudgeEngineGateway } = {}) {
  const requestCache = new Map();
  const loadSearchOwner = async () => searchOwner || (await import('../search/searchOwner.js')).searchOwner;
  const loadKnowledgeOwner = async () => gameKnowledgeOwner || (await import('../knowledge/gameKnowledgeOwner.js')).gameKnowledgeOwner;
  const loadLegalityOwner = async () => legalityOwner || (await import('../legality/legalityOwner.js')).legalityOwner;
  return {
  listGames() {
    return INSTAJUDGE_GAMES.map((game) => ({ ...game }));
  },

  getGame(value) {
    return getInstaJudgeGame(value);
  },

  createSession(initial = {}) {
    return createSessionState(initial.game || null);
  },

  rollback(session = {}, answerId) {
    const history = session.history || [];
    const index = history.findIndex((entry) => entry.answerId === answerId);
    if (index < 0) return { session, result: conversationResult({ answer: 'That answer can no longer be corrected from this point.', kind: 'rollback-unavailable', state: session.magicState }) };
    const restored = { ...clone(history[index].before), history: history.slice(0, index), aiUsage: session.aiUsage || history[index].before.aiUsage || { calls: 0, failures: 0 } };
    const result = restoredStageResult(restored);
    const restoredWithInteraction = withAuthoritativeInteraction(restored, result);
    assertInstaJudgeInteractionInvariant(restoredWithInteraction, result);
    return { session: restoredWithInteraction, result };
  },

  selectGame(session = {}, gameId) {
    const game = this.getGame(gameId);
    if (!game) return { session, game: null };
    const nextSession = createSessionState(game.id);
    const result = game.id === 'magic'
      ? intentResult()
      : conversationResult({ game: game.id, answer: `Got it - ${game.label}. Describe what is happening in the game and include exact card names.`, kind: 'ruling-question' });
    const response = {
      game,
      result,
      session: withAuthoritativeInteraction(appendAssistant(nextSession, result), result)
    };
    assertInstaJudgeInteractionInvariant(response.session, response.result);
    return response;
  },

  async ask({ session = {}, gameId, message, answerId = null, inputSource = 'typed', judge = null }) {
    const requestKey = answerId ? `${session.id || 'session'}:${answerId}` : null;
    if (requestKey && requestCache.has(requestKey)) return requestCache.get(requestKey);
    const execute = async () => {
    const startedAt = nowMs();
    const game = this.getGame(gameId || session.game);
    const cleanMessage = cleanText(message);

    if (!game) {
      return {
        session,
        result: {
          game: null,
          verdict: 'unverified',
          answer: "I can't start a ruling until a TCG is selected.",
          cards: [],
          rules: [],
          clarificationNeeded: 'Choose a game first.',
          latencyMs: Math.round(nowMs() - startedAt)
        }
      };
    }

    if (!cleanMessage) {
      const result = buildUnsupportedResult({ game, cards: [], rules: [], latencyMs: Math.round(nowMs() - startedAt) });
      return { session: updatedSession({ ...session, game: game.id }, result), result };
    }

    const [search, knowledge] = await Promise.all([loadSearchOwner(), loadKnowledgeOwner()]);
    const cards = await resolveCards(game, cleanMessage, search, session.pendingStateKey);

    if (game.id === 'magic') {
      const route = routeInstaJudgeMessage({
        message: cleanMessage,
        stage: session.stage,
        pendingStateKey: session.pendingStateKey,
        inputSource,
        resolvedCards: cards
      });
      let nextSession = recordSnapshot({ ...session, game: game.id }, answerId);
      nextSession = withConversation(nextSession, 'user', cleanMessage);
      let state = nextSession.magicState || createMagicConversationState();
      let interpretedCards = [];
      let adaptedInterpretation = null;
      let aiConversation = null;
      let interpretationAttempted = false;

      const interpretOnce = async ({ pendingQuestion = nextSession.pendingQuestion, pendingStateKey = nextSession.pendingStateKey } = {}) => {
        if (!interpretationService || interpretationAttempted) return adaptedInterpretation;
        interpretationAttempted = true;
        nextSession = { ...nextSession, aiUsage: { ...nextSession.aiUsage, calls: (nextSession.aiUsage?.calls || 0) + 1 } };
        try {
          const interpreted = await interpretationService.interpret({
            game: game.id,
            message: cleanMessage,
            state,
            pendingQuestion,
            pendingStateKey,
            conversation: session.conversation || [],
            interaction: session.interaction || authoritativeInteraction(session),
            judge
          });
          aiConversation = interpreted?.interpretation ? interpreted : {
            reply: '',
            intent: interpreted?.interpretationType === 'correction'
              ? 'correction'
              : interpreted?.interpretationType === 'question'
                ? 'rules_question'
                : ['state_update', 'clarification_answer'].includes(interpreted?.interpretationType)
                  ? 'state_statement'
                  : 'unknown',
            proposedActions: [],
            rulesRequest: null,
            conversationControl: interpreted?.interpretationType === 'correction' ? 'suspend_for_correction' : 'continue_conversation',
            interpretation: interpreted
          };
          adaptedInterpretation = await validateAndAdaptMagicInterpretation({
            rawInterpretation: aiConversation.interpretation,
            state,
            searchOwner: search,
            message: cleanMessage
          });
          interpretedCards = adaptedInterpretation.cards;
          return adaptedInterpretation;
        } catch {
          nextSession = { ...nextSession, aiUsage: { ...nextSession.aiUsage, failures: (nextSession.aiUsage?.failures || 0) + 1 } };
          return null;
        }
      };

      if (nextSession.stage === 'confirming-correction') {
        const pending = nextSession.pendingCorrection;
        const exactReply = inputSource === 'quick-reply'
          || isAffirmativeConfirmation(cleanMessage)
          || isCancelledConfirmation(cleanMessage);
        if (!exactReply) {
          await interpretOnce({
            pendingQuestion: pending?.status === 'awaiting_value' ? `What should ${pending.field} be?` : `Confirm ${pending?.label || 'the correction'}`,
            pendingStateKey: pending?.status === 'awaiting_value' ? `correction-${pending.field}` : 'correction-confirmation'
          });
        }

        if (isCancelledConfirmation(cleanMessage)
          || aiConversation?.intent === 'cancellation'
          || hasConversationAction(aiConversation, 'cancel_pending_correction')) {
          const resumed = resumeAfterCorrection(
            nextSession,
            state,
            conversationalLead(aiConversation, 'No problem - I left the earlier answer unchanged.')
          );
          return { session: appendAssistant(resumed.session, resumed.result), result: resumed.result };
        }

        if (pending?.status === 'awaiting_value') {
          const requestedField = pending.field || correctionFieldFromMessage(cleanMessage);
          if (!pending.field && requestedField && !adaptedInterpretation?.correction) {
            const updatedPending = { ...pending, field: requestedField, previousValue: fieldValue(state, requestedField) };
            const result = resultWithNaturalReply(correctionPromptResult(updatedPending, state), aiConversation, { appendPrompt: true });
            nextSession = { ...nextSession, pendingCorrection: updatedPending };
            return { session: appendAssistant(nextSession, result), result };
          }
          const inferred = adaptedInterpretation?.correction
            || (route === INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED ? directCorrection(requestedField, cleanMessage) : null);
          if (!inferred) {
            const result = resultWithNaturalReply(
              correctionPromptResult(pending, state),
              aiConversation,
              { appendPrompt: true, fallback: 'I still need the replacement answer.' }
            );
            return { session: appendAssistant(nextSession, result), result };
          }
          const correction = {
            ...inferred,
            type: 'correction_confirmation', status: 'awaiting_confirmation',
            previousValue: fieldValue(state, inferred.field),
            proposedValue: inferred.message || inferred.targetName,
            cards: adaptedInterpretation?.cards || [],
            provenance: pending.provenance,
            collectorContext: pending.collectorContext
          };
          const result = resultWithNaturalReply(correctionPromptResult(correction, state), aiConversation, { appendPrompt: false });
          nextSession = { ...nextSession, pendingCorrection: correction };
          return { session: appendAssistant(nextSession, result), result };
        }

        if (isAffirmativeConfirmation(cleanMessage)
          || aiConversation?.intent === 'confirmation'
          || hasConversationAction(aiConversation, 'confirm_pending_correction')) {
          state = applyConfirmedMagicCorrection(state, pending, pending?.cards || []);
          const prompt = nextMagicStatePrompt(state);
          const baseResult = prompt ? promptResult(prompt, state) : verificationResult(state);
          const result = resultWithNaturalReply(baseResult, aiConversation, {
            appendPrompt: true,
            fallback: pending?.field === 'turn' ? `Done - it's ${state.activePlayer === 'player' ? 'your' : "your opponent's"} turn.` : 'Done - I updated it.'
          });
          nextSession = {
            ...nextSession,
            stage: prompt ? 'collecting' : 'verifying',
            magicState: state,
            pendingStateKey: prompt?.key || null,
            pendingCorrection: null,
            stageBeforeCorrection: null,
            verifiedState: false,
            resolvedCards: state.cards
          };
          return { session: appendAssistant(nextSession, result), result };
        }

        const interpretedCorrection = adaptedInterpretation?.correction || proposedConversationCorrection(aiConversation);
        if (interpretedCorrection) {
          const replacement = {
            ...interpretedCorrection,
            type: 'correction_confirmation', status: 'awaiting_confirmation',
            previousValue: fieldValue(state, interpretedCorrection.field),
            proposedValue: interpretedCorrection.message || interpretedCorrection.targetName,
            cards: adaptedInterpretation?.cards || [],
            provenance: pending.provenance,
            collectorContext: pending.collectorContext
          };
          const result = resultWithNaturalReply(
            correctionPromptResult(replacement, state),
            aiConversation,
            { appendPrompt: false }
          );
          nextSession = { ...nextSession, pendingCorrection: replacement };
          return { session: appendAssistant(nextSession, result), result };
        }

        const result = resultWithNaturalReply(
          correctionPromptResult(pending, state),
          aiConversation,
          {
            appendPrompt: false,
            fallback: /\b(?:are you able|can you|what happens)\b/i.test(cleanMessage)
              ? 'Yep. I can make that change, but I will not update the game state until you confirm.'
              : 'I still have that change ready.'
          }
        );
        return { session: appendAssistant(nextSession, result), result };
      }

      if (interpretationService && shouldInterpretMessage(route)) {
        await interpretOnce();
        const interpretedCorrection = adaptedInterpretation?.correction || proposedConversationCorrection(aiConversation);
        if (interpretedCorrection) {
          const correction = {
            ...interpretedCorrection,
            type: 'correction_confirmation', status: 'awaiting_confirmation',
            previousValue: fieldValue(state, interpretedCorrection.field),
            proposedValue: interpretedCorrection.message || interpretedCorrection.targetName,
            cards: adaptedInterpretation?.cards || [],
            provenance: { answerId, message: cleanMessage },
            collectorContext: pendingCollectorContext(nextSession)
          };
          const result = resultWithNaturalReply(correctionPromptResult(correction, state), aiConversation, { appendPrompt: false });
          nextSession = {
            ...nextSession,
            stageBeforeCorrection: nextSession.stage,
            stage: 'confirming-correction',
            pendingCorrection: correction,
            magicState: state
          };
          return { session: appendAssistant(nextSession, result), result };
        }
        if (aiConversation?.intent === 'state_statement' && adaptedInterpretation?.safeToApply) {
          state = adaptedInterpretation.state;
        }
      }

      const offlineCorrectionFallback = !interpretationService
        && /\b(?:i meant|actually|scratch that|correction|change my answer)\b/i.test(cleanMessage);
      if (route === INSTAJUDGE_MESSAGE_ROUTES.CORRECTION || offlineCorrectionFallback) {
        const field = correctionFieldFromMessage(cleanMessage);
        const pending = {
          type: 'correction_confirmation', status: 'awaiting_value', field,
          previousValue: field ? fieldValue(state, field) : null,
          proposedValue: null,
          provenance: { answerId, message: cleanMessage },
          collectorContext: pendingCollectorContext(nextSession)
        };
        const result = correctionPromptResult(pending, state);
        nextSession = {
          ...nextSession,
          stageBeforeCorrection: nextSession.stage,
          stage: 'confirming-correction',
          pendingCorrection: pending,
          magicState: state,
          pendingStateKey: nextSession.pendingStateKey
        };
        return { session: appendAssistant(nextSession, result), result };
      }

      const aiRequestedRules = aiConversation?.intent === 'rules_question'
        || aiConversation?.rulesRequest?.operation === 'evaluate_magic_question';

      if (route === INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION
        && interpretationService
        && !aiRequestedRules
        && aiConversation?.intent !== 'state_statement'
        && ['intent', 'collecting', 'editing', 'clarifying', 'verifying', 'questioning'].includes(nextSession.stage)) {
        if (nextSession.stage === 'intent') {
          const opening = intentResult();
          const result = resultWithNaturalReply(opening, aiConversation, {
            appendPrompt: false,
            fallback: interruptionCopy(cleanMessage, null)
          });
          return { session: appendAssistant(nextSession, result), result: { ...result, route } };
        }
        const guided = activeInteractionResult(nextSession);
        const statePrompt = nextMagicStatePrompt(state);
        const prompt = statePrompt || (guided ? {
          key: guided.stateKey,
          text: guided.answer,
          choices: guided.choices
        } : null);
        const base = conversationResult({
          answer: prompt?.text || '',
          kind: 'conversation-interruption',
          choices: prompt?.choices || [],
          state,
          stateKey: prompt?.key || null,
          interactionField: prompt?.key || null
        });
        const result = resultWithNaturalReply(base, aiConversation, {
          appendPrompt: false,
          fallback: interruptionCopy(cleanMessage, prompt)
        });
        return { session: appendAssistant(nextSession, result), result: { ...result, route } };
      }

      if (aiRequestedRules && interpretationService
        && ['intent', 'collecting', 'editing', 'clarifying', 'verifying', 'questioning'].includes(nextSession.stage)) {
        const guided = activeInteractionResult(nextSession);
        const statePrompt = nextMagicStatePrompt(state);
        const prompt = statePrompt || (guided ? {
          key: guided.stateKey,
          text: guided.answer,
          choices: guided.choices
        } : null);
        const rulesRequest = aiConversation?.rulesRequest || {
          operation: 'evaluate_magic_question',
          question: cleanMessage
        };
        const magicCards = dedupeCards([...cards, ...interpretedCards, ...state.cards]).slice(0, 12);
        const canEvaluate = getMissingRequiredMagicState(state).length === 0;
        let result;
        if (canEvaluate && rulesRequest.operation === 'evaluate_magic_question') {
          const rules = retrieveRules(game, rulesRequest.question, knowledge);
          const engineResult = engineGateway.evaluateMagicQuestion({
            game,
            message: rulesRequest.question,
            cards: magicCards,
            rules,
            verifiedState: { ...state, cards: magicCards },
            latencyMs: Math.round(nowMs() - startedAt)
          }).result;
          const base = { ...engineResult, ...conversationResult({
            answer: engineResult.answer,
            kind: 'conversation-rules-result',
            choices: prompt?.choices || [],
            state,
            cards: magicCards,
            rules,
            diagnosticTrace: engineResult.diagnosticTrace || [],
            stateKey: prompt?.key || null,
            interactionField: prompt?.key || null
          }) };
          result = resultWithNaturalReply(base, aiConversation, { appendPrompt: true });
          nextSession = { ...nextSession, lastRuling: engineResult, pendingRulesRequest: null };
        } else {
          const base = conversationResult({
            answer: `I need to finish the current game state first. ${prompt?.text || ''}`.trim(),
            kind: 'conversation-interruption', choices: prompt?.choices || [], state,
            stateKey: prompt?.key || null,
            interactionField: prompt?.key || null
          });
          result = resultWithNaturalReply(base, aiConversation, { appendPrompt: true });
          nextSession = { ...nextSession, pendingRulesRequest: rulesRequest };
        }
        nextSession = {
          ...nextSession,
          stage: nextSession.stage === 'intent' ? 'collecting' : nextSession.stage,
          helpIntent: nextSession.helpIntent || 'rules_question',
          pendingQuestion: cleanMessage,
          pendingStateKey: prompt?.key || nextSession.pendingStateKey
        };
        return { session: appendAssistant(nextSession, result), result };
      }

      if (route === INSTAJUDGE_MESSAGE_ROUTES.CASUAL_CONVERSATION) {
        const acknowledgement = /make(?:s)? sense/i.test(cleanMessage) ? 'Glad that cleared it up.' : "No problem - that's what I'm here for.";
        const verification = nextSession.stage === 'verifying' ? verificationResult(state) : null;
        const result = verification
          ? resultWithNaturalReply({ ...verification, kind: 'casual' }, aiConversation, { appendPrompt: true, fallback: acknowledgement })
          : conversationResult({ answer: conversationalLead(aiConversation, acknowledgement), kind: 'casual', state });
        return { session: appendAssistant(nextSession, result), result: { ...result, route } };
      }

      if (route === INSTAJUDGE_MESSAGE_ROUTES.FREEFORM_STATE && interpretationService && !adaptedInterpretation?.safeToApply) {
        const prompt = nextSession.stage === 'intent' ? null : nextMagicStatePrompt(state);
        const base = nextSession.stage === 'intent'
          ? intentResult()
          : conversationResult({
            answer: prompt?.text || '',
            kind: 'conversation-interruption', choices: prompt?.choices || [], state,
            stateKey: prompt?.key || null,
            interactionField: prompt?.key || null,
            inputRepairEligible: !cleanText(aiConversation?.reply)
          });
        const result = resultWithNaturalReply(base, aiConversation, {
          appendPrompt: Boolean(prompt),
          fallback: nextSession.stage === 'intent' ? '' : "I couldn't safely map that to the current game state."
        });
        return { session: appendAssistant(nextSession, result), result };
      }
      const magicCards = dedupeCards([...cards, ...interpretedCards]);

      if (nextSession.stage === 'intent') {
        const intent = resolveMagicHelpIntent(cleanMessage);
        const explicitIntentChoice = Boolean(matchingMagicHelpIntent(cleanMessage));
        if (!explicitIntentChoice && !adaptedInterpretation?.safeToApply) {
          state = collectMagicConversationState(state, cleanMessage, magicCards);
        }
        const prompt = nextMagicStatePrompt(state);
        const acknowledgement = conversationResult({
          answer: 'Got it. Before I rule on it, I need a few details about the current game state.',
          kind: 'intent-acknowledgement'
        });
        const pendingQuestion = looksLikeQuestion(cleanMessage) && !explicitIntentChoice ? cleanMessage : null;
        const result = prompt ? promptResult(prompt, state) : verificationResult(state);
        nextSession = prompt ? {
          ...nextSession, stage: 'collecting', helpIntent: intent.value, magicState: state,
          pendingQuestion, pendingStateKey: prompt.key, verifiedState: false, resolvedCards: state.cards
        } : {
          ...nextSession, stage: 'verifying', helpIntent: intent.value, magicState: state,
          pendingQuestion, pendingStateKey: null, verifiedState: false, resolvedCards: state.cards
        };
        return {
          session: appendAssistants(nextSession, [acknowledgement, result]),
          result: { ...result, leadIn: acknowledgement }
        };
      }

      if (['collecting', 'editing'].includes(nextSession.stage)) {
        const messageIsQuestion = looksLikeQuestion(cleanMessage);
        const collectingParticipant = ['combat-attackers', 'combat-blockers'].includes(nextSession.pendingStateKey);
        if (route === INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED || (!interpretationService && !adaptedInterpretation)) {
          state = collectMagicConversationState(state, cleanMessage, collectingParticipant && messageIsQuestion ? [] : magicCards, nextSession.pendingStateKey);
        }
        const pendingQuestion = messageIsQuestion ? cleanMessage : nextSession.pendingQuestion;
        const missingRequiredState = getMissingRequiredMagicState(state);
        const prompt = nextMagicStatePrompt(state);
        let result;
        if (missingRequiredState.length > 0) {
          if (!prompt) throw new Error(`Missing Magic state has no collector prompt: ${missingRequiredState[0]}`);
          result = promptResult(prompt, state);
          if (route === INSTAJUDGE_MESSAGE_ROUTES.FREEFORM_STATE) {
            result = { ...result, inputRepairEligible: true };
          }
          nextSession = { ...nextSession, stage: 'collecting', magicState: state, pendingQuestion, pendingStateKey: prompt.key, verifiedState: false, resolvedCards: state.cards };
        } else {
          result = verificationResult(state);
          nextSession = { ...nextSession, stage: 'verifying', magicState: state, pendingQuestion, pendingStateKey: null, verifiedState: false, resolvedCards: state.cards };
        }
        return { session: appendAssistant(nextSession, result), result };
      }

      if (nextSession.stage === 'verifying') {
        const normalized = normalizeJudgeText(cleanMessage);
        if (/\bedit state\b|\b(?:change|correct|edit)\b/.test(normalized)) {
          const result = conversationResult({ answer: 'Tell me what needs to change. You can provide several corrections in one message.', kind: 'state-edit', state, choices: [] });
          nextSession = { ...nextSession, stage: 'editing', verifiedState: false };
          return { session: appendAssistant(nextSession, result), result };
        }
        if (/\blooks right\b|\b(?:confirm|confirmed|correct|yes)\b/.test(normalized)) {
          const missingRequiredState = getMissingRequiredMagicState(state);
          if (missingRequiredState.length > 0) {
            const prompt = nextMagicStatePrompt(state);
            const result = promptResult(prompt, state);
            nextSession = { ...nextSession, stage: 'collecting', pendingStateKey: prompt.key, verifiedState: false };
            return { session: appendAssistant(nextSession, result), result };
          }
          if (nextSession.pendingRulesRequest?.operation === 'evaluate_magic_question') {
            const rulesQuestion = nextSession.pendingRulesRequest.question;
            const rulingCards = dedupeCards([...state.cards, ...cards, ...interpretedCards]).slice(0, 12);
            const rules = retrieveRules(game, rulesQuestion, knowledge);
            const result = engineGateway.evaluateMagicQuestion({
              game,
              message: rulesQuestion,
              cards: rulingCards,
              rules,
              verifiedState: { ...state, cards: rulingCards },
              latencyMs: Math.round(nowMs() - startedAt)
            }).result;
            nextSession = {
              ...nextSession,
              stage: 'questioning',
              verifiedState: true,
              pendingQuestion: null,
              pendingRulesRequest: null,
              resolvedCards: rulingCards,
              lastRuling: result
            };
            return { session: appendAssistant(nextSession, result), result };
          }
          const result = conversationResult({ answer: 'Got it. What do you want me to rule on?', kind: 'ruling-question', state });
          nextSession = { ...nextSession, stage: 'questioning', verifiedState: true };
          return { session: appendAssistant(nextSession, result), result };
        }
        if (route === INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED || (!interpretationService && !adaptedInterpretation)) {
          state = collectMagicConversationState(state, cleanMessage, magicCards);
        }
        const result = verificationResult(state);
        nextSession = { ...nextSession, magicState: state, resolvedCards: state.cards };
        return { session: appendAssistant(nextSession, result), result };
      }

      let rulingQuestion = cleanMessage;
      if (nextSession.stage === 'clarifying' && nextSession.pendingQuestion) {
        if (route === INSTAJUDGE_MESSAGE_ROUTES.MANUAL_STRUCTURED || (!interpretationService && !adaptedInterpretation)) {
          state = collectMagicConversationState(state, cleanMessage, magicCards);
        }
        rulingQuestion = nextSession.pendingQuestion;
      }
      const rulingCards = dedupeCards([...state.cards, ...magicCards]).slice(0, 12);
      state = { ...state, cards: rulingCards };
      const rules = retrieveRules(game, rulingQuestion, knowledge);
      let result;
      if (isLegalityQuestion(rulingQuestion)) {
        const format = detectLegalityFormat(rulingQuestion);
        const card = rulingCards[0];
        let legality = null;
        if (card) {
          try {
            const legalityService = await loadLegalityOwner();
            legality = legalityService.check({ game: game.id, canonicalCardId: canonicalCardId(card), printingId: card.id, format }, { card: { ...card.raw, ...card }, metadata: legalityMetadata(game) });
          } catch (error) {
            legality = { status: 'unknown', format, reason: error.message };
          }
        }
        result = card ? buildLegalityRuling({ game, card, legality, rules, latencyMs: Math.round(nowMs() - startedAt) })
          : conversationResult({ answer: 'Which exact card do you want checked?', kind: 'clarification', state, clarificationNeeded: 'Provide the exact card name.' });
      } else {
        result = engineGateway.evaluateMagicQuestion({ game, message: rulingQuestion, cards: rulingCards, rules, verifiedState: state, latencyMs: Math.round(nowMs() - startedAt) }).result;
      }

      if (result.verdict === 'depends' && result.clarificationNeeded) {
        const priorityMissing = /priority/i.test(result.clarificationNeeded);
        if (priorityMissing) state = { ...state, priorityHolder: null, priorityKnown: false };
        const clarificationPrompt = priorityMissing
          ? { key: 'priority', text: 'Who currently has priority?', choices: ['Me', 'Opponent', 'Not sure'] }
          : { text: result.clarificationNeeded, choices: [] };
        const clarification = { ...conversationResult({
          answer: clarificationPrompt.text, kind: 'clarification', choices: clarificationPrompt.choices,
          state, cards: rulingCards, rules, clarificationNeeded: result.clarificationNeeded,
          diagnosticTrace: result.diagnosticTrace || []
        }), stateKey: clarificationPrompt.key || null };
        nextSession = { ...nextSession, stage: 'clarifying', magicState: state, pendingQuestion: rulingQuestion, verifiedState: true, resolvedCards: rulingCards, lastRuling: null };
        return { session: appendAssistant(nextSession, clarification), result: clarification };
      }

      nextSession = { ...nextSession, stage: 'questioning', magicState: state, pendingQuestion: null, verifiedState: true, resolvedCards: rulingCards, lastRuling: result };
      return { session: appendAssistant(nextSession, result), result };
    }

    const rules = retrieveRules(game, cleanMessage, knowledge);

    let result;
    if (isLegalityQuestion(cleanMessage)) {
      const format = detectLegalityFormat(cleanMessage);
      const card = cards[0];
      if (!card) {
        result = {
          game: game.id,
          verdict: 'unverified',
          answer: "I can't verify legality until I can resolve the card identity from the catalog.",
          cards: [],
          rules,
          clarificationNeeded: 'Please provide the exact card name.',
          latencyMs: Math.round(nowMs() - startedAt)
        };
      } else {
        let legality;
        try {
          const legalityOwner = await loadLegalityOwner();
          legality = legalityOwner.check({
            game: game.id,
            canonicalCardId: canonicalCardId(card),
            printingId: card.id,
            format
          }, {
            card: { ...card.raw, ...card },
            metadata: legalityMetadata(game)
          });
        } catch (error) {
          legality = { status: 'unknown', format, reason: error.message };
        }
        result = buildLegalityRuling({ game, card, legality, rules, latencyMs: Math.round(nowMs() - startedAt) });
      }
    } else {
      result = buildRulesRuling({ game, message: cleanMessage, cards, rules, latencyMs: Math.round(nowMs() - startedAt) });
    }

    return {
      session: updatedSession({ ...session, game: game.id }, result),
      result
    };
    };
    const validateResponse = (response) => {
      const finalized = {
        ...response,
        session: withAuthoritativeInteraction(response.session, response.result)
      };
      assertInstaJudgeInteractionInvariant(finalized.session, finalized.result);
      return finalized;
    };
    if (!requestKey) return validateResponse(await execute());
    const pending = execute().then(validateResponse);
    requestCache.set(requestKey, pending);
    try {
      const response = await pending;
      requestCache.set(requestKey, Promise.resolve(response));
      if (requestCache.size > 200) requestCache.delete(requestCache.keys().next().value);
      return response;
    } catch (error) {
      requestCache.delete(requestKey);
      throw error;
    }
  }
  };
}

export const instaJudgeOwner = createInstaJudgeOwner({ interpretationService: instaJudgeInterpretationClient });

export default instaJudgeOwner;
