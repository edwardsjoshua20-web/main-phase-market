import assert from 'node:assert/strict';
import { addPermanent, createGameObject, createMagicRuntimeState } from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { createGenericZoneCard } from '../src/services/instajudge/magic/runtime/effectRuntime.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import {
  PRIORITY_POLICIES,
  TURN_STEPS,
  advanceTurnStep,
  describeTurnStep,
  getNextTurnStep
} from '../src/services/instajudge/magic/runtime/turnRuntime.js';

let verified = 0;

function expect(condition, message) {
  assert(condition, message);
  verified += 1;
}

function stateAt(step, activePlayer = 'player') {
  const phase = [TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step)
    ? 'beginning'
    : [TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP].includes(step) ? 'ending' : 'main';
  return createMagicRuntimeState({
    scenario: { objects: [], continuousEffects: [], game: { activePlayer, phase, step } }
  });
}

function creature(state, { name, controller = 'player', power = 2, toughness = 2, abilities = [] }) {
  return addPermanent(state, createGameObject({
    name,
    controller,
    owner: controller,
    power,
    toughness,
    abilities: abilities.map((keyword) => ({ keyword, text: keyword }))
  }));
}

const basic = stateAt(TURN_STEPS.UNTAP);
createGenericZoneCard(basic, { playerId: 'player', zone: 'library', name: 'Turn Draw' });
expect(basic.game.type === 'MagicTurnState' && basic.game.turnId === 'turn-1:player', 'Runtime state must use the canonical MagicTurnState identity.');
expect(describeTurnStep(basic).priority === PRIORITY_POLICIES.NONE && basic.game.priorityHolder === null, 'Untap must not normally grant priority.');
expect(advanceTurnStep(basic).to === TURN_STEPS.UPKEEP && basic.game.priorityHolder === 'player', 'Untap must advance to upkeep, where the active player gets priority.');
const drawAdvance = advanceTurnStep(basic);
expect(drawAdvance.to === TURN_STEPS.DRAW && drawAdvance.priorityAfter === 'draw-step-draw', 'Upkeep must advance to draw with priority ordered after the draw action.');
expect(basic.game.priorityHolder === 'player' && basic.game.turnBasedAction === 'draw-card' && basic.game.turnBasedActionImplemented, 'The draw action must complete before draw-step priority is granted.');
expect(advanceTurnStep(basic).to === TURN_STEPS.PRECOMBAT_MAIN, 'Draw must advance structurally to precombat main.');
const combatEntry = advanceTurnStep(basic);
expect(combatEntry.to === TURN_STEPS.BEGINNING && combatEntry.delegatedTo === 'combatRuntime', 'Precombat main must enter combat through the Phase 7 combat runtime.');
expect(basic.combat?.step === TURN_STEPS.BEGINNING && basic.game.insideCombat, 'Combat entry must create the authoritative Phase 7 combat state.');

const attacker = creature(basic, { name: 'Turn Attacker', power: 2, toughness: 2 });
const blocker = creature(basic, { name: 'Turn Blocker', controller: 'opponent', power: 3, toughness: 3 });
const attackers = advanceTurnStep(basic, { attackers: [attacker] });
expect(attackers.to === TURN_STEPS.DECLARE_ATTACKERS && attackers.delegatedTo === 'combatRuntime' && attacker.tapped, 'Declare attackers must delegate to combat legality and tapping.');
const blockers = advanceTurnStep(basic, { blockers: [{ attacker, blockers: [blocker] }] });
expect(blockers.to === TURN_STEPS.DECLARE_BLOCKERS && blockers.delegatedTo === 'combatRuntime', 'Declare blockers must delegate to the combat runtime.');
expect(getNextTurnStep(basic) === TURN_STEPS.COMBAT_DAMAGE, 'Combat without first strike must branch directly to regular damage.');
const damage = advanceTurnStep(basic);
expect(damage.to === TURN_STEPS.COMBAT_DAMAGE && damage.delegatedTo === 'combatRuntime' && attacker.zone === 'graveyard', 'Regular damage and SBAs must execute through Phase 7.');
const combatEnd = advanceTurnStep(basic);
expect(combatEnd.to === TURN_STEPS.END && combatEnd.delegatedTo === 'combatRuntime', 'Regular damage must advance through the combat runtime end step.');
expect(basic.events.some((event) => event.type === 'CombatBegan')
  && basic.events.some((event) => event.type === 'AttackDeclared')
  && basic.events.some((event) => event.type === 'BlockDeclared')
  && basic.events.some((event) => event.type === 'CombatDamageStepBegan')
  && basic.events.some((event) => event.type === 'EndOfCombat'), 'Turn orchestration must expose real Phase 7 combat events.');
