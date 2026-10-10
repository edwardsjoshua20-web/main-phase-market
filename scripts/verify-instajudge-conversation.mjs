import assert from 'node:assert/strict';
import { createInstaJudgeOwner } from '../src/services/instajudge/instajudgeOwner.js';
import { collectMagicConversationState, createMagicConversationState, getMissingRequiredMagicState } from '../src/services/instajudge/magic/conversationState.js';
import { compileVerifiedMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';

const catalog = [
  { id: 'dreadmaw', name: 'Colossal Dreadmaw', typeLine: 'Creature - Dinosaur', oracleText: 'Trample', manaCost: '{4}{G}{G}', power: 6, toughness: 6 },
  { id: 'bears', name: 'Grizzly Bears', typeLine: 'Creature - Bear', oracleText: '', manaCost: '{1}{G}', power: 2, toughness: 2 },
  { id: 'murder', name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}' },
  { id: 'giant-growth', name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.', manaCost: '{G}' },
  { id: 'divination', name: 'Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.', manaCost: '{2}{U}' }
];

const owner = createInstaJudgeOwner({
  searchOwner: {
    async searchPreviewByGame(query) {
      const wanted = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      return catalog
        .filter((card) => card.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === wanted)
        .map((card) => ({ ...card, game: 'magic', oracle_id: card.id, type_line: card.typeLine, oracle_text: card.oracleText, mana_cost: card.manaCost }));
    }
  },
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  legalityOwner: { check() { throw new Error('Legality is outside this verifier.'); } }
});

async function run(messages) {
  let { session, result } = owner.selectGame(owner.createSession(), 'magic');
  const transcript = [{ session, result }];
  ({ session, result } = await owner.ask({ session, gameId: 'magic', message: 'Ask a rules question' }));
  transcript.push({ message: 'Ask a rules question', session, result });
  for (const message of messages) {
    ({ session, result } = await owner.ask({ session, gameId: 'magic', message }));
    transcript.push({ message, session, result });
  }
  return { session, result, transcript };
}

const mainCast = await run([
  "It's my turn, precombat main, stack empty, I have priority.",
  'Looks Right',
  'Can I cast Grizzly Bears?'
]);
assert.equal(mainCast.transcript[2].session.magicState.activePlayer, 'player');
assert.equal(mainCast.transcript[2].session.magicState.phase, 'precombat-main');
assert.equal(mainCast.transcript[2].session.magicState.priorityHolder, 'player');
assert.equal(mainCast.transcript[2].session.magicState.stack.empty, true);
assert.equal(mainCast.transcript[2].session.stage, 'verifying');
assert.equal(mainCast.transcript[3].session.verifiedState, true);
assert.equal(mainCast.result.verdict, 'yes');

const opponentSorcery = await run([
  "It's my opponent's turn, precombat main, stack empty, I have priority.",
  'Looks Right',
  'Can I cast Divination?'
]);
assert.equal(opponentSorcery.result.verdict, 'no');

const trample = await run([
  "It's my turn, combat after blockers, stack empty, I have priority. Colossal Dreadmaw is attacking. Grizzly Bears is blocking.",
  'Looks Right',
  'If I Murder the blocker, how much damage gets through?'
]);
assert.equal(trample.session.magicState.step, 'declare-blockers');
assert.equal(trample.session.magicState.combat.attackers.length, 1);
assert.equal(trample.session.magicState.combat.blocks[0].blockerIds.length, 1);
assert.equal(trample.result.verdict, 'yes');
assert.match(trample.result.answer, /6 damage assigned/);

const nonTrample = await run([
  "It's my turn, combat after blockers, stack empty, I have priority. Grizzly Bears is attacking. Grizzly Bears is blocking.",
  'Looks Right',
  'If I Murder the blocker, will my attacker hit my opponent?'
]);
assert.equal(nonTrample.session.magicState.battlefield.filter((object) => object.name === 'Grizzly Bears').length, 2);
assert.equal(nonTrample.result.verdict, 'no');
assert.match(nonTrample.result.answer, /remains blocked/i);
assert.match(nonTrample.result.answer, /is removed/i);
assert.match(nonTrample.result.answer, /does not have trample/i);
assert.match(nonTrample.result.answer, /0 combat damage/i);

const clarification = await run([
  "It's my turn, precombat main, stack empty, priority is unknown.",
  'Looks Right',
  'Can I cast Grizzly Bears?',
  'Me'
]);
const clarificationTurn = clarification.transcript.at(-2);
assert.equal(clarificationTurn.session.stage, 'clarifying');
assert.equal(clarificationTurn.result.kind, 'clarification');
assert.match(clarificationTurn.result.answer, /priority/i);
assert.equal(clarification.result.verdict, 'yes');

const correction = await run([
  "It's my turn, precombat main, stack empty, I have priority.",
  'Edit State',
  'Actually, combat after blockers. Colossal Dreadmaw is attacking and Grizzly Bears is blocking.'
]);
assert.equal(correction.session.stage, 'confirming-correction');
assert.equal(correction.session.pendingCorrection.status, 'awaiting_value');
assert.equal(correction.session.magicState.phase, 'precombat-main');
assert.equal(correction.session.magicState.step, null);

const compiled = compileVerifiedMagicScenario({
  message: 'If I Murder the blocker, how much damage gets through?',
  cards: trample.session.magicState.cards,
  verifiedState: trample.session.magicState
});
assert.equal(compiled.questionedAction.type, 'Cast');
assert.equal(compiled.questionedAction.source.name, 'Murder');
assert.equal(compiled.objects.find((object) => object.id === compiled.questionedAction.targets[0].objectId)?.roles[0], 'blocker');
assert.equal(compiled.questionIntent, 'combat-outcome');

const reset = owner.selectGame(owner.createSession(), 'magic');
assert.equal(reset.session.verifiedState, false);
assert.deepEqual(reset.session.resolvedCards, []);
assert.deepEqual(reset.session.magicState.cards, []);
assert.deepEqual(reset.session.magicState.battlefield, []);
assert.deepEqual(reset.session.magicState.stack.items, []);
assert.equal(reset.session.pendingQuestion, null);
assert.equal(reset.session.stage, 'intent');
assert.equal(reset.session.helpIntent, null);
assert.match(reset.result.answer, /What do you need help with/);

for (const [label, value] of [
  ['Ask a rules question', 'rules_question'],
  ['Check a play', 'check_play'],
  ['Combat ruling', 'combat_ruling'],
  ['Timing / priority', 'timing_priority']
]) {
  const opening = owner.selectGame(owner.createSession(), 'magic');
  const intentChoice = await owner.ask({ session: opening.session, gameId: 'magic', message: label });
  assert.equal(intentChoice.session.helpIntent, value);
  assert.equal(intentChoice.session.stage, 'collecting');
  assert.equal(intentChoice.session.pendingStateKey, 'turn');
  assert.equal(intentChoice.session.conversation.filter((entry) => entry.role === 'user' && entry.text === label).length, 1);
  assert.equal(intentChoice.session.conversation.at(-2).text, 'Got it. Before I rule on it, I need a few details about the current game state.');
  assert.match(intentChoice.session.conversation.at(-1).text, /Whose turn/);
}

const typedOpening = owner.selectGame(owner.createSession(), 'magic');
const typedQuestion = await owner.ask({ session: typedOpening.session, gameId: 'magic', message: 'Can I cast Grizzly Bears?' });
assert.equal(typedQuestion.session.helpIntent, 'rules_question');
assert.equal(typedQuestion.session.pendingQuestion, 'Can I cast Grizzly Bears?');
assert.equal(typedQuestion.session.pendingStateKey, 'turn');

const originalScenarioText = "It's my turn, during the declare blockers step. I'm attacking with Colossal Dreadmaw and my opponent blocks it with Grizzly Bears. I have priority. I cast Murder targeting Grizzly Bears. Murder is on the stack. What happens if my opponent does nothing?";
const originalOpening = owner.selectGame(owner.createSession(), 'magic');
const originalScenario = await owner.ask({ session: originalOpening.session, gameId: 'magic', message: originalScenarioText });
assert.equal(originalScenario.session.stage, 'verifying');
assert.equal(originalScenario.session.pendingStateKey, null);
assert.equal(originalScenario.session.pendingQuestion, originalScenarioText);
assert.deepEqual(getMissingRequiredMagicState(originalScenario.session.magicState), []);
assert.equal(originalScenario.session.magicState.activePlayer, 'player');
assert.equal(originalScenario.session.magicState.phase, 'combat');
assert.equal(originalScenario.session.magicState.step, 'declare-blockers');
assert.equal(originalScenario.session.magicState.combat.window, 'after-blockers');
assert.equal(originalScenario.session.magicState.priorityHolder, 'player');
assert.equal(originalScenario.session.magicState.stack.empty, false);
assert.equal(originalScenario.session.magicState.stack.items.length, 1);
assert.equal(originalScenario.session.magicState.stack.items[0].name, 'Murder');
assert.equal(originalScenario.session.magicState.stack.items[0].targets[0].descriptor, 'grizzly bears');
assert.equal(originalScenario.session.magicState.combat.attackers.length, 1);
assert.equal(originalScenario.session.magicState.combat.blocks[0].blockerIds.length, 1);
const originalBlockerId = originalScenario.session.magicState.combat.blocks[0].blockerIds[0];
assert.equal(originalScenario.session.magicState.stack.items[0].targets[0].objectId, originalBlockerId);
assert.equal(originalScenario.result.stateSummary.turn, 'You');
assert.equal(originalScenario.result.stateSummary.phase, 'Combat');
assert.equal(originalScenario.result.stateSummary.step, 'Declare Blockers');
assert.equal(originalScenario.result.stateSummary.window, 'After blockers are declared');
assert.equal(originalScenario.result.stateSummary.stack, 'Murder -> grizzly bears');

for (const wording of [
  'after attackers',
  'attackers declared',
  'before blockers',
  'before I declare blockers'
]) {
  const normalizedStep = collectMagicConversationState(createMagicConversationState(), wording);
  assert.equal(normalizedStep.phase, 'combat');
  assert.equal(normalizedStep.step, 'declare-attackers');
}
const declareBlockersStep = collectMagicConversationState(createMagicConversationState(), 'declare blockers step before blockers are chosen');
assert.equal(declareBlockersStep.phase, 'combat');
assert.equal(declareBlockersStep.step, 'declare-blockers');

let transition = owner.selectGame(owner.createSession(), 'magic');
assert.equal(transition.session.stage, 'intent');
assert.equal(transition.session.pendingStateKey, null);
transition = await owner.ask({ session: transition.session, gameId: 'magic', message: 'Combat ruling' });
const transitionSessionId = transition.session.id;
assert.equal(transition.session.helpIntent, 'combat_ruling');
assert.equal(transition.session.pendingStateKey, 'turn');
assert.equal(transition.session.magicState.activePlayer, null);
assert.equal(transition.result.stateSummary.stack, 'Not supplied');
assert.equal(transition.result.stateSummary.combat, 'Not supplied');

const assertTransition = async (answer, expectedKey, assertion) => {
  const previousConversation = transition.session.conversation;
  transition = await owner.ask({ session: transition.session, gameId: 'magic', message: answer });
  assert.equal(transition.session.id, transitionSessionId);
  assert.equal(transition.session.pendingStateKey, expectedKey);
  assert.equal(transition.session.conversation.length, previousConversation.length + 2);
  assert.deepEqual(transition.session.conversation.slice(0, previousConversation.length), previousConversation);
  assert.equal(transition.session.conversation.at(-2).role, 'user');
  assert.equal(transition.session.conversation.at(-1).role, 'assistant');
  assertion(transition);
};

await assertTransition("Opponent's", 'phase', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['phase', 'priority', 'stack']);
  assert.equal(session.magicState.activePlayer, 'opponent');
  assert.match(result.answer, /What phase/);
});
await assertTransition('Combat', 'step', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['step', 'priority', 'stack']);
  assert.equal(session.magicState.phase, 'combat');
  assert.match(result.answer, /What combat step/);
});
await assertTransition('After attackers / Before blockers', 'priority', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['priority', 'stack', 'combat-attackers']);
  assert.equal(session.magicState.step, 'declare-attackers');
  assert.match(result.answer, /priority/);
});
await assertTransition('Me', 'stack', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['stack', 'combat-attackers']);
  assert.equal(session.magicState.priorityHolder, 'player');
  assert.equal(session.magicState.priorityKnown, true);
  assert.match(result.answer, /stack empty/);
});
await assertTransition('Yes', 'combat-attackers', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['combat-attackers']);
  assert.equal(session.magicState.stack.known, true);
  assert.equal(session.magicState.stack.empty, true);
  assert.match(result.answer, /creature or creatures are attacking/);
});
await assertTransition('Can I Murder the Dreadmaw before I declare blockers?', 'combat-attackers', ({ session, result }) => {
  assert.equal(session.stage, 'collecting');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), ['combat-attackers']);
  assert.equal(session.magicState.combat.attackers.length, 0);
  assert.match(result.answer, /creature or creatures are attacking/);
});
await assertTransition('Colossal Dreadmaw', null, ({ session, result }) => {
  assert.equal(session.stage, 'verifying');
  assert.deepEqual(getMissingRequiredMagicState(session.magicState), []);
  assert.equal(session.magicState.combat.attackersKnown, true);
  assert.equal(session.magicState.combat.attackers.length, 1);
  const attacker = session.magicState.battlefield.find((object) => object.roles?.includes('attacker'));
  assert.equal(attacker?.name, 'Colossal Dreadmaw');
  assert.equal(attacker?.controller, 'opponent');
  assert.equal(result.stateSummary.step, 'Declare Attackers');
  assert.equal(result.stateSummary.attacker, 'Colossal Dreadmaw');
  assert.equal(result.stateSummary.blockers, 'None declared yet');
});

