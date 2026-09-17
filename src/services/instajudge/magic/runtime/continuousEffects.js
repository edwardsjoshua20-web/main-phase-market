import { normalizeMagicCard, normalizeMagicText } from '../magicCards.js';

export const CONTINUOUS_LAYERS = Object.freeze({
  COPY: 1,
  CONTROL: 2,
  TEXT: 3,
  TYPE: 4,
  COLOR: 5,
  ABILITY: 6,
  POWER_TOUGHNESS: 7
});

export const PT_SUBLAYERS = Object.freeze({
  CDA: '7a',
  SET: '7b',
  MODIFY: '7c',
  COUNTERS: '7d',
  SWITCH: '7e'
});

const SUPERTYPES = new Set(['basic', 'legendary', 'snow', 'world', 'ongoing']);
const CARD_TYPES = new Set(['artifact', 'battle', 'creature', 'enchantment', 'instant', 'kindred', 'land', 'planeswalker', 'sorcery']);

function unique(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).toLowerCase()))];
}

function parseTypeLine(typeLine = '') {
  const [left = '', right = ''] = String(typeLine).split(/\s+[—-]\s+/);
  const words = left.trim().split(/\s+/).filter(Boolean);
  return {
    supertypes: unique(words.filter((word) => SUPERTYPES.has(word.toLowerCase()))),
    types: unique(words.filter((word) => CARD_TYPES.has(word.toLowerCase()))),
    subtypes: unique(right.trim().split(/\s+/).filter(Boolean))
  };
}

function keywordNames(card, keywordAbilities = []) {
  return unique([
    ...(card.abilities || []),
    ...keywordAbilities.map((ability) => ability.keyword)
  ]);
}

export function createBaseCharacteristics(cardInput = {}, overrides = {}) {
  const card = normalizeMagicCard(cardInput);
  const parsedTypes = parseTypeLine(card.typeLine);
  const power = overrides.power ?? card.power;
  const toughness = overrides.toughness ?? card.toughness;
  const loyalty = card.loyalty;
  return Object.freeze({
    name: overrides.name || card.name,
    manaCost: card.manaCost || '',
    colors: unique(card.colors),
    colorIdentity: unique(card.colorIdentity || card.color_identity || card.colors),
    supertypes: parsedTypes.supertypes,
    types: parsedTypes.types,
    subtypes: parsedTypes.subtypes,
    abilities: keywordNames(card, overrides.keywordAbilities || []),
    keywordAbilities: (overrides.keywordAbilities || []).map((ability) => ({ ...ability })),
    power: Number.isFinite(power) ? power : null,
    toughness: Number.isFinite(toughness) ? toughness : null,
    loyalty: loyalty !== null && loyalty !== '' && Number.isFinite(Number(loyalty)) ? Number(loyalty) : null,
    text: card.oracleText || '',
    printedText: card.oracleText || ''
  });
}

export function initializeObjectCharacteristics(object) {
  if (object.baseCharacteristics && object.copyableValues) return object;
  const base = createBaseCharacteristics(object.card, {
    name: object.name,
    power: object.basePower,
    toughness: object.baseToughness,
    keywordAbilities: [
      ...(object.keywordAbilities || []),
      ...(object.semantics?.keywords || []).map((keyword) => ({ type: 'KeywordAbility', keyword }))
    ]
  });
  object.baseCharacteristics = base;
  object.copyableValues = cloneCharacteristics(base);
  object.baseController = object.baseController || object.controller;
  return object;
}

export function cloneCharacteristics(characteristics) {
  return {
    ...characteristics,
    colors: [...(characteristics.colors || [])],
    colorIdentity: [...(characteristics.colorIdentity || [])],
    supertypes: [...(characteristics.supertypes || [])],
    types: [...(characteristics.types || [])],
    subtypes: [...(characteristics.subtypes || [])],
    abilities: [...(characteristics.abilities || [])],
    keywordAbilities: (characteristics.keywordAbilities || []).map((ability) => ({ ...ability }))
  };
}

