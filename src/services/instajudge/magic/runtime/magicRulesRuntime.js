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
import { castSpell, checkTimingPermission, passPriority, resolveTopOfStack } from './stackRuntime.js';
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
  markDamage,
  moveObject,
  moveObjectWithResult,
  resolveTrigger,
  runStateBasedActionsRuntime
} from './runtimeState.js';

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
    players: ['player', 'opponent'],
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
  if (!/\bcan (?:i|player|you) (?:cast|activate)\b/.test(text)
    || !/\b(?:right now|now|during|after|before|between|in response)\b/.test(text)) return null;
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
    const targetPlayer = effect.subject?.includes('opponent') || effect.target?.kind === 'player' ? opponentOf(action.actor) : null;
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
  if (timing.status === 'unverified') {
    return unsupported(timing.reason, {
      cards,
      primitives: ['combat', 'timing', 'casting', 'stack'],
      trace: [{ type: 'TimingPermissionChecked', card: card.name, status: timing.status, code: timing.code }]
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

export function evaluateMagicRulesRuntime({ message = '', cards = [] } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const text = normalizeMagicText(message);
  const scenario = compileMagicScenario({ message, cards: normalizedCards });
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
