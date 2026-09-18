import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildRulesRuling,
  buildUnsupportedResult,
  detectLegalityFormat,
  extractPossibleCardNames,
  INSTAJUDGE_GAMES,
  isLegalityQuestion,
  rankRulesForScenario
} from '../src/services/instajudge/instajudgeCore.js';
import { ENCYCLOPEDIA_RULE_TOPICS } from '../src/services/knowledge/encyclopediaData.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = read('src/App.jsx');
const layout = read('src/Layout.jsx');
const mobileHeader = read('src/components/mobile/MobileHeader.jsx');
const encyclopedia = read('src/pages/Encyclopedia.jsx');
const page = read('src/pages/InstaJudge.jsx');
const owner = read('src/services/instajudge/instajudgeOwner.js');

assert(app.includes('InstaJudge') && app.includes('path="/InstaJudge"'), 'InstaJudge route must exist in App.');
assert(layout.includes("label: 'InstaJudge'") && layout.indexOf("label: 'InstaJudge'") > layout.indexOf("label: 'TCG Encyclopedia'"), 'Desktop nav must include InstaJudge after TCG Encyclopedia.');
assert(mobileHeader.includes("goTo('/InstaJudge')"), 'Mobile menu must expose InstaJudge.');
const hubChoicesSource = encyclopedia.slice(
  encyclopedia.indexOf('const HUB_CHOICES'),
  encyclopedia.indexOf('const HUB_TITLE_BY_GAME')
);
assert(hubChoicesSource.includes('Sets & Cards') && hubChoicesSource.includes('Game Rules'), 'Public Encyclopedia game hubs must expose Sets & Cards and Game Rules.');
assert(!hubChoicesSource.includes('Learn to Play'), 'Public Encyclopedia game hubs must not expose Learn to Play.');
assert(app.includes('/Encyclopedia/:game/learn/:topicSlug'), 'Learn to Play routes must remain available directly.');
assert(page.includes('Hi, I’m MPM InstaJudge. What TCG do you need help with?'), 'InstaJudge must render the required first assistant message.');
assert(page.includes('Got it —') && page.includes('Describe what’s happening in the game'), 'InstaJudge must render the required game-selected prompt.');
assert(page.includes('In sanctioned events, the event judge has final authority.'), 'Event judge boundary note is missing.');

for (const requiredOwner of ['searchOwner', 'gameKnowledgeOwner', 'legalityOwner']) {
  assert(owner.includes(requiredOwner), `InstaJudge owner must use ${requiredOwner}.`);
}
assert(owner.includes('legalityOwner.check'), 'Legality questions must delegate to Legality Owner.');
assert(owner.includes('searchOwner.searchPreviewByGame'), 'Card resolution must delegate to Search Owner.');
assert(owner.includes('gameKnowledgeOwner.getRulesTopicsByCategory'), 'Rules retrieval must delegate to Knowledge Owner.');
assert(!owner.includes('fetch('), 'InstaJudge owner must not fetch ad hoc card/rules data.');
assert(!owner.includes('OPENAI_API_KEY') && !owner.includes('SUPABASE_SERVICE_ROLE'), 'InstaJudge must not expose privileged credentials.');

assert(INSTAJUDGE_GAMES.length === 7, 'InstaJudge must cover all seven supported TCGs.');
assert(INSTAJUDGE_GAMES.some((game) => game.id === 'magic' && game.readiness === 'verified-v1'), 'Magic readiness must be reported.');
assert(INSTAJUDGE_GAMES.some((game) => game.id === 'pokemon' && game.label === 'Pokémon'), 'Pokemon selector must use the public Pokémon label.');
assert(INSTAJUDGE_GAMES.some((game) => game.id === 'lorcana' && game.readiness === 'rules-grounding-only'), 'Limited games must fail closed instead of claiming full support.');

const magicRules = rankRulesForScenario('magic', 'Can I respond with Counterspell while a spell is on the stack?', ENCYCLOPEDIA_RULE_TOPICS.magic.filter((topic) => topic.category === 'reference'));
const magicStack = buildRulesRuling({
  game: { id: 'magic' },
  message: 'Can I respond with Counterspell while a spell is on the stack?',
  cards: [{ name: 'Counterspell', oracleText: 'Counter target spell.' }],
  rules: magicRules
});
assert(magicStack.verdict === 'unverified', 'Priority/response execution must fail closed until the stack phase is certified.');
assert(magicStack.diagnosticTrace.some((entry) => entry.type === 'ScenarioCompiled'), 'Unsupported Magic scenarios must retain the compiled scenario diagnostic.');

