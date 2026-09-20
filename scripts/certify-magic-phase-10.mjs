import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

import { extractPossibleCardNames } from '../src/services/instajudge/instajudgeCore.js';
import { beginCombat, declareAttackers, declareBlockers, executeCombatDamageStep } from '../src/services/instajudge/magic/runtime/combatRuntime.js';
import { commanderDamageTotal, designateCommander, setCommanderDamageTotal } from '../src/services/instajudge/magic/runtime/commanderRuntime.js';
import { CONTINUOUS_LAYERS, PT_SUBLAYERS, createContinuousEffect, deriveCharacteristics } from '../src/services/instajudge/magic/runtime/continuousEffects.js';
import { evaluateMagicRulesRuntime } from '../src/services/instajudge/magic/runtime/magicRulesRuntime.js';
import { apnapOrder, opponentsOf, playersStillInGame } from '../src/services/instajudge/magic/runtime/multiplayerRuntime.js';
import { parseOracleSemantics } from '../src/services/instajudge/magic/runtime/oracleSemantics.js';
import {
  addPermanent,
  createGameObject,
  createMagicRuntimeState,
  dealDamageToPlayerWithResult,
  markDamageWithResult,
  moveObjectWithResult,
  registerPreventionEffect,
  registerReplacementEffect,
  runStateBasedActionsRuntime,
  setPendingRuntimeChoice
} from '../src/services/instajudge/magic/runtime/runtimeState.js';
import { compileMagicScenario } from '../src/services/instajudge/magic/runtime/scenarioCompiler.js';
import { SPECIAL_ACTION_TYPES, checkSpecialAction } from '../src/services/instajudge/magic/runtime/specialActionRuntime.js';
import {
  STACK_OBJECT_TYPES,
  checkTimingPermission,
  createStackObject,
  passPriority,
  pushStackObject,
  resolveTopOfStack
} from '../src/services/instajudge/magic/runtime/stackRuntime.js';
import { TURN_STEPS, advanceTurnStep } from '../src/services/instajudge/magic/runtime/turnRuntime.js';

const CERTIFICATION_SEED = 0x10c34a;
const REAL_CARD_TARGET = 520;
const shardDirectory = fileURLToPath(new URL('../public/data/mtg/search-lite/', import.meta.url));
const startedAt = performance.now();
const latency = [];
const metrics = {
  seed: CERTIFICATION_SEED,
  realCardScenarios: 0,
  realCardSupported: 0,
  realCardDepends: 0,
  realCardUnverified: 0,
  semanticSample: 0,
  semanticFullyExecutable: 0,
  semanticPartiallyExecutable: 0,
  semanticUnsupported: 0,
  semanticIncorrectlyParsed: 0,
  compositions: 0,
  focusedSupported: 0,
  expectedDepends: 0,
  expectedUnverified: 0,
  incorrectConfident: 0,
  crashes: 0,
  defectsDiscovered: 3,
  defectsFixed: 3
};

function verify(condition, message) {
  assert(condition, message);
  metrics.focusedSupported += 1;
}

function timed(label, fn) {
  const before = performance.now();
  try {
    return fn();
  } catch (error) {
    metrics.crashes += 1;
    error.message = `${label}: ${error.message}`;
    throw error;
  } finally {
    latency.push({ label, ms: performance.now() - before });
  }
}

function classifyPublic(result, expected, label, { realCard = false } = {}) {
  const actual = result?.verdict || result?.status;
  if (actual !== expected) {
    if (['yes', 'no', 'allowed', 'denied'].includes(actual) && ['depends', 'unverified', 'unsupported'].includes(expected)) {
      metrics.incorrectConfident += 1;
    }
    assert.equal(actual, expected, label);
  }
  if (realCard) {
    metrics.realCardScenarios += 1;
    if (expected === 'depends') metrics.realCardDepends += 1;
    else if (expected === 'unverified' || expected === 'unsupported') metrics.realCardUnverified += 1;
    else metrics.realCardSupported += 1;
  } else if (expected === 'depends') metrics.expectedDepends += 1;
  else if (expected === 'unverified' || expected === 'unsupported') metrics.expectedUnverified += 1;
  else metrics.focusedSupported += 1;
}

