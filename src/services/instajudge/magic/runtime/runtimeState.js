import { isCreature, normalizeMagicCard, normalizeMagicText, sourceHasQuality } from '../magicCards.js';
import { parseOracleSemantics } from './oracleSemantics.js';
import {
  deriveCharacteristics,
  detachObject,
  derivedHasAbility,
  derivedHasQuality,
  initializeObjectCharacteristics,
  invalidateCharacteristics,
  registerScenarioContinuousEffects,
  registerStaticContinuousEffects,
  removeSourceStaticEffects
} from './continuousEffects.js';
import { createCanonicalTurnState } from './turnStructure.js';
import { apnapOrder, nextPlayerInTurnOrder, opponentsOf, playersStillInGame, priorityStartPlayer, syncMultiplayerGameState } from './multiplayerRuntime.js';
import {
  commanderDesignationFor,
  commanderDamageLossFor,
  commanderReplacementEffects,
  commanderReturnDecision,
  createCommanderReturnChoice,
  createFormatState,
  initializeCommanderDesignations,
  recordCommanderCombatDamage,
  recordCommanderMovement
} from './commanderRuntime.js';

let nextObjectId = 1;
let nextEventId = 1;
function makeId(prefix) { return `${prefix}-${nextObjectId++}`; }

function reserveId(id) {
  const suffix = Number(String(id || '').match(/-(\d+)$/)?.[1]);
  if (Number.isFinite(suffix)) nextObjectId = Math.max(nextObjectId, suffix + 1);
  return id;
}

export function createPlayer(id, overrides = {}) {
  return {
    id,
    life: overrides.life ?? 20,
    poison: overrides.poison ?? 0,
    maximumHandSize: overrides.maximumHandSize ?? 7,
    hand: [], library: [], graveyard: [], exile: [], battlefield: [], commandZone: [],
    commanderDamage: {},
    failedDraw: false,
    lost: overrides.lost ?? false,
    inGame: overrides.inGame ?? !overrides.lost,
    leftGame: overrides.leftGame ?? false
  };
}

export function createGameObject({ id = null, card, controller = 'player', owner = controller, baseController = controller, zone = 'battlefield', token = false, power = null, toughness = null, name = null, tapped = false, commander = false, commanderDesignationId = null, counters = {}, timestamp = null, abilities = [], summoningSick = false, enteredTurn = null, attackRestrictions = [], blockRestrictions = [] } = {}) {
  const normalizedCard = card ? normalizeMagicCard(card) : normalizeMagicCard({ name: name || 'Generic Object', typeLine: 'Creature', oracleText: '', power, toughness });
  const objectId = id ? reserveId(id) : makeId(token ? 'token' : 'object');
  const object = {
    id: objectId,
    card: normalizedCard,
    oracleId: normalizedCard.oracle_id || normalizedCard.id || null,
    name: name || normalizedCard.name,
    owner, controller, baseController, zone,
    timestamp: timestamp ?? nextObjectId,
    tapped,
    summoningSick,
    enteredTurn,
    attackRestrictions: [...attackRestrictions],
    blockRestrictions: [...blockRestrictions],
    counters: { ...counters },
    damageMarked: 0,
    damagedByDeathtouch: false,
    token,
    ceasedToExist: false,
    faceState: 'front',
    commander,
    commanderDesignationId,
    attachments: [],
    attachedTo: null,
    basePower: power ?? normalizedCard.power,
    baseToughness: toughness ?? normalizedCard.toughness,
    effects: [],
    keywordAbilities: abilities.map((ability) => ({ ...ability })),
    lastKnown: null,
    semantics: parseOracleSemantics(normalizedCard)
  };
  initializeObjectCharacteristics(object);
  return object;
}

export function currentPower(object) {
  return deriveCharacteristics(object?.runtimeState, object).power;
}

export function currentToughness(object) {
  return deriveCharacteristics(object?.runtimeState, object).toughness;
}

export function snapshotObject(object) {
  const derived = deriveCharacteristics(object?.runtimeState, object);
  return {
    id: object.id, name: derived.name, card: object.card, oracleId: object.oracleId,
    owner: object.owner, controller: derived.controller, zone: object.zone,
    timestamp: object.timestamp, token: object.token, commander: object.commander,
    commanderDesignationId: object.commanderDesignationId || null,
    power: derived.power, toughness: derived.toughness,
    damageMarked: object.damageMarked, damagedByDeathtouch: object.damagedByDeathtouch,
    counters: { ...object.counters }, tapped: object.tapped,
    attachments: [...object.attachments], attachedTo: object.attachedTo,
    semantics: object.semantics, characteristics: derived
  };
}

export function objectIsCreature(object) {
  return object.zone === 'battlefield' && deriveCharacteristics(object?.runtimeState, object).types.includes('creature');
}

function eventRecord(type, data = {}) {
  return {
    id: `event-${nextEventId++}`,
    type,
    source: data.source || null,
    affected: data.affected || data.object || null,
    object: data.object || data.affected || null,
    player: data.player || null,
    controller: data.controller || data.object?.controller || data.affected?.controller || null,
    previous: data.previous || null,
    proposed: data.proposed || null,
    final: data.final || null,
    amount: data.amount ?? null,
    from: data.from || null,
    to: data.to || null,
    metadata: { ...(data.metadata || {}) }
  };
}

