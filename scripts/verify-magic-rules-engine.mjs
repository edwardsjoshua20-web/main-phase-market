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
  giantGrowth: { name: 'Giant Growth', typeLine: 'Instant', oracleText: 'Target creature gets +3/+3 until end of turn.', manaCost: '{G}', colors: ['G'] },
  doomBlade: { name: 'Doom Blade', typeLine: 'Instant', oracleText: 'Destroy target nonblack creature.', manaCost: '{1}{B}', colors: ['B'] },
  pacifism: { name: 'Pacifism', typeLine: 'Enchantment - Aura', oracleText: 'Enchant creature. Enchanted creature can not attack or block.', manaCost: '{1}{W}', colors: ['W'] },
  shock: { name: 'Shock', typeLine: 'Instant', oracleText: 'Shock deals 2 damage to any target.', manaCost: '{R}', colors: ['R'] },
  llanowarElves: { name: 'Llanowar Elves', typeLine: 'Creature - Elf Druid', oracleText: '{T}: Add {G}.', manaCost: '{G}', colors: ['G'], power: 1, toughness: 1 },
  lightningStrike: { name: 'Lightning Strike', typeLine: 'Instant', oracleText: 'Lightning Strike deals 3 damage to any target.', manaCost: '{1}{R}', colors: ['R'] },
  cancel: { name: 'Cancel', typeLine: 'Instant', oracleText: 'Counter target spell.', manaCost: '{1}{U}{U}', colors: ['U'] },
  colossalDreadmaw: { name: 'Colossal Dreadmaw', typeLine: 'Creature - Dinosaur', oracleText: 'Trample', manaCost: '{4}{G}{G}', colors: ['G'], power: 6, toughness: 6 },
  wrath: { name: 'Wrath of God', typeLine: 'Sorcery', oracleText: 'Destroy all creatures. They can not be regenerated.', manaCost: '{2}{W}{W}', colors: ['W'] },
  path: { name: 'Path to Exile', typeLine: 'Instant', oracleText: 'Exile target creature. Its controller may search their library for a basic land card, put that card onto the battlefield tapped, then shuffle.', manaCost: '{W}', colors: ['W'] },
  commander: { name: 'Atraxa, Praetors Voice', typeLine: 'Legendary Creature - Phyrexian Angel Horror', oracleText: 'Flying, vigilance, deathtouch, lifelink. At the beginning of your end step, proliferate.', manaCost: '{G}{W}{U}{B}', colors: ['G', 'W', 'U', 'B'], power: 4, toughness: 4 },
  solRing: { name: 'Sol Ring', typeLine: 'Artifact', oracleText: '{T}: Add {C}{C}.', manaCost: '{1}', colors: [] },
  clone: { name: 'Clone', typeLine: 'Creature - Shapeshifter', oracleText: 'You may have Clone enter as a copy of any creature on the battlefield.', manaCost: '{3}{U}', colors: ['U'], power: 0, toughness: 0 },
  soulWarden: { name: 'Soul Warden', typeLine: 'Creature - Human Cleric', oracleText: 'Whenever another creature enters the battlefield, you gain 1 life.', manaCost: '{W}', colors: ['W'], power: 1, toughness: 1 }
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

