import { createInstaJudgeOwner } from '../src/services/instajudge/instajudgeOwner.js';
import { compileVerifiedMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';

const catalog = [
  { id: 'dreadmaw', name: 'Colossal Dreadmaw', typeLine: 'Creature - Dinosaur', oracleText: 'Trample', manaCost: '{4}{G}{G}', power: 6, toughness: 6 },
  { id: 'bears', name: 'Grizzly Bears', typeLine: 'Creature - Bear', oracleText: '', manaCost: '{1}{G}', power: 2, toughness: 2 },
  { id: 'murder', name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}' },
  { id: 'growth', name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.', manaCost: '{G}' },
  { id: 'divination', name: 'Divination', typeLine: 'Sorcery', oracleText: 'Draw two cards.', manaCost: '{2}{U}' },
  { id: 'bolt', name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.', manaCost: '{R}' },
  { id: 'rats', name: 'Typhoid Rats', typeLine: 'Creature - Rat', oracleText: 'Deathtouch', manaCost: '{B}', power: 1, toughness: 1 },
  { id: 'white-knight', name: 'White Knight', typeLine: 'Creature - Human Knight', oracleText: 'First strike, protection from black', manaCost: '{W}{W}', power: 2, toughness: 2 },
  { id: 'atraxa', name: 'Atraxa, Praetors Voice', typeLine: 'Legendary Creature - Phyrexian Angel Horror', oracleText: 'Flying, vigilance, deathtouch, lifelink', manaCost: '{G}{W}{U}{B}', power: 4, toughness: 4 },
  { id: 'warden', name: 'Soul Warden', typeLine: 'Creature - Human Cleric', oracleText: 'Whenever another creature enters the battlefield, you gain 1 life.', manaCost: '{W}', power: 1, toughness: 1 },
  { id: 'wrath', name: 'Wrath of God', typeLine: 'Sorcery', oracleText: 'Destroy all creatures. They cannot be regenerated.', manaCost: '{2}{W}{W}' },
  { id: 'rest', name: 'Rest in Peace', typeLine: 'Enchantment', oracleText: 'If a card or token would be put into a graveyard from anywhere, exile it instead.', manaCost: '{1}{W}' }
];

const owner = createInstaJudgeOwner({
  searchOwner: {
    async searchPreviewByGame(query) {
      const key = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
      return catalog.filter((card) => card.name.toLowerCase().replace(/[^a-z0-9]+/g, '') === key)
        .map((card) => ({ ...card, game: 'magic', oracle_id: card.id, type_line: card.typeLine, oracle_text: card.oracleText, mana_cost: card.manaCost }));
    }
  },
  gameKnowledgeOwner: { getRulesTopicsByCategory() { return []; }, searchRulesTopics() { return []; } },
  legalityOwner: { check() { throw new Error('Legality is outside these holdouts.'); } }
});

const setup = {
  main: ["It's my turn, precombat main, I have priority and the stack is empty."],
  opponentMain: ["It's my opponent's turn, precombat main, I have priority and the stack is empty."],
  stackDivination: ['Mine', 'Precombat Main', 'Me', 'Not empty', 'Divination', 'No response'],
  stackBolt: ['Mine', 'Precombat Main', 'Me', 'Not empty', 'Lightning Bolt', 'No response'],
  bearsBlocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Grizzly Bears', "Opponent's Grizzly Bears"],
  dreadmawBlocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Colossal Dreadmaw', "Opponent's Grizzly Bears"],
  bearsUnblocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Grizzly Bears', 'none'],
  unknownPriority: ['Mine', 'Combat', 'After blockers', 'Not sure', 'Empty', 'My Colossal Dreadmaw', "Opponent's Grizzly Bears"],
  duplicateBears: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Colossal Dreadmaw', 'two opponent Grizzly Bears'],
  multipleAttackersBlocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Colossal Dreadmaw and my Grizzly Bears', "Opponent's Grizzly Bears"],
  bearsBlockedByDreadmaw: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Grizzly Bears', "Opponent's Colossal Dreadmaw"],
  whiteKnightBlocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My White Knight', "Opponent's Typhoid Rats"],
  atraxaUnblocked: ['Mine', 'Combat', 'After blockers', 'Me', 'Empty', 'My Atraxa, Praetors Voice', 'none']
};

const cases = [
  { name: 'blocked-status direct', setup: 'bearsBlocked', question: 'If Murder removes their blocker, will my attacker remain blocked?', verdict: 'yes', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/remains blocked/i, /does not make.*unblocked/i, /0 combat damage/i] },
  { name: 'blocked-status inverted clause', setup: 'bearsBlocked', question: 'Does my Bears stay blocked after their creature dies to Murder?', verdict: 'yes', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/remains blocked/i, /no trample|does not have trample/i] },
  { name: 'connection outcome', setup: 'bearsBlocked', question: 'Suppose I Murder the blocker; will my Bears connect with the opponent?', verdict: 'no', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/remains blocked/i, /0 combat damage/i] },
  { name: 'all trample after removal', setup: 'dreadmawBlocked', question: 'If their blocker gets destroyed with Murder, can Dreadmaw hit them for all 6?', verdict: 'yes', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/6 (?:combat )?damage/i] },
  { name: 'direct Murder legality', setup: 'dreadmawBlocked', question: 'Is it legal for me to use Murder on the blocker now?', verdict: 'yes', intent: 'action-legality', action: 'Cast', source: 'Murder', include: [/priority/i, /instant/i] },
  { name: 'Growth over Divination', setup: 'stackDivination', question: 'Would casting Giant Growth in response to Divination be legal?', verdict: 'yes', intent: 'action-legality', action: 'Cast', source: 'Giant Growth', include: [/can be cast|priority|instant/i] },
  { name: 'Growth over Bolt', setup: 'stackBolt', question: 'Can I use Giant Growth while Lightning Bolt waits on the stack?', verdict: 'yes', intent: 'action-legality', action: 'Cast', source: 'Giant Growth' },
  { name: 'drop land occupied stack', setup: 'stackDivination', question: 'Can I drop my land for turn before Divination resolves?', verdict: 'no', intent: 'action-legality', action: 'PlayLand', include: [/active player/i, /main phase/i, /stack is empty/i, /priority/i, /special action/i] },
  { name: 'drop land empty main', setup: 'main', question: 'May I drop a land for the turn?', verdict: 'yes', intent: 'action-legality', action: 'PlayLand', include: [/special action/i, /main phase/i] },
  { name: 'make land play opponent turn', setup: 'opponentMain', question: 'Could I make my land play during their turn?', verdict: 'no', intent: 'action-legality', action: 'PlayLand', include: [/active player/i] },
  { name: 'casting wording', setup: 'main', question: 'Would casting Grizzly Bears be legal here?', verdict: 'yes', intent: 'action-legality', action: 'Cast', source: 'Grizzly Bears' },
  { name: 'sorcery opponent turn', setup: 'opponentMain', question: 'Would using Divination right now be legal?', verdict: 'no', intent: 'action-legality', action: 'Cast', source: 'Divination' },
  { name: 'unblocked connection', setup: 'bearsUnblocked', question: 'Will my unblocked Grizzly Bears connect for two?', verdict: 'yes', intent: 'combat-outcome', include: [/2 damage/i] },
  { name: 'unknown priority fail closed', setup: 'unknownPriority', question: 'Would Giant Growth be legal on Dreadmaw now?', kind: 'clarification', intent: 'action-legality', action: 'Cast', source: 'Giant Growth', include: [/priority/i] },
  { name: 'why remains blocked', setup: 'bearsBlocked', question: 'Why does my attacker remain blocked after Murder removes the blocker?', intent: 'rules-outcome', include: [/blocked|combat|damage/i] },
  { name: 'what rule controls trample', setup: 'dreadmawBlocked', question: 'What rule explains how trample changes this combat?', intent: 'rules-outcome', include: [/trample|combat|damage/i] },
  { name: 'controller-qualified target', setup: 'bearsBlocked', question: "If Murder destroys opponent's Bears, will my Bears get through?", verdict: 'no', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/remains blocked/i] },
  { name: 'pronoun-qualified target', setup: 'bearsBlocked', question: 'After I destroy their Bears with Murder, does my attacker connect?', verdict: 'no', intent: 'combat-outcome', action: 'Cast', source: 'Murder', include: [/remains blocked/i] },
  { name: 'same-name collector explicit multiplicity', setup: 'duplicateBears', collectorStage: 'verifying', objectCount: 2 },
  { name: 'fresh session isolation', setup: 'main', question: 'Can I cast Divination?', verdict: 'yes', intent: 'action-legality', action: 'Cast', source: 'Divination', cleanSession: true },
  { name: 'damage assignment clarification contract', setup: 'multipleAttackersBlocked', question: 'Their Grizzly Bears blocks only my Dreadmaw. How much total damage can reach my opponent?', kind: 'clarification', intent: 'combat-outcome', include: [/damage assignment|assign/i] },
  { name: 'resolved inline stack outcome precedence', setup: 'bearsBlockedByDreadmaw', question: 'After blocks, I cast Giant Growth and they respond with Lightning Bolt on my Bears. Does my attacker survive the stack?', verdict: 'no', intent: 'combat-outcome', action: 'Cast', source: 'Giant Growth', owner: 'stack-or-effect', include: [/Giant Growth/i, /Lightning Bolt/i, /graveyard/i] },
  { name: 'protection blocking contract', setup: 'whiteKnightBlocked', question: 'Can the black Typhoid Rats legally block White Knight?', verdict: 'no', intent: 'combat-outcome', owner: 'combat', include: [/protection|cannot block|illegal block/i] },
  { name: 'two-player APNAP ordering', setup: 'main', question: "On my turn, Soul Warden and an opponent's triggered ability trigger from the same creature entering. In what order are they put on the stack?", verdict: 'yes', intent: 'rules-outcome', owner: 'stack-or-effect', turnOrderKnown: true, triggerControllers: ['player', 'opponent'], include: [/active player/i, /APNAP/i] },
  { name: 'canonical Commander return owner', setup: 'main', question: 'My commander Atraxa dies while Rest in Peace is in play. Can I choose to move it to the command zone, and when is that choice made?', verdict: 'yes', intent: 'rules-outcome', owner: 'commander', include: [/command zone/i, /exile|destination zone/i] },
  { name: 'zero nondesignated Commander damage', setup: 'atraxaUnblocked', question: 'A noncommander copy of Atraxa deals 4 combat damage. Does that count toward Atraxa commander damage?', verdict: 'no', intent: 'combat-outcome', owner: 'commander', numeric: 0, include: [/not a designated commander/i, /0 Commander damage/i] },
  { name: 'APNAP missing seating remains dependent', setup: 'main', question: "During Alice's turn, Alice, Bob, and Carol each control a trigger caused by Wrath of God. What order are those triggers stacked?", kind: 'clarification', intent: 'rules-outcome', owner: 'stack-or-effect', turnOrderKnown: false, triggerControllers: ['alice', 'bob', 'carol'], include: [/turn order/i] }
];

