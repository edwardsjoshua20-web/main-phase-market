import {
  INSTAJUDGE_CONVERSATION_JSON_SCHEMA,
  parseInstaJudgeConversation
} from '../src/services/instajudge/interpretation/conversationContract.js';

export const DEFAULT_INSTAJUDGE_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const REQUEST_LIMIT_BYTES = 24 * 1024;
const TIMEOUT_MS = 20_000;
const ALLOWED_ORIGINS = new Set(['https://www.mainphasemarket.net', 'https://mainphasemarket.net', 'http://127.0.0.1:4173', 'http://localhost:4173', 'http://127.0.0.1:5173', 'http://localhost:5173']);
const localRateLimits = new Map();

const SYSTEM_PROMPT = `You are the conversational layer for InstaJudge, a guided Magic: The Gathering judge assistant.
You are not a judge or rules engine authority; you speak in the assigned judge's voice while deterministic systems own facts and rulings.
Return only the requested JSON object.

AUTHORITY BOUNDARY
- You own the visible conversational reply whenever the player leaves the guided choices. Speak naturally as the assigned judge, using the supplied name and tone.
- You may answer social questions, joke lightly, acknowledge frustration, explain why a guided detail is needed, ask a concise follow-up, and resolve references such as "that", "it", "this", and "the other one" from recentContext.
- You may not mutate canonical state. proposedActions are untrusted proposals that a deterministic validator may reject.
- You may not answer legality, damage, winners, outcomes, or rules questions from your own knowledge. For a rules question, populate rulesRequest so the deterministic engine can answer it.
- Never claim a proposed correction has already happened. If confirmation is pending, preserve it.
- reply is the actual player-facing conversational text. Keep it clear, patient, concise, human, and in the assigned judge's tone. Do not use machine-facing phrases such as "intent recognized" or "proposal generated".
- The guided collector remains authoritative and its buttons stay visible in the application. During ordinary side conversation, leave it silently pending. Do not mention, restate, or steer back to it unless the player explicitly asks to resume or their message directly resolves the pending field.

CONVERSATION ROUTING
- conversational: a meta question or ordinary side conversation.
- correction: the player revises state or asks to change an earlier answer. Include a propose_correction action and semantic correction evidence.
- state_statement: new game-state information.
- rules_question: request a deterministic evaluate_magic_question rulesRequest using the player's actual question.
- clarification: the player asks what a term or question means.
- cancellation: cancel the pending correction only when context shows one exists; include cancel_pending_correction.
- social: thanks or other social acknowledgement with no state mutation.
- confirmation: conversational confirmation of the pending correction; include confirm_pending_correction.
- unknown: unsafe or unclear intent.

NATURAL CONVERSATION
- A social question such as "how are you today" is social or conversational, never a rules_question.
- A playful complaint such as "wow won't talk to me huh?" should receive a light, direct acknowledgement rather than a collector error.
- Frustration or off-topic remarks may continue for multiple turns. Acknowledge each turn naturally without changing state or forcing the player back into form-like wording.
- If the player asks why a detail is needed, explain it in ordinary language and preserve the collector.
- If a correction is proposed, ask for confirmation naturally and include propose_correction. Do not apply it yourself.
- Do not default to canned service language such as "I'm here to help", "as soon as we get through these details", or "to better assist you". Respond to what the player actually said.
- Do not mention the guided question during an ongoing social or conversational exchange. The application keeps the pending quick replies available separately, and the player can resume at any time by clicking one.
- Example: for "wow won't talk to me huh?", a good reply is "Ha, I'm here. I was trying not to lose track of your game state. What's up?"
- Example: for "this game is pissing me off", acknowledge the frustration first; do not answer with a phase-selection instruction.

CONVERSATION CONTROL
- continue_conversation: continue the natural side conversation while preserving the exact collector and its buttons silently in the background. This is the default for social remarks, banter, frustration, and conversational follow-ups.
- hold_collector: preserve the exact collector silently while answering a clarification or meta question that does not yet resume it.
- suspend_for_correction: preserve the exact collector while a proposed correction is validated and confirmed.
- suspend_for_rules: preserve the exact collector while a rules request is delegated to the deterministic engine.
- resume_collector: the player explicitly resumes the guided flow, or a correction/rules detour is complete and the response should return to it.
- continue_collector, suspend_collector: legacy compatibility values only. Do not emit them for new responses.
- ask_clarification: more information is needed before any proposal can be validated.
- preserve_pending_correction: converse without replacing or applying the existing pending correction.
- complete: no guided continuation is needed.

STRICT EVIDENCE RULES
- Extract only information explicitly stated in the current player message. knownState and recentContext are context for references and corrections; do not copy them into the output as new facts.
- Every unstated scalar fact must be literal JSON null, never the strings "null", "unknown", "none", or an invented default.
- Every unstated collection must be an empty array. Never create placeholder objects or stack items.
- A cast, attack, block, or response does not establish turn, phase, step, or priority. Do not infer those facts from normal game procedure.
- "active player" establishes turn only; it does not establish priority. Attacking does not establish whose turn it is.
- Set stackEmpty=false only when the message explicitly says a spell/ability is currently cast, played in response, or on the stack. Set stackEmpty=true only when the message explicitly says the stack is empty.
- Temporal or combat wording never establishes stackEmpty. Upkeep, draw, combat steps, attacks, blocks, and damage do not imply an empty stack.
- Preserve every card-name span exactly as typed, including spelling and capitalization. Never silently repair, expand, or canonicalize a card name.
- Use user for the speaker and opponent for the other player. Use null when the controller/actor is not stated.
- An unstated actor/controller may remain null without ambiguity when the named action, stack order, or combat relationship is otherwise complete and controller identity is not needed to represent it.

SEMANTIC INTERPRETATION
- state_update: explicit facts, objects, actions, stack, or combat relationships in an ordinary statement.
- clarification_answer: a direct answer to pendingQuestion that is not correcting previously supplied state.
- correction: only when correction language such as "I meant", "actually", "no", "scratch that", "correction", "misspoke", or "change that" revises knownState or the pending answer. Ordinary new facts are never corrections. correction must be null unless interpretationType is correction.
- question: the message asks for a ruling or outcome. Extract only explicitly proposed actions or named objects; do not place a merely proposed spell on the stack and do not answer the question.
- unknown: the message is too incomplete to establish a safe update. Add a concise ambiguity for each missing relationship.

CANONICAL FACT VALUES
- turn: user | opponent | null
- phase: beginning | precombat-main | combat | postcombat-main | ending | null
- step: upkeep | draw | beginning-of-combat | declare-attackers | declare-blockers | first-strike-combat-damage | combat-damage | end-of-combat | end-step | null
- priorityHolder: user | opponent | null

STRUCTURES
- actions are chronological, sequence 1 first. responseToSequence points to the earlier action being answered.
- stack is top to bottom, position 1 top. responseToPosition points to the lower stack item being answered, so it must be greater than the responder's position.
- Read explicit order language semantically: "bottom to top A, B, C" means C/B/A top-to-bottom; "A then B then C on top" means C/B/A; "top to bottom A, B, C" remains A/B/C.
- Only spells and activated/triggered abilities belong on the stack. Attacking and blocking never create stack items.
- sourceText and targetText contain only the named source/card/object, not prose such as "cast", "attacks", or "block with".
- Combat blockers must identify blockedAttackerText when stated. Keep separate same-name combat objects separate.
- Generic phrases such as "a spell", "it", "something", or an unidentified creature require an ambiguity when identity or relationship matters.
- Simple canonical facts such as "It's upkeep" do not require unrelated actor, turn, priority, or stack ambiguities.
- "Before blockers" and "after attackers" normalize to declare-attackers with combat context. "After blockers" normalizes to declare-blockers. Never invent an "after blockers" step.
- If correction language names a canonical field, correction.field must name that field rather than pendingQuestion. Examples: "I meant declare blockers" corrects step; "priority is mine" corrects priority.

EXAMPLES
1. "It's my turn."
facts.turn=user; every other fact=null; all arrays empty; correction=null.
2. "I cast Divination, he responds with Negate, then I Cancel his Negate."
facts.stackEmpty=false and all other facts=null. Actions: Divination by user; Negate by opponent responding to action 1; Cancel by user responding to action 2. Stack top-to-bottom: Cancel position 1 responding to position 2; Negate position 2 responding to position 3; Divination position 3 with null response. correction=null.
3. Known stack is nonempty and pendingQuestion asks what is on it. Current message: "I meant empty."
interpretationType=correction; facts.stackEmpty=true; stack=[]; correction field=stack, previous value=not empty, proposed value=empty.
4. "My opponent casts Murdar targeting my Grizzly Bears."
Preserve sourceText exactly as "Murdar" and targetText exactly as "Grizzly Bears". Never output Murder.
5. "Can I cast Bolt here?"
intent=rules_question; rulesRequest.operation=evaluate_magic_question; rulesRequest.question preserves the question. interpretationType=question. Do not put Bolt on the stack, do not set stackEmpty, and do not answer legality.
6. A turn correction is pending and the player asks "Are you able to fix it for me?"
intent=conversational; reply acknowledges that the change can be made after confirmation; proposedActions=[]; conversationControl=preserve_pending_correction. Do not parse this as a phase answer.
7. A turn correction is pending and the player says "Yes, do it."
intent=confirmation; proposedActions contains confirm_pending_correction; conversationControl=resume_collector. Do not claim the state changed in reply.
8. The phase collector is active and the player asks "Why do you need that?"
intent=clarification; reply explains that timing depends on phase/step; proposedActions=[]; conversationControl=hold_collector. Do not restate the pending collector question.
9. A collector is active and the player says "Thanks judge."
intent=social; reply is a brief, direct human acknowledgement such as "Anytime." or "You got it."; proposedActions=[]; conversationControl=continue_conversation. Do not say "I'm here to help", "to better assist you", or restate the collector question. The existing buttons remain available without mentioning them.
10. The phase collector is active and the player says "wow won't talk to me huh?"
intent=conversational; reply acknowledges the player directly and lightly, such as "Ha, I'm here. What's up?"; proposedActions=[]; conversationControl=continue_conversation. Do not answer with service-script language and do not mention the pending collector.
11. The turn collector is active. Recent conversation is: player "rough day for you?", judge replies naturally, player "yeah you are already annoying me", judge replies naturally, player "this judge is dumb", judge replies naturally, player "fair enough".
Each response uses intent=conversational or social, proposedActions=[], conversationControl=continue_conversation. Never repeat "Whose turn is it?", mention the buttons, or mutate turn. The player may click Mine afterward to resume the collector.`;

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return origin && ALLOWED_ORIGINS.has(origin) ? { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', vary: 'Origin' } : {};
}

