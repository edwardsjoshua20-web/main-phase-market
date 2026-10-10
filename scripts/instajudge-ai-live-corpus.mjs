const baseExpect = () => ({
  facts: {}, absentFacts: [], cards: [], stack: null, targets: [], attackers: [], blockers: [],
  correction: false, ambiguity: false
});

const cases = [];
function add(category, message, expected = {}, context = {}) {
  cases.push({ id: `AI${String(cases.length + 1).padStart(3, '0')}`, category, message, ...context, expected: { ...baseExpect(), ...expected } });
}

for (const [message, turn] of [
  ["It's my turn.", 'user'], ["Opponent's turn.", 'opponent'], ['This is their turn.', 'opponent'],
  ['I am the active player.', 'user'], ['My opponent is the active player.', 'opponent'],
  ['No, I am taking this turn.', 'user'], ['The turn belongs to my opponent.', 'opponent'],
  ['We are on my turn right now.', 'user']
]) add('turn', message, { facts: { turn }, absentFacts: ['phase', 'step', 'priorityHolder', 'stackEmpty'] });

for (const [message, phase, step = null] of [
  ["We're in upkeep.", 'beginning', 'upkeep'], ["During my opponent's upkeep.", 'beginning', 'upkeep'],
  ['We are in the draw step.', 'beginning', 'draw'], ['Precombat main.', 'precombat-main'],
  ['First main phase.', 'precombat-main'], ['We are in combat.', 'combat'],
  ['Beginning of combat.', 'combat', 'beginning-of-combat'], ['After attackers are declared.', 'combat', 'declare-attackers'],
  ["We're in declare blockers.", 'combat', 'declare-blockers'], ['After blocks.', 'combat', 'declare-blockers'],
  ['First strike combat damage.', 'combat', 'first-strike-combat-damage'], ['Regular combat damage.', 'combat', 'combat-damage'],
  ['End of combat.', 'combat', 'end-of-combat'], ['Postcombat main.', 'postcombat-main'],
  ['Second main phase.', 'postcombat-main'], ['At the end step.', 'ending', 'end-step']
]) add('phase_step', message, { facts: { phase, ...(step ? { step } : {}) }, absentFacts: ['priorityHolder', 'stackEmpty'] });

add('phase_step', "We're between first strike damage and regular damage.", { facts: { phase: 'combat' }, ambiguity: true, absentFacts: ['priorityHolder', 'stackEmpty'] });
add('phase_step', 'Before blockers are declared.', { facts: { phase: 'combat', step: 'declare-attackers' }, absentFacts: ['priorityHolder', 'stackEmpty'] });

for (const [message, priorityHolder] of [
  ['I have priority.', 'user'], ['They have priority.', 'opponent'], ['I get priority here.', 'user'],
  ['My opponent passed priority to me.', 'user'], ['Priority is with my opponent.', 'opponent'],
  ['I am the player with priority.', 'user'], ['My opponent has priority right now.', 'opponent'],
  ['They passed, so I have priority.', 'user']
]) add('priority', message, { facts: { priorityHolder }, absentFacts: ['turn', 'phase', 'step', 'stackEmpty'] });
add('priority', 'Neither player has said who has priority.', { absentFacts: ['turn', 'phase', 'step', 'priorityHolder', 'stackEmpty'], ambiguity: true });
add('priority', 'I am waiting for priority.', { absentFacts: ['turn', 'phase', 'step', 'priorityHolder', 'stackEmpty'] });

for (const entry of [
  ['I cast Murder.', 'Murder', null, 'user'], ['Murder is on the stack.', 'Murder', null, null],
  ['I cast Murder targeting Grizzly Bears.', 'Murder', 'Grizzly Bears', 'user'],
  ['My opponent cast Lightning Bolt targeting me.', 'Lightning Bolt', 'user', 'opponent'],
  ['Giant Growth is on the stack targeting Colossal Dreadmaw.', 'Giant Growth', 'Colossal Dreadmaw', null],
  ['They cast Negate targeting Divination.', 'Negate', 'Divination', 'opponent'],
  ['I put Cancel on the stack targeting Negate.', 'Cancel', 'Negate', 'user'],
  ['My opponent responds with Murder on my Grizzly Bears.', 'Murder', 'Grizzly Bears', 'opponent'],
  ['I cast Divination.', 'Divination', null, 'user'], ['Lightning Bolt targeting my opponent is on the stack.', 'Lightning Bolt', 'opponent', null]
]) {
  const [message, source, target, controller] = entry;
  add('single_stack', message, { cards: [source, ...(target && !['user', 'opponent'].includes(target) ? [target] : [])], stack: source === 'Negate' && target === 'Divination' ? [source, target] : [source], targets: target ? [{ source, target }] : [], facts: { stackEmpty: false }, absentFacts: ['turn', 'phase', 'step', 'priorityHolder'] });
}

