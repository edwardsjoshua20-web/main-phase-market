import { opponentsOf, playersStillInGame } from './multiplayerRuntime.js';

export const VALUE_EXPRESSION_KINDS = Object.freeze({
  FIXED: 'Fixed',
  CHOSEN_X: 'ChosenX',
  COUNT: 'Count',
  SUM: 'Sum',
  ACTUAL_EVENT_AMOUNT: 'ActualEventAmount',
  ACTUAL_EVENTS: 'ActualEvents',
  REFERENCE_THIS_WAY: 'ReferenceThisWay'
});

export const PLAYER_SET_KINDS = Object.freeze({
  EACH_OPPONENT: 'EachOpponent',
  EACH_OTHER_PLAYER: 'EachOtherPlayer',
  EACH_PLAYER: 'EachPlayer'
});

export function createResolutionContext(state, { source = null, controller = 'player', chosenValues = {}, resolutionId = null } = {}) {
  const id = resolutionId || `resolution-${state.nextResolutionId++}`;
  const existing = state.resolutions.get(id);
  if (existing) return existing;
  const context = {
    id, source, sourceId: source?.id || null, controller,
    chosenValues: { ...chosenValues }, eventIds: [], operations: new Map(),
    nextOperationId: 1, status: 'resolving'
  };
  state.resolutions.set(id, context);
  return context;
}

export function beginResolutionOperation(resolution, effect = {}, suppliedOperationId = null) {
  const id = suppliedOperationId || effect.operationId || `${resolution.id}:operation-${resolution.nextOperationId++}`;
  if (!resolution.operations.has(id)) resolution.operations.set(id, { id, effectType: effect.type || null, eventIds: [], status: 'resolving' });
  return resolution.operations.get(id);
}

export function eventsForResolution(state, resolution, { operationId = null, eventType = null } = {}) {
  if (!resolution) return [];
  const eventIds = operationId ? resolution.operations.get(operationId)?.eventIds || [] : resolution.eventIds;
  const selected = new Set(eventIds);
  return state.events.filter((event) => selected.has(event.id) && (!eventType || event.type === eventType));
}

export function resolvePlayerSet(state, playerSet, controller) {
  const kind = typeof playerSet === 'string' ? playerSet : playerSet?.kind;
  if (kind === PLAYER_SET_KINDS.EACH_OPPONENT || kind === 'each opponent') return opponentsOf(state, controller);
  if (kind === PLAYER_SET_KINDS.EACH_OTHER_PLAYER || kind === 'each other player') return playersStillInGame(state).filter((playerId) => playerId !== controller);
  if (kind === PLAYER_SET_KINDS.EACH_PLAYER || kind === 'each player') return playersStillInGame(state);
  return null;
}

function eventAmount(event) {
  if (Number.isFinite(event?.metadata?.actualAmount)) return event.metadata.actualAmount;
  return Number.isFinite(event?.amount) ? event.amount : 0;
}

export function evaluateValueExpression(expression, { state, resolution, operationId = null } = {}) {
  if (Number.isFinite(expression)) return { status: 'resolved', value: expression };
  if (!expression) return { status: 'unverified', reason: 'No value expression was supplied.' };
  const kind = expression.kind;
  if (kind === 'fixed' || kind === VALUE_EXPRESSION_KINDS.FIXED) return { status: 'resolved', value: expression.value };
  if (kind === 'variable' || kind === VALUE_EXPRESSION_KINDS.CHOSEN_X) {
    const name = expression.name || 'X';
    const value = resolution?.chosenValues?.[name];
    return Number.isFinite(value) ? { status: 'resolved', value } : { status: 'depends', reason: `The chosen value for ${name} is required.` };
  }
  if (kind === VALUE_EXPRESSION_KINDS.SUM) {
    const values = [];
    for (const item of expression.values || []) {
      const result = evaluateValueExpression(item, { state, resolution, operationId });
      if (result.status !== 'resolved') return result;
      values.push(result.value);
    }
    return { status: 'resolved', value: values.reduce((sum, value) => sum + value, 0) };
  }
  if (kind === VALUE_EXPRESSION_KINDS.ACTUAL_EVENTS || kind === VALUE_EXPRESSION_KINDS.REFERENCE_THIS_WAY) {
    const linkedOperationId = expression.operationId || expression.referenceOperationId || operationId;
    if (!linkedOperationId) return { status: 'unverified', reason: 'The referenced operation is not identified.' };
    const events = eventsForResolution(state, resolution, { operationId: linkedOperationId, eventType: expression.eventType || null });
    const aggregate = expression.aggregate || (kind === VALUE_EXPRESSION_KINDS.ACTUAL_EVENTS ? 'events' : 'sum');
    if (aggregate === 'events') return { status: 'resolved', value: events };
    if (aggregate === 'count') return { status: 'resolved', value: events.length };
    return { status: 'resolved', value: events.reduce((sum, event) => sum + eventAmount(event), 0) };
  }
  if (kind === VALUE_EXPRESSION_KINDS.ACTUAL_EVENT_AMOUNT) {
    const events = eventsForResolution(state, resolution, { operationId: expression.operationId || operationId, eventType: expression.eventType || null });
    return events.length === 1 ? { status: 'resolved', value: eventAmount(events[0]) } : { status: 'unverified', reason: 'ActualEventAmount requires exactly one committed event.' };
  }
  if (kind === VALUE_EXPRESSION_KINDS.COUNT) {
    const playerSet = resolvePlayerSet(state, expression.of, resolution?.controller);
    if (playerSet) return { status: 'resolved', value: playerSet.length };
    if (expression.of?.kind === 'ObjectSet') {
      const objects = state.battlefield.filter((object) => object.zone === 'battlefield'
        && (!expression.of.controller || object.controller === expression.of.controller)
        && (!expression.of.type || object.card.normalizedType?.includes(expression.of.type)));
      return { status: 'resolved', value: objects.length };
    }
    const result = evaluateValueExpression(expression.of, { state, resolution, operationId });
    return result.status === 'resolved' && Array.isArray(result.value)
      ? { status: 'resolved', value: result.value.length }
      : result.status === 'resolved' ? { status: 'unverified', reason: 'Count requires an event collection.' } : result;
  }
  return { status: 'unverified', reason: `Value expression ${kind || 'unknown'} is outside current coverage.` };
}
