import { judgeMagicScenario } from './magic/magicRulesEngine.js';

export const INSTAJUDGE_GAMES = Object.freeze([
  { id: 'magic', routeKey: 'magic', label: 'Magic: The Gathering', readiness: 'verified-v1', depth: 'Magic V1 uses the deterministic Magic rules engine for supported stack, targeting, protection, damage, timing, state-based action, and Commander state checks.' },
  { id: 'pokemon', routeKey: 'pokemon', label: 'Pokémon', readiness: 'limited-v1', depth: 'Pokémon V1 supports exact card lookup, catalog legalities where present, attacks, abilities, evolution, and Special Conditions topic grounding.' },
  { id: 'yugioh', routeKey: 'yugioh', label: 'Yu-Gi-Oh!', readiness: 'limited-v1', depth: 'Yu-Gi-Oh! V1 supports exact card lookup, TCG Advanced banlist checks, and chain/spell-speed clarification.' },
  { id: 'lorcana', routeKey: 'lorcana', label: 'Disney Lorcana', readiness: 'rules-grounding-only', depth: 'Lorcana V1 can retrieve Main Phase rules topics, but returns unverified for card interaction rulings until deeper structured coverage exists.' },
  { id: 'flesh_and_blood', routeKey: 'fab', label: 'Flesh and Blood', readiness: 'rules-grounding-only', depth: 'Flesh and Blood V1 can retrieve rules topics and limited legality status, but returns unverified for most interactions.' },
  { id: 'onepiece', routeKey: 'onepiece', label: 'One Piece', readiness: 'rules-grounding-only', depth: 'One Piece V1 can retrieve rules topics, but returns unverified for card interaction rulings until deeper structured coverage exists.' },
  { id: 'starwars', routeKey: 'starwars', label: 'Star Wars Unlimited', readiness: 'rules-grounding-only', depth: 'Star Wars Unlimited V1 can retrieve rules topics, but returns unverified for card interaction rulings until deeper structured coverage exists.' }
]);

const GAME_BY_ID = new Map(INSTAJUDGE_GAMES.map((game) => [game.id, game]));
const GAME_ALIASES = Object.freeze({
  mtg: 'magic',
  magic: 'magic',
  'magic the gathering': 'magic',
  pokemon: 'pokemon',
  pkm: 'pokemon',
  yugioh: 'yugioh',
  'yu gi oh': 'yugioh',
  ygo: 'yugioh',
  lorcana: 'lorcana',
  'disney lorcana': 'lorcana',
  fab: 'flesh_and_blood',
  'flesh and blood': 'flesh_and_blood',
  onepiece: 'onepiece',
  'one piece': 'onepiece',
  swu: 'starwars',
  starwars: 'starwars',
  'star wars': 'starwars',
  'star wars unlimited': 'starwars'
});

const FORMAT_ALIASES = Object.freeze([
  ['commander', /\b(commander|edh)\b/i],
  ['standard', /\bstandard\b/i],
  ['modern', /\bmodern\b/i],
  ['pioneer', /\bpioneer\b/i],
  ['legacy', /\blegacy\b/i],
  ['vintage', /\bvintage\b/i],
  ['pauper', /\bpauper\b/i],
  ['expanded', /\bexpanded\b/i],
  ['advanced_tcg', /\b(advanced|tcg advanced|banlist|limited|forbidden|banned)\b/i],
  ['classic_constructed', /\b(classic constructed| cc )\b/i],
  ['blitz', /\bblitz\b/i],
  ['commoner', /\bcommoner\b/i],
  ['living_legend', /\b(living legend|ll)\b/i]
]);

const STOP_WORDS = new Set([
  'can', 'does', 'with', 'from', 'what', 'when', 'where', 'which', 'while', 'after', 'before',
  'target', 'targets', 'targeting', 'commander', 'standard', 'modern', 'legacy', 'vintage',
  'pokemon', 'magic', 'yugioh', 'lorcana', 'flesh', 'blood', 'one', 'piece', 'star', 'wars',
  'unlimited', 'battlefield', 'graveyard', 'exile', 'hand', 'library', 'deck', 'turn', 'chain'
]);

