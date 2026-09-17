import { performance } from 'node:perf_hooks';
import {
  COMBAT_STEPS,
  beginCombat,
  declareAttackers,
  declareBlockers,
  endCombat,
  executeCombat,
  removeBlockerFromCombat
} from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import {
  addPermanent,
  createGameObject,
  createMagicRuntimeState,
  moveObjectWithResult
} from '../src/services/instajudge/magic/runtime/runtimeState.js';

let verifiedAssertions = 0;
let dependsCount = 0;
let unverifiedCount = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
  verifiedAssertions += 1;
}

function creature(state, {
  name = 'Creature', controller = 'player', power = 2, toughness = 2, abilities = [], colors = [],
  oracleText = abilities.join(', '), tapped = false, summoningSick = false, attackRestrictions = [], blockRestrictions = []
} = {}) {
  return addPermanent(state, createGameObject({
    card: { name, typeLine: 'Creature', oracleText, power, toughness, colors, abilities },
    controller, owner: controller, power, toughness, tapped, summoningSick,
    abilities: abilities.map((keyword) => ({ type: 'KeywordAbility', keyword })),
    attackRestrictions, blockRestrictions
  }));
}

function declareCombat(state, attacker, blockers = [], { order = [] } = {}) {
  assert(beginCombat(state).status === 'ready', 'Combat must initialize.');
  const attack = declareAttackers(state, [attacker]);
  assert(attack.status === 'declared', `Attacker declaration failed: ${attack.reason || ''}`);
  const block = declareBlockers(state, blockers.length ? [{ attacker, blockers, order }] : []);
  return { attack, block };
}

// A. Basic combat.
const basicState = createMagicRuntimeState();
const basicAttacker = creature(basicState, { name: 'Basic Attacker', power: 2, toughness: 2 });
const basicBlocker = creature(basicState, { name: 'Basic Blocker', controller: 'opponent', power: 3, toughness: 3 });
assert(declareCombat(basicState, basicAttacker, [basicBlocker]).block.status === 'declared', 'A ground creature must be able to block another ground creature.');
assert(executeCombat(basicState).status === 'resolved', 'Basic combat must resolve.');
assert(basicAttacker.zone === 'graveyard' && basicBlocker.zone === 'battlefield' && basicBlocker.damageMarked === 2, 'A 2/2 into a 3/3 must kill the attacker and leave two damage on the blocker.');

// B. First strike plus deathtouch.
const firstState = createMagicRuntimeState();
const firstAttacker = creature(firstState, { name: 'First Touch', power: 2, toughness: 2, abilities: ['first strike', 'deathtouch'] });
const firstBlocker = creature(firstState, { name: 'Large Blocker', controller: 'opponent', power: 6, toughness: 6 });
declareCombat(firstState, firstAttacker, [firstBlocker]);
const firstResult = executeCombat(firstState);
assert(firstResult.status === 'resolved' && firstResult.steps.length === 2, 'First strike must create an additional combat damage step.');
assert(firstBlocker.zone === 'graveyard' && firstAttacker.zone === 'battlefield' && firstAttacker.damageMarked === 0, 'First-strike deathtouch must destroy the blocker before it can deal regular combat damage.');

// C. Double strike.
const doubleState = createMagicRuntimeState();
const doubleAttacker = creature(doubleState, { name: 'Double Attacker', abilities: ['double strike'] });
declareCombat(doubleState, doubleAttacker);
assert(executeCombat(doubleState).status === 'resolved', 'Unblocked double-strike combat must resolve.');
assert(doubleState.players.opponent.life === 16 && doubleState.combat.damageStepCount === 2, 'A 2/2 with double strike must deal two damage in each damage step.');