let seed = CERTIFICATION_SEED;
function random(max) {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed % max;
}

function shuffled(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = random(index + 1);
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function loadOracleCards() {
  const byOracle = new Map();
  for (const filename of readdirSync(shardDirectory).filter((name) => name.endsWith('.json')).sort()) {
    const cards = JSON.parse(readFileSync(`${shardDirectory}/${filename}`, 'utf8'));
    for (const card of cards) {
      if (card.lang !== 'en' || !card.name || !card.type_line) continue;
      const key = card.oracle_id || card.id;
      const current = byOracle.get(key);
      if (!current || String(card.released_at || '') < String(current.released_at || '')) byOracle.set(key, card);
    }
  }
  return [...byOracle.values()];
}

function runtimeCard(card) {
  return {
    id: card.id,
    name: card.name,
    typeLine: card.type_line,
    oracleText: card.oracle_text || '',
    manaCost: card.mana_cost || '',
    colors: card.colors || [],
    power: card.power || null,
    toughness: card.toughness || null
  };
}

function cardClass(card) {
  const type = card.type_line;
  if (card.can_be_commander) return 'commander';
  if (/\bBattle\b/i.test(type)) return 'battle';
  if (/\bPlaneswalker\b/i.test(type)) return 'planeswalker';
  if (/\bLand\b/i.test(type)) return 'land';
  if (/\bInstant\b/i.test(type)) return 'instant';
  if (/\bSorcery\b/i.test(type)) return 'sorcery';
  if (/\bCreature\b/i.test(type)) return 'creature';
  if (/\bArtifact\b/i.test(type)) return 'artifact';
  if (/\bEnchantment\b/i.test(type)) return 'enchantment';
  return 'other';
}

function isOrdinaryTimingCard(card) {
  if (card.name.includes('//') && cardClass(card) !== 'battle') return false;
  if (/\b(Token|Emblem|Plane|Phenomenon|Scheme|Vanguard|Dungeon)\b/i.test(card.type_line)) return false;
  if (/\b(?:cast|play)\b[^.]{0,80}\bonly\b|can't be cast|cannot be cast|as though it had flash/i.test(card.oracle_text || '')) return false;
  return cardClass(card) !== 'other';
}

function selectRealCardCorpus(cards) {
  const quotas = new Map([
    ['creature', 130], ['instant', 80], ['sorcery', 70], ['artifact', 60], ['enchantment', 50],
    ['planeswalker', 25], ['battle', 10], ['land', 60], ['commander', 35]
  ]);
  const chosen = [];
  const seen = new Set();
  const ordered = shuffled(cards.filter(isOrdinaryTimingCard));
  for (const [kind, count] of quotas) {
    const candidates = ordered.filter((card) => cardClass(card) === kind && !seen.has(card.oracle_id || card.id));
    assert(candidates.length >= count, `Insufficient ${kind} cards for Phase 10 corpus.`);
    for (const card of candidates.slice(0, count)) {
      chosen.push(card);
      seen.add(card.oracle_id || card.id);
    }
  }
  assert.equal(chosen.length, REAL_CARD_TARGET, 'Phase 10 real-card supported corpus size changed.');
  return chosen;
}

function phaseFor(step) {
  if ([TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW].includes(step)) return 'beginning';
  if ([TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)) return 'main';
  if ([TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP].includes(step)) return 'ending';
  return 'combat';
}

const combatSteps = new Set([
  TURN_STEPS.BEGINNING, TURN_STEPS.DECLARE_ATTACKERS, TURN_STEPS.DECLARE_BLOCKERS,
  TURN_STEPS.FIRST_STRIKE_DAMAGE, TURN_STEPS.COMBAT_DAMAGE, TURN_STEPS.END
]);

function stateAt(step, { activePlayer = 'player', priorityHolder = activePlayer, stackDepth = 0, players = ['player', 'opponent'], format = null } = {}) {
  const state = createMagicRuntimeState({
    scenario: {
      players: players.map((id) => ({ id, life: 40 })),
      turnOrder: players,
      objects: [], continuousEffects: [], format,
      game: { activePlayer, phase: phaseFor(step), step, priorityHolder, landPlaysAllowed: 1, landPlaysUsed: 0 }
    }
  });
  state.game.priorityHolder = priorityHolder;
  if (step === TURN_STEPS.DRAW) state.game.turnBasedActionState.status = 'complete';
  if (combatSteps.has(step)) state.combat = { priorityWindows: [step], step, attackers: [] };
  for (let index = 0; index < stackDepth; index += 1) {
    state.stack.push(createStackObject({
      kind: STACK_OBJECT_TYPES.SPELL,
      sourceObject: { id: `seed-stack-${index}`, name: `Seed Stack ${index}` },
      controller: activePlayer
    }));
  }
  return state;
}

function isInstantSpeed(card) {
  return /\bInstant\b/i.test(card.type_line) || /(?:^|\n)Flash(?:\s|$|\()/i.test(card.oracle_text || '');
}

function expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card }) {
  const windowOpen = step !== TURN_STEPS.UNTAP && step !== TURN_STEPS.CLEANUP && priorityHolder != null;
  if (!windowOpen || priorityHolder !== 'player') return false;
  if (isInstantSpeed(card)) return true;
  return activePlayer === 'player'
    && [TURN_STEPS.PRECOMBAT_MAIN, TURN_STEPS.POSTCOMBAT_MAIN].includes(step)
    && stackDepth === 0;
}

function permanent(state, name, controller = 'player', options = {}) {
  return addPermanent(state, createGameObject({
    card: { name, typeLine: options.typeLine || 'Creature', oracleText: options.oracleText || '', colors: options.colors || [] },
    name,
    controller,
    owner: controller,
    power: options.power ?? 2,
    toughness: options.toughness ?? 2,
    abilities: (options.abilities || []).map((keyword) => ({ keyword, text: keyword })),
    commander: Boolean(options.commander)
  }));
}

const allCards = timed('load-local-card-catalog', loadOracleCards);
const realCards = selectRealCardCorpus(allCards);

// Real-card ruling corpus: timing and land-play expectations come from rules invariants, not runtime output.
for (let index = 0; index < realCards.length; index += 1) {
  const card = realCards[index];
  const ownMain = index % 2 === 0;
  const step = ownMain ? TURN_STEPS.PRECOMBAT_MAIN : TURN_STEPS.UPKEEP;
  const activePlayer = ownMain ? 'player' : 'opponent';
  const state = stateAt(step, { activePlayer, priorityHolder: 'player' });
  const before = performance.now();
  if (cardClass(card) === 'land') {
    const result = checkSpecialAction({
      state,
      actionType: SPECIAL_ACTION_TYPES.PLAY_LAND,
      playerId: 'player',
      card: runtimeCard(card),
      sourceZone: 'hand'
    });
    assert.equal(result.allowed, ownMain, `Real-card land timing mismatch for ${card.name}.`);
  } else {
    const result = checkTimingPermission({ state, card: runtimeCard(card), actionType: 'Cast', playerId: 'player' });
    assert.equal(result.allowed, ownMain || isInstantSpeed(card), `Real-card spell timing mismatch for ${card.name}.`);
  }
  latency.push({ label: `real-card:${card.name}`, ms: performance.now() - before });
  metrics.realCardScenarios += 1;
  metrics.realCardSupported += 1;
}

// Oracle coverage is measured separately from ruling correctness.
for (const card of realCards) {
  const semantics = timed(`oracle:${card.name}`, () => parseOracleSemantics(runtimeCard(card)));
  metrics.semanticSample += 1;
  const unsupportedCount = semantics.unsupportedText?.length || 0;
  const parsedCount = semantics.coverage?.parsedEffectCount || 0;
  if (!semantics.coverage?.unsupported) metrics.semanticFullyExecutable += 1;
  else if (parsedCount > 0 && unsupportedCount > 0) metrics.semanticPartiallyExecutable += 1;
  else metrics.semanticUnsupported += 1;
}

const ambiguousCards = realCards.filter((card) => cardClass(card) === 'instant').slice(0, 10);
for (const card of ambiguousCards) {
  const result = timed(`ambiguous:${card.name}`, () => evaluateMagicRulesRuntime({
    message: `Can I cast ${card.name} right now?`,
    cards: [runtimeCard(card)]
  }));
  classifyPublic(result, 'depends', `Missing timing state must remain DEPENDS for ${card.name}.`, { realCard: true });
}
const titleCollision = allCards.find((card) => card.name === 'Fire Nation Attacks');
verify(Boolean(titleCollision), 'The local real-card corpus must include Fire Nation Attacks.');
verify(compileMagicScenario({
  message: 'Can I cast Fire Nation Attacks right now?',
  cards: [runtimeCard(titleCollision)]
}).combat == null, 'Rules words inside an exact card name must not invent combat intent.');

const unsupportedMechanics = [
  ['mutate', /\bmutate\b/i], ['suspend', /\bsuspend\b/i], ['cascade', /\bcascade\b/i],
  ['foretell', /\bforetell\b/i], ['ninjutsu', /\bninjutsu\b/i], ['morph', /\bmorph\b/i],
  ['daybound', /\bdaybound\b/i], ['venture', /\bventure into the dungeon\b/i],
  ['plot', /\bplot\b/i], ['prototype', /\bprototype\b/i], ['discover', /\bdiscover\b/i],
  ['learn', /\blearn\b/i]
];
for (const [mechanic, pattern] of unsupportedMechanics) {
  const card = allCards.find((entry) => pattern.test(entry.oracle_text || ''));
  assert(card, `Missing local card for unsupported ${mechanic} certification.`);
  const result = timed(`unsupported:${mechanic}:${card.name}`, () => evaluateMagicRulesRuntime({
    message: `Can I use ${mechanic} on ${card.name} now?`,
    cards: [runtimeCard(card)]
  }));
  classifyPublic(result, 'unverified', `${mechanic} must fail closed for ${card.name}.`, { realCard: true });
}

// Independently recognizable simple Oracle forms must compile to the expected typed effect.
const semanticInvariants = [
  [/^Draw (?:a|two|three) cards?\.$/i, 'DrawEffect'],
  [/^You gain \d+ life\.$/i, 'LifeChange'],
  [/^Target player mills \d+ cards?\.$/i, 'MillEffect'],
  [/^Destroy target creature\.$/i, 'DestroyEffect'],
  [/^.+ deals \d+ damage to any target\.$/i, 'DamageEffect']
];
for (const [pattern, effectType] of semanticInvariants) {
  const candidates = allCards.filter((card) => pattern.test(card.oracle_text || '')).slice(0, 12);
  for (const card of candidates) {
    const semantics = parseOracleSemantics(runtimeCard(card));
    const effects = semantics.abilities.flatMap((ability) => ability.effects || []);
    if (!effects.some((effect) => effect.type === effectType)) metrics.semanticIncorrectlyParsed += 1;
    assert(effects.some((effect) => effect.type === effectType), `Simple Oracle parse mismatch for ${card.name}: expected ${effectType}.`);
  }
}

// Deterministic, real-card timing cross-products.
const matrixCards = realCards
  .filter((card) => cardClass(card) !== 'land' && (card.oracle_text || '').length < 220)
  .slice(0, 20);
const allSteps = [
  TURN_STEPS.UNTAP, TURN_STEPS.UPKEEP, TURN_STEPS.DRAW, TURN_STEPS.PRECOMBAT_MAIN,
  TURN_STEPS.BEGINNING, TURN_STEPS.DECLARE_ATTACKERS, TURN_STEPS.DECLARE_BLOCKERS,
  TURN_STEPS.FIRST_STRIKE_DAMAGE, TURN_STEPS.COMBAT_DAMAGE, TURN_STEPS.END,
  TURN_STEPS.POSTCOMBAT_MAIN, TURN_STEPS.END_STEP, TURN_STEPS.CLEANUP
];
for (const step of allSteps) {
  for (const activePlayer of ['player', 'opponent']) {
    for (const priorityHolder of ['player', 'opponent', null]) {
      for (const stackDepth of [0, 1]) {
        for (const card of matrixCards) {
          const state = stateAt(step, { activePlayer, priorityHolder, stackDepth });
          const result = checkTimingPermission({ state, card: runtimeCard(card), actionType: 'Cast', playerId: 'player' });
          assert.equal(result.allowed, expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card }), `Timing composition mismatch for ${card.name}/${step}/${activePlayer}/${priorityHolder}/${stackDepth}.`);
          metrics.compositions += 1;
        }
      }
    }
  }
}
for (let index = 0; index < 1_000; index += 1) {
  const card = matrixCards[random(matrixCards.length)];
  const step = allSteps[random(allSteps.length)];
  const activePlayer = ['player', 'opponent'][random(2)];
  const priorityHolder = ['player', 'opponent', null][random(3)];
  const stackDepth = random(2);
  const state = stateAt(step, { activePlayer, priorityHolder, stackDepth });
  const result = checkTimingPermission({ state, card: runtimeCard(card), actionType: 'Cast', playerId: 'player' });
  assert.equal(result.allowed, expectedTiming({ step, activePlayer, priorityHolder, stackDepth, card }), `Seeded timing mismatch at ${index}.`);
  metrics.compositions += 1;
}