export function normalizeInstaJudgeGame(value) {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[!:’']/g, '')
    .replace(/&/g, 'and')
    .replace(/[\s_-]+/g, ' ');
  return GAME_ALIASES[key] || GAME_ALIASES[key.replace(/\s+/g, '')] || null;
}

export function getInstaJudgeGame(value) {
  return GAME_BY_ID.get(normalizeInstaJudgeGame(value) || value) || null;
}

export function normalizeJudgeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[']/g, "'")
    .replace(/[^a-z0-9+/'\-\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function detectLegalityFormat(message = '') {
  for (const [format, pattern] of FORMAT_ALIASES) {
    if (pattern.test(message)) return format;
  }
  return null;
}

export function isLegalityQuestion(message = '') {
  return /\b(legal|legality|banned|forbidden|limited|restricted|allowed|use this card|play this card)\b/i.test(message)
    && Boolean(detectLegalityFormat(message));
}

function pushCandidate(candidates, value) {
  const clean = String(value || '')
    .replace(/\b(can|does|if|when|then|with|from|in|target|targets|respond|cast|play|use|is|are|the|a|an)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length >= 3 && !STOP_WORDS.has(clean.toLowerCase())) candidates.add(clean);
}

export function extractPossibleCardNames(message = '') {
  const candidates = new Set();
  const text = String(message || '');

  for (const match of text.matchAll(/["']([^"']{3,80})["']/g)) {
    pushCandidate(candidates, match[1]);
  }

  for (const match of text.matchAll(/\b([A-Z][A-Za-z0-9,'\-]+(?:\s+(?:of|the|and|to|in|[A-Z][A-Za-z0-9,'\-]+)){0,5})\b/g)) {
    pushCandidate(candidates, match[1]);
  }

  return [...candidates]
    .filter((candidate) => candidate.split(/\s+/).some((word) => !STOP_WORDS.has(word.toLowerCase())))
    .slice(0, 6);
}

function ruleToken(topic = {}) {
  return [
    topic.title,
    topic.summary,
    ...(topic.aliases || []),
    ...(topic.searchTerms || []),
    ...(topic.officialTerms || []),
    ...(topic.relatedMechanics || []),
    ...(topic.relatedCardTypes || [])
  ].join(' ').toLowerCase();
}

export function rankRulesForScenario(gameId, message, topics = []) {
  const text = normalizeJudgeText(message);
  const weightedTerms = [
    ['priority', /priority|respond|response|instant|activate|before resolves/.test(text)],
    ['stack', /stack|counter|counterspell|respond|resolve|spell/.test(text)],
    ['targets', /target|targets|targeting/.test(text)],
    ['protection', /protection|gods willing|illegal target|black|white|blue|red|green/.test(text)],
    ['combat', /combat|attack|attacks|block|damage/.test(text)],
    ['state-based actions', /state based|lethal|dies|destroy|0 or less toughness/.test(text)],
    ['replacement', /replacement|instead|prevent|would/.test(text)],
    ['triggered abilities', /trigger|when|whenever|at the beginning/.test(text)],
    ['special conditions', /asleep|poisoned|burned|paralyzed|confused|special condition/.test(text)],
    ['abilities', /ability|abilities|trigger|activated/.test(text)],
    ['chains', /chain|spell speed|respond/.test(text)],
    ['banlist', /banlist|forbidden|limited|banned/.test(text)],
    ['commander', /commander|edh|color identity/.test(text)],
    ['formats', /legal|format|standard|modern|advanced|constructed|commander/.test(text)]
  ].filter(([, enabled]) => enabled).map(([term]) => term);

  return topics
    .map((topic) => {
      const haystack = ruleToken(topic);
      const score = weightedTerms.reduce((sum, term) => sum + (haystack.includes(term) ? 4 : 0), 0)
        + text.split(' ').reduce((sum, term) => term.length > 4 && haystack.includes(term) ? sum + 1 : sum, 0);
      return { topic, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map((entry) => entry.topic);
}

export function buildUnsupportedResult({ game, cards = [], rules = [], latencyMs = 0 }) {
  const missing = cards.length === 0 ? 'a resolved card identity or a supported rules pattern' : 'a supported rules pattern for this interaction';
  return {
    game: game?.id || null,
    verdict: 'unverified',
    answer: `I can't verify that ruling from the current rules data. I need ${missing} before I can give a grounded answer.`,
    cards,
    rules,
    clarificationNeeded: 'Please include the exact card names and the missing game state, such as current zone, target, turn, or format.',
    sourceVersion: rules[0]?.sourceMeta?.rulesVersion || game?.sourceRefs?.[0]?.freshness || null,
    latencyMs
  };
}

export function buildLegalityRuling({ game, card, legality, rules = [], latencyMs = 0 }) {
  if (!legality || legality.status === 'unknown') {
    return {
      game: game.id,
      verdict: 'unverified',
      answer: `I can't verify ${card.name} in ${legality?.format || 'that format'} from the current legality data.`,
      cards: [card],
      rules,
      legality,
      clarificationNeeded: legality?.reason || 'Try a supported format or provide the exact card identity.',
      sourceVersion: legality?.sourceVersion || rules[0]?.sourceMeta?.rulesVersion || null,
      latencyMs
    };
  }

  const allowed = ['legal', 'restricted', 'limited', 'semi_limited'].includes(legality.status);
  const verdict = allowed ? 'yes' : 'no';
  const statusText = legality.status.replace(/_/g, ' ');
  return {
    game: game.id,
    verdict,
    answer: `${verdict.toUpperCase()}\n${card.name} is ${statusText} in ${legality.format.replace(/_/g, ' ')} according to the current canonical legality owner.`,
    cards: [card],
    rules,
    legality,
    sourceVersion: legality.sourceVersion || legality.lastVerified || rules[0]?.sourceMeta?.rulesVersion || null,
    latencyMs
  };
}

export function buildRulesRuling({ game, message, cards = [], rules = [], latencyMs = 0 }) {
  const text = normalizeJudgeText(message);

  if (game.id === 'magic') {
    return judgeMagicScenario({ message, cards, rules, latencyMs });
  }

  if (game.id === 'pokemon' && /\basleep|special condition|attack|attacks\b/.test(text)) {
    if (/\basleep\b/.test(text) && /\battack|attacks\b/.test(text)) {
      return {
        game: game.id,
        verdict: 'no',
        answer: "NO\nAn Asleep Pokemon can't attack while that Special Condition remains. Resolve the condition according to the Pokemon rules before checking attacks again.",
        cards,
        rules,
        sourceVersion: rules[0]?.sourceMeta?.rulesVersion || null,
        latencyMs
      };
    }
    return {
      game: game.id,
      verdict: 'depends',
      answer: 'DEPENDS\nPokemon attacks and abilities depend on the current Active Pokemon, Energy, status, and exact card text.',
      cards,
      rules,
      clarificationNeeded: 'Tell me the Active Pokemon, Special Conditions, attached Energy, and the exact attack or Ability.',
      sourceVersion: rules[0]?.sourceMeta?.rulesVersion || null,
      latencyMs
    };
  }

  if (game.id === 'yugioh' && /\bchain|spell speed|respond|activate\b/.test(text)) {
    return {
      game: game.id,
      verdict: 'depends',
      answer: 'DEPENDS\nYu-Gi-Oh! chain answers depend on spell speed, activation timing, and whether the effect can legally respond to the previous Chain Link.',
      cards,
      rules,
      clarificationNeeded: 'Give the exact cards/effects, current Chain Link, and whether each effect is Spell Speed 1, 2, or 3.',
      sourceVersion: rules[0]?.sourceMeta?.rulesVersion || null,
      latencyMs
    };
  }

  return buildUnsupportedResult({ game, cards, rules, latencyMs });
}