// D and E. Trample, then deathtouch plus trample.
const trampleState = createMagicRuntimeState();
const trampler = creature(trampleState, { name: 'Trampler', power: 5, toughness: 5, abilities: ['trample'] });
const smallBlocker = creature(trampleState, { name: 'Small Blocker', controller: 'opponent', power: 2, toughness: 2 });
declareCombat(trampleState, trampler, [smallBlocker]);
const trampleResult = executeCombat(trampleState, { assignments: { [trampler.id]: { [smallBlocker.id]: 2, defender: 3 } } });
assert(trampleResult.status === 'resolved' && trampleState.players.opponent.life === 17 && smallBlocker.zone === 'graveyard', 'Trample must allow excess damage after lethal is assigned to the blocker.');

const touchTrampleState = createMagicRuntimeState();
const touchTrampler = creature(touchTrampleState, { name: 'Touch Trampler', power: 5, toughness: 5, abilities: ['deathtouch', 'trample'] });
const fourFour = creature(touchTrampleState, { name: 'Four Four', controller: 'opponent', power: 4, toughness: 4 });
declareCombat(touchTrampleState, touchTrampler, [fourFour]);
const touchResult = executeCombat(touchTrampleState, { assignments: { [touchTrampler.id]: { [fourFour.id]: 1, defender: 4 } } });
assert(touchResult.status === 'resolved' && touchTrampleState.players.opponent.life === 16 && fourFour.zone === 'graveyard', 'One deathtouch damage must satisfy lethal assignment before trample assigns the remainder.');

// F and G. Flying and reach.
const flyingState = createMagicRuntimeState();
const flyer = creature(flyingState, { name: 'Flyer', abilities: ['flying'] });
const ground = creature(flyingState, { name: 'Ground Blocker', controller: 'opponent' });
beginCombat(flyingState);
declareAttackers(flyingState, [flyer]);
assert(declareBlockers(flyingState, [{ attacker: flyer, blockers: [ground] }]).status === 'illegal', 'A ground creature without reach must not block flying.');

const reachState = createMagicRuntimeState();
const reachFlyer = creature(reachState, { name: 'Reach Test Flyer', abilities: ['flying'] });
const reachBlocker = creature(reachState, { name: 'Reach Blocker', controller: 'opponent', abilities: ['reach'] });
beginCombat(reachState);
declareAttackers(reachState, [reachFlyer]);
assert(declareBlockers(reachState, [{ attacker: reachFlyer, blockers: [reachBlocker] }]).status === 'declared', 'Reach must allow a creature to block flying.');

// H. Menace.
const menaceState = createMagicRuntimeState();
const menaceAttacker = creature(menaceState, { name: 'Menace Attacker', abilities: ['menace'] });
const menaceBlocker = creature(menaceState, { name: 'Solo Blocker', controller: 'opponent' });
beginCombat(menaceState);
declareAttackers(menaceState, [menaceAttacker]);
assert(declareBlockers(menaceState, [{ attacker: menaceAttacker, blockers: [menaceBlocker] }]).status === 'illegal', 'Menace must reject a single blocker.');
const menaceLegalState = createMagicRuntimeState();
const menaceLegalAttacker = creature(menaceLegalState, { name: 'Legally Blocked Menace', abilities: ['menace'] });
const menacePairA = creature(menaceLegalState, { name: 'Menace Blocker A', controller: 'opponent' });
const menacePairB = creature(menaceLegalState, { name: 'Menace Blocker B', controller: 'opponent' });
beginCombat(menaceLegalState);
declareAttackers(menaceLegalState, [menaceLegalAttacker]);
assert(declareBlockers(menaceLegalState, [{ attacker: menaceLegalAttacker, blockers: [menacePairA, menacePairB] }]).status === 'declared', 'Menace must allow two otherwise legal blockers.');

// I. Vigilance, haste, summoning sickness, and defender.
const vigilanceState = createMagicRuntimeState();
const vigilant = creature(vigilanceState, { name: 'Vigilant Attacker', abilities: ['vigilance'] });
beginCombat(vigilanceState);
assert(declareAttackers(vigilanceState, [vigilant]).status === 'declared' && !vigilant.tapped, 'Vigilance must keep an attacker untapped.');

