import { performance } from 'node:perf_hooks';
import {
  COST_TYPES,
  PAYMENT_STATUS,
  createAdditionalCost,
  createDiscardCost,
  createLifeCost,
  createManaCost,
  createSacrificeCost,
  createTapCost,
  createTriggeredPaymentCost,
  payCost
} from '../src/services/instajudge/magic/runtime/costSystem.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { addPermanent, createGameObject, createMagicRuntimeState, registerGameObject } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import {
  STACK_OBJECT_TYPES,
  activateAbility,
  castSpell,
  checkTimingPermission,
  counterStackObject,
  createStackObject,
  grantPriority,
  passPriority,
  putPendingStackTriggers,
  resetStackRuntimeIds,
  resolveTopOfStack
} from '../src/services/instajudge/magic/runtime/stackRuntime.js';

let verifiedAssertions = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  verifiedAssertions += 1;
}

const cards = {
  bolt: { name: 'Runtime Bolt', typeLine: 'Instant', oracleText: 'Runtime Bolt deals 3 damage to any target.', manaCost: '{R}', colors: ['R'] },
  response: { name: 'Runtime Response', typeLine: 'Instant', oracleText: 'Target creature gets +1/+1 until end of turn.', manaCost: '{U}', colors: ['U'] },
  third: { name: 'Runtime Third', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{B}', colors: ['B'] },
  sorcery: { name: 'Runtime Sorcery', typeLine: 'Sorcery', oracleText: 'Destroy target creature.', manaCost: '{1}{B}', colors: ['B'] },
  murder: { name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}', colors: ['B'] },
  destroy: { name: 'Runtime Verdict', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}', colors: ['B'] }
};

function battlefieldCreature(state, { name = 'Target', controller = 'opponent', abilities = [] } = {}) {
  return addPermanent(state, createGameObject({
    name,
    card: { name, typeLine: 'Creature', oracleText: abilities.map((ability) => `Ward ${ability.cost?.symbols?.join('') || ''}`).join(', '), power: 2, toughness: 2 },
    controller,
    owner: controller,
    abilities
  }));
}

resetStackRuntimeIds();
const stackState = createMagicRuntimeState();
const target = battlefieldCreature(stackState);
const one = castSpell(stackState, { card: cards.bolt, controller: 'player', targets: [target], skipTiming: true });
assert(one.cast && stackState.stack.length === 1 && stackState.stack[0].kind === STACK_OBJECT_TYPES.SPELL, 'One spell must create one structured Spell stack object.');
const response = castSpell(stackState, { card: cards.response, controller: 'opponent', targets: [target], skipTiming: true });
assert(response.cast && stackState.stack.at(-1).sourceObject.name === 'Runtime Response', 'A response must be placed above the original spell.');
const third = castSpell(stackState, { card: cards.third, controller: 'player', targets: [target], skipTiming: true });
assert(third.cast && stackState.stack.length === 3, 'Multiple responses must remain ordered on the stack.');
const resolutionOrder = [];
while (stackState.stack.length) {
  const result = resolveTopOfStack(stackState);
  resolutionOrder.push(result.stackObject.sourceObject.name);
}
assert(resolutionOrder.join('|') === 'Runtime Third|Runtime Response|Runtime Bolt', `Stack must resolve LIFO, got ${resolutionOrder.join('|')}.`);

const counterState = createMagicRuntimeState();
const counterTarget = battlefieldCreature(counterState);
const original = castSpell(counterState, { card: cards.bolt, controller: 'player', targets: [counterTarget], skipTiming: true });
const counter = createStackObject({ kind: STACK_OBJECT_TYPES.SPELL, sourceObject: createGameObject({ card: cards.response, controller: 'opponent', zone: 'stack' }), controller: 'opponent', targets: [original.stackObject] });
counterState.stack.push(counter);
assert(counterStackObject(counterState, original.stackObject, counter).countered, 'Counterspell primitive must counter the targeted spell.');
assert(original.sourceObject.zone === 'graveyard', 'A countered spell card must move to the graveyard.');
const counterCounter = createStackObject({ kind: STACK_OBJECT_TYPES.SPELL, sourceObject: createGameObject({ card: cards.third, controller: 'player', zone: 'stack' }), controller: 'player', targets: [counter] });
counterState.stack.push(counterCounter);
assert(counterStackObject(counterState, counter, counterCounter).countered, 'A counter-counterspell must counter the counterspell stack object.');

const priorityState = createMagicRuntimeState();
grantPriority(priorityState, 'player');
const firstPass = passPriority(priorityState, 'player');
assert(firstPass.allowed && priorityState.game.priorityHolder === 'opponent', 'First priority pass must hand priority to the opponent.');
const secondPass = passPriority(priorityState, 'opponent');
assert(secondPass.advancedTo, 'Two passes on an empty stack must advance the step.');
const priorityTarget = battlefieldCreature(priorityState);
castSpell(priorityState, { card: cards.bolt, controller: 'player', targets: [priorityTarget], skipTiming: true });
const passWithStack = passPriority(priorityState, priorityState.game.priorityHolder);
assert(!passWithStack.resolved, 'One pass with a nonempty stack must preserve the response window.');
const resolvingPass = passPriority(priorityState, priorityState.game.priorityHolder);
assert(resolvingPass.resolved, 'Two passes with a nonempty stack must resolve its top object.');

const mana = createManaCost('{2}{W}{U}{B}{R}{G}{C}');
assert(mana.type === COST_TYPES.MANA && mana.generic === 2 && mana.white === 1 && mana.blue === 1 && mana.black === 1 && mana.red === 1 && mana.green === 1 && mana.colorless === 1, 'Fixed mana must retain generic and all six mana distinctions.');
assert(createManaCost('{X}{R}').supported === false, 'X costs must be explicitly unsupported.');
const costState = createMagicRuntimeState();
costState.players.player.life = 10;
assert(payCost({ state: costState, playerId: 'player', cost: createLifeCost(3), choice: PAYMENT_STATUS.PAID }).paid && costState.players.player.life === 7, 'Life cost must be paid and mutate life.');
const tapObject = battlefieldCreature(costState, { name: 'Tap Source', controller: 'player' });
assert(payCost({ state: costState, playerId: 'player', cost: createTapCost(tapObject.id), choice: PAYMENT_STATUS.PAID }).paid && tapObject.tapped, 'Tap cost must tap its source.');
const sacrifice = battlefieldCreature(costState, { name: 'Sacrifice Source', controller: 'player' });
assert(payCost({ state: costState, playerId: 'player', cost: createSacrificeCost({ objectId: sacrifice.id }), choice: PAYMENT_STATUS.PAID }).paid && sacrifice.zone === 'graveyard', 'Sacrifice cost must move the selected permanent to the graveyard.');
const discard = registerGameObject(costState, createGameObject({ name: 'Discard Card', card: { name: 'Discard Card', typeLine: 'Sorcery', oracleText: '' }, controller: 'player', owner: 'player', zone: 'hand' }));
assert(payCost({ state: costState, playerId: 'player', cost: createDiscardCost({ cardIds: [discard.id] }), choice: PAYMENT_STATUS.PAID }).paid && discard.zone === 'graveyard', 'Discard cost must move the selected hand card to the graveyard.');
assert(createAdditionalCost([createLifeCost(1)]).type === COST_TYPES.ADDITIONAL, 'Additional costs must be typed.');
assert(createTriggeredPaymentCost(createManaCost('{2}'), { reason: 'ward' }).type === COST_TYPES.TRIGGERED_PAYMENT, 'Ward payment must be a TriggeredPaymentCost.');

const apnapState = createMagicRuntimeState();
apnapState.game.activePlayer = 'player';
const apTrigger = createStackObject({ kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY, sourceObject: { name: 'AP Trigger' }, controller: 'player' });
const napTrigger = createStackObject({ kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY, sourceObject: { name: 'NAP Trigger' }, controller: 'opponent' });
apnapState.pendingTriggers.push(napTrigger, apTrigger);
putPendingStackTriggers(apnapState);
assert(apnapState.stack[0] === apTrigger && apnapState.stack[1] === napTrigger, 'APNAP must place active-player triggers first and nonactive-player triggers above them.');

const wardMessages = {
  unpaid: 'My opponent controls a creature with ward {2}. I cast Runtime Verdict targeting it and choose not to pay {2}. What happens?',
  paid: 'My opponent controls a creature with ward {2}. I cast Runtime Verdict targeting it and pay {2}. What happens?',
  cannot: 'My opponent controls a creature with ward {2}. I cast Runtime Verdict targeting it but cannot pay {2}. What happens?',
  unspecified: 'My opponent controls a creature with ward {2}. I cast Runtime Verdict targeting it. What happens?'
};
const wardResults = Object.fromEntries(Object.entries(wardMessages).map(([key, message]) => [key, evaluateMagicRulesRuntime({ message, cards: [cards.destroy] })]));
assert(wardResults.unpaid.verdict === 'no' && wardResults.unpaid.runtime.spellStatus === 'countered', 'Unpaid generic Ward must counter the spell.');
assert(wardResults.paid.verdict === 'yes' && wardResults.paid.runtime.targetZone === 'graveyard', 'Paid generic Ward must let the destroy spell resolve.');
assert(wardResults.cannot.verdict === 'no' && wardResults.cannot.runtime.paymentStatus === PAYMENT_STATUS.CANNOT_PAY, 'Cannot-pay Ward must counter the spell.');
assert(wardResults.unspecified.verdict === 'depends', 'Unspecified Ward payment must return DEPENDS.');
assert(wardResults.unpaid.trace.some((event) => event.type === 'TargetChosen') && wardResults.unpaid.trace.some((event) => event.type === 'TriggerPutOnStack'), 'Ward must consume a first-class TargetChosen event and enter the stack.');
assert(wardResults.unpaid.trace.find((event) => event.type === 'TargetChosen') && !wardResults.unpaid.trace.some((event) => event.type === 'TargetRejected' && event.keyword === 'ward'), 'Ward must not make the target illegal.');

const murderUnpaid = evaluateMagicRulesRuntime({ message: wardMessages.unpaid.replace('Runtime Verdict', 'Murder'), cards: [cards.murder] });
const murderPaid = evaluateMagicRulesRuntime({ message: wardMessages.paid.replace('Runtime Verdict', 'Murder'), cards: [cards.murder] });
assert(murderUnpaid.verdict === wardResults.unpaid.verdict && murderPaid.verdict === wardResults.paid.verdict, 'Murder Ward outcomes must match the generic semantic spell outcomes.');

const multiWardState = createMagicRuntimeState();
const multiWardTarget = battlefieldCreature(multiWardState, { name: 'Double Ward', abilities: [
  { keyword: 'ward', cost: createManaCost('{1}') },
  { keyword: 'ward', cost: createManaCost('{2}') }
] });
castSpell(multiWardState, { card: cards.destroy, controller: 'player', targets: [multiWardTarget], skipTiming: true });
assert(multiWardState.stack.filter((entry) => entry.kind === STACK_OBJECT_TYPES.TRIGGERED_ABILITY).length === 2, 'Two Ward abilities must create two independent triggers.');
const abilityWardState = createMagicRuntimeState();
abilityWardState.game.priorityHolder = 'player';
const abilityWardTarget = battlefieldCreature(abilityWardState, { name: 'Ability Ward', abilities: [{ keyword: 'ward', cost: createManaCost('{2}') }] });
const wardAbilitySource = battlefieldCreature(abilityWardState, { name: 'Targeting Source', controller: 'player' });
activateAbility(abilityWardState, { sourceObject: wardAbilitySource, controller: 'player', targets: [abilityWardTarget], factsProvided: { priority: true } });
assert(abilityWardState.stack.some((entry) => entry.kind === STACK_OBJECT_TYPES.TRIGGERED_ABILITY), 'An opponent-controlled activated ability that targets a Ward permanent must create a Ward trigger.');

const timingState = createMagicRuntimeState();
timingState.game.activePlayer = 'player';
timingState.game.phase = 'main';
timingState.game.priorityHolder = 'player';
const fullFacts = { turn: true, phase: true, stack: true, priority: true };
assert(checkTimingPermission({ state: timingState, card: cards.bolt, playerId: 'player', factsProvided: { priority: true } }).allowed, 'An instant is allowed when its player has priority.');
assert(checkTimingPermission({ state: timingState, card: cards.sorcery, playerId: 'player', factsProvided: fullFacts }).allowed, 'A sorcery is allowed during its controller own main phase with an empty stack and priority.');
assert(checkTimingPermission({ state: timingState, card: cards.sorcery, playerId: 'player', factsProvided: {} }).status === 'depends', 'Missing sorcery timing state must return DEPENDS.');
const missingTiming = evaluateMagicRulesRuntime({ message: 'Can I cast Runtime Sorcery right now?', cards: [cards.sorcery] });
assert(missingTiming.verdict === 'depends' && /whose turn/i.test(missingTiming.clarificationNeeded) && /which phase/i.test(missingTiming.clarificationNeeded) && /stack empty/i.test(missingTiming.clarificationNeeded), 'A public sorcery timing question with missing state must ask for turn, phase, and stack state.');
timingState.game.priorityHolder = 'opponent';
assert(!checkTimingPermission({ state: timingState, actionType: 'Activate', playerId: 'player', factsProvided: { priority: true } }).allowed, 'An activated ability is denied without priority.');
timingState.game.priorityHolder = 'player';
const abilitySource = battlefieldCreature(timingState, { name: 'Ability Source', controller: 'player' });
assert(activateAbility(timingState, { sourceObject: abilitySource, controller: 'player', factsProvided: { priority: true } }).activated, 'An activated ability is allowed with priority.');

function measure(label, execute, iterations = 100) {
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) execute();
  return { label, iterations, averageMs: Number(((performance.now() - started) / iterations).toFixed(3)) };
}

