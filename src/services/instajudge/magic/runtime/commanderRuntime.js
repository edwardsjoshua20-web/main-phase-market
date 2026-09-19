export const COMMANDER_FORMAT_ID = 'commander';
export const COMMANDER_DAMAGE_THRESHOLD = 21;

export const COMMANDER_CHOICE_TIMING = Object.freeze({
  REPLACEMENT: 'replacement',
  STATE_BASED_ACTION: 'state-based-action'
});

function normalizedFormatId(format) {
  if (typeof format === 'string') return format.toLowerCase();
  return String(format?.id || format?.name || 'ordinary').toLowerCase();
}

export function createFormatState(format = null) {
  const id = normalizedFormatId(format);
  return {
    id,
    commander: {
      enabled: id === COMMANDER_FORMAT_ID,
      designations: [],
      movementHistory: []
    }
  };
}

export function isCommanderFormat(state) {
  return state?.format?.id === COMMANDER_FORMAT_ID && state?.format?.commander?.enabled === true;
}

export function commanderDesignationFor(state, objectOrId) {
  if (!isCommanderFormat(state)) return null;
  const objectId = typeof objectOrId === 'string' ? objectOrId : objectOrId?.id;
  const designationId = typeof objectOrId === 'object' ? objectOrId?.commanderDesignationId : null;
  return state.format.commander.designations.find((designation) => (
    designation.id === designationId
    || designation.currentObjectId === objectId
    || designation.objectIds.includes(objectId)
  )) || null;
}

export function isDesignatedCommander(state, objectOrId) {
  return Boolean(commanderDesignationFor(state, objectOrId));
}

export function designateCommander(state, object, { ownerId = object?.owner, designationId = null, castsFromCommandZone = 0 } = {}) {
  if (!isCommanderFormat(state) || !object || !ownerId || !state.players?.[ownerId]) return null;
  const existing = commanderDesignationFor(state, object);
  if (existing) return existing;
  const id = designationId || `commander-designation:${ownerId}:${object.id}`;
  const designation = {
    id,
    ownerId,
    cardIdentity: {
      oracleId: object.oracleId || null,
      cardId: object.card?.id || null,
      initialObjectId: object.id
    },
    currentObjectId: object.id,
    objectIds: [object.id],
    currentZone: object.zone,
    inCommandZone: object.zone === 'command',
    castsFromCommandZone: Number.isInteger(castsFromCommandZone) && castsFromCommandZone >= 0 ? castsFromCommandZone : 0,
    movementHistory: []
  };
  object.commander = true;
  object.commanderDesignationId = id;
  state.format.commander.designations.push(designation);
  return designation;
}

export function initializeCommanderDesignations(state, descriptors = []) {
  if (!isCommanderFormat(state)) return [];
  const designations = [];
  for (const descriptor of descriptors) {
    const object = state.objects.get(descriptor.objectId);
    if (!object) continue;
    const designation = designateCommander(state, object, {
      ownerId: descriptor.ownerId || object.owner,
      designationId: descriptor.id || null,
      castsFromCommandZone: descriptor.castsFromCommandZone
    });
    if (designation) designations.push(designation);
  }
  return designations;
}

export function recordCommanderMovement(state, object, movement) {
  const designation = commanderDesignationFor(state, object);
  if (!designation) return null;
  designation.currentObjectId = object.id;
  if (!designation.objectIds.includes(object.id)) designation.objectIds.push(object.id);
  designation.currentZone = movement.to;
  designation.inCommandZone = movement.to === 'command';
  const entry = {
    sequence: state.format.commander.movementHistory.length + 1,
    designationId: designation.id,
    objectId: object.id,
    ownerId: designation.ownerId,
    from: movement.from,
    to: movement.to,
    reason: movement.reason || null,
    timing: movement.timing || 'zone-change',
    originalDestination: movement.originalDestination || movement.to,
    eventId: movement.eventId || null
  };
  designation.movementHistory.push(entry);
  state.format.commander.movementHistory.push(entry);
  return entry;
}

export function commanderReplacementEffects(state, event) {
  const designation = commanderDesignationFor(state, event.object);
  if (!designation || event.type !== 'ZoneChange' || !['hand', 'library'].includes(event.to)) return [];
  return [{
    id: `commander-zone:${designation.id}:${event.from}:${event.to}`,
    source: event.object,
    mandatory: false,
    chooser: designation.ownerId,
    eventType: 'ZoneChange',
    applies: () => true,
    replace: {
      to: 'command',
      metadata: {
        commanderDesignationId: designation.id,
        commanderChoiceTiming: COMMANDER_CHOICE_TIMING.REPLACEMENT,
        commanderOriginalDestination: event.to
      }
    },
    text: `The commander owner may put it into the command zone instead of ${event.to}.`
  }];
}

export function createCommanderReturnChoice(state, object, { from, to, reason, eventId = null } = {}) {
  const designation = commanderDesignationFor(state, object);
  if (!designation || !['graveyard', 'exile'].includes(to)) return null;
  return {
    id: `commander-return:${designation.id}:${eventId || state.events.length}`,
    type: 'CommanderZoneReturnChoice',
    commanderDesignationId: designation.id,
    objectId: object.id,
    ownerId: designation.ownerId,
    chooser: designation.ownerId,
    from,
    currentZone: to,
    originalDestination: to,
    commandZoneOption: 'command',
    movementReason: reason || null,
    timing: COMMANDER_CHOICE_TIMING.STATE_BASED_ACTION,
    clarificationNeeded: `Does ${designation.ownerId} move this commander from ${to} to the command zone?`
  };
}

