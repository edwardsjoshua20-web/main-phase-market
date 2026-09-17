import { isCreature, isInstant, isPermanentType, isSorcery, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';

export const ORACLE_NODE_TYPES = Object.freeze({
  TARGET_SPEC: 'TargetSpec', COST: 'Cost', CONDITION: 'Condition', CHOICE: 'Choice', MODE: 'Mode',
  TRIGGER: 'TriggeredAbility', ACTIVATED: 'ActivatedAbility', SPELL: 'SpellAbility',
  REPLACEMENT: 'ReplacementEffect', PREVENTION: 'PreventionEffect', CONTINUOUS: 'ContinuousEffect',
  ZONE_CHANGE: 'ZoneChangeEffect', DAMAGE: 'DamageEffect', DESTROY: 'DestroyEffect', EXILE: 'ExileEffect',
  COUNTER: 'CounterEffect', PT_MODIFICATION: 'PTModification', KEYWORD_GRANT: 'KeywordGrant',
  TOKEN_CREATION: 'TokenCreation', COUNTER_MODIFICATION: 'CounterModification', LIFE_CHANGE: 'LifeChange',
  DRAW: 'DrawEffect', DISCARD: 'DiscardEffect', SEARCH: 'SearchEffect', COPY: 'CopyEffect',
  CONTROL_CHANGE: 'ControlChangeEffect', TAP_CHANGE: 'TapChangeEffect', MILL: 'MillEffect',
  SACRIFICE: 'SacrificeEffect', UNSUPPORTED: 'UnsupportedEffect'
});

export const ORACLE_GRAMMAR_CAPABILITIES = Object.freeze({
  targets: 'structural',
  boundedTargets: 'structural',
  modes: 'structural',
  triggers: 'structural',
  interveningIf: 'structural-no-condition-execution',
  replacementInstead: 'structural-no-execution',
  prevention: 'structural-no-execution',
  optionalMay: 'partial',
  damage: 'executable-subset',
  destroy: 'executable-subset',
  exile: 'executable-subset',
  counter: 'executable-subset',
  ptModification: 'executable-subset',
  keywordGrant: 'protection-only-executable',
  lifeChange: 'dies-trigger-subset-executable',
  draw: 'structural',
  discard: 'structural',
  search: 'structural',
  mill: 'structural',
  tokenCreation: 'structural',
  counterModification: 'structural',
  zoneChange: 'structural',
  copy: 'structural',
  controlChange: 'structural',
  variableX: 'structural-no-value-solving',
  additionalCosts: 'partial-structural',
  alternateCosts: 'unsupported',
  forEach: 'unsupported',
  unless: 'unsupported',
  asLongAs: 'unsupported',
  continuousLayers: 'unsupported'
});

const cache = new Map();
const NUMBER_WORDS = Object.freeze({ a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 });
const KEYWORDS = Object.freeze(['double strike', 'first strike', 'deathtouch', 'indestructible', 'vigilance', 'hexproof', 'shroud', 'flying', 'reach', 'trample', 'lifelink', 'menace', 'haste', 'defender', 'flash', 'prowess', 'ward', 'equip', 'enchant']);

function cacheKey(card) { return card.oracle_id || card.id || `${card.name}:${card.oracleText}`; }
function amount(value) {
  if (value == null) return { kind: 'unknown' };
  if (String(value).toLowerCase() === 'x') return { kind: 'variable', name: 'X' };
  const number = NUMBER_WORDS[String(value).toLowerCase()] ?? Number(value);
  return Number.isFinite(number) ? { kind: 'fixed', value: number } : { kind: 'expression', value: String(value) };
}

function targetSpec(text = '') {
  const value = normalizeMagicText(text);
  const upTo = value.match(/\bup to (one|two|three|four|five|\d+) targets?\b/);
  const anyNumber = value.includes('any number of target');
  return {
    type: ORACLE_NODE_TYPES.TARGET_SPEC,
    minimum: upTo || anyNumber ? 0 : 1,
    maximum: anyNumber ? null : upTo ? (NUMBER_WORDS[upTo[1]] ?? Number(upTo[1])) : 1,
    kind: value.includes('target spell') ? 'spell' : value.includes('target player') || value.includes('target opponent') ? 'player' : value.includes('any target') ? 'any' : value.includes('target creature') ? 'permanent' : 'target',
    controller: value.includes('you control') ? 'self' : value.includes('an opponent controls') ? 'opponent' : null,
    zone: value.includes('target spell') ? 'stack' : value.includes('target player') || value.includes('target opponent') ? null : 'battlefield',
    requiredTypes: value.includes('creature') ? ['creature'] : [],
    excludedColors: value.includes('nonblack') ? ['black'] : []
  };
}

function parseCost(text = '') {
  const value = normalizeMagicText(text);
  const costs = [];
  const symbols = String(text).match(/\{[^}]+\}/g) || [];
  if (symbols.length) costs.push({ type: ORACLE_NODE_TYPES.COST, costType: 'mana', symbols, variable: symbols.includes('{X}') });
  if (/\{t\}/i.test(text) || /\btap\b/.test(value)) costs.push({ type: ORACLE_NODE_TYPES.COST, costType: 'tap' });
  if (value.includes('sacrifice')) costs.push({ type: ORACLE_NODE_TYPES.COST, costType: 'sacrifice', subject: value.replace(/^.*sacrifice\s+/, '') });
  if (value.includes('discard')) costs.push({ type: ORACLE_NODE_TYPES.COST, costType: 'discard', subject: value.replace(/^.*discard\s+/, '') });
  const life = value.match(/\bpay (\d+) life\b/);
  if (life) costs.push({ type: ORACLE_NODE_TYPES.COST, costType: 'life', amount: amount(life[1]) });
  return costs;
}