transition = await owner.ask({ session: transition.session, gameId: 'magic', message: 'Looks Right' });
assert.equal(transition.session.stage, 'questioning');
const legalityQuestion = 'Can I Murder the Dreadmaw before I declare blockers?';
const legalityScenario = compileVerifiedMagicScenario({
  message: legalityQuestion,
  cards: [...transition.session.magicState.cards, catalog.find((card) => card.name === 'Murder')],
  verifiedState: transition.session.magicState
});
assert.equal(legalityScenario.questionIntent, 'action-legality');
assert.equal(legalityScenario.questionedAction?.type, 'Cast');
assert.equal(legalityScenario.questionedAction?.source?.name, 'Murder');
assert.equal(legalityScenario.game.step, 'declare-attackers');
const legalityRuntime = evaluateMagicRulesRuntime({
  message: legalityQuestion,
  cards: [...transition.session.magicState.cards, catalog.find((card) => card.name === 'Murder')],
  scenario: legalityScenario
});
assert.match(legalityRuntime.summary, /priority/i);
transition = await owner.ask({ session: transition.session, gameId: 'magic', message: 'Can I Murder the Dreadmaw before I declare blockers?' });
assert.equal(transition.result.verdict, 'yes');
assert.match(transition.result.answer, /priority/i);
assert.match(transition.result.answer, /instant/i);
assert.match(transition.result.answer, /Murder/i);
assert.match(transition.result.answer, /Colossal Dreadmaw/i);
assert.doesNotMatch(transition.result.answer, /combat resolves|6 damage|damage assigned/i);

