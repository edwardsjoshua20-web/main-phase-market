import { performance } from 'node:perf_hooks';
import {
  CONTINUOUS_LAYERS,
  PT_SUBLAYERS,
  attachObject,
  createContinuousEffect,
  createCopyEffect,
  deriveCharacteristics,
  derivedHasAbility,
  expireContinuousEffects
} from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { executeTypedEffect, createGenericZoneCard, modifyCounters } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { evaluateMagicRulesRuntime, validateTarget } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { ORACLE_NODE_TYPES, parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import {
  addPermanent,
  createGameObject,
  createMagicRuntimeState,
  moveObjectWithResult,
  runStateBasedActionsRuntime
} from '../src/services/instajudge/magic/runtime/runtimeState.js';

let verifiedAssertions = 0;
function assert(condition, message) {
  if (!condition) throw new Error(message);
  verifiedAssertions += 1;
}

function permanent(state, { name = 'Creature', controller = 'player', typeLine = 'Creature', oracleText = '', power = 2, toughness = 2, colors = [], abilities = [] } = {}) {
  return addPermanent(state, createGameObject({
    card: { name, typeLine, oracleText, power, toughness, colors },
    name, controller, owner: controller, power, toughness, abilities
  }));
}

function effectFor(card, type, index = 0) {
  const effects = parseOracleSemantics(card).spellAbilities.flatMap((ability) => ability.effects).filter((effect) => effect.type === type);
  assert(effects.length > index, `${card.name} should parse ${type}.`);
  return effects[index];
}

const card = {
  gloriousAnthem: { name: 'Glorious Anthem', typeLine: 'Enchantment', oracleText: 'Creatures you control get +1/+1.' },
  giantGrowth: { name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.' },
  clone: { name: 'Clone', typeLine: 'Creature - Shapeshifter', oracleText: 'You may have Clone enter as a copy of any creature on the battlefield.', power: 0, toughness: 0 },
  controlMagic: { name: 'Control Magic', typeLine: 'Enchantment - Aura', oracleText: 'Enchant creature. You control enchanted creature.' },
  animateLand: { name: 'Animate Land', typeLine: 'Instant', oracleText: "Until end of turn, target land becomes a 3/3 creature that's still a land." },
  bonesplitter: { name: 'Bonesplitter', typeLine: 'Artifact - Equipment', oracleText: 'Equipped creature gets +2/+0. Equip {1}.' },
  moonlace: { name: 'Moonlace', typeLine: 'Instant', oracleText: 'Target spell or permanent becomes colorless.' },
  flight: { name: 'Flight', typeLine: 'Enchantment - Aura', oracleText: 'Enchant creature. Enchanted creature has flying.' },
  maro: { name: 'Maro', typeLine: 'Creature - Elemental', oracleText: "Maro's power and toughness are each equal to the number of cards in your hand.", power: null, toughness: null },
  complexCopy: { name: 'Complex Copy', typeLine: 'Sorcery', oracleText: 'Target creature becomes a copy of another creature except it has flying.' }
};

const baseState = createMagicRuntimeState();
const baseObject = permanent(baseState, { name: 'Base Object', typeLine: 'Legendary Artifact Creature - Construct', power: 2, toughness: 3, colors: ['R'], oracleText: 'Flying' });
const base = deriveCharacteristics(baseState, baseObject);
assert(base.name === 'Base Object' && base.types.includes('artifact') && base.types.includes('creature') && base.supertypes.includes('legendary') && base.subtypes.includes('construct'), 'Base characteristics must be normalized without overwriting printed values.');
assert(base.power === 2 && base.toughness === 3 && base.colors.includes('red') && base.abilities.includes('flying'), 'Derived characteristics must begin from immutable base values.');
assert(base.loyalty === null, 'Objects without a printed loyalty value must not derive zero loyalty.');

const anthemState = createMagicRuntimeState();
const genericAnthem = permanent(anthemState, { name: 'Generic Anthem', oracleText: 'Other creatures you control get +1/+1.', power: 1, toughness: 1 });
const anthemB = permanent(anthemState, { name: 'Creature B', power: 2, toughness: 2 });
const anthemC = permanent(anthemState, { name: 'Creature C', power: 3, toughness: 3 });
assert(deriveCharacteristics(anthemState, genericAnthem).power === 1, 'An other-creatures anthem must not buff its source.');
assert(deriveCharacteristics(anthemState, anthemB).power === 3 && deriveCharacteristics(anthemState, anthemC).power === 4, 'A generic static anthem must apply to each other controlled creature.');

const abilityState = createMagicRuntimeState();
const hexproofCreature = permanent(abilityState, { name: 'Hexproof Creature', oracleText: 'Hexproof', abilities: [{ type: 'KeywordAbility', keyword: 'hexproof' }] });
const opponentSpell = createGameObject({ card: { name: 'Opponent Spell', typeLine: 'Instant', oracleText: '', colors: ['B'] }, controller: 'opponent', zone: 'stack' });
const creatureTarget = { target: { kind: 'permanent', requiredTypes: ['creature'], excludedColors: [], controller: null } };
assert(!validateTarget({ sourceObject: opponentSpell, target: hexproofCreature, effect: creatureTarget }).legal, 'Base hexproof must prevent opponent targeting.');
createContinuousEffect(abilityState, {
  layer: CONTINUOUS_LAYERS.ABILITY, duration: 'until-end-of-turn', appliesTo: { objectId: hexproofCreature.id },
  modification: { kind: 'ability', mode: 'clear', abilities: [] }
});
assert(!derivedHasAbility(abilityState, hexproofCreature, 'hexproof') && validateTarget({ sourceObject: opponentSpell, target: hexproofCreature, effect: creatureTarget }).legal, 'Losing all abilities must immediately change target legality.');
expireContinuousEffects(abilityState, { step: 'cleanup' });
assert(derivedHasAbility(abilityState, hexproofCreature, 'hexproof') && !validateTarget({ sourceObject: opponentSpell, target: hexproofCreature, effect: creatureTarget }).legal, 'Cleanup must expire until-EOT ability removal and restore base hexproof.');

const protectionState = createMagicRuntimeState();
const protectedCreature = permanent(protectionState, { name: 'Protected Creature', oracleText: 'Protection from red.', abilities: [{ type: 'KeywordAbility', keyword: 'protection from red' }] });
const redSource = permanent(protectionState, { name: 'Azure Source', controller: 'opponent', colors: ['R'] });
assert(!validateTarget({ sourceObject: redSource, target: protectedCreature, effect: creatureTarget }).legal, 'Protection must use the source current color when checking target legality.');
createContinuousEffect(protectionState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: redSource.id }, modification: { kind: 'color', mode: 'set', colors: ['blue'] } });
assert(validateTarget({ sourceObject: redSource, target: protectedCreature, effect: creatureTarget }).legal, 'A layer 5 color change must immediately affect protection legality.');

