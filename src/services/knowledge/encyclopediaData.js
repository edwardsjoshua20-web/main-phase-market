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
    catalogStatus: 'Browse Magic sets, cards, and rules.',
    cardSource: 'Magic card and set information follows Scryfall and official Wizards resources.',
    sourceLimitations: 'Set pages preserve release dates, set codes, collector numbers, and Oracle identity where available.',
    ruleStatus: 'Foundational rules topics with official Comprehensive Rules attribution.',
    sourceRefs: [
      { label: 'Magic How to Play', url: 'https://magic.wizards.com/en/how-to-play', freshness: 'Official page verified September 10, 2026' },
      { label: 'Magic rules page', url: 'https://magic.wizards.com/en/rules', freshness: 'Official page verified September 10, 2026' },
      { label: 'Magic formats hub', url: 'https://magic.wizards.com/en/formats', freshness: 'Official page verified September 10, 2026' },
      { label: 'Magic Commander format', url: 'https://magic.wizards.com/en/formats/commander', freshness: 'Official page verified September 10, 2026' },
      { label: 'Commander brackets beta update', url: 'https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026', freshness: 'Official page verified September 10, 2026' },
      { label: 'Scryfall card data', url: 'https://scryfall.com/docs/api/bulk-data', freshness: 'Primary Magic data reference' }
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
    catalogStatus: 'Browse Pokemon sets, cards, and play topics.',
    cardSource: 'Pokemon card and set information follows PokemonTCG.io-compatible data and official Play Pokemon resources.',
    sourceLimitations: 'Set pages preserve available set names, codes, release dates, and card numbering.',
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
    catalogStatus: 'Browse Yu-Gi-Oh! sets, cards, and duel rules.',
    cardSource: 'Yu-Gi-Oh! card and set information follows YGOPRODeck data and official Konami resources.',
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
    catalogStatus: 'Browse Disney Lorcana sets, cards, and rules.',
    cardSource: 'Disney Lorcana card and set information follows Lorcast data and official Ravensburger resources.',
    sourceLimitations: 'Set pages show the card fields available through the Lorcast model.',
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
    catalogStatus: 'Browse Flesh and Blood sets, cards, and game rules.',
    cardSource: 'Flesh and Blood card information follows the-fab-cube English card data and official FAB resources.',
    sourceLimitations: 'Printings, foiling, and legality reflect available card data; event policy should be checked against official FAB policy pages.',
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
    catalogStatus: 'Browse One Piece sets, cards, and play rules.',
    cardSource: 'One Piece card information follows punk-records English card data and official Bandai resources.',
    sourceLimitations: 'Set pages show represented cards from the available English card data.',
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
    catalogStatus: 'Browse Star Wars Unlimited sets, cards, and rules.',
    cardSource: 'Star Wars Unlimited card and set information follows SWU API data and official game resources.',
    sourceLimitations: 'Variants and rulings reflect the available SWU API export.',
    ruleStatus: 'Foundational getting started, formats, and rules topics with official resources.',
    sourceRefs: [
      { label: 'Star Wars Unlimited how to play', url: 'https://starwarsunlimited.com/how-to-play', freshness: 'Official page verified September 10, 2026' }
    ],
    focus: ['Sets', 'Leaders', 'Bases', 'Aspects', 'Formats']
  }
]);

const GAME_RULE_LABELS = Object.freeze({
  magic: 'Magic',
  pokemon: 'Pokemon TCG',
  yugioh: 'Yu-Gi-Oh!',
  lorcana: 'Disney Lorcana',
  flesh_and_blood: 'Flesh and Blood',
  onepiece: 'One Piece TCG',
  starwars: 'Star Wars Unlimited'
});

function topicTerms(terms = []) {
  const visible = terms.filter(Boolean).slice(0, 5);
  if (visible.length === 0) return 'the printed terms on the card or current official rules entry';
  return visible.join(', ');
}

function buildDefaultRuleArticle(gameId, title, summary, options = {}) {
  const gameName = GAME_RULE_LABELS[gameId] || 'this game';
  const terms = topicTerms(options.officialTerms || []);
  return {
    introduction: `${summary} This page explains how ${title.toLowerCase()} functions during an ordinary ${gameName} game and how to connect the topic to real card text without turning the quick reference into a judge call.`,
    sections: [
      {
        heading: 'What It Controls',
        body: [
          `${title} matters because it defines what players are allowed to do, what the game checks, or how a visible object changes the table state.`,
          `When reading a card or resolving a play, start with the official words connected to this topic: ${terms}. Those terms tell you which rule family to apply before you look for exceptions in card text.`
        ]
      },
      {
        heading: 'Table Sequence',
        body: [
          `Use the current game state first: identify the active player or turn point, confirm the relevant card type or zone, then apply costs, choices, targets, and effects in the order required by the rules.`,
          `If two effects appear to compete, keep them tied to the step, window, or action that created them. That habit prevents shortcut mistakes and helps players explain what is happening cleanly.`
        ],
        example: `Example: when a card refers to ${terms.split(', ')[0]}, check that condition before applying broader assumptions from memory or from another game.`
      },
      {
        heading: 'Deck And Event Context',
        body: [
          `Deck construction, legality, and event procedure can change how this topic is used in organized play, especially when a format document or rules update narrows the available card pool.`,
          `For tournaments, use this reference as a play aid and follow the linked publisher resource for the current official document, update, or floor-rules version.`
        ]
      }
    ]
  };
}

const MAGIC_SOURCE_METADATA = Object.freeze({
  rulesVersion: 'Magic Comprehensive Rules and public Wizards rules resources verified September 10, 2026',
  lastVerified: '2026-09-10',
  sources: [
    { label: 'Magic How to Play', url: 'https://magic.wizards.com/en/how-to-play', role: 'Beginner learning order and teaching concepts' },
    { label: 'Magic rules page', url: 'https://magic.wizards.com/en/rules', role: 'Basic Rules and Comprehensive Rules access point' },
    { label: 'Magic formats hub', url: 'https://magic.wizards.com/en/formats', role: 'Current official format list and format pages' },
    { label: 'Magic Commander format', url: 'https://magic.wizards.com/en/formats/commander', role: 'Commander deck construction and format overview' },
    { label: 'Commander brackets beta update', url: 'https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026', role: 'Commander Brackets and Game Changers context' }
  ]
});

function sentenceList(values = []) {
  const clean = values.filter(Boolean);
  if (clean.length <= 1) return clean.join('');
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`;
}

function buildMagicLearnArticle(title, options = {}) {
  const terms = options.officialTerms || [];
  return {
    introduction: options.introduction,
    terminology: terms,
    sections: [
      {
        heading: 'The Core Idea',
        body: options.core || []
      },
      {
        heading: 'How It Works At The Table',
        body: options.steps || [],
        example: options.example
      },
      {
        heading: 'Beginner Checks',
        body: [
          ...(options.mistakes || []),
          `Key terms for this lesson: ${sentenceList(terms)}. Learn those words here, then use the related rules reference when a card or table question needs the exact technical rule.`
        ]
      }
    ]
  };
}

function magicLearnLesson(order, topicId, title, summary, options = {}) {
  return ruleTopic('magic', 'learn', topicId, title, summary, ['Magic How to Play', 'Magic rules page'], {
    officialTerms: options.officialTerms || [],
    relatedTopics: options.relatedTopics || [],
    aliases: options.aliases || [],
    searchTerms: options.searchTerms || [],
    category: 'learn',
    learningTrack: 'learn',
    order,
    previousSlug: options.previousSlug || null,
    nextSlug: options.nextSlug || null,
    sourceMeta: MAGIC_SOURCE_METADATA,
    article: buildMagicLearnArticle(title, options)
  });
}

function buildMagicReferenceArticle(title, summary, options = {}) {
  const terms = topicTerms(options.officialTerms || []);
  return {
    introduction: options.introduction || `${summary} This reference page keeps the concept searchable for real table questions while staying short enough to use during a game.`,
    terminology: options.officialTerms || [],
    sections: [
      {
        heading: 'Definition',
        body: [
          options.definition || `${title} is the rules concept that covers ${terms}. Use it to identify what kind of object, timing window, cost, effect, or game event you are dealing with.`,
          options.scope || 'Start from the visible game object and the current step of the turn, then apply card text and format rules only after the basic rule category is clear.'
        ]
      },
      {
        heading: 'How To Apply It',
        body: options.application || [
          'Check whether a player has permission to take the action, whether any choices or targets are required, and whether the object uses the stack or happens as a special action.',
          'If multiple effects are waiting, keep them in their correct timing family: turn-based action, state-based action, triggered ability, replacement effect, static effect, or spell/ability on the stack.'
        ],
        example: options.example || `Example: when a card points at ${terms.split(', ')[0]}, identify that exact rule term before using a shortcut from another situation.`
      },
      {
        heading: 'Related Rules Questions',
        body: options.questions || [
          'Ask whether this concept changes what can be done, when it can be done, what it costs, what it targets, or how it resolves.',
          'For tournament or judge-level detail, use the linked Wizards rules document and the source metadata stored with this topic.'
        ]
      }
    ]
  };
}

function magicReferenceTopic(group, order, topicId, title, summary, options = {}) {
  return ruleTopic('magic', group, topicId, title, summary, options.sourceLabels || ['Magic rules page'], {
    officialTerms: options.officialTerms || [],
    relatedTopics: options.relatedTopics || [],
    relatedMechanics: options.relatedMechanics || [],
    relatedCardTypes: options.relatedCardTypes || [],
    aliases: options.aliases || [],
    searchTerms: options.searchTerms || [],
    category: 'reference',
    referenceGroup: group,
    order,
    sourceMeta: MAGIC_SOURCE_METADATA,
    article: buildMagicReferenceArticle(title, summary, options)
  });
}

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
    category: options.category || 'reference',
    learningTrack: options.learningTrack || null,
    referenceGroup: options.referenceGroup || null,
    order: options.order || 0,
    previousSlug: options.previousSlug || null,
    nextSlug: options.nextSlug || null,
    aliases: options.aliases || [],
    searchTerms: options.searchTerms || [],
    sourceMeta: options.sourceMeta || null,
    relatedTopics: options.relatedTopics || [],
    relatedMechanics: options.relatedMechanics || [],
    relatedCardTypes: options.relatedCardTypes || [],
    article: options.article || buildDefaultRuleArticle(gameId, title, summary, options)
  };
}

export const MAGIC_KEYWORD_GLOSSARY = Object.freeze([
  { name: 'Flying', category: 'Evasion', concise: 'A creature with flying can be blocked only by creatures with flying or reach.', relatedMechanics: ['Reach'], exampleCardIds: ['scryfall:serra-angel'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'First strike', category: 'Combat damage', concise: 'First strike creates an earlier combat damage step for creatures that have first strike or double strike.', relatedMechanics: ['Double strike', 'Combat damage'], exampleCardIds: ['scryfall:brave-the-sands'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Double strike', category: 'Combat damage', concise: 'Double strike lets a creature assign damage in both the first-strike combat damage step and the regular combat damage step.', relatedMechanics: ['First strike'], exampleCardIds: ['scryfall:boros-swiftblade'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Trample', category: 'Combat damage', concise: 'After assigning lethal damage to blockers, a creature with trample can assign excess combat damage to the defending player, planeswalker, or battle.', relatedMechanics: ['Combat damage', 'Lethal damage'], exampleCardIds: ['scryfall:colossal-dreadmaw'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Haste', category: 'Timing permission', concise: 'Haste lets a creature ignore the usual restriction on attacking or using tap abilities the turn it comes under your control.', relatedMechanics: ['Summoning sickness'], exampleCardIds: ['scryfall:lightning-elemental'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Vigilance', category: 'Combat', concise: 'A creature with vigilance does not tap when it is declared as an attacker.', relatedMechanics: ['Declare attackers'], exampleCardIds: ['scryfall:serra-angel'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Lifelink', category: 'Damage result', concise: 'Damage dealt by a source with lifelink also causes its controller to gain that much life.', relatedMechanics: ['Damage'], exampleCardIds: ['scryfall:vampire-nighthawk'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Deathtouch', category: 'Damage result', concise: 'Any amount of damage from a source with deathtouch is lethal damage to a creature.', relatedMechanics: ['Lethal damage'], exampleCardIds: ['scryfall:typhoid-rats'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Ward', category: 'Targeting tax', concise: 'Ward creates a triggered ability that counters a spell or ability targeting the permanent unless its controller pays the listed cost.', relatedMechanics: ['Targets', 'Triggered abilities'], exampleCardIds: ['scryfall:graveyard-trespasser'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA },
  { name: 'Equip', category: 'Activated ability', concise: 'Equip is an activated ability that attaches an Equipment to a creature you control at sorcery speed unless another effect says otherwise.', relatedMechanics: ['Activated abilities', 'Artifacts'], exampleCardIds: ['scryfall:short-sword'], sourceLabels: ['Magic rules page'], sourceMeta: MAGIC_SOURCE_METADATA }
]);

export const ENCYCLOPEDIA_RULE_TOPICS = Object.freeze({
  magic: [
    magicLearnLesson(1, 'learn-what-is-magic', 'What Is Magic?', 'Magic is a two-player or multiplayer trading card game where players use decks of lands, creatures, and spells to reduce opponents to a losing condition.', {
      previousSlug: null,
      nextSlug: 'learn-what-you-need',
      officialTerms: ['Player', 'Deck', 'Spell', 'Permanent', 'Life total'],
      introduction: 'Magic is a game about building a deck, managing resources, and choosing when to commit cards to the battlefield. This lesson gives a new player the mental model before any detailed rules.',
      core: ['Each player brings a deck and starts with a library, hand, battlefield, graveyard, and life total. Most beginner games are won by attacking with creatures until an opponent reaches 0 or less life.', 'The table is shared, but each player controls their own cards and makes choices when the rules or a spell asks them to. The game alternates turns so players can develop mana, cast spells, attack, block, and respond.'],
      steps: ['Think of a turn as a chance to draw a card, play one land if you have not already played one this turn, cast spells you can pay for, attack with creatures that are allowed to attack, and pass to the next player.', 'A basic game uses many shortcuts, but the important skill is knowing what kind of card you are using and whether the current part of the turn lets you use it.'],
      example: 'Example: a new player can win a normal game by playing lands, casting creatures, attacking with them over several turns, and using removal spells to clear blockers.',
      mistakes: ['Do not treat every card as something that stays in play. Instants and sorceries usually do their effect and go to the graveyard, while permanents such as creatures and artifacts stay on the battlefield after resolving.', 'Do not assume Magic is only about attacking. Many games are decided by timing, card advantage, resource management, and knowing when not to spend a spell.'],
      relatedTopics: ['learn-taking-your-turn', 'learn-winning-and-losing', 'reference-permanents']
    }),
    magicLearnLesson(2, 'learn-what-you-need', 'What You Need to Play', 'A beginner game needs decks, a way to track life, enough table space for zones, and a shared understanding of the format being played.', {
      previousSlug: 'learn-what-is-magic',
      nextSlug: 'learn-understanding-a-card',
      officialTerms: ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Life total'],
      introduction: 'Magic is easiest to learn when the table is physically organized. This lesson explains the minimum materials and setup language a new player should know before shuffling.',
      core: ['Each player needs a deck appropriate for the format. For ordinary casual Constructed learning games, decks are commonly at least 60 cards; Commander is different and uses a commander plus a 99-card deck.', 'Use dice, an app, paper, or another clear tracker for life totals. Also leave room for lands, creatures, artifacts, enchantments, planeswalkers, and cards that go to the graveyard.'],
      steps: ['Put your library face down where you can draw from it. Keep your hand private, place permanents on the battlefield, put used instants and sorceries in the graveyard, and keep exiled cards visibly separate if exile appears.', 'Agree on the format before the game starts. Format choice affects deck size, card legality, sideboards, multiplayer expectations, and whether Commander-specific rules apply.'],
      example: 'Example: two starter decks, two life counters set to 20, and a clear battlefield/graveyard layout are enough for a clean first game.',
      mistakes: ['Do not mix graveyard and exile. They are different public zones and many cards care which one a card is in.', 'Do not start a Commander game using ordinary 60-card deck assumptions; Commander has its own construction and multiplayer expectations.'],
      relatedTopics: ['learn-setting-up', 'reference-zones', 'reference-formats']
    }),
    magicLearnLesson(3, 'learn-understanding-a-card', 'Understanding a Magic Card', 'A Magic card communicates its name, cost, color, type line, rules text, combat stats, and collector information through consistent card parts.', {
      previousSlug: 'learn-what-you-need',
      nextSlug: 'learn-card-types',
      officialTerms: ['Mana cost', 'Type line', 'Rules text', 'Power', 'Toughness', 'Loyalty'],
      introduction: 'Reading the card correctly is the foundation of playing correctly. The Main Phase catalog can show real printings, but this lesson explains the rules meaning of the information printed on a card.',
      core: ['The name identifies the card. The mana cost in the upper corner tells you what mana is needed to cast it and usually determines color. The art helps identify the card but normally has no rules meaning.', 'The type line tells you whether the card is a creature, instant, sorcery, artifact, enchantment, planeswalker, land, battle, or a combination. Subtypes such as Goblin, Aura, Equipment, Forest, or Siege matter when card text asks for them.'],
      steps: ['Read the text box after the type line. Rules text tells you abilities and effects; reminder text explains a keyword in parentheses; flavor text is story text and is not used to determine gameplay.', 'Creatures use power and toughness for combat. Planeswalkers use loyalty. Collector number, rarity, artist, and set code identify the printing, which is useful for cataloging but usually not for game actions.'],
      example: 'Example: Llanowar Elves is a creature with a mana ability. Its type line makes it a permanent spell while on the stack, then a creature permanent after it resolves.',
      mistakes: ['Do not use flavor text as rules text. Only rules text, type line, and official rules define what a card does.', 'Do not confuse mana cost with color identity. Color identity matters mostly in Commander and includes more than just the mana cost.'],
      relatedTopics: ['learn-card-types', 'reference-cards', 'reference-color-identity']
    }),
    magicLearnLesson(4, 'learn-card-types', 'Card Types', 'Magic card types determine timing, whether a spell becomes a permanent, and where a card goes after it resolves.', {
      previousSlug: 'learn-understanding-a-card',
      nextSlug: 'learn-mana-and-colors',
      officialTerms: ['Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'],
      introduction: 'A new player does not need every subtype on day one, but they do need to know the major card types. Card type tells you when you can use a card and what happens after it resolves.',
      core: ['Lands are played as a special action and usually make mana. Creatures are permanents that can attack and block. Artifacts and enchantments are permanents that often provide ongoing effects. Planeswalkers are permanents with loyalty abilities. Battles are permanents that can be attacked under their own rules.', 'Instants can usually be cast whenever you have priority. Sorceries usually require your main phase, an empty stack, and priority. After resolving, instants and sorceries go to the graveyard instead of staying on the battlefield.'],
      steps: ['When you pick up a card, check whether it is a land, permanent spell, instant, or sorcery. That single check answers many beginner timing questions.', 'If it is a permanent spell, it goes on the stack while being cast and enters the battlefield only if it resolves. If it is an instant or sorcery, it performs its instructions and then goes to the graveyard.'],
      example: 'Example: Lightning Bolt is an instant, so it can be cast in response to a creature spell. Grizzly Bears is a creature, so it normally waits for your main phase and stays on the battlefield after resolving.',
      mistakes: ['Do not cast lands. Playing a land is not casting a spell and does not use the stack.', 'Do not put creatures directly onto the battlefield when you announce them. They are spells first, then permanents after they resolve.'],
      relatedTopics: ['reference-card-types', 'reference-permanents', 'reference-spells']
    }),
    magicLearnLesson(5, 'learn-mana-and-colors', 'Mana and the Five Colors', 'Mana pays for spells and abilities, and Magic uses white, blue, black, red, green, generic, and true colorless costs in distinct ways.', {
      previousSlug: 'learn-card-types',
      nextSlug: 'learn-setting-up',
      officialTerms: ['Mana', 'Generic mana', 'Colorless mana', 'Mana pool', 'Tap'],
      introduction: 'Mana is the resource system that lets games build over time. Learning the difference between colored, generic, and colorless mana prevents many early mistakes.',
      core: ['Colored mana is white, blue, black, red, or green. Generic mana is shown as a number and can be paid with mana of any type. True colorless mana is represented by the colorless symbol and must be paid with colorless mana.', 'Most lands tap to add mana. That mana goes into your mana pool temporarily, and you spend it to pay costs. Unspent mana empties as steps and phases end.'],
      steps: ['To cast a spell, announce it, choose required modes and targets, determine the total cost, activate mana abilities if needed, then pay the cost. In a basic game, this often looks like tapping lands and placing the spell on the stack.', 'Playing a land is different from casting a spell. Under normal rules you may play one land on each of your turns during a main phase when the stack is empty.'],
      example: 'Example: a spell that costs {2}{G} needs one green mana plus two additional mana of any type. A spell that costs {C} specifically needs colorless mana.',
      mistakes: ['Do not treat the number in a mana cost as colorless mana. The number is generic and can be paid with any mana.', 'Do not save mana across phases unless a card specifically lets you. The mana pool empties as the turn moves on.'],
      relatedTopics: ['reference-costs', 'reference-timing-permissions', 'learn-casting-spells']
    }),
    magicLearnLesson(6, 'learn-setting-up', 'Setting Up a Game', 'A normal two-player Magic game starts with shuffled decks, opening seven-card hands, mulligans, 20 life, and a chosen starting player.', {
      previousSlug: 'learn-mana-and-colors',
      nextSlug: 'learn-zones',
      officialTerms: ['Shuffle', 'Opening hand', 'Mulligan', 'Starting player', 'Draw step'],
      introduction: 'Setup is where players agree on the format and create the starting game state. This lesson covers ordinary Magic and calls out where Commander differs.',
      core: ['For a normal two-player Constructed learning game, each player shuffles, presents their deck, draws seven cards, takes mulligans if needed, and starts at 20 life. Players determine who goes first before turns begin.', 'In a normal two-player game, the starting player skips the draw step of their first turn. Commander is not the same: it is normally multiplayer, starts at 40 life, uses commanders, and has different deck construction.'],
      steps: ['Place libraries face down, keep hands hidden, leave the battlefield empty unless a card or format says otherwise, and keep graveyard/exile areas clear for later.', 'After mulligans are finished and any beginning-of-game effects are handled, the first player begins their first turn.'],
      example: 'Example: Alice wins the die roll and chooses to play first. Both players keep seven-card hands; Alice takes her first turn and skips drawing for that first turn.',
      mistakes: ['Do not draw on the first turn if you are the starting player in an ordinary two-player game.', 'Do not apply Commander starting life or commander-zone rules to a normal starter-deck game.'],
      relatedTopics: ['reference-zones', 'reference-formats', 'reference-commander']
    }),
    magicLearnLesson(7, 'learn-zones', 'Zones', 'Zones are the named places cards and objects can exist, including library, hand, battlefield, graveyard, exile, stack, and command zone.', {
      previousSlug: 'learn-setting-up',
      nextSlug: 'learn-starting-hand-and-mulligans',
      officialTerms: ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Exile', 'Stack', 'Command zone'],
      introduction: 'Zones are how Magic keeps the game organized. Knowing zones helps players understand where a spell goes while being cast, what counts as in play, and where cards move after resolving or being destroyed.',
      core: ['Your library is your face-down deck. Your hand is private. The battlefield holds permanents. The graveyard holds used, destroyed, discarded, or milled cards. Exile is separate from the graveyard and often harder to access.', 'The stack is a temporary zone where spells and most abilities wait to resolve. The command zone is used by special rules such as Commander and some nontraditional game objects.'],
      steps: ['Whenever a card changes zones, move it clearly and keep public zones visible. This matters for effects that count cards in graveyards, care about cards in exile, or target permanents on the battlefield.', 'A spell card normally moves from hand to stack when cast. If it is a permanent spell and resolves, it enters the battlefield. If it is an instant or sorcery and resolves, it goes to the graveyard.'],
      example: 'Example: Cancel targets a spell on the stack. Doom Blade targets a creature on the battlefield. Raise Dead looks for a creature card in a graveyard.',
      mistakes: ['Do not call the battlefield your field if that makes zones unclear; rules questions often depend on exact zone names.', 'Do not put exiled cards into the graveyard unless an effect specifically says to move them there.'],
      relatedTopics: ['reference-zones', 'reference-stack', 'reference-command-zone']
    }),
    magicLearnLesson(8, 'learn-starting-hand-and-mulligans', 'Starting Hand and Mulligans', 'Players draw an opening hand of seven cards and may mulligan to improve unplayable hands, keeping fewer cards under current mulligan procedure.', {
      previousSlug: 'learn-zones',
      nextSlug: 'learn-taking-your-turn',
      officialTerms: ['Opening hand', 'Mulligan', 'Library', 'Hand'],
      introduction: 'Mulligans exist so players can find a functional start, not a perfect hand every time. This lesson teaches what a new player should look for.',
      core: ['A keepable beginner hand usually has lands, spells to cast with those lands, and a reasonable plan for the first few turns. A hand with no lands or only expensive spells is often a mulligan.', 'Current mulligan procedure lets players redraw and then put cards on the bottom of their library based on how many times they mulliganed. Casual groups should agree if they are using a gentler teaching mulligan.'],
      steps: ['Draw seven, decide whether to keep, and if you mulligan, shuffle and draw again according to the current mulligan rule being used. Once players keep, the game proceeds to the first turn.', 'Judge your hand by mana and action. A two-color deck usually needs the right colors, while a simple mono-color starter deck mostly needs enough lands and early spells.'],
      example: 'Example: a hand with three lands, a two-mana creature, a three-mana creature, and two interactive spells is usually better for learning than a one-land hand full of six-mana cards.',
      mistakes: ['Do not keep every seven-card hand just because seven is more than six. A smaller functional hand often plays better than a full hand that cannot cast spells.', 'Do not mulligan only for your best card; learn to keep hands that let you participate in the game.'],
      relatedTopics: ['learn-setting-up', 'learn-mana-and-colors', 'reference-deck-construction']
    }),
    magicLearnLesson(9, 'learn-taking-your-turn', 'Taking Your Turn', 'A Magic turn uses beginning, first main, combat, second main, and ending phases, with specific steps and priority windows inside them.', {
      previousSlug: 'learn-starting-hand-and-mulligans',
      nextSlug: 'learn-casting-spells',
      officialTerms: ['Untap step', 'Upkeep step', 'Draw step', 'Main phase', 'Combat phase', 'End step', 'Cleanup step', 'Priority'],
      introduction: 'The turn is the backbone of Magic. Wizards teaches five major phases; Main Phase expands them here so a beginner knows what happens automatically and when players can act.',
      core: ['The beginning phase has untap, upkeep, and draw. In untap, tapped permanents untap and players normally do not get priority. In upkeep, triggered abilities can happen and players can respond. In draw, the active player draws a card and then players can act.', 'The first main phase is where you normally play a land and cast creatures, artifacts, enchantments, planeswalkers, battles, and sorceries while the stack is empty. Instants and many activated abilities can be used in more places because they follow priority rather than sorcery timing.'],
      steps: ['Combat has beginning of combat, declare attackers, declare blockers, combat damage, and end of combat. Players get chances to cast instants or activate abilities between many combat steps, after turn-based actions such as declaring attackers or blockers are complete.', 'After combat, the second main phase works like the first main phase. If you already played your normal land for the turn, you do not get another one. The ending phase has the end step for end-of-turn triggers and responses, then cleanup, where damage marked on creatures is removed and the active player discards down to maximum hand size if needed.'],
      example: 'Example: you can cast a creature during your first main phase, attack with older creatures in combat, then cast another sorcery in your second main phase. Your opponent can cast an instant before blockers or after combat damage if they have priority.',
      mistakes: ['Do not play a land during combat or your opponent turn unless a card explicitly permits it.', 'Do not skip priority windows when they matter. Players often shortcut quiet turns, but responses still belong in the correct phase or step.'],
      relatedTopics: ['reference-turn-structure', 'reference-priority', 'learn-combat']
    }),
    magicLearnLesson(10, 'learn-casting-spells', 'Playing Lands and Casting Spells', 'Playing a land is a special action; casting a spell means announcing it, making choices, paying costs, and putting it on the stack.', {
      previousSlug: 'learn-taking-your-turn',
      nextSlug: 'learn-combat',
      officialTerms: ['Cast', 'Spell', 'Land play', 'Mana ability', 'Resolve'],
      introduction: 'This lesson separates the two most common actions in Magic: playing a land and casting a spell. Mixing them up creates many beginner rules errors.',
      core: ['A land play does not use the stack and does not require paying mana. Under normal rules, you get one land play on your own turn during a main phase when you have priority and the stack is empty.', 'Casting a spell uses the stack. You announce the spell, choose required modes and targets, determine and pay costs, then players can respond before it resolves.'],
      steps: ['Permanent spells become permanents only after they resolve. Instants and sorceries resolve, do what they say in order as much as possible, then go to the graveyard.', 'If everyone passes priority without adding anything else, the top object on the stack resolves. Then players get priority again before the next object resolves.'],
      example: 'Example: you cast Giant Growth targeting your creature. Your opponent may respond with an instant before Giant Growth resolves. If nobody responds, Giant Growth resolves and modifies the creature.',
      mistakes: ['Do not pay mana after seeing whether an opponent will respond. Costs are paid as part of casting the spell.', 'Do not put a creature onto the battlefield before opponents have the chance to respond to the creature spell.'],
      relatedTopics: ['reference-spells', 'reference-costs', 'reference-stack']
    }),
    magicLearnLesson(11, 'learn-combat', 'Combat', 'Combat lets creatures attack players, planeswalkers, and battles, then blockers and combat damage determine what survives.', {
      previousSlug: 'learn-casting-spells',
      nextSlug: 'learn-stack-and-responses',
      officialTerms: ['Summoning sickness', 'Declare attackers', 'Declare blockers', 'Combat damage', 'Lethal damage', 'State-based actions'],
      introduction: 'Combat is where many beginner games are won, but it is also a structured phase with several decision points. This lesson teaches the order and the common traps.',
      core: ['A creature usually cannot attack or use abilities with the tap or untap symbol unless its controller has controlled it continuously since the start of their most recent turn. Players often call this summoning sickness.', 'During declare attackers, the attacking player chooses which eligible creatures attack and what each one attacks, then taps attackers unless vigilance or another effect says otherwise. The defending player later chooses blockers with untapped creatures they control.'],
      steps: ['A blocked creature stays blocked even if all blockers leave combat before damage. During combat damage, creatures assign damage. Unblocked attackers damage what they attacked; blocked creatures and blockers deal damage to each other unless an effect changes that.', 'Damage greater than or equal to toughness is lethal. Creatures with lethal damage are put into their owners graveyards as state-based actions. At cleanup, damage marked on surviving creatures is removed.'],
      example: 'Example: a 3/3 attacks and is blocked by a 2/2. They deal combat damage at the same time, the 2/2 has lethal damage and dies, and the 3/3 survives with 2 damage marked until cleanup.',
      mistakes: ['Do not attack with a creature you just cast unless it has haste or another effect allows it.', 'Do not wait until after blockers to tap an attacking creature as the cost of an ability unless the creature is still untapped; attackers normally tapped when declared.'],
      relatedTopics: ['reference-combat-steps', 'reference-attacking', 'reference-blocking', 'reference-first-strike-double-strike']
    }),
    magicLearnLesson(12, 'learn-stack-and-responses', 'Instants, Responses, and the Stack', 'The stack is the waiting area for spells and most abilities; responses go on top and the top object resolves first.', {
      previousSlug: 'learn-combat',
      nextSlug: 'learn-abilities-and-triggers',
      officialTerms: ['Stack', 'Priority', 'Instant', 'Activated ability', 'Triggered ability', 'Resolve'],
      introduction: 'The stack is the first deep Magic concept most players meet because it explains why responses can change an apparently simple spell. This lesson teaches the beginner version before the full priority reference.',
      core: ['When a player casts a spell, it usually goes on the stack instead of resolving immediately. Other players get a chance to respond with instants or abilities they are allowed to use.', 'Each response is placed on top of what was already waiting. The top object resolves first, so the most recent response can change what happens to the original spell.'],
      steps: ['After a spell or ability resolves, players get priority again. The next object on the stack resolves only when all players pass priority in a row without adding anything new.', 'Some actions do not use the stack, including playing a land, turning a face-down creature face up in the appropriate way, and many mana abilities. A land play does not use the stack, which is one of the clearest beginner examples.'],
      example: 'Example: you cast Lightning Bolt targeting a 3/3 creature. Your opponent responds with Giant Growth. Giant Growth resolves first, making the creature bigger, then Lightning Bolt may no longer be enough damage to destroy it.',
      mistakes: ['Do not resolve the original spell before asking whether opponents respond.', 'Do not put lands on the stack. A land play is not a spell.'],
      relatedTopics: ['reference-stack', 'reference-priority', 'reference-triggered-abilities']
    }),
    magicLearnLesson(13, 'learn-abilities-and-triggers', 'Abilities and Triggers', 'Magic abilities are static, activated, triggered, or mana abilities, and each type behaves differently at the table.', {
      previousSlug: 'learn-stack-and-responses',
      nextSlug: 'learn-winning-and-losing',
      officialTerms: ['Static ability', 'Activated ability', 'Triggered ability', 'Mana ability', 'Cost', 'Target'],
      introduction: 'Card text often creates abilities instead of one-shot spell instructions. Learning the four big ability families helps players answer what uses the stack and what simply applies.',
      core: ['Static abilities are continuously true while the object is in the right zone. Activated abilities are written with a cost followed by a colon and can be activated when timing permits. Triggered abilities begin with words such as when, whenever, or at.', 'Mana abilities make mana and usually do not use the stack. Targets are chosen when a spell or ability is put on the stack, not when it resolves.'],
      steps: ['For activated abilities, identify the cost before the colon and pay it to activate the ability. For triggered abilities, wait for the triggering event, then put the trigger on the stack at the next appropriate time.', 'If an ability says target, choose legal targets when it is put on the stack. If all targets are illegal when it tries to resolve, it does not resolve.'],
      example: 'Example: Prodigal Pyromancer has an activated ability because it uses a colon. Soul Warden has a triggered ability because it starts with whenever.',
      mistakes: ['Do not treat all abilities as optional. If a triggered ability is mandatory, it triggers even when its controller would rather ignore it.', 'Do not pay an activated ability cost twice unless you are activating it twice and can legally do so.'],
      relatedTopics: ['reference-abilities', 'reference-triggered-abilities', 'reference-targets']
    }),
    magicLearnLesson(14, 'learn-winning-and-losing', 'Winning and Losing', 'Common Magic losses happen at 0 or less life, drawing from an empty library, having enough poison counters, card-specific effects, or concession.', {
      previousSlug: 'learn-abilities-and-triggers',
      nextSlug: 'learn-building-first-deck',
      officialTerms: ['Lose the game', 'Win the game', 'Poison counter', 'Concede', 'Empty library'],
      introduction: 'Most first games end through combat damage, but Magic has several loss conditions. Knowing the common ones helps players understand why life, libraries, and poison counters matter.',
      core: ['A player with 0 or less life loses as a state-based action. A player who tries to draw from an empty library loses. A player with ten or more poison counters loses in ordinary two-player Magic.', 'Some cards say a player wins or loses the game. A player may also concede at any time. Multiplayer games have additional consequences when one player leaves.'],
      steps: ['Track life clearly and update it whenever damage causes life loss or an effect changes life totals. Track poison counters separately from damage and life.', 'If an effect instructs a player to draw more cards than remain in their library, finish the draw instruction as much as possible; the loss happens when the rules check afterward.'],
      example: 'Example: if you draw the last card of your library, you have not lost yet. If you are instructed to draw again from an empty library, you lose the next time state-based actions are checked.',
      mistakes: ['Do not confuse damage with loss of life; both can reduce a life total, but prevention, lifelink, and trigger text may care about the difference.', 'Do not remove poison counters when life changes. They are separate resources.'],
      relatedTopics: ['reference-state-based-actions', 'reference-multiplayer']
    }),
    magicLearnLesson(15, 'learn-building-first-deck', 'Building Your First Deck', 'A first Constructed deck should follow format size, copy limits, basic-land exceptions, color choices, and a playable mana curve.', {
      previousSlug: 'learn-winning-and-losing',
      nextSlug: 'learn-where-to-go-next',
      officialTerms: ['Constructed deck', 'Sideboard', 'Four-card limit', 'Basic land', 'Format'],
      introduction: 'Deck building is where Magic becomes expressive because your card choices decide how your games will feel before shuffling begins. This lesson gives a beginner a practical Constructed baseline without turning the article into Commander-only advice.',
      core: ['Most ordinary Constructed formats use a minimum 60-card main deck and allow a sideboard up to 15 cards. With exceptions such as basic lands and cards that say otherwise, a combined main deck and sideboard normally cannot contain more than four copies of a card by English card title.', 'Choose colors your mana base can support. A simple first deck is often one or two colors with enough lands, early plays, removal or interaction, and a plan for winning.'],
      steps: ['Pick a format first, because format determines legal sets, banned lists, deck size, sideboard use, and copy limits. Then choose a strategy and add lands that can cast your spells on time.', 'Build with a curve: enough early cards to avoid falling behind, enough midgame cards to apply pressure, and a small number of expensive cards if the deck can support them.'],
      example: 'Example: a beginner 60-card creature deck might start around 24 lands, a clear two-color mana base, efficient creatures, and a few instant-speed answers, then tune from actual games.',
      mistakes: ['Do not use Commander singleton rules for every Magic deck. Singleton is a Commander feature, not a universal Constructed rule.', 'Do not add too many colors before your lands can reliably produce them. Mana problems make it hard to learn the rest of the game.'],
      relatedTopics: ['reference-deck-construction', 'reference-formats', 'reference-commander']
    }),
    magicLearnLesson(16, 'learn-where-to-go-next', 'Where to Go Next', 'After the first game, players can deepen their rules knowledge through formats, keywords, stack timing, Commander, and set browsing.', {
      previousSlug: 'learn-building-first-deck',
      nextSlug: null,
      officialTerms: ['Format', 'Keyword ability', 'Rules reference', 'Commander'],
      introduction: 'The best next step after learning the basics is to play real games, then use the Rules Reference for questions that come up naturally.',
      core: ['If you enjoy one-on-one games, look at Standard, Pioneer, Modern, or Limited. If you enjoy social multiplayer, learn Commander separately because it changes deck construction and table expectations.', 'Use the keyword glossary and reference pages when a card uses a word you do not know, when two effects happen at the same time, or when timing matters.'],
      steps: ['Browse a set to see real cards, pick a format, play a few games, and write down moments where the table hesitated. Those moments point to the next reference topics to learn.', 'For deeper play, study stack/priority, state-based actions, triggered abilities, replacement effects, layers, and Commander color identity.'],
      example: 'Example: if your first question is whether you can respond to a spell, go to Stack and Priority. If your question is what cards your commander deck can include, go to Commander and Color Identity.',
      mistakes: ['Do not try to memorize the Comprehensive Rules front to back. Use it as a reference when a specific question appears.', 'Do not assume a rule from another trading card game applies to Magic. Similar words often have different timing and zone rules.'],
      relatedTopics: ['reference-stack', 'reference-priority', 'reference-commander', 'reference-keywords']
    }),
    magicReferenceTopic('core', 1, 'reference-game-objects', 'Game Objects', 'Objects include cards, spells, permanents, tokens, copies, abilities on the stack, and other rule-managed items.', { officialTerms: ['Object', 'Card', 'Spell', 'Permanent', 'Ability'], relatedTopics: ['reference-cards', 'reference-permanents', 'reference-spells'] }),
    magicReferenceTopic('core', 2, 'reference-zones', 'Zones', 'Zones define where cards and objects exist and which rules can interact with them.', { officialTerms: ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Exile', 'Stack', 'Command zone'], relatedTopics: ['learn-zones', 'reference-stack', 'reference-command-zone'] }),
    magicReferenceTopic('core', 3, 'reference-cards', 'Cards', 'Cards have names, mana costs, color, type lines, rules text, and printing information that determine identity and gameplay.', { officialTerms: ['Name', 'Mana cost', 'Color', 'Type line', 'Rules text'], relatedTopics: ['learn-understanding-a-card', 'reference-card-types'] }),
    magicReferenceTopic('core', 4, 'reference-permanents', 'Permanents', 'Permanents are cards or tokens on the battlefield, usually created by resolving permanent spells or effects.', { officialTerms: ['Permanent', 'Battlefield', 'Permanent spell'], relatedTopics: ['reference-spells', 'reference-card-types'] }),
    magicReferenceTopic('core', 5, 'reference-spells', 'Spells', 'A spell is a card or copy on the stack after it has been cast and before it resolves, is countered, or otherwise leaves the stack.', { officialTerms: ['Spell', 'Cast', 'Resolve', 'Counter'], relatedTopics: ['learn-casting-spells', 'reference-stack'] }),
    magicReferenceTopic('core', 6, 'reference-abilities', 'Abilities', 'Abilities are rules text that can be static, activated, triggered, or mana abilities.', { officialTerms: ['Static ability', 'Activated ability', 'Triggered ability', 'Mana ability'], relatedTopics: ['learn-abilities-and-triggers', 'reference-triggered-abilities'] }),
    magicReferenceTopic('core', 7, 'reference-costs', 'Costs', 'Costs are what a player must pay to cast spells, activate abilities, or satisfy effects.', { officialTerms: ['Mana cost', 'Additional cost', 'Alternative cost', 'Cost reduction'], relatedTopics: ['learn-mana-and-colors', 'reference-spells'] }),
    magicReferenceTopic('core', 8, 'reference-targets', 'Targets', 'Targets are chosen when a spell or ability is put on the stack and must remain legal for that object to resolve against them.', { officialTerms: ['Target', 'Legal target', 'Hexproof', 'Ward'], relatedTopics: ['reference-stack', 'reference-abilities'] }),
    magicReferenceTopic('timing', 1, 'reference-priority', 'Priority', 'Priority is the permission system that tells which player may cast spells, activate abilities, or take certain special actions.', { officialTerms: ['Priority', 'Active player', 'Nonactive player', 'Pass priority'], relatedTopics: ['reference-stack', 'reference-apnap-ordering'], definition: 'Priority is given first to the active player at many points after turn-based actions and state-based actions are handled. The active player/nonactive player order matters when multiple players may act.', application: ['A player with priority may cast an instant, activate an ability, take an allowed special action, or pass. Sorcery-speed plays also require that it is the player own main phase and the stack is empty.', 'A stack object resolves only after every player passes priority in succession. After it resolves, priority starts again before the next object resolves.'], example: 'Example: after you cast a creature, you get priority again first, but the creature does not resolve until all players pass priority without adding another response.' }),
    magicReferenceTopic('timing', 2, 'reference-stack', 'Stack', 'The stack orders spells and most abilities so the newest object resolves first after all players pass priority.', { officialTerms: ['Stack', 'Spell', 'Activated ability', 'Triggered ability', 'Resolve'], relatedTopics: ['learn-stack-and-responses', 'reference-priority'], definition: 'The stack is a zone used by spells and most nonmana abilities. Objects on the stack resolve one at a time from top to bottom.', application: ['When a player responds, the response goes above the existing object. That response can counter, change targets, add damage, create prevention, or otherwise change what the lower object will do.', 'After a stack object resolves, the active player receives priority. The next object waits until all players pass again.'], example: 'Example: Counterspell cast in response to a creature spell resolves first and can counter that creature spell before it becomes a permanent.' }),
    magicReferenceTopic('timing', 3, 'reference-timing-permissions', 'Timing Permissions', 'Timing permissions define when lands, sorceries, permanents, instants, activated abilities, and special actions can be used.', { officialTerms: ['Sorcery timing', 'Instant timing', 'Special action', 'Land play'], relatedTopics: ['learn-taking-your-turn', 'learn-casting-spells'] }),
    magicReferenceTopic('timing', 4, 'reference-state-based-actions', 'State-Based Actions', 'State-based actions are automatic checks that handle lethal damage, 0 life, illegal attachments, zero loyalty, and similar game states.', { officialTerms: ['State-based action', 'Lethal damage', 'Zero life', 'Legend rule'], relatedTopics: ['learn-winning-and-losing', 'reference-combat-damage'] }),
    magicReferenceTopic('timing', 5, 'reference-triggered-abilities', 'Triggered Abilities', 'Triggered abilities begin with when, whenever, or at and wait to go on the stack after their trigger event occurs.', { officialTerms: ['Triggered ability', 'Trigger event', 'Intervening if'], relatedTopics: ['learn-abilities-and-triggers', 'reference-simultaneous-triggers'] }),
    magicReferenceTopic('timing', 6, 'reference-replacement-effects', 'Replacement Effects', 'Replacement and prevention effects modify events before they happen instead of triggering after the event.', { officialTerms: ['Replacement effect', 'Prevention effect', 'Instead', 'Skip'], relatedTopics: ['reference-triggered-abilities', 'reference-continuous-effects'] }),
    magicReferenceTopic('timing', 7, 'reference-continuous-effects', 'Continuous Effects', 'Continuous effects modify objects, players, or rules for a duration or while a static ability applies.', { officialTerms: ['Continuous effect', 'Duration', 'Static ability'], relatedTopics: ['reference-layers', 'reference-dependency-timestamp'] }),
    magicReferenceTopic('turn-combat', 1, 'reference-turn-structure', 'Turn Structure', 'Turn structure covers beginning, precombat main, combat, postcombat main, and ending phases with their steps and priority windows.', { officialTerms: ['Beginning phase', 'Precombat main phase', 'Combat phase', 'Postcombat main phase', 'Ending phase'], relatedTopics: ['learn-taking-your-turn', 'reference-priority'] }),
    magicReferenceTopic('turn-combat', 2, 'reference-combat-steps', 'Combat Steps', 'Combat has beginning of combat, declare attackers, declare blockers, combat damage, and end of combat steps.', { officialTerms: ['Beginning of combat', 'Declare attackers', 'Declare blockers', 'Combat damage', 'End of combat'], relatedTopics: ['learn-combat', 'reference-attacking', 'reference-blocking'] }),
    magicReferenceTopic('turn-combat', 3, 'reference-attacking', 'Attacking', 'Attacking declares eligible creatures as attackers against players, planeswalkers, or battles and taps them unless an effect says otherwise.', { officialTerms: ['Declare attackers', 'Attacking creature', 'Tapped and attacking'], relatedTopics: ['reference-combat-steps', 'reference-summoning-sickness'] }),
    magicReferenceTopic('turn-combat', 4, 'reference-summoning-sickness', 'Summoning Sickness', 'A creature normally cannot attack or use tap or untap abilities unless its controller has controlled it continuously since their most recent turn began.', { officialTerms: ['Summoning sickness', 'Tap symbol', 'Untap symbol', 'Haste'], relatedTopics: ['learn-combat', 'reference-attacking'] }),
    magicReferenceTopic('turn-combat', 5, 'reference-blocking', 'Blocking', 'Blocking assigns untapped creatures to attacking creatures during the declare blockers step.', { officialTerms: ['Declare blockers', 'Blocking creature', 'Blocked creature', 'Unblocked creature'], relatedTopics: ['reference-attacking', 'reference-combat-damage'] }),
    magicReferenceTopic('turn-combat', 6, 'reference-combat-damage', 'Combat Damage', 'Combat damage is assigned and dealt by attacking and blocking creatures, then state-based actions handle lethal damage.', { officialTerms: ['Combat damage', 'Assign damage', 'Lethal damage', 'Damage marked'], relatedTopics: ['learn-combat', 'reference-state-based-actions'] }),
    magicReferenceTopic('turn-combat', 7, 'reference-first-strike-double-strike', 'First Strike / Double Strike', 'First strike and double strike can create an additional combat damage step before regular combat damage.', { officialTerms: ['First strike', 'Double strike', 'Combat damage step'], relatedTopics: ['reference-combat-damage'] }),
    magicReferenceTopic('card-rules', 1, 'reference-card-types', 'Card Types', 'Card types define the basic rules for lands, creatures, instants, sorceries, artifacts, enchantments, planeswalkers, and battles.', { officialTerms: ['Card type', 'Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Battle'], relatedTopics: ['learn-card-types'] }),
    magicReferenceTopic('card-rules', 2, 'reference-supertypes', 'Supertypes', 'Supertypes such as basic, legendary, snow, world, and ongoing add rules meaning above the card type.', { officialTerms: ['Supertype', 'Basic', 'Legendary', 'Snow'], relatedTopics: ['reference-card-types', 'reference-state-based-actions'] }),
    magicReferenceTopic('card-rules', 3, 'reference-subtypes', 'Subtypes', 'Subtypes such as creature types, land types, Equipment, Aura, Vehicle, and Siege matter when rules or card text refer to them.', { officialTerms: ['Subtype', 'Creature type', 'Land type', 'Aura', 'Equipment'], relatedTopics: ['reference-card-types'] }),
    magicReferenceTopic('card-rules', 4, 'reference-keywords', 'Keywords / Keyword Actions', 'Keywords and keyword actions package recurring rules concepts into named game terms.', { officialTerms: ['Keyword ability', 'Keyword action', 'Evergreen keyword'], relatedTopics: ['learn-where-to-go-next'], relatedMechanics: MAGIC_KEYWORD_GLOSSARY.map((entry) => entry.name) }),
    magicReferenceTopic('card-rules', 5, 'reference-counters', 'Counters', 'Counters are markers placed on players or objects, such as +1/+1 counters, loyalty counters, stun counters, and poison counters.', { officialTerms: ['Counter', '+1/+1 counter', 'Loyalty counter', 'Poison counter'], relatedTopics: ['reference-state-based-actions'] }),
    magicReferenceTopic('card-rules', 6, 'reference-tokens', 'Tokens', 'Tokens are game objects created by effects and represented by cards, markers, or other clear objects.', { officialTerms: ['Token', 'Create', 'Copy token'], relatedTopics: ['reference-copies', 'reference-permanents'] }),
    magicReferenceTopic('card-rules', 7, 'reference-copies', 'Copies', 'Copy effects create copies of spells, permanents, cards, or tokens using copiable values and effect instructions.', { officialTerms: ['Copy', 'Copiable values', 'Token copy'], relatedTopics: ['reference-tokens', 'reference-layers'] }),
    magicReferenceTopic('card-rules', 8, 'reference-face-down-cards', 'Face-Down Cards', 'Face-down cards have special characteristics and can be turned face up only under rules or effects that permit it.', { officialTerms: ['Face down', 'Morph', 'Disguise', 'Manifest'], relatedTopics: ['reference-timing-permissions'] }),
    magicReferenceTopic('card-rules', 9, 'reference-modal-split-double-faced-cards', 'Modal, Split, and Double-Faced Cards', 'Modal, split, and double-faced cards use special rules for choosing modes, halves, or faces in zones and while casting.', { officialTerms: ['Mode', 'Split card', 'Modal double-faced card', 'Transforming double-faced card'], relatedTopics: ['reference-cards', 'reference-spells'] }),
    magicReferenceTopic('advanced', 1, 'reference-layers', 'Layers / Continuous Effect Interaction', 'The layer system orders continuous effects that change control, text, type, color, abilities, power, and toughness.', { officialTerms: ['Layer', 'Continuous effect', 'Dependency', 'Timestamp'], relatedTopics: ['reference-continuous-effects', 'reference-dependency-timestamp'] }),
    magicReferenceTopic('advanced', 2, 'reference-apnap-ordering', 'APNAP Ordering', 'APNAP ordering means the active player makes or orders required choices first, then nonactive players do so in turn order.', { officialTerms: ['Active player', 'Nonactive player', 'Turn order'], relatedTopics: ['reference-priority', 'reference-simultaneous-triggers'] }),
    magicReferenceTopic('advanced', 3, 'reference-simultaneous-triggers', 'Simultaneous Triggers', 'When multiple triggered abilities wait to go on the stack, controller and APNAP ordering determine how they are ordered.', { officialTerms: ['Triggered ability', 'APNAP order', 'Controller'], relatedTopics: ['reference-triggered-abilities', 'reference-apnap-ordering'] }),
    magicReferenceTopic('advanced', 4, 'reference-dependency-timestamp', 'Dependency and Timestamp', 'Dependency and timestamp rules help order continuous effects within layers when effects interact.', { officialTerms: ['Dependency', 'Timestamp', 'Continuous effect'], relatedTopics: ['reference-layers'] }),
    magicReferenceTopic('advanced', 5, 'reference-multiplayer', 'Multiplayer Rules', 'Multiplayer rules cover turn order, attacking multiple opponents, players leaving the game, and format-specific multiplayer modifications.', { officialTerms: ['Multiplayer game', 'Attack multiple players', 'Player leaves the game'], relatedTopics: ['reference-commander', 'reference-apnap-ordering'] }),
    magicReferenceTopic('formats', 1, 'reference-formats', 'Formats', 'Formats define deck size, legal cards, banned or restricted lists, number of players, and match expectations.', { officialTerms: ['Format', 'Constructed', 'Limited', 'Banned list', 'Restricted list'], relatedTopics: ['reference-standard', 'reference-commander'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 2, 'reference-standard', 'Standard', 'Standard is a rotating 60-card Constructed format using recent sets and current official legality.', { officialTerms: ['Standard', 'Rotation', 'Sideboard'], relatedTopics: ['reference-formats', 'reference-deck-construction'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 3, 'reference-pioneer', 'Pioneer', 'Pioneer is a nonrotating Constructed format using sets from Return to Ravnica forward, subject to its banned list.', { officialTerms: ['Pioneer', 'Nonrotating', 'Banned list'], relatedTopics: ['reference-formats'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 4, 'reference-modern', 'Modern', 'Modern is a nonrotating Constructed format with a broad card pool and its own banned list.', { officialTerms: ['Modern', 'Nonrotating', 'Banned list'], relatedTopics: ['reference-formats'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 5, 'reference-legacy', 'Legacy', 'Legacy allows cards from across Magic history except cards on the Legacy banned list.', { officialTerms: ['Legacy', 'Banned list', 'Constructed'], relatedTopics: ['reference-formats'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 6, 'reference-vintage', 'Vintage', 'Vintage allows a very broad card pool and uses a restricted list in addition to banned cards.', { officialTerms: ['Vintage', 'Restricted list', 'Banned list'], relatedTopics: ['reference-formats'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 7, 'reference-pauper', 'Pauper', 'Pauper is built around cards that have been printed at common rarity under official format rules.', { officialTerms: ['Pauper', 'Common', 'Sideboard'], relatedTopics: ['reference-formats'], sourceLabels: ['Magic formats hub'] }),
    magicReferenceTopic('formats', 8, 'reference-deck-construction', 'Deck Construction', 'Deck construction rules depend on format, including minimum size, sideboard, copy limits, and basic-land exceptions.', { officialTerms: ['Minimum deck size', 'Sideboard', 'Four-card limit', 'Basic land'], relatedTopics: ['learn-building-first-deck', 'reference-formats'] }),
    magicReferenceTopic('commander', 1, 'reference-commander', 'Commander', 'Commander is a multiplayer format built around a commander, a 99-card singleton deck, color identity, and the command zone.', { officialTerms: ['Commander', 'Singleton', 'Color identity', 'Command zone'], relatedTopics: ['reference-color-identity', 'reference-command-zone', 'reference-commander-tax', 'reference-commander-damage'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 2, 'reference-commander-selection', 'Commander Selection', 'Commander decks choose a legal commander, usually a legendary creature, with some cards permitting other commander choices.', { officialTerms: ['Legendary creature', 'Can be your commander', 'Commander'], relatedTopics: ['reference-commander', 'reference-color-identity'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 3, 'reference-color-identity', 'Color Identity', 'Color identity determines which cards can be included in a Commander deck and includes mana symbols and characteristic-defining color indicators beyond mana cost.', { officialTerms: ['Color identity', 'Mana symbol', 'Color indicator', 'Commander deck'], relatedTopics: ['learn-understanding-a-card', 'reference-commander'], sourceLabels: ['Magic Commander format'], definition: 'Color identity is a Commander deck construction rule. A card color identity includes its colors plus mana symbols and color indicators that the Commander rules count for identity.', application: ['A Commander deck can include only cards whose color identity fits within the commander color identity. Lands and colorless cards still need to obey this rule if their rules text contains mana symbols outside the commander identity.', 'Basic lands are allowed as repeated cards, but their mana symbols and land types still need to fit the commander deck color identity expectations.'], example: 'Example: a blue-red commander allows cards with blue, red, both, or no color identity, but not a card with a green mana symbol in its rules text unless an official exception applies.' }),
    magicReferenceTopic('commander', 4, 'reference-command-zone', 'Command Zone', 'The command zone is where commanders begin the game and where special Commander replacement effects can move them.', { officialTerms: ['Command zone', 'Commander', 'Zone change'], relatedTopics: ['reference-commander', 'reference-commander-tax'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 5, 'reference-commander-tax', 'Commander Tax', 'Commander tax is the additional cost to cast a commander from the command zone for each previous time it was cast from there.', { officialTerms: ['Additional cost', 'Command zone', 'Cast from command zone'], relatedTopics: ['reference-command-zone', 'reference-costs'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 6, 'reference-commander-damage', 'Commander Damage', 'A player can lose from being dealt enough combat damage by the same commander over the course of the game.', { officialTerms: ['Commander damage', 'Combat damage', 'Lose the game'], relatedTopics: ['reference-commander', 'reference-combat-damage'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 7, 'reference-partner-background', 'Partner / Background / Special Commanders', 'Partner, Background, Doctor companion, and similar mechanics modify how commanders can be paired or selected when current card text permits it.', { officialTerms: ['Partner', 'Background', 'Choose a Background', 'Commander'], relatedTopics: ['reference-commander-selection', 'reference-color-identity'], sourceLabels: ['Magic Commander format'] }),
    magicReferenceTopic('commander', 8, 'reference-commander-brackets-game-changers', 'Commander Brackets and Game Changers', 'Commander Brackets and Game Changers help players communicate deck experience, power, and table expectations before a casual Commander game.', { officialTerms: ['Commander Brackets', 'Game Changers', 'Bracket 1', 'Bracket 5'], relatedTopics: ['reference-commander', 'reference-deck-construction'], sourceLabels: ['Commander brackets beta update'] }),
    magicReferenceTopic('commander', 9, 'reference-commander-banned-list', 'Commander Banned List', 'Commander legality depends on current official Commander banned-list updates and format documents.', { officialTerms: ['Banned list', 'Commander', 'Legality'], relatedTopics: ['reference-commander', 'reference-commander-brackets-game-changers'], sourceLabels: ['Magic Commander format', 'Commander brackets beta update'] })
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