const noInterventionOutcome = await owner.ask({
  session: transition.session,
  gameId: 'magic',
  message: 'How much damage does Dreadmaw deal if I do nothing?'
});
assert.equal(noInterventionOutcome.result.verdict, 'yes');
assert.match(noInterventionOutcome.result.answer, /Combat resolves with 6 damage assigned/i);

const growthTiming = await run([
  "It's my turn, combat after blockers, stack empty, I have priority. Colossal Dreadmaw is attacking. Grizzly Bears is blocking.",
  'Looks Right',
  'Can I cast Giant Growth on Dreadmaw?'
]);
assert.equal(growthTiming.result.verdict, 'yes');
assert.match(growthTiming.result.answer, /priority/i);
assert.match(growthTiming.result.answer, /instant/i);
assert.match(growthTiming.result.answer, /Giant Growth/i);
assert.match(growthTiming.result.answer, /Colossal Dreadmaw/i);
assert.doesNotMatch(growthTiming.result.answer, /combat resolves|damage assigned/i);

assert.equal(trample.result.verdict, 'yes');
assert.match(trample.result.answer, /Combat resolves with 6 damage assigned/i);

async function collectCombatStep(stepChoice) {
  let current = owner.selectGame(owner.createSession(), 'magic');
  for (const answer of ['Combat ruling', 'Mine', 'Combat', stepChoice, 'Me', 'Yes']) {
    current = await owner.ask({ session: current.session, gameId: 'magic', message: answer });
  }
  return current;
}

