import assert from 'node:assert/strict';
import { evaluateMagicScenario } from '../src/services/instajudge/magic/ruleEvaluator.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { createMagicRuntimeState } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { checkSpecialAction, SPECIAL_ACTION_TYPES } from '../src/services/instajudge/magic/runtime/specialActionRuntime.js';
import { checkTimingPermission, TIMING_REASON_CODES } from '../src/services/instajudge/magic/runtime/stackRuntime.js';

const card = {
  bolt: { name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.', manaCost: '{R}', colors: ['R'] },
  divination: { name: 'Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.', manaCost: '{2}{U}', colors: ['U'] },
  bears: { name: 'Grizzly Bears', typeLine: 'Creature - Bear', oracleText: '', manaCost: '{1}{G}', colors: ['G'], power: 2, toughness: 2 },
  dreadmaw: { name: 'Colossal Dreadmaw', typeLine: 'Creature - Dinosaur', oracleText: 'Trample', manaCost: '{4}{G}{G}', colors: ['G'], power: 6, toughness: 6 },
  murder: { name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}', colors: ['B'] },
  growth: { name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.', manaCost: '{G}', colors: ['G'] },
  trespasser: { name: 'Graveyard Trespasser', typeLine: 'Creature - Human Werewolf', oracleText: 'Ward - Discard a card.', manaCost: '{2}{B}', colors: ['B'], power: 3, toughness: 3 },
  restInPeace: { name: 'Rest in Peace', typeLine: 'Enchantment', oracleText: 'If a card or token would be put into a graveyard from anywhere, exile it instead.', manaCost: '{1}{W}', colors: ['W'] },
  serra: { name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', manaCost: '{3}{W}{W}', colors: ['W'], power: 4, toughness: 4 },
  humility: { name: 'Humility', typeLine: 'Enchantment', oracleText: 'All creatures lose all abilities and have base power and toughness 1/1.', manaCost: '{2}{W}{W}', colors: ['W'] },
  opalescence: { name: 'Opalescence', typeLine: 'Enchantment', oracleText: 'Each other non-Aura enchantment is a creature in addition to its other types.', manaCost: '{2}{W}{W}', colors: ['W'] }
};

const cases = [
  ['instant timing', "During my opponent's upkeep, I have priority. Can I cast Lightning Bolt?", [card.bolt], 'yes'],
  ['sorcery response', 'My opponent casts Lightning Bolt during my main phase. Can I respond by casting Divination?', [card.bolt, card.divination], 'no'],
  ['postcombat permanent', 'It is my postcombat main phase, the stack is empty, and I have priority. Can I cast Grizzly Bears?', [card.bears], 'yes'],
  ['land with nonempty stack', 'It is my main phase. I cast Divination and it is still on the stack. Can I play a land before Divination resolves?', [card.divination], 'no'],
  ['after attackers priority', 'After attackers are declared, can I cast Giant Growth?', [card.growth], 'yes'],
  ['after blockers priority', 'After blockers are declared, can I cast Giant Growth?', [card.growth], 'yes'],
  ['first-strike gap explicit', 'It is my turn. My creature with first strike has dealt first-strike combat damage. State-based actions and triggers are finished and I have priority before normal combat damage. Can I cast Giant Growth on another creature?', [card.growth], 'yes'],
  ['first-strike gap ambiguous', 'My creature with first strike has dealt first-strike combat damage. Before normal combat damage, can I cast Giant Growth?', [card.growth], 'depends'],
  ['removal after blockers', 'I attack with Colossal Dreadmaw and my opponent blocks it with a 2/2 creature. After blockers are declared, I destroy the blocker with Murder. Does Colossal Dreadmaw still deal trample damage to my opponent?', [card.dreadmaw, card.murder], 'yes'],
  ['pump after blockers', 'I attack with Colossal Dreadmaw and my opponent blocks it with a 2/2 creature. After blockers are declared, I cast Giant Growth targeting Colossal Dreadmaw. Does the remaining trample damage hit my opponent?', [card.dreadmaw, card.growth], 'yes'],
  ['ward unpaid', 'My opponent controls a 3/3 creature with ward 2. I cast Murder targeting that creature and do not pay ward. Does Murder destroy it?', [card.murder], 'no'],
  ['replacement ambiguity', 'If Serra Angel would die, Rest in Peace exiles it instead. Does it go to the graveyard?', [card.serra, card.restInPeace], 'unverified'],
  ['commander tax', 'My commander costs 4 mana normally. I already cast it once from the command zone. How much does it cost now?', [], 'yes'],
  ['commander damage', 'My commander has dealt 20 combat damage to him. If it hits for 1, does he lose?', [], 'yes'],
  ['multiplayer priority', "It's a four-player Commander game. Turn order is me, Bob, Sarah, Mike. Who gets priority next?", [], 'depends'],
  ['ambiguous ordinary timing', 'It is a main phase. Can I cast Grizzly Bears?', [card.bears], 'depends'],
  ['decisive wrong phase', 'During upkeep, can I cast Divination?', [card.divination], 'no'],
  ['decisive busy stack', 'It is a main phase and Lightning Bolt is on the stack. Can I cast Grizzly Bears?', [card.bolt, card.bears], 'no'],
  ['instant response with priority', 'Lightning Bolt is on the stack and I have priority. Can I cast Giant Growth?', [card.bolt, card.growth], 'yes'],
  ['unsupported layer dependency', 'Humility and Opalescence apply in dependency and timestamp order. What are the creatures?', [card.humility, card.opalescence], 'unverified']
];

let assertions = 0;
const verdicts = { yes: 0, no: 0, depends: 0, unverified: 0 };

for (const [name, message, cards, expected] of cases) {
  const runtime = evaluateMagicRulesRuntime({ message, cards });
  const publicResult = evaluateMagicScenario({ message, cards, rules: [] });
  assert.equal(runtime.verdict, expected, `${name}: runtime expected ${expected}, received ${runtime.verdict}: ${runtime.summary}`);
  assert.equal(publicResult.verdict, expected, `${name}: public mapping expected ${expected}, received ${publicResult.verdict}: ${publicResult.summary}`);
  assert.equal(publicResult.verdict, runtime.verdict, `${name}: public and runtime verdicts diverged.`);
  assertions += 3;
  verdicts[expected] += 1;

  if (name === 'removal after blockers') {
    assert.equal(runtime.runtime.playerDamage, 6, 'Removed blocker must leave all six trample damage available for the defending player.');
    assert.equal(runtime.runtime.blockerZone, 'graveyard', 'Murder must resolve and move the blocker to the graveyard before combat damage.');
    assert(runtime.trace.some((entry) => entry.type === 'SpellCast') && runtime.trace.some((entry) => entry.type === 'StackObjectResolved'), 'Combat intervention must use the canonical cast and stack-resolution path.');
    assertions += 3;
  }
  if (name === 'pump after blockers') {
    assert.equal(runtime.runtime.playerDamage, 7, 'Giant Growth must affect the trample assignment after blockers.');
    assertions += 1;
  }
}

const busyState = createMagicRuntimeState({
  scenario: {
    objects: [], continuousEffects: [],
    game: { activePlayer: 'player', phase: 'main', step: 'precombat-main', priorityHolder: null }
  }
});
busyState.stack.push({ id: 'parity-stack-object', kind: 'Spell' });
const incompleteFacts = { turn: false, phase: true, stack: true, priority: false, landAllowance: false };
const sorceryDenial = checkTimingPermission({ state: busyState, card: card.divination, actionType: 'Cast', playerId: 'player', factsProvided: incompleteFacts });
assert.equal(sorceryDenial.code, TIMING_REASON_CODES.STACK_NOT_EMPTY, 'A known nonempty stack must deny sorcery timing before unrelated missing facts are requested.');
const landDenial = checkSpecialAction({ state: busyState, actionType: SPECIAL_ACTION_TYPES.PLAY_LAND, playerId: 'player', card: { name: 'Parity Land', typeLine: 'Land', oracleText: '' }, sourceZone: 'hand', factsProvided: incompleteFacts });
assert.equal(landDenial.code, 'STACK_NOT_EMPTY', 'A known nonempty stack must deny a land play before unrelated missing facts are requested.');
assertions += 2;

console.log(JSON.stringify({
  verifier: 'Magic public/runtime parity',
  publicCases: cases.length,
  assertions,
  verdicts,
  incorrectConfident: 0,
  status: 'PASS'
}, null, 2));
