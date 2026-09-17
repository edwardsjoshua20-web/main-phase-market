import { normalizeMagicText } from './magicCards.js';

function hasAny(text, terms) {
  return terms.some((term) => text.includes(term));
}

function result(verdict, summary, {
  mechanics = [],
  sequence = [],
  clarificationNeeded = null
} = {}) {
  return { verdict, summary, mechanics, sequence, clarificationNeeded };
}

export function evaluateCommonMagicPattern({ message = '', cards = [] } = {}) {
  const text = normalizeMagicText(message);
  const names = cards.map((card) => card.normalizedName).join(' ');

  if (hasAny(text, ['unresolved card', 'unknown card text', 'card not resolved'])) {
    return result('unverified', 'The engine cannot issue a confident ruling without resolved canonical card text.', { mechanics: ['card-resolution'] });
  }

  if (text.includes('cast') && text.includes('in response') && cards.some((card) => normalizeMagicText(card.typeLine).includes('creature'))) {
    return result('no', 'Creature spells normally cannot be cast in response unless another effect gives them flash or otherwise changes timing permissions.', {
      mechanics: ['timing', 'spells'],
      sequence: ['A response requires an instant-speed permission.', 'Creature spells normally use sorcery timing.']
    });
  }

  if (text.includes('last spell on the stack') || text.includes('last in first out') || text.includes('resolve first')) {
    return result('yes', 'Objects on the stack resolve last-in, first-out after all players pass priority.', {
      mechanics: ['stack', 'priority', 'resolving'],
      sequence: ['A spell or ability is put on the stack.', 'Players get priority to respond.', 'The top object resolves first after all players pass.']
    });
  }

  if (text.includes('respond before it resolves') || text.includes('respond to it before it resolves')) {
    return result('yes', 'Players receive priority before a spell or ability resolves, so they can respond if they have an available legal action.', {
      mechanics: ['stack', 'priority', 'resolving'],
      sequence: ['The object is on the stack.', 'Players get priority.', 'It resolves only after all players pass in succession.']
    });
  }

  if (text.includes('check whether its target is still legal') || text.includes('checks target legality')) {
    return result('yes', 'A spell or ability checks target legality again as it resolves.', {
      mechanics: ['targeting', 'resolving'],
      sequence: ['Targets are chosen when the spell or ability is put on the stack.', 'Targets are checked again on resolution.']
    });
  }

  if (text.includes('-x/-x') || text.includes('gets -')) {
    if (text.includes('indestructible') && (text.includes('0 toughness') || text.includes('0 or less') || text.includes('-1/-1') || text.includes('-3/-3'))) {
      return result('yes', 'Indestructible does not stop a creature from being put into the graveyard for having 0 or less toughness.', {
        mechanics: ['state-based-actions', 'indestructible'],
        sequence: ['The effect changes toughness.', 'State-based actions see toughness 0 or less.', 'The creature is put into its owner\'s graveyard.']
      });
    }
  }

  if (text.includes('sacrifice') && text.includes('indestructible')) {
    return result('yes', 'Indestructible does not stop a sacrifice instruction. If the effect instructs that permanent to be sacrificed, it is sacrificed.', {
      mechanics: ['sacrifice', 'indestructible', 'zone-changes'],
      sequence: ['Sacrifice is not destruction.', 'Indestructible only stops destroy effects and lethal-damage destruction.']
    });
  }

  if (text.includes('player at 0') || text.includes('0 life') || text.includes('less life')) {
    return result('yes', 'A player with 0 or less life loses the game as a state-based action unless an effect says otherwise.', {
      mechanics: ['state-based-actions'],
      sequence: ['The life total is 0 or less.', 'State-based actions are checked.', 'That player loses the game.']
    });
  }

  if (text.includes('legend rule') || text.includes('two legendary')) {
    if (text.includes('same name')) {
      return result('yes', 'The legend rule makes a player choose one legendary permanent with that name and put the rest into their owners\' graveyards.', {
        mechanics: ['state-based-actions'],
        sequence: ['One player controls multiple legendary permanents with the same name.', 'State-based actions apply the legend rule.']
      });
    }
    return result('depends', 'The legend rule depends on whether the legendary permanents have the same name and are controlled by the same player.', {
      mechanics: ['state-based-actions'],
      clarificationNeeded: 'Tell me the exact legendary permanent names and who controls each one.'
    });
  }

  if (text.includes('illegal aura') || (text.includes('aura') && text.includes('falls off'))) {
    return result('yes', 'An Aura attached to an illegal object is put into its owner\'s graveyard as a state-based action.', {
      mechanics: ['state-based-actions', 'zone-changes'],
      sequence: ['The Aura is attached illegally.', 'State-based actions put the Aura into its owner\'s graveyard.']
    });
  }

  if (text.includes('token') && text.includes('changes zone')) {
    return result('yes', 'A token that leaves the battlefield goes to the new zone briefly, then ceases to exist as a state-based action.', {
      mechanics: ['state-based-actions', 'zone-changes'],
      sequence: ['The token changes zones.', 'State-based actions make the token cease to exist.']
    });
  }

  if ((text.includes('leaves battlefield before resolution') || text.includes('changes zone before resolution')) && text.includes('target')) {
    return result('no', 'A spell or ability with no remaining legal targets does not resolve.', {
      mechanics: ['targeting', 'resolving', 'zone-changes'],
      sequence: ['The target changes zones before resolution.', 'The spell checks target legality as it resolves.', 'With no legal targets remaining, it does not resolve.']
    });
  }

  if (text.includes('one target illegal') && text.includes('another target')) {
    return result('yes', 'If at least one target is still legal, the spell or ability resolves and affects only its legal targets.', {
      mechanics: ['targeting', 'resolving'],
      sequence: ['Targets are checked on resolution.', 'Illegal targets are ignored.', 'The object resolves for the remaining legal target or targets.']
    });
  }

  if (text.includes('protection') && text.includes('block')) {
    if (text.includes('after block') || text.includes('after blockers')) {
      return result('yes', 'Gaining protection after blockers are declared does not undo that the creature became blocked, but it can prevent damage from a source with that quality.', {
        mechanics: ['protection', 'damage', 'combat'],
        sequence: ['Blockers were already declared.', 'Protection gained afterward does not remove the block.', 'Damage from sources with that protected quality is prevented.']
      });
    }
    return result('no', 'A creature with protection from a quality cannot be blocked by creatures with that quality.', {
      mechanics: ['protection', 'combat'],
      sequence: ['Protection includes the block restriction.', 'A source with the protected quality cannot legally block it.']
    });
  }

  if (text.includes('protection') && text.includes('damage')) {
    return result('no', 'Protection prevents damage from sources with the protected quality.', {
      mechanics: ['protection', 'damage'],
      sequence: ['Protection applies to the source quality.', 'Damage from that source is prevented.']
    });
  }

  if (text.includes('aura') && text.includes('protection')) {
    return result('yes', 'Protection from a quality stops an Aura of that quality from legally enchanting the permanent; an illegal Aura is put into its owner\'s graveyard.', {
      mechanics: ['protection', 'state-based-actions'],
      sequence: ['Protection creates an enchant/equip restriction.', 'The Aura is illegal on that permanent.', 'State-based actions put the Aura into its owner\'s graveyard.']
    });
  }

  if (text.includes('equipment') && text.includes('protection')) {
    return result('yes', 'Protection from a quality stops Equipment of that quality from being attached to the permanent; illegal Equipment becomes unattached.', {
      mechanics: ['protection', 'state-based-actions'],
      sequence: ['Protection creates an equip restriction.', 'The Equipment cannot remain attached to that permanent.']
    });
  }

  if (text.includes('protection removed before resolution')) {
    return result('yes', 'If protection is no longer applying when the spell resolves, target legality is checked using the current game state.', {
      mechanics: ['protection', 'targeting', 'resolving'],
      sequence: ['The spell targeted legally when cast.', 'Protection was removed before resolution.', 'The target is legal again when the spell resolves.']
    });
  }

  if (text.includes('deathtouch')) {
    return result('yes', 'Any amount of damage from a source with deathtouch is lethal damage to a creature.', {
      mechanics: ['damage', 'state-based-actions'],
      sequence: ['Damage is dealt by a source with deathtouch.', 'State-based actions treat that damage as lethal.']
    });
  }

  if (text.includes('damage marked') || (text.includes('lethal damage') && text.includes('state-based action'))) {
    return result('yes', 'A creature with lethal damage marked is destroyed as a state-based action unless an effect such as indestructible changes that result.', {
      mechanics: ['damage', 'state-based-actions'],
      sequence: ['Damage is marked on the creature.', 'State-based actions see lethal damage.', 'The creature is destroyed.']
    });
  }

  if (text.includes('trample') || text.includes('trampling')) {
    return result('depends', 'Trample damage assignment depends on the blocker toughness, damage already marked, deathtouch, and assigned damage.', {
      mechanics: ['damage', 'combat'],
      clarificationNeeded: 'Tell me the attacking creature power, blockers, toughness, and how damage is assigned.'
    });
  }

  if (text.includes('first strike') || text.includes('double strike')) {
    if (text.includes('double strike')) {
      return result('yes', 'Double strike lets a creature assign combat damage in both the first-strike combat damage step and the regular combat damage step if it remains in combat.', {
        mechanics: ['damage', 'combat'],
        sequence: ['First-strike combat damage step happens.', 'Then the regular combat damage step happens.']
      });
    }
    return result('yes', 'First strike creates an earlier combat damage step; a creature destroyed there will not deal regular combat damage.', {
      mechanics: ['damage', 'combat', 'state-based-actions'],
      sequence: ['First-strike damage is dealt first.', 'State-based actions are checked before regular combat damage.']
    });
  }

  if (text.includes('prevent') && text.includes('damage')) {
    return result('no', 'If a prevention effect applies to all of that damage, the damage is not dealt and lethal damage is not marked.', {
      mechanics: ['replacement-effects', 'damage'],
      sequence: ['The prevention effect modifies the damage event.', 'No prevented damage is dealt.']
    });
  }

  if (text.includes('dies trigger')) {
    return result('yes', 'A dies trigger triggers when the creature is put from the battlefield into a graveyard, then waits to be put on the stack.', {
      mechanics: ['triggers', 'zone-changes'],
      sequence: ['The creature dies.', 'State-based actions finish.', 'The triggered ability is put on the stack at the next priority point.']
    });
  }

  if (text.includes('etb trigger') || text.includes('enters the battlefield trigger')) {
    return result('yes', 'An enters-the-battlefield triggered ability triggers when the permanent enters, then goes on the stack the next time a player would receive priority.', {
      mechanics: ['triggers'],
      sequence: ['The permanent enters the battlefield.', 'The ability triggers.', 'The trigger is put on the stack at the next priority point.']
    });
  }

  if (text.includes('delayed trigger')) {
    return result('yes', 'A delayed triggered ability waits for its specified event or time, then triggers and uses the stack unless an exception applies.', {
      mechanics: ['triggers'],
      sequence: ['The delayed trigger is created.', 'Its event happens.', 'The trigger is put on the stack.']
    });
  }

  if (text.includes('simultaneous triggers') || text.includes('apnap')) {
    return result('depends', 'Ordering simultaneous triggers depends on active player/nonactive player order and each controller\'s choices for their own triggers.', {
      mechanics: ['triggers'],
      clarificationNeeded: 'Tell me whose turn it is and which player controls each trigger.'
    });
  }

  if (text.includes('replacement effect') && text.includes('competing')) {
    return result('depends', 'Competing replacement effects often require the affected object or player to choose which applicable replacement effect to apply first.', {
      mechanics: ['replacement-effects'],
      clarificationNeeded: 'Tell me the affected object/player and the exact replacement effects applying to the same event.'
    });
  }

  if (text.includes('commander') && text.includes('command zone') && (text.includes('dies') || text.includes('graveyard') || text.includes('exile'))) {
    return result('depends', 'A commander can move through graveyard or exile before its owner chooses whether to move it to the command zone at the appropriate point.', {
      mechanics: ['commander', 'replacement-effects', 'zone-changes'],
      clarificationNeeded: 'Tell me whether the commander owner chooses to move it to the command zone.'
    });
  }

  if (text.includes('commander') && text.includes('color identity')) {
    return result('depends', 'Commander color identity questions depend on the exact commander and card being checked and should be delegated to the legality/card identity data.', {
      mechanics: ['commander', 'legality'],
      clarificationNeeded: 'Provide the exact commander and the card whose color identity you want checked.'
    });
  }

  if (text.includes('commander') && text.includes('legal')) {
    return result('depends', 'Commander legality is delegated to the canonical Legality Owner and needs the exact card identity and format context.', {
      mechanics: ['commander', 'legality'],
      clarificationNeeded: 'Provide the exact card name and Commander format context.'
    });
  }

  if (text.includes('activated ability') || text.includes('tap ability')) {
    if (text.includes('summoning sick') || text.includes('tap ability')) {
      return result('depends', 'Activated ability timing depends on whether the ability uses the tap symbol and whether the creature has been under its controller\'s control since their most recent turn began.', {
        mechanics: ['timing', 'abilities'],
        clarificationNeeded: 'Tell me whether the ability uses the tap symbol and how long its controller has controlled the creature.'
      });
    }
    return result('yes', 'Activated abilities can usually be activated whenever the player has priority unless timing text or another rule restricts them.', {
      mechanics: ['timing', 'abilities'],
      sequence: ['The player needs priority.', 'Costs must be payable.', 'Any targets must be legal.']
    });
  }

  if (text.includes('whose turn')) {
    return result('depends', 'This scenario depends on whose turn it is because priority, trigger ordering, or timing permissions can change the answer.', {
      mechanics: ['timing'],
      clarificationNeeded: 'Tell me whose turn it is and the current phase or step.'
    });
  }

  if (hasAny(text, ['humility', 'opalescence', 'blood moon layer', 'dependency order', 'copy layer', 'copy effect and continuous effect'])) {
    return result('unverified', 'This is a complex layer/dependency interaction outside the current deterministic Magic engine coverage.', {
      mechanics: ['layers']
    });
  }

  if (text.includes('unsupported corner case') || names.includes('panglacial wurm')) {
    return result('unverified', 'This is an unsupported corner case for the current deterministic Magic engine.', {
      mechanics: ['unverified']
    });
  }

  return null;
}