function parseEffects(text = '') {
  const value = normalizeMagicText(text);
  const effects = [];
  const target = value.includes('target') ? targetSpec(value) : null;
  const push = (node) => effects.push({ ...node, text: String(text).trim() });

  if (value.includes('destroy target')) push({ type: ORACLE_NODE_TYPES.DESTROY, target });
  if (value.includes('exile target')) push({ type: ORACLE_NODE_TYPES.EXILE, target });
  if (value.includes('counter target spell')) push({ type: ORACLE_NODE_TYPES.COUNTER, target: targetSpec('target spell') });
  const splitDamage = value.match(/\bdeals? (\d+|x) damage to (?:any target|one target|target [^.]+?) and (\d+|x) damage to another target\b/);
  if (splitDamage) {
    push({ type: ORACLE_NODE_TYPES.DAMAGE, amount: amount(splitDamage[1]), target: { ...targetSpec('one target'), index: 0 } });
    push({ type: ORACLE_NODE_TYPES.DAMAGE, amount: amount(splitDamage[2]), target: { ...targetSpec('another target'), index: 1 } });
  } else {
    const targeted = value.match(/\bdeals? (\d+|x) damage to (any target|target [^.]+)/);
    if (targeted) push({ type: ORACLE_NODE_TYPES.DAMAGE, amount: amount(targeted[1]), target });
  }
  const global = value.match(/\bdeals? (\d+|x) damage to each creature\b/);
  if (global) push({ type: ORACLE_NODE_TYPES.DAMAGE, amount: amount(global[1]), affected: { kind: 'each', filter: { type: 'creature' } } });
  const pt = value.match(/\btarget [^.]+ gets ([+-]\d+|x)\/([+-]\d+|x)/);
  if (pt) push({ type: ORACLE_NODE_TYPES.PT_MODIFICATION, power: amount(pt[1]), toughness: amount(pt[2]), target, duration: value.includes('until end of turn') ? 'until-end-of-turn' : null });
  const protection = value.match(/\bgains? protection from (the color of your choice|white|blue|black|red|green|artifacts?|creatures?)/);
  if (protection) push({ type: ORACLE_NODE_TYPES.KEYWORD_GRANT, keyword: 'protection', quality: protection[1], target, duration: value.includes('until end of turn') ? 'until-end-of-turn' : null });
  for (const keyword of KEYWORDS) {
    if (['ward', 'equip', 'enchant'].includes(keyword)) continue;
    if (new RegExp(`\\bgains? ${keyword.replace(' ', '\\s+')}\\b`).test(value)) push({ type: ORACLE_NODE_TYPES.KEYWORD_GRANT, keyword, target, duration: value.includes('until end of turn') ? 'until-end-of-turn' : null });
  }
  const loss = value.match(/\b(target player|target opponent|each opponent|that player|you) loses? (\d+|x) life\b/);
  if (loss) push({ type: ORACLE_NODE_TYPES.LIFE_CHANGE, direction: 'lose', amount: amount(loss[2]), subject: loss[1], target: loss[1].startsWith('target') ? targetSpec(loss[1]) : null });
  const gain = value.match(/\b(you|target player) gains? (\d+|x) life\b/);
  if (gain) push({ type: ORACLE_NODE_TYPES.LIFE_CHANGE, direction: 'gain', amount: amount(gain[2]), subject: gain[1], target: gain[1].startsWith('target') ? targetSpec(gain[1]) : null });
  const draw = value.match(/\bdraw (a|one|two|three|four|five|\d+) cards?\b/);
  if (draw) push({ type: ORACLE_NODE_TYPES.DRAW, amount: amount(draw[1]), subject: 'you' });
  const discard = value.match(/\b(target player|you|that player) discards? (a|one|two|three|four|five|\d+) cards?\b/);
  if (discard) push({ type: ORACLE_NODE_TYPES.DISCARD, amount: amount(discard[2]), subject: discard[1] });
  const mill = value.match(/\bmills? (a|one|two|three|four|five|\d+) cards?\b/);
  if (mill) push({ type: ORACLE_NODE_TYPES.MILL, amount: amount(mill[1]) });
  if (value.includes('search your library')) push({ type: ORACLE_NODE_TYPES.SEARCH, zone: 'library', controller: 'self' });
  if (value.includes('create') && value.includes('token')) push({ type: ORACLE_NODE_TYPES.TOKEN_CREATION, amount: amount(value.match(/\bcreate (a|one|two|three|four|five|\d+)\b/)?.[1] || 1) });
  if (/\bput .+ counters? on\b/.test(value)) push({ type: ORACLE_NODE_TYPES.COUNTER_MODIFICATION, operation: 'add' });
  if (/\bremove .+ counters? from\b/.test(value)) push({ type: ORACLE_NODE_TYPES.COUNTER_MODIFICATION, operation: 'remove' });
  if (value.includes('return') && value.includes("owner's hand")) push({ type: ORACLE_NODE_TYPES.ZONE_CHANGE, from: 'battlefield', to: 'hand', target });
  if (value.includes('sacrifice')) push({ type: ORACLE_NODE_TYPES.SACRIFICE, subject: value.replace(/^.*sacrifice\s+/, ''), target });
  if (value.includes('tap target')) push({ type: ORACLE_NODE_TYPES.TAP_CHANGE, tapped: true, target });
  if (value.includes('untap target')) push({ type: ORACLE_NODE_TYPES.TAP_CHANGE, tapped: false, target });
  if (value.includes('copy target') || value.includes('copy of')) push({ type: ORACLE_NODE_TYPES.COPY, target });
  if (value.includes('gain control of target')) push({ type: ORACLE_NODE_TYPES.CONTROL_CHANGE, controller: 'effect-controller', target });
  if (value.includes('prevent') && value.includes('damage')) push({ type: ORACLE_NODE_TYPES.PREVENTION, event: 'DamageProposed', amount: amount(value.match(/\bprevent (?:the next )?(\d+|x|all)\b/)?.[1] || 'all') });
  return effects;
}

