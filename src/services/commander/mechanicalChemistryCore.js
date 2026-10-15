import { legalityOwner } from '../legality/legalityOwner.js';

export const MECHANICAL_CHEMISTRY_SCHEMA_VERSION = 5;

export const MECHANICAL_ROLE_ORDER = Object.freeze([
  'ramp', 'card_draw', 'removal', 'board_wipe', 'protection', 'recursion',
  'token_generation', 'sacrifice_outlet', 'graveyard_setup', 'payoff',
  'finisher', 'enabler', 'tutor', 'interaction', 'mana_fixing'
]);

export const MECHANICAL_ROLE_LABELS = Object.freeze({
  creatures: 'Creatures', ramp: 'Ramp', card_draw: 'Card Draw', removal: 'Removal',
  board_wipe: 'Board Wipes', protection: 'Protection', recursion: 'Recursion',
  token_generation: 'Token Generation', sacrifice_outlet: 'Sacrifice Outlets',
  graveyard_setup: 'Graveyard Setup', payoff: 'Payoffs', finisher: 'Finishers',
  enabler: 'Enablers', tutor: 'Tutors', interaction: 'Interaction', mana_fixing: 'Mana Fixing'
});

const COLORS = new Set(['W', 'U', 'B', 'R', 'G']);

function text(value) { return String(value || '').toLowerCase().replace(/[’]/g, "'"); }
function unique(values) { return [...new Set(values.filter(Boolean))].sort(); }
function includesAny(haystack, needles) { return needles.some((needle) => haystack.includes(needle)); }

function addFeature(target, key, evidence, confidence = 1, metadata = {}) {
  if (!key) return;
  const existing = target.find((entry) => entry.key === key);
  if (existing) {
    existing.confidence = Math.max(existing.confidence, confidence);
    if (evidence && !existing.evidence.includes(evidence)) existing.evidence.push(evidence);
    existing.source_kind = existing.source_kind === 'oracle_text' || metadata.source_kind === 'oracle_text' ? 'oracle_text' : (existing.source_kind || metadata.source_kind || 'oracle_text');
    existing.magnitude = Math.max(existing.magnitude || 0, metadata.magnitude || 0) || undefined;
    existing.scaling = existing.scaling || metadata.scaling || undefined;
    existing.repeatable = existing.repeatable || metadata.repeatable || false;
    existing.direction = existing.direction || metadata.direction || undefined;
    existing.object_class = existing.object_class || metadata.object_class || undefined;
    existing.counter_type = existing.counter_type || metadata.counter_type || undefined;
    existing.mode_group = existing.mode_group || metadata.mode_group || undefined;
    existing.qualifiers = unique([...(existing.qualifiers || []), ...(metadata.qualifiers || [])]);
    return;
  }
  target.push({
    key, confidence, evidence: evidence ? [evidence] : [], source_kind: metadata.source_kind || 'oracle_text',
    magnitude: metadata.magnitude, scaling: metadata.scaling, repeatable: Boolean(metadata.repeatable),
    direction: metadata.direction, object_class: metadata.object_class, counter_type: metadata.counter_type,
    mode_group: metadata.mode_group, qualifiers: unique(metadata.qualifiers || [])
  });
}
function featureKeys(features = []) { return new Set(features.map((feature) => feature.key)); }

function featuresCompatible(source, destination) {
  if (!source || !destination) return false;
  if (source.key === 'counter_added' && source.counter_type && destination.counter_type
    && !['unspecified', 'any_existing'].includes(source.counter_type)
    && !['unspecified', 'any_existing'].includes(destination.counter_type)
    && source.counter_type !== destination.counter_type) return false;
  if (source.key === 'graveyard_population' && source.direction === 'opponent' && destination.direction !== 'opponent') return false;
  if (source.key.includes('_enters') && source.object_class && destination.object_class && source.object_class !== destination.object_class) return false;
  return true;
}

function addMatches(edges, left, right, relationship, weight, template, options = {}) {
  const rightByKey = new Map((right || []).map((feature) => [feature.key, feature]));
  for (const source of left || []) {
    const destination = rightByKey.get(source.key);
    if (!destination) continue;
    if (!featuresCompatible(source, destination)) continue;
    const typeDerived = source.source_kind === 'card_type';
    const conditional = Boolean(options.conditional || typeDerived || source.source_kind === 'conditional_oracle');
    const tier = options.generic ? 'generic_utility' : conditional ? 'conditional_support' : weight >= 22 ? 'direct_engine' : weight >= 16 ? 'strong_support' : 'weak_thematic_overlap';
    const tierMultiplier = { direct_engine: 1, strong_support: 0.9, conditional_support: 0.5, generic_utility: 0.42, weak_thematic_overlap: 0.3 }[tier];
    edges.push({
      relationship,
      feature: source.key,
      strength_tier: tier,
      weight: Number((weight * tierMultiplier * Math.min(source.confidence || 1, destination.confidence || 1)).toFixed(2)),
      explanation: template(source.key),
      candidate_action: source.evidence?.[0] || `Provides ${source.key.replace(/_/g, ' ')}.`,
      commander_connection: destination.evidence?.[0] || `The commander uses ${source.key.replace(/_/g, ' ')}.`,
      strategic_value: template(source.key)
    });
  }
}

