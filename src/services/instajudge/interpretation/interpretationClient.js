import { parseInstaJudgeConversation } from './conversationContract.js';

const DEFAULT_ENDPOINT = 'https://api.mainphasemarket.net/api/instajudge/interpret';
const REQUEST_TIMEOUT_MS = 20_000;
const LOCAL_DEVELOPMENT_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function endpoint() {
  return import.meta.env?.VITE_INSTAJUDGE_INTERPRET_API_URL || DEFAULT_ENDPOINT;
}

export function allowsLiveAiFromClient({
  hostname = globalThis.location?.hostname || '',
  explicitOptIn = import.meta.env?.VITE_INSTAJUDGE_ALLOW_LIVE_AI
} = {}) {
  if (!LOCAL_DEVELOPMENT_HOSTS.has(String(hostname).toLowerCase())) return true;
  return String(explicitOptIn || '').toLowerCase() === 'true';
}

function boundedContext(conversation = []) {
  return conversation.slice(-6).map((entry) => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    text: String(entry.text || '').slice(0, 500)
  }));
}

function boundedState(state = {}) {
  const battlefield = (state.battlefield || []).slice(0, 12).map((item) => ({
    id: String(item.id || '').slice(0, 80),
    name: String(item.card?.name || item.name || '').slice(0, 160),
    controller: item.controller || null,
    role: item.role || null
  }));
  const battlefieldById = new Map(battlefield.map((item) => [item.id, item]));
  return {
    turn: state.activePlayer || null,
    phase: state.phase || null,
    step: state.step || null,
    priorityHolder: state.priorityKnown ? state.priorityHolder : null,
    stack: {
      known: Boolean(state.stack?.known),
      empty: state.stack?.known ? state.stack.empty : null,
      items: (state.stack?.items || []).slice(0, 8).map((item) => ({ name: item.name, controller: item.controller, targets: (item.targets || []).slice(0, 4).map((target) => target.descriptor) }))
    },
    combat: {
      active: Boolean(state.combat?.active),
      window: state.combat?.window || null,
      attackersKnown: Boolean(state.combat?.attackersKnown),
      blockersKnown: Boolean(state.combat?.blockersKnown),
      attackers: (state.combat?.attackers || []).slice(0, 12).map((item) => ({
        objectId: item.objectId || null,
        name: battlefieldById.get(item.objectId)?.name || null,
        controller: battlefieldById.get(item.objectId)?.controller || null,
        attackTarget: item.attackTarget || null
      })),
      blocks: (state.combat?.blocks || []).slice(0, 12).map((item) => ({
        attackerId: item.attackerId || null,
        attackerName: battlefieldById.get(item.attackerId)?.name || null,
        blockerIds: (item.blockerIds || []).slice(0, 8),
        blockerNames: (item.blockerIds || []).slice(0, 8).map((id) => battlefieldById.get(id)?.name || null)
      }))
    },
    battlefield,
    cards: (state.cards || []).slice(0, 12).map((card) => ({
      id: String(card.id || card.oracle_id || '').slice(0, 100),
      name: String(card.name || '').slice(0, 160)
    }))
  };
}

function boundedInteraction(interaction = {}) {
  return {
    mode: String(interaction.mode || '').slice(0, 64) || null,
    activeCollector: interaction.activeCollector ? {
      stage: String(interaction.activeCollector.stage || '').slice(0, 64) || null,
      key: String(interaction.activeCollector.key || '').slice(0, 64) || null,
      prompt: String(interaction.activeCollector.prompt || '').slice(0, 500) || null,
      choices: (interaction.activeCollector.choices || []).slice(0, 12).map((choice) => String(choice).slice(0, 120))
    } : null,
    suspendedCollector: interaction.suspendedCollector ? {
      stage: String(interaction.suspendedCollector.stage || '').slice(0, 64) || null,
      key: String(interaction.suspendedCollector.key || '').slice(0, 64) || null,
      prompt: String(interaction.suspendedCollector.prompt || '').slice(0, 500) || null
    } : null,
    pendingCorrection: interaction.pendingCorrection ? {
      field: String(interaction.pendingCorrection.field || '').slice(0, 64) || null,
      status: String(interaction.pendingCorrection.status || '').slice(0, 64) || null,
      previousValue: interaction.pendingCorrection.previousValue ?? null,
      proposedValue: interaction.pendingCorrection.proposedValue ?? null,
      label: String(interaction.pendingCorrection.label || '').slice(0, 240) || null
    } : null,
    pendingClarification: interaction.pendingClarification ? String(interaction.pendingClarification).slice(0, 500) : null,
    pendingRulesRequest: interaction.pendingRulesRequest ? {
      operation: String(interaction.pendingRulesRequest.operation || '').slice(0, 64),
      question: String(interaction.pendingRulesRequest.question || '').slice(0, 1_000)
    } : null,
    visiblePromptField: String(interaction.visiblePromptField || '').slice(0, 64) || null,
    quickReplyField: String(interaction.quickReplyField || '').slice(0, 64) || null
  };
}

export async function interpretInstaJudgeMessage({ game, message, state, pendingQuestion, pendingStateKey, conversation, interaction, judge, fetchImpl = fetch }) {
  if (!allowsLiveAiFromClient()) throw new Error('Live Workers AI blocked by development safety gate');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        game,
        message: String(message || '').slice(0, 4_000),
        knownState: boundedState(state),
        pendingQuestion: pendingStateKey ? { key: pendingStateKey, text: String(pendingQuestion || '').slice(0, 500) } : null,
        recentContext: boundedContext(conversation),
        interaction: boundedInteraction(interaction),
        judge: {
          id: String(judge?.id || '').slice(0, 64) || null,
          name: String(judge?.displayName || judge?.name || 'InstaJudge').slice(0, 120),
          tone: String(judge?.tone || 'clear, patient, concise').slice(0, 240)
        }
      })
    });
    if (!response.ok) throw new Error(`Interpreter request failed (${response.status}).`);
    const payload = await response.json();
    return parseInstaJudgeConversation(payload?.conversation || payload?.data?.conversation || payload?.interpretation || payload?.data?.interpretation || payload);
  } finally {
    clearTimeout(timeout);
  }
}

export const instaJudgeInterpretationClient = Object.freeze({ interpret: interpretInstaJudgeMessage });