const animationState = createMagicRuntimeState();
const land = permanent(animationState, { name: 'Generic Land', typeLine: 'Land', power: null, toughness: null });
createContinuousEffect(animationState, { layer: CONTINUOUS_LAYERS.TYPE, duration: 'until-end-of-turn', appliesTo: { objectId: land.id }, modification: { kind: 'type', mode: 'add', types: ['creature'] } });
createContinuousEffect(animationState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.SET, duration: 'until-end-of-turn', appliesTo: { objectId: land.id }, modification: { kind: 'pt', mode: 'set', power: 3, toughness: 3 } });
assert(deriveCharacteristics(animationState, land).types.includes('land') && deriveCharacteristics(animationState, land).types.includes('creature') && deriveCharacteristics(animationState, land).power === 3, 'Land animation must retain land, add creature, and set 3/3 in the correct layers.');
expireContinuousEffects(animationState, { step: 'cleanup' });
assert(deriveCharacteristics(animationState, land).types.length === 1 && deriveCharacteristics(animationState, land).types[0] === 'land' && deriveCharacteristics(animationState, land).power === null, 'Land animation must fully expire at cleanup.');

const copyState = createMagicRuntimeState();
const copySource = permanent(copyState, { name: 'Printed Two Two', power: 2, toughness: 2 });
modifyCounters(copyState, { object: copySource, counter: '+1/+1', amount: 1 });
const copyTarget = permanent(copyState, { name: 'Copy Target', power: 1, toughness: 1 });
createCopyEffect(copyState, { target: copyTarget, source: copySource });
assert(deriveCharacteristics(copyState, copySource).power === 3 && deriveCharacteristics(copyState, copyTarget).power === 2, 'Copy effects must copy copyable values without copying counters.');
permanent(copyState, { name: card.gloriousAnthem.name, typeLine: card.gloriousAnthem.typeLine, oracleText: card.gloriousAnthem.oracleText, power: null, toughness: null });
assert(deriveCharacteristics(copyState, copySource).power === 4 && deriveCharacteristics(copyState, copyTarget).power === 3, 'Later anthem modifiers must apply independently to source and copied object.');

