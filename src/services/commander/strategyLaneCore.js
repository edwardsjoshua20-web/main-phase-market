import {
  buildCommanderSemanticProfile,
  buildSemanticCardProfile,
  checkMechanicalCandidateLegality
} from './mechanicalChemistryCore.js';

export const STRATEGY_LANE_SCHEMA_VERSION = 1;

const IMPORTANCE_ORDER = Object.freeze({ Primary: 0, Secondary: 1, Support: 2, 'Generic Utility': 3 });
const FEATURE_GROUPS = Object.freeze(['produces', 'wants', 'rewards', 'enables', 'roles', 'resources']);
const GENERIC_LANES = new Set(['ramp', 'card_draw', 'removal', 'protection', 'mana_fixing']);

const BASE_LANES = Object.freeze({
  mill: { label: 'Mill Effects', need: 'Put cards from opponents’ libraries into their graveyards.', keys: ['opponent_mill'], template: 'Mills opponents, directly advancing the commander’s mill plan.' },
  repeatable_mill: { label: 'Repeatable Mill', need: 'Create repeatable opponent-mill events.', keys: ['opponent_mill'], template: 'Repeatedly mills opponents, creating more events for the commander to reward or multiply.' },
  mill_multiplier: { label: 'Mill Multipliers', need: 'Increase the size of opponent-mill events.', keys: ['opponent_mill'], template: 'Increases cards milled, stacking with the commander’s primary mill plan.' },
  mill_payoff: { label: 'Mill Payoffs', need: 'Reward opponent mill or cards in opposing graveyards.', keys: ['opponent_mill', 'opponent_graveyard'], template: 'Rewards the opponent-mill events or graveyard resources created by the commander’s plan.' },
  sacrifice_outlet: { label: 'Sacrifice Outlets', need: 'Create sacrifice and death events on demand.', keys: ['sacrifice_event', 'creature_dies'], template: 'Provides an on-demand sacrifice outlet that creates the death or sacrifice event the commander rewards.' },
  death_payoff: { label: 'Death Payoffs', need: 'Reward creature deaths or convert them into resources.', keys: ['creature_dies'], template: 'Rewards or converts creature deaths, directly compounding the commander’s death engine.' },
  token_generation: { label: 'Token Generation', need: 'Create expendable or strategically relevant tokens.', keys: ['tokens', 'token_created', 'typed_token_maker'], template: 'Creates tokens that supply the resource or event the commander’s plan needs.' },
  token_multiplier: { label: 'Token Multipliers', need: 'Scale existing token creation.', keys: ['tokens', 'token_created', 'token_multiplier'], template: 'Multiplies token creation, scaling the commander’s token engine rather than adding one incidental body.' },
  graveyard_setup: { label: 'Graveyard Setup', need: 'Put useful cards into your own graveyard.', keys: ['graveyard_population', 'self_mill', 'discard_to_own_graveyard'], template: 'Loads your graveyard in the direction and card classes the commander can exploit.' },
  recursion: { label: 'Recursion', need: 'Reuse cards from your graveyard.', keys: ['recursion', 'graveyard_recursion'], template: 'Returns useful cards from your graveyard, extending the commander’s recursion plan.' },
  counters: { label: 'Counter Support', need: 'Create or manipulate the counter types the commander uses.', keys: ['counter_added'], template: 'Creates or manipulates counters relevant to the commander’s counter-based plan.' },
  proliferate: { label: 'Proliferate', need: 'Add counters to permanents or players that already have them.', keys: ['proliferate', 'counter_amplification'], template: 'Proliferates existing counters, scaling the counter types the commander establishes.' },
  blink: { label: 'Blink Enablers', need: 'Exile and return permanents to repeat enter abilities.', keys: ['blink'], template: 'Exiles and returns a relevant permanent, repeating its enter-the-battlefield value.' },
  etb_payoff: { label: 'ETB Payoffs', need: 'Reward or repeat relevant permanents entering.', keys: ['creature_enters', 'artifact_enters', 'enchantment_enters'], template: 'Rewards or repeats the relevant enter-the-battlefield events in the commander’s plan.' },
  tribal_support: { label: 'Tribal Support', need: 'Support the exact creature types named by the commander.', keys: [], template: 'Supports the exact creature type named by the commander rather than creatures generically.' },
  aura_support: { label: 'Aura / Attachment Support', need: 'Cast, attach, protect, or reward Auras and Equipment.', keys: ['aura', 'aura_cast', 'equipment', 'attached'], template: 'Supports Auras or attachments that directly power the commander’s Voltron plan.' },
  enchantment_support: { label: 'Enchantment Support', need: 'Cast, create, or reward enchantments.', keys: ['enchantment_cast', 'enchantment_enters', 'enchantment'], template: 'Creates or rewards enchantments, directly advancing the commander’s enchantment engine.' },
  artifact_support: { label: 'Artifact Support', need: 'Cast, create, or reward artifacts.', keys: ['artifact_cast', 'artifact_enters', 'artifact'], template: 'Creates or rewards artifacts, directly advancing the commander’s artifact engine.' },
  treasure: { label: 'Treasure', need: 'Create or multiply Treasure tokens.', keys: ['treasure', 'token:treasure'], template: 'Creates or multiplies Treasure, supplying the artifact and mana resource the commander rewards.' },
  spell_throughput: { label: 'Spell Throughput', need: 'Cast more relevant spells efficiently.', keys: ['instant_or_sorcery_cast', 'spell_cast', 'mana_refund'], template: 'Improves spell throughput by creating, refunding, or efficiently repeating the spell event the commander rewards.' },
  cost_reduction: { label: 'Cost Reduction', need: 'Reduce the cost of spells central to the commander.', keys: ['cost_reduction', 'instant_sorcery_cost_reduction'], template: 'Reduces the cost of the spell class at the center of the commander’s plan.' },
  extra_land_drops: { label: 'Extra Land Drops', need: 'Put additional lands onto the battlefield.', keys: ['extra_land_drop', 'land_enters'], template: 'Adds land drops or land-entry events, increasing the commander’s land-based triggers.' },
  land_recursion: { label: 'Land Recursion', need: 'Return or replay lands from the graveyard.', keys: ['land_recursion', 'land_to_graveyard'], template: 'Reuses lands from the graveyard, sustaining the commander’s land engine.' },
  extra_combat: { label: 'Extra Combat', need: 'Create additional combat or attack-trigger opportunities.', keys: ['extra_combat', 'combat_phase'], template: 'Creates another combat, repeating the commander’s attack and combat-damage opportunities.' },
  combat_enabler: { label: 'Combat Enablers', need: 'Enable attacks or combat-damage triggers.', keys: ['attacks', 'combat_damage'], template: 'Improves access to the attack or combat-damage event the commander rewards.' },
  lifegain: { label: 'Life Gain', need: 'Create repeatable life-gain events.', keys: ['life_gained'], template: 'Creates life-gain events that directly trigger or grow the commander’s payoff.' },
  group_slug: { label: 'Table Pressure', need: 'Create repeatable opponent life loss or punishment.', keys: ['opponent_life_loss', 'controlled_damage', 'all_player_damage'], template: 'Creates repeatable opponent life loss or punishment on the commander’s primary pressure axis.' },
  control: { label: 'Control / Permission', need: 'Constrain opposing actions or reward interaction.', keys: ['permission', 'tax_effect', 'cast_punishment'], template: 'Constrains opposing actions on the control axis established by the commander.' },
  ramp: { label: 'Ramp', need: 'Produce additional mana efficiently.', keys: ['mana'], template: 'Provides efficient mana acceleration as deck support; it is not presented as unique commander chemistry.' },
  card_draw: { label: 'Card Draw', need: 'Generate card advantage.', keys: ['cards', 'card_drawn'], template: 'Provides card advantage as deck support; commander-specific relevance is stated only when a direct edge exists.' },
  removal: { label: 'Removal', need: 'Answer opposing permanents or spells.', keys: ['removal', 'interaction'], template: 'Provides interaction for the deck without claiming a commander-specific engine connection.' },
  protection: { label: 'Protection', need: 'Protect the commander or core engine pieces.', keys: ['protection'], template: 'Protects the commander or a key engine permanent from interaction.' },
  mana_fixing: { label: 'Mana Fixing', need: 'Produce the commander’s required colors.', keys: ['mana_fixing'], template: 'Improves color access as generic deck support.' }
});

