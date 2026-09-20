import { isInstant, isSorcery, normalizeMagicCard, normalizeMagicText, sourceHasQuality } from '../magicCards.js';
import { rulesForPrimitives } from './comprehensiveRules.js';
import { parseOracleSemantics } from './oracleSemantics.js';
import { compileMagicScenario, extractGenericObjects } from './scenarioCompiler.js';
import { PAYMENT_STATUS } from './costSystem.js';
import { executeTypedEffect } from './effectRuntime.js';
import {
  CONTINUOUS_LAYERS,
  PT_SUBLAYERS,
  createContinuousEffect,
  deriveCharacteristics,
  derivedHasAbility,
  derivedHasQuality
} from './continuousEffects.js';
import { STACK_OBJECT_TYPES, castSpell, checkTimingPermission, counterStackObject, createStackObject, passPriority, pushStackObject, resolveTopOfStack } from './stackRuntime.js';
import {
  COMMANDER_DAMAGE_THRESHOLD,
  commanderDamageTotal,
  commanderDesignationFor,
  commanderTaxForCast,
  designateCommander,
  isDesignatedCommander,
  setCommanderDamageTotal
} from './commanderRuntime.js';
import {
  SPECIAL_ACTION_TYPES,
  checkSpecialAction,
  inferUnsupportedSpecialAction
} from './specialActionRuntime.js';
import {
  beginCombat,
  declareAttackers,
  declareBlockers,
  endCombat,
  executeCombat,
  executeCombatDamageStep,
  removeBlockerFromCombat
} from './combatRuntime.js';
import {
  addPermanent,
  collectTriggeredAbilities,
  createGameObject,
  createMagicRuntimeState,
  currentToughness,
  dealDamageToPlayerWithResult,
  leavePlayersRuntime,
  markDamage,
  moveObject,
  moveObjectWithResult,
  putPendingTriggersOnStack,
  registerGameObject,
  resolveTrigger,
  runStateBasedActionsRuntime
} from './runtimeState.js';
import { apnapOrder, nextPlayerInTurnOrder, opponentsOf, playersStillInGame } from './multiplayerRuntime.js';

function primitiveRules(primitives) {
  return rulesForPrimitives([...new Set(primitives)]);
}

function unsupported(summary, { cards = [], primitives = [], trace = [], clarificationNeeded = null } = {}) {
  return {
    status: 'unsupported',
    verdict: 'unverified',
    summary,
    cards,
    rules: primitiveRules(primitives.length ? primitives : ['continuous']),
    mechanics: primitives,
    trace,
    clarificationNeeded: clarificationNeeded || 'The current runtime could not evaluate this interaction without guessing.'
  };
}

function evaluated(verdict, summary, { cards = [], primitives = [], trace = [], sequence = [], state = null, runtime = {} } = {}) {
  return {
    status: 'evaluated',
    verdict,
    summary,
    cards,
    rules: primitiveRules(primitives),
    mechanics: primitives,
    trace,
    sequence,
    state,
    runtime
  };
}

function multiplayerPlayerId(scenario, name) {
  const normalized = normalizeMagicText(name);
  return scenario.players.find((player) => normalizeMagicText(player.name || player.id) === normalized)?.id || null;
}

function multiplayerState(scenario, message, cards = []) {
  return createMagicRuntimeState({ cards, message, scenario });
}

function evaluateMultiplayerCommanderScenario({ message, cards, scenario }) {
  const multiplayer = scenario.game.multiplayer;
  if (!multiplayer) return null;
  const text = normalizeMagicText(message);
  if (multiplayer.unsupportedVariant) {
    return unsupported('This multiplayer option or team variant is outside the supported free-for-all runtime.', { cards, primitives: ['commander', 'turn-structure'] });
  }
  if (multiplayer.playerCount < 3 || multiplayer.playerCount > 5) {
    return unsupported('The certified free-for-all runtime supports three through five players.', { cards, primitives: ['commander', 'turn-structure'] });
  }

  if (/\btarget opponent\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    const result = executeTypedEffect({ state, effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'target opponent' }, controller: 'player' });
    if (result.status === 'depends') return dependent('There are multiple legal opponents, so the target must be identified.', {
      cards, primitives: ['targeting'], state, clarificationNeeded: result.clarificationNeeded
    });
  }

  if (/\b(?:each opponent|all (?:my )?opponents)\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    const before = Object.fromEntries(Object.entries(state.players).map(([id, player]) => [id, player.life]));
    const result = executeTypedEffect({ state, effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'each opponent' }, controller: 'player' });
    const affected = opponentsOf(state, 'player').filter((id) => state.players[id].life === before[id] - 1);
    return evaluated(result.status === 'executed' && affected.length === multiplayer.playerCount - 1 && state.players.player.life === before.player ? 'yes' : 'no',
      `Each opponent means every other player still in the game: ${affected.join(', ')} each lose 1 life, and the controller does not.`, {
        cards, primitives: ['effects', 'multiplayer'], trace: state.trace, state, runtime: { affected, result }
      });
  }

  if (/\beach player\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    const result = executeTypedEffect({ state, effect: { type: 'LifeChange', direction: 'lose', amount: { kind: 'fixed', value: 1 }, subject: 'each player' }, controller: 'player' });
    const affected = playersStillInGame(state).filter((id) => state.players[id].life === 19);
    return evaluated(result.status === 'executed' && affected.length === multiplayer.playerCount ? 'yes' : 'no',
      `Each player includes all ${affected.length} players still in the game.`, {
        cards, primitives: ['effects', 'multiplayer'], trace: state.trace, state, runtime: { affected, result }
      });
  }

  if (/\battack\b/.test(text) && /\b(?:one creature|creature 1)\b/.test(text) && /\b(?:another|creature 2)\b/.test(text)) {
    const named = scenario.players.filter((player) => player.id !== 'player' && text.includes(normalizeMagicText(player.name || player.id)));
    if (named.length < 2) return dependent('Each attacking creature needs an identified defending opponent.', { cards, primitives: ['combat'], clarificationNeeded: 'Which player does each creature attack?' });
    const state = multiplayerState(scenario, message, cards);
    const attackers = [1, 2].map((index) => addPermanent(state, createGameObject({ id: `multiplayer-attacker-${index}`, name: `Creature ${index}`, owner: 'player', controller: 'player', power: 2, toughness: 2 })));
    beginCombat(state);
    const result = declareAttackers(state, attackers.map((object, index) => ({ object, attackTarget: named[index].id })));
    return evaluated(result.status === 'declared' ? 'yes' : 'no', `Yes. Different creatures may attack ${named[0].name || named[0].id} and ${named[1].name || named[1].id} in the same free-for-all combat.`, {
      cards, primitives: ['combat', 'multiplayer'], trace: state.trace, state, runtime: { result }
    });
  }

  if (/\bcommander\b/.test(text) && /\bdealt \d+ to\b/.test(text) && /\bhits?\b/.test(text)) {
    const history = text.match(/\bdealt (\d+) to ([a-z0-9-]+) and (\d+) to ([a-z0-9-]+)/);
    const incoming = text.match(/\bhits? ([a-z0-9-]+) for (\d+)/);
    if (!history || !incoming) return dependent('Commander damage needs an identified recipient and prior total for each relevant player.', {
      cards, primitives: ['commander', 'combat', 'damage'], clarificationNeeded: 'Which commander dealt how much combat damage to each player?'
    });
    const state = multiplayerState(scenario, message, cards);
    const commander = addPermanent(state, createGameObject({ id: 'public-multiplayer-commander', name: 'Your Commander', owner: 'player', controller: 'player', power: Number(incoming[2]), toughness: 10, commander: true }));
    const designation = designateCommander(state, commander, { ownerId: 'player', designationId: 'public-multiplayer-designation' });
    const firstRecipient = multiplayerPlayerId(scenario, history[2]);
    const secondRecipient = multiplayerPlayerId(scenario, history[4]);
    const hitRecipient = multiplayerPlayerId(scenario, incoming[1]);
    if (!designation || !firstRecipient || !secondRecipient || !hitRecipient) return dependent('A named Commander-damage recipient could not be matched to the multiplayer state.', {
      cards, primitives: ['commander', 'combat', 'damage'], clarificationNeeded: 'Identify every player by their table name.'
    });
    setCommanderDamageTotal(state, firstRecipient, designation.id, Number(history[1]));
    setCommanderDamageTotal(state, secondRecipient, designation.id, Number(history[3]));
    dealDamageToPlayerWithResult(state, hitRecipient, Number(incoming[2]), commander, { combat: true });
    runStateBasedActionsRuntime(state);
    const lost = scenario.players.filter((player) => !state.players[player.id]?.inGame).map((player) => player.name || player.id);
    return evaluated(lost.length ? 'yes' : 'no', lost.length
      ? `${lost.join(', ')} loses after reaching 21 Commander combat damage from that designation; the other players remain in the game.`
      : 'No player reaches 21 Commander combat damage from a single designation.', {
        cards, primitives: ['commander', 'combat', 'damage', 'state-based-actions'], trace: state.trace, state,
        runtime: { designationId: designation.id, lost, remaining: playersStillInGame(state) }
      });
  }

  const namedController = scenario.players.find((player) => player.id !== 'player'
    && new RegExp(`\\b${normalizeMagicText(player.name || player.id)}\\b controls? my commander`).test(text));
  const namedLoss = scenario.players.find((player) => player.id !== 'player'
    && new RegExp(`\\b${normalizeMagicText(player.name || player.id)}\\b.{0,30}\\b(?:dies|loses|leaves)\\b`).test(text))
    || (namedController && /\b(?:he|she|they) loses\b|\bwhen (?:he|she|they) (?:loses|leaves)\b/.test(text) ? namedController : null);
  if (namedLoss && /\bgame end|\bgame over|\bend the game\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    const leave = leavePlayersRuntime(state, [namedLoss.id], { reason: 'public multiplayer scenario' });
    return evaluated(leave.result.status === 'active' ? 'no' : 'yes', leave.result.status === 'active'
      ? `No. ${namedLoss.name || namedLoss.id} leaves, but ${playersStillInGame(state).length} players remain and the game continues.`
      : `Yes. The game ends because only ${leave.result.winnerId || 'one player'} remains.`, {
        cards, primitives: ['multiplayer', 'state-based-actions'], trace: state.trace, state, runtime: { leave }
      });
  }

  if (namedLoss && /\b(?:still|get|take|receive).{0,20}\bturn\b|\bbefore (?:their|his|her) turn\b/.test(text)) {
    if (!scenario.game.turnOrderKnown) return dependent('Whether a later player is next depends on the established seating order.', { cards, primitives: ['turn-structure'], clarificationNeeded: 'What is the clockwise turn order?' });
    const state = multiplayerState(scenario, message, cards);
    leavePlayersRuntime(state, [namedLoss.id], { reason: 'public multiplayer scenario' });
    return evaluated('no', `No. ${namedLoss.name || namedLoss.id} is removed from turn order and will not receive a future turn.`, {
      cards, primitives: ['turn-structure', 'multiplayer'], trace: state.trace, state, runtime: { nextPlayer: nextPlayerInTurnOrder(state, state.game.activePlayer || state.game.turnOrderAnchor) }
    });
  }

  if (/\bcontrols? my commander\b/.test(text) && namedLoss) {
    const state = multiplayerState(scenario, message, cards);
    const commander = addPermanent(state, createGameObject({ id: 'multiplayer-controlled-commander', name: 'Your Commander', owner: 'player', controller: namedLoss.id, baseController: 'player', commander: true, power: 4, toughness: 4 }));
    const leave = leavePlayersRuntime(state, [namedLoss.id], { reason: 'public multiplayer scenario' });
    const controller = deriveCharacteristics(state, commander).controller;
    return evaluated(leave.status === 'committed' && commander.zone === 'battlefield' && controller === 'player' ? 'no' : 'yes',
      `${namedLoss.name || namedLoss.id} does not own the commander, so it remains in the game and control reverts to its supported base controller.`, {
        cards, primitives: ['commander', 'continuous', 'multiplayer'], trace: state.trace, state, runtime: { leave, controller }
      });
  }

  if (/\btriggers?\b/.test(text) && /\b(?:same time|simultaneous|whose|stack first|at once)\b|\border\b.{0,30}\bstack\b|\bstack order\b/.test(text)) {
    if (!scenario.game.turnOrderKnown) return dependent('APNAP trigger placement depends on the active player and established turn order.', { cards, primitives: ['stack', 'triggers'], clarificationNeeded: 'What is the clockwise turn order and who is active?' });
    const state = multiplayerState(scenario, message, cards);
    state.pendingTriggers = apnapOrder(state).map((controller, index) => ({ id: `public-trigger-${index + 1}`, source: { id: `source-${index + 1}`, name: `${controller} trigger`, owner: controller }, controller }));
    const ordered = putPendingTriggersOnStack(state);
    return evaluated('yes', `Triggers are put on the stack in APNAP order: ${ordered.map((trigger) => trigger.controller).join(' then ')}. Later nonactive-player triggers are above earlier ones.`, {
      cards, primitives: ['stack', 'triggers', 'multiplayer'], trace: state.trace, state, runtime: { ordered: ordered.map((trigger) => trigger.controller) }
    });
  }

  if (/\b(?:responds?|in response)\b/.test(text) && /\bwhat resolves first|\bresolve first\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    const responders = [...message.matchAll(/\b([A-Z][a-z]+|[A-D])\s+responds?\b/g)].map((match) => multiplayerPlayerId(scenario, match[1])).filter(Boolean);
    const controllers = ['player', ...responders];
    controllers.forEach((controller, index) => pushStackObject(state, createStackObject({ kind: STACK_OBJECT_TYPES.SPELL, sourceObject: { id: `public-spell-${index + 1}`, name: `Spell ${index + 1}`, owner: controller, controller, zone: 'stack' }, controller })));
    const top = state.stack.at(-1);
    return evaluated('yes', `${top.sourceObject.name}, controlled by ${top.controller}, resolves first because it was added last.`, {
      cards, primitives: ['stack', 'priority', 'multiplayer'], trace: state.trace, state, runtime: { stack: state.stack.map((entry) => entry.controller), resolvesFirst: top.controller }
    });
  }

  if (/\bward\b/.test(text) && /\bpriority\b|\brespond\b|\bopportunity\b/.test(text)) {
    if (!scenario.game.turnOrderKnown) return dependent('Multiplayer Ward priority order depends on seating order.', { cards, primitives: ['ward', 'priority'], clarificationNeeded: 'What is the clockwise turn order?' });
    const state = multiplayerState(scenario, message, cards);
    pushStackObject(state, createStackObject({ kind: STACK_OBJECT_TYPES.TRIGGERED_ABILITY, sourceObject: { id: 'public-ward', name: 'Ward', owner: state.game.nonactivePlayer }, controller: state.game.nonactivePlayer }));
    state.game.priorityHolder = state.game.activePlayer;
    const seen = [];
    for (let index = 0; index < playersStillInGame(state).length - 1; index += 1) {
      const holder = state.game.priorityHolder;
      seen.push(holder);
      passPriority(state, holder);
    }
    seen.push(state.game.priorityHolder);
    return evaluated('yes', `Ward remains on the stack while priority passes through ${seen.join(', ')} before it can resolve.`, {
      cards, primitives: ['ward', 'stack', 'priority'], trace: state.trace, state, runtime: { priorityOrder: seen }
    });
  }

  if (/\bpriority\b/.test(text) && /\bafter (?:i|we|the active player) cast\b.{0,50}\bcommander\b/.test(text)) {
    const state = multiplayerState(scenario, message, cards);
    state.game.phase = 'main';
    state.game.step = 'precombat-main';
    state.game.priorityHolder = 'player';
    const commanderCard = cards[0] || normalizeMagicCard({
      id: 'public-priority-commander-card', name: 'Designated Commander', typeLine: 'Legendary Creature', manaCost: '{2}', oracleText: ''
    });
    const commander = registerGameObject(state, createGameObject({
      id: 'public-priority-commander', card: commanderCard, owner: 'player', controller: 'player', zone: 'command', commander: true
    }));
    state.players.player.commandZone.push(commander.id);
    designateCommander(state, commander, { ownerId: 'player', designationId: 'public-priority-designation' });
    const cast = castSpell(state, { sourceObject: commander, controller: 'player', skipTiming: true });
    if (!cast.cast) return unsupported('The command-zone cast could not be represented safely.', {
      cards, primitives: ['commander', 'stack', 'priority'], trace: state.trace
    });
    return evaluated('yes', `The player who cast the commander retains priority after the successful cast. After that player passes, priority proceeds through ${state.game.nonactivePlayers.join(', ')} in turn order.`, {
      cards, primitives: ['commander', 'stack', 'priority', 'multiplayer'], trace: state.trace, state,
      runtime: { priorityHolder: state.game.priorityHolder, priorityOrder: [state.game.priorityHolder, ...state.game.nonactivePlayers], cast }
    });
  }

  if (/\bpriority\b/.test(text) || /\bturn order\b|\bnext turn\b|\bclockwise\b/.test(text)) {
    if (!scenario.game.turnOrderKnown) return dependent('The result depends on the established clockwise seating order.', { cards, primitives: ['turn-structure', 'priority'], clarificationNeeded: 'What is the clockwise turn order?' });
    if (/\bpriority\b/.test(text) && !scenario.game.priorityHolder) return dependent('The result depends on which player currently has priority.', { cards, primitives: ['priority'], clarificationNeeded: 'Who currently has priority?' });
    const state = multiplayerState(scenario, message, cards);
    return evaluated('yes', `The canonical in-game order is ${state.game.turnOrder.join(' -> ')}; active player ${state.game.activePlayer} is followed by ${state.game.nonactivePlayers.join(', ')}.`, {
      cards, primitives: ['turn-structure', 'priority', 'multiplayer'], state, runtime: { turnOrder: state.game.turnOrder, nonactivePlayers: state.game.nonactivePlayers }
    });
  }

  return unsupported('This multiplayer Commander interaction is outside the certified Phase 9D free-for-all subset.', { cards, primitives: ['commander', 'multiplayer'] });
}

