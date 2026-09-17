import { isCreature, isInstant, isSorcery, normalizeMagicCard, normalizeMagicText, sourceHasQuality } from '../magicCards.js';
import { rulesForPrimitives } from './comprehensiveRules.js';
import { parseOracleSemantics } from './oracleSemantics.js';
import {
  addPermanent,
  collectTriggeredAbilities,
  createGameObject,
  createMagicRuntimeState,
  currentToughness,
  markDamage,
  moveObject,
  resolveTrigger,
  runStateBasedActionsRuntime
} from './runtimeState.js';

const NUMBER_WORDS = Object.freeze({
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5
});

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

export function extractGenericObjects(message = '') {
  const text = normalizeMagicText(message);
  const objects = [];
  for (const match of text.matchAll(/\b(one|two|three|four|five|\d+)\s+(\d+)\/(\d+)\s+creature tokens?\b/g)) {
    const count = NUMBER_WORDS[match[1]] || Number(match[1]);
    const power = Number(match[2]);
    const toughness = Number(match[3]);
    for (let index = 0; index < count; index += 1) {
      objects.push({
        name: `Token ${String.fromCharCode(65 + objects.length)}`,
        card: { name: `Token ${String.fromCharCode(65 + objects.length)}`, typeLine: 'Creature - Token', oracleText: '', power, toughness },
        power,
        toughness,
        controller: /opponent controls/.test(text) ? 'opponent' : 'player'
      });
    }
  }
  return objects;
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

function validateTarget({ sourceObject, target, effect }) {
  const failures = [];
  if (!target) failures.push('No target was identified.');
  if (effect.target?.kind === 'spell') {
    if (!target) return { legal: false, failures };
    if (target.zone !== 'stack') failures.push(`${target.name} is not on the stack.`);
    return { legal: failures.length === 0, failures };
  }
  if (!target || target.zone !== 'battlefield') failures.push(`${target?.name || 'Target'} is not on the battlefield.`);
  if (!target) return { legal: false, failures };
  if (effect.target?.requiredTypes?.includes('creature') && !isCreature(target?.card || {})) failures.push(`${target.name} is not a creature.`);
  if (effect.target?.excludedColors?.some((color) => target.card.colors?.includes(color))) failures.push(`${target.name} is ${effect.target.excludedColors.join(', ')}.`);
  if (effect.target?.controller === 'self' && target.controller !== sourceObject.controller) failures.push(`${target.name} is not controlled by ${sourceObject.controller}.`);
  if (target?.card.abilities?.includes('shroud')) failures.push(`${target.name} has shroud.`);
  if (target?.card.abilities?.includes('hexproof') && target.controller !== sourceObject.controller) failures.push(`${target.name} has hexproof.`);
  for (const continuous of target?.effects || []) {
    if (continuous.type === 'protection' && sourceHasQuality(sourceObject.card, continuous.quality)) {
      failures.push(`${target.name} has protection from ${continuous.quality}.`);
    }
  }
  return { legal: failures.length === 0, failures };
}

function wardStatus({ sourceObject, target, message }) {
  if (!target?.card.abilities?.includes('ward') || target.controller === sourceObject.controller) return 'none';
  const text = normalizeMagicText(message);
  if (/\bward (cost )?(was )?paid\b|\bpays? ward\b/.test(text)) return 'paid';
  if (/\bward (cost )?(was )?(not paid|unpaid)\b|\bdoes not pay ward\b|\bdid not pay ward\b/.test(text)) return 'unpaid';
  return 'unknown';
}

function applyEffect({ state, sourceObject, effect, target, message }) {
  const sequence = [];
  const primitives = [...(effect.primitives || [])];
  if (effect.type === 'grant-protection') {
    const quality = chosenProtectionQuality(message, effect);
    if (!quality) return { needsClarification: 'Which protection quality was chosen?', sequence, primitives };
    target.effects.push({ type: 'protection', quality, source: sourceObject.name });
    sequence.push(`${target.name} gains protection from ${quality}.`);
    state.trace.push({ type: 'ContinuousEffectAdded', effect: 'protection', appliesTo: target.name, quality });
    return { sequence, primitives: [...primitives, 'protection', 'continuous'] };
  }
  if (effect.type === 'destroy') {
    if (target.card.abilities?.includes('indestructible')) {
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
    target.effects.push({ type: 'pt-modifier', power: effect.power, toughness: effect.toughness, source: sourceObject.name });
    sequence.push(`${target.name} gets ${effect.power}/${effect.toughness}.`);
    return { sequence, primitives: [...primitives, 'continuous'] };
  }
  return { unsupported: true, sequence, primitives };
}

function applyGlobalDamage({ state, sourceObject, effect }) {
  const sequence = [];
  const primitives = [...(effect.primitives || [])];
  const affected = state.battlefield.filter((object) => object.zone === 'battlefield' && isCreature(object.card));
  for (const object of affected) {
    markDamage(state, object, effect.amount, sourceObject);
    sequence.push(`${sourceObject.name} deals ${effect.amount} damage to ${object.name}.`);
  }
  const sba = runStateBasedActionsRuntime(state);
  const triggers = collectTriggeredAbilities(state);
  return { sequence, sba, triggers, primitives: [...primitives, 'lki'] };
}

function evaluateGlobalDamageTriggers({ message, cards, genericObjects }) {
  const spells = sortedSpellCards(cards, message);
  const globalSpell = spells.find(({ semantics }) => semantics.spellEffects.some((effect) => effect.type === 'damage-each'));
  if (!globalSpell) return null;

  const state = createMagicRuntimeState({ cards, genericObjects, message });
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

function evaluateTargetedStack({ message, cards, genericObjects }) {
  const spells = sortedSpellCards(cards, message);
  if (spells.length === 0) return null;
  const hasTargeted = spells.some(({ semantics }) => semantics.spellEffects.some((effect) => effect.target));
  if (!hasTargeted) return null;

  const state = createMagicRuntimeState({ cards, genericObjects, message });
  const primitives = ['stack', 'targeting', 'resolving'];
  const sequence = [];
  const stack = [];

  for (const spell of spells) {
    const sourceObject = createGameObject({ card: spell.card, controller: inferController(message, spell.card.name), owner: inferController(message, spell.card.name), zone: 'stack' });
    const effect = spell.semantics.spellEffects[0];
    const target = inferTargetForSpell({ message, source: spell.card, state, stackObjects: state.stack, effect });
    const targetWasExplicit = target || new RegExp(`\\b${escapeRegExp(spell.card.normalizedName)}\\s+(targeting|targets|target)\\b`).test(normalizeMagicText(message));
    const targetCheck = effect.target && targetWasExplicit ? validateTarget({ sourceObject, target, effect }) : { legal: true, failures: [] };
    state.trace.push({ type: 'TargetChosen', source: sourceObject.name, target: target?.name || null, legal: targetCheck.legal, failures: targetCheck.failures });
    if (!targetCheck.legal) {
      return evaluated('no', `${sourceObject.name} cannot be put on the stack with only illegal targets.`, {
        cards,
        primitives: [...primitives, ...(effect.primitives || [])],
        trace: state.trace,
        sequence: targetCheck.failures
      });
    }
    stack.push({ sourceObject, effect, target });
    state.stack.push(sourceObject);
  }

  const top = stack.at(-1);
  if (top?.effect?.target && !top.target) return null;

  while (stack.length > 0) {
    const entry = stack.pop();
    if (entry.sourceObject.zone !== 'stack') {
      state.trace.push({ type: 'ResolveSkipped', object: entry.sourceObject.name, reason: `object is in ${entry.sourceObject.zone}` });
      continue;
    }
    state.trace.push({ type: 'ResolveStart', object: entry.sourceObject.name });
    const normalized = normalizeMagicText(message);
    if (entry.target?.zone === 'battlefield'
      && (normalized.includes(`${entry.target.card.normalizedName} leaves battlefield before resolution`)
        || normalized.includes(`${entry.target.card.normalizedName} changes zone before resolution`)
        || normalized.includes('leaves battlefield before resolution')
        || normalized.includes('changes zone before resolution'))) {
      moveObject(state, entry.target, 'graveyard', 'scenario: target left before resolution');
    }
    const targetCheck = entry.effect.target ? validateTarget(entry) : { legal: true, failures: [] };
    state.trace.push({ type: 'TargetCheckOnResolution', source: entry.sourceObject.name, target: entry.target?.name || null, legal: targetCheck.legal, failures: targetCheck.failures });
    if (!targetCheck.legal) {
      sequence.push(`${entry.sourceObject.name} has no legal targets as it resolves.`);
      continue;
    }
    const ward = wardStatus({ sourceObject: entry.sourceObject, target: entry.target, message });
    if (ward === 'unknown') {
      return {
        status: 'depends',
        verdict: 'depends',
        summary: `${entry.target.name} has ward, so the runtime needs to know whether the ward cost was paid.`,
        cards,
        rules: primitiveRules([...primitives, 'targeting', 'ward']),
        mechanics: [...primitives, 'targeting', 'ward'],
        trace: state.trace,
        sequence,
        clarificationNeeded: `Did ${entry.target.name}'s ward cost get paid?`
      };
    }
    if (ward === 'unpaid') {
      moveObject(state, entry.sourceObject, 'graveyard', `${entry.target.name} ward trigger`);
      sequence.push(`${entry.target.name}'s ward trigger counters ${entry.sourceObject.name} because the ward cost was not paid.`);
      continue;
    }
    const applied = applyEffect({ state, sourceObject: entry.sourceObject, effect: entry.effect, target: entry.target, message });
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

export function evaluateMagicRulesRuntime({ message = '', cards = [] } = {}) {
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const text = normalizeMagicText(message);
  if (/\b(humility|opalescence|layer|dependency|timestamp)\b/.test(text)) {
    return unsupported('This is a complex continuous-effect layer/dependency interaction outside the current runtime coverage.', {
      cards: normalizedCards,
      primitives: ['continuous'],
      trace: [{ type: 'UnsupportedContinuousEffect', reason: 'layer/dependency coverage not complete' }]
    });
  }

  const genericObjects = extractGenericObjects(message);
  const globalDamage = evaluateGlobalDamageTriggers({ message, cards: normalizedCards, genericObjects });
  if (globalDamage) return globalDamage;
  const targetedStack = evaluateTargetedStack({ message, cards: normalizedCards, genericObjects });
  if (targetedStack) return targetedStack;
  return null;
}

function currentPowerLabel(object) {
  return object.basePower ?? object.card.power ?? 0;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
