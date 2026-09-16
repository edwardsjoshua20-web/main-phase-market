import { isPermanentType, normalizeMagicText } from './magicCards.js';

export function createGameState({ cards = [], message = '' } = {}) {
  const text = normalizeMagicText(message);
  const permanents = [];
  const zones = new Map();
  const effects = [];
  const damage = new Map();
  const counters = new Map();
  const trace = [];

  for (const card of cards) {
    const mentionedControl = new RegExp(`\\b(control|controls|have|has)\\s+${escapeRegExp(normalizeMagicText(card.name))}\\b`).test(text)
      || new RegExp(`\\b${escapeRegExp(normalizeMagicText(card.name))}\\s+(on the battlefield|in play)\\b`).test(text);
    if (mentionedControl || isPermanentType(card)) {
      permanents.push({
        card,
        controller: mentionedControl || /you control|player controls|i control/.test(text) ? 'player' : 'unknown',
        zone: 'battlefield',
        tapped: /\btapped\b/.test(text) && text.includes(card.normalizedName),
        attachedTo: null
      });
      zones.set(card.name, 'battlefield');
    }
  }

  return {
    text,
    permanents,
    stack: [],
    effects,
    damage,
    counters,
    triggers: [],
    lifeTotals: new Map(),
    diagnostics: trace,
    getPermanent(cardOrName) {
      const name = typeof cardOrName === 'string' ? cardOrName : cardOrName?.name;
      return permanents.find((permanent) => normalizeMagicText(permanent.card.name) === normalizeMagicText(name)) || null;
    },
    addEffect(effect) {
      effects.push(effect);
      trace.push({ type: 'effect-added', effect });
    },
    addDamage(card, amount) {
      const prior = damage.get(card.name) || 0;
      damage.set(card.name, prior + amount);
      trace.push({ type: 'damage-marked', card: card.name, amount, total: prior + amount });
    },
    moveToZone(card, zone, reason) {
      zones.set(card.name, zone);
      const permanent = this.getPermanent(card);
      if (permanent) permanent.zone = zone;
      trace.push({ type: 'zone-change', card: card.name, zone, reason });
    },
    zoneOf(card) {
      return zones.get(card.name) || 'unknown';
    }
  };
}

export function getContinuousEffectsFor(card, state) {
  return state.effects.filter((effect) => normalizeMagicText(effect.appliesTo) === normalizeMagicText(card.name));
}

export function hasProtectionFrom(card, source, state) {
  return getContinuousEffectsFor(card, state)
    .filter((effect) => effect.type === 'protection')
    .some((effect) => source && effect.quality && source.qualities?.includes(effect.quality));
}

export function runStateBasedActions(state) {
  const applied = [];
  for (const permanent of state.permanents) {
    if (permanent.zone !== 'battlefield') continue;
    const card = permanent.card;
    const damage = state.damage.get(card.name) || 0;
    if (Number.isFinite(card.toughness) && card.toughness <= 0) {
      state.moveToZone(card, 'graveyard', 'state-based action: toughness 0 or less');
      applied.push(`${card.name} is put into its owner's graveyard for having 0 or less toughness.`);
      continue;
    }
    if (Number.isFinite(card.toughness) && damage >= card.toughness && !card.abilities?.includes('indestructible')) {
      state.moveToZone(card, 'graveyard', 'state-based action: lethal damage');
      applied.push(`${card.name} is put into its owner's graveyard for lethal damage.`);
    }
  }
  return applied;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