export function commanderReturnDecision(options = {}, designation, destination) {
  const supplied = options.commanderReturnChoice;
  const candidate = Array.isArray(options.commanderChoices)
    ? options.commanderChoices.find((choice) => (
      choice.designationId === designation.id
      || choice.objectId === designation.currentObjectId
      || choice.destination === destination
    ))
    : null;
  const decision = candidate?.choice ?? candidate?.decision ?? supplied;
  if (['command', 'command-zone', true].includes(decision)) return 'command';
  if (['remain', 'decline', destination, false].includes(decision)) return 'remain';
  return null;
}

export function commanderCastPermission(state, object, playerId) {
  if (!isCommanderFormat(state)) return { allowed: false, reason: 'Commander format is not active.' };
  const designation = commanderDesignationFor(state, object);
  if (!designation) return { allowed: false, reason: 'This command-zone object is not a designated commander.' };
  if (object.zone !== 'command') return { allowed: false, reason: 'The designated commander is not in the command zone.' };
  if (designation.ownerId !== playerId) return { allowed: false, reason: 'Only the commander owner has the Commander-format permission to cast it from the command zone.' };
  return { allowed: true, designation, tax: commanderTaxForCast(state, object, playerId) };
}

export function commanderTaxForCast(state, object, playerId, { sourceZone = object?.zone } = {}) {
  const designation = commanderDesignationFor(state, object);
  if (!designation) {
    return { supported: false, status: 'depends', applies: false, reason: 'Commander designation is unknown.' };
  }
  const previousCommandZoneCasts = designation.castsFromCommandZone;
  if (!Number.isInteger(previousCommandZoneCasts) || previousCommandZoneCasts < 0) {
    return { supported: false, status: 'depends', applies: sourceZone === 'command', designationId: designation.id, reason: 'Previous command-zone cast history is unknown.' };
  }
  const applies = sourceZone === 'command' && designation.ownerId === playerId;
  return {
    supported: true,
    status: 'verified',
    applies,
    designationId: designation.id,
    ownerId: designation.ownerId,
    sourceZone,
    previousCommandZoneCasts,
    genericMana: applies ? previousCommandZoneCasts * 2 : 0
  };
}

export function recordCommanderCastFromCommandZone(state, object) {
  const designation = commanderDesignationFor(state, object);
  if (!designation) return null;
  designation.castsFromCommandZone += 1;
  return designation;
}

export function commanderDamageTotal(state, recipientId, designationOrObject) {
  const designation = typeof designationOrObject === 'string'
    ? state?.format?.commander?.designations?.find((entry) => entry.id === designationOrObject) || commanderDesignationFor(state, designationOrObject)
    : commanderDesignationFor(state, designationOrObject);
  if (!designation || !state?.players?.[recipientId]) return null;
  const total = state.players[recipientId].commanderDamage?.[designation.id] ?? 0;
  return Number.isFinite(total) && total >= 0 ? total : null;
}

export function setCommanderDamageTotal(state, recipientId, designationOrObject, amount) {
  const designation = typeof designationOrObject === 'string'
    ? state?.format?.commander?.designations?.find((entry) => entry.id === designationOrObject) || commanderDesignationFor(state, designationOrObject)
    : commanderDesignationFor(state, designationOrObject);
  if (!designation || !state?.players?.[recipientId] || !Number.isFinite(amount) || amount < 0) return null;
  state.players[recipientId].commanderDamage[designation.id] = amount;
  return {
    designationId: designation.id,
    commanderName: state.objects?.get(designation.currentObjectId)?.name || null,
    recipientId,
    total: amount,
    threshold: COMMANDER_DAMAGE_THRESHOLD
  };
}

export function recordCommanderCombatDamage(state, { recipientId, source, amount, damageEventId = null, combat = false } = {}) {
  if (!isCommanderFormat(state) || combat !== true || !state?.players?.[recipientId] || !Number.isFinite(amount) || amount <= 0) return null;
  const designation = commanderDesignationFor(state, source);
  if (!designation) return null;
  const priorTotal = commanderDamageTotal(state, recipientId, designation.id);
  if (priorTotal == null) return null;
  const newTotal = priorTotal + amount;
  state.players[recipientId].commanderDamage[designation.id] = newTotal;
  return {
    designationId: designation.id,
    commanderName: source?.name || state.objects?.get(designation.currentObjectId)?.name || null,
    recipientId,
    priorTotal,
    damageDealt: amount,
    newTotal,
    threshold: COMMANDER_DAMAGE_THRESHOLD,
    thresholdReached: newTotal >= COMMANDER_DAMAGE_THRESHOLD,
    damageEventId
  };
}

export function commanderDamageLossFor(state, recipientId) {
  if (!isCommanderFormat(state) || !state?.players?.[recipientId]) return null;
  for (const designation of state.format.commander.designations) {
    const total = commanderDamageTotal(state, recipientId, designation.id);
    if (total != null && total >= COMMANDER_DAMAGE_THRESHOLD) {
      return {
        recipientId,
        designationId: designation.id,
        commanderName: state.objects?.get(designation.currentObjectId)?.name || null,
        total,
        threshold: COMMANDER_DAMAGE_THRESHOLD
      };
    }
  }
  return null;
}
