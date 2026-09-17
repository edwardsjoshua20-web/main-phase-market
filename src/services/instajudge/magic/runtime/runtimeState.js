import { isCreature, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { parseOracleSemantics } from './oracleSemantics.js';

let nextObjectId = 1;
let nextEventId = 1;
function makeId(prefix) { return `${prefix}-${nextObjectId++}`; }

export function createPlayer(id, overrides = {}) {
  return {
    id,
    life: overrides.life ?? 20,
    poison: overrides.poison ?? 0,
    hand: [], library: [], graveyard: [], exile: [], battlefield: [], commandZone: [],
    commanderDamage: {},
    lost: false
  };
}

export function createGameObject({ id = null, card, controller = 'player', owner = controller, zone = 'battlefield', token = false, power = null, toughness = null, name = null, tapped = false, commander = false, counters = {}, timestamp = null } = {}) {
  const normalizedCard = card ? normalizeMagicCard(card) : normalizeMagicCard({ name: name || 'Generic Object', typeLine: 'Creature', oracleText: '', power, toughness });
  return {
    id: id || makeId(token ? 'token' : 'object'),
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
    lastKnown: null,
    semantics: parseOracleSemantics(normalizedCard)
  };
}

export function currentPower(object) {
  const base = object.basePower ?? object.card.power;
  const counterDelta = (object.counters['+1/+1'] || 0) - (object.counters['-1/-1'] || 0);
  return object.effects.reduce((value, effect) => value + (effect.power || 0), Number.isFinite(base) ? base + counterDelta : null);
}

export function currentToughness(object) {
  const base = object.baseToughness ?? object.card.toughness;
  const counterDelta = (object.counters['+1/+1'] || 0) - (object.counters['-1/-1'] || 0);
  return object.effects.reduce((value, effect) => value + (effect.toughness || 0), Number.isFinite(base) ? base + counterDelta : null);
}

export function snapshotObject(object) {
  return {
    id: object.id, name: object.name, card: object.card, oracleId: object.oracleId,
    owner: object.owner, controller: object.controller, zone: object.zone,
    timestamp: object.timestamp, token: object.token, commander: object.commander,
    power: currentPower(object), toughness: currentToughness(object),
    damageMarked: object.damageMarked, damagedByDeathtouch: object.damagedByDeathtouch,
    counters: { ...object.counters }, tapped: object.tapped,
    attachments: [...object.attachments], attachedTo: object.attachedTo,
    semantics: object.semantics
  };
}

export function objectIsCreature(object) {
  return object.zone === 'battlefield' && (isCreature(object.card) || normalizeMagicText(object.card.typeLine).includes('creature'));
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
    trace: [], scenario
  };

  const scenarioNames = new Set((scenario?.objects || []).filter((entry) => !entry.name.startsWith('Generic ') && !entry.name.startsWith('Token ')).map((entry) => normalizeMagicText(entry.name)));
  for (const card of cards) {
    const normalized = normalizeMagicCard(card);
    if (!normalizeMagicText(message).includes(normalized.normalizedName) || /instant|sorcery/i.test(normalized.typeLine)) continue;
    const descriptor = scenario?.objects?.find((entry) => normalizeMagicText(entry.name) === normalized.normalizedName);
    if (scenario && scenarioNames.has(normalized.normalizedName) && !descriptor) continue;
    addPermanent(state, createGameObject({ card: normalized, controller: descriptor?.controller || inferController(message, normalized), owner: descriptor?.owner || inferController(message, normalized), commander: descriptor?.commander || false }));
  }
  for (const object of genericObjects) addPermanent(state, createGameObject({ ...object, id: object.id || null, token: Boolean(object.token), controller: object.controller || 'player', owner: object.owner || object.controller || 'player' }));
  return state;
}

function registerObject(state, object) {
  state.objects.set(object.id, object);
  if (!state.zones[object.zone]?.includes(object.id)) state.zones[object.zone]?.push(object.id);
  return object;
}

export function addPermanent(state, object) {
  object.zone = 'battlefield';
  registerObject(state, object);
  if (!state.battlefield.includes(object)) state.battlefield.push(object);
  if (!state.players[object.controller]?.battlefield.includes(object.id)) state.players[object.controller]?.battlefield.push(object.id);
  emitEvent(state, 'PermanentEntered', { object, controller: object.controller, final: snapshotObject(object) });
  return object;
}

