import { isPermanentType, normalizeMagicCard, normalizeMagicText } from './magicCards.js';

const PHASE_LABELS = Object.freeze({
  'precombat-main': 'Precombat Main',
  combat: 'Combat',
  'postcombat-main': 'Postcombat Main',
  beginning: 'Beginning Phase',
  ending: 'Ending Phase'
});

const STEP_LABELS = Object.freeze({
  untap: 'Untap',
  upkeep: 'Upkeep',
  draw: 'Draw',
  'beginning-of-combat': 'Beginning of Combat',
  'declare-attackers': 'Declare Attackers',
  'declare-blockers': 'Declare Blockers',
  'first-strike-combat-damage': 'First-Strike Damage',
  'combat-damage': 'Combat Damage',
  'end-of-combat': 'End of Combat',
  'end-step': 'End Step',
  cleanup: 'Cleanup'
});

const COMBAT_WINDOW_LABELS = Object.freeze({
  'before-attackers': 'Before attackers are declared',
  'after-attackers': 'After attackers are declared',
  'before-blockers': 'Before blockers are declared',
  'after-blockers': 'After blockers are declared',
  'between-damage-steps': 'After first-strike damage, before normal combat damage'
});

export function createMagicConversationState() {
  return {
    activePlayer: null,
    phase: null,
    step: null,
    priorityHolder: null,
    priorityKnown: false,
    stack: { known: false, empty: null, items: [] },
    stackCollection: null,
    format: null,
    commander: null,
    notes: [],
    battlefield: [],
    combat: {
      known: false,
      active: false,
      window: null,
      attackingPlayer: null,
      defendingPlayer: null,
      attackersKnown: false,
      blockersKnown: false,
      identityAmbiguity: null,
      attackers: [],
      blocks: []
    },
    cards: []
  };
}

function cardKey(card = {}) {
  return String(card.oracle_id || card.id || card.name || '').trim().toLowerCase();
}

function mergeCards(current = [], incoming = []) {
  const seen = new Set();
  return [...current, ...incoming].filter((card) => {
    const key = cardKey(card);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function stackItemsFromCards(cards = [], message = '', knownCards = cards) {
  const text = normalizeMagicText(message);
  const explicitTopToBottom = /\btop\b|\bunderneath\b|\bbelow\b|\bbottom\b/.test(text);
  const normalizedCards = cards.map(normalizeMagicCard).filter((card) => card.name);
  const normalizedKnownCards = knownCards.map(normalizeMagicCard).filter((card) => card.name);
  const mentions = normalizedCards.flatMap((card) => {
    const escaped = card.normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...text.matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))].flatMap((match) => {
      const before = text.slice(Math.max(0, match.index - 32), match.index);
      if (/\btarget(?:ing|s)?\s+$/.test(before)) return [];
      return [{ card, index: match.index, end: match.index + match[0].length }];
    });
  }).sort((left, right) => left.index - right.index);
  const orderedMentions = mentions.length > 0
    ? mentions
    : normalizedCards.map((card, index) => ({ card, index, end: index }));
  const ordered = orderedMentions.filter((mention, index) => {
    const earlier = orderedMentions.slice(0, index).findLast((candidate) => candidate.card.id === mention.card.id);
    if (!earlier) return true;
    const between = text.slice(earlier.end, mention.index).trim();
    return /\b(?:another|a second|the other|two|2)\b/.test(between)
      || /^(?:,?\s*(?:and|then|above|below|underneath)\s*)$/.test(between);
  });
  const items = ordered.map((mention, index) => {
    const following = text.slice(mention.end, ordered[index + 1]?.index ?? text.length);
    const preceding = text.slice(ordered[index - 1]?.end ?? 0, mention.index);
    const actionWindow = `${preceding} ${following}`;
    const triggered = /\b(?:trigger|triggered ability)\b/.test(actionWindow);
    const activated = !triggered && /\b(?:activate|activated ability|ability)\b/.test(actionWindow);
    const targetTail = following.match(/^\s+(?:targeting|targets?)\s+(.+)$/)?.[1]?.trim() || '';
    const namedTarget = [...normalizedKnownCards]
      .sort((left, right) => right.normalizedName.length - left.normalizedName.length)
      .find((candidate) => targetTail === candidate.normalizedName || targetTail.startsWith(`${candidate.normalizedName} `));
    const targetDescriptor = namedTarget?.normalizedName
      || targetTail.match(/^(.+?)(?=\s+(?:and|underneath|below|above|then|is on the stack|what happens|who|can|will|does)\b|$)/)?.[1]?.trim()
      || null;
    const controllerWindow = text.slice(Math.max(0, mention.index - 48), mention.index);
    const controller = /\b(?:opponent|they|their)\b/.test(controllerWindow) ? 'opponent' : 'player';
    return {
      id: `verified-stack-${index + 1}`,
      kind: triggered ? 'triggered-ability' : activated ? 'activated-ability' : /\binstant|sorcery\b/.test(mention.card.normalizedType) ? 'spell' : 'ability-source',
      actionType: triggered ? 'TriggeredAbility' : activated ? 'Activate' : /\binstant|sorcery|creature|artifact|enchantment|planeswalker|battle\b/.test(mention.card.normalizedType) ? 'Cast' : 'Activate',
      name: mention.card.name,
      source: { kind: 'card', cardId: mention.card.id, name: mention.card.name },
      card: mention.card,
      controller,
      targets: targetDescriptor ? [{ type: 'TargetChoice', descriptor: targetDescriptor, objectId: null }] : [],
      position: index + 1,
      order: explicitTopToBottom ? 'top-to-bottom' : 'mention-order',
      responseTo: null
    };
  });
  return items.map((item, index) => ({ ...item, responseTo: items[index + 1]?.id || null }));
}