const murderTarget = buildRulesRuling({
  game: { id: 'magic' },
  message: 'Can Murder target Serra Angel?',
  cards: [
    { name: 'Murder', oracleText: 'Destroy target creature.', typeLine: 'Instant', manaCost: '{1}{B}{B}' },
    { name: 'Serra Angel', typeLine: 'Creature - Angel', power: 4, toughness: 4 }
  ],
  rules: magicRules
});
assert(murderTarget.verdict === 'yes' && murderTarget.engine === 'magic-rules-runtime-v2', 'Magic targeting test should use the authoritative Magic rules runtime.');
assert(murderTarget.rules.length > 0, 'Magic targeting test must include rule references.');

const protectionRegression = buildRulesRuling({
  game: { id: 'magic' },
  message: 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Murder destroy Serra Angel?',
  cards: [
    { name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', manaCost: '{3}{W}{W}', colors: ['W'], power: 4, toughness: 4 },
    { name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}', colors: ['B'] },
    { name: 'Gods Willing', typeLine: 'Instant', oracleText: 'Target creature you control gains protection from the color of your choice until end of turn. Scry 1.', manaCost: '{W}', colors: ['W'] }
  ],
  rules: magicRules
});
assert(protectionRegression.verdict === 'no', 'Mandatory Gods Willing / Murder regression must return NO.');
assert(/protection from black/i.test(protectionRegression.answer) && /no legal targets/i.test(protectionRegression.answer), 'Protection regression must explain target recheck on resolution.');

const pokemonRules = rankRulesForScenario('pokemon', 'Can Pikachu attack while Asleep?', ENCYCLOPEDIA_RULE_TOPICS.pokemon);
const pokemonAsleep = buildRulesRuling({
  game: { id: 'pokemon' },
  message: 'Can Pikachu attack while Asleep?',
  cards: [{ name: 'Pikachu' }],
  rules: pokemonRules
});
assert(pokemonAsleep.verdict === 'no', 'Pokemon Asleep attack check should produce NO.');
assert(pokemonAsleep.rules.length > 0, 'Pokemon ruling must include rule references.');

const yugiohRules = rankRulesForScenario('yugioh', 'Can I chain this effect?', ENCYCLOPEDIA_RULE_TOPICS.yugioh);
const yugiohChain = buildRulesRuling({
  game: { id: 'yugioh' },
  message: 'Can I chain this effect?',
  cards: [],
  rules: yugiohRules
});
assert(yugiohChain.verdict === 'depends' && yugiohChain.clarificationNeeded, 'Yu-Gi-Oh! chain test should ask for missing chain state.');
assert(yugiohChain.rules.length > 0, 'Yu-Gi-Oh! chain answer must include rule references.');

const unsupported = buildUnsupportedResult({ game: { id: 'starwars', sourceRefs: [] }, cards: [], rules: [], latencyMs: 1 });
assert(unsupported.verdict === 'unverified', 'Missing coverage must fail closed as unverified.');
assert(!/^YES|^NO/i.test(unsupported.answer), 'Missing coverage must not produce confident YES/NO.');

const extracted = extractPossibleCardNames('Can "Black Lotus" be used in Commander with "Sol Ring"?');
assert(extracted.includes('Black Lotus') && extracted.includes('Sol Ring'), 'Card-name extraction must preserve quoted card names.');
const responseCards = extractPossibleCardNames('I have priority. Can I cast Divination in response to Lightning Bolt?');
assert(responseCards.includes('Divination') && responseCards.includes('Lightning Bolt'), 'Card-name extraction must separate both cards in an in-response-to timing question.');
assert(isLegalityQuestion('Is Black Lotus legal in Commander?'), 'Legality classifier must detect Commander legality questions.');
assert(detectLegalityFormat('Is Pot of Greed limited in Advanced?') === 'advanced_tcg', 'Legality classifier must detect Yu-Gi-Oh! Advanced format.');

console.log('InstaJudge verifier passed.');
console.log('- Magic priority/response without executable stack state: UNVERIFIED');
console.log('- Magic targeting: YES with resolved card text');
console.log('- Pokemon Asleep attack: NO with rules');
console.log('- Yu-Gi-Oh! chain: DEPENDS with missing state');
console.log('- Unsupported coverage: UNVERIFIED');
