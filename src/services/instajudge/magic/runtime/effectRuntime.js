import { normalizeMagicText } from '../magicCards.js';
import { ORACLE_NODE_TYPES } from './oracleSemantics.js';
import {
  CONTINUOUS_LAYERS,
  PT_SUBLAYERS,
  createContinuousEffect,
  createCopyEffect,
  deriveCharacteristics,
  invalidateCharacteristics
} from './continuousEffects.js';
import {
  addPermanent,
  createGameObject,
  currentPower,
  currentToughness,
  emitEvent,
  markDamageWithResult,
  moveObjectWithResult,
  proposeRuntimeEvent,
  registerGameObject,
  registerPreventionEffect,
  runStateBasedActionsRuntime
} from './runtimeState.js';

function fixedAmount(value) {
  if (Number.isFinite(value)) return value;
  if (value?.kind === 'fixed') return value.value;
  return null;
}

function playerForSubject(subject, controller, targetPlayer) {
  if (targetPlayer) return targetPlayer;
  if (subject === 'you') return controller;
  if (subject === 'each opponent' || subject === 'target opponent') return opponentOf(controller);
  return controller;
}

function zoneObjects(state, playerId, zone) {
  return (state.players[playerId]?.[zone] || []).map((id) => state.objects.get(id)).filter(Boolean);
}

function registerInPlayerZone(state, object, playerId, zone) {
  registerGameObject(state, object);
  const key = zone === 'command' ? 'commandZone' : zone;
  if (state.players[playerId]?.[key] && !state.players[playerId][key].includes(object.id)) state.players[playerId][key].push(object.id);
  return object;
}

export function createGenericZoneCard(state, { playerId = 'player', zone = 'library', name = 'Unknown Card', typeLine = 'Card' } = {}) {
  return registerInPlayerZone(state, createGameObject({
    card: { name, typeLine, oracleText: '' },
    name,
    controller: playerId,
    owner: playerId,
    zone
  }), playerId, zone);
}

export function changeLife(state, { playerId, amount, direction = 'gain', source = null, replacementChoices = [] } = {}) {
  const numeric = fixedAmount(amount);
  if (!Number.isFinite(numeric)) return unsupported('Life change amount is not fixed.');
  const pipeline = proposeRuntimeEvent(state, 'LifeChange', { source, player: playerId, amount: numeric, metadata: { direction } }, { replacementChoices });
  if (pipeline.status !== 'ready') return pipeline;
  const finalAmount = pipeline.event.amount;
  const finalDirection = pipeline.event.metadata?.direction || direction;
  state.players[playerId].life += finalDirection === 'gain' ? finalAmount : -finalAmount;
  emitEvent(state, finalDirection === 'gain' ? 'LifeGained' : 'LifeLost', { source, player: playerId, amount: finalAmount, metadata: { replacements: pipeline.applied } });
  runStateBasedActionsRuntime(state);
  return { status: 'executed', playerId, amount: finalAmount, direction: finalDirection, life: state.players[playerId].life, replacements: pipeline.applied };
}

export function drawCards(state, { playerId, amount, source = null, allowPlaceholders = false } = {}) {
  const numeric = fixedAmount(amount);
  if (!Number.isFinite(numeric)) return unsupported('Draw amount is not fixed.');
  const pipeline = proposeRuntimeEvent(state, 'CardDraw', { source, player: playerId, amount: numeric });
  if (pipeline.status !== 'ready') return pipeline;
  const library = zoneObjects(state, playerId, 'library');
  if (library.length < numeric && allowPlaceholders) {
    for (let index = library.length; index < numeric; index += 1) createGenericZoneCard(state, { playerId, zone: 'library', name: `Unknown Library Card ${index + 1}` });
  }
  const available = zoneObjects(state, playerId, 'library');
  const drawn = [];
  for (let index = 0; index < numeric; index += 1) {
    const card = available.at(-(index + 1));
    if (!card) {
      state.players[playerId].failedDraw = true;
      emitEvent(state, 'CardDrawFailed', { source, player: playerId, metadata: { reason: 'empty library' } });
      break;
    }
    const moved = moveObjectWithResult(state, card, 'hand', 'draw');
    if (moved.status !== 'committed') return moved;
    drawn.push(card);
    emitEvent(state, 'CardDrawn', { source, object: card, player: playerId });
  }
  runStateBasedActionsRuntime(state);
  return { status: 'executed', drawn, failedDraw: state.players[playerId].failedDraw };
}

