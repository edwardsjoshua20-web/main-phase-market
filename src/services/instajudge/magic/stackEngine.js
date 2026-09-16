import { resolveStackObject } from './effectResolver.js';
import { validateAllTargets } from './targetValidator.js';

export function buildStack(scenario) {
  const stack = [];
  for (const object of scenario.stackObjects) {
    stack.push({ ...object, zone: 'stack' });
  }
  return stack;
}

export function validateTargetsOnAnnouncement(stack, state) {
  return stack.map((object) => ({
    object,
    targetCheck: validateAllTargets(object, state, 'announcement')
  }));
}

export function resolveStack({ stack = [], state, scenario }) {
  const sequence = [];
  const trace = [];
  const unresolved = [];
  let workingStack = [...stack];

  while (workingStack.length > 0) {
    const object = workingStack.pop();
    trace.push({ type: 'resolve-start', object: object.card.name, stackSizeBefore: workingStack.length + 1 });
    const result = resolveStackObject(object, state, scenario);
    trace.push(...result.trace, { type: 'resolve-finish', object: object.card.name, result });

    sequence.push({
      object: object.card.name,
      controller: object.controller,
      result: result.summary,
      stateBasedActions: result.stateBasedActions || []
    });

    const beforeCounterRemoval = workingStack.length;
    workingStack = workingStack.filter((pending) => state.zoneOf(pending.card) !== 'graveyard');
    if (workingStack.length !== beforeCounterRemoval) {
      trace.push({ type: 'countered-objects-removed', remainingStack: workingStack.map((pending) => pending.card.name) });
    }

    if (result.needsClarification || result.unsupported) {
      unresolved.push({ object, result });
      break;
    }
  }

  return {
    sequence,
    trace,
    unresolved,
    completed: unresolved.length === 0
  };
}