function triggerEvent(triggerText, card) {
  const value = normalizeMagicText(triggerText);
  if (value.includes('dies')) {
    const selfOrAnother = value.includes('this or another creature dies') || value.includes('this creature or another creature dies') || value.includes(`${card.normalizedName} or another creature dies`);
    return { type: 'EventPattern', eventType: 'CreatureDied', filter: { objectType: 'creature', includeSelf: selfOrAnother || !value.includes('another creature dies'), includeOthers: value.includes('another creature dies') || value.includes('a creature dies') } };
  }
  if (value.includes('enters the battlefield')) return { type: 'EventPattern', eventType: 'PermanentEntered', filter: {} };
  if (value.includes('leaves the battlefield')) return { type: 'EventPattern', eventType: 'PermanentLeft', filter: {} };
  if (value.includes('attacks')) return { type: 'EventPattern', eventType: 'AttackDeclared', filter: {} };
  if (value.includes('blocks')) return { type: 'EventPattern', eventType: 'BlockDeclared', filter: {} };
  if (value.includes('cast')) return { type: 'EventPattern', eventType: 'SpellCast', filter: {} };
  if (value.includes('upkeep')) return { type: 'EventPattern', eventType: 'StepBegan', filter: { step: 'upkeep' } };
  if (value.includes('end step')) return { type: 'EventPattern', eventType: 'StepBegan', filter: { step: 'end' } };
  if (value.includes('deals damage')) return { type: 'EventPattern', eventType: 'DamageDealt', filter: {} };
  if (value.includes('gain life')) return { type: 'EventPattern', eventType: 'LifeGained', filter: {} };
  if (value.includes('lose life')) return { type: 'EventPattern', eventType: 'LifeLost', filter: {} };
  return { type: 'EventPattern', eventType: null, filter: {} };
}