for (const [message, stack, targets] of [
  ['I cast Divination, he Negates it, then I Cancel his Negate.', ['Cancel', 'Negate', 'Divination'], [{ source: 'Cancel', target: 'Negate' }, { source: 'Negate', target: 'Divination' }]],
  ['Bolt, then Counterspell on Bolt, then Negate on Counterspell.', ['Negate', 'Counterspell', 'Bolt'], [{ source: 'Negate', target: 'Counterspell' }, { source: 'Counterspell', target: 'Bolt' }]],
  ['He casts Murder on Bears and I respond with Giant Growth.', ['Giant Growth', 'Murder'], [{ source: 'Murder', target: 'Bears' }]],
  ['Divination is on the stack. Opponent responds with Negate. I respond with Cancel.', ['Cancel', 'Negate', 'Divination'], [{ source: 'Cancel', target: 'Negate' }, { source: 'Negate', target: 'Divination' }]],
  ['Bottom to top is Divination, Negate, Cancel.', ['Cancel', 'Negate', 'Divination'], []],
  ['Top is Cancel, under it Negate, and Divination is bottom.', ['Cancel', 'Negate', 'Divination'], []],
  ['They Bolt me; I respond with Negate; they respond with Cancel.', ['Cancel', 'Negate', 'Bolt'], [{ source: 'Negate', target: 'Bolt' }, { source: 'Cancel', target: 'Negate' }]],
  ['Murder targets Bears, then Giant Growth targets Bears in response.', ['Giant Growth', 'Murder'], [{ source: 'Murder', target: 'Bears' }, { source: 'Giant Growth', target: 'Bears' }]],
  ['I cast one Divination, then another Divination in response.', ['Divination', 'Divination'], []],
  ['Cancel responds to Negate, which responds to Divination.', ['Cancel', 'Negate', 'Divination'], [{ source: 'Cancel', target: 'Negate' }, { source: 'Negate', target: 'Divination' }]]
]) add('multi_stack', message, { cards: [...new Set([...stack, ...targets.flatMap(({ target }) => ['Bears'].includes(target) ? [target] : [])])], stack, targets, facts: { stackEmpty: false }, absentFacts: ['turn', 'phase', 'step', 'priorityHolder'] });

for (const [message, attackers, blockers = [], cards = [...attackers, ...blockers.map((item) => item.blocker)]] of [
  ['I attack with Colossal Dreadmaw.', ['Colossal Dreadmaw']],
  ['He attacks me with Grizzly Bears.', ['Grizzly Bears']],
  ['He blocks Dreadmaw with Grizzly Bears.', [], [{ blocker: 'Grizzly Bears', attacker: 'Dreadmaw' }]],
  ['Dreadmaw attacks Bob and Bears blocks it.', ['Dreadmaw'], [{ blocker: 'Bears', attacker: 'Dreadmaw' }]],
  ['I attack with Dreadmaw and Llanowar Elves; Bears blocks the Elves.', ['Dreadmaw', 'Llanowar Elves'], [{ blocker: 'Bears', attacker: 'Llanowar Elves' }]],
  ['My Grizzly Bears attacks and their Grizzly Bears blocks it.', ['Grizzly Bears'], [{ blocker: 'Grizzly Bears', attacker: 'Grizzly Bears' }]],
  ['Colossal Dreadmaw and Grizzly Bears are attacking.', ['Colossal Dreadmaw', 'Grizzly Bears']],
  ['Opponent attacks with Dreadmaw; I block with Bears.', ['Dreadmaw'], [{ blocker: 'Bears', attacker: 'Dreadmaw' }]],
  ['Dreadmaw is attacking me with no blockers declared yet.', ['Dreadmaw']],
  ['After blocks I cast Murder on Bears.', [], [], ['Murder', 'Bears']],
  ['Bears blocks Dreadmaw and Elves blocks Bears.', [], [{ blocker: 'Bears', attacker: 'Dreadmaw' }, { blocker: 'Elves', attacker: 'Bears' }]],
  ['I swing with Dreadmaw at Bob.', ['Dreadmaw']],
  ['My opponent swings with two Grizzly Bears.', ['Grizzly Bears', 'Grizzly Bears']],
  ['One Bears blocks Dreadmaw and another Bears blocks Elves.', [], [{ blocker: 'Bears', attacker: 'Dreadmaw' }, { blocker: 'Bears', attacker: 'Elves' }]]
]) add('combat', message, { cards, attackers, blockers, facts: message.includes('cast Murder') ? { stackEmpty: false } : {}, absentFacts: ['turn', 'priorityHolder', ...(message.includes('cast Murder') ? [] : ['stackEmpty'])] });