const beforeAttackers = await collectCombatStep('Before attackers');
assert.equal(beforeAttackers.session.stage, 'verifying');
assert.equal(beforeAttackers.session.pendingStateKey, null);
assert.equal(beforeAttackers.result.stateSummary.attacker, 'None declared yet');
assert.equal(beforeAttackers.result.stateSummary.blockers, 'None declared yet');

let afterBlockers = await collectCombatStep('After blockers');
assert.equal(afterBlockers.session.pendingStateKey, 'combat-attackers');
afterBlockers = await owner.ask({ session: afterBlockers.session, gameId: 'magic', message: 'Colossal Dreadmaw' });
assert.equal(afterBlockers.session.pendingStateKey, 'combat-blockers');
assert.match(afterBlockers.result.answer, /blocking/);
afterBlockers = await owner.ask({ session: afterBlockers.session, gameId: 'magic', message: 'None' });
assert.equal(afterBlockers.session.stage, 'verifying');
assert.equal(afterBlockers.result.stateSummary.attacker, 'Colossal Dreadmaw');
assert.equal(afterBlockers.result.stateSummary.blockers, 'None');

const newRuling = owner.selectGame(owner.createSession(), 'magic');
assert.notEqual(newRuling.session.id, transitionSessionId);
assert.equal(newRuling.session.stage, 'intent');
assert.equal(newRuling.session.helpIntent, null);
assert.equal(newRuling.session.pendingStateKey, null);
assert.equal(newRuling.session.magicState.activePlayer, null);
assert.equal(newRuling.session.magicState.stack.known, false);