expect(basic.events.filter((event) => event.type === 'TurnStepAdvanced').some((event) => event.metadata.delegatedTo === 'combatRuntime'), 'Canonical turn advancement must record delegated combat transitions.');
expect(advanceTurnStep(basic).to === TURN_STEPS.POSTCOMBAT_MAIN && !basic.game.insideCombat, 'End combat must advance to postcombat main outside combat.');

expect(advanceTurnStep(basic).to === TURN_STEPS.END_STEP, 'Postcombat main must advance to end step.');
expect(advanceTurnStep(basic).to === TURN_STEPS.CLEANUP && basic.game.priorityHolder === null, 'End step must advance to cleanup without manufacturing normal cleanup priority.');
const nextTurn = advanceTurnStep(basic);
expect(nextTurn.to === TURN_STEPS.UNTAP && basic.game.turn === 2, 'Cleanup must advance to the next turn untap step.');
expect(basic.game.activePlayer === 'opponent' && basic.game.nonactivePlayer === 'player' && basic.game.turnId === 'turn-2:opponent', 'Next-turn identity must increment and rotate active/nonactive players.');

const firstStrike = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const firstAttacker = creature(firstStrike, { name: 'First Striker', abilities: ['first strike'] });
const firstBlocker = creature(firstStrike, { name: 'First Blocker', controller: 'opponent', power: 3, toughness: 3 });
advanceTurnStep(firstStrike);
advanceTurnStep(firstStrike, { attackers: [firstAttacker] });
advanceTurnStep(firstStrike, { blockers: [{ attacker: firstAttacker, blockers: [firstBlocker] }] });
expect(getNextTurnStep(firstStrike) === TURN_STEPS.FIRST_STRIKE_DAMAGE && firstStrike.game.firstStrikeDamageRequired, 'First strike must insert the Phase 7 first-strike damage step.');
expect(advanceTurnStep(firstStrike).to === TURN_STEPS.FIRST_STRIKE_DAMAGE, 'The first-strike damage step must execute through the combat runtime.');
expect(getNextTurnStep(firstStrike) === TURN_STEPS.COMBAT_DAMAGE && advanceTurnStep(firstStrike).to === TURN_STEPS.COMBAT_DAMAGE, 'Regular combat damage must follow first-strike damage.');
expect(firstStrike.game.firstStrikeDamageRequired, 'First-strike requirement metadata must remain available through regular combat damage.');

const doubleStrike = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const doubleAttacker = creature(doubleStrike, { name: 'Double Striker', abilities: ['double strike'] });
advanceTurnStep(doubleStrike);
advanceTurnStep(doubleStrike, { attackers: [doubleAttacker] });
advanceTurnStep(doubleStrike, { blockers: [] });
expect(getNextTurnStep(doubleStrike) === TURN_STEPS.FIRST_STRIKE_DAMAGE, 'Double strike must also require a first-strike damage step.');
advanceTurnStep(doubleStrike);
expect(advanceTurnStep(doubleStrike).to === TURN_STEPS.COMBAT_DAMAGE && doubleStrike.combat.damageStepCount === 2, 'Double strike must remain eligible in both combat damage steps.');

const invalid = stateAt(TURN_STEPS.UPKEEP);
const invalidResult = advanceTurnStep(invalid, { to: TURN_STEPS.POSTCOMBAT_MAIN });
expect(invalidResult.status === 'illegal' && invalid.game.step === TURN_STEPS.UPKEEP, 'Invalid step jumps must fail without mutating turn state.');
invalid.stack.push({ id: 'pending-stack-object' });
expect(advanceTurnStep(invalid).status === 'paused' && invalid.game.step === TURN_STEPS.UPKEEP, 'A nonempty stack must block turn advancement.');

const cleanupTiming = evaluateMagicRulesRuntime({
  message: 'Can I cast Serra Angel right now during cleanup on my turn while the stack is empty and I have priority?',
  cards: [{ name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', manaCost: '{3}{W}{W}', power: 4, toughness: 4 }]
});
expect(cleanupTiming.status === 'unsupported' && cleanupTiming.verdict === 'unverified', 'General cleanup casting permissions must remain UNVERIFIED until Phase 8C.');

console.log('Magic canonical turn runtime verifier passed.');
console.log('- Canonical steps: untap through cleanup and next-turn untap');
console.log('- Combat integration: real attackers, blockers, damage, SBAs, and end-combat events');
console.log('- First-strike branching: first strike and double strike verified');
console.log('- Priority metadata: untap, upkeep, draw ordering, main, combat, end, cleanup');
console.log(`- Certification: ${JSON.stringify({ correctVerified: verified, incorrectConfident: 0 })}`);