function response(request, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(request) } });
}

function text(value, max) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }

function sanitizedInteraction(raw = {}) {
  const active = raw.activeCollector && typeof raw.activeCollector === 'object' ? raw.activeCollector : null;
  const suspended = raw.suspendedCollector && typeof raw.suspendedCollector === 'object' ? raw.suspendedCollector : null;
  const correction = raw.pendingCorrection && typeof raw.pendingCorrection === 'object' ? raw.pendingCorrection : null;
  const rulesRequest = raw.pendingRulesRequest && typeof raw.pendingRulesRequest === 'object' ? raw.pendingRulesRequest : null;
  const collector = (value) => value ? {
    stage: text(value.stage, 64) || null,
    key: text(value.key, 64) || null,
    prompt: text(value.prompt, 500) || null,
    choices: Array.isArray(value.choices) ? value.choices.slice(0, 12).map((choice) => text(choice, 120)).filter(Boolean) : []
  } : null;
  return {
    mode: text(raw.mode, 64) || null,
    activeCollector: collector(active),
    suspendedCollector: collector(suspended),
    pendingCorrection: correction ? {
      field: text(correction.field, 64) || null,
      status: text(correction.status, 64) || null,
      previousValue: text(String(correction.previousValue ?? ''), 240) || null,
      proposedValue: text(String(correction.proposedValue ?? ''), 240) || null,
      label: text(correction.label, 240) || null
    } : null,
    pendingClarification: text(raw.pendingClarification, 500) || null,
    pendingRulesRequest: rulesRequest ? {
      operation: text(rulesRequest.operation, 64),
      question: text(rulesRequest.question, 1_000)
    } : null,
    visiblePromptField: text(raw.visiblePromptField, 64) || null,
    quickReplyField: text(raw.quickReplyField, 64) || null
  };
}

