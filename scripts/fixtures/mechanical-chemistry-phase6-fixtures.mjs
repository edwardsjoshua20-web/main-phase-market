import { PHASE4_COMMANDERS, PHASE4_FIXTURES } from './mechanical-chemistry-phase4-fixtures.mjs';
import { PHASE5_COMMANDERS, PHASE5_FIXTURES } from './mechanical-chemistry-phase5-fixtures.mjs';

// Phase 6 never mutates an earlier benchmark.  The immutable views below make it
// impossible for fixture governance to rewrite the historical Phase 4 result.
export const PHASE6_CORE40_COMMANDERS = Object.freeze(PHASE4_COMMANDERS.slice(0, 40));
export const PHASE6_CORE40_FIXTURES = Object.freeze(PHASE4_FIXTURES.slice(0, 40));
export const PHASE6_EXPANDED60_COMMANDERS = Object.freeze(PHASE4_COMMANDERS.slice(0, 60));
export const PHASE6_EXPANDED60_ORIGINAL_FIXTURES = Object.freeze(PHASE4_FIXTURES.slice(0, 60));

const governed = PHASE5_FIXTURES.map((fixture) => Object.freeze({ ...fixture }));

// Kambal's benchmark previously called Esper Sentinel an obvious positive.  It
// is useful card advantage, but it neither punishes a noncreature-spell cast nor
// causes the life-loss/life-gain event Kambal creates.  Painful Quandary does.
// This is benchmark governance only: neither name appears in production scoring.
governed[43] = Object.freeze({
  ...governed[43],
  obvious_positive: 'Painful Quandary',
  strong_support: 'Esper Sentinel'
});

export const PHASE6_COMMANDERS = PHASE5_COMMANDERS;
export const PHASE6_ORIGINAL_FIXTURES = PHASE5_FIXTURES;
export const PHASE6_GOVERNED_FIXTURES = Object.freeze(governed);
export const PHASE6_EXPANDED60_GOVERNED_FIXTURES = Object.freeze(governed.slice(0, 60));

export const PHASE6_FIXTURE_CHANGELOG = Object.freeze([
  Object.freeze({
    configuration_index: 43,
    commander: ['Kambal, Consul of Allocation'],
    field: 'obvious_positive',
    before: 'Esper Sentinel',
    after: 'Painful Quandary',
    displaced_to: 'strong_support',
    classification: 'fixture_correction',
    rationale: 'Esper Sentinel is generic conditional card advantage. Painful Quandary directly punishes opponents for casting spells and creates the opponent-life-loss event Kambal rewards.',
    scorer_impact: 'none'
  })
]);
