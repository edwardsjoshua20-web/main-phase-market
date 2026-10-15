import { parseOracleSemantics } from '../instajudge/magic/runtime/oracleSemantics.js';
import {
  buildCommanderSemanticProfile,
  buildSemanticCardProfile,
  checkMechanicalCandidateLegality
} from './mechanicalChemistryCore.js';

export const COMMANDER_STRATEGY_COMPILER_VERSION = 1;

const FEATURE_GROUPS = Object.freeze(['produces', 'wants', 'rewards', 'enables', 'roles', 'resources']);
const GENERIC_STRATEGIES = new Set(['ramp', 'card_draw', 'protection', 'control']);

const STRATEGIES = Object.freeze({
  mill: { label: 'Mill', query: ['opponent_mill'], explanation: 'Advances the opponent-mill events identified in the commander graph.' },
  self_mill: { label: 'Self-Mill', query: ['self_mill', 'graveyard_population', 'own_graveyard_population'], explanation: 'Loads your own graveyard, supplying the graveyard resources the commander uses.' },
  graveyard: { label: 'Graveyard', query: ['graveyard_population', 'self_mill', 'discard_to_own_graveyard'], explanation: 'Builds the graveyard resource required by the commander’s mechanics.' },
  reanimator: { label: 'Reanimator', query: ['recursion', 'graveyard_recursion'], explanation: 'Moves a permanent from the graveyard back to the battlefield.' },
  lands: { label: 'Lands', query: ['land_enters', 'land_to_graveyard', 'land_recursion', 'extra_land_play'], explanation: 'Supplies or reuses lands along the commander’s land-resource chain.' },
  landfall: { label: 'Landfall', query: ['land_enters', 'etb:land:you', 'extra_land_play'], explanation: 'Creates or rewards land-entry events inferred from the commander’s rules graph.' },
  aristocrats: { label: 'Aristocrats', query: ['creature_dies', 'sacrifice_event', 'token_created'], explanation: 'Connects expendable creatures and sacrifice events to the commander’s death payoff.' },
  sacrifice: { label: 'Sacrifice', query: ['sacrifice_event', 'creature_dies'], explanation: 'Creates the sacrifice event consumed or rewarded by the commander.' },
  tokens: { label: 'Tokens', query: ['token_created', 'tokens', 'typed_token_maker'], explanation: 'Creates or amplifies the token resource represented in the commander graph.' },
  spellslinger: { label: 'Spellslinger', query: ['noncreature_spell_cast', 'instant_or_sorcery_cast', 'spell_cast', 'cost_reduction'], explanation: 'Creates more qualifying spell-cast events without changing printed mana value.' },
  lifegain: { label: 'Lifegain', query: ['life_gained'], explanation: 'Creates life-gain events that the commander produces or rewards.' },
  life_loss: { label: 'Opponent Life Loss', query: ['opponent_life_loss', 'controlled_damage'], explanation: 'Causes opponent life loss on the axis used by the commander.' },
  group_slug: { label: 'Group Slug', query: ['opponent_life_loss', 'all_player_damage', 'cast_punishment', 'land_punishment'], explanation: 'Applies repeatable pressure to multiple opponents.' },
  counters: { label: 'Counters', query: ['counter_added', 'counters', 'plus_one_counters'], explanation: 'Creates or uses the counter events represented in the commander graph.' },
  proliferate: { label: 'Proliferate', query: ['proliferate', 'counter_amplification'], explanation: 'Amplifies counter resources already established by the commander.' },
  blink: { label: 'Blink', query: ['blink'], explanation: 'Repeats a battlefield entry by exiling and returning a permanent.' },
  etb: { label: 'ETB', query: ['creature_enters', 'artifact_enters', 'enchantment_enters'], explanation: 'Creates or rewards the relevant permanent-enter event.' },
  artifacts: { label: 'Artifacts', query: ['artifact', 'artifact_cast', 'artifact_enters', 'artifact_token'], explanation: 'Creates or rewards artifact objects and artifact-entry events.' },
  treasure: { label: 'Treasure', query: ['treasure', 'treasure_tokens', 'token:treasure'], explanation: 'Creates Treasure, which supplies both artifact and mana resources.' },
  enchantress: { label: 'Enchantress', query: ['enchantment_cast', 'enchantment_enters', 'enchantment'], explanation: 'Creates or rewards enchantment-cast and enchantment-entry events.' },
  aura_voltron: { label: 'Auras / Voltron', query: ['aura', 'aura_cast', 'attachment', 'enchanted_creature'], explanation: 'Attaches enhancements to the creature the commander plan is building around.' },
  tribal: { label: 'Tribal', query: [], explanation: 'Supports the exact creature type named by the commander.' },
  combat: { label: 'Combat', query: ['attacks', 'combat_damage', 'evasion'], explanation: 'Creates the attack or combat-damage event rewarded by the commander.' },
  extra_combat: { label: 'Extra Combat', query: ['extra_combat', 'combat_phase'], explanation: 'Repeats attack and combat-damage opportunities.' },
  control: { label: 'Control', query: ['permission', 'tax_effect', 'cast_punishment', 'interaction'], explanation: 'Constrains opposing actions while supporting the commander’s control plan.' },
  recursion: { label: 'Recursion', query: ['recursion', 'graveyard_recursion', 'cast_from_graveyard'], explanation: 'Reuses cards from the graveyard along the commander’s resource loop.' },
  ramp: { label: 'Ramp', query: ['mana', 'ramp'], explanation: 'Supplies generic mana acceleration without claiming unique commander chemistry.' },
  card_draw: { label: 'Card Draw', query: ['cards', 'card_drawn', 'card_draw'], explanation: 'Supplies generic card advantage or a directly connected draw event.' },
  protection: { label: 'Protection', query: ['protection'], explanation: 'Protects the commander or a central engine permanent.' }
});

const EFFECT_ACTIONS = Object.freeze({
  MillEffect: 'mill', DrawEffect: 'draw', DamageEffect: 'deal_damage', LifeChange: 'change_life',
  TokenCreation: 'create_token', ZoneChangeEffect: 'move_zone', SacrificeEffect: 'sacrifice',
  CounterModification: 'modify_counters', CopyEffect: 'copy', ExileEffect: 'exile',
  DiscardEffect: 'discard', SearchEffect: 'tutor', TapChangeEffect: 'tap_or_untap',
  DestroyEffect: 'destroy', CounterEffect: 'counter_spell', AttachEffect: 'attach'
});

const EVENT_MAP = Object.freeze({
  CreatureDied: 'creature_died', PermanentEntered: 'permanent_entered_battlefield',
  SpellCast: 'spell_cast', AttackDeclared: 'attack_declared', BlockDeclared: 'block_declared',
  DamageDealt: 'damage_dealt', LifeGained: 'life_gained', LifeLost: 'life_lost',
  StepBegan: 'step_began', EndOfCombat: 'end_of_combat'
});