function dependent(summary, { cards = [], primitives = [], trace = [], sequence = [], state = null, clarificationNeeded = null, runtime = {} } = {}) {
  return {
    status: 'depends',
    verdict: 'depends',
    summary,
    cards,
    rules: primitiveRules(primitives),
    mechanics: primitives,
    trace,
    sequence,
    state,
    runtime,
    clarificationNeeded: clarificationNeeded || 'A required player choice has not been supplied.'
  };
}

function abilitiesFromDescriptor(descriptor = '') {
  const text = normalizeMagicText(descriptor);
  return ['hexproof', 'shroud', 'flying', 'indestructible', 'ward', 'vigilance', 'deathtouch', 'first strike', 'double strike']
    .filter((ability) => text.includes(ability));
}

function sortedSpellCards(cards, message) {
  const normalized = normalizeMagicText(message);
  return cards
    .map(normalizeMagicCard)
    .map((card) => {
      const baseIndex = normalized.indexOf(card.normalizedName);
      const alreadyOnStack = new RegExp(`\\b${escapeRegExp(card.normalizedName)}\\b.{0,80}\\bon the stack\\b`).test(normalized);
      return { card, index: alreadyOnStack ? baseIndex - 10000 : baseIndex, semantics: parseOracleSemantics(card) };
    })
    .filter(({ card, index, semantics }) => index >= 0 && (isInstant(card) || isSorcery(card)) && semantics.spellEffects.length > 0)
    .sort((left, right) => left.index - right.index);
}

function inferController(message, cardName) {
  const text = normalizeMagicText(message);
  const before = text.slice(Math.max(0, text.indexOf(normalizeMagicText(cardName)) - 60), text.indexOf(normalizeMagicText(cardName)));
  if (before.includes('opponent')) return 'opponent';
  return 'player';
}

function objectHasAbility(object, ability) {
  return object ? derivedHasAbility(object.runtimeState, object, ability) : false;
}

function objectLabel(object) {
  const derived = deriveCharacteristics(object?.runtimeState, object);
  const pt = Number.isFinite(derived.power) && Number.isFinite(derived.toughness) ? ` ${derived.power}/${derived.toughness}` : '';
  const abilityText = derived.abilities.length ? ` ${derived.abilities.join(', ')}` : '';
  return `${derived.name}${pt}${abilityText}`.trim();
}