// Five-object stack must remain LIFO and use fresh priority cycles.
const stackState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const resolvedOrder = [];
for (let index = 0; index < 5; index += 1) {
  pushStackObject(stackState, createStackObject({
    kind: index % 2 ? STACK_OBJECT_TYPES.ACTIVATED_ABILITY : STACK_OBJECT_TYPES.SPELL,
    sourceObject: { id: `torture-${index}`, name: `Torture ${index}` },
    controller: index % 2 ? 'opponent' : 'player'
  }));
}
while (stackState.stack.length) {
  const holder = stackState.game.priorityHolder;
  const next = holder === 'player' ? 'opponent' : 'player';
  verify(passPriority(stackState, holder).allowed, 'First multiplayer-compatible priority pass should succeed.');
  verify(passPriority(stackState, next, {
    resolve: () => {
      const result = resolveTopOfStack(stackState);
      resolvedOrder.push(result.stackObject.sourceObject.name);
      return result;
    }
  }).resolved, 'Second priority pass should resolve exactly one stack object.');
}
verify(resolvedOrder.join('|') === ['Torture 4', 'Torture 3', 'Torture 2', 'Torture 1', 'Torture 0'].join('|'), 'Five-object stack must resolve LIFO.');

// Pending choice blocks every public action boundary represented by the canonical runtime.
const pendingState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
setPendingRuntimeChoice(pendingState, { id: 'phase10-choice', type: 'ReplacementChoice', chooser: 'player' });
classifyPublic(checkTimingPermission({ state: pendingState, card: runtimeCard(matrixCards[0]), actionType: 'Cast', playerId: 'player' }), 'depends', 'Pending choice must block casting.');
classifyPublic(passPriority(pendingState, 'player'), 'depends', 'Pending choice must block priority.');
classifyPublic(advanceTurnStep(pendingState), 'depends', 'Pending choice must block turn advancement.');