function inferPhase(text) {
  if (/\b(?:precombat|first) main(?: phase)?\b/.test(text)) return 'precombat-main';
  if (/\b(?:postcombat|second) main(?: phase)?\b/.test(text)) return 'postcombat-main';
  if (/\bcombat\b|\battack(?:s|ing|ed|ers?)?\b|\bblock(?:s|ing|ed|ers?)?\b/.test(text)) return 'combat';
  if (/\b(?:upkeep|draw step|untap step|beginning phase)\b/.test(text)) return 'beginning';
  if (/\b(?:end step|cleanup|ending phase)\b/.test(text)) return 'ending';
  return null;
}

function inferCombatStep(text) {
  if (/\bfirst[- ]strike (?:combat )?damage\b/.test(text)) return 'first-strike-combat-damage';
  if (/\bcombat damage\b|\bdamage step\b/.test(text)) return 'combat-damage';
  if (/\bend of combat\b/.test(text)) return 'end-of-combat';
  if (/\bbeginning of combat\b|\bbefore attackers?\b/.test(text)) return 'beginning-of-combat';
  if (/\bdeclare blockers? step\b/.test(text)) return 'declare-blockers';
  if (/\bbefore (?:i )?declare blockers?\b|\bbefore blockers?\b|\bafter attackers?\b|\battackers? (?:(?:have been|are|were) )?declared\b|\bdeclare attackers?(?: step)?\b/.test(text)) return 'declare-attackers';
  if (/\bdeclare blockers?\b|\bafter blockers?\b|\bblockers? (?:(?:have been|are|were) )?declared\b/.test(text)) return 'declare-blockers';
  return null;
}

function inferCombatWindow(text, step) {
  if (/\bafter first[- ]strike (?:combat )?damage\b|\bbefore normal (?:combat )?damage\b/.test(text)) return 'between-damage-steps';
  if (/\bafter blockers?\b|\bblockers? (?:(?:have been|are|were) )?declared\b/.test(text)) return 'after-blockers';
  if (/\bbefore blockers?\b/.test(text)) return 'before-blockers';
  if (/\bafter attackers?\b|\battackers? (?:(?:have been|are|were) )?declared\b/.test(text)) return 'after-attackers';
  if (/\bbefore attackers?\b/.test(text)) return 'before-attackers';
  if (step === 'beginning-of-combat') return 'before-attackers';
  return null;
}

function inferTurnStep(text, phase) {
  if (/\buntap(?: step)?\b/.test(text)) return 'untap';
  if (/\bupkeep(?: step)?\b/.test(text)) return 'upkeep';
  if (/\bdraw step\b|^draw$/.test(text)) return 'draw';
  if (/\bend step\b/.test(text)) return 'end-step';
  if (/\bcleanup(?: step)?\b/.test(text)) return 'cleanup';
  return ['beginning', 'ending'].includes(phase) ? null : undefined;
}

function reindexStack(items = []) {
  const normalized = items.map((item, index) => ({ ...item, id: `verified-stack-${index + 1}`, position: index + 1 }));
  return normalized.map((item, index) => ({ ...item, responseTo: normalized[index + 1]?.id || null }));
}

function exactNumber(text) {
  const match = String(text || '').match(/\b(\d+)\b/);
  return match ? Number(match[1]) : null;
}