function detectTypes(typeLine) {
  const type = text(typeLine);
  return unique(['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'land', 'planeswalker', 'battle'].filter((value) => type.includes(value)));
}

function detectSubtypes(typeLine) {
  const parts = String(typeLine || '').split(/[—-]/);
  if (parts.length < 2) return [];
  return unique(parts.slice(1).join(' ').split(/\s+/).map((value) => text(value).replace(/[^a-z0-9]+/g, '')).filter(Boolean));
}

const COUNTER_TYPES = Object.freeze([
  ['+1/+1', /\+1\/\+1 counters?/], ['-1/-1', /-1\/-1 counters?/], ['loyalty', /loyalty counters?/],
  ['charge', /charge counters?/], ['experience', /experience counters?/], ['poison', /poison counters?/],
  ['oil', /oil counters?/], ['shield', /shield counters?/], ['stun', /stun counters?/],
  ['lore', /lore counters?/], ['quest', /quest counters?/], ['time', /time counters?/],
  ['brick', /brick counters?/], ['age', /age counters?/], ['keyword', /(?:flying|first strike|double strike|deathtouch|lifelink|menace|reach|trample|vigilance|hexproof|indestructible) counter/]
]);

function detectCounterTypes(oracle) {
  return COUNTER_TYPES.filter(([, pattern]) => pattern.test(oracle)).map(([key]) => key);
}

function parseFixedAmount(value) {
  const normalized = text(value).trim();
  const words = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  if (Object.hasOwn(words, normalized)) return words[normalized];
  if (/^\d+$/.test(normalized)) return Number(normalized);
  return null;
}

function detectModalSemantics(raw) {
  const normalized = text(raw);
  const faceTexts = String(raw || '').split(/\s*\/\/\s*/).map((entry) => entry.trim()).filter(Boolean);
  const chooseMatch = normalized.match(/choose (one or more|one|two|three)[^—\n]*[—-]/);
  return {
    has_multiple_faces: faceTexts.length > 1,
    face_count: Math.max(1, faceTexts.length),
    mode_count: (String(raw || '').match(/(?:^|\n)\s*[•●]/g) || []).length,
    choice: chooseMatch?.[1] || null,
    exclusive: Boolean(chooseMatch && chooseMatch[1] !== 'one or more'),
    alternate_cost: /\b(?:kicker|overload|cleave|evoke|escape|flashback|adventure)\b/i.test(raw),
    transform: /\btransform\b/i.test(raw)
  };
}

function detectTriggerFrequency(oracle) {
  if (includesAny(oracle, ['only once each turn', 'triggers only once each turn', 'first time each turn'])) return 'once_each_turn';
  if (includesAny(oracle, ['once during each of your turns', 'first time during your turn'])) return 'once_your_turn';
  if (oracle.includes('at the beginning of each upkeep')) return 'each_upkeep';
  if (oracle.includes('at the beginning of your upkeep')) return 'your_upkeep';
  if (/whenever one or more /.test(oracle)) return 'per_batch';
  if (/\bwhenever\b/.test(oracle)) return 'per_event';
  return 'none';
}

function extractQualifiers(clause) {
  const value = text(clause);
  return unique([
    value.includes('another ') && 'another', value.includes('one or more') && 'one_or_more',
    /\beach\b/.test(value) && 'each', /\bfor each\b/.test(value) && 'for_each',
    /\btarget\b/.test(value) && 'target', /\bup to\b/.test(value) && 'up_to',
    /\bany number\b/.test(value) && 'any_number', /\bnontoken\b/.test(value) && 'nontoken',
    /\btoken\b/.test(value) && 'token', /\bnonland\b/.test(value) && 'nonland',
    /\byou control\b/.test(value) && 'you_control', /\bopponent controls?\b/.test(value) && 'opponent_controls',
    /\bequal to\b/.test(value) && 'equal_to', /\bx\b/.test(value) && 'variable_x'
  ]);
}

function detectTokenSemantics(raw, oracle, delivery) {
  const entries = [];
  const pattern = /create[s]?\s+(a|an|one|two|three|four|five|six|\d+|x|that many|twice that many|one or more|a number of)[^\n.]*?tokens?/gi;
  for (const match of String(raw || '').matchAll(pattern)) {
    const clause = match[0];
    const amountText = text(match[1]);
    const lowerClause = text(clause);
    const tokenType = lowerClause.includes('treasure') ? 'treasure'
      : lowerClause.includes('clue') ? 'clue' : lowerClause.includes('food') ? 'food'
        : lowerClause.includes('blood') ? 'blood' : lowerClause.includes('map') ? 'map'
          : lowerClause.includes('creature') ? 'creature' : lowerClause.includes('artifact') ? 'artifact' : 'unspecified';
    const fixed = parseFixedAmount(amountText);
    const scaling = fixed === null ? (amountText === 'x' ? 'x' : amountText.includes('twice') ? 'doubling' : amountText.includes('that many') || amountText.includes('number of') ? 'per_reference' : 'variable') : 'fixed';
    entries.push({
      token_type: tokenType, fixed_amount: fixed, scaling,
      magnitude: fixed ?? (scaling === 'doubling' ? 4 : scaling === 'per_reference' || scaling === 'x' ? 3 : 2),
      repeatable: delivery.repeatability === 'repeatable' || delivery.repeatability === 'once_per_turn',
      qualifiers: extractQualifiers(clause), evidence: clause
    });
  }
  if (/copy target token|token that's a copy|tokens? that (?:is|are) copies/.test(oracle)) entries.push({ token_type: 'copy', fixed_amount: 1, scaling: 'copy', magnitude: 2, repeatable: delivery.repeatability === 'repeatable', qualifiers: [], evidence: 'Copies an existing token.' });
  if (/tokens? would be created[^.]*twice that many|would create one or more tokens[^.]*twice that many|create twice that many tokens|additional [a-z]+ token|additional token/.test(oracle)) entries.push({ token_type: 'multiplier', fixed_amount: null, scaling: 'doubling', magnitude: 4, repeatable: true, qualifiers: [], evidence: 'Multiplies token creation.' });
  return entries;
}

function addTypedCounterFeatures(profile, oracle) {
  const counterTypes = detectCounterTypes(oracle);
  const putsCounters = /put (?:a|an|one or more|x|that many|\d+) [^\n.]*counters?/.test(oracle);
  const removesCounters = /remove (?:a|an|one or more|x|that many|\d+|all) [^\n.]*counters?/.test(oracle);
  const movesCounters = /move (?:a|an|one or more|x|that many|\d+) [^\n.]*counters?/.test(oracle);
  const doublesCounters = /double the number of [^\n.]*counters?/.test(oracle);
  for (const counterType of counterTypes.length ? counterTypes : (putsCounters ? ['unspecified'] : [])) {
    const key = `counter:${counterType}`;
    if (putsCounters) {
      produces(profile, key, `Places ${counterType} counters.`, 1, { counter_type: counterType });
      produces(profile, 'counter_added', `Places ${counterType} counters.`, counterType === 'unspecified' ? 0.65 : 0.9, { counter_type: counterType });
    }
    if (removesCounters) addFeature(profile.enables, `counter_remove:${counterType}`, `Removes ${counterType} counters.`, 1, { counter_type: counterType });
    if (movesCounters) addFeature(profile.enables, `counter_move:${counterType}`, `Moves ${counterType} counters.`, 1, { counter_type: counterType });
    if (doublesCounters) addFeature(profile.enables, key, `Doubles ${counterType} counters.`, 1, { counter_type: counterType, scaling: 'doubling' });
    const escapedType = counterType.replace(/[+]/g, '\\+').replace('/', '\\/');
    if (new RegExp(`(?:whenever you put|whenever (?:a|an|one or more) [^.]{0,50}${escapedType} counters? (?:is|are) put|if [^.]{0,50}(?:has|had) [^.]{0,30}${escapedType} counters?)`).test(oracle)) {
      wants(profile, key, `Triggers on ${counterType} counter events.`, 1, { counter_type: counterType });
      rewards(profile, key, `Rewards ${counterType} counter placement.`, 1, { counter_type: counterType });
    }
  }
  if (oracle.includes('proliferate')) {
    addFeature(profile.enables, 'counter:any_existing', 'Proliferate adds another counter of each kind already present.', 1, { scaling: 'existing_types' });
  }
}

function addAttachmentFeatures(profile, oracle, types, subtypes) {
  const aura = subtypes.includes('aura');
  const equipment = subtypes.includes('equipment') || types.includes('equipment');
  const fortification = subtypes.includes('fortification');
  if (aura) {
    addFeature(profile.resources, 'aura', 'Card is an Aura.', 1);
    produces(profile, 'aura_cast', 'Casting this card creates an Aura-cast event.', 1);
    produces(profile, 'attachment_enters', 'This Aura can enter attached to a legal object.', 0.9);
    produces(profile, 'etb:aura:you', 'Casting this Aura makes it enter under your control.', 0.9, { object_class: 'aura', qualifiers: ['you_control'] });
    if (oracle.includes('enchant creature')) produces(profile, 'enchanted_creature', 'Attaches to and modifies an enchanted creature.', 1, { object_class: 'creature' });
    if (oracle.includes('enchant land')) produces(profile, 'enchanted_land', 'Attaches to and modifies an enchanted land.', 1, { object_class: 'land' });
    if (/enchant (?:permanent|artifact|enchantment|planeswalker)/.test(oracle)) produces(profile, 'enchanted_permanent', 'Attaches to the specified permanent.', 0.95);
    if (/return [^.]{0,80} to its owner's hand/.test(oracle)) addFeature(profile.enables, 'aura_cast', 'Can return itself to hand to be cast and trigger Aura-cast payoffs again.', 1, { repeatable: true, object_class: 'aura' });
  }
  if (equipment) {
    addFeature(profile.resources, 'equipment', 'Card is Equipment.', 1);
    produces(profile, 'attachment_enters', 'This Equipment can become attached.', 0.85);
    produces(profile, 'equipped_creature', 'Modifies an equipped creature.', 1, { object_class: 'creature' });
  }
  if (fortification) addFeature(profile.resources, 'fortification', 'Card is a Fortification.', 1);
  if (/whenever you cast an aura/.test(oracle)) { wants(profile, 'aura_cast', 'Triggers when an Aura is cast.'); rewards(profile, 'aura_cast', 'Rewards casting Auras.'); }
  if (/whenever (?:an|one or more) aura[s]? (?:you control )?(?:is|are) put into a graveyard|whenever an enchanted creature dies/.test(oracle)) { wants(profile, 'aura_graveyard', 'Rewards an Aura or enchanted creature going to a graveyard.'); rewards(profile, 'aura_graveyard', 'Pays off Aura loss.'); }
  if (/for each aura (?:you control )?attached|for each aura attached/.test(oracle)) wants(profile, 'attachment_count:aura', 'Scales with the number of attached Auras.');
  if (/equipped creature|enchanted creature|attached creature/.test(oracle)) wants(profile, 'attachment', 'Uses an attached, equipped, or enchanted creature.', 0.9);
}

function addEtbSemantics(profile, oracle) {
  const triggerPattern = /whenever ([^.]{0,140}) enters(?: the battlefield)?(?: under ([^.]{0,60}) control)?/g;
  for (const match of oracle.matchAll(triggerPattern)) {
    const subject = match[1];
    const controller = match[2] || (subject.includes('you control') ? 'your' : 'unspecified');
    const objectClass = subject.includes('aura') ? 'aura' : subject.includes('artifact') ? 'artifact'
      : subject.includes('enchantment') ? 'enchantment' : subject.includes('token') ? 'token'
        : subject.includes('creature') ? 'creature' : subject.includes('land') ? 'land' : 'permanent';
    const qualifiers = extractQualifiers(match[0]);
    const controllerKey = controller.includes('opponent') ? 'opponent' : controller.includes('your') ? 'you' : 'any';
    const key = `etb:${objectClass}:${controllerKey}`;
    wants(profile, key, `Triggers when ${subject.trim()} enters under ${controllerKey === 'you' ? 'your' : controllerKey} control.`, 1, { object_class: objectClass, qualifiers });
    rewards(profile, key, `Pays off that qualified ${objectClass} enter event.`, 1, { object_class: objectClass, qualifiers });
    if (objectClass !== 'permanent') {
      const genericKey = `${objectClass}_enters`;
      wants(profile, genericKey, `Triggers on a qualified ${objectClass} enter event.`, 0.75, { object_class: objectClass, qualifiers, source_kind: qualifiers.length ? 'conditional_oracle' : 'oracle_text' });
      rewards(profile, genericKey, `Pays off a qualified ${objectClass} enter event.`, 0.75, { object_class: objectClass, qualifiers, source_kind: qualifiers.length ? 'conditional_oracle' : 'oracle_text' });
    }
  }
  if (/when (?:this|~|[a-z0-9,' -]+) (?:creature|artifact|enchantment|permanent)?\s*enters(?: the battlefield)?/.test(oracle)) {
    wants(profile, 'etb:self', 'Has an effect when this permanent enters.', 0.8, { qualifiers: ['self'] });
    rewards(profile, 'etb:self', 'Provides its own enter-the-battlefield payoff.', 0.8, { qualifiers: ['self'] });
  }
  if (/exile [^.]+, then return (?:it|those cards|them) to the battlefield|exile [^.]+ until [^.]+ return|exile [^.]+\. return (?:that card|it|them) to the battlefield/.test(oracle)) {
    produces(profile, 'blink', 'Exiles and returns a permanent, repeating its enter event.', 1);
    addFeature(profile.enables, 'etb:creature:you', 'Blink repeats creature enter-the-battlefield events under your control.', 1, { object_class: 'creature', repeatable: true });
    addFeature(profile.enables, 'etb:artifact:you', 'Blink can repeat artifact enter-the-battlefield events under your control.', 0.75, { object_class: 'artifact', repeatable: true });
    addFeature(profile.enables, 'etb:enchantment:you', 'Blink can repeat enchantment enter-the-battlefield events under your control.', 0.75, { object_class: 'enchantment', repeatable: true });
  }
}

function addGraveyardSemantics(profile, oracle) {
  const selfMill = /(?:you|target player) mills? |(?:^|[.,\n—-]\s*)mill (?:a|one|two|three|four|five|six|\d+|x|that many)|mill (?:yourself|your library)|put the top [^.]+ of your library into your graveyard|surveil|(?:that permanent'?s|its) controller mills?/.test(oracle);
  const opponentMill = /target opponent mills?|each opponent mills?|opponents? mill|from an opponent's library into (?:their|that player's) graveyard/.test(oracle);
  const eachPlayerMill = /each player mills?|(?:that permanent'?s|its) controller mills?/.test(oracle);
  if (selfMill || eachPlayerMill) {
    produces(profile, 'self_mill', 'Moves cards from your library into your graveyard.', 1, { direction: 'self' });
    produces(profile, 'own_graveyard_population', 'Populates your own graveyard.', 1, { direction: 'self' });
    produces(profile, 'graveyard_population', 'Populates your own graveyard.', 0.9, { direction: 'self' });
    role(profile, 'graveyard_setup', 'Populates your own graveyard.');
  }
  if (opponentMill || eachPlayerMill) produces(profile, 'opponent_mill', 'Moves cards from an opponent’s library into their graveyard.', 1, { direction: 'opponent' });
  if (eachPlayerMill) produces(profile, 'each_player_mill', 'Each player mills, including you.', 1, { direction: 'each_player' });
  if (/discard (?:a|one|two|three|four|five|six|one or more|x|that many|\d+) cards?/.test(oracle)) {
    produces(profile, 'discard_to_own_graveyard', 'Discard places selected cards from your hand into your graveyard.', 0.9, { direction: 'self' });
    produces(profile, 'own_graveyard_population', 'Discard can populate your own graveyard.', 0.8, { direction: 'self' });
    produces(profile, 'graveyard_population', 'Discard can populate your own graveyard.', 0.75, { direction: 'self' });
  }
  if (/surveil/.test(oracle)) produces(profile, 'surveil', 'Surveil selectively moves cards into your graveyard.', 1, { direction: 'self' });
  if (/draw [^.]+, then discard|discard [^.]+, then draw/.test(oracle)) {
    produces(profile, 'loot_rummage', 'Draw-and-discard filtering selectively fills your graveyard.', 0.9, { direction: 'self' });
    produces(profile, 'graveyard_population:any_selected', 'Can selectively discard a card of the type the strategy needs.', 0.9, { direction: 'self', object_class: 'selected' });
  }
  if (/search your library for [^.]+(?:,| and)?\s*(?:then )?(?:put|puts?) (?:it|that card|them|those cards) into your graveyard/.test(oracle)) {
    produces(profile, 'tutor_to_graveyard', 'Tutors chosen cards directly into your graveyard.', 1, { direction: 'self' });
    produces(profile, 'own_graveyard_population', 'Places searched cards into your own graveyard.', 1, { direction: 'self' });
    produces(profile, 'graveyard_population', 'Places searched cards into your own graveyard.', 1, { direction: 'self' });
    produces(profile, 'graveyard_population:any_selected', 'Selects any matching card to place into your graveyard.', 1, { direction: 'self', object_class: 'selected' });
    if (/creature cards?/.test(oracle)) produces(profile, 'graveyard_population:creature', 'Tutors creature cards into your graveyard.', 1, { direction: 'self', object_class: 'creature' });
  }
  if (/creature cards? (?:is|are|put)[^.]*your graveyard/.test(oracle)) produces(profile, 'graveyard_population:creature', 'Moves creature cards into your graveyard.', 1, { direction: 'self', object_class: 'creature' });
  if (/permanent cards? (?:is|are|put)[^.]*your graveyard/.test(oracle)) produces(profile, 'graveyard_population:permanent', 'Moves permanent cards into your graveyard.', 1, { direction: 'self', object_class: 'permanent' });
  if (/mill (?:x|half|that many|a number of)|put (?:all|the top x|half)[^.]+your library into your graveyard/.test(oracle)) produces(profile, 'mass_graveyard_loading', 'Loads many cards into your graveyard.', 1, { direction: 'self', scaling: 'variable' });
}

function addResourceConversions(profile, oracle) {
  const conversions = [];
  const baseReliability = profile.delivery?.reliability || 1;
  const add = (from, to, evidence, reliability = baseReliability) => {
    if (!conversions.some((entry) => entry.from === from && entry.to === to)) conversions.push({ from, to, evidence, reliability });
  };
  if (/sacrifice (?:a|another) creature\s*:/.test(oracle)) {
    add('creature', 'sacrifice_event', 'Converts a creature into a sacrifice event.');
    add('creature', 'creature_dies', 'Sacrificing the creature creates a death event.', 0.95);
  }
  if (/sacrifice [^.:\n]+\s*:/.test(oracle)) produces(profile, 'sacrifice_activated_ability', 'Activates an ability by sacrificing a permanent.', 1, { repeatable: profile.delivery?.repeatability === 'repeatable' });
  if (/sacrifice (?:a|another) [^.:\n]+\s*:[^.]*scry/.test(oracle)) add('creature', 'card_selection', 'Converts a creature sacrifice into repeatable card selection.');
  if (/whenever [^.]*creature[^.]*dies[^.]*draw|sacrifice [^.]*creature[^:]*:[^.]*draw/.test(oracle)) add('creature_dies', 'cards', 'Converts creature deaths into cards.');
  if (/whenever [^.]*creature[^.]*enters[^.]*(?:gain|gains) [^.]*life/.test(oracle)) add('creature_enters', 'life_gained', 'Converts creature entries into life-gain events.');
  if (/whenever [^.]*creature[^.]*enters[^.]*(?:deals? [^.]*damage|each opponent loses)/.test(oracle)) add('creature_enters', 'opponent_life_loss', 'Converts creature entries into opponent life loss.');
  if (/whenever (?:another |one or more )?(?:[a-z]+(?: or [a-z]+)?|creature)s?(?: you control)? enters[^.]*(?:you gain|gain) [^.]*life/.test(oracle)) {
    add('creature_enters', 'life_gained', 'Converts entry of the named creature class into a life-gain event.');
  }
  if (/whenever you cast an enchantment[^.]*draw/.test(oracle)) add('enchantment_cast', 'cards', 'Converts enchantment casts into card draw.');
  if (/sacrifice (?:an|another) artifact\s*:/.test(oracle)) add('artifact', oracle.includes('draw') ? 'cards' : 'sacrifice_event', 'Converts an artifact sacrifice into another resource.');
  if (/whenever [^.]*artifact[^.]*sacrificed[^.]*(?:create|add)/.test(oracle)) add('artifact_sacrifice', oracle.includes('treasure') ? 'treasure_tokens' : 'mana', 'Converts artifact sacrifice into a new resource.');
  if (/discard [^.]+:[^.]*return|discard [^.]+, then return/.test(oracle)) add('discard_event', 'recursion', 'Converts discard and graveyard setup into recursion.');
  if (/whenever [^.]*creature[^.]*dies[^.]*create[^.]*token/.test(oracle)) add('creature_dies', 'token_created', 'Converts creature deaths into token creation.', /with [^.]*counter|if it had|if that creature/.test(oracle) ? Math.min(0.55, baseReliability) : baseReliability);
  if (/whenever you cast [^.]*spell[^.]*create[^.]*token/.test(oracle)) add('spell_cast', 'token_created', 'Converts spell casts into token creation.');
  if (/whenever you cast an artifact spell[^.]*create[^.]*artifact[^.]*token/.test(oracle)) add('artifact_spell_cast', 'artifact', 'Converts artifact casts into additional artifact permanents.');
  if (/whenever [^.]*combat damage[^.]*(?:create|creates)[^.]*treasure/.test(oracle)) add('combat_damage', 'treasure_tokens', 'Converts combat damage into Treasure tokens.');
  if (/sacrifice [^.]*token\s*:/.test(oracle)) add('tokens', 'sacrifice_event', 'Converts a token into a sacrifice event.');
  if (/sacrifice (?:a|another) [a-z]+\s*:/.test(oracle) && /\badd \{?[wubrgc]/.test(oracle)) {
    const typedSacrifice = oracle.match(/sacrifice (?:a|another) ([a-z]+)\s*:/);
    if (typedSacrifice?.[1] === 'creature') {
      add('creature', 'mana', 'Converts a creature into mana.');
      add('creature', 'sacrifice_event', 'Converts a creature into a sacrifice event.');
    } else if (typedSacrifice) {
      add(`tribe:${typedSacrifice[1]}`, 'mana', `Converts a ${typedSacrifice[1]} into mana.`);
    }
  }
  if (/whenever [^.]*opponent[^.]*draws?[^.]*(?:loses|damage)/.test(oracle)) add('opponent_card_drawn', 'opponent_life_loss', 'Converts opponent card draws into life loss.');
  if (/whenever [^.]*counter[^.]*put[^.]*(?:gets?|gain|draw|create)/.test(oracle)) add('counter_added', oracle.includes('draw') ? 'cards' : oracle.includes('create') ? 'token_created' : 'combat_power', 'Converts counter placement into a payoff.');
  if (/whenever [^.]*put one or more counters[^.]*(?:deals?|damage)|whenever [^.]*counter[^.]*put[^.]*(?:loses life|damage)/.test(oracle)) add('counter_added', 'opponent_life_loss', 'Converts counter placement into damage or opponent life loss.');
  if (/target creature[^.]*draw a card|target creature[^.]*when [^.]*draw a card/.test(oracle)) add('targeted_creature_spell', 'cards', 'Converts a targeted spell into card replacement.', 0.95);
  profile.conversions = conversions;
}

function addControlSemantics(profile, oracle, types) {
  const instantSpeed = types.includes('instant') || /\bflash\b/.test(oracle) || /activate only during an opponent's turn/.test(oracle);
  if (/counter target (?:spell|activated ability|triggered ability)/.test(oracle)) {
    produces(profile, 'permission', 'Counters a spell or ability before it resolves.', 1, { repeatable: profile.delivery?.repeatability === 'repeatable' });
    role(profile, 'interaction', 'Provides permission-based interaction.');
  }
  if (/whenever (?:a spell|an ability|a spell or ability)[^.]*you control counters|whenever you counter/.test(oracle)) {
    wants(profile, 'permission', 'Rewards countering opposing spells or abilities.');
    rewards(profile, 'permission', 'Turns permission into additional value.');
  }
  if (instantSpeed && profile.roles.some((entry) => ['removal', 'interaction'].includes(entry.key))) produces(profile, 'instant_speed_interaction', 'Can interact without committing mana on the main phase.', 1);
  if (/spells? your opponents cast cost|abilities? your opponents activate cost|counter (?:that|it) spell unless its controller pays/.test(oracle)) produces(profile, 'tax_effect', 'Taxes opposing spells or abilities.', 1, { repeatable: true });
  if (/return target [^.]+ to its owner's hand|tap target [^.]+(?:it doesn't untap|and it doesn't untap)|put target [^.]+ on top of its owner's library/.test(oracle)) produces(profile, 'tempo_interaction', 'Trades for tempo by delaying an opposing resource.', 0.9);
  if (/players can't cast|(?:your|each|an) opponents? can't cast|skip (?:their|that player's) |doesn't untap during/.test(oracle)) produces(profile, 'resource_denial', 'Constrains opposing actions or resource access.', 0.9, { repeatable: true });
  if (/during each opponent's turn|on each other player's turn|each opponent's upkeep/.test(oracle)) produces(profile, 'opponents_turn_value', 'Generates value during opponents’ turns.', 0.9, { repeatable: true });
  if (/at the beginning of each end step|at the beginning of your end step[^.]*draw|whenever you counter[^.]*draw|whenever an opponent casts[^.]*draw/.test(oracle)) produces(profile, 'control_inevitability', 'Turns repeated interaction or passing turns into sustained advantage.', 0.9, { repeatable: true });
  if (profile.produces.some((entry) => ['permission', 'tax_effect', 'resource_denial'].includes(entry.key)) && ['repeatable', 'persistent'].includes(profile.delivery?.repeatability)) produces(profile, 'repeatable_interaction', 'Keeps an interaction or denial effect available across turns.', 0.9, { repeatable: true });
}

function addGroupSlugSemantics(profile, oracle) {
  const punish = (key, evidence, pattern, confidence = 1) => {
    if (!pattern.test(oracle)) return;
    produces(profile, key, evidence, confidence, { repeatable: true, direction: 'opponent' });
    produces(profile, 'opponent_life_loss', evidence, confidence, { repeatable: true, direction: 'opponent' });
    role(profile, 'payoff', evidence, confidence);
  };
  punish('draw_punishment', 'Punishes opponents for drawing cards.', /whenever (?:an|each) opponent draws|opponent draws a card[^.]*(?:loses|damage)/);
  punish('cast_punishment', 'Punishes opponents for casting spells.', /(?:whenever an opponent casts|opponent casts a spell)[^.]*(?:loses|damage)/);
  punish('land_punishment', 'Punishes players or opponents for lands entering.', /whenever (?:a land|a player puts a land)[^.]*(?:damage|loses)|land enters[^.]*deals? [^.]*damage/);
  punish('attack_punishment', 'Punishes attacking or not attacking.', /whenever [^.]*attacks you|unless [^.]*attacks|creatures? [^.]*attack[^.]*(?:damage|loses)/);
  if (/whenever (?:an|each) opponent draws/.test(oracle)) { wants(profile, 'opponent_card_drawn', 'Uses opponent draw events as punishment triggers.'); rewards(profile, 'opponent_card_drawn', 'Turns opponent draws into table pressure.'); }
  if (/whenever an opponent casts/.test(oracle)) { wants(profile, 'opponent_spell_cast', 'Uses opponent spell casts as punishment triggers.'); rewards(profile, 'opponent_spell_cast', 'Turns opponent spell casts into table pressure.'); }
  if (/whenever (?:a land|a player puts a land)/.test(oracle)) { wants(profile, 'land_enters', 'Uses land-entry events as punishment triggers.'); rewards(profile, 'land_enters', 'Turns land entries into table pressure.'); }
  if (/(?:each|all) players?[^.]*(?:loses? life|damage)|deals? [^.]*damage to each player/.test(oracle)) produces(profile, 'all_player_damage', 'Damages or drains every player, including its controller.', 1, { repeatable: profile.delivery?.repeatability !== 'one_shot', direction: 'each_player' });
  if (/if (?:an|a) opponent would lose life[^.]*twice that much|double[^.]*damage[^.]*opponent|additional [^.]*damage to (?:an|each) opponent/.test(oracle)) addFeature(profile.enables, 'opponent_life_loss', 'Amplifies life loss or damage dealt to opponents.', 1, { repeatable: true, scaling: 'doubling' });
  if (/players can't gain life|your opponents can't gain life/.test(oracle)) produces(profile, 'lifegain_denial', 'Prevents opponents from recovering life.', 1, { repeatable: true });
  if (/red source you control would deal damage|source you control would deal noncombat damage/.test(oracle)) {
    wants(profile, 'controlled_damage', 'Amplifies damage from sources you control.');
    rewards(profile, 'controlled_damage', 'Adds damage to each qualifying source.');
    addFeature(profile.enables, 'controlled_damage', 'Amplifies repeated damage from controlled sources.', 1, { repeatable: true });
  }
  if (/deals? [^.]*damage to (?:each opponent|target opponent|any target|that player)|each opponent loses/.test(oracle)) produces(profile, 'controlled_damage', 'Deals damage or life loss to an opponent.', 0.85, { direction: 'opponent' });
  if (profile.constraints.some((entry) => entry.key === 'self_damage')) profile.group_slug_self_cost = true;
}

function addTribalSemantics(profile, oracle, subtypes) {
  if (/\bchangeling\b|this card is every creature type/.test(oracle)) {
    addFeature(profile.resources, 'tribe:any', 'Counts as every creature type.', 1);
    profile.tribal_roles ||= [];
    profile.tribal_roles.push({ kind: 'universal_member', tribe: 'any', evidence: 'Changeling supplies any requested creature type.' });
  }
  const normalizeTribe = (value) => value.replace(/ies$/, 'y').replace(/ves$/, 'f').replace(/s$/, '');
  const excludedTribes = new Set(['a', 'another', 'artifact', 'black', 'blue', 'card', 'creature', 'each', 'enchanted', 'equipped', 'green', 'instant', 'land', 'noncreature', 'number', 'of', 'one', 'other', 'permanent', 'red', 'sorcery', 'target', 'the', 'token', 'up', 'white']);
  const referencedTypes = [...oracle.matchAll(/\b([a-z]+) (?:creature cards?|creatures?|cards?|spells?) (?:you control|you cast|in your graveyard|enter|cost|have|get|gain)/g)]
    .map((match) => normalizeTribe(match[1]))
    .filter((value) => !excludedTribes.has(value));
  const createdTokenTypes = [...oracle.matchAll(/create[^.]*\b([a-z]+) creature tokens?/g)]
    .map((match) => normalizeTribe(match[1]))
    .filter((value) => !excludedTribes.has(value));
  const namedTypes = unique([
    ...subtypes,
    ...referencedTypes,
    ...createdTokenTypes,
    ...[...oracle.matchAll(/(?:choose a creature type|creature type of your choice|of the chosen type|of that type)/g)].map(() => 'chosen')
  ]);
  profile.tribal_roles ||= [];
  const add = (kind, tribe, evidence) => { if (!profile.tribal_roles.some((entry) => entry.kind === kind && entry.tribe === tribe)) profile.tribal_roles.push({ kind, tribe, evidence }); };
  for (const tribe of namedTypes) {
    const plural = tribe === 'elf' ? 'elves' : tribe.endsWith('y') ? `${tribe.slice(0, -1)}ies` : `${tribe}s`;
    if (new RegExp(`search your library for (?:an?|one|up to [^ ]+) ${tribe} (?:card|creature)`).test(oracle) || (tribe === 'chosen' && /search your library[^.]*creature card of the chosen type/.test(oracle))) add('typed_tutor', tribe, `Tutors specifically for ${tribe} cards.`);
    if (new RegExp(`${tribe} spells? you cast cost|(?:${tribe}|${plural}) you control (?:get|have|gain)`).test(oracle) || (tribe === 'chosen' && /spells? of the chosen type[^.]*cost|creatures? of the chosen type[^.]*(?:get|have|gain)/.test(oracle))) add('typed_reducer_or_lord', tribe, `Reduces costs for or improves ${tribe} cards.`);
    if (new RegExp(`create[^.]*${tribe} creature token`).test(oracle) || (tribe === 'chosen' && /create[^.]*creature token[^.]*chosen type/.test(oracle))) add('typed_token_maker', tribe, `Creates ${tribe} creature tokens.`);
    if (new RegExp(`return[^.]*${tribe} card[^.]*from your graveyard`).test(oracle)) add('typed_recursion', tribe, `Recurs ${tribe} cards.`);
    if (referencedTypes.includes(tribe)) wants(profile, `tribe:${tribe}`, `Explicitly references ${tribe} cards or permanents.`, 0.95);
    if (profile.tribal_roles.some((entry) => entry.tribe === tribe && ['typed_tutor', 'typed_reducer_or_lord', 'typed_recursion'].includes(entry.kind))) rewards(profile, `tribe:${tribe}`, `Provides a typed ${tribe} payoff.`, 0.95);
  }
  if (/choose a creature type/.test(oracle)) addFeature(profile.enables, 'tribe:any', 'Adapts to the commander’s chosen creature type.', 0.95);
}

function assessSemanticUncertainty(profile, oracle) {
  const reasons = [];
  if ((profile.modal?.mode_count || 0) >= 4 || (profile.modal?.exclusive && (profile.modal?.mode_count || 0) >= 3)) reasons.push('many mutually exclusive modes');
  if ((oracle.match(/\binstead\b/g) || []).length >= 2 || /if [^.]+ would [^.]+ instead[^.]+if [^.]+/.test(oracle)) reasons.push('nested replacement effects');
  if ((oracle.match(/\bfor each\b/g) || []).length >= 2 && /equal to|plus/.test(oracle)) reasons.push('nested quantified scaling');
  if (/you may pay [^.]+ rather than pay[^.]+where x|choose [^.]+that hasn't been chosen/.test(oracle)) reasons.push('complex alternate cost or mode state');
  if (!profile.produces.length && !profile.wants.length && !profile.rewards.length && oracle.length > 160) reasons.push('long unsupported Oracle construction');
  return { level: reasons.length >= 2 ? 'high' : reasons.length ? 'medium' : 'low', reasons };
}

function detectManaValue(card) {
  const numeric = Number(card?.cmc ?? card?.mana_value);
  if (Number.isFinite(numeric) && numeric >= 0) return numeric;
  return (String(card?.mana_cost || '').match(/\{([^}]+)\}/g) || []).reduce((sum, symbol) => {
    const token = symbol.slice(1, -1).toUpperCase();
    if (/^\d+$/.test(token)) return sum + Number(token);
    return ['X', 'Y', 'Z'].includes(token) ? sum : sum + 1;
  }, 0);
}

function countColoredPips(card) {
  return (String(card?.mana_cost || '').match(/\{[WUBRG](?:\/[WUBRGP])?\}/gi) || []).length;
}

function analyzeDelivery(card, oracle, types) {
  const raw = String(card?.oracle_text || card?.oracleText || '');
  const rulesOnly = raw.replace(/\([^)]*\)/g, ' ');
  const permanent = types.some((type) => ['creature', 'artifact', 'enchantment', 'planeswalker', 'land'].includes(type));
  const activated = /(?:^|\n)[^.\n]{1,120}:/.test(rulesOnly);
  const requiresTap = /\{T\}/i.test(rulesOnly);
  const sacrificeCost = /(?:\{|,|—|-)\s*sacrifice|sacrifice [^.:]+:|as an additional cost[^.]*sacrifice/i.test(rulesOnly);
  const discardCost = /discard (?:a|one or more|x) cards?[^.:]*:/i.test(rulesOnly) || /as an additional cost[^.]*discard/i.test(rulesOnly);
  const lifeCost = /pay \d+ life/i.test(rulesOnly);
  const oncePerTurn = includesAny(oracle, ['only once each turn', 'triggers only once each turn', 'once during each of your turns']);
  const oncePerGame = includesAny(oracle, ['for the rest of the game', 'only once per game']);
  const etbOnly = includesAny(oracle, ['when this creature enters', 'when this permanent enters', 'when ~ enters']) || /when [^.]{0,80} enters or dies/.test(oracle);
  const deathOnly = includesAny(oracle, ['when this creature dies', 'when this permanent dies', 'when ~ dies']) || /when [^.]{0,80} enters or dies/.test(oracle);
  const attackOnly = includesAny(oracle, ['whenever this creature attacks', 'whenever ~ attacks', 'when this creature attacks']);
  const combatDamageOnly = includesAny(oracle, ['deals combat damage to a player', 'deal combat damage to a player']);
  const opponentAction = includesAny(oracle, ['whenever an opponent', 'if an opponent', 'unless that player']);
  const relinquishesControl = /target opponent gains control of (?:this|that) (?:artifact|permanent|creature)|an opponent gains control of (?:this|that)/.test(oracle);
  const threshold = /\bif (?:you control|there are|you have|your life total|that player|an opponent)|\bas long as |\bthreshold\b|\bdelirium\b|\bmetalcraft\b/i.test(oracle);
  const conditionCount = [oncePerTurn, oncePerGame, etbOnly, deathOnly, attackOnly, combatDamageOnly, requiresTap, sacrificeCost, discardCost, opponentAction, threshold].filter(Boolean).length;
  let repeatability = 'one_shot';
  if (permanent && activated) repeatability = oncePerTurn ? 'once_per_turn' : 'repeatable';
  else if (permanent && /(whenever|at the beginning|each time|static ability)/i.test(raw)) repeatability = oncePerTurn ? 'once_per_turn' : 'repeatable';
  else if (permanent && /\bif [^.]+ would [^.]+ instead|\b(?:spells?|abilities|creatures?|artifacts?|enchantments?|tokens?) you control (?:have|get|cost)|\badditional\b|\btwice that many\b/i.test(raw)) repeatability = 'repeatable';
  else if (etbOnly) repeatability = 'etb_only';
  if (activated && relinquishesControl) repeatability = 'one_shot';
  else if (deathOnly) repeatability = 'death_only';
  else if (attackOnly) repeatability = 'attack_only';
  else if (combatDamageOnly) repeatability = 'combat_damage_only';
  else if (permanent) repeatability = 'persistent';
  if (permanent && etbOnly && deathOnly) repeatability = 'repeatable';
  if (oncePerGame) repeatability = 'once_per_game';
  if (oracle.includes('dredge')) repeatability = 'repeatable';
  const reliability = Math.max(0.25, Math.min(1, 1 - conditionCount * 0.09 - (opponentAction ? 0.1 : 0)));
  return {
    repeatability, reliability: Number(reliability.toFixed(2)), condition_count: conditionCount,
    once_per_turn: oncePerTurn, once_per_game: oncePerGame, etb_only: etbOnly, death_only: deathOnly,
    attack_only: attackOnly, combat_damage_only: combatDamageOnly, requires_tap: requiresTap,
    sacrifice_cost: sacrificeCost, discard_cost: discardCost, life_cost: lifeCost,
    opponent_action: opponentAction, threshold_condition: threshold,
    activation_cost: activated ? Math.max(0, detectManaValue({ mana_cost: raw.match(/\{[^}]+\}(?=[^:]{0,80}:)/)?.[0] || '' })) : 0
  };
}

function inferDependencies(oracle, subtypes) {
  const dependencies = [];
  const add = (key, evidence) => { if (!dependencies.some((entry) => entry.key === key)) dependencies.push({ key, evidence }); };
  if (oracle.includes('another creature')) add('another_creature', 'Requires another creature; the card itself cannot satisfy this setup.');
  else if (includesAny(oracle, ['creature you control', 'target creature you control'])) add('creature', 'Requires a creature you control.');
  if (includesAny(oracle, ['artifact you control', 'another artifact', 'sacrifice an artifact'])) add('artifact', 'Requires an artifact in play.');
  if (includesAny(oracle, ['token you control', 'one or more tokens', 'sacrifice a token'])) add('tokens', 'Requires a token resource.');
  if (includesAny(oracle, ['with a counter on it', 'has a counter on it', 'among permanents you control'])) add('counter_added', 'Requires an existing counter or established board state.');
  if (includesAny(oracle, ['card in your graveyard', 'cards in your graveyard', 'from your graveyard'])) add('graveyard_population', 'Requires cards in your graveyard.');
  if (includesAny(oracle, ['if you cast an instant', 'if you cast a sorcery', 'instant or sorcery card'])) add('instant_or_sorcery_cast', 'Requires an instant or sorcery context.');
  for (const subtype of subtypes) if (oracle.includes(`${subtype} you control`) || oracle.includes(`${subtype}s you control`)) add(`tribe:${subtype}`, `Requires ${subtype} support.`);
  return dependencies;
}

function detectConflicts(profile, oracle) {
  const conflicts = [];
  const add = (key, feature, evidence, severity = 'major') => conflicts.push({ key, feature, evidence, severity });
  if (includesAny(oracle, ['cards in graveyards lose all abilities', "players can't cast spells from graveyards", 'exile all graveyards', 'exile all cards from all graveyards'])) add('graveyard_shutdown', 'graveyard_population', 'Shuts down graveyard access or removes graveyard resources.');
  if (includesAny(oracle, ['if a creature would die, exile it instead', 'if a creature card would be put into a graveyard', 'if a card or token would be put into a graveyard', 'exile it instead'])) {
    add('death_replacement', 'creature_dies', 'Replaces death or graveyard movement with exile.');
    add('graveyard_replacement', 'graveyard_population', 'Exiles cards instead of allowing the graveyard resource to accumulate.');
  }
  if (includesAny(oracle, ["tokens can't be created", 'if one or more tokens would be created', 'players cannot create tokens'])) add('token_suppression', 'token_created', 'Suppresses or replaces token creation.');
  if (includesAny(oracle, ['sacrifice all artifacts', 'sacrifice an artifact for each', 'sacrifice each artifact'])) add('artifact_depletion', 'artifact', 'Consumes artifacts the plan may need to retain.', 'conditional');
  if (includesAny(oracle, ['each player discards', 'each opponent discards']) && profile.roles.some((entry) => entry.key === 'interaction')) add('forced_discard', 'cards', 'Reduces hand resources and can undermine a hand-size plan.', 'conditional');
  if (oracle.includes('noncreature spells cost') && oracle.includes('more to cast')) add('spell_tax', 'instant_or_sorcery_cast', 'Taxes the noncreature spells a spellslinger plan wants to chain.');
  if (oracle.includes('creatures lose all abilities')) add('ability_shutdown', 'creature', 'Removes creature abilities that may carry the commander engine.');
  if (includesAny(oracle, ["counters can't be put", 'counters cannot be put'])) add('counter_shutdown', 'counter_added', 'Prevents counters from being placed.');
  if (includesAny(oracle, ["players can't gain life", 'players cannot gain life', "your opponents can't gain life"])) add('lifegain_shutdown', 'life_gained', 'Prevents the life-gain events the commander wants.');
  if (/creature tokens? get[s]? -\d+\/-\d+/.test(oracle)) add('token_hate', 'token_created', 'Continuously suppresses small creature tokens.', 'conditional');
  if (/permanent entering[^.]*counter that ability unless|enters(?: the battlefield)?[^.]*counter that triggered ability/.test(oracle)) {
    add('etb_trigger_suppression', 'creature_enters', 'Counters triggered abilities caused by permanents entering unless an additional cost is paid.');
    add('etb_trigger_suppression', 'artifact_enters', 'Counters triggered abilities caused by permanents entering unless an additional cost is paid.');
  }
  return conflicts;
}

function inferColorIdentity(card) {
  return unique((Array.isArray(card?.color_identity) ? card.color_identity : []).map((value) => String(value).toUpperCase()).filter((value) => COLORS.has(value)));
}

function role(profile, key, evidence, confidence = 1, metadata = {}) { addFeature(profile.roles, key, evidence, confidence, metadata); }
function produces(profile, key, evidence, confidence = 1, metadata = {}) { addFeature(profile.produces, key, evidence, confidence, metadata); }
function wants(profile, key, evidence, confidence = 1, metadata = {}) { addFeature(profile.wants, key, evidence, confidence, metadata); }
function rewards(profile, key, evidence, confidence = 1, metadata = {}) { addFeature(profile.rewards, key, evidence, confidence, metadata); }

export function buildSemanticCardProfile(card = {}) {
  const rawOracle = String(card.oracle_text || card.oracleText || '');
  const oracle = text(rawOracle);
  const typeLine = String(card.type_line || card.typeLine || '');
  const types = detectTypes(typeLine);
  const subtypes = detectSubtypes(typeLine);
  const delivery = analyzeDelivery(card, oracle, types);
  const profile = {
    schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION,
    oracle_id: String(card.oracle_id || card.id || '').trim(),
    name: String(card.name || card.card_name || '').trim(),
    type_line: typeLine,
    oracle_text: String(card.oracle_text || card.oracleText || ''),
    mana_value: detectManaValue(card), colored_pips: countColoredPips(card), color_identity: inferColorIdentity(card), types, subtypes,
    produces: [], wants: [], rewards: [], enables: [], roles: [], constraints: [],
    zones: [], trigger_patterns: [], resources: [], keywords: [], themes: [], conflicts: [], dependencies: [], conversions: [],
    modal: detectModalSemantics(rawOracle), trigger_frequency: detectTriggerFrequency(oracle), qualifiers: extractQualifiers(oracle), delivery,
    counter_types: detectCounterTypes(oracle), token_semantics: []
  };

  for (const type of types) addFeature(profile.resources, type, `Card is a ${type}.`);
  for (const subtype of subtypes) {
    addFeature(profile.resources, `tribe:${subtype}`, `Card has subtype ${subtype}.`, 0.9);
    addFeature(profile.resources, subtype, `Card has subtype ${subtype}.`, 0.9);
    if (oracle.includes(`${subtype} you control`) || oracle.includes(`${subtype}s you control`) || oracle.includes(`${subtype} card`) || oracle.includes(`${subtype} spell`) || oracle.includes(`another ${subtype}`) || oracle.includes(`a ${subtype} enters`)) wants(profile, `tribe:${subtype}`, `Explicitly references ${subtype} cards, spells, or permanents.`, 0.9);
    if (new RegExp(`(?:other |each |all )?${subtype}s? you control (?:get|have|gain)`).test(oracle)) rewards(profile, `tribe:${subtype}`, `Provides a payoff to ${subtype} permanents you control.`, 1);
  }
  if (types.includes('creature')) {
    addFeature(profile.produces, 'creature_enters', 'Casting this creature can create a creature-enter event.', 0.75, { source_kind: 'card_type' });
    addFeature(profile.produces, 'etb:creature:you', 'Casting this creature makes it enter under your control.', 0.75, { source_kind: 'card_type', object_class: 'creature', qualifiers: ['you_control'] });
    addFeature(profile.produces, 'creature_dies', 'This creature can participate in death events.', 0.45, { source_kind: 'card_type' });
  }
  if (types.includes('artifact')) {
    addFeature(profile.produces, 'artifact_enters', 'Casting this artifact can create an artifact-enter event.', 0.75, { source_kind: 'card_type' });
    addFeature(profile.produces, 'etb:artifact:you', 'Casting this artifact makes it enter under your control.', 0.75, { source_kind: 'card_type', object_class: 'artifact', qualifiers: ['you_control'] });
  }
  if (types.includes('enchantment')) addFeature(profile.produces, 'enchantment_cast', 'Casting this card creates an enchantment-cast event.', 0.9, { source_kind: 'card_type' });
  if (types.includes('instant') || types.includes('sorcery')) {
    addFeature(profile.produces, 'instant_or_sorcery_cast', 'Casting this card creates an instant-or-sorcery cast event.', 0.9, { source_kind: 'card_type' });
    addFeature(profile.produces, 'noncreature_spell_cast', 'Casting this card creates a noncreature-spell cast event.', 0.8, { source_kind: 'card_type' });
  }
  if (types.includes('land')) addFeature(profile.produces, 'land_enters', 'Playing this land creates a land-enter event.', 0.8, { source_kind: 'card_type' });
  if (types.some((type) => ['creature', 'artifact', 'enchantment', 'instant', 'sorcery', 'planeswalker', 'battle'].includes(type))) addFeature(profile.produces, 'spell_cast', 'Casting this nonland card creates a spell-cast event.', 0.75, { source_kind: 'card_type' });
  addAttachmentFeatures(profile, oracle, types, subtypes);
  addEtbSemantics(profile, oracle);
  addGraveyardSemantics(profile, oracle);
  addTypedCounterFeatures(profile, oracle);
  if (/\{t\}[^:]{0,80}:|\{t\},/.test(oracle)) produces(profile, 'tap_activated_ability', 'Has a tap-costed activated ability.', 1, { repeatable: true });
  if (/untap target (?:artifact|creature|permanent)|untap all artifacts|untap during each other player's untap step/.test(oracle)) addFeature(profile.enables, 'tap_activated_ability', 'Untaps a permanent so its tap-costed activated ability can be used again.', 1, { repeatable: profile.delivery?.repeatability !== 'one_shot' });
  if (/if one or more permanents were sacrificed to activate|sacrificed to activate it/.test(oracle)) {
    wants(profile, 'sacrifice_activated_ability', 'Rewards activated abilities whose costs sacrifice permanents.');
    rewards(profile, 'sacrifice_activated_ability', 'Copies or improves sacrifice-costed activated abilities.');
  }
  if (/creatures? you control (?:are|is) every creature type/.test(oracle)) addFeature(profile.enables, 'tribe:any', 'Makes creatures every creature type, satisfying exact tribal restrictions.', 1, { repeatable: true });
  if (/gains? double strike|have double strike/.test(oracle)) {
    produces(profile, 'combat_damage_multiplier', 'Grants double strike to create an additional combat-damage event.', 0.9);
    addFeature(profile.enables, 'combat_damage', 'Double strike creates an additional combat-damage event.', 0.9);
  }
  addTribalSemantics(profile, oracle, subtypes);

  const triggerRules = [
    ['creature_dies', ['whenever another creature dies', 'whenever a creature dies', 'whenever one or more creatures die', 'creature you control dies', 'you control dies', 'creature is put into a graveyard from the battlefield']],
    ['creature_enters', ['whenever another creature enters', 'whenever a creature enters', 'creature enters the battlefield']],
    ['artifact_enters', ['whenever an artifact enters', 'artifact enters the battlefield']],
    ['enchantment_cast', ['whenever you cast an enchantment', 'cast an enchantment spell']],
    ['noncreature_spell_cast', ['whenever you cast a noncreature spell', 'cast a noncreature spell']],
    ['spell_cast', ['whenever you cast a spell', 'whenever you cast your first spell', 'first spell you cast each turn']],
    ['instant_or_sorcery_cast', ['whenever you cast an instant or sorcery', 'cast an instant or sorcery spell']],
    ['card_drawn', ['whenever you draw', 'whenever an opponent draws', 'whenever a player draws', 'draw your second card', 'draw one or more cards']],
    ['life_gained', ['whenever you gain life', 'if you gained life']],
    ['land_enters', ['whenever a land enters', 'land enters the battlefield']],
    ['counter_added', ['whenever one or more counters are put', 'whenever you put one or more counters']],
    ['token_created', ['whenever you create one or more tokens', 'whenever a token enters']],
    ['attacks', ['whenever you attack', 'whenever one or more creatures you control attack', 'whenever this creature attacks']],
    ['combat_damage', ['deals combat damage to a player', 'deal combat damage to a player']],
    ['cast_from_graveyard', ['cast a spell from your graveyard', 'cast a card from your graveyard']],
    ['sacrifice_event', ['whenever you sacrifice', 'whenever a permanent is sacrificed', 'whenever a player sacrifices', 'whenever an opponent sacrifices']],
    ['land_to_graveyard', ['land card is put into your graveyard', 'land cards are put into your graveyard']],
    ['opponent_mill', ["put into an opponent's graveyard from their library", "put into your opponents' graveyards from their libraries"]]
  ];
  for (const [key, needles] of triggerRules) {
    if (!includesAny(oracle, needles)) continue;
    const narrowTrigger = /(?:whenever|when)[^.]{0,180}(?:with (?:a|one or more|an?) [^.]*counter|if |unless |only if |combat damage)/.test(oracle);
    const triggerSource = narrowTrigger ? { source_kind: 'conditional_oracle' } : {};
    wants(profile, key, `Triggers on ${key.replace(/_/g, ' ')}.`, 1, triggerSource);
    rewards(profile, key, `Provides a payoff when ${key.replace(/_/g, ' ')} occurs.`, 1, triggerSource);
    addFeature(profile.trigger_patterns, key, 'Oracle trigger detected.', 1, triggerSource);
    role(profile, 'payoff', `Rewards ${key.replace(/_/g, ' ')}.`, 1, triggerSource);
  }
  if (/whenever (?:an|each) opponent draws|whenever an opponent draws/.test(oracle)) {
    wants(profile, 'opponent_card_drawn', 'Triggers specifically when an opponent draws a card.');
    rewards(profile, 'opponent_card_drawn', 'Provides a payoff for opponent card draws.');
    addFeature(profile.trigger_patterns, 'opponent_card_drawn', 'Opponent-directed draw trigger detected.');
  }
  if (/whenever [^.\n]{1,100} attacks(?:,|\.| )/.test(oracle) && !profile.wants.some((entry) => entry.key === 'attacks')) {
    wants(profile, 'attacks', 'Triggers when the named creature attacks.');
    rewards(profile, 'attacks', 'Provides a payoff for its attack event.');
    addFeature(profile.trigger_patterns, 'attacks', 'Named self-attack trigger detected.');
    role(profile, 'payoff', 'Rewards attack events.');
  }
  if (/whenever you put one or more [^\n.]*counters?/.test(oracle)) {
    wants(profile, 'counter_added', 'Triggers when counters are placed.'); rewards(profile, 'counter_added', 'Pays off counter-placement events.'); addFeature(profile.trigger_patterns, 'counter_added', 'Oracle counter trigger detected.'); role(profile, 'payoff', 'Rewards placing counters.');
  }
  if (/whenever one or more creature cards? (?:is|are) put into your graveyard/.test(oracle)) {
    wants(profile, 'graveyard_population', 'Triggers when creature cards enter your graveyard.'); rewards(profile, 'graveyard_population', 'Pays off creature cards entering your graveyard.'); role(profile, 'payoff', 'Rewards graveyard population.');
  }
  if (/creature dying causes a triggered ability[^.]*triggers? an additional time|triggered ability[^.]*triggers when (?:a|another) creature dies[^.]*additional time/.test(oracle)) {
    wants(profile, 'creature_dies', 'Amplifies abilities that trigger from creature deaths.');
    rewards(profile, 'creature_dies', 'Adds another resolution to creature-death triggers.');
    addFeature(profile.enables, 'creature_dies', 'Repeats triggered abilities caused by creature deaths.', 1, { repeatable: true });
    role(profile, 'payoff', 'Amplifies creature-death payoffs.');
  }

  if (/draws? (?:a|an additional|one|two|three|x|that many) cards?/.test(oracle) || oracle.includes('draw cards equal')) {
    produces(profile, 'cards', 'Draws cards.'); produces(profile, 'card_drawn', 'Creates card-draw events.'); role(profile, 'card_draw', 'Produces card advantage.');
  }
  if (/for each card you(?:'ve| have) drawn|cards you(?:'ve| have) drawn this turn/.test(oracle)) wants(profile, 'card_drawn', 'Uses the number of cards drawn this turn as an input.');
  if (oracle.includes('investigate')) {
    produces(profile, 'clue_tokens', 'Creates Clue tokens.'); produces(profile, 'artifact_tokens', 'Clues are artifact tokens.');
    role(profile, 'card_draw', 'Clues provide delayed card draw.', 0.8); role(profile, 'token_generation', 'Creates Clue tokens.');
  }
  profile.token_semantics = detectTokenSemantics(rawOracle, oracle, delivery);
  if (profile.token_semantics.length) {
    const tokenConditional = /(?:whenever|when|if)[^.]{0,180}(?:create|creates)[^.]*token/.test(oracle) || /with a [^.]*(?:counter|counters)[^.]{0,120}(?:create|creates)/.test(oracle);
    const tokenSource = tokenConditional ? { source_kind: 'conditional_oracle' } : {};
    const maxMagnitude = Math.max(...profile.token_semantics.map((entry) => entry.magnitude || 1));
    const scalable = profile.token_semantics.some((entry) => entry.scaling !== 'fixed');
    const repeatable = profile.token_semantics.some((entry) => entry.repeatable);
    const tokenMetadata = { ...tokenSource, magnitude: maxMagnitude, scaling: scalable ? 'scaling' : 'fixed', repeatable };
    produces(profile, 'tokens', 'Creates tokens.', 1, tokenMetadata); produces(profile, 'token_created', 'Creates token events.', 1, tokenMetadata); role(profile, 'token_generation', 'Creates tokens.', 1, tokenMetadata);
    if (maxMagnitude >= 2) produces(profile, 'token_multiple', 'Creates multiple tokens from one resolution or event.', 1, tokenMetadata);
    if (scalable) produces(profile, 'token_scaling', 'Token output scales with X or another game quantity.', 1, tokenMetadata);
    if (repeatable) produces(profile, 'token_repeatable', 'Creates tokens through a repeatable trigger or ability.', 1, tokenMetadata);
    for (const token of profile.token_semantics) {
      produces(profile, `token:${token.token_type}`, `Creates ${token.token_type} tokens.`, token.token_type === 'unspecified' ? 0.7 : 1, { ...tokenMetadata, object_class: token.token_type });
      const clause = text(token.evidence);
      if (clause.includes('artifact')) {
        produces(profile, 'token:artifact', 'Creates artifact tokens.', 1, { ...tokenMetadata, object_class: 'artifact' });
        produces(profile, 'artifact', 'Creates artifact permanents as tokens.', 0.95, { ...tokenMetadata, object_class: 'artifact' });
      }
      if (clause.includes('creature')) produces(profile, 'token:creature', 'Creates creature tokens.', 1, { ...tokenMetadata, object_class: 'creature' });
      const tribeMatch = clause.match(/(?:white|blue|black|red|green|colorless)?\s*([a-z]+) creature tokens?/);
      if (tribeMatch && !['artifact', 'legendary'].includes(tribeMatch[1])) produces(profile, `tribe:${tribeMatch[1]}`, `Creates ${tribeMatch[1]} creature tokens.`, 0.95, { ...tokenMetadata, object_class: 'creature' });
    }
    if (oracle.includes('treasure')) {
      produces(profile, 'treasure_tokens', 'Creates Treasure tokens.'); produces(profile, 'artifact_tokens', 'Treasure is an artifact token.');
      produces(profile, 'mana', 'Treasure converts into mana.', 0.9); role(profile, 'ramp', 'Treasure provides mana acceleration.', 0.8); role(profile, 'mana_fixing', 'Treasure fixes colors.', 0.8);
    }
    if (oracle.includes('creature token')) produces(profile, 'creature_tokens', 'Creates creature tokens.');
  }
  if (/\badd \{?[wubrgc]/.test(oracle) || includesAny(oracle, ['add one mana', 'add two mana', 'add x mana'])) { produces(profile, 'mana', 'Produces mana.'); role(profile, 'ramp', 'Produces mana.'); }
  if (oracle.includes('play an additional land')) {
    produces(profile, 'extra_land_play', 'Allows an additional land play.');
    addFeature(profile.enables, 'land_enters', 'Additional land plays create more land-enter events.', 1, { repeatable: true, object_class: 'land' });
    addFeature(profile.enables, 'etb:land:you', 'Additional land plays create more land-enter events under your control.', 1, { repeatable: true, object_class: 'land', qualifiers: ['you_control'] });
    role(profile, 'ramp', 'Accelerates land development.');
  }
  if (oracle.includes('search your library') && oracle.includes('land card')) { produces(profile, 'lands', 'Finds lands from the library.'); role(profile, 'ramp', 'Finds land-based mana.'); role(profile, 'mana_fixing', 'Searches for lands.', 0.8); }
  if (oracle.includes('search your library') && !oracle.includes('land card')) role(profile, 'tutor', 'Searches the library for a card.');
  if (includesAny(oracle, ['destroy target', 'exile target', 'counter target spell']) || /return target [^\n.]+ to its owner's hand/.test(oracle)) { role(profile, 'removal', 'Answers a target permanent or spell.'); role(profile, 'interaction', 'Interacts with an opposing object.'); }
  if (includesAny(oracle, ['destroy all ', 'exile all ', 'all creatures get -', 'each creature gets -'])) role(profile, 'board_wipe', 'Can remove multiple permanents.');
  if (includesAny(oracle, ['hexproof', 'indestructible', 'phase out', 'protection from']) && includesAny(oracle, ['you control', 'target creature', 'target permanent', 'another'])) { produces(profile, 'protection', 'Grants a protective ability.'); role(profile, 'protection', 'Protects a key permanent.'); }
  if (includesAny(oracle, ['return target card from your graveyard', 'return target creature card from your graveyard', 'from your graveyard to the battlefield']) || (oracle.includes('you may cast') && oracle.includes('graveyard'))) { produces(profile, 'recursion', 'Returns or casts cards from a graveyard.'); role(profile, 'recursion', 'Recovers cards from a graveyard.'); }
  if (oracle.includes('exile') && oracle.includes('return') && oracle.includes('battlefield')) { produces(profile, 'creature_enters', 'Blinking a creature repeats its enter event.', 0.85); produces(profile, 'artifact_enters', 'Blinking an artifact repeats its enter event.', 0.7); role(profile, 'enabler', 'Repeats enter-the-battlefield effects.'); }
  if (/discard (?:a|one|two|three|four|five|six|one or more|x|that many|\d+) cards?/.test(oracle) || oracle.includes('discard cards')) { produces(profile, 'discard_event', 'Discards cards.'); role(profile, 'graveyard_setup', 'Can place selected cards in your graveyard.', 0.8); }
  if (oracle.includes('dredge') || (oracle.includes('put the top') && oracle.includes('into your graveyard'))) { produces(profile, 'self_mill', 'Moves cards from your library into your graveyard.'); produces(profile, 'graveyard_population', 'Populates your graveyard.'); produces(profile, 'land_to_graveyard', 'Can move land cards from your library into your graveyard.', 0.6); role(profile, 'graveyard_setup', 'Populates your graveyard.'); }
  if (/you gain (?:\d+|x|that much) life/.test(oracle) || oracle.includes('you gain life')) produces(profile, 'life_gained', 'Creates life-gain events.');
  if (oracle.includes('each opponent') && (oracle.includes('loses') || oracle.includes('damage to each opponent'))) produces(profile, 'opponent_life_loss', 'Causes each opponent to lose life.');
  if (oracle.includes('deals') && oracle.includes('damage to that player')) produces(profile, 'opponent_life_loss', 'Repeatedly damages affected opponents.', 0.8);
  if (includesAny(oracle, ['sacrifice a creature', 'sacrifice another creature', 'sacrifice a permanent']) || /sacrifice (?:a|an|another) [^.:\n]+\s*:/.test(oracle)) {
    produces(profile, 'sacrifice_event', 'Can sacrifice a permanent.');
    if (/sacrifice (?:a|another) [^.:\n]*creature/.test(oracle)) produces(profile, 'creature_dies', 'A creature sacrifice creates a death event.', 0.9);
    role(profile, 'sacrifice_outlet', 'Provides a sacrifice outlet.');
  }
  if (oracle.includes('put a +1/+1 counter')) produces(profile, 'plus_one_counters', 'Adds +1/+1 counters.');
  else if (/put (?:a|one or more|x|that many) [^\n.]* counters?/.test(oracle)) produces(profile, 'counters', 'Adds counters.');
  if (oracle.includes('proliferate')) { produces(profile, 'counter_amplification', 'Proliferate adds counters to existing objects.'); addFeature(profile.enables, 'counter_added', 'Repeats counter-placement events.'); role(profile, 'enabler', 'Amplifies existing counters.'); }
  if (oracle.includes('proliferate')) wants(profile, 'counter_added', 'Proliferate needs permanents or players with counters to amplify.', 0.9);
  if (includesAny(oracle, ['untap target', 'untap all', 'untap up to'])) produces(profile, 'untap', 'Untaps relevant objects.');
  if ((types.includes('instant') || types.includes('sorcery')) && /untap (?:up to )?(?:two|three|x|all) lands?/.test(oracle)) { produces(profile, 'mana_refund', 'Untaps lands to refund much of the spell cost.'); role(profile, 'ramp', 'Refunds mana by untapping lands.'); role(profile, 'enabler', 'Can continue a spell chain by refunding mana.', 0.8); }
  if (oracle.includes('cost') && includesAny(oracle, ['less to cast', 'costs {1} less', 'costs up to'])) { produces(profile, 'cost_reduction', 'Reduces a relevant cost.'); role(profile, 'ramp', 'Reduces spell costs.', 0.8); }
  if (includesAny(oracle, ['extra combat phase', 'additional combat phase'])) { produces(profile, 'extra_combat', 'Creates an additional combat phase.'); role(profile, 'finisher', 'Additional combats can close games.'); }
  if (includesAny(oracle, ['extra combat phase', 'additional combat phase']) && !/opponent's turn|opponent’s turn/.test(oracle)) {
    produces(profile, 'attacks', 'An additional combat creates more attack events.', 0.9);
    produces(profile, 'combat_damage', 'An additional combat creates more combat-damage opportunities.', 0.8);
    addFeature(profile.enables, 'attacks', 'An additional combat repeats attack-trigger events.', 1, { repeatable: true });
    addFeature(profile.enables, 'combat_damage', 'An additional combat creates another combat-damage opportunity.', 0.9, { repeatable: true });
  }
  if (oracle.includes('treasure token') && includesAny(oracle, ['instead create', 'plus an additional', 'that many plus'])) { addFeature(profile.enables, 'token_created', 'Amplifies Treasure-token creation.'); addFeature(profile.enables, 'treasure_tokens', 'Creates additional Treasure tokens.'); }
  if (oracle.includes('mill') && includesAny(oracle, ['twice that many', 'double'])) { addFeature(profile.enables, 'opponent_mill', 'Multiplies cards milled by opponents.', 1, { scaling: 'doubling', direction: 'opponent', repeatable: true }); }
  if (oracle.includes('create') && oracle.includes('twice that many') && oracle.includes('tokens')) addFeature(profile.enables, 'token_created', 'Doubles token creation.');
  if (oracle.includes('tokens would be created under your control')) { wants(profile, 'token_created', 'Uses another token-creation event as input.'); rewards(profile, 'token_created', 'Adds tokens to a token-creation event.'); addFeature(profile.enables, 'token_created', 'Replaces a token-creation event with a larger one.'); role(profile, 'payoff', 'Amplifies token creation.'); }
  if (/would create one or more tokens[^.]*twice that many|create twice that many tokens|additional token/.test(oracle)) {
    wants(profile, 'token_created', 'Uses an existing token-creation event as input.');
    rewards(profile, 'token_created', 'Multiplies the tokens created by that event.');
    addFeature(profile.enables, 'token_created', 'Multiplies token creation.', 1, { scaling: 'doubling', repeatable: true, magnitude: 4 });
    role(profile, 'payoff', 'Multiplies token creation.');
  }
  if (oracle.includes('creature attacking causes a triggered ability')) { wants(profile, 'attacks', 'Uses attack-trigger events as input.'); rewards(profile, 'attacks', 'Amplifies triggered abilities caused by attacking.'); addFeature(profile.enables, 'attacks', 'Causes attack triggers to occur an additional time.'); role(profile, 'payoff', 'Amplifies attack triggers.'); }
  if ((oracle.includes('entering causes a triggered ability') || oracle.includes('entering the battlefield causes a triggered ability') || oracle.includes('enters the battlefield causes a triggered ability')) && /(?:additional time|twice)/.test(oracle) && !/counter that ability/.test(oracle)) {
    profile.etb_multiplier = true;
    addFeature(profile.enables, 'creature_enters', 'Repeats triggered abilities caused by creatures entering.', 1, { repeatable: true, object_class: 'creature' });
    addFeature(profile.enables, 'artifact_enters', 'Repeats triggered abilities caused by artifacts entering.', 1, { repeatable: true, object_class: 'artifact' });
    addFeature(profile.enables, 'etb:creature:you', 'Repeats qualified creature enter triggers under your control.', 1, { repeatable: true, object_class: 'creature', qualifiers: ['you_control'] });
    addFeature(profile.enables, 'etb:artifact:you', 'Repeats qualified artifact enter triggers under your control.', 1, { repeatable: true, object_class: 'artifact', qualifiers: ['you_control'] });
  }
  if (oracle.includes('double') && includesAny(oracle, ['tokens', 'counters', 'trigger'])) { addFeature(profile.enables, oracle.includes('token') ? 'token_created' : oracle.includes('counter') ? 'counter_added' : 'trigger_repeat', 'Doubles a relevant output.'); role(profile, 'payoff', 'Amplifies a repeated strategic output.'); }

  if (includesAny(oracle, ['creature card in your graveyard', 'cards in your graveyard', 'from your graveyard'])) wants(profile, 'graveyard_population', 'Requires cards in a graveyard.');
  if (/artifact cards?[^.]{0,120}(?:in|from) your graveyard|artifacts? (?:in|from) your graveyard/.test(oracle)) wants(profile, 'graveyard_population:artifact', 'Uses artifact cards in your graveyard.', 1, { direction: 'self', object_class: 'artifact' });
  if (/creature cards? (?:in|from|is put into) (?:your graveyard|graveyards)|creature card is put into your graveyard|exile [^.]*creature cards? from graveyards/.test(oracle)) wants(profile, 'graveyard_population:creature', 'Uses creature cards in a graveyard.', 1, { direction: 'self', object_class: 'creature' });
  if (/permanent cards? (?:in|from) your graveyard|permanent spell of each permanent type from your graveyard/.test(oracle)) wants(profile, 'graveyard_population:permanent', 'Uses permanent cards in your graveyard.', 1, { direction: 'self', object_class: 'permanent' });
  if (/instant or sorcery (?:cards?|spells?)[^.]{0,120}(?:in|from) your graveyard|instant and sorcery (?:cards?|spells?)[^.]{0,120}(?:in|from) your graveyard/.test(oracle)) wants(profile, 'graveyard_population:instant_or_sorcery', 'Uses instant or sorcery cards in your graveyard.', 1, { direction: 'self', object_class: 'instant_or_sorcery' });
  if (/noncreature[^.]{0,120}cards?[^.]{0,120}(?:in|from) (?:a|your) graveyard/.test(oracle)) wants(profile, 'graveyard_population:noncreature', 'Uses noncreature cards in a graveyard.', 1, { direction: 'self', object_class: 'noncreature' });
  if (oracle.includes('from a graveyard')) wants(profile, 'graveyard_population', 'Uses cards placed in a graveyard.');
  if (oracle.includes('put into your graveyard from your library')) { wants(profile, 'self_mill', 'Rewards cards moving from your library to your graveyard.'); rewards(profile, 'self_mill', 'Pays off self-mill events.'); }
  if (oracle.includes('land card') && oracle.includes('graveyard')) wants(profile, 'land_to_graveyard', 'Uses lands moving to or from a graveyard.');
  if (oracle.includes("opponent's graveyard") && oracle.includes('from their library')) wants(profile, 'opponent_mill', 'Uses cards milled from an opponent\'s library.');
  if (includesAny(oracle, ['for each artifact you control', 'artifacts you control'])) wants(profile, 'artifact', 'Scales with artifacts.');
  if (includesAny(oracle, ['sacrifice an artifact', 'sacrifice another artifact'])) wants(profile, 'artifact', 'Requires an artifact to sacrifice.');
  if (includesAny(oracle, ['artifact spell', 'artifact spells'])) wants(profile, 'artifact', 'Uses or rewards artifact spells.');
  if (includesAny(oracle, ['for each enchantment you control', 'enchantments you control'])) wants(profile, 'enchantment', 'Scales with enchantments.');
  if (oracle.includes('for each token you control')) wants(profile, 'tokens', 'Scales with the number of tokens.', 1);
  else if (oracle.includes('tokens you control')) wants(profile, 'tokens', 'Modifies tokens you already control.', 0.55, { source_kind: 'conditional_oracle' });
  if (includesAny(oracle, ['attacking creature', 'creatures you control attack'])) wants(profile, 'attacks', 'Needs attacking creatures.');
  if (includesAny(oracle, ['equip', 'equipped creature'])) { wants(profile, 'equipment', 'Uses Equipment or equipped creatures.'); addFeature(profile.themes, 'voltron', 'Equipment interaction.'); }
  if (includesAny(oracle, ['aura', 'enchanted creature'])) wants(profile, 'aura', 'Uses Auras or enchanted creatures.');
  if (oracle.includes('whenever you cast an aura')) wants(profile, 'enchantment_cast', 'Rewards casting Aura enchantments.');
  if (oracle.includes('instant or sorcery spell') && oracle.includes('target')) { wants(profile, 'targeted_creature_spell', 'Rewards an instant or sorcery that targets a creature.'); rewards(profile, 'targeted_creature_spell', 'Provides a payoff for targeted spells.'); }
  if ((types.includes('instant') || types.includes('sorcery')) && oracle.includes('target creature')) produces(profile, 'targeted_creature_spell', 'Targets a creature with an instant or sorcery.', 0.9);
  if (oracle.includes('venture into the dungeon') || oracle.includes('venture into the dungeon.')) { produces(profile, 'dungeon_progress', 'Advances through a dungeon.'); role(profile, 'enabler', 'Advances a dungeon plan.'); }
  if (oracle.includes('complete a dungeon')) { wants(profile, 'dungeon_progress', 'Needs dungeon progress.'); rewards(profile, 'dungeon_progress', 'Rewards completing a dungeon.'); }
  if (oracle.includes('whenever you cast') && oracle.includes('equipment')) wants(profile, 'equipment', 'Rewards casting Equipment.');
  if (/\{[^}]+\}[^:]{0,40}:/.test(String(card.oracle_text || card.oracleText || '')) && !types.includes('land')) wants(profile, 'mana', 'Has a mana-costed activated ability that benefits from additional mana.', 0.55);

  if (profile.mana_value >= 7) addFeature(profile.constraints, 'expensive_mana', `Mana value ${profile.mana_value}.`);
  else if (profile.mana_value >= 5) addFeature(profile.constraints, 'high_mana', `Mana value ${profile.mana_value}.`, 0.7);
  if (oracle.includes('only as a sorcery')) addFeature(profile.constraints, 'sorcery_speed_only', 'Activation is restricted to sorcery speed.');
  if (includesAny(oracle, ['only once each turn', 'triggers only once each turn'])) addFeature(profile.constraints, 'once_per_turn', 'Effect is limited to once each turn.');
  if (includesAny(oracle, ['each player', 'all players'])) addFeature(profile.constraints, 'symmetrical', 'Effect can affect every player.', 0.8);
  if (/opponent's turn|opponent’s turn/.test(oracle) && includesAny(oracle, ['extra combat phase', 'additional combat phase'])) addFeature(profile.constraints, 'opponent_combat_only', 'The additional combat occurs during an opponent’s turn and does not create your own attack step.');
  if (includesAny(oracle, ['you lose', 'deals damage to you'])) addFeature(profile.constraints, 'self_damage', 'Costs life or deals damage to its controller.', 0.8);
  if (oracle.includes('as an additional cost') && oracle.includes('sacrifice')) addFeature(profile.constraints, 'sacrifice_cost', 'Requires a sacrifice as an additional cost.');
  if (oracle.includes('from your graveyard') || oracle.includes('cards in your graveyard')) addFeature(profile.constraints, 'graveyard_dependency', 'Depends on graveyard access.', 0.7);
  if (subtypes.length && includesAny(oracle, subtypes.map((subtype) => `${subtype} you control`))) addFeature(profile.constraints, 'tribal_dependency', 'Requires a narrow creature type.', 0.8);

  addControlSemantics(profile, oracle, types);
  addGroupSlugSemantics(profile, oracle);
  addResourceConversions(profile, text(rawOracle.replace(/\([^)]*\)/g, ' ')));
  const sacrificeActivationClauses = [...oracle.matchAll(/sacrifice ([^.:\n]+)\s*:/g)].map((match) => text(match[1]).trim());
  profile.sacrifice_activation = sacrificeActivationClauses.length ? {
    resources: unique(sacrificeActivationClauses.flatMap((clause) => [clause.includes('creature') && 'creature', clause.includes('artifact') && 'artifact', clause.includes('token') && 'token', clause.includes('permanent') && 'permanent'].filter(Boolean))),
    self_sacrifice_only: sacrificeActivationClauses.every((clause) => /\bthis\b/.test(clause)),
    activation_count: sacrificeActivationClauses.length
  } : null;
  profile.dependencies = inferDependencies(oracle, subtypes);
  profile.dependency_level = profile.dependencies.length === 0 ? 'self_contained' : profile.dependencies.length === 1 ? 'one_dependency' : 'multiple_dependencies';
  profile.conflicts = detectConflicts(profile, oracle);
  const modalUncertainty = profile.modal.exclusive ? 0.08 : profile.modal.has_multiple_faces ? 0.03 : 0;
  const qualifierUncertainty = profile.qualifiers.includes('any_number') || profile.qualifiers.includes('variable_x') ? 0.03 : 0;
  profile.semantic_uncertainty = assessSemanticUncertainty(profile, oracle);
  const uncertaintyPenalty = profile.semantic_uncertainty.level === 'high' ? 0.22 : profile.semantic_uncertainty.level === 'medium' ? 0.1 : 0;
  profile.parser_certainty = Number(Math.max(0.3, Math.min(1, 0.55 + Math.min(0.35, (profile.produces.length + profile.wants.length + profile.rewards.length + profile.enables.length) * 0.04) - modalUncertainty - qualifierUncertainty - uncertaintyPenalty)).toFixed(2));
  const graveyardAmount = Math.max(0, ...[...oracle.matchAll(/mill (one|two|three|four|five|six|\d+|x)/g)].map((match) => parseFixedAmount(match[1]) ?? 4));
  profile.graveyard_quality = {
    direction: profile.produces.some((entry) => ['self_mill', 'own_graveyard_population', 'tutor_to_graveyard'].includes(entry.key)) ? 'self' : profile.produces.some((entry) => entry.key === 'opponent_mill') ? 'opponent' : 'none',
    selection: profile.produces.some((entry) => ['surveil', 'loot_rummage', 'tutor_to_graveyard'].includes(entry.key)) ? 'selective' : 'random',
    volume: profile.produces.some((entry) => entry.key === 'mass_graveyard_loading') || graveyardAmount >= 5 ? 'high' : graveyardAmount >= 2 ? 'medium' : graveyardAmount || profile.produces.some((entry) => ['tutor_to_graveyard', 'own_graveyard_population'].includes(entry.key)) ? 'incidental' : 'none',
    repeatability: delivery.repeatability,
    card_types: unique(profile.produces.filter((entry) => entry.key.startsWith('graveyard_population:')).map((entry) => entry.key.split(':')[1])),
    provides_recursion: profile.produces.some((entry) => entry.key === 'recursion'),
    provides_cast_from_graveyard: profile.produces.some((entry) => entry.key === 'cast_from_graveyard')
  };
  profile.sacrifice_outlet = profile.roles.some((entry) => entry.key === 'sacrifice_outlet') ? {
    resource: /sacrifice (?:an|another) artifact/.test(oracle) ? 'artifact' : /sacrifice (?:a|another) (?:creature|permanent)/.test(oracle) ? 'creature_or_permanent' : 'unknown',
    mana_cost: delivery.activation_cost,
    requires_tap: delivery.requires_tap,
    timing: oracle.includes('only as a sorcery') ? 'sorcery_only' : 'open',
    repeatability: delivery.repeatability,
    payoff: profile.conversions.find((entry) => entry.from === 'creature' || entry.from === 'sacrifice_event')?.to || null
  } : null;
  profile.control_profile = {
    permission: profile.produces.some((entry) => entry.key === 'permission'),
    tax: profile.produces.some((entry) => entry.key === 'tax_effect'),
    denial: profile.produces.some((entry) => entry.key === 'resource_denial'),
    repeatable: profile.produces.some((entry) => entry.key === 'repeatable_interaction'),
    opponent_scoped: /each opponent|your opponents|an opponent/.test(oracle),
    symmetrical: /each player|all players/.test(oracle)
  };
  profile.etb_profile = {
    payoff_classes: unique([...profile.wants, ...profile.rewards].filter((entry) => entry.key.startsWith('etb:') || entry.key.endsWith('_enters')).map((entry) => entry.object_class || entry.key.split(':')[1] || entry.key.replace('_enters', ''))),
    blink_classes: unique(profile.enables.filter((entry) => entry.key.startsWith('etb:') && entry.key.endsWith(':you')).map((entry) => entry.object_class).filter(Boolean)),
    produces_blink: profile.produces.some((entry) => entry.key === 'blink')
  };

  if (types.includes('creature')) role(profile, 'creatures', 'Is a creature.', 0.5);
  if (profile.roles.length === 0 && profile.wants.length > 0) role(profile, 'enabler', 'Provides a mechanically relevant engine piece.', 0.6);
  if (profile.mana_value >= 6 && (types.includes('creature') || types.includes('planeswalker')) && (profile.produces.length || profile.rewards.length)) role(profile, 'finisher', 'High-impact permanent can function as a finisher.', 0.6);
  return profile;
}

function mergeFeatures(profiles, key) {
  const merged = [];
  for (const profile of profiles) for (const feature of profile[key] || []) addFeature(merged, feature.key, `${profile.name}: ${feature.evidence[0] || feature.key}`, feature.confidence, { source_kind: feature.source_kind });
  return merged;
}

function inferSupportRoles(profile) {
  const commanderWants = featureKeys(profile.wants);
  const commanderRewards = featureKeys(profile.rewards);
  const roles = new Set(['ramp', 'card_draw', 'protection', 'interaction']);
  if (commanderWants.has('creature_dies') || commanderRewards.has('creature_dies') || commanderWants.has('sacrifice_event')) { roles.add('sacrifice_outlet'); roles.add('token_generation'); roles.add('recursion'); roles.add('payoff'); }
  if (commanderWants.has('creature_enters')) { roles.add('token_generation'); roles.add('recursion'); roles.add('enabler'); }
  if (commanderWants.has('instant_or_sorcery_cast') || commanderWants.has('noncreature_spell_cast')) { roles.add('card_draw'); roles.add('enabler'); roles.add('finisher'); }
  if (commanderWants.has('graveyard_population') || commanderRewards.has('cast_from_graveyard')) { roles.add('graveyard_setup'); roles.add('recursion'); }
  if (commanderWants.has('token_created') || commanderWants.has('tokens')) { roles.add('token_generation'); roles.add('payoff'); }
  if (commanderWants.has('life_gained')) roles.add('payoff');
  if (commanderWants.has('land_enters')) { roles.add('ramp'); roles.add('payoff'); }
  if (commanderWants.has('artifact') || commanderWants.has('artifact_enters')) { roles.add('token_generation'); roles.add('payoff'); }
  if (commanderWants.has('enchantment') || commanderWants.has('enchantment_cast')) roles.add('enabler');
  return MECHANICAL_ROLE_ORDER.filter((entry) => roles.has(entry));
}

function inferRoleRelevance(profile) {
  const wantsSet = featureKeys(profile.wants);
  const rewardsSet = featureKeys(profile.rewards);
  const relevance = Object.fromEntries(MECHANICAL_ROLE_ORDER.map((entry) => [entry, 'optional']));
  for (const utility of ['ramp', 'card_draw', 'removal', 'board_wipe', 'protection', 'interaction', 'mana_fixing', 'tutor']) relevance[utility] = 'generic_utility';
  const set = (roles, tier) => roles.forEach((entry) => { relevance[entry] = tier; });
  if (wantsSet.has('creature_dies') || rewardsSet.has('creature_dies') || wantsSet.has('sacrifice_event')) {
    set(['sacrifice_outlet', 'token_generation', 'payoff'], 'core'); set(['recursion', 'graveyard_setup'], 'important_support');
  }
  if (wantsSet.has('instant_or_sorcery_cast') || wantsSet.has('noncreature_spell_cast')) {
    set(['enabler', 'payoff'], 'core'); set(['card_draw', 'finisher', 'ramp'], 'important_support');
  }
  if (wantsSet.has('counter_added')) { set(['enabler', 'payoff'], 'core'); set(['token_generation', 'protection'], 'important_support'); }
  if (wantsSet.has('token_created') || wantsSet.has('tokens')) { set(['token_generation', 'payoff'], 'core'); set(['sacrifice_outlet', 'protection'], 'important_support'); }
  if (wantsSet.has('graveyard_population') || rewardsSet.has('cast_from_graveyard')) { set(['graveyard_setup', 'recursion'], 'core'); set(['sacrifice_outlet', 'payoff'], 'important_support'); }
  if (wantsSet.has('artifact') || wantsSet.has('artifact_enters')) { set(['enabler', 'payoff'], 'core'); set(['token_generation', 'recursion'], 'important_support'); }
  if (wantsSet.has('enchantment') || wantsSet.has('enchantment_cast')) { set(['enabler', 'payoff'], 'core'); set(['card_draw', 'protection'], 'important_support'); }
  if (wantsSet.has('land_enters') || wantsSet.has('land_to_graveyard')) { set(['ramp', 'graveyard_setup', 'payoff'], 'core'); set(['recursion'], 'important_support'); }
  if (wantsSet.has('attacks') || wantsSet.has('combat_damage')) { set(['enabler', 'finisher', 'protection'], 'core'); set(['card_draw', 'removal'], 'important_support'); }
  if (wantsSet.has('life_gained')) { set(['payoff', 'enabler'], 'core'); set(['protection'], 'important_support'); }
  return relevance;
}

function inferStrategicBottlenecks(profile) {
  const signals = new Set([...featureKeys(profile.wants), ...featureKeys(profile.rewards)]);
  const bottlenecks = [];
  const add = (key, role, evidence) => { if (!bottlenecks.some((entry) => entry.key === key)) bottlenecks.push({ key, role, evidence }); };
  if (signals.has('creature_dies') || signals.has('sacrifice_event')) add('on_demand_sacrifice', 'sacrifice_outlet', 'The plan needs reliable ways to create sacrifice/death events on demand.');
  if ([...signals].some((key) => key.includes('graveyard') || key === 'self_mill')) add('graveyard_population', 'graveyard_setup', 'The plan needs correctly directed, sufficiently dense graveyard setup.');
  if (signals.has('instant_or_sorcery_cast') || signals.has('noncreature_spell_cast')) add('spell_throughput', 'enabler', 'The plan needs cheap spells, cards, or mana efficiency to keep casting.');
  if (signals.has('token_created') || signals.has('tokens')) add('repeatable_token_supply', 'token_generation', 'The plan needs repeatable token supply rather than incidental bodies.');
  if ([...signals].some((key) => key.startsWith('tribe:'))) add('typed_density', 'enabler', 'The plan needs effects that preserve the exact creature-type constraint.');
  if (signals.has('attacks') || signals.has('combat_damage')) add('combat_access', 'enabler', 'The plan needs attack access, evasion, or additional combat opportunities.');
  if (signals.has('opponent_spell_cast') || signals.has('permission') || featureKeys(profile.produces).has('tax_effect')) add('interaction_density', 'interaction', 'The plan needs interaction that preserves tempo and supports a long game.');
  return bottlenecks;
}

function inferCommanderDemandProfile(profile) {
  const oracle = text(profile.members.map((member) => member.oracle_text).join('\n'));
  const signals = new Set([...featureKeys(profile.wants), ...featureKeys(profile.rewards), ...featureKeys(profile.produces)]);
  const graveyardTypes = unique([...signals].filter((key) => key.startsWith('graveyard_population:')).map((key) => key.split(':')[1]));
  const graveyardActive = [...signals].some((key) => key.includes('graveyard') || ['self_mill', 'cast_from_graveyard', 'land_to_graveyard'].includes(key));
  const graveyardScale = /for each [^.]+(?:card|creature|permanent)[^.]+graveyard|equal to the number of [^.]+graveyard|cards? in your graveyard/.test(oracle);
  const graveyardEvent = /whenever [^.]+(?:put into|leaves?) your graveyard|put into your graveyard from your library/.test(oracle);
  const sacrificeResources = unique([
    /sacrifice (?:another |a )?creature/.test(oracle) && 'creature',
    /sacrifice (?:another |an )?artifact/.test(oracle) && 'artifact',
    /sacrifice (?:another |a )?token/.test(oracle) && 'token',
    /sacrifice (?:another |a )?(?:permanent|creature or artifact)/.test(oracle) && 'permanent'
  ]);
  const etbClasses = unique([...profile.wants, ...profile.rewards].filter((entry) => entry.key.startsWith('etb:') || entry.key.endsWith('_enters')).map((entry) => entry.object_class || entry.key.split(':')[1] || entry.key.replace('_enters', '')));
  const tribalTypes = unique([...signals].filter((key) => key.startsWith('tribe:')).map((key) => key.slice(6)).filter((value) => !['chosen', 'any'].includes(value)));
  return {
    graveyard: {
      active: graveyardActive,
      required_types: graveyardTypes,
      volume_need: graveyardScale ? 'high' : graveyardEvent ? 'repeated_events' : graveyardActive ? 'moderate' : 'none',
      selection_value: graveyardTypes.length > 0 || /target [^.]+card in your graveyard|choose [^.]+graveyard/.test(oracle),
      recursion_value: /cast [^.]+from your graveyard|return [^.]+from your graveyard|onto the battlefield/.test(oracle),
      threshold_or_size_payoff: graveyardScale
    },
    sacrifice: {
      active: signals.has('sacrifice_event') || signals.has('creature_dies') || sacrificeResources.length > 0,
      accepted_resources: sacrificeResources.length ? sacrificeResources : (signals.has('creature_dies') ? ['creature'] : []),
      commander_is_outlet: profile.members.some((member) => member.sacrifice_outlet),
      needs_outlet: (signals.has('creature_dies') || signals.has('sacrifice_event')) && !profile.members.some((member) => member.sacrifice_outlet),
      values_payoff: profile.members.some((member) => member.sacrifice_outlet) || featureKeys(profile.produces).has('sacrifice_event')
    },
    control: {
      active: ['permission', 'tax_effect', 'resource_denial', 'opponents_turn_value', 'control_inevitability'].some((key) => signals.has(key)),
      values_permission: signals.has('permission'),
      values_tax: signals.has('tax_effect') || /can't cast|cost [^.]+ more|unless [^.]+ pays/.test(oracle),
      asymmetrical: /each opponent|your opponents|an opponent/.test(oracle) && !/each player|all players/.test(oracle),
      rewards_interaction: /whenever you counter|whenever an opponent casts|during each opponent's turn/.test(oracle)
    },
    etb: { active: etbClasses.length > 0 || signals.has('blink'), object_classes: etbClasses, commander_blinks: signals.has('blink') },
    tribal: { active: tribalTypes.length > 0, exact_types: tribalTypes }
  };
}

function inferBackgroundStrategies(profiles) {
  return profiles.filter((member) => member.subtypes.includes('background')).map((member) => {
    const oracle = text(member.oracle_text);
    const strategies = unique([
      /(?:power|toughness|double strike|first strike|trample|menace|attacks?|combat damage)/.test(oracle) && 'combat',
      /(?:aura|equipment|attached|enchanted|equipped)/.test(oracle) && 'attachments',
      /sacrifice|dies|graveyard/.test(oracle) && 'sacrifice_graveyard',
      /create [^.]+tokens?/.test(oracle) && 'tokens',
      /draw [^.]+cards?/.test(oracle) && 'cards',
      /\{t\}|activated abilit/.test(oracle) && 'activated_abilities',
      /counter/.test(oracle) && 'counters'
    ]);
    return { name: member.name, strategies, combat_or_attachment_plan: strategies.includes('combat') || strategies.includes('attachments') };
  });
}

function assessCommanderSemanticCoverage(profiles) {
  const supportedPatterns = [
    /create|draw|discard|mill|surveil|sacrifice|dies|graveyard|return|cast|counter target|can't cast|cost [^.]+more/,
    /enters|leaves the battlefield|attacks|combat damage|gain life|loses life|damage|token|treasure/,
    /\+1\/\+1|-1\/-1|counter|proliferate|aura|equipment|enchanted|equipped|land|artifact|enchantment/,
    /exile [^.]+ return|untap|tap target|additional combat|play an additional|search your library|protection|hexproof|indestructible/,
    /copy|power and toughness|encore|crew|explore|venture|double strike|lifelink|deathtouch|vigilance|trample|menace|ward/
  ];
  const members = profiles.map((member) => {
    const raw = String(member.oracle_text || '').replace(/\([^)]*\)/g, ' ');
    const clauses = raw.split(/\n|(?<=\.)\s+|\s+[—–]\s+|•/).map((clause) => text(clause).trim()).filter((clause) => clause.length >= 8 && !/^(partner|choose a background)/.test(clause));
    const unsupported = clauses.filter((clause) => !supportedPatterns.some((pattern) => pattern.test(clause)));
    const parsed = clauses.length - unsupported.length;
    return { name: member.name, total_clauses: clauses.length, parsed_clauses: parsed, unsupported_clauses: unsupported, ratio: clauses.length ? Number((parsed / clauses.length).toFixed(3)) : 1 };
  });
  const total = members.reduce((sum, member) => sum + member.total_clauses, 0);
  const parsed = members.reduce((sum, member) => sum + member.parsed_clauses, 0);
  const ratio = total ? parsed / total : 1;
  const reliableEdges = profiles.reduce((sum, member) => sum + [...member.produces, ...member.wants, ...member.rewards, ...member.enables].filter((entry) => entry.confidence >= 0.75 && entry.source_kind !== 'card_type').length, 0);
  const criticalUnsupported = members.flatMap((member) => member.unsupported_clauses.map((clause) => ({ member: member.name, clause }))).filter(({ clause }) => /whenever|when |at the beginning|instead|activate|additional cost|choose|copy|cast|combat damage|enters|leaves|from exile|from your graveyard/.test(clause));
  const highUncertaintyMembers = profiles.filter((member) => member.semantic_uncertainty?.level === 'high').map((member) => member.name);
  const minimumMemberRatio = Math.min(...members.map((member) => member.ratio));
  const strategicSignalCount = unique(profiles.flatMap((member) => [...member.wants, ...member.rewards, ...member.enables].filter((entry) => entry.source_kind !== 'card_type' && entry.confidence >= 0.75).map((entry) => entry.key))).length;
  const riskFlags = unique([
    criticalUnsupported.length > 0 && 'unsupported_critical_clause',
    highUncertaintyMembers.length > 0 && 'high_parser_uncertainty',
    minimumMemberRatio < 0.6 && 'weak_pair_member_coverage',
    strategicSignalCount < profiles.length && 'insufficient_strategy_edges'
  ].filter(Boolean));
  const level = riskFlags.includes('unsupported_critical_clause') || riskFlags.includes('high_parser_uncertainty')
    ? (ratio >= 0.6 && reliableEdges >= profiles.length * 2 ? 'Partial' : 'Insufficient')
    : ratio >= 0.95 && minimumMemberRatio >= 0.8 && reliableEdges >= profiles.length * 4 && strategicSignalCount >= profiles.length * 2 ? 'Full'
      : ratio >= 0.8 && minimumMemberRatio >= 0.65 && reliableEdges >= profiles.length * 3 && strategicSignalCount >= profiles.length ? 'Strong'
        : ratio >= 0.55 && minimumMemberRatio >= 0.45 && reliableEdges >= profiles.length * 1.5 ? 'Partial' : 'Insufficient';
  return { level, ratio: Number(ratio.toFixed(3)), reliable_edges: reliableEdges, strategic_signal_count: strategicSignalCount, total_clauses: total, parsed_clauses: parsed, unsupported_clause_count: total - parsed, critical_unsupported_clauses: criticalUnsupported, high_uncertainty_members: highUncertaintyMembers, risk_flags: riskFlags, minimum_member_ratio: minimumMemberRatio, members };
}

export function buildCommanderSemanticProfile(commanders) {
  const members = (Array.isArray(commanders) ? commanders : [commanders]).filter(Boolean);
  if (!members.length) throw new Error('At least one commander card is required.');
  const profiles = members.map(buildSemanticCardProfile);
  const profile = {
    schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION,
    commander_identity: profiles.map((member) => member.oracle_id).join('+'),
    commander_names: profiles.map((member) => member.name), members: profiles,
    color_identity: unique(profiles.flatMap((member) => member.color_identity)),
    produces: mergeFeatures(profiles, 'produces'), wants: mergeFeatures(profiles, 'wants'),
    rewards: mergeFeatures(profiles, 'rewards'), enables: mergeFeatures(profiles, 'enables'),
    roles: mergeFeatures(profiles, 'roles'), constraints: mergeFeatures(profiles, 'constraints'),
    zones: mergeFeatures(profiles, 'zones'), trigger_patterns: mergeFeatures(profiles, 'trigger_patterns'),
    resources: mergeFeatures(profiles, 'resources'), themes: mergeFeatures(profiles, 'themes'),
    conversions: profiles.flatMap((member) => member.conversions.map((conversion) => ({ ...conversion, source: member.name }))),
    counter_types: unique(profiles.flatMap((member) => member.counter_types || [])),
    trigger_frequency: profiles.map((member) => member.trigger_frequency),
    parser_certainty: Number((profiles.reduce((sum, member) => sum + member.parser_certainty, 0) / profiles.length).toFixed(2))
  };
  profile.background_strategies = inferBackgroundStrategies(profiles);
  const hasBackground = profile.background_strategies.length > 0;
  const voltronBackground = profile.background_strategies.some((entry) => entry.combat_or_attachment_plan);
  if (hasBackground && voltronBackground && profiles.some((member) => member.types.includes('creature'))) {
    addFeature(profile.wants, 'attachment', 'The Background pair creates a commander-centric creature plan that can use attachments.', 0.8);
    addFeature(profile.wants, 'aura', 'Auras can enhance the creature commander modified by the Background.', 0.75);
    addFeature(profile.wants, 'equipment', 'Equipment can enhance the creature commander modified by the Background.', 0.75);
    addFeature(profile.wants, 'attacks', 'The combined Background strategy expects the creature commander to attack.', 0.8);
    addFeature(profile.rewards, 'combat_damage', 'The combined Background strategy benefits from connecting in combat.', 0.7);
  }
  profile.member_signals = profiles.map((member) => ({
    name: member.name,
    inputs: unique([...member.wants, ...member.rewards].filter((entry) => entry.confidence >= 0.75).map((entry) => entry.key)),
    outputs: unique([...member.produces, ...member.enables].filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key)),
    conversions: member.conversions
  }));
  profile.pair_bridges = profiles.length > 1 ? profiles.flatMap((left, leftIndex) => profiles.slice(leftIndex + 1).flatMap((right) => {
    const leftOutputs = new Set([...left.produces, ...left.enables].filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key));
    const rightOutputs = new Set([...right.produces, ...right.enables].filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key));
    const leftInputs = new Set([...left.wants, ...left.rewards].map((entry) => entry.key));
    const rightInputs = new Set([...right.wants, ...right.rewards].map((entry) => entry.key));
    return unique([
      ...[...leftOutputs].filter((key) => rightInputs.has(key)).map((key) => `${left.name}:${key}->${right.name}`),
      ...[...rightOutputs].filter((key) => leftInputs.has(key)).map((key) => `${right.name}:${key}->${left.name}`)
    ]);
  })) : [];
  profile.support_roles = inferSupportRoles(profile);
  profile.role_relevance = inferRoleRelevance(profile);
  profile.strategic_bottlenecks = inferStrategicBottlenecks(profile);
  profile.demand_profile = inferCommanderDemandProfile(profile);
  profile.semantic_coverage = assessCommanderSemanticCoverage(profiles);
  profile.release_policy = profile.semantic_coverage.level === 'Insufficient' ? 'suppressed'
    : profile.semantic_coverage.level === 'Partial' ? 'limited' : 'full';
  return profile;
}

export function checkMechanicalCandidateLegality(commanderProfile, card = {}) {
  const profile = card.schema_version ? card : buildSemanticCardProfile(card);
  if (!profile.oracle_id) return { legal: false, reason: 'missing-canonical-identity' };
  if (commanderProfile.members.some((member) => member.oracle_id === profile.oracle_id)) return { legal: false, reason: 'commander-card' };
  const legalityResult = legalityOwner.check(
    { game: 'magic', canonicalCardId: profile.oracle_id, format: 'commander' },
    { card }
  );
  if (legalityResult.status !== 'legal') return { legal: false, reason: legalityResult.status === 'unknown' ? 'unknown-commander-legality' : 'not-commander-legal', result: legalityResult };
  const allowed = new Set(commanderProfile.color_identity || []);
  if (profile.color_identity.some((color) => !allowed.has(color))) return { legal: false, reason: 'off-color' };
  return { legal: true, reason: 'legal', result: legalityResult };
}

function fitLabel(score) {
  if (score >= 68) return 'Excellent Mechanical Fit';
  if (score >= 42) return 'Strong Mechanical Fit';
  if (score >= 22) return 'Moderate Mechanical Fit';
  return 'Limited Mechanical Fit';
}

function confidenceLabel(score) {
  if (score >= 72) return 'High';
  if (score >= 48) return 'Medium';
  return 'Low';
}

function roleWeight(tier) {
  return { core: 14, important_support: 9, optional: 5, generic_utility: 3 }[tier] || 3;
}

function dependencyState(commanderProfile, dependency) {
  const produced = featureKeys(commanderProfile.produces);
  const resources = featureKeys(commanderProfile.resources);
  const wanted = featureKeys(commanderProfile.wants);
  if (produced.has(dependency.key) || resources.has(dependency.key)) return 'commander_satisfies';
  if (wanted.has(dependency.key) || (dependency.key === 'tokens' && (wanted.has('token_created') || produced.has('token_created'))) || (dependency.key === 'graveyard_population' && (commanderProfile.support_roles.includes('graveyard_setup') || [...wanted].some((key) => key.includes('graveyard') || key === 'land_to_graveyard')))) return 'strategy_likely_satisfies';
  return 'unsupported';
}

function makePenalty(relationship, feature, weight, explanation) { return { relationship, feature, weight, explanation }; }

export function scoreMechanicalCompatibility(commanderProfile, card = {}, options = {}) {
  const candidate = card.schema_version ? card : buildSemanticCardProfile(card);
  const legality = checkMechanicalCandidateLegality(commanderProfile, { ...card, ...candidate });
  if (!legality.legal) return { eligible: false, score: null, fit_label: null, reasons: [], penalties: [], legality };
  const positive = [];
  const negative = [];
  addMatches(positive, candidate.produces, commanderProfile.wants, 'produces_wanted_resource', 30, (key) => `Creates ${key.replace(/_/g, ' ')} repeatedly or directly, feeding the commander's explicit payoff.`);
  addMatches(positive, candidate.produces, commanderProfile.rewards, 'enables_reward', 28, (key) => `Creates ${key.replace(/_/g, ' ')} events that directly turn on the commander's reward.`);
  const strategicCommanderProduces = commanderProfile.produces.filter((entry) => entry.source_kind !== 'card_type');
  const strategicCommanderEnables = commanderProfile.enables.filter((entry) => entry.source_kind !== 'card_type');
  addMatches(positive, candidate.wants, strategicCommanderProduces, 'consumes_commander_output', 19, (key) => `Uses ${key.replace(/_/g, ' ')} explicitly supplied by the commander, making the two cards mutually reinforcing.`);
  addMatches(positive, candidate.enables, commanderProfile.wants, 'amplifies_commander_plan', 27, (key) => `Repeats or amplifies ${key.replace(/_/g, ' ')}, increasing the commander's core payoff.`);
  addMatches(positive, candidate.enables, strategicCommanderProduces, 'amplifies_commander_output', 25, (key) => `Amplifies ${key.replace(/_/g, ' ')} explicitly produced by the commander, turning its normal output into a larger engine.`);
  addMatches(positive, candidate.enables, commanderProfile.enables, 'reinforces_engine_amplifier', 16, (key) => `Adds another way to amplify ${key.replace(/_/g, ' ')}, reinforcing the commander's engine effect.`, { conditional: true });
  addMatches(positive, candidate.rewards, [...commanderProfile.wants, ...commanderProfile.rewards], 'pays_off_core_event', 24, (key) => `Adds a payoff for ${key.replace(/_/g, ' ')}, the same event at the center of the commander's engine.`);
  addMatches(positive, candidate.wants, commanderProfile.wants, 'shares_strategy_input', 14, (key) => `Uses the same ${key.replace(/_/g, ' ')} input as the commander, so the surrounding deck support serves both cards.`, { conditional: true });
  addMatches(positive, candidate.resources, commanderProfile.wants, 'provides_object_type', 18, (key) => `Supplies the ${key.replace(/_/g, ' ')} object type explicitly referenced by the commander.`);
  const commanderSignalKeys = new Set([...commanderProfile.wants, ...commanderProfile.rewards].filter((entry) => entry.confidence >= 0.75).map((entry) => entry.key));
  const commanderOutputKeys = new Set([...strategicCommanderProduces, ...strategicCommanderEnables].map((entry) => entry.key));
  const commanderWants = featureKeys(commanderProfile.wants);
  const commanderRewards = featureKeys(commanderProfile.rewards);
  const candidateProduces = featureKeys(candidate.produces);
  const commanderProduced = featureKeys(commanderProfile.produces);
  if (commanderProduced.has('tap_activated_ability') && featureKeys(candidate.enables).has('tap_activated_ability')) positive.push({ relationship: 'activated_ability_reuse', feature: 'tap_activated_ability', strength_tier: 'strong_support', weight: candidate.enables.find((entry) => entry.key === 'tap_activated_ability')?.repeatable ? 12 : 7, explanation: 'Untaps the commander or its artifact class so the commander’s tap-costed activated ability can be used again.', candidate_action: 'Provides repeatable untapping for tap-costed activated abilities.', commander_connection: 'The commander’s main engine is a tap-costed activated ability.', strategic_value: 'Increases commander activation throughput while retaining cost and timing pressure.' });
  if ((commanderWants.has('sacrifice_activated_ability') || commanderRewards.has('sacrifice_activated_ability')) && candidateProduces.has('sacrifice_activated_ability')) {
    const activation = candidate.sacrifice_activation;
    const reusable = activation && !activation.self_sacrifice_only;
    const resourceBreadth = activation?.resources?.length || 0;
    positive.push({ relationship: 'sacrifice_activation_alignment', feature: `sacrifice_activated_ability:${activation?.resources?.join('+') || 'unspecified'}`, strength_tier: reusable ? 'direct_engine' : 'conditional_support', weight: reusable ? 30 + Math.min(18, resourceBreadth * 9) : 10, explanation: `Provides ${reusable ? 'a reusable' : 'a self-consuming'} activated ability whose cost sacrifices ${activation?.resources?.join(' or ') || 'a permanent'}, matching the activation pattern the commander copies or rewards.`, candidate_action: 'Pays an activated-ability cost by sacrificing a permanent.', commander_connection: 'The commander explicitly rewards sacrifice-costed activated abilities.', strategic_value: reusable ? 'Matches the full cost-and-activation relationship with repeatable access.' : 'Creates the right activation once, but sacrifices itself instead of serving as an engine.' });
  }
  const controlSignals = new Set(['permission', 'instant_speed_interaction', 'tax_effect', 'tempo_interaction', 'resource_denial', 'repeatable_interaction', 'opponents_turn_value', 'control_inevitability']);
  const commanderIsControl = [...controlSignals].some((key) => commanderSignalKeys.has(key) || commanderOutputKeys.has(key));
  const candidateControl = candidate.produces.filter((entry) => controlSignals.has(entry.key));
  if (commanderIsControl && candidateControl.length) {
    const durable = candidateControl.some((entry) => entry.repeatable) || ['repeatable', 'persistent'].includes(candidate.delivery.repeatability);
    const precise = candidateControl.some((entry) => ['permission', 'instant_speed_interaction', 'tax_effect', 'resource_denial', 'control_inevitability'].includes(entry.key));
    positive.push({ relationship: 'control_plan_support', feature: candidateControl.map((entry) => entry.key).join('+'), strength_tier: durable ? 'strong_support' : 'conditional_support', weight: durable ? 16 : precise ? 10 : 5, explanation: `${candidateControl[0].evidence?.[0] || 'Provides interaction.'} This supports the commander’s control plan by ${durable ? 'remaining relevant across turns' : 'trading efficiently at the needed timing'}.`, candidate_action: candidateControl[0].evidence?.[0], commander_connection: 'The commander taxes, constrains, or rewards playing a longer interactive game.', strategic_value: 'Advances a control-specific axis instead of receiving credit merely for being a generic spell.' });
    const demand = commanderProfile.demand_profile?.control;
    if (demand?.values_tax && (candidate.control_profile?.tax || candidate.control_profile?.denial)) positive.push({ relationship: 'control_tax_alignment', feature: candidate.control_profile.tax ? 'tax_effect' : 'resource_denial', strength_tier: candidate.control_profile.opponent_scoped && !candidate.control_profile.symmetrical ? 'direct_engine' : 'strong_support', weight: candidate.control_profile.opponent_scoped && !candidate.control_profile.symmetrical ? 18 : 10, explanation: 'Constrains opposing actions on the same tax/denial axis as the commander.', candidate_action: 'Applies an ongoing spell-casting constraint.', commander_connection: 'The commander is specifically a tax or denial engine.', strategic_value: 'Aligned, opponent-scoped restrictions compound the commander plan more cleanly than generic interaction.' });
    if (candidate.control_profile?.symmetrical && demand?.asymmetrical) negative.push(makePenalty('symmetrical_control_cost', 'control_asymmetry', -6, 'This symmetrical restriction also constrains the commander’s controller, unlike the commander’s opponent-focused plan.'));
    if (demand?.rewards_interaction && (candidate.control_profile?.permission || candidate.control_profile?.repeatable)) positive.push({ relationship: 'interaction_reward_alignment', feature: 'permission', strength_tier: 'strong_support', weight: 9, explanation: 'Provides the permission or repeatable interaction event that the commander converts into value.', candidate_action: 'Interacts at the timing the control engine rewards.', commander_connection: 'The commander rewards countering spells or acting during opponents’ turns.', strategic_value: 'Feeds the commander’s explicit interaction payoff rather than only slowing the table.' });
  }
  const slugSignals = new Set(['draw_punishment', 'cast_punishment', 'land_punishment', 'attack_punishment', 'all_player_damage', 'lifegain_denial']);
  const commanderIsSlug = commanderProduced.has('opponent_life_loss') || [...slugSignals].some((key) => commanderSignalKeys.has(key) || commanderOutputKeys.has(key));
  const candidateSlug = candidate.produces.filter((entry) => slugSignals.has(entry.key));
  if (commanderIsSlug && candidateSlug.length) {
    const repeatable = candidateSlug.some((entry) => entry.repeatable) || ['repeatable', 'persistent'].includes(candidate.delivery.repeatability);
    const selfCost = candidate.constraints.some((entry) => entry.key === 'self_damage') || candidate.group_slug_self_cost;
    positive.push({ relationship: 'typed_group_slug_pressure', feature: candidateSlug[0].key, strength_tier: repeatable ? 'direct_engine' : 'strong_support', weight: repeatable ? 24 : 14, explanation: `${candidateSlug[0].evidence?.[0]} This adds a specific repeatable punishment axis to the commander’s table-pressure plan${selfCost ? ', while also costing its controller life or resources' : ''}.`, candidate_action: candidateSlug[0].evidence?.[0], commander_connection: 'The commander establishes repeatable opponent life pressure.', strategic_value: 'Adds durable, event-specific group-slug pressure rather than unrelated damage.' });
    if (selfCost) negative.push(makePenalty('group_slug_self_cost', 'self_damage', -4, 'The pressure is symmetrical or carries a self-damage cost, reducing net advantage.'));
  }
  const nonCreatureMechanicalSubtypes = new Set(['vehicle', 'background', 'aura', 'equipment', 'fortification', 'saga', 'class', 'rune', 'cartouche', 'shrine']);
  const commanderTribes = unique([...commanderSignalKeys].filter((key) => key.startsWith('tribe:')).map((key) => key.slice(6)).filter((tribe) => !nonCreatureMechanicalSubtypes.has(tribe)));
  const candidateTribalRoles = (candidate.tribal_roles || []).filter((entry) => entry.tribe === 'any' || entry.tribe === 'chosen' || commanderTribes.includes(entry.tribe));
  if (commanderTribes.length && candidateTribalRoles.length) {
    const roleKinds = unique(candidateTribalRoles.map((entry) => entry.kind));
    positive.push({ relationship: 'typed_tribal_role', feature: `${commanderTribes.join('+')}:${roleKinds.join('+')}`, strength_tier: roleKinds.includes('typed_tutor') || roleKinds.includes('typed_reducer_or_lord') ? 'direct_engine' : 'strong_support', weight: Math.min(30, 12 + roleKinds.length * 6), explanation: `${candidateTribalRoles[0].evidence} It applies to the commander’s exact ${commanderTribes.join(' or ')} restriction rather than to creatures generically.`, candidate_action: candidateTribalRoles[0].evidence, commander_connection: `The commander explicitly builds around ${commanderTribes.join(' or ')} cards.`, strategic_value: `Fills ${roleKinds.join(', ')} tribal role${roleKinds.length > 1 ? 's' : ''} while preserving type specificity.` });
  }
  if (commanderTribes.length && candidate.enables.some((entry) => entry.key === 'tribe:any')) positive.push({ relationship: 'universal_tribal_conversion', feature: `tribe:${commanderTribes.join('+')}`, strength_tier: 'direct_engine', weight: 34, explanation: `Makes creatures every creature type, satisfying the commander’s exact ${commanderTribes.join(' and ')} restrictions across the battlefield.`, candidate_action: 'Converts all controlled creatures into every creature type.', commander_connection: `The commander independently counts or rewards ${commanderTribes.join(' and ')} creatures.`, strategic_value: 'A universal type converter supports multiple exact tribal axes without treating generic creatures as typed payoffs.' });
  const candidateExactTribes = candidate.resources.filter((entry) => entry.key.startsWith('tribe:')).map((entry) => entry.key.slice(6)).filter((tribe) => commanderTribes.includes(tribe));
  if (candidateExactTribes.length && [...candidate.wants, ...candidate.rewards].some((entry) => candidateExactTribes.some((tribe) => entry.key === `tribe:${tribe}`))) positive.push({ relationship: 'exact_tribal_payoff', feature: `tribe:${candidateExactTribes.join('+')}`, strength_tier: 'direct_engine', weight: 20, explanation: `Both belongs to and explicitly rewards the commander’s exact ${candidateExactTribes.join(' or ')} tribe.`, candidate_action: `Supplies a ${candidateExactTribes.join(' or ')} body with a typed payoff.`, commander_connection: `The commander requires dense ${candidateExactTribes.join(' or ')} support.`, strategic_value: 'Combines typed deck density with a typed payoff, outranking creatures that only share the subtype.' });
  if (commanderProfile.members.length > 1) {
    const candidateOutputs = new Set([...candidate.produces, ...candidate.enables].filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key));
    const candidateInputs = new Set([...candidate.wants, ...candidate.rewards].filter((entry) => entry.source_kind !== 'card_type').map((entry) => entry.key));
    const memberCoverage = commanderProfile.member_signals.map((member) => {
      const enablesMember = unique(member.inputs.filter((key) => candidateOutputs.has(key)));
      const consumesMemberOutput = unique(member.outputs.filter((key) => candidateInputs.has(key)));
      const conversionMatches = unique((candidate.conversions || []).flatMap((conversion) => [member.inputs.includes(conversion.to) && `${conversion.from}->${conversion.to}`, member.outputs.includes(conversion.from) && `${conversion.from}->${conversion.to}`]).filter(Boolean));
      const directness = enablesMember.length * 2 + consumesMemberOutput.length * 2 + conversionMatches.length * 3;
      return { name: member.name, enables_member: enablesMember, consumes_member_output: consumesMemberOutput, conversion_matches: conversionMatches, directness, matches: unique([...enablesMember, ...consumesMemberOutput, ...conversionMatches]) };
    }).filter((entry) => entry.directness > 0);
    candidate.pair_support = { member_count: memberCoverage.length, members: memberCoverage, bridge_quality: memberCoverage.length >= 2 ? Math.min(...memberCoverage.map((entry) => entry.directness)) : 0 };
    if (memberCoverage.length >= 2) {
      const bridgeQuality = Math.min(...memberCoverage.map((entry) => entry.directness));
      const distinctMemberFeatures = unique(memberCoverage.flatMap((entry) => entry.matches.map((match) => match.split('->').at(-1))));
      const onlySharedGenericFeature = distinctMemberFeatures.length === 1 && ['card_drawn', 'cards', 'mana', 'creature_enters', 'spell_cast'].includes(distinctMemberFeatures[0]);
      if (onlySharedGenericFeature) {
        candidate.pair_support.bridge_quality = 0;
        positive.push({ relationship: 'pair_shared_support', feature: distinctMemberFeatures[0], strength_tier: 'conditional_support', weight: 5, explanation: `Touches both commanders through the same broad ${distinctMemberFeatures[0].replace(/_/g, ' ')} axis, but does not form a distinct two-member bridge.`, candidate_action: 'Supports a resource both commander members reference.', commander_connection: 'Both members reference the same broad resource or event.', strategic_value: 'Useful pair-wide support, weighted below a bridge that links distinct member mechanics.' });
      } else {
        positive.push({ relationship: 'pair_bridge_support', feature: memberCoverage.map((entry) => `${entry.name}:${entry.matches[0]}`).join('+'), strength_tier: bridgeQuality >= 3 ? 'direct_engine' : 'strong_support', weight: Math.min(30, 18 + bridgeQuality * 2), explanation: `Connects independently to both commanders: ${memberCoverage.map((entry) => `${entry.name} through ${entry.matches.slice(0, 2).join(' and ')}`).join('; ')}.`, candidate_action: 'Supplies or consumes a parsed mechanic for each member of the pair.', commander_connection: 'Each commander receives an independent non-type-derived semantic connection.', strategic_value: 'Acts as a real pair bridge rather than matching only the combined colors or card types.' });
      }
    } else if (memberCoverage.length === 1) {
      const exceptional = memberCoverage[0].directness >= 4 || positive.filter((edge) => edge.strength_tier === 'direct_engine').reduce((sum, edge) => sum + edge.weight, 0) >= 35;
      positive.push({ relationship: exceptional ? 'exceptional_single_member_support' : 'single_member_support', feature: memberCoverage[0].matches[0], strength_tier: exceptional ? 'strong_support' : 'conditional_support', weight: exceptional ? 12 : 3, explanation: `Supports ${memberCoverage[0].name}${exceptional ? ' through multiple direct semantic connections' : ', but no independent semantic connection to the other commander was detected'}.`, candidate_action: 'Supports one member’s parsed mechanic.', commander_connection: `${memberCoverage[0].name} uses ${memberCoverage[0].matches[0].replace(/_/g, ' ')}.`, strategic_value: exceptional ? 'Exceptional single-member support remains valuable without being mislabeled as a pair bridge.' : 'Useful single-member support, not a true pair bridge.' });
    }
    if (candidate.pair_support.member_count >= 2 && candidate.pair_support.bridge_quality > 0) positive.push({ relationship: 'pair_contribution_quality', feature: 'pair_members', strength_tier: 'strong_support', weight: 6, explanation: 'Provides separately parsed value to both commander members.', candidate_action: 'Connects to both member profiles.', commander_connection: 'Each member contributes a distinct demand or output.', strategic_value: 'Rewards real two-member contribution without requiring every good card to bridge both halves.' });
  }
  for (const conversion of candidate.conversions || []) {
    if (commanderSignalKeys.has(conversion.from)) {
      positive.push({
        relationship: 'shared_conversion_input', feature: `${conversion.from}->${conversion.to}`, strength_tier: 'conditional_support', weight: Number((6 * conversion.reliability).toFixed(2)),
        explanation: `${conversion.evidence} This shares a ${conversion.from.replace(/_/g, ' ')} input with the commander, but does not itself create that event.`,
        candidate_action: conversion.evidence, commander_connection: `The commander also uses ${conversion.from.replace(/_/g, ' ')}.`, strategic_value: 'Shared deck support helps both effects, but this is not a direct candidate-to-commander engine edge.'
      });
    } else if (commanderOutputKeys.has(conversion.from)) {
      positive.push({
        relationship: 'resource_conversion_chain', feature: `${conversion.from}->${conversion.to}`, strength_tier: 'direct_engine', weight: Number((24 * conversion.reliability).toFixed(2)),
        explanation: `${conversion.evidence} It consumes a resource the commander already supplies and converts it into ${conversion.to.replace(/_/g, ' ')}.`,
        candidate_action: conversion.evidence, commander_connection: `The commander supplies ${conversion.from.replace(/_/g, ' ')}.`, strategic_value: 'Forms a direct short-range resource conversion chain.'
      });
    }
    if (commanderSignalKeys.has(conversion.to)) {
      positive.push({
        relationship: 'conversion_enables_commander', feature: `${conversion.from}->${conversion.to}`, strength_tier: 'direct_engine', weight: Number((22 * conversion.reliability).toFixed(2)),
        explanation: `${conversion.evidence} The resulting ${conversion.to.replace(/_/g, ' ')} directly turns on the commander's payoff.`,
        candidate_action: conversion.evidence, commander_connection: `The commander rewards ${conversion.to.replace(/_/g, ' ')}.`, strategic_value: 'Converts an available resource into the exact event the commander needs.'
      });
    }
  }
  if (commanderWants.has('combat_damage') && candidateProduces.has('combat_damage_multiplier')) positive.push({ relationship: 'combat_damage_multiplier_alignment', feature: 'combat_damage', strength_tier: 'direct_engine', weight: 24, explanation: 'Double strike creates an additional combat-damage event for the commander’s combat payoff.', candidate_action: 'Grants double strike to an attacking creature.', commander_connection: 'The commander rewards creatures dealing combat damage to players.', strategic_value: 'Multiplies the exact combat-damage event rather than only increasing power.' });
  const pairSpellGraveyardPlan = commanderProfile.members.length > 1 && [...commanderSignalKeys].some((key) => key.includes('spell_cast')) && [...commanderSignalKeys].some((key) => key.startsWith('graveyard_population:'));
  if (pairSpellGraveyardPlan && candidateProduces.has('mana_refund') && candidateProduces.has('graveyard_population:any_selected')) positive.push({ relationship: 'pair_spell_graveyard_throughput', feature: 'spell_cast->graveyard_selection', strength_tier: 'direct_engine', weight: 20, explanation: 'Filters a chosen spell into the graveyard while refunding mana to continue casting.', candidate_action: 'Draws, discards selectively, and untaps lands.', commander_connection: 'One commander recasts spells from the graveyard while the Background improves graveyard selection.', strategic_value: 'Supports the two-member spell/graveyard chain with both setup and throughput.' });
  const commanderCreatesCreatureTokens = ['creature_tokens', 'token:creature'].some((key) => commanderOutputKeys.has(key));
  const tokenEntryConversion = candidate.conversions?.find((entry) => entry.from === 'creature_enters');
  if (commanderCreatesCreatureTokens && tokenEntryConversion) positive.push({ relationship: 'token_entry_conversion_bridge', feature: `token:creature->${tokenEntryConversion.to}`, strength_tier: 'direct_engine', weight: 24, explanation: `${tokenEntryConversion.evidence} The commander’s creature tokens supply those entry events, converting its normal output into ${tokenEntryConversion.to.replace(/_/g, ' ')}.`, candidate_action: tokenEntryConversion.evidence, commander_connection: 'The commander creates creature tokens that enter under your control.', strategic_value: 'Bridges token production into an additional payoff without requiring a multi-card combo search.' });
  const commanderUsesTokens = commanderSignalKeys.has('token_created') || commanderSignalKeys.has('tokens') || commanderOutputKeys.has('token_created');
  if (commanderUsesTokens && candidate.token_semantics?.length) {
    const magnitude = Math.max(...candidate.token_semantics.map((entry) => entry.magnitude || 1));
    const scaling = candidate.token_semantics.some((entry) => entry.scaling !== 'fixed');
    const repeatable = candidate.token_semantics.some((entry) => entry.repeatable);
    const multiplier = candidate.token_semantics.some((entry) => entry.token_type === 'multiplier' || entry.scaling === 'doubling');
    const weight = Math.min(45, Math.max(2, (magnitude - 1) * 2 + (scaling ? 7 : 0) + (repeatable ? 7 : 0) + (multiplier ? 32 : 0)));
    if (weight > 2) positive.push({
      relationship: multiplier ? 'token_multiplier_quality' : 'token_output_quality', feature: 'token_magnitude', strength_tier: multiplier || (repeatable && scaling) ? 'direct_engine' : 'strong_support', weight,
      explanation: multiplier ? 'Multiplies existing token creation, directly scaling the commander’s token engine.' : `Creates ${repeatable ? 'repeatable ' : ''}${scaling ? 'scaling ' : magnitude > 1 ? 'multiple ' : ''}tokens, providing more meaningful fuel than an incidental one-token effect.`,
      candidate_action: candidate.token_semantics[0].evidence, commander_connection: 'The commander explicitly creates, rewards, or consumes tokens.', strategic_value: 'Token magnitude and repeatability scale the commander plan.'
    });
    if (multiplier && ['repeatable', 'persistent'].includes(candidate.delivery.repeatability)) positive.push({ relationship: 'persistent_token_multiplier', feature: 'token_created', strength_tier: 'direct_engine', weight: 12, explanation: 'Remains in play and multiplies subsequent token-creation events, providing sustained scaling rather than a one-shot burst.', candidate_action: 'Persistently increases token output.', commander_connection: 'The commander repeatedly creates or rewards tokens.', strategic_value: 'Applies multiplicative value across future commander events.' });
  }
  const commanderCounterTypes = new Set(commanderProfile.counter_types || []);
  if (candidate.enables.some((entry) => entry.key === 'counter:any_existing') && commanderCounterTypes.size) {
    positive.push({ relationship: 'proliferates_commander_counters', feature: `counter:${[...commanderCounterTypes].join('+')}`, strength_tier: 'direct_engine', weight: 20, explanation: `Proliferate adds to the commander's existing ${[...commanderCounterTypes].join(' or ')} counters without treating unrelated counter types as equivalent.`, candidate_action: 'Proliferates existing counters.', commander_connection: `The commander establishes ${[...commanderCounterTypes].join(' or ')} counters.`, strategic_value: 'Amplifies the exact counter resource already present.' });
  }
  const sharedTribes = candidate.resources.filter((entry) => entry.key.startsWith('tribe:') && commanderSignalKeys.has(entry.key));
  for (const tribe of sharedTribes) {
    const tribalPayoff = candidate.wants.some((entry) => entry.key === tribe.key) || candidate.rewards.some((entry) => entry.key === tribe.key);
    if (tribalPayoff) positive.push({ relationship: 'tribal_engine_piece', feature: tribe.key, strength_tier: 'strong_support', weight: 14, explanation: `Is a ${tribe.key.slice(6)} and also rewards that tribe, so it is both valid fuel and a payoff for the commander's narrow tribal plan.`, candidate_action: tribe.evidence?.[0], commander_connection: `The commander explicitly supports ${tribe.key.slice(6)} cards.`, strategic_value: 'Combines tribal eligibility with a tribal payoff.' });
    const tribalConversion = candidate.conversions?.some((entry) => commanderSignalKeys.has(entry.from) || commanderSignalKeys.has(entry.to));
    if (tribalConversion) positive.push({ relationship: 'tribal_conversion_engine', feature: tribe.key, strength_tier: 'direct_engine', weight: 12, explanation: `Matches the commander's ${tribe.key.slice(6)} restriction and converts a core resource into another payoff.`, candidate_action: tribe.evidence?.[0], commander_connection: `The commander explicitly supports ${tribe.key.slice(6)} cards and the linked conversion event.`, strategic_value: 'One card satisfies both the narrow tribal constraint and an engine conversion.' });
    const typedTribalConversion = candidate.conversions?.find((entry) => entry.from === tribe.key);
    if (typedTribalConversion) positive.push({ relationship: 'typed_tribal_resource_conversion', feature: `${tribe.key}->${typedTribalConversion.to}`, strength_tier: 'direct_engine', weight: 24 + (candidate.mana_value <= 1 ? 6 : 0), explanation: `Converts the exact ${tribe.key.slice(6)} creature type the commander produces into ${typedTribalConversion.to.replace(/_/g, ' ')}${candidate.mana_value <= 1 ? ' from a one-mana permanent' : ''}.`, candidate_action: typedTribalConversion.evidence, commander_connection: `The commander explicitly produces or rewards ${tribe.key.slice(6)} creatures.`, strategic_value: 'Turns narrow tribal fuel into a reusable engine resource.' });
    const entryConversion = candidate.conversions?.find((entry) => entry.from === 'creature_enters');
    if (entryConversion) positive.push({ relationship: 'tribal_entry_conversion_engine', feature: `${tribe.key}:${entryConversion.from}->${entryConversion.to}`, strength_tier: 'direct_engine', weight: 24, explanation: `Rewards entry of the exact ${tribe.key.slice(6)} creature type the commander supports and converts it into ${entryConversion.to.replace(/_/g, ' ')}.`, candidate_action: entryConversion.evidence, commander_connection: `The commander explicitly builds around ${tribe.key.slice(6)} creatures.`, strategic_value: 'Converts the narrow tribal plan into a repeatable payoff without relying on the commander merely being a creature.' });
  }
  const commanderUsesOwnGraveyard = ['graveyard_population', 'own_graveyard_population', 'self_mill'].some((key) => commanderSignalKeys.has(key));
  const candidateFillsOwnGraveyard = candidate.produces.some((entry) => ['own_graveyard_population', 'self_mill', 'surveil', 'loot_rummage', 'tutor_to_graveyard'].includes(entry.key));
  if (commanderUsesOwnGraveyard && candidateFillsOwnGraveyard) {
    const millAmounts = [...text(candidate.oracle_text).matchAll(/mill (one|two|three|four|five|six|\d+|x)/g)].map((match) => parseFixedAmount(match[1]) ?? 4);
    const amount = millAmounts.length ? Math.max(...millAmounts) : 1;
    const selective = candidate.produces.some((entry) => ['surveil', 'loot_rummage', 'tutor_to_graveyard'].includes(entry.key));
    const repeatable = candidate.delivery.repeatability === 'repeatable' || candidate.produces.some((entry) => entry.key === 'mass_graveyard_loading');
    const weight = Math.min(16, 4 + Math.min(5, amount) + (selective ? 3 : 0) + (repeatable ? 4 : 0));
    positive.push({ relationship: 'graveyard_population_quality', feature: 'own_graveyard_population', strength_tier: repeatable || selective ? 'direct_engine' : 'strong_support', weight, explanation: `${selective ? 'Selectively' : 'Directly'} loads ${amount > 1 ? 'multiple cards into' : 'a card into'} your own graveyard, rather than milling an opponent or moving an incidental card.`, candidate_action: candidate.produces.find((entry) => ['self_mill', 'surveil', 'loot_rummage', 'tutor_to_graveyard'].includes(entry.key))?.evidence?.[0], commander_connection: 'The commander explicitly uses cards in your own graveyard.', strategic_value: 'Provides correctly directed and substantial graveyard setup.' });
  }
  const typedGraveyardNeeds = [...commanderSignalKeys].filter((key) => key.startsWith('graveyard_population:'));
  if (typedGraveyardNeeds.length && candidateProduces.has('graveyard_population:any_selected')) positive.push({ relationship: 'selective_graveyard_type_setup', feature: typedGraveyardNeeds.join('+'), strength_tier: 'direct_engine', weight: 18, explanation: `Selective discard can place the exact ${typedGraveyardNeeds.map((key) => key.split(':')[1]).join(' or ')} card type the commander uses into your graveyard.`, candidate_action: 'Selectively discards cards from hand into your graveyard.', commander_connection: `The commander specifically uses ${typedGraveyardNeeds.map((key) => key.split(':')[1]).join(' or ')} cards in the graveyard.`, strategic_value: 'Directs graveyard setup toward the commander’s actual card-type restriction.' });
  const freeSacrificeOutlet = candidate.roles.some((entry) => entry.key === 'sacrifice_outlet') && !candidate.delivery.requires_tap && candidate.delivery.activation_cost === 0 && ['repeatable', 'persistent'].includes(candidate.delivery.repeatability);
  if (freeSacrificeOutlet && (commanderSignalKeys.has('creature_dies') || commanderSignalKeys.has('sacrifice_event'))) positive.push({ relationship: 'free_sacrifice_engine', feature: 'sacrifice_event', strength_tier: 'direct_engine', weight: 50, explanation: 'Provides a repeatable sacrifice outlet with no mana or tap requirement, allowing the commander’s death/sacrifice engine to fire on demand.', candidate_action: 'Sacrifices creatures without a mana or tap cost.', commander_connection: 'The commander explicitly rewards creature deaths or sacrifices.', strategic_value: 'Reliable on-demand conversion is stronger than a conditional sacrifice effect.' });
  const outlet = candidate.sacrifice_outlet;
  if (outlet && (commanderSignalKeys.has('creature_dies') || commanderSignalKeys.has('sacrifice_event'))) {
    const openTiming = outlet.timing === 'open';
    const repeatable = ['repeatable', 'persistent'].includes(outlet.repeatability);
    const typedMatch = outlet.resource === 'creature_or_permanent';
    const quality = (repeatable ? 6 : 0) + (openTiming ? 4 : 0) + (!outlet.requires_tap ? 4 : 0) + (outlet.mana_cost === 0 ? 5 : Math.max(0, 3 - outlet.mana_cost)) + (typedMatch ? 3 : 0) + (outlet.payoff ? 2 : 0);
    if (!freeSacrificeOutlet && quality >= 12) positive.push({ relationship: 'sacrifice_outlet_quality', feature: `sacrifice:${outlet.resource}:${outlet.timing}`, strength_tier: quality >= 18 ? 'direct_engine' : 'strong_support', weight: Math.min(22, quality), explanation: `Provides a ${repeatable ? 'repeatable' : 'limited'} ${openTiming ? 'open-timing' : 'sorcery-speed'} sacrifice outlet${outlet.mana_cost ? ` with a ${outlet.mana_cost}-mana activation` : ' without a mana activation'}, creating the exact death/sacrifice events the commander rewards.`, candidate_action: 'Converts a controlled permanent into a sacrifice event.', commander_connection: 'The commander explicitly rewards creature deaths or sacrifices.', strategic_value: 'Outlet timing, cost, repeatability, and accepted resource type determine practical engine quality.' });
    if (outlet.timing === 'sorcery_only') negative.push(makePenalty('sacrifice_timing_restriction', 'sorcery_only', -4, 'The sacrifice outlet cannot respond to removal or combat because it is restricted to sorcery timing.'));
    if (!repeatable) negative.push(makePenalty('limited_sacrifice_outlet', 'repeatability', -4, 'The sacrifice effect is not a persistent repeatable outlet.'));
    const demand = commanderProfile.demand_profile?.sacrifice;
    const resourceAligned = !demand?.accepted_resources?.length || demand.accepted_resources.some((resource) => outlet.resource.includes(resource) || resource === 'permanent');
    if (demand?.needs_outlet && repeatable && openTiming && resourceAligned) positive.push({ relationship: 'sacrifice_demand_alignment', feature: `outlet:${outlet.resource}`, strength_tier: 'direct_engine', weight: 14, explanation: 'Supplies the repeatable, open-timing outlet the commander lacks for its sacrifice/death payoff.', candidate_action: `Sacrifices ${outlet.resource.replace(/_/g, ' ')} on demand.`, commander_connection: `The commander rewards ${demand.accepted_resources.join(' or ') || 'permanent'} sacrifice events but does not provide its own outlet.`, strategic_value: 'Closes the commander’s actual engine bottleneck instead of duplicating an outlet it already has.' });
    if (demand?.commander_is_outlet && !outlet.payoff) negative.push(makePenalty('redundant_outlet', 'sacrifice_competition', -5, 'The commander already supplies an outlet, and this card adds no parsed sacrifice payoff or materially better conversion.'));
    if (!resourceAligned) negative.push(makePenalty('sacrifice_resource_mismatch', outlet.resource, -7, `The outlet consumes ${outlet.resource.replace(/_/g, ' ')}, which does not match the commander’s parsed sacrifice resource.`));
  }
  const repeatableDeathConversion = candidate.conversions?.find((entry) => entry.from === 'creature_dies');
  if (repeatableDeathConversion && ['repeatable', 'persistent'].includes(candidate.delivery.repeatability) && commanderSignalKeys.has('creature_dies')) positive.push({ relationship: 'repeatable_death_conversion', feature: `creature_dies->${repeatableDeathConversion.to}`, strength_tier: 'direct_engine', weight: 24, explanation: `Repeatedly converts the creature-death event the commander rewards into ${repeatableDeathConversion.to.replace(/_/g, ' ')}, rather than supplying only an incidental death trigger.`, candidate_action: repeatableDeathConversion.evidence, commander_connection: 'The commander explicitly rewards creature deaths.', strategic_value: 'A persistent death-to-resource conversion compounds the commander’s core engine.' });
  const spellslinger = commanderSignalKeys.has('instant_or_sorcery_cast') || commanderSignalKeys.has('noncreature_spell_cast');
  if (spellslinger && candidate.produces.some((entry) => entry.key === 'mana_refund')) positive.push({ relationship: 'spell_chain_refund', feature: 'mana_refund', strength_tier: 'direct_engine', weight: 18, explanation: 'Untaps multiple lands after being cast, effectively refunding mana so the commander’s spell chain can continue.', candidate_action: 'Untaps lands after resolving.', commander_connection: 'The commander rewards chaining instant and sorcery spells.', strategic_value: 'Card flow plus mana refund is unusually efficient spellslinger support.' });
  if (spellslinger && candidate.produces.some((entry) => entry.key === 'mana_refund') && candidateProduces.has('cards')) positive.push({ relationship: 'self_replacing_spell_refund', feature: 'mana_refund->cards', strength_tier: 'strong_support', weight: 10, explanation: 'Both replaces itself and refunds mana, preserving the two resources a spell-chain commander needs to keep casting.', candidate_action: 'Draws cards and untaps lands on resolution.', commander_connection: 'The commander rewards casting several spells in one turn.', strategic_value: 'Combines throughput and mana efficiency in the same spell.' });
  const auraPlan = ['aura', 'aura_cast', 'attachment', 'attachment_count:aura'].some((key) => commanderSignalKeys.has(key));
  if (auraPlan && candidate.resources.some((entry) => entry.key === 'aura') && candidate.produces.some((entry) => ['enchanted_creature', 'enchanted_permanent'].includes(entry.key))) positive.push({ relationship: 'aura_attachment_piece', feature: 'aura', strength_tier: 'direct_engine', weight: 12, explanation: 'Is an Aura that attaches to and modifies the commander or another creature, satisfying the exact Aura/attachment requirement rather than merely being an enchantment.', candidate_action: 'Casts and enters as an Aura attached to a legal creature.', commander_connection: 'The commander explicitly rewards Auras, Aura entry, or attached permanents.', strategic_value: 'Directly advances the Voltron/Aura engine.' });
  if (auraPlan && candidate.resources.some((entry) => entry.key === 'aura') && /for each (?:aura|enchantment|equipment)[^.]*you control|for each [^.]*attached/.test(text(candidate.oracle_text))) positive.push({ relationship: 'attachment_scaling_payoff', feature: 'attachment_count:aura', strength_tier: 'direct_engine', weight: 18, explanation: 'The attached creature scales with each Aura or enchantment already in the plan, turning attachment count into a larger Voltron payoff.', candidate_action: 'Scales its attached creature for each relevant Aura or enchantment.', commander_connection: 'The commander explicitly builds around repeated Aura attachment.', strategic_value: 'Converts the deck’s core attachment density into combat power.' });
  const targetedCantrip = candidateProduces.has('targeted_creature_spell') && candidateProduces.has('cards') && commanderSignalKeys.has('targeted_creature_spell');
  if (targetedCantrip) positive.push({ relationship: 'targeted_cantrip_engine', feature: 'targeted_creature_spell->cards', strength_tier: 'direct_engine', weight: 35, explanation: 'Targets a creature to trigger the commander while replacing itself with a card, making it stronger engine fuel than a targeted spell with no card return.', candidate_action: 'Targets a creature and draws a card.', commander_connection: 'The commander rewards spells that target creatures.', strategic_value: 'Advances the commander trigger without exhausting hand resources.' });
  if (targetedCantrip && candidate.mana_value <= 1) positive.push({ relationship: 'efficient_targeted_cantrip', feature: 'targeted_creature_spell->cards', strength_tier: 'strong_support', weight: 10, explanation: 'At one mana, triggers the commander and replaces itself while leaving mana available to continue the turn.', candidate_action: 'Targets and cantrips for one mana.', commander_connection: 'The commander rewards repeated targeted spell casts.', strategic_value: 'Low cost improves spell-chain reliability.' });
  const exactCounterMatch = candidate.produces.find((entry) => entry.key.startsWith('counter:') && commanderSignalKeys.has(entry.key));
  if (exactCounterMatch && candidate.mana_value <= 1) positive.push({ relationship: 'efficient_exact_counter_enabler', feature: exactCounterMatch.key, strength_tier: 'direct_engine', weight: 28, explanation: `Places the exact ${exactCounterMatch.counter_type || exactCounterMatch.key.slice(8)} counter type the commander rewards at only one mana.`, candidate_action: exactCounterMatch.evidence?.[0], commander_connection: `The commander explicitly rewards ${exactCounterMatch.counter_type || exactCounterMatch.key.slice(8)} counters.`, strategic_value: 'Cheap exact-type counter placement is reliable early engine fuel.' });
  if (exactCounterMatch && candidate.dependencies.length === 0) positive.push({ relationship: 'self_contained_exact_counter', feature: exactCounterMatch.key, strength_tier: 'strong_support', weight: 10, explanation: 'Places the relevant counter type without requiring another engine permanent or pre-existing counter.', candidate_action: exactCounterMatch.evidence?.[0], commander_connection: `The commander rewards ${exactCounterMatch.counter_type || exactCounterMatch.key.slice(8)} counters.`, strategic_value: 'Self-contained setup is more reliable than a conditional counter source.' });
  const universalLandTrigger = candidate.wants.some((entry) => entry.key === 'land_enters') && candidate.enables.some((entry) => entry.key === 'counter:any_existing') && (commanderCounterTypes.size || commanderProfile.enables.some((entry) => entry.key === 'counter:any_existing'));
  if (universalLandTrigger) positive.push({ relationship: 'reliable_landfall_counter_engine', feature: 'land_enters->counter:any_existing', strength_tier: 'direct_engine', weight: 28, explanation: 'Turns routine land entries into proliferate, repeatedly amplifying the commander’s counter plan without combat or another narrow setup.', candidate_action: 'Proliferates whenever a land enters under your control.', commander_connection: 'The commander uses or amplifies existing counters.', strategic_value: 'Uses a reliable normal game action to repeat the exact counter engine.' });
  const repeatedUntapMill = candidate.produces.some((entry) => entry.key === 'self_mill') && /whenever (?:a|one or more|another)?\s*permanent[^.]*untap/.test(text(candidate.oracle_text));
  if (commanderUsesOwnGraveyard && repeatedUntapMill) positive.push({ relationship: 'high_volume_self_mill', feature: 'mass_graveyard_loading', strength_tier: 'direct_engine', weight: 20, explanation: 'Mills the controller of every permanent that untaps, creating repeated high-volume self-mill rather than a single incidental card.', candidate_action: 'Creates a mill event whenever a permanent untaps.', commander_connection: 'The commander rewards cards moving from your library into your own graveyard.', strategic_value: 'Scales graveyard setup with normal untap activity across the battlefield.' });
  const dualZoneTrigger = candidate.delivery.etb_only && candidate.delivery.death_only && candidateFillsOwnGraveyard;
  if (commanderUsesOwnGraveyard && dualZoneTrigger) positive.push({ relationship: 'dual_trigger_graveyard_loader', feature: 'own_graveyard_population', strength_tier: 'direct_engine', weight: candidate.mana_value <= 2 ? 32 : 14, explanation: 'Loads your graveyard both when it enters and when it dies, allowing recursion to reuse the same setup piece.', candidate_action: 'Self-mills on both entry and death.', commander_connection: 'The commander consumes and can often recur graveyard resources.', strategic_value: 'Two trigger windows make the graveyard setup resilient and reusable.' });
  const matchingConversions = (candidate.conversions || []).filter((conversion) => commanderSignalKeys.has(conversion.from) || commanderSignalKeys.has(conversion.to) || commanderOutputKeys.has(conversion.from));
  if (matchingConversions.length && candidate.mana_value <= 2 && ['repeatable', 'persistent'].includes(candidate.delivery.repeatability)) positive.push({ relationship: 'efficient_repeatable_conversion', feature: matchingConversions[0].from, strength_tier: 'strong_support', weight: 16, explanation: 'Provides a commander-relevant resource conversion on a low-cost permanent that can remain available for repeated use.', candidate_action: matchingConversions[0].evidence, commander_connection: 'The conversion starts from or ends at a resource the commander explicitly supplies or rewards.', strategic_value: 'Combines low setup cost with repeated engine access.' });
  const etbCoverage = candidate.enables.filter((entry) => entry.key.startsWith('etb:') && entry.key.endsWith(':you')).map((entry) => entry.object_class).filter(Boolean);
  const commanderSelfEtbClasses = unique(commanderProfile.members.filter((member) => featureKeys(member.wants).has('etb:self')).flatMap((member) => member.types.filter((type) => ['creature', 'artifact', 'enchantment'].includes(type))));
  const selfEtbMultiplierClasses = etbCoverage.filter((objectClass) => commanderSelfEtbClasses.includes(objectClass));
  if (selfEtbMultiplierClasses.length) positive.push({ relationship: candidate.etb_multiplier ? 'commander_self_etb_multiplier' : 'commander_self_etb_reuse', feature: `etb:self:${selfEtbMultiplierClasses.join('+')}`, strength_tier: 'direct_engine', weight: candidate.etb_multiplier ? 60 : 18, explanation: `${candidate.etb_multiplier ? 'Repeats' : 'Can recreate'} the commander’s own ${selfEtbMultiplierClasses.join(' or ')} enter trigger.`, candidate_action: candidate.etb_multiplier ? 'Repeats triggered abilities caused by the matching permanent class entering.' : 'Exiles and returns a matching permanent to create another enter event.', commander_connection: 'The commander has a parsed self-enter triggered ability.', strategic_value: candidate.etb_multiplier ? 'Directly multiplies the commander’s own ETB rather than matching an unrelated enter category.' : 'Reuses the commander ETB, but requires a separate blink action.' });
  const backgroundGrantsCommanderEtb = commanderProfile.members.some((member) => member.subtypes.includes('background') && /commander creatures? you own have [^]*when this creature enters/i.test(member.oracle_text));
  if (backgroundGrantsCommanderEtb && etbCoverage.includes('creature')) positive.push({ relationship: candidate.etb_multiplier ? 'background_granted_etb_multiplier' : 'background_granted_etb_reuse', feature: 'background:commander_etb', strength_tier: 'direct_engine', weight: candidate.etb_multiplier ? 60 : 18, explanation: `${candidate.etb_multiplier ? 'Repeats' : 'Recreates'} the enter trigger the Background grants to the creature commander.`, candidate_action: candidate.etb_multiplier ? 'Repeats creature-enter triggered abilities.' : 'Blinks the creature commander for another enter event.', commander_connection: 'The Background gives the commander a card-draw trigger when it enters.', strategic_value: 'Supports the Background’s actual granted text and the creature commander together.' });
  if (candidate.etb_multiplier && etbCoverage.length >= 2 && [...commanderSignalKeys, ...commanderOutputKeys].some((key) => key.includes('_enters') || key.startsWith('etb:'))) positive.push({ relationship: 'broad_etb_multiplier', feature: `etb:${unique(etbCoverage).join('+')}`, strength_tier: 'direct_engine', weight: 20, explanation: `Repeats enter triggers for multiple relevant permanent classes (${unique(etbCoverage).join(' and ')}), making it broader than a single-class ETB enhancer.`, candidate_action: 'Repeats qualified enter-the-battlefield triggers.', commander_connection: 'The commander creates or rewards repeated enter events.', strategic_value: 'Covers more of the commander’s blink/ETB engine with one card.' });
  if (etbCoverage.length >= 2 && commanderOutputKeys.has('blink')) positive.push({ relationship: 'blink_etb_multiplier', feature: 'blink->etb', strength_tier: 'direct_engine', weight: 18, explanation: 'Multiplies the enter triggers created by the commander’s blink ability across more than one permanent class.', candidate_action: 'Repeats creature and artifact enter triggers.', commander_connection: 'The commander exiles and returns permanents to create fresh enter events.', strategic_value: 'Turns each blink activation into additional ETB value.' });
  const etbDemand = commanderProfile.demand_profile?.etb;
  const candidateEtbClasses = unique([...(candidate.etb_profile?.blink_classes || []), ...(candidate.etb_profile?.payoff_classes || [])]);
  const matchedEtbClasses = candidateEtbClasses.filter((value) => etbDemand?.object_classes?.includes(value) || value === 'permanent');
  if (etbDemand?.active && matchedEtbClasses.length) positive.push({ relationship: 'typed_etb_alignment', feature: `etb:${matchedEtbClasses.join('+')}`, strength_tier: candidate.etb_profile?.produces_blink || etbCoverage.length ? 'direct_engine' : 'strong_support', weight: Math.min(20, 9 + matchedEtbClasses.length * 4), explanation: `Supports the commander’s ${matchedEtbClasses.join(' and ')} enter-event classes rather than an unrelated ETB category.`, candidate_action: candidate.etb_profile?.produces_blink ? 'Repeats qualified enter events through blink.' : 'Rewards the same qualified enter events.', commander_connection: `The commander specifically creates or rewards ${etbDemand.object_classes.join(' and ')} entries.`, strategic_value: 'ETB breadth receives credit only where the object class overlaps the commander’s actual plan.' });
  if (commanderWants.has('land_to_graveyard') && /return up to (?:two|three|four|\d+) target land cards? from your graveyard/.test(text(candidate.oracle_text))) positive.push({ relationship: 'mass_land_recursion', feature: 'land_to_graveyard', strength_tier: 'direct_engine', weight: 18, explanation: 'Returns multiple lands from your graveyard while its own dredge or mill text keeps land-to-graveyard events flowing.', candidate_action: 'Recovers several land cards from the graveyard.', commander_connection: 'The commander rewards lands entering or moving through the graveyard.', strategic_value: 'Sustains the land/graveyard engine instead of providing a one-time land.' });
  if (typedGraveyardNeeds.length && candidateProduces.has('graveyard_population:any_selected') && candidate.mana_value <= 2) positive.push({ relationship: 'efficient_selective_graveyard_setup', feature: typedGraveyardNeeds.join('+'), strength_tier: 'strong_support', weight: 15, explanation: 'At low mana cost, filters the hand while placing a chosen card type into the graveyard for the commander to use.', candidate_action: 'Draws and selectively discards at low cost.', commander_connection: 'The commander uses a specific card class from the graveyard.', strategic_value: 'Efficient selection improves both setup speed and card quality.' });
  if (typedGraveyardNeeds.length && candidateProduces.has('graveyard_population:any_selected') && /\b(?:flashback|escape|retrace)\b/.test(text(candidate.oracle_text))) positive.push({ relationship: 'reusable_selective_graveyard_setup', feature: typedGraveyardNeeds.join('+'), strength_tier: 'direct_engine', weight: 6, explanation: 'Selectively loads the required card type and can be cast again from the graveyard, so the setup effect is not limited to one use from hand.', candidate_action: 'Filters cards into the graveyard and has an explicit graveyard casting mode.', commander_connection: 'The commander uses a specific card class from the graveyard.', strategic_value: 'Graveyard reuse improves the reliability of an otherwise one-shot setup spell.' });
  if (commanderUsesOwnGraveyard && candidate.graveyard_quality?.direction === 'self') {
    const quality = candidate.graveyard_quality;
    const weight = (quality.selection === 'selective' ? 7 : 0) + (quality.volume === 'high' ? 7 : quality.volume === 'medium' ? 4 : 0) + (['repeatable', 'persistent'].includes(quality.repeatability) ? 6 : 0);
    if (weight >= 10) positive.push({ relationship: 'graveyard_setup_competition_quality', feature: `${quality.direction}:${quality.selection}:${quality.volume}:${quality.repeatability}`, strength_tier: weight >= 17 ? 'direct_engine' : 'strong_support', weight, explanation: `${quality.selection === 'selective' ? 'Selectively' : 'Directly'} fills your graveyard at ${quality.volume} volume with ${quality.repeatability.replace(/_/g, ' ')} delivery, a stronger setup profile than incidental or opponent-directed mill.`, candidate_action: 'Populates the controller’s graveyard with measured selection, volume, and repeatability.', commander_connection: 'The commander consumes cards from its controller’s graveyard.', strategic_value: 'Ranks graveyard setup by direction, selection, volume, repeatability, and card-type alignment.' });
    const demand = commanderProfile.demand_profile?.graveyard;
    if (candidateProduces.has('tutor_to_graveyard') && demand?.active && demand.selection_value) positive.push({ relationship: 'graveyard_tutor_demand_alignment', feature: `graveyard:${demand.required_types.join('+') || 'selected'}`, strength_tier: 'strong_support', weight: 10, explanation: `Searches for chosen ${demand.required_types.join(' or ') || 'cards'} and places them directly into the graveyard the commander consumes.`, candidate_action: 'Tutors selected cards directly into your graveyard.', commander_connection: `The commander uses ${demand.required_types.join(' or ') || 'selected'} cards from its controller’s graveyard.`, strategic_value: 'Selection plus direct placement improves reliability without replacing volume or repeatability requirements.' });
    const typedMatches = demand?.required_types?.filter((type) => quality.card_types.includes(type) || quality.card_types.includes('any_selected')) || [];
    if (typedMatches.length) positive.push({ relationship: 'typed_graveyard_demand', feature: `graveyard:${typedMatches.join('+')}`, strength_tier: 'direct_engine', weight: 14 + Math.min(6, typedMatches.length * 2), explanation: `Loads the exact ${typedMatches.join(' or ')} card type the commander consumes from the graveyard.`, candidate_action: `Places ${typedMatches.join(' or ')} cards into your graveyard.`, commander_connection: `The commander explicitly needs ${demand.required_types.join(' or ')} cards in its controller’s graveyard.`, strategic_value: 'Typed graveyard alignment is more valuable than undirected self-mill.' });
    if (demand?.selection_value && quality.selection === 'selective') positive.push({ relationship: 'graveyard_selection_alignment', feature: 'graveyard_selection', strength_tier: 'strong_support', weight: 8, explanation: 'Selectively chooses graveyard material for a commander that cares about card type or target quality.', candidate_action: 'Selects which card enters the graveyard.', commander_connection: 'The commander consumes specific graveyard cards rather than only graveyard size.', strategic_value: 'Selection improves hit quality without inflating generic mill.' });
    if (demand?.volume_need === 'high' && quality.volume === 'incidental') negative.push(makePenalty('insufficient_graveyard_volume', 'graveyard_volume', -6, 'One incidental graveyard card does not satisfy the commander’s size-scaling graveyard demand.'));
    if (demand?.volume_need === 'repeated_events' && ['repeatable', 'once_per_turn'].includes(quality.repeatability)) positive.push({ relationship: 'graveyard_event_frequency_alignment', feature: 'graveyard_frequency', strength_tier: 'strong_support', weight: 7, explanation: 'Creates repeated graveyard-population events for a commander that rewards those events, not merely final graveyard size.', candidate_action: 'Populates the graveyard repeatedly.', commander_connection: 'The commander rewards cards entering its controller’s graveyard.', strategic_value: 'Matches event frequency separately from total volume.' });
  }
  if (candidate.enables.some((entry) => entry.key === 'opponent_mill' && entry.scaling === 'doubling') && (commanderSignalKeys.has('opponent_mill') || commanderOutputKeys.has('opponent_mill'))) positive.push({ relationship: 'mill_multiplier_quality', feature: 'opponent_mill', strength_tier: 'direct_engine', weight: 18, explanation: 'Doubles cards milled by opponents, scaling the commander’s opponent-directed mill rather than merely sharing a graveyard theme.', candidate_action: 'Doubles opponent mill quantities.', commander_connection: 'The commander mills opponents or rewards cards milled from their libraries.', strategic_value: 'Multiplicatively increases the exact mill direction the commander uses.' });
  const sharedOutputs = candidate.produces.filter((entry) => commanderProfile.produces.some((target) => target.key === entry.key && featuresCompatible(entry, target)));
  for (const output of sharedOutputs) {
    if (!['opponent_life_loss', 'extra_combat', 'attacks', 'combat_damage', 'life_gained'].includes(output.key) || candidate.delivery.repeatability === 'one_shot') continue;
    positive.push({ relationship: 'reinforces_repeatable_pressure', feature: output.key, strength_tier: 'strong_support', weight: 11, explanation: `Adds another repeatable source of ${output.key.replace(/_/g, ' ')}, reinforcing the commander's established pressure plan.`, candidate_action: output.evidence?.[0], commander_connection: `The commander also repeatedly produces ${output.key.replace(/_/g, ' ')}.`, strategic_value: 'Stacks a repeatable strategic output rather than merely sharing a theme.' });
  }
  const ownExtraCombat = candidateProduces.has('extra_combat') && !candidate.constraints.some((entry) => entry.key === 'opponent_combat_only');
  if (ownExtraCombat && (commanderSignalKeys.has('attacks') || commanderOutputKeys.has('attacks') || commanderOutputKeys.has('extra_combat'))) positive.push({ relationship: 'extra_combat_engine', feature: 'extra_combat', strength_tier: 'direct_engine', weight: 30, explanation: 'Creates another combat, repeating the commander’s attack and combat-damage opportunities instead of merely adding combat stats.', candidate_action: 'Creates an additional combat phase.', commander_connection: 'The commander rewards or produces attack events and combat steps.', strategic_value: 'Directly multiplies the commander’s core combat sequence.' });
  if (ownExtraCombat && candidate.mana_value <= 4 && (commanderSignalKeys.has('attacks') || commanderOutputKeys.has('attacks'))) positive.push({ relationship: 'efficient_extra_combat', feature: 'extra_combat', strength_tier: 'strong_support', weight: 10, explanation: 'Provides another combat at a deployable mana value, making the commander’s repeated attack plan easier to execute in one turn.', candidate_action: 'Creates an extra combat from a low- or medium-cost card.', commander_connection: 'The commander scales with additional attacks or combats.', strategic_value: 'Improves the tempo of the combat engine.' });
  if (ownExtraCombat && candidate.wants.some((entry) => entry.key === 'attacks') && (commanderSignalKeys.has('attacks') || commanderProfile.enables.some((entry) => entry.key === 'attacks'))) positive.push({ relationship: 'attack_trigger_extra_combat', feature: 'attacks->extra_combat', strength_tier: 'direct_engine', weight: 15, explanation: 'Turns an attack trigger into another combat, which the commander can amplify and use to generate still more attack events.', candidate_action: 'Creates an additional combat from attacking.', commander_connection: 'The commander rewards or repeats attack-triggered abilities.', strategic_value: 'Forms a direct attack-to-combat feedback loop.' });
  if ((commanderSignalKeys.has('land_enters') || commanderOutputKeys.has('land_enters')) && candidateProduces.has('extra_land_play')) positive.push({ relationship: 'efficient_extra_land_engine', feature: 'extra_land_play->land_enters', strength_tier: 'direct_engine', weight: candidate.mana_value <= 2 ? 10 : 6, explanation: 'Adds a repeatable land play, directly increasing the land-entry events the commander rewards.', candidate_action: 'Allows an additional land play each turn.', commander_connection: 'The commander rewards lands entering under your control.', strategic_value: 'Raises reliable landfall throughput instead of supplying only one land event.' });
  const redundancyKeys = new Set(['opponent_life_loss', 'recursion', 'extra_combat', 'protection', 'cost_reduction', 'counter_amplification', 'dungeon_progress']);
  const commanderProduces = new Map((commanderProfile.produces || []).filter((entry) => redundancyKeys.has(entry.key)).map((entry) => [entry.key, entry]));
  for (const output of candidate.produces.filter((entry) => commanderProduces.has(entry.key))) positive.push({ relationship: 'creates_redundancy', feature: output.key, strength_tier: 'conditional_support', weight: 4, explanation: `Adds backup access to ${output.key.replace(/_/g, ' ')}, but this overlap is less valuable than a new engine connection.`, candidate_action: output.evidence?.[0], commander_connection: commanderProduces.get(output.key)?.evidence?.[0], strategic_value: 'Provides redundancy for an established output.' });

  for (const bottleneck of commanderProfile.strategic_bottlenecks || []) {
    let closes = false;
    if (bottleneck.key === 'on_demand_sacrifice') closes = Boolean(candidate.sacrifice_outlet && ['repeatable', 'persistent'].includes(candidate.sacrifice_outlet.repeatability) && !candidate.sacrifice_outlet.requires_tap);
    else if (bottleneck.key === 'graveyard_population') closes = candidate.graveyard_quality?.direction === 'self' && ['medium', 'high'].includes(candidate.graveyard_quality.volume);
    else if (bottleneck.key === 'spell_throughput') closes = candidateProduces.has('cards') || candidateProduces.has('mana_refund') || candidateProduces.has('cost_reduction');
    else if (bottleneck.key === 'repeatable_token_supply') closes = candidateProduces.has('token_repeatable') || candidate.enables.some((entry) => entry.key === 'token_created' && entry.scaling === 'doubling');
    else if (bottleneck.key === 'typed_density') closes = candidateTribalRoles.length > 0 || sharedTribes.length > 0;
    else if (bottleneck.key === 'combat_access') closes = candidateProduces.has('extra_combat') || candidateProduces.has('protection');
    else if (bottleneck.key === 'interaction_density') closes = candidateControl.some((entry) => ['permission', 'instant_speed_interaction', 'repeatable_interaction'].includes(entry.key));
    if (closes) positive.push({ relationship: 'fills_strategic_bottleneck', feature: bottleneck.key, strength_tier: 'strong_support', weight: 8, explanation: `${bottleneck.evidence} This card directly supplies that missing ${bottleneck.role.replace(/_/g, ' ')} function.`, candidate_action: `Supplies ${bottleneck.key.replace(/_/g, ' ')}.`, commander_connection: bottleneck.evidence, strategic_value: 'Fills a structural need rather than adding another redundant payoff.' });
  }

  const support = new Set(commanderProfile.support_roles || []);
  for (const candidateRole of candidate.roles.filter((entry) => support.has(entry.key))) {
    const relevance = commanderProfile.role_relevance?.[candidateRole.key] || 'optional';
    const candidateSemantic = [...candidate.produces, ...candidate.enables, ...candidate.resources].some((feature) => feature.source_kind !== 'card_type' && [...commanderProfile.wants, ...commanderProfile.rewards].some((target) => target.key === feature.key))
      || candidate.wants.some((feature) => [...commanderProfile.produces, ...commanderProfile.enables].some((target) => target.key === feature.key));
    const strategicRole = ['enabler', 'payoff', 'token_generation', 'sacrifice_outlet', 'graveyard_setup', 'recursion', 'finisher'].includes(candidateRole.key);
    if (strategicRole && relevance === 'core' && !candidateSemantic) continue;
    const roleConditional = candidateRole.source_kind === 'conditional_oracle';
    const weight = Number((roleWeight(relevance) * (roleConditional ? 0.45 : 1)).toFixed(2));
    positive.push({ relationship: 'fills_support_role', feature: candidateRole.key, strength_tier: roleConditional ? 'conditional_support' : relevance === 'core' ? 'strong_support' : relevance === 'generic_utility' ? 'generic_utility' : 'conditional_support', weight, explanation: `${MECHANICAL_ROLE_LABELS[candidateRole.key] || candidateRole.key} is ${relevance.replace(/_/g, ' ')} for this commander; this card fills that role${roleConditional ? ' only under its stated condition' : ''}.`, candidate_action: candidateRole.evidence?.[0], commander_connection: `Commander profile marks ${candidateRole.key.replace(/_/g, ' ')} as ${relevance.replace(/_/g, ' ')}.`, strategic_value: `Fills a ${relevance.replace(/_/g, ' ')} role.` });
  }
  if (candidateProduces.has('protection') && (commanderProfile.rewards.length || commanderProfile.wants.length)) positive.push({ relationship: 'protects_engine', feature: 'protection', strength_tier: 'generic_utility', weight: 4, explanation: 'Protects the commander or another key engine permanent, though the effect is not unique to this strategy.' });
  if (candidate.types.includes('creature') && (commanderWants.has('creature_enters') || commanderWants.has('creature_dies'))) positive.push({ relationship: 'relevant_body', feature: 'creature', strength_tier: 'weak_thematic_overlap', weight: 2, explanation: "Its creature body can participate in the commander's enter/death plan, but that alone is a weak connection." });
  if (candidateProduces.has('counter_amplification') && (commanderWants.has('counter_added') || commanderRewards.has('counter_added'))) positive.push({ relationship: 'amplifies_output', feature: 'counters', strength_tier: 'direct_engine', weight: 22, explanation: 'Proliferate repeatedly adds to existing counters, directly amplifying the commander’s counter payoff.' });

  const substantiveEdges = positive.filter((edge) => ['direct_engine', 'strong_support'].includes(edge.strength_tier));
  const primaryRoles = candidate.roles.map((entry) => entry.key);
  const expectedSpellEvent = (candidate.types.includes('instant') || candidate.types.includes('sorcery'))
    && (commanderWants.has('instant_or_sorcery_cast') || commanderWants.has('noncreature_spell_cast') || commanderWants.has('targeted_creature_spell'));
  const oneShotExempt = expectedSpellEvent || primaryRoles.some((entry) => ['removal', 'board_wipe', 'finisher', 'interaction'].includes(entry));
  if (substantiveEdges.length && candidate.delivery.repeatability === 'repeatable') positive.push({ relationship: 'repeatable_engine', feature: 'repeatability', strength_tier: 'strong_support', weight: 7, explanation: 'The relevant effect is repeatable, so it can fuel the commander across multiple turns.' });
  else if (substantiveEdges.length && candidate.delivery.once_per_turn) positive.push({ relationship: 'reliable_once_per_turn', feature: 'repeatability', strength_tier: 'strong_support', weight: 4, explanation: 'The effect is reliably available once each turn.' });
  else if (substantiveEdges.length && candidate.delivery.repeatability === 'one_shot' && !oneShotExempt) negative.push(makePenalty('one_shot_engine', 'repeatability', -5, 'The relevant effect is one-shot while this role benefits from a repeatable engine.'));
  if (candidate.delivery.attack_only || candidate.delivery.combat_damage_only || candidate.delivery.opponent_action) {
    const commanderSuppliesCondition = candidate.wants.some((feature) => commanderProfile.produces.some((output) => output.key === feature.key));
    negative.push(makePenalty('conditional_delivery', 'reliability', commanderSuppliesCondition ? -1 : -5, commanderSuppliesCondition ? 'The effect is conditional, but the commander directly supplies the required event, so the reliability penalty is minimal.' : 'The interaction depends on combat or an opponent action, making it less reliable.'));
  }
  if (candidate.delivery.requires_tap && candidate.delivery.sacrifice_cost) negative.push(makePenalty('stacked_activation_cost', 'activation_cost', -4, 'The effect requires both tapping and sacrificing a resource.'));

  for (const constraint of candidate.constraints) {
    if (constraint.key === 'expensive_mana') negative.push({ relationship: 'mana_inefficiency', feature: constraint.key, weight: -10, explanation: 'High mana value makes the effect slower to deploy.' });
    if (constraint.key === 'high_mana') negative.push({ relationship: 'mana_inefficiency', feature: constraint.key, weight: -4, explanation: 'The card is relatively expensive for a support slot.' });
    if (constraint.key === 'symmetrical') {
      const alignedGroupPressure = candidateProduces.has('opponent_life_loss') && featureKeys(commanderProfile.produces).has('opponent_life_loss');
      negative.push({ relationship: 'symmetrical_downside', feature: constraint.key, weight: alignedGroupPressure ? -1 : -6, explanation: alignedGroupPressure ? 'The effect is symmetrical, but the commander is already built to exploit table-wide life pressure.' : 'Its symmetrical text can also help opponents or harm this strategy.' });
    }
    if (constraint.key === 'tribal_dependency') {
      const matchingTribe = candidate.resources.some((resource) => resource.key.startsWith('tribe:') && commanderProfile.wants.some((wanted) => wanted.key === resource.key));
      if (!matchingTribe && !candidate.dependencies.some((dependency) => dependency.key.startsWith('tribe:') && dependencyState(commanderProfile, dependency) !== 'unsupported')) negative.push({ relationship: 'unsupported_dependency', feature: constraint.key, weight: -10, explanation: 'Requires a tribe the commander does not establish.' });
    }
    if (constraint.key === 'graveyard_dependency' && ![...commanderWants].some((key) => key.includes('graveyard') || key === 'land_to_graveyard') && ![...featureKeys(commanderProfile.produces)].some((key) => key.includes('graveyard') || key === 'land_to_graveyard')) negative.push({ relationship: 'unsupported_dependency', feature: constraint.key, weight: -7, explanation: 'Needs graveyard setup the commander does not supply.' });
  }
  const supportedTribe = candidate.resources.some((resource) => resource.key.startsWith('tribe:') && commanderProfile.wants.some((wanted) => wanted.key === resource.key));
  const dependencyAssessment = candidate.dependencies.map((dependency) => ({ ...dependency, state: dependency.key === 'another_creature' && supportedTribe ? 'strategy_likely_satisfies' : dependencyState(commanderProfile, dependency) }));
  const tribalAlternativeSatisfied = dependencyAssessment.some((dependency) => dependency.key.startsWith('tribe:') && dependency.state !== 'unsupported') && candidate.oracle_text.toLowerCase().includes(' or ');
  for (const dependency of dependencyAssessment) {
    if (tribalAlternativeSatisfied && dependency.key.startsWith('tribe:') && dependency.state === 'unsupported') continue;
    if (dependency.state === 'unsupported') negative.push(makePenalty('setup_dependency', dependency.key, -6, dependency.evidence));
    if (dependency.state === 'strategy_likely_satisfies') negative.push(makePenalty('setup_dependency', dependency.key, -2, `${dependency.evidence} The broader commander plan is likely to supply it, so the penalty is reduced.`));
  }
  if (candidate.dependencies.length > 1) negative.push(makePenalty('multiple_dependencies', 'setup', -3, 'Several setup requirements must align before the relevant effect works.'));

  const commanderSignals = new Set([...commanderWants, ...commanderRewards, ...featureKeys(commanderProfile.produces)]);
  for (const conflict of candidate.conflicts || []) {
    if (!commanderSignals.has(conflict.feature)) continue;
    const weight = conflict.severity === 'major' ? -28 : -12;
    negative.push(makePenalty('anti_synergy', conflict.key, weight, `${conflict.evidence} This conflicts with the commander's ${conflict.feature.replace(/_/g, ' ')} plan.`));
  }

  const coreRole = primaryRoles.some((entry) => commanderProfile.role_relevance?.[entry] === 'core');
  const utilityOnly = positive.length > 0 && positive.every((edge) => ['generic_utility', 'weak_thematic_overlap'].includes(edge.strength_tier));
  const effectiveCost = candidate.mana_value + Math.min(3, candidate.delivery.activation_cost || 0) + (candidate.delivery.sacrifice_cost || candidate.delivery.discard_cost ? 1 : 0);
  if (coreRole && effectiveCost <= 2 && substantiveEdges.length) positive.push({ relationship: 'efficient_enabler', feature: 'mana_efficiency', strength_tier: 'strong_support', weight: 5, explanation: 'Low deployment cost makes this engine piece easy to establish before or alongside the commander.' });
  if (effectiveCost >= 6 && !primaryRoles.includes('finisher')) negative.push(makePenalty('cost_pressure', 'mana_efficiency', -Math.min(9, effectiveCost), 'Its mana and activation costs are high for a support piece.'));
  if (candidate.colored_pips >= 3 && candidate.mana_value <= 4) negative.push(makePenalty('colored_pip_pressure', 'mana_efficiency', -2, 'Dense colored requirements make the card modestly harder to deploy on curve.'));
  if (utilityOnly) negative.push(makePenalty('generic_utility_only', 'centrality', -1, 'The card is useful in many decks but has little commander-specific mechanical fit.'));

  if (substantiveEdges.length && candidate.trigger_frequency === 'per_event') positive.push({ relationship: 'scalable_trigger_frequency', feature: 'per_event', strength_tier: 'strong_support', weight: 5, explanation: 'The relevant ability triggers per event rather than once per batch or turn, so additional commander events continue to scale it.' });
  if (substantiveEdges.length && candidate.trigger_frequency === 'per_batch') negative.push(makePenalty('batched_trigger', 'one_or_more', -2, '“One or more” batches simultaneous events into one trigger, limiting per-object scaling.'));
  if (substantiveEdges.length && ['once_each_turn', 'once_your_turn'].includes(candidate.trigger_frequency)) negative.push(makePenalty('frequency_cap', candidate.trigger_frequency, -3, 'The relevant trigger is explicitly capped by turn frequency.'));
  if (candidate.modal?.exclusive && positive.length > 1) negative.push(makePenalty('modal_exclusivity', 'choose_mode', -3, 'Useful modes are available choices, but mutually exclusive modes are not counted as happening simultaneously.'));
  if (candidate.semantic_uncertainty?.level === 'medium') negative.push(makePenalty('semantic_uncertainty', 'parser', -4, `Parser uncertainty: ${candidate.semantic_uncertainty.reasons.join('; ')}.`));
  if (candidate.semantic_uncertainty?.level === 'high') negative.push(makePenalty('semantic_uncertainty', 'parser', -12, `High parser uncertainty: ${candidate.semantic_uncertainty.reasons.join('; ')}. Fit is downgraded unless multiple direct deterministic edges support it.`));

  const positiveScore = positive.reduce((sum, edge) => sum + edge.weight, 0);
  const negativeScore = negative.reduce((sum, edge) => sum + edge.weight, 0);
  const relationshipBonus = Math.min(10, new Set(substantiveEdges.map((edge) => edge.relationship)).size * 2);
  const rankingScore = Number((positiveScore + negativeScore + relationshipBonus).toFixed(2));
  const uncappedScore = Math.max(0, Math.min(100, Math.round(rankingScore)));
  const candidateRoles = unique(candidate.roles.map((entry) => entry.key).filter((entry) => MECHANICAL_ROLE_LABELS[entry]));
  const centralWeight = positive.filter((edge) => ['direct_engine', 'strong_support'].includes(edge.strength_tier) && edge.relationship !== 'fills_support_role').reduce((sum, edge) => sum + edge.weight, 0);
  const centralityScore = Math.max(0, Math.min(100, Math.round((centralWeight / Math.max(1, positiveScore)) * 100)));
  const centralityLabel = centralityScore >= 65 ? 'Commander-Central' : centralityScore >= 35 ? 'Strategy-Specific' : 'Generic Utility';
  const independentEdges = new Set(substantiveEdges.map((edge) => `${edge.relationship}:${edge.feature}`)).size;
  const uncertaintyCap = candidate.semantic_uncertainty?.level === 'high' ? 41 : 100;
  const score = independentEdges >= 2 ? uncappedScore : Math.min(uncappedScore, uncertaintyCap);
  const directEdges = substantiveEdges.filter((edge) => edge.strength_tier === 'direct_engine').length;
  const relationshipTotals = Object.fromEntries(unique(positive.map((edge) => edge.relationship)).map((relationship) => [relationship, Number(positive.filter((edge) => edge.relationship === relationship).reduce((sum, edge) => sum + edge.weight, 0).toFixed(2))]));
  const tierTotals = Object.fromEntries(['direct_engine', 'strong_support', 'conditional_support', 'generic_utility', 'weak_thematic_overlap'].map((tier) => [tier, Number(positive.filter((edge) => edge.strength_tier === tier).reduce((sum, edge) => sum + edge.weight, 0).toFixed(2))]));
  const rawConfidence = Math.round(12 + independentEdges * 12 + directEdges * 5 + candidate.parser_certainty * 20 + commanderProfile.parser_certainty * 12 - candidate.dependencies.length * 7 - candidate.delivery.condition_count * 4 - (candidate.modal?.exclusive ? 9 : 0) - (candidate.modal?.has_multiple_faces ? 4 : 0) - (candidate.semantic_uncertainty?.level === 'high' ? 28 : candidate.semantic_uncertainty?.level === 'medium' ? 12 : 0));
  const confidenceScore = Math.max(0, Math.min(candidate.semantic_uncertainty?.level === 'high' ? 44 : 100, rawConfidence));
  return {
    eligible: true, score, ranking_score: rankingScore, fit_label: fitLabel(score), confidence_score: confidenceScore, confidence_label: confidenceLabel(confidenceScore), commander_centrality_score: centralityScore, commander_centrality_label: centralityLabel,
    reasons: [...positive].sort((a, b) => b.weight - a.weight).slice(0, 4), penalties: negative,
    roles: candidateRoles,
    category: candidateRoles.find((entry) => support.has(entry)) || candidateRoles[0] || (candidate.types.includes('creature') ? 'creatures' : 'enabler'),
    legality, profile: options.includeProfile ? candidate : undefined, delivery: candidate.delivery, dependency_assessment: dependencyAssessment, semantic_uncertainty: candidate.semantic_uncertainty, pair_support: candidate.pair_support,
    score_components: { positive: Number(positiveScore.toFixed(2)), negative: Number(negativeScore.toFixed(2)), relationship_bonus: relationshipBonus, ranking_score: rankingScore, centrality: centralityScore, reliability: candidate.delivery.reliability, effective_cost: effectiveCost, independent_edges: independentEdges, direct_edges: directEdges, relationship_totals: relationshipTotals, tier_totals: tierTotals }
  };
}

function competitionGroupKey(candidate) {
  const primary = candidate.mechanical_reasons.find((edge) => edge.strength_tier === 'direct_engine') || candidate.mechanical_reasons[0];
  const featureFamily = String(primary?.feature || 'utility').split('->')[0].split(':')[0];
  return `${candidate.category}:${featureFamily}`;
}

function stableCandidateId(candidate) {
  return String(candidate.oracle_id || candidate.card_name || '');
}

function scalarCandidateCompare(left, right) {
  return right.ranking_score - left.ranking_score
    || right.mechanical_score - left.mechanical_score
    || left.cmc - right.cmc
    || stableCandidateId(left).localeCompare(stableCandidateId(right));
}

function tupleCandidateCompare(left, right, bucketSize = 8) {
  const leftBucket = Math.floor(left.ranking_score / bucketSize);
  const rightBucket = Math.floor(right.ranking_score / bucketSize);
  if (leftBucket !== rightBucket) return rightBucket - leftBucket;
  const leftTuple = [left.commander_centrality_score, left.score_components?.direct_edges || 0, left.confidence_score, left.score_components?.independent_edges || 0, left.delivery?.reliability || 0, -left.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(left.score_components?.effective_cost || 0), left.ranking_score, left.mechanical_score];
  const rightTuple = [right.commander_centrality_score, right.score_components?.direct_edges || 0, right.confidence_score, right.score_components?.independent_edges || 0, right.delivery?.reliability || 0, -right.dependency_assessment.filter((entry) => entry.state === 'unsupported').length, -(right.score_components?.effective_cost || 0), right.ranking_score, right.mechanical_score];
  for (let index = 0; index < leftTuple.length; index += 1) if (leftTuple[index] !== rightTuple[index]) return rightTuple[index] - leftTuple[index];
  return stableCandidateId(left).localeCompare(stableCandidateId(right));
}

function rankWithCompetitionCrowding(candidates, compare, crowdingPenalty = 4, bucketSize = null) {
  const groups = new Map();
  for (const candidate of [...candidates].sort(compare)) {
    const key = competitionGroupKey(candidate);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  const selectedCounts = new Map();
  const ranked = [];
  while (ranked.length < candidates.length) {
    const available = [...groups.entries()].map(([key, rows]) => rows[0] && ({
      key,
      card: rows[0],
      rows,
      // Diversity is a tie-boundary preference, not a quota. Apply the small
      // penalty once after a lane is represented; never let it grow with the
      // number of legal cards in that lane.
      adjusted: rows[0].ranking_score - ((selectedCounts.get(key) || 0) > 0 ? crowdingPenalty : 0)
    })).filter(Boolean);
    if (!available.length) break;
    available.sort((left, right) => {
      if (bucketSize) {
        const leftBucket = Math.floor(left.adjusted / bucketSize);
        const rightBucket = Math.floor(right.adjusted / bucketSize);
        if (leftBucket !== rightBucket) return rightBucket - leftBucket;
      } else if (left.adjusted !== right.adjusted) return right.adjusted - left.adjusted;
      return compare(left.card, right.card);
    });
    const winner = available[0];
    ranked.push(winner.rows.shift());
    selectedCounts.set(winner.key, (selectedCounts.get(winner.key) || 0) + 1);
  }
  return ranked;
}

function buildStableCandidateRanking(candidates) {
  const scalar = rankWithCompetitionCrowding(candidates, scalarCandidateCompare, 4);
  const tuple = rankWithCompetitionCrowding(candidates, (left, right) => tupleCandidateCompare(left, right, 8), 4, 8);
  const leading = scalar.slice(0, 10);
  const chosen = new Set(leading);
  for (const candidate of tuple) {
    if (leading.length >= 20) break;
    if (!chosen.has(candidate)) { leading.push(candidate); chosen.add(candidate); }
  }
  return [...leading, ...scalar.filter((candidate) => !chosen.has(candidate))];
}

export function buildMechanicalRecommendations(commanders, cards, options = {}) {
  const commanderProfile = commanders?.commander_identity ? commanders : buildCommanderSemanticProfile(commanders);
  if (options.suppressInsufficient && commanderProfile.release_policy === 'suppressed') {
    return { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, generated_at: options.generatedAt || new Date().toISOString(), commander_profile: commanderProfile, release_policy: commanderProfile.release_policy, suppressed: true, suppression_reason: 'Commander Oracle text has insufficient deterministic semantic coverage.', recommendations: [], categories: [], analysis: { obvious_strength: [], hidden_chemistry: [], popular_but_weak_mechanical_fit: [] } };
  }
  const community = options.communityByOracleId instanceof Map ? options.communityByOracleId : new Map();
  const candidates = [];
  const evaluatedForDisagreement = [];
  const profiledCards = (cards || []).map((card) => card?.schema_version ? card : { ...card, ...buildSemanticCardProfile(card) });
  const featureFrequency = new Map();
  for (const profile of profiledCards) {
    const keys = new Set(['produces', 'wants', 'rewards', 'enables', 'resources'].flatMap((group) => (profile[group] || []).map((entry) => entry.key)));
    for (const conversion of profile.conversions || []) keys.add(`${conversion.from}->${conversion.to}`);
    for (const key of keys) featureFrequency.set(key, (featureFrequency.get(key) || 0) + 1);
  }
  for (const card of profiledCards) {
    const result = scoreMechanicalCompatibility(commanderProfile, card);
    if (!result.eligible) continue;
    const specificityValues = result.reasons
      .filter((edge) => ['direct_engine', 'strong_support'].includes(edge.strength_tier) && edge.feature)
      .map((edge) => {
        const frequency = featureFrequency.get(edge.feature) || profiledCards.length;
        const information = Math.log2((profiledCards.length + 1) / (frequency + 1));
        return Math.max(0, (information - 4) * 5);
      })
      .sort((a, b) => b - a)
      .slice(0, 2);
    const specificityBonus = Number(Math.min(45, specificityValues.reduce((sum, value) => sum + value, 0)).toFixed(2));
    const rankingScore = Number((result.ranking_score + specificityBonus).toFixed(2));
    const observation = community.get(String(card.oracle_id || '')) || {};
    const evaluated = {
      oracle_id: card.oracle_id, card_name: card.name || card.card_name, image_url: card.image_normal || card.image_url || card.image_small || null,
      mana_cost: card.mana_cost || '', cmc: detectManaValue(card), type_line: card.type_line || '', oracle_text: card.oracle_text || '', color_identity: inferColorIdentity(card),
      mechanical_score: result.score, ranking_score: rankingScore, mechanical_fit_label: result.fit_label, mechanical_reasons: result.reasons, mechanical_penalties: result.penalties,
      confidence_score: result.confidence_score, confidence: result.confidence_label,
      commander_centrality_score: result.commander_centrality_score, commander_centrality: result.commander_centrality_label,
      delivery: result.delivery, dependency_assessment: result.dependency_assessment, semantic_uncertainty: result.semantic_uncertainty, pair_support: result.pair_support,
      score_components: { ...result.score_components, specificity_bonus: specificityBonus, ranking_score: rankingScore }, roles: result.roles, category: result.category,
      community_inclusion: observation.inclusion_rate ?? null,
      community_observation_count: observation.deck_count ?? observation.observation_deck_count ?? 0,
      statistical_affinity: observation.synergy_score ?? null
    };
    evaluatedForDisagreement.push(evaluated);
    if (result.score >= Number(options.minimumScore ?? 16)) candidates.push(evaluated);
  }
  const groups = new Map();
  for (const candidate of candidates) {
    const edgeSignature = candidate.mechanical_reasons.filter((edge) => edge.feature && edge.relationship !== 'fills_support_role').slice(0, 2).map((edge) => edge.feature).sort().join('+') || 'utility';
    const key = `${candidate.category}:${edgeSignature}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(candidate);
  }
  for (const peers of groups.values()) {
    peers.sort((a, b) => b.ranking_score - a.ranking_score || (b.delivery?.reliability || 0) - (a.delivery?.reliability || 0) || a.cmc - b.cmc || a.card_name.localeCompare(b.card_name));
    const leader = peers[0];
    for (const candidate of peers.slice(1)) {
      const materiallyWorse = leader.ranking_score >= candidate.ranking_score + 7 && (leader.delivery?.reliability || 0) >= (candidate.delivery?.reliability || 0) && leader.cmc <= candidate.cmc + 1;
      if (!materiallyWorse) continue;
      const penalty = Math.min(8, 3 + Math.floor((leader.mechanical_score - candidate.mechanical_score) / 8));
      candidate.mechanical_score = Math.max(0, candidate.mechanical_score - penalty);
      candidate.ranking_score = Number((candidate.ranking_score - penalty).toFixed(2));
      candidate.mechanical_fit_label = fitLabel(candidate.mechanical_score);
      candidate.competition = { dominated_by: leader.card_name, penalty, basis: 'Same role and connection, with lower fit/reliability or worse cost.' };
      candidate.mechanical_penalties.push(makePenalty('role_competition', candidate.category, -penalty, `${leader.card_name} fills the same mechanical role more efficiently or reliably.`));
    }
  }
  const rankedCandidates = buildStableCandidateRanking(candidates);
  const recommendations = rankedCandidates.slice(0, Math.max(1, Number(options.limit || 100))).map((candidate, index) => ({ ...candidate, ranking_quality: { strategy: index < 10 ? 'scalar_with_competition_crowding' : index < 20 ? 'near_score_semantic_tuple' : 'scalar_with_competition_crowding', competition_group: competitionGroupKey(candidate), final_rank: index + 1 } }));
  const categories = MECHANICAL_ROLE_ORDER.map((category) => ({ category, label: MECHANICAL_ROLE_LABELS[category], cards: recommendations.filter((card) => card.roles.includes(category)).slice(0, Number(options.perCategory || 12)) })).filter((section) => section.cards.length > 0);
  return { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, generated_at: options.generatedAt || new Date().toISOString(), commander_profile: commanderProfile, release_policy: commanderProfile.release_policy, suppressed: false, ranking_strategy: { top_10: 'scalar fit with bounded within-lane crowding', top_20: 'near-score semantic tuple with bounded within-lane crowding', final_fallback: 'stable oracle id' }, recommendations, categories, analysis: analyzeMechanicalDisagreement(evaluatedForDisagreement) };
}

export function analyzeMechanicalDisagreement(recommendations = [], thresholds = {}) {
  const highMechanical = Number(thresholds.highMechanical ?? 48);
  const lowMechanical = Number(thresholds.lowMechanical ?? 20);
  const lowCommunity = Number(thresholds.lowCommunity ?? 0.05);
  const highCommunity = Number(thresholds.highCommunity ?? 0.35);
  return {
    obvious_strength: recommendations.filter((card) => card.mechanical_score >= highMechanical && Number(card.community_inclusion || 0) > lowCommunity),
    hidden_chemistry: recommendations.filter((card) => card.mechanical_score >= highMechanical && Number(card.community_inclusion || 0) <= lowCommunity),
    popular_but_weak_mechanical_fit: recommendations.filter((card) => Number(card.community_inclusion || 0) >= highCommunity && card.mechanical_score <= lowMechanical)
  };
}
