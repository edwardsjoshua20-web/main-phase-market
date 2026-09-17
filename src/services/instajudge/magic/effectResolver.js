import { runStateBasedActions } from './gameState.js';
import { normalizeMagicText } from './magicCards.js';
import { validateAllTargets } from './targetValidator.js';

const COLOR_WORDS = Object.freeze(['white', 'blue', 'black', 'red', 'green']);

function chosenColorFromScenario(text = '', cardText = '') {
  const haystack = `${normalizeMagicText(text)} ${normalizeMagicText(cardText)}`;
  for (const color of COLOR_WORDS) {
    if (new RegExp(`\\bchoose?s?\\s+${color}\\b|\\bchosen\\s+${color}\\b|\\b${color}\\s+with\\s+gods willing\\b|\\bprotection from ${color}\\b`).test(haystack)) {
      return color;
    }
  }
  return null;
}

function damageAmount(source = {}) {
  const match = normalizeMagicText(source.oracleText).match(/\bdeals?\s+(\d+)\s+damage\b/);
  return match ? Number(match[1]) : null;
}

function isIndestructible(card = {}) {
  return card.abilities?.includes('indestructible') || /\bindestructible\b/.test(normalizeMagicText(card.oracleText));
}

function wardStatus(stackObject, legalTargets, scenario, state) {
  const text = normalizeMagicText(scenario.message);
  for (const target of legalTargets) {
    const permanent = state.getPermanent(target);
    if (!target.abilities?.includes('ward') || permanent?.controller === stackObject.controller) continue;
    if (/\bward (cost )?(was )?paid\b|\bpays? ward\b/.test(text)) return { status: 'paid', target };
    if (/\bward (cost )?(was )?(not paid|unpaid)\b|\bdoes not pay ward\b|\bdid not pay ward\b/.test(text)) return { status: 'unpaid', target };
    return { status: 'unknown', target };
  }
  return { status: 'none', target: null };
}

export function resolveStackObject(stackObject, state, scenario) {
  const trace = [];
  const targetCheck = validateAllTargets(stackObject, state, 'resolution');
  trace.push({
    type: 'target-check-resolution',
    object: stackObject.card.name,
    checks: targetCheck.checks
  });

  if (targetCheck.allIllegal) {
    return {
      resolved: false,
      allTargetsIllegal: true,
      summary: `${stackObject.card.name} has no legal targets as it resolves.`,
      trace,
      stateBasedActions: []
    };
  }

  const text = normalizeMagicText(stackObject.card.oracleText);
  const legalTargets = targetCheck.legalTargets;
  const stateBasedActions = [];
  const summaries = [];
  const ward = wardStatus(stackObject, legalTargets, scenario, state);

  if (ward.status === 'unknown') {
    return {
      resolved: false,
      needsClarification: `Did ${ward.target.name}'s ward cost get paid?`,
      summary: `${ward.target.name} has ward, so the engine needs to know whether the ward cost was paid.`,
      trace,
      stateBasedActions
    };
  }

  if (ward.status === 'unpaid') {
    state.moveToZone(stackObject.card, 'graveyard', `${ward.target.name} ward trigger`);
    return {
      resolved: true,
      wardCountered: true,
      summary: `${ward.target.name}'s ward trigger counters ${stackObject.card.name} because the ward cost was not paid.`,
      trace,
      stateBasedActions
    };
  }

  if (/gains? protection from/.test(text)) {
    const quality = chosenColorFromScenario(scenario.message, stackObject.card.oracleText);
    if (!quality) {
      return {
        resolved: false,
        needsClarification: 'Which color was chosen for the protection effect?',
        summary: `${stackObject.card.name} needs a chosen color before the protection effect can be applied.`,
        trace,
        stateBasedActions
      };
    }
    for (const target of legalTargets) {
      state.addEffect({
        type: 'protection',
        appliesTo: target.name,
        quality,
        duration: 'until-end-of-turn',
        source: stackObject.card.name
      });
      summaries.push(`${target.name} gains protection from ${quality}.`);
    }
  } else if (text.includes('destroy target')) {
    for (const target of legalTargets) {
      if (isIndestructible(target)) {
        summaries.push(`${target.name} is indestructible, so the destroy effect does not destroy it.`);
      } else {
        state.moveToZone(target, 'graveyard', `${stackObject.card.name} destroy effect`);
        summaries.push(`${stackObject.card.name} destroys ${target.name}.`);
      }
    }
  } else if (text.includes('counter target spell')) {
    for (const target of legalTargets) {
      state.moveToZone(target, 'graveyard', `${stackObject.card.name} counter effect`);
      summaries.push(`${stackObject.card.name} counters ${target.name}.`);
    }
  } else if (text.includes('deals') && text.includes('damage')) {
    const amount = damageAmount(stackObject.card);
    if (amount == null) {
      return {
        resolved: false,
        needsClarification: 'The damage amount is not available from the resolved Oracle text.',
        summary: `${stackObject.card.name} has a damage effect, but the engine cannot determine the amount.`,
        trace,
        stateBasedActions
      };
    }
    for (const target of legalTargets) {
      state.addDamage(target, amount);
      summaries.push(`${stackObject.card.name} deals ${amount} damage to ${target.name}.`);
    }
  } else if (text.includes('sacrifice')) {
    return {
      resolved: false,
      needsClarification: 'Sacrifice effects require knowing which player or object is instructed to sacrifice.',
      summary: `${stackObject.card.name} involves sacrifice, which needs more state for this V1 engine.`,
      trace,
      stateBasedActions
    };
  } else if (text.includes('exile target')) {
    for (const target of legalTargets) {
      state.moveToZone(target, 'exile', `${stackObject.card.name} exile effect`);
      summaries.push(`${stackObject.card.name} exiles ${target.name}.`);
    }
  } else {
    return {
      resolved: false,
      unsupported: true,
      summary: `${stackObject.card.name}'s effect is outside the current deterministic Magic engine coverage.`,
      trace,
      stateBasedActions
    };
  }

  stateBasedActions.push(...runStateBasedActions(state));
  return {
    resolved: true,
    allTargetsIllegal: false,
    summary: summaries.join(' '),
    trace,
    stateBasedActions
  };
}
