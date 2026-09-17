import { isCreature, isInstant, isPermanentType, isSorcery, normalizeMagicCard, normalizeMagicText } from '../magicCards.js';

const semanticCache = new Map();

function cacheKey(card = {}) {
  return card.oracle_id || card.id || `${card.name}:${card.oracleText}`;
}

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetRestrictionFrom(text) {
  if (text.includes('target nonblack creature')) return { kind: 'permanent', requiredTypes: ['creature'], excludedColors: ['black'] };
  if (text.includes('target creature you control')) return { kind: 'permanent', requiredTypes: ['creature'], controller: 'self' };
  if (text.includes('target creature')) return { kind: 'permanent', requiredTypes: ['creature'] };
  if (text.includes('target spell')) return { kind: 'spell' };
  if (text.includes('target player') || text.includes('target opponent')) return { kind: 'player' };
  if (text.includes('any target')) return { kind: 'any' };
  return { kind: 'target' };
}

function parseSpellEffects(card, text) {
  const effects = [];
  if (text.includes('destroy target')) {
    effects.push({ type: 'destroy', target: targetRestrictionFrom(text), primitives: ['targeting', 'resolving', 'state-based-actions'] });
  }
  if (text.includes('exile target')) {
    effects.push({ type: 'exile', target: targetRestrictionFrom(text), primitives: ['targeting', 'resolving'] });
  }
  if (text.includes('counter target spell')) {
    effects.push({ type: 'counter', target: { kind: 'spell' }, primitives: ['targeting', 'stack', 'resolving'] });
  }
  const splitTargetedDamage = text.match(/\bdeals? (\d+) damage to (any target|one target|target [^.]+?) and (\d+) damage to another target\b/);
  if (splitTargetedDamage) {
    effects.push({ type: 'damage', amount: parseNumber(splitTargetedDamage[1]), target: targetRestrictionFrom(splitTargetedDamage[2]), targetIndex: 0, primitives: ['damage', 'targeting', 'state-based-actions'] });
    effects.push({ type: 'damage', amount: parseNumber(splitTargetedDamage[3]), target: { kind: 'any' }, targetIndex: 1, primitives: ['damage', 'targeting', 'state-based-actions'] });
  }
  const targetedDamage = text.match(/\bdeals? (\d+) damage to (any target|target [^.]+)\b/);
  if (targetedDamage && !splitTargetedDamage) {
    effects.push({ type: 'damage', amount: parseNumber(targetedDamage[1]), target: targetRestrictionFrom(text), primitives: ['damage', 'targeting', 'state-based-actions'] });
  }
  const globalCreatureDamage = text.match(/\bdeals? (\d+) damage to each creature\b/);
  if (globalCreatureDamage) {
    effects.push({ type: 'damage-each', amount: parseNumber(globalCreatureDamage[1]), selector: { type: 'creature' }, primitives: ['damage', 'state-based-actions', 'triggers'] });
  }
  const pump = text.match(/\btarget [^.]+ gets ([+-]\d+)\/([+-]\d+)/);
  if (pump) {
    effects.push({ type: 'modify-pt', power: parseNumber(pump[1]), toughness: parseNumber(pump[2]), target: targetRestrictionFrom(text), primitives: ['targeting', 'continuous', 'state-based-actions'] });
  }
  const protection = text.match(/\bgains? protection from (the color of your choice|white|blue|black|red|green|artifacts?|creatures?)\b/);
  if (protection) {
    effects.push({ type: 'grant-protection', quality: protection[1], target: targetRestrictionFrom(text), primitives: ['protection', 'targeting', 'continuous'] });
  }
  if (text.includes('prevent') && text.includes('damage')) {
    effects.push({ type: 'prevent-damage', primitives: ['replacement', 'damage'] });
  }
  if (text.includes('sacrifice')) {
    effects.push({ type: 'sacrifice', target: targetRestrictionFrom(text), primitives: ['state-based-actions'] });
  }
  return effects;
}

function parseTriggeredAbilities(card, text) {
  const abilities = [];
  if (/\bwhenever\b.*\bcreature\b.*\bdies\b/.test(text)) {
    const selfOrAnother = /\bthis or another creature dies\b/.test(text)
      || /\bthis creature or another creature dies\b/.test(text)
      || text.includes(`${card.normalizedName} or another creature dies`);
    const another = /\banother creature dies\b/.test(text);
    const losesLife = text.match(/\b(target opponent|target player|each opponent|that player) loses? (\d+) life\b/);
    const gainLife = text.match(/\byou gain (\d+) life\b/);
    abilities.push({
      type: 'triggered',
      trigger: 'CreatureDied',
      eventFilter: {
        creature: true,
        includeSelf: selfOrAnother || !another,
        includeOthers: true
      },
      effect: {
        type: 'life-drain',
        opponentLifeLoss: losesLife ? parseNumber(losesLife[2]) : 0,
        controllerLifeGain: gainLife ? parseNumber(gainLife[1]) : 0,
        target: losesLife?.[1] || 'target opponent'
      },
      primitives: ['triggers', 'lki']
    });
  }
  if (/\b(when|whenever)\b.*\benters the battlefield\b/.test(text)) {
    abilities.push({ type: 'triggered', trigger: 'PermanentEntered', eventFilter: { sourceName: card.name }, effect: { type: 'unsupported' }, primitives: ['triggers'] });
  }
  if (/\bwhenever\b.*\battacks\b/.test(text)) {
    abilities.push({ type: 'triggered', trigger: 'AttackDeclared', eventFilter: { sourceName: card.name }, effect: { type: 'unsupported' }, primitives: ['triggers'] });
  }
  return abilities;
}

function parseActivatedAbilities(text) {
  if (!text.includes(':')) return [];
  return text.split('.')
    .filter((sentence) => sentence.includes(':'))
    .map((sentence) => {
      const [cost, effectText] = sentence.split(':');
      return {
        type: 'activated',
        cost: cost.trim(),
        effects: parseSpellEffects({ oracleText: effectText }, normalizeMagicText(effectText)),
        primitives: ['timing', 'stack']
      };
    });
}

export function parseOracleSemantics(cardInput = {}) {
  const card = normalizeMagicCard(cardInput);
  const key = cacheKey(card);
  if (semanticCache.has(key)) return semanticCache.get(key);

  const text = normalizeMagicText(card.oracleText);
  const semantics = {
    card,
    objectTypes: {
      permanent: isPermanentType(card),
      creature: isCreature(card),
      instant: isInstant(card),
      sorcery: isSorcery(card)
    },
    keywords: [...(card.abilities || [])],
    spellEffects: parseSpellEffects(card, text),
    triggeredAbilities: parseTriggeredAbilities(card, text),
    activatedAbilities: parseActivatedAbilities(text),
    staticAbilities: [],
    replacementEffects: [],
    unsupportedText: []
  };

  if (text.includes('if') && text.includes('would') && text.includes('instead')) {
    semantics.replacementEffects.push({ type: 'replacement', text: card.oracleText, primitives: ['replacement'] });
  }
  if (text.includes('layer') || text.includes('dependency') || text.includes('opalescence') || text.includes('humility')) {
    semantics.unsupportedText.push('complex-layer-or-dependency-text');
  }
  if ((semantics.spellEffects.length === 0 && (semantics.objectTypes.instant || semantics.objectTypes.sorcery))
    || semantics.triggeredAbilities.some((ability) => ability.effect.type === 'unsupported')) {
    semantics.unsupportedText.push('unsupported-oracle-semantics');
  }

  semanticCache.set(key, semantics);
  return semantics;
}

export function clearOracleSemanticCache() {
  semanticCache.clear();
}