function triggeredAbilities(card) {
  return String(card.oracleText).split(/(?<=\.)\s+/).flatMap((sentence) => {
    const match = sentence.match(/^\s*(when|whenever|at)\s+(.+?),\s*(.+)$/i);
    if (!match) return [];
    const intervening = match[2].match(/\bif\s+(.+)$/i);
    const effects = parseEffects(match[3]);
    return [{ type: ORACLE_NODE_TYPES.TRIGGER, event: triggerEvent(`${match[1]} ${match[2]}`, card), condition: intervening ? { type: ORACLE_NODE_TYPES.CONDITION, kind: 'intervening-if', text: intervening[1] } : null, interveningIf: Boolean(intervening), effects, optional: /\byou may\b/i.test(match[3]), targets: effects.flatMap((effect) => effect.target ? [effect.target] : []), text: sentence.trim() }];
  });
}

function activatedAbilities(card) {
  return String(card.oracleText).split(/(?<=\.)\s+/).filter((sentence) => sentence.includes(':')).map((sentence) => {
    const index = sentence.indexOf(':');
    return { type: ORACLE_NODE_TYPES.ACTIVATED, costs: parseCost(sentence.slice(0, index)), restrictions: [], effects: parseEffects(sentence.slice(index + 1)), text: sentence.trim() };
  });
}

function spellAbilities(card) {
  if (!isInstant(card) && !isSorcery(card)) return [];
  const effects = parseEffects(card.oracleText);
  const choice = normalizeMagicText(card.oracleText).match(/\bchoose (one|two|one or more)\b/);
  const modes = choice ? [{ type: ORACLE_NODE_TYPES.MODE, choose: choice[1], options: String(card.oracleText).split(/[•\n]/).slice(1).map((text) => ({ text: text.trim(), effects: parseEffects(text) })) }] : [];
  return [{ type: ORACLE_NODE_TYPES.SPELL, modes, targets: effects.flatMap((effect) => effect.target ? [effect.target] : []), effects, conditions: [], text: card.oracleText }];
}

function replacements(card) {
  return String(card.oracleText).split(/(?<=\.)\s+/).flatMap((sentence) => {
    const match = sentence.match(/\bif (.+?) would (.+?),? instead (.+)/i) || sentence.match(/\bif (.+?) would (.+?),? (.+?) instead\b/i);
    return match ? [{ type: ORACLE_NODE_TYPES.REPLACEMENT, proposedEvent: match[2], applicability: { type: ORACLE_NODE_TYPES.CONDITION, text: match[1] }, replacementResult: match[3], text: sentence.trim() }] : [];
  });
}

function legacyEffect(effect) {
  const primitives = [];
  const target = effect.target ? { kind: effect.target.kind, requiredTypes: effect.target.requiredTypes, excludedColors: effect.target.excludedColors, controller: effect.target.controller } : undefined;
  if (target) primitives.push('targeting', 'resolving');
  switch (effect.type) {
    case ORACLE_NODE_TYPES.DESTROY: return { type: 'destroy', target, primitives: [...primitives, 'state-based-actions'] };
    case ORACLE_NODE_TYPES.EXILE: return { type: 'exile', target, primitives };
    case ORACLE_NODE_TYPES.COUNTER: return { type: 'counter', target, primitives: [...primitives, 'stack'] };
    case ORACLE_NODE_TYPES.DAMAGE: return effect.affected ? { type: 'damage-each', amount: effect.amount.value, selector: { type: 'creature' }, primitives: ['damage', 'state-based-actions', 'triggers'] } : { type: 'damage', amount: effect.amount.value, target, targetIndex: effect.target?.index, primitives: [...primitives, 'damage', 'state-based-actions'] };
    case ORACLE_NODE_TYPES.PT_MODIFICATION: return { type: 'modify-pt', power: effect.power.value, toughness: effect.toughness.value, target, primitives: [...primitives, 'continuous', 'state-based-actions'] };
    case ORACLE_NODE_TYPES.KEYWORD_GRANT: return effect.keyword === 'protection' ? { type: 'grant-protection', quality: effect.quality, target, primitives: [...primitives, 'protection', 'continuous'] } : null;
    case ORACLE_NODE_TYPES.SACRIFICE: return { type: 'sacrifice', target, primitives: ['state-based-actions'] };
    case ORACLE_NODE_TYPES.PREVENTION: return { type: 'prevent-damage', primitives: ['replacement', 'damage'] };
    default: return null;
  }
}

