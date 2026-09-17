import { emitEvent, moveObjectWithResult, proposeRuntimeEvent } from './runtimeState.js';

export const COST_TYPES = Object.freeze({
  MANA: 'ManaCost',
  LIFE: 'LifeCost',
  TAP: 'TapCost',
  SACRIFICE: 'SacrificeCost',
  DISCARD: 'DiscardCost',
  ADDITIONAL: 'AdditionalCost',
  TRIGGERED_PAYMENT: 'TriggeredPaymentCost'
});

export const PAYMENT_STATUS = Object.freeze({
  PAID: 'paid',
  UNPAID: 'unpaid',
  CANNOT_PAY: 'cannot-pay',
  UNSPECIFIED: 'unspecified'
});

const COLOR_FIELDS = Object.freeze({ W: 'white', U: 'blue', B: 'black', R: 'red', G: 'green', C: 'colorless' });

export function createManaCost(value = '') {
  const symbols = Array.isArray(value) ? value : String(value).match(/\{[^}]+\}/g) || [];
  const cost = {
    type: COST_TYPES.MANA,
    symbols,
    generic: 0,
    white: 0,
    blue: 0,
    black: 0,
    red: 0,
    green: 0,
    colorless: 0,
    supported: true
  };
  for (const wrapped of symbols) {
    const symbol = String(wrapped).replace(/[{}]/g, '').toUpperCase();
    if (/^\d+$/.test(symbol)) cost.generic += Number(symbol);
    else if (COLOR_FIELDS[symbol]) cost[COLOR_FIELDS[symbol]] += 1;
    else cost.supported = false;
  }
  return cost;
}

export function createLifeCost(amount) {
  return { type: COST_TYPES.LIFE, amount: Number(amount) || 0 };
}

export function createTapCost(sourceObjectId = null) {
  return { type: COST_TYPES.TAP, sourceObjectId };
}

export function createSacrificeCost({ objectId = null, count = 1, filter = null } = {}) {
  return { type: COST_TYPES.SACRIFICE, objectId, count, filter };
}

export function createDiscardCost({ cardIds = [], count = 1, filter = null } = {}) {
  return { type: COST_TYPES.DISCARD, cardIds, count, filter };
}

export function createAdditionalCost(costs = []) {
  return { type: COST_TYPES.ADDITIONAL, costs: costs.map(normalizeCost) };
}

export function createTriggeredPaymentCost(cost, context = {}) {
  return { type: COST_TYPES.TRIGGERED_PAYMENT, cost: normalizeCost(cost), ...context };
}

export function normalizeCost(cost) {
  if (!cost) return null;
  if (cost.type && Object.values(COST_TYPES).includes(cost.type)) return cost;
  if (cost.costType === 'mana' || cost.symbols) return createManaCost(cost.symbols || '');
  return cost;
}

export function normalizePaymentStatus(value) {
  if (Object.values(PAYMENT_STATUS).includes(value)) return value;
  if (value === true) return PAYMENT_STATUS.PAID;
  if (value === false) return PAYMENT_STATUS.UNPAID;
  return PAYMENT_STATUS.UNSPECIFIED;
}

function selectedObjects(state, ids = []) {
  return ids.map((id) => state.objects.get(id)).filter(Boolean);
}