export function invalidateCharacteristics(state) {
  if (!state) return;
  state.characteristicRevision = (state.characteristicRevision || 0) + 1;
  state.characteristicCache?.clear();
}

function normalizeDuration(duration, state, sourceId) {
  if (!duration) return { type: 'indefinite' };
  if (typeof duration === 'object') return { ...duration, createdTurn: duration.createdTurn ?? state.game.turn, sourceId: duration.sourceId || sourceId || null };
  const type = duration === 'this-turn' ? 'until-end-of-turn' : duration;
  return { type, createdTurn: state.game.turn, sourceId: sourceId || null };
}

export function createContinuousEffect(state, input = {}) {
  const sourceId = input.sourceId || input.source?.id || null;
  const effect = {
    id: input.id || `continuous-${state.nextContinuousEffectId++}`,
    source: input.source || (sourceId ? state.objects.get(sourceId) : null),
    sourceId,
    controller: input.controller || input.source?.controller || null,
    layer: input.layer,
    sublayer: input.sublayer || null,
    timestamp: input.timestamp ?? state.nextContinuousTimestamp++,
    duration: normalizeDuration(input.duration, state, sourceId),
    dependencyKeys: {
      reads: [...(input.dependencyKeys?.reads || [])],
      writes: [...(input.dependencyKeys?.writes || [])]
    },
    appliesTo: input.appliesTo || {},
    modification: input.modification || {},
    oracleText: input.oracleText || null,
    static: Boolean(input.static),
    active: input.active !== false
  };
  state.continuousEffects.push(effect);
  invalidateCharacteristics(state);
  return effect;
}

export function removeContinuousEffect(state, effectId) {
  const previous = state.continuousEffects.length;
  state.continuousEffects = state.continuousEffects.filter((effect) => effect.id !== effectId);
  if (state.continuousEffects.length !== previous) invalidateCharacteristics(state);
}

export function removeSourceStaticEffects(state, sourceId, { all = false } = {}) {
  const previous = state.continuousEffects.length;
  state.continuousEffects = state.continuousEffects.filter((effect) => !(effect.sourceId === sourceId
    && effect.static
    && (all || effect.duration?.type === 'source-on-battlefield')));
  if (state.continuousEffects.length !== previous) invalidateCharacteristics(state);
}

function staticEffectSpec(source, effect) {
  const shared = {
    source,
    controller: source.controller,
    duration: effect.duration || 'source-on-battlefield',
    appliesTo: effect.selector || { objectId: source.id },
    oracleText: effect.text,
    static: true
  };
  if (effect.type === 'PTModification') return {
    ...shared, layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: effect.setBase ? PT_SUBLAYERS.SET : PT_SUBLAYERS.MODIFY,
    modification: { kind: 'pt', mode: effect.setBase ? 'set' : 'modify', power: effect.power?.value, toughness: effect.toughness?.value }
  };
  if (effect.type === 'KeywordGrant' || effect.type === 'AbilityChangeEffect') return {
    ...shared, layer: CONTINUOUS_LAYERS.ABILITY,
    modification: { kind: 'ability', mode: effect.mode || 'add', abilities: effect.abilities || [effect.keyword], keywordAbilities: effect.keyword ? [{ type: 'KeywordAbility', keyword: effect.keyword }] : undefined }
  };
  if (effect.type === 'ControlChangeEffect') return {
    ...shared, layer: CONTINUOUS_LAYERS.CONTROL,
    modification: { kind: 'control', controller: effect.controller === 'effect-controller' ? source.controller : effect.controller, controllerOfSource: effect.controller === 'effect-controller' }
  };
  if (effect.type === 'TypeChangeEffect') return {
    ...shared, layer: CONTINUOUS_LAYERS.TYPE,
    modification: { kind: 'type', mode: effect.mode || 'add', types: effect.types, subtypes: effect.subtypes, supertypes: effect.supertypes }
  };
  if (effect.type === 'ColorChangeEffect') return {
    ...shared, layer: CONTINUOUS_LAYERS.COLOR,
    modification: { kind: 'color', mode: effect.mode || 'set', colors: effect.colors || [] }
  };
  if (effect.type === 'CharacteristicDefiningAbility' && effect.formula === 'controller-hand-size') return {
    ...shared, duration: 'indefinite', layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.CDA,
    modification: {
      kind: 'pt', mode: 'cda',
      compute: ({ characteristics, state }) => {
        const count = state.players[characteristics.controller]?.hand.length || 0;
        return { power: count, toughness: count };
      }
    }
  };
  return null;
}