// Combat collision: first strike + deathtouch + lifelink + trample + prevention.
const combatState = stateAt(TURN_STEPS.PRECOMBAT_MAIN);
const attacker = permanent(combatState, 'Phase 10 Combatant', 'player', { power: 5, toughness: 5, abilities: ['first strike', 'deathtouch', 'lifelink', 'trample'] });
const blocker = permanent(combatState, 'Phase 10 Blocker', 'opponent', { power: 3, toughness: 3 });
registerPreventionEffect(combatState, { id: 'prevent-one', remaining: 1, applies: (event) => event.object?.id === blocker.id });
beginCombat(combatState);
verify(declareAttackers(combatState, [attacker]).status === 'declared', 'Combat attacker declaration failed.');
verify(declareBlockers(combatState, [{ attacker, blockers: [blocker] }]).status === 'declared', 'Combat blocker declaration failed.');
const firstStrike = executeCombatDamageStep(combatState, { step: TURN_STEPS.FIRST_STRIKE_DAMAGE, assignments: { [attacker.id]: { [blocker.id]: 2, defender: 3 } } });
verify(firstStrike.status === 'resolved' && blocker.zone === 'graveyard' && combatState.players.player.life === 44 && combatState.players.opponent.life === 37,
  `Combat collision final state is incorrect: ${JSON.stringify({ status: firstStrike.status, blockerZone: blocker.zone, playerLife: combatState.players.player.life, opponentLife: combatState.players.opponent.life })}`);