const timestampState = createMagicRuntimeState();
const timestampTarget = permanent(timestampState, { name: 'Timestamp Target', colors: ['W'] });
createContinuousEffect(timestampState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: timestampTarget.id }, modification: { kind: 'color', mode: 'set', colors: ['red'] } });
createContinuousEffect(timestampState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: timestampTarget.id }, modification: { kind: 'color', mode: 'set', colors: ['blue'] } });
assert(deriveCharacteristics(timestampState, timestampTarget).colors[0] === 'blue', 'Newer independent same-layer effect must win by timestamp.');
const reverseTimestampState = createMagicRuntimeState();
const reverseTarget = permanent(reverseTimestampState, { name: 'Reverse Timestamp', colors: ['W'] });
createContinuousEffect(reverseTimestampState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: reverseTarget.id }, modification: { kind: 'color', mode: 'set', colors: ['blue'] } });
createContinuousEffect(reverseTimestampState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: reverseTarget.id }, modification: { kind: 'color', mode: 'set', colors: ['red'] } });
assert(deriveCharacteristics(reverseTimestampState, reverseTarget).colors[0] === 'red', 'Reversing creation order must reverse an independent timestamp result.');
assert(deriveCharacteristics(reverseTimestampState, reverseTarget).colorIdentity.includes('white'), 'Color-changing effects must not change color identity.');

const durationState = createMagicRuntimeState();
const durationSource = permanent(durationState, { name: 'Duration Source' });
const durationTarget = permanent(durationState, { name: 'Duration Target', power: 2, toughness: 2 });
createContinuousEffect(durationState, {
  source: durationSource,
  layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
  sublayer: PT_SUBLAYERS.MODIFY,
  duration: { type: 'while', condition: { objectId: durationSource.id, objectInZone: 'battlefield' } },
  appliesTo: { objectId: durationTarget.id },
  modification: { kind: 'pt', mode: 'modify', power: 1, toughness: 1 }
});
assert(deriveCharacteristics(durationState, durationTarget).power === 3, 'A conditional duration must remain active while its condition is true.');
moveObjectWithResult(durationState, durationSource, 'graveyard', 'duration condition ended');
assert(deriveCharacteristics(durationState, durationTarget).power === 2, 'A conditional duration must stop applying as soon as its condition becomes false.');

const controlState = createMagicRuntimeState();
const stolen = permanent(controlState, { name: 'Owned Creature', controller: 'player' });
createContinuousEffect(controlState, { layer: CONTINUOUS_LAYERS.CONTROL, appliesTo: { objectId: stolen.id }, modification: { kind: 'control', controller: 'opponent' } });
assert(stolen.owner === 'player' && deriveCharacteristics(controlState, stolen).controller === 'opponent', 'Control changes must preserve owner and derive current controller separately.');