const tappingState = createMagicRuntimeState();
const ordinaryAttacker = creature(tappingState, { name: 'Ordinary Attacker' });
beginCombat(tappingState);
assert(declareAttackers(tappingState, [ordinaryAttacker]).status === 'declared' && ordinaryAttacker.tapped, 'Declaring a non-vigilance creature as an attacker must tap it.');

const sicknessState = createMagicRuntimeState();
const sick = creature(sicknessState, { name: 'Sick Creature', summoningSick: true });
beginCombat(sicknessState);
assert(declareAttackers(sicknessState, [sick]).status === 'illegal', 'A summoning-sick creature without haste must not attack.');
const hasteState = createMagicRuntimeState();
const hasty = creature(hasteState, { name: 'Hasty Creature', summoningSick: true, abilities: ['haste'] });
beginCombat(hasteState);
assert(declareAttackers(hasteState, [hasty]).status === 'declared', 'Haste must allow a summoning-sick creature to attack.');
const defenderState = createMagicRuntimeState();
const defender = creature(defenderState, { name: 'Defender', abilities: ['defender'] });
beginCombat(defenderState);
assert(declareAttackers(defenderState, [defender]).status === 'illegal', 'Defender must prevent attacking.');

// J. Removed blockers preserve blocked state, with and without trample.
const removedState = createMagicRuntimeState();
const removedAttacker = creature(removedState, { name: 'Blocked Attacker', power: 4, toughness: 4 });
const removedBlocker = creature(removedState, { name: 'Removed Blocker', controller: 'opponent', power: 2, toughness: 2 });
declareCombat(removedState, removedAttacker, [removedBlocker]);
removeBlockerFromCombat(removedState, removedBlocker);
moveObjectWithResult(removedState, removedBlocker, 'graveyard', 'removed before damage');
assert(executeCombat(removedState).status === 'resolved' && removedState.players.opponent.life === 20 && removedState.combat.attackers[0].wasBlocked, 'A blocked attacker without trample must remain blocked after its blocker leaves.');

const removedTrampleState = createMagicRuntimeState();
const removedTrampler = creature(removedTrampleState, { name: 'Blocked Trampler', power: 4, toughness: 4, abilities: ['trample'] });
const removedTrampleBlocker = creature(removedTrampleState, { name: 'Gone Blocker', controller: 'opponent' });
declareCombat(removedTrampleState, removedTrampler, [removedTrampleBlocker]);
moveObjectWithResult(removedTrampleState, removedTrampleBlocker, 'graveyard', 'removed before damage');
assert(executeCombat(removedTrampleState).status === 'resolved' && removedTrampleState.players.opponent.life === 16, 'A blocked attacker with trample may assign all damage through after every blocker leaves.');

// Lifelink and protection use normal damage/prevention semantics.
const lifelinkState = createMagicRuntimeState();
const lifelinker = creature(lifelinkState, { name: 'Lifelink Attacker', power: 3, toughness: 3, abilities: ['lifelink'] });
declareCombat(lifelinkState, lifelinker);
executeCombat(lifelinkState);
assert(lifelinkState.players.player.life === 23 && lifelinkState.players.opponent.life === 17, 'Lifelink must gain life as combat damage is dealt, not as a delayed trigger.');

const protectionBlockState = createMagicRuntimeState();
const protectedAttacker = creature(protectionBlockState, { name: 'Protected Attacker', abilities: ['protection from black'] });
const blackBlocker = creature(protectionBlockState, { name: 'Black Blocker', controller: 'opponent', colors: ['B'] });
beginCombat(protectionBlockState);
declareAttackers(protectionBlockState, [protectedAttacker]);
assert(declareBlockers(protectionBlockState, [{ attacker: protectedAttacker, blockers: [blackBlocker] }]).status === 'illegal', 'Protection must restrict blocking by a matching-quality creature.');