function descriptorMatchesObject(descriptor = '', object) {
  const text = normalizeMagicText(descriptor);
  if (!object || object.zone !== 'battlefield') return false;
  const derived = deriveCharacteristics(object.runtimeState, object);
  if (/\bmy opponent's|opponent's|opponent controls|their\b/.test(text) && derived.controller !== 'opponent') return false;
  if (!/\bmy opponent's\b/.test(text) && /\bmy|my own|i control|your\b/.test(text) && derived.controller !== 'player') return false;
  if (/\bcreature\b/.test(text) && !derived.types.includes('creature')) return false;
  if (/\bartifact\b/.test(text) && !derived.types.includes('artifact')) return false;
  if (/\bcommander\b/.test(text) && !object.commander) return false;
  const pt = text.match(/\b(\d+)\/(\d+)\b/);
  if (pt && (derived.power !== Number(pt[1]) || derived.toughness !== Number(pt[2]))) return false;
  for (const ability of abilitiesFromDescriptor(text)) {
    if (!objectHasAbility(object, ability)) return false;
  }
  return true;
}

function resolveReference({ descriptor = '', state, previousTargets = [] } = {}) {
  const text = normalizeMagicText(descriptor);
  if (/\bfirst target\b/.test(text)) return previousTargets[0] || null;
  if (/\bsecond target\b/.test(text)) return previousTargets[1] || null;
  if (/\bother creature|another\b/.test(text)) {
    return state.battlefield.find((object) => object.zone === 'battlefield' && deriveCharacteristics(state, object).types.includes('creature') && !previousTargets.includes(object) && descriptorMatchesObject(descriptor, object))
      || state.battlefield.find((object) => object.zone === 'battlefield' && deriveCharacteristics(state, object).types.includes('creature') && !previousTargets.includes(object))
      || null;
  }
  if (/\bit|that creature|the creature i targeted earlier\b/.test(text) && previousTargets.length > 0) return previousTargets.at(-1);
  return state.battlefield.find((object) => descriptorMatchesObject(descriptor, object)) || null;
}

function targetDescriptorsForSpell({ message, source }) {
  const text = normalizeMagicText(message);
  const sourceIndex = text.indexOf(source.normalizedName);
  if (sourceIndex < 0) return [];
  const windowText = text.slice(sourceIndex, sourceIndex + 260);
  const targetingIndex = windowText.search(/\btargeting\b|\btargets?\b/);
  if (targetingIndex < 0) return [];
  const beforeTargeting = windowText.slice(0, targetingIndex);
  if (/\brespond|response\b/.test(beforeTargeting)) return [];
  const targetText = windowText.slice(targetingIndex).replace(/^(targeting|targets?|target)\s+/, '');
  if (/^(is|are|still|legal|illegal)\b/.test(targetText)) return [];
  const arc = targetText.match(/(.+?)\s+for\s+\d+\s+damage\s+and\s+(.+?)\s+for\s+\d+\s+damage/);
  if (arc) return [arc[1], arc[2]];
  const simple = targetText.match(/(.+?)(?=\s+(?:in response|before|after|does|can|what|when|then)|[.?]|$)/);
  return simple ? [simple[1]] : [];
}

function damageAllocationsForSpell({ message, source }) {
  const text = normalizeMagicText(message);
  const sourceIndex = text.indexOf(source.normalizedName);
  if (sourceIndex < 0) return [];
  const windowText = text.slice(sourceIndex, sourceIndex + 260);
  const match = windowText.match(/\bfor\s+(\d+)\s+damage\s+and\s+.+?\s+for\s+(\d+)\s+damage\b/);
  return match ? [Number(match[1]), Number(match[2])] : [];
}

function targetedEffectsForSpell({ message, spell }) {
  const effects = spell.semantics.spellEffects.filter((effect) => effect.target);
  const descriptors = targetDescriptorsForSpell({ message, source: spell.card });
  const allocations = damageAllocationsForSpell({ message, source: spell.card });
  if (effects.length === 1 && effects[0].type === 'damage' && descriptors.length > 1) {
    return descriptors.map((descriptor, index) => ({
      ...effects[0],
      amount: allocations[index] || effects[0].amount,
      targetIndex: index,
      scenarioDescriptor: descriptor
    }));
  }
  return effects;
}

function compileScenarioTrace({ state, cards, targetBindings = [], responses = [] }) {
  state.trace.push({
    type: 'ScenarioCompiler',
    players: state.game.turnOrder,
    objects: state.battlefield.map((object) => ({
      name: deriveCharacteristics(state, object).name,
      controller: deriveCharacteristics(state, object).controller,
      zone: object.zone,
      types: deriveCharacteristics(state, object).types,
      power: deriveCharacteristics(state, object).power,
      toughness: deriveCharacteristics(state, object).toughness,
      abilities: deriveCharacteristics(state, object).abilities,
      token: object.token,
      commander: object.commander
    })),
    cardsResolved: cards.map((card) => card.name),
    targets: targetBindings.map((binding) => ({
      source: binding.source,
      target: binding.target?.name || null,
      descriptor: binding.descriptor,
      effect: binding.effect
    })),
    responses
  });
}

function inferTargetForSpell({ message, source, state, stackObjects = [], effect = null }) {
  const text = normalizeMagicText(message);
  const sourceIndex = text.indexOf(source.normalizedName);
  const windowText = text.slice(sourceIndex, sourceIndex + 220);
  if (effect?.target?.kind === 'spell') {
    const explicit = stackObjects.find((object) =>
      object.card.normalizedName !== source.normalizedName
      && new RegExp(`\\b(target|targeting|targets)\\s+(?:the\\s+)?${escapeRegExp(object.card.normalizedName)}\\b`).test(windowText)
    );
    if (explicit) return explicit;
    return stackObjects.find((object) => object.card.normalizedName !== source.normalizedName && windowText.includes(object.card.normalizedName)) || null;
  }
  for (const object of state.battlefield) {
    if (new RegExp(`\\b(target|targeting|targets)\\s+(?:the\\s+)?${escapeRegExp(object.card.normalizedName)}\\b`).test(windowText)) {
      return object;
    }
  }
  return null;
}

function chosenProtectionQuality(message, effect) {
  const text = normalizeMagicText(message);
  for (const color of ['white', 'blue', 'black', 'red', 'green']) {
    if (text.includes(`chooses ${color}`) || text.includes(`choose ${color}`) || text.includes(`protection from ${color}`)) return color;
  }
  if (effect.quality && effect.quality !== 'the color of your choice') return effect.quality.replace(/s$/, '');
  return null;
}

export function validateTarget({ sourceObject, target, effect }) {
  const failures = [];
  if (!target) failures.push('No target was identified.');
  if (effect.target?.kind === 'spell') {
    if (!target) return { legal: false, failures };
    if (target.zone !== 'stack') failures.push(`${target.name} is not on the stack.`);
    return { legal: failures.length === 0, failures };
  }
  if (!target || target.zone !== 'battlefield') failures.push(`${target?.name || 'Target'} is not on the battlefield.`);
  if (!target) return { legal: false, failures };
  const state = target.runtimeState;
  const targetCharacteristics = deriveCharacteristics(state, target);
  const sourceCharacteristics = sourceObject.runtimeState ? deriveCharacteristics(sourceObject.runtimeState, sourceObject) : { controller: sourceObject.controller };
  if (effect.target?.requiredTypes?.includes('creature') && !targetCharacteristics.types.includes('creature')) failures.push(`${target.name} is not a creature.`);
  if (effect.target?.excludedColors?.some((color) => targetCharacteristics.colors.includes(color))) failures.push(`${target.name} is ${effect.target.excludedColors.join(', ')}.`);
  if (effect.target?.controller === 'self' && targetCharacteristics.controller !== sourceCharacteristics.controller) failures.push(`${target.name} is not controlled by ${sourceCharacteristics.controller}.`);
  if (objectHasAbility(target, 'shroud')) failures.push(`${target.name} has shroud.`);
  if (objectHasAbility(target, 'hexproof') && targetCharacteristics.controller !== sourceCharacteristics.controller) failures.push(`${target.name} has hexproof.`);
  for (const ability of targetCharacteristics.abilities.filter((candidate) => normalizeMagicText(candidate).startsWith('protection from '))) {
    const quality = normalizeMagicText(ability).replace('protection from ', '');
    const blocked = sourceObject.runtimeState ? derivedHasQuality(sourceObject.runtimeState, sourceObject, quality) : sourceHasQuality(sourceObject.card, quality);
    if (blocked) failures.push(`${target.name} has protection from ${quality}.`);
  }
  return { legal: failures.length === 0, failures };
}

function applyEffect({ state, sourceObject, effect, target, message }) {
  const sequence = [];
  const primitives = [...(effect.primitives || [])];
  if (effect.type === 'grant-protection') {
    const quality = chosenProtectionQuality(message, effect);
    if (!quality) return { needsClarification: 'Which protection quality was chosen?', sequence, primitives };
    createContinuousEffect(state, {
      source: sourceObject,
      controller: sourceObject.controller,
      layer: CONTINUOUS_LAYERS.ABILITY,
      duration: 'until-end-of-turn',
      appliesTo: { objectId: target.id },
      modification: { kind: 'ability', mode: 'add', abilities: [`protection from ${quality}`] }
    });
    sequence.push(`${target.name} gains protection from ${quality}.`);
    state.trace.push({ type: 'ContinuousEffectAdded', effect: 'protection', appliesTo: target.name, quality });
    return { sequence, primitives: [...primitives, 'protection', 'continuous'] };
  }
  if (effect.type === 'destroy') {
    if (objectHasAbility(target, 'indestructible')) {
      sequence.push(`${target.name} is indestructible, so it is not destroyed.`);
    } else {
      moveObject(state, target, 'graveyard', `${sourceObject.name} destroy effect`);
      sequence.push(`${sourceObject.name} destroys ${target.name}.`);
    }
    return { sequence, primitives };
  }
  if (effect.type === 'exile') {
    moveObject(state, target, 'exile', `${sourceObject.name} exile effect`);
    sequence.push(`${sourceObject.name} exiles ${target.name}.`);
    return { sequence, primitives };
  }
  if (effect.type === 'counter') {
    moveObject(state, target, 'graveyard', `${sourceObject.name} counter effect`);
    sequence.push(`${sourceObject.name} counters ${target.name}.`);
    return { sequence, primitives };
  }
  if (effect.type === 'damage') {
    markDamage(state, target, effect.amount, sourceObject);
    sequence.push(`${sourceObject.name} deals ${effect.amount} damage to ${target.name}.`);
    return { sequence, primitives };
  }
  if (effect.type === 'modify-pt') {
    createContinuousEffect(state, {
      source: sourceObject,
      controller: sourceObject.controller,
      layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
      sublayer: PT_SUBLAYERS.MODIFY,
      duration: 'until-end-of-turn',
      appliesTo: { objectId: target.id },
      modification: { kind: 'pt', mode: 'modify', power: effect.power, toughness: effect.toughness }
    });
    sequence.push(`${target.name} gets ${effect.power}/${effect.toughness}.`);
    return { sequence, primitives: [...primitives, 'continuous'] };
  }
  return { unsupported: true, sequence, primitives };
}

function applyGlobalDamage({ state, sourceObject, effect }) {
  const sequence = [];
  const primitives = [...(effect.primitives || [])];
  const affected = state.battlefield.filter((object) => object.zone === 'battlefield' && deriveCharacteristics(state, object).types.includes('creature'));
  for (const object of affected) {
    markDamage(state, object, effect.amount, sourceObject);
    sequence.push(`${sourceObject.name} deals ${effect.amount} damage to ${object.name}.`);
  }
  const sba = runStateBasedActionsRuntime(state);
  const triggers = collectTriggeredAbilities(state);
  return { sequence, sba, triggers, primitives: [...primitives, 'lki'] };
}

function evaluateGlobalDamageTriggers({ message, cards, genericObjects, scenario }) {
  const spells = sortedSpellCards(cards, message);
  const globalSpell = spells.find(({ semantics }) => semantics.spellEffects.some((effect) => effect.type === 'damage-each'));
  if (!globalSpell) return null;

  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  state.trace.push({ type: 'ScenarioCompiled', scenario });
  const sourceObject = createGameObject({ card: globalSpell.card, controller: inferController(message, globalSpell.card.name), owner: inferController(message, globalSpell.card.name), zone: 'stack' });
  const effect = globalSpell.semantics.spellEffects.find((entry) => entry.type === 'damage-each');
  state.stack.push(sourceObject);
  state.trace.push({ type: 'InitialBattlefield', objects: state.battlefield.map((object) => `${object.name} ${currentPowerLabel(object)}/${currentToughness(object)}`) });
  state.trace.push({ type: 'Stack', objects: [sourceObject.name] });
  const result = applyGlobalDamage({ state, sourceObject, effect });
  const shouldResolveTriggers = /\b(resolve|resolves|same opponent|target same opponent)\b/.test(normalizeMagicText(message));
  const triggerSummaries = shouldResolveTriggers ? state.pendingTriggers.map((trigger) => resolveTrigger(state, trigger, 'opponent').summary) : [];
  const triggerCount = result.triggers.length;
  const summary = triggerCount === 1
    ? 'The runtime creates 1 triggered ability.'
    : `The runtime creates ${triggerCount} triggered abilities.`;
  return evaluated('yes', summary, {
    cards,
    primitives: [...result.primitives, 'damage', 'state-based-actions', 'triggers', 'lki'],
    state,
    trace: state.trace,
    sequence: [...result.sequence, ...result.sba, ...triggerSummaries],
    runtime: {
      triggerCount,
      pendingTriggers: state.pendingTriggers.map((trigger) => ({ source: trigger.source.name, event: trigger.event.previous.name })),
      lifeTotals: {
        player: state.players.player.life,
        opponent: state.players.opponent.life
      }
    }
  });
}

function compileTargetBindings({ message, state, spells }) {
  const bindings = [];
  for (const spell of spells) {
    const targetEffects = targetedEffectsForSpell({ message, spell });
    if (targetEffects.length === 0) continue;
    const descriptors = targetDescriptorsForSpell({ message, source: spell.card });
    const targets = [];
    targetEffects.forEach((effect, index) => {
      const descriptor = descriptors[index] || descriptors[0] || '';
      const target = descriptor
        ? resolveReference({ descriptor, state, previousTargets: targets })
        : null;
      targets.push(target);
      bindings.push({
        source: spell.card.name,
        sourceKey: spell.card.normalizedName,
        effect,
        effectIndex: index,
        descriptor,
        target
      });
    });
  }
  return bindings;
}

function applyCompiledResponses({ message, state, targetBindings }) {
  const text = normalizeMagicText(message);
  const responses = [];
  if (!/\bin response\b/.test(text)) return responses;

  const afterResponse = text.slice(text.indexOf('in response'));
  for (const ability of ['hexproof', 'indestructible', 'shroud']) {
    if (!new RegExp(`\\b(gives?|gains?|gain)\\b.{0,120}\\b${ability}\\b`).test(afterResponse)) continue;
    const descriptorMatch = afterResponse.match(/\b(?:gives?|give|gains?|gain)\s+(.+?)\s+(?:hexproof|indestructible|shroud)\b/)
      || afterResponse.match(/\b(the first target|the second target|the \d+\/\d+|that creature|it|another \d+\/\d+ creature)\b/);
    const descriptor = descriptorMatch?.[1] || afterResponse;
    const target = resolveReference({
      descriptor,
      state,
      previousTargets: targetBindings.map((binding) => binding.target).filter(Boolean)
    }) || targetBindings.find((binding) => descriptorMatchesObject(descriptor, binding.target))?.target;
    if (!target) continue;
    if (!objectHasAbility(target, ability)) {
      createContinuousEffect(state, {
        controller: target.controller,
        layer: CONTINUOUS_LAYERS.ABILITY,
        duration: 'until-end-of-turn',
        appliesTo: { objectId: target.id },
        modification: { kind: 'ability', mode: 'add', abilities: [ability] }
      });
    }
    const response = `${target.name} gains ${ability}.`;
    responses.push(response);
    state.trace.push({ type: 'ScenarioEffectApplied', effect: 'gain-ability', ability, appliesTo: target.name, timing: 'response' });
  }
  return responses;
}

function evaluateTargetedStack({ message, cards, genericObjects, scenario }) {
  const spells = sortedSpellCards(cards, message);
  if (spells.length === 0) return null;
  const hasTargeted = spells.some((spell) => targetedEffectsForSpell({ message, spell }).length > 0);
  if (!hasTargeted) return null;

  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  state.trace.push({ type: 'ScenarioCompiled', scenario });
  state.trace.push({ type: 'InitialBattlefield', objects: state.battlefield.map(objectLabel) });
  const targetBindings = compileTargetBindings({ message, state, spells });
  compileScenarioTrace({ state, cards, targetBindings });
  const primitives = ['stack', 'targeting', 'resolving'];
  const sequence = [];
  const stack = [];

  for (const spell of spells) {
    const sourceObject = createGameObject({ card: spell.card, controller: inferController(message, spell.card.name), owner: inferController(message, spell.card.name), zone: 'stack' });
    const effects = targetedEffectsForSpell({ message, spell });
    const spellBindings = targetBindings.filter((binding) => binding.sourceKey === spell.card.normalizedName);
    const targets = effects.map((effect, index) => {
      const compiled = spellBindings.find((binding) => binding.effectIndex === index);
      if (effect.target?.kind === 'spell') {
        return inferTargetForSpell({ message, source: spell.card, state, stackObjects: state.stack, effect }) || compiled?.target || null;
      }
      return compiled?.target || inferTargetForSpell({ message, source: spell.card, state, stackObjects: state.stack, effect });
    });
    const targetChecks = effects.map((effect, index) => {
      const hasExplicitTarget = Boolean(targets[index] || spellBindings[index]?.descriptor);
      return hasExplicitTarget ? validateTarget({ sourceObject, target: targets[index], effect }) : { legal: true, failures: [], missingImplicitTarget: true };
    });
    targetChecks.forEach((targetCheck, index) => {
      state.trace.push({ type: 'TargetChosen', source: sourceObject.name, target: targets[index]?.name || null, legal: targetCheck.legal, failures: targetCheck.failures, targetIndex: index + 1 });
    });
    const failedTarget = targetChecks.find((targetCheck) => !targetCheck.legal);
    if (failedTarget) {
      return evaluated('no', `${sourceObject.name} cannot be put on the stack with only illegal targets.`, {
        cards,
        primitives: [...primitives, ...effects.flatMap((effect) => effect.primitives || [])],
        trace: state.trace,
        sequence: failedTarget.failures
      });
    }
    stack.push({ sourceObject, effects, targets });
    state.stack.push(sourceObject);
  }

  const top = stack.at(-1);
  if (top?.effects?.length && top.targets.every((target) => !target)) return null;
  sequence.push(...applyCompiledResponses({ message, state, targetBindings }));
  compileScenarioTrace({ state, cards, targetBindings, responses: sequence.filter((entry) => /\bgains?\b/.test(entry)) });

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry.sourceObject.zone !== 'stack') {
      state.trace.push({ type: 'ResolveSkipped', object: entry.sourceObject.name, reason: `object is in ${entry.sourceObject.zone}` });
      continue;
    }
    state.trace.push({ type: 'ResolveStart', object: entry.sourceObject.name });
    const normalized = normalizeMagicText(message);
    for (const target of entry.targets) {
      if (target?.zone === 'battlefield'
      && (normalized.includes(`${target.card.normalizedName} leaves battlefield before resolution`)
        || normalized.includes(`${target.card.normalizedName} changes zone before resolution`)
        || normalized.includes('leaves battlefield before resolution')
        || normalized.includes('changes zone before resolution'))) {
        moveObject(state, target, 'graveyard', 'scenario: target left before resolution');
      }
    }
    const resolutionChecks = entry.effects.map((effect, index) => validateTarget({ sourceObject: entry.sourceObject, target: entry.targets[index], effect }));
    resolutionChecks.forEach((targetCheck, index) => {
      state.trace.push({ type: 'TargetCheckOnResolution', source: entry.sourceObject.name, target: entry.targets[index]?.name || null, legal: targetCheck.legal, failures: targetCheck.failures, targetIndex: index + 1 });
    });
    if (resolutionChecks.every((targetCheck) => !targetCheck.legal)) {
      sequence.push(`${entry.sourceObject.name} has no legal targets as it resolves.`);
      continue;
    }
    for (let index = 0; index < entry.effects.length; index += 1) {
      if (!resolutionChecks[index].legal) {
        sequence.push(`${entry.sourceObject.name} ignores illegal target ${entry.targets[index]?.name || index + 1}.`);
        continue;
      }
      const applied = applyEffect({ state, sourceObject: entry.sourceObject, effect: entry.effects[index], target: entry.targets[index], message });
      if (applied.needsClarification) {
        return {
          status: 'depends',
          verdict: 'depends',
          summary: `${entry.sourceObject.name} needs missing scenario information.`,
          cards,
          rules: primitiveRules([...primitives, ...applied.primitives]),
          mechanics: [...primitives, ...applied.primitives],
          trace: state.trace,
          sequence,
          clarificationNeeded: applied.needsClarification
        };
      }
      if (applied.unsupported) return null;
      sequence.push(...applied.sequence);
      primitives.push(...applied.primitives);
    }
    sequence.push(...runStateBasedActionsRuntime(state));
    collectTriggeredAbilities(state);
  }

  const text = normalizeMagicText(message);
  const destroyed = state.events.some((event) => event.type === 'CreatureDied');
  const lastTargetCheck = state.trace.filter((entry) => entry.type === 'TargetCheckOnResolution').at(-1);
  const verdict = lastTargetCheck && !lastTargetCheck.legal
    ? 'no'
    : /\bdestroy|die|dies|damage|exile\b/.test(text)
      ? (destroyed || state.events.some((event) => event.to === 'exile') ? 'yes' : 'no')
      : 'yes';
  const summary = lastTargetCheck && !lastTargetCheck.legal
    ? `${lastTargetCheck.source} has no legal targets as it resolves.`
    : sequence.at(-1) || 'The runtime resolved the supported stack sequence.';

  return evaluated(verdict, summary, {
    cards,
    primitives,
    trace: state.trace,
    sequence,
    state,
    runtime: {
      pendingTriggers: state.pendingTriggers.length,
      graveyard: state.battlefield.filter((object) => object.zone === 'graveyard').map((object) => object.name),
      exile: state.battlefield.filter((object) => object.zone === 'exile').map((object) => object.name)
    }
  });
}

