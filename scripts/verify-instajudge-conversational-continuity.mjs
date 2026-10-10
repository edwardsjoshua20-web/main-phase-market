import assert from 'node:assert/strict';
import { assertInstaJudgeInteractionInvariant, createInstaJudgeOwner } from '../src/services/instajudge/instajudgeOwner.js';
import { emptyInstaJudgeConversation } from '../src/services/instajudge/interpretation/conversationContract.js';
import { emptyInstaJudgeInterpretation } from '../src/services/instajudge/interpretation/interpretationContract.js';
import { INSTAJUDGE_MESSAGE_ROUTES, routeInstaJudgeMessage, shouldRepairCollectorInput } from '../src/services/instajudge/messageRouter.js';

const catalog = [
  { id: 'divination', oracle_id: 'divination', name: 'Divination', type_line: 'Sorcery', oracle_text: 'Draw two cards.' },
  { id: 'negate', oracle_id: 'negate', name: 'Negate', type_line: 'Instant', oracle_text: 'Counter target noncreature spell.' },
  { id: 'bears', oracle_id: 'bears', name: 'Grizzly Bears', type_line: 'Creature - Bear', oracle_text: '', power: 2, toughness: 2 },
  { id: 'dreadmaw', oracle_id: 'dreadmaw', name: 'Colossal Dreadmaw', type_line: 'Creature - Dinosaur', oracle_text: 'Trample', power: 6, toughness: 6 },
  { id: 'atraxa', oracle_id: 'atraxa', name: "Atraxa, Praetors' Voice", type_line: 'Legendary Creature - Phyrexian Angel Horror', oracle_text: 'Flying, vigilance, deathtouch, lifelink' }
];