export function registerStaticContinuousEffects(state, source) {
  removeSourceStaticEffects(state, source.id, { all: true });
  const effects = source.semantics?.continuousEffects || [];
  const created = [];
  for (const effect of effects.filter((candidate) => candidate.static || candidate.type === 'CharacteristicDefiningAbility')) {
    const spec = staticEffectSpec(source, effect);
    if (spec) created.push(createContinuousEffect(state, spec));
  }
  return created;
}

function conditionMatches(condition, state, effect) {
  if (!condition) return true;
  if (typeof condition === 'function') return Boolean(condition(state, effect));
  if (condition.sourceOnBattlefield) return state.objects.get(effect.sourceId)?.zone === 'battlefield';
  if (condition.objectInZone) return state.objects.get(condition.objectId)?.zone === condition.objectInZone;
  return false;
}

export function durationIsActive(state, effect) {
  if (!effect.active) return false;
  const duration = effect.duration || { type: 'indefinite' };
  if (duration.type === 'indefinite') return true;
  if (duration.type === 'until-end-of-turn') return !effect.expired && state.game.turn === duration.createdTurn;
  if (duration.type === 'source-on-battlefield') return state.objects.get(duration.sourceId || effect.sourceId)?.zone === 'battlefield';
  if (['as-long-as', 'for-as-long-as', 'while'].includes(duration.type)) return conditionMatches(duration.condition, state, effect);
  return false;
}

export function expireContinuousEffects(state, transition = {}) {
  let changed = false;
  for (const effect of state.continuousEffects) {
    if (effect.duration?.type === 'until-end-of-turn' && (transition.step === 'cleanup' || state.game.turn > effect.duration.createdTurn)) {
      effect.expired = true;
      changed = true;
    }
  }
  const previous = state.continuousEffects.length;
  state.continuousEffects = state.continuousEffects.filter((effect) => durationIsActive(state, effect));
  if (changed || previous !== state.continuousEffects.length) invalidateCharacteristics(state);
  return previous - state.continuousEffects.length;
}

function descriptorMatches(descriptor, object, characteristics, state, effect) {
  if (typeof descriptor === 'function') return Boolean(descriptor({ object, characteristics, state, effect }));
  if (descriptor.objectId && descriptor.objectId !== object.id) return false;
  if (descriptor.source && effect.sourceId !== object.id) return false;
  if (descriptor.otherThanSource && effect.sourceId === object.id) return false;
  if (descriptor.controller && descriptor.controller !== characteristics.controller) return false;
  if (descriptor.controllerOfSource) {
    const source = state.objects.get(effect.sourceId);
    const sourceController = source?.id === object.id ? characteristics.controller : source ? deriveCharacteristics(state, source).controller : effect.controller;
    if (characteristics.controller !== sourceController) return false;
  }
  if (descriptor.types?.length && !descriptor.types.every((type) => characteristics.types.includes(type.toLowerCase()))) return false;
  if (descriptor.attachedToSource && object.id !== state.objects.get(effect.sourceId)?.attachedTo) return false;
  if (descriptor.zone && object.zone !== descriptor.zone) return false;
  return true;
}

