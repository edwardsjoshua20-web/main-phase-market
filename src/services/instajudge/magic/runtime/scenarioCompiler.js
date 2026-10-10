import { isPermanentType, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { PAYMENT_STATUS, createDiscardCost, createLifeCost, createManaCost, createSacrificeCost } from './costSystem.js';
import { parseOracleSemantics } from './oracleSemantics.js';

const NUMBER_WORDS = Object.freeze({
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6
});

const KEYWORDS = Object.freeze([
  'double strike',
  'first strike',
  'deathtouch',
  'indestructible',
  'vigilance',
  'hexproof',
  'shroud',
  'flying',
  'reach',
  'trample',
  'lifelink',
  'menace',
  'haste',
  'defender',
  'flash',
  'ward'
]);

function makeIdFactory() {
  let nextId = 1;
  return (prefix) => `${prefix}-${nextId++}`;
}

function numberFrom(value, fallback = 1) {
  if (value == null || value === '') return fallback;
  return NUMBER_WORDS[value] ?? Number(value) ?? fallback;
}

function ownerFrom(text = '') {
  return /\b(?:opponent(?:'?s|\s+s)?|their)\b/.test(normalizeMagicText(text)) ? 'opponent' : 'player';
}

function parseWardCost(text = '') {
  const mana = String(text).match(/\bward\s*(?:[-—]\s*)?(\{[^}]+\}|\d+)/i);
  if (mana) return createManaCost(mana[1].startsWith('{') ? mana[1] : `{${mana[1]}}`);
  const life = String(text).match(/\bward\s*[-—]\s*pay\s+(\d+)\s+life/i);
  if (life) return createLifeCost(Number(life[1]));
  if (/\bward\s*[-—]\s*discard\s+(?:a|one)\s+card/i.test(text)) return createDiscardCost({ count: 1 });
  if (/\bward\s*[-—]\s*sacrifice\s+(?:a|one)\s+permanent/i.test(text)) return createSacrificeCost({ count: 1 });
  return null;
}

function parseKeywordAbilities(text = '') {
  const normalized = normalizeMagicText(text);
  const abilities = KEYWORDS.filter((keyword) => normalized.includes(keyword)).map((keyword) => {
    const ability = { type: 'KeywordAbility', keyword };
    if (keyword === 'ward') {
      const cost = parseWardCost(text);
      if (cost) ability.cost = cost;
    }
    return ability;
  });
  for (const match of normalized.matchAll(/\bprotection from (white|blue|black|red|green|colorless|artifacts?|creatures?)\b/g)) {
    abilities.push({ type: 'KeywordAbility', keyword: `protection from ${match[1].replace(/s$/, '')}` });
  }
  return abilities;
}

function genericCard({ name, typeLine, power, toughness, abilities }) {
  return {
    name,
    typeLine,
    oracleText: abilities.map((ability) => ability.cost
      ? `${ability.keyword} ${ability.cost.symbols?.join('') || ability.cost.type}`
      : ability.keyword).join(', '),
    power: Number.isFinite(power) ? power : '*',
    toughness: Number.isFinite(toughness) ? toughness : '*',
    abilities: abilities.map((ability) => ability.keyword)
  };
}

function typeLineFrom(text = '', token = false) {
  const normalized = normalizeMagicText(text);
  const types = [];
  if (normalized.includes('legendary') || normalized.includes('commander')) types.push('Legendary');
  if (normalized.includes('artifact')) types.push('Artifact');
  if (normalized.includes('enchantment')) types.push('Enchantment');
  if (normalized.includes('creature') || normalized.includes('commander') || types.length === 0) types.push('Creature');
  const joined = types.join(' ');
  return token ? `${joined} - Token` : joined;
}

function pushObject(objects, object, sourceKey) {
  if (objects.some((entry) => entry.sourceKey === sourceKey)) return;
  objects.push({ ...object, sourceKey });
}

function compileGenericObjects(message, makeId) {
  const normalized = normalizeMagicText(message);
  const objects = [];

  for (const match of normalized.matchAll(/\b(?:(my opponent's|opponent's|their|my|your) )?(?:basic )?land\b/g)) {
    const controller = ownerFrom(match[0]);
    const name = `Generic Land ${String.fromCharCode(65 + objects.length)}`;
    pushObject(objects, {
      id: makeId('object'), kind: 'object', name, owner: controller, controller,
      zone: 'battlefield', token: false, tapped: false, commander: false,
      power: null, toughness: null, counters: {}, abilities: [],
      card: genericCard({ name, typeLine: 'Land', power: null, toughness: null, abilities: [] })
    }, `${match.index}:land`);
  }

  for (const match of normalized.matchAll(/\b(one|two|three|four|five|six|\d+)\s+(\d+)\/(\d+)\s+creature tokens?\b/g)) {
    if (/\bcreate\s+$/.test(normalized.slice(Math.max(0, match.index - 16), match.index))) continue;
    const count = numberFrom(match[1]);
    const controller = ownerFrom(normalized.slice(Math.max(0, match.index - 50), match.index + match[0].length));
    for (let index = 0; index < count; index += 1) {
      const name = `Token ${String.fromCharCode(65 + objects.length)}`;
      const abilities = [];
      pushObject(objects, {
        id: makeId('object'),
        kind: 'object',
        name,
        owner: controller,
        controller,
        zone: 'battlefield',
        token: true,
        tapped: false,
        commander: false,
        power: Number(match[2]),
        toughness: Number(match[3]),
        counters: {},
        abilities,
        card: genericCard({ name, typeLine: 'Creature - Token', power: Number(match[2]), toughness: Number(match[3]), abilities })
      }, `${match.index}:${index}`);
    }
  }

  const descriptorPattern = /\b(?:(my opponent's|opponent's|their|my own|my|your|i control|opponent controls|player controls)\s+)?(?:(one|two|three|four|five|six|\d+|a|an)\s+)?(?:(\d+)\/(\d+)\s+)?((?:tapped\s+)?(?:legendary\s+)?(?:artifact\s+)?(?:commander|creature)(?:\s+tokens?)?(?:\s+(?:that has|has|with)\s+(?:double strike|first strike|deathtouch|indestructible|vigilance|hexproof|shroud|flying|reach|trample|lifelink|menace|haste|defender|flash|ward(?:\s+\d+)?|protection from (?:white|blue|black|red|green|colorless|artifacts?|creatures?))(?:\s+and\s+(?:[a-z ]+))?)?)(?=\s+(?:attacks?|blocks?|for|and|after|before|gains?|gets?|is|are|from|target|targeting|can|in response|i cast|\. |\?|$)|$)/g;
  for (const match of normalized.matchAll(descriptorPattern)) {
    if (/\bcreate\s+$/.test(normalized.slice(Math.max(0, match.index - 16), match.index))) continue;
    if (objects.some((entry) => entry.sourceKey.startsWith(`${match.index}:`))) continue;
    const descriptor = match[0];
    const before = normalized.slice(Math.max(0, match.index - 32), match.index);
    if (!match[3] && (/\btarget(?:ing|s)?\s+$/.test(before) && /\b(my own|that|the)\b/.test(descriptor)
      || /\btarget(?:ing|s)?\s+(?:my own|that|the)\s+$/.test(before))) continue;
    const count = numberFrom(match[2]);
    const nearby = normalized.slice(Math.max(0, match.index - 100), match.index + descriptor.length);
    const controller = !/\b(my opponent's|opponent's|their|my own|my|your|i control|opponent controls|player controls)\b/.test(descriptor)
      && /\banother\b/.test(nearby)
      && /\bopponent\b/.test(nearby)
      ? 'opponent'
      : ownerFrom(descriptor);
    const token = /\btokens?\b/.test(descriptor);
    const power = match[3] ? Number(match[3]) : null;
    const toughness = match[4] ? Number(match[4]) : null;
    const rawWindow = String(message).slice(match.index, match.index + descriptor.length + 12);
    const abilities = parseKeywordAbilities(rawWindow || descriptor);
    for (let index = 0; index < count; index += 1) {
      const name = token
        ? `Token ${String.fromCharCode(65 + objects.length)}`
        : `${match[5].includes('commander') ? 'Generic Commander' : 'Generic Creature'} ${String.fromCharCode(65 + objects.length)}`;
      const typeLine = typeLineFrom(descriptor, token);
      pushObject(objects, {
        id: makeId('object'),
        kind: 'object',
        name,
        owner: controller,
        controller,
        zone: 'battlefield',
        token,
        tapped: /\btapped\b/.test(descriptor),
        commander: /\bcommander\b/.test(descriptor),
        power,
        toughness,
        counters: {},
        abilities,
        card: genericCard({ name, typeLine, power, toughness, abilities })
      }, `${match.index}:${index}`);
    }
  }
  return objects;
}

function permanentController(message, cardName) {
  const text = normalizeMagicText(message);
  const name = normalizeMagicText(cardName);
  if (new RegExp(`\\b(?:opponent controls|opponent has|opponent(?:'?s|\\s+s))\\s+(?:a |an |the )?${escapeRegExp(name)}\\b`).test(text)) return 'opponent';
  if (new RegExp(`\\b(?:i control|i have|player controls|you control|my)\\s+(?:a |an |the )?${escapeRegExp(name)}\\b`).test(text)) return 'player';
  return 'player';
}

function descriptorMatches(descriptor, object) {
  const text = normalizeMagicText(descriptor);
  if (/\bopponent|their\b/.test(text) && object.controller !== 'opponent') return false;
  if (!/\bmy opponent\b/.test(text) && /\bmy|own\b/.test(text) && object.controller !== 'player') return false;
  if (/\bcreature\b/.test(text) && !normalizeMagicText(object.card.typeLine).includes('creature')) return false;
  const pt = text.match(/\b(\d+)\/(\d+)\b/);
  if (pt && (object.power !== Number(pt[1]) || object.toughness !== Number(pt[2]))) return false;
  for (const ability of parseKeywordAbilities(text)) {
    if (!object.abilities.some((candidate) => candidate.keyword === ability.keyword)) return false;
  }
  return true;
}

function cardMentions(text, cards) {
  return cards.flatMap((card) => {
    const mentions = [];
    let index = text.indexOf(card.normalizedName);
    while (index >= 0) {
      mentions.push({ card, index, end: index + card.normalizedName.length });
      index = text.indexOf(card.normalizedName, index + card.normalizedName.length);
    }
    return mentions;
  }).sort((left, right) => left.index - right.index);
}

function explicitActionForMention(text, mention) {
  const before = text.slice(Math.max(0, mention.index - 120), mention.index);
  const after = text.slice(mention.end, mention.end + 80);
  const actor = /\b(?:my opponent|opponent|they)\s+(?:(?:cast|casts|casting|play|plays|played|activate|activates|activated|activating)\s+|attack(?:s|ed|ing)? with\s+|(?:block|blocks|blocked|blocking)(?:\s+it|\s+that creature|\s+[^.!?]{1,60})? with\s+(?:(?:another|a|an|the|their|my)\s+)?|declares?\s+)$/.test(before)
    ? 'opponent'
    : 'player';
  if (/\b(?:can|may) (?:i|player|you) (?:respond (?:by|with) )?cast\s*$|\b(?:i|player|you|my opponent|opponent|they|he|she|[a-z][a-z0-9-]*) (?:cast|casts|casting)\s*$|\brespond(?:ing)? (?:by casting|with)\s*$|\bis casting\s*$/.test(before)) return { type: 'Cast', actor };
  if (/\b(?:instant|sorcery)\b/.test(mention.card.normalizedType)
    && /\b(?:destroy|exile|damage|counter|pump|save)\s+[^.!?]{1,100}\s+with\s*$/.test(before)) return { type: 'Cast', actor };
  if (/\b(?:can|may) (?:i|player|you) activat(?:e|ing)\s*$|\b(?:i|player|you|my opponent|opponent|they) activat(?:e|es|ed|ing)\s*$/.test(before)) return { type: 'Activate', actor };
  if (/\b(?:can|may) (?:i|player|you) play\s*$|\b(?:i|player|you|my opponent|opponent|they) (?:play|plays|played)\s*$/.test(before)) return { type: 'Play', actor };
  if (/\b(?:i|player|you|my opponent|opponent|they) attack(?:s|ed|ing)? with\s*$/.test(before) || /^\s+attacks?\b/.test(after)) return { type: 'Attack', actor };
  if (/\b(?:my opponent|opponent|they|i|player|you) (?:block|blocks|blocked|blocking)(?:\s+it|\s+that creature|\s+[^.!?]{1,60})? with\s+(?:(?:another|a|an|the|their|my)\s+)?$/.test(before)
    || (/\b(?:my opponent|opponent|they|i|player|you) declares?\s*$/.test(before) && /^\s+as (?:a |the )?blocker\b/.test(after))
    || /\bblocked by\s*$/.test(before)
    || /^\s+(?:blocks?\b|is blocking\b)/.test(after)) return { type: 'Block', actor };
  return null;
}

function targetDescriptorAfter(text, mention) {
  const after = text.slice(mention.end, mention.end + 260);
  const match = after.match(/^\s+(?:target(?:ing|s)?|on|at)\s+(.+?)(?=\s+(?:and (?:it|do|does|did|pay|respond)|in response|before|after|does|do|can|will|then)|[.?]|$)/);
  if (match) {
    const descriptor = match[1].trim();
    if (!/^(?:my |the )?opponent(?:'?s|\s+s)? turn\b|^(?:the )?beginning of combat\b|^(?:the )?(?:phase|step)\b/.test(descriptor)) return descriptor;
  }
  const direct = after.match(/^\s+((?:my|your|their|opponent(?:'?s|\s+s)?)\s+.+?)(?=\s+(?:and|before|after|does|do|can|will|then)|[.?]|$)/);
  if (direct) return direct[1].trim();
  const before = text.slice(Math.max(0, mention.index - 140), mention.index);
  const inverseAction = before.match(/\b(?:destroy|exile|damage|counter|pump|save|target)\s+(.+?)\s+with\s*$/);
  const inverseRelation = before.match(/.*\b((?:my|your|their|opponent(?:'?s|\s+s)?)\s+(?:[a-z0-9 -]*?\b(?:creature|permanent|attacker|blocker|bears?)))\s+(?:dies to|is destroyed by)\s*$/);
  const inverse = inverseAction || inverseRelation;
  return inverse?.[1]?.replace(/^(?:if|when|after)\s+/, '').trim() || '';
}

function objectForDescriptor(descriptor, objects, referenceIndex = null) {
  const normalized = normalizeMagicText(descriptor);
  let candidates = objects.filter((object) => descriptorMatches(normalized, object));
  if (/\b(?:the |that )?blocker\b/.test(normalized)) candidates = candidates.filter((object) => object.roles?.includes('blocker'));
  if (/\b(?:the |that )?attacker\b/.test(normalized)) candidates = candidates.filter((object) => object.roles?.includes('attacker'));
  const named = candidates.filter((object) => normalized.includes(normalizeMagicText(object.name)));
  if (named.length) candidates = named;
  if (/\b(?:it|that creature|that permanent)\b/.test(normalized) && Number.isInteger(referenceIndex)) {
    const preceding = candidates
      .map((object) => ({ object, index: object.mentionIndex ?? Number(String(object.sourceKey || '').split(':')[0]) }))
      .filter((entry) => Number.isFinite(entry.index) && entry.index < referenceIndex)
      .sort((left, right) => right.index - left.index);
    if (preceding.length) return preceding[0].object;
  }
  return candidates.length === 1 ? candidates[0] : null;
}

function createCardObject(card, { controller, role, mentionIndex }, makeId) {
  return {
    id: makeId('object'), kind: 'object', name: card.name, card,
    owner: controller, controller, zone: 'battlefield', token: false, tapped: false,
    commander: false, power: card.power, toughness: card.toughness, counters: {},
    abilities: parseKeywordAbilities(card.oracleText), roles: role ? [role] : [], mentionIndex,
    attachedToObjectId: null,
    sourceKey: `mention:${mentionIndex}:${card.id}:${role || 'reference'}`
  };
}

function compileExplicitScenario(message, cards, baseObjects, makeId) {
  const text = normalizeMagicText(message);
  const mentions = cardMentions(text, cards);
  const bindings = mentions.map((mention) => ({ ...mention, action: explicitActionForMention(text, mention) })).filter((mention) => mention.action);
  const objects = [...baseObjects];
  const objectByBinding = new Map();

  for (const binding of bindings.filter((entry) => ['Attack', 'Block'].includes(entry.action.type))) {
    if (!isPermanentType(binding.card)) continue;
    const role = binding.action.type === 'Attack' ? 'attacker' : 'blocker';
    const object = createCardObject(binding.card, { controller: binding.action.actor, role, mentionIndex: binding.index }, makeId);
    objects.push(object);
    objectByBinding.set(binding, object);
  }

  for (const card of cards) {
    if (!isPermanentType(card) || objects.some((object) => object.card?.id === card.id)) continue;
    const mentioned = mentions.find((mention) => mention.card.id === card.id);
    if (!mentioned) continue;
    const hasSpellAction = bindings.some((binding) => binding.card.id === card.id && ['Cast', 'Play'].includes(binding.action.type));
    const battlefieldContext = new RegExp(`\\b(?:controls?|has|with|if|when)\\b[^.!?]{0,80}\\b${escapeRegExp(card.normalizedName)}\\b|\\b${escapeRegExp(card.normalizedName)}\\b[^.!?]{0,80}\\b(?:dies?|attacks?|blocks?|applies?|is on the battlefield)\\b`).test(text);
    if (!hasSpellAction || battlefieldContext) {
      objects.push(createCardObject(card, { controller: permanentController(message, card.name), role: null, mentionIndex: mentioned.index }, makeId));
    }
  }

  const attackObjects = [...objectByBinding.entries()].filter(([binding]) => binding.action.type === 'Attack').map(([, object]) => object);
  const actions = bindings.map((binding) => {
    const sourceObject = objectByBinding.get(binding) || null;
    let descriptor = targetDescriptorAfter(text, binding);
    if (binding.action.type === 'Block' && !descriptor) descriptor = 'the attacker';
    const target = descriptor === 'the attacker' && attackObjects.length === 1 ? attackObjects[0] : descriptor ? objectForDescriptor(descriptor, objects, binding.index) : null;
    return {
      id: makeId('action'), type: binding.action.type, actor: binding.action.actor,
      source: { kind: sourceObject ? 'object' : 'card', cardId: binding.card.id, name: binding.card.name, objectId: sourceObject?.id || null },
      zoneFrom: ['Cast', 'Play'].includes(binding.action.type) ? 'hand' : 'battlefield',
      zoneTo: binding.action.type === 'Play' ? 'battlefield' : binding.action.type === 'Cast' ? 'stack' : null,
      targets: descriptor ? [{ type: 'TargetChoice', descriptor, objectId: target?.id || null }] : [],
      modes: [], costs: binding.card.manaCost && ['Cast', 'Play'].includes(binding.action.type) ? [createManaCost(binding.card.manaCost)] : [],
      index: binding.index, end: binding.end, role: binding.action.type.toLowerCase()
    };
  });

  const questionMatch = [...text.matchAll(/\b(?:can|may) (?:i|player|you) (?:respond (?:by|with) )?(cast|play|activate|activating)\b/g)].at(-1);
  let questionedAction = null;
  if (questionMatch) {
    const actionType = questionMatch[1].startsWith('activat') ? 'Activate' : questionMatch[1] === 'play' ? 'Play' : 'Cast';
    questionedAction = actions.find((action) => action.type === actionType && action.index >= questionMatch.index)
      || (actionType === 'Play' && /\bplay (?:a |the )?land\b/.test(text.slice(questionMatch.index)) ? {
        id: makeId('question'), type: 'PlayLand', actor: 'player', source: { kind: 'card', cardId: null, name: 'Specified Land' }, targets: [], index: questionMatch.index
      } : null);
  }
  if (!questionedAction && /\bis (?:casting|activating)\b.*\blegal\b/.test(text)) {
    questionedAction = actions.find((action) => ['Cast', 'Activate'].includes(action.type) && /\blegal\b/.test(text.slice(action.end, action.end + 80))) || null;
  }

  const events = actions.map((action) => ({
    id: makeId('event'), type: action.type, actor: action.actor, source: action.source,
    targets: action.targets, index: action.index,
    status: questionedAction?.id === action.id ? 'proposed' : action.type === 'Cast' ? 'unresolved' : 'committed'
  }));
  for (const action of actions.filter((entry) => entry.type === 'Cast')) {
    const name = normalizeMagicText(action.source.name);
    const pending = new RegExp(`\\bbefore ${escapeRegExp(name)} resolves\\b|\\b${escapeRegExp(name)} (?:has not|hasn't|had not|hadn't) resolved yet\\b`).test(text.slice(action.index));
    const resolved = new RegExp(`\\b${escapeRegExp(name)} (?:resolves|resolved)\\b`).test(text.slice(action.end)) && !pending;
    if (resolved) events.push({ id: makeId('event'), type: 'Resolve', actor: null, source: action.source, targets: [], index: text.length, status: 'committed' });
  }
  events.sort((left, right) => left.index - right.index);
  return { objects, actions, events, questionedAction };
}

function inferredTurnStep(text) {
  if (/\buntap step\b/.test(text)) return 'untap';
  if (/\bupkeep\b/.test(text)) return 'upkeep';
  if (/\bdraw step\b/.test(text)) return 'draw';
  if (/\b(?:precombat|first) main(?: phase)?\b/.test(text)) return 'precombat-main';
  if (/\b(?:postcombat|second) main(?: phase)?\b|\bafter combat\b/.test(text)) return 'postcombat-main';
  if (/\bbeginning of combat\b/.test(text)) return 'beginning-of-combat';
  if (/\bafter attackers(?: are| were)? declared\b/.test(text)) return 'declare-attackers';
  if (/\bafter blockers(?: are| were)? declared\b/.test(text)) return 'declare-blockers';
  if (/\bbetween first[- ]strike (?:damage )?and (?:normal|regular) (?:combat )?damage\b|\bafter first[- ]strike (?:combat )?damage\b|\bfirst[- ]strike (?:combat )?damage (?:has been|was) dealt\b|\bhas dealt first[- ]strike (?:combat )?damage\b/.test(text)) return 'first-strike-combat-damage';
  if (/\bafter (?:regular )?combat damage\b/.test(text)) return 'combat-damage';
  if (/\bend of combat\b/.test(text)) return 'end-of-combat';
  if (/\bend step\b/.test(text)) return 'end-step';
  if (/\bcleanup\b/.test(text)) return 'cleanup';
  if (/\bmain phase\b/.test(text)) return 'precombat-main';
  return null;
}

function phaseForStep(step) {
  if (['untap', 'upkeep', 'draw'].includes(step)) return 'beginning';
  if (['precombat-main', 'postcombat-main'].includes(step)) return 'main';
  if (['beginning-of-combat', 'declare-attackers', 'declare-blockers', 'first-strike-combat-damage', 'combat-damage', 'end-of-combat'].includes(step)) return 'combat';
  if (['end-step', 'cleanup'].includes(step)) return 'ending';
  return 'main';
}

function inferredLandPlayState(text) {
  const explicit = text.match(/\b(\d+)\s+of\s+(\d+)\s+land plays? used\b/);
  if (explicit) return { used: Number(explicit[1]), allowed: Number(explicit[2]), known: true };
  if (/\b(?:third land|two lands? already|played two lands?)\b/.test(text)) return { used: 2, allowed: 1, known: true };
  if (/\b(?:second land|a land already|one land already|already played (?:a|one) land|used (?:my|the) land play)\b/.test(text)) return { used: 1, allowed: 1, known: true };
  if (/\b(?:no lands? played|haven't played (?:a|any) lands?|have not played (?:a|any) lands?|0 of 1 land plays? used)\b/.test(text)) return { used: 0, allowed: 1, known: true };
  return { used: 0, allowed: 1, known: false };
}

function inferredLandSourceZone(text) {
  if (/\bfrom (?:my |the )?graveyard\b/.test(text)) return 'graveyard';
  if (/\bfrom (?:my |the )?library|from the top of (?:my |the )?library\b/.test(text)) return 'library';
  if (/\bfrom exile\b/.test(text)) return 'exile';
  if (/\bfrom (?:my |the )?command zone\b/.test(text)) return 'command';
  return 'hand';
}

function compileChoices(message, objects, actions, makeId, format) {
  const choices = [];
  const raw = String(message);
  const text = normalizeMagicText(message);
  const unpaid = /\b(?:do|does|did|choose|chooses|chose) not (?:to )?pay\b|\b(?:not paid|unpaid)\b|\b(?:do|does|did) not discard\b[^.!?]{0,40}\bward\b/.test(text);
  const cannotPay = /\b(?:cannot|can't|could not|couldn't) pay\b/.test(text);
  const paid = !unpaid && !cannotPay && (/\b(?:pay|pays|paid)\b/.test(text) || /\bdiscard(?:ed)? (?:a|one) card\b[^.!?]{0,40}\bward\b/.test(text));
  const wardObject = objects.find((object) => object.abilities.some((ability) => ability.keyword === 'ward'));
  if (wardObject && actions.some((action) => action.targets.some((target) => target.objectId === wardObject.id))) {
    const ward = wardObject.abilities.find((ability) => ability.keyword === 'ward');
    const mentionedCost = raw.match(/(?:pay|ward)\s*(\{[^}]+\}|\d+)/i);
    choices.push({
      id: makeId('choice'),
      type: 'CostPaymentChoice',
      reason: 'ward',
      player: actions[0]?.actor || 'player',
      sourceObjectId: wardObject.id,
      cost: ward?.cost || createManaCost(mentionedCost?.[1]?.startsWith('{') ? mentionedCost[1] : `{${mentionedCost?.[1] || ''}}`),
      status: cannotPay ? PAYMENT_STATUS.CANNOT_PAY : unpaid ? PAYMENT_STATUS.UNPAID : paid ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.UNSPECIFIED,
      paid: paid ? true : unpaid || cannotPay ? false : null
    });
  }
  const commanderDesignation = format?.commanderDesignations?.[0];
  if (commanderDesignation && /\b(?:dies?|died|graveyard|exil(?:e|ed)|hand|library|command zone)\b/.test(text)) {
    const destination = /\bexil(?:e|ed)\b/.test(text) ? 'exile'
      : /\bhand\b/.test(text) ? 'hand'
        : /\blibrary\b/.test(text) ? 'library'
          : 'graveyard';
    const command = /\b(?:choose|chose|put|move|send|return).{0,40}\bcommand zone\b/.test(text);
    const remain = new RegExp(`\\b(?:choose|chose|leave|remain|keep).{0,40}\\b${destination}\\b`).test(text);
    choices.push({
      id: makeId('choice'),
      type: 'CommanderZoneReturnChoice',
      commanderDesignationId: commanderDesignation.id,
      objectId: commanderDesignation.objectId,
      player: commanderDesignation.ownerId,
      ownerId: commanderDesignation.ownerId,
      originalDestination: destination,
      decision: command ? 'command' : remain ? 'remain' : 'unspecified'
    });
  }
  return choices;
}

function compileCommanderFormat(message, cards, objects, makeId) {
  const text = normalizeMagicText(message);
  const explicitCommanderContext = /\bcommander\b/.test(text)
    || /\b(?:has been|was) cast\b[^.!?]{0,80}\bcommand zone\b/.test(text);
  if (!explicitCommanderContext) return { id: 'ordinary', commanderDesignations: [] };
  const ordinal = text.match(/\b(?:this is|for) (?:the )?(first|second|third|fourth|fifth|sixth) time\b/);
  const ordinalCounts = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5 };
  const prior = text.match(/\b(?:cast|played) (?:(?:my |the )?commander(?:.{0,80}?)?|it) (once|twice|one|two|three|four|five|six|\d+)\b|\bcommander (?:has been|was) cast (once|twice|one|two|three|four|five|six|\d+)\b/);
  const namedPrior = text.match(/\b[a-z][a-z0-9,' -]{0,60}?\s+(?:has been|was) cast (once|twice|one|two|three|four|five|six|\d+)\s+from (?:the )?command zone\b/);
  const countToken = prior?.[1] || prior?.[2] || namedPrior?.[1] || null;
  const countWords = { once: 1, twice: 2, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  const vagueHistory = /\b(?:a bunch|several|many|some number of times)\b/.test(text);
  const inferredCount = ordinal ? ordinalCounts[ordinal[1]] : countToken ? (countWords[countToken] ?? Number(countToken)) : null;
  const commanderCastHistory = {
    known: Number.isInteger(inferredCount) && !vagueHistory,
    castsFromCommandZone: Number.isInteger(inferredCount) && !vagueHistory ? inferredCount : null,
    source: ordinal ? 'ordinal-cast-number' : countToken ? 'explicit-prior-count' : vagueHistory ? 'ambiguous-history' : 'not-stated'
  };
  const commanderDamage = compileCommanderDamageScenario(text);
  const namedCandidates = cards
    .filter((card) => isPermanentType(card) && text.includes(card.normalizedName))
    .flatMap((card) => objects.filter((object) => normalizeMagicText(object.name) === card.normalizedName));
  const commanderObject = namedCandidates[0] || objects.find((object) => object.commander) || null;
  if (!commanderObject) return { id: 'commander', commanderDesignations: [], commanderCastHistory, commanderDamage };
  commanderObject.commander = true;
  if (/\b(?:cast|casting).{0,50}\bcommander\b.{0,50}\bcommand zone\b|\bcommander\b.{0,50}\b(?:from|starts? in|begins? in) (?:my |the )?command zone\b/.test(text)) {
    commanderObject.zone = 'command';
  }
  const designationId = `commander-designation:${commanderObject.owner}:${commanderObject.id}`;
  commanderObject.commanderDesignationId = designationId;
  if (/\b(?:second|another) copy\b/.test(text) && namedCandidates.length === 1) {
    objects.push({
      ...commanderObject,
      id: makeId('object'),
      commander: false,
      commanderDesignationId: null,
      zone: 'battlefield',
      sourceKey: `${commanderObject.sourceKey}:same-name-copy`
    });
  }
  return {
    id: 'commander',
    commanderDesignations: [{
      id: designationId,
      objectId: commanderObject.id,
      ownerId: commanderObject.owner,
      startingZone: commanderObject.zone,
      castsFromCommandZone: commanderCastHistory.known ? commanderCastHistory.castsFromCommandZone : 0,
      castHistoryKnown: commanderCastHistory.known
    }],
    commanderCastHistory,
    commanderDamage
  };
}

function compileCommanderDamageScenario(text) {
  const relevant = /\bcommander(?: combat)? damage\b/.test(text)
    || (/\bcommander\b/.test(text) && /\b(?:combat damage|hits?|trample|lightning bolts?|stole|deals? damage|lose|kill)\b/.test(text));
  if (!relevant) return null;
  const recipientId = /\b(?:hit|hits|damag(?:e|ed)) me\b|\bhit me with it\b/.test(text) ? 'player' : 'opponent';
  const differentCommanders = /\b(?:my |the )?other commander\b|\bdifferent commanders?\b/.test(text);
  const vagueHistory = /\b(?:unknown|unsure|not sure|some|several|an unknown amount)\b.{0,35}\bcommander damage\b/.test(text);
  const ambiguousIdentity = /\b(?:not sure|unknown|unsure) (?:which|what) commander\b|\bwhich commander dealt\b/.test(text);
  const unsupportedReplacement = /\b(?:unsupported|unidentified|unknown) replacement\b|\breplaced in an unknown way\b/.test(text);
  const unsupportedIdentity = /\b(?:face.?down|becomes? a copy|copy of (?:a|the) commander)\b/.test(text);
  const preventionMatch = text.match(/\b(?:but )?(\d+) (?:of (?:that|it) )?(?:damage )?is prevented\b|\bprevent(?:ed|s)? (\d+)\b/);
  const prevented = Number(preventionMatch?.[1] || preventionMatch?.[2] || 0);
  const pair = text.match(/\b(?:my |the |this )?commander\b.{0,45}?\b(?:dealt|has dealt|did) (\d+)\b.{0,90}?\b(?:other commander|then|later|and)\b.{0,55}?\b(?:dealt|deals?|hits?|for)\s*(\d+)\b/);
  const priorMatch = text.match(/\b(?:my |the |this )?commander\b.{0,50}?\b(?:has |had )?(?:already )?(?:dealt|hit)\s+(\d+)\b/)
    || text.match(/\b(?:my |the |this )?commander\b.{0,50}?\b(?:has |had )?(?:already )?(?:dealt|hit)\s+[a-z0-9-]+\s+(\d+)\b/)
    || text.match(/\b(?:my |the |this )?commander\b.{0,40}?\bhas hit (?:me|him|them) for\s+(\d+)\b/)
    || text.match(/\b(?:taken|received)\s+(\d+)\s+(?:points? of )?commander damage\b/);
  const incomingMatch = text.match(/\b(?:would |will )?(?:deal|deals|hit|hits)\s+(?:me|him|her|them)\s+for\s+(\d+)\b/)
    || text.match(/\b(?:would |will )?(?:deal|deals|hit|hits)\s+(?:for\s+)?(\d+)\b/)
    || text.match(/\b(\d+)\s+(?:points? of )?(?:trample|combat|commander) damage\b/);
  const lightningBolt = /\blightning bolts?\b/.test(text);
  const explicitlyNoncombat = lightningBolt || /\bnoncombat damage\b|\bactivated ability\b|\btriggered damage\b|\bfight damage\b/.test(text);
  const lifeGainMatch = text.match(/\bgain(?:ed|s)?\s+(\d+)\s+life\b/);

  let priorPrimary = priorMatch ? Number(priorMatch[1]) : 0;
  let priorSecondary = 0;
  let incomingAmount = incomingMatch ? Number(incomingMatch[1]) : null;
  if (/\bhas hit (?:me|him|them) for\s+\d+\b/.test(text)) incomingAmount = null;
  if (pair) {
    priorPrimary = Number(pair[1]);
    if (differentCommanders) {
      priorSecondary = Number(pair[2]);
      incomingAmount = null;
    } else {
      incomingAmount = Number(pair[2]);
    }
  }
  if (/\bone more (?:point of )?(?:commander )?damage\b/.test(text)) incomingAmount = 1;
  if (lightningBolt) incomingAmount = 3;
  if (incomingAmount == null && priorPrimary === 0 && /\b(?:does|would) (?:that|it|this) count\b|\bdoes trample damage\b|\bstole my commander and hit me\b/.test(text)) incomingAmount = 1;
  const asksLoss = /\b(?:lose|loses|kill|kills|lethal|dead)\b|\bis that 21\b/.test(text);
  const missingLossHistory = asksLoss && priorMatch == null && pair == null && incomingAmount == null;

  return {
    known: !vagueHistory && !ambiguousIdentity && !missingLossHistory,
    ambiguity: ambiguousIdentity ? 'commander-designation' : vagueHistory || missingLossHistory ? 'prior-damage-total' : null,
    unsupported: unsupportedReplacement ? 'damage-replacement' : unsupportedIdentity ? 'commander-copy-or-face-down-identity' : null,
    recipientId,
    controllerId: /\b(?:opponent|they) stole my commander\b|\bopponent controls? (?:my |the )?commander\b/.test(text) ? 'opponent' : 'player',
    prior: [
      { designation: 'primary', amount: priorPrimary },
      ...(differentCommanders ? [{ designation: 'secondary', amount: priorSecondary }] : [])
    ],
    incoming: incomingAmount == null ? null : {
      designation: 'primary',
      amount: incomingAmount,
      combat: !explicitlyNoncombat,
      prevented
    },
    lifeGain: Number(lifeGainMatch?.[1] || 0),
    asksLoss,
    asksCount: /\b(?:count|how much)\b/.test(text),
    source: differentCommanders ? 'distinct-designations' : 'single-designation'
  };
}

function compileContinuousEffects(message, objects) {
  const text = normalizeMagicText(message);
  const effects = [];
  const primary = objects[0];
  const secondary = objects[1];
  if (!primary) return effects;
  const duration = /\buntil end of turn|this turn\b/.test(text) ? 'until-end-of-turn' : 'indefinite';
  const modifier = text.match(/\b(?:it|my (?:\d+\/\d+ )?creature|that creature) gets ([+-]\d+)\/([+-]\d+)/);
  if (modifier) effects.push({
    kind: 'pt', targetObjectId: primary.id, duration, sublayer: '7c',
    modification: { mode: 'modify', power: Number(modifier[1]), toughness: Number(modifier[2]) }
  });
  if (/\b(?:it|my (?:\d+\/\d+ )?creature|that creature) loses all abilities\b/.test(text)) effects.push({
    kind: 'ability', targetObjectId: primary.id, duration,
    modification: { mode: 'clear', abilities: [] }
  });
  const animation = text.match(/\b(?:it|my land|that land) becomes (?:a )?(\d+)\/(\d+) creature(?: that is still a land)?/);
  if (animation) {
    effects.push({ kind: 'type', targetObjectId: primary.id, duration, modification: { mode: text.includes('still a land') ? 'add' : 'set', types: ['creature'] } });
    effects.push({ kind: 'pt', targetObjectId: primary.id, duration, sublayer: '7b', modification: { mode: 'set', power: Number(animation[1]), toughness: Number(animation[2]) } });
  }
  const controlChange = text.match(/\b(my opponent|opponent|i|player) gains? control of\b/);
  if (controlChange) {
    const afterControl = text.slice((controlChange.index || 0) + controlChange[0].length);
    const controlled = objects
      .map((object) => ({ object, index: afterControl.indexOf(normalizeMagicText(object.name)) }))
      .filter((entry) => entry.index >= 0)
      .sort((left, right) => left.index - right.index)[0]?.object || null;
    if (controlled) effects.push({
      kind: 'control', targetObjectId: controlled.id, duration: 'indefinite',
      modification: { controller: /opponent/.test(controlChange[1]) ? 'opponent' : 'player' }
    });
  } else if (/\bmy opponent controls it now\b/.test(text)) effects.push({
    kind: 'control', targetObjectId: primary.id, duration: 'indefinite',
    modification: { controller: 'opponent' }
  });
  if (/\b(?:this|it) copies (?:that|the other) creature\b/.test(text) && secondary) effects.push({
    kind: 'copy', targetObjectId: primary.id, sourceObjectId: secondary.id, duration: 'indefinite'
  });
  const counters = text.match(/\b(?:it|my (?:\d+\/\d+ )?creature|that creature|[a-z ]+) has (a|an|one|two|three|four|five|\d+) ([+-]\d+\/[+-]\d+) counters?\b/);
  const counterTarget = objects.find((object) => normalizeMagicText(object.card?.typeLine).includes('creature')) || primary;
  if (counters && counterTarget) counterTarget.counters[counters[2]] = numberFrom(counters[1]);
  return effects;
}

function objectWithPowerToughness(objects, power, toughness, excluded = new Set()) {
  return objects.find((object) => !excluded.has(object.id) && object.power === Number(power) && object.toughness === Number(toughness)) || null;
}

function compileCombat(message, objects, cards, actions = []) {
  const text = normalizeMagicText(message);
  const intentText = [...cards]
    .sort((left, right) => right.normalizedName.length - left.normalizedName.length)
    .reduce((value, card) => value.replaceAll(card.normalizedName, ' referenced card '), text);
  if (!/\battack(?:s|ed|ing)?\b|\bblock(?:s|ed|ing)?\b/.test(intentText)) return null;
  const attackingPlayer = /\b(?:my opponent|opponent|they) attack/.test(text) ? 'opponent' : 'player';
  const defendingPlayer = attackingPlayer === 'player' ? 'opponent' : 'player';
  const used = new Set();
  const attackPt = text.match(/\b(?:i attack with|attack with|my)\s+(?:my\s+)?(\d+)\/(\d+)(?:\s+[a-z ]+?)?(?:\s+attacks?)?\b/)
    || text.match(/\b(\d+)\/(\d+)\s+(?:[a-z ]+\s+)?creature\s+attacks?\b/);
  const attackAction = actions.find((action) => action.type === 'Attack' && action.source.objectId);
  let attacker = attackAction ? objects.find((object) => object.id === attackAction.source.objectId) : null;
  attacker ||= attackPt ? objectWithPowerToughness(objects, attackPt[1], attackPt[2], used) : null;
  if (!attacker) {
    const named = cards.find((card) => new RegExp(`(?:attack(?:s|ed)? with ${escapeRegExp(card.normalizedName)}|${escapeRegExp(card.normalizedName)} attacks?)`).test(text));
    attacker = named ? objects.find((object) => normalizeMagicText(object.name) === named.normalizedName) : null;
  }
  attacker ||= objects.find((object) => object.controller === attackingPlayer && normalizeMagicText(object.card.typeLine).includes('creature')) || null;
  if (!attacker) return { status: 'unsupported', reason: 'No attacking creature could be identified safely.', attackingPlayer, defendingPlayer, attackers: [], blocks: [] };
  attacker.controller = attackingPlayer;
  attacker.owner = attacker.owner || attackingPlayer;
  attacker.summoningSick = /\b(?:just entered|summoning sick|entered this turn)\b/.test(text) && !/\bhaste\b/.test(text);
  used.add(attacker.id);

  const blockerMatches = [...text.matchAll(/\b(?:they|my opponent|opponent|their creature)?\s*blocks?(?: it| my [a-z ]+)?\s+with\s+(?:their\s+)?(?:a\s+)?(\d+)\/(\d+)/g)];
  const blockerIds = actions
    .filter((action) => action.type === 'Block' && action.source.objectId)
    .map((action) => action.source.objectId);
  for (const blockerId of blockerIds) {
    const blocker = objects.find((object) => object.id === blockerId);
    if (!blocker) continue;
    blocker.controller = defendingPlayer;
    blocker.owner = defendingPlayer;
    blocker.roles = [...new Set([...(blocker.roles || []), 'blocker'])];
    used.add(blocker.id);
  }
  for (const match of blockerMatches) {
    const blocker = objectWithPowerToughness(objects, match[1], match[2], used);
    if (!blocker) continue;
    blocker.controller = defendingPlayer;
    blocker.owner = blocker.owner || defendingPlayer;
    used.add(blocker.id);
    blockerIds.push(blocker.id);
  }
  if (blockerIds.length === 0 && /\b(?:block|blocks|blocked)\b/.test(text)) {
    const candidates = objects.filter((object) => object.id !== attacker.id && normalizeMagicText(object.card.typeLine).includes('creature'));
    const requested = text.match(/\b(two|three|four|\d+) creatures? block/);
    const count = requested ? numberFrom(requested[1]) : 1;
    for (const blocker of candidates.slice(0, count)) {
      blocker.controller = defendingPlayer;
      blocker.owner = blocker.owner || defendingPlayer;
      blockerIds.push(blocker.id);
    }
  }
  const removedBeforeDamage = /\bblocker (?:dies|is destroyed|is exiled|leaves) before (?:combat )?damage\b/.test(text);
  const blockedButUnidentified = blockerIds.length === 0 && /\b(?:block|blocks|blocked|blocking|blocker)\b/.test(text);
  return {
    status: 'compiled',
    attackingPlayer,
    defendingPlayer,
    attackers: [{ objectId: attacker.id, attackTarget: defendingPlayer }],
    blocks: blockerIds.length ? [{ attackerId: attacker.id, blockerIds, damageOrder: [] }] : [],
    blockedButUnidentified,
    removedBeforeDamage: removedBeforeDamage ? [...blockerIds] : [],
    interventionWindow: /\bafter blockers(?: are declared)?\b/.test(text) ? 'after-blockers' : null
  };
}

function playerIdForName(name) {
  if (/^(?:i|me|my|you|player|a)$/i.test(name)) return 'player';
  return String(name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function compileMultiplayer(message) {
  const countWords = { three: 3, four: 4, five: 5 };
  const countMatch = message.match(/\b(three|four|five|3|4|5)[ -]player\b/i);
  const playerCount = countMatch ? (countWords[countMatch[1].toLowerCase()] || Number(countMatch[1])) : null;
  const names = new Map([['player', { id: 'player', name: 'You', role: 'user' }]]);
  const addName = (name) => {
    const cleaned = String(name || '').replace(/[.,]/g, '').trim();
    if (!cleaned || /^(?:commander|magic|ward|instant|spell|creature|player|game|what|whose|whose|then)$/i.test(cleaned)) return;
    const id = playerIdForName(cleaned);
    if (id && id !== 'player') names.set(id, { id, name: cleaned, role: 'opponent' });
  };
  for (const match of message.matchAll(/\b([A-Z][a-z]+|[A-D])(?:'s)?\s+(?:passes|responds|casts|loses|dies|controls|has priority|is active|turn)\b/g)) addName(match[1]);
  for (const match of message.matchAll(/\b([A-Z][a-z]+|[A-D])\s+(?:owns|leaves|left)\b/g)) addName(match[1]);
  for (const match of message.matchAll(/\b(?:under|by)\s+([A-Z][a-z]+|[A-D])(?:'s)?\s+control\b/g)) addName(match[1]);
  for (const match of message.matchAll(/\b(?:attack(?:s|ing)?|target(?:s|ing)?|hits?|to)\s+([A-Z][a-z]+|[B-D])\b/g)) addName(match[1]);
  for (const match of message.matchAll(/\band\s+([A-Z][a-z]+|[B-D])\s+with\s+(?:another|one|a)\b/g)) addName(match[1]);
  const tableList = message.match(/\b(?:player Commander game|Commander game|multiplayer game|game) with\s+([^.;?]+)/i);
  if (tableList) {
    for (const token of tableList[1].split(/\s*(?:,|and)\s*/i)) addName(token);
  }
  const orderMatch = message.match(/(?:turn order is|seated clockwise(?: in(?: the)? order)?|clockwise order is)\s*([^.;?]+)/i);
  let explicitOrder = null;
  if (orderMatch) {
    const tokens = orderMatch[1].split(/\s*(?:,|->|→|then|and)\s*/i).map((token) => token.trim()).filter(Boolean);
    explicitOrder = tokens.map((token) => {
      addName(token);
      return playerIdForName(token);
    });
  }
  const unsupportedVariant = /two-headed giant|2hg|emperor|grand melee|archenemy|limited range of influence|team(?:ed)? multiplayer|shared team/i.test(message);
  const explicitPlayerLeave = /\b(?:leaves|left) the game\b/i.test(message);
  if (!playerCount && !/\bmultiplayer\b|\bfree-for-all\b/i.test(message) && !unsupportedVariant && !(explicitPlayerLeave && names.size >= 3)) return null;
  const targetCount = playerCount || Math.max(3, names.size);
  for (let index = names.size; index < targetCount; index += 1) {
    const id = `opponent-${index}`;
    names.set(id, { id, name: `Opponent ${index}`, role: 'opponent' });
  }
  const players = [...names.values()].slice(0, Math.min(5, targetCount));
  const knownIds = new Set(players.map((player) => player.id));
  const turnOrder = explicitOrder?.filter((id) => knownIds.has(id)) || players.map((player) => player.id);
  const activeMatch = message.match(/\b([A-Z][a-z]+|[A-D])(?:'s turn| is (?:the )?active player| is active)\b/i);
  const priorityMatch = message.match(/\b([A-Z][a-z]+|[A-D])\s+(?:has|gets|receives) priority\b/i);
  const activeCandidate = activeMatch ? playerIdForName(activeMatch[1]) : 'player';
  const priorityCandidate = priorityMatch ? playerIdForName(priorityMatch[1]) : null;
  const activePlayer = players.some((player) => player.id === activeCandidate) ? activeCandidate : 'player';
  const priorityHolder = players.some((player) => player.id === priorityCandidate) ? priorityCandidate : null;
  const lostPlayers = players.filter((player) => new RegExp(`\\b${player.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b\\s+(?:loses|lost|dies|died|leaves|left the game)\\b`, 'i').test(message)).map((player) => player.id);
  return {
    format: 'free-for-all',
    playerCount: players.length,
    players,
    turnOrder,
    turnOrderKnown: Boolean(explicitOrder),
    activePlayer,
    priorityHolder,
    lostPlayers,
    unsupportedVariant
  };
}

function explicitCommanderSubject(message) {
  const match = String(message || '').match(/(?:^|[.!?]\s+|\bgame\s+)([A-Z][A-Za-z0-9'-]*(?:,\s*[A-Z][A-Za-z0-9'-]+(?:\s+[A-Z][A-Za-z0-9'-]+)*)?)\s+(?:has been|was)\s+cast\b[^.!?]{0,80}\bcommand zone\b/i);
  return match?.[1]?.trim() || null;
}

function ensureVerifiedCommanderObject({ message, cards, objects, questionedAction, makeId }) {
  const text = normalizeMagicText(message);
  const strongCommandZoneDesignation = /\b(?:has been|was) cast\b[^.!?]{0,80}\bcommand zone\b/.test(text)
    || /\b(?:my|their|[a-z0-9'-]+s) commander\b/.test(text)
    || /\bcommander game\b/.test(text) && /\b(?:owns? (?:the )?commander|commander is)\b/.test(text)
    || /\bcommander damage from this\b/.test(text);
  if (!strongCommandZoneDesignation) return null;

  const subject = explicitCommanderSubject(message)
    || String(message || '').match(/\b[A-Z][a-z]+\s+owns?\s+(?:the )?commander\s+([A-Z][A-Za-z0-9,' -]{2,60}?)(?=\s+(?:but|and|is|was|has|deals?|dies|leaves)|[.?]|$)/)?.[1]?.trim()
    || String(message || '').match(/\b(?:my|their) commander\s+([A-Z][A-Za-z0-9,' -]{2,60}?)(?=\s+(?:is|was|has|deals?|dies|leaves)|[,.?]|$)/i)?.[1]?.trim()
    || questionedAction?.source?.name
    || null;
  const normalizedSubject = normalizeMagicText(subject);
  let object = objects.find((candidate) => normalizeMagicText(candidate.name) === normalizedSubject)
    || objects.find((candidate) => candidate.commander)
    || null;
  if (!object && /\bcommander damage from this\b/.test(text)) {
    const referenced = objects.filter((candidate) => {
      const name = normalizeMagicText(candidate.name);
      const shortName = name.split(/\s+/)[0];
      return text.includes(name) || shortName.length >= 4 && new RegExp(`\\b${escapeRegExp(shortName)}\\b`).test(text);
    });
    if (referenced.length === 1) object = referenced[0];
  }
  if (object) object.commander = true;
  if (object) return object;
  if (!subject) return null;

  const card = cards.find((candidate) => candidate.normalizedName === normalizedSubject)
    || normalizeMagicCard({ id: `explicit-commander:${normalizedSubject.replace(/\s+/g, '-')}`, name: subject, typeLine: 'Legendary Creature', oracleText: '' });
  object = createCardObject(card, {
    controller: 'player', role: null, mentionIndex: text.indexOf(normalizedSubject)
  }, makeId);
  object.commander = true;
  object.zone = /\bon the stack\b/.test(text) ? 'stack' : /\breturned there\b|\bfrom the command zone\b/.test(text) ? 'command' : 'battlefield';
  objects.push(object);
  return object;
}

function compileVerifiedCommanderContext({ message, cards, objects, questionedAction, verifiedState, makeId }) {
  const notes = (verifiedState?.notes || []).filter(Boolean).join('. ');
  const combinedMessage = [message, notes].filter(Boolean).join('. ');
  const normalized = normalizeMagicText(combinedMessage);
  if (/\b(?:either|one of)\b[^.!?]{0,120}\bcommander\b[^.!?]{0,120}\b(?:do not remember|don t remember|not sure|unknown)\b[^.!?]{0,40}\bwhich\b/.test(normalized)
    || /\b(?:do not remember|don t remember|not sure|unknown)\b[^.!?]{0,40}\bwhich\b[^.!?]{0,80}\bcommander\b/.test(normalized)) {
    return {
      format: {
        id: 'commander',
        commanderDesignations: [],
        commanderAmbiguity: 'designation-identity',
        commanderCastHistory: { known: false, castsFromCommandZone: null, source: 'ambiguous-designation' },
        commanderDamage: null
      },
      priorDamage: []
    };
  }
  const commanderObject = ensureVerifiedCommanderObject({ message: combinedMessage, cards, objects, questionedAction, makeId });
  const format = compileCommanderFormat(combinedMessage, cards, objects, makeId);
  if (!commanderObject || format.id !== 'commander') return { format, priorDamage: [] };

  const ownerMatch = String(message || '').match(/\b([A-Z][a-z]+)\s+owns\s+(?:(?:the )?commander\s+)?(?:[A-Z][A-Za-z0-9,' -]+|it)\b/i);
  const controllerMatch = String(message || '').match(/\b(?:but\s+)?([A-Z][a-z]+)\s+controls\s+(?:the commander\s+)?(?:[A-Z][A-Za-z0-9,' -]+|it)\b/i);
  if (ownerMatch) commanderObject.owner = playerIdForName(ownerMatch[1]);
  if (controllerMatch) commanderObject.controller = playerIdForName(controllerMatch[1]);
  const designation = format.commanderDesignations[0];
  if (designation) {
    designation.ownerId = commanderObject.owner;
    designation.id = `commander-designation:${commanderObject.owner}:${commanderObject.id}`;
    commanderObject.commanderDesignationId = designation.id;
  }

  const damage = format.commanderDamage;
  const priorDamage = damage?.known && designation
    ? (damage.prior || []).filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0).map((entry) => ({
      recipientId: damage.recipientId,
      designationId: designation.id,
      amount: entry.amount
    }))
    : [];
  return { format, priorDamage };
}

function applyVerifiedStackOwnership(message, stackItems, players) {
  const text = String(message || '');
  return stackItems.map((item) => {
    const escapedName = escapeRegExp(item.name);
    const ownerName = text.match(new RegExp(`\\b([A-Z][a-z]+)\\s+owns\\s+${escapedName}\\b`, 'i'))?.[1];
    const controllerName = text.match(new RegExp(`\\b${escapedName}\\b[^.!?]{0,50}\\bunder\\s+([A-Z][a-z]+)(?:'s)?\\s+control\\b`, 'i'))?.[1];
    const owner = ownerName ? playerIdForName(ownerName) : item.source?.owner || item.owner || item.controller;
    const controller = controllerName ? playerIdForName(controllerName) : item.controller;
    if (ownerName && !players.some((player) => player.id === owner)) players.push({ id: owner, name: ownerName, role: 'opponent', active: false });
    if (controllerName && !players.some((player) => player.id === controller)) players.push({ id: controller, name: controllerName, role: 'opponent', active: false });
    return { ...item, owner, controller, source: { ...item.source, owner, controller } };
  });
}

export function compileMagicScenario({ message = '', cards = [] } = {}) {
  const makeId = makeIdFactory();
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const explicit = compileExplicitScenario(message, normalizedCards, compileGenericObjects(message, makeId), makeId);
  const { objects, actions, events, questionedAction } = explicit;
  compileAttachmentRelationships(message, objects);
  const format = compileCommanderFormat(message, normalizedCards, objects, makeId);
  for (const action of actions) {
    if (format.commanderDesignations.some((designation) => objects.find((object) => object.id === designation.objectId)?.name === action.source.name)
      && /\bfrom (?:my |the )?command zone\b/.test(normalizeMagicText(message))) {
      action.zoneFrom = 'command';
    }
  }
  const choices = compileChoices(message, objects, actions, makeId, format);
  const continuousEffects = compileContinuousEffects(message, objects);
  const combat = compileCombat(message, objects, normalizedCards, actions);
  const multiplayer = compileMultiplayer(message);
  const text = normalizeMagicText(message);
  const step = inferredTurnStep(text);
  const phase = phaseForStep(step);
  const playerOwnedTurnWindow = /\b(?:my|your) (?:precombat |postcombat |first |second )?main(?: phase)?\b|\b(?:my|your) (?:upkeep|draw step|combat|end step)\b/.test(text);
  const opponentOwnedTurnWindow = /\b(?:my )?opponent'?s (?:precombat |postcombat |first |second )?main(?: phase)?\b|\b(?:my )?opponent'?s (?:upkeep|draw step|combat|end step)\b/.test(text);
  const opponentTurn = /\bopponent'?s turn\b|\btheir turn\b/.test(text) || opponentOwnedTurnWindow;
  const stackNonemptyPhrase = /\bstack is not empty\b|\bspell (?:is |already |is still )?on the stack\b|\b(?:is|remains?) (?:still )?on the stack\b|\bin response to\b|\brespond(?:ing)? (?:by|with)\b/.test(text);
  const unresolvedCastEvents = events.filter((event) => event.type === 'Cast' && event.status === 'unresolved'
    && !events.some((candidate) => candidate.type === 'Resolve' && candidate.index > event.index && candidate.source.cardId === event.source.cardId));
  const stackNonempty = stackNonemptyPhrase || unresolvedCastEvents.length > 0;
  const landPlayState = inferredLandPlayState(text);
  const playerHasPriority = /\b(?:(?:i|player|you) (?:have|has|hold) priority|priority is mine)\b/.test(text);
  const opponentHasPriority = /\b(?:opponent (?:has|holds) priority|priority is (?:the )?opponent'?s)\b/.test(text);
  return {
    type: 'MagicScenario',
    version: 1,
    sourceText: message,
    format,
    players: multiplayer?.players || [
      { id: 'player', role: 'user', active: !opponentTurn },
      { id: 'opponent', role: 'opponent', active: opponentTurn }
    ],
    objects,
    zones: ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack', 'command'],
    actions,
    events,
    questionedAction,
    continuousEffects,
    combat,
    choices,
    sequence: events.map((event) => event.id),
    game: {
      activePlayer: multiplayer?.activePlayer || (opponentTurn ? 'opponent' : 'player'),
      turnOrder: multiplayer?.turnOrder || ['player', 'opponent'],
      turnOrderKnown: multiplayer ? multiplayer.turnOrderKnown : true,
      multiplayer,
      phase,
      step,
      priorityHolder: multiplayer?.priorityHolder || (opponentHasPriority ? 'opponent' : playerHasPriority ? 'player' : null),
      stackEmpty: /\bstack is empty\b/i.test(message) ? true : stackNonempty ? false : null,
      landPlaysAllowed: landPlayState.allowed,
      landPlaysUsed: landPlayState.used,
      landSourceZone: inferredLandSourceZone(text),
      factsProvided: {
        turn: /\b(?:my|your|player'?s|opponent'?s|their) turn\b/i.test(message) || playerOwnedTurnWindow || opponentOwnedTurnWindow,
        phase: step != null,
        stack: /\bstack is (?:not )?empty\b/i.test(message) || stackNonempty,
        priority: playerHasPriority || opponentHasPriority,
        landAllowance: landPlayState.known
      }
    },
    resolvedCards: normalizedCards.map((card) => ({ id: card.id, name: card.name })),
    unresolved: []
  };
}

function requestedResultsForQuestion(text, verifiedState) {
  const requested = [];
  const add = (type) => {
    if (!requested.includes(type)) requested.push(type);
  };
  const asksActionPermission = /\b(?:can|may|could)\s+(?:i|we|you)\s+(?!(?:choose|move)\b)/.test(text)
    || /\b(?:am i|are we)\s+(?:allowed|able)\s+to\b/.test(text)
    || /\b(?:is|would)\b[^?]{0,160}\b(?:allowed|legal)\b/.test(text);
  const asksCastingCost = /\b(?:what|how much)\b[^?]{0,120}\b(?:cost|mana|required|addition)\b[^?]{0,120}\bcast\b/.test(text)
    || /\bcast\b[^?]{0,120}\b(?:cost|mana|required|addition)\b/.test(text);
  const combatContext = verifiedState?.phase === 'combat' || Boolean(verifiedState?.combat?.active);
  const asksRuleExplanation = /^(?:why\b|how does\b|how is\b[^?]{0,120}\b(?:assigned|determined|calculated)\b|explain\b|what rule\b|what does\b[^?]{0,120}\bchange\b)/.test(text)
    || /\bwhy (?:can|does|doesn'?t|will|won'?t)\b/.test(text);

  if (asksActionPermission) add('action-legality');
  if (asksCastingCost) add('cost-outcome');
  if (/\b(?:stack|resolve|resolves|resolution|countered?|top|lowest|above|below|in response)\b/.test(text)) add('stack-outcome');
  if (combatContext && !asksRuleExplanation) add('combat-outcome');
  if (/\b(?:replacement|instead|exile it instead|would be put)\b/.test(text)) add('replacement-outcome');
  if (/\b(?:prevent|prevention|protection from)\b/.test(text)) add('prevention-outcome');
  if (/\b(?:trigger|triggers|triggered|apnap)\b/.test(text)) add('trigger-outcome');
  if (/\b(?:continuous effect|layer|timestamp|power and toughness|power, toughness|final power|attached|equipment|aura)\b/.test(text)) add('continuous-effect-result');
  if (/\bcommander\b|\bcommand zone\b/.test(text)) add('commander-rule');
  if (/\b(?:multiplayer|three-player|four-player|five-player|each opponent|each player|leaves the game|turn order|alice|bob|carol)\b/.test(text)) add('multiplayer-outcome');
  if (asksRuleExplanation || requested.length === 0) add('rule-explanation');
  return requested;
}

function verifiedQuestionIntent(text, verifiedState) {
  const asksForRuleExplanation = /^(?:why\b|how does\b|how is\b[^?]{0,120}\b(?:assigned|determined|calculated)\b|explain\b|what rule\b|what does\b[^?]{0,120}\bchange\b)/.test(text)
    || /\bwhy (?:can|does|doesn'?t|will|won'?t)\b/.test(text);
  if (asksForRuleExplanation) return 'rules-outcome';

  const asksActionPermission = /\b(?:can|may|could)\s+(?:i|we|you)\s+(?!(?:choose|move)\b)/.test(text)
    || /\b(?:am i|are we)\s+(?:allowed|able)\s+to\b/.test(text)
    || /\b(?:is|would)\b[^?]{0,160}\b(?:allowed|legal)\b/.test(text);
  const asksCastingCost = /\b(?:what|how much)\b[^?]{0,120}\b(?:cost|mana|required|addition)\b[^?]{0,120}\bcast\b/.test(text)
    || /\bcast\b[^?]{0,120}\b(?:cost|mana|required|addition)\b/.test(text);
  const asksPostCastCostOutcome = /\bi cast\b[^?]{0,180}\b(?:cost|costs)\b[^?]{0,100}\bresolve\b/.test(text);
  if (asksActionPermission || asksCastingCost && !asksPostCastCostOutcome) return 'action-legality';
  if (verifiedState?.phase === 'combat' || verifiedState?.combat?.active) return 'combat-outcome';
  return 'rules-outcome';
}

function mentionedObjects(text, objects, sourceId) {
  const candidates = objects
    .filter((object) => object.card?.id !== sourceId)
    .map((object) => {
      const normalizedName = normalizeMagicText(object.name);
      if (text.includes(normalizedName)) return { object, score: normalizedName.length + 100 };
      const score = normalizedName
        .split(/\s+/)
        .filter((token) => token.length >= 4 && text.includes(token))
        .reduce((longest, token) => Math.max(longest, token.length), 0);
      return { object, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const bestScore = candidates[0]?.score || 0;
  return candidates.filter((entry) => entry.score === bestScore).map((entry) => entry.object);
}

function explicitPermanentCount(text, card) {
  const match = text.match(new RegExp(`\\b(one|two|three|four|five|six|\\d+)\\s+${escapeRegExp(card.normalizedName)}\\b`));
  return match ? Math.max(1, numberFrom(match[1])) : 1;
}

function questionEstablishesPermanent(text, card, questionedAction, targetDescriptor) {
  if (!isPermanentType(card)) return false;
  if (questionedAction?.source?.cardId === card.id) return questionedAction.type === 'Activate';
  if (targetDescriptor.includes(card.normalizedName)) return true;
  const name = escapeRegExp(card.normalizedName);
  const mentionIndex = text.indexOf(card.normalizedName);
  const sentenceStart = Math.max(text.lastIndexOf('.', mentionIndex), text.lastIndexOf('?', mentionIndex), text.lastIndexOf('!', mentionIndex)) + 1;
  const sentenceEndCandidates = [text.indexOf('.', mentionIndex), text.indexOf('?', mentionIndex), text.indexOf('!', mentionIndex)].filter((index) => index >= 0);
  const sentenceEnd = sentenceEndCandidates.length ? Math.min(...sentenceEndCandidates) : text.length;
  const sentence = text.slice(sentenceStart, sentenceEnd);
  const relativeMention = mentionIndex - sentenceStart;
  const zonePhrase = sentence.search(/\b(?:is|are)\s+(?:already\s+)?(?:on\s+(?:(?:my|your|their|the)\s+)?battlefield|in play)\b/);
  const explicitlyInPlay = relativeMention >= 0 && zonePhrase >= relativeMention;
  const semanticParticipation = parseOracleSemantics(card).replacementEffects.some((effect) => effect.executable)
    && new RegExp(`\\b${name}\\b[^.!?]{0,100}\\b(?:care|cares) about\\b`).test(text);
  return explicitlyInPlay
    || semanticParticipation
    || new RegExp(`\\b(?:control|controls)\\b[^.!?]{0,80}\\b${name}\\b|\\b${name}\\b[^.!?]{0,30}\\bin play\\b|\\b${name}\\b[^.!?]{0,80}\\b(?:attacks?|blocks?|damaged|undamaged|dies?|dying|enchants?|is enchanting|is enchanted|is attached to|is equipped to)\\b|\\b(?:put|puts|placed?|enchants?|enchanting|enchanted by|attached to|equipped to)\\b[^.!?]{0,80}\\b${name}\\b`).test(text);
}

function addQuestionLocalObjects({ message, cards, objects, questionedAction, targetDescriptor, makeId }) {
  const text = normalizeMagicText(message);
  for (const card of cards) {
    if (!questionEstablishesPermanent(text, card, questionedAction, targetDescriptor)) continue;
    const count = explicitPermanentCount(text, card);
    const existing = objects.filter((object) => object.card?.id === card.id || normalizeMagicText(object.name) === card.normalizedName);
    for (let index = existing.length; index < count; index += 1) {
      const mentionIndex = text.indexOf(card.normalizedName);
      const wardTarget = parseKeywordAbilities(card.oracleText).some((ability) => ability.keyword === 'ward')
        && /\bward\b/.test(text)
        && text.includes(card.normalizedName);
      objects.push(createCardObject(card, {
        controller: wardTarget ? 'opponent' : permanentController(message, card.name),
        role: null,
        mentionIndex: mentionIndex + index
      }, makeId));
    }
  }
  return objects;
}

function compileAttachmentRelationships(message, objects) {
  const text = normalizeMagicText(message);
  for (const source of objects) {
    const spec = parseOracleSemantics(source.card).attachmentSpec;
    if (!spec) continue;
    const sourceName = escapeRegExp(normalizeMagicText(source.name));
    const relation = spec.attachmentType === 'Aura'
      ? '(?:enchants?|is enchanting|is attached to)'
      : '(?:is attached to|is equipped to|equips?)';
    const forward = text.match(new RegExp(`\\b${sourceName}\\b\\s+${relation}\\s+([^.!?]+)`));
    let candidates = objects.filter((candidate) => candidate.id !== source.id
      && new RegExp(`\\b${escapeRegExp(normalizeMagicText(candidate.name))}\\b\\s+(?:is enchanted by|is equipped with|has)\\s+${sourceName}\\b`).test(text));
    if (forward) {
      const descriptor = forward[1];
      candidates = objects.filter((candidate) => candidate.id !== source.id && descriptor.includes(normalizeMagicText(candidate.name)));
      if (candidates.length === 0) {
        candidates = objects.filter((candidate) => {
          const shortName = normalizeMagicText(candidate.name).split(/\\s+/).at(-1);
          return shortName?.length >= 4 && new RegExp(`\\b${escapeRegExp(shortName)}\\b`).test(descriptor);
        });
      }
    }
    if (candidates.length === 1) source.attachedToObjectId = candidates[0].id;
  }
  return objects;
}

function verifiedTargetDescriptor(text, source) {
  const index = text.indexOf(source.normalizedName);
  if (index < 0) return '';
  const explicit = targetDescriptorAfter(text, { index, end: index + source.normalizedName.length });
  if (explicit) return explicit;
  const effectTarget = text.slice(index + source.normalizedName.length).match(/^\s+(?:destroys?|exiles?|damages?|counters?)\s+(.+?)(?=\s+(?:and|before|after|does|do|can|will|then)|[.?]|$)/)?.[1]?.trim();
  if (effectTarget) return effectTarget;
  const before = text.slice(Math.max(0, index - 140), index);
  const inverseEffectTarget = before.match(/\b((?:my|your|their|opponent(?:'?s|\s+s)?)\s+(?:[a-z0-9 -]*?\b(?:creature|permanent|attacker|blocker|bears?)))\s+(?:dies|is destroyed|is exiled|leaves)\s+(?:to|from|by)\s*$/)?.[1]?.trim();
  if (inverseEffectTarget) return inverseEffectTarget;
  return before.match(/\b((?:my|your|their|opponent(?:'?s|\s+s)?)\s+blocked\s+[a-z0-9 -]+?)(?=\s+(?:deal|hit|connect|if|when|with)|[,.;?]|$)/)?.[1]?.trim() || '';
}

function verifiedStackAction(item, cards, objects, makeId) {
  const card = cards.find((candidate) => candidate.id === item.source?.cardId || candidate.normalizedName === normalizeMagicText(item.name));
  if (!card) return null;
  const targets = (item.targets || []).map((target) => {
    const resolution = resolveVerifiedTarget({
      text: normalizeMagicText(target.descriptor || ''), descriptor: target.descriptor || '', objects,
      sourceId: card.id, targetController: null, targetRole: null
    });
    return { ...target, objectId: target.objectId || resolution.object?.id || null, candidateObjectIds: resolution.candidates.map((candidate) => candidate.id), bindingStatus: resolution.status };
  });
  return {
    id: makeId('question'), type: item.actionType === 'ActivateAbility' ? 'Activate' : 'Cast', actor: item.controller || 'player',
    source: { kind: 'card', cardId: card.id, name: card.name, objectId: null },
    zoneFrom: 'hand', zoneTo: 'stack', targets, modes: [], costs: card.manaCost ? [createManaCost(card.manaCost)] : [],
    index: -1, status: 'committed', verifiedStackItemId: item.id
  };
}

function compileVerifiedFactEvents(message, cards, objects, action, makeId) {
  const text = normalizeMagicText(message);
  const events = [];
  if (action) {
    const completedEffect = new RegExp(`\\b${escapeRegExp(normalizeMagicText(action.source.name))}\\b\\s+(?:destroys?|exiles?|damages?|counters?)\\b`).test(text);
    events.push({
      id: makeId('event'), type: action.type, actor: action.actor, source: action.source,
      targets: action.targets, index: action.index, status: action.status === 'committed' || completedEffect ? 'committed' : 'proposed'
    });
    if (action.verifiedStackItemId || completedEffect || new RegExp(`\\b${escapeRegExp(normalizeMagicText(action.source.name))}\\b\\s+resolves?\\b`).test(text)) {
      const resolveIndex = text.indexOf('resolve');
      events.push({ id: makeId('event'), type: 'Resolve', actor: null, source: action.source, targets: action.targets, index: resolveIndex >= 0 ? resolveIndex : action.index + 1, status: 'committed' });
    }
  }

  const counterFact = text.match(/\b(one|two|three|four|five|six|\d+)\s+([+\-]\d+\/[+\-]\d+|[a-z0-9+\-/]+) counters? would be put on\s+(.+?)(?=,|\?|$)/);
  if (counterFact) {
    const target = resolveVerifiedTarget({ text, descriptor: counterFact[3], objects, sourceId: null, targetController: null, targetRole: null }).object;
    if (target) events.push({ id: makeId('event'), type: 'CounterChange', actor: target.controller, objectId: target.id, counter: counterFact[2], amount: numberFrom(counterFact[1]), operation: 'add', index: counterFact.index, status: 'proposed' });
  }

  const dyingCard = cards.find((card) => isPermanentType(card) && new RegExp(`\\b${escapeRegExp(card.normalizedName.split(/\\s+/).at(-1))}\\b[^.!?]{0,50}\\b(?:dying|dies)\\b`).test(text));
  if (dyingCard) {
    const object = objects.find((candidate) => candidate.card?.id === dyingCard.id);
    if (object && !events.some((event) => event.targets?.some((target) => target.objectId === object.id))) {
      events.push({ id: makeId('event'), type: 'ZoneChange', actor: object.controller, objectId: object.id, from: 'battlefield', to: 'graveyard', index: text.indexOf(dyingCard.normalizedName), status: 'proposed' });
    }
  }
  return events.sort((left, right) => left.index - right.index);
}

function resolveVerifiedTarget({ text, descriptor, objects, sourceId, targetController, targetRole }) {
  let candidates = objects.filter((object) => object.card?.id !== sourceId);
  if (targetController) candidates = candidates.filter((object) => object.controller === targetController);
  if (targetRole) candidates = candidates.filter((object) => object.roles?.includes(targetRole));
  if (descriptor) {
    if (/\battacker\b/.test(descriptor)) candidates = candidates.filter((object) => object.roles?.includes('attacker'));
    if (/\bblocker\b/.test(descriptor)) candidates = candidates.filter((object) => object.roles?.includes('blocker'));
    candidates = candidates.filter((object) => descriptorMatches(descriptor, object));
    const normalizedDescriptor = normalizeMagicText(descriptor);
    const named = candidates.filter((object) => {
      const normalizedName = normalizeMagicText(object.name);
      if (normalizedDescriptor.includes(normalizedName)) return true;
      return normalizedName.split(/\s+/).some((token) => token.length >= 4 && new RegExp(`\\b${escapeRegExp(token)}\\b`).test(normalizedDescriptor));
    });
    if (named.length) candidates = named;
  } else {
    const mentioned = mentionedObjects(text, candidates, sourceId);
    if (mentioned.length) candidates = mentioned;
  }

  const ordinal = normalizeMagicText(descriptor).match(/\b(?:the )?(first|second|third|fourth|fifth|sixth)\b/);
  const ordinalIndex = { first: 0, second: 1, third: 2, fourth: 3, fifth: 4, sixth: 5 }[ordinal?.[1]];
  if (Number.isInteger(ordinalIndex) && candidates[ordinalIndex]) {
    return { object: candidates[ordinalIndex], candidates, status: 'resolved' };
  }
  if (/\b(?:the other|another)\b/.test(normalizeMagicText(descriptor)) && candidates.length === 2) {
    const firstName = escapeRegExp(normalizeMagicText(candidates[0].name));
    const explicitReference = text.match(new RegExp(`\\b(?:the )?(first|second)\\s+${firstName}\\b`));
    if (explicitReference) {
      const referencedIndex = explicitReference[1] === 'second' ? 1 : 0;
      return { object: candidates[referencedIndex === 0 ? 1 : 0], candidates, status: 'resolved' };
    }
  }
  if (candidates.length === 1) return { object: candidates[0], candidates, status: 'resolved' };
  return { object: null, candidates, status: candidates.length > 1 ? 'ambiguous' : 'unresolved' };
}

function asksForLandPlay(text) {
  return /\b(?:play(?:ing)?|drop(?:ping)?)\s+(?:(?:my|a|the)\s+)?land\b/.test(text)
    || /\bmake\s+(?:(?:my|a|the)\s+)?land play\b/.test(text)
    || /\b(?:my|a|the) land play\b/.test(text)
    || /\bput\s+down\s+(?:(?:my|a|the)\s+)?land\b/.test(text)
    || /\bput\s+(?:(?:my|a|the)\s+)?land\s+onto the battlefield\b/.test(text);
}

function questionedSourceScore(text, card) {
  const name = escapeRegExp(card.normalizedName);
  const explicitAction = new RegExp(`\\b(?:cast|casting|use|using|play|playing|activate|activating)\\s+(?:my |the )?${name}\\b`);
  const namedAsAction = new RegExp(`\\b(?:i|we|they)\\s+${name}\\b|\\b${name}\\s+(?:the |my |their |that )?(?:blocker|attacker|creature|permanent)\\b`);
  const meansOrResult = new RegExp(`\\b(?:with|to)\\s+${name}\\b|\\b${name}\\s+(?:kills?|destroys?|targets?|makes?|gives?|pumps?)\\b`);
  const stateContext = new RegExp(`\\b${name}\\b[^?]{0,50}\\b(?:resolves?|is (?:still )?on the stack|finishes? resolving)\\b`);
  if (explicitAction.test(text)) return 300;
  if (namedAsAction.test(text)) return 240;
  if (meansOrResult.test(text)) return 200;
  if (stateContext.test(text)) return -100;
  return text.includes(card.normalizedName) ? 10 : 0;
}

function explicitTargetController(text, source) {
  const name = escapeRegExp(source.normalizedName);
  const opponentReference = "(?:their|opponent(?:'?s|\\s+s)?)";
  const playerReference = '(?:my|your)';
  if (new RegExp(`\\b${name}\\b[^?]{0,60}\\b(?:kills?|destroys?|targets?)\\s+${opponentReference}\\b|\\b${opponentReference}\\b[^?]{0,80}\\b(?:with|to)\\s+${name}\\b`).test(text)) return 'opponent';
  if (new RegExp(`\\b${name}\\b[^?]{0,60}\\b(?:kills?|destroys?|targets?)\\s+${playerReference}\\b|\\b${playerReference}\\b[^?]{0,80}\\b(?:with|to)\\s+${name}\\b`).test(text)) return 'player';
  if (new RegExp(`\\bi\\s+(?:pump|save)\\s+[^?]{1,80}\\s+with\\s+${name}\\b`).test(text)) return 'player';
  return null;
}

function explicitTargetRole(text, source) {
  const name = escapeRegExp(source.normalizedName);
  const blocker = new RegExp(`\\b${name}\\b[^?]{0,70}\\b(?:the |their |that )?(?:blocker|blocking creature|blocking bears?|creature blocking)\\b|\\b(?:blocker|blocking creature|blocking bears?|creature blocking)\\b[^?]{0,70}\\b(?:with|to)\\s+${name}\\b`);
  const attacker = new RegExp(`\\b${name}\\b[^?]{0,70}\\b(?:the |my |that )?attacker\\b|\\battacker\\b[^?]{0,70}\\b(?:with|to)\\s+${name}\\b`);
  if (blocker.test(text)) return 'blocker';
  if (attacker.test(text)) return 'attacker';
  return null;
}

function verifiedQuestionAction(message, cards, objects, makeId) {
  const text = normalizeMagicText(message);
  if (asksForLandPlay(text)) {
    return {
      id: makeId('question'), type: 'PlayLand', actor: 'player',
      source: { kind: 'card', cardId: null, name: 'Specified Land' },
      zoneFrom: 'hand', zoneTo: 'battlefield', targets: [], modes: [], costs: [], index: text.search(/\b(?:play|put)\b/), status: 'proposed'
    };
  }

  const mentioned = cards.filter((card) => text.includes(card.normalizedName));
  const source = mentioned
    .map((card) => ({ card, score: questionedSourceScore(text, card) }))
    .filter(({ card, score }) => /\binstant|sorcery\b/.test(card.normalizedType) || score >= 300)
    .sort((left, right) => right.score - left.score)[0]?.card || null;
  if (!source) {
    const unresolved = String(message).match(/\b(?:can|may|could|when|if)?\s*i\s+(cast|activate)\s+(?:my |the )?(.+?)(?=\s+(?:again|in response|targeting|on |at |with |before|after|and |\?|$))/i);
    if (!unresolved) return null;
    const type = unresolved[1].toLowerCase() === 'activate' ? 'Activate' : 'Cast';
    const sourceName = unresolved[2].trim();
    return {
      id: makeId('question'), type, actor: 'player',
      source: { kind: 'unresolved-card-reference', cardId: null, name: sourceName },
      zoneFrom: type === 'Cast' ? 'hand' : 'battlefield', zoneTo: type === 'Cast' ? 'stack' : null,
      targets: [], modes: [], costs: [], index: unresolved.index, status: 'proposed', unresolvedIdentity: true
    };
  }
  const type = /\bactivate\b/.test(text) ? 'Activate' : 'Cast';
  const descriptor = verifiedTargetDescriptor(text, source);
  const descriptorController = descriptor
    ? /\b(?:their|opponent)\b/.test(descriptor) ? 'opponent' : /\b(?:my|your)\b/.test(descriptor) ? 'player' : null
    : null;
  const targetController = descriptorController || explicitTargetController(text, source);
  const targetRole = descriptor ? null : explicitTargetRole(text, source);
  const fallbackDescriptor = descriptor || (targetRole ? `the ${targetRole}` : '');
  const resolution = resolveVerifiedTarget({ text, descriptor: fallbackDescriptor, objects, sourceId: source.id, targetController, targetRole });
  const target = resolution.object;
  const resolvedDescriptor = fallbackDescriptor || target?.name || '';
  const targetSpec = (type === 'Activate' ? parseOracleSemantics(source).activatedAbilitiesIR : parseOracleSemantics(source).spellAbilities)
    .flatMap((ability) => ability.targets || [])[0] || null;
  const targetPlayerId = targetSpec && ['player', 'any'].includes(targetSpec.kind)
    ? /\b(?:opponent|their)\b/.test(resolvedDescriptor) ? 'opponent'
      : /\b(?:me|myself|player)\b/.test(resolvedDescriptor) ? 'player'
        : null
    : null;
  const bindingStatus = targetPlayerId ? 'resolved' : resolution.status;
  const sourceObject = type === 'Activate'
    ? objects.find((object) => object.card?.id === source.id && object.controller === 'player') || null
    : null;
  return {
    id: makeId('question'), type, actor: 'player',
    source: { kind: sourceObject ? 'object' : 'card', cardId: source.id, name: source.name, objectId: sourceObject?.id || null },
    zoneFrom: type === 'Cast' ? 'hand' : 'battlefield', zoneTo: type === 'Cast' ? 'stack' : null,
    targets: resolvedDescriptor ? [{
      type: 'TargetChoice', descriptor: resolvedDescriptor, objectId: target?.id || null, playerId: targetPlayerId,
      candidateObjectIds: resolution.candidates.map((candidate) => candidate.id), bindingStatus
    }] : [],
    modes: [], costs: source.manaCost && type === 'Cast' ? [createManaCost(source.manaCost)] : [],
    index: text.indexOf(source.normalizedName), status: 'proposed'
  };
}

function applyVerifiedQuestionFacts(message, objects) {
  const text = normalizeMagicText(message);
  const sentences = text.split(/[.!?]+/).map((sentence) => sentence.trim()).filter(Boolean);
  for (const sentence of sentences) {
    const conditional = /^(?:if|when|whenever|would)\b/.test(sentence);
    let candidates = objects.filter((object) => {
      const name = normalizeMagicText(object.name);
      if (sentence.includes(name)) return true;
      const lastWord = name.split(/\s+/).at(-1);
      return lastWord?.length >= 4 && new RegExp(`\\b${escapeRegExp(lastWord)}\\b`).test(sentence);
    });
    if (/\battacking|attacker\b/.test(sentence)) candidates = candidates.filter((object) => object.roles?.includes('attacker'));
    if (/\bblocking|blocker\b/.test(sentence) && !/\bthrough a \d+\/\d+ blocker\b/.test(sentence)) candidates = candidates.filter((object) => object.roles?.includes('blocker'));
    if (/\b(?:my|your)\b/.test(sentence)) candidates = candidates.filter((object) => object.controller === 'player');
    else if (/\b(?:their|opponent'?s?)\b/.test(sentence)) candidates = candidates.filter((object) => object.controller === 'opponent');
    if (candidates.length !== 1) continue;

    const object = candidates[0];
    const name = escapeRegExp(normalizeMagicText(object.name));
    const shortName = escapeRegExp(normalizeMagicText(object.name).split(/\s+/).at(-1));
    const alias = `(?:${name}|${shortName})`;
    const leadingPt = sentence.match(new RegExp(`\\b(\\d+)\\/(\\d+)\\b[^,;]{0,60}\\b${alias}\\b`));
    const trailingPt = sentence.match(new RegExp(`\\b${alias}\\b[^,;]{0,40}\\b(?:is|as)\\s+(?:a\\s+)?(\\d+)\\/(\\d+)\\b`));
    const pt = leadingPt || trailingPt;
    if (pt) {
      object.power = Number(pt[1]);
      object.toughness = Number(pt[2]);
    }
    const counters = sentence.match(/\b(?:has|with)\s+(one|two|three|four|five|six|\d+)\s+\+1\/\+1 counters?\b/);
    if (counters) object.counters['+1/+1'] = numberFrom(counters[1]);
    for (const ability of conditional ? [] : parseKeywordAbilities(sentence)) {
      if (!object.abilities.some((candidate) => candidate.keyword === ability.keyword)) object.abilities.push(ability);
    }
  }
  return objects;
}

function combatObjectForReference(reference, objects, role) {
  const text = normalizeMagicText(reference);
  const candidates = objects.filter((object) => object.roles?.includes(role)).filter((object) => {
    const name = normalizeMagicText(object.name);
    const shortName = name.split(/\s+/).at(-1);
    return text.includes(name) || (shortName?.length >= 4 && new RegExp(`\\b${escapeRegExp(shortName)}\\b`).test(text));
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function playerDescriptor(name) {
  const raw = String(name || '').replace(/[^a-z0-9 '-]/gi, '').trim();
  const cleaned = raw ? `${raw[0].toUpperCase()}${raw.slice(1)}` : '';
  const id = cleaned.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return id ? { id, name: cleaned, role: 'opponent', active: false, inGame: true } : null;
}

function compileVerifiedCombatRelationships(message, combatState, objects, activePlayer) {
  if (!combatState?.active) return { combat: null, players: [], leavingPlayerIds: [] };
  const text = normalizeMagicText(message);
  const attackers = combatState.attackers.map((entry) => ({ ...entry }));
  let blocks = combatState.blocks.map((entry) => ({
    ...entry,
    blockerIds: [...(entry.blockerIds || [])],
    damageOrder: [...(entry.damageOrder || [])]
  }));
  const namedPlayers = new Map();

  for (const attacker of objects.filter((object) => object.roles?.includes('attacker'))) {
    const name = normalizeMagicText(attacker.name);
    const shortName = name.split(/\s+/).at(-1);
    const attackMatch = text.match(new RegExp(`\\b(?:${escapeRegExp(name)}|${escapeRegExp(shortName)})\\b\\s+attacks?\\s+([a-z][a-z0-9'-]+)\\b`));
    if (!attackMatch) continue;
    const player = playerDescriptor(attackMatch[1]);
    if (!player) continue;
    namedPlayers.set(player.id, player);
    const declaration = attackers.find((entry) => entry.objectId === attacker.id);
    if (declaration) declaration.attackTarget = player.id;
  }

  const explicitPairs = [];
  for (const clause of text.split(/\s+(?:and|then)\s+|[.;]/)) {
    if (!/\bblocks?\b/.test(clause)) continue;
    const [blockerText, attackerText] = clause.split(/\bblocks?\b/, 2);
    const blocker = combatObjectForReference(blockerText, objects, 'blocker');
    const attacker = combatObjectForReference(attackerText, objects, 'attacker');
    if (blocker && attacker) explicitPairs.push({ attackerId: attacker.id, blockerId: blocker.id });
  }
  if (explicitPairs.length > 0) {
    blocks = [...new Set(explicitPairs.map((pair) => pair.attackerId))].map((attackerId) => ({
      attackerId,
      blockerIds: explicitPairs.filter((pair) => pair.attackerId === attackerId).map((pair) => pair.blockerId),
      damageOrder: []
    }));
  }

  for (const block of blocks) {
    const ordered = block.blockerIds.map((blockerId) => {
      const blocker = objects.find((object) => object.id === blockerId);
      if (!blocker) return null;
      const name = normalizeMagicText(blocker.name);
      const shortName = name.split(/\s+/).at(-1);
      const ordinal = text.match(new RegExp(`\\b(?:${escapeRegExp(name)}|${escapeRegExp(shortName)})\\b\\s+(?:is\\s+)?(first|second|third|fourth|fifth|sixth)\\b`))?.[1];
      const rank = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6 }[ordinal];
      return rank ? { blockerId, rank } : null;
    }).filter(Boolean).sort((left, right) => left.rank - right.rank);
    if (ordered.length === block.blockerIds.length) block.damageOrder = ordered.map((entry) => entry.blockerId);

    const attackTarget = attackers.find((entry) => entry.objectId === block.attackerId)?.attackTarget;
    if (attackTarget && namedPlayers.has(attackTarget)) {
      for (const blockerId of block.blockerIds) {
        const blocker = objects.find((object) => object.id === blockerId);
        if (blocker) blocker.controller = blocker.owner = attackTarget;
      }
    }
  }

  const leavingPlayerIds = [...namedPlayers.values()]
    .filter((player) => new RegExp(`\\b${escapeRegExp(normalizeMagicText(player.name))}\\b\\s+leaves?\\s+(?:the\\s+game\\s+)?before\\s+(?:combat\\s+)?damage`).test(text))
    .map((player) => player.id);
  const defaultDefender = attackers[0]?.attackTarget || combatState.defendingPlayer || (activePlayer === 'player' ? 'opponent' : 'player');
  const preventionMatch = text.match(/\b(?:a |one[- ]point |1[- ]point )?prevention shield prevents? (one|1)\b|\b(one|1)[- ]point prevention shield\b/);
  const preventionEffects = preventionMatch ? [{
    id: 'verified-combat-prevention-1', remaining: 1, playerId: defaultDefender,
    combatOnly: true, duration: 'this-turn'
  }] : [];
  return {
    players: [...namedPlayers.values()], leavingPlayerIds,
    combat: {
      status: 'compiled', attackingPlayer: combatState.attackingPlayer, defendingPlayer: defaultDefender,
      attackers, blocks, blockedButUnidentified: false, removedBeforeDamage: [], preventionEffects,
      leavingPlayerIds, interventionWindow: null
    }
  };
}

function sequentialVerifiedCombatActions(message, cards, objects, makeId) {
  const text = normalizeMagicText(message);
  if (!/\b(?:before|after|then|resolves?)\b/.test(text)) return [];
  const found = cards.map((card) => {
    const name = escapeRegExp(card.normalizedName);
    const actionPattern = card.normalizedName.split(/\s+/).length === 1
      ? new RegExp(`\\b${name}(?:ing|ed)?\\b`)
      : new RegExp(`\\b${name}\\b`);
    const match = actionPattern.exec(text);
    return match && /\b(?:instant|sorcery)\b/.test(card.normalizedType) ? { card, index: match.index } : null;
  }).filter(Boolean).sort((left, right) => left.index - right.index);
  if (found.length < 2) return [];
  return found.map(({ card, index }, foundIndex) => {
    const nextIndex = found[foundIndex + 1]?.index ?? text.length;
    const clause = text.slice(index, nextIndex).replace(/\s+(?:and|then)\s*$/, '').trim();
    const needsBlocker = new RegExp(`\\b${escapeRegExp(card.normalizedName)}(?:ing|ed)?\\b[^.!?]{0,50}\\b(?:the |their )?blocker\\b`).test(clause);
    const scopedClause = needsBlocker && !/\btarget(?:ing|s)?\b/.test(clause)
      ? `${card.name} targeting the blocker`
      : clause;
    const action = verifiedQuestionAction(`cast ${scopedClause}`, [card], objects, makeId);
    return action ? { ...action, index, status: 'committed' } : null;
  }).filter(Boolean);
}

function stackTargetObject(message, cards, objects, makeId) {
  const text = normalizeMagicText(message);
  const existing = objects.filter((object) => isPermanentType(object.card));
  const named = existing.filter((object) => text.includes(normalizeMagicText(object.name)));
  if (named.length === 1) return named[0];
  if (/\b(?:different|two distinct)\b/.test(text)) return null;
  const mentionedCards = cards.filter((card) => isPermanentType(card) && text.includes(card.normalizedName));
  if (mentionedCards.length !== 1) return null;
  const card = mentionedCards[0];
  const object = createCardObject(card, {
    controller: new RegExp(`\\b(?:their|opponent'?s?)\\b[^.!?]{0,40}\\b${escapeRegExp(card.normalizedName)}\\b`).test(text) ? 'opponent' : 'player',
    role: null,
    mentionIndex: text.indexOf(card.normalizedName)
  }, makeId);
  objects.push(object);
  return object;
}

function orderVerifiedStackNodes(nodes, text) {
  const edges = new Map(nodes.map((node) => [node.id, new Set()]));
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const addBelowAbove = (below, above) => {
    if (!below || !above || below.id === above.id || edges.get(below.id).has(above.id)) return;
    edges.get(below.id).add(above.id);
    indegree.set(above.id, indegree.get(above.id) + 1);
  };
  for (const left of nodes) {
    for (const right of nodes) {
      if (left.id === right.id || left.source.cardId === right.source.cardId) continue;
      const leftName = escapeRegExp(normalizeMagicText(left.source.name));
      const rightName = escapeRegExp(normalizeMagicText(right.source.name));
      if (new RegExp(`\\b${leftName}\\b[^.!?]{0,80}\\b(?:above|on top of|in response to)\\b[^.!?]{0,80}\\b${rightName}\\b`).test(text)) addBelowAbove(right, left);
      if (new RegExp(`\\b${leftName}\\b[^.!?]{0,80}\\b(?:below|underneath)\\b[^.!?]{0,80}\\b${rightName}\\b`).test(text)) addBelowAbove(left, right);
      if (new RegExp(`\\bbefore\\s+(?:that|${rightName})\\s+resolves?\\b[^.!?]{0,100}\\b${leftName}\\b`).test(text)) addBelowAbove(right, left);
      if (new RegExp(`\\b${leftName}\\b[^.!?]{0,80}\\b(?:then(?:\\s+they|\\s+i)?\\s+(?:cast|activate)|responds? with)\\b[^.!?]{0,80}\\b${rightName}\\b`).test(text)) addBelowAbove(left, right);
    }
  }
  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const ready = nodes.filter((node) => indegree.get(node.id) === 0).sort((a, b) => originalIndex.get(a.id) - originalIndex.get(b.id));
  const ordered = [];
  while (ready.length) {
    const node = ready.shift();
    ordered.push(node);
    for (const aboveId of edges.get(node.id)) {
      indegree.set(aboveId, indegree.get(aboveId) - 1);
      if (indegree.get(aboveId) === 0) {
        ready.push(nodes.find((candidate) => candidate.id === aboveId));
        ready.sort((a, b) => originalIndex.get(a.id) - originalIndex.get(b.id));
      }
    }
  }
  return ordered.length === nodes.length ? ordered : null;
}

function stackDescriptorObject(descriptor, cards, objects, makeId) {
  const normalized = normalizeMagicText(descriptor);
  if (!normalized) return null;
  const existing = objects.find((object) => normalized.includes(normalizeMagicText(object.name)) || normalizeMagicText(object.name).includes(normalized));
  if (existing) return existing;
  const card = cards.find((candidate) => normalized.includes(candidate.normalizedName) || candidate.normalizedName.includes(normalized));
  if (!card || !isPermanentType(card)) return null;
  const object = createCardObject(card, {
    controller: /\b(?:their|opponent'?s?)\b/.test(normalized) ? 'opponent' : 'player',
    role: null,
    mentionIndex: -1
  }, makeId);
  objects.push(object);
  return object;
}

function compileVerifiedStackGraph({ message, cards, objects, verifiedState, questionedAction, actions = [], makeId }) {
  const supplied = verifiedState?.stack?.items || [];
  const coordinatedResolution = supplied.length === 0 && actions.length > 1
    && /\bafter\s+(?:both|all(?:\s+(?:two|three|four|five|six))?)\s+resolve\b/i.test(message);
  const inlineResponses = supplied.length === 0 && actions.length > 1
    && (/\b(?:responds?|in response|before|on top)\b/i.test(message) || coordinatedResolution);
  if (supplied.length < 2 && !inlineResponses && !/\b(?:another|in response|on top)\b/i.test(message)) return null;
  const text = normalizeMagicText(message);
  let targetObject = stackTargetObject(message, cards, objects, makeId);
  if (!targetObject && questionedAction?.targets?.length === 1 && !/\b(?:different|two distinct)\b/.test(text)) {
    targetObject = objects.find((object) => object.id === questionedAction.targets[0].objectId) || null;
  }
  const suppliedBottomToTop = supplied.some((item) => item.order === 'top-to-bottom') ? [...supplied].reverse() : supplied;
  const nodes = suppliedBottomToTop.map((item) => {
    const card = cards.find((candidate) => candidate.id === item.source?.cardId || candidate.normalizedName === normalizeMagicText(item.name));
    return card ? {
      id: item.id,
      actionType: item.actionType === 'TriggeredAbility' ? 'Trigger' : item.actionType === 'ActivateAbility' || item.actionType === 'Activate' ? 'Activate' : 'Cast',
      source: { kind: 'card', cardId: card.id, name: card.name },
      controller: item.controller || 'player',
      targets: [],
      targetDescriptors: item.targets || [],
      position: item.position,
      supportStatus: 'compiled'
    } : null;
  }).filter(Boolean);
  if (inlineResponses) {
    nodes.push(...actions.map((action) => ({
      id: action.id || makeId('stack-node'), actionType: action.type,
      source: { ...action.source }, controller: action.actor || 'player',
      targets: [], targetDescriptors: action.targets || [],
      position: null, supportStatus: 'compiled',
      questioned: action.id === questionedAction?.id
    })));
  }

  const addAnother = questionedAction && new RegExp(`\\b(?:add|cast|activate)\\s+another\\s+${escapeRegExp(normalizeMagicText(questionedAction.source.name))}\\b|\\banother\\s+${escapeRegExp(normalizeMagicText(questionedAction.source.name))}\\s+on top\\b`).test(text);
  if (addAnother) {
    nodes.push({
      id: makeId('stack-node'), actionType: questionedAction.type, source: { ...questionedAction.source },
      controller: questionedAction.actor, targets: [], position: nodes.length + 1, supportStatus: 'compiled', questioned: true
    });
  }
  const explicitlyOrdered = orderVerifiedStackNodes(nodes, text);
  if (!explicitlyOrdered) {
    return { status: 'depends', order: 'bottom-to-top', nodes, questionedNodeId: null, reason: 'The stated stack response order is contradictory.' };
  }
  nodes.splice(0, nodes.length, ...explicitlyOrdered);

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const card = cards.find((candidate) => candidate.id === node.source.cardId);
    const semantics = parseOracleSemantics(card);
    const abilities = node.actionType === 'Activate' ? semantics.activatedAbilitiesIR
      : node.actionType === 'Trigger' ? semantics.triggeredAbilitiesIR : semantics.spellAbilities;
    const targetSpec = abilities.flatMap((ability) => ability.targets || [])[0] || null;
    if (!targetSpec?.minimum) continue;
    if (targetSpec.kind === 'spell') {
      const descriptor = normalizeMagicText(node.targetDescriptors?.[0]?.descriptor);
      const namedTarget = nodes.slice(0, index).reverse().find((candidate) => {
        const targetName = normalizeMagicText(candidate.source.name);
        return descriptor.includes(targetName)
          || new RegExp(`\\b${escapeRegExp(normalizeMagicText(node.source.name))}\\b[^.!?]{0,50}\\btargets?\\s+(?:the\\s+)?${escapeRegExp(targetName)}\\b`).test(text);
      });
      const targetNode = namedTarget || nodes[index - 1] || null;
      if (targetNode) node.targets = [{ type: 'StackObjectTarget', stackNodeId: targetNode.id, bindingStatus: 'resolved' }];
      continue;
    }
    const boundTargetId = node.targetDescriptors?.find((descriptor) => descriptor.objectId)?.objectId;
    const itemTarget = objects.find((object) => object.id === boundTargetId)
      || stackDescriptorObject(node.targetDescriptors?.[0]?.descriptor, cards, objects, makeId)
      || targetObject;
    if (itemTarget) node.targets = [{
      type: 'TargetChoice', descriptor: itemTarget.name, objectId: itemTarget.id,
      candidateObjectIds: [itemTarget.id], bindingStatus: 'resolved'
    }];
  }

  const ambiguousDistinctTargets = /\b(?:different|two distinct)\s+[a-z ]+\b/.test(text)
    && new Set(nodes.map((node) => node.source.cardId)).size < nodes.length;
  const incomplete = nodes.filter((node) => {
    const card = cards.find((candidate) => candidate.id === node.source.cardId);
    const semantics = parseOracleSemantics(card);
    const abilities = node.actionType === 'Activate' ? semantics.activatedAbilitiesIR
      : node.actionType === 'Trigger' ? semantics.triggeredAbilitiesIR : semantics.spellAbilities;
    const target = abilities.flatMap((ability) => ability.targets || [])[0];
    return target?.minimum > 0 && node.targets.length === 0;
  });
  for (let index = 0; index < nodes.length; index += 1) {
    nodes[index].position = index + 1;
    nodes[index].responseTo = index > 0 ? nodes[index - 1].id : null;
  }
  let questionedNodeId = nodes.find((node) => node.questioned)?.id || null;
  if (!questionedNodeId && questionedAction) {
    const matching = nodes.filter((node) => node.actionType === questionedAction.type && node.source.cardId === questionedAction.source.cardId);
    if (matching.length === 1) questionedNodeId = matching[0].id;
  }
  if (/\bdo i draw\b/.test(text)) {
    questionedNodeId = nodes.find((node) => {
      const card = cards.find((candidate) => candidate.id === node.source.cardId);
      return parseOracleSemantics(card).spellAbilities.some((ability) => ability.effects.some((effect) => effect.type === 'DrawEffect'));
    })?.id || questionedNodeId;
  }
  return {
    status: ambiguousDistinctTargets || incomplete.length ? 'depends' : 'compiled',
    order: 'bottom-to-top', nodes, questionedNodeId,
    reason: ambiguousDistinctTargets
      ? 'The stack objects target different permanents, but each target is not identified.'
      : incomplete.length ? `${incomplete.map((node) => node.source.name).join(', ')} needs an identified target.` : null
  };
}

function compileVerifiedApnapContext(message, verifiedState) {
  const text = normalizeMagicText(message);
  const asksTriggerOrder = /\btriggers?\b/.test(text)
    && (/\b(?:same time|simultaneous|stack first|at once)\b|\border\b.{0,35}\bstack(?:ed|ing)?\b|\bstack order\b/.test(text));
  if (!asksTriggerOrder) return null;

  if (/\b(?:on my turn|during my turn)\b/.test(text) && /\bopponent'?s triggered ability\b/.test(text)) {
    return {
      players: [
        { id: 'player', name: 'You', role: 'user', active: true },
        { id: 'opponent', name: 'Opponent', role: 'opponent', active: false }
      ],
      activePlayer: 'player', turnOrder: ['player', 'opponent'], turnOrderKnown: true,
      triggerControllers: [
        { controller: 'player', label: "Active player's trigger" },
        { controller: 'opponent', label: "Opponent's trigger" }
      ]
    };
  }

  const controllersMatch = message.match(/\bduring\s+([A-Z][a-z]+)'s turn,\s*([^.?]+?)\s+each control a trigger\b/i);
  if (!controllersMatch) return null;
  const activeName = controllersMatch[1];
  const names = controllersMatch[2]
    .split(/\s*(?:,|\band\b)\s*/i)
    .map((name) => name.trim())
    .filter(Boolean);
  const players = [...new Map(names.map((name) => {
    const id = playerIdForName(name);
    return [id, { id, name, role: 'opponent', active: name.toLowerCase() === activeName.toLowerCase() }];
  })).values()];
  const activePlayer = playerIdForName(activeName);
  if (!players.some((player) => player.id === activePlayer)) return null;
  const orderMatch = message.match(/(?:turn order is|seated clockwise(?: in(?: the)? order)?|clockwise order is)\s*([^.;?]+)/i);
  const explicitOrder = orderMatch
    ? orderMatch[1].split(/\s*(?:,|->|→|then|and)\s*/i).map(playerIdForName).filter((id) => players.some((player) => player.id === id))
    : null;
  return {
    players, activePlayer,
    turnOrder: explicitOrder?.length === players.length ? explicitOrder : players.map((player) => player.id),
    turnOrderKnown: Boolean(explicitOrder?.length === players.length),
    triggerControllers: players.map((player) => ({ controller: player.id, label: `${player.name} trigger` }))
  };
}

export function compileVerifiedMagicScenario({ message = '', cards = [], verifiedState } = {}) {
  const makeId = makeIdFactory();
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const byName = new Map(normalizedCards.map((card) => [card.normalizedName, card]));
  const objects = (verifiedState?.battlefield || []).map((descriptor) => {
    const card = byName.get(normalizeMagicText(descriptor.name)) || normalizeMagicCard(descriptor.card || { name: descriptor.name, typeLine: 'Creature' });
    return {
      id: descriptor.id || makeId('object'), kind: 'object', name: card.name, card,
      owner: descriptor.owner || descriptor.controller || 'player', controller: descriptor.controller || 'player',
      zone: descriptor.zone || 'battlefield', token: Boolean(descriptor.token), tapped: Boolean(descriptor.tapped),
      commander: Boolean(descriptor.commander), power: card.power, toughness: card.toughness, counters: descriptor.counters || {},
      abilities: parseKeywordAbilities(card.oracleText), roles: [...(descriptor.roles || [])], sourceKey: `verified:${descriptor.id || card.id}`,
      attachedToObjectId: descriptor.attachedToObjectId || descriptor.attachedTo || null
    };
  });
  const provisionalAction = verifiedQuestionAction(message, normalizedCards, objects, () => 'provisional-question');
  const provisionalSource = normalizedCards.find((card) => card.id === provisionalAction?.source?.cardId);
  const targetDescriptor = provisionalSource ? verifiedTargetDescriptor(normalizeMagicText(message), provisionalSource) : '';
  addQuestionLocalObjects({ message, cards: normalizedCards, objects, questionedAction: provisionalAction, targetDescriptor, makeId });
  const questionText = normalizeMagicText(message);
  const staticSources = normalizedCards.filter((card) => questionText.includes(card.normalizedName)
    && parseOracleSemantics(card).coverage.staticEffects?.status === 'fully-executable');
  for (const card of staticSources) {
    if (objects.some((object) => object.card?.id === card.id)) continue;
    objects.push(createCardObject(card, {
      controller: permanentController(message, card.name),
      role: null,
      mentionIndex: questionText.indexOf(card.normalizedName)
    }, makeId));
  }
  const genericCounter = questionText.match(/\b(?:a|the) creature\b[^.!?]{0,80}\b(?:has|with) (a|an|one|two|three|four|five|six|\d+) ([+-]\d+\/[+-]\d+) counters?\b/);
  if (genericCounter && !objects.some((object) => normalizeMagicText(object.card?.typeLine).includes('creature'))) {
    const name = 'Generic Creature A';
    objects.push({
      id: makeId('object'), kind: 'object', name, owner: 'player', controller: 'player', zone: 'battlefield',
      token: false, tapped: false, commander: false, power: null, toughness: null,
      counters: { [genericCounter[2]]: numberFrom(genericCounter[1]) }, abilities: [], roles: [],
      card: genericCard({ name, typeLine: 'Creature', power: null, toughness: null, abilities: [] }),
      sourceKey: `verified-generic:${name}`
    });
  }
  compileAttachmentRelationships(message, objects);
  applyVerifiedQuestionFacts(message, objects);
  let questionedAction = verifiedQuestionAction(message, normalizedCards, objects, makeId);
  const resolvingStackItem = (verifiedState?.stack?.items || []).find((item) => new RegExp(`\\b${escapeRegExp(normalizeMagicText(item.name))}\\b\\s+resolves?\\b`).test(normalizeMagicText(message)));
  if (resolvingStackItem && !questionedAction) questionedAction = verifiedStackAction(resolvingStackItem, normalizedCards, objects, makeId);
  const text = normalizeMagicText(message);
  const requestedResults = requestedResultsForQuestion(text, verifiedState);
  const questionIntent = verifiedQuestionIntent(text, verifiedState);
  const describedStackItem = (verifiedState?.stack?.items || []).find((item) => text.includes(normalizeMagicText(item.name)) && /\b(?:on the stack|before it resolves?|what happens to that stack object)\b/.test(text));
  if (describedStackItem && questionIntent === 'rules-outcome') questionedAction = verifiedStackAction(describedStackItem, normalizedCards, objects, makeId) || questionedAction;
  const combatSequence = verifiedState?.combat?.active ? sequentialVerifiedCombatActions(message, normalizedCards, objects, makeId) : [];
  if (combatSequence.length && questionedAction) {
    const scopedQuestionedAction = combatSequence.find((action) => action.type === questionedAction.type
      && action.source.cardId === questionedAction.source.cardId);
    if (scopedQuestionedAction?.targets?.length || !(questionedAction.targets || []).length) {
      questionedAction = scopedQuestionedAction || questionedAction;
    }
  }
  const actions = combatSequence.length ? combatSequence : questionedAction ? [questionedAction] : [];
  const commanderContext = compileVerifiedCommanderContext({ message, cards: normalizedCards, objects, questionedAction, verifiedState, makeId });
  const format = commanderContext.format.id === 'commander'
    ? { ...commanderContext.format, priorDamage: commanderContext.priorDamage }
    : { id: 'constructed', name: 'constructed', commanderDesignations: [] };
  const choices = compileChoices(message, objects, actions, makeId, format);
  const continuousEffects = compileContinuousEffects(message, objects);
  const events = compileVerifiedFactEvents(message, normalizedCards, objects, questionedAction, makeId);
  const activePlayer = verifiedState?.activePlayer || null;
  const relationshipCompilation = compileVerifiedCombatRelationships(message, verifiedState?.combat, objects, activePlayer);
  const combat = relationshipCompilation.combat;
  if (combat && actions.some((action) => action.type === 'Cast') && verifiedState.step === 'declare-blockers') combat.interventionWindow = 'after-blockers';
  const apnapContext = compileVerifiedApnapContext(message, verifiedState);
  const namedCombatPlayers = relationshipCompilation.players.filter((player) => !['player', 'opponent'].includes(player.id));
  const includeGenericOpponent = namedCombatPlayers.length === 0 || activePlayer === 'opponent';
  const defaultScenarioPlayers = [
    { id: 'player', role: 'user', active: activePlayer === 'player' },
    ...(includeGenericOpponent ? [{ id: 'opponent', role: 'opponent', active: activePlayer === 'opponent' }] : []),
    ...namedCombatPlayers
  ];
  const multiplayerContext = compileMultiplayer(message);
  if (multiplayerContext && commanderContext.format.commanderDesignations.length
    && /\bits owner leaves\b|\bthe commander'?s owner leaves\b/.test(text)) {
    const ownerId = commanderContext.format.commanderDesignations[0].ownerId;
    if (!multiplayerContext.lostPlayers.includes(ownerId)) multiplayerContext.lostPlayers.push(ownerId);
  }
  const scenarioPlayers = apnapContext?.players || multiplayerContext?.players || defaultScenarioPlayers;
  const scenarioActivePlayer = apnapContext?.activePlayer || activePlayer;
  for (const damage of commanderContext.priorDamage) {
    if (!scenarioPlayers.some((player) => player.id === damage.recipientId)) {
      scenarioPlayers.push({ id: damage.recipientId, name: damage.recipientId === 'opponent' ? 'Opponent' : damage.recipientId, role: 'opponent', active: false });
    }
  }
  const stackItems = applyVerifiedStackOwnership(message, (verifiedState?.stack?.items || []).map((item) => ({
    id: item.id, kind: item.kind, actionType: item.actionType, name: item.name,
    source: item.source, controller: item.controller, targets: item.targets || [],
    position: item.position, order: item.order || 'top-to-bottom', responseTo: item.responseTo || null
  })), scenarioPlayers);
  const stackGraph = compileVerifiedStackGraph({ message, cards: normalizedCards, objects, verifiedState, questionedAction, actions, makeId });
  const phase = verifiedState?.phase === 'combat' ? 'combat'
    : ['precombat-main', 'postcombat-main'].includes(verifiedState?.phase) ? 'main'
      : verifiedState?.phase || null;
  return {
    type: 'MagicScenario', version: 2, sourceText: message, verifiedState: true, questionIntent, requestedResults,
    format,
    players: scenarioPlayers,
    objects, zones: ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack', 'command'],
    actions, events, questionedAction, continuousEffects, combat, stackGraph,
    triggerContext: apnapContext ? { simultaneous: true, controllers: apnapContext.triggerControllers } : null,
    choices, sequence: events.map((event) => event.id),
    game: {
      activePlayer: scenarioActivePlayer,
      turnOrder: apnapContext?.turnOrder || multiplayerContext?.turnOrder || scenarioPlayers.map((player) => player.id),
      turnOrderKnown: apnapContext ? apnapContext.turnOrderKnown : multiplayerContext ? multiplayerContext.turnOrderKnown : true,
      multiplayer: multiplayerContext ? {
        ...multiplayerContext,
        leavingPlayerIds: multiplayerContext.lostPlayers
      } : relationshipCompilation.players.length ? {
        format: 'free-for-all', playerCount: scenarioPlayers.length,
        lostPlayers: relationshipCompilation.leavingPlayerIds,
        leavingPlayerIds: relationshipCompilation.leavingPlayerIds
      } : null,
      phase, step: verifiedState?.step || (verifiedState?.phase || null), priorityHolder: verifiedState?.priorityHolder || null,
      stackEmpty: verifiedState?.stack?.known ? verifiedState.stack.empty : null,
      stackItems,
      landPlaysAllowed: 1, landPlaysUsed: 0, landSourceZone: 'hand',
      factsProvided: {
        turn: Boolean(activePlayer), phase: Boolean(verifiedState?.phase), stack: Boolean(verifiedState?.stack?.known),
        priority: Boolean(verifiedState?.priorityKnown && verifiedState.priorityHolder), landAllowance: true
      }
    },
    resolvedCards: normalizedCards.map((card) => ({ id: card.id, name: card.name })), unresolved: []
  };
}

export function extractGenericObjects(message = '') {
  return compileMagicScenario({ message }).objects.map((object) => ({
    name: object.name,
    card: object.card,
    power: object.power,
    toughness: object.toughness,
    controller: object.controller,
    owner: object.owner,
    token: object.token,
    tapped: object.tapped,
    commander: object.commander,
    commanderDesignationId: object.commanderDesignationId,
    abilities: object.abilities,
    summoningSick: object.summoningSick
  }));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