export function emitEvent(state, type, data = {}) {
  const event = eventRecord(type, data);
  state.events.push(event);
  state.eventQueue.push(event);
  state.trace.push({
    type,
    eventId: event.id,
    source: event.source?.name || event.source || null,
    object: event.previous?.name || event.object?.name || null,
    affected: event.affected?.name || event.player || null,
    controller: event.controller,
    from: event.from,
    to: event.to,
    amount: event.amount,
    ...event.metadata
  });
  return event;
}

export function getPendingRuntimeChoice(state) {
  return state?.pendingChoices?.[0] || null;
}

export function setPendingRuntimeChoice(state, choice) {
  const existing = state.pendingChoices.findIndex((candidate) => candidate.id === choice.id);
  if (existing >= 0) state.pendingChoices[existing] = choice;
  else state.pendingChoices.push(choice);
  return choice;
}

export function clearPendingRuntimeChoice(state, choiceId) {
  state.pendingChoices = state.pendingChoices.filter((choice) => choice.id !== choiceId);
}

export function createMagicRuntimeState({ cards = [], genericObjects = [], scenario = null, message = '' } = {}) {
  nextObjectId = 1;
  nextEventId = 1;
  const playerDescriptors = scenario?.players?.length
    ? scenario.players
    : [{ id: 'player', role: 'user' }, { id: 'opponent', role: 'opponent' }];
  const players = Object.fromEntries(playerDescriptors.map((descriptor) => [descriptor.id, createPlayer(descriptor.id, descriptor)]));
  const turnOrder = scenario?.game?.turnOrder?.length ? scenario.game.turnOrder : playerDescriptors.map((descriptor) => descriptor.id);
  const state = {
    type: 'MagicGameState', version: 2,
    format: createFormatState(scenario?.format || null),
    players,
    objects: new Map(),
    zones: { battlefield: [], hand: [], graveyard: [], exile: [], library: [], stack: [], command: [] },
    game: createCanonicalTurnState({
      turn: scenario?.game?.turn || 1,
      activePlayer: scenario?.game?.activePlayer || (/opponent.?s turn|opponent turn/i.test(message) ? 'opponent' : 'player'),
      turnOrder,
      phase: scenario?.game?.phase || (/combat/i.test(message) ? 'combat' : /end step/i.test(message) ? 'ending' : 'main'),
      step: scenario?.game?.step || (/cleanup/i.test(message) ? 'cleanup' : null),
      priorityHolder: scenario?.game?.priorityHolder || null,
      consecutivePasses: 0,
      landPlaysAllowed: scenario?.game?.landPlaysAllowed ?? 1,
      landPlaysUsed: scenario?.game?.landPlaysUsed ?? 0
    }),
    battlefield: [], stack: [], pendingTriggers: [], pendingChoices: [],
    events: [], eventQueue: [],
    replacementEffects: [], preventionEffects: [], continuousEffects: [],
    characteristicRevision: 0, characteristicCache: new Map(),
    nextContinuousEffectId: 1, nextContinuousTimestamp: 1,
    trace: [], scenario
  };
  state.combat = null;
  syncMultiplayerGameState(state);

  for (const card of cards) {
    const normalized = normalizeMagicCard(card);
    if (!normalizeMagicText(message).includes(normalized.normalizedName) || /instant|sorcery/i.test(normalized.typeLine)) continue;
    const descriptors = scenario?.objects?.filter((entry) => normalizeMagicText(entry.name) === normalized.normalizedName) || [];
    const initializers = descriptors.length ? descriptors : [null];
    for (const descriptor of initializers) {
      addInitialObject(state, createGameObject({
        id: descriptor?.id || null,
        card: normalized,
        controller: descriptor?.controller || inferController(message, normalized),
        owner: descriptor?.owner || inferController(message, normalized),
        zone: descriptor?.zone || 'battlefield',
        commander: descriptor?.commander || false,
        commanderDesignationId: descriptor?.commanderDesignationId || null,
        abilities: descriptor?.abilities || [],
        summoningSick: descriptor?.summoningSick || false
      }));
    }
  }
  for (const object of genericObjects) addInitialObject(state, createGameObject({ ...object, id: object.id || null, token: Boolean(object.token), controller: object.controller || 'player', owner: object.owner || object.controller || 'player' }));
  const commanderDescriptors = scenario?.format?.commanderDesignations
    || scenario?.objects?.filter((object) => object.commander).map((object) => ({ objectId: object.id, ownerId: object.owner, id: object.commanderDesignationId || null }))
    || [];
  initializeCommanderDesignations(state, commanderDescriptors);
  registerScenarioContinuousEffects(state, scenario?.continuousEffects || []);
  return state;
}

function registerObject(state, object) {
  initializeObjectCharacteristics(object);
  Object.defineProperty(object, 'runtimeState', { value: state, writable: true, configurable: true, enumerable: false });
  state.objects.set(object.id, object);
  if (!state.zones[object.zone]?.includes(object.id)) state.zones[object.zone]?.push(object.id);
  invalidateCharacteristics(state);
  return object;
}

export function registerGameObject(state, object) {
  return registerObject(state, object);
}

function addInitialObject(state, object) {
  if (object.zone === 'battlefield') return addPermanent(state, object);
  registerObject(state, object);
  const playerZone = object.zone === 'command' ? 'commandZone' : object.zone;
  if (state.players[object.owner]?.[playerZone] && !state.players[object.owner][playerZone].includes(object.id)) {
    state.players[object.owner][playerZone].push(object.id);
  }
  return object;
}

