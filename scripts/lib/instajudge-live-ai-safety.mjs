const LIVE_AI_ENABLED = 'true';

function positiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
export function createLiveAiRequestGate({
  scriptName,
  plannedCalls,
  env = process.env,
  fetchImpl = fetch
}) {
  if (String(env.INSTAJUDGE_ALLOW_LIVE_AI || '').toLowerCase() !== LIVE_AI_ENABLED) {
    throw new Error(`${scriptName}: Live Workers AI blocked by development safety gate. Set INSTAJUDGE_ALLOW_LIVE_AI=true to opt in.`);
  }

  const maximumCalls = positiveInteger(env.INSTAJUDGE_LIVE_AI_MAX_CALLS);
  if (!maximumCalls) {
    throw new Error(`${scriptName}: set INSTAJUDGE_LIVE_AI_MAX_CALLS to an explicit positive integer.`);
  }
  if (!Number.isInteger(plannedCalls) || plannedCalls < 1 || plannedCalls > maximumCalls) {
    throw new Error(`${scriptName}: planned ${plannedCalls} live calls, exceeding the explicit process maximum of ${maximumCalls}.`);
  }

  let attemptedCalls = 0;
  return Object.freeze({
    get attemptedCalls() { return attemptedCalls; },
    get maximumCalls() { return maximumCalls; },
    async fetch(...args) {
      if (attemptedCalls >= maximumCalls) {
        throw new Error(`${scriptName}: live Workers AI process maximum of ${maximumCalls} reached.`);
      }
      attemptedCalls += 1;
      return fetchImpl(...args);
    }
  });
}