function values(profile, group) { return profile?.[group] || []; }
function featureEntries(profile) { return FEATURE_GROUPS.flatMap((group) => values(profile, group).map((entry) => ({ ...entry, group }))); }
function keyMatches(key, expected) { return key === expected || key.startsWith(`${expected}:`) || key.endsWith(`:${expected}`); }
function matchingFeatures(profile, keys) { return featureEntries(profile).filter((entry) => keys.some((key) => keyMatches(entry.key, key))); }
function directCommanderFeatures(profile) { return ['wants', 'rewards', 'enables', 'produces'].flatMap((group) => values(profile, group).filter((entry) => entry.source_kind !== 'card_type' && Number(entry.confidence || 0) >= 0.65).map((entry) => ({ ...entry, group }))); }
function hasSignal(entries, ...keys) { return entries.some((entry) => keys.some((key) => keyMatches(entry.key, key))); }
function hasRole(profile, role) { return values(profile, 'roles').some((entry) => entry.key === role); }
function unique(valuesToDedupe) { return [...new Set(valuesToDedupe.filter(Boolean))]; }

function laneInstance(id, importance, source, extra = {}) {
  const definition = BASE_LANES[id];
  return {
    lane_id: id,
    display_label: definition.label,
    importance,
    source_commander_mechanic: source,
    semantic_need: definition.need,
    legal_candidate_constraints: ['commander_legal', 'within_combined_color_identity', 'exclude_commanders'],
    ranking_dimensions: ['semantic_directness', 'reliability', 'repeatability', 'dependency_burden', 'mana_efficiency', 'lane_specific_quality'],
    explanation_template_inputs: ['lane_need', 'matched_semantic_edge', 'commander_mechanic'],
    generic_utility: GENERIC_LANES.has(id),
    ...extra
  };
}

