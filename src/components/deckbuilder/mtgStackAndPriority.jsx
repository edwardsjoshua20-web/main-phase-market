// MTG Stack and Priority Rules - Rules 601-606, 117-120
// Implements proper spell casting, ability resolution, and priority per Comprehensive Rules

export const STACK_EVENTS = {
  SPELL_CAST: 'spell_cast',
  ABILITY_TRIGGERED: 'ability_triggered',
  ABILITY_ACTIVATED: 'ability_activated',
  RESOLVED: 'resolved',
  COUNTERED: 'countered'
};

// Rule 601: Casting a spell
export function castSpell(spell, controller, targetZone = 'stack') {
  if (!spell) return null;
  
  return {
    id: Math.random(),
    spell: spell.product_name,
    controller: controller,
    targets: [],
    zone: targetZone,
    timestamp: Date.now(),
    event: STACK_EVENTS.SPELL_CAST
  };
}

// Rule 602: Activating activated abilities
export function activateAbility(card, ability, controller) {
  if (!card || !ability) return null;
  
  return {
    id: Math.random(),
    source: card.product_name,
    ability: ability,
    controller: controller,
    targets: [],
    zone: 'stack',
    timestamp: Date.now(),
    event: STACK_EVENTS.ABILITY_ACTIVATED
  };
}

// Rule 603: Handling triggered abilities
export function triggerAbility(card, trigger, controller) {
  if (!card || !trigger) return null;
  
  return {
    id: Math.random(),
    source: card.product_name,
    trigger: trigger,
    controller: controller,
    targets: [],
    zone: 'stack',
    timestamp: Date.now(),
    event: STACK_EVENTS.ABILITY_TRIGGERED
  };
}

// Rule 117: Resolve spells and abilities
export function resolveStackObject(stackObject) {
  if (!stackObject) return null;
  
  return {
    ...stackObject,
    event: STACK_EVENTS.RESOLVED,
    zone: 'resolved'
  };
}

// Rule 120: Counter a spell or ability
export function counterSpell(stackObject) {
  if (!stackObject) return null;
  
  return {
    ...stackObject,
    event: STACK_EVENTS.COUNTERED,
    zone: 'graveyard'
  };
}

// Check for priority (Rule 116)
export function checkPriority(currentPlayer, otherPlayers, stack) {
  // Active player has priority initially
  // After each spell/ability, priority passes to next player in turn order
  // Player can pass priority by not taking action
  
  return {
    hasIt: currentPlayer,
    canPass: stack.length === 0 || stack[stack.length - 1].controller !== currentPlayer,
    stack: stack
  };
}

// Rule 118: Handling responses to spells/abilities
export function canRespond(player, stack) {
  // Each player gets priority when something goes on stack
  // They can cast instant spells or activate instant abilities
  return true;
}

// Create a new stack
export function createStack() {
  return [];
}

// Add object to stack (pushing new spell/ability)
export function pushToStack(stack, stackObject) {
  return [...stack, { ...stackObject, id: Math.random() }];
}

// Resolve top of stack
export function popStack(stack) {
  if (stack.length === 0) return { stack, resolved: null };
  
  const resolved = stack[stack.length - 1];
  return {
    stack: stack.slice(0, -1),
    resolved: { ...resolved, event: STACK_EVENTS.RESOLVED }
  };
}

// Empty stack (all objects resolve in reverse order)
export function emptyStack(stack) {
  const resolved = [];
  let current = [...stack];
  
  while (current.length > 0) {
    const top = current.pop();
    resolved.unshift({ ...top, event: STACK_EVENTS.RESOLVED });
  }
  
  return {
    stack: [],
    resolvedOrder: resolved
  };
}