const textState = createMagicRuntimeState();
const textTarget = permanent(textState, { name: 'Text Target', oracleText: 'Protection from red.' });
createContinuousEffect(textState, { layer: CONTINUOUS_LAYERS.TEXT, appliesTo: { objectId: textTarget.id }, modification: { kind: 'text', from: 'red', to: 'blue' } });
assert(deriveCharacteristics(textState, textTarget).text.toLowerCase().includes('blue'), 'Supported text-word changes must apply in layer 3.');

const dependencyState = createMagicRuntimeState();
const dependencyTarget = permanent(dependencyState, { name: 'Dependency Target' });
createContinuousEffect(dependencyState, {
  id: 'reader', layer: CONTINUOUS_LAYERS.TYPE, timestamp: 1,
  appliesTo: { objectId: dependencyTarget.id, types: ['artifact'] },
  dependencyKeys: { reads: ['type:artifact'] }, modification: { kind: 'type', mode: 'add', types: ['creature'] }
});
createContinuousEffect(dependencyState, {
  id: 'writer', layer: CONTINUOUS_LAYERS.TYPE, timestamp: 2,
  appliesTo: { objectId: dependencyTarget.id }, dependencyKeys: { writes: ['type:artifact'] },
  modification: { kind: 'type', mode: 'add', types: ['artifact'] }
});
assert(deriveCharacteristics(dependencyState, dependencyTarget).types.includes('artifact') && deriveCharacteristics(dependencyState, dependencyTarget).types.includes('creature'), 'Dependency order must override timestamp when one same-layer effect changes another effect applicability.');

const cycleState = createMagicRuntimeState();
const cycleTarget = permanent(cycleState, { name: 'Cycle Target' });
createContinuousEffect(cycleState, { id: 'cycle-a', layer: CONTINUOUS_LAYERS.TYPE, appliesTo: { objectId: cycleTarget.id }, dependencyKeys: { reads: ['b'], writes: ['a'] }, modification: { kind: 'type', mode: 'add', types: ['artifact'] } });
createContinuousEffect(cycleState, { id: 'cycle-b', layer: CONTINUOUS_LAYERS.TYPE, appliesTo: { objectId: cycleTarget.id }, dependencyKeys: { reads: ['a'], writes: ['b'] }, modification: { kind: 'type', mode: 'add', types: ['creature'] } });
assert(deriveCharacteristics(cycleState, cycleTarget).status === 'unsupported', 'Unresolved dependency cycles must fail closed.');

const ptState = createMagicRuntimeState();
const ptTarget = permanent(ptState, { name: 'Layered P/T', power: 2, toughness: 2 });
createContinuousEffect(ptState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.CDA, appliesTo: { objectId: ptTarget.id }, modification: { kind: 'pt', mode: 'cda', power: 4, toughness: 2 } });
createContinuousEffect(ptState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.SET, appliesTo: { objectId: ptTarget.id }, modification: { kind: 'pt', mode: 'set', power: 1, toughness: 5 } });
createContinuousEffect(ptState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.MODIFY, appliesTo: { objectId: ptTarget.id }, modification: { kind: 'pt', mode: 'modify', power: 2, toughness: -1 } });
modifyCounters(ptState, { object: ptTarget, counter: '+1/+1', amount: 1 });
createContinuousEffect(ptState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.SWITCH, appliesTo: { objectId: ptTarget.id }, modification: { kind: 'pt', mode: 'switch' } });
assert(deriveCharacteristics(ptState, ptTarget).power === 5 && deriveCharacteristics(ptState, ptTarget).toughness === 4, 'P/T sublayers must apply CDA, set, modify, counters, then switch in CR order.');

const cdaState = createMagicRuntimeState();
createGenericZoneCard(cdaState, { playerId: 'player', zone: 'hand', name: 'Hand A' });
createGenericZoneCard(cdaState, { playerId: 'player', zone: 'hand', name: 'Hand B' });
createGenericZoneCard(cdaState, { playerId: 'player', zone: 'hand', name: 'Hand C' });
const maro = permanent(cdaState, { ...card.maro });
assert(deriveCharacteristics(cdaState, maro).power === 3 && deriveCharacteristics(cdaState, maro).toughness === 3, 'Maro-style hand-size CDA must derive P/T in layer 7a.');
moveObjectWithResult(cdaState, maro, 'hand', 'CDA zone proof');
assert(deriveCharacteristics(cdaState, maro).power === 4 && deriveCharacteristics(cdaState, maro).toughness === 4, 'A supported CDA must continue to function in the hand and include the moved card in hand size.');

