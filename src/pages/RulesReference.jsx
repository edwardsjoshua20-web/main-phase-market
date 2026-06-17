import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, BookOpen, Crown, Shield, Zap, Flame, Anchor, Sparkles } from 'lucide-react';

const GAMES = [
  { key: 'magic',           label: 'Magic: The Gathering', icon: Crown,    color: 'text-yellow-400' },
  { key: 'pokemon',         label: 'Pokémon TCG',          icon: Zap,      color: 'text-yellow-300' },
  { key: 'yugioh',          label: 'Yu-Gi-Oh!',            icon: Flame,    color: 'text-purple-400' },
  { key: 'lorcana',         label: 'Disney Lorcana',       icon: Sparkles, color: 'text-blue-400' },
  { key: 'onepiece',        label: 'One Piece TCG',        icon: Anchor,   color: 'text-red-400' },
  { key: 'flesh_and_blood', label: 'Flesh and Blood',      icon: Shield,   color: 'text-orange-400' },
];

const MTG_FORMATS = [
  { key: 'commander', label: 'Commander / EDH' },
  { key: 'standard',  label: 'Standard' },
  { key: 'modern',    label: 'Modern' },
  { key: 'pioneer',   label: 'Pioneer' },
  { key: 'legacy',    label: 'Legacy' },
  { key: 'draft',     label: 'Booster Draft / Limited' },
  { key: 'basic',     label: 'Basic Game Rules' },
];

