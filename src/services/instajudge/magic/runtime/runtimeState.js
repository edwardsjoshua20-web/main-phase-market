import { isCreature, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { parseOracleSemantics } from './oracleSemantics.js';

let nextObjectId = 1;

function makeId(prefix) {
  const id = `${prefix}-${nextObjectId}`;
  nextObjectId += 1;
  return id;
}

export function createPlayer(id, overrides = {}) {
  return {
    id,
    life: overrides.life ?? 20,
    poison: overrides.poison ?? 0,
    hand: [],
    library: [],
    graveyard: [],
    exile: [],
    battlefield: [],
    commandZone: []
  };
}

export function createGameObject({ card, controller = 'player', owner = controller, zone = 'battlefield', token = false, power = null, toughness = null, name = null } = {}) {
  const normalizedCard = card ? normalizeMagicCard(card) : normalizeMagicCard({
    name: name || 'Creature Token',
    typeLine: 'Creature - Token',
    oracleText: '',
    power,
    toughness
  });
  return {
    id: makeId(token ? 'token' : 'object'),
    card: normalizedCard,
    name: name || normalizedCard.name,
    owner,
    controller,
    zone,
    tapped: false,
    counters: {},
    damageMarked: 0,
    token,
    faceState: 'front',
    commander: false,
    basePower: power ?? normalizedCard.power,
    baseToughness: toughness ?? normalizedCard.toughness,
    effects: [],
    lastKnown: null,
    semantics: parseOracleSemantics(normalizedCard)
  };
}

export function snapshotObject(object) {
  return {
    id: object.id,
    name: object.name,
    card: object.card,
    owner: object.owner,
    controller: object.controller,
    zone: object.zone,
    token: object.token,
    power: currentPower(object),
    toughness: currentToughness(object),
    damageMarked: object.damageMarked,
    semantics: object.semantics
  };
}

export function currentPower(object) {
  return object.effects.reduce((value, effect) => value + (effect.power || 0), object.basePower ?? object.card.power ?? 0);
}

export function currentToughness(object) {
  return object.effects.reduce((value, effect) => value + (effect.toughness || 0), object.baseToughness ?? object.card.toughness ?? 0);
}

export function objectIsCreature(object) {
  return object.zone === 'battlefield' && (isCreature(object.card) || normalizeMagicText(object.card.typeLine).includes('creature'));
}

export function createMagicRuntimeState({ cards = [], genericObjects = [], message = '' } = {}) {
  nextObjectId = 1;
  const state = {
    players: {
      player: createPlayer('player'),
      opponent: createPlayer('opponent')
    },
    game: {
      activePlayer: /opponent.?s turn|opponent turn/i.test(message) ? 'opponent' : 'player',
      phase: /combat/i.test(message) ? 'combat' : /end step/i.test(message) ? 'ending' : 'main',
      step: /cleanup/i.test(message) ? 'cleanup' : null,
      priorityHolder: 'player',
      turn: 1
    },
    battlefield: [],
    stack: [],
    pendingTriggers: [],
    events: [],
    replacementEffects: [],
    continuousEffects: [],
    trace: []
  };

  for (const card of cards) {
    const normalized = normalizeMagicCard(card);
    const mentioned = normalizeMagicText(message).includes(normalized.normalizedName);
    if (mentioned && !/instant|sorcery/i.test(normalized.typeLine)) {
      addPermanent(state, createGameObject({ card: normalized, controller: inferController(message, normalized), owner: inferController(message, normalized) }));
    }
  }

  for (const object of genericObjects) {
    addPermanent(state, createGameObject({ ...object, token: true, controller: object.controller || 'player', owner: object.owner || 'player' }));
  }

  return state;
}

function inferController(message, card) {
  const text = normalizeMagicText(message);
  const name = card.normalizedName;
  if (new RegExp(`\\b(opponent controls|opponent has)\\s+${escapeRegExp(name)}\\b`).test(text)) return 'opponent';
  if (new RegExp(`\\b(i control|i have|player controls|you control|my)\\b.*\\b${escapeRegExp(name)}\\b`).test(text)) return 'player';
  return 'player';
}

export function addPermanent(state, object) {
  object.zone = 'battlefield';
  state.battlefield.push(object);
  state.players[object.controller]?.battlefield.push(object.id);
  state.trace.push({ type: 'PermanentEntered', object: object.name, controller: object.controller });
  return object;
}

export function moveObject(state, object, zone, reason) {
  const from = object.zone;
  const previous = snapshotObject(object);
  object.zone = zone;
  object.lastKnown = previous;
  if (zone === 'graveyard') state.players[object.owner]?.graveyard.push(object.id);
  if (zone === 'exile') state.players[object.owner]?.exile.push(object.id);
  const event = {
    type: 'ZoneChanged',
    object,
    previous,
    from,
    to: zone,
    reason,
    metadata: {}
  };
  state.events.push(event);
  state.trace.push({ type: 'ZoneChanged', object: object.name, from, to: zone, reason });
  if (from === 'battlefield' && zone === 'graveyard' && isCreature(previous.card)) {
    state.events.push({
      type: 'CreatureDied',
      object,
      previous,
      controller: previous.controller,
      metadata: { lki: true, reason }
    });
    state.trace.push({ type: 'CreatureDied', object: previous.name, controller: previous.controller, lki: true });
  }
}

export function markDamage(state, object, amount, source) {
  object.damageMarked += amount;
  const event = { type: 'DamageDealt', source, affected: object, amount, metadata: { combat: false } };
  state.events.push(event);
  state.trace.push({ type: 'DamageDealt', source: source?.name, affected: object.name, amount, totalMarked: object.damageMarked });
}

export function runStateBasedActionsRuntime(state) {
  const applied = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const object of [...state.battlefield]) {
      if (object.zone !== 'battlefield' || !objectIsCreature(object)) continue;
      const toughness = currentToughness(object);
      if (Number.isFinite(toughness) && toughness <= 0) {
        moveObject(state, object, 'graveyard', 'state-based action: toughness 0 or less');
        applied.push(`${object.name} is put into its owner's graveyard for having 0 or less toughness.`);
        changed = true;
        continue;
      }
      if (Number.isFinite(toughness) && object.damageMarked >= toughness && !object.card.abilities?.includes('indestructible')) {
        moveObject(state, object, 'graveyard', 'state-based action: lethal damage');
        applied.push(`${object.name} is put into its owner's graveyard for lethal damage.`);
        changed = true;
      }
    }
    for (const [playerId, player] of Object.entries(state.players)) {
      if (player.life <= 0 && !player.lost) {
        player.lost = true;
        applied.push(`${playerId} loses the game for having 0 or less life.`);
        changed = true;
      }
    }
  }
  return applied;
}

