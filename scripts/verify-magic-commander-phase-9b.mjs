import {
  commanderDesignationFor,
  commanderTaxForCast,
  isDesignatedCommander
} from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { createAdditionalCost, createManaCost } from '../src/services/instajudge/magic/runtime/costSystem.js';
import { evaluateMagicScenario } from '../src/services/instajudge/magic/ruleEvaluator.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import {
  createGameObject,
  createMagicRuntimeState,
  moveObjectWithResult,
  registerGameObject,
  resolveCommanderReturnChoice,
  setPendingRuntimeChoice
} from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { castSpell, counterStackObject } from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { advanceTurnStep } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

const card = {
  id: 'phase-9b-commander',
  oracle_id: 'phase-9b-oracle',
  name: 'Tax Test Commander',
  type_line: 'Legendary Creature - Human Advisor',
  mana_cost: '{4}',
  oracle_text: '',
  power: '4',
  toughness: '4'
};

let assertions = 0;
const metrics = { verifiedSupported: 0, depends: 0, unverified: 0, incorrectConfident: 0 };

function verify(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Phase 9B verification failed: ${message}`);
}

function stateWithCommander({ zone = 'command', casts = 0, secondCommander = false } = {}) {
  const objects = [{
    id: 'commander-a', name: card.name, card, owner: 'player', controller: 'player', zone,
    commander: true, commanderDesignationId: 'designation-a', abilities: [], counters: {}
  }];
  const designations = [{ id: 'designation-a', objectId: 'commander-a', ownerId: 'player', startingZone: zone, castsFromCommandZone: casts }];
  if (secondCommander) {
    objects.push({
      id: 'commander-b', name: 'Second Designated Commander', card: { ...card, id: 'second', name: 'Second Designated Commander' },
      owner: 'player', controller: 'player', zone: 'command', commander: true, commanderDesignationId: 'designation-b', abilities: [], counters: {}
    });
    designations.push({ id: 'designation-b', objectId: 'commander-b', ownerId: 'player', startingZone: 'command', castsFromCommandZone: 0 });
  }
  return createMagicRuntimeState({
    cards: [card, ...(secondCommander ? [{ ...card, id: 'second', name: 'Second Designated Commander' }] : [])],
    message: objects.map((object) => object.name).join(' '),
    scenario: {
      objects,
      continuousEffects: [],
      format: { id: 'commander', commanderDesignations: designations },
      game: {
        activePlayer: 'player', phase: 'main', step: 'precombat-main', priorityHolder: 'player', stackEmpty: true,
        factsProvided: { turn: true, phase: true, stack: true, priority: true }
      }
    }
  });
}

function castFromCommand(state, options = {}) {
  return castSpell(state, {
    sourceObject: state.objects.get(options.objectId || 'commander-a'),
    controller: 'player',
    skipTiming: true,
    ...options
  });
}

for (const [previous, tax, final, after] of [[0, 0, 4, 1], [1, 2, 6, 2], [2, 4, 8, 3]]) {
  const state = stateWithCommander({ casts: previous });
  const cast = castFromCommand(state);
  verify(cast.cast, `The cast with ${previous} previous casts must succeed.`);
  verify(cast.commanderCost.commanderTaxGenericMana === tax, `The cast with ${previous} previous casts must add {${tax}}.`);
  verify(cast.commanderCost.startingManaRequirement.generic === 4 && cast.commanderCost.finalManaRequirement.generic === final, 'The structured result must preserve base and final mana requirements.');
  verify(commanderDesignationFor(state, cast.sourceObject).castsFromCommandZone === after, 'A successful cast must increment the designation count immediately.');
  verify(cast.sourceObject.zone === 'stack', 'The count must increment while the spell is still on the stack, before resolution.');
  metrics.verifiedSupported += 5;
}

const countered = stateWithCommander();
const firstCast = castFromCommand(countered);
verify(commanderDesignationFor(countered, firstCast.sourceObject).castsFromCommandZone === 1, 'The first cast must be recorded before it can be countered.');
verify(counterStackObject(countered, firstCast.stackObject).countered, 'The commander spell must be counterable through the ordinary stack owner.');
verify(countered.pendingChoices[0]?.type === 'CommanderZoneReturnChoice', 'A countered commander must use the Phase 9A return choice after reaching the graveyard.');
resolveCommanderReturnChoice(countered, countered.pendingChoices[0].id, 'command');
const counteredRecast = castFromCommand(countered);
verify(counteredRecast.cast && counteredRecast.commanderCost.commanderTaxGenericMana === 2, 'A countered first cast must make the next command-zone cast cost {2} more.');
metrics.verifiedSupported += 4;

const zones = stateWithCommander({ casts: 1 });
const zoneCommander = zones.objects.get('commander-a');
moveObjectWithResult(zones, zoneCommander, 'battlefield', 'supported setup');
moveObjectWithResult(zones, zoneCommander, 'graveyard', 'destroyed', {}, { commanderReturnChoice: 'command' });
verify(commanderDesignationFor(zones, zoneCommander).castsFromCommandZone === 1, 'Battlefield, graveyard, and command-zone movement must not reset or increment tax.');
verify(castFromCommand(zones).commanderCost.commanderTaxGenericMana === 2, 'Returning to command must preserve the prior cast count.');
metrics.verifiedSupported += 2;

const hand = stateWithCommander({ zone: 'hand', casts: 2 });
const handCommander = hand.objects.get('commander-a');
const handTax = commanderTaxForCast(hand, handCommander, 'player');
const handCast = castSpell(hand, { sourceObject: handCommander, controller: 'player', costs: [createManaCost('{4}')], skipTiming: true });
verify(handTax.genericMana === 0 && handTax.applies === false, 'A hand cast must have no commander tax.');
verify(handCast.cast && commanderDesignationFor(hand, handCommander).castsFromCommandZone === 2, 'A hand cast must not increment command-zone history.');
metrics.verifiedSupported += 2;

const graveyard = stateWithCommander({ zone: 'graveyard', casts: 2 });
const graveCommander = graveyard.objects.get('commander-a');
verify(commanderTaxForCast(graveyard, graveCommander, 'player').genericMana === 0, 'A graveyard cast would receive no commander tax solely from designation.');
metrics.unverified += 1;

const turns = stateWithCommander({ casts: 1 });
for (let index = 0; index < 20; index += 1) advanceTurnStep(turns);
verify(commanderDesignationFor(turns, 'commander-a').castsFromCommandZone === 1, 'Turn advancement must not reset cast history.');
metrics.verifiedSupported += 1;

const copyState = stateWithCommander({ casts: 2 });
const copy = registerGameObject(copyState, createGameObject({ id: 'same-name-copy', card, owner: 'player', controller: 'player', zone: 'hand' }));
verify(!isDesignatedCommander(copyState, copy) && commanderTaxForCast(copyState, copy, 'player').supported === false, 'A same-name nondesignated copy must not inherit tax history.');
verify(commanderTaxForCast(copyState, copy, 'player').status === 'depends', 'Unknown commander designation must fail closed as DEPENDS.');
metrics.verifiedSupported += 1;
metrics.depends += 1;

const insufficient = stateWithCommander({ casts: 1 });
const failed = castFromCommand(insufficient, { availableMana: 5 });
verify(!failed.cast && failed.status === 'cannot-pay', 'Five mana must be insufficient for a {4} commander with {2} tax.');
verify(insufficient.objects.get('commander-a').zone === 'command' && commanderDesignationFor(insufficient, 'commander-a').castsFromCommandZone === 1, 'An insufficient-mana attempt must neither move the commander nor increment tax.');
const exact = stateWithCommander({ casts: 1 });
const exactCast = castFromCommand(exact, { availableMana: 6 });
verify(exactCast.cast && exactCast.commanderCost.availability.payable && commanderDesignationFor(exact, 'commander-a').castsFromCommandZone === 2, 'Exactly six mana must pay {4} plus {2} and increment the count.');
metrics.verifiedSupported += 3;

const additional = stateWithCommander({ casts: 1 });
const extraCost = createAdditionalCost([createManaCost('{1}')]);
const composed = castFromCommand(additional, { costs: [extraCost], availableMana: 7 });
verify(composed.cast && composed.commanderCost.otherAdditionalCosts[0].type === 'AdditionalCost', 'Commander tax must preserve another supported additional cost.');
verify(composed.commanderCost.finalManaRequirement.generic === 7, 'The shared mana pipeline must total {4} base, {2} tax, and {1} other additional cost.');
metrics.verifiedSupported += 2;

for (const chosenValues of [{ genericCostReduction: 1 }, { alternativeCost: '{2}' }, { dynamicCostModifier: true }]) {
  const unsupportedState = stateWithCommander({ casts: 1 });
  const result = castFromCommand(unsupportedState, { chosenValues });
  verify(!result.cast && result.status === 'unsupported' && commanderDesignationFor(unsupportedState, 'commander-a').castsFromCommandZone === 1, 'Unsupported modifiers must fail closed without incrementing tax.');
  metrics.unverified += 1;
}

const pending = stateWithCommander({ casts: 1 });
setPendingRuntimeChoice(pending, { id: 'blocking-choice', type: 'ReplacementChoice', chooser: 'player' });
const pendingCast = castFromCommand(pending, { skipTiming: false, factsProvided: pending.scenario.game.factsProvided });
verify(!pendingCast.cast && pendingCast.timing?.code === 'PENDING_CHOICE', 'A canonical pending choice must block commander casting.');
verify(pending.objects.get('commander-a').zone === 'command' && commanderDesignationFor(pending, 'commander-a').castsFromCommandZone === 1, 'A pending-choice block must not move the commander or increment tax.');
metrics.verifiedSupported += 2;

const independent = stateWithCommander({ casts: 2, secondCommander: true });
const second = castFromCommand(independent, { objectId: 'commander-b' });
verify(second.commanderCost.commanderDesignationId === 'designation-b' && second.commanderCost.commanderTaxGenericMana === 0, 'Each designation must own an independent tax history.');
verify(commanderDesignationFor(independent, 'commander-a').castsFromCommandZone === 2, 'Casting a different designation must not alter the first designation history.');
metrics.verifiedSupported += 2;

const wrongOwner = stateWithCommander({ casts: 1 });
const deniedOwner = castSpell(wrongOwner, { sourceObject: wrongOwner.objects.get('commander-a'), controller: 'opponent', skipTiming: true });
verify(!deniedOwner.cast && commanderDesignationFor(wrongOwner, 'commander-a').castsFromCommandZone === 1, 'A nonowner cannot use command-zone casting permission or change its tax history.');
metrics.verifiedSupported += 1;

const compilerCases = [
  ['This is the third time I am casting my commander Tax Test Commander from the command zone.', 2],
  ['I already cast it once from the command zone. Tax Test Commander is my commander.', 1],
  ['My commander Tax Test Commander has been cast twice from the command zone.', 2]
];
for (const [message, expected] of compilerCases) {
  const compiled = compileMagicScenario({ message, cards: [card] });
  verify(compiled.format.commanderCastHistory.known && compiled.format.commanderCastHistory.castsFromCommandZone === expected, 'Unambiguous natural-language history must compile to the canonical count.');
  metrics.verifiedSupported += 1;
}
const vague = compileMagicScenario({ message: 'I have played my commander Tax Test Commander a bunch. What is the tax?', cards: [card] });
verify(vague.format.commanderCastHistory.known === false, 'Vague cast history must remain unknown.');
metrics.depends += 1;

const publicCases = [
  ['My commander costs 4 mana normally. I already cast it once from the command zone. How much does it cost now?', 'yes'],
  ['My commander was countered the first time. Does it cost two more next time?', 'yes'],
  ["I cast my commander twice already. What's the commander tax?", 'yes'],
  ['If my commander goes back to my hand and I cast it from there, do I pay commander tax?', 'no'],
  ['If I cast my commander from the graveyard, does commander tax apply?', 'no'],
  ['If my commander dies and goes back to the command zone, does the tax reset?', 'no'],
  ['My commander costs 4 mana normally and I cast it once. Can I cast it from the command zone with 5 mana?', 'no'],
  ['I have played my commander a bunch. How much commander tax do I pay?', 'depends'],
  ['I cast my commander once, but I am not sure which source zone I am casting it from now. What is the tax?', 'depends']
];
for (const [message, expected] of publicCases) {
  const runtimeResult = evaluateMagicRulesRuntime({ message, cards: [] });
  verify(runtimeResult.verdict === expected, `Runtime question expected ${expected} but received ${runtimeResult.verdict}: ${message}`);
  const result = evaluateMagicScenario({ message, cards: [], rules: [] });
  verify(result.verdict === expected, `Public question expected ${expected} but received ${result.verdict}: ${message}`);
  if (expected === 'depends') metrics.depends += 1;
  else metrics.verifiedSupported += 1;
}

verify(metrics.incorrectConfident === 0, 'Phase 9B requires zero incorrect confident rulings.');

console.log(JSON.stringify({
  verifier: 'Magic Commander Phase 9B',
  assertions,
  publicCases: publicCases.length,
  ...metrics,
  status: 'PASS'
}, null, 2));