export function deriveCommanderStrategyLanes(commanders) {
  const profile = commanders?.commander_identity ? commanders : buildCommanderSemanticProfile(commanders);
  const signals = directCommanderFeatures(profile);
  const lanes = [];
  const add = (id, importance, source, extra) => { if (!lanes.some((lane) => lane.lane_id === id)) lanes.push(laneInstance(id, importance, source, extra)); };
  const sourceFor = (...keys) => signals.find((entry) => keys.some((key) => keyMatches(entry.key, key)))?.evidence?.[0] || keys.join(', ');

  if (hasSignal(signals, 'opponent_mill')) {
    add('mill', 'Primary', sourceFor('opponent_mill'));
    add('repeatable_mill', 'Primary', sourceFor('opponent_mill'));
    add('mill_multiplier', 'Primary', sourceFor('opponent_mill'));
    add('mill_payoff', 'Secondary', sourceFor('opponent_mill'));
  }
  if (hasSignal(signals, 'creature_dies', 'sacrifice_event')) {
    add('sacrifice_outlet', 'Primary', sourceFor('creature_dies', 'sacrifice_event'));
    add('death_payoff', 'Primary', sourceFor('creature_dies'));
    add('token_generation', 'Secondary', 'Death engines need renewable material.');
    add('recursion', 'Support', 'Death engines benefit from reusable material.');
  }
  if (hasSignal(signals, 'tokens', 'token_created') || profile.strategic_bottlenecks?.some((entry) => entry.key === 'repeatable_token_supply')) {
    add('token_generation', 'Primary', sourceFor('tokens', 'token_created'));
    add('token_multiplier', 'Primary', sourceFor('tokens', 'token_created'));
    add('sacrifice_outlet', 'Secondary', 'Token production supplies expendable material for conversion.');
  }
  if (profile.demand_profile?.graveyard?.active || hasSignal(signals, 'graveyard_population', 'self_mill', 'land_to_graveyard')) {
    add('graveyard_setup', 'Primary', sourceFor('graveyard_population', 'self_mill', 'land_to_graveyard'));
    if (profile.demand_profile?.graveyard?.recursion_value || hasSignal(signals, 'recursion', 'cast_from_graveyard')) add('recursion', 'Primary', sourceFor('recursion', 'cast_from_graveyard'));
  }
  if (hasSignal(signals, 'counter_added', 'proliferate')) {
    add('counters', 'Primary', sourceFor('counter_added', 'proliferate'), { counter_types: unique(signals.map((entry) => entry.counter_type)) });
    add('proliferate', 'Secondary', sourceFor('counter_added', 'proliferate'));
  }
  if (hasSignal(signals, 'blink') || profile.demand_profile?.etb?.commander_blinks) add('blink', 'Primary', sourceFor('blink'));
  if (profile.demand_profile?.etb?.active || hasSignal(signals, 'etb:creature:you', 'etb:artifact:you', 'etb:enchantment:you')) add('etb_payoff', 'Primary', sourceFor('etb:creature:you', 'etb:artifact:you', 'etb:enchantment:you'), { object_classes: profile.demand_profile?.etb?.object_classes || [] });
  const tribes = (profile.demand_profile?.tribal?.exact_types || []).filter((type) => type.length > 2 && !['and', 'the', 'this', 'that', 'other'].includes(type));
  if (tribes.length) add('tribal_support', 'Primary', `Commander names ${tribes.join(', ')}.`, { tribes });
  if (hasSignal(signals, 'aura', 'aura_cast', 'equipment', 'attached')) add('aura_support', 'Primary', sourceFor('aura', 'aura_cast', 'equipment', 'attached'));
  if (hasSignal(signals, 'enchantment_cast', 'enchantment_enters')) add('enchantment_support', 'Primary', sourceFor('enchantment_cast', 'enchantment_enters'));
  if (hasSignal(signals, 'artifact_cast', 'artifact_enters', 'artifact')) add('artifact_support', 'Primary', sourceFor('artifact_cast', 'artifact_enters', 'artifact'));
  if (hasSignal(signals, 'treasure', 'token:treasure')) add('treasure', 'Primary', sourceFor('treasure', 'token:treasure'));
  if (hasSignal(signals, 'instant_or_sorcery_cast', 'spell_cast') && signals.some((entry) => ['wants', 'rewards', 'enables'].includes(entry.group))) {
    add('spell_throughput', 'Primary', sourceFor('instant_or_sorcery_cast', 'spell_cast'));
    add('cost_reduction', 'Secondary', sourceFor('instant_or_sorcery_cast', 'spell_cast'));
  }
  if (hasSignal(signals, 'land_enters', 'land_played')) add('extra_land_drops', 'Primary', sourceFor('land_enters', 'land_played'));
  if (hasSignal(signals, 'land_to_graveyard') || profile.demand_profile?.graveyard?.required_types?.includes('land')) add('land_recursion', 'Secondary', sourceFor('land_to_graveyard'));
  if (hasSignal(signals, 'extra_combat', 'combat_phase')) add('extra_combat', 'Primary', sourceFor('extra_combat', 'combat_phase'));
  if (hasSignal(signals, 'attacks', 'combat_damage')) {
    add('combat_enabler', 'Secondary', sourceFor('attacks', 'combat_damage'));
    add('extra_combat', 'Secondary', 'Additional combats repeat attack and combat-damage triggers.');
  }
  if (hasSignal(signals, 'life_gained')) add('lifegain', 'Primary', sourceFor('life_gained'));
  if (hasSignal(signals, 'opponent_life_loss', 'controlled_damage', 'all_player_damage')) add('group_slug', 'Primary', sourceFor('opponent_life_loss', 'controlled_damage', 'all_player_damage'), { focus_keys: unique(signals.filter((entry) => ['opponent_life_loss', 'controlled_damage', 'all_player_damage', 'cast_punishment', 'land_punishment'].some((key) => keyMatches(entry.key, key))).map((entry) => entry.key)) });
  if (profile.demand_profile?.control?.active || hasSignal(signals, 'permission', 'tax_effect', 'cast_punishment')) add('control', 'Primary', sourceFor('permission', 'tax_effect', 'cast_punishment'), { focus_keys: unique(signals.filter((entry) => ['permission', 'tax_effect', 'cast_punishment'].some((key) => keyMatches(entry.key, key))).map((entry) => entry.key)) });

  add('protection', lanes.length ? 'Support' : 'Generic Utility', 'Protect the commander or its engine.');
  add('card_draw', 'Generic Utility', 'General deck support.');
  add('ramp', 'Generic Utility', 'General deck support.');
  add('removal', 'Generic Utility', 'General deck support.');
  if ((profile.color_identity || []).length > 1) add('mana_fixing', 'Generic Utility', 'Combined commander color identity requires fixing.');

  lanes.sort((a, b) => IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance] || a.display_label.localeCompare(b.display_label));
  return { schema_version: STRATEGY_LANE_SCHEMA_VERSION, commander_profile: profile, lanes };
}