const stackKnown = { turn: null, phase: null, step: null, priorityHolder: null, stack: { known: true, empty: false, items: [{ name: 'Divination' }] }, combat: {} };
for (const [message, field, proposedValueText] of [
  ['I meant empty.', 'stack', 'empty'], ['Actually the stack is empty.', 'stack', 'empty'],
  ["No, it's my turn.", 'turn', 'user'], ['I meant declare blockers.', 'step', 'declare blockers'],
  ["No, I said opponent's turn.", 'turn', 'opponent'], ['Actually Murder is on the stack targeting Grizzly Bears.', 'stack', 'Murder'],
  ["Scratch that, Murder isn't on the stack.", 'stack', 'empty'], ['Actually Murder targets Dreadmaw, not Bears.', 'target', 'Dreadmaw'],
  ['No, priority is mine.', 'priority', 'user'], ['Correction: we are postcombat main.', 'phase', 'postcombat main'],
  ['I misspoke; the stack is not empty.', 'stack', 'not empty'], ['Change that to the end step.', 'step', 'end step']
]) add('correction', message, { correction: true, correctionField: field, correctionValue: proposedValueText, cards: message.includes('Murder') ? ['Murder', ...(message.includes('Grizzly Bears') ? ['Grizzly Bears'] : []), ...(message.includes('Dreadmaw') ? ['Dreadmaw'] : [])] : [] }, { knownState: stackKnown, pendingQuestion: { key: 'stack-items', text: 'What spell or ability is currently on the stack?' } });

for (const [message, raw] of [
  ['My opponent casts Murdar.', 'Murdar'], ['Grizly Bears is attacking.', 'Grizly Bears'],
  ['Colosal Dreadmaw attacks.', 'Colosal Dreadmaw'], ['I cast Divin.', 'Divin'],
  ['Nagate is on the stack.', 'Nagate'], ['I target Llanowr Elves.', 'Llanowr Elves'],
  ['Counterspel targets Bolt.', 'Counterspel'], ['Gient Growth targets Bears.', 'Gient Growth']
]) add('card_preservation', message, { cards: [raw], preserveRaw: [raw], absentFacts: ['turn', 'phase', 'step', 'priorityHolder'] });

cases.find((test) => test.message === 'I target Llanowr Elves.').expected.ambiguity = true;

for (const message of [
  'I cast a spell.', 'He blocks.', 'I respond.', 'Bears attacks.', 'He targets it.',
  'They cast something on my creature.', 'A creature attacks somebody.', 'There is an ability on the stack.'
]) add('ambiguity', message, { ambiguity: true, absentFacts: ['turn', 'phase', 'step', 'priorityHolder'] });

for (const message of [
  'Can I cast Bolt here?', 'Does Dreadmaw trample over?', 'Does Bob lose?', 'Is Murder legal?',
  'Who wins combat?', 'How much damage gets through?', 'Can Bears block Dreadmaw?',
  'Will Murder destroy it?', 'Is this play allowed?', 'What happens when Divination resolves?'
]) add('adversarial', message, { noRuling: true, absentFacts: ['turn', 'phase', 'step', 'priorityHolder', 'stackEmpty'] });

for (const message of ['Who wins combat?', 'How much damage gets through?', 'Will Murder destroy it?']) {
  cases.find((test) => test.message === message).expected.ambiguity = true;
}

export const INSTAJUDGE_AI_LIVE_CORPUS = Object.freeze(cases);
export default INSTAJUDGE_AI_LIVE_CORPUS;
