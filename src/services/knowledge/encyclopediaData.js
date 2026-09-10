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
    ruleStatus: 'Foundational getting started, formats, and rules topics with official resources.',
    sourceRefs: [
      { label: 'Star Wars Unlimited how to play', url: 'https://starwarsunlimited.com/how-to-play', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Leaders', 'Bases', 'Aspects', 'Formats']
  }
]);

export const ENCYCLOPEDIA_RULE_TOPICS = Object.freeze({
  magic: [
    { slug: 'turn-structure', title: 'Turn Structure', summary: 'Phases and steps organize priority, actions, combat, and cleanup. Use this as a map to the official Comprehensive Rules when timing matters.', sourceLabels: ['Magic rules page'] },
    { slug: 'priority-and-stack', title: 'Priority and the Stack', summary: 'Spells and most abilities use the stack. Players receive priority before objects resolve, which is the core timing model for responses.', sourceLabels: ['Magic rules page'] },
    { slug: 'card-types-and-zones', title: 'Card Types and Zones', summary: 'Card types, supertypes, subtypes, and zones determine what an object is and where game rules can find it.', sourceLabels: ['Magic rules page'] },
    { slug: 'combat', title: 'Combat', summary: 'Combat moves through beginning of combat, declare attackers, declare blockers, combat damage, and end of combat timing.', sourceLabels: ['Magic rules page'] },
    { slug: 'commander', title: 'Commander Context', summary: 'Commander uses Magic rules plus format-specific deck construction, color identity, and commander-zone behavior.', sourceLabels: ['Magic rules page'] }
  ],
  pokemon: [
    { slug: 'standard-legality', title: 'Standard Legality', summary: 'Competitive Standard legality depends on rotation and regulation marks, with reprints and errata handled by official Pokemon resources.', sourceLabels: ['Play Pokemon rules and formats'] },
    { slug: 'formats', title: 'Formats', summary: 'Pokemon supports Standard, Expanded, Limited, and alternative formats; this page links out rather than guessing format legality.', sourceLabels: ['Play Pokemon rules and formats'] },
    { slug: 'tournament-rules', title: 'Tournament Rules', summary: 'Tournament procedure, penalties, and event requirements belong to official Play Pokemon documents.', sourceLabels: ['Play Pokemon rules and formats'] }
  ],
  yugioh: [
    { slug: 'duel-basics', title: 'Duel Basics', summary: 'Yu-Gi-Oh! duels use monsters, spells, traps, phases, and Life Points; official rulebook text remains the authority.', sourceLabels: ['Yu-Gi-Oh! rulebook and beginner guide'] },
    { slug: 'deck-construction', title: 'Deck Construction', summary: 'Deck construction and alternate tournament formats should be checked against current Konami resources before event play.', sourceLabels: ['Yu-Gi-Oh! rulebook and beginner guide'] },
    { slug: 'speed-duel', title: 'Speed Duel', summary: 'Speed Duel has its own guide and should not be treated as identical to Advanced Format.', sourceLabels: ['Yu-Gi-Oh! rulebook and beginner guide'] }
  ],
  lorcana: [
    { slug: 'quick-start', title: 'Quick Start Rules', summary: 'Quick start documents cover the beginner flow: setup, inking, turns, characters, abilities, and lore.', sourceLabels: ['Disney Lorcana resources'] },
    { slug: 'comprehensive-rules', title: 'Comprehensive Rules', summary: 'Comprehensive rules are the official reference for detailed card interactions and edge cases.', sourceLabels: ['Disney Lorcana resources'] },
    { slug: 'tournament-rules', title: 'Tournament Rules', summary: 'Organized play uses separate tournament rules and event documents.', sourceLabels: ['Disney Lorcana resources'] }
  ],
  flesh_and_blood: [
    { slug: 'game-concepts', title: 'Game Concepts', summary: 'FAB defines heroes, cards, objects, zones, and ownership/control through its comprehensive rules framework.', sourceLabels: ['Flesh and Blood rules and policy'] },
    { slug: 'turn-structure', title: 'Turn Structure', summary: 'Turns are organized into start, action, and end phases, with priority and game state checks defining when actions happen.', sourceLabels: ['Flesh and Blood rules and policy'] },
    { slug: 'combat-chain', title: 'Combat Chain', summary: 'Combat uses a chain-link structure with layer, attack, defend, reaction, damage, and resolution steps.', sourceLabels: ['Flesh and Blood rules and policy'] },
    { slug: 'policy', title: 'Tournament Policy', summary: 'Tournament rules and penalty procedure are separate official policy documents.', sourceLabels: ['Flesh and Blood rules and policy'] }
  ],
  onepiece: [
    { slug: 'play-guide', title: 'Play Guide', summary: 'The official play guide covers deck materials, setup, DON!!, turn flow, and victory conditions.', sourceLabels: ['One Piece Card Game rules'] },
    { slug: 'comprehensive-rules', title: 'Comprehensive Rules', summary: 'Comprehensive rules and official updates should be used for detailed interactions and current errata.', sourceLabels: ['One Piece Card Game rules'] },
    { slug: 'tournament-rules', title: 'Tournament Rules', summary: 'Tournament procedures and banned or restricted updates remain official-source-driven.', sourceLabels: ['One Piece Card Game rules'] }
  ],
  starwars: [
    { slug: 'getting-started', title: 'Getting Started', summary: 'Starter play centers on leaders, bases, resources, initiative, and a structured action sequence.', sourceLabels: ['Star Wars Unlimited how to play'] },
    { slug: 'premier', title: 'Premier Format', summary: 'Premier is the primary constructed path; use official rules for current deck construction and legality.', sourceLabels: ['Star Wars Unlimited how to play'] },
    { slug: 'limited-formats', title: 'Limited Formats', summary: 'Draft and sealed have separate official rules and deck construction expectations.', sourceLabels: ['Star Wars Unlimited how to play'] }
  ]
});