export function buildStrategyLaneIndex(cards = []) {
  const profiles = cards.map((card) => card?.schema_version ? card : { ...card, ...buildSemanticCardProfile(card) });
  const byId = new Map();
  const postings = new Map();
  const add = (key, id) => { if (!postings.has(key)) postings.set(key, new Set()); postings.get(key).add(id); };
  for (const profile of profiles) {
    const id = String(profile.oracle_id);
    byId.set(id, profile);
    for (const group of FEATURE_GROUPS) for (const feature of values(profile, group)) { add(`${group}:${feature.key}`, id); add(`any:${feature.key}`, id); }
    for (const conversion of profile.conversions || []) { add(`conversion-from:${conversion.from}`, id); add(`conversion-to:${conversion.to}`, id); }
    for (const type of profile.types || []) add(`type:${type}`, id);
    for (const tribe of profile.tribal_roles || []) add(`tribe:${tribe.tribe}`, id);
    if (Number(profile.mana_value || 0) <= 2) add('cost:low', id);
    if (profile.sacrifice_outlet || profile.sacrifice_activation) add('special:sacrifice_outlet', id);
    if (profile.etb_multiplier) add('special:etb_multiplier', id);
  }
  return { schema_version: STRATEGY_LANE_SCHEMA_VERSION, profiles, by_id: byId, postings };
}