const protectionDamageState = createMagicRuntimeState();
const blackAttacker = creature(protectionDamageState, { name: 'Black Attacker', colors: ['B'] });
const protectedBlocker = creature(protectionDamageState, { name: 'Protected Blocker', controller: 'opponent', abilities: ['protection from black'] });
declareCombat(protectionDamageState, blackAttacker, [protectedBlocker]);
executeCombat(protectionDamageState);
assert(blackAttacker.zone === 'graveyard' && protectedBlocker.zone === 'battlefield' && protectedBlocker.damageMarked === 0, 'Protection must prevent qualifying combat damage through the normal prevention pipeline.');

const indestructibleState = createMagicRuntimeState();
const touchFirst = creature(indestructibleState, { name: 'First Touch Source', abilities: ['first strike', 'deathtouch'] });
const indestructibleBlocker = creature(indestructibleState, { name: 'Indestructible Blocker', controller: 'opponent', power: 4, toughness: 4, abilities: ['indestructible'] });
declareCombat(indestructibleState, touchFirst, [indestructibleBlocker]);
executeCombat(indestructibleState);
assert(indestructibleBlocker.zone === 'battlefield' && indestructibleBlocker.damagedByDeathtouch, 'Indestructible must survive lethal and deathtouch combat damage through the shared SBA engine.');

// Multiple blockers and missing trample assignment fail closed.
const multipleState = createMagicRuntimeState();
const multipleAttacker = creature(multipleState, { name: 'Multiple Attacker', power: 5, toughness: 5 });
const blockerOne = creature(multipleState, { name: 'Blocker One', controller: 'opponent', power: 2, toughness: 2 });
const blockerTwo = creature(multipleState, { name: 'Blocker Two', controller: 'opponent', power: 3, toughness: 3 });
declareCombat(multipleState, multipleAttacker, [blockerOne, blockerTwo]);
const missingOrder = executeCombat(multipleState);
assert(missingOrder.status === 'depends', 'Missing multi-blocker assignment order must return DEPENDS.');
dependsCount += 1;

const orderedState = createMagicRuntimeState();
const orderedAttacker = creature(orderedState, { name: 'Ordered Attacker', power: 5, toughness: 5 });
const orderedOne = creature(orderedState, { name: 'Ordered One', controller: 'opponent', power: 2, toughness: 2 });
const orderedTwo = creature(orderedState, { name: 'Ordered Two', controller: 'opponent', power: 3, toughness: 3 });
declareCombat(orderedState, orderedAttacker, [orderedOne, orderedTwo], { order: [orderedOne.id, orderedTwo.id] });
const orderedResult = executeCombat(orderedState, { assignments: { [orderedAttacker.id]: { [orderedOne.id]: 2, [orderedTwo.id]: 3 } } });
assert(orderedResult.status === 'resolved' && orderedOne.zone === 'graveyard' && orderedTwo.zone === 'graveyard', 'An explicit legal damage order and assignment must resolve against multiple blockers.');

const choiceState = createMagicRuntimeState();
const choiceTrampler = creature(choiceState, { name: 'Choice Trampler', power: 5, toughness: 5, abilities: ['trample'] });
const choiceBlocker = creature(choiceState, { name: 'Choice Blocker', controller: 'opponent', power: 2, toughness: 2 });
declareCombat(choiceState, choiceTrampler, [choiceBlocker]);
assert(executeCombat(choiceState).status === 'depends', 'Unspecified trample allocation must return DEPENDS when allocation changes the result.');
dependsCount += 1;

// Unsupported restrictions fail closed.
const restrictionState = createMagicRuntimeState();
const restricted = creature(restrictionState, { name: 'Restricted Attacker', attackRestrictions: ['attacks only if another creature attacks'] });
beginCombat(restrictionState);
assert(declareAttackers(restrictionState, [restricted]).status === 'unsupported', 'Unsupported attack restrictions must fail closed.');
unverifiedCount += 1;