function dependencyOrder(effects) {
  const edges = new Map(effects.map((effect) => [effect.id, new Set()]));
  const indegree = new Map(effects.map((effect) => [effect.id, 0]));
  for (const reader of effects) {
    for (const writer of effects) {
      if (reader.id === writer.id) continue;
      const depends = reader.dependencyKeys.reads.some((key) => writer.dependencyKeys.writes.includes(key));
      if (depends && !edges.get(writer.id).has(reader.id)) {
        edges.get(writer.id).add(reader.id);
        indegree.set(reader.id, indegree.get(reader.id) + 1);
      }
    }
  }
  const queue = effects.filter((effect) => indegree.get(effect.id) === 0).sort((a, b) => a.timestamp - b.timestamp);
  const ordered = [];
  while (queue.length) {
    const effect = queue.shift();
    ordered.push(effect);
    for (const targetId of edges.get(effect.id)) {
      indegree.set(targetId, indegree.get(targetId) - 1);
      if (indegree.get(targetId) === 0) {
        queue.push(effects.find((candidate) => candidate.id === targetId));
        queue.sort((a, b) => a.timestamp - b.timestamp);
      }
    }
  }
  return ordered.length === effects.length ? { status: 'ready', effects: ordered } : { status: 'unsupported', reason: 'Continuous-effect dependency cycle is not safely resolvable.' };
}