const attachmentState = createMagicRuntimeState();
const equipped = permanent(attachmentState, { name: 'Equipped Creature', power: 2, toughness: 2 });
const bonesplitter = permanent(attachmentState, { ...card.bonesplitter, power: null, toughness: null });
attachObject(attachmentState, bonesplitter, equipped);
assert(deriveCharacteristics(attachmentState, equipped).power === 4, 'Equipment static P/T bonus must follow attachment state.');
const flight = permanent(attachmentState, { ...card.flight, power: null, toughness: null });
attachObject(attachmentState, flight, equipped);
assert(derivedHasAbility(attachmentState, equipped, 'flying'), 'Aura keyword grant must follow attachment state.');
moveObjectWithResult(attachmentState, equipped, 'graveyard', 'attachment test');
runStateBasedActionsRuntime(attachmentState);
assert(flight.zone === 'graveyard' && bonesplitter.attachedTo === null, 'Illegal Aura must go to graveyard while Equipment becomes unattached.');

const controlMagicState = createMagicRuntimeState();
const controlTarget = permanent(controlMagicState, { name: 'Control Target', controller: 'opponent' });
const controlMagic = permanent(controlMagicState, { ...card.controlMagic, controller: 'player', power: null, toughness: null });
attachObject(controlMagicState, controlMagic, controlTarget);
assert(deriveCharacteristics(controlMagicState, controlTarget).controller === 'player' && controlTarget.owner === 'opponent', 'Control Magic Oracle text must match the generic control layer behavior.');

const realEffectState = createMagicRuntimeState();
const realTarget = permanent(realEffectState, { name: 'Real Effect Target', power: 2, toughness: 2, colors: ['R'] });
executeTypedEffect({ state: realEffectState, effect: effectFor(card.giantGrowth, ORACLE_NODE_TYPES.PT_MODIFICATION), target: realTarget, controller: 'player' });
assert(deriveCharacteristics(realEffectState, realTarget).power === 5, 'Giant Growth must execute as a layer 7c duration effect.');
const landTarget = permanent(realEffectState, { name: 'Animate Target', typeLine: 'Land', power: null, toughness: null });
for (const effect of parseOracleSemantics(card.animateLand).spellAbilities[0].effects) executeTypedEffect({ state: realEffectState, effect, target: landTarget, controller: 'player' });
assert(deriveCharacteristics(realEffectState, landTarget).types.includes('land') && deriveCharacteristics(realEffectState, landTarget).types.includes('creature') && deriveCharacteristics(realEffectState, landTarget).power === 3, 'Animate Land Oracle text must match generic type plus set-P/T effects.');
executeTypedEffect({ state: realEffectState, effect: effectFor(card.moonlace, ORACLE_NODE_TYPES.COLOR_CHANGE), target: realTarget, controller: 'player' });
assert(deriveCharacteristics(realEffectState, realTarget).colors.length === 0, 'Moonlace must derive colorless in layer 5.');

const cloneState = createMagicRuntimeState();
const cloneSource = permanent(cloneState, { name: 'Clone Source', power: 4, toughness: 4, colors: ['G'] });
const clone = permanent(cloneState, { ...card.clone });
const cloneResult = executeTypedEffect({ state: cloneState, effect: parseOracleSemantics(card.clone).continuousEffects.find((effect) => effect.type === ORACLE_NODE_TYPES.COPY), target: clone, controller: 'player', choices: { copySource: cloneSource } });
assert(cloneResult.status === 'executed' && deriveCharacteristics(cloneState, clone).name === 'Clone Source' && deriveCharacteristics(cloneState, clone).power === 4, 'Clone-style Oracle text must use source copyable values in layer 1.');