const LOCAL_DEVELOPMENT_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

function requestComesFromLocalDevelopment(request) {
  const requestHost = new URL(request.url).hostname;
  let originHost = '';
  try {
    originHost = request.headers.get('origin') ? new URL(request.headers.get('origin')).hostname : '';
  } catch {
    originHost = '';
  }
  return LOCAL_DEVELOPMENT_HOSTS.has(requestHost) || LOCAL_DEVELOPMENT_HOSTS.has(originHost);
}

export function allowsLiveWorkersAi(request, env = {}) {
  const setting = text(env.INSTAJUDGE_ALLOW_LIVE_AI, 16).toLowerCase();
  if (setting === 'false') return false;
  if (requestComesFromLocalDevelopment(request)) return setting === 'true';
  return true;
}

function sanitizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('A JSON object is required.');
  const game = text(raw.game, 32);
  const message = text(raw.message, 4_000);
  if (game !== 'magic') throw new Error('AI-1 currently supports Magic only.');
  if (!message) throw new Error('message is required.');
  const known = raw.knownState && typeof raw.knownState === 'object' ? raw.knownState : {};
  const stack = known.stack && typeof known.stack === 'object' ? known.stack : {};
  const combat = known.combat && typeof known.combat === 'object' ? known.combat : {};
  const battlefield = Array.isArray(known.battlefield) ? known.battlefield : [];
  const cards = Array.isArray(known.cards) ? known.cards : [];
  return {
    game, message,
    knownState: {
      turn: text(known.turn, 32) || null, phase: text(known.phase, 64) || null, step: text(known.step, 64) || null,
      priorityHolder: text(known.priorityHolder, 32) || null,
      stack: { known: Boolean(stack.known), empty: typeof stack.empty === 'boolean' ? stack.empty : null, items: Array.isArray(stack.items) ? stack.items.slice(0, 8).map((item) => ({ name: text(item?.name, 160), controller: text(item?.controller, 32) || null, targets: Array.isArray(item?.targets) ? item.targets.slice(0, 4).map((target) => text(target, 160)) : [] })) : [] },
      combat: {
        active: Boolean(combat.active), window: text(combat.window, 64) || null,
        attackersKnown: Boolean(combat.attackersKnown), blockersKnown: Boolean(combat.blockersKnown),
        attackers: Array.isArray(combat.attackers) ? combat.attackers.slice(0, 12).map((item) => ({
          objectId: text(item?.objectId, 80) || null,
          name: text(item?.name, 160) || null,
          controller: text(item?.controller, 32) || null,
          attackTarget: text(item?.attackTarget, 80) || null
        })) : [],
        blocks: Array.isArray(combat.blocks) ? combat.blocks.slice(0, 12).map((item) => ({
          attackerId: text(item?.attackerId, 80) || null,
          attackerName: text(item?.attackerName, 160) || null,
          blockerIds: Array.isArray(item?.blockerIds) ? item.blockerIds.slice(0, 8).map((id) => text(id, 80)) : [],
          blockerNames: Array.isArray(item?.blockerNames) ? item.blockerNames.slice(0, 8).map((name) => text(name, 160)) : []
        })) : []
      },
      battlefield: battlefield.slice(0, 12).map((item) => ({
        id: text(item?.id, 80), name: text(item?.name, 160), controller: text(item?.controller, 32) || null, role: text(item?.role, 64) || null
      })),
      cards: cards.slice(0, 12).map((card) => ({ id: text(card?.id, 100), name: text(card?.name, 160) }))
    },
    pendingQuestion: raw.pendingQuestion && typeof raw.pendingQuestion === 'object' ? { key: text(raw.pendingQuestion.key, 64), text: text(raw.pendingQuestion.text, 500) } : null,
    recentContext: Array.isArray(raw.recentContext) ? raw.recentContext.slice(-6).map((entry) => ({ role: entry?.role === 'assistant' ? 'assistant' : 'user', text: text(entry?.text, 500) })) : [],
    interaction: sanitizedInteraction(raw.interaction && typeof raw.interaction === 'object' ? raw.interaction : {}),
    judge: raw.judge && typeof raw.judge === 'object' ? {
      id: text(raw.judge.id, 64) || null,
      name: text(raw.judge.name, 120) || 'InstaJudge',
      tone: text(raw.judge.tone, 240) || 'clear, patient, concise'
    } : { id: null, name: 'InstaJudge', tone: 'clear, patient, concise' }
  };
}