export function addPermanent(state, object) {
  object.zone = 'battlefield';
  registerObject(state, object);
  if (!state.battlefield.includes(object)) state.battlefield.push(object);
  if (!state.players[object.controller]?.battlefield.includes(object.id)) state.players[object.controller]?.battlefield.push(object.id);
  invalidateCharacteristics(state);
  registerStaticContinuousEffects(state, object);
  emitEvent(state, 'PermanentEntered', { object, controller: object.controller, final: snapshotObject(object) });
  emitEvent(state, 'PermanentEnteredBattlefield', { object, controller: object.controller, final: snapshotObject(object) });
  return object;
}

function removeFromZone(state, zone, objectId) {
  if (state.zones[zone]) state.zones[zone] = state.zones[zone].filter((id) => id !== objectId);
  const playerZone = zone === 'command' ? 'commandZone' : zone;
  for (const player of Object.values(state.players)) {
    if (player[playerZone]) player[playerZone] = player[playerZone].filter((id) => id !== objectId);
    if (zone === 'battlefield') player.battlefield = player.battlefield.filter((id) => id !== objectId);
  }
}

function semanticReplacementEffects(state, event) {
  const effects = [];
  for (const source of state.battlefield.filter((object) => object.zone === 'battlefield')) {
    for (const [index, replacement] of (source.semantics?.replacementEffects || []).entries()) {
      if (!replacement.runtime) continue;
      effects.push({
        id: `${source.id}:replacement:${index}`,
        source,
        mandatory: replacement.runtime.mandatory !== false,
        chooser: replacement.runtime.chooser || 'affected-player',
        eventType: replacement.runtime.eventType,
        applies: (candidate) => {
          if (replacement.runtime.eventType !== candidate.type) return false;
          if (replacement.runtime.to && replacement.runtime.to !== candidate.to) return false;
          if (replacement.runtime.from && replacement.runtime.from !== candidate.from) return false;
          if (replacement.runtime.objectId === 'self' && source.id !== candidate.object?.id) return false;
          return true;
        },
        replace: () => ({ ...(replacement.runtime.replace || {}) }),
        text: replacement.text
      });
    }
  }
  return effects.filter((effect) => effect.applies(event));
}

function registeredReplacementEffects(state, event) {
  return state.replacementEffects.filter((effect) => {
    if (effect.eventType && effect.eventType !== event.type) return false;
    return typeof effect.applies === 'function' ? effect.applies(event, state) : true;
  });
}

export function registerReplacementEffect(state, effect) {
  const normalized = { mandatory: true, chooser: 'affected-player', ...effect };
  state.replacementEffects.push(normalized);
  return normalized;
}

export function registerPreventionEffect(state, effect) {
  const normalized = { remaining: null, ...effect };
  state.preventionEffects.push(normalized);
  return normalized;
}

export function applyReplacementPipeline(state, proposedEvent, { replacementChoices = [] } = {}) {
  let event = { ...proposedEvent, metadata: { ...(proposedEvent.metadata || {}) } };
  const applied = [];
  const declined = [];
  let choiceIndex = 0;
  for (let iteration = 0; iteration < 16; iteration += 1) {
    const candidates = [
      ...commanderReplacementEffects(state, event),
      ...semanticReplacementEffects(state, event),
      ...registeredReplacementEffects(state, event)
    ].filter((effect) => !applied.includes(effect.id) && !declined.includes(effect.id));
    if (candidates.length === 0) return { status: 'ready', event, applied, declined };
    const decision = replacementChoices[choiceIndex];
    const declinedId = String(decision || '').startsWith('decline:') ? String(decision).slice('decline:'.length) : null;
    const declinedEffect = candidates.find((effect) => effect.id === declinedId && effect.mandatory === false);
    if (declinedEffect) {
      choiceIndex += 1;
      declined.push(declinedEffect.id);
      emitEvent(state, 'ReplacementDeclined', {
        source: declinedEffect.source || null,
        affected: event.object || event.affected,
        player: event.player,
        from: event.from,
        to: event.to,
        metadata: { replacementId: declinedEffect.id, originalEventType: proposedEvent.type }
      });
      continue;
    }
    let selected = candidates[0];
    if (candidates.length > 1) {
      const requestedId = decision;
      selected = candidates.find((effect) => effect.id === requestedId);
      if (!selected) {
        return {
          status: 'depends',
          event,
          applied,
          choices: candidates.map((effect) => ({ id: effect.id, source: effect.source?.name || null, chooser: effect.chooser || null, text: effect.text || null })),
          clarificationNeeded: 'Which applicable replacement effect should be applied next?'
        };
      }
      choiceIndex += 1;
    } else if (selected.mandatory === false && decision !== selected.id) {
      return {
        status: 'depends',
        event,
        applied,
        choices: [{ id: selected.id, source: selected.source?.name || null, chooser: selected.chooser || null, text: selected.text || null }],
        clarificationNeeded: 'Should the optional replacement effect be applied?'
      };
    } else if (selected.mandatory === false) {
      choiceIndex += 1;
    }
    const patch = typeof selected.replace === 'function' ? selected.replace(event, state) : selected.replace || {};
    event = { ...event, ...patch, metadata: { ...event.metadata, ...(patch.metadata || {}) } };
    applied.push(selected.id);
    emitEvent(state, 'ReplacementApplied', {
      source: selected.source || null,
      affected: event.object || event.affected,
      player: event.player,
      from: proposedEvent.from,
      to: event.to,
      metadata: { replacementId: selected.id, originalEventType: proposedEvent.type }
    });
  }
  return { status: 'unsupported', event, applied, declined, reason: 'Replacement processing did not stabilize.' };
}