export function collectTriggeredAbilities(state, events = state.events) {
  const triggerInstances = [];
  const triggerSources = state.battlefield
    .concat(state.events.map((event) => event.previous).filter(Boolean))
    .filter((entry) => entry?.semantics?.triggeredAbilities?.length);
  const seenSourceEvent = new Set();

  for (const event of events) {
    if (event.type !== 'CreatureDied') continue;
    for (const source of triggerSources) {
      for (const ability of source.semantics.triggeredAbilities) {
        if (ability.trigger !== 'CreatureDied') continue;
        const sourceIsDeadObject = source.id === event.previous.id;
        if (sourceIsDeadObject && !ability.eventFilter.includeSelf) continue;
        if (!sourceIsDeadObject && !ability.eventFilter.includeOthers) continue;
        const key = `${source.id}:${event.previous.id}:${ability.trigger}`;
        if (seenSourceEvent.has(key)) continue;
        seenSourceEvent.add(key);
        const trigger = {
          id: makeId('trigger'),
          type: 'triggered-ability',
          source,
          controller: source.controller,
          event,
          ability,
          effect: ability.effect
        };
        triggerInstances.push(trigger);
        state.pendingTriggers.push(trigger);
        state.trace.push({ type: 'TriggerCreated', source: source.name, event: event.previous.name, trigger: ability.trigger });
      }
    }
  }
  return triggerInstances;
}

export function resolveTrigger(state, trigger, targetPlayer = 'opponent') {
  if (trigger.effect.type !== 'life-drain') return { supported: false, summary: `${trigger.source.name}'s trigger is unsupported.` };
  const target = state.players[targetPlayer] ? targetPlayer : 'opponent';
  state.players[target].life -= trigger.effect.opponentLifeLoss;
  state.players[trigger.controller].life += trigger.effect.controllerLifeGain;
  state.trace.push({
    type: 'TriggerResolved',
    source: trigger.source.name,
    event: trigger.event.previous.name,
    target,
    opponentLifeLoss: trigger.effect.opponentLifeLoss,
    controllerLifeGain: trigger.effect.controllerLifeGain
  });
  return {
    supported: true,
    summary: `${trigger.source.name} trigger resolves: ${target} loses ${trigger.effect.opponentLifeLoss} life and ${trigger.controller} gains ${trigger.effect.controllerLifeGain} life.`
  };
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