let stackContents = owner.selectGame(owner.createSession(), 'magic');
for (const answer of ['Check a play', 'Mine', 'Precombat Main', 'Me']) {
  stackContents = await owner.ask({ session: stackContents.session, gameId: 'magic', message: answer });
}
stackContents = await owner.ask({ session: stackContents.session, gameId: 'magic', message: 'Not empty' });
assert.equal(stackContents.session.stage, 'collecting');
assert.equal(stackContents.session.pendingStateKey, 'stack-items');
assert.equal(stackContents.session.magicState.stack.empty, false);
assert.deepEqual(stackContents.session.magicState.stack.items, []);
assert.ok(getMissingRequiredMagicState(stackContents.session.magicState).includes('stack-items'));
assert.equal(stackContents.session.conversation.filter((entry) => entry.role === 'assistant' && entry.text === 'What spell or ability is currently on the stack?').length, 1);

let targetedStackContents = owner.selectGame(owner.createSession(), 'magic');
for (const answer of ['Check a play', 'Mine', 'Precombat Main', 'Me', 'Not empty']) {
  targetedStackContents = await owner.ask({ session: targetedStackContents.session, gameId: 'magic', message: answer });
}
targetedStackContents = await owner.ask({ session: targetedStackContents.session, gameId: 'magic', message: 'Murder targeting Grizzly Bears' });
assert.equal(targetedStackContents.session.pendingStateKey, 'stack-response-choice');
targetedStackContents = await owner.ask({ session: targetedStackContents.session, gameId: 'magic', message: 'No response' });
assert.equal(targetedStackContents.session.stage, 'verifying');
assert.equal(targetedStackContents.session.magicState.stack.items.length, 1);
assert.equal(targetedStackContents.session.magicState.stack.items[0].name, 'Murder');
assert.equal(targetedStackContents.session.magicState.stack.items[0].targets[0].descriptor, 'grizzly bears');

stackContents = await owner.ask({ session: stackContents.session, gameId: 'magic', message: 'Divination' });
assert.equal(stackContents.session.magicState.stack.empty, false);
assert.equal(stackContents.session.magicState.stack.items.length, 1);
assert.equal(stackContents.session.magicState.stack.items[0].name, 'Divination');
assert.equal(stackContents.session.magicState.stack.items[0].kind, 'spell');
assert.ok(!getMissingRequiredMagicState(stackContents.session.magicState).includes('stack-items'));
assert.equal(stackContents.session.stage, 'collecting');
assert.equal(stackContents.session.pendingStateKey, 'stack-response-choice');
stackContents = await owner.ask({ session: stackContents.session, gameId: 'magic', message: 'No response' });
assert.equal(stackContents.session.stage, 'verifying');
assert.equal(stackContents.session.pendingStateKey, null);
assert.equal(stackContents.result.stateSummary.stack, 'Divination');
assert.equal(stackContents.result.stateSummary.combat, 'Not in combat');
assert.equal(stackContents.session.conversation.filter((entry) => entry.role === 'assistant' && entry.text === 'What spell or ability is currently on the stack?').length, 1);

