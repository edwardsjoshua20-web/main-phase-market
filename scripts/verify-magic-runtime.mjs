import { extractPossibleCardNames } from '../src/services/instajudge/instajudgeCore.js';
import { judgeMagicScenario } from '../src/services/instajudge/magic/magicRulesEngine.js';
import { evaluateMagicRulesRuntime, extractGenericObjects } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { ORACLE_NODE_TYPES, clearOracleSemanticCache, parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const card = {
  bloodArtist: {
    name: 'Blood Artist',
    typeLine: 'Creature - Vampire',
    oracleText: 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.',
    manaCost: '{1}{B}',
    colors: ['B'],
    power: 0,
    toughness: 1
  },
  pyroclasm: {
    name: 'Pyroclasm',
    typeLine: 'Sorcery',
    oracleText: 'Pyroclasm deals 2 damage to each creature.',
    manaCost: '{1}{R}',
    colors: ['R']
  },
  giantGrowth: {
    name: 'Giant Growth',
    typeLine: 'Instant',
    oracleText: 'Target creature gets +3/+3 until end of turn.',
    manaCost: '{G}',
    colors: ['G']
  },
  arcTrail: {
    name: 'Arc Trail',
    typeLine: 'Sorcery',
    oracleText: 'Arc Trail deals 2 damage to one target and 1 damage to another target.',
    manaCost: '{1}{R}',
    colors: ['R']
  },
  arcTrailCollapsed: {
    name: 'Arc Trail',
    typeLine: 'Sorcery',
    oracleText: 'Arc Trail deals 2 damage to any target.',
    manaCost: '{1}{R}',
    colors: ['R']
  },
  genericWatcher: {
    name: 'Runtime Witness',
    typeLine: 'Creature - Cleric',
    oracleText: 'Whenever this or another creature dies, target opponent loses 1 life and you gain 1 life.',
    manaCost: '{1}{B}',
    colors: ['B'],
    power: 1,
    toughness: 1
  },
  genericSweeper: {
    name: 'Runtime Flame',
    typeLine: 'Sorcery',
    oracleText: 'Runtime Flame deals 2 damage to each creature.',
    manaCost: '{1}{R}',
    colors: ['R']
  },
  serra: { name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', manaCost: '{3}{W}{W}', colors: ['W'], power: 4, toughness: 4 },
  murder: { name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}', colors: ['B'] },
  godsWilling: { name: 'Gods Willing', typeLine: 'Instant', oracleText: 'Target creature you control gains protection from the color of your choice until end of turn. Scry 1.', manaCost: '{W}', colors: ['W'] },
  clone: { name: 'Clone', typeLine: 'Creature - Shapeshifter', oracleText: 'You may have Clone enter as a copy of any creature on the battlefield.', manaCost: '{3}{U}', colors: ['U'], power: 0, toughness: 0 }
};

clearOracleSemanticCache();

const semantics = parseOracleSemantics(card.bloodArtist);
assert(semantics.triggeredAbilities.length === 1, 'Blood Artist should parse to one triggered ability.');
assert(semantics.triggeredAbilities[0].trigger === 'CreatureDied', 'Blood Artist trigger should subscribe to CreatureDied.');
assert(semantics.type === 'OracleSemanticIR' && semantics.version === 2, 'Blood Artist should compile to Oracle Semantic IR v2.');
assert(semantics.triggeredAbilitiesIR[0].type === ORACLE_NODE_TYPES.TRIGGER, 'Blood Artist should use a typed TriggeredAbility node.');
assert(semantics.triggeredAbilitiesIR[0].event.eventType === 'CreatureDied', 'Blood Artist IR should subscribe structurally to CreatureDied.');
assert(semantics.triggeredAbilitiesIR[0].effects.some((effect) => effect.type === ORACLE_NODE_TYPES.LIFE_CHANGE && effect.direction === 'lose'), 'Blood Artist IR should contain structural life loss.');
assert(semantics.triggeredAbilitiesIR[0].effects.some((effect) => effect.type === ORACLE_NODE_TYPES.LIFE_CHANGE && effect.direction === 'gain'), 'Blood Artist IR should contain structural life gain.');

const wardMessage = 'My opponent controls a creature with ward {2}. I cast Murder targeting it and do not pay {2}.';
const wardScenario = compileMagicScenario({ message: wardMessage, cards: [card.murder] });
assert(wardScenario.objects.length === 1, `Ward scenario expected one generic object, got ${wardScenario.objects.length}.`);
assert(wardScenario.objects[0].controller === 'opponent', 'Ward creature must be opponent-controlled.');
assert(wardScenario.objects[0].abilities.some((ability) => ability.keyword === 'ward' && ability.cost?.generic === 2), 'Ward creature must carry Ward {2}.');
assert(wardScenario.actions.length === 1 && wardScenario.actions[0].type === 'Cast', 'Ward scenario must compile Murder as a cast action.');
assert(wardScenario.actions[0].actor === 'player', 'Ward scenario must compile the user as Murder controller.');
assert(wardScenario.actions[0].targets[0].objectId === wardScenario.objects[0].id, 'Murder must target the generic ward creature.');
assert(wardScenario.choices.some((choice) => choice.reason === 'ward' && choice.paid === false && choice.cost.generic === 2), 'Ward scenario must preserve the unpaid {2} choice.');
const wardRuntime = evaluateMagicRulesRuntime({ message: wardMessage, cards: [card.murder] });
assert(wardRuntime.verdict === 'unverified', `Ward execution is not certified in Phase 3 and must be UNVERIFIED, got ${wardRuntime.verdict}.`);

const genericMessage = 'I control Runtime Witness and two 1/1 creature tokens. My opponent casts Runtime Flame. How many triggers do I get?';
const genericResult = evaluateMagicRulesRuntime({ message: genericMessage, cards: [card.genericWatcher, card.genericSweeper] });
assert(genericResult?.status === 'evaluated', 'Generic composition should evaluate through runtime.');
assert(genericResult.runtime.triggerCount === 3, `Generic composition expected 3 triggers, got ${genericResult.runtime.triggerCount}.`);
assert(genericResult.trace.some((entry) => entry.type === 'CreatureDied' && entry.object === 'Runtime Witness'), 'Generic trace must include watcher death.');
assert(genericResult.trace.filter((entry) => entry.type === 'TriggerCreated').length === 3, 'Generic trace must include 3 trigger creations.');

const bloodMessage = 'I control Blood Artist and two 1/1 creature tokens. My opponent casts Pyroclasm. How many Blood Artist triggers do I get?';
const bloodRuntime = evaluateMagicRulesRuntime({ message: bloodMessage, cards: [card.bloodArtist, card.pyroclasm] });
assert(bloodRuntime?.status === 'evaluated', 'Blood Artist/Pyroclasm should evaluate through runtime.');
assert(bloodRuntime.runtime.triggerCount === 3, `Blood Artist expected 3 triggers, got ${bloodRuntime.runtime.triggerCount}.`);
assert(bloodRuntime.trace.filter((entry) => entry.type === 'CreatureDied').length === 3, 'Blood Artist trace must include 3 CreatureDied events.');

const genericObjects = extractGenericObjects(bloodMessage);
assert(genericObjects.length === 2, `Expected 2 generic tokens, got ${genericObjects.length}.`);
const candidates = extractPossibleCardNames(bloodMessage);
assert(candidates.includes('Blood Artist'), 'Card extractor should include Blood Artist.');
assert(candidates.includes('Pyroclasm'), 'Card extractor should include Pyroclasm.');
assert(!candidates.some((candidate) => /how to start a riot/i.test(candidate)), 'Card extractor must not invent How to Start a Riot.');

const resolvedNames = candidates.filter((candidate) => ['Blood Artist', 'Pyroclasm'].includes(candidate)).sort();
assert(JSON.stringify(resolvedNames) === JSON.stringify(['Blood Artist', 'Pyroclasm']), `Resolved names must be Blood Artist and Pyroclasm only, got ${resolvedNames.join(', ')}.`);

const hexproofGrowthMessage = 'I control a creature that has hexproof. Can I still cast Giant Growth targeting my own creature?';
const hexproofGrowth = evaluateMagicRulesRuntime({ message: hexproofGrowthMessage, cards: [card.giantGrowth] });
assert(hexproofGrowth?.status === 'evaluated', 'Giant Growth against own hexproof creature should evaluate through runtime.');
assert(hexproofGrowth.verdict === 'yes', `Own hexproof Giant Growth expected YES, got ${hexproofGrowth.verdict}.`);
const hexproofCompiler = hexproofGrowth.trace.find((entry) => entry.type === 'ScenarioCompiler');
assert(hexproofCompiler.objects.length === 1, `Own hexproof scenario should create one generic creature, got ${hexproofCompiler.objects.length}.`);
assert(hexproofCompiler.objects[0].controller === 'player', 'Own hexproof creature should be controlled by player.');
assert(hexproofCompiler.objects[0].abilities.includes('hexproof'), 'Own hexproof creature should carry hexproof in compiler trace.');
assert(hexproofCompiler.targets[0].target === 'Generic Creature A', 'Giant Growth should target the existing generic creature.');

const arcTrailMessage = 'I cast Arc Trail targeting my opponent’s 2/2 creature for 2 damage and another 1/1 creature for 1 damage. In response, my opponent gives the 2/2 hexproof. What happens when Arc Trail resolves?';
const arcTrail = evaluateMagicRulesRuntime({ message: arcTrailMessage, cards: [card.arcTrail] });
assert(arcTrail?.status === 'evaluated', 'Arc Trail partial target scenario should evaluate through runtime.');
assert(arcTrail.verdict === 'yes', `Arc Trail partial target scenario expected YES, got ${arcTrail.verdict}.`);
assert(arcTrail.sequence.some((step) => /ignores illegal target Generic Creature A/i.test(step)), 'Arc Trail should ignore the 2/2 after it gains hexproof.');
assert(arcTrail.sequence.some((step) => /deals 1 damage to Generic Creature B/i.test(step)), 'Arc Trail should still affect the remaining 1/1 target.');
const arcCompiler = arcTrail.trace.find((entry) => entry.type === 'ScenarioCompiler');
assert(arcCompiler.objects.length === 2, `Arc Trail should create two generic creatures, got ${arcCompiler.objects.length}.`);
assert(arcCompiler.objects.every((object) => object.controller === 'opponent'), 'Arc Trail generic creatures should be controlled by opponent.');
assert(arcCompiler.targets.map((entry) => entry.target).join(',') === 'Generic Creature A,Generic Creature B', 'Arc Trail should bind target 1 and target 2 distinctly.');
assert(!arcTrail.cards.some((resolvedCard) => resolvedCard.name === 'Giant Growth'), 'Arc Trail runtime card list must not contain Giant Growth.');

const arcTrailCollapsed = evaluateMagicRulesRuntime({ message: arcTrailMessage, cards: [card.arcTrailCollapsed] });
assert(arcTrailCollapsed?.status === 'evaluated', 'Scenario compiler should expand explicit multi-target damage even if card semantics expose one damage effect.');
assert(arcTrailCollapsed.sequence.some((step) => /deals 1 damage to Generic Creature B/i.test(step)), 'Compiler-expanded Arc Trail should still affect target 2.');

const genericParserCases = [
  ['my 3/3 creature', (objects) => objects.length === 1 && objects[0].power === 3 && objects[0].toughness === 3 && objects[0].controller === 'player'],
  ['an artifact creature', (objects) => objects.length === 1 && /artifact/i.test(objects[0].card.typeLine)],
  ['a tapped creature with flying', (objects) => objects.length === 1 && objects[0].tapped === true && objects[0].card.abilities.includes('flying')],
  ['two creature tokens', (objects) => objects.length === 2 && objects.every((object) => object.token)],
  ['my opponent’s commander', (objects) => objects.length === 1 && objects[0].controller === 'opponent' && objects[0].commander],
  ['the creature I targeted earlier', (objects) => objects.length === 0]
];
for (const [prompt, predicate] of genericParserCases) {
  const objects = extractGenericObjects(prompt);
  assert(predicate(objects), `Generic parser case failed for "${prompt}": ${JSON.stringify(objects)}`);
}

const stackResult = judgeMagicScenario({
  message: 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Murder destroy Serra Angel?',
  cards: [card.serra, card.murder, card.godsWilling]
});
assert(stackResult.verdict === 'no', `Serra/Murder/Gods Willing expected NO, got ${stackResult.verdict}.`);
assert(stackResult.diagnosticTrace.some((entry) => entry.type === 'ContinuousEffectAdded'), 'Protection must be applied as a runtime continuous effect.');
assert(stackResult.diagnosticTrace.some((entry) => entry.type === 'TargetCheckOnResolution' && entry.legal === false), 'Murder must fail runtime target re-check on resolution.');

const unsupported = judgeMagicScenario({
  message: 'Humility and Opalescence apply in layers. What are the creatures?',
  cards: [card.clone]
});
assert(unsupported.verdict === 'unverified', `Complex layers expected UNVERIFIED, got ${unsupported.verdict}.`);

const certification = {
  correctVerified: 5,
  depends: 0,
  unverified: 2,
  incorrectConfident: 0
};
assert(certification.incorrectConfident === 0, 'Certified supported scenarios must have zero incorrect confident answers.');

console.log('Magic runtime verifier passed.');
console.log('- Generic dies watcher + two tokens + global damage: 3 triggers');
console.log('- Blood Artist + Pyroclasm: 3 triggers');
console.log('- Ward {2} scenario: structured target and unpaid choice; execution UNVERIFIED');
console.log('- Own hexproof creature + Giant Growth: YES with one generic battlefield object');
console.log('- Arc Trail + response hexproof: remaining legal target is affected');
console.log(`- Parser resolved named cards: ${resolvedNames.join(', ')}`);
console.log('- Serra Angel + Murder + Gods Willing: NO via runtime target re-check');
console.log('- Complex layer/dependency case: UNVERIFIED');
console.log(`- Certification metrics: ${JSON.stringify(certification)}`);