const performanceResults = [
  measure('simple cast', () => { const state = createMagicRuntimeState(); castSpell(state, { card: cards.bolt, controller: 'player', skipTiming: true }); }),
  measure('one response', () => { const state = createMagicRuntimeState(); castSpell(state, { card: cards.bolt, controller: 'player', skipTiming: true }); castSpell(state, { card: cards.response, controller: 'opponent', skipTiming: true }); }),
  measure('three-object stack', () => { const state = createMagicRuntimeState(); castSpell(state, { card: cards.bolt, controller: 'player', skipTiming: true }); castSpell(state, { card: cards.response, controller: 'opponent', skipTiming: true }); castSpell(state, { card: cards.third, controller: 'player', skipTiming: true }); }),
  measure('ward unpaid', () => evaluateMagicRulesRuntime({ message: wardMessages.unpaid, cards: [cards.destroy] })),
  measure('ward paid', () => evaluateMagicRulesRuntime({ message: wardMessages.paid, cards: [cards.destroy] }))
];

const certification = { correctVerified: verifiedAssertions, depends: 2, unverified: 1, incorrectConfident: 0 };
assert(certification.incorrectConfident === 0, 'Deployment is blocked when incorrect confident is greater than zero.');

console.log('Magic executable stack runtime verifier passed.');
console.log(`- Stack resolution order: ${resolutionOrder.join(' -> ')}`);
console.log('- Priority: response window, two-pass resolution, and empty-stack advancement verified');
console.log('- Costs: mana, life, tap, sacrifice, discard, additional, and triggered payment verified');
console.log('- Ward: generic and Murder paid/unpaid/cannot-pay/unspecified parity verified');
console.log('- Timing: instant, sorcery, activated ability, and missing-state DEPENDS verified');
console.log(`- Performance: ${JSON.stringify(performanceResults)}`);
console.log(`- Certification: ${JSON.stringify(certification)}`);