const RULES = {
  magic: {
    commander: {
      title: 'Commander (EDH) Rules',
      subtitle: 'The most popular casual multiplayer format',
      sections: [
        { title: 'Deck Construction', rules: [
          'Decks must contain exactly 100 cards, including the commander.',
          'Your commander is a legendary creature placed in the Command Zone.',
          'Only one copy of any card is allowed — no duplicates (except basic lands).',
          'Every card must only use mana symbols found in your commander\'s color identity.',
          'Color identity includes all mana symbols in the mana cost AND rules text.',
        ]},
        { title: 'The Command Zone', rules: [
          'Your commander starts in the Command Zone, visible to all players.',
          'You may cast your commander from the Command Zone at any time you could cast it normally.',
          'If your commander would go to the graveyard or be exiled, you may put it back in the Command Zone instead.',
          'Each time you cast your commander from the Command Zone after the first, it costs an additional {2} (commander tax).',
        ]},
        { title: 'Commander Damage', rules: [
          'If a player has been dealt 21 or more combat damage by a single commander over the course of the game, that player loses.',
          'Commander damage is tracked per commander — damage from different commanders is tracked separately.',
          'Commander damage does not reset when the commander changes zones.',
          'Non-combat damage does not count as commander damage.',
        ]},
        { title: 'Multiplayer Rules', rules: [
          'Typically played with 4 players, each starting at 40 life.',
          'When a player loses, all their permanents and spells are removed.',
          'A player can lose by: 0 life, empty library draw, 10 poison counters, or 21 commander damage.',
          'The full ban list is at mtgcommander.net.',
        ]},
      ]
    },
    standard: {
      title: 'Standard Rules',
      subtitle: 'Rotating competitive format using recent sets',
      sections: [
        { title: 'Format Overview', rules: [
          'Standard uses only cards from the most recently released sets.',
          'Sets rotate out approximately 3 years after release.',
          'Minimum 60-card deck, up to 4 copies of any card.',
          'Optional 15-card sideboard for best-of-3 matches.',
          'Each player starts at 20 life.',
        ]},
      ]
    },
    modern: {
      title: 'Modern Rules',
      subtitle: 'Non-rotating format from 8th Edition onwards',
      sections: [
        { title: 'Card Pool & Rules', rules: [
          'Uses cards printed from 8th Edition (2003) onwards. Does NOT rotate.',
          'Minimum 60-card deck, up to 4 copies of any card.',
          '15-card sideboard for tournaments.',
          'Modern has a significant ban list — check wizards.com for current bans.',
          'Games are fast — many decks aim to win by turn 3-4.',
        ]},
      ]
    },
    pioneer: {
      title: 'Pioneer Rules',
      subtitle: 'Non-rotating format from Return to Ravnica onwards',
      sections: [
        { title: 'Card Pool & Rules', rules: [
          'Uses cards from Return to Ravnica (2012) onwards. Does NOT rotate.',
          'Fetch lands (e.g., Scalding Tarn) are banned in Pioneer.',
          'Minimum 60-card deck, up to 4 copies of any card.',
          'Pioneer bridges the gap between Standard and Modern in power level.',
        ]},
      ]
    },
    legacy: {
      title: 'Legacy Rules',
      subtitle: 'Eternal format — almost every card ever printed is legal',
      sections: [
        { title: 'Card Pool & Rules', rules: [
          'Nearly every Magic card ever printed is legal. Does NOT rotate.',
          'Power 9 cards (Black Lotus, Moxen, etc.) are BANNED.',
          'Minimum 60-card deck, up to 4 copies of any card.',
          'Legacy has an extensive ban list including many broken combo pieces.',
          'Free spells like Force of Will are format staples.',
        ]},
      ]
    },
    draft: {
      title: 'Booster Draft & Limited',
      subtitle: 'Build your deck from freshly opened packs',
      sections: [
        { title: 'Booster Draft', rules: [
          'Each player opens a pack, picks one card, passes the rest to the left.',
          'Repeat until all cards are taken, then do 2 more packs (passing right, then left).',
          'Build a 40-card minimum deck from your picks plus basic lands.',
          'Typically 8 players seated around a table.',
        ]},
        { title: 'Sealed Deck', rules: [
          'Each player receives 6 booster packs and builds a 40-card minimum deck.',
          'No drafting — you build from only your opened cards.',
          'Sealed is common at Pre-release events for new sets.',
          'Unused cards form your sideboard — swap freely between games.',
        ]},
      ]
    },
    basic: {
      title: 'Basic Magic Rules',
      subtitle: 'How the game works — from zones to the stack',
      sections: [
        { title: 'Turn Structure', rules: [
          '1. Untap — Untap all your permanents.',
          '2. Upkeep — "At the beginning of upkeep" effects trigger.',
          '3. Draw — Draw a card.',
          '4. First Main Phase — Play lands, cast spells.',
          '5. Combat — Declare attackers, declare blockers, deal damage.',
          '6. Second Main Phase — Cast more spells after combat.',
          '7. End Step — "At end of turn" effects trigger.',
          '8. Cleanup — Discard to 7, damage clears from creatures.',
        ]},
        { title: 'The Stack', rules: [
          'Spells and abilities go on the stack and resolve last-in, first-out.',
          'Both players can respond by adding more spells/abilities.',
          'Once both players pass priority, the top item resolves.',
          'Instants can be cast at any time you have priority.',
        ]},
        { title: 'Card Types', rules: [
          'Lands — Tap for mana. One land per turn.',
          'Creatures — Attack and block. Have power / toughness.',
          'Instants — Cast any time you have priority.',
          'Sorceries — Cast during your main phase only.',
          'Enchantments — Persistent effects on the battlefield.',
          'Artifacts — Usually colorless permanents.',
          'Planeswalkers — Powerful allies with loyalty abilities.',
        ]},
        { title: 'Key Keywords', rules: [
          'Haste — Can attack and use tap abilities the turn it enters.',
          'Vigilance — Does not tap when attacking.',
          'Lifelink — Damage dealt also gains you that much life.',
          'Indestructible — Cannot be destroyed by damage or "destroy" effects.',
          'Hexproof — Cannot be targeted by opponents\' spells or abilities.',
          'Trample — Excess combat damage carries over to the player.',
          'Flying — Can only be blocked by flying or reach creatures.',
          'Deathtouch — Destroys any creature it deals damage to.',
          'Menace — Must be blocked by two or more creatures.',
        ]},
      ]
    },
  },
  pokemon: {
    main: {
      title: 'Pokémon TCG Rules',
      subtitle: 'The official rules for the Pokémon Trading Card Game',
      sections: [
        { title: 'Deck Construction', rules: [
          'Each deck must have exactly 60 cards.',
          'You may have up to 4 copies of any card with the same name (except basic Energy).',
          'Each deck must include at least one Basic Pokémon.',
          'You may have any number of basic Energy cards.',
        ]},
        { title: 'Setup', rules: [
          'Each player starts with 7 cards in hand.',
          'Place one Basic Pokémon face-down as your Active Pokémon.',
          'Place up to 5 more Basic Pokémon face-down on your Bench.',
          'Set aside 6 Prize Cards face-down — you draw one each time you knock out an opponent\'s Pokémon.',
          'If you have no Basic Pokémon in your opening hand, reveal your hand and mulligan.',
        ]},
        { title: 'Turn Structure', rules: [
          '1. Draw a card.',
          '2. Do any of the following in any order: play Basic Pokémon to your Bench, evolve Pokémon, attach one Energy card, play Trainer cards, retreat your Active Pokémon.',
          '3. Attack — use one of your Active Pokémon\'s attacks. Your turn ends after attacking.',
          'You may only attach ONE Energy card per turn.',
          'You may only retreat ONCE per turn (pay the retreat cost by discarding Energy).',
        ]},
        { title: 'Winning the Game', rules: [
          'Take all 6 of your Prize Cards (by knocking out opponent\'s Pokémon).',
          'Your opponent has no Pokémon left on their Bench or in play.',
          'Your opponent cannot draw a card at the start of their turn (deck out).',
          'Some special cards like Tag Team GX grant extra Prize Cards when knocked out.',
        ]},
        { title: 'Damage & Weakness/Resistance', rules: [
          'Damage is calculated based on the attack\'s listed damage.',
          'Weakness: if the defender has a weakness to the attacker\'s type, damage is ×2.',
          'Resistance: if the defender has resistance, subtract 30 from damage received.',
          'Weakness is applied before Resistance.',
          'A Pokémon is knocked out when its damage equals or exceeds its HP.',
        ]},
        { title: 'Special Rules — EX, GX, V, VMAX', rules: [
          'EX/GX/V/VMAX Pokémon are more powerful but give 2 Prize Cards when knocked out.',
          'VMAX and VSTAR Pokémon give 3 Prize Cards when knocked out.',
          'Each player can only use one GX attack per game.',
          'VSTAR Powers (VSTAR ability or attack) can only be used once per game.',
        ]},
      ]
    }
  },
  yugioh: {
    main: {
      title: 'Yu-Gi-Oh! Rules',
      subtitle: 'Official rules for the Yu-Gi-Oh! Trading Card Game',
      sections: [
        { title: 'Deck Construction', rules: [
          'Main Deck: 40–60 cards.',
          'Extra Deck: up to 15 cards (Fusion, Synchro, XYZ, and Link Monsters).',
          'Side Deck: up to 15 cards (swap in/out between duels in a match).',
          'You may have up to 3 copies of any card (unless restricted by the ban list).',
          'Some cards are Limited (1 copy) or Semi-Limited (2 copies) — check the Forbidden & Limited List.',
        ]},
        { title: 'Turn Structure', rules: [
          '1. Draw Phase — Draw one card.',
          '2. Standby Phase — Some card effects activate here.',
          '3. Main Phase 1 — Normal Summon/Set a monster, activate Spells/Traps.',
          '4. Battle Phase — Declare attacks with your monsters.',
          '5. Main Phase 2 — More Spell/Trap activations, set cards.',
          '6. End Phase — Discard to 6 if you have more than 6 cards.',
          'On your very first turn, you cannot conduct a Battle Phase.',
        ]},
        { title: 'Summoning Monsters', rules: [
          'Normal Summon: place one Level 1–4 monster from your hand per turn (no Tribute).',
          'Tribute Summon: Level 5–6 needs 1 Tribute; Level 7+ needs 2 Tributes.',
          'Special Summon: Fusion, Synchro, XYZ, Link, Ritual, and Pendulum Summons are all Special Summons and don\'t use your Normal Summon.',
          'You can Special Summon multiple times per turn unless a card says otherwise.',
        ]},
        { title: 'Spell & Trap Cards', rules: [
          'Normal Spells activate and resolve immediately.',
          'Continuous Spells/Traps stay on the field and have ongoing effects.',
          'Quick-Play Spells can be activated during your opponent\'s turn (if set).',
          'Trap Cards must be Set first and cannot be activated the same turn they are Set.',
          'Counter Traps can only be responded to by other Counter Traps.',
        ]},
        { title: 'Winning the Game', rules: [
          'Reduce your opponent\'s Life Points (LP) from 8000 to 0.',
          'If your opponent cannot draw a card, they lose (deck out).',
          'Some cards have special win conditions (e.g., Exodia — collect all 5 pieces to win instantly).',
          'Matches are typically best-of-3 duels.',
        ]},
        { title: 'The Forbidden & Limited List', rules: [
          'Konami regularly updates the "Forbidden & Limited List" (ban list).',
          'Forbidden cards cannot be used at all.',
          'Limited cards: max 1 copy per deck.',
          'Semi-Limited cards: max 2 copies per deck.',
          'Always check the current list before building a competitive deck.',
        ]},
      ]
    }
  },
  lorcana: {
    main: {
      title: 'Disney Lorcana Rules',
      subtitle: 'The official rules for Disney Lorcana TCG',
      sections: [
        { title: 'Deck Construction', rules: [
          'Decks must have exactly 60 cards.',
          'You may have up to 4 copies of any card with the same full name.',
          'Decks can only include cards from up to 2 different ink colors.',
          'There are 6 ink colors: Amber, Amethyst, Emerald, Ruby, Sapphire, and Steel.',
        ]},
        { title: 'Setup', rules: [
          'Each player starts with 7 cards in hand.',
          'The player who goes first does NOT draw on their first turn.',
          'Place your deck face-down and prepare your inkwell area.',
        ]},
        { title: 'Turn Structure', rules: [
          '1. Beginning Phase — Ready your cards (un-exert), then draw a card.',
          '2. Main Phase — In any order: put a card into your inkwell, play characters/items/actions, challenge opposing characters, quest with your characters.',
          'There is no fixed order in the Main Phase — you can do these actions as many times as you have cards/ink to do so.',
        ]},
        { title: 'The Inkwell', rules: [
          'At the start of your turn, you may place one card face-down into your inkwell.',
          'Only cards with the ink symbol (◆) in the bottom-left corner can be inked.',
          'Inkwell cards produce 1 ink each (tapped) to pay costs.',
          'You cannot undo inking a card — choose wisely.',
        ]},
        { title: 'Characters, Items & Actions', rules: [
          'Characters are played to the field and can quest or challenge once they have "dried" (not the turn they were played — unless they have Rush).',
          'Characters exert (turn sideways) to quest or challenge.',
          'Items provide ongoing effects and remain on the field.',
          'Actions are one-time effects and go to the discard pile after use.',
        ]},
        { title: 'Winning the Game', rules: [
          'The first player to collect 20 Lore wins.',
          'Lore is gained by questing with characters — each character shows how much Lore it provides.',
          'Challenging removes characters from play but does NOT grant Lore.',
          'If both players would reach 20 Lore at the same time, the player currently taking their turn wins.',
        ]},
        { title: 'Challenging', rules: [
          'You may challenge an exerted (sideways) opposing character with one of your ready characters.',
          'Both characters deal damage equal to their Strength to each other.',
          'A character with damage equal to or exceeding its Willpower is banished (discarded).',
          'Characters with Evasive can only be challenged by characters that also have Evasive.',
        ]},
      ]
    }
  },
  onepiece: {
    main: {
      title: 'One Piece Card Game Rules',
      subtitle: 'Official rules for the One Piece TCG by Bandai',
      sections: [
        { title: 'Deck Construction', rules: [
          'Main Deck: exactly 50 cards.',
          'DON!! Deck: exactly 10 DON!! cards (these are always the same 10 DON!! cards).',
          'You may have up to 4 copies of any card with the same card number.',
          'Your Leader card is placed separately — it is NOT part of your 50-card deck.',
          'Each deck must be built around one Leader card whose color matches the deck\'s color(s).',
        ]},
        { title: 'Setup', rules: [
          'Each player places their Leader card in the Leader Area.',
          'Shuffle your 50-card deck and place it face-down.',
          'Draw 5 cards as your starting hand.',
          'Each player may mulligan once — shuffle hand back, draw 5 new cards.',
          'Separate your DON!! Deck — you will gain DON!! cards each turn.',
        ]},
        { title: 'Turn Structure', rules: [
          '1. Refresh Phase — Rest all your active DON!! cards; draw 1 card.',
          '2. DON!! Phase — Gain 2 DON!! cards from your DON!! Deck (1 on first player\'s first turn).',
          '3. Main Phase — Play cards, attack, use effects.',
          '4. End Phase — End your turn.',
        ]},
        { title: 'DON!! Cards (Mana)', rules: [
          'DON!! cards are the resource system — similar to mana.',
          'You attach DON!! cards to your Leader or Characters to boost their power temporarily.',
          'Active DON!! can also be used to pay costs for cards that require DON!!.',
          'At the start of your turn, all your DON!! cards refresh (become active again).',
        ]},
        { title: 'Combat', rules: [
          'The attacking character battles a defending character or the opponent\'s Leader.',
          'Compare the attacker\'s Power vs. the defender\'s Power.',
          'If the attacker\'s Power is greater than or equal to the defender\'s Power, the defending character is KO\'d.',
          'When a Leader takes damage, the defending player reveals the top card of their deck — if it\'s a Trigger card, its effect activates.',
          'Life cards protect the Leader — when a Leader is attacked and loses, the owner adds a Life card to their hand.',
        ]},
        { title: 'Winning the Game', rules: [
          'Reduce your opponent\'s Leader to 0 Life cards, then deal one more attack to win.',
          'Each player starts with a set number of Life cards (shown on their Leader card, usually 4 or 5).',
          'An alternate win: if your opponent cannot draw a card, they lose.',
        ]},
      ]
    }
  },
  flesh_and_blood: {
    main: {
      title: 'Flesh and Blood Rules',
      subtitle: 'Official rules for the Flesh and Blood TCG by Legend Story Studios',
      sections: [
        { title: 'Deck Construction', rules: [
          'Deck size is determined by your Hero card\'s class and young/adult version.',
          'Classic Constructed: 60 card minimum deck.',
          'Blitz: exactly 40 cards.',
          'You may have up to 3 copies of any card (except Legendaries and Fabled — 1 copy max).',
          'Equipment cards (head, chest, arms, legs, off-hand, weapon) are separate from your deck.',
          'Cards must match your Hero\'s class or be generic (no class icon) to be included.',
        ]},
        { title: 'Setup', rules: [
          'Each player selects a Hero card and places it in front of them — your hero\'s starting life total is shown on the card.',
          'Equip your weapons and equipment cards to the appropriate zones.',
          'Shuffle your deck and draw 4 cards as your starting hand.',
          'Each player draws a hand of cards equal to their Hero\'s intellect at the start of each turn.',
        ]},
        { title: 'Turn Structure', rules: [
          '1. Start Phase — Flip your action point token to its active side (1 action point).',
          '2. Action Phase — Play cards, attack with your weapon or action cards, activate abilities.',
          '3. End Phase — Pitch remaining cards (place face-up under deck to determine turn order next cycle), discard remaining hand, draw up to your Intellect value.',
        ]},
        { title: 'The Resource System (Pitch)', rules: [
          'Cards have a pitch value (shown in the top-left corner as colored gems: red=1, yellow=2, blue=3).',
          'Pitching a card means playing it face-up to generate resources to pay for other cards.',
          'Pitched cards go face-up under your deck and will eventually cycle back into your hand.',
          'This is the core economy — you pitch weaker cards to power your stronger attacks.',
        ]},
        { title: 'Combat', rules: [
          'You attack your opponent\'s hero directly (no blocking zones).',
          'The defending player can defend with cards from their hand — each card has a defense value.',
          'If total defense is less than attack power, the difference is dealt as damage to the defending hero.',
          'Equipment cards can also be used to block, but they take damage and may break.',
        ]},
        { title: 'Winning the Game', rules: [
          'Reduce your opponent\'s Hero to 0 life to win.',
          'Some Heroes have special "Legendary Life" bonuses that modify their base life.',
          'Fatigue is also a win condition — if a player cannot draw a card when required, they lose.',
        ]},
      ]
    }
  }
};