async function readBody(request) {
  if (Number(request.headers.get('content-length') || 0) > REQUEST_LIMIT_BYTES) throw new Error('Request body is too large.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > REQUEST_LIMIT_BYTES) throw new Error('Request body is too large.');
  try { return JSON.parse(raw); } catch { throw new Error('Request body must be valid JSON.'); }
}

async function allowedByRateLimit(request, env) {
  const key = request.headers.get('cf-connecting-ip') || 'local';
  if (env.INSTAJUDGE_RATE_LIMITER?.limit) return (await env.INSTAJUDGE_RATE_LIMITER.limit({ key })).success;
  const hostname = new URL(request.url).hostname;
  const hostHeader = request.headers.get('host')?.split(':')[0] || '';
  const isLocalEvaluation = env.INSTAJUDGE_EVALUATION_MODE === 'true'
    || [hostname, hostHeader, key].some((value) => ['127.0.0.1', 'localhost', '::1', 'local'].includes(value));
  const requestLimit = isLocalEvaluation ? 500 : 20;
  const now = Date.now();
  const current = localRateLimits.get(key);
  if (!current || now >= current.resetAt) { localRateLimits.set(key, { count: 1, resetAt: now + 60_000 }); return true; }
  current.count += 1;
  return current.count <= requestLimit;
}

function modelInput(input) {
  return {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: JSON.stringify(input) }],
    response_format: { type: 'json_schema', json_schema: INSTAJUDGE_CONVERSATION_JSON_SCHEMA },
    temperature: 0, max_tokens: 1_900
  };
}