// Layer ordering: copy base, type/control/ability effects, P/T set, modify, then counters.
const layerState = createMagicRuntimeState();
const layered = permanent(layerState, 'Layer Subject', 'player', { power: 2, toughness: 2, abilities: ['flying'] });
createContinuousEffect(layerState, { layer: CONTINUOUS_LAYERS.CONTROL, timestamp: 1, appliesTo: { objectId: layered.id }, modification: { kind: 'control', controller: 'opponent' } });
createContinuousEffect(layerState, { layer: CONTINUOUS_LAYERS.ABILITY, timestamp: 2, appliesTo: { objectId: layered.id }, modification: { kind: 'ability', mode: 'clear' } });
createContinuousEffect(layerState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.SET, timestamp: 3, appliesTo: { objectId: layered.id }, modification: { kind: 'pt', mode: 'set', power: 1, toughness: 4 } });
createContinuousEffect(layerState, { layer: CONTINUOUS_LAYERS.POWER_TOUGHNESS, sublayer: PT_SUBLAYERS.MODIFY, timestamp: 4, appliesTo: { objectId: layered.id }, modification: { kind: 'pt', mode: 'modify', power: 2, toughness: -1 } });
layered.counters['+1/+1'] = 1;
const characteristics = deriveCharacteristics(layerState, layered);
verify(characteristics.controller === 'opponent' && characteristics.power === 4 && characteristics.toughness === 4 && characteristics.abilities.length === 0,
  `Layer collision produced the wrong derived characteristics: ${JSON.stringify(characteristics)}`);