function evaluateWardStack({ message, cards, genericObjects, scenario }) {
  const wardObjectDescriptor = scenario.objects.find((object) => object.abilities?.some((ability) => ability.keyword === 'ward'));
  const action = scenario.actions.find((candidate) => candidate.targets.some((target) => target.objectId === wardObjectDescriptor?.id));
  if (!wardObjectDescriptor || !action) return null;
  const spellCard = cards.find((card) => normalizeMagicText(card.name) === normalizeMagicText(action.source.name));
  if (!spellCard) return null;

  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  const target = state.objects.get(action.targets[0]?.objectId)
    || state.battlefield.find((object) => normalizeMagicText(object.name) === normalizeMagicText(wardObjectDescriptor.name));
  if (!target) return null;
  const cast = castSpell(state, {
    card: spellCard,
    controller: action.actor,
    targets: [target],
    modes: action.modes,
    costs: action.costs,
    chosenValues: {},
    skipTiming: true,
    validateTarget
  });
  if (!cast.cast) {
    const failures = cast.targetChecks?.flatMap((check) => check.failures || []) || [];
    return evaluated('no', `${spellCard.name} cannot be cast with that target.`, {
      cards,
      primitives: ['casting', 'targeting', 'stack'],
      trace: state.trace,
      sequence: failures
    });
  }

  const paymentChoice = scenario.choices.find((choice) => choice.reason === 'ward');
  const paymentChoices = paymentChoice ? [{ ...paymentChoice, sourceObjectId: target.id }] : [];
  const sequence = [`${spellCard.name} is cast targeting ${target.name}.`, `${target.name}'s ward ability triggers and is put on the stack above ${spellCard.name}.`];
  const resolveWard = () => resolveTopOfStack(state, { paymentChoices });
  passPriority(state, state.game.priorityHolder, { resolve: resolveWard });
  const wardPass = passPriority(state, state.game.priorityHolder, { resolve: resolveWard });
  const wardResolution = wardPass.result;

  if (wardResolution?.status === 'depends') {
    return {
      status: 'depends',
      verdict: 'depends',
      summary: `${target.name} has ward, so the result depends on whether its ward cost is paid.`,
      cards,
      rules: primitiveRules(['casting', 'targeting', 'triggers', 'stack', 'costs', 'ward', 'timing']),
      mechanics: ['casting', 'targeting', 'triggers', 'stack', 'costs', 'ward', 'timing'],
      trace: state.trace,
      sequence,
      clarificationNeeded: `Was ${target.name}'s ward cost paid?`
    };
  }

  const paymentStatus = wardResolution?.payment?.status || PAYMENT_STATUS.UNSPECIFIED;
  if (wardResolution?.countered) {
    sequence.push(`${target.name}'s ward trigger resolves with payment status ${paymentStatus}.`);
    sequence.push(`${spellCard.name} is countered and put into its owner's graveyard.`);
    return evaluated('no', `${spellCard.name} is countered by Ward because the Ward cost was not paid.`, {
      cards,
      primitives: ['casting', 'targeting', 'triggers', 'stack', 'costs', 'ward', 'timing'],
      trace: state.trace,
      sequence,
      state,
      runtime: { paymentStatus, spellStatus: cast.stackObject.status, targetZone: target.zone, stackDepth: state.stack.length }
    });
  }

  sequence.push(`${target.name}'s ward trigger resolves with its cost paid; ${spellCard.name} remains on the stack.`);
  const effectSequence = [];
  const resolveSpell = () => resolveTopOfStack(state, {
    resolveEffect: ({ state: resolutionState, stackObject, effect, target: effectTarget }) => {
      const targetCheck = validateTarget({ sourceObject: stackObject.sourceObject, target: effectTarget, effect });
      resolutionState.trace.push({ type: 'TargetCheckOnResolution', source: stackObject.sourceObject.name, target: effectTarget?.name || null, legal: targetCheck.legal, failures: targetCheck.failures });
      if (!targetCheck.legal) return { targetCheck, sequence: [] };
      const result = executeTypedEffect({ state: resolutionState, sourceObject: stackObject.sourceObject, controller: stackObject.controller, effect, target: effectTarget });
      const summary = typedEffectSummary(stackObject.sourceObject, effect, effectTarget, result);
      if (summary) effectSequence.push(summary);
      return { targetCheck, result };
    }
  });
  passPriority(state, state.game.priorityHolder, { resolve: resolveSpell });
  passPriority(state, state.game.priorityHolder, { resolve: resolveSpell });
  sequence.push(...effectSequence);
  const affected = target.zone !== 'battlefield';
  return evaluated(affected ? 'yes' : 'no', effectSequence.at(-1) || `${spellCard.name} resolves after the Ward cost is paid.`, {
    cards,
    primitives: ['casting', 'targeting', 'triggers', 'stack', 'costs', 'ward', 'timing', 'resolving'],
    trace: state.trace,
    sequence,
    state,
    runtime: { paymentStatus, spellStatus: cast.stackObject.status, targetZone: target.zone, stackDepth: state.stack.length }
  });
}

