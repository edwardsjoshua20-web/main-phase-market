import { hasProtectionFrom } from './gameState.js';
import { isCreature, normalizeMagicText } from './magicCards.js';

export function describeSourceQualities(source = {}) {
  const qualities = new Set(source.colors || []);
  const typeText = normalizeMagicText(source.typeLine);
  for (const type of ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'planeswalker', 'battle', 'land']) {
    if (typeText.includes(type)) qualities.add(type);
  }
  return [...qualities];
}

function requiresCreatureTarget(source = {}) {
  return /\btarget creature\b/.test(normalizeMagicText(source.oracleText));
}

function requiresControlledCreatureTarget(source = {}) {
  return /\btarget creature you control\b/.test(normalizeMagicText(source.oracleText));
}

function targetRestrictionDescription(source = {}) {
  const text = normalizeMagicText(source.oracleText);
  if (text.includes('target creature you control')) return 'target creature you control';
  if (text.includes('target creature')) return 'target creature';
  if (text.includes('target spell')) return 'target spell';
  if (text.includes('any target')) return 'any target';
  if (text.includes('target permanent')) return 'target permanent';
  if (text.includes('target player')) return 'target player';
  return 'target';
}

export function validateTarget({ source, target, state, sourceController = 'player', timing = 'resolution' }) {
  const failures = [];
  const restriction = targetRestrictionDescription(source);
  const targetPermanent = state.getPermanent(target);

  if (requiresCreatureTarget(source) && !isCreature(target)) {
    failures.push(`${target.name} is not a creature.`);
  }

  if (requiresControlledCreatureTarget(source)) {
    if (!targetPermanent) failures.push(`${target.name} is not known to be on the battlefield.`);
    if (targetPermanent && targetPermanent.controller !== sourceController) {
      failures.push(`${target.name} is not controlled by ${sourceController}.`);
    }
  }

  if (targetPermanent && targetPermanent.zone !== 'battlefield' && !/\btarget spell\b/.test(normalizeMagicText(source.oracleText))) {
    failures.push(`${target.name} is no longer in the expected zone.`);
  }

  if (target.abilities?.includes('shroud')) {
    failures.push(`${target.name} has shroud.`);
  }

  if (target.abilities?.includes('hexproof') && sourceController !== targetPermanent?.controller) {
    failures.push(`${target.name} has hexproof from opponents.`);
  }

  const sourceWithQualities = { ...source, qualities: describeSourceQualities(source) };
  if (hasProtectionFrom(target, sourceWithQualities, state)) {
    const protection = state.effects
      .filter((effect) => effect.type === 'protection' && normalizeMagicText(effect.appliesTo) === normalizeMagicText(target.name))
      .map((effect) => effect.quality)
      .find((quality) => sourceWithQualities.qualities.includes(quality));
    failures.push(`${target.name} has protection from ${protection}.`);
  }

  return {
    legal: failures.length === 0,
    restriction,
    timing,
    failures
  };
}

export function validateAllTargets(stackObject, state, timing) {
  const checks = stackObject.targets.map((target) =>
    validateTarget({
      source: stackObject.card,
      target,
      state,
      sourceController: stackObject.controller,
      timing
    })
  );
  return {
    checks,
    legalTargets: stackObject.targets.filter((_, index) => checks[index].legal),
    illegalTargets: stackObject.targets.filter((_, index) => !checks[index].legal),
    allIllegal: checks.length > 0 && checks.every((check) => !check.legal)
  };
}
