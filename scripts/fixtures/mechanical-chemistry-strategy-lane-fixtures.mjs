import { PHASE4_COMMANDERS, PHASE4_FIXTURES } from './mechanical-chemistry-phase4-fixtures.mjs';

const EXPECTATIONS = Object.freeze([
  [['sacrifice_outlet', 'death_payoff', 'token_generation'], 'death_payoff'],
  [['spell_throughput', 'cost_reduction'], 'spell_throughput'],
  [['counters', 'proliferate'], 'proliferate'],
  [['token_generation', 'token_multiplier'], 'token_multiplier'],
  [['artifact_support', 'token_generation'], 'artifact_support'],
  [['enchantment_support'], 'enchantment_support'],
  [['graveyard_setup', 'recursion'], 'graveyard_setup'],
  [['extra_land_drops', 'land_recursion'], 'land_recursion'],
  [['tribal_support', 'sacrifice_outlet', 'death_payoff'], 'sacrifice_outlet'],
  [['aura_support'], 'aura_support'],
  [['blink', 'etb_payoff'], 'etb_payoff'],
  [['mill', 'repeatable_mill', 'mill_multiplier', 'mill_payoff'], 'mill_multiplier'],
  [['lifegain'], 'lifegain'],
  [['extra_combat', 'combat_enabler'], 'extra_combat'],
  [['control'], 'control'],
  [['group_slug'], 'group_slug'],
  [['treasure'], 'treasure'],
  [['sacrifice_outlet', 'death_payoff'], 'sacrifice_outlet'],
  [[], 'ramp'],
  [['extra_combat', 'combat_enabler', 'group_slug'], 'extra_combat'],
  [['tribal_support', 'token_generation'], 'tribal_support'],
  [['tribal_support', 'counters'], 'tribal_support'],
  [['tribal_support', 'token_generation'], 'sacrifice_outlet'],
  [['tribal_support', 'combat_enabler'], 'tribal_support'],
  [['extra_combat', 'combat_enabler'], 'extra_combat'],
  [['blink', 'etb_payoff'], 'etb_payoff'],
  [['token_generation', 'token_multiplier', 'sacrifice_outlet'], 'token_multiplier'],
  [['graveyard_setup', 'recursion', 'sacrifice_outlet'], 'sacrifice_outlet'],
  [['extra_land_drops'], 'extra_land_drops'],
  [['aura_support'], 'aura_support']
]);

export const STRATEGY_LANE_COMMANDERS = Object.freeze(PHASE4_COMMANDERS.slice(0, EXPECTATIONS.length));

export const STRATEGY_LANE_FIXTURES = Object.freeze(EXPECTATIONS.map(([expected_lanes, expected_lane], index) => Object.freeze({
  expected_lanes: Object.freeze(expected_lanes),
  expected_lane,
  obvious_positive: index === 14 ? 'Dovin, Hand of Control' : index === 19 ? 'Savage Beating' : PHASE4_FIXTURES[index].obvious_positive,
  strong_support: PHASE4_FIXTURES[index].strong_support,
  weak_negative: PHASE4_FIXTURES[index].weak_negative,
  false_positive_trap: index === 13 ? 'Hill Giant' : PHASE4_FIXTURES[index].false_positive_trap,
  illegal_negative: PHASE4_FIXTURES[index].illegal_negative,
  top_n_target: 20
})));

export const STRATEGY_LANE_ADVANCED_SEARCH_CASES = Object.freeze([
  { commander: 'Captain N\'ghathrod', lane: 'mill_multiplier', literal_terms: ['mill'], expected: 'Bruvac the Grandiloquent' },
  { commander: 'Teysa Karlov', lane: 'death_payoff', literal_terms: ['dies'], expected: 'Pitiless Plunderer' },
  { commander: 'Mizzix of the Izmagnus', lane: 'spell_throughput', literal_terms: ['instant', 'sorcery'], expected: 'Frantic Search' },
  { commander: 'Atraxa, Praetors\' Voice', lane: 'proliferate', literal_terms: ['proliferate'], expected: 'Evolution Sage' },
  { commander: 'Rhys the Redeemed', lane: 'token_multiplier', literal_terms: ['token'], expected: 'Anointed Procession' },
  { commander: 'The Gitrog Monster', lane: 'land_recursion', literal_terms: ['land', 'graveyard'], expected: 'Life from the Loam' },
  { commander: 'Sram, Senior Edificer', lane: 'aura_support', literal_terms: ['aura'], expected: 'Flickering Ward' },
  { commander: 'Brago, King Eternal', lane: 'etb_payoff', literal_terms: ['enters'], expected: 'Panharmonicon' },
  { commander: 'Korvold, Fae-Cursed King', lane: 'sacrifice_outlet', literal_terms: ['sacrifice'], expected: 'Viscera Seer' },
  { commander: 'Light-Paws, Emperor\'s Voice', lane: 'aura_support', literal_terms: ['aura'], expected: 'Ethereal Armor' }
]);