function RuleSection({ section }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-gray-800/50 border border-gray-700/60 rounded-xl overflow-hidden mb-3">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-3.5 text-left hover:bg-gray-700/40 transition-colors"
      >
        <span className="font-semibold text-white text-sm">{section.title}</span>
        {open ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
      </button>
      {open && (
        <ul className="px-5 pb-4 space-y-2">
          {section.rules.map((rule, i) => (
            <li key={i} className="flex gap-2.5 text-sm text-gray-300 leading-relaxed">
              <span className="text-yellow-500 font-bold mt-0.5 shrink-0">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RulesReference() {
  const [activeGame, setActiveGame] = useState('magic');
  const [activeFormat, setActiveFormat] = useState('commander');

  const gameRules = RULES[activeGame];
  const isMtg = activeGame === 'magic';
  const content = isMtg ? gameRules[activeFormat] : gameRules.main;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gradient-to-b from-gray-800 to-gray-900 border-b border-gray-700/60 px-4 py-8">
        <div className="max-w-5xl mx-auto">
          <Link to="/Forum" className="inline-flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back to Forum
          </Link>
          <div className="flex items-center gap-3 mb-1">
            <BookOpen className="w-7 h-7 text-yellow-400" />
            <h1 className="text-3xl font-extrabold text-white">Rules Reference</h1>
          </div>
          <p className="text-gray-400 mt-1">Official rules for every Trading Card Game — in plain English.</p>

          {/* Game selector tabs */}
          <div className="flex flex-wrap gap-2 mt-5">
            {GAMES.map(g => {
              const Icon = g.icon;
              return (
                <button
                  key={g.key}
                  onClick={() => { setActiveGame(g.key); if (g.key === 'magic') setActiveFormat('commander'); }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeGame === g.key
                      ? 'bg-yellow-500 text-gray-900'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700 border border-gray-700'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {g.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col lg:flex-row gap-6">
        {/* MTG format sidebar */}
        {isMtg && (
          <aside className="lg:w-56 shrink-0">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">Format</p>
            <nav className="lg:sticky lg:top-4 space-y-1">
              {MTG_FORMATS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setActiveFormat(f.key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left ${
                    activeFormat === f.key
                      ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0">
          {content ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">{content.title}</h2>
                <p className="text-gray-400 mt-1">{content.subtitle}</p>
              </div>
              {content.sections.map((section, i) => (
                <RuleSection key={i} section={section} />
              ))}
            </>
          ) : (
            <p className="text-gray-500">No rules found for this selection.</p>
          )}

          {/* CTA */}
          <div className="mt-8 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex-1">
              <p className="font-semibold text-white">Still have a rules question?</p>
              <p className="text-gray-400 text-sm mt-0.5">Ask the community in the Rules Q&A forum — get answers from experienced players.</p>
            </div>
            <Link
              to="/Forum?category=rules_qa"
              className="shrink-0 bg-yellow-500 hover:bg-yellow-400 text-gray-900 font-bold px-4 py-2 rounded-lg text-sm transition-colors"
            >
              Ask a Question →
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}