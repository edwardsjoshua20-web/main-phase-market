export const ENCYCLOPEDIA_GAMES = Object.freeze([
  {
    id: 'magic',
    routeKey: 'magic',
    searchGame: 'magic',
    assetGame: 'mtg',
    label: 'Magic: The Gathering',
    shortLabel: 'Magic',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Magic_the_Gathering_2017.svg',
    logoClassName: 'max-h-12 max-w-[180px]',
    accent: '#8b5cf6',
    tintClassName: 'from-violet-950 via-slate-950 to-amber-950',
    catalogStatus: 'Complete local card and set catalog foundation through the MainPhase catalog/search owners.',
    cardSource: 'Scryfall bulk/catalog source mirrored into MainPhase MTG catalog indexes.',
    sourceLimitations: 'Magic set detail uses the MainPhase MTG search-lite and printing indexes; source legality and Oracle identity remain Scryfall-derived.',
    ruleStatus: 'Foundational rules topics with official Comprehensive Rules attribution.',
    sourceRefs: [
      { label: 'Magic rules page', url: 'https://magic.wizards.com/en/rules', freshness: 'Official page verified September 10, 2026' },
      { label: 'Scryfall bulk/catalog source', url: 'https://scryfall.com/docs/api/bulk-data', freshness: 'Catalog ingestion source used by MainPhase build scripts' }
    ],
    focus: ['Sets', 'Collector order', 'Oracle printings', 'Rules topics', 'Store availability']
  },
  {
    id: 'pokemon',
    routeKey: 'pokemon',
    searchGame: 'pokemon',
    assetGame: 'pokemon',
    label: 'Pokemon TCG',
    shortLabel: 'Pokemon',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Pok%C3%A9mon_Trading_Card_Game_logo.svg',
    logoClassName: 'max-h-14 max-w-[180px]',
    accent: '#f59e0b',
    tintClassName: 'from-blue-950 via-slate-950 to-yellow-950',
    catalogStatus: 'Local public catalog and set data available; rules coverage is source-attributed and intentionally summarized.',
    cardSource: 'PokemonTCG.io-compatible local public catalog preserved by MainPhase automation.',
    sourceLimitations: 'Last automation preserved the local source because the live Pokemon index was unavailable; some future releases may lag until the source refresh succeeds.',
    ruleStatus: 'Foundational legality and play topics linked to official Play Pokemon resources.',
    sourceRefs: [
      { label: 'Play Pokemon rules and formats', url: 'https://play.pokemon.com/en-us/resources/rules/?category=tcg', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Regulation marks', 'Formats', 'Card legality']
  },
  {
    id: 'yugioh',
    routeKey: 'yugioh',
    searchGame: 'yugioh',
    assetGame: 'yugioh',
    label: 'Yu-Gi-Oh!',
    shortLabel: 'Yu-Gi-Oh!',
    logoSrc: 'https://commons.wikimedia.org/wiki/Special:Redirect/file/Yu-Gi-Oh!.png',
    logoClassName: 'max-h-12 max-w-[180px]',
    accent: '#a78bfa',
    tintClassName: 'from-purple-950 via-slate-950 to-stone-950',
    catalogStatus: 'Local public catalog and set data available; set card membership is normalized from official-database-derived printings.',
    cardSource: 'YGOPRODeck API local public catalog with card_sets printings.',
    sourceLimitations: 'Set membership and variants come from card_sets entries; official tournament legality still belongs to current Konami lists.',
    ruleStatus: 'Foundational duel, deck construction, and policy topics linked to official Konami resources.',
    sourceRefs: [
      { label: 'Yu-Gi-Oh! rulebook and beginner guide', url: 'https://www.yugioh-card.com/en/rulebook/', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Card database printings', 'Deck construction', 'Forbidden and Limited context']
  },
  {
    id: 'lorcana',
    routeKey: 'lorcana',
    searchGame: 'lorcana',
    assetGame: 'lorcana',
    label: 'Disney Lorcana',
    shortLabel: 'Lorcana',
    logoSrc: '/images/disney-lorcana-logo.png',
    logoClassName: 'max-h-14 max-w-[190px]',
    accent: '#38bdf8',
    tintClassName: 'from-sky-950 via-slate-950 to-fuchsia-950',
    catalogStatus: 'Local public catalog and set data available; rules coverage points to Ravensburger documents.',
    cardSource: 'Lorcast API local public catalog.',
    sourceLimitations: 'Catalog fields are limited to the Lorcast public card/search model mirrored by MainPhase.',
    ruleStatus: 'Foundational quick start, comprehensive, and tournament rules topics with official resources.',
    sourceRefs: [
      { label: 'Disney Lorcana resources', url: 'https://www.disneylorcana.com/en-GB/resources/', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Ink colors', 'Lore', 'Comprehensive rules']
  },
  {
    id: 'flesh_and_blood',
    routeKey: 'fab',
    searchGame: 'flesh_and_blood',
    assetGame: 'fab',
    label: 'Flesh and Blood',
    shortLabel: 'FAB',
    logoSrc: 'https://uchroniesgames.fr/web/image/event.event/168/image_1024',
    logoClassName: 'max-h-12 max-w-[180px]',
    accent: '#ef4444',
    tintClassName: 'from-red-950 via-slate-950 to-zinc-950',
    catalogStatus: 'Local public catalog and set data available; printings are normalized by set ID.',
    cardSource: 'the-fab-cube English card JSON local public mirror.',
    sourceLimitations: 'FAB printings, foiling, and legality reflect the mirrored source snapshot; event policy should be checked against official FAB policy pages.',
    ruleStatus: 'Foundational game concepts, turn structure, combat, and policy topics linked to the official rules site.',
    sourceRefs: [
      { label: 'Flesh and Blood rules and policy', url: 'https://rules.fabtcg.com/en/', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Printings', 'Heroes', 'Combat chain', 'Tournament policy']
  },
  {
    id: 'onepiece',
    routeKey: 'onepiece',
    searchGame: 'onepiece',
    assetGame: 'onepiece',
    label: 'One Piece TCG',
    shortLabel: 'One Piece',
    logoSrc: '/images/oplogo.webp',
    logoClassName: 'max-h-12 max-w-[180px] brightness-0 invert',
    accent: '#f97316',
    tintClassName: 'from-orange-950 via-slate-950 to-cyan-950',
    catalogStatus: 'Local public catalog and set data available; rules coverage links to the official Bandai rules hub.',
    cardSource: 'punk-records One Piece English card catalog local public mirror.',
    sourceLimitations: 'The current source manifest records missing candidate cards; catalog pages show represented cards only.',
    ruleStatus: 'Foundational play guide, comprehensive rules, tournament rules, and FAQ source links.',
    sourceRefs: [
      { label: 'One Piece Card Game rules', url: 'https://en.onepiece-cardgame.com/rules/', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Leader color identity', 'DON!!', 'Turn flow', 'Rule updates']
  },
  {
    id: 'starwars',
    routeKey: 'starwars',
    searchGame: 'starwars',
    assetGame: 'starwars',
    label: 'Star Wars Unlimited',
    shortLabel: 'SWU',
    logoSrc: '/images/star-wars-unlimited-logo.png',
    logoClassName: 'max-h-14 max-w-[170px] brightness-0 invert',
    accent: '#22d3ee',
    tintClassName: 'from-cyan-950 via-slate-950 to-stone-950',
    catalogStatus: 'Local public catalog and set data available; rules coverage links to official FFG/Star Wars Unlimited resources.',
    cardSource: 'SWU API export local public catalog.',
    sourceLimitations: 'Variants and rulings reflect the exported SWU API snapshot mirrored by MainPhase.',
    ruleStatus: 'Foundational getting started, formats, and rules topics with official resources.',
    sourceRefs: [
      { label: 'Star Wars Unlimited how to play', url: 'https://starwarsunlimited.com/how-to-play', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Leaders', 'Bases', 'Aspects', 'Formats']
  }
]);

function ruleTopic(gameId, sectionId, topicId, title, summary, sourceLabels, options = {}) {
  return {
    gameId,
    sectionId,
    topicId,
    slug: topicId,
    title,
    summary,
    officialTerms: options.officialTerms || [],
    sourceLabels,
    version: options.version || 'Official page verified September 10, 2026',
    relatedTopics: options.relatedTopics || [],
    relatedMechanics: options.relatedMechanics || [],
    relatedCardTypes: options.relatedCardTypes || []
  };
}

export const ENCYCLOPEDIA_RULE_TOPICS = Object.freeze({
  magic: [
    ruleTopic('magic', 'turns', 'turn-structure', 'Turn Structure', 'Phases and steps organize priority, actions, combat, and cleanup. Use this as a map to official Comprehensive Rules timing.', ['Magic rules page'], { officialTerms: ['Beginning phase', 'Precombat main phase', 'Combat phase', 'Ending phase'], relatedTopics: ['priority-and-stack', 'combat'] }),
    ruleTopic('magic', 'timing', 'priority-and-stack', 'Priority and the Stack', 'Spells and most abilities use the stack. Players receive priority before objects resolve, which is the core timing model for responses.', ['Magic rules page'], { officialTerms: ['Priority', 'Stack', 'Resolve'], relatedTopics: ['turn-structure'] }),
    ruleTopic('magic', 'objects', 'card-types-and-zones', 'Card Types and Zones', 'Card types, supertypes, subtypes, and zones determine what an object is and where game rules can find it.', ['Magic rules page'], { officialTerms: ['Card type', 'Zone', 'Object'], relatedCardTypes: ['Artifact', 'Creature', 'Enchantment', 'Instant', 'Land', 'Planeswalker', 'Sorcery'] }),
    ruleTopic('magic', 'combat', 'combat', 'Combat', 'Combat moves through beginning of combat, declare attackers, declare blockers, combat damage, and end of combat timing.', ['Magic rules page'], { officialTerms: ['Declare attackers', 'Declare blockers', 'Combat damage'], relatedTopics: ['turn-structure'] }),
    ruleTopic('magic', 'formats', 'commander', 'Commander Context', 'Commander uses Magic rules plus format-specific deck construction, color identity, and commander-zone behavior.', ['Magic rules page'], { officialTerms: ['Commander', 'Color identity', 'Command zone'], relatedTopics: ['card-types-and-zones'] })
  ],
  pokemon: [
    ruleTopic('pokemon', 'game-flow', 'setup', 'Setup', 'Players prepare decks, prizes, Active Pokemon, Benched Pokemon, and opening hands according to official Pokemon TCG rules.', ['Play Pokemon rules and formats'], { officialTerms: ['Active Pokemon', 'Bench', 'Prize Cards'], relatedTopics: ['active-pokemon', 'bench', 'prize-cards'] }),
    ruleTopic('pokemon', 'game-flow', 'turn-structure', 'Turn Structure', 'A turn proceeds through draw, available actions, attack when allowed, and effects that complete the turn.', ['Play Pokemon rules and formats'], { officialTerms: ['Draw a card', 'Attack', 'End your turn'], relatedTopics: ['attacks', 'abilities', 'retreat'] }),
    ruleTopic('pokemon', 'zones', 'active-pokemon', 'Active Pokemon', 'The Active Pokemon is the Pokemon currently battling and the one that attacks or is attacked unless a rule or effect says otherwise.', ['Play Pokemon rules and formats'], { officialTerms: ['Active Pokemon'], relatedTopics: ['bench', 'retreat', 'knock-outs'], relatedCardTypes: ['Pokemon'] }),
    ruleTopic('pokemon', 'zones', 'bench', 'Bench', 'Benched Pokemon are in play but not Active; they can evolve, receive Energy, and be affected by text that references the Bench.', ['Play Pokemon rules and formats'], { officialTerms: ['Bench', 'Benched Pokemon'], relatedTopics: ['active-pokemon', 'evolution'] }),
    ruleTopic('pokemon', 'game-flow', 'prize-cards', 'Prize Cards', 'Prize Cards are set aside during setup and taken when opposing Pokemon are Knocked Out as directed by official rules.', ['Play Pokemon rules and formats'], { officialTerms: ['Prize Cards'], relatedTopics: ['knock-outs', 'winning'] }),
    ruleTopic('pokemon', 'resources', 'energy', 'Energy', 'Energy cards pay attack costs and are attached according to Pokemon TCG rules and card effects.', ['Play Pokemon rules and formats'], { officialTerms: ['Energy', 'Basic Energy', 'Special Energy'], relatedTopics: ['attacks'], relatedCardTypes: ['Energy'] }),
    ruleTopic('pokemon', 'actions', 'attacks', 'Attacks', 'Attacks use printed costs, damage, and effects. The official rules determine when an attack can be declared and how it resolves.', ['Play Pokemon rules and formats'], { officialTerms: ['Attack', 'Damage', 'Weakness', 'Resistance'], relatedTopics: ['energy', 'special-conditions', 'knock-outs'] }),
    ruleTopic('pokemon', 'actions', 'abilities', 'Abilities', 'Abilities are card-defined effects with their own timing, restrictions, and labels as printed on Pokemon cards.', ['Play Pokemon rules and formats'], { officialTerms: ['Ability'], relatedTopics: ['turn-structure'], relatedCardTypes: ['Pokemon'] }),
    ruleTopic('pokemon', 'actions', 'retreat', 'Retreat', 'Retreat moves the Active Pokemon to the Bench by paying the retreat cost unless an effect changes that permission or cost.', ['Play Pokemon rules and formats'], { officialTerms: ['Retreat Cost', 'Retreat'], relatedTopics: ['active-pokemon', 'bench', 'energy'] }),
    ruleTopic('pokemon', 'actions', 'evolution', 'Evolution', 'Evolution changes a Pokemon into the next stage according to timing restrictions, card names, and card effects.', ['Play Pokemon rules and formats'], { officialTerms: ['Basic', 'Stage 1', 'Stage 2', 'Evolves From'], relatedTopics: ['bench'], relatedCardTypes: ['Pokemon'] }),
    ruleTopic('pokemon', 'status', 'special-conditions', 'Special Conditions', 'Special Conditions such as Asleep, Burned, Confused, Paralyzed, and Poisoned follow official condition rules.', ['Play Pokemon rules and formats'], { officialTerms: ['Asleep', 'Burned', 'Confused', 'Paralyzed', 'Poisoned'], relatedTopics: ['attacks'] }),
    ruleTopic('pokemon', 'game-flow', 'knock-outs', 'Knock Outs', 'When damage or effects Knock Out a Pokemon, the official rules determine discard movement and Prize Card consequences.', ['Play Pokemon rules and formats'], { officialTerms: ['Knocked Out', 'Discard pile'], relatedTopics: ['prize-cards', 'winning'] }),
    ruleTopic('pokemon', 'game-flow', 'winning', 'Winning', 'Winning can occur through Prize Cards, an opponent having no Pokemon in play, or an opponent being unable to draw when required.', ['Play Pokemon rules and formats'], { officialTerms: ['Win condition', 'Prize Cards'], relatedTopics: ['prize-cards', 'knock-outs'] }),
    ruleTopic('pokemon', 'deck-building', 'deck-construction', 'Deck Construction', 'Pokemon deck construction depends on format rules, card limits, and Basic Energy exceptions.', ['Play Pokemon rules and formats'], { officialTerms: ['Deck', 'Basic Energy', 'Card limit'], relatedTopics: ['formats-rotation'] }),
    ruleTopic('pokemon', 'organized-play', 'formats-rotation', 'Formats and Rotation', 'Standard, Expanded, Limited, and other formats depend on current Play Pokemon documents, rotation, and regulation marks.', ['Play Pokemon rules and formats'], { officialTerms: ['Standard', 'Expanded', 'Limited', 'Regulation mark'], relatedTopics: ['deck-construction'] })
  ],
  yugioh: [
    ruleTopic('yugioh', 'game-flow', 'setup', 'Setup', 'Duel setup establishes decks, Life Points, opening hands, turn player, and starting field state according to the official rulebook.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Duel', 'Life Points', 'Main Deck'], relatedTopics: ['main-extra-side-deck', 'zones'] }),
    ruleTopic('yugioh', 'zones', 'zones', 'Zones', 'Yu-Gi-Oh! zones define where Monster, Spell, Trap, Extra Deck, Field, Graveyard, and banished cards exist.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Monster Zone', 'Spell & Trap Zone', 'Extra Monster Zone'], relatedTopics: ['link', 'pendulum'] }),
    ruleTopic('yugioh', 'game-flow', 'turn-phases', 'Turn Phases', 'Turns move through Draw, Standby, Main, Battle, and End Phase structure with actions restricted by phase.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Draw Phase', 'Standby Phase', 'Main Phase', 'Battle Phase', 'End Phase'], relatedTopics: ['chains'] }),
    ruleTopic('yugioh', 'timing', 'chains', 'Chains', 'Chains organize responses and effect resolution using official timing and chain-link rules.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Chain', 'Chain Link'], relatedTopics: ['spell-speed'] }),
    ruleTopic('yugioh', 'timing', 'spell-speed', 'Spell Speed', 'Spell Speed restricts which effects can respond to other effects and how Chains can be built.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Spell Speed 1', 'Spell Speed 2', 'Spell Speed 3'], relatedTopics: ['chains'] }),
    ruleTopic('yugioh', 'summoning', 'normal-special-summons', 'Normal and Special Summons', 'Normal Summons and Special Summons have distinct permissions, limits, and procedure.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Normal Summon', 'Special Summon'], relatedTopics: ['tribute', 'fusion', 'synchro', 'xyz', 'link', 'ritual'] }),
    ruleTopic('yugioh', 'summoning', 'tribute', 'Tribute Summon', 'Tribute Summons use Tributes to Normal Summon higher-Level monsters under official rules.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Tribute', 'Tribute Summon'], relatedTopics: ['normal-special-summons'] }),
    ruleTopic('yugioh', 'summoning', 'fusion', 'Fusion Summon', 'Fusion Summons use specified materials and effects to summon Fusion Monsters from the Extra Deck.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Fusion Summon', 'Fusion Monster', 'Fusion Material'], relatedCardTypes: ['Fusion Monster'] }),
    ruleTopic('yugioh', 'summoning', 'synchro', 'Synchro Summon', 'Synchro Summons use Tuners and non-Tuners whose Levels match the Synchro Monster requirement.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Synchro Summon', 'Tuner', 'Synchro Monster'], relatedCardTypes: ['Synchro Monster'] }),
    ruleTopic('yugioh', 'summoning', 'xyz', 'Xyz Summon', 'Xyz Summons use monsters of the same Level as materials under an Xyz Monster.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Xyz Summon', 'Xyz Material', 'Rank'], relatedCardTypes: ['Xyz Monster'] }),
    ruleTopic('yugioh', 'summoning', 'pendulum', 'Pendulum', 'Pendulum Monsters and Pendulum Zones have distinct setup, scale, and summoning rules.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Pendulum Monster', 'Pendulum Scale', 'Pendulum Zone'], relatedTopics: ['zones'] }),
    ruleTopic('yugioh', 'summoning', 'link', 'Link Summon', 'Link Summons use Link Materials, Link Ratings, arrows, and Extra Monster Zone placement rules.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Link Summon', 'Link Rating', 'Link Arrow'], relatedTopics: ['zones'], relatedCardTypes: ['Link Monster'] }),
    ruleTopic('yugioh', 'summoning', 'ritual', 'Ritual Summon', 'Ritual Summons use Ritual Spells and required Tributes or equivalent card effects.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Ritual Summon', 'Ritual Monster', 'Ritual Spell'], relatedCardTypes: ['Ritual Monster'] }),
    ruleTopic('yugioh', 'deck-building', 'main-extra-side-deck', 'Main, Extra, and Side Deck', 'Deck zones and deck construction rules distinguish Main Deck, Extra Deck, and Side Deck usage.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Main Deck', 'Extra Deck', 'Side Deck'], relatedTopics: ['setup'] }),
    ruleTopic('yugioh', 'organized-play', 'banlist-limits', 'Banlist and Limits', 'Forbidden, Limited, and Semi-Limited status must be checked against current official Konami tournament resources.', ['Yu-Gi-Oh! rulebook and beginner guide'], { officialTerms: ['Forbidden', 'Limited', 'Semi-Limited'], relatedTopics: ['main-extra-side-deck'] })
  ],
  lorcana: [
    ruleTopic('lorcana', 'game-flow', 'setup', 'Setup', 'Players prepare decks, starting hands, starting lore, and initial game state under Lorcana rules.', ['Disney Lorcana resources'], { officialTerms: ['Deck', 'Lore', 'Starting hand'], relatedTopics: ['lore', 'deck-construction'] }),
    ruleTopic('lorcana', 'resources', 'inkwell', 'Inkwell', 'The inkwell stores cards used as ink resources; only eligible cards can be placed there unless a rule or effect says otherwise.', ['Disney Lorcana resources'], { officialTerms: ['Inkwell', 'Inkable'], relatedTopics: ['ink'] }),
    ruleTopic('lorcana', 'resources', 'ink', 'Ink', 'Ink is the resource used to pay costs for cards and effects.', ['Disney Lorcana resources'], { officialTerms: ['Ink', 'Cost'], relatedTopics: ['inkwell'] }),
    ruleTopic('lorcana', 'game-state', 'ready-exerted', 'Ready and Exerted', 'Ready and exerted state determines whether characters, items, or other objects can perform certain actions.', ['Disney Lorcana resources'], { officialTerms: ['Ready', 'Exert'], relatedTopics: ['questing', 'challenging'] }),
    ruleTopic('lorcana', 'actions', 'questing', 'Questing', 'Questing is a core way characters gain lore, subject to readiness and timing rules.', ['Disney Lorcana resources'], { officialTerms: ['Quest', 'Lore'], relatedTopics: ['lore', 'ready-exerted'], relatedCardTypes: ['Character'] }),
    ruleTopic('lorcana', 'actions', 'challenging', 'Challenging', 'Challenging resolves character combat and damage using strength and willpower.', ['Disney Lorcana resources'], { officialTerms: ['Challenge', 'Strength', 'Willpower'], relatedTopics: ['ready-exerted'], relatedCardTypes: ['Character'] }),
    ruleTopic('lorcana', 'game-flow', 'lore', 'Lore', 'Lore is the primary progress resource for winning Lorcana games.', ['Disney Lorcana resources'], { officialTerms: ['Lore'], relatedTopics: ['questing', 'winning'] }),
    ruleTopic('lorcana', 'card-types', 'characters', 'Characters', 'Characters have costs, strength, willpower, lore, classifications, and abilities that define their game role.', ['Disney Lorcana resources'], { officialTerms: ['Character', 'Strength', 'Willpower'], relatedCardTypes: ['Character'] }),
    ruleTopic('lorcana', 'card-types', 'actions', 'Actions', 'Actions produce one-shot effects and include Songs where card text allows singing.', ['Disney Lorcana resources'], { officialTerms: ['Action', 'Song'], relatedCardTypes: ['Action'] }),
    ruleTopic('lorcana', 'card-types', 'items', 'Items', 'Items remain in play and provide abilities or effects according to their text.', ['Disney Lorcana resources'], { officialTerms: ['Item'], relatedCardTypes: ['Item'] }),
    ruleTopic('lorcana', 'card-types', 'locations', 'Locations', 'Locations are a distinct card type with movement and interaction rules in current Lorcana documents.', ['Disney Lorcana resources'], { officialTerms: ['Location', 'Move'], relatedCardTypes: ['Location'] }),
    ruleTopic('lorcana', 'deck-building', 'deck-construction', 'Deck Construction', 'Deck construction depends on ink colors, copy limits, card legality, and official format rules.', ['Disney Lorcana resources'], { officialTerms: ['Ink color', 'Deck'], relatedTopics: ['formats'] }),
    ruleTopic('lorcana', 'organized-play', 'formats', 'Formats', 'Official formats and tournament rules are maintained in Ravensburger resources and should be checked for current organized play.', ['Disney Lorcana resources'], { officialTerms: ['Tournament Rules', 'Format'], relatedTopics: ['deck-construction'] })
  ],
  flesh_and_blood: [
    ruleTopic('flesh_and_blood', 'identity', 'hero', 'Hero', 'A hero defines deck identity and game setup constraints such as class, talent, life, and intellect where applicable.', ['Flesh and Blood rules and policy'], { officialTerms: ['Hero', 'Class', 'Talent'], relatedTopics: ['deck-construction'] }),
    ruleTopic('flesh_and_blood', 'equipment', 'weapon', 'Weapon', 'Weapons are equipped and used to attack or enable abilities according to type and text.', ['Flesh and Blood rules and policy'], { officialTerms: ['Weapon', 'Attack'], relatedTopics: ['combat-chain'], relatedCardTypes: ['Weapon'] }),
    ruleTopic('flesh_and_blood', 'equipment', 'equipment', 'Equipment', 'Equipment starts in equipment zones and can provide defensive, attack, or utility abilities.', ['Flesh and Blood rules and policy'], { officialTerms: ['Equipment', 'Equipment zone'], relatedTopics: ['weapon'], relatedCardTypes: ['Equipment'] }),
    ruleTopic('flesh_and_blood', 'resources', 'pitch-resources', 'Pitch and Resources', 'Pitching cards generates resources based on pitch value and follows official timing permissions.', ['Flesh and Blood rules and policy'], { officialTerms: ['Pitch', 'Resource'], relatedTopics: ['action-points'] }),
    ruleTopic('flesh_and_blood', 'actions', 'action-points', 'Action Points', 'Action points determine how many action-card or attack actions a player can take unless Go Again or effects modify the sequence.', ['Flesh and Blood rules and policy'], { officialTerms: ['Action point', 'Go again'], relatedTopics: ['pitch-resources', 'combat-chain'] }),
    ruleTopic('flesh_and_blood', 'zones', 'arsenal', 'Arsenal', 'Arsenal stores a face-down card with specific play restrictions and end-of-turn setup.', ['Flesh and Blood rules and policy'], { officialTerms: ['Arsenal'], relatedTopics: ['turn-structure'] }),
    ruleTopic('flesh_and_blood', 'combat', 'combat-chain', 'Combat Chain', 'Combat uses chain links, layers, attack/defend/reaction windows, damage, and resolution structure.', ['Flesh and Blood rules and policy'], { officialTerms: ['Combat chain', 'Chain link'], relatedTopics: ['attack-reactions', 'defense-reactions', 'chain-links'] }),
    ruleTopic('flesh_and_blood', 'combat', 'attack-reactions', 'Attack Reactions', 'Attack reactions are played in their official reaction window and modify attacks or combat state.', ['Flesh and Blood rules and policy'], { officialTerms: ['Attack Reaction'], relatedTopics: ['combat-chain'] }),
    ruleTopic('flesh_and_blood', 'combat', 'defense-reactions', 'Defense Reactions', 'Defense reactions are played in the defense reaction window and can defend or modify combat.', ['Flesh and Blood rules and policy'], { officialTerms: ['Defense Reaction'], relatedTopics: ['combat-chain'] }),
    ruleTopic('flesh_and_blood', 'combat', 'chain-links', 'Chain Links', 'Chain links track individual attacks and their objects on the combat chain.', ['Flesh and Blood rules and policy'], { officialTerms: ['Chain link'], relatedTopics: ['combat-chain'] }),
    ruleTopic('flesh_and_blood', 'game-flow', 'turn-structure', 'Turn Structure', 'Turns are organized into start, action, and end phases, with priority and game state checks defining when actions happen.', ['Flesh and Blood rules and policy'], { officialTerms: ['Start phase', 'Action phase', 'End phase'], relatedTopics: ['action-points', 'arsenal'] }),
    ruleTopic('flesh_and_blood', 'deck-building', 'deck-construction', 'Deck Construction', 'Deck construction is defined by hero, class, talent, equipment, card pool, and format restrictions.', ['Flesh and Blood rules and policy'], { officialTerms: ['Deck', 'Hero', 'Class', 'Talent'], relatedTopics: ['hero', 'classic-constructed', 'blitz'] }),
    ruleTopic('flesh_and_blood', 'formats', 'classic-constructed', 'Classic Constructed', 'Classic Constructed uses its own deck size, hero legality, and card pool rules maintained by official policy.', ['Flesh and Blood rules and policy'], { officialTerms: ['Classic Constructed'], relatedTopics: ['deck-construction', 'legality-living-legend'] }),
    ruleTopic('flesh_and_blood', 'formats', 'blitz', 'Blitz', 'Blitz uses a separate deck size, young heroes, and format legality model.', ['Flesh and Blood rules and policy'], { officialTerms: ['Blitz', 'Young Hero'], relatedTopics: ['deck-construction', 'legality-living-legend'] }),
    ruleTopic('flesh_and_blood', 'organized-play', 'legality-living-legend', 'Legality and Living Legend', 'Legality, banned/suspended status, and Living Legend changes belong to official FAB policy and format documents.', ['Flesh and Blood rules and policy'], { officialTerms: ['Living Legend', 'Banned', 'Suspended'], relatedTopics: ['classic-constructed', 'blitz'] })
  ],
  onepiece: [
    ruleTopic('onepiece', 'identity', 'leader', 'Leader', 'The Leader card defines color identity, life, and attacks/effects distinct from ordinary Character cards.', ['One Piece Card Game rules'], { officialTerms: ['Leader', 'Life', 'Color'], relatedTopics: ['life', 'color-restriction'], relatedCardTypes: ['Leader'] }),
    ruleTopic('onepiece', 'game-flow', 'life', 'Life', 'Life cards are a core setup and victory resource tied to Leader cards and damage.', ['One Piece Card Game rules'], { officialTerms: ['Life'], relatedTopics: ['leader', 'attacking'] }),
    ruleTopic('onepiece', 'resources', 'don', 'DON!!', 'DON!! cards are the resource system used to pay costs and power cards through attachment and effects.', ['One Piece Card Game rules'], { officialTerms: ['DON!!', 'Cost'], relatedTopics: ['turn-phases', 'attacking'] }),
    ruleTopic('onepiece', 'card-types', 'character', 'Character', 'Character cards enter play, attack when allowed, and use power, traits, counter, and effects.', ['One Piece Card Game rules'], { officialTerms: ['Character', 'Power', 'Counter'], relatedTopics: ['attacking', 'counter'], relatedCardTypes: ['Character'] }),
    ruleTopic('onepiece', 'card-types', 'event', 'Event', 'Event cards resolve effects according to timing and cost restrictions.', ['One Piece Card Game rules'], { officialTerms: ['Event'], relatedCardTypes: ['Event'] }),
    ruleTopic('onepiece', 'card-types', 'stage', 'Stage', 'Stage cards remain in play and apply effects as defined by official rules and card text.', ['One Piece Card Game rules'], { officialTerms: ['Stage'], relatedCardTypes: ['Stage'] }),
    ruleTopic('onepiece', 'game-flow', 'turn-phases', 'Turn Phases', 'Turns progress through official phases such as Refresh, Draw, DON!!, Main, and End timing.', ['One Piece Card Game rules'], { officialTerms: ['Refresh Phase', 'Draw Phase', 'DON!! Phase', 'Main Phase', 'End Phase'], relatedTopics: ['don', 'attacking'] }),
    ruleTopic('onepiece', 'combat', 'attacking', 'Attacking', 'Attacking compares power, uses rested targets and Leader/Character rules, and opens counter/blocker interactions.', ['One Piece Card Game rules'], { officialTerms: ['Attack', 'Power'], relatedTopics: ['counter', 'blocking', 'don'] }),
    ruleTopic('onepiece', 'combat', 'counter', 'Counter', 'Counter values and event counters modify battles during the official counter step.', ['One Piece Card Game rules'], { officialTerms: ['Counter'], relatedTopics: ['attacking'] }),
    ruleTopic('onepiece', 'combat', 'blocking', 'Blocking', 'Blocker effects redirect attacks when timing and card text allow.', ['One Piece Card Game rules'], { officialTerms: ['Blocker'], relatedTopics: ['attacking'] }),
    ruleTopic('onepiece', 'deck-building', 'deck-construction', 'Deck Construction', 'Deck construction depends on Leader choice, deck size, copies, colors, and legality.', ['One Piece Card Game rules'], { officialTerms: ['Deck', 'Leader'], relatedTopics: ['leader', 'color-restriction', 'legality'] }),
    ruleTopic('onepiece', 'deck-building', 'color-restriction', 'Color Restriction', 'Deck color restrictions are derived from the Leader and official deck construction rules.', ['One Piece Card Game rules'], { officialTerms: ['Color'], relatedTopics: ['leader', 'deck-construction'] }),
    ruleTopic('onepiece', 'organized-play', 'legality', 'Legality', 'Restricted, banned, errata, FAQ, and tournament legality changes should be checked against official Bandai resources.', ['One Piece Card Game rules'], { officialTerms: ['Banned', 'Restricted', 'Errata'], relatedTopics: ['deck-construction'] })
  ],
  starwars: [
    ruleTopic('starwars', 'identity', 'leader', 'Leader', 'A leader anchors the deck and may deploy or use epic actions according to its text and official rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Leader', 'Epic Action', 'Deploy'], relatedTopics: ['base', 'deck-construction'], relatedCardTypes: ['Leader'] }),
    ruleTopic('starwars', 'identity', 'base', 'Base', 'A base establishes HP and deck identity context, including aspect requirements where applicable.', ['Star Wars Unlimited how to play'], { officialTerms: ['Base', 'HP', 'Aspect'], relatedTopics: ['leader', 'aspects'], relatedCardTypes: ['Base'] }),
    ruleTopic('starwars', 'resources', 'resources', 'Resources', 'Resources pay costs for units, events, upgrades, and abilities.', ['Star Wars Unlimited how to play'], { officialTerms: ['Resource', 'Cost'], relatedTopics: ['actions'] }),
    ruleTopic('starwars', 'arenas', 'ground-arena', 'Ground Arena', 'Ground units fight in the ground arena and interact with ground combat rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Ground Arena', 'Ground Unit'], relatedTopics: ['units', 'combat'] }),
    ruleTopic('starwars', 'arenas', 'space-arena', 'Space Arena', 'Space units fight in the space arena and interact with space combat rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Space Arena', 'Space Unit'], relatedTopics: ['units', 'combat'] }),
    ruleTopic('starwars', 'card-types', 'units', 'Units', 'Units enter an arena, attack, defend by target rules, and use power, HP, traits, and abilities.', ['Star Wars Unlimited how to play'], { officialTerms: ['Unit', 'Power', 'HP'], relatedTopics: ['ground-arena', 'space-arena', 'combat'], relatedCardTypes: ['Unit'] }),
    ruleTopic('starwars', 'card-types', 'events', 'Events', 'Events resolve one-shot effects according to their timing and text.', ['Star Wars Unlimited how to play'], { officialTerms: ['Event'], relatedCardTypes: ['Event'] }),
    ruleTopic('starwars', 'card-types', 'upgrades', 'Upgrades', 'Upgrades attach to eligible units and modify stats or abilities as printed.', ['Star Wars Unlimited how to play'], { officialTerms: ['Upgrade', 'Attach'], relatedCardTypes: ['Upgrade'] }),
    ruleTopic('starwars', 'actions', 'actions', 'Actions', 'Players alternate actions, including playing cards, attacking, using abilities, and passing.', ['Star Wars Unlimited how to play'], { officialTerms: ['Action', 'Pass'], relatedTopics: ['initiative', 'combat'] }),
    ruleTopic('starwars', 'game-flow', 'initiative', 'Initiative', 'Initiative affects action order and round flow as defined by official rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Initiative'], relatedTopics: ['actions'] }),
    ruleTopic('starwars', 'combat', 'combat', 'Combat', 'Combat uses arena targeting, attack resolution, damage, defeat, and abilities according to official rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Attack', 'Damage', 'Defeat'], relatedTopics: ['units', 'ground-arena', 'space-arena'] }),
    ruleTopic('starwars', 'deck-building', 'deck-construction', 'Deck Construction', 'Deck construction depends on leader, base, aspects, card limits, and format rules.', ['Star Wars Unlimited how to play'], { officialTerms: ['Deck', 'Leader', 'Base'], relatedTopics: ['leader', 'base', 'aspects', 'formats'] }),
    ruleTopic('starwars', 'deck-building', 'aspects', 'Aspects', 'Aspects drive deck-building requirements and resource penalties when playing cards outside identity.', ['Star Wars Unlimited how to play'], { officialTerms: ['Aspect', 'Aspect penalty'], relatedTopics: ['leader', 'base', 'deck-construction'] }),
    ruleTopic('starwars', 'organized-play', 'formats', 'Formats', 'Premier, Draft, Sealed, Twin Suns, Trilogy, and other formats are maintained by official resources.', ['Star Wars Unlimited how to play'], { officialTerms: ['Premier', 'Draft', 'Sealed', 'Twin Suns', 'Trilogy'], relatedTopics: ['deck-construction'] })
  ]
});