function normalized(value = '') {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function proposal({
  reply = '',
  intent = 'conversational',
  proposedActions = [],
  rulesRequest = null,
  conversationControl = 'continue_conversation',
  interpretation = {}
} = {}) {
  return emptyInstaJudgeConversation({
    reply,
    intent,
    proposedActions,
    rulesRequest,
    conversationControl,
    interpretation: emptyInstaJudgeInterpretation({ interpretationType: 'unknown', confidence: 'high', ...interpretation })
  });
}

const aiCalls = [];
const engineCalls = [];
const owner = createInstaJudgeOwner({
  searchOwner: {
    async searchPreviewByGame(query) {
      const wanted = normalized(query);
      return catalog.filter((card) => normalized(card.name) === wanted).map((card) => ({ ...card, game: 'magic' }));
    }
  },
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  legalityOwner: { check() { throw new Error('Not used.'); } },
  interpretationService: {
    async interpret(input) {
      aiCalls.push(input);
      if (/rough day for you/i.test(input.message)) {
        return proposal({
          reply: "I've had smoother starts. I'll survive.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/already annoying me/i.test(input.message)) {
        return proposal({
          reply: "Fair. I can be a little exacting when the game state matters.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/this judge is dumb/i.test(input.message)) {
        return proposal({
          reply: "A harsh ruling, but I'll allow it.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/fair enough/i.test(input.message)) {
        return proposal({
          reply: "We have reached an understanding. We were trying to figure out whose turn it is. Do you want to tell me about that?",
          intent: 'social',
          conversationControl: 'continue_collector'
        });
      }
      if (/mine sucks/i.test(input.message)) {
        return proposal({
          reply: "Sorry to hear that. We can take this one step at a time.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/how are you today/i.test(input.message)) {
        return proposal({
          reply: "Doing pretty good, thanks for asking. I'm still keeping track of your game.",
          intent: 'social',
          conversationControl: 'continue_conversation'
        });
      }
      if (/wow won'?t talk to me huh/i.test(input.message)) {
        return proposal({
          reply: "Ha, I'm here. I was trying not to lose track of the game state.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/this game is pissing me off/i.test(input.message)) {
        return proposal({
          reply: "I get it. Magic can be a lot when several things are happening at once. We'll sort it out.",
          intent: 'conversational',
          conversationControl: 'continue_conversation'
        });
      }
      if (/wait it(?:'s|s) my turn actually/i.test(input.message)) {
        return proposal({
          reply: "Got you - you meant it's your turn. Want me to change that?",
          intent: 'correction',
          proposedActions: [{ type: 'propose_correction', field: 'turn', value: 'user', target: null }],
          conversationControl: 'suspend_for_correction',
          interpretation: {
            interpretationType: 'correction',
            correction: { field: 'turn', previousValueText: 'opponent', proposedValueText: 'user' }
          }
        });
      }
      if (/can you change it to opponents turn|stop\. change to opponents turn/i.test(input.message)) {
        return proposal({
          reply: "Got it - you want that changed to your opponent's turn. Want me to make that change?",
          intent: 'correction',
          proposedActions: [{ type: 'propose_correction', field: 'turn', value: 'opponent', target: null }],
          conversationControl: 'suspend_for_correction',
          interpretation: {
            interpretationType: 'correction',
            correction: { field: 'turn', previousValueText: 'user', proposedValueText: 'opponent' }
          }
        });
      }
      if (/are you able to fix it/i.test(input.message)) {
        return proposal({
          reply: 'Yep, I can fix that. I still need your confirmation before I change it.',
          intent: 'conversational',
          conversationControl: 'preserve_pending_correction'
        });
      }
      if (/why do you need that/i.test(input.message)) {
        return proposal({
          reply: "Because timing rules can change depending on the exact step you're in.",
          intent: 'clarification',
          conversationControl: 'hold_collector'
        });
      }
      if (/never mind/i.test(input.message)) {
        return proposal({
          reply: "No problem - I'll leave it as it was.",
          intent: 'cancellation',
          proposedActions: [{ type: 'cancel_pending_correction', field: null, value: null, target: null }],
          conversationControl: 'resume_collector'
        });
      }
      if (/thanks judge/i.test(input.message)) {
        return proposal({
          reply: "Anytime. That's what I'm here for.",
          intent: 'social',
          conversationControl: 'continue_conversation'
        });
      }
      if (/can dreadmaw still hit them/i.test(input.message)) {
        return proposal({
          reply: "I'll check that against the current game state.",
          intent: 'rules_question',
          rulesRequest: { operation: 'evaluate_magic_question', question: 'Can Dreadmaw still hit them?' },
          conversationControl: 'suspend_for_rules',
          interpretation: { interpretationType: 'question' }
        });
      }
      if (/can they respond here/i.test(input.message)) {
        return proposal({
          reply: "Let me check that against the state we have.",
          intent: 'rules_question',
          rulesRequest: { operation: 'evaluate_magic_question', question: 'Can they respond here?' },
          conversationControl: 'suspend_for_rules',
          interpretation: { interpretationType: 'question' }
        });
      }
      return proposal({ reply: 'Tell me a little more about what you mean.', intent: 'clarification', conversationControl: 'ask_clarification' });
    }
  },
  engineGateway: {
    evaluateMagicQuestion(input) {
      engineCalls.push(input);
      return {
        result: {
          answer: 'NO. The attacker remains blocked and has no trample, so it deals 0 damage to the defending player.',
          verdict: 'no',
          diagnosticTrace: [],
          provenance: { authority: 'deterministic-magic-runtime' }
        }
      };
    }
  }
});

async function ask(current, message, answerId, inputSource = 'typed') {
  return owner.ask({ session: current.session, gameId: 'magic', message, answerId, inputSource });
}

async function atPhase(flow) {
  let current = owner.selectGame(owner.createSession(), 'magic');
  current = await ask(current, 'Check a play', `${flow}-intent`, 'quick-reply');
  current = await ask(current, "Opponent's", `${flow}-turn`, 'quick-reply');
  assert.equal(current.session.pendingStateKey, 'phase');
  return current;
}

async function atTurn(flow) {
  let current = owner.selectGame(owner.createSession(), 'magic');
  current = await ask(current, 'Check a play', `${flow}-intent`, 'quick-reply');
  assert.equal(current.session.pendingStateKey, 'turn');
  assert.deepEqual(current.result.choices, ['Mine', "Opponent's"]);
  return current;
}

// Flow A: exact real-player correction sequence remains owned by the pending correction.
let flowA = await atPhase('a');
const flowATurnAnswerId = 'a-turn';
flowA = await ask(flowA, 'wait its my turn actually', 'a-correction');
assert.equal(flowA.session.stage, 'confirming-correction');
assert.equal(flowA.session.pendingCorrection.status, 'awaiting_confirmation');
assert.equal(flowA.session.pendingCorrection.field, 'turn');
assert.equal(flowA.session.pendingCorrection.previousValue, 'opponent');
assert.equal(flowA.session.pendingCorrection.collectorContext.pendingStateKey, 'phase');
assert.equal(flowA.session.magicState.activePlayer, 'opponent');
assert.equal(flowA.session.magicState.phase, null);
assert.equal(flowA.result.stateKey, 'correction-confirmation');
assert.equal(flowA.result.interactionField, 'turn');
assertInstaJudgeInteractionInvariant(flowA.session, flowA.result);

const correctionStage = flowA.session.stage;
const suspendedCollectorKey = flowA.session.pendingStateKey;
flowA = await ask(flowA, 'are you able to fix it for me?', 'a-meta');
assert.equal(flowA.session.stage, 'confirming-correction');
assert.equal(flowA.session.pendingCorrection.status, 'awaiting_confirmation');
assert.equal(flowA.session.magicState.activePlayer, 'opponent');
assert.equal(flowA.session.magicState.phase, null);
assert.match(flowA.result.answer, /can fix that/i);
assert.deepEqual(flowA.result.choices, ['Yes, change it', 'No, keep it']);
assert.equal(flowA.result.stateKey, 'correction-confirmation');
assert.equal(flowA.result.interactionField, 'turn');
assert.equal(shouldRepairCollectorInput({
  previousStage: correctionStage,
  previousStateKey: suspendedCollectorKey,
  session: flowA.session,
  result: flowA.result
}), false);
assertInstaJudgeInteractionInvariant(flowA.session, flowA.result);

flowA = await ask(flowA, 'yes', 'a-confirm');
assert.equal(flowA.session.magicState.activePlayer, 'player');
assert.equal(flowA.session.stage, 'collecting');
assert.equal(flowA.session.pendingStateKey, 'phase');
assert.match(flowA.result.answer, /What phase/);
assert.equal(flowA.result.stateKey, 'phase');
assert.equal(flowA.result.interactionField, 'phase');
assert.deepEqual(flowA.result.choices, ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup']);
assert.ok(!flowA.result.choices.includes('Mine'));
assert.ok(!flowA.result.choices.includes("Opponent's"));
assertInstaJudgeInteractionInvariant(flowA.session, flowA.result);

// Flow B: a natural correction request takes priority over the phase parser.
let flowB = await atPhase('b');
flowB = await ask(flowB, 'can you change it to opponents turn for me? I made a mistake', 'b-correction');
assert.equal(flowB.session.stage, 'confirming-correction');
assert.equal(flowB.session.pendingCorrection.status, 'awaiting_confirmation');
assert.equal(flowB.session.pendingCorrection.field, 'turn');
assert.equal(flowB.session.magicState.phase, null);
assert.equal(flowB.session.magicState.activePlayer, 'opponent');
assert.match(flowB.result.answer, /opponent's turn/i);
assert.deepEqual(flowB.result.choices, ['Yes, change it', 'No, keep it']);
const flowBTurnBeforeClarification = flowB.session.magicState.activePlayer;
flowB = await ask(flowB, 'why do you need that?', 'b-clarification');
assert.equal(flowB.session.stage, 'confirming-correction');
assert.equal(flowB.session.pendingCorrection.field, 'turn');
assert.equal(flowB.session.magicState.activePlayer, flowBTurnBeforeClarification);
assert.equal(flowB.result.interactionField, 'turn');
assert.deepEqual(flowB.result.choices, ['Yes, change it', 'No, keep it']);
assert.match(flowB.result.answer, /timing rules can change/i);
assertInstaJudgeInteractionInvariant(flowB.session, flowB.result);

// Flow C: terse correction language is still interpreted conversationally, never by the phase parser.
let flowC = await atPhase('c');
flowC = await ask(flowC, 'stop. change to opponents turn', 'c-correction');
assert.equal(flowC.session.stage, 'confirming-correction');
assert.equal(flowC.session.pendingCorrection.field, 'turn');
assert.equal(flowC.session.magicState.phase, null);
assert.match(flowC.result.answer, /opponent's turn/i);

// Undo restores both canonical state and the exact pending interaction.
const correctionUndo = owner.rollback(flowA.session, 'a-confirm');
assert.equal(correctionUndo.session.magicState.activePlayer, 'opponent');
assert.equal(correctionUndo.session.stage, 'confirming-correction');
assert.equal(correctionUndo.session.pendingCorrection.status, 'awaiting_confirmation');
assert.deepEqual(correctionUndo.result.choices, ['Yes, change it', 'No, keep it']);
assertInstaJudgeInteractionInvariant(correctionUndo.session, correctionUndo.result);
assert.throws(
  () => assertInstaJudgeInteractionInvariant(correctionUndo.session, {
    ...correctionUndo.result,
    answer: 'Which phase are you in?',
    choices: ['Mine', "Opponent's"]
  }),
  /quick replies|prompt field/
);

const answerUndo = owner.rollback(flowB.session, 'b-turn');
assert.equal(answerUndo.session.magicState.activePlayer, null);
assert.equal(answerUndo.session.stage, 'collecting');
assert.equal(answerUndo.session.pendingStateKey, 'turn');
assert.match(answerUndo.result.answer, /Whose turn/);
assert.deepEqual(answerUndo.result.choices, ['Mine', "Opponent's"]);

// Flow D: a meta question explains and then resumes the phase collector.
let flowD = await atPhase('d');
flowD = await ask(flowD, 'Why do you need that?', 'd-meta');
assert.equal(flowD.session.stage, 'collecting');
assert.equal(flowD.session.pendingStateKey, 'phase');
assert.equal(flowD.session.magicState.phase, null);
assert.match(flowD.result.answer, /timing rules can change/i);
assert.deepEqual(flowD.result.choices, ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup']);

// Flow E: cancellation preserves the original state and resumes the prior collector.
let flowE = await atPhase('e');
flowE = await ask(flowE, 'wait its my turn actually', 'e-correction');
flowE = await ask(flowE, 'Actually never mind.', 'e-cancel');
assert.equal(flowE.session.magicState.activePlayer, 'opponent');
assert.equal(flowE.session.pendingCorrection, null);
assert.equal(flowE.session.stage, 'collecting');
assert.equal(flowE.session.pendingStateKey, 'phase');
assert.match(flowE.result.answer, /left the earlier answer unchanged/i);
assert.match(flowE.result.answer, /What phase/);

// Flow F: rules conversation delegates to the deterministic engine and preserves verification controls.
let flowF = owner.selectGame(owner.createSession(), 'magic');
for (const [index, answer] of ['Check a play', 'Mine', 'Precombat Main', 'Me', 'Empty'].entries()) {
  flowF = await ask(flowF, answer, `f-guided-${index}`, 'quick-reply');
}
assert.equal(flowF.session.stage, 'verifying');
const callsBeforeRulesQuestion = aiCalls.length;
flowF = await ask(flowF, 'Can Dreadmaw still hit them?', 'f-rules');
assert.equal(aiCalls.length, callsBeforeRulesQuestion + 1);
assert.equal(engineCalls.length, 1);
assert.match(flowF.result.answer, /check that/i);
assert.match(flowF.result.answer, /remains blocked/i);
assert.equal(flowF.session.magicState.activePlayer, 'player');
assert.equal(flowF.session.stage, 'verifying');
assert.deepEqual(flowF.result.choices, ['Looks Right', 'Edit State']);
assert.equal(flowF.session.lastRuling.provenance.authority, 'deterministic-magic-runtime');

// Flow G: social conversation stays natural, cannot mutate state, and cannot duplicate the guided prompt.
let flowG = await atPhase('g');
const stateBeforeThanks = structuredClone(flowG.session.magicState);
const callsBeforeThanks = aiCalls.length;
flowG = await ask(flowG, 'Thanks Judge', 'g-social');
assert.equal(aiCalls.length, callsBeforeThanks + 1);
assert.deepEqual(flowG.session.magicState, stateBeforeThanks);
assert.match(flowG.result.answer, /Anytime/i);
assert.equal((flowG.result.answer.match(/What phase or step are you in\?/gi) || []).length, 0);
assert.deepEqual(flowG.result.choices, ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup']);

// The same interruption route must preempt every collector family.
for (const pendingStateKey of ['priority', 'stack', 'stack-response-target', 'combat-attackers', 'combat-blockers', 'commander-card', 'commander-life', 'rules-fact']) {
  assert.equal(
    routeInstaJudgeMessage({ message: 'What do you mean?', stage: 'collecting', pendingStateKey }),
    INSTAJUDGE_MESSAGE_ROUTES.CONVERSATIONAL_INTERRUPTION,
    pendingStateKey
  );
  const suspended = {
    ...flowA.session,
    interaction: null,
    stage: 'confirming-correction',
    pendingStateKey,
    pendingCorrection: {
      ...correctionUndo.session.pendingCorrection,
      collectorContext: {
        ...correctionUndo.session.pendingCorrection.collectorContext,
        pendingStateKey
      }
    }
  };
  assertInstaJudgeInteractionInvariant(suspended, correctionUndo.result);
  assert.equal(shouldRepairCollectorInput({
    previousStage: 'confirming-correction',
    previousStateKey: pendingStateKey,
    session: suspended,
    result: correctionUndo.result
  }), false);
}

// Guided quick replies remain the zero-AI primary path.
const callsBeforeGuided = aiCalls.length;
let guided = owner.selectGame(owner.createSession(), 'magic');
const guidedSteps = [
  ['Timing / priority', ['Mine', "Opponent's"]],
  ['Mine', ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup']],
  ['Upkeep', ['Me', 'Opponent', 'Not sure']],
  ['Me', ['Empty', 'Not empty']],
  ['Empty', ['Looks Right', 'Edit State']]
];
for (const [index, [answer, expectedChoices]] of guidedSteps.entries()) {
  guided = await ask(guided, answer, `guided-${index}`, 'quick-reply');
  assert.deepEqual(guided.result.choices, expectedChoices);
  assertInstaJudgeInteractionInvariant(guided.session, guided.result);
}
assert.equal(guided.session.stage, 'verifying');
assert.equal(aiCalls.length, callsBeforeGuided);

// Required conversational product flows: off-path speech is AI-owned while the
// exact guided collector remains authoritative and available.
for (const [id, message, expectedReply] of [
  ['social-phase', 'how are you today', /Doing pretty good/i],
  ['playful-phase', "wow won't talk to me huh?", /I'm here/i],
  ['explain-phase', 'why do you need that?', /timing rules can change/i],
  ['frustrated-phase', 'this game is pissing me off', /sort it out/i]
]) {
  let flow = await atPhase(id);
  const stateBefore = structuredClone(flow.session.magicState);
  const callsBefore = aiCalls.length;
  flow = await ask(flow, message, `${id}-message`);
  assert.equal(aiCalls.length, callsBefore + 1, id);
  assert.deepEqual(flow.session.magicState, stateBefore, id);
  assert.equal(flow.session.stage, 'collecting', id);
  assert.equal(flow.session.pendingStateKey, 'phase', id);
  assert.match(flow.result.answer, expectedReply, id);
  assert.deepEqual(flow.result.choices, ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup'], id);
  assert.equal(flow.result.inputRepairEligible, false, id);
  assertInstaJudgeInteractionInvariant(flow.session, flow.result);
}

let correctionFlow = await atPhase('required-correction');
const correctionCallsBefore = aiCalls.length;
correctionFlow = await ask(correctionFlow, 'wait its my turn actually', 'required-correction-message');
assert.equal(aiCalls.length, correctionCallsBefore + 1);
assert.equal(correctionFlow.session.magicState.activePlayer, 'opponent');
assert.equal(correctionFlow.session.pendingCorrection.field, 'turn');
assert.equal(correctionFlow.session.pendingCorrection.collectorContext.pendingStateKey, 'phase');
assert.match(correctionFlow.result.answer, /meant it's your turn/i);

const correctionFollowupCalls = aiCalls.length;
correctionFlow = await ask(correctionFlow, 'are you able to fix it for me?', 'required-correction-followup');
assert.equal(aiCalls.length, correctionFollowupCalls + 1);
assert.equal(correctionFlow.session.magicState.activePlayer, 'opponent');
assert.equal(correctionFlow.session.pendingCorrection.field, 'turn');
assert.match(correctionFlow.result.answer, /can fix that/i);

const correctionConfirmationCalls = aiCalls.length;
correctionFlow = await ask(correctionFlow, 'yeah go ahead', 'required-correction-confirmation');
assert.equal(aiCalls.length, correctionConfirmationCalls);
assert.equal(correctionFlow.session.magicState.activePlayer, 'player');
assert.equal(correctionFlow.session.stage, 'collecting');
assert.equal(correctionFlow.session.pendingStateKey, 'phase');
assert.deepEqual(correctionFlow.result.choices, ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup']);

let stackSocial = owner.selectGame(owner.createSession(), 'magic');
for (const [index, answer] of ['Check a play', 'Mine', 'Precombat Main', 'Me'].entries()) {
  stackSocial = await ask(stackSocial, answer, `stack-social-${index}`, 'quick-reply');
}
assert.equal(stackSocial.session.pendingStateKey, 'stack');
const stackBefore = structuredClone(stackSocial.session.magicState);
stackSocial = await ask(stackSocial, 'thanks judge', 'stack-social-message');
assert.deepEqual(stackSocial.session.magicState, stackBefore);
assert.equal(stackSocial.session.pendingStateKey, 'stack');
assert.match(stackSocial.result.answer, /Anytime/i);
assert.deepEqual(stackSocial.result.choices, ['Empty', 'Not empty']);

let rulesFlow = owner.selectGame(owner.createSession(), 'magic');
for (const [index, answer] of ['Check a play', 'Mine', 'Precombat Main', 'Me', 'Empty'].entries()) {
  rulesFlow = await ask(rulesFlow, answer, `rules-guided-${index}`, 'quick-reply');
}
assert.equal(rulesFlow.session.stage, 'verifying');
const rulesStateBefore = structuredClone(rulesFlow.session.magicState);
const rulesEngineCallsBefore = engineCalls.length;
rulesFlow = await ask(rulesFlow, 'can they respond here?', 'rules-conversation');
assert.equal(engineCalls.length, rulesEngineCallsBefore + 1);
assert.deepEqual(rulesFlow.session.magicState, rulesStateBefore);
assert.equal(rulesFlow.session.stage, 'verifying');
assert.match(rulesFlow.result.answer, /Let me check/i);
assert.match(rulesFlow.result.answer, /deterministic|remains blocked|0 damage/i);
assert.deepEqual(rulesFlow.result.choices, ['Looks Right', 'Edit State']);

// Multi-turn side conversation leaves the turn collector silently pending until
// the player chooses to resume it with the existing deterministic controls.
let multiTurn = await atTurn('multi-turn');
const multiTurnSessionId = multiTurn.session.id;
const multiTurnState = structuredClone(multiTurn.session.magicState);
const multiTurnCallsBefore = aiCalls.length;
const sideConversation = [
  ['rough day for you?', /smoother starts/i],
  ['yeah you are already annoying me', /little exacting/i],
  ['this judge is dumb', /harsh ruling/i],
  ['fair enough', /understanding/i]
];
for (const [index, [message, expectedReply]] of sideConversation.entries()) {
  multiTurn = await ask(multiTurn, message, `multi-turn-chat-${index}`);
  assert.equal(multiTurn.session.id, multiTurnSessionId);
  assert.equal(multiTurn.session.stage, 'collecting');
  assert.equal(multiTurn.session.pendingStateKey, 'turn');
  assert.deepEqual(multiTurn.session.magicState, multiTurnState);
  assert.match(multiTurn.result.answer, expectedReply);
  assert.doesNotMatch(multiTurn.result.answer, /whose turn|mine|opponent'?s/i);
  assert.deepEqual(multiTurn.result.choices, ['Mine', "Opponent's"]);
  assert.ok(['continue_conversation', 'continue_collector'].includes(multiTurn.result.aiConversation.conversationControl));
  assertInstaJudgeInteractionInvariant(multiTurn.session, multiTurn.result);
}
assert.equal(multiTurn.result.answer, 'We have reached an understanding.');
assert.equal(aiCalls.length, multiTurnCallsBefore + 4);
const callsBeforeResumeClick = aiCalls.length;
multiTurn = await ask(multiTurn, 'Mine', 'multi-turn-resume', 'quick-reply');
assert.equal(aiCalls.length, callsBeforeResumeClick);
assert.equal(multiTurn.session.id, multiTurnSessionId);
assert.equal(multiTurn.session.magicState.activePlayer, 'player');
assert.equal(multiTurn.session.pendingStateKey, 'phase');
assert.match(multiTurn.result.answer, /What phase/);

// A correction after two chat turns still suspends the original collector and
// requires deterministic confirmation before canonical state changes.
let delayedCorrection = await atPhase('delayed-correction');
delayedCorrection = await ask(delayedCorrection, 'how are you today', 'delayed-correction-chat-1');
delayedCorrection = await ask(delayedCorrection, 'mine sucks', 'delayed-correction-chat-2');
const delayedCorrectionState = structuredClone(delayedCorrection.session.magicState);
delayedCorrection = await ask(delayedCorrection, 'wait its my turn actually', 'delayed-correction-proposal');
assert.deepEqual(delayedCorrection.session.magicState, delayedCorrectionState);
assert.equal(delayedCorrection.session.stage, 'confirming-correction');
assert.equal(delayedCorrection.session.pendingCorrection.field, 'turn');
assert.equal(delayedCorrection.session.pendingCorrection.collectorContext.pendingStateKey, 'phase');
assert.equal(delayedCorrection.result.aiConversation.conversationControl, 'suspend_for_correction');

// A rules request after two chat turns delegates to the deterministic engine;
// prior banter never becomes game state or rules authority.
let delayedRules = owner.selectGame(owner.createSession(), 'magic');
for (const [index, answer] of ['Check a play', 'Mine', 'Precombat Main', 'Me', 'Empty'].entries()) {
  delayedRules = await ask(delayedRules, answer, `delayed-rules-guided-${index}`, 'quick-reply');
}
delayedRules = await ask(delayedRules, 'how are you today', 'delayed-rules-chat-1');
delayedRules = await ask(delayedRules, 'mine sucks', 'delayed-rules-chat-2');
const delayedRulesState = structuredClone(delayedRules.session.magicState);
const delayedRulesEngineCalls = engineCalls.length;
delayedRules = await ask(delayedRules, 'can they respond here?', 'delayed-rules-question');
assert.equal(engineCalls.length, delayedRulesEngineCalls + 1);
assert.deepEqual(delayedRules.session.magicState, delayedRulesState);
assert.equal(delayedRules.session.stage, 'verifying');
assert.equal(delayedRules.result.aiConversation.conversationControl, 'suspend_for_rules');
assert.match(delayedRules.result.answer, /remains blocked|0 damage/i);

assert.ok(aiCalls.some((call) => call.message === 'are you able to fix it for me?'));
assert.ok(aiCalls.some((call) => call.message === 'Why do you need that?'));
assert.ok(!aiCalls.some((call) => call.message === 'Actually never mind.'));
assert.equal(aiCalls.filter((call) => call.message === 'are you able to fix it for me?').length, 2);

console.log(JSON.stringify({
  verifier: 'InstaJudge conversational continuity',
  flows: 19,
  pendingCollectorFamilies: 8,
  mockedAiCalls: aiCalls.length,
  deterministicEngineCalls: engineCalls.length,
  liveAiCalls: 0,
  status: 'PASS'
}, null, 2));
