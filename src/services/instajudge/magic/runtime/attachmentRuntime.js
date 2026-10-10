import { normalizeMagicText } from '../magicCards.js';
import { attachObject, deriveCharacteristics, detachObject } from './continuousEffects.js';
import { protectionFailures, validateTarget } from './targetingRuntime.js';

export const ATTACHMENT_TYPES = Object.freeze({
  AURA: 'Aura',
  EQUIPMENT: 'Equipment',
  FORTIFICATION: 'Fortification',
  GENERIC: 'Attachment'
});

export function attachmentSpecFor(source) {
  return source?.attachmentSpec || source?.semantics?.attachmentSpec || null;
}

export function attachmentTypeFor(source) {
  return attachmentSpecFor(source)?.attachmentType || null;
}

export function canAttach(source, target, state, { asTarget = false, effect = null } = {}) {
  const spec = attachmentSpecFor(source);
  const failures = [];
  if (!spec) return { legal: false, status: 'unsupported', failures: ['The source has no canonical attachment specification.'], spec: null };
  if (!spec.executable) return { legal: false, status: 'unsupported', failures: [spec.reason || 'The attachment restriction is not executable.'], spec };
  if (!source || !target) failures.push('Attachment source and destination are required.');
  if (source?.id && source.id === target?.id) failures.push('An object cannot be attached to itself.');
  if (target?.zone !== 'battlefield') failures.push(`${target?.name || 'The destination'} is not on the battlefield.`);
  if (source && !['battlefield', 'stack'].includes(source.zone)) failures.push(`${source.name} is not in a zone from which it can become attached.`);
  if (source && target) {
    const sourceCharacteristics = deriveCharacteristics(state, source);
    const targetCharacteristics = deriveCharacteristics(state, target);
    const requiredTypes = spec.restriction?.requiredTypes || [];
    if (requiredTypes.some((type) => !targetCharacteristics.types.includes(normalizeMagicText(type)))) {
      failures.push(`${target.name} does not satisfy ${spec.restriction.text || `the required ${requiredTypes.join(' or ')} type`}.`);
    }
    if (spec.restriction?.controller === 'source-controller' && targetCharacteristics.controller !== sourceCharacteristics.controller) {
      failures.push(`${target.name} is not controlled by ${sourceCharacteristics.controller}.`);
    }
    if (spec.restriction?.controller === 'opponent-of-source-controller' && targetCharacteristics.controller === sourceCharacteristics.controller) {
      failures.push(`${target.name} is not controlled by an opponent.`);
    }
    failures.push(...protectionFailures(state, source, target));
  }
  if (asTarget && source && target) {
    const targetResult = validateTarget({ sourceObject: source, target, effect: effect || { target: spec.targetRequirement }, state });
    for (const failure of targetResult.failures) if (!failures.includes(failure)) failures.push(failure);
  }
  return { legal: failures.length === 0, status: failures.length ? 'illegal' : 'legal', failures, spec };
}

export function attachLegally(state, source, target, options = {}) {
  const legality = canAttach(source, target, state, options);
  if (!legality.legal) return { status: legality.status, attachment: source, target, legality };
  return { ...attachObject(state, source, target), legality };
}

export function detachForZoneChange(state, object) {
  if (!object) return [];
  const detached = [];
  if (object.attachedTo) {
    detachObject(state, object);
    detached.push(object.id);
  }
  for (const attachmentId of [...(object.attachments || [])]) {
    const attachment = state.objects.get(attachmentId);
    if (!attachment) continue;
    detachObject(state, attachment);
    detached.push(attachment.id);
  }
  return detached;
}

export function enterAuraAttached(state, { aura, target = null } = {}) {
  const spec = attachmentSpecFor(aura);
  if (spec?.attachmentType !== ATTACHMENT_TYPES.AURA) return { status: 'unsupported', reason: 'The entering permanent is not a supported Aura.' };
  if (!target) return { status: 'depends', reason: 'An Aura entering without being cast needs a legal object to enchant.', clarificationNeeded: 'What will the Aura enchant?' };
  if (aura.zone !== 'battlefield') return { status: 'unsupported', reason: 'The Aura must be entering the battlefield before its attachment choice is applied.' };
  const legality = canAttach(aura, target, state);
  if (!legality.legal) return { status: legality.status, reason: legality.failures.join(' '), legality };
  return attachLegally(state, aura, target);
}