export function proposeRuntimeEvent(state, type, data = {}, options = {}) {
  const proposedEvent = { type, ...data, metadata: { ...(data.metadata || {}) } };
  emitEvent(state, `${type}Proposed`, { ...data, proposed: proposedEvent });
  return applyReplacementPipeline(state, proposedEvent, options);
}

export function moveObjectWithResult(state, object, zone, reason, metadata = {}, options = {}) {
  const from = object.zone;
  const pendingChoiceId = `replacement:${object.id}:${from}:${zone}`;
  const previous = snapshotObject(object);
  const pipeline = proposeRuntimeEvent(state, 'ZoneChange', { object, affected: object, previous, from, to: zone, metadata: { reason, ...metadata } }, options);
  if (pipeline.status !== 'ready') {
    state.lastPipelineResult = pipeline;
    if (pipeline.status === 'depends') {
      const commanderChoice = pipeline.choices?.find((choice) => String(choice.id).startsWith('commander-zone:')) || null;
      setPendingRuntimeChoice(state, {
        id: pendingChoiceId,
        type: 'ReplacementChoice',
        objectId: object.id,
        from,
        to: zone,
        chooser: commanderChoice?.chooser || null,
        ownerId: commanderChoice?.chooser || null,
        timing: commanderChoice ? 'replacement' : null,
        commanderDesignationId: commanderChoice ? commanderDesignationFor(state, object)?.id || null : null,
        choices: pipeline.choices || [],
        clarificationNeeded: pipeline.clarificationNeeded || 'Which replacement effect applies?'
      });
      emitEvent(state, 'ReplacementChoiceRequired', { object, affected: object, previous, from, to: zone, metadata: { choices: pipeline.choices } });
    }
    return { ...pipeline, object };
  }
  clearPendingRuntimeChoice(state, pendingChoiceId);
  const finalZone = pipeline.event.to;
  if (from === 'battlefield') removeSourceStaticEffects(state, object.id);
  removeFromZone(state, from, object.id);
  object.zone = finalZone;
  object.lastKnown = previous;
  if (!state.zones[finalZone]?.includes(object.id)) state.zones[finalZone]?.push(object.id);
  const playerZone = finalZone === 'command' ? 'commandZone' : finalZone;
  if (state.players[object.owner]?.[playerZone] && !state.players[object.owner][playerZone].includes(object.id)) state.players[object.owner][playerZone].push(object.id);
  if (finalZone === 'battlefield') {
    if (!state.battlefield.includes(object)) state.battlefield.push(object);
    if (!state.players[object.controller]?.battlefield.includes(object.id)) state.players[object.controller]?.battlefield.push(object.id);
    registerStaticContinuousEffects(state, object);
  }
  invalidateCharacteristics(state);
  const eventMetadata = { reason, replacements: pipeline.applied, ...metadata };
  const zoneChangedEvent = emitEvent(state, 'ZoneChanged', { object, affected: object, previous, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
  if (from !== 'battlefield' && finalZone === 'battlefield') {
    emitEvent(state, 'PermanentEntered', { object, controller: object.controller, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
    emitEvent(state, 'PermanentEnteredBattlefield', { object, controller: object.controller, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
  }
  if (from === 'battlefield') {
    emitEvent(state, 'PermanentLeft', { object, affected: object, previous, from, to: finalZone, metadata: eventMetadata });
    emitEvent(state, 'PermanentLeftBattlefield', { object, affected: object, previous, from, to: finalZone, metadata: eventMetadata });
  }
  if (from === 'battlefield' && finalZone === 'graveyard' && isCreature(previous.card)) emitEvent(state, 'CreatureDied', { object, affected: object, previous, controller: previous.controller, from, to: finalZone, metadata: { lki: true, ...eventMetadata } });
  recordCommanderMovement(state, object, {
    from,
    to: finalZone,
    reason,
    eventId: zoneChangedEvent.id,
    originalDestination: pipeline.event.metadata?.commanderOriginalDestination || zone,
    timing: pipeline.event.metadata?.commanderChoiceTiming || 'zone-change'
  });

  const designation = commanderDesignationFor(state, object);
  if (!options.skipCommanderReturnChoice && designation && ['graveyard', 'exile'].includes(finalZone)) {
    const decision = commanderReturnDecision(options, designation, finalZone);
    const choice = createCommanderReturnChoice(state, object, { from, to: finalZone, reason, eventId: zoneChangedEvent.id });
    if (!decision) {
      setPendingRuntimeChoice(state, choice);
      emitEvent(state, 'CommanderReturnChoiceRequired', {
        object,
        affected: object,
        player: designation.ownerId,
        from,
        to: finalZone,
        metadata: { choiceId: choice.id, timing: choice.timing, commanderDesignationId: designation.id }
      });
      const result = {
        status: 'depends',
        movementCommitted: true,
        object,
        from,
        to: finalZone,
        replaced: finalZone !== zone,
        replacements: pipeline.applied,
        pendingChoice: choice,
        clarificationNeeded: choice.clarificationNeeded
      };
      state.lastPipelineResult = result;
      return result;
    }
    emitEvent(state, 'CommanderReturnChoiceMade', {
      object,
      affected: object,
      player: designation.ownerId,
      from,
      to: finalZone,
      metadata: { decision, timing: choice.timing, commanderDesignationId: designation.id }
    });
    if (decision === 'command') {
      const commandMove = moveObjectWithResult(
        state,
        object,
        'command',
        'commander state-based action',
        { commanderDesignationId: designation.id, commanderOriginalDestination: finalZone },
        { skipCommanderReturnChoice: true }
      );
      return {
        status: commandMove.status,
        movementCommitted: true,
        object,
        from,
        to: commandMove.to,
        originalDestination: finalZone,
        commanderReturn: 'command',
        replacements: pipeline.applied
      };
    }
  }
  return { status: 'committed', object, from, to: finalZone, replaced: finalZone !== zone, replacements: pipeline.applied, commanderReturn: designation ? 'remain' : null };
}

export function resolveCommanderReturnChoice(state, choiceId, decision) {
  const choice = state.pendingChoices.find((candidate) => candidate.id === choiceId && candidate.type === 'CommanderZoneReturnChoice');
  if (!choice) return { status: 'unsupported', reason: 'The Commander return choice is not pending.' };
  if (!['command', 'remain'].includes(decision)) return { status: 'depends', pendingChoice: choice, clarificationNeeded: choice.clarificationNeeded };
  const object = state.objects.get(choice.objectId);
  if (!object || object.zone !== choice.currentZone) {
    return { status: 'unsupported', reason: 'The commander is no longer in the zone associated with this choice.' };
  }
  clearPendingRuntimeChoice(state, choice.id);
  emitEvent(state, 'CommanderReturnChoiceMade', {
    object,
    affected: object,
    player: choice.ownerId,
    from: choice.from,
    to: choice.currentZone,
    metadata: { choiceId: choice.id, decision, timing: choice.timing, commanderDesignationId: choice.commanderDesignationId }
  });
  if (decision === 'remain') return { status: 'committed', object, from: choice.from, to: object.zone, commanderReturn: 'remain' };
  const movement = moveObjectWithResult(
    state,
    object,
    'command',
    'commander state-based action',
    { commanderDesignationId: choice.commanderDesignationId, commanderOriginalDestination: choice.originalDestination },
    { skipCommanderReturnChoice: true }
  );
  return { ...movement, movementCommitted: true, commanderReturn: 'command', originalDestination: choice.originalDestination };
}

export function moveObject(state, object, zone, reason, metadata = {}, options = {}) {
  moveObjectWithResult(state, object, zone, reason, metadata, options);
  return object;
}

function preventionEffectsFor(state, event) {
  const registered = state.preventionEffects.filter((effect) => {
    if (effect.remaining === 0) return false;
    if (effect.sourceId && effect.sourceId !== event.source?.id) return false;
    if (effect.targetId && effect.targetId !== event.affected?.id) return false;
    return typeof effect.applies === 'function' ? effect.applies(event, state) : true;
  });
  const protection = event.affected ? deriveCharacteristics(state, event.affected).abilities
    .filter((ability) => normalizeMagicText(ability).startsWith('protection from '))
    .map((ability, index) => ({ quality: normalizeMagicText(ability).replace('protection from ', ''), index }))
    .filter(({ quality }) => event.source?.runtimeState ? derivedHasQuality(state, event.source, quality) : sourceHasQuality(event.source?.card || {}, quality))
    .map(({ index }) => ({ id: `protection:${event.affected.id}:${index}`, remaining: null, source: event.affected, protection: true })) : [];
  return [...registered, ...protection];
}

function applyDamageWithResult(state, { object = null, playerId = null, amount, source, metadata = {}, options = {} }) {
  const pipeline = proposeRuntimeEvent(state, 'Damage', { source, affected: object, object, player: playerId, amount, metadata }, options);
  if (pipeline.status !== 'ready') return pipeline;
  let remaining = pipeline.event.amount;
  const preventedBy = [];
  let commanderDamage = null;
  for (const prevention of preventionEffectsFor(state, pipeline.event)) {
    const prevented = prevention.remaining == null ? remaining : Math.min(remaining, prevention.remaining);
    if (prevented <= 0) continue;
    remaining -= prevented;
    if (prevention.remaining != null) prevention.remaining -= prevented;
    preventedBy.push(prevention.id);
    emitEvent(state, 'DamagePrevented', { source, affected: object, amount: prevented, metadata: { preventionId: prevention.id } });
    if (remaining === 0) break;
  }
  if (remaining > 0) {
    let damageEvent = null;
    if (object) {
      object.damageMarked += remaining;
      if (metadata.deathtouch) object.damagedByDeathtouch = true;
    } else if (state.players[playerId]) {
      state.players[playerId].life -= remaining;
    }
    damageEvent = emitEvent(state, 'DamageDealt', {
      source, affected: object, object, player: playerId, amount: remaining,
      final: object ? { damageMarked: object.damageMarked } : { life: state.players[playerId]?.life },
      metadata: { ...metadata, replacements: pipeline.applied }
    });
    commanderDamage = !object ? recordCommanderCombatDamage(state, {
      recipientId: playerId,
      source,
      amount: remaining,
      combat: pipeline.event.metadata?.combat === true,
      damageEventId: damageEvent.id
    }) : null;
    if (commanderDamage) emitEvent(state, 'CommanderCombatDamageRecorded', {
      source,
      player: playerId,
      amount: remaining,
      metadata: commanderDamage
    });
    if (metadata.lifelink && source) {
      const controller = source.runtimeState ? deriveCharacteristics(state, source).controller : source.controller;
      if (state.players[controller]) {
        state.players[controller].life += remaining;
        emitEvent(state, 'LifeGained', { source, player: controller, amount: remaining, metadata: { lifelink: true, damageEvent: true } });
      }
    }
  }
  return { status: 'committed', proposed: amount, replacedAmount: pipeline.event.amount, dealt: remaining, prevented: pipeline.event.amount - remaining, preventedBy, replacements: pipeline.applied, commanderDamage };
}

export function markDamageWithResult(state, object, amount, source, metadata = {}, options = {}) {
  return applyDamageWithResult(state, { object, amount, source, metadata, options });
}

export function dealDamageToPlayerWithResult(state, playerId, amount, source, metadata = {}, options = {}) {
  if (!state.players[playerId]) return { status: 'unsupported', reason: `Unknown player ${playerId}.` };
  return applyDamageWithResult(state, { playerId, amount, source, metadata, options });
}

export function markDamage(state, object, amount, source, metadata = {}, options = {}) {
  const result = markDamageWithResult(state, object, amount, source, metadata, options);
  return state.events.at(-1) || result;
}

function cancelOpposingCounters(state, object) {
  const positive = object.counters['+1/+1'] || 0;
  const negative = object.counters['-1/-1'] || 0;
  const cancellation = Math.min(positive, negative);
  if (cancellation <= 0) return false;
  object.counters['+1/+1'] = positive - cancellation;
  object.counters['-1/-1'] = negative - cancellation;
  invalidateCharacteristics(state);
  return true;
}

function removeObjectFromGame(state, object, playerId) {
  if (object.zone === 'battlefield') removeSourceStaticEffects(state, object.id);
  removeFromZone(state, object.zone, object.id);
  state.battlefield = state.battlefield.filter((candidate) => candidate.id !== object.id);
  object.lastKnown = snapshotObject(object);
  object.zone = 'outside-game';
  object.leftGame = true;
  object.attachments = [];
  object.attachedTo = null;
  emitEvent(state, 'ObjectLeftGame', { object, affected: object, player: playerId, previous: object.lastKnown });
  return object;
}

function updateMultiplayerResult(state) {
  const remaining = playersStillInGame(state);
  if (remaining.length === 1 && Object.keys(state.players).length > 1) {
    state.game.result = { status: 'complete', winnerId: remaining[0], reason: 'last-player-standing' };
    emitEvent(state, 'GameEnded', { player: remaining[0], metadata: { result: 'win', reason: 'last-player-standing' } });
  } else if (remaining.length === 0) {
    state.game.result = { status: 'unverified', winnerId: null, reason: 'no-players-remaining' };
    emitEvent(state, 'GameResultUnverified', { metadata: { reason: 'no-players-remaining' } });
  } else {
    state.game.result = { status: 'active', winnerId: null };
  }
  return state.game.result;
}

export function leavePlayersRuntime(state, playerIds, { reason = 'left the game' } = {}) {
  const leaving = [...new Set(playerIds)].filter((playerId) => state.players[playerId]?.inGame !== false);
  if (leaving.length === 0) return { status: 'unchanged', players: [], result: state.game.result };
  const leavingSet = new Set(leaving);
  const activeWasLeaving = leavingSet.has(state.game.activePlayer);
  const activeAnchor = state.game.activePlayer || state.game.turnOrderAnchor;
  const controlledForeignObjects = [...state.objects.values()].filter((object) => !leavingSet.has(object.owner)
    && leavingSet.has(deriveCharacteristics(state, object).controller));

  for (const playerId of leaving) {
    state.players[playerId].inGame = false;
    state.players[playerId].leftGame = true;
  }

  const ownedObjects = [...state.objects.values()].filter((object) => leavingSet.has(object.owner) && object.zone !== 'outside-game');
  for (const object of ownedObjects) removeObjectFromGame(state, object, object.owner);

  const removedStackObjects = state.stack.filter((entry) => leavingSet.has(entry.controller)
    || leavingSet.has(entry.sourceObject?.owner)
    || leavingSet.has(entry.source?.owner));
  state.stack = state.stack.filter((entry) => !removedStackObjects.includes(entry));
  for (const entry of removedStackObjects) {
    entry.status = 'ceased-on-player-leave';
    emitEvent(state, 'StackObjectCeased', { source: entry.sourceObject || entry.source, controller: entry.controller, metadata: { stackObjectId: entry.id, reason: 'player-left-game' } });
  }

  state.continuousEffects = state.continuousEffects.filter((effect) => !leavingSet.has(effect.controller)
    && !leavingSet.has(effect.modification?.controller)
    && !leavingSet.has(effect.source?.owner));
  const unsupportedControl = [];
  for (const object of controlledForeignObjects) {
    const controller = object.baseController || object.owner;
    if (!controller || !state.players[controller] || leavingSet.has(controller)) {
      unsupportedControl.push(object.id);
      continue;
    }
    object.controller = controller;
    object.baseController = controller;
    for (const player of Object.values(state.players)) player.battlefield = player.battlefield.filter((id) => id !== object.id);
    if (object.zone === 'battlefield' && !state.players[controller].battlefield.includes(object.id)) state.players[controller].battlefield.push(object.id);
    emitEvent(state, 'ControlReverted', { object, affected: object, controller, metadata: { previousControllerLeft: true } });
  }
  invalidateCharacteristics(state);

  state.pendingTriggers = state.pendingTriggers.filter((trigger) => !leavingSet.has(trigger.controller));
  state.pendingChoices = state.pendingChoices.filter((choice) => !leavingSet.has(choice.playerId || choice.player || choice.chooser || choice.ownerId));
  for (const playerId of leaving) emitEvent(state, 'PlayerLeftGame', { player: playerId, metadata: { reason } });

  if (activeWasLeaving) {
    state.game.turnOrderAnchor = activeAnchor;
    state.game.activePlayer = null;
  }
  if (leavingSet.has(state.game.priorityHolder)) state.game.priorityHolder = nextPlayerInTurnOrder(state, state.game.priorityHolder);
  state.game.consecutivePasses = 0;
  syncMultiplayerGameState(state);
  if (!state.game.priorityHolder && playersStillInGame(state).length > 1) state.game.priorityHolder = priorityStartPlayer(state);
  const result = updateMultiplayerResult(state);
  return {
    status: unsupportedControl.length ? 'unverified' : 'committed',
    players: leaving,
    ownedObjects: ownedObjects.map((object) => object.id),
    removedStackObjects: removedStackObjects.map((entry) => entry.id),
    revertedObjects: controlledForeignObjects.filter((object) => !unsupportedControl.includes(object.id)).map((object) => object.id),
    unsupportedControl,
    result
  };
}

export function gatherSimultaneousPlayerChoices(state, { id, requiredPlayers = playersStillInGame(state), selections = {}, choiceForPlayer = null, applyChoices = null } = {}) {
  const order = apnapOrder(state).filter((playerId) => requiredPlayers.includes(playerId));
  const existing = state.pendingChoices.find((choice) => choice.id === id);
  const gathered = { ...(existing?.selections || {}), ...selections };
  const nextChooser = order.find((playerId) => gathered[playerId] === undefined);
  if (nextChooser) {
    const pending = setPendingRuntimeChoice(state, {
      id,
      type: 'SimultaneousPlayerChoice',
      playerId: nextChooser,
      chooser: nextChooser,
      affectedPlayers: [...order],
      activePlayer: state.game.activePlayer,
      turnOrder: [...state.game.turnOrder],
      selections: gathered,
      choices: typeof choiceForPlayer === 'function' ? choiceForPlayer(nextChooser, state) : []
    });
    return { status: 'depends', order, nextChooser, selections: gathered, pendingChoice: pending };
  }
  clearPendingRuntimeChoice(state, id);
  const result = typeof applyChoices === 'function' ? applyChoices(gathered, state) : gathered;
  emitEvent(state, 'SimultaneousChoicesCommitted', { metadata: { choiceId: id, order, selections: gathered } });
  return { status: 'committed', order, selections: gathered, result };
}

export function runStateBasedActionsRuntime(state) {
  const applied = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of state.battlefield.filter((candidate) => candidate.zone === 'battlefield')) {
      if (cancelOpposingCounters(state, object)) { applied.push(`${object.name}'s opposing +1/+1 and -1/-1 counters cancel.`); changed = true; }
    }
    for (const attachment of state.battlefield.filter((candidate) => candidate.zone === 'battlefield' && candidate.attachedTo)) {
      const attached = state.objects.get(attachment.attachedTo);
      if (attached?.zone === 'battlefield') continue;
      const characteristics = deriveCharacteristics(state, attachment);
      if (characteristics.subtypes.includes('aura')) {
        moveObject(state, attachment, 'graveyard', 'state-based action: illegal Aura attachment');
        applied.push(`${attachment.name} is put into its owner's graveyard because it is not legally attached.`);
      } else {
        detachObject(state, attachment);
        applied.push(`${attachment.name} becomes unattached.`);
      }
      changed = true;
    }
    const doomed = state.battlefield.filter((object) => {
      if (!objectIsCreature(object)) return false;
      const toughness = currentToughness(object);
      if (Number.isFinite(toughness) && toughness <= 0) return true;
      return Number.isFinite(toughness) && (object.damageMarked >= toughness || object.damagedByDeathtouch) && !derivedHasAbility(state, object, 'indestructible');
    });
    for (const object of doomed) {
      const toughness = currentToughness(object);
      const reason = toughness <= 0 ? 'state-based action: toughness 0 or less' : object.damagedByDeathtouch ? 'state-based action: deathtouch damage' : 'state-based action: lethal damage';
      moveObject(state, object, 'graveyard', reason, { simultaneousBatch: doomed.map((entry) => entry.id) });
      applied.push(`${object.name} is put into its owner's graveyard (${reason.replace('state-based action: ', '')}).`);
      changed = true;
    }
    const losingPlayers = [];
    for (const [playerId, player] of Object.entries(state.players)) {
      const commanderDamageLoss = commanderDamageLossFor(state, playerId);
      if (player.inGame !== false && !player.lost && (player.life <= 0 || player.poison >= 10 || player.failedDraw || commanderDamageLoss)) {
        player.lost = true;
        const reason = player.life <= 0 ? 'life total' : player.poison >= 10 ? 'poison counters' : player.failedDraw ? 'drawing from an empty library' : 'commander combat damage';
        emitEvent(state, 'PlayerLost', { player: playerId, metadata: { reason, ...(commanderDamageLoss || {}) } });
        applied.push(`${playerId} loses the game because of ${reason}.`);
        losingPlayers.push(playerId);
      }
    }
    if (losingPlayers.length) {
      leavePlayersRuntime(state, losingPlayers, { reason: 'state-based action loss' });
      changed = true;
    }
    for (const object of state.objects.values()) {
      if (object.token && object.zone !== 'battlefield' && object.zone !== 'stack' && !object.ceasedToExist) {
        object.ceasedToExist = true;
        removeFromZone(state, object.zone, object.id);
        emitEvent(state, 'TokenCeasedToExist', { object, previous: snapshotObject(object) });
        changed = true;
      }
    }
  }
  return applied;
}

function sourceSnapshotsForEvents(state, events) {
  const sources = new Map();
  for (const object of state.battlefield) if (object.zone === 'battlefield' && object.semantics?.triggeredAbilitiesIR?.length) sources.set(object.id, object);
  for (const event of events) if (event.previous?.semantics?.triggeredAbilitiesIR?.length) sources.set(event.previous.id, event.previous);
  return [...sources.values()];
}

function triggerMatches(ability, source, event) {
  if (!ability?.event?.eventType || ability.event.eventType !== event.type) return false;
  if (ability.event.filter?.sourceSelf && source.id !== event.source?.id) return false;
  if (ability.event.filter?.combat && event.metadata?.combat !== true) return false;
  if (ability.event.filter?.player && !event.player) return false;
  if (event.type === 'CreatureDied') {
    const self = source.id === event.previous?.id;
    if (self && !ability.event.filter.includeSelf) return false;
    if (!self && !ability.event.filter.includeOthers) return false;
  }
  if (ability.interveningIf) return false;
  return true;
}

function legacyTriggerEffect(ability) {
  const loss = ability.effects.find((effect) => effect.type === 'LifeChange' && effect.direction === 'lose');
  const gain = ability.effects.find((effect) => effect.type === 'LifeChange' && effect.direction === 'gain');
  if (!loss && !gain) return { type: 'unsupported' };
  return { type: 'life-drain', opponentLifeLoss: loss?.amount?.value || 0, controllerLifeGain: gain?.amount?.value || 0, target: loss?.subject || 'target opponent' };
}

export function collectTriggeredAbilities(state, events = state.events) {
  const triggerInstances = [];
  const seen = new Set(state.pendingTriggers.map((trigger) => trigger.key));
  for (const event of events) {
    for (const source of sourceSnapshotsForEvents(state, events)) {
      for (const ability of source.semantics?.triggeredAbilitiesIR || []) {
        if (!triggerMatches(ability, source, event)) continue;
        const key = `${source.id}:${event.id}:${ability.text}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const sourceController = deriveCharacteristics(state, source).controller;
        const trigger = { id: makeId('trigger'), key, type: 'triggered-ability', source, controller: sourceController, event, ability, effect: legacyTriggerEffect(ability), optional: ability.optional, targets: ability.targets };
        triggerInstances.push(trigger);
        state.pendingTriggers.push(trigger);
        emitEvent(state, 'TriggerCreated', { source, affected: event.previous || event.affected, controller: sourceController, metadata: { triggerEvent: event.type, triggerId: trigger.id } });
      }
    }
  }
  return triggerInstances;
}

export function putPendingTriggersOnStack(state, { triggerOrders = {}, orderMattersByPlayer = [] } = {}) {
  const order = apnapOrder(state);
  for (const playerId of orderMattersByPlayer) {
    const controlled = state.pendingTriggers.filter((trigger) => trigger.controller === playerId);
    if (controlled.length > 1 && !triggerOrders[playerId]) {
      setPendingRuntimeChoice(state, {
        id: `trigger-order:${state.game.turnId}:${playerId}`,
        type: 'TriggerOrderChoice',
        playerId,
        chooser: playerId,
        activePlayer: state.game.activePlayer,
        turnOrder: [...state.game.turnOrder],
        choices: controlled.map((trigger) => ({ id: trigger.id, source: trigger.source?.name || null }))
      });
      return [];
    }
  }
  const ordered = order.flatMap((playerId) => {
    const controlled = state.pendingTriggers.filter((trigger) => trigger.controller === playerId);
    const supplied = triggerOrders[playerId];
    if (!supplied) return controlled;
    return supplied.map((id) => controlled.find((trigger) => trigger.id === id)).filter(Boolean);
  });
  for (const trigger of ordered) {
    if (!state.stack.includes(trigger)) state.stack.push(trigger);
    emitEvent(state, 'TriggerPutOnStack', { source: trigger.source, controller: trigger.controller, metadata: { triggerId: trigger.id } });
  }
  state.pendingTriggers = [];
  return ordered;
}

export function resolveTrigger(state, trigger, targetPlayer = 'opponent') {
  if (trigger.effect.type !== 'life-drain') return { supported: false, summary: `${trigger.source.name}'s trigger is unsupported.` };
  const legalOpponents = opponentsOf(state, trigger.controller);
  if ((!targetPlayer || targetPlayer === 'opponent') && legalOpponents.length > 1) {
    return { supported: false, status: 'depends', clarificationNeeded: 'Which opponent is targeted by the triggered ability?', choices: legalOpponents };
  }
  const target = state.players[targetPlayer] ? targetPlayer : legalOpponents[0];
  const loss = trigger.effect.opponentLifeLoss;
  const gain = trigger.effect.controllerLifeGain;
  state.players[target].life -= loss;
  state.players[trigger.controller].life += gain;
  if (loss) emitEvent(state, 'LifeLost', { source: trigger.source, player: target, amount: loss });
  if (gain) emitEvent(state, 'LifeGained', { source: trigger.source, player: trigger.controller, amount: gain });
  emitEvent(state, 'AbilityResolved', { source: trigger.source, controller: trigger.controller, metadata: { triggerId: trigger.id } });
  return { supported: true, summary: `${trigger.source.name} trigger resolves: ${target} loses ${loss} life and ${trigger.controller} gains ${gain} life.` };
}

function inferController(message, card) {
  const text = normalizeMagicText(message);
  const index = text.indexOf(card.normalizedName);
  const before = text.slice(Math.max(0, index - 70), index);
  return /\bopponent\b/.test(before) ? 'opponent' : 'player';
}
