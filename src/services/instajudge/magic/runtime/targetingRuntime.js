import { normalizeMagicText, sourceHasQuality } from '../magicCards.js';
import { deriveCharacteristics, derivedHasQuality } from './continuousEffects.js';

export function protectionFailures(state, sourceObject, target) {
  if (!sourceObject || !target) return [];
  const targetCharacteristics = deriveCharacteristics(state || target.runtimeState, target);
  return targetCharacteristics.abilities
    .filter((ability) => normalizeMagicText(ability).startsWith('protection from '))
    .flatMap((ability) => {
      const quality = normalizeMagicText(ability).replace('protection from ', '').replace(/s$/, '');
      const blocked = state || sourceObject.runtimeState
        ? derivedHasQuality(state || sourceObject.runtimeState, sourceObject, quality)
        : sourceHasQuality(sourceObject.card, quality);
      return blocked ? [`${target.name} has protection from ${quality}.`] : [];
    });
}

export function validateTarget({ sourceObject, target, effect, state = target?.runtimeState || sourceObject?.runtimeState } = {}) {
  const failures = [];
  if (!target) failures.push('No target was identified.');
  if (effect?.target?.kind === 'spell') {
    if (!target) return { legal: false, failures };
    if (target.zone !== 'stack') failures.push(`${target.name} is not on the stack.`);
    const targetTypes = String(target.card?.typeLine || '').toLowerCase().split(/\s+|—|-/).filter(Boolean);
    if (effect.target?.excludedTypes?.some((type) => targetTypes.includes(type))) failures.push(`${target.name} is a ${effect.target.excludedTypes.join(', ')} spell.`);
    return { legal: failures.length === 0, failures };
  }
  if (!target || target.zone !== 'battlefield') failures.push(`${target?.name || 'Target'} is not on the battlefield.`);
  if (!target) return { legal: false, failures };
  const targetCharacteristics = deriveCharacteristics(state, target);
  const sourceCharacteristics = state ? deriveCharacteristics(state, sourceObject) : { controller: sourceObject.controller };
  if (effect?.target?.requiredTypes?.some((type) => !targetCharacteristics.types.includes(type))) {
    failures.push(`${target.name} is not a ${effect.target.requiredTypes.join(' or ')}.`);
  }
  if (effect?.target?.excludedColors?.some((color) => targetCharacteristics.colors.includes(color))) failures.push(`${target.name} is ${effect.target.excludedColors.join(', ')}.`);
  if (effect?.target?.controller === 'self' && targetCharacteristics.controller !== sourceCharacteristics.controller) failures.push(`${target.name} is not controlled by ${sourceCharacteristics.controller}.`);
  if (effect?.target?.controller === 'opponent' && targetCharacteristics.controller === sourceCharacteristics.controller) failures.push(`${target.name} is not controlled by an opponent.`);
  if (targetCharacteristics.abilities.some((ability) => normalizeMagicText(ability) === 'shroud')) failures.push(`${target.name} has shroud.`);
  if (targetCharacteristics.abilities.some((ability) => normalizeMagicText(ability) === 'hexproof') && targetCharacteristics.controller !== sourceCharacteristics.controller) failures.push(`${target.name} has hexproof.`);
  failures.push(...protectionFailures(state, sourceObject, target));
  return { legal: failures.length === 0, failures };
}