function typedEffectSummary(sourceObject, effect, target, result) {
  if (!result || result.status === 'unsupported' || result.status === 'depends') return null;
  if (effect.type === 'DestroyEffect' && result.to === 'graveyard') return `${sourceObject.name} destroys ${target.name}.`;
  if (effect.type === 'DestroyEffect' && result.survived) return `${target.name} is indestructible, so it is not destroyed.`;
  if (effect.type === 'ExileEffect' && result.to === 'exile') return `${sourceObject.name} exiles ${target.name}.`;
  if (effect.type === 'ZoneChangeEffect' && result.to) return `${sourceObject.name} moves ${target.name} to ${result.to}.`;
  if (effect.type === 'DamageEffect' && Number.isFinite(result.dealt)) return `${sourceObject.name} deals ${result.dealt} damage to ${target.name}.`;
  return null;
}

function evaluateTimingPermissionQuestion({ message, cards, genericObjects, scenario }) {
  const text = normalizeMagicText(message);
  const asksPermission = /\b(?:can|may) (?:i|player|you) (?:cast|activate)\b/.test(text)
    || /\bis (?:casting|activating)\b.*\blegal\b/.test(text);
  const hasTimingContext = /\b(?:right now|now|during|after|before|between|in response)\b/.test(text)
    || scenario.game.factsProvided.phase;
  if (!asksPermission || !hasTimingContext) return null;
  const action = scenario.actions[0];
  const card = cards.find((candidate) => normalizeMagicText(candidate.name) === normalizeMagicText(action?.source?.name));
  if (!action || !card) return null;
  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  if (scenario.game.stackEmpty === false) state.stack.push({ id: 'stack-context', kind: 'UnknownStackObject' });
  const timing = checkTimingPermission({
    state,
    card,
    actionType: action.type,
    playerId: action.actor,
    factsProvided: scenario.game.factsProvided
  });
  const primitives = ['timing', 'casting', 'stack'];
  if (timing.status === 'depends') {
    return {
      status: 'depends',
      verdict: 'depends',
      summary: `${card.name}'s timing depends on missing game state.`,
      cards,
      rules: primitiveRules(primitives),
      mechanics: primitives,
      trace: [{ type: 'TimingPermissionChecked', card: card.name, actionType: action.type, status: timing.status, code: timing.code, missing: timing.missing }],
      sequence: [],
      clarificationNeeded: `Please specify ${timing.missing.join(', ')}.`
    };
  }
  if (timing.status === 'unverified') {
    return unsupported(timing.reason, {
      cards,
      primitives,
      trace: [{ type: 'TimingPermissionChecked', card: card.name, actionType: action.type, status: timing.status, code: timing.code }]
    });
  }
  const actionVerb = action.type === 'Activate' ? 'activated' : 'cast';
  return evaluated(timing.allowed ? 'yes' : 'no', timing.allowed ? `${card.name} can be ${actionVerb} in the supplied game state.` : timing.reason, {
    cards,
    primitives,
    trace: [{ type: 'TimingPermissionChecked', card: card.name, actionType: action.type, status: timing.status, code: timing.code }],
    state
  });
}

function evaluateSpecialActionQuestion({ message, cards, scenario }) {
  const text = normalizeMagicText(message);
  if (!/\bcan (?:i|player|you)\b/.test(text)) return null;
  const unsupportedAction = inferUnsupportedSpecialAction(text);
  const landCard = cards.find((candidate) => /\bland\b/.test(candidate.normalizedType));
  const landQuestion = /\bplay\b/.test(text) && (/\bland\b/.test(text) || Boolean(landCard && text.includes(landCard.normalizedName)));
  if (!landQuestion && !unsupportedAction) return null;

  const actionType = landQuestion ? SPECIAL_ACTION_TYPES.PLAY_LAND : unsupportedAction;
  const state = createMagicRuntimeState({ cards: [], genericObjects: [], scenario, message });
  if (scenario.game.stackEmpty === false) state.stack.push({ id: 'stack-context', kind: 'UnknownStackObject' });
  const sourceZone = scenario.game.landSourceZone || null;
  const legality = checkSpecialAction({
    state,
    actionType,
    playerId: 'player',
    card: landQuestion ? landCard || { name: 'Specified Land', typeLine: 'Land', oracleText: '' } : null,
    sourceZone,
    factsProvided: scenario.game.factsProvided
  });
  const primitives = ['timing'];
  const trace = [{
    type: 'SpecialActionPermissionChecked',
    actionType,
    status: legality.status,
    code: legality.code,
    currentActionState: legality.currentActionState
  }];
  if (legality.status === 'depends') {
    return {
      status: 'depends',
      verdict: 'depends',
      summary: 'The special-action legality depends on missing game state.',
      cards,
      rules: primitiveRules(primitives),
      mechanics: primitives,
      trace,
      sequence: [],
      clarificationNeeded: `Please specify ${legality.missing.join(', ')}.`
    };
  }
  if (legality.status === 'unverified') {
    return unsupported(legality.reason, { cards, primitives, trace });
  }
  return evaluated(legality.allowed ? 'yes' : 'no', legality.reason, {
    cards,
    primitives,
    trace,
    state,
    runtime: legality.currentActionState
  });
}

const PHASE_FIVE_EFFECTS = new Set([
  'LifeChange', 'DrawEffect', 'DiscardEffect', 'MillEffect', 'SacrificeEffect',
  'TokenCreation', 'CounterModification', 'ZoneChangeEffect', 'SearchEffect'
]);

function evaluateTypedSpellEffects({ message, cards, genericObjects, scenario }) {
  const action = scenario.actions[0];
  if (!action || scenario.actions.length !== 1) return null;
  const card = cards.find((candidate) => normalizeMagicText(candidate.name) === normalizeMagicText(action.source.name));
  if (!card) return null;
  const semantics = parseOracleSemantics(card);
  const effects = semantics.spellAbilities?.[0]?.effects || [];
  if (effects.length === 0 || !effects.every((effect) => PHASE_FIVE_EFFECTS.has(effect.type))) return null;
  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  const sourceObject = createGameObject({ card, controller: action.actor, owner: action.actor, zone: 'stack' });
  const sequence = [];
  const results = [];
  for (let index = 0; index < effects.length; index += 1) {
    const effect = effects[index];
    const targetId = action.targets[index]?.objectId || action.targets[0]?.objectId;
    const target = targetId ? state.objects.get(targetId) : null;
    const legalOpponents = opponentsOf(state, action.actor);
    const targetPlayer = effect.subject?.includes('opponent') || effect.target?.kind === 'player'
      ? legalOpponents.length === 1 ? legalOpponents[0] : null
      : null;
    const result = executeTypedEffect({
      state,
      effect,
      sourceObject,
      controller: action.actor,
      target,
      targetPlayer,
      allowPlaceholders: ['DrawEffect', 'MillEffect'].includes(effect.type)
    });
    results.push(result);
    if (result.status === 'depends') {
      return {
        status: 'depends', verdict: 'depends',
        summary: `${card.name} needs a player choice before its typed effect can finish.`,
        cards, rules: primitiveRules(['effects', 'zones', 'replacement']), mechanics: ['effects', 'zones', 'replacement'],
        trace: state.trace, sequence,
        clarificationNeeded: result.clarificationNeeded || 'Which legal choice is made?'
      };
    }
    if (result.status === 'unsupported') {
      return unsupported(result.reason || `${card.name} contains a parsed effect outside current execution coverage.`, {
        cards, primitives: ['effects'], trace: state.trace
      });
    }
    sequence.push(typedExecutionSummary(card, effect, target, targetPlayer, result));
  }
  runStateBasedActionsRuntime(state);
  collectTriggeredAbilities(state);
  return evaluated('yes', sequence.filter(Boolean).at(-1) || `${card.name}'s typed effects resolve.`, {
    cards,
    primitives: ['effects', 'zones', 'replacement', 'state-based-actions', 'triggers'],
    trace: state.trace,
    sequence: sequence.filter(Boolean),
    state,
    runtime: { typedEffects: effects.map((effect) => effect.type), results }
  });
}

function evaluateContinuousScenario({ message, cards, genericObjects, scenario }) {
  if (scenario.actions.length > 0 || scenario.continuousEffects.length === 0 || genericObjects.length === 0) return null;
  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  const target = state.objects.get(scenario.continuousEffects[0]?.targetObjectId) || state.battlefield[0];
  if (!target) return null;
  const characteristics = deriveCharacteristics(state, target);
  if (characteristics.status !== 'ready') return unsupported(characteristics.reason || 'The continuous-effect dependency graph could not be resolved safely.', {
    cards, primitives: ['continuous', 'layers', 'dependencies'], trace: state.trace
  });
  const text = normalizeMagicText(message);
  const expectedPt = text.match(/\b(?:is it|does it become|is (?:the|my) [a-z ]+) (?:a )?(\d+)\/(\d+)\b/);
  if (!expectedPt) return unsupported('The layer runtime derived the object, but the requested characteristic comparison was not identified safely.', {
    cards, primitives: ['continuous', 'layers'], trace: state.trace
  });
  const matches = characteristics.power === Number(expectedPt[1]) && characteristics.toughness === Number(expectedPt[2]);
  const summary = `${characteristics.name} is ${characteristics.power}/${characteristics.toughness} after continuous effects are applied in layer order.`;
  return evaluated(matches ? 'yes' : 'no', summary, {
    cards,
    primitives: ['continuous', 'layers', 'timestamps', 'dependencies'],
    trace: state.trace,
    sequence: [summary],
    state,
    runtime: { characteristics, continuousEffectIds: characteristics.appliedEffects }
  });
}

function combatAssignments(state, scenario) {
  const text = normalizeMagicText(scenario.sourceText);
  if (!/\b(?:remaining|excess|rest of the) damage\b.{0,50}\b(?:player|opponent)\b|\btrample(?:s)? over\b/.test(text)) return {};
  const assignments = {};
  for (const attackerEntry of state.combat.attackers) {
    const attacker = state.objects.get(attackerEntry.objectId);
    const blockers = attackerEntry.blockerIds.map((id) => state.objects.get(id)).filter((object) => object?.zone === 'battlefield');
    if (blockers.length !== 1 || !derivedHasAbility(state, attacker, 'trample')) continue;
    const characteristics = deriveCharacteristics(state, attacker);
    const blocker = blockers[0];
    const lethal = derivedHasAbility(state, attacker, 'deathtouch') ? 1 : Math.max(0, deriveCharacteristics(state, blocker).toughness - blocker.damageMarked);
    assignments[attacker.id] = { [blocker.id]: Math.min(characteristics.power, lethal), defender: Math.max(0, characteristics.power - lethal) };
  }
  return assignments;
}