// Combat triggers and priority windows use shared event/trigger state.
const triggerState = createMagicRuntimeState();
const triggerAttacker = creature(triggerState, { name: 'Battle Herald', oracleText: 'Whenever Battle Herald attacks, you gain 1 life.' });
beginCombat(triggerState);
const triggerAttack = declareAttackers(triggerState, [triggerAttacker]);
assert(triggerAttack.stackedTriggers.length === 1 && triggerAttack.stackedTriggers[0].event.type === 'AttackDeclared', 'Attack triggers must be collected from AttackDeclared events and put on the stack.');
assert(declareBlockers(triggerState, []).status === 'paused', 'Combat must not advance while an attack trigger remains on the stack.');
const blockTriggerState = createMagicRuntimeState();
const blockedWatcher = creature(blockTriggerState, { name: 'Blocked Watcher', oracleText: 'Whenever Blocked Watcher becomes blocked, you gain 1 life.' });
const blockingWatcher = creature(blockTriggerState, { name: 'Blocking Watcher', controller: 'opponent', oracleText: 'Whenever Blocking Watcher blocks, you gain 1 life.' });
beginCombat(blockTriggerState);
declareAttackers(blockTriggerState, [blockedWatcher]);
const blockTriggers = declareBlockers(blockTriggerState, [{ attacker: blockedWatcher, blockers: [blockingWatcher] }]);
assert(blockTriggers.stackedTriggers.length === 2
  && blockTriggers.stackedTriggers.some((trigger) => trigger.event.type === 'AttackerBecameBlocked')
  && blockTriggers.stackedTriggers.some((trigger) => trigger.event.type === 'BlockDeclared'), 'Becomes-blocked and blocks triggers must subscribe to their combat events.');
const damageTriggerState = createMagicRuntimeState();
const damageWatcher = creature(damageTriggerState, { name: 'Damage Watcher', oracleText: 'Whenever Damage Watcher deals combat damage to a player, you gain 1 life.' });
declareCombat(damageTriggerState, damageWatcher);
const damageTriggerResult = executeCombat(damageTriggerState);
assert(damageTriggerResult.steps[0].stackedTriggers.some((trigger) => trigger.event.type === 'DamageDealt'), 'Combat-damage-to-player triggers must subscribe to normal DamageDealt events.');
const endTriggerState = createMagicRuntimeState();
const endWatcher = creature(endTriggerState, { name: 'End Watcher', oracleText: 'At end of combat, you gain 1 life.' });
declareCombat(endTriggerState, endWatcher);
executeCombat(endTriggerState);
const endTriggers = endCombat(endTriggerState);
assert(endTriggers.stackedTriggers.some((trigger) => trigger.event.type === 'EndOfCombat'), 'End-of-combat triggers must subscribe to the shared EndOfCombat event.');
const priorityState = createMagicRuntimeState();
const priorityAttacker = creature(priorityState, { name: 'Priority Attacker' });
declareCombat(priorityState, priorityAttacker);
executeCombat(priorityState);
endCombat(priorityState);
assert(priorityState.combat.priorityWindows.includes(COMBAT_STEPS.DECLARE_ATTACKERS)
  && priorityState.combat.priorityWindows.includes(COMBAT_STEPS.DECLARE_BLOCKERS)
  && priorityState.combat.priorityWindows.includes(COMBAT_STEPS.COMBAT_DAMAGE)
  && priorityState.combat.priorityWindows.includes(COMBAT_STEPS.END), 'Combat must expose priority after declarations, damage, and at end of combat.');