function removeFromZone(state, zone, objectId) {
  if (state.zones[zone]) state.zones[zone] = state.zones[zone].filter((id) => id !== objectId);
  for (const player of Object.values(state.players)) {
    if (player[zone]) player[zone] = player[zone].filter((id) => id !== objectId);
    if (zone === 'battlefield') player.battlefield = player.battlefield.filter((id) => id !== objectId);
  }
}

export function moveObject(state, object, zone, reason, metadata = {}) {
  const from = object.zone;
  const previous = snapshotObject(object);
  emitEvent(state, 'ZoneChangeProposed', { object, affected: object, previous, from, to: zone, proposed: { zone }, metadata: { reason, ...metadata } });
  removeFromZone(state, from, object.id);
  object.zone = zone;
  object.lastKnown = previous;
  if (!state.zones[zone]?.includes(object.id)) state.zones[zone]?.push(object.id);
  const playerZone = zone === 'command' ? 'commandZone' : zone;
  if (state.players[object.owner]?.[playerZone] && !state.players[object.owner][playerZone].includes(object.id)) state.players[object.owner][playerZone].push(object.id);
  emitEvent(state, 'ZoneChanged', { object, affected: object, previous, from, to: zone, final: snapshotObject(object), metadata: { reason, ...metadata } });
  if (from === 'battlefield') emitEvent(state, 'PermanentLeft', { object, affected: object, previous, from, to: zone, metadata: { reason, ...metadata } });
  if (from === 'battlefield' && zone === 'graveyard' && isCreature(previous.card)) emitEvent(state, 'CreatureDied', { object, affected: object, previous, controller: previous.controller, from, to: zone, metadata: { lki: true, reason, ...metadata } });
  return object;
}

export function markDamage(state, object, amount, source, metadata = {}) {
  emitEvent(state, 'DamageProposed', { source, affected: object, amount, proposed: { amount }, metadata });
  object.damageMarked += amount;
  if (metadata.deathtouch) object.damagedByDeathtouch = true;
  return emitEvent(state, 'DamageDealt', { source, affected: object, amount, final: { damageMarked: object.damageMarked }, metadata });
}

function cancelOpposingCounters(object) {
  const positive = object.counters['+1/+1'] || 0;
  const negative = object.counters['-1/-1'] || 0;
  const cancellation = Math.min(positive, negative);
  if (cancellation <= 0) return false;
  object.counters['+1/+1'] = positive - cancellation;
  object.counters['-1/-1'] = negative - cancellation;
  return true;
}

export function runStateBasedActionsRuntime(state) {
  const applied = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of state.battlefield.filter((candidate) => candidate.zone === 'battlefield')) {
      if (cancelOpposingCounters(object)) { applied.push(`${object.name}'s opposing +1/+1 and -1/-1 counters cancel.`); changed = true; }
    }
    const doomed = state.battlefield.filter((object) => {
      if (!objectIsCreature(object)) return false;
      const toughness = currentToughness(object);
      if (Number.isFinite(toughness) && toughness <= 0) return true;
      return Number.isFinite(toughness) && (object.damageMarked >= toughness || object.damagedByDeathtouch) && !object.card.abilities?.includes('indestructible');
    });
    for (const object of doomed) {
      const toughness = currentToughness(object);
      const reason = toughness <= 0 ? 'state-based action: toughness 0 or less' : object.damagedByDeathtouch ? 'state-based action: deathtouch damage' : 'state-based action: lethal damage';
      moveObject(state, object, 'graveyard', reason, { simultaneousBatch: doomed.map((entry) => entry.id) });
      applied.push(`${object.name} is put into its owner's graveyard (${reason.replace('state-based action: ', '')}).`);
      changed = true;
    }
    for (const [playerId, player] of Object.entries(state.players)) {
      if (!player.lost && (player.life <= 0 || player.poison >= 10)) {
        player.lost = true;
        const reason = player.life <= 0 ? 'life total' : 'poison counters';
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
        const trigger = { id: makeId('trigger'), key, type: 'triggered-ability', source, controller: source.controller, event, ability, effect: legacyTriggerEffect(ability), optional: ability.optional, targets: ability.targets };
        triggerInstances.push(trigger);
        state.pendingTriggers.push(trigger);
        emitEvent(state, 'TriggerCreated', { source, affected: event.previous || event.affected, controller: source.controller, metadata: { triggerEvent: event.type, triggerId: trigger.id } });
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