function replaceText(text, from, to) {
  if (!from) return text;
  return String(text).replace(new RegExp(`\\b${String(from).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'), to);
}

function applyModification(characteristics, effect, object, state) {
  const modification = effect.modification;
  switch (modification.kind) {
    case 'copy': {
      const copied = cloneCharacteristics(modification.values || {});
      const colorIdentity = characteristics.colorIdentity;
      Object.assign(characteristics, copied, { colorIdentity });
      break;
    }
    case 'control':
      characteristics.controller = modification.controllerOfSource && effect.sourceId
        ? deriveCharacteristics(state, state.objects.get(effect.sourceId)).controller
        : modification.controller;
      break;
    case 'text':
      characteristics.text = replaceText(characteristics.text, modification.from, modification.to);
      break;
    case 'type': {
      for (const key of ['types', 'subtypes', 'supertypes']) {
        const values = unique(modification[key]);
        if (!values.length) continue;
        if (modification.mode === 'set') characteristics[key] = values;
        else if (modification.mode === 'remove') characteristics[key] = characteristics[key].filter((value) => !values.includes(value));
        else characteristics[key] = unique([...characteristics[key], ...values]);
      }
      break;
    }
    case 'color': {
      const colors = unique(modification.colors);
      if (modification.mode === 'set') characteristics.colors = colors;
      else if (modification.mode === 'remove') characteristics.colors = characteristics.colors.filter((color) => !colors.includes(color));
      else characteristics.colors = unique([...characteristics.colors, ...colors]);
      break;
    }
    case 'ability': {
      const abilities = unique(modification.abilities);
      if (modification.mode === 'clear') {
        characteristics.abilities = [];
        characteristics.keywordAbilities = [];
      } else if (modification.mode === 'remove') {
        characteristics.abilities = characteristics.abilities.filter((ability) => !abilities.includes(ability));
        characteristics.keywordAbilities = characteristics.keywordAbilities.filter((ability) => !abilities.includes(ability.keyword));
      } else {
        characteristics.abilities = unique([...characteristics.abilities, ...abilities]);
        for (const ability of modification.keywordAbilities || abilities.map((keyword) => ({ type: 'KeywordAbility', keyword }))) {
          if (!characteristics.keywordAbilities.some((candidate) => candidate.keyword === ability.keyword)) characteristics.keywordAbilities.push({ ...ability });
        }
      }
      break;
    }
    case 'pt': {
      const values = typeof modification.compute === 'function' ? modification.compute({ object, characteristics, state, effect }) : modification;
      if (modification.mode === 'set' || modification.mode === 'cda') {
        characteristics.power = values.power;
        characteristics.toughness = values.toughness;
      } else if (modification.mode === 'switch') {
        [characteristics.power, characteristics.toughness] = [characteristics.toughness, characteristics.power];
      } else {
        if (Number.isFinite(characteristics.power) && Number.isFinite(values.power)) characteristics.power += values.power;
        if (Number.isFinite(characteristics.toughness) && Number.isFinite(values.toughness)) characteristics.toughness += values.toughness;
      }
      break;
    }
    case 'name':
      characteristics.name = modification.name;
      break;
    default:
      break;
  }
}

function effectSortKey(effect) {
  const sublayers = { [PT_SUBLAYERS.CDA]: 1, [PT_SUBLAYERS.SET]: 2, [PT_SUBLAYERS.MODIFY]: 3, [PT_SUBLAYERS.COUNTERS]: 4, [PT_SUBLAYERS.SWITCH]: 5 };
  return effect.layer * 10 + (effect.layer === CONTINUOUS_LAYERS.POWER_TOUGHNESS ? sublayers[effect.sublayer] || 3 : 0);
}

function cacheKey(state, object) {
  return `${state.characteristicRevision}:${object.zone}:${object.baseController}:${JSON.stringify(object.counters)}:${JSON.stringify(object.effects)}`;
}

export function deriveCharacteristics(state, object, options = {}) {
  initializeObjectCharacteristics(object);
  if (!state) return { ...cloneCharacteristics(object.copyableValues), controller: object.baseController, status: 'ready', appliedEffects: [] };
  const key = cacheKey(state, object);
  const cached = !options.noCache && state.characteristicCache.get(object.id);
  if (cached?.key === key) return cached.value;
  const characteristics = { ...cloneCharacteristics(object.copyableValues), controller: object.baseController, status: 'ready', appliedEffects: [] };
  const active = state.continuousEffects.filter((effect) => durationIsActive(state, effect));
  const groups = new Map();
  for (const effect of active) {
    const group = effectSortKey(effect);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(effect);
  }
  const counterDelta = (object.counters['+1/+1'] || 0) - (object.counters['-1/-1'] || 0);
  if (counterDelta !== 0) {
    const group = effectSortKey({ layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.COUNTERS });
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({
      id: `counters:${object.id}`,
      timestamp: object.timestamp,
      dependencyKeys: { reads: [], writes: [] },
      appliesTo: { objectId: object.id },
      modification: { kind: 'pt', mode: 'modify', power: counterDelta, toughness: counterDelta }
    });
  }
  for (const group of [...groups.keys()].sort((a, b) => a - b)) {
    const ordered = dependencyOrder(groups.get(group));
    if (ordered.status !== 'ready') return { ...characteristics, status: 'unsupported', reason: ordered.reason };
    for (const effect of ordered.effects) {
      if (!descriptorMatches(effect.appliesTo, object, characteristics, state, effect)) continue;
      applyModification(characteristics, effect, object, state);
      characteristics.appliedEffects.push(effect.id);
    }
  }
  for (const legacy of object.effects || []) {
    if (legacy.type === 'pt-modifier') {
      characteristics.power += legacy.power || 0;
      characteristics.toughness += legacy.toughness || 0;
    }
    if (legacy.type === 'protection') characteristics.abilities = unique([...characteristics.abilities, `protection from ${legacy.quality}`]);
    if (legacy.type === 'ability') characteristics.abilities = unique([...characteristics.abilities, legacy.ability]);
  }
  const value = Object.freeze({ ...characteristics, currentCopyState: characteristics.appliedEffects.filter((id) => state.continuousEffects.find((effect) => effect.id === id)?.layer === CONTINUOUS_LAYERS.COPY) });
  if (!options.noCache) state.characteristicCache.set(object.id, { key, value });
  return value;
}

export function captureCopyableValues(state, source) {
  initializeObjectCharacteristics(source);
  const copyEffects = state.continuousEffects
    .filter((effect) => effect.layer === CONTINUOUS_LAYERS.COPY && durationIsActive(state, effect))
    .sort((a, b) => a.timestamp - b.timestamp);
  const values = cloneCharacteristics(source.copyableValues);
  for (const effect of copyEffects) {
    const working = { ...cloneCharacteristics(values), controller: source.baseController };
    if (descriptorMatches(effect.appliesTo, source, working, state, effect)) applyModification(working, effect, source, state);
    Object.assign(values, cloneCharacteristics(working));
  }
  delete values.controller;
  delete values.status;
  delete values.appliedEffects;
  return values;
}

export function createCopyEffect(state, { target, source, duration = 'indefinite', controller = target.controller } = {}) {
  if (!target || !source) return { status: 'unsupported', reason: 'A copy effect needs source and target objects.' };
  return createContinuousEffect(state, {
    source,
    controller,
    layer: CONTINUOUS_LAYERS.COPY,
    duration,
    appliesTo: { objectId: target.id },
    modification: { kind: 'copy', values: captureCopyableValues(state, source) },
    dependencyKeys: { writes: ['copyable-values'] }
  });
}

export function registerScenarioContinuousEffects(state, effects = []) {
  const created = [];
  for (const effect of effects) {
    const target = state.objects.get(effect.targetObjectId);
    const source = effect.sourceObjectId ? state.objects.get(effect.sourceObjectId) : null;
    if (!target) continue;
    if (effect.kind === 'copy' && source) {
      created.push(createCopyEffect(state, { target, source, duration: effect.duration }));
      continue;
    }
    const layers = {
      control: CONTINUOUS_LAYERS.CONTROL,
      text: CONTINUOUS_LAYERS.TEXT,
      type: CONTINUOUS_LAYERS.TYPE,
      color: CONTINUOUS_LAYERS.COLOR,
      ability: CONTINUOUS_LAYERS.ABILITY,
      pt: CONTINUOUS_LAYERS.POWER_TOUGHNESS
    };
    if (!layers[effect.kind]) continue;
    created.push(createContinuousEffect(state, {
      source,
      controller: effect.controller || target.controller,
      layer: layers[effect.kind],
      sublayer: effect.kind === 'pt' ? effect.sublayer || PT_SUBLAYERS.MODIFY : null,
      duration: effect.duration || 'indefinite',
      appliesTo: { objectId: target.id },
      modification: { ...effect.modification, kind: effect.kind }
    }));
  }
  return created;
}

export function attachObject(state, attachment, target) {
  if (!attachment || !target) return { status: 'unsupported', reason: 'Attachment and target are required.' };
  if (attachment.attachedTo) detachObject(state, attachment);
  attachment.attachedTo = target.id;
  if (!target.attachments.includes(attachment.id)) target.attachments.push(attachment.id);
  const timestamp = state.nextContinuousTimestamp++;
  attachment.timestamp = timestamp;
  for (const effect of state.continuousEffects.filter((candidate) => candidate.sourceId === attachment.id && candidate.static)) effect.timestamp = timestamp;
  invalidateCharacteristics(state);
  return { status: 'attached', attachment, target };
}

export function detachObject(state, attachment) {
  const target = state.objects.get(attachment?.attachedTo);
  if (target) target.attachments = target.attachments.filter((id) => id !== attachment.id);
  if (attachment) attachment.attachedTo = null;
  invalidateCharacteristics(state);
}

export function derivedHasAbility(state, object, ability) {
  const wanted = normalizeMagicText(ability);
  return deriveCharacteristics(state, object).abilities.some((candidate) => normalizeMagicText(candidate) === wanted || normalizeMagicText(candidate).startsWith(`${wanted} `));
}

export function derivedHasQuality(state, object, quality) {
  const characteristics = deriveCharacteristics(state, object);
  const wanted = normalizeMagicText(quality);
  if (wanted === 'colorless') return characteristics.colors.length === 0;
  return characteristics.colors.includes(wanted)
    || characteristics.types.includes(wanted)
    || characteristics.subtypes.includes(wanted)
    || normalizeMagicText(characteristics.name).includes(wanted);
}
