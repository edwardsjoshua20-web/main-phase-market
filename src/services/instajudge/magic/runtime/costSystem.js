import { emitEvent, moveObjectWithResult, proposeRuntimeEvent } from './runtimeState.js';
import { deriveCharacteristics } from './continuousEffects.js';

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

export const COST_MODIFIER_KINDS = Object.freeze({
  INCREASE: 'increase',
  REDUCTION: 'reduction'
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

export function summarizeManaCosts(costs = []) {
  const total = createManaCost('');
  const visit = (rawCost) => {
    const cost = normalizeCost(rawCost);
    if (!cost) return;
    if (cost.type === COST_TYPES.ADDITIONAL) {
      cost.costs.forEach(visit);
      return;
    }
    if (cost.type !== COST_TYPES.MANA) return;
    total.supported = total.supported && cost.supported;
    total.symbols.push(...cost.symbols);
    total.generic += cost.generic;
    total.white += cost.white;
    total.blue += cost.blue;
    total.black += cost.black;
    total.red += cost.red;
    total.green += cost.green;
    total.colorless += cost.colorless;
  };
  costs.forEach(visit);
  total.converted = total.generic + total.white + total.blue + total.black + total.red + total.green + total.colorless;
  return total;
}

function manaComponents(cost) {
  const normalized = normalizeCost(cost);
  if (!normalized || normalized.type !== COST_TYPES.MANA) return null;
  return {
    generic: normalized.generic || 0,
    white: normalized.white || 0,
    blue: normalized.blue || 0,
    black: normalized.black || 0,
    red: normalized.red || 0,
    green: normalized.green || 0,
    colorless: normalized.colorless || 0
  };
}

function manaFromComponents(components = {}) {
  const symbols = [];
  if (components.generic > 0) symbols.push(`{${components.generic}}`);
  for (const [symbol, field] of Object.entries(COLOR_FIELDS)) {
    for (let index = 0; index < (components[field] || 0); index += 1) symbols.push(`{${symbol}}`);
  }
  const cost = createManaCost(symbols);
  cost.converted = cost.generic + cost.white + cost.blue + cost.black + cost.red + cost.green + cost.colorless;
  return cost;
}

function flattenCosts(costs = []) {
  return costs.map(normalizeCost).filter(Boolean).flatMap((cost) => cost.type === COST_TYPES.ADDITIONAL ? flattenCosts(cost.costs) : [cost]);
}

function spellTypes(card = {}) {
  return String(card.typeLine || card.type_line || '').split(/\s+[—-]\s+/)[0].toLowerCase().split(/\s+/).filter(Boolean);
}

function modifierApplies({ modifier, source, card, controller, actionType }) {
  if (!modifier || modifier.actionType !== actionType) return false;
  const relation = modifier.appliesTo?.casterRelation || 'any';
  if (relation === 'source-controller' && source.controller !== controller) return false;
  if (relation === 'opponent-of-source-controller' && source.controller === controller) return false;
  const types = spellTypes(card);
  const requiredTypes = modifier.appliesTo?.requiredTypes || [];
  const excludedTypes = modifier.appliesTo?.excludedTypes || [];
  return requiredTypes.every((type) => types.includes(type)) && excludedTypes.every((type) => !types.includes(type));
}

export function collectApplicableCostModifiers(state, { card, controller, actionType = 'Cast' } = {}) {
  const modifiers = [];
  for (const source of state?.battlefield || []) {
    if (source.zone !== 'battlefield') continue;
    for (const modifier of source.semantics?.costModifiers || []) {
      if (!modifierApplies({ modifier, source, card, controller, actionType })) continue;
      modifiers.push({ ...modifier, sourceObjectId: source.id, sourceName: source.name, sourceController: source.controller });
    }
  }
  return modifiers;
}

export function createCostPlan({
  state,
  card,
  controller,
  actionType = 'Cast',
  alternativeCost = null,
  additionalCosts = [],
  optionalAdditionalCosts = [],
  commanderTax = null,
  minimumConstraints = []
} = {}) {
  const printedManaCost = createManaCost(card?.manaCost || card?.mana_cost || '');
  const selectedAlternativeCost = alternativeCost ? normalizeCost(alternativeCost) : null;
  const baseManaCost = selectedAlternativeCost || printedManaCost;
  const mandatory = flattenCosts(additionalCosts);
  const optional = flattenCosts(optionalAdditionalCosts);
  const commanderTaxCost = commanderTax?.genericMana > 0 ? createManaCost(`{${commanderTax.genericMana}}`) : createManaCost('');
  const additionalManaCosts = [...mandatory, ...optional].filter((cost) => cost.type === COST_TYPES.MANA);
  const nonmanaCosts = [...mandatory, ...optional].filter((cost) => cost.type !== COST_TYPES.MANA);
  const startingManaCost = summarizeManaCosts([baseManaCost, ...additionalManaCosts, commanderTaxCost]);
  const applicableModifiers = collectApplicableCostModifiers(state, { card, controller, actionType });
  const unsupportedModifiers = applicableModifiers.filter((modifier) => modifier.executable === false
    || !Object.values(COST_MODIFIER_KINDS).includes(modifier.kind)
    || !modifier.amount?.supported
    || modifier.amount?.generic == null
    || Object.values(COLOR_FIELDS).some((field) => (modifier.amount?.[field] || 0) > 0));
  const increases = applicableModifiers.filter((modifier) => modifier.kind === COST_MODIFIER_KINDS.INCREASE && !unsupportedModifiers.includes(modifier));
  const reductions = applicableModifiers.filter((modifier) => modifier.kind === COST_MODIFIER_KINDS.REDUCTION && !unsupportedModifiers.includes(modifier));
  const finalComponents = { ...manaComponents(startingManaCost) };
  for (const modifier of increases) finalComponents.generic += modifier.amount.generic;
  for (const modifier of reductions) finalComponents.generic = Math.max(0, finalComponents.generic - modifier.amount.generic);
  for (const constraint of minimumConstraints) {
    if (Number.isFinite(constraint?.genericMinimum)) finalComponents.generic = Math.max(finalComponents.generic, constraint.genericMinimum);
  }
  const finalManaCost = manaFromComponents(finalComponents);
  const supported = printedManaCost.supported && baseManaCost?.type === COST_TYPES.MANA && baseManaCost.supported && startingManaCost.supported && unsupportedModifiers.length === 0;
  return {
    type: 'CostPlan',
    version: 1,
    status: supported ? 'verified' : 'unsupported',
    frozen: true,
    actionType,
    controller,
    cardId: card?.id || null,
    cardName: card?.name || null,
    printedManaCost,
    alternativeCost: selectedAlternativeCost,
    baseManaCost,
    mandatoryAdditionalCosts: mandatory,
    optionalAdditionalCosts: optional,
    commanderTax: commanderTax ? { ...commanderTax, cost: commanderTaxCost } : null,
    startingManaCost,
    increases,
    reductions,
    minimumConstraints,
    finalManaCost,
    nonmanaCosts,
    paymentCosts: [finalManaCost, ...nonmanaCosts],
    unsupportedModifiers,
    provenance: [
      { stage: selectedAlternativeCost ? 'alternative' : 'printed', sourceName: card?.name || null, cost: baseManaCost },
      ...mandatory.map((cost) => ({ stage: 'mandatory-additional', sourceName: card?.name || null, cost })),
      ...optional.map((cost) => ({ stage: 'optional-additional', sourceName: card?.name || null, cost })),
      ...(commanderTax?.genericMana > 0 ? [{ stage: 'commander-tax', sourceName: card?.name || null, cost: commanderTaxCost }] : []),
      ...increases.map((modifier) => ({ stage: 'increase', sourceName: modifier.sourceName, sourceObjectId: modifier.sourceObjectId, cost: modifier.amount, text: modifier.text })),
      ...reductions.map((modifier) => ({ stage: 'reduction', sourceName: modifier.sourceName, sourceObjectId: modifier.sourceObjectId, cost: modifier.amount, text: modifier.text })),
      ...minimumConstraints.map((constraint) => ({ stage: 'minimum', ...constraint }))
    ]
  };
}

export function checkManaAvailability(requirement, availableMana) {
  if (availableMana == null) return { supported: true, known: false, payable: null };
  if (!requirement?.supported) return { supported: false, known: true, payable: false, reason: 'The mana requirement contains an unsupported symbol.' };
  if (Number.isFinite(availableMana)) {
    const colored = requirement.white + requirement.blue + requirement.black + requirement.red + requirement.green + requirement.colorless;
    if (colored > 0) return { supported: false, known: true, payable: false, reason: 'An undifferentiated mana total cannot prove colored or colorless payment.' };
    return { supported: true, known: true, payable: availableMana >= requirement.generic, available: availableMana, required: requirement.generic };
  }
  const pool = {
    generic: Number(availableMana.generic) || 0,
    white: Number(availableMana.white) || 0,
    blue: Number(availableMana.blue) || 0,
    black: Number(availableMana.black) || 0,
    red: Number(availableMana.red) || 0,
    green: Number(availableMana.green) || 0,
    colorless: Number(availableMana.colorless) || 0
  };
  const coloredPayable = Object.values(COLOR_FIELDS).every((field) => pool[field] >= requirement[field]);
  const availableTotal = Object.values(pool).reduce((sum, amount) => sum + amount, 0);
  return {
    supported: true,
    known: true,
    payable: coloredPayable && availableTotal >= requirement.converted,
    available: pool,
    required: requirement
  };
}

export function createTriggeredPaymentCost(cost, context = {}) {
  return { type: COST_TYPES.TRIGGERED_PAYMENT, cost: normalizeCost(cost), ...context };
}

export function normalizeCost(cost) {
  if (!cost) return null;
  if (cost.type && Object.values(COST_TYPES).includes(cost.type)) return cost;
  if (cost.costType === 'mana' || cost.symbols) return createManaCost(cost.symbols || '');
  if (cost.costType === 'tap') return createTapCost(cost.sourceObjectId || null);
  if (cost.costType === 'life') return createLifeCost(cost.amount?.value ?? cost.amount);
  if (cost.costType === 'sacrifice') return createSacrificeCost({ objectId: cost.objectId || null, count: cost.count || 1, filter: cost.filter || cost.subject || null });
  if (cost.costType === 'discard') return createDiscardCost({ cardIds: cost.cardIds || [], count: cost.count || 1, filter: cost.filter || cost.subject || null });
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
    if (candidates.length < cost.count || candidates.some((object) => deriveCharacteristics(state, object).controller !== playerId || object.zone !== 'battlefield')) {
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