function retrievalKeys(lane) {
  const exact = (keys) => keys.flatMap((key) => FEATURE_GROUPS.map((group) => `${group}:${key}`).concat(`any:${key}`));
  switch (lane.lane_id) {
    case 'sacrifice_outlet': return ['special:sacrifice_outlet', 'conversion-to:sacrifice_event', ...exact(['sacrifice_event'])];
    case 'death_payoff': return [...exact(['creature_dies']), 'conversion-from:creature_dies'];
    case 'token_generation': return exact(['tokens', 'token_created', 'typed_token_maker']);
    case 'token_multiplier': return exact(['tokens', 'token_created', 'token_multiplier']);
    case 'graveyard_setup': return exact(['graveyard_population', 'self_mill', 'discard_to_own_graveyard', 'land_to_graveyard']);
    case 'recursion': return [...exact(['recursion', 'graveyard_recursion', 'cast_from_graveyard']), 'roles:recursion'];
    case 'counters': return exact(['counter_added', 'counters']);
    case 'proliferate': return exact(['proliferate', 'counter_amplification']);
    case 'blink': return exact(['blink']);
    case 'etb_payoff': return ['special:etb_multiplier', ...exact(['creature_enters', 'artifact_enters', 'enchantment_enters', 'etb:creature:you', 'etb:artifact:you', 'etb:enchantment:you'])];
    case 'tribal_support': return lane.tribes.flatMap((tribe) => [`any:tribe:${tribe}`, `tribe:${tribe}`]);
    case 'aura_support': return exact(['aura', 'aura_cast', 'equipment', 'attached', 'enchanted_creature']);
    case 'enchantment_support': return exact(['enchantment', 'enchantment_cast', 'enchantment_enters']);
    case 'artifact_support': return exact(['artifact', 'artifact_cast', 'artifact_enters', 'artifact_token']);
    case 'treasure': return exact(['treasure', 'token:treasure']);
    case 'spell_throughput': return [...exact(['mana_refund', 'cost_reduction', 'cards']), 'cost:low'];
    case 'cost_reduction': return exact(['cost_reduction', 'instant_sorcery_cost_reduction']);
    case 'extra_land_drops': return exact(['extra_land_drop', 'land_enters', 'land_played']);
    case 'land_recursion': return exact(['land_recursion', 'land_to_graveyard']);
    case 'extra_combat': return exact(['extra_combat', 'combat_phase']);
    case 'combat_enabler': return exact(['attacks', 'combat_damage', 'evasion']);
    case 'lifegain': return exact(['life_gained']);
    case 'group_slug': return exact(['opponent_life_loss', 'controlled_damage', 'all_player_damage', 'cast_punishment', 'land_punishment']);
    case 'control': return [...exact(['permission', 'tax_effect', 'cast_punishment']), 'roles:interaction'];
    case 'ramp': return ['roles:ramp', ...exact(['mana'])];
    case 'card_draw': return ['roles:card_draw', ...exact(['cards', 'card_drawn'])];
    case 'removal': return ['roles:removal', 'roles:interaction'];
    case 'protection': return ['roles:protection'];
    case 'mana_fixing': return ['roles:mana_fixing'];
    default: return exact(BASE_LANES[lane.lane_id]?.keys || []);
  }
}