function evaluateCombatPriorityQuestion({ message, cards, scenario }) {
  const text = normalizeMagicText(message);
  const timingWindow = /\bbeginning of combat\b/.test(text) ? 'beginning-of-combat'
    : /\bafter attackers(?: are declared)?\b/.test(text) ? 'after-attackers'
      : /\bafter blockers(?: are declared)?\b/.test(text) ? 'after-blockers'
        : /\bbetween first strike (?:damage )?and (?:normal|regular) (?:combat )?damage\b|\bafter first strike (?:combat )?damage\b/.test(text) ? 'first-strike-gap'
          : null;
  if (!/\bcan (?:i|player|you) cast\b/.test(text) || !timingWindow) return null;
  const card = cards.find((candidate) => text.includes(candidate.normalizedName));
  if (!card) return null;
  const state = createMagicRuntimeState({ cards: [], genericObjects: [], scenario: null, message });
  beginCombat(state, { attackingPlayer: 'player', defendingPlayer: 'opponent' });
  if (['after-attackers', 'after-blockers', 'first-strike-gap'].includes(timingWindow)) {
    const attacker = timingWindow === 'first-strike-gap'
      ? addPermanent(state, createGameObject({ name: 'Timing First Striker', controller: 'player', owner: 'player', power: 1, toughness: 1, abilities: [{ keyword: 'first strike', text: 'first strike' }] }))
      : null;
    declareAttackers(state, attacker ? [attacker] : []);
  }
  if (['after-blockers', 'first-strike-gap'].includes(timingWindow)) declareBlockers(state, []);
  if (timingWindow === 'first-strike-gap') executeCombatDamageStep(state, { step: 'first-strike-combat-damage' });
  if (scenario.game.factsProvided.priority) state.game.priorityHolder = scenario.game.priorityHolder;
  const timing = checkTimingPermission({
    state, card, actionType: 'Cast', playerId: 'player'
  });
  state.trace.push({ type: 'TimingPermissionChecked', card: card.name, actionType: 'Cast', status: timing.status, code: timing.code });
  if (timing.status === 'unverified') {
    return unsupported(timing.reason, {
      cards,
      primitives: ['combat', 'timing', 'casting', 'stack'],
      trace: state.trace
    });
  }
  const summary = timing.allowed
    ? `${card.name} can be cast in the supported ${timingWindow} priority window.`
    : `${card.name} cannot be cast in that combat priority window. ${timing.reason || ''}`.trim();
  return evaluated(timing.allowed ? 'yes' : 'no', summary, {
    cards, primitives: ['combat', 'timing', 'casting', 'stack'], trace: state.trace, state,
    runtime: { combatStep: state.combat.step, timingWindow, priorityHolder: state.game.priorityHolder }
  });
}

function evaluateCombatScenario({ message, cards, genericObjects, scenario }) {
  if (!scenario.combat) return null;
  if (scenario.combat.status === 'unsupported') return unsupported(scenario.combat.reason, {
    cards, primitives: ['combat'], trace: [{ type: 'CombatCompileUnsupported', reason: scenario.combat.reason }]
  });
  if (scenario.combat.blockedButUnidentified) {
    return {
      status: 'depends', verdict: 'depends', summary: 'Combat damage depends on the unidentified blocker and the damage assignment.',
      cards, rules: primitiveRules(['combat', 'blockers', 'damage', 'trample']), mechanics: ['combat', 'blockers', 'damage', 'trample'],
      trace: [{ type: 'CombatStateIncomplete', missing: ['blocking creature', 'damage assignment'] }], sequence: [],
      clarificationNeeded: 'What creature is blocking, and how is combat damage assigned?'
    };
  }
  if (scenario.actions.length > 0 && scenario.combat.interventionWindow) return unsupported('Casting a compiled spell inside a combat priority window is not yet connected to automatic combat continuation.', {
    cards, primitives: ['combat', 'timing', 'stack'], trace: [{ type: 'CombatInterventionUnsupported', window: scenario.combat.interventionWindow }]
  });
  const state = createMagicRuntimeState({ cards, genericObjects, scenario, message });
  const begun = beginCombat(state, scenario.combat);
  if (begun.status !== 'ready') return unsupported(begun.reason, { cards, primitives: ['combat'], trace: state.trace });
  const attackers = declareAttackers(state, scenario.combat.attackers);
  if (attackers.status === 'unsupported') return unsupported(attackers.reason, { cards, primitives: ['combat', 'attackers'], trace: state.trace });
  if (attackers.status === 'illegal') return evaluated('no', attackers.reason, { cards, primitives: ['combat', 'attackers'], trace: state.trace, state });
  const blockers = declareBlockers(state, scenario.combat.blocks);
  if (blockers.status === 'unsupported') return unsupported(blockers.reason, { cards, primitives: ['combat', 'blockers'], trace: state.trace });
  if (blockers.status === 'illegal') return evaluated('no', blockers.reason, { cards, primitives: ['combat', 'blockers'], trace: state.trace, state });
  for (const blockerId of scenario.combat.removedBeforeDamage || []) {
    const blocker = state.objects.get(blockerId);
    if (!blocker) continue;
    removeBlockerFromCombat(state, blocker);
    moveObjectWithResult(state, blocker, 'graveyard', 'scenario: blocker removed before combat damage');
  }
  const resolution = executeCombat(state, { assignments: combatAssignments(state, scenario) });
  if (resolution.status === 'depends') {
    return {
      status: 'depends', verdict: 'depends', summary: resolution.reason,
      cards, rules: primitiveRules(['combat', 'damage', 'trample']), mechanics: ['combat', 'damage', 'trample'],
      trace: state.trace, sequence: [], clarificationNeeded: 'How is combat damage assigned?'
    };
  }
  if (resolution.status !== 'resolved') return unsupported(resolution.reason || 'Combat damage could not be resolved safely.', {
    cards, primitives: ['combat', 'damage'], trace: state.trace
  });
  endCombat(state);
  const text = normalizeMagicText(message);
  const attacker = state.objects.get(scenario.combat.attackers[0]?.objectId);
  const blocker = state.objects.get(scenario.combat.blocks[0]?.blockerIds?.[0]);
  const asksAttackerDies = /\b(?:does|will) (?:my |the )?(?:attacker|attacking creature|creature) die\b/.test(text);
  const asksBlockerDies = /\b(?:does|will) (?:their |the )?blocker die\b/.test(text);
  const subject = asksBlockerDies ? blocker : attacker;
  const diesQuestion = asksAttackerDies || asksBlockerDies;
  const died = subject?.zone === 'graveyard';
  const playerDamage = state.combat.damageAssignments.filter((entry) => entry.targetId === scenario.combat.defendingPlayer).reduce((sum, entry) => sum + entry.amount, 0);
  const summary = diesQuestion
    ? `${subject?.name || 'The creature'} ${died ? 'dies' : 'survives'} after combat damage and state-based actions.`
    : `Combat resolves with ${playerDamage} damage assigned to ${scenario.combat.defendingPlayer}.`;
  return evaluated(diesQuestion ? (died ? 'yes' : 'no') : 'yes', summary, {
    cards,
    primitives: ['combat', 'attackers', 'blockers', 'damage', 'state-based-actions', 'triggers', 'timing'],
    trace: state.trace,
    sequence: state.trace.filter((entry) => ['AttackDeclared', 'BlockDeclared', 'DamageDealt', 'CreatureDied'].includes(entry.type)).map((entry) => entry.type),
    state,
    runtime: { combat: state.combat, playerDamage, attackerZone: attacker?.zone, blockerZone: blocker?.zone }
  });
}

function typedExecutionSummary(card, effect, target, targetPlayer, result) {
  if (effect.type === 'LifeChange') return `${targetPlayer || 'The player'} ${effect.direction === 'gain' ? 'gains' : 'loses'} ${effect.amount.value} life.`;
  if (effect.type === 'DrawEffect') return `${card.name}'s controller draws ${result.drawn?.length || 0} cards.`;
  if (effect.type === 'DiscardEffect') return `${targetPlayer || 'The player'} discards ${result.discarded?.length || result.results?.[0]?.discarded?.length || 0} cards.`;
  if (effect.type === 'MillEffect') return `${targetPlayer || 'The player'} mills ${result.milled?.length || 0} cards.`;
  if (effect.type === 'TokenCreation') return `${card.name} creates ${result.created?.length || 0} creature tokens.`;
  if (effect.type === 'CounterModification') return `${target?.name || 'The permanent'} now has ${result.total} ${effect.counter} counters.`;
  if (effect.type === 'ZoneChangeEffect') return `${card.name} moves ${target?.name || 'the target'} to ${result.to}.`;
  if (effect.type === 'SearchEffect') return result.found ? `${card.name} finds ${result.found.name} and moves it to ${result.destination}.` : `${card.name}'s controller may search and fail to find a matching card.`;
  if (effect.type === 'SacrificeEffect') return `${result.object?.name || 'The chosen permanent'} is sacrificed.`;
  return `${card.name}'s ${effect.type} resolves.`;
}

function commanderScenarioState(card, { zone = 'battlefield', controller = 'player', includeCopy = false, secondCommander = false, designated = true, castsFromCommandZone = 0 } = {}) {
  const commanderId = 'commander-object-1';
  const designationId = `commander-designation:player:${commanderId}`;
  const objects = [{
    id: commanderId,
    name: card.name,
    card,
    owner: 'player',
    controller,
    zone,
    commander: designated,
    commanderDesignationId: designated ? designationId : null,
    abilities: [],
    counters: {}
  }];
  if (includeCopy) objects.push({
    ...objects[0],
    id: 'same-name-copy-1',
    zone: 'battlefield',
    commander: false,
    commanderDesignationId: null
  });
  if (secondCommander) objects.push({
    ...objects[0],
    id: 'commander-object-2',
    name: 'Other Designated Commander',
    card: normalizeMagicCard({ ...card, id: 'other-designated-commander', name: 'Other Designated Commander' }),
    commanderDesignationId: 'commander-designation:player:commander-object-2'
  });
  const scenario = {
    type: 'MagicScenario',
    version: 1,
    format: {
      id: 'commander',
      commanderDesignations: designated ? [
        { id: designationId, objectId: commanderId, ownerId: 'player', startingZone: zone, castsFromCommandZone },
        ...(secondCommander ? [{ id: 'commander-designation:player:commander-object-2', objectId: 'commander-object-2', ownerId: 'player', startingZone: zone, castsFromCommandZone: 0 }] : [])
      ] : []
    },
    objects,
    continuousEffects: [],
    game: {
      activePlayer: 'player',
      phase: 'main',
      step: 'precombat-main',
      priorityHolder: 'player',
      stackEmpty: true,
      factsProvided: { turn: true, phase: true, stack: true, priority: true }
    }
  };
  const state = createMagicRuntimeState({ cards: [card, ...(secondCommander ? [objects[1].card] : [])], scenario, message: objects.map((object) => object.name).join(' ') });
  state.players.player.life = 40;
  state.players.opponent.life = 40;
  return state;
}