function legacyTrigger(ability) {
  const loss = ability.effects.find((effect) => effect.type === ORACLE_NODE_TYPES.LIFE_CHANGE && effect.direction === 'lose');
  const gain = ability.effects.find((effect) => effect.type === ORACLE_NODE_TYPES.LIFE_CHANGE && effect.direction === 'gain');
  if (ability.event.eventType !== 'CreatureDied') return { type: 'triggered', trigger: ability.event.eventType, eventFilter: {}, effect: { type: 'unsupported' }, primitives: ['triggers'], ir: ability };
  return { type: 'triggered', trigger: 'CreatureDied', eventFilter: { creature: true, includeSelf: ability.event.filter.includeSelf, includeOthers: ability.event.filter.includeOthers }, effect: { type: 'life-drain', opponentLifeLoss: loss?.amount?.value || 0, controllerLifeGain: gain?.amount?.value || 0, target: loss?.subject || 'target opponent' }, primitives: ['triggers', 'lki'], ir: ability };
}

export function parseOracleSemantics(cardInput = {}) {
  const card = normalizeMagicCard(cardInput);
  const key = cacheKey(card);
  if (cache.has(key)) return cache.get(key);
  const spell = spellAbilities(card);
  const triggers = triggeredAbilities(card);
  const activated = activatedAbilities(card);
  const replacementEffects = replacements(card);
  const allEffects = [...spell, ...triggers, ...activated].flatMap((ability) => ability.effects);
  const unsupportedText = [];
  if ((isInstant(card) || isSorcery(card)) && spell[0]?.effects.length === 0) unsupportedText.push('unsupported-oracle-semantics');
  if (/\b(layer|dependency|opalescence|humility)\b/.test(normalizeMagicText(card.oracleText))) unsupportedText.push('complex-layer-or-dependency-text');
  const semantics = {
    type: 'OracleSemanticIR', version: 2, card,
    objectTypes: { permanent: isPermanentType(card), creature: isCreature(card), instant: isInstant(card), sorcery: isSorcery(card) },
    keywords: KEYWORDS.filter((keyword) => normalizeMagicText(card.oracleText).includes(keyword)),
    abilities: [...spell, ...triggers, ...activated], spellAbilities: spell, triggeredAbilitiesIR: triggers, activatedAbilitiesIR: activated,
    replacementEffects, preventionEffects: allEffects.filter((effect) => effect.type === ORACLE_NODE_TYPES.PREVENTION),
    continuousEffects: allEffects.filter((effect) => [ORACLE_NODE_TYPES.PT_MODIFICATION, ORACLE_NODE_TYPES.KEYWORD_GRANT, ORACLE_NODE_TYPES.CONTROL_CHANGE].includes(effect.type)),
    unsupportedText,
    coverage: { parsedAbilityCount: spell.length + triggers.length + activated.length, parsedEffectCount: allEffects.length, unsupported: unsupportedText.length > 0, capabilities: ORACLE_GRAMMAR_CAPABILITIES },
    spellEffects: spell.flatMap((ability) => ability.effects).map(legacyEffect).filter(Boolean),
    triggeredAbilities: triggers.map(legacyTrigger),
    activatedAbilities: activated.map((ability) => ({ type: 'activated', costs: ability.costs, effects: ability.effects.map(legacyEffect).filter(Boolean), primitives: ['timing', 'stack'], ir: ability })),
    staticAbilities: []
  };
  cache.set(key, semantics);
  return semantics;
}

export function clearOracleSemanticCache() { cache.clear(); }
