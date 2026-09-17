import { extractPossibleCardNames } from '../src/services/instajudge/instajudgeCore.js';
import { judgeMagicScenario } from '../src/services/instajudge/magic/magicRulesEngine.js';
import { evaluateMagicRulesRuntime, extractGenericObjects } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { clearOracleSemanticCache, parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';

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

console.log('Magic runtime verifier passed.');
console.log('- Generic dies watcher + two tokens + global damage: 3 triggers');
console.log('- Blood Artist + Pyroclasm: 3 triggers');
console.log(`- Parser resolved named cards: ${resolvedNames.join(', ')}`);
console.log('- Serra Angel + Murder + Gods Willing: NO via runtime target re-check');
console.log('- Complex layer/dependency case: UNVERIFIED');