function resultOwner(result = {}, scenario = {}) {
  const types = (result.diagnosticTrace || []).map((entry) => entry.type || '');
  if (types.some((type) => /Commander/i.test(type))
    || (/\bcommander\b|\bcommand zone\b/i.test(scenario.sourceText || '') && /\bcommander\b|\bcommand zone\b/i.test(result.summary || ''))) return 'commander';
  if (types.some((type) => /APNAP|Trigger|Stack|Spell|Resolve|CardDrawn|Life|Zone/i.test(type))) return 'stack-or-effect';
  if (types.some((type) => /Attack|Block|Combat/i.test(type)) || /combat|damage|blocked|trample/i.test(result.summary || '')) return 'combat';
  return result.kind === 'clarification' ? 'clarification' : 'unknown';
}

async function run(test, previousSessionId) {
  let current = owner.selectGame(owner.createSession(), 'magic');
  const startedClean = current.session.id !== previousSessionId
    && current.session.resolvedCards.length === 0
    && current.session.magicState.cards.length === 0
    && current.session.magicState.stack.items.length === 0
    && current.session.magicState.battlefield.length === 0;
  current = await owner.ask({ session: current.session, gameId: 'magic', message: test.setup.toLowerCase().includes('block') || test.setup === 'unknownPriority' || test.setup === 'duplicateBears' ? 'Combat ruling' : 'Check a play' });
  for (const answer of setup[test.setup]) current = await owner.ask({ session: current.session, gameId: 'magic', message: answer });

  if (test.collectorStage) return { current, scenario: null, startedClean };
  if (current.session.stage === 'verifying') current = await owner.ask({ session: current.session, gameId: 'magic', message: 'Looks Right' });
  current = await owner.ask({ session: current.session, gameId: 'magic', message: test.question });
  const scenario = compileVerifiedMagicScenario({ message: test.question, cards: current.session.magicState.cards, verifiedState: current.session.magicState });
  return { current, scenario, startedClean };
}