function laneMatch(lane, profile) {
  const matches = matchingFeatures(profile, BASE_LANES[lane.lane_id]?.keys || []);
  switch (lane.lane_id) {
    case 'mill': return matches.some((entry) => entry.group === 'produces' && keyMatches(entry.key, 'opponent_mill'));
    case 'repeatable_mill': return matches.some((entry) => entry.group === 'produces' && keyMatches(entry.key, 'opponent_mill')) && (profile.delivery?.repeatability === 'persistent' || matches.some((entry) => entry.repeatable));
    case 'mill_multiplier': return matches.some((entry) => entry.group === 'enables' && keyMatches(entry.key, 'opponent_mill') && ['doubling', 'multiplier', 'scaling'].includes(entry.scaling));
    case 'mill_payoff': return matches.some((entry) => ['wants', 'rewards'].includes(entry.group));
    case 'sacrifice_outlet': return Boolean(profile.sacrifice_outlet || profile.sacrifice_activation || (profile.conversions || []).some((entry) => entry.to === 'sacrifice_event'));
    case 'death_payoff': return matches.some((entry) => ['wants', 'rewards'].includes(entry.group)) || (profile.conversions || []).some((entry) => entry.from === 'creature_dies');
    case 'token_generation': return matches.some((entry) => entry.group === 'produces');
    case 'token_multiplier': return matches.some((entry) => entry.group === 'enables' && (entry.scaling || /multipl|doubl/i.test(entry.evidence?.join(' ') || '')));
    case 'graveyard_setup': return matches.some((entry) => entry.group === 'produces' && entry.direction !== 'opponent');
    case 'recursion': return hasRole(profile, 'recursion') || matches.some((entry) => entry.group === 'produces');
    case 'counters': return matches.some((entry) => entry.group === 'produces');
    case 'proliferate': return matches.some((entry) => entry.group === 'produces');
    case 'blink': return matches.some((entry) => entry.group === 'produces');
    case 'etb_payoff': return Boolean(profile.etb_multiplier || matches.some((entry) => ['rewards', 'enables'].includes(entry.group)));
    case 'tribal_support': return lane.tribes.some((tribe) => (profile.tribal_roles || []).some((entry) => entry.tribe === tribe || entry.tribe === 'any' || entry.tribe === 'chosen') || featureEntries(profile).some((entry) => entry.key === `tribe:${tribe}` && ['wants', 'rewards', 'enables'].includes(entry.group)));
    case 'aura_support': return matches.some((entry) => ['produces', 'wants', 'rewards', 'enables', 'resources'].includes(entry.group));
    case 'enchantment_support': return matches.some((entry) => ['produces', 'wants', 'rewards', 'enables'].includes(entry.group));
    case 'artifact_support': return matches.some((entry) => ['produces', 'wants', 'rewards', 'enables'].includes(entry.group));
    case 'treasure': return matches.some((entry) => entry.group === 'produces' || entry.group === 'enables');
    case 'spell_throughput': {
      const keys = new Set(featureEntries(profile).map((entry) => entry.key));
      const isSpell = keys.has('instant_or_sorcery_cast');
      return isSpell && (keys.has('mana_refund') || keys.has('cost_reduction') || keys.has('cards') || Number(profile.mana_value || 0) <= 2);
    }
    case 'cost_reduction': return matches.some((entry) => entry.group === 'enables');
    case 'extra_land_drops': return matches.some((entry) => entry.group === 'produces' || entry.group === 'enables');
    case 'land_recursion': return matches.some((entry) => entry.group === 'produces' || hasRole(profile, 'recursion'));
    case 'extra_combat': return matches.some((entry) => entry.group === 'produces');
    case 'combat_enabler': return matches.some((entry) => ['produces', 'enables'].includes(entry.group));
    case 'lifegain': return matches.some((entry) => entry.group === 'produces' || entry.group === 'rewards');
    case 'group_slug': return matches.some((entry) => entry.group === 'rewards' || ((entry.group === 'produces' || entry.group === 'enables') && (profile.delivery?.repeatability === 'persistent' || /punish|prevent|can't gain/i.test(entry.evidence?.join(' ') || ''))));
    case 'control': return matches.length > 0 || hasRole(profile, 'interaction');
    case 'ramp': return hasRole(profile, 'ramp');
    case 'card_draw': return hasRole(profile, 'card_draw');
    case 'removal': return hasRole(profile, 'removal') || hasRole(profile, 'interaction');
    case 'protection': return hasRole(profile, 'protection');
    case 'mana_fixing': return hasRole(profile, 'mana_fixing');
    default: return matches.length > 0;
  }
}

function magnitudeValue(entry) {
  if (entry?.scaling === 'doubling') return 8;
  if (entry?.magnitude === 'scalable' || entry?.magnitude === 'x') return 7;
  if (entry?.magnitude === 'multiple') return 5;
  return Number(entry?.magnitude || 0) > 1 ? Math.min(7, Number(entry.magnitude)) : 1;
}

function scoreLaneCandidate(lane, commanderProfile, candidate) {
  const baseKeys = BASE_LANES[lane.lane_id]?.keys || [];
  const matches = matchingFeatures(candidate, baseKeys);
  const confidence = matches.reduce((sum, entry) => sum + Number(entry.confidence || 0.5), 0);
  const direct = matches.filter((entry) => ['produces', 'rewards', 'enables'].includes(entry.group)).length;
  const repeatable = candidate.delivery?.repeatability === 'persistent' || matches.some((entry) => entry.repeatable);
  const reliability = Number(candidate.delivery?.reliability || 0.5);
  const dependencies = Number(candidate.delivery?.condition_count || 0) + Number(Boolean(candidate.delivery?.threshold_condition)) + Number(Boolean(candidate.delivery?.opponent_action));
  const manaValue = Number(candidate.mana_value ?? candidate.cmc ?? 0);
  let roleScore = confidence * 14 + direct * 7 + reliability * 16 + (repeatable ? 8 : 0) - dependencies * 4 - Math.max(0, manaValue - 3) * 1.5;

  if (lane.lane_id === 'sacrifice_outlet') {
    const freeOutlet = Number(candidate.sacrifice_outlet?.mana_cost || 0) === 0 && !candidate.sacrifice_outlet?.requires_tap;
    roleScore += freeOutlet ? 38 : candidate.delivery?.repeatability === 'persistent' ? 18 : 5;
    roleScore += manaValue <= 1 ? 22 : 0;
  }
  if (lane.lane_id === 'death_payoff' && (candidate.conversions || []).some((entry) => entry.from === 'creature_dies')) roleScore += 38;
  if (lane.lane_id === 'death_payoff' && /dies,?\s+if\s+it\s+(?:had|has).*counter/i.test(candidate.oracle_text || '')) roleScore -= 48;
  if (lane.lane_id === 'repeatable_mill') roleScore += repeatable ? 22 : -20;
  if (lane.lane_id === 'mill_multiplier' || lane.lane_id === 'token_multiplier') roleScore += matches.reduce((sum, entry) => sum + magnitudeValue(entry) * 3, 0);
  if (lane.lane_id === 'token_generation' || lane.lane_id === 'mill') roleScore += matches.reduce((sum, entry) => sum + magnitudeValue(entry) * 2, 0);
  if (lane.lane_id === 'protection') roleScore += manaValue <= 2 ? 12 : 0;
  if (lane.lane_id === 'removal') roleScore += manaValue <= 3 ? 10 : 0;
  if (lane.lane_id === 'ramp') roleScore += manaValue <= 1 ? 32 : manaValue <= 2 ? 18 : manaValue <= 3 ? 6 : -4;
  if (lane.lane_id === 'tribal_support') roleScore += 18;
  if (lane.lane_id === 'spell_throughput') {
    const keys = new Set(featureEntries(candidate).map((entry) => entry.key));
    roleScore += keys.has('mana_refund') ? 55 : 0;
    roleScore += keys.has('cards') ? 18 : 0;
    roleScore += manaValue <= 2 ? 12 : 0;
  }
  if (lane.lane_id === 'graveyard_setup') {
    roleScore += candidate.graveyard_quality?.direction === 'self' ? 28 : -18;
    roleScore += candidate.graveyard_quality?.volume === 'high' ? 30 : candidate.graveyard_quality?.volume === 'medium' ? 20 : 0;
    roleScore += manaValue <= 2 ? 20 : 0;
    roleScore += candidate.delivery?.etb_only && candidate.delivery?.death_only ? 62 : 0;
  }
  if (lane.lane_id === 'artifact_support') {
    roleScore += matches.some((entry) => ['wants', 'rewards'].includes(entry.group)) ? 35 : 0;
    roleScore += featureEntries(candidate).some((entry) => entry.group === 'produces' && (entry.key === 'tokens' || entry.key === 'typed_token_maker')) ? 18 : 0;
  }
  if (lane.lane_id === 'etb_payoff' && candidate.etb_multiplier) roleScore += 50;
  if (lane.lane_id === 'lifegain') {
    const keys = new Set(featureEntries(candidate).map((entry) => entry.key));
    const entryEngine = ['creature_enters', 'etb:creature:you'].some((key) => [...keys].some((value) => keyMatches(value, key)));
    roleScore += (repeatable ? 36 : 0) + (manaValue <= 1 ? 48 : manaValue <= 2 ? 24 : 0) + (dependencies === 0 ? 15 : 0) + (entryEngine ? 42 : 0);
  }
  if (lane.lane_id === 'control') {
    const keys = new Set(featureEntries(candidate).map((entry) => entry.key));
    roleScore += keys.has('permission') ? 35 : 0;
    roleScore += manaValue <= 2 ? 18 : 0;
  }
  if (lane.lane_id === 'group_slug') roleScore += (repeatable ? 45 : 0) + (manaValue <= 3 ? 25 : 0) + (matches.some((entry) => keyMatches(entry.key, 'all_player_damage')) ? 30 : 0);
  if (lane.lane_id === 'aura_support') {
    const keys = new Set(featureEntries(candidate).map((entry) => entry.key));
    const scalableAttachment = keys.has('enchanted_creature') && (keys.has('aura') || keys.has('aura_cast') || keys.has('enchantment_cast'));
    roleScore += (manaValue <= 1 ? 32 : manaValue <= 2 ? 18 : 0) + (matches.some((entry) => ['rewards', 'enables'].includes(entry.group)) ? 28 : 0) + (matches.some((entry) => keyMatches(entry.key, 'attached') || keyMatches(entry.key, 'enchanted_creature')) ? 25 : 0) + (scalableAttachment ? 42 : 0);
  }
  if (lane.lane_id === 'tribal_support') roleScore += matches.some((entry) => entry.key.startsWith('tribe:') && ['wants', 'rewards', 'enables'].includes(entry.group)) ? 42 : 0;
  if (lane.lane_id === 'ramp' && manaValue <= 1 && featureEntries(candidate).some((entry) => entry.key === 'mana_fixing' || entry.key === 'mana')) roleScore += candidate.delivery?.repeatability === 'persistent' ? 62 : 32;
  if (lane.focus_keys?.length && featureEntries(candidate).some((entry) => lane.focus_keys.some((key) => keyMatches(entry.key, key)))) roleScore += 52;
  if (lane.lane_id === 'counters' && lane.counter_types?.length) {
    const candidateTypes = unique(matches.map((entry) => entry.counter_type));
    roleScore += candidateTypes.some((type) => lane.counter_types.includes(type)) ? 18 : candidateTypes.length ? -12 : 0;
  }
  const genericPenalty = lane.generic_utility ? 0 : matches.length === 0 ? 30 : 0;
  const score = Math.max(0, Number((roleScore - genericPenalty).toFixed(2)));
  const fit = score >= 95 ? 'Excellent Lane Fit' : score >= 70 ? 'Strong Lane Fit' : score >= 48 ? 'Moderate Lane Fit' : 'Limited Lane Fit';
  const commanderSpecific = !lane.generic_utility && (direct > 0 || lane.lane_id === 'tribal_support' || lane.lane_id === 'sacrifice_outlet');
  const matched = matches.sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))[0];
  const explanation = lane.generic_utility
    ? BASE_LANES[lane.lane_id].template
    : `${BASE_LANES[lane.lane_id].template}${matched?.evidence?.[0] ? ` ${matched.evidence[0]}` : ''}`;
  return { score, fit, commander_specific: commanderSpecific, explanation, dimensions: { semantic_confidence: Number(confidence.toFixed(2)), direct_edges: direct, repeatable, reliability, dependency_burden: dependencies, mana_value: manaValue, magnitude: Math.max(0, ...matches.map(magnitudeValue)) } };
}

function legalPool(commanderProfile, index) {
  const commanderIds = new Set(commanderProfile.members.map((member) => member.oracle_id));
  const cacheKey = [...(commanderProfile.color_identity || [])].sort().join('');
  index.legal_pool_cache ||= new Map();
  if (!index.legal_pool_cache.has(cacheKey)) index.legal_pool_cache.set(cacheKey, index.profiles.filter((card) => checkMechanicalCandidateLegality(commanderProfile, card).legal));
  return index.legal_pool_cache.get(cacheKey).filter((card) => !commanderIds.has(card.oracle_id));
}

export function buildStrategyLaneRecommendations(commanders, index, options = {}) {
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const started = now();
  const decomposition = deriveCommanderStrategyLanes(commanders);
  const profile = decomposition.commander_profile;
  const legalStarted = now();
  const legalCards = legalPool(profile, index);
  const legalFilterMs = now() - legalStarted;
  const legalIds = new Set(legalCards.map((card) => String(card.oracle_id)));
  const community = options.communityByOracleId instanceof Map ? options.communityByOracleId : new Map();
  const maximum = Math.max(1, Number(options.limitPerLane || 20));
  const minimumScore = Number(options.minimumScore ?? 36);
  let retrievalMs = 0;
  let rankingMs = 0;
  const lanes = decomposition.lanes.map((lane) => {
    const retrievalStarted = now();
    const ids = new Set();
    const keys = retrievalKeys(lane);
    for (const key of keys) for (const id of index.postings.get(key) || []) if (legalIds.has(id)) ids.add(id);
    const retrieved = [...ids].map((id) => index.by_id.get(id)).filter((card) => card && laneMatch(lane, card));
    retrievalMs += now() - retrievalStarted;
    const rankingStarted = now();
    const ranked = retrieved.map((card) => ({ card, result: scoreLaneCandidate(lane, profile, card) }))
      .filter(({ result }) => result.score >= minimumScore)
      .sort((left, right) => right.result.score - left.result.score || right.result.dimensions.direct_edges - left.result.dimensions.direct_edges || Number(right.result.dimensions.repeatable) - Number(left.result.dimensions.repeatable) || right.result.dimensions.reliability - left.result.dimensions.reliability || left.result.dimensions.dependency_burden - right.result.dimensions.dependency_burden || left.result.dimensions.mana_value - right.result.dimensions.mana_value || String(left.card.oracle_id).localeCompare(String(right.card.oracle_id)));
    rankingMs += now() - rankingStarted;
    const result = {
      ...lane,
      candidate_feature_query: keys,
      total_legal_pool: legalCards.length,
      semantic_candidates: retrieved.length,
      ranked_candidates: ranked.length,
      recommendations: ranked.slice(0, maximum).map(({ card, result }, rank) => ({
        rank: rank + 1, oracle_id: card.oracle_id, card_name: card.name || card.card_name,
        image_url: card.image_normal || card.image_url || null, mana_cost: card.mana_cost || '', mana_value: Number(card.mana_value ?? card.cmc ?? 0), type_line: card.type_line || '',
        lane_fit_score: result.score, lane_fit: result.fit, commander_specific: result.commander_specific,
        why_it_works: result.explanation, ranking_dimensions: result.dimensions,
        community_inclusion: community.get(String(card.oracle_id))?.inclusion_rate ?? null,
        community_observation_count: community.get(String(card.oracle_id))?.deck_count ?? 0,
        statistical_affinity: community.get(String(card.oracle_id))?.synergy_score ?? null
      }))
    };
    if (options.includeDiagnostics) result.diagnostics = { retrieved_oracle_ids: retrieved.map((card) => card.oracle_id), ranked: ranked.map(({ card, result: score }, rank) => ({ oracle_id: card.oracle_id, rank: rank + 1, score: score.score })) };
    return result;
  });
  return {
    schema_version: STRATEGY_LANE_SCHEMA_VERSION,
    generated_at: options.generatedAt || new Date().toISOString(),
    commander_identity: profile.commander_identity,
    commander_names: profile.commander_names,
    color_identity: profile.color_identity,
    old_global_candidates: index.profiles.length,
    total_legal_pool: legalCards.length,
    performance: { legal_filter_ms: Number(legalFilterMs.toFixed(3)), lane_retrieval_ms: Number(retrievalMs.toFixed(3)), lane_ranking_ms: Number(rankingMs.toFixed(3)), total_ms: Number((now() - started).toFixed(3)) },
    strategy_interpretation: lanes.map(({ lane_id, display_label, importance, source_commander_mechanic, semantic_need }) => ({ lane_id, display_label, importance, source_commander_mechanic, semantic_need })),
    lanes
  };
}