const cases = [
  {
    category: 'protection',
    name: 'mandatory Gods Willing / Murder regression',
    message: 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Murder destroy Serra Angel?',
    cards: [card.serra, card.murder, card.godsWilling],
    verdict: 'no',
    mustInclude: ['no legal targets', 'protection from black']
  },
  {
    category: 'targeting',
    name: 'legal target',
    message: 'Opponent casts Murder targeting Serra Angel. Does Murder destroy Serra Angel?',
    cards: [card.murder, card.serra],
    verdict: 'yes'
  },
  {
    category: 'targeting',
    name: 'illegal target',
    message: 'Opponent casts Murder targeting Sol Ring. Can Murder target Sol Ring?',
    cards: [card.murder, card.solRing],
    verdict: 'no'
  },
  {
    category: 'targeting',
    name: 'target becomes illegal',
    message: 'Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Does Murder resolve successfully?',
    cards: [card.serra, card.murder, card.godsWilling],
    verdict: 'no'
  },
  {
    category: 'stack',
    name: 'counterspell response',
    message: 'Opponent casts Murder. Player responds with Counterspell targeting Murder. Can Counterspell counter it?',
    cards: [card.murder, card.counterspell],
    verdict: 'yes'
  },
  {
    category: 'stack',
    name: 'multiple responses',
    message: 'Player controls Serra Angel. Opponent casts Murder targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses black. Opponent responds with Cancel targeting Gods Willing. Does Murder destroy Serra Angel?',
    cards: [card.serra, card.murder, card.godsWilling, card.cancel],
    verdict: 'yes'
  },
  {
    category: 'damage',
    name: 'lethal damage',
    message: 'Opponent casts Lightning Bolt targeting Grizzly Bears. Does Grizzly Bears die?',
    cards: [card.lightningBolt, card.grizzlyBears],
    verdict: 'yes'
  },
  {
    category: 'damage',
    name: 'nonlethal damage',
    message: 'Opponent casts Shock targeting Serra Angel. Does Serra Angel die?',
    cards: [card.shock, card.serra],
    verdict: 'no'
  },
  {
    category: 'indestructible',
    name: 'destroy vs indestructible',
    message: 'Opponent casts Murder targeting Darksteel Myr. Does Murder destroy Darksteel Myr?',
    cards: [card.murder, card.darksteelMyr],
    verdict: 'no'
  },
  {
    category: 'indestructible',
    name: 'damage vs indestructible',
    message: 'Opponent casts Lightning Bolt targeting Darksteel Myr. Does Darksteel Myr die from lethal damage?',
    cards: [card.lightningBolt, card.darksteelMyr],
    verdict: 'no'
  },
  {
    category: 'exile',
    name: 'exile vs indestructible',
    message: 'Opponent casts Path to Exile targeting Darksteel Myr. Does Path to Exile exile it?',
    cards: [card.path, card.darksteelMyr],
    verdict: 'yes'
  },
  {
    category: 'timing',
    name: 'respond with instant',
    message: 'Can I respond to a spell with Lightning Bolt?',
    cards: [card.lightningBolt],
    verdict: 'yes'
  },
  {
    category: 'timing',
    name: 'sorcery response fails',
    message: 'Can I respond on my opponent turn with Wrath of God?',
    cards: [card.wrath],
    verdict: 'no'
  },
  {
    category: 'commander',
    name: 'commander tax missing state',
    message: 'How much commander tax do I pay to cast Atraxa from the command zone?',
    cards: [card.commander],
    verdict: 'depends'
  },
  {
    category: 'commander',
    name: 'commander damage missing state',
    message: 'Does my opponent lose from commander damage from Atraxa?',
    cards: [card.commander],
    verdict: 'depends'
  },
  {
    category: 'replacement',
    name: 'replacement needs choice',
    message: 'If this creature would die, another effect exiles it instead. What happens?',
    cards: [card.serra],
    verdict: 'depends'
  },
  {
    category: 'layers',
    name: 'complex layer unsupported',
    message: 'A copy effect and continuous effect apply in layers and timestamp order. What is Clone?',
    cards: [card.clone, card.serra],
    verdict: 'unverified'
  },
  {
    category: 'triggers',
    name: 'trigger unsupported but not guessed',
    message: 'Soul Warden triggers when Serra Angel enters. Can I respond to the trigger?',
    cards: [card.soulWarden, card.serra],
    verdict: 'yes'
  },
  {
    category: 'activated abilities',
    name: 'activated ability timing missing state',
    message: 'Can I activate Llanowar Elves now?',
    cards: [card.llanowarElves],
    verdict: 'unverified'
  },
  {
    category: 'sacrifice',
    name: 'sacrifice needs exact instruction',
    message: 'A spell says target player sacrifices a creature. Does indestructible save Darksteel Myr?',
    cards: [card.darksteelMyr],
    verdict: 'unverified'
  },
  {
    category: 'ward',
    name: 'ward missing payment state',
    message: 'My opponent targets my ward creature. Does the spell get countered?',
    cards: [card.serra],
    verdict: 'unverified'
  },
  {
    category: 'hexproof',
    name: 'hexproof missing exact object',
    message: 'Can my opponent target my hexproof creature with Murder?',
    cards: [card.murder],
    verdict: 'unverified'
  },
  {
    category: 'state-based-actions',
    name: 'SBA lethal after damage',
    message: 'Opponent casts Lightning Strike targeting Grizzly Bears. Is Grizzly Bears put into the graveyard by state-based actions?',
    cards: [card.lightningStrike, card.grizzlyBears],
    verdict: 'yes'
  },
  {
    category: 'protection',
    name: 'protection vs damage',
    message: 'Opponent casts Lightning Bolt targeting Serra Angel. Player responds with Gods Willing targeting Serra Angel and chooses red. Does Lightning Bolt deal damage?',
    cards: [card.lightningBolt, card.serra, card.godsWilling],
    verdict: 'no'
  }
];

const startedAt = performance.now();
const categoryCounts = new Map();
for (const testCase of cases) {
  const result = judgeMagicScenario({ message: testCase.message, cards: testCase.cards, rules });
  categoryCounts.set(testCase.category, (categoryCounts.get(testCase.category) || 0) + 1);
  assert(result.verdict === testCase.verdict, `${testCase.name}: expected ${testCase.verdict}, got ${result.verdict}\n${result.answer}`);
  assert(result.answer.startsWith(testCase.verdict.toUpperCase()), `${testCase.name}: answer must lead with verdict.`);
  if (['yes', 'no'].includes(testCase.verdict)) {
    assert(result.rules.length > 0, `${testCase.name}: verified ruling must include rules.`);
  }
  for (const phrase of testCase.mustInclude || []) {
    assert(result.answer.toLowerCase().includes(phrase), `${testCase.name}: answer must include "${phrase}".\n${result.answer}`);
  }
  assert(Array.isArray(result.diagnosticTrace), `${testCase.name}: diagnostic trace missing.`);
}

const elapsedMs = Math.round(performance.now() - startedAt);
console.log(`Magic rules engine verifier passed: ${cases.length} cases in ${elapsedMs}ms.`);
console.log([...categoryCounts.entries()].map(([category, count]) => `- ${category}: ${count}`).join('\n'));