const failures = [];
let assertions = 0;
let previousSessionId = null;
for (const test of cases) {
  try {
    const { current, scenario, startedClean } = await run(test, previousSessionId);
    previousSessionId = current.session.id;
    const checks = [];
    const check = (label, pass, actual) => { assertions += 1; if (!pass) checks.push({ label, actual }); };
    check('session isolation', startedClean, current.session.id);
    if (test.collectorStage) {
      const blockers = current.session.magicState.combat.blocks.flatMap((block) => block.blockerIds);
      check('collector stage', current.session.stage === test.collectorStage, current.session.stage);
      if (test.pendingKey) check('pending key', current.session.pendingStateKey === test.pendingKey, current.session.pendingStateKey);
      check('distinct object count', blockers.length === test.objectCount && new Set(blockers).size === test.objectCount, blockers);
    } else {
      if (test.verdict) check('verdict', current.result.verdict === test.verdict, current.result.verdict);
      if (test.kind) check('result kind', current.result.kind === test.kind, current.result.kind);
      if (test.intent) check('intent', scenario.questionIntent === test.intent, scenario.questionIntent);
      if (test.action) check('action', scenario.questionedAction?.type === test.action, scenario.questionedAction?.type);
      if (test.source) check('source', scenario.questionedAction?.source?.name === test.source, scenario.questionedAction?.source?.name);
      if (test.owner) check('result owner', resultOwner(current.result, scenario) === test.owner, resultOwner(current.result, scenario));
      if (typeof test.turnOrderKnown === 'boolean') check('turn order knowledge', scenario.game.turnOrderKnown === test.turnOrderKnown, scenario.game.turnOrderKnown);
      if (test.triggerControllers) check('trigger controllers', JSON.stringify(scenario.triggerContext?.controllers.map((entry) => entry.controller)) === JSON.stringify(test.triggerControllers), scenario.triggerContext?.controllers);
      if (Number.isFinite(test.numeric)) check('numeric result', new RegExp(`\\b${test.numeric}\\b`).test(current.result.answer), current.result.answer);
    }
    for (const pattern of test.include || []) check(`answer ${pattern}`, pattern.test(current.result.answer), current.result.answer);
    if (test.cleanSession) check('clean ruling cards', current.session.resolvedCards.every((card) => card.name === 'Divination'), current.session.resolvedCards.map((card) => card.name));
    if (checks.length) failures.push({
      name: test.name,
      question: test.question || null,
      answer: current.result.answer,
      scenario: scenario ? { questionIntent: scenario.questionIntent, questionedAction: scenario.questionedAction } : null,
      trace: current.result.diagnosticTrace || [],
      checks
    });
  } catch (error) {
    failures.push({ name: test.name, question: test.question || null, checks: [{ label: 'crash', actual: error.stack || error.message }] });
  }
}

console.log(JSON.stringify({
  suite: 'InstaJudge conversational repair holdouts',
  scenarios: cases.length,
  assertions,
  passed: cases.length - failures.length,
  failed: failures.length,
  failures
}, null, 2));