function withCommanderNotes(state) {
  if (state.format !== 'commander' || !state.commander?.card?.name) return state;
  const commander = state.commander;
  const notes = [
    `This is a Commander game. My commander is ${commander.card.name}.`,
    commander.opponent ? `${commander.opponent} is the opponent.` : null,
    Number.isFinite(commander.priorDamage) ? `My commander has already dealt ${commander.priorDamage} commander damage to the opponent.` : null,
    Number.isFinite(commander.newDamage) ? `It will deal them for ${commander.newDamage} combat damage.` : null,
    Number.isFinite(commander.life) ? `The opponent is at ${commander.life} life.` : null
  ].filter(Boolean);
  return { ...state, notes };
}

function objectIdFor(state, role, card, ordinal) {
  const key = normalizeMagicText(card.name).replace(/[^a-z0-9]+/g, '-');
  return `verified-${role}-${key}-${ordinal + 1}`;
}

function participantController(message) {
  const text = String(message || '').trim().toLowerCase();
  if (/^(?:opponent'?s?|their)\b/.test(text)) return 'opponent';
  if (/^(?:my|your)\b/.test(text)) return 'player';
  return null;
}

function cardMentionsByRole(message, cards, role) {
  const text = String(message || '').toLowerCase().replace(/\s+/g, ' ');
  return cards.flatMap((rawCard) => {
    const card = normalizeMagicCard(rawCard);
    if (!isPermanentType(card) || !card.normalizedName) return [];
    const escaped = card.normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const attack = new RegExp(`(?:attack(?:s|ed|ing)?\\s+with\\s+${escaped}|${escaped}\\s+(?:is\\s+)?attack(?:s|ing)?)`);
    const block = new RegExp(`(?:block(?:s|ed|ing)?(?:\\s+(?:it|them|the attacker|that creature))?\\s+with(?: their own| my own| the| a| an)?\\s+${escaped}|blocked\\s+by\\s+${escaped}|${escaped}\\s+(?:is\\s+)?block(?:s|ing)?)`);
    return (role === 'attacker' ? attack : block).test(text) ? [card] : [];
  });
}

function expandedParticipantCards(message, cards) {
  const text = normalizeMagicText(message);
  return cards.flatMap((rawCard) => {
    const card = normalizeMagicCard(rawCard);
    if (!isPermanentType(card) || !card.normalizedName) return [];
    const escaped = card.normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const occurrences = text.match(new RegExp(`\\b${escaped}\\b`, 'g'))?.length || 0;
    const optionalQualifier = "(?:(?:my|your|their|opponent'?s?)\\s+)?";
    const statedCount = new RegExp(`\\b(?:two|2)\\s+${optionalQualifier}${escaped}\\b`).test(text) ? 2
      : new RegExp(`\\b(?:another|a second|the other)\\s+${escaped}\\b`).test(text) ? 2
      : new RegExp(`\\b(?:three|3)\\s+${optionalQualifier}${escaped}\\b`).test(text) ? 3
        : 0;
    return Array.from({ length: Math.max(1, occurrences, statedCount) }, () => card);
  });
}

function repeatedParticipant(cards) {
  const counts = new Map();
  for (const card of cards) counts.set(card.normalizedName, (counts.get(card.normalizedName) || 0) + 1);
  const duplicate = [...counts.entries()].find(([, count]) => count > 1);
  if (!duplicate) return null;
  return { name: cards.find((card) => card.normalizedName === duplicate[0])?.name || duplicate[0], count: duplicate[1] };
}

function establishesDistinctMultiplicity(message, cardName) {
  const text = normalizeMagicText(message);
  const name = normalizeMagicText(cardName).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(?:two|three|four|five|six|2|3|4|5|6)\\s+(?:(?:my|your|their|opponent'?s?)\\s+)?${name}\\b`).test(text)
    || new RegExp(`\\b(?:another|a second|the other)\\s+${name}\\b`).test(text);
}

function rebuildCombatObjects(state, message, cards, pendingKey = null) {
  if (state.phase !== 'combat') return state;
  const permanentCards = expandedParticipantCards(message, cards);
  const mentionedAttackers = cardMentionsByRole(message, cards, 'attacker');
  const mentionedBlockers = cardMentionsByRole(message, cards, 'blocker');
  const attackerCards = pendingKey === 'combat-attackers' ? permanentCards : mentionedAttackers;
  const blockerCards = pendingKey === 'combat-blockers' ? permanentCards : mentionedBlockers;
  const noBlockers = pendingKey === 'combat-blockers' && /^(?:none|no blockers?|nothing)$/i.test(String(message || '').trim());
  const attackerAnswered = attackerCards.length > 0;
  const blockerAnswered = blockerCards.length > 0 || noBlockers;
  if (!attackerAnswered && !blockerAnswered) return state;
  const repeatedAttacker = attackerAnswered ? repeatedParticipant(attackerCards) : null;
  const repeatedBlocker = blockerAnswered ? repeatedParticipant(blockerCards) : null;
  const attackerAmbiguity = repeatedAttacker && !establishesDistinctMultiplicity(message, repeatedAttacker.name) ? repeatedAttacker : null;
  const blockerAmbiguity = repeatedBlocker && !establishesDistinctMultiplicity(message, repeatedBlocker.name) ? repeatedBlocker : null;
  const identityAmbiguity = attackerAmbiguity ? { role: 'attacker', ...attackerAmbiguity }
    : blockerAmbiguity ? { role: 'blocker', ...blockerAmbiguity }
      : null;

  const attackingPlayer = state.activePlayer || 'player';
  const defendingPlayer = attackingPlayer === 'player' ? 'opponent' : 'player';
  const existingAttackers = state.combat.attackers
    .map((entry) => state.battlefield.find((object) => object.id === entry.objectId))
    .filter(Boolean);
  const existingBlockers = state.combat.blocks
    .flatMap((entry) => entry.blockerIds)
    .map((id) => state.battlefield.find((object) => object.id === id))
    .filter(Boolean);
  const suppliedController = participantController(message);
  const attackerObjects = (attackerAnswered ? attackerCards : existingAttackers.map((object) => object.card)).map((card, index) => ({
    id: objectIdFor(state, 'attacker', card, index), name: card.name, card,
    owner: attackerAnswered ? suppliedController || attackingPlayer : existingAttackers[index]?.owner || attackingPlayer,
    controller: attackerAnswered ? suppliedController || attackingPlayer : existingAttackers[index]?.controller || attackingPlayer,
    controllerExplicit: attackerAnswered ? Boolean(suppliedController) : Boolean(existingAttackers[index]?.controllerExplicit),
    zone: 'battlefield', roles: ['attacker']
  }));
  const blockerObjects = (blockerAnswered ? blockerCards : existingBlockers.map((object) => object.card)).map((card, index) => ({
    id: objectIdFor(state, 'blocker', card, index), name: card.name, card,
    owner: blockerAnswered ? suppliedController || defendingPlayer : existingBlockers[index]?.owner || defendingPlayer,
    controller: blockerAnswered ? suppliedController || defendingPlayer : existingBlockers[index]?.controller || defendingPlayer,
    controllerExplicit: blockerAnswered ? Boolean(suppliedController) : Boolean(existingBlockers[index]?.controllerExplicit),
    zone: 'battlefield', roles: ['blocker']
  }));
  const attackersKnown = (state.combat.attackersKnown || attackerAnswered) && identityAmbiguity?.role !== 'attacker';
  const blockersKnown = (state.combat.blockersKnown || blockerAnswered) && identityAmbiguity?.role !== 'blocker';
  const blocks = attackerObjects.length && blockerObjects.length
    ? [{ attackerId: attackerObjects[0].id, blockerIds: blockerObjects.map((object) => object.id), damageOrder: blockerObjects.map((object) => object.id) }]
    : [];
  const nonCombatObjects = state.battlefield.filter((object) => !object.roles?.some((role) => ['attacker', 'blocker'].includes(role)));

  return {
    ...state,
    battlefield: [...nonCombatObjects, ...attackerObjects, ...blockerObjects],
    combat: {
      known: true,
      active: true,
      window: state.step === 'declare-blockers' && blockerAnswered ? 'after-blockers' : state.combat.window,
      attackingPlayer,
      defendingPlayer,
      attackersKnown,
      blockersKnown,
      identityAmbiguity,
      attackers: attackerObjects.map((object) => ({ objectId: object.id, attackTarget: defendingPlayer })),
      blocks
    }
  };
}

export function collectMagicConversationState(current, message, cards = [], pendingKey = null) {
  const text = normalizeMagicText(message);
  let state = { ...current, cards: mergeCards(current.cards, cards) };

  if (pendingKey === 'turn' && text === 'commander') {
    state.format = 'commander';
    state.commander = { mode: 'damage', card: null, opponent: null, priorDamage: null, newDamage: null, life: null, castsFromCommandZone: null };
  }
  if (pendingKey === 'commander-card' && cards.length > 0) {
    state.commander = { ...state.commander, card: normalizeMagicCard(cards[0]) };
  }
  if (pendingKey === 'commander-opponent' && String(message || '').trim()) {
    state.commander = { ...state.commander, opponent: String(message).trim().replace(/[.?!]+$/, '') };
  }
  if (pendingKey === 'commander-prior-damage' && exactNumber(message) != null) {
    state.commander = { ...state.commander, priorDamage: exactNumber(message) };
  }
  if (pendingKey === 'commander-new-damage' && exactNumber(message) != null) {
    state.commander = { ...state.commander, newDamage: exactNumber(message) };
  }
  if (pendingKey === 'commander-life' && exactNumber(message) != null) {
    state.commander = { ...state.commander, life: exactNumber(message) };
  }

  if (pendingKey === 'turn') {
    if (/^(?:mine|my turn)$/.test(text)) state.activePlayer = 'player';
    if (/^(?:opponent'?s|opponent|their turn)$/.test(text)) state.activePlayer = 'opponent';
  }
  if (pendingKey === 'phase') {
    const phaseAnswers = {
      untap: 'beginning',
      upkeep: 'beginning',
      draw: 'beginning',
      'precombat main': 'precombat-main',
      combat: 'combat',
      'postcombat main': 'postcombat-main',
      'end step': 'ending',
      cleanup: 'ending'
    };
    state.phase = phaseAnswers[text] || state.phase;
    state.step = ({ untap: 'untap', upkeep: 'upkeep', draw: 'draw', 'end step': 'end-step', cleanup: 'cleanup' })[text] || state.step;
  }
  if (pendingKey === 'step') {
    const stepAnswers = {
      untap: 'untap', upkeep: 'upkeep', draw: 'draw',
      'beginning of combat': 'beginning-of-combat',
      'before attackers': 'beginning-of-combat',
      'declare attackers': 'declare-attackers',
      'after attackers': 'declare-attackers',
      'after attackers / before blockers': 'declare-attackers',
      'before blockers': 'declare-attackers',
      'declare blockers': 'declare-blockers',
      'after blockers': 'declare-blockers',
      'first-strike damage': 'first-strike-combat-damage',
      'first-strike combat damage': 'first-strike-combat-damage',
      'after first-strike damage': 'first-strike-combat-damage',
      'combat damage': 'combat-damage',
      'end of combat': 'end-of-combat',
      'end step': 'end-step', cleanup: 'cleanup'
    };
    state.step = stepAnswers[text] || state.step;
    state.combat = {
      ...state.combat,
      window: text === 'after first-strike damage' ? 'between-damage-steps'
        : text === 'after blockers' ? 'after-blockers'
        : text === 'before blockers' || text === 'after attackers / before blockers' ? 'before-blockers'
          : text === 'after attackers' ? 'after-attackers'
            : text === 'before attackers' ? 'before-attackers'
              : state.combat.window
    };
  }
  if (pendingKey === 'priority') {
    if (/^(?:me|mine)$/.test(text)) {
      state.priorityHolder = 'player';
      state.priorityKnown = true;
    } else if (/^opponent(?:'?s)?$/.test(text)) {
      state.priorityHolder = 'opponent';
      state.priorityKnown = true;
    } else if (/^not sure$/.test(text)) {
      state.priorityHolder = null;
      state.priorityKnown = true;
    }
  }
  if (pendingKey === 'stack') {
    if (/^(?:empty|yes)$/.test(text)) {
      state.stack = { known: true, empty: true, items: [] };
      state.stackCollection = null;
    }
    if (/^(?:not empty|no)$/.test(text)) {
      state.stack = { known: true, empty: false, items: [] };
      state.stackCollection = { active: true, pendingController: null, pendingItemId: null };
    }
  }
  if (pendingKey === 'stack-items' && cards.length > 0) {
    state.stack = { known: true, empty: false, items: reindexStack(stackItemsFromCards(cards, message)) };
    state.stackCollection = { active: true, pendingController: null, pendingItemId: null };
  }
  if (pendingKey === 'stack-response-choice') {
    if (text === 'no response') state.stackCollection = null;
    if (text === 'opponent responded') state.stackCollection = { ...state.stackCollection, active: true, pendingController: 'opponent', pendingItemId: null };
    if (text === 'i responded') state.stackCollection = { ...state.stackCollection, active: true, pendingController: 'player', pendingItemId: null };
  }
  if (pendingKey === 'stack-response-item' && cards.length > 0) {
    const [item] = stackItemsFromCards(cards, message, [...state.cards, ...cards]);
    if (item) {
      const nextItems = reindexStack([{ ...item, controller: state.stackCollection?.pendingController || item.controller }, ...state.stack.items]);
      const added = nextItems[0];
      const requiresTarget = /\btarget\b/i.test(added.card?.oracleText || added.card?.oracle_text || '');
      state.stack = { known: true, empty: false, items: nextItems };
      state.stackCollection = {
        active: true,
        pendingController: null,
        pendingItemId: requiresTarget && added.targets.length === 0 ? added.id : null
      };
    }
  }
  if (pendingKey === 'stack-response-target' && state.stackCollection?.pendingItemId) {
    const target = text === 'no target' ? null : state.stack.items.find((item) => normalizeMagicText(item.name) === text);
    state.stack = {
      ...state.stack,
      items: state.stack.items.map((item) => item.id !== state.stackCollection.pendingItemId ? item : {
        ...item,
        targets: target ? [{ type: 'TargetChoice', descriptor: target.name, objectId: target.id }] : []
      })
    };
    state.stackCollection = { active: true, pendingController: null, pendingItemId: null };
  }

  if (/\b(?:mine|my turn|i am the active player|i'm the active player)\b/.test(text)) state.activePlayer = 'player';
  if (/\b(?:opponent'?s|their) turn\b|\bopponent is the active player\b/.test(text)) state.activePlayer = 'opponent';

  const phase = inferPhase(text);
  if (phase) state.phase = phase;
  const turnStep = inferTurnStep(text, state.phase);
  if (turnStep) state.step = turnStep;
  if (state.phase !== 'combat') {
    if (!['beginning', 'ending'].includes(state.phase)) state.step = null;
    state.combat = {
      known: Boolean(state.phase), active: false, attackingPlayer: null, defendingPlayer: null,
      window: null, attackersKnown: false, blockersKnown: false, identityAmbiguity: null, attackers: [], blocks: []
    };
    state.battlefield = state.battlefield.filter((object) => !object.roles?.some((role) => ['attacker', 'blocker'].includes(role)));
  } else {
    state.combat = { ...state.combat, known: true, active: true };
    const step = inferCombatStep(text);
    if (step) {
      state.step = step;
      state.combat = { ...state.combat, window: inferCombatWindow(text, step) || state.combat.window };
    }
  }

  if (/\b(?:i|me|player|you) (?:have|has|hold) priority\b|\bpriority is (?:mine|yours)\b/.test(text)
    || (current.activePlayer && current.phase && /^(?:me|mine)$/.test(text))) {
    state.priorityHolder = 'player';
    state.priorityKnown = true;
  } else if (/\bopponent (?:has|holds) priority\b|\bpriority is (?:the )?opponent'?s\b|^opponent$/.test(text)) {
    state.priorityHolder = 'opponent';
    state.priorityKnown = true;
  } else if (/\b(?:not sure|unknown|don'?t know)\b/.test(text) && /\bpriority\b/.test(text)) {
    state.priorityHolder = null;
    state.priorityKnown = true;
  }

  if (/\bstack (?:is )?empty\b|\bnothing (?:is )?on the stack\b|^empty$/.test(text)) {
    state.stack = { known: true, empty: true, items: [] };
  } else if (/\bstack (?:is )?(?:not empty|nonempty)\b|\b(?:spell|ability|trigger|it) (?:is |is still )?on the stack\b|\bis (?:still )?on the stack\b|^not empty$/.test(text)) {
    const stackCards = cards.filter((card) => /instant|sorcery/i.test(card.typeLine || card.type_line || ''));
    state.stack = { known: true, empty: false, items: stackItemsFromCards(stackCards, message, cards) };
  }

  state = rebuildCombatObjects(state, message, cards, pendingKey);
  if (state.stack.items.length > 0 && state.battlefield.length > 0) {
    state.stack = {
      ...state.stack,
      items: state.stack.items.map((item) => ({
        ...item,
        targets: item.targets.map((target) => {
          const targetName = normalizeMagicText(target.descriptor);
          const object = state.battlefield.find((candidate) => normalizeMagicText(candidate.name) === targetName);
          return object ? { ...target, objectId: object.id } : target;
        })
      }))
    };
  }
  return withCommanderNotes(state);
}

export function nextMagicStatePrompt(state) {
  const [missing] = getMissingRequiredMagicState(state);
  if (!missing) return null;
  if (missing === 'commander-card') return { key: 'commander-card', text: 'What is your commander?', choices: [] };
  if (missing === 'commander-opponent') return { key: 'commander-opponent', text: 'Which opponent is involved?', choices: [] };
  if (missing === 'commander-prior-damage') return { key: 'commander-prior-damage', text: 'How much commander combat damage has that opponent already taken from this commander?', choices: [] };
  if (missing === 'commander-new-damage') return { key: 'commander-new-damage', text: 'How much new combat damage is this commander dealing?', choices: [] };
  if (missing === 'commander-life') return { key: 'commander-life', text: 'What is that opponent’s current life total?', choices: [] };
  if (missing === 'turn') return { key: 'turn', text: 'Before I answer, I need the current game state. Whose turn is it?', choices: ['Mine', "Opponent's"] };
  if (missing === 'phase') return { key: 'phase', text: 'What phase or step are you in?', choices: ['Untap', 'Upkeep', 'Draw', 'Precombat Main', 'Combat', 'Postcombat Main', 'End Step', 'Cleanup'] };
  if (missing === 'step' && state.phase === 'beginning') return { key: 'step', text: 'Which beginning phase step are you in?', choices: ['Untap', 'Upkeep', 'Draw'] };
  if (missing === 'step' && state.phase === 'ending') return { key: 'step', text: 'Which ending phase step are you in?', choices: ['End Step', 'Cleanup'] };
  if (missing === 'step') return { key: 'step', text: 'What combat step are you in?', choices: ['Beginning of Combat', 'Declare Attackers', 'Declare Blockers', 'First-Strike Damage', 'After First-Strike Damage', 'Combat Damage', 'End of Combat'] };
  if (missing === 'priority') return { key: 'priority', text: 'Who currently has priority?', choices: ['Me', 'Opponent', 'Not sure'] };
  if (missing === 'stack') return { key: 'stack', text: 'Is the stack empty?', choices: ['Empty', 'Not empty'] };
  if (missing === 'stack-items') return { key: 'stack-items', text: 'What spell or ability is currently on the stack?', choices: [] };
  if (missing === 'stack-response-choice') return { key: 'stack-response-choice', text: 'Did anyone respond?', choices: ['Opponent responded', 'I responded', 'No response'] };
  if (missing === 'stack-response-item') return { key: 'stack-response-item', text: 'What spell or ability did they add to the stack?', choices: [] };
  if (missing === 'stack-response-target') return { key: 'stack-response-target', text: 'What does it target?', choices: [...state.stack.items.filter((item) => item.id !== state.stackCollection?.pendingItemId).map((item) => item.name), 'No target'] };
  if (missing === 'combat-attackers') {
    const ambiguity = state.combat.identityAmbiguity?.role === 'attacker' ? state.combat.identityAmbiguity : null;
    return { key: 'combat-attackers', text: ambiguity ? `You identified ${ambiguity.count} attackers named ${ambiguity.name}. Please distinguish which game objects are attacking.` : 'What creature or creatures are attacking?', choices: [] };
  }
  if (missing === 'combat-blockers') {
    const ambiguity = state.combat.identityAmbiguity?.role === 'blocker' ? state.combat.identityAmbiguity : null;
    return { key: 'combat-blockers', text: ambiguity ? `You identified ${ambiguity.count} blockers named ${ambiguity.name}. Please distinguish the blocking game objects.` : 'What creature or creatures are blocking? If there are no blockers, say none.', choices: [] };
  }
  return null;
}

export function getMissingRequiredMagicState(state) {
  const missing = [];
  if (state.format === 'commander') {
    if (!state.commander?.card) missing.push('commander-card');
    else if (!state.commander?.opponent) missing.push('commander-opponent');
    else if (!Number.isFinite(state.commander?.priorDamage)) missing.push('commander-prior-damage');
    else if (!Number.isFinite(state.commander?.newDamage)) missing.push('commander-new-damage');
    else if (!Number.isFinite(state.commander?.life)) missing.push('commander-life');
    return missing;
  }
  if (!state.activePlayer) missing.push('turn');
  if (!state.phase) missing.push('phase');
  if (['beginning', 'combat', 'ending'].includes(state.phase) && !state.step) missing.push('step');
  if (!state.priorityKnown) missing.push('priority');
  if (!state.stack.known) missing.push('stack');
  if (state.stack.known && state.stack.empty === false && state.stack.items.length === 0) missing.push('stack-items');
  if (state.stack.items.length > 0 && state.stackCollection?.pendingItemId) missing.push('stack-response-target');
  else if (state.stack.items.length > 0 && state.stackCollection?.pendingController) missing.push('stack-response-item');
  else if (state.stack.items.length > 0 && state.stackCollection?.active) missing.push('stack-response-choice');

  const attackersRequired = ['declare-attackers', 'declare-blockers', 'first-strike-combat-damage', 'combat-damage', 'end-of-combat'].includes(state.step);
  const blockersRequired = ['declare-blockers', 'first-strike-combat-damage', 'combat-damage', 'end-of-combat'].includes(state.step);
  if (state.phase === 'combat' && attackersRequired && (!state.combat.attackersKnown || state.combat.attackers.length === 0)) {
    missing.push('combat-attackers');
  }
  if (state.phase === 'combat' && blockersRequired && !state.combat.blockersKnown) {
    missing.push('combat-blockers');
  }
  return missing;
}

export function magicStateSummary(state) {
  const participantLabel = (object) => {
    if (!object?.controllerExplicit) return object?.name || null;
    return `${object.controller === 'player' ? 'Your' : "Opponent's"} ${object.name}`;
  };
  const attackers = state.combat.attackers.map((entry) => participantLabel(state.battlefield.find((object) => object.id === entry.objectId))).filter(Boolean);
  const blockers = state.combat.blocks.flatMap((entry) => entry.blockerIds).map((id) => participantLabel(state.battlefield.find((object) => object.id === id))).filter(Boolean);
  const summary = {
    ...(state.format === 'commander' ? {
      format: 'Commander',
      commander: state.commander?.card?.name || 'Not supplied',
      opponent: state.commander?.opponent || 'Not supplied',
      commanderDamage: Number.isFinite(state.commander?.priorDamage) && Number.isFinite(state.commander?.newDamage)
        ? `${state.commander.priorDamage} prior + ${state.commander.newDamage} new`
        : 'Not supplied',
      life: Number.isFinite(state.commander?.life) ? String(state.commander.life) : 'Not supplied'
    } : {}),
    turn: !state.activePlayer ? 'Not supplied' : state.activePlayer === 'player' ? 'You' : 'Opponent',
    phase: !state.phase ? 'Not supplied' : PHASE_LABELS[state.phase] || state.phase,
    ...(['beginning', 'combat', 'ending'].includes(state.phase) ? { step: state.step ? STEP_LABELS[state.step] || state.step : 'Not supplied' } : {}),
    ...(state.phase === 'combat' && state.combat.window ? { window: COMBAT_WINDOW_LABELS[state.combat.window] || state.combat.window } : {}),
    priority: !state.priorityKnown ? 'Not supplied' : state.priorityHolder === 'player' ? 'You' : state.priorityHolder === 'opponent' ? 'Opponent' : 'Not sure',
    stack: !state.stack.known ? 'Not supplied' : state.stack.empty ? 'Empty' : state.stack.items.length === 0 ? 'Not empty - item not supplied' : state.stack.items.length === 1
      ? `${state.stack.items[0].name}${state.stack.items[0].targets?.[0]?.descriptor ? ` -> ${state.stack.items[0].targets[0].descriptor}` : ''}`
      : `TOP -> BOTTOM\n${state.stack.items.map((item, index) => {
        const target = item.targets?.[0]?.descriptor;
        return `${index + 1}. ${item.name}${target ? ` -> ${target}` : ''}`;
      }).join('\n')}` || 'Not empty'
  };
  if (!state.combat.known) return { ...summary, combat: 'Not supplied' };
  if (state.phase !== 'combat') return { ...summary, combat: 'Not in combat' };

  const beforeAttackers = state.step === 'beginning-of-combat';
  const beforeBlockers = state.step === 'declare-attackers';
  return {
    ...summary,
    attacker: beforeAttackers ? 'None declared yet' : state.combat.attackersKnown ? attackers.join(', ') || 'None' : 'Not supplied',
    blockers: beforeAttackers || beforeBlockers ? 'None declared yet' : state.combat.blockersKnown ? blockers.join(', ') || 'None' : 'Not supplied'
  };
}

export function stateSummaryText(state) {
  const summary = magicStateSummary(state);
  const labels = { format: 'Format', commander: 'Commander', opponent: 'Opponent', commanderDamage: 'Commander Damage', life: 'Life', turn: 'Turn', phase: 'Phase', step: 'Step', window: 'Window', priority: 'Priority', stack: 'Stack', combat: 'Combat', attacker: 'Attacker', blockers: 'Blockers' };
  return `CURRENT STATE\n${Object.entries(summary).map(([key, value]) => `${labels[key] || key}: ${value}`).join('\n')}`;
}

export function looksLikeQuestion(message = '') {
  const text = normalizeMagicText(message);
  return /\?|\b(?:can|may|allowed|legal|what happens|how much|will|does|do i|if i|if my)\b/.test(text);
}