export function discardCards(state, { playerId, amount, cardIds = [], source = null } = {}) {
  const numeric = fixedAmount(amount);
  if (!Number.isFinite(numeric)) return unsupported('Discard amount is not fixed.');
  const hand = zoneObjects(state, playerId, 'hand');
  let selected = cardIds.map((id) => state.objects.get(id)).filter((card) => card?.zone === 'hand' && card.owner === playerId);
  if (selected.length === 0 && hand.length === numeric) selected = hand;
  if (selected.length < numeric) {
    return { status: 'depends', clarificationNeeded: `Which ${numeric} card${numeric === 1 ? '' : 's'} does ${playerId} discard?`, choices: hand.map((card) => ({ id: card.id, name: card.name })) };
  }
  const pipeline = proposeRuntimeEvent(state, 'Discard', { source, player: playerId, amount: numeric, metadata: { cardIds: selected.slice(0, numeric).map((card) => card.id) } });
  if (pipeline.status !== 'ready') return pipeline;
  const discarded = [];
  for (const card of selected.slice(0, numeric)) {
    const moved = moveObjectWithResult(state, card, 'graveyard', 'discard effect');
    if (moved.status !== 'committed') return moved;
    discarded.push(card);
    emitEvent(state, 'CardDiscarded', { source, object: card, player: playerId });
  }
  return { status: 'executed', discarded };
}

export function millCards(state, { playerId, amount, source = null, allowPlaceholders = false } = {}) {
  const numeric = fixedAmount(amount);
  if (!Number.isFinite(numeric)) return unsupported('Mill amount is not fixed.');
  const library = zoneObjects(state, playerId, 'library');
  if (library.length < numeric && allowPlaceholders) {
    for (let index = library.length; index < numeric; index += 1) createGenericZoneCard(state, { playerId, zone: 'library', name: `Unknown Library Card ${index + 1}` });
  }
  const selected = zoneObjects(state, playerId, 'library').slice(-numeric);
  const pipeline = proposeRuntimeEvent(state, 'Mill', { source, player: playerId, amount: selected.length });
  if (pipeline.status !== 'ready') return pipeline;
  for (const card of selected) {
    const moved = moveObjectWithResult(state, card, 'graveyard', 'mill');
    if (moved.status !== 'committed') return moved;
  }
  emitEvent(state, 'CardsMilled', { source, player: playerId, amount: selected.length, metadata: { cardIds: selected.map((card) => card.id) } });
  return { status: 'executed', milled: selected };
}

function sacrificeCandidates(state, playerId, requirement = 'permanent') {
  return state.battlefield.filter((object) => object.zone === 'battlefield'
    && deriveCharacteristics(state, object).controller === playerId
    && (requirement !== 'creature' || deriveCharacteristics(state, object).types.includes('creature'))
    && !/can(?:not|'t) be sacrificed/i.test(object.card.oracleText));
}

export function sacrificePermanent(state, { playerId, requirement = 'permanent', objectId = null, source = null, asCost = false, replacementChoices = [] } = {}) {
  const candidates = sacrificeCandidates(state, playerId, requirement);
  let selected = objectId ? candidates.find((object) => object.id === objectId) : null;
  if (!selected && candidates.length === 1) [selected] = candidates;
  if (!selected) {
    return { status: 'depends', clarificationNeeded: `Which ${requirement} does ${playerId} sacrifice?`, choices: candidates.map((object) => ({ id: object.id, name: object.name })) };
  }
  const pipeline = proposeRuntimeEvent(state, 'Sacrifice', { source, object: selected, affected: selected, player: playerId, from: 'battlefield', to: 'graveyard', metadata: { asCost } }, { replacementChoices });
  if (pipeline.status !== 'ready') return pipeline;
  const moved = moveObjectWithResult(state, selected, 'graveyard', asCost ? 'sacrifice cost' : 'sacrifice effect', {}, { replacementChoices });
  if (moved.status !== 'committed') return moved;
  emitEvent(state, 'PermanentSacrificed', { source, object: selected, player: playerId, from: 'battlefield', to: moved.to, metadata: { asCost } });
  return { status: 'executed', object: selected, to: moved.to, asCost };
}

export function createTokens(state, { controller, amount, token = {}, source = null } = {}) {
  const numeric = fixedAmount(amount);
  if (!Number.isFinite(numeric)) return unsupported('Token amount is not fixed.');
  const pipeline = proposeRuntimeEvent(state, 'TokenCreate', { source, player: controller, amount: numeric, metadata: { token } });
  if (pipeline.status !== 'ready') return pipeline;
  const created = [];
  for (let index = 0; index < pipeline.event.amount; index += 1) {
    const name = token.name || 'Creature Token';
    const typeLine = [...(token.types || ['Creature']), ...(token.subtypes?.length ? ['-', ...token.subtypes] : [])].join(' ');
    const abilities = (token.abilities || []).map((keyword) => ({ type: 'KeywordAbility', keyword }));
    const object = createGameObject({
      card: { name, typeLine, oracleText: (token.abilities || []).join(', '), colors: token.colors || [], power: token.power, toughness: token.toughness },
      name,
      controller,
      owner: controller,
      token: true,
      power: token.power,
      toughness: token.toughness,
      abilities
    });
    addPermanent(state, object);
    created.push(object);
    emitEvent(state, 'TokenCreated', { source, object, player: controller });
  }
  return { status: 'executed', created };
}

export function modifyCounters(state, { object, counter, amount, operation = 'add', source = null } = {}) {
  const numeric = fixedAmount(amount);
  if (!object || !counter || !Number.isFinite(numeric)) return unsupported('Counter modification requires an object, counter name, and fixed amount.');
  const pipeline = proposeRuntimeEvent(state, 'CounterChange', { source, object, affected: object, amount: numeric, metadata: { counter, operation } });
  if (pipeline.status !== 'ready') return pipeline;
  const current = object.counters[counter] || 0;
  object.counters[counter] = operation === 'remove' ? Math.max(0, current - numeric) : current + numeric;
  invalidateCharacteristics(state);
  emitEvent(state, 'CountersChanged', { source, object, amount: numeric, metadata: { counter, operation, total: object.counters[counter] } });
  runStateBasedActionsRuntime(state);
  return { status: 'executed', object, counter, total: object.counters[counter], power: currentPower(object), toughness: currentToughness(object) };
}

export function searchLibrary(state, { playerId, criteria, destination = 'hand', source = null, chosenCardId = null, shuffle = false } = {}) {
  if (!criteria || !['basic-land', 'land', 'creature'].includes(criteria.type)) return unsupported('The library search criteria is not in the executable subset.');
  const cards = zoneObjects(state, playerId, 'library');
  const matches = cards.filter((card) => {
    const type = normalizeMagicText(card.card.typeLine);
    if (criteria.type === 'basic-land') return type.includes('basic') && type.includes('land');
    return type.includes(criteria.type);
  });
  if (matches.length === 0) return { status: 'executed', found: null, shuffled: shuffle };
  const selected = chosenCardId ? matches.find((card) => card.id === chosenCardId) : matches.length === 1 ? matches[0] : null;
  if (!selected) return { status: 'depends', clarificationNeeded: 'Which matching card is found by the library search?', choices: matches.map((card) => ({ id: card.id, name: card.name })) };
  const pipeline = proposeRuntimeEvent(state, 'LibrarySearch', { source, player: playerId, object: selected, metadata: { criteria, destination, shuffle } });
  if (pipeline.status !== 'ready') return pipeline;
  const moved = moveObjectWithResult(state, selected, destination, 'library search');
  if (moved.status !== 'committed') return moved;
  if (shuffle) emitEvent(state, 'LibraryShuffled', { source, player: playerId });
  return { status: 'executed', found: selected, destination: moved.to, shuffled: shuffle };
}

export function executeTypedEffect({ state, effect, sourceObject = null, controller = sourceObject?.controller || 'player', target = null, targetPlayer = null, choices = {}, allowPlaceholders = false } = {}) {
  if (!effect?.type) return unsupported('No typed effect was supplied.');
  const amount = fixedAmount(effect.amount);
  switch (effect.type) {
    case ORACLE_NODE_TYPES.LIFE_CHANGE: {
      const players = effect.subject === 'each opponent' ? [opponentOf(controller)] : [playerForSubject(effect.subject, controller, targetPlayer)];
      return combine(players.map((playerId) => changeLife(state, { playerId, amount, direction: effect.direction, source: sourceObject, replacementChoices: choices.replacementChoices })));
    }
    case ORACLE_NODE_TYPES.DRAW:
      return drawCards(state, { playerId: playerForSubject(effect.subject, controller, targetPlayer), amount, source: sourceObject, allowPlaceholders });
    case ORACLE_NODE_TYPES.DISCARD: {
      const players = effect.subject === 'each player' ? Object.keys(state.players) : [playerForSubject(effect.subject, controller, targetPlayer)];
      return combine(players.map((playerId) => discardCards(state, { playerId, amount, cardIds: choices.cardIds?.[playerId] || choices.cardIds || [], source: sourceObject })));
    }
    case ORACLE_NODE_TYPES.MILL:
      return millCards(state, { playerId: playerForSubject(effect.subject, controller, targetPlayer), amount, source: sourceObject, allowPlaceholders });
    case ORACLE_NODE_TYPES.SACRIFICE:
      return sacrificePermanent(state, { playerId: targetPlayer || controller, requirement: /creature/.test(effect.subject || '') ? 'creature' : 'permanent', objectId: target?.id || choices.objectId, source: sourceObject, replacementChoices: choices.replacementChoices });
    case ORACLE_NODE_TYPES.TOKEN_CREATION:
      return createTokens(state, { controller, amount, token: effect.token, source: sourceObject });
    case ORACLE_NODE_TYPES.COUNTER_MODIFICATION:
      return modifyCounters(state, { object: target, counter: effect.counter, amount, operation: effect.operation, source: sourceObject });
    case ORACLE_NODE_TYPES.ZONE_CHANGE:
      return target ? moveObjectWithResult(state, target, effect.to, `${sourceObject?.name || 'effect'} zone change`, {}, { replacementChoices: choices.replacementChoices }) : unsupported('No zone-change target was supplied.');
    case ORACLE_NODE_TYPES.EXILE:
      return target ? moveObjectWithResult(state, target, 'exile', `${sourceObject?.name || 'effect'} exile`) : unsupported('No exile target was supplied.');
    case ORACLE_NODE_TYPES.DESTROY:
      if (!target) return unsupported('No destroy target was supplied.');
      if (target.card.abilities?.includes('indestructible')) return { status: 'executed', object: target, survived: true, reason: 'indestructible' };
      return moveObjectWithResult(state, target, 'graveyard', `${sourceObject?.name || 'effect'} destroy`, {}, { replacementChoices: choices.replacementChoices });
    case ORACLE_NODE_TYPES.DAMAGE:
      return target && Number.isFinite(amount) ? markDamageWithResult(state, target, amount, sourceObject, choices.damageMetadata || {}) : unsupported('Damage needs a target and fixed amount.');
    case ORACLE_NODE_TYPES.PT_MODIFICATION:
      if (!target || !Number.isFinite(fixedAmount(effect.power)) || !Number.isFinite(fixedAmount(effect.toughness))) return unsupported('P/T modification needs a target and fixed values.');
      createContinuousEffect(state, {
        source: sourceObject,
        controller,
        layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS,
        sublayer: effect.setBase ? PT_SUBLAYERS.SET : PT_SUBLAYERS.MODIFY,
        duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id },
        modification: { kind: 'pt', mode: effect.setBase ? 'set' : 'modify', power: fixedAmount(effect.power), toughness: fixedAmount(effect.toughness) }
      });
      runStateBasedActionsRuntime(state);
      return { status: 'executed', object: target, power: currentPower(target), toughness: currentToughness(target) };
    case ORACLE_NODE_TYPES.COPY:
      if (effect.unsupportedExceptions) return unsupported('Copy exceptions are outside the executable copy subset.');
      if (!target || !choices.copySource) return unsupported('A copy effect requires both a target and a copy source.');
      return { status: 'executed', effect: createCopyEffect(state, { target, source: choices.copySource, duration: effect.duration || 'indefinite', controller }) };
    case ORACLE_NODE_TYPES.CONTROL_CHANGE:
      if (!target) return unsupported('A control-changing effect requires a target permanent.');
      return { status: 'executed', effect: createContinuousEffect(state, {
        source: sourceObject, controller, layer: CONTINUOUS_LAYERS.CONTROL, duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id }, modification: { kind: 'control', controller: effect.controller === 'effect-controller' ? controller : effect.controller }
      }), controller: deriveCharacteristics(state, target).controller };
    case ORACLE_NODE_TYPES.TEXT_CHANGE:
      if (!target || !effect.from || !effect.to) return unsupported('A text-changing effect requires a target and supported word substitution.');
      return { status: 'executed', effect: createContinuousEffect(state, {
        source: sourceObject, controller, layer: CONTINUOUS_LAYERS.TEXT, duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id }, modification: { kind: 'text', from: effect.from, to: effect.to }
      }) };
    case ORACLE_NODE_TYPES.TYPE_CHANGE:
      if (!target) return unsupported('A type-changing effect requires a target.');
      return { status: 'executed', effect: createContinuousEffect(state, {
        source: sourceObject, controller, layer: CONTINUOUS_LAYERS.TYPE, duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id }, modification: { kind: 'type', mode: effect.mode || 'add', types: effect.types, subtypes: effect.subtypes, supertypes: effect.supertypes }
      }) };
    case ORACLE_NODE_TYPES.COLOR_CHANGE:
      if (!target) return unsupported('A color-changing effect requires a target.');
      return { status: 'executed', effect: createContinuousEffect(state, {
        source: sourceObject, controller, layer: CONTINUOUS_LAYERS.COLOR, duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id }, modification: { kind: 'color', mode: effect.mode || 'set', colors: effect.colors || [] }
      }) };
    case ORACLE_NODE_TYPES.ABILITY_CHANGE:
    case ORACLE_NODE_TYPES.KEYWORD_GRANT:
      if (!target) return unsupported('An ability-changing effect requires a target.');
      {
        const grantedAbilities = effect.quality ? [`protection from ${effect.quality}`] : effect.abilities || [effect.keyword];
      return { status: 'executed', effect: createContinuousEffect(state, {
        source: sourceObject, controller, layer: CONTINUOUS_LAYERS.ABILITY, duration: effect.duration || 'indefinite',
        appliesTo: { objectId: target.id }, modification: { kind: 'ability', mode: effect.mode || 'add', abilities: grantedAbilities, keywordAbilities: effect.keyword && !effect.quality ? [{ type: 'KeywordAbility', keyword: effect.keyword }] : undefined }
      }) };
      }
    case ORACLE_NODE_TYPES.PREVENTION: {
      const shield = registerPreventionEffect(state, {
        id: `prevention-${state.preventionEffects.length + 1}`,
        source: sourceObject,
        sourceId: choices.sourceId || null,
        targetId: target?.id || choices.targetId || null,
        remaining: Number.isFinite(amount) ? amount : null,
        applies: effect.combatOnly ? (event) => event.metadata?.combat === true : null
      });
      return { status: 'executed', shield };
    }
    case ORACLE_NODE_TYPES.SEARCH:
      return searchLibrary(state, { playerId: controller, criteria: effect.criteria, destination: effect.destination, source: sourceObject, chosenCardId: choices.chosenCardId, shuffle: effect.shuffle });
    default:
      return unsupported(`Typed effect ${effect.type} is parsed but not executable.`);
  }
}

function combine(results) {
  const blocked = results.find((result) => result.status === 'depends' || result.status === 'unsupported');
  return blocked || { status: 'executed', results };
}

function unsupported(reason) {
  return { status: 'unsupported', reason };
}

function opponentOf(playerId) {
  return playerId === 'player' ? 'opponent' : 'player';
}