function unique(values) { return [...new Set(values.filter(Boolean))]; }
function normalize(value) { return String(value || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim(); }
function amountValue(amount) { return amount?.kind === 'fixed' ? amount.value : amount?.kind === 'ChosenX' ? 'X' : amount?.value || null; }
function edgeKey(from, relation, to) { return `${from}|${relation}|${to}`; }

function semanticEntries(profile) {
  return FEATURE_GROUPS.flatMap((group) => (profile?.[group] || []).map((entry) => ({ ...entry, group })));
}

function semanticKeys(profile, { strategicOnly = false } = {}) {
  return new Set(semanticEntries(profile)
    .filter((entry) => !strategicOnly || entry.source_kind !== 'card_type')
    .map((entry) => entry.key));
}

function effectToAction(effect) {
  const action = effect.type === 'LifeChange'
    ? effect.direction === 'gain' ? 'gain_life' : effect.direction === 'lose' ? 'lose_life' : 'change_life'
    : EFFECT_ACTIONS[effect.type] || 'unsupported';
  return {
    action,
    effect_type: effect.type,
    amount: amountValue(effect.amount),
    subject: effect.subject || null,
    target: effect.target || null,
    from_zone: effect.from || effect.zone || null,
    to_zone: effect.to || effect.destination || null,
    object_type: effect.token?.types?.[0]?.toLowerCase() || effect.criteria?.type || null,
    counter_type: effect.counter || null,
    direction: effect.direction || null,
    text: effect.text || null
  };
}

function regexFallbackActions(text) {
  const value = normalize(text);
  return unique([
    /\bmill(?:s|ed)?\b|put the top [^.]+ into [^.]+ graveyard/.test(value) && 'mill',
    /\bdraws?\b/.test(value) && 'draw',
    /\bcreate[s]?\b[^.]*\btoken/.test(value) && 'create_token',
    /\bdeals?\b[^.]*\bdamage/.test(value) && 'deal_damage',
    /\bgain[s]?\b[^.]*\blife/.test(value) && 'gain_life',
    /\bloses?\b[^.]*\blife/.test(value) && 'lose_life',
    /\bsacrifice[s]?\b/.test(value) && 'sacrifice',
    /\bdiscard[s]?\b/.test(value) && 'discard',
    /\badd\b[^.]*\bmana|add \{/.test(value) && 'add_mana',
    /\bput\b[^.]*\bcounters?\b|\benters? with\b[^.]*\bcounters?\b|\bproliferate\b/.test(value) && 'modify_counters',
    /\breturn\b[^.]*\bgraveyard\b|\bcast\b[^.]*\bgraveyard\b/.test(value) && 'recur',
    /\bexile\b[^.]*\breturn\b[^.]*\bbattlefield\b/.test(value) && 'blink',
    /\bcopy\b/.test(value) && 'copy',
    /\bsearch your library\b/.test(value) && 'tutor',
    /\buntap\b/.test(value) && 'untap',
    /\badditional combat\b/.test(value) && 'extra_combat',
    /\btriggers? an additional time\b|\btriggers? twice\b/.test(value) && 'amplify_trigger',
    /\bcosts?\b[^.]*\bless to cast\b/.test(value) && 'reduce_cost',
    /\bplay an additional land\b/.test(value) && 'extra_land_play',
    /\bspells?\b[^.]*\bcost\b[^.]*\bmore to cast\b/.test(value) && 'tax_spells',
    /\bhave vigilance|\bhave lifelink|\bgains? (?:hexproof|indestructible|protection)/.test(value) && 'grant_ability'
  ]).map((action) => ({ action, source: 'semantic_fallback', text }));
}

function fallbackCondition(text) {
  const value = normalize(text);
  const rules = [
    [/\bcreature dying\b|\bcreature dies\b/, 'creature_died'],
    [/\bwould mill\b|\bcards? (?:is|are) put into an opponent's graveyard from their library\b/, 'opponent_mill'],
    [/\b(?:one or more )?cards? leave(?:s)? your graveyard\b/, 'card_left_graveyard'],
    [/\bland enters\b/, 'land_entered_battlefield'],
    [/\bcast (?:a|your first) noncreature spell\b/, 'noncreature_spell_cast'],
    [/\bcast (?:an|a) instant or sorcery\b/, 'instant_or_sorcery_cast'],
    [/\bcast (?:a|your first) spell\b/, 'spell_cast'],
    [/\bcreature attacks\b|\bthis creature attacks\b|\byou attack\b/, 'attack_declared'],
    [/\bdeals combat damage\b/, 'combat_damage'],
    [/\bgain life\b/, 'life_gained'],
    [/\bplayer lost\b[^.]*\blife\b|\bopponent loses life\b/, 'life_lost'],
    [/\bartifact is sacrificed\b|\byou sacrifice\b/, 'permanent_sacrificed'],
    [/\bcounter(?:s)? (?:is|are) put\b/, 'counter_changed'],
    [/\benters the battlefield\b|\benters\b/, 'permanent_entered_battlefield']
  ];
  const event = rules.find(([pattern]) => pattern.test(value))?.[1] || null;
  return event ? { event, filter: {}, intervening_if: /\bif\b/.test(value) ? text : null } : null;
}

function transitionsFromText(text) {
  const value = normalize(text);
  const transitions = [];
  const add = (from, to, objectType, evidence) => transitions.push({ from, to, object_type: objectType || 'card', evidence });
  if (/return [^.]*land card[^.]*from your graveyard[^.]*to the battlefield/.test(value)) add('graveyard', 'battlefield', 'land', text);
  else if (/return [^.]*creature card[^.]*from your graveyard[^.]*to the battlefield/.test(value)) add('graveyard', 'battlefield', 'creature', text);
  else if (/return [^.]*card[^.]*from your graveyard[^.]*to the battlefield/.test(value)) add('graveyard', 'battlefield', 'permanent', text);
  if (/return [^.]*from your graveyard[^.]*to your hand/.test(value)) add('graveyard', 'hand', /land card/.test(value) ? 'land' : /creature card/.test(value) ? 'creature' : 'card', text);
  if (/put the top [^.]*cards? of your library into your graveyard|you mill/.test(value)) add('library', 'graveyard', 'card', text);
  if (/discard/.test(value)) add('hand', 'graveyard', 'card', text);
  if (/sacrifice/.test(value) || /dies?/.test(value)) add('battlefield', 'graveyard', /creature/.test(value) ? 'creature' : 'permanent', text);
  if (/exile [^.]*then return [^.]*battlefield|exile [^.]*return (?:it|that card) to the battlefield/.test(value)) {
    add('battlefield', 'exile', 'permanent', text);
    add('exile', 'battlefield', 'permanent', text);
  }
  if (/play [^.]*from your graveyard/.test(value)) add('graveyard', 'battlefield', /land/.test(value) ? 'land' : 'card', text);
  if (/cast [^.]*permanent spell[^.]*from your graveyard/.test(value)) add('graveyard', 'battlefield', 'permanent', text);
  return transitions;
}

function outputsForAction(action) {
  const outputs = [];
  const add = (kind, key, metadata = {}) => outputs.push({ kind, key, ...metadata });
  switch (action.action) {
    case 'mill': add('event', action.subject === 'you' ? 'self_mill' : 'mill'); add('resource', action.subject === 'you' ? 'cards_in_own_graveyard' : 'cards_in_opponent_graveyard'); break;
    case 'draw': add('event', 'card_drawn'); add('resource', 'cards_in_hand'); break;
    case 'deal_damage': add('event', 'damage_dealt'); add('event', 'opponent_lost_life'); break;
    case 'gain_life': add('event', 'life_gained'); add('resource', 'life_total'); break;
    case 'lose_life': add('event', 'life_lost'); break;
    case 'create_token': add('event', 'token_created'); add('event', 'creature_entered_battlefield'); add('resource', 'expendable_creature'); break;
    case 'sacrifice': add('event', 'permanent_sacrificed'); add('event', 'creature_died'); add('resource', 'card_in_graveyard'); break;
    case 'add_mana': add('resource', 'mana'); break;
    case 'modify_counters': add('event', 'counter_changed'); add('resource', 'counters'); break;
    case 'recur': add('event', 'card_left_graveyard'); add('resource', 'reused_card'); break;
    case 'blink': add('event', 'permanent_left_battlefield'); add('event', 'permanent_entered_battlefield'); break;
    case 'extra_combat': add('event', 'combat_phase'); add('event', 'attack_opportunity'); break;
    case 'amplify_trigger': add('event', 'trigger_repeated'); break;
    case 'reduce_cost': add('resource', 'cost_reduction'); break;
    case 'extra_land_play': add('event', 'land_entered_battlefield'); add('resource', 'land_resource_increased'); break;
    case 'tax_spells': add('resource', 'tax_effect'); break;
    case 'grant_ability': add('resource', 'enhanced_permanent'); break;
    default: break;
  }
  return outputs;
}

function outputsForTransition(transition) {
  const outputs = [{ kind: 'event', key: `zone:${transition.from}->${transition.to}` }];
  if (transition.from === 'graveyard') outputs.push({ kind: 'event', key: 'card_left_graveyard' });
  if (transition.to === 'graveyard') outputs.push({ kind: 'resource', key: 'card_in_graveyard' });
  if (transition.to === 'battlefield') outputs.push({ kind: 'event', key: 'permanent_entered_battlefield' });
  if (transition.to === 'battlefield' && transition.object_type === 'land') outputs.push({ kind: 'event', key: 'land_entered_battlefield' }, { kind: 'resource', key: 'land_resource_increased' });
  if (transition.to === 'battlefield' && transition.object_type === 'creature') outputs.push({ kind: 'event', key: 'creature_entered_battlefield' }, { kind: 'resource', key: 'creature_available' });
  return outputs;
}

function compileMember(card) {
  const normalizedCard = { ...card, oracleText: card.oracle_text || card.oracleText || '', typeLine: card.type_line || card.typeLine || '' };
  const semanticProfile = card?.schema_version ? card : { ...card, ...buildSemanticCardProfile(card) };
  const ir = parseOracleSemantics(normalizedCard);
  const abilities = [];
  const addAbility = (kind, ability, source = 'rules_ir') => {
    const actions = (ability.effects || []).map(effectToAction).filter((entry) => entry.action !== 'unsupported');
    const fallback = regexFallbackActions(ability.text || '').filter((entry) => !actions.some((existing) => existing.action === entry.action));
    const transitions = unique((ability.effects || []).filter((effect) => effect.type === 'ZoneChangeEffect').map((effect) => `${effect.from || 'unknown'}|${effect.to || effect.destination || 'unknown'}|${effect.criteria?.type || 'card'}`))
      .map((entry) => { const [from, to, object_type] = entry.split('|'); return { from, to, object_type, evidence: ability.text }; })
      .concat(transitionsFromText(ability.text || ''));
    const condition = ability.event?.eventType ? {
      event: EVENT_MAP[ability.event.eventType] || ability.event.eventType,
      filter: ability.event.filter || {},
      intervening_if: ability.condition?.text || null
    } : ability.conditions?.length ? { event: 'condition', filters: ability.conditions } : fallbackCondition(ability.text || '');
    abilities.push({
      ability_id: `${semanticProfile.oracle_id}:${abilities.length + 1}`,
      kind,
      source,
      text: ability.text || '',
      condition,
      costs: ability.costs || [],
      restrictions: ability.restrictions || [],
      targets: ability.targets || [],
      modes: ability.modes || [],
      actions: [...actions, ...fallback],
      transitions,
      outputs: [...actions, ...fallback].flatMap(outputsForAction).concat(transitions.flatMap(outputsForTransition))
    });
  };
  for (const ability of ir.triggeredAbilitiesIR || []) addAbility('triggered', ability);
  for (const ability of ir.activatedAbilitiesIR || []) addAbility('activated', ability);
  for (const ability of ir.spellAbilities || []) addAbility('spell', ability);
  for (const effect of ir.replacementEffects || []) addAbility('replacement', { ...effect, effects: [], text: effect.text });
  for (const effect of ir.staticEffects || []) addAbility('static', { effects: [effect], text: effect.text });
  for (const modifier of ir.costModifiers || []) addAbility('static', { effects: [], text: modifier.text, restrictions: [modifier] });

  const seenText = abilities.map((ability) => normalize(ability.text)).filter(Boolean);
  const clauses = String(normalizedCard.oracleText).split(/\n+|(?<=\.)\s+/).map((text) => text.trim()).filter((text) => text && !/^partner$|^choose a background$/i.test(text));
  for (const clause of clauses) {
    if (seenText.some((text) => text === normalize(clause))) continue;
    if (/^(?:if|otherwise|then)\b/i.test(clause) && abilities.length) {
      const previous = abilities.at(-1);
      const combined = `${previous.text} ${clause}`;
      const actions = regexFallbackActions(combined).filter((entry) => !previous.actions.some((existing) => existing.action === entry.action));
      const transitions = transitionsFromText(combined).filter((entry) => !previous.transitions.some((existing) => existing.from === entry.from && existing.to === entry.to && existing.object_type === entry.object_type));
      previous.text = combined;
      previous.actions.push(...actions);
      previous.transitions.push(...transitions);
      previous.outputs.push(...actions.flatMap(outputsForAction), ...transitions.flatMap(outputsForTransition));
      continue;
    }
    const actions = regexFallbackActions(clause);
    const transitions = transitionsFromText(clause);
    const condition = fallbackCondition(clause);
    if (!actions.length && !transitions.length && !condition) continue;
    abilities.push({ ability_id: `${semanticProfile.oracle_id}:${abilities.length + 1}`, kind: /^whenever|^when |^at /i.test(clause) ? 'triggered' : clause.includes(':') ? 'activated' : /\binstead\b/i.test(clause) ? 'replacement' : 'static', source: 'semantic_fallback', text: clause, condition, costs: [], restrictions: [], targets: [], modes: [], actions, transitions, outputs: actions.flatMap(outputsForAction).concat(transitions.flatMap(outputsForTransition)) });
  }
  return { name: semanticProfile.name, oracle_id: semanticProfile.oracle_id, oracle_text: semanticProfile.oracle_text, type_line: semanticProfile.type_line, mana_value: semanticProfile.mana_value, color_identity: semanticProfile.color_identity, semantic_profile: semanticProfile, rules_ir_coverage: ir.coverage, abilities };
}

function buildGraph(members) {
  const nodes = new Map();
  const edges = new Map();
  const addNode = (id, type, label = id, metadata = {}) => { if (!nodes.has(id)) nodes.set(id, { id, type, label, ...metadata }); return id; };
  const addEdge = (from, relation, to, evidence, derived = false) => {
    addNode(from, from.split(':')[0], from.split(':').slice(1).join(':') || from);
    addNode(to, to.split(':')[0], to.split(':').slice(1).join(':') || to);
    const key = edgeKey(from, relation, to);
    if (!edges.has(key)) edges.set(key, { from, relation, to, evidence: unique([evidence]), derived });
    else edges.get(key).evidence = unique([...edges.get(key).evidence, evidence]);
  };
  for (const member of members) {
    for (const ability of member.abilities) {
      const abilityNode = addNode(`ability:${ability.ability_id}`, 'ability', `${member.name}: ${ability.kind}`, { member: member.name, text: ability.text });
      if (ability.condition?.event) addEdge(`event:${ability.condition.event}`, 'TRIGGERS', abilityNode, ability.text);
      for (const cost of ability.costs) addEdge(`resource:${cost.costType}`, 'CONSUMES', abilityNode, ability.text);
      for (const action of ability.actions) addEdge(abilityNode, 'PRODUCES', `action:${action.action}`, action.text || ability.text);
      for (const transition of ability.transitions) {
        const transitionNode = `transition:${transition.from}->${transition.to}:${transition.object_type}`;
        addEdge(abilityNode, 'PRODUCES', transitionNode, transition.evidence || ability.text);
        for (const output of outputsForTransition(transition)) addEdge(transitionNode, 'PRODUCES', `${output.kind}:${output.key}`, transition.evidence || ability.text, true);
      }
      for (const output of ability.outputs) addEdge(abilityNode, 'PRODUCES', `${output.kind}:${output.key}`, ability.text, output.kind !== 'action');
    }
    for (const entry of member.semantic_profile.wants || []) addEdge(`event:${entry.key}`, 'TRIGGERS', `reward:${member.oracle_id}:${entry.key}`, entry.evidence?.[0], false);
    for (const entry of member.semantic_profile.rewards || []) addEdge(`event:${entry.key}`, 'REWARDS', `output:${entry.key}`, entry.evidence?.[0], false);
    for (const conversion of member.semantic_profile.conversions || []) addEdge(`resource:${conversion.from}`, 'CONVERTS', `resource:${conversion.to}`, conversion.evidence, false);
  }
  const consequenceRules = [
    ['event:token_created', 'PRODUCES', 'resource:expendable_creature'],
    ['resource:expendable_creature', 'ENABLES', 'event:creature_died'],
    ['event:creature_died', 'PRODUCES', 'resource:card_in_graveyard'],
    ['event:self_mill', 'PRODUCES', 'resource:cards_in_own_graveyard'],
    ['event:land_entered_battlefield', 'TRIGGERS', 'event:landfall'],
    ['event:permanent_entered_battlefield', 'ENABLES', 'event:etb'],
    ['event:card_left_graveyard', 'ENABLES', 'resource:graveyard_reuse'],
    ['resource:treasure', 'CONVERTS', 'resource:mana'],
    ['event:damage_dealt', 'PRODUCES', 'event:opponent_lost_life'],
    ['event:attack_declared', 'ENABLES', 'event:combat_damage']
  ];
  for (const [from, relation, to] of consequenceRules) if (nodes.has(from)) addEdge(from, relation, to, 'Deterministic Magic consequence.', true);

  const needRules = [
    ['event:creature_died', 'need:expendable_creatures', 'Death engines need creatures that can be expended.'],
    ['event:creature_died', 'need:repeatable_death_source', 'A repeatable death payoff needs a repeatable death or sacrifice source.'],
    ['event:card_left_graveyard', 'need:graveyard_population', 'Cards must first reach the graveyard before they can leave it.'],
    ['event:card_left_graveyard', 'need:repeatable_graveyard_exit', 'A graveyard-exit reward needs recursion, casting, or another repeatable exit.'],
    ['event:land_entered_battlefield', 'need:land_access', 'Land-entry rewards require lands to play or return.'],
    ['event:land_entered_battlefield', 'need:extra_land_play_or_recursion', 'Repeated land-entry events need extra land plays or land recursion.'],
    ['event:noncreature_spell_cast', 'need:qualifying_noncreature_spells', 'The trigger requires noncreature spells that meet its restrictions.'],
    ['event:instant_or_sorcery_cast', 'need:qualifying_instants_or_sorceries', 'The trigger requires instants or sorceries to cast.'],
    ['event:attack_declared', 'need:repeatable_attack_access', 'Attack rewards need creatures able to attack repeatedly.'],
    ['event:opponent_lost_life', 'need:repeatable_opponent_life_loss', 'Life-loss rewards need reliable ways to make opponents lose life.']
  ];
  for (const [event, need, evidence] of needRules) if (nodes.has(event)) addEdge(event, 'REQUIRES', need, evidence, true);
  if (nodes.has('action:amplify_trigger')) addEdge('action:amplify_trigger', 'AMPLIFIES', 'event:trigger_repeated', 'The effect repeats a qualifying trigger.', true);
  if (nodes.has('action:blink')) addEdge('action:blink', 'REPEATS', 'event:permanent_entered_battlefield', 'Blink repeats a permanent-entry event.', true);
  if (nodes.has('action:extra_combat')) addEdge('action:extra_combat', 'REPEATS', 'event:attack_declared', 'An additional combat creates another attack opportunity.', true);
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}

function graphSignals(graph, commanderProfile) {
  const signals = new Set();
  for (const node of graph.nodes) signals.add(node.id.replace(/^(event|resource|action|output):/, ''));
  for (const group of ['produces', 'wants', 'rewards', 'enables']) for (const entry of commanderProfile[group] || []) if (entry.source_kind !== 'card_type') signals.add(entry.key);
  return signals;
}

function inferStrategies(graph, commanderProfile) {
  const signals = graphSignals(graph, commanderProfile);
  const has = (...keys) => keys.some((key) => signals.has(key) || [...signals].some((value) => value.startsWith(`${key}:`)));
  const oracle = normalize(commanderProfile.members.map((member) => member.oracle_text).join('\n'));
  const groups = Object.fromEntries(['produces', 'wants', 'rewards', 'enables'].map((group) => [group, new Set((commanderProfile[group] || []).filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key))]));
  const groupHas = (groupNames, ...keys) => groupNames.some((group) => keys.some((key) => groups[group].has(key) || [...groups[group]].some((value) => value.startsWith(`${key}:`))));
  const strategies = [];
  const add = (id, importance, causes, indirect = false, confidence = 1, searchContext = {}) => {
    if (!STRATEGIES[id] || strategies.some((entry) => entry.strategy_id === id)) return;
    strategies.push({ strategy_id: id, label: STRATEGIES[id].label, importance, inferred_from: causes, indirect, confidence, search_context: searchContext });
  };
  if (has('opponent_mill')) add('mill', 'Primary', ['opponent_mill']);
  if (has('self_mill', 'own_graveyard_population')) add('self_mill', 'Primary', ['self_mill']);
  if (/graveyard/.test(oracle) && has('graveyard_population', 'card_in_graveyard', 'cards_in_own_graveyard', 'cast_from_graveyard', 'land_to_graveyard', 'recursion')) add('graveyard', has('self_mill', 'cast_from_graveyard', 'land_to_graveyard') ? 'Primary' : 'Secondary', ['graveyard resource']);
  if (/(?:return|put) [^.]*(?:creature|permanent) (?:card )?from (?:your|a) graveyard[^.]*battlefield|cast [^.]*permanent spell[^.]*from your graveyard/.test(oracle)) add('reanimator', 'Primary', ['graveyard → battlefield']);
  if (/\blands?\b/.test(oracle) && has('land_enters', 'land_to_graveyard', 'land_recursion', 'land_resource_increased', 'extra_land_play', 'card_left_graveyard')) add('lands', 'Primary', ['land resource']);
  if (groupHas(['wants', 'rewards', 'enables'], 'land_enters', 'etb:land:you') || has('land_entered_battlefield')) add('landfall', has('land_entered_battlefield') ? 'Secondary' : 'Primary', ['land entered battlefield'], !groupHas(['wants', 'rewards'], 'land_enters', 'etb:land:you'));
  if (/\bsacrific/.test(oracle) || groupHas(['wants', 'rewards', 'enables'], 'creature_dies', 'sacrifice_event')) add('sacrifice', groupHas(['wants', 'rewards'], 'sacrifice_event', 'creature_dies') ? 'Primary' : 'Secondary', ['sacrifice/death event']);
  if (has('creature_dies') && has('token_created', 'tokens', 'expendable_creature', 'sacrifice_event')) add('aristocrats', 'Primary', ['expendable creature', 'creature death'], true);
  if (groupHas(['produces', 'enables', 'wants', 'rewards'], 'token_created', 'tokens', 'creature_tokens')) add('tokens', 'Primary', ['token_created']);
  if (has('instant_or_sorcery_cast', 'noncreature_spell_cast')) {
    const manaValueFloor = oracle.match(/mana value (\d+) or greater/)?.[1];
    add('spellslinger', 'Primary', ['qualifying spell cast'], false, 1, {
      preserves_printed_mana_value_under_cost_reduction: true,
      minimum_printed_mana_value: manaValueFloor ? Number(manaValueFloor) : null
    });
  }
  if (has('life_gained')) add('lifegain', has('opponent_life_loss') ? 'Secondary' : 'Primary', ['life_gained']);
  if (has('opponent_life_loss', 'controlled_damage')) add('life_loss', 'Primary', ['opponent life loss']);
  if (has('all_player_damage', 'cast_punishment', 'land_punishment') || (has('opponent_life_loss') && /each opponent|each player's upkeep|each opponent's upkeep/.test(oracle))) add('group_slug', 'Secondary', ['repeatable multi-opponent pressure']);
  if (/\bcounters?\b|\bproliferate\b/.test(oracle) && has('counter_added', 'counters', 'plus_one_counters', 'counter_changed')) add('counters', 'Primary', ['counter_changed'], false, 1, { counter_types: commanderProfile.members.flatMap((member) => member.counter_types || []) });
  if (has('proliferate', 'counter_amplification')) add('proliferate', 'Secondary', ['counter amplification']);
  if (has('blink', 'zone:battlefield->exile', 'zone:exile->battlefield')) add('blink', 'Primary', ['battlefield → exile → battlefield']);
  const positiveSelfEtb = /\bwhen [^.]{0,60} enters,? [^.]{0,20}(?:create|draw|deal|gain|put)/.test(oracle);
  const repeatedEtb = /\bwhenever (?:another|a|an|one or more) [^.]{0,60} enters/.test(oracle);
  if (has('blink') || repeatedEtb || positiveSelfEtb) add('etb', has('blink') ? 'Secondary' : 'Primary', ['permanent entered battlefield']);
  if (/\bartifacts?\b|\bequipment\b/.test(oracle) && groupHas(['produces', 'wants', 'rewards', 'enables'], 'artifact_cast', 'artifact_enters', 'artifact', 'equipment')) add('artifacts', 'Primary', ['artifact event/resource']);
  if (/\btreasure\b/.test(oracle) && has('treasure', 'treasure_tokens', 'token:treasure')) add('treasure', 'Primary', ['Treasure token']);
  if (groupHas(['wants', 'rewards', 'enables'], 'enchantment_cast', 'enchantment_enters', 'enchantment')) add('enchantress', 'Primary', ['enchantment event']);
  if (has('aura', 'aura_cast', 'attachment', 'enchanted_creature', 'equipment')) add('aura_voltron', 'Primary', ['attachment event']);
  const tribalSignals = unique([...groups.wants, ...groups.rewards, ...groups.enables].filter((key) => key.startsWith('tribe:')).map((key) => key.slice(6)));
  const tribes = tribalSignals.filter((value) => value.length > 2 && !['this', 'that', 'other', 'and', 'the', 'all', 'each', 'target', 'one'].includes(value));
  if (tribes.length) add('tribal', 'Primary', [`exact tribes: ${tribes.join(', ')}`], false, 1, { tribes });
  if (groupHas(['wants', 'rewards', 'enables'], 'attacks', 'combat_damage') || has('extra_combat', 'attack_declared')) add('combat', 'Primary', ['attack/combat damage']);
  if (has('extra_combat', 'combat_phase')) add('extra_combat', 'Secondary', ['additional combat']);
  if (has('permission', 'tax_effect', 'cast_punishment', 'control_inevitability')) add('control', 'Primary', ['permission/tax']);
  if (groupHas(['produces', 'enables'], 'recursion', 'cast_from_graveyard', 'graveyard_recursion') || /(?:return|cast|play) [^.]*from (?:your|a) graveyard/.test(oracle)) add('recursion', has('graveyard') ? 'Secondary' : 'Primary', ['card reused from graveyard']);

  const drawMembers = commanderProfile.members.filter((member) => member.produces.some((entry) => ['cards', 'card_drawn'].includes(entry.key))).length;
  if (commanderProfile.members.length > 1 && drawMembers === commanderProfile.members.length) add('card_draw', 'Primary', ['both commanders produce card advantage']);

  add('protection', 'Supporting', ['protect commander or engine']);
  add('card_draw', 'Generic Utility', ['generic deck support']);
  add('ramp', 'Generic Utility', ['generic deck support']);
  if (!strategies.some((entry) => entry.strategy_id === 'control')) add('control', 'Generic Utility', ['generic interaction']);
  const order = { Primary: 0, Secondary: 1, Supporting: 2, 'Generic Utility': 3 };
  strategies.sort((left, right) => order[left.importance] - order[right.importance] || left.label.localeCompare(right.label));
  return strategies;
}

export function compileCommanderStrategy(commanders) {
  const list = (Array.isArray(commanders) ? commanders : [commanders]).filter(Boolean);
  if (!list.length) throw new Error('At least one commander is required.');
  const members = list.map(compileMember);
  const commanderProfile = buildCommanderSemanticProfile(members.map((member) => member.semantic_profile));
  const graph = buildGraph(members);
  const strategies = inferStrategies(graph, commanderProfile);
  return {
    schema_version: COMMANDER_STRATEGY_COMPILER_VERSION,
    commander_identity: commanderProfile.commander_identity,
    commander_names: commanderProfile.commander_names,
    color_identity: commanderProfile.color_identity,
    members,
    graph,
    strategies,
    parser_coverage: commanderProfile.semantic_coverage
  };
}

export function buildCommanderStrategySearchIndex(cards = []) {
  const profiles = cards.map((card) => card?.schema_version ? card : { ...card, ...buildSemanticCardProfile(card) });
  const byId = new Map();
  const postings = new Map();
  const add = (key, id) => { if (!postings.has(key)) postings.set(key, new Set()); postings.get(key).add(id); };
  for (const profile of profiles) {
    const id = String(profile.oracle_id);
    byId.set(id, profile);
    for (const entry of semanticEntries(profile)) add(entry.key, id);
    for (const conversion of profile.conversions || []) { add(conversion.from, id); add(conversion.to, id); }
    for (const subtype of profile.subtypes || []) add(`tribe:${subtype}`, id);
  }
  return { schema_version: COMMANDER_STRATEGY_COMPILER_VERSION, profiles, by_id: byId, postings, legal_cache: new Map() };
}

function deriveBranchContext(strategy, compilation) {
  const strategyIds = new Set(compilation.strategies.map((entry) => entry.strategy_id));
  const oracle = normalize(compilation.members.map((member) => member.oracle_text).join('\n'));
  const profileEntries = compilation.members.flatMap((member) => semanticEntries(member.semantic_profile));
  const featureKeys = new Set(profileEntries.map((entry) => entry.key));
  const tribes = unique(compilation.strategies
    .filter((entry) => entry.strategy_id === 'tribal')
    .flatMap((entry) => entry.search_context.tribes || []));
  const tokenTypes = unique([
    ...profileEntries.map((entry) => entry.key).filter((key) => key.startsWith('token:')).map((key) => key.slice(6)),
    ...profileEntries.filter((entry) => entry.group === 'produces' && entry.key.startsWith('tribe:') && entry.evidence?.some((text) => /token/i.test(text))).map((entry) => entry.key.slice(6)),
    ...(strategyIds.has('aristocrats') || strategyIds.has('sacrifice') ? ['creature'] : []),
    ...(strategyIds.has('treasure') ? ['treasure', 'artifact'] : []),
    ...(strategyIds.has('artifacts') && strategyIds.has('tokens') ? ['artifact'] : []),
    ...tribes
  ].filter((value) => !['unspecified', 'copy'].includes(value)));
  const counterTypes = unique(compilation.members.flatMap((member) => member.semantic_profile.counter_types || []));
  const availableDrawContexts = unique([
    ...(strategyIds.has('aristocrats') || strategyIds.has('sacrifice') ? ['death_or_sacrifice'] : []),
    ...(strategyIds.has('spellslinger') ? ['spell_cast'] : []),
    ...(strategyIds.has('combat') ? ['combat'] : []),
    ...(strategyIds.has('blink') || strategyIds.has('etb') ? ['etb'] : []),
    ...(strategyIds.has('lifegain') ? ['lifegain'] : []),
    ...(strategyIds.has('tokens') ? ['token_creation'] : []),
    ...(strategyIds.has('enchantress') ? ['enchantment'] : []),
    ...(strategyIds.has('artifacts') ? ['artifact'] : []),
    ...(strategyIds.has('graveyard') || strategyIds.has('recursion') ? ['graveyard'] : []),
    ...(tribes.length ? ['tribal'] : []),
    ...(/opponent's turn|each opponent's turn/.test(oracle) ? ['opponent_turn'] : [])
  ]);
  const drawContextPriority = ['death_or_sacrifice', 'spell_cast', 'enchantment', 'artifact', 'graveyard', 'lifegain', 'etb', 'combat', 'token_creation', 'tribal', 'opponent_turn'];
  const primaryDrawContext = drawContextPriority.find((context) => availableDrawContexts.includes(context));
  const drawContexts = primaryDrawContext ? [primaryDrawContext] : [];
  const protectionScope = strategyIds.has('tokens') || strategyIds.has('aristocrats')
    ? 'creature_board'
    : strategyIds.has('artifacts') || strategyIds.has('enchantress') || strategyIds.has('lands')
      ? 'engine_permanents'
      : 'commander_or_engine';
  const spellClasses = unique([
    ...(featureKeys.has('instant_or_sorcery_cast') ? ['instant', 'sorcery'] : []),
    ...(featureKeys.has('noncreature_spell_cast') ? ['noncreature'] : [])
  ]);
  const tokenRole = strategyIds.has('aristocrats') || strategyIds.has('sacrifice') ? 'repeatable_producer' : 'typed_or_amplifier';
  return { token_types: tokenTypes, token_role: tokenRole, counter_types: counterTypes, draw_contexts: drawContexts, protection_scope: protectionScope, spell_classes: spellClasses, tribes };
}

function compileSearchQuery(strategy, compilation) {
  const definition = STRATEGIES[strategy.strategy_id];
  const featureKeys = strategy.strategy_id === 'tribal'
    ? (strategy.search_context.tribes || []).map((tribe) => `tribe:${tribe}`)
    : definition.query;
  const context = deriveBranchContext(strategy, compilation);
  const requiredConditions = [{ kind: 'commander_legal' }, { kind: 'combined_color_identity' }];
  if (strategy.strategy_id === 'protection') requiredConditions.push({ kind: 'protection_scope', value: context.protection_scope });
  if (strategy.strategy_id === 'card_draw') requiredConditions.push({ kind: 'actual_card_draw', contexts: context.draw_contexts, tribes: context.tribes });
  if (strategy.strategy_id === 'tokens') requiredConditions.push({ kind: 'token_type', any: context.token_types.length ? context.token_types : ['creature'] });
  if (strategy.strategy_id === 'counters' && context.counter_types.length) requiredConditions.push({ kind: 'counter_type', any: context.counter_types });
  if (strategy.strategy_id === 'spellslinger') requiredConditions.push({ kind: 'spell_class', any: context.spell_classes.length ? context.spell_classes : ['noncreature'] });
  return {
    strategy_id: strategy.strategy_id,
    strategy_label: strategy.label,
    hard_constraints: ['commander_legal', 'within_combined_color_identity', 'exclude_commanders'],
    semantic_any: featureKeys,
    semantic_all: [],
    required_conditions: requiredConditions,
    preferred_conditions: ['repeatable', 'reliable', 'efficient', 'high_magnitude', 'low_dependency', 'commander_central', 'no_conflict'],
    branch_context: context,
    printed_mana_value_preserved_under_cost_reduction: Boolean(strategy.search_context.preserves_printed_mana_value_under_cost_reduction),
    qualifying_spell_mana_value_min: strategy.search_context.minimum_printed_mana_value ?? null,
    ranking_dimensions: ['directness', 'reliability', 'repeatability', 'efficiency', 'dependency_burden', 'magnitude', 'commander_centrality', 'conflicts']
  };
}

function hasActualDrawAction(card) {
  const text = normalize(card.oracle_text);
  return /(?:^|[.;]\s+|,\s+)(?:you |target player |that player )?(?:may )?draws?\b/.test(text)
    || /\bdraw (?:two|three|four|five|six|seven|x|that many|cards)\b/.test(text);
}

function matchesDrawContext(card, query) {
  const contexts = query.branch_context.draw_contexts || [];
  if (!contexts.length) {
    const text = normalize(card.oracle_text);
    return Number(card.mana_value || 0) <= 2
      && (card.delivery?.repeatability === 'persistent' || /draw (?:two|three|four|five|six|seven|x|that many|cards)/.test(text));
  }
  const text = normalize(card.oracle_text);
  const tribes = query.branch_context.tribes || [];
  return contexts.some((context) => {
    if (context === 'death_or_sacrifice') return /dies|died|sacrifice|graveyard from the battlefield/.test(text);
    if (context === 'spell_cast') return /(?:cast|copy) (?:a |an |your )?(?:noncreature |instant |sorcery |spell)/.test(text);
    if (context === 'combat') return /attacks?|combat damage/.test(text);
    if (context === 'etb') return /enters(?: the battlefield)?/.test(text);
    if (context === 'lifegain') return /gain(?:ed)? life/.test(text);
    if (context === 'token_creation') return /token/.test(text);
    if (context === 'enchantment') return /enchantment/.test(text);
    if (context === 'artifact') return /artifact/.test(text);
    if (context === 'graveyard') return /graveyard|discard/.test(text);
    if (context === 'opponent_turn') return /opponent's turn|each turn/.test(text);
    if (context === 'tribal') return tribes.some((tribe) => text.includes(tribe));
    return false;
  });
}

function matchesProtectionScope(card, query) {
  const clauses = String(card.oracle_text || '').toLowerCase().split(/\n+|(?<=\.)\s+/).map((value) => value.trim()).filter(Boolean);
  const protectionClauses = clauses.filter((clause) => /hexproof|indestructible|phase out|phases out|protection from|regenerate|counter target (?:spell|ability)[^.]*targets?/.test(clause))
    .filter((clause) => !/^(?:this (?:creature|permanent)|indestructible\b|protection from\b)/.test(clause));
  if (!protectionClauses.length) return false;
  const scope = query.branch_context.protection_scope;
  const manaValue = Number(card.mana_value || 0);
  if (scope === 'creature_board') return manaValue <= 4 && protectionClauses.some((clause) => /creatures? you control|permanents? you control|each creature|all creatures|phase out/.test(clause));
  if (scope === 'engine_permanents') return manaValue <= 3 && protectionClauses.some((clause) => /target (?:artifact|enchantment|land|permanent)|permanents? you control|phase out/.test(clause));
  return manaValue <= 3 && protectionClauses.some((clause) => /target (?:creature|permanent)|creatures? you control|permanents? you control|commander|phase out|targets? (?:you|a permanent you control)/.test(clause));
}

function matchesTokenType(card, query, strategic) {
  const desired = query.branch_context.token_types || [];
  if (!desired.length) return true;
  const keys = new Set(strategic.map((entry) => entry.key));
  const exactTypes = desired.filter((type) => !['creature', 'artifact'].includes(type));
  const typeMatch = (exactTypes.length ? exactTypes : desired).some((type) => {
    if (type === 'creature') return keys.has('creature_tokens') || keys.has('token:creature');
    if (type === 'artifact') return keys.has('artifact_tokens') || keys.has('token:treasure') || keys.has('token:clue') || keys.has('token:food') || keys.has('token:blood') || keys.has('token:map');
    return keys.has(`token:${type}`) || keys.has(`tribe:${type}`);
  });
  const engineLike = card.delivery?.repeatability === 'persistent' || keys.has('token_multiple') || keys.has('token_scaling') || keys.has('token_repeatable');
  if (query.branch_context.token_role === 'repeatable_producer') return typeMatch && engineLike;
  const amplifier = keys.has('token:multiplier') || keys.has('token:copy') || connectsTokenEvent(strategic);
  return amplifier || (typeMatch && engineLike);
}

function connectsTokenEvent(strategic) {
  return strategic.some((entry) => ['wants', 'rewards', 'enables'].includes(entry.group) && entry.key === 'token_created');
}

function supportsRelevantCounters(card, strategic, relevantTypes) {
  const text = normalize(card.oracle_text);
  const typeMatch = relevantTypes.length > 0 && (card.counter_types || []).some((type) => relevantTypes.includes(type));
  const broadCounterSupport = /proliferate|double[^.]*counters?|move[^.]*counters?|counters? on (?:target|another|each|a |creatures? you control|permanents? you control)/.test(text)
    || /put[^.]*counters? on (?:target|another|each|a creature|creatures? you control|permanents? you control)/.test(text);
  const keys = new Set(strategic.map((entry) => entry.key));
  if (!relevantTypes.length) return keys.has('proliferate') || keys.has('counter_amplification') || /double[^.]*counters?|move[^.]*counters?/.test(text);
  return (typeMatch && broadCounterSupport) || keys.has('proliferate') || keys.has('counter_amplification');
}

function isEfficientManaSource(card) {
  const text = normalize(card.oracle_text);
  return Number(card.mana_value || 0) <= 2
    && card.delivery?.repeatability === 'persistent'
    && !card.delivery?.sacrifice_cost
    && !(Number(card.delivery?.activation_cost || 0) > 0 && !card.delivery?.requires_tap)
    && (/\badd \{|\badd [^.]*\bmana\b|\bplay an additional land\b|\btreasure token\b/.test(text));
}

function legalCards(compilation, index) {
  const profile = buildCommanderSemanticProfile(compilation.members.map((member) => member.semantic_profile));
  const key = [...profile.color_identity].sort().join('');
  if (!index.legal_cache.has(key)) index.legal_cache.set(key, index.profiles.filter((card) => checkMechanicalCandidateLegality(profile, card).legal));
  const commanders = new Set(compilation.members.map((member) => member.oracle_id));
  return index.legal_cache.get(key).filter((card) => !commanders.has(card.oracle_id));
}

function rankCandidate(strategy, card, matched) {
  const entries = semanticEntries(card).filter((entry) => entry.source_kind !== 'card_type');
  const hasKey = (...keys) => entries.some((entry) => keys.some((key) => entry.key === key || entry.key.startsWith(`${key}:`)));
  const connectsTo = (...keys) => entries.some((entry) => ['wants', 'rewards', 'enables'].includes(entry.group) && keys.some((key) => entry.key === key || entry.key.startsWith(`${key}:`)));
  const directness = matched.filter((entry) => ['produces', 'wants', 'rewards', 'enables'].includes(entry.group)).length;
  const reliability = Number(card.delivery?.reliability || 0.5);
  const repeatability = card.delivery?.repeatability === 'persistent' || matched.some((entry) => entry.repeatable);
  const dependencies = Number(card.delivery?.condition_count || 0) + Number(Boolean(card.delivery?.threshold_condition)) + Number(Boolean(card.delivery?.opponent_action));
  const manaValue = Number(card.mana_value || 0);
  const magnitude = Math.max(1, ...matched.map((entry) => Number(entry.magnitude || (entry.scaling ? 3 : 1))));
  const conflicts = (card.conflicts || []).length;
  let score = directness * 16 + reliability * 20 + (repeatability ? 12 : 0) + Math.min(12, magnitude * 2) - dependencies * 6 - Math.max(0, manaValue - 3) * 2 - conflicts * 12;
  if (strategy.strategy_id === 'sacrifice' && card.sacrifice_outlet) score += (card.sacrifice_outlet.mana_cost || 0) === 0 && !card.sacrifice_outlet.requires_tap ? 30 : 12;
  if (strategy.strategy_id === 'mill') score += card.graveyard_quality?.direction === 'opponent' ? 18 : -20;
  if (['self_mill', 'graveyard'].includes(strategy.strategy_id)) score += card.graveyard_quality?.direction === 'self' ? 18 : 0;
  if (strategy.strategy_id === 'aristocrats' && connectsTo('creature_dies', 'sacrifice_event')) score += repeatability ? 34 : 18;
  if (strategy.strategy_id === 'lands' && hasKey('land_recursion', 'extra_land_play')) score += 32;
  if (strategy.strategy_id === 'landfall' && (hasKey('extra_land_play') || connectsTo('land_enters', 'etb:land:you'))) score += repeatability ? 32 : 18;
  if (strategy.strategy_id === 'etb' && card.etb_multiplier) score += 42;
  if (strategy.strategy_id === 'spellslinger') {
    if (hasKey('cost_reduction')) score += 42;
    if (hasKey('mana_refund')) score += 34;
    if (hasKey('copy', 'spell_copy', 'cast_from_graveyard')) score += 24;
    if (manaValue <= 3) score += 10;
  }
  if (strategy.strategy_id === 'treasure' && connectsTo('treasure', 'token:treasure')) score += 30;
  if (strategy.strategy_id === 'protection' && manaValue <= 2) score += 12;
  const explanation = `${STRATEGIES[strategy.strategy_id].explanation}${matched[0]?.evidence?.[0] ? ` ${matched[0].evidence[0]}` : ''}`;
  return { score: Number(score.toFixed(2)), explanation, dimensions: { directness, reliability, repeatability, dependency_burden: dependencies, mana_value: manaValue, magnitude, conflicts } };
}

function candidateQualifies(strategy, card, query) {
  const entries = semanticEntries(card);
  const strategic = entries.filter((entry) => entry.source_kind !== 'card_type');
  const has = (list, ...keys) => list.some((entry) => keys.some((key) => entry.key === key || entry.key.startsWith(`${key}:`)));
  const produces = (list, ...keys) => list.some((entry) => entry.group === 'produces' && keys.some((key) => entry.key === key || entry.key.startsWith(`${key}:`)));
  const connects = (list, ...keys) => list.some((entry) => ['wants', 'rewards', 'enables'].includes(entry.group) && keys.some((key) => entry.key === key || entry.key.startsWith(`${key}:`)));
  const hasRole = (...roles) => (card.roles || []).some((entry) => roles.includes(entry.key));
  switch (strategy.strategy_id) {
    case 'mill': return produces(strategic, 'opponent_mill');
    case 'self_mill': return produces(strategic, 'self_mill', 'own_graveyard_population') || card.graveyard_quality?.direction === 'self';
    case 'graveyard': return produces(strategic, 'graveyard_population', 'self_mill', 'discard_to_own_graveyard') || hasRole('graveyard_setup');
    case 'reanimator': return produces(strategic, 'recursion', 'graveyard_recursion') && /battlefield/i.test(card.oracle_text || '');
    case 'recursion': return produces(strategic, 'recursion', 'graveyard_recursion', 'cast_from_graveyard') || hasRole('recursion');
    case 'lands': return has(strategic, 'land_recursion', 'land_to_graveyard', 'extra_land_play') || connects(strategic, 'land_enters');
    case 'landfall': return has(strategic, 'extra_land_play', 'land_enters', 'etb:land:you') && (connects(strategic, 'land_enters', 'etb:land:you') || has(strategic, 'extra_land_play'));
    case 'aristocrats': return connects(strategic, 'creature_dies', 'sacrifice_event') || (card.conversions || []).some((entry) => ['creature_dies', 'sacrifice_event'].includes(entry.from));
    case 'sacrifice': return Boolean(card.sacrifice_outlet || card.sacrifice_activation) || produces(strategic, 'sacrifice_event');
    case 'tokens': return matchesTokenType(card, query, strategic) && (produces(strategic, 'token_created', 'tokens', 'typed_token_maker') || connects(strategic, 'token_created'));
    case 'spellslinger': {
      const support = has(strategic, 'cost_reduction', 'mana_refund') || connects(strategic, 'instant_or_sorcery_cast', 'noncreature_spell_cast');
      const minimumManaValue = query.qualifying_spell_mana_value_min ?? (query.branch_context.spell_classes.includes('instant') || query.branch_context.spell_classes.includes('sorcery') ? 3 : 0);
      const qualifyingSpell = (card.types || []).some((type) => ['instant', 'sorcery'].includes(type))
        && Number(card.mana_value || 0) >= Number(minimumManaValue)
        && has(strategic, 'cards', 'card_drawn', 'copy', 'removal');
      return support || qualifyingSpell;
    }
    case 'lifegain': return produces(strategic, 'life_gained') || connects(strategic, 'life_gained');
    case 'life_loss': return produces(strategic, 'opponent_life_loss', 'controlled_damage');
    case 'group_slug': return produces(strategic, 'opponent_life_loss', 'all_player_damage') || has(strategic, 'cast_punishment', 'land_punishment');
    case 'counters': {
      const relevantTypes = query.branch_context.counter_types || [];
      return supportsRelevantCounters(card, strategic, relevantTypes)
        && (produces(strategic, 'counter_added', 'counters', 'plus_one_counters', 'proliferate', 'counter_amplification') || connects(strategic, 'counter_added'));
    }
    case 'proliferate': return produces(strategic, 'proliferate', 'counter_amplification');
    case 'blink': return produces(strategic, 'blink');
    case 'etb': return connects(strategic, 'creature_enters', 'artifact_enters', 'enchantment_enters') || Boolean(card.etb_multiplier);
    case 'artifacts': return connects(strategic, 'artifact', 'artifact_cast', 'artifact_enters') || (produces(strategic, 'artifact_token') && hasRole('token_generation'));
    case 'treasure': return produces(strategic, 'treasure', 'treasure_tokens', 'token:treasure') || connects(strategic, 'treasure', 'token:treasure');
    case 'enchantress': return connects(strategic, 'enchantment_cast', 'enchantment_enters', 'enchantment');
    case 'aura_voltron': return has(strategic, 'aura', 'aura_cast', 'attachment', 'enchanted_creature', 'equipment');
    case 'tribal': return query.semantic_any.some((key) => has(strategic, key));
    case 'combat': return connects(strategic, 'attacks', 'combat_damage') || has(strategic, 'extra_combat', 'evasion');
    case 'extra_combat': return produces(strategic, 'extra_combat', 'combat_phase');
    case 'control': return (has(strategic, 'permission', 'tax_effect', 'cast_punishment') || hasRole('interaction')) && (Number(card.mana_value || 0) <= 2 || has(strategic, 'tax_effect', 'cast_punishment'));
    case 'ramp': return hasRole('ramp') && produces(strategic, 'mana', 'treasure_tokens', 'extra_land_play') && isEfficientManaSource(card);
    case 'card_draw': return hasRole('card_draw') && produces(strategic, 'cards', 'card_drawn') && hasActualDrawAction(card) && matchesDrawContext(card, query);
    case 'protection': return hasRole('protection') && produces(strategic, 'protection') && matchesProtectionScope(card, query);
    default: return query.semantic_any.some((key) => has(strategic, key));
  }
}

export function searchCommanderStrategies(compilation, index, options = {}) {
  const now = () => globalThis.performance?.now?.() ?? Date.now();
  const started = now();
  const legalStarted = now();
  const legal = legalCards(compilation, index);
  const legalMs = now() - legalStarted;
  const legalIds = new Set(legal.map((card) => String(card.oracle_id)));
  const maximum = Math.max(1, Number(options.limitPerStrategy || 10));
  let queryMs = 0;
  let searchMs = 0;
  let qualificationMs = 0;
  let rankingMs = 0;
  const strategies = compilation.strategies.map((strategy) => {
    const queryStarted = now();
    const query = compileSearchQuery(strategy, compilation);
    queryMs += now() - queryStarted;
    const searchStarted = now();
    const ids = new Set();
    for (const key of query.semantic_any) for (const id of index.postings.get(key) || []) if (legalIds.has(id)) ids.add(id);
    const broadSemanticPool = [...ids].map((id) => index.by_id.get(id)).filter(Boolean);
    searchMs += now() - searchStarted;
    const qualificationStarted = now();
    const semanticPool = broadSemanticPool.filter((card) => candidateQualifies(strategy, card, query));
    qualificationMs += now() - qualificationStarted;
    const rankStarted = now();
    const ranked = semanticPool.map((card) => {
      const matched = semanticEntries(card).filter((entry) => query.semantic_any.includes(entry.key));
      return { card, result: rankCandidate(strategy, card, matched) };
    }).filter((entry) => entry.result.score >= Number(options.minimumScore ?? 26))
      .sort((left, right) => right.result.score - left.result.score || right.result.dimensions.directness - left.result.dimensions.directness || left.result.dimensions.dependency_burden - right.result.dimensions.dependency_burden || left.result.dimensions.mana_value - right.result.dimensions.mana_value || String(left.card.oracle_id).localeCompare(String(right.card.oracle_id)));
    rankingMs += now() - rankStarted;
    return {
      ...strategy,
      search_query: query,
      total_legal_pool: legal.length,
      candidate_pool_before_narrowing: broadSemanticPool.length,
      semantic_pool: semanticPool.length,
      final_qualified_pool: ranked.length,
      recommendations: ranked.slice(0, maximum).map(({ card, result }, position) => ({
        rank: position + 1,
        oracle_id: card.oracle_id,
        card_name: card.name,
        type_line: card.type_line,
        mana_value: card.mana_value,
        image_normal: card.image_normal,
        image_large: card.image_large,
        image_small: card.image_small,
        fit_score: result.score,
        mechanical_score: result.score,
        mechanical_fit_label: result.score >= 90 ? 'Strong Mechanical Fit' : result.score >= 60 ? 'Good Mechanical Fit' : 'Support Fit',
        mechanical_reasons: [{ explanation: result.explanation }],
        mechanical_penalties: (card.conflicts || []).map((entry) => ({ explanation: entry.explanation || entry.key || String(entry) })),
        category: strategy.strategy_id,
        strategy_label: strategy.label,
        strategy_importance: strategy.importance,
        why_it_works: result.explanation,
        ranking_dimensions: result.dimensions,
        community_inclusion: null
      })),
      ...(options.includeDiagnostics ? { diagnostics: { retrieved_ids: semanticPool.map((card) => card.oracle_id), ranked: ranked.map(({ card, result }, position) => ({ oracle_id: card.oracle_id, rank: position + 1, score: result.score })) } } : {})
    };
  });
  return {
    schema_version: COMMANDER_STRATEGY_COMPILER_VERSION,
    commander_identity: compilation.commander_identity,
    commander_names: compilation.commander_names,
    color_identity: compilation.color_identity,
    strategies,
    performance: {
      legal_filter_ms: Number(legalMs.toFixed(3)),
      query_generation_ms: Number(queryMs.toFixed(3)),
      semantic_search_ms: Number(searchMs.toFixed(3)),
      qualification_ms: Number(qualificationMs.toFixed(3)),
      ranking_ms: Number(rankingMs.toFixed(3)),
      total_ms: Number((now() - started).toFixed(3))
    }
  };
}

export function strategyCatalog() { return STRATEGIES; }
