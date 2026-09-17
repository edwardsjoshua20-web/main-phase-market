import { isInstant, isPermanentType, isSorcery, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';
import { PAYMENT_STATUS, createDiscardCost, createLifeCost, createManaCost, createSacrificeCost } from './costSystem.js';

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
  return /\b(opponent|opponent's|their)\b/.test(normalizeMagicText(text)) ? 'opponent' : 'player';
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
  return KEYWORDS.filter((keyword) => normalized.includes(keyword)).map((keyword) => {
    const ability = { type: 'KeywordAbility', keyword };
    if (keyword === 'ward') {
      const cost = parseWardCost(text);
      if (cost) ability.cost = cost;
    }
    return ability;
  });
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

  for (const match of normalized.matchAll(/\b(one|two|three|four|five|six|\d+)\s+(\d+)\/(\d+)\s+creature tokens?\b/g)) {
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

  const descriptorPattern = /\b(?:(my opponent's|opponent's|their|my own|my|your|i control|opponent controls|player controls)\s+)?(?:(one|two|three|four|five|six|\d+|a|an)\s+)?(?:(\d+)\/(\d+)\s+)?((?:tapped\s+)?(?:legendary\s+)?(?:artifact\s+)?(?:commander|creature)(?:\s+tokens?)?(?:\s+(?:that has|has|with)\s+(?:double strike|first strike|deathtouch|indestructible|vigilance|hexproof|shroud|flying|reach|trample|lifelink|menace|haste|defender|flash|ward(?:\s+\d+)?)(?:\s+and\s+(?:[a-z ]+))?)?)(?=\s+(?:for|and|gains?|gets?|is|are|from|target|targeting|can|in response|i cast|\. |\?|$)|$)/g;
  for (const match of normalized.matchAll(descriptorPattern)) {
    if (objects.some((entry) => entry.sourceKey.startsWith(`${match.index}:`))) continue;
    const descriptor = match[0];
    const before = normalized.slice(Math.max(0, match.index - 32), match.index);
    if (!match[3] && /\btarget(?:ing|s)?\s+$/.test(before) && /\b(my own|that|the)\b/.test(descriptor)) continue;
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

function actionTypeBefore(message, cardName) {
  const text = normalizeMagicText(message);
  const index = text.indexOf(normalizeMagicText(cardName));
  const before = text.slice(Math.max(0, index - 50), index);
  if (/\bactivate|activates|activated\b/.test(before)) return 'Activate';
  if (/\battack|attacks|attacked\b/.test(before)) return 'Attack';
  return 'Cast';
}

function actorBefore(message, cardName) {
  const text = normalizeMagicText(message);
  const index = text.indexOf(normalizeMagicText(cardName));
  const before = text.slice(Math.max(0, index - 90), index);
  if (/\b(?:i|player|you)\s+(?:cast|casts|activate|activates)\s*$/.test(before)) return 'player';
  if (/\bopponent\s+(?:cast|casts|activate|activates)\s*$/.test(before)) return 'opponent';
  return /\bopponent\b/.test(before) ? 'opponent' : 'player';
}

function permanentController(message, cardName) {
  const text = normalizeMagicText(message);
  const name = normalizeMagicText(cardName);
  if (new RegExp(`\\b(?:opponent controls|opponent has|opponent's)\\s+(?:a |an |the )?${escapeRegExp(name)}\\b`).test(text)) return 'opponent';
  if (new RegExp(`\\b(?:i control|i have|player controls|you control|my)\\s+(?:a |an |the )?${escapeRegExp(name)}\\b`).test(text)) return 'player';
  return 'player';
}

function targetDescriptor(message, cardName) {
  const text = normalizeMagicText(message);
  const index = text.indexOf(normalizeMagicText(cardName));
  if (index < 0) return '';
  const windowText = text.slice(index, index + 260);
  const match = windowText.match(/\btarget(?:ing|s)?\s+(.+?)(?=\s+(?:and (?:do|does|did|pay|respond)|in response|before|after|what|when|then)|[.?]|$)/);
  return match?.[1]?.trim() || '';
}

function descriptorMatches(descriptor, object) {
  const text = normalizeMagicText(descriptor);
  if (/\bopponent|their\b/.test(text) && object.controller !== 'opponent') return false;
  if (/\bmy|own\b/.test(text) && object.controller !== 'player') return false;
  if (/\bcreature\b/.test(text) && !normalizeMagicText(object.card.typeLine).includes('creature')) return false;
  const pt = text.match(/\b(\d+)\/(\d+)\b/);
  if (pt && (object.power !== Number(pt[1]) || object.toughness !== Number(pt[2]))) return false;
  for (const ability of parseKeywordAbilities(text)) {
    if (!object.abilities.some((candidate) => candidate.keyword === ability.keyword)) return false;
  }
  return true;
}

function compileActions(message, cards, objects, makeId) {
  const text = normalizeMagicText(message);
  return cards
    .map(normalizeMagicCard)
    .map((card) => ({ card, index: text.indexOf(card.normalizedName) }))
    .filter(({ card, index }) => index >= 0 && (isInstant(card) || isSorcery(card) || /\bactivate/.test(text)))
    .sort((left, right) => left.index - right.index)
    .map(({ card }) => {
      const descriptor = targetDescriptor(message, card.name);
      const target = descriptor ? objects.find((object) => descriptorMatches(descriptor, object)) || null : null;
      return {
        id: makeId('action'),
        type: actionTypeBefore(message, card.name),
        actor: actorBefore(message, card.name),
        source: { kind: 'card', cardId: card.id, name: card.name },
        zoneFrom: 'hand',
        zoneTo: 'stack',
        targets: descriptor ? [{ type: 'TargetChoice', descriptor, objectId: target?.id || null }] : [],
        modes: [],
        costs: card.manaCost ? [createManaCost(card.manaCost)] : [],
        index: text.indexOf(card.normalizedName)
      };
    });
}

function compileChoices(message, objects, actions, makeId) {
  const choices = [];
  const raw = String(message);
  const text = normalizeMagicText(message);
  const unpaid = /\b(?:do|does|did|choose|chooses|chose) not (?:to )?pay\b|\b(?:not paid|unpaid)\b/.test(text);
  const cannotPay = /\b(?:cannot|can't|could not|couldn't) pay\b/.test(text);
  const paid = !unpaid && !cannotPay && /\b(?:pay|pays|paid)\b/.test(text);
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
  return choices;
}

export function compileMagicScenario({ message = '', cards = [] } = {}) {
  const makeId = makeIdFactory();
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const objects = compileGenericObjects(message, makeId);

  for (const card of normalizedCards) {
    if (!isPermanentType(card) || !normalizeMagicText(message).includes(card.normalizedName)) continue;
    const controller = permanentController(message, card.name);
    objects.push({
      id: makeId('object'),
      kind: 'object',
      name: card.name,
      card,
      owner: controller,
      controller,
      zone: 'battlefield',
      token: false,
      tapped: false,
      commander: /\bcommander\b/.test(normalizeMagicText(message)),
      power: card.power,
      toughness: card.toughness,
      counters: {},
      abilities: parseKeywordAbilities(card.oracleText),
      sourceKey: `card:${card.id}`
    });
  }

  const actions = compileActions(message, normalizedCards, objects, makeId);
  const choices = compileChoices(message, objects, actions, makeId);
  return {
    type: 'MagicScenario',
    version: 1,
    sourceText: message,
    players: [
      { id: 'player', role: 'user', active: !/opponent.?s turn/i.test(message) },
      { id: 'opponent', role: 'opponent', active: /opponent.?s turn/i.test(message) }
    ],
    objects,
    zones: ['battlefield', 'hand', 'graveyard', 'exile', 'library', 'stack', 'command'],
    actions,
    choices,
    sequence: [...actions].sort((left, right) => left.index - right.index).map((action) => action.id),
    game: {
      activePlayer: /opponent.?s turn/i.test(message) ? 'opponent' : 'player',
      phase: /combat/i.test(message) ? 'combat' : /end step/i.test(message) ? 'ending' : 'main',
      step: /cleanup/i.test(message) ? 'cleanup' : null,
      priorityHolder: /\bopponent has priority\b/i.test(message) ? 'opponent' : /\b(?:i|player|you) (?:have|has) priority\b/i.test(message) ? 'player' : null,
      stackEmpty: /\bstack is empty\b/i.test(message) ? true : /\bstack is not empty\b|\bspell on the stack\b/i.test(message) ? false : null,
      factsProvided: {
        turn: /\b(?:my|your|player's|opponent's) turn\b/i.test(message),
        phase: /\b(?:precombat |postcombat )?main phase\b|\bcombat\b|\bend step\b|\bcleanup\b/i.test(message),
        stack: /\bstack is (?:not )?empty\b|\bspell on the stack\b/i.test(message),
        priority: /\b(?:i|player|you|opponent) (?:have|has) priority\b/i.test(message)
      }
    },
    resolvedCards: normalizedCards.map((card) => ({ id: card.id, name: card.name })),
    unresolved: []
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
    abilities: object.abilities
  }));
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