export async function handleInstaJudgeInterpretation(request, env) {
  if (new URL(request.url).pathname !== '/api/instajudge/interpret') return null;
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') return response(request, { error: 'Method not allowed.' }, 405);
  const origin = request.headers.get('origin');
  if (origin && !ALLOWED_ORIGINS.has(origin)) return response(request, { error: 'Origin not allowed.' }, 403);
  if (!allowsLiveWorkersAi(request, env || {})) {
    console.warn('Live Workers AI blocked by development safety gate');
    return response(request, { error: 'Live Workers AI blocked by development safety gate' }, 503);
  }
  if (!await allowedByRateLimit(request, env)) return response(request, { error: 'Too many interpretation requests.' }, 429);
  if (!env.AI?.run) return response(request, { error: 'Interpreter unavailable.' }, 503);
  try {
    const input = sanitizeInput(await readBody(request));
    const model = text(env.INSTAJUDGE_AI_MODEL, 200) || DEFAULT_INSTAJUDGE_AI_MODEL;
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Interpreter timed out.')), TIMEOUT_MS));
    const output = await Promise.race([env.AI.run(model, modelInput(input)), timeout]);
    const conversation = parseInstaJudgeConversation(output?.response ?? output);
    return response(request, {
      conversation,
      interpretation: conversation.interpretation,
      model,
      schemaVersion: conversation.schemaVersion,
      usage: output?.usage || null
    });
  } catch (error) {
    console.error('InstaJudge interpretation failed:', error instanceof Error ? error.message : 'Unknown error');
    const status = /JSON object is required|Request body|message is required|too large|supports Magic/i.test(error.message) ? 400 : 502;
    return response(request, { error: status === 400 ? error.message : 'Interpreter unavailable.' }, status);
  }
}
