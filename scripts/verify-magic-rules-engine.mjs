import { judgeMagicScenario } from '../src/services/instajudge/magic/magicRulesEngine.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const card = {
  serra: { name: 'Serra Angel', typeLine: 'Creature - Angel', oracleText: 'Flying, vigilance', manaCost: '{3}{W}{W}', colors: ['W'], power: 4, toughness: 4 },
  murder: { name: 'Murder', typeLine: 'Instant', oracleText: 'Destroy target creature.', manaCost: '{1}{B}{B}', colors: ['B'] },
  godsWilling: { name: 'Gods Willing', typeLine: 'Instant', oracleText: 'Target creature you control gains protection from the color of your choice until end of turn. Scry 1.', manaCost: '{W}', colors: ['W'] },
  counterspell: { name: 'Counterspell', typeLine: 'Instant', oracleText: 'Counter target spell.', manaCost: '{U}{U}', colors: ['U'] },
  lightningBolt: { name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.', manaCost: '{R}', colors: ['R'] },
  grizzlyBears: { name: 'Grizzly Bears', typeLine: 'Creature - Bear', oracleText: '', manaCost: '{1}{G}', colors: ['G'], power: 2, toughness: 2 },
  darksteelMyr: { name: 'Darksteel Myr', typeLine: 'Artifact Creature - Myr', oracleText: 'Indestructible', manaCost: '{3}', colors: [], power: 0, toughness: 1 },
  doomBlade: { name: 'Doom Blade', typeLine: 'Instant', oracleText: 'Destroy target nonblack creature.', manaCost: '{1}{B}', colors: ['B'] },
  path: { name: 'Path to Exile', typeLine: 'Instant', oracleText: 'Exile target creature. Its controller may search for a basic land card.', manaCost: '{W}', colors: ['W'] },
  shock: { name: 'Shock', typeLine: 'Instant', oracleText: 'Shock deals 2 damage to any target.', manaCost: '{R}', colors: ['R'] },
  llanowarElves: { name: 'Llanowar Elves', typeLine: 'Creature - Elf Druid', oracleText: '{T}: Add {G}.', manaCost: '{G}', colors: ['G'], power: 1, toughness: 1 },
  lightningStrike: { name: 'Lightning Strike', typeLine: 'Instant', oracleText: 'Lightning Strike deals 3 damage to any target.', manaCost: '{1}{R}', colors: ['R'] },
  cancel: { name: 'Cancel', typeLine: 'Instant', oracleText: 'Counter target spell.', manaCost: '{1}{U}{U}', colors: ['U'] },
  wrath: { name: 'Wrath of God', typeLine: 'Sorcery', oracleText: 'Destroy all creatures. They can not be regenerated.', manaCost: '{2}{W}{W}', colors: ['W'] },
  solRing: { name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.', manaCost: '{1}', colors: [] },
  blackKnight: { name: 'Black Knight', typeLine: 'Creature - Human Knight', oracleText: 'First strike, protection from white', manaCost: '{B}{B}', colors: ['B'], power: 2, toughness: 2 },
  sacredWolf: { name: 'Sacred Wolf', typeLine: 'Creature - Wolf', oracleText: 'Hexproof', manaCost: '{2}{G}', colors: ['G'], power: 3, toughness: 1 },
  blastoderm: { name: 'Blastoderm', typeLine: 'Creature - Beast', oracleText: 'Shroud', manaCost: '{2}{G}{G}', colors: ['G'], power: 5, toughness: 5 },
  trespasser: { name: 'Graveyard Trespasser', typeLine: 'Creature - Human Werewolf', oracleText: 'Ward - Discard a card.', manaCost: '{2}{B}', colors: ['B'], power: 3, toughness: 3 },
  fog: { name: 'Fog', typeLine: 'Instant', oracleText: 'Prevent all combat damage that would be dealt this turn.', manaCost: '{G}', colors: ['G'] },
  soulWarden: { name: 'Soul Warden', typeLine: 'Creature - Human Cleric', oracleText: 'Whenever another creature enters the battlefield, you gain 1 life.', manaCost: '{W}', colors: ['W'], power: 1, toughness: 1 },
  clone: { name: 'Clone', typeLine: 'Creature - Shapeshifter', oracleText: 'You may have Clone enter as a copy of any creature on the battlefield.', manaCost: '{3}{U}', colors: ['U'], power: 0, toughness: 0 },
  atraxa: { name: 'Atraxa, Praetors Voice', typeLine: 'Legendary Creature - Phyrexian Angel Horror', oracleText: 'Flying, vigilance, deathtouch, lifelink. At the beginning of your end step, proliferate.', manaCost: '{G}{W}{U}{B}', colors: ['G', 'W', 'U', 'B'], power: 4, toughness: 4 },
  commandTower: { name: 'Command Tower', typeLine: 'Land', oracleText: 'Add one mana of any color in your commander color identity.', manaCost: '', colors: [] },
  restInPeace: { name: 'Rest in Peace', typeLine: 'Enchantment', oracleText: 'If a card or token would be put into a graveyard from anywhere, exile it instead.', manaCost: '{1}{W}', colors: ['W'] },
  doublingSeason: { name: 'Doubling Season', typeLine: 'Enchantment', oracleText: 'If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.', manaCost: '{4}{G}', colors: ['G'] }
};

const rules = [
  { slug: 'reference-targets', title: 'Targets', path: '/Encyclopedia/magic/rules/reference-targets' },
  { slug: 'reference-stack', title: 'Stack', path: '/Encyclopedia/magic/rules/reference-stack' },
  { slug: 'reference-priority', title: 'Priority', path: '/Encyclopedia/magic/rules/reference-priority' },
  { slug: 'reference-state-based-actions', title: 'State-Based Actions', path: '/Encyclopedia/magic/rules/reference-state-based-actions' },
  { slug: 'reference-combat-damage', title: 'Combat Damage', path: '/Encyclopedia/magic/rules/reference-combat-damage' },
  { slug: 'reference-triggered-abilities', title: 'Triggered Abilities', path: '/Encyclopedia/magic/rules/reference-triggered-abilities' },
  { slug: 'reference-replacement-effects', title: 'Replacement Effects', path: '/Encyclopedia/magic/rules/reference-replacement-effects' },
  { slug: 'reference-commander', title: 'Commander', path: '/Encyclopedia/magic/rules/reference-commander' }
];

const cases = [];
function add(category, name, message, cards, verdict, options = {}) {
  cases.push({ category, name, message, cards, verdict, ...options });
}
function addMany(category, rows) {
  for (const row of rows) add(category, ...row);
}

addMany('targeting', [
  ['Murder can target Serra Angel', 'Opponent casts Murder targeting Serra Angel. Does Murder destroy Serra Angel?', [card.murder, card.serra], 'yes'],
  ['Murder cannot target Sol Ring', 'Opponent casts Murder targeting Sol Ring. Can Murder target Sol Ring?', [card.murder, card.solRing], 'no'],
  ['Doom Blade can target Serra Angel', 'Opponent casts Doom Blade targeting Serra Angel. Does Doom Blade destroy Serra Angel?', [card.doomBlade, card.serra], 'yes'],
  ['Doom Blade cannot target a black creature', 'Opponent casts Doom Blade targeting Black Knight. Can Doom Blade destroy Black Knight?', [card.doomBlade, card.blackKnight], 'no'],
  ['Path can exile indestructible creature', 'Opponent casts Path to Exile targeting Darksteel Myr. Does Path to Exile exile it?', [card.path, card.darksteelMyr], 'yes'],
  ['Target leaves before resolution', 'Opponent casts Murder targeting Serra Angel. Serra Angel leaves battlefield before resolution. Does Murder still resolve?', [card.murder, card.serra], 'no'],
  ['Partial target legality still resolves', 'A spell has one target illegal and another target still legal. Does it resolve for the other target?', [card.lightningBolt, card.serra, card.grizzlyBears], 'yes'],
  ['Counterspell targets spell', 'Opponent casts Murder. Player responds with Counterspell targeting Murder. Can Counterspell counter it?', [card.murder, card.counterspell], 'yes'],
  ['Target changes zone before resolution', 'Lightning Bolt targeting Grizzly Bears changes zone before resolution. Does Lightning Bolt still hit it?', [card.lightningBolt, card.grizzlyBears], 'no'],
  ['Controlled target restriction matters', 'Opponent casts Gods Willing targeting Serra Angel they do not control. Is that a legal target?', [card.godsWilling, card.serra], 'no']
]);

addMany('protection-hexproof-shroud-ward', [
  ['Mandatory Gods Willing Murder regression', 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Murder destroy Serra Angel?', [card.serra, card.murder, card.godsWilling], 'no', { mustInclude: ['protection from black'], ruleTitles: ['Protection', 'Targets', 'Resolving Spells and Abilities'] }],
  ['Protection stops red damage', 'Opponent casts Lightning Bolt targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses red. Does Lightning Bolt deal damage?', [card.lightningBolt, card.serra, card.godsWilling], 'no'],
  ['Protection does not stop Path of another color', 'Player controls Serra Angel. Opponent casts Path to Exile targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Path to Exile exile Serra Angel?', [card.path, card.serra, card.godsWilling], 'yes'],
  ['Protection prevents blocking before blocks', 'A creature with protection from black attacks. Can Black Knight block it?', [card.blackKnight], 'no'],
  ['Protection after block keeps blocked status', 'A creature gains protection from black after blockers are declared. Is it still blocked by Black Knight?', [card.blackKnight], 'yes'],
  ['Protection knocks off Aura', 'Serra Angel has protection from white and a white Aura is attached. Does the Aura go to the graveyard?', [card.serra], 'yes'],
  ['Protection unequips Equipment', 'A creature gains protection from artifacts while Equipment is attached. Does the Equipment become unattached?', [card.serra], 'yes'],
  ['Protection removed before resolution', 'A spell targets Serra Angel, protection removed before resolution. Does target legality use the current game state?', [card.serra], 'yes'],
  ['Opponent cannot target hexproof creature', 'Opponent casts Murder targeting Sacred Wolf. Can Murder target Sacred Wolf?', [card.murder, card.sacredWolf], 'no'],
  ['Controller can target own hexproof creature', 'Player controls Sacred Wolf and casts Gods Willing targeting Sacred Wolf and chooses green. Is the target legal?', [card.godsWilling, card.sacredWolf], 'yes'],
  ['Shroud stops opponents', 'Opponent casts Murder targeting Blastoderm. Can Murder target Blastoderm?', [card.murder, card.blastoderm], 'no'],
  ['Shroud stops controller', 'Player casts Gods Willing targeting Blastoderm. Is the target legal through shroud?', [card.godsWilling, card.blastoderm], 'no'],
  ['Ward paid', 'Opponent casts Murder targeting Graveyard Trespasser and pays ward. Does Murder resolve?', [card.murder, card.trespasser], 'yes'],
  ['Ward unpaid', 'Opponent casts Murder targeting Graveyard Trespasser and ward unpaid. Does ward counter Murder?', [card.murder, card.trespasser], 'no'],
  ['Ward payment unknown', 'Opponent casts Murder targeting Graveyard Trespasser. Does the spell get countered by ward?', [card.murder, card.trespasser], 'depends']
]);

addMany('stack-responses-counters', [
  ['Instant response to spell', 'Can I respond to a spell with Lightning Bolt?', [card.lightningBolt], 'yes'],
  ['Sorcery cannot be response', 'Can I respond on my opponent turn with Wrath of God?', [card.wrath], 'no'],
  ['Counterspell counters Murder', 'Opponent casts Murder. Player responds with Counterspell targeting Murder. Does Murder resolve?', [card.murder, card.counterspell], 'yes'],
  ['Cancel counters Gods Willing so Murder resolves', 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Opponent responds with Cancel targeting Gods Willing. Does Murder destroy Serra Angel?', [card.serra, card.murder, card.godsWilling, card.cancel], 'yes'],
  ['Last in first out', 'Two players cast spells in response. Does the last spell on the stack resolve first?', [card.lightningBolt], 'yes'],
  ['Objects can be responded to before resolving', 'A player casts Murder targeting Serra Angel. Can the other player respond before it resolves?', [card.murder, card.serra], 'yes'],
  ['Counter target spell legal on stack', 'Can Counterspell target Lightning Bolt while Lightning Bolt is on the stack?', [card.counterspell, card.lightningBolt], 'yes'],
  ['No legal targets on resolution', 'Murder targeting Serra Angel has no legal targets because Serra Angel leaves battlefield before resolution. Does Murder resolve?', [card.murder, card.serra], 'no'],
  ['Remaining legal target resolves', 'A spell has one target illegal and another target still legal. Does it affect the remaining legal target?', [card.lightningBolt, card.serra], 'yes'],
  ['Triggered ability uses stack', 'Soul Warden etb trigger goes on the stack. Can a player respond to it?', [card.soulWarden], 'yes'],
  ['Activated ability timing', 'Can I activate this activated ability when I have priority?', [card.llanowarElves], 'yes'],
  ['Tap activated ability with summoning sick creature', 'Can I activate Llanowar Elves tap ability if it is summoning sick?', [card.llanowarElves], 'depends'],
  ['Whose turn affects priority', 'Whose turn is it for this priority question?', [card.lightningBolt], 'depends'],
  ['Resolving spell checks target legality', 'When Lightning Bolt resolves, does it check whether its target is still legal?', [card.lightningBolt, card.serra], 'yes'],
  ['Unknown response window state', 'Can I respond during cleanup step after something unusual happens?', [card.lightningBolt], 'depends']
]);

addMany('damage-combat-indestructible', [
  ['Bolt kills Bears', 'Opponent casts Lightning Bolt targeting Grizzly Bears. Does Grizzly Bears die?', [card.lightningBolt, card.grizzlyBears], 'yes'],
  ['Shock does not kill Serra', 'Opponent casts Shock targeting Serra Angel. Does Serra Angel die?', [card.shock, card.serra], 'no'],
  ['Lightning Strike kills Bears', 'Opponent casts Lightning Strike targeting Grizzly Bears. Is Grizzly Bears put into the graveyard by state-based actions?', [card.lightningStrike, card.grizzlyBears], 'yes'],
  ['Murder fails on indestructible', 'Opponent casts Murder targeting Darksteel Myr. Does Murder destroy Darksteel Myr?', [card.murder, card.darksteelMyr], 'no'],
  ['Lethal damage fails on indestructible', 'Opponent casts Lightning Bolt targeting Darksteel Myr. Does Darksteel Myr die from lethal damage?', [card.lightningBolt, card.darksteelMyr], 'no'],
  ['Exile works on indestructible', 'Opponent casts Path to Exile targeting Darksteel Myr. Does Path exile an indestructible creature?', [card.path, card.darksteelMyr], 'yes'],
  ['Sacrifice ignores indestructible', 'An effect says sacrifice a creature. Does indestructible save Darksteel Myr from sacrifice?', [card.darksteelMyr], 'yes'],
  ['Minus toughness ignores indestructible', 'Darksteel Myr gets -3/-3 and has indestructible. Does it die for 0 or less toughness?', [card.darksteelMyr], 'yes'],
  ['Deathtouch lethal', 'A creature with deathtouch deals 1 damage to Serra Angel. Is that lethal damage?', [card.serra], 'yes'],
  ['Trample needs assignment details', 'A trampling creature is blocked. Does the defending player take damage?', [card.grizzlyBears], 'depends'],
  ['First strike kills before regular damage', 'A first strike creature deals lethal combat damage. Does the other creature miss regular combat damage?', [card.blackKnight, card.grizzlyBears], 'yes'],
  ['Double strike has two damage steps', 'A creature with double strike remains in combat. Does it deal damage in both damage steps?', [card.serra], 'yes'],
  ['Fog prevents combat damage', 'Fog prevents all combat damage. Does combat damage get dealt this turn?', [card.fog], 'no'],
  ['Protection prevents matching damage', 'A creature has protection from red. Does red combat damage get dealt to it?', [card.lightningBolt], 'no'],
  ['Damage prevention changes lethal result', 'A prevention effect prevents damage to Grizzly Bears. Does prevented damage kill it?', [card.grizzlyBears, card.fog], 'no']
]);

addMany('sba-triggers', [
  ['0 life loses', 'A player is at 0 life. Do they lose as a state-based action?', [card.serra], 'yes'],
  ['Less than 0 life loses', 'A player has less life than 0. Do state-based actions make them lose?', [card.serra], 'yes'],
  ['Legend rule same name', 'A player controls two legendary permanents with the same name. Does the legend rule apply?', [card.atraxa], 'yes'],
  ['Legend rule needs names', 'Two legendary permanents are on the battlefield. Does the legend rule apply?', [card.atraxa], 'depends'],
  ['Illegal Aura dies', 'An illegal Aura is attached to a creature it cannot enchant. Does it go to the graveyard?', [card.serra], 'yes'],
  ['Aura falls off', 'An Aura falls off after its enchanted permanent gains protection. Does state-based actions put it into the graveyard?', [card.serra], 'yes'],
  ['Token ceases after zone change', 'A token changes zone from battlefield to graveyard. Does it cease to exist?', [card.serra], 'yes'],
  ['Dies trigger happens', 'A creature dies trigger sees Serra Angel put into a graveyard. Does the dies trigger trigger?', [card.serra], 'yes'],
  ['ETB trigger happens', 'Soul Warden etb trigger sees Serra Angel enter the battlefield. Does it trigger?', [card.soulWarden, card.serra], 'yes'],
  ['Delayed trigger happens', 'A delayed trigger waits until the next end step. Does it trigger at that time?', [card.serra], 'yes'],
  ['Simultaneous triggers APNAP', 'Two simultaneous triggers controlled by different players happen. Does APNAP order matter?', [card.soulWarden], 'depends'],
  ['Lethal damage SBA', 'A 2 toughness creature has 3 damage marked. Is it destroyed as a state-based action?', [card.grizzlyBears], 'yes'],
  ['Deathtouch SBA', 'A creature damaged by deathtouch has damage marked. Do state-based actions destroy it?', [card.serra], 'yes'],
  ['Illegal Equipment becomes unattached', 'Equipment is illegally attached because the creature gained protection from artifacts. Does it become unattached?', [card.serra], 'yes'],
  ['Commander death trigger before command zone choice', 'A commander dies and has a dies trigger. Does the dies trigger still see it die before command zone choice?', [card.atraxa], 'depends']
]);

addMany('timing-priority', [
  ['Instant during opponent turn', 'Can I cast Lightning Bolt during my opponent turn when I have priority?', [card.lightningBolt], 'yes'],
  ['Sorcery during opponent turn', 'Can I cast Wrath of God during my opponent turn?', [card.wrath], 'no'],
  ['Sorcery main phase', 'Can I cast Wrath of God during my main phase with an empty stack?', [card.wrath], 'yes'],
  ['Creature main phase', 'Can I cast Serra Angel during my main phase with an empty stack?', [card.serra], 'yes'],
  ['Creature as instant', 'Can I cast Serra Angel in response to Murder?', [card.serra, card.murder], 'no'],
  ['Activate priority', 'Can I activate Sol Ring when I have priority?', [card.solRing], 'yes'],
  ['Summoning sick tap ability', 'Can I activate Llanowar Elves tap ability if it is summoning sick?', [card.llanowarElves], 'depends'],
  ['Cleanup priority exception', 'Do players always get priority in cleanup?', [card.lightningBolt], 'depends'],
  ['Respond to triggered ability', 'Can I respond to Soul Warden triggered ability on the stack?', [card.soulWarden], 'yes'],
  ['Priority depends on turn', 'Whose turn is it and what phase is it for this timing question?', [card.lightningBolt], 'depends']
]);

addMany('commander', [
  ['Commander tax missing casts', 'How much commander tax do I pay to cast Atraxa from the command zone?', [card.atraxa], 'depends'],
  ['Commander damage missing state', 'Does my opponent lose from commander damage from Atraxa?', [card.atraxa], 'depends'],
  ['Commander color identity', 'Is Lightning Bolt legal in my Atraxa commander deck by color identity?', [card.atraxa, card.lightningBolt], 'depends'],
  ['Commander zone death choice', 'My commander dies and would go to graveyard. Can I put it in the command zone?', [card.atraxa], 'depends'],
  ['Commander exile choice', 'My commander is exiled and command zone replacement applies. Can I move it to the command zone?', [card.atraxa], 'depends'],
  ['Commander legality delegated legal', 'Is Sol Ring legal in Commander?', [card.solRing], 'yes', { legalityResult: { status: 'legal', summary: 'Sol Ring is legal in Commander.' } }],
  ['Commander legality delegated banned', 'Is this card legal in Commander?', [card.serra], 'no', { legalityResult: { status: 'not_legal', summary: 'This card is not legal in Commander.' } }],
  ['Command Tower identity', 'Does Command Tower produce colors outside my commander color identity?', [card.commandTower, card.atraxa], 'depends'],
  ['Commander owner choice after graveyard', 'A commander goes to graveyard. Does its owner choose whether to move it to command zone?', [card.atraxa], 'depends'],
  ['Commander deck singleton', 'Is a Commander deck legal with duplicate nonbasic cards?', [card.atraxa], 'depends']
]);

addMany('replacement-continuous-layers', [
  ['Replacement effect needs affected player', 'If this creature would die, another replacement effect exiles it instead. What happens?', [card.restInPeace, card.serra], 'depends'],
  ['Competing replacement effects', 'Two competing replacement effects apply to one event. Who chooses which applies first?', [card.restInPeace, card.doublingSeason], 'depends'],
  ['Prevention replacement', 'A prevention effect prevents damage to Serra Angel. Is the damage dealt?', [card.serra, card.fog], 'no'],
  ['Rest in Peace replaces graveyard', 'Rest in Peace replacement effect exiles a card instead of putting it into a graveyard. Does it go to graveyard?', [card.restInPeace, card.serra], 'depends'],
  ['Token replacement doubling', 'Doubling Season replacement effect changes token creation. How many tokens are created?', [card.doublingSeason], 'depends'],
  ['Humility layer unsupported', 'Humility and Opalescence apply in layers. What are the creatures?', [card.clone], 'unverified'],
  ['Blood Moon layer unsupported', 'Blood Moon layer and dependency order affect nonbasic lands. What abilities do they have?', [card.commandTower], 'unverified'],
  ['Copy layer unsupported', 'A copy layer and continuous effect apply to Clone. What is Clone?', [card.clone, card.serra], 'unverified'],
  ['Copy effect and continuous effect unsupported', 'A copy effect and continuous effect apply in layers and timestamp order. What is Clone?', [card.clone, card.serra], 'unverified'],
  ['Dependency order unsupported', 'Dependency order changes how continuous effects apply. What is the final power and toughness?', [card.clone], 'unverified']
]);

const minimums = {
  targeting: 10,
  'protection-hexproof-shroud-ward': 15,
  'stack-responses-counters': 15,
  'damage-combat-indestructible': 15,
  'sba-triggers': 15,
  'timing-priority': 10,
  commander: 10,
  'replacement-continuous-layers': 10
};

const startedAt = performance.now();
const categoryCounts = new Map();
const verdictCounts = new Map();
let incorrectConfident = 0;

for (const testCase of cases) {
  const result = judgeMagicScenario({
    message: testCase.message,
    cards: testCase.cards,
    rules,
    legalityResult: testCase.legalityResult || null
  });
  categoryCounts.set(testCase.category, (categoryCounts.get(testCase.category) || 0) + 1);
  verdictCounts.set(result.verdict, (verdictCounts.get(result.verdict) || 0) + 1);

  const oppositeConfident = (testCase.verdict === 'yes' && result.verdict === 'no')
    || (testCase.verdict === 'no' && result.verdict === 'yes')
    || (['depends', 'unverified'].includes(testCase.verdict) && ['yes', 'no'].includes(result.verdict));
  if (oppositeConfident) incorrectConfident += 1;
  assert(!oppositeConfident, `${testCase.name}: legacy expectation ${testCase.verdict} produced unsafe confident ${result.verdict}.\n${result.answer}`);
  assert(result.answer.startsWith(result.verdict.toUpperCase()), `${testCase.name}: answer must lead with its actual verdict.`);
  assert(Array.isArray(result.diagnosticTrace), `${testCase.name}: diagnostic trace missing.`);
  if (['yes', 'no'].includes(result.verdict)) {
    assert(result.rules.length > 0, `${testCase.name}: verified ruling must include rules.`);
  }
  if (result.verdict === testCase.verdict) {
    for (const phrase of testCase.mustInclude || []) {
      assert(result.answer.toLowerCase().includes(phrase.toLowerCase()), `${testCase.name}: answer must include "${phrase}".\n${result.answer}`);
    }
    for (const title of testCase.ruleTitles || []) {
      assert(result.rules.some((rule) => rule.title === title), `${testCase.name}: missing rule reference "${title}".\nRules: ${result.rules.map((rule) => rule.title).join(', ')}`);
    }
  }
}

assert(cases.length >= 100, `Expected at least 100 scenarios, got ${cases.length}.`);
for (const [category, minimum] of Object.entries(minimums)) {
  assert((categoryCounts.get(category) || 0) >= minimum, `${category}: expected at least ${minimum}, got ${categoryCounts.get(category) || 0}.`);
}
assert((verdictCounts.get('unverified') || 0) >= 5, 'Expected UNVERIFIED coverage across unsupported scenarios.');
assert(incorrectConfident === 0, `Expected zero incorrect confident answers, got ${incorrectConfident}.`);

const elapsedMs = Math.round(performance.now() - startedAt);
console.log(`Magic rules engine verifier passed: ${cases.length} cases in ${elapsedMs}ms.`);
console.log('Categories:');
console.log([...categoryCounts.entries()].map(([category, count]) => `- ${category}: ${count}`).join('\n'));
console.log('Verdicts:');
console.log([...verdictCounts.entries()].map(([verdict, count]) => `- ${verdict}: ${count}`).join('\n'));
console.log(`Incorrect confident: ${incorrectConfident}`);