function evaluateCommanderDamageScenario({ message, cards, scenario, card, commanderLabel }) {
  const text = normalizeMagicText(message);
  const splitRecipients = text.match(/\b(?:my |the |this )?commander\b.{0,35}\b(?:dealt|has dealt) ([a-z0-9-]+) (\d+) and ([a-z0-9-]+) (\d+)/);
  if (splitRecipients && splitRecipients[1] !== splitRecipients[3] && /\bis that 21\b|\bdoes (?:that|it) (?:equal|count as) 21\b/.test(text)) {
    const [, firstName, firstAmount, secondName, secondAmount] = splitRecipients;
    const state = createMagicRuntimeState({
      scenario: {
        players: [{ id: 'player', name: 'Player' }, { id: firstName, name: firstName }, { id: secondName, name: secondName }],
        objects: [], continuousEffects: [], format: { id: 'commander', commanderDesignations: [] },
        game: { activePlayer: 'player', turnOrder: ['player', firstName, secondName], phase: 'main', step: 'precombat-main', priorityHolder: 'player' }
      }
    });
    const commander = addPermanent(state, createGameObject({
      id: 'split-recipient-commander', card, name: commanderLabel, owner: 'player', controller: 'player', commander: true
    }));
    const designation = designateCommander(state, commander, { ownerId: 'player', designationId: 'split-recipient-designation' });
    setCommanderDamageTotal(state, firstName, designation.id, Number(firstAmount));
    setCommanderDamageTotal(state, secondName, designation.id, Number(secondAmount));
    const stateBasedActions = runStateBasedActionsRuntime(state);
    return evaluated('no', `No. Commander damage is tracked separately for each recipient: ${firstName} has ${firstAmount} and ${secondName} has ${secondAmount}; those totals do not combine.`, {
      cards,
      primitives: ['commander', 'combat', 'damage', 'state-based-actions'],
      trace: state.trace,
      state,
      runtime: {
        commanderDamage: {
          designationId: designation.id,
          recipients: {
            [firstName]: commanderDamageTotal(state, firstName, designation.id),
            [secondName]: commanderDamageTotal(state, secondName, designation.id)
          }
        },
        stateBasedActions
      }
    });
  }
  const compiled = scenario.format?.commanderDamage;
  if (!compiled) return null;
  if (compiled.unsupported) {
    return unsupported(`This ${compiled.unsupported.replaceAll('-', ' ')} edge cannot be represented safely by the current Commander runtime.`, {
      cards,
      primitives: ['commander', 'combat', 'damage', 'state-based-actions']
    });
  }
  if (!compiled.known) {
    const missing = compiled.ambiguity === 'commander-designation' ? 'which commander designation dealt the prior damage' : 'the prior damage total for one specific commander';
    return dependent(`Commander-damage loss depends on ${missing}.`, {
      cards,
      primitives: ['commander', 'combat', 'damage', 'state-based-actions'],
      clarificationNeeded: `Specify ${missing}.`
    });
  }

  const state = commanderScenarioState(card, {
    controller: compiled.controllerId,
    secondCommander: compiled.prior.some((entry) => entry.designation === 'secondary')
  });
  const primary = state.objects.get('commander-object-1');
  const secondary = state.objects.get('commander-object-2');
  const recipient = compiled.recipientId;
  state.players[recipient].life += compiled.lifeGain;
  for (const entry of compiled.prior) {
    const source = entry.designation === 'secondary' ? secondary : primary;
    if (source && setCommanderDamageTotal(state, recipient, source, entry.amount) == null) {
      return dependent('The prior Commander damage could not be tied to a stable commander designation.', {
        cards,
        primitives: ['commander', 'damage'],
        state,
        clarificationNeeded: 'Identify which designated commander dealt the prior combat damage.'
      });
    }
  }

  const designation = commanderDesignationFor(state, primary);
  const priorTotal = commanderDamageTotal(state, recipient, designation.id);
  let damageResult = null;
  if (compiled.incoming) {
    if (compiled.incoming.prevented > 0) state.preventionEffects.push({
      id: 'public-commander-damage-prevention',
      remaining: compiled.incoming.prevented,
      applies: (event) => event.type === 'Damage' && event.player === recipient && event.source?.id === primary.id
    });
    damageResult = dealDamageToPlayerWithResult(
      state,
      recipient,
      compiled.incoming.amount,
      primary,
      { combat: compiled.incoming.combat, publicCommanderScenario: true }
    );
    if (damageResult.status !== 'committed') {
      return unsupported(damageResult.reason || 'The Commander damage event could not be committed safely.', {
        cards,
        primitives: ['commander', 'combat', 'damage'],
        trace: state.trace
      });
    }
  }
  const stateBasedActions = runStateBasedActionsRuntime(state);
  const newTotal = commanderDamageTotal(state, recipient, designation.id);
  const lossEvent = state.events.findLast((event) => event.type === 'PlayerLost' && event.player === recipient && event.metadata?.reason === 'commander combat damage') || null;
  const actualDamage = damageResult?.commanderDamage?.damageDealt || 0;
  const structured = {
    commanderDesignationId: designation.id,
    commanderIdentity: commanderLabel,
    damageRecipient: recipient,
    priorCommanderDamage: priorTotal,
    combatDamageDealt: actualDamage,
    newCommanderDamageTotal: newTotal,
    threshold: COMMANDER_DAMAGE_THRESHOLD,
    stateBasedActionLoss: Boolean(lossEvent),
    supportStatus: 'verified'
  };
  const asksLoss = compiled.asksLoss;
  const countedDamage = actualDamage || (compiled.asksCount ? newTotal : 0);
  const verdict = asksLoss ? (lossEvent ? 'yes' : 'no') : countedDamage > 0 ? 'yes' : 'no';
  const summary = asksLoss
    ? lossEvent
      ? `Yes. ${commanderLabel} has dealt ${newTotal} combat damage to ${recipient}; reaching ${COMMANDER_DAMAGE_THRESHOLD} or more causes that player to lose as a state-based action.`
      : `No. No single commander designation has dealt ${COMMANDER_DAMAGE_THRESHOLD} combat damage to ${recipient}. ${commanderLabel}'s tracked total is ${newTotal}.`
    : countedDamage > 0
      ? `Yes. ${actualDamage || newTotal} combat damage actually dealt to ${recipient} counts, bringing ${commanderLabel}'s tracked total to ${newTotal}.`
      : `No. This event adds 0 Commander damage because only combat damage actually dealt to a player counts.`;
  return evaluated(verdict, summary, {
    cards,
    primitives: ['commander', 'combat', 'damage', 'state-based-actions'],
    trace: state.trace,
    sequence: state.trace.filter((entry) => ['DamageDealt', 'CommanderCombatDamageRecorded', 'PlayerLost'].includes(entry.type)).map((entry) => entry.type),
    state,
    runtime: { commanderDamage: structured, damageResult, stateBasedActions }
  });
}

function explicitCommanderDecision(text, destination) {
  if (/\bcan i (?:put|move|send|return)\b.{0,80}\bcommand zone\b/.test(text)) return 'command';
  if (/\b(?:i |owner )?(?:choose|chose|put|move|send|return)\b.{0,80}\bcommand zone\b/.test(text)) return 'command';
  if (new RegExp(`\\bcan i (?:leave|keep)\\b.{0,80}\\b${destination}\\b`).test(text)) return 'remain';
  if (new RegExp(`\\b(?:i |owner )?(?:choose|chose|leave|keep|remain)\\b.{0,80}\\b${destination}\\b`).test(text)) return 'remain';
  return null;
}

function manaRequirementLabel(requirement) {
  if (!requirement) return 'an unknown mana amount';
  const colored = [
    ['W', requirement.white], ['U', requirement.blue], ['B', requirement.black],
    ['R', requirement.red], ['G', requirement.green], ['C', requirement.colorless]
  ].flatMap(([symbol, count]) => Array.from({ length: count || 0 }, () => `{${symbol}}`));
  return `${requirement.generic ? `{${requirement.generic}}` : ''}${colored.join('')}` || '{0}';
}

function evaluateCommanderTaxScenario({ message, cards, scenario, card, commanderLabel }) {
  const text = normalizeMagicText(message);
  const history = scenario.format?.commanderCastHistory || { known: false, castsFromCommandZone: null, source: 'not-stated' };
  if (/\b(?:unknown|unspecified|not sure (?:which|what)) (?:source )?zone\b|\bfrom somewhere\b/.test(text)) {
    return dependent('Commander tax applies only to a cast from the command zone, so the source zone must be known.', {
      cards,
      primitives: ['commander'],
      clarificationNeeded: 'Which zone is the commander being cast from?'
    });
  }
  const counteredFirstCast = /\bcountered\b/.test(text) && /\b(?:first|once|first time)\b/.test(text);
  const asksWhetherCounteredCastCounts = /\bcountered\b/.test(text)
    && /\b(?:tax increase|increase (?:the )?tax|still count|does (?:it|that) count)\b/.test(text);
  const resetQuestion = /\breset\b/.test(text);
  const sourceZone = /\bfrom (?:my |the )?hand\b|\bhand\b.{0,60}\bfrom there\b/.test(text) ? 'hand'
    : /\bfrom (?:my |the )?graveyard\b|\bgraveyard\b.{0,60}\bfrom there\b/.test(text) ? 'graveyard'
      : /\bfrom (?:my |the )?exile\b/.test(text) ? 'exile'
        : 'command';
  const priorCasts = history.known ? history.castsFromCommandZone : counteredFirstCast || resetQuestion ? 1 : null;
  if (asksWhetherCounteredCastCounts && priorCasts == null) {
    const state = commanderScenarioState(card, { zone: 'command', castsFromCommandZone: 0 });
    const commander = state.objects.get('commander-object-1');
    const cast = castSpell(state, {
      sourceObject: commander,
      controller: 'player',
      factsProvided: state.scenario.game.factsProvided
    });
    if (!cast.cast || !counterStackObject(state, cast.stackObject).countered) {
      return unsupported('The command-zone cast and counter transaction could not be proven safely.', {
        cards,
        primitives: ['commander', 'timing', 'stack'],
        trace: state.trace
      });
    }
    const castHistory = commanderDesignationFor(state, commander);
    return evaluated('yes', `Yes. A successful command-zone cast counts before resolution, so countering ${commanderLabel} does not undo that cast or its future tax increase.`, {
      cards,
      primitives: ['commander', 'timing', 'stack'],
      trace: state.trace,
      state,
      runtime: { cast, castHistory }
    });
  }
  if (sourceZone === 'command' && priorCasts == null) {
    return dependent('Commander tax depends on how many previous times this specific commander was cast from the command zone this game.', {
      cards,
      primitives: ['commander', 'timing'],
      clarificationNeeded: 'How many previous times was this designated commander cast from the command zone?'
    });
  }
  const explicitBase = text.match(/\bcosts? (\d+) mana normally\b|\bbase (?:mana )?cost (?:is |of )?(\d+)\b/);
  const baseAmount = explicitBase ? Number(explicitBase[1] || explicitBase[2]) : null;
  const runtimeCard = baseAmount == null ? card : normalizeMagicCard({ ...card, manaCost: `{${baseAmount}}`, mana_cost: `{${baseAmount}}` });
  const state = commanderScenarioState(runtimeCard, { zone: sourceZone, castsFromCommandZone: priorCasts ?? 0 });
  const commander = state.objects.get('commander-object-1');
  const tax = commanderTaxForCast(state, commander, 'player', { sourceZone });

  if (sourceZone !== 'command') {
    return evaluated('no', `Commander tax does not apply when ${commanderLabel} is cast from ${sourceZone}; only casts from the command zone use or increase its tax history.`, {
      cards,
      primitives: ['commander'],
      state,
      runtime: { commanderTax: tax, castHistory: commanderDesignationFor(state, commander) }
    });
  }
  if (resetQuestion) {
    return evaluated('no', `No. Zone changes do not reset ${commanderLabel}'s command-zone cast history; its next command-zone cast still has ${manaRequirementLabel({ generic: tax.genericMana })} of commander tax.`, {
      cards,
      primitives: ['commander', 'zone-changes'],
      state,
      runtime: { commanderTax: tax, castHistory: commanderDesignationFor(state, commander) }
    });
  }

  const availableMatch = text.match(/\b(?:have|with) (?:exactly )?(\d+) mana\b/);
  const availableMana = availableMatch ? Number(availableMatch[1]) : null;
  const cast = castSpell(state, {
    sourceObject: commander,
    controller: 'player',
    availableMana,
    factsProvided: state.scenario.game.factsProvided
  });
  if (cast.status === 'unsupported') {
    return unsupported(cast.commanderCost?.reason || 'The complete casting cost is not supported.', {
      cards,
      primitives: ['commander', 'timing'],
      trace: state.trace
    });
  }
  if (availableMana != null && !cast.cast) {
    return evaluated('no', `${availableMana} mana is not enough for the supported final requirement ${manaRequirementLabel(cast.commanderCost?.finalManaRequirement)}. The failed cast does not increase commander tax.`, {
      cards,
      primitives: ['commander', 'timing'],
      trace: state.trace,
      state,
      runtime: { cast, commanderTax: tax, cost: cast.commanderCost }
    });
  }
  if (!cast.cast) return unsupported(cast.timing?.reason || 'The command-zone cast could not be proven.', { cards, primitives: ['commander', 'timing'], trace: state.trace });
  const asksTotal = /\bhow much does it cost|\bcosts? now|\btotal cost\b/.test(text);
  const summary = counteredFirstCast
    ? `Yes. The first cast still counts even though the spell was countered, so the next command-zone cast has {2} of commander tax.`
    : asksTotal
      ? `${commanderLabel}'s supported final mana requirement is ${manaRequirementLabel(cast.commanderCost.finalManaRequirement)}: ${manaRequirementLabel(cast.commanderCost.startingManaRequirement)} plus ${manaRequirementLabel({ generic: tax.genericMana })} of commander tax.`
      : `${commanderLabel}'s commander tax is ${manaRequirementLabel({ generic: tax.genericMana })}, based on ${priorCasts} previous command-zone cast${priorCasts === 1 ? '' : 's'}.`;
  return evaluated('yes', summary, {
    cards,
    primitives: ['commander', 'timing', 'stack'],
    trace: state.trace,
    state,
    runtime: { cast, commanderTax: tax, cost: cast.commanderCost, castHistory: commanderDesignationFor(state, commander) }
  });
}