async function collectQualifiedBlocker(blockerAnswer, attackerAnswer = 'my Grizzly Bears') {
  let current = await collectCombatStep('After blockers');
  current = await owner.ask({ session: current.session, gameId: 'magic', message: attackerAnswer });
  assert.equal(current.session.pendingStateKey, 'combat-blockers');
  const blockerPromptCount = current.session.conversation.filter((entry) => entry.role === 'assistant' && entry.text.startsWith('What creature or creatures are blocking?')).length;
  current = await owner.ask({ session: current.session, gameId: 'magic', message: blockerAnswer });
  assert.equal(current.session.stage, 'verifying');
  assert.equal(current.session.pendingStateKey, null);
  assert.equal(current.session.conversation.filter((entry) => entry.role === 'assistant' && entry.text.startsWith('What creature or creatures are blocking?')).length, blockerPromptCount);
  return current;
}

for (const blockerAnswer of ["opponents grizzly bears", "opponent's Grizzly Bears", 'their Grizzly Bears']) {
  const qualified = await collectQualifiedBlocker(blockerAnswer);
  const attacker = qualified.session.magicState.battlefield.find((object) => object.roles?.includes('attacker'));
  const blocker = qualified.session.magicState.battlefield.find((object) => object.roles?.includes('blocker'));
  assert.equal(attacker.name, 'Grizzly Bears');
  assert.equal(attacker.controller, 'player');
  assert.equal(blocker.name, 'Grizzly Bears');
  assert.equal(blocker.controller, 'opponent');
  assert.notEqual(attacker.id, blocker.id);
  assert.equal(qualified.result.stateSummary.attacker, 'Your Grizzly Bears');
  assert.equal(qualified.result.stateSummary.blockers, "Opponent's Grizzly Bears");
}

const yourAttacker = await collectQualifiedBlocker("opponent's Grizzly Bears", 'your Grizzly Bears');
assert.equal(yourAttacker.session.magicState.battlefield.find((object) => object.roles?.includes('attacker'))?.controller, 'player');

const roleQualifiedBlocker = await collectQualifiedBlocker('their blocker, Grizzly Bears');
assert.equal(roleQualifiedBlocker.session.magicState.battlefield.find((object) => object.roles?.includes('blocker'))?.controller, 'opponent');

const exactOutcomeQuestion = 'If I Murder their blocker, does my Grizzly Bears deal 2 damage to my opponent?';
let exactOutcome = await collectQualifiedBlocker("Opponent's Grizzly Bears", 'My Grizzly Bears');
const exactOutcomeScenario = compileVerifiedMagicScenario({
  message: exactOutcomeQuestion,
  cards: [...exactOutcome.session.magicState.cards, catalog.find((card) => card.name === 'Murder')],
  verifiedState: exactOutcome.session.magicState
});
assert.equal(exactOutcomeScenario.questionIntent, 'combat-outcome');
assert.equal(exactOutcomeScenario.questionedAction?.type, 'Cast');
assert.equal(exactOutcomeScenario.questionedAction?.source?.name, 'Murder');
assert.equal(exactOutcomeScenario.objects.find((object) => object.id === exactOutcomeScenario.questionedAction?.targets[0]?.objectId)?.roles[0], 'blocker');
assert.equal(exactOutcomeScenario.combat.interventionWindow, 'after-blockers');
exactOutcome = await owner.ask({ session: exactOutcome.session, gameId: 'magic', message: 'Looks Right' });
exactOutcome = await owner.ask({ session: exactOutcome.session, gameId: 'magic', message: exactOutcomeQuestion });
assert.equal(exactOutcome.result.verdict, 'no');
assert.match(exactOutcome.result.answer, /remains blocked/i);
assert.match(exactOutcome.result.answer, /blocker.*removed/i);
assert.match(exactOutcome.result.answer, /does not have trample/i);
assert.match(exactOutcome.result.answer, /0 combat damage to opponent/i);
assert.doesNotMatch(exactOutcome.result.answer, /Murder is an instant|you can cast it/i);

console.log(JSON.stringify({
  verifier: 'InstaJudge conversational canonical state',
  flows: 19,
  assertions: 264,
  status: 'PASS'
}, null, 2));