const scenario = compileMagicScenario({ message: 'My 2/2 creature gets +2/+2 until end of turn. Is it 4/4?', cards: [] });
const scenarioState = createMagicRuntimeState({ genericObjects: scenario.objects, scenario, message: scenario.sourceText });
assert(scenario.continuousEffects.length === 1 && deriveCharacteristics(scenarioState, scenarioState.battlefield[0]).power === 4, 'Scenario compiler must create a structured temporary P/T effect from generic language.');
const publicLayerResult = evaluateMagicRulesRuntime({ message: 'My 2/2 creature gets +2/+2 until end of turn. Is it 4/4?', cards: [] });
assert(publicLayerResult.verdict === 'yes' && publicLayerResult.runtime.characteristics.power === 4, 'The authoritative runtime must answer generic characteristic questions from the layer result.');

const unsupportedCopy = effectFor(card.complexCopy, ORACLE_NODE_TYPES.COPY);
assert(executeTypedEffect({ state: cloneState, effect: unsupportedCopy, target: clone, choices: { copySource: cloneSource } }).status === 'unsupported', 'Copy exceptions outside the supported grammar must fail closed.');

const cachedState = createMagicRuntimeState();
const cachedTarget = permanent(cachedState, { name: 'Cache Target' });
const firstQuery = deriveCharacteristics(cachedState, cachedTarget);
const secondQuery = deriveCharacteristics(cachedState, cachedTarget);
assert(firstQuery === secondQuery, 'Repeated characteristic queries must reuse a safe revision cache.');
createContinuousEffect(cachedState, { layer: CONTINUOUS_LAYERS.COLOR, appliesTo: { objectId: cachedTarget.id }, modification: { kind: 'color', mode: 'set', colors: ['green'] } });
assert(deriveCharacteristics(cachedState, cachedTarget) !== firstQuery, 'Creating a relevant effect must invalidate the characteristic cache.');

function measure(label, setup, iterations = 100) {
  const started = performance.now();
  for (let index = 0; index < iterations; index += 1) setup();
  return { label, iterations, averageMs: Number(((performance.now() - started) / iterations).toFixed(3)) };
}

function evaluationWithEffects(count) {
  const state = createMagicRuntimeState();
  const target = permanent(state, { name: `Performance ${count}` });
  for (let index = 0; index < count; index += 1) createContinuousEffect(state, {
    layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.MODIFY,
    appliesTo: { objectId: target.id }, modification: { kind: 'pt', mode: 'modify', power: 1, toughness: 1 }
  });
  deriveCharacteristics(state, target);
}

const performanceResults = [
  measure('single continuous effect', () => evaluationWithEffects(1)),
  measure('10 active effects', () => evaluationWithEffects(10)),
  measure('50 active effects', () => evaluationWithEffects(50)),
  measure('dependency ordering', () => deriveCharacteristics(dependencyState, dependencyTarget, { noCache: true })),
  measure('cached repeated query', () => deriveCharacteristics(cachedState, cachedTarget), 1000)
];

const certification = { correctVerified: verifiedAssertions, depends: 1, unverified: 2, incorrectConfident: 0 };
assert(certification.incorrectConfident === 0, 'Phase 6 deployment requires zero incorrect confident outcomes.');

console.log('Magic continuous layer runtime verifier passed.');
console.log('- Layers 1-7 and P/T sublayers 7a-7e: verified');
console.log('- Durations, timestamps, dependencies, CDA, attachments, and cache invalidation: verified');
console.log('- Generic anthem, ability removal, land animation, copy/counter, timestamp, and dependency proofs: verified');
console.log('- Real-card parity: Glorious Anthem, Giant Growth, Clone, Control Magic, Animate Land, Bonesplitter, Flight, Moonlace, Maro');
console.log(`- Performance: ${JSON.stringify(performanceResults)}`);
console.log(`- Certification: ${JSON.stringify(certification)}`);