function evaluateCommanderScenario({ message, cards, scenario }) {
  const text = normalizeMagicText(message);
  if (!/\bcommander\b|\bcommand zone\b/.test(text)) return null;
  if (/\bpartner\b|\bbackground\b|\bdoctor'?s companion\b/.test(text)) {
    return unsupported('This multi-commander mechanic is outside the certified Commander subset.', { cards, primitives: ['commander'] });
  }
  if (/\bcolor identity\b|\bsingleton\b|\bdeck (?:legal|legality|construction)\b/.test(text)) return null;
  if (!/\bcommander\b/.test(text)) {
    return unsupported('A command-zone reference alone does not prove Commander format or commander designation.', {
      cards,
      primitives: ['commander'],
      clarificationNeeded: 'Identify the Commander format and the designated commander.'
    });
  }
  const card = cards.find((candidate) => /legendary|creature|artifact|enchantment|planeswalker/i.test(candidate.typeLine)) || cards[0] || normalizeMagicCard({
    id: 'generic-designated-commander',
    name: 'Designated Commander',
    typeLine: 'Legendary Creature',
    oracleText: '',
    power: 1,
    toughness: 1
  });
  const commanderLabel = cards.length ? card.name : 'the designated commander';
  const commanderDamage = evaluateCommanderDamageScenario({ message, cards, scenario, card, commanderLabel });
  if (commanderDamage) return commanderDamage;
  const taxQuestion = /\btax\b|\badditional (?:mana|cost)\b|\bcosts? (?:more|now|\d+ mana normally)\b|\bagain from (?:my |the )?command zone\b|\b(?:first|second|third) time\b|\bcountered\b|\breset\b|\bcast\b.{0,50}\bfrom (?:my |the )?(?:hand|graveyard)\b/.test(text);
  if (taxQuestion) return evaluateCommanderTaxScenario({ message, cards, scenario, card, commanderLabel });

  if (/\bnon.?commander\b/.test(text)) {
    const state = commanderScenarioState(card, { designated: false });
    const object = state.objects.get('commander-object-1');
    const movement = moveObjectWithResult(state, object, /\bexil/.test(text) ? 'exile' : 'graveyard', 'public Commander scenario');
    return evaluated('no', 'A noncommander does not receive the Commander rule that moves a designated commander to the command zone.', {
      cards,
      primitives: ['commander', 'zone-changes'],
      trace: state.trace,
      state,
      runtime: { movement, pendingChoice: state.pendingChoices[0] || null }
    });
  }

  if (/\b(?:second|another) copy\b/.test(text)) {
    const state = commanderScenarioState(card, { includeCopy: true });
    const designated = state.objects.get('commander-object-1');
    const copy = state.objects.get('same-name-copy-1');
    return evaluated('no', `The second copy of ${commanderLabel} is not the commander; commander designation is not inferred from its name.`, {
      cards,
      primitives: ['commander'],
      trace: state.trace,
      state,
      runtime: { designated: isDesignatedCommander(state, designated), copyDesignated: isDesignatedCommander(state, copy) }
    });
  }

  if (/\bcast\b.{0,100}\bcommand zone\b|\bcommand zone\b.{0,100}\bcast\b/.test(text)) {
    const state = commanderScenarioState(card, { zone: 'command' });
    const commander = state.objects.get('commander-object-1');
    const cast = castSpell(state, {
      sourceObject: commander,
      controller: 'player',
      factsProvided: state.scenario.game.factsProvided
    });
    if (!cast.cast) return unsupported(cast.commanderPermission?.reason || cast.timing?.reason || 'The command-zone cast could not be proven.', {
      cards,
      primitives: ['commander', 'timing', 'stack'],
      trace: state.trace
    });
    return evaluated('yes', `${commanderLabel} can be cast from the command zone using the normal spell and stack process.`, {
      cards,
      primitives: ['commander', 'timing', 'stack'],
      trace: state.trace,
      sequence: ['command zone', 'stack'],
      state,
      runtime: { stackObjectType: cast.stackObject.kind, commanderDesignationId: commanderDesignationFor(state, commander)?.id || null }
    });
  }

  const destination = /\bexil/.test(text) ? 'exile'
    : /\bhand\b/.test(text) ? 'hand'
      : /\blibrary\b/.test(text) ? 'library'
        : /\b(?:dies?|died|graveyard)\b/.test(text) ? 'graveyard'
          : null;
  if (!destination) return unsupported('The Commander question does not identify a supported Phase 9A zone movement.', { cards, primitives: ['commander', 'zone-changes'] });
  const controller = /\bopponent controls?\b|\bcontrolled by (?:my )?opponent\b/.test(text) ? 'opponent' : 'player';
  const state = commanderScenarioState(card, { controller });
  const commander = state.objects.get('commander-object-1');
  const designation = commanderDesignationFor(state, commander);
  const asksMustReturn = /\b(?:do i have to|must i|am i required to)\b.{0,100}\bcommand zone\b/.test(text);
  const decision = asksMustReturn ? 'remain' : explicitCommanderDecision(text, destination);
  let movement;
  if (['hand', 'library'].includes(destination)) {
    const replacementId = `commander-zone:${designation.id}:battlefield:${destination}`;
    const replacementChoices = decision === 'command' ? [replacementId] : decision === 'remain' ? [`decline:${replacementId}`] : [];
    movement = moveObjectWithResult(state, commander, destination, 'public Commander scenario', {}, { replacementChoices });
  } else {
    movement = moveObjectWithResult(state, commander, destination, 'public Commander scenario', {}, { commanderReturnChoice: decision });
  }
  if (movement.status === 'depends') {
    const summary = ['hand', 'library'].includes(destination)
      ? `Before the commander moves to ${destination}, its owner must choose whether to put it into the command zone instead.`
      : `The commander reaches ${destination}, then its owner must choose whether to move it to the command zone.`;
    return dependent(summary, {
      cards,
      primitives: ['commander', 'zone-changes', 'state-based-actions'],
      trace: state.trace,
      state,
      clarificationNeeded: movement.clarificationNeeded,
      runtime: { movement, pendingChoice: state.pendingChoices[0] || null }
    });
  }
  const finalZone = commander.zone;
  const summary = decision === 'remain'
    ? asksMustReturn
      ? `No. The commander owner may leave ${commanderLabel} in ${destination}; moving it to the command zone is optional.`
      : `Yes. The commander owner may leave ${commanderLabel} in ${destination}; its commander designation persists there.`
    : `Yes. The commander owner may move ${commanderLabel} to the command zone${['hand', 'library'].includes(destination) ? ' instead' : ' after it reaches the destination zone'}.`;
  return evaluated(asksMustReturn ? 'no' : 'yes', summary, {
    cards,
    primitives: ['commander', 'zone-changes', ...(['graveyard', 'exile'].includes(destination) ? ['state-based-actions'] : ['replacement'])],
    trace: state.trace,
    sequence: state.format.commander.movementHistory.map((entry) => `${entry.from} -> ${entry.to}`),
    state,
    runtime: { movement, finalZone, designation }
  });
}

export function evaluateMagicRulesRuntime({ message = '', cards = [] } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const text = normalizeMagicText(message);
  const scenario = compileMagicScenario({ message, cards: normalizedCards });
  const multiplayer = evaluateMultiplayerCommanderScenario({ message, cards: normalizedCards, scenario });
  if (multiplayer) return multiplayer;
  const commander = evaluateCommanderScenario({ message, cards: normalizedCards, scenario });
  if (commander) return commander;
  if (/\b(humility|opalescence|layer|dependency|timestamp)\b/.test(text)) {
    return unsupported('This is a complex continuous-effect layer/dependency interaction outside the current runtime coverage.', {
      cards: normalizedCards,
      primitives: ['continuous'],
      trace: [{ type: 'UnsupportedContinuousEffect', reason: 'layer/dependency coverage not complete' }]
    });
  }

  const genericObjects = scenario.objects
    .filter((object) => object.name.startsWith('Generic ') || object.name.startsWith('Token '))
    .map((object) => ({ ...object, card: object.card }));
  const specialAction = evaluateSpecialActionQuestion({ message, cards: normalizedCards, scenario });
  if (specialAction) return specialAction;
  const combatTiming = evaluateCombatPriorityQuestion({ message, cards: normalizedCards, scenario });
  if (combatTiming) return combatTiming;
  const combat = evaluateCombatScenario({ message, cards: normalizedCards, genericObjects, scenario });
  if (combat) return combat;
  const timing = evaluateTimingPermissionQuestion({ message, cards: normalizedCards, genericObjects, scenario });
  if (timing) return timing;
  const wardStack = evaluateWardStack({ message, cards: normalizedCards, genericObjects, scenario });
  if (wardStack) return wardStack;
  const globalDamage = evaluateGlobalDamageTriggers({ message, cards: normalizedCards, genericObjects, scenario });
  if (globalDamage) return globalDamage;
  const targetedStack = evaluateTargetedStack({ message, cards: normalizedCards, genericObjects, scenario });
  if (targetedStack) return targetedStack;
  const typedEffects = evaluateTypedSpellEffects({ message, cards: normalizedCards, genericObjects, scenario });
  if (typedEffects) return typedEffects;
  const continuousScenario = evaluateContinuousScenario({ message, cards: normalizedCards, genericObjects, scenario });
  if (continuousScenario) return continuousScenario;
  return unsupported('The authoritative Magic runtime does not yet execute every primitive in this compiled scenario.', {
    cards: normalizedCards,
    primitives: ['continuous'],
    trace: [{ type: 'ScenarioCompiled', scenario }]
  });
}

export { extractGenericObjects } from './scenarioCompiler.js';

function currentPowerLabel(object) {
  return object.basePower ?? object.card.power ?? 0;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function opponentOf(playerId) {
  return playerId === 'player' ? 'opponent' : 'player';
}