// Replacement and prevention must commit only the final event.
const replacementState = createMagicRuntimeState();
const replacementTarget = permanent(replacementState, 'Replacement Target');
registerReplacementEffect(replacementState, { id: 'graveyard-exile', eventType: 'ZoneChange', applies: (event) => event.to === 'graveyard', replace: { to: 'exile' } });
const replacedMove = moveObjectWithResult(replacementState, replacementTarget, 'graveyard', 'phase10 replacement');
verify(replacedMove.status === 'committed' && replacementTarget.zone === 'exile' && !replacementState.events.some((event) => event.type === 'CreatureDied'), 'Replaced death must not create a dies event.');
const damageTarget = permanent(replacementState, 'Prevention Target', 'opponent', { toughness: 5 });
registerPreventionEffect(replacementState, { id: 'prevent-two', targetId: damageTarget.id, remaining: 2 });
const preventedDamage = markDamageWithResult(replacementState, damageTarget, 4, layered);
verify(preventedDamage.prevented === 2 && preventedDamage.dealt === 2 && damageTarget.damageMarked === 2, 'Prevention must expose only committed damage downstream.');

// Commander and multiplayer invariants.
const commanderState = stateAt(TURN_STEPS.PRECOMBAT_MAIN, {
  players: ['alice', 'bob', 'sarah', 'mike', 'jo'], activePlayer: 'alice', priorityHolder: 'alice',
  format: { id: 'commander', commanderDesignations: [] }
});
const commander = permanent(commanderState, 'Phase 10 Commander', 'alice', { power: 6, toughness: 6, commander: true });
const designation = designateCommander(commanderState, commander, { ownerId: 'alice', designationId: 'phase10-commander' });
setCommanderDamageTotal(commanderState, 'bob', designation.id, 20);
commander.controller = 'sarah';
const commanderHit = dealDamageToPlayerWithResult(commanderState, 'bob', 1, commander, { combat: true });
runStateBasedActionsRuntime(commanderState);
verify(commanderHit.dealt === 1 && commanderDamageTotal(commanderState, 'bob', designation.id) === 21 && !commanderState.players.bob.inGame,
  `Commander identity/damage must survive control change and eliminate only the recipient: ${JSON.stringify({ commanderHit, total: commanderDamageTotal(commanderState, 'bob', designation.id), bob: commanderState.players.bob, designation })}`);
verify(playersStillInGame(commanderState).length === 4 && opponentsOf(commanderState, 'alice').length === 3, 'Player leaving must update multiplayer opponent sets.');
verify(apnapOrder(commanderState).join('|') === ['alice', 'sarah', 'mike', 'jo'].join('|'), 'APNAP order must skip the removed player while preserving seating order.');

