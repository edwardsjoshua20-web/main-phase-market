import {
  commanderDesignationFor,
  isDesignatedCommander
} from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { evaluateMagicScenario } from '../src/services/instajudge/magic/ruleEvaluator.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import {
  createGameObject,
  createMagicRuntimeState,
  moveObjectWithResult,
  registerGameObject,
  resolveCommanderReturnChoice
} from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { castSpell, passPriority, resolveTopOfStack } from '../src/services/instajudge/magic/runtime/stackRuntime.js';

const card = {
  id: 'phase-9a-commander',
  oracle_id: 'phase-9a-oracle',
  name: 'Atraxa, Grand Unifier',
  type_line: 'Legendary Creature - Phyrexian Angel',
  mana_cost: '{3}{G}{W}{U}{B}',
  oracle_text: 'Flying, vigilance, deathtouch, lifelink',
  power: '7',
  toughness: '7'
};

let assertions = 0;
function verify(condition, message) {
  assertions += 1;
  if (!condition) throw new Error(`Phase 9A verification failed: ${message}`);
}

function commanderState({ zone = 'command', controller = 'player', twoPlayers = false } = {}) {
  const objects = [{
    id: 'commander-a', name: card.name, card, owner: 'player', controller, zone,
    commander: true, commanderDesignationId: 'designation-a', abilities: [], counters: {}
  }];
  const designations = [{ id: 'designation-a', objectId: 'commander-a', ownerId: 'player', startingZone: zone }];
  if (twoPlayers) {
    objects.push({
      id: 'commander-b', name: card.name, card, owner: 'opponent', controller: 'opponent', zone: 'command',
      commander: true, commanderDesignationId: 'designation-b', abilities: [], counters: {}
    });
    designations.push({ id: 'designation-b', objectId: 'commander-b', ownerId: 'opponent', startingZone: 'command' });
  }
  return createMagicRuntimeState({
    cards: [card],
    message: card.name,
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

function castAndResolveCommander(state) {
  const commander = state.objects.get('commander-a');
  const cast = castSpell(state, {
    sourceObject: commander,
    controller: 'player',
    factsProvided: state.scenario.game.factsProvided
  });
  verify(cast.cast === true, 'A designated commander must be castable from the command zone at legal timing.');
  verify(cast.stackObject.kind === 'Spell', 'Commander casting must use the normal Spell stack object.');
  verify(commander.zone === 'stack' && !state.players.player.commandZone.includes(commander.id), 'Casting must remove the object from the command zone and put it on the stack.');
  verify(isDesignatedCommander(state, commander), 'Commander designation must persist on the stack.');
  const resolution = resolveTopOfStack(state);
  verify(resolution.resolved === true && commander.zone === 'battlefield', 'A resolving permanent commander spell must enter the battlefield through normal resolution.');
  verify(isDesignatedCommander(state, commander), 'Commander designation must persist on the battlefield.');
  return commander;
}

const initial = commanderState({ twoPlayers: true });
const initialCommander = initial.objects.get('commander-a');
verify(initial.format.id === 'commander' && initial.format.commander.designations.length === 2, 'Commander format must use a collection of canonical designations.');
verify(commanderDesignationFor(initial, initialCommander)?.ownerId === 'player', 'The commander designation must retain its owner.');
verify(initialCommander.zone === 'command' && initial.players.player.commandZone.includes(initialCommander.id), 'The commander must begin in the canonical command zone.');
verify(!initial.battlefield.includes(initialCommander) && !initial.players.player.hand.includes(initialCommander.id), 'A command-zone commander must not be in another zone.');

const copy = registerGameObject(initial, createGameObject({ id: 'same-name-copy', card, owner: 'player', controller: 'player', zone: 'hand' }));
verify(isDesignatedCommander(initial, initialCommander), 'The designated object must be recognized as the commander.');
verify(!isDesignatedCommander(initial, copy), 'A same-name copy must not inherit commander designation.');

const stackState = commanderState();
const resolvedCommander = castAndResolveCommander(stackState);
verify(commanderDesignationFor(stackState, resolvedCommander)?.castsFromCommandZone === 1, 'Command-zone cast history must be recorded for later tax support.');
verify(stackState.format.commander.movementHistory.some((entry) => entry.from === 'command' && entry.to === 'stack'), 'Command-zone movement history must record command to stack.');

const graveRemain = commanderState();
const graveRemainCommander = castAndResolveCommander(graveRemain);
const graveRemainMove = moveObjectWithResult(graveRemain, graveRemainCommander, 'graveyard', 'destroyed', {}, { commanderReturnChoice: 'remain' });
verify(graveRemainMove.status === 'committed' && graveRemainCommander.zone === 'graveyard', 'The owner may leave a commander in the graveyard.');
verify(isDesignatedCommander(graveRemain, graveRemainCommander), 'Designation must persist in the graveyard.');

const graveCommand = commanderState({ zone: 'battlefield' });
const graveCommandCommander = graveCommand.objects.get('commander-a');
const graveCommandMove = moveObjectWithResult(graveCommand, graveCommandCommander, 'graveyard', 'destroyed', {}, { commanderReturnChoice: 'command' });
verify(graveCommandMove.status === 'committed' && graveCommandMove.originalDestination === 'graveyard' && graveCommandCommander.zone === 'command', 'The post-move choice must support graveyard to command zone.');
verify(graveCommand.format.commander.movementHistory.map((entry) => entry.to).join(',') === 'graveyard,command', 'Graveyard handling must record the move before the state-based command-zone move.');

const pending = commanderState({ zone: 'battlefield' });
const pendingCommander = pending.objects.get('commander-a');
const pendingMove = moveObjectWithResult(pending, pendingCommander, 'graveyard', 'destroyed');
verify(pendingMove.status === 'depends' && pendingMove.movementCommitted === true && pendingCommander.zone === 'graveyard', 'An unspecified graveyard choice must commit the first move and return DEPENDS.');
verify(pending.pendingChoices[0]?.type === 'CommanderZoneReturnChoice' && pending.pendingChoices[0]?.timing === 'state-based-action', 'The missing graveyard choice must use the centralized pending-choice system with SBA timing.');
pending.game.priorityHolder = 'player';
verify(passPriority(pending, 'player').status === 'depends', 'A pending Commander choice must block priority progression.');
const resolvedPending = resolveCommanderReturnChoice(pending, pending.pendingChoices[0].id, 'command');
verify(resolvedPending.status === 'committed' && pendingCommander.zone === 'command' && pending.pendingChoices.length === 0, 'Resolving the pending choice must move the commander and clear the blocker.');

for (const decision of ['remain', 'command']) {
  const exileState = commanderState({ zone: 'battlefield' });
  const exileCommander = exileState.objects.get('commander-a');
  const result = moveObjectWithResult(exileState, exileCommander, 'exile', 'exiled', {}, { commanderReturnChoice: decision });
  verify(result.status === 'committed' && exileCommander.zone === (decision === 'command' ? 'command' : 'exile'), `Exile choice ${decision} must produce the selected zone.`);
  verify(isDesignatedCommander(exileState, exileCommander), `Designation must persist after the exile choice ${decision}.`);
}

for (const destination of ['hand', 'library']) {
  const replacementState = commanderState({ zone: 'battlefield' });
  const replacementCommander = replacementState.objects.get('commander-a');
  const designation = commanderDesignationFor(replacementState, replacementCommander);
  const replacementId = `commander-zone:${designation.id}:battlefield:${destination}`;
  const result = moveObjectWithResult(replacementState, replacementCommander, destination, `move to ${destination}`, {}, { replacementChoices: [replacementId] });
  verify(result.status === 'committed' && replacementCommander.zone === 'command', `${destination} must support the Commander replacement choice.`);
  verify(!replacementState.trace.some((entry) => entry.type === 'ZoneChanged' && entry.to === destination), `${destination} handling must replace the move instead of using the graveyard/exile post-move model.`);

  const declineState = commanderState({ zone: 'battlefield' });
  const declined = declineState.objects.get('commander-a');
  const declinedDesignation = commanderDesignationFor(declineState, declined);
  const declineId = `commander-zone:${declinedDesignation.id}:battlefield:${destination}`;
  const declinedResult = moveObjectWithResult(declineState, declined, destination, `move to ${destination}`, {}, { replacementChoices: [`decline:${declineId}`] });
  verify(declinedResult.status === 'committed' && declined.zone === destination, `The owner may decline the ${destination} replacement and remain there.`);
}

const ownerChoice = commanderState({ zone: 'battlefield', controller: 'opponent' });
const controlledCommander = ownerChoice.objects.get('commander-a');
const ownerPending = moveObjectWithResult(ownerChoice, controlledCommander, 'exile', 'exiled while controlled by opponent');
verify(ownerPending.pendingChoice?.ownerId === 'player' && ownerPending.pendingChoice?.chooser === 'player', 'The commander owner, not its controller, must make the return choice.');

const noncommander = createMagicRuntimeState({ scenario: { format: { id: 'commander', commanderDesignations: [] }, objects: [], continuousEffects: [] } });
const ordinary = registerGameObject(noncommander, createGameObject({ id: 'ordinary', card, owner: 'player', controller: 'player', zone: 'battlefield' }));
const ordinaryMove = moveObjectWithResult(noncommander, ordinary, 'graveyard', 'ordinary death');
verify(ordinaryMove.status === 'committed' && noncommander.pendingChoices.length === 0, 'A noncommander must not create a Commander return choice.');
const arbitraryCommandObject = registerGameObject(noncommander, createGameObject({ id: 'arbitrary-command-object', card, owner: 'player', controller: 'player', zone: 'command' }));
const arbitraryCommandCast = castSpell(noncommander, { sourceObject: arbitraryCommandObject, controller: 'player', skipTiming: true });
verify(arbitraryCommandCast.cast === false, 'An arbitrary command-zone object must not receive commander casting permission.');

const gated = createMagicRuntimeState();
const commanderLooking = registerGameObject(gated, createGameObject({ id: 'commander-looking', card, owner: 'player', controller: 'player', zone: 'battlefield', commander: true }));
const gatedMove = moveObjectWithResult(gated, commanderLooking, 'hand', 'ordinary-format move');
verify(gatedMove.status === 'committed' && commanderLooking.zone === 'hand' && gated.pendingChoices.length === 0, 'Commander behavior must not activate outside Commander format.');
const gatedCommandObject = registerGameObject(gated, createGameObject({ id: 'commander-looking-command', card, owner: 'player', controller: 'player', zone: 'command', commander: true }));
const gatedCast = castSpell(gated, { sourceObject: gatedCommandObject, controller: 'player', skipTiming: true });
verify(gatedCast.cast === false, 'A commander-looking object must not gain command-zone casting permission outside Commander format.');

const taxState = commanderState();
const taxCommander = castAndResolveCommander(taxState);
moveObjectWithResult(taxState, taxCommander, 'graveyard', 'destroyed', {}, { commanderReturnChoice: 'command' });
const secondCast = castSpell(taxState, { sourceObject: taxCommander, controller: 'player', skipTiming: true });
verify(secondCast.cast === true && secondCast.commanderCost?.commanderTaxGenericMana === 2, 'A repeat command-zone cast must now use the Phase 9B commander-tax cost path.');

const compiled = compileMagicScenario({ message: `${card.name} is my commander and starts in the command zone.`, cards: [card] });
verify(compiled.format.id === 'commander' && compiled.format.commanderDesignations.length === 1, 'The scenario compiler must represent Commander format and designation.');
verify(compiled.objects.find((object) => object.id === compiled.format.commanderDesignations[0].objectId)?.zone === 'command', 'The scenario compiler must represent a starting command-zone state.');

const publicCases = [
  [`In Commander, ${card.name} is my commander. It died and I choose the command zone. Can I do that?`, 'yes'],
  [`In Commander, ${card.name} is my commander. It died and I choose to leave it in the graveyard. Can I do that?`, 'yes'],
  [`In Commander, ${card.name} is my commander. It was exiled and I choose the command zone. Can I do that?`, 'yes'],
  [`In Commander, ${card.name} is my commander and it died. Where does it end up?`, 'depends'],
  [`In Commander, can I cast my commander ${card.name} from the command zone?`, 'yes'],
  [`In Commander, ${card.name} is my commander. Is another copy of ${card.name} also my commander?`, 'no'],
  [`In Commander, ${card.name} is a noncommander creature and dies. Can it move to the command zone?`, 'no'],
  [`In Commander, I cast my commander ${card.name} once. How much commander tax do I pay to cast it again from the command zone?`, 'yes']
];
const publicResults = publicCases.map(([message, expected]) => {
  const result = evaluateMagicRulesRuntime({ message, cards: [card] });
  verify(result.verdict === expected, `Public case expected ${expected} but received ${result.verdict}: ${message}`);
  return { expected, verdict: result.verdict, status: result.status };
});
verify(evaluateMagicScenario({ message: 'My commander died. Can I put it in the command zone?', cards: [], rules: [] }).verdict === 'yes', 'A structural commander-movement question must not require a named card.');
verify(evaluateMagicScenario({ message: 'Can I cast my commander from the command zone?', cards: [], rules: [] }).verdict === 'yes', 'A structural command-zone casting question must not require a named card.');

const counts = publicResults.reduce((totals, result) => {
  totals[result.verdict] = (totals[result.verdict] || 0) + 1;
  return totals;
}, {});

console.log(JSON.stringify({
  verifier: 'Magic Commander Phase 9A',
  assertions,
  publicCases: publicResults.length,
  publicVerdicts: counts,
  incorrectConfident: 0,
  status: 'PASS'
}, null, 2));