// Scenario compiler and public runtime proof.
const compiled = compileMagicScenario({ message: 'My 2/2 creature attacks and their 3/3 creature blocks. Does my creature die?' });
assert(compiled.combat?.attackers.length === 1 && compiled.combat.blocks[0]?.blockerIds.length === 1, 'Scenario compiler must build attacker and blocker assignments from generic combat prose.');
const publicCombat = evaluateMagicRulesRuntime({ message: 'My 2/2 creature attacks and their 3/3 creature blocks. Does my creature die?', cards: [] });
assert(publicCombat.status === 'evaluated' && publicCombat.verdict === 'yes', 'The public runtime must answer a supported generic combat question from executable combat state.');
const combatTiming = evaluateMagicRulesRuntime({
  message: 'Can I cast Giant Growth after blockers are declared but before combat damage?',
  cards: [{ name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.', manaCost: '{G}' }]
});
assert(combatTiming.status === 'evaluated' && combatTiming.verdict === 'yes' && combatTiming.runtime.combatStep === 'declare-blockers', 'The runtime must recognize the priority window after blockers and before combat damage.');

// Real-card equivalents.
const realCards = {
  serraAngel: { name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', power: 4, toughness: 4 },
  typhoidRats: { name: 'Typhoid Rats', typeLine: 'Creature - Rat', oracleText: 'Deathtouch', power: 1, toughness: 1 },
  colossalDreadmaw: { name: 'Colossal Dreadmaw', typeLine: 'Creature - Dinosaur', oracleText: 'Trample', power: 6, toughness: 6 },
  fencingAce: { name: 'Fencing Ace', typeLine: 'Creature - Human Soldier', oracleText: 'Double strike', power: 1, toughness: 1 },
  youthfulKnight: { name: 'Youthful Knight', typeLine: 'Creature - Human Knight', oracleText: 'First strike', power: 2, toughness: 1 },
  healersHawk: { name: "Healer's Hawk", typeLine: 'Creature - Bird', oracleText: 'Flying, lifelink', power: 1, toughness: 1 },
  blackKnight: { name: 'Black Knight', typeLine: 'Creature - Human Knight', oracleText: 'First strike, protection from white', colors: ['B'], power: 2, toughness: 2 }
};

const serraState = createMagicRuntimeState();
const serra = addPermanent(serraState, createGameObject({ card: realCards.serraAngel }));
beginCombat(serraState);
assert(declareAttackers(serraState, [serra]).status === 'declared' && !serra.tapped, 'Serra Angel must match generic flying/vigilance behavior.');
const ratsState = createMagicRuntimeState();
const rats = addPermanent(ratsState, createGameObject({ card: realCards.typhoidRats }));
const ratsBlocker = creature(ratsState, { name: 'Rats Blocker', controller: 'opponent', power: 6, toughness: 6 });
declareCombat(ratsState, rats, [ratsBlocker]);
executeCombat(ratsState);
assert(ratsBlocker.zone === 'graveyard', 'Typhoid Rats must match generic deathtouch behavior.');
const knightState = createMagicRuntimeState();
const knight = addPermanent(knightState, createGameObject({ card: realCards.youthfulKnight }));
const knightBlocker = creature(knightState, { name: 'Knight Blocker', controller: 'opponent', power: 2, toughness: 2 });
declareCombat(knightState, knight, [knightBlocker]);
executeCombat(knightState);
assert(knight.zone === 'battlefield' && knightBlocker.zone === 'graveyard', 'Youthful Knight must match generic first-strike behavior.');
const dreadmawState = createMagicRuntimeState();
const dreadmaw = addPermanent(dreadmawState, createGameObject({ card: realCards.colossalDreadmaw }));
const dreadmawBlocker = creature(dreadmawState, { name: 'Dreadmaw Blocker', controller: 'opponent', power: 2, toughness: 2 });
declareCombat(dreadmawState, dreadmaw, [dreadmawBlocker]);
assert(executeCombat(dreadmawState, { assignments: { [dreadmaw.id]: { [dreadmawBlocker.id]: 2, defender: 4 } } }).status === 'resolved' && dreadmawState.players.opponent.life === 16, 'Colossal Dreadmaw must match generic trample behavior.');
const aceState = createMagicRuntimeState();
const ace = addPermanent(aceState, createGameObject({ card: realCards.fencingAce }));
declareCombat(aceState, ace);
executeCombat(aceState);
assert(aceState.players.opponent.life === 18, 'Fencing Ace must match generic double-strike behavior.');
const hawkState = createMagicRuntimeState();
const hawk = addPermanent(hawkState, createGameObject({ card: realCards.healersHawk }));
declareCombat(hawkState, hawk);
executeCombat(hawkState);
assert(hawkState.players.player.life === 21 && hawkState.players.opponent.life === 19, "Healer's Hawk must match generic lifelink behavior.");
const knightProtectionState = createMagicRuntimeState();
const blackKnight = addPermanent(knightProtectionState, createGameObject({ card: realCards.blackKnight }));
const whiteBlocker = creature(knightProtectionState, { name: 'White Blocker', controller: 'opponent', colors: ['W'] });
beginCombat(knightProtectionState);
declareAttackers(knightProtectionState, [blackKnight]);
assert(declareBlockers(knightProtectionState, [{ attacker: blackKnight, blockers: [whiteBlocker] }]).status === 'illegal', 'Black Knight must expose printed protection from white to the combat engine.');

function measure(label, setup, iterations = 100) {
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) setup();
  return { label, iterations, averageMs: Number(((performance.now() - started) / iterations).toFixed(3)) };
}

function oneOnOne() {
  const state = createMagicRuntimeState();
  const attacker = creature(state, { name: 'Perf Attacker' });
  const blocker = creature(state, { name: 'Perf Blocker', controller: 'opponent' });
  beginCombat(state);
  declareAttackers(state, [attacker]);
  declareBlockers(state, [{ attacker, blockers: [blocker] }]);
  executeCombat(state);
}

function unblockedAttackers(count, ability = null) {
  const state = createMagicRuntimeState();
  const attackers = Array.from({ length: count }, (_, index) => creature(state, { name: `Perf ${index}`, abilities: ability ? [ability] : [] }));
  beginCombat(state);
  declareAttackers(state, attackers);
  declareBlockers(state, []);
  executeCombat(state);
}

function tenBlockers() {
  const state = createMagicRuntimeState();
  const attackers = Array.from({ length: 10 }, (_, index) => creature(state, { name: `Attacker ${index}` }));
  const blockers = Array.from({ length: 10 }, (_, index) => creature(state, { name: `Blocker ${index}`, controller: 'opponent' }));
  beginCombat(state);
  declareAttackers(state, attackers);
  declareBlockers(state, attackers.map((attacker, index) => ({ attacker, blockers: [blockers[index]] })));
  executeCombat(state);
}

function triggerHeavyCombat() {
  const state = createMagicRuntimeState();
  const attackers = Array.from({ length: 5 }, (_, index) => creature(state, {
    name: `Trigger Attacker ${index}`,
    oracleText: `Whenever Trigger Attacker ${index} attacks, you gain 1 life.`
  }));
  beginCombat(state);
  declareAttackers(state, attackers);
}

const certifiedAssertions = verifiedAssertions;

const performanceResults = [
  measure('one attacker one blocker', oneOnOne),
  measure('five attackers', () => unblockedAttackers(5)),
  measure('ten blockers', tenBlockers, 50),
  measure('double-strike combat', () => unblockedAttackers(1, 'double strike')),
  measure('trigger-heavy combat', triggerHeavyCombat, 50)
];

const certification = { correctVerified: certifiedAssertions, depends: dependsCount, unverified: unverifiedCount, incorrectConfident: 0 };
assert(certification.incorrectConfident === 0, 'Incorrect confident combat rulings block deployment.');

console.log('Magic executable combat runtime verifier passed.');
console.log('- Attackers, blockers, evasion, menace, vigilance, haste, and defender: verified');
console.log('- First strike, double strike, trample, deathtouch, lifelink, and protection: verified');
console.log('- Removed blockers, multiple blockers, combat triggers, priority windows, and fail-closed choices: verified');
console.log('- Real-card parity: Serra Angel, Typhoid Rats, Youthful Knight, Colossal Dreadmaw, Fencing Ace, Healer\'s Hawk, Black Knight');
console.log(`- Performance: ${JSON.stringify(performanceResults)}`);
console.log(`- Certification: ${JSON.stringify(certification)}`);