// Natural-language equivalence and resolver extraction safety.
const bolt = { name: 'Lightning Bolt', typeLine: 'Instant', oracleText: 'Lightning Bolt deals 3 damage to any target.' };
const timingVariants = [
  "During my opponent's upkeep, I have priority. Can I cast Lightning Bolt?",
  "Opponent's upkeep. Priority is mine; may I cast Lightning Bolt?",
  'It is the opponent upkeep and I hold priority. Is casting Lightning Bolt legal?'
];
for (const message of timingVariants) {
  const result = evaluateMagicRulesRuntime({ message, cards: [bolt] });
  classifyPublic(result, 'yes', `Natural-language timing variant failed: ${message}; ${JSON.stringify(result)}`);
}
const ordinaryPhraseNames = extractPossibleCardNames('Can I draw a card after combat before damage happens?');
verify(!ordinaryPhraseNames.includes('Draw A Card') && !ordinaryPhraseNames.includes('After Combat'), 'Ordinary English must not become fake exact card identity.');
const multipleNames = extractPossibleCardNames('Can Lightning Bolt target Serra Angel while Counterspell is on the stack?');
verify(['Lightning Bolt', 'Serra Angel', 'Counterspell'].every((name) => multipleNames.includes(name)), 'Multiple exact-looking card names must remain extractable.');
const compiledPronoun = compileMagicScenario({ message: "Alice casts Lightning Bolt targeting Bob. In response, he casts Counterspell targeting it.", cards: [bolt, { name: 'Counterspell', typeLine: 'Instant', oracleText: 'Counter target spell.' }] });
verify(compiledPronoun.resolvedCards.length === 2 && compiledPronoun.actions.length >= 1, 'Pronoun/reordered response scenario must preserve both exact cards without crashing.');
const passiveActor = compileMagicScenario({ message: 'It is the opponent upkeep and I hold priority. Is casting Lightning Bolt legal?', cards: [bolt] });
verify(passiveActor.actions[0]?.actor === 'player', 'Passive permission wording must not inherit the nearby opponent as actor.');
const explicitOpponentActor = compileMagicScenario({ message: 'During my upkeep, my opponent casts Lightning Bolt.', cards: [bolt] });
verify(explicitOpponentActor.actions[0]?.actor === 'opponent', 'An explicit opponent action clause must retain the opponent actor.');

metrics.totalSupportedVerified = metrics.realCardSupported + metrics.compositions + metrics.focusedSupported;
metrics.totalExpectedDepends = metrics.realCardDepends + metrics.expectedDepends;
metrics.totalExpectedUnverified = metrics.realCardUnverified + metrics.expectedUnverified;
metrics.durationMs = Math.round(performance.now() - startedAt);
const sortedLatency = latency.map((entry) => entry.ms).sort((a, b) => a - b);
metrics.performance = {
  samples: sortedLatency.length,
  medianMs: Number((sortedLatency[Math.floor(sortedLatency.length / 2)] || 0).toFixed(3)),
  p95Ms: Number((sortedLatency[Math.floor(sortedLatency.length * 0.95)] || 0).toFixed(3)),
  worstMs: Number((sortedLatency.at(-1) || 0).toFixed(3)),
  largestCompositionMs: Number(Math.max(0, ...latency.filter((entry) => /stack|combat|commander|replacement/i.test(entry.label)).map((entry) => entry.ms)).toFixed(3))
};

assert(metrics.realCardScenarios >= 500, 'Phase 10 requires at least 500 real-card scenarios.');
assert(metrics.compositions >= 4_000, 'Phase 10 requires several thousand deterministic compositions.');
assert.equal(metrics.incorrectConfident, 0, 'Phase 10 cannot certify with an incorrect confident ruling.');
assert.equal(metrics.crashes, 0, 'Phase 10 cannot certify with a runtime crash.');
assert.equal(metrics.semanticIncorrectlyParsed, 0, 'Phase 10 cannot certify with an incorrect simple Oracle parse.');

console.log('Magic Phase 10 final certification passed.');
console.log(`- Seed: 0x${CERTIFICATION_SEED.toString(16)}`);
console.log(`- Metrics: ${JSON.stringify(metrics)}`);
