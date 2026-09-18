import { normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { deriveCharacteristics } from './continuousEffects.js';
import { emitEvent, moveObjectWithResult } from './runtimeState.js';
import { TIMING_MODES, checkTimingModePermission } from './stackRuntime.js';

export const SPECIAL_ACTION_TYPES = Object.freeze({
  PLAY_LAND: 'play-land',
  TURN_FACE_UP: 'turn-face-up',
  SUSPEND: 'suspend',
  FORETELL: 'foretell'
});

export const SPECIAL_ACTION_REASON_CODES = Object.freeze({
  LAND_PLAY_ALLOWED: 'LAND_PLAY_ALLOWED',
  LAND_PLAY_EXECUTED: 'LAND_PLAY_EXECUTED',
  WRONG_ACTIVE_PLAYER: 'WRONG_ACTIVE_PLAYER',
  WRONG_PHASE: 'WRONG_PHASE',
  STACK_NOT_EMPTY: 'STACK_NOT_EMPTY',
  NO_ACTION_WINDOW: 'NO_ACTION_WINDOW',
  WRONG_SOURCE_ZONE: 'WRONG_SOURCE_ZONE',
  LAND_PLAY_LIMIT_REACHED: 'LAND_PLAY_LIMIT_REACHED',
  MISSING_SPECIAL_ACTION_STATE: 'MISSING_SPECIAL_ACTION_STATE',
  UNSUPPORTED_LAND_IDENTITY: 'UNSUPPORTED_LAND_IDENTITY',
  UNSUPPORTED_LAND_PERMISSION: 'UNSUPPORTED_LAND_PERMISSION',
  UNSUPPORTED_SPECIAL_ACTION: 'UNSUPPORTED_SPECIAL_ACTION',
  ZONE_MOVE_FAILED: 'ZONE_MOVE_FAILED'
});

function factKnown(factsProvided, fact) {
  return factsProvided == null || factsProvided[fact] === true;
}

function result({ allowed, status, code, reason, actionType, state, playerId, sourceZone = null, missing = [] }) {
  const allowance = state?.game?.landPlays || null;
  return {
    allowed,
    status,
    actionType,
    code,
    reason,
    currentActionState: {
      turn: state?.game?.turn || null,
      turnId: state?.game?.turnId || null,
      activePlayer: state?.game?.activePlayer || null,
      actingPlayer: playerId || null,
      priorityHolder: state?.game?.priorityHolder || null,
      phase: state?.game?.phase || null,
      step: state?.game?.step || null,
      stackEmpty: (state?.stack?.length || 0) === 0,
      sourceZone,
      landPlaysAllowed: allowance?.allowed ?? null,
      landPlaysUsed: allowance?.used ?? null,
      landPlaysRemaining: allowance ? Math.max(0, allowance.allowed - allowance.used) : null
    },
    missing,
    support: status === 'unverified' ? 'unsupported' : status === 'depends' ? 'missing-state' : 'proven'
  };
}

function unsupportedAdditionalLandPermission(state, playerId) {
  const battlefieldText = (state?.battlefield || [])
    .filter((object) => object.zone === 'battlefield' && deriveCharacteristics(state, object).controller === playerId)
    .map((object) => deriveCharacteristics(state, object).text || '')
    .join(' ');
  const continuousText = (state?.continuousEffects || []).filter((effect) => effect.active !== false)
    .map((effect) => effect.oracleText || '')
    .join(' ');
  return /\bplay (?:one |an? )?additional lands?\b/i.test(`${battlefieldText} ${continuousText}`);
}

function isLandIdentity(state, object, card) {
  if (object) return deriveCharacteristics(state, object).types.includes('land');
  const normalized = normalizeMagicCard(card || {});
  if (!normalized.normalizedType) return null;
  return /\bland\b/.test(normalized.normalizedType);
}

function mapTimingCode(code) {
  if (code === 'WRONG_ACTIVE_PLAYER') return SPECIAL_ACTION_REASON_CODES.WRONG_ACTIVE_PLAYER;
  if (code === 'WRONG_PHASE') return SPECIAL_ACTION_REASON_CODES.WRONG_PHASE;
  if (code === 'STACK_NOT_EMPTY') return SPECIAL_ACTION_REASON_CODES.STACK_NOT_EMPTY;
  return SPECIAL_ACTION_REASON_CODES.NO_ACTION_WINDOW;
}

export function setLandPlayAllowance(state, { allowed, source = 'canonical-allowance' } = {}) {
  if (!state?.game?.landPlays || !Number.isInteger(allowed) || allowed < 0) {
    return { status: 'unverified', code: SPECIAL_ACTION_REASON_CODES.MISSING_SPECIAL_ACTION_STATE, reason: 'A nonnegative canonical land-play allowance is required.' };
  }
  state.game.landPlays.allowed = allowed;
  state.game.landPlays.source = source;
  return { status: 'configured', allowance: { ...state.game.landPlays } };
}

export function checkSpecialAction({ state, actionType, playerId, object = null, card = null, sourceZone = object?.zone || null, factsProvided = null } = {}) {
  if (actionType !== SPECIAL_ACTION_TYPES.PLAY_LAND) {
    return result({
      allowed: null,
      status: 'unverified',
      code: SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_SPECIAL_ACTION,
      reason: `${actionType || 'This special action'} is not implemented by the Phase 8D special-action runtime.`,
      actionType,
      state,
      playerId,
      sourceZone
    });
  }
  const landIdentity = isLandIdentity(state, object, card);
  if (landIdentity !== true) {
    return result({
      allowed: landIdentity === false ? false : null,
      status: landIdentity === false ? 'denied' : 'unverified',
      code: SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_LAND_IDENTITY,
      reason: landIdentity === false ? 'The proposed object is not a land.' : 'The runtime cannot prove that the proposed object is a land.',
      actionType,
      state,
      playerId,
      sourceZone
    });
  }
  if (sourceZone && sourceZone !== 'hand') {
    return result({
      allowed: null,
      status: 'unverified',
      code: SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_LAND_PERMISSION,
      reason: `Playing a land from ${sourceZone} requires a permission outside the supported Phase 8D model.`,
      actionType,
      state,
      playerId,
      sourceZone
    });
  }
  if (object && !state.players?.[playerId]?.hand?.includes(object.id)) {
    return result({
      allowed: false,
      status: 'denied',
      code: SPECIAL_ACTION_REASON_CODES.WRONG_SOURCE_ZONE,
      reason: 'The exact land object is not in the acting player hand.',
      actionType,
      state,
      playerId,
      sourceZone
    });
  }
  const timing = checkTimingModePermission({ state, requiredTiming: TIMING_MODES.SORCERY, playerId, factsProvided, actionLabel: 'A land play' });
  if (timing.status === 'depends') {
    return result({ allowed: null, status: 'depends', code: SPECIAL_ACTION_REASON_CODES.MISSING_SPECIAL_ACTION_STATE, reason: timing.reason, actionType, state, playerId, sourceZone, missing: timing.missing });
  }
  if (timing.allowed !== true) {
    return result({ allowed: timing.allowed, status: timing.status, code: mapTimingCode(timing.code), reason: timing.reason, actionType, state, playerId, sourceZone });
  }
  if (!factKnown(factsProvided, 'landAllowance')) {
    return result({ allowed: null, status: 'depends', code: SPECIAL_ACTION_REASON_CODES.MISSING_SPECIAL_ACTION_STATE, reason: 'The remaining land-play allowance is not specified.', actionType, state, playerId, sourceZone, missing: ['the land plays already used this turn'] });
  }
  const allowance = state.game.landPlays;
  if (!allowance || allowance.turnId !== state.game.turnId || !Number.isInteger(allowance.allowed) || !Number.isInteger(allowance.used)) {
    return result({ allowed: null, status: 'unverified', code: SPECIAL_ACTION_REASON_CODES.MISSING_SPECIAL_ACTION_STATE, reason: 'Canonical land-play allowance state is unavailable for this turn.', actionType, state, playerId, sourceZone });
  }
  if (allowance.used >= allowance.allowed) {
    if (unsupportedAdditionalLandPermission(state, playerId) && allowance.source === 'default-rule') {
      return result({ allowed: null, status: 'unverified', code: SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_LAND_PERMISSION, reason: 'A possible additional-land permission is present but cannot be derived safely.', actionType, state, playerId, sourceZone });
    }
    return result({ allowed: false, status: 'denied', code: SPECIAL_ACTION_REASON_CODES.LAND_PLAY_LIMIT_REACHED, reason: 'The player has no remaining land plays this turn.', actionType, state, playerId, sourceZone });
  }
  return result({ allowed: true, status: 'allowed', code: SPECIAL_ACTION_REASON_CODES.LAND_PLAY_ALLOWED, reason: 'The active player may play this land from hand at the current main-phase action point.', actionType, state, playerId, sourceZone });
}

export function executeSpecialAction(state, options = {}) {
  const legality = checkSpecialAction({ state, ...options });
  if (legality.allowed !== true) return { executed: false, legality };
  if (options.actionType !== SPECIAL_ACTION_TYPES.PLAY_LAND || !options.object) {
    return { executed: false, legality: result({ allowed: null, status: 'unverified', code: SPECIAL_ACTION_REASON_CODES.UNSUPPORTED_SPECIAL_ACTION, reason: 'An exact land object is required for execution.', actionType: options.actionType, state, playerId: options.playerId, sourceZone: options.sourceZone }) };
  }
  const stackDepth = state.stack.length;
  const previousController = options.object.controller;
  options.object.controller = options.playerId;
  const movement = moveObjectWithResult(state, options.object, 'battlefield', 'land special action', { specialAction: SPECIAL_ACTION_TYPES.PLAY_LAND });
  if (movement.status !== 'committed' || movement.to !== 'battlefield') {
    options.object.controller = previousController;
    return { executed: false, legality, movement, code: SPECIAL_ACTION_REASON_CODES.ZONE_MOVE_FAILED };
  }
  state.game.landPlays.used += 1;
  state.game.priorityHolder = options.playerId;
  state.game.consecutivePasses = 0;
  emitEvent(state, 'LandPlayed', {
    object: options.object,
    controller: options.playerId,
    from: movement.from,
    to: movement.to,
    metadata: {
      specialAction: true,
      landPlaysUsed: state.game.landPlays.used,
      landPlaysAllowed: state.game.landPlays.allowed
    }
  });
  return {
    executed: true,
    status: 'executed',
    code: SPECIAL_ACTION_REASON_CODES.LAND_PLAY_EXECUTED,
    legality,
    object: options.object,
    movement,
    stackUnchanged: state.stack.length === stackDepth,
    allowance: { ...state.game.landPlays }
  };
}

export function inferUnsupportedSpecialAction(text) {
  const normalized = normalizeMagicText(text);
  if (/\b(?:turn|flip) .* face up\b|\bmorph\b|\bdisguise\b/.test(normalized)) return SPECIAL_ACTION_TYPES.TURN_FACE_UP;
  if (/\bsuspend\b/.test(normalized)) return SPECIAL_ACTION_TYPES.SUSPEND;
  if (/\bforetell\b/.test(normalized)) return SPECIAL_ACTION_TYPES.FORETELL;
  return null;
}
