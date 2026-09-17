import { evaluateMagicScenario } from './ruleEvaluator.js';

export const MAGIC_ENGINE_VERSION = 'magic-rules-runtime-v2';

export function judgeMagicScenario(input = {}) {
  const result = evaluateMagicScenario(input);
  return {
    ...result,
    engine: MAGIC_ENGINE_VERSION,
    sourceVersion: result.sourceVersion || MAGIC_ENGINE_VERSION
  };
}

export default judgeMagicScenario;
