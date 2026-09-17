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
    hand: [], library: [], graveyard: [], exile: [], battlefield: [], commandZone: [],
    commanderDamage: {},
    failedDraw: false,
    lost: false
  };
}

export function createGameObject({ id = null, card, controller = 'player', owner = controller, zone = 'battlefield', token = false, power = null, toughness = null, name = null, tapped = false, commander = false, counters = {}, timestamp = null, abilities = [] } = {}) {
  const normalizedCard = card ? normalizeMagicCard(card) : normalizeMagicCard({ name: name || 'Generic Object', typeLine: 'Creature', oracleText: '', power, toughness });
  const objectId = id ? reserveId(id) : makeId(token ? 'token' : 'object');
  const object = {
    id: objectId,
    card: normalizedCard,
    oracleId: normalizedCard.oracle_id || normalizedCard.id || null,
    name: name || normalizedCard.name,
    owner, controller, zone,
    timestamp: timestamp ?? nextObjectId,
    tapped,
    counters: { ...counters },
    damageMarked: 0,
    damagedByDeathtouch: false,
    token,
    ceasedToExist: false,
    faceState: 'front',
    commander,
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

export function createMagicRuntimeState({ cards = [], genericObjects = [], scenario = null, message = '' } = {}) {
  nextObjectId = 1;
  nextEventId = 1;
  const state = {
    type: 'MagicGameState', version: 2,
    players: { player: createPlayer('player'), opponent: createPlayer('opponent') },
    objects: new Map(),
    zones: { battlefield: [], hand: [], graveyard: [], exile: [], library: [], stack: [], command: [] },
    game: {
      turn: 1,
      activePlayer: scenario?.game?.activePlayer || (/opponent.?s turn|opponent turn/i.test(message) ? 'opponent' : 'player'),
      phase: scenario?.game?.phase || (/combat/i.test(message) ? 'combat' : /end step/i.test(message) ? 'ending' : 'main'),
      step: scenario?.game?.step || (/cleanup/i.test(message) ? 'cleanup' : null),
      priorityHolder: scenario?.game?.priorityHolder || 'player',
      consecutivePasses: 0
    },
    battlefield: [], stack: [], pendingTriggers: [], pendingChoices: [],
    events: [], eventQueue: [],
    replacementEffects: [], preventionEffects: [], continuousEffects: [],
    characteristicRevision: 0, characteristicCache: new Map(),
    nextContinuousEffectId: 1, nextContinuousTimestamp: 1,
    trace: [], scenario
  };

  const scenarioNames = new Set((scenario?.objects || []).filter((entry) => !entry.name.startsWith('Generic ') && !entry.name.startsWith('Token ')).map((entry) => normalizeMagicText(entry.name)));
  for (const card of cards) {
    const normalized = normalizeMagicCard(card);
    if (!normalizeMagicText(message).includes(normalized.normalizedName) || /instant|sorcery/i.test(normalized.typeLine)) continue;
    const descriptor = scenario?.objects?.find((entry) => normalizeMagicText(entry.name) === normalized.normalizedName);
    if (scenario && scenarioNames.has(normalized.normalizedName) && !descriptor) continue;
    addPermanent(state, createGameObject({ card: normalized, controller: descriptor?.controller || inferController(message, normalized), owner: descriptor?.owner || inferController(message, normalized), commander: descriptor?.commander || false, abilities: descriptor?.abilities || [] }));
  }
  for (const object of genericObjects) addPermanent(state, createGameObject({ ...object, id: object.id || null, token: Boolean(object.token), controller: object.controller || 'player', owner: object.owner || object.controller || 'player' }));
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
  for (const player of Object.values(state.players)) {
    if (player[zone]) player[zone] = player[zone].filter((id) => id !== objectId);
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

function rulesReplacementEffects(event) {
  if (event.type !== 'ZoneChange' || !event.object?.commander || !['hand', 'library'].includes(event.to)) return [];
  return [{
    id: `commander-zone:${event.object.id}`,
    source: event.object,
    mandatory: false,
    chooser: event.object.owner,
    eventType: 'ZoneChange',
    applies: () => true,
    replace: { to: 'command' },
    text: 'The commander may be put into the command zone instead.'
  }];
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
      ...rulesReplacementEffects(event),
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
          choices: candidates.map((effect) => ({ id: effect.id, source: effect.source?.name || null, text: effect.text || null })),
          clarificationNeeded: 'Which applicable replacement effect should be applied next?'
        };
      }
      choiceIndex += 1;
    } else if (selected.mandatory === false && decision !== selected.id) {
      return {
        status: 'depends',
        event,
        applied,
        choices: [{ id: selected.id, source: selected.source?.name || null, text: selected.text || null }],
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
  const previous = snapshotObject(object);
  const pipeline = proposeRuntimeEvent(state, 'ZoneChange', { object, affected: object, previous, from, to: zone, metadata: { reason, ...metadata } }, options);
  if (pipeline.status !== 'ready') {
    state.lastPipelineResult = pipeline;
    if (pipeline.status === 'depends') emitEvent(state, 'ReplacementChoiceRequired', { object, affected: object, previous, from, to: zone, metadata: { choices: pipeline.choices } });
    return { ...pipeline, object };
  }
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
  emitEvent(state, 'ZoneChanged', { object, affected: object, previous, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
  if (from !== 'battlefield' && finalZone === 'battlefield') {
    emitEvent(state, 'PermanentEntered', { object, controller: object.controller, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
    emitEvent(state, 'PermanentEnteredBattlefield', { object, controller: object.controller, from, to: finalZone, final: snapshotObject(object), metadata: eventMetadata });
  }
  if (from === 'battlefield') {
    emitEvent(state, 'PermanentLeft', { object, affected: object, previous, from, to: finalZone, metadata: eventMetadata });
    emitEvent(state, 'PermanentLeftBattlefield', { object, affected: object, previous, from, to: finalZone, metadata: eventMetadata });
  }
  if (from === 'battlefield' && finalZone === 'graveyard' && isCreature(previous.card)) emitEvent(state, 'CreatureDied', { object, affected: object, previous, controller: previous.controller, from, to: finalZone, metadata: { lki: true, ...eventMetadata } });
  return { status: 'committed', object, from, to: finalZone, replaced: finalZone !== zone, replacements: pipeline.applied };
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
  const protection = deriveCharacteristics(state, event.affected).abilities
    .filter((ability) => normalizeMagicText(ability).startsWith('protection from '))
    .map((ability, index) => ({ quality: normalizeMagicText(ability).replace('protection from ', ''), index }))
    .filter(({ quality }) => event.source?.runtimeState ? derivedHasQuality(state, event.source, quality) : sourceHasQuality(event.source?.card || {}, quality))
    .map(({ index }) => ({ id: `protection:${event.affected.id}:${index}`, remaining: null, source: event.affected, protection: true }));
  return [...registered, ...protection];
}

export function markDamageWithResult(state, object, amount, source, metadata = {}, options = {}) {
  const pipeline = proposeRuntimeEvent(state, 'Damage', { source, affected: object, object, amount, metadata }, options);
  if (pipeline.status !== 'ready') return pipeline;
  let remaining = pipeline.event.amount;
  const preventedBy = [];
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
    object.damageMarked += remaining;
    if (metadata.deathtouch) object.damagedByDeathtouch = true;
    emitEvent(state, 'DamageDealt', { source, affected: object, amount: remaining, final: { damageMarked: object.damageMarked }, metadata: { ...metadata, replacements: pipeline.applied } });
  }
  return { status: 'committed', proposed: amount, replacedAmount: pipeline.event.amount, dealt: remaining, prevented: pipeline.event.amount - remaining, preventedBy, replacements: pipeline.applied };
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
    for (const [playerId, player] of Object.entries(state.players)) {
      if (!player.lost && (player.life <= 0 || player.poison >= 10 || player.failedDraw)) {
        player.lost = true;
        const reason = player.life <= 0 ? 'life total' : player.poison >= 10 ? 'poison counters' : 'drawing from an empty library';
        emitEvent(state, 'PlayerLost', { player: playerId, metadata: { reason } });
        applied.push(`${playerId} loses the game because of ${reason}.`);
        changed = true;
      }
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

export function putPendingTriggersOnStack(state) {
  const active = state.game.activePlayer;
  const ordered = [...state.pendingTriggers].sort((left, right) => Number(left.controller === active) - Number(right.controller === active));
  for (const trigger of ordered) {
    if (!state.stack.includes(trigger)) state.stack.push(trigger);
    emitEvent(state, 'TriggerPutOnStack', { source: trigger.source, controller: trigger.controller, metadata: { triggerId: trigger.id } });
  }
  state.pendingTriggers = [];
  return ordered;
}

export function resolveTrigger(state, trigger, targetPlayer = 'opponent') {
  if (trigger.effect.type !== 'life-drain') return { supported: false, summary: `${trigger.source.name}'s trigger is unsupported.` };
  const target = state.players[targetPlayer] ? targetPlayer : 'opponent';
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