export function payCost({ state, playerId, cost: rawCost, choice = PAYMENT_STATUS.UNSPECIFIED, sourceObject = null } = {}) {
  const cost = normalizeCost(rawCost);
  const status = normalizePaymentStatus(choice?.status ?? choice?.paid ?? choice);
  if (!cost) return { supported: false, status: PAYMENT_STATUS.CANNOT_PAY, reason: 'No cost was supplied.' };
  if (cost.type === COST_TYPES.TRIGGERED_PAYMENT) {
    return payCost({ state, playerId, cost: cost.cost, choice: status, sourceObject });
  }
  if (status !== PAYMENT_STATUS.PAID) return { supported: true, status, paid: false, cost };
  if (cost.type === COST_TYPES.MANA) {
    if (!cost.supported) return { supported: false, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost, reason: 'The mana cost contains an unsupported symbol.' };
    return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost };
  }
  const player = state?.players?.[playerId];
  if (!player) return { supported: false, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost, reason: 'The paying player is unavailable.' };
  if (cost.type === COST_TYPES.LIFE) {
    if (player.life < cost.amount) return { supported: true, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost };
    const pipeline = proposeRuntimeEvent(state, 'LifeChange', { player: playerId, amount: cost.amount, metadata: { direction: 'lose', asCost: true } });
    if (pipeline.status !== 'ready') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline };
    player.life -= cost.amount;
    emitEvent(state, 'LifeLost', { player: playerId, amount: cost.amount, metadata: { asCost: true } });
    return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost };
  }
  if (cost.type === COST_TYPES.TAP) {
    const object = state.objects.get(cost.sourceObjectId || sourceObject?.id);
    if (!object || object.tapped || object.zone !== 'battlefield') return { supported: true, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost };
    const pipeline = proposeRuntimeEvent(state, 'TapChange', { object, affected: object, metadata: { tapped: true, asCost: true } });
    if (pipeline.status !== 'ready') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline };
    object.tapped = true;
    emitEvent(state, 'PermanentTapped', { object, metadata: { asCost: true } });
    return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost };
  }
  if (cost.type === COST_TYPES.SACRIFICE) {
    const candidates = cost.objectId ? selectedObjects(state, [cost.objectId]) : selectedObjects(state, choice?.objectIds || []);
    if (!cost.objectId && !choice?.objectIds?.length) return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost, stateMutation: 'declared-payment' };
    if (candidates.length < cost.count || candidates.some((object) => object.controller !== playerId || object.zone !== 'battlefield')) {
      return { supported: true, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost };
    }
    const selected = candidates.slice(0, cost.count);
    for (const object of selected) {
      const pipeline = proposeRuntimeEvent(state, 'Sacrifice', { object, affected: object, player: playerId, from: 'battlefield', to: 'graveyard', metadata: { asCost: true } });
      if (pipeline.status !== 'ready') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline };
      const moved = moveObjectWithResult(state, object, 'graveyard', 'sacrifice cost');
      if (moved.status !== 'committed') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline: moved };
      emitEvent(state, 'PermanentSacrificed', { object, player: playerId, from: 'battlefield', to: moved.to, metadata: { asCost: true } });
    }
    return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost, selectedObjects: selected };
  }
  if (cost.type === COST_TYPES.DISCARD) {
    const ids = cost.cardIds.length ? cost.cardIds : choice?.cardIds || [];
    if (ids.length === 0) return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost, stateMutation: 'declared-payment' };
    const cards = selectedObjects(state, ids);
    if (cards.length < cost.count || cards.some((object) => object.owner !== playerId || object.zone !== 'hand')) {
      return { supported: true, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost };
    }
    const selected = cards.slice(0, cost.count);
    const pipeline = proposeRuntimeEvent(state, 'Discard', { player: playerId, amount: selected.length, metadata: { asCost: true, cardIds: selected.map((object) => object.id) } });
    if (pipeline.status !== 'ready') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline };
    for (const object of selected) {
      const moved = moveObjectWithResult(state, object, 'graveyard', 'discard cost');
      if (moved.status !== 'committed') return { supported: true, status: PAYMENT_STATUS.UNSPECIFIED, paid: false, cost, pipeline: moved };
      emitEvent(state, 'CardDiscarded', { object, player: playerId, metadata: { asCost: true } });
    }
    return { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost, selectedObjects: selected };
  }
  if (cost.type === COST_TYPES.ADDITIONAL) {
    const results = cost.costs.map((entry) => payCost({ state, playerId, cost: entry, choice, sourceObject }));
    const failed = results.find((result) => !result.paid);
    return failed || { supported: true, status: PAYMENT_STATUS.PAID, paid: true, cost, results };
  }
  return { supported: false, status: PAYMENT_STATUS.CANNOT_PAY, paid: false, cost, reason: `Unsupported cost type ${cost.type}.` };
}
