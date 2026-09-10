import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, 'public', 'data');
const OUT_ROOT = path.join(PUBLIC_DATA, 'encyclopedia');
const GENERATED_AT = new Date().toISOString();

const GAMES = [
  { id: 'magic', label: 'Magic: The Gathering', sourceDir: 'mtg', setCode: (set) => set.set_code || set.code || set.name },
  { id: 'pokemon', label: 'Pokemon TCG', sourceDir: 'pokemon', setCode: (set) => set.id || set.ptcgoCode || set.name },
  { id: 'yugioh', label: 'Yu-Gi-Oh!', sourceDir: 'yugioh', setCode: (set) => set.set_code || set.set_name },
  { id: 'lorcana', label: 'Disney Lorcana', sourceDir: 'lorcana', setCode: (set) => set.code || set.name },
  { id: 'fab', label: 'Flesh and Blood', sourceDir: 'fab', setCode: (set) => set.code || set.id || set.name },
  { id: 'onepiece', label: 'One Piece TCG', sourceDir: 'onepiece', setCode: (set) => set.code || set.pack_id || set.name },
  { id: 'starwars', label: 'Star Wars Unlimited', sourceDir: 'starwars', setCode: (set) => set.code || set.uuid || set.name }
];

const CARD_SOURCE_LABELS = {
  magic: 'Scryfall bulk-data local public printing index',
  pokemon: 'PokemonTCG.io-compatible local public catalog',
  yugioh: 'YGOPRODeck API local public catalog',
  lorcana: 'Lorcast API local public catalog',
  fab: 'the-fab-cube English card catalog local public mirror',
  onepiece: 'punk-records One Piece English card catalog local public mirror',
  starwars: 'SWU API export local public catalog'
};

function readJson(relativePath, fallback = null) {
  const filePath = path.join(PUBLIC_DATA, relativePath);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload)}\n`);
}

function clean(value) {
  return String(value ?? '').trim();
}

function compact(value) {
  if (Array.isArray(value)) return value.filter((entry) => clean(entry));
  if (value === null || value === undefined || value === '') return null;
  return value;
}

function htmlDecode(value) {
  return clean(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function slugify(value) {
  return clean(value)
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
}

function sortNumber(left = '', right = '') {
  return clean(left).localeCompare(clean(right), undefined, { numeric: true, sensitivity: 'base' });
}

function localImagePath(game, cardId, sourceUrl, folder = 'images', suffix = '') {
  if (!sourceUrl) return null;
  let extension = '.png';
  try {
    const pathname = new URL(sourceUrl).pathname.toLowerCase();
    const match = pathname.match(/(\.[a-z0-9]+)$/i);
    extension = match?.[1] || extension;
  } catch {}
  const id = clean(cardId) || 'unknown';
  const prefix = id.slice(0, 2).toLowerCase();
  return `/data/${game}/${folder}/${prefix}/${encodeURIComponent(id)}${suffix}${extension}`;
}

function field(label, value) {
  const next = Array.isArray(value) ? value.filter(Boolean).join(', ') : value;
  return clean(next) ? { label, value: next } : null;
}

function textBlock(title, text) {
  return clean(text) ? { title, text: clean(text) } : null;
}

function variant(entry) {
  return Object.fromEntries(Object.entries(entry).filter(([, value]) => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== null && value !== undefined && value !== '';
  }));
}

function expandCompactRow(row, fields = []) {
  if (!Array.isArray(row)) return row || {};
  const expanded = Object.fromEntries(fields.map((fieldName, index) => [fieldName, row[index]]));
  expanded.prices = {
    usd: expanded.usd ?? null,
    usd_foil: expanded.usd_foil ?? null,
    usd_etched: expanded.usd_etched ?? null
  };
  delete expanded.usd;
  delete expanded.usd_foil;
  delete expanded.usd_etched;
  return expanded;
}

function setBase(game, set) {
  const rawCode = clean(game.setCode(set));
  const name = clean(set.name || set.set_name || rawCode);
  return {
    id: clean(set.id || set.uuid || rawCode || name),
    code: rawCode,
    name,
    slug: slugify(name),
    releaseDate: clean(set.releaseDate || set.release_date || set.released_at || set.tcg_date),
    sourceCardCount: Number(set.total || set.card_count || set.total_cards || set.num_of_cards || set.printedTotal || 0) || null
  };
}

function buildPokemonCards(cards, sets) {
  const setIds = [...sets.map((set) => clean(set.id)).filter(Boolean)].sort((a, b) => b.length - a.length);
  const bySet = new Map();
  for (const card of cards) {
    const id = clean(card.id);
    const setId = setIds.find((candidate) => id.startsWith(`${candidate}-`)) || id.split('-')[0];
    const image = card.images?.large || card.images?.small || null;
    const out = {
      encyclopediaCard: true,
      id,
      canonicalId: `pokemon:${htmlDecode(card.name)}:${card.supertype || 'Card'}`,
      printingId: id,
      name: htmlDecode(card.name),
      number: clean(card.number),
      collector_number: clean(card.number),
      card_number: clean(card.number),
      rarity: clean(card.rarity),
      image_url: localImagePath('pokemon', id, image, 'images/large') || image,
      image_small: localImagePath('pokemon', id, card.images?.small, 'images/small') || card.images?.small || image,
      type_line: [card.supertype, ...(card.subtypes || []), ...(card.types || [])].filter(Boolean).join(' / '),
      tags: [card.supertype, ...(card.subtypes || []), ...(card.types || []), card.rarity].filter(Boolean),
      fields: [
        field('Category', card.supertype),
        field('Stage', card.subtypes),
        field('Types', card.types),
        field('HP', card.hp),
        field('Evolves From', card.evolvesFrom),
        field('Number', card.number),
        field('Rarity', card.rarity),
        field('Regulation Mark', card.regulationMark),
        field('Legalities', Object.entries(card.legalities || {}).map(([format, status]) => `${format}: ${status}`))
      ].filter(Boolean),
      textBlocks: [
        ...(card.abilities || []).map((ability) => textBlock(`${ability.type || 'Ability'}: ${ability.name || ''}`, ability.text)),
        ...(card.attacks || []).map((attack) => textBlock(`Attack: ${attack.name || ''}${attack.damage ? ` (${attack.damage})` : ''}`, [attack.cost?.join(', '), attack.text].filter(Boolean).join(' - '))),
        textBlock('Rules', (card.rules || []).join('\n')),
        textBlock('Flavor', card.flavorText)
      ].filter(Boolean),
      filterValues: {
        category: card.supertype || '',
        stage: (card.subtypes || [])[0] || '',
        type: (card.types || [])[0] || '',
        rarity: card.rarity || ''
      },
      raw: {
        legalities: card.legalities || {},
        artist: card.artist || '',
        variants: []
      }
    };
    if (!bySet.has(setId)) bySet.set(setId, []);
    bySet.get(setId).push(out);
  }
  return bySet;
}

function buildMagicCards(printings) {
  const bySet = new Map();
  for (const card of printings) {
    const setCode = clean(card.set_code).toUpperCase();
    if (!setCode) continue;
    const image = clean(card.image_normal);
    const out = {
      encyclopediaCard: true,
      id: card.id,
      canonicalId: card.oracle_id ? `magic:${card.oracle_id}` : `magic:${card.id}`,
      printingId: card.id,
      name: htmlDecode(card.name),
      number: clean(card.collector_number),
      collector_number: clean(card.collector_number),
      card_number: clean(card.collector_number),
      rarity: clean(card.rarity),
      image_url: image || null,
      image_small: image || null,
      type_line: '',
      tags: [card.rarity, card.lang].filter(Boolean),
      fields: [
        field('Language', card.lang),
        field('Number', card.collector_number),
        field('Rarity', card.rarity),
        field('Released', card.released_at),
        field('Finishes', card.finishes)
      ].filter(Boolean),
      textBlocks: [],
      filterValues: {
        rarity: card.rarity || '',
        language: card.lang || ''
      },
      raw: {
        oracle_id: card.oracle_id || '',
        released_at: card.released_at || '',
        finishes: card.finishes || [],
        prices: card.prices || {},
        variants: []
      }
    };
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode).push(out);
  }
  return bySet;
}

function buildYugiohCards(cards, sets) {
  const bySet = new Map();
  for (const card of cards) {
    const printings = Array.isArray(card.card_sets) ? card.card_sets : [];
    const byNumber = new Map();
    for (const printing of printings) {
      const code = clean(printing.set_code).split('-')[0];
      if (!code) continue;
      const number = clean(printing.set_code);
      const key = `${code}:${number}:${card.id}`;
      const rarity = clean(printing.set_rarity);
      const candidate = byNumber.get(key) || {
        setId: code,
        encyclopediaCard: true,
        id: `yugioh:${card.id}:${number}`,
        canonicalId: `yugioh:${card.id}`,
        printingId: number,
        name: htmlDecode(card.name),
        number,
        collector_number: number,
        card_number: number,
        rarity,
        image_url: card.card_images?.[0]?.image_url || null,
        image_small: card.card_images?.[0]?.image_url_small || card.card_images?.[0]?.image_url || null,
        type_line: clean(card.type),
        tags: [card.frameType, card.type, card.race, card.attribute, card.archetype, rarity].filter(Boolean),
        fields: [
          field('Card Type', card.type),
          field('Frame', card.frameType),
          field('Subtype', card.race),
          field('Attribute', card.attribute),
          field('Level / Rank', card.level),
          field('Link Rating', card.linkval),
          field('Pendulum Scale', card.scale),
          field('ATK', card.atk),
          field('DEF', card.def),
          field('Archetype', card.archetype),
          field('TCG Status', card.banlist_info?.ban_tcg),
          field('Number', number),
          field('Rarity', rarity)
        ].filter(Boolean),
        textBlocks: [textBlock('Card Text', htmlDecode(card.desc))].filter(Boolean),
        filterValues: {
          type: card.frameType || card.type || '',
          subtype: card.race || '',
          attribute: card.attribute || '',
          rarity
        },
        raw: {
          variants: [],
          price: Number(printing.set_price) > 0 ? Number(printing.set_price) : null
        }
      };
      candidate.raw.variants.push(variant({
        id: `${card.id}:${number}:${rarity}`,
        name: card.name,
        setCode: number,
        number,
        rarity,
        variantLabel: rarity,
        price: Number(printing.set_price) > 0 ? Number(printing.set_price) : null,
        image_url: card.card_images?.[0]?.image_url || null
      }));
      byNumber.set(key, candidate);
    }
    for (const entry of byNumber.values()) {
      if (!bySet.has(entry.setId)) bySet.set(entry.setId, []);
      delete entry.setId;
      bySet.get(clean(entry.set_code || entry.printingId).split('-')[0] || entry.printingId.split('-')[0]).push(entry);
    }
  }
  return bySet;
}

function buildLorcanaCards(cards) {
  const bySet = new Map();
  for (const card of cards) {
    const setCode = clean(card.set?.code);
    const image = card.image_uris?.digital?.large || card.image_uris?.digital?.normal || null;
    const out = {
      encyclopediaCard: true,
      id: card.id,
      canonicalId: `lorcana:${htmlDecode(card.name)}:${htmlDecode(card.version)}`,
      printingId: card.id,
      name: htmlDecode(card.name),
      subtitle: htmlDecode(card.version),
      number: clean(card.collector_number),
      collector_number: clean(card.collector_number),
      card_number: clean(card.collector_number),
      rarity: clean(card.rarity),
      image_url: localImagePath('lorcana', card.id, image, 'images/large') || image,
      image_small: localImagePath('lorcana', card.id, card.image_uris?.digital?.normal, 'images/normal') || card.image_uris?.digital?.normal || image,
      type_line: (card.type || []).join(' / '),
      tags: [card.ink, ...(card.type || []), ...(card.classifications || []), card.rarity, ...(card.keywords || [])].filter(Boolean),
      fields: [
        field('Ink', card.ink),
        field('Inkable', card.inkwell ? 'Yes' : 'No'),
        field('Type', card.type),
        field('Cost', card.cost),
        field('Strength', card.strength),
        field('Willpower', card.willpower),
        field('Lore', card.lore),
        field('Classifications', card.classifications),
        field('Keywords', card.keywords),
        field('Number', card.collector_number),
        field('Rarity', card.rarity)
      ].filter(Boolean),
      textBlocks: [textBlock('Card Text', card.text)].filter(Boolean),
      filterValues: {
        ink: card.ink || '',
        type: (card.type || [])[0] || '',
        rarity: card.rarity || '',
        inkable: card.inkwell ? 'Inkable' : 'Not inkable'
      },
      raw: { variants: [] }
    };
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode).push(out);
  }
  return bySet;
}

function fabRarity(value) {
  return ({ C: 'Common', R: 'Rare', S: 'Super Rare', M: 'Majestic', L: 'Legendary', F: 'Fabled', P: 'Promo', T: 'Token', V: 'Marvel' }[clean(value).toUpperCase()] || clean(value));
}

function buildFabCards(cards) {
  const bySet = new Map();
  for (const card of cards) {
    const byPrinting = new Map();
    for (const printing of card.printings || []) {
      const setId = clean(printing.set_id);
      if (!setId) continue;
      const number = clean(printing.id || printing.unique_id);
      const key = `${setId}:${number}:${card.unique_id}`;
      const rarity = fabRarity(printing.rarity);
      const image = printing.image_url || null;
      const candidate = byPrinting.get(key) || {
        setId,
        encyclopediaCard: true,
        id: `fab:${printing.unique_id || card.unique_id}:${number}`,
        canonicalId: `fab:${card.unique_id}`,
        printingId: printing.unique_id || number,
        name: htmlDecode(card.name),
        number,
        collector_number: number,
        card_number: number,
        rarity,
        image_url: localImagePath('fab', card.unique_id, image, 'images') || image,
        type_line: clean(card.type_text),
        tags: [card.color, ...(card.types || []), ...(card.traits || []), rarity, ...(card.card_keywords || [])].filter(Boolean),
        fields: [
          field('Class / Type', card.type_text),
          field('Talent / Color', card.color),
          field('Pitch', card.pitch),
          field('Cost', card.cost),
          field('Power', card.power),
          field('Defense', card.defense),
          field('Health', card.health),
          field('Traits', card.traits),
          field('Keywords', card.card_keywords),
          field('Number', number),
          field('Rarity', rarity),
          field('Formats', [
            card.cc_legal ? 'Classic Constructed legal' : '',
            card.blitz_legal ? 'Blitz legal' : '',
            card.commoner_legal ? 'Commoner legal' : '',
            card.ll_legal ? 'Living Legend legal' : ''
          ])
        ].filter(Boolean),
        textBlocks: [textBlock('Functional Text', card.functional_text_plain || card.functional_text)].filter(Boolean),
        filterValues: {
          class: (card.types || [])[0] || '',
          type: (card.types || [])[1] || card.type_text || '',
          pitch: card.pitch || '',
          rarity
        },
        raw: { variants: [] }
      };
      candidate.raw.variants.push(variant({
        id: printing.unique_id || `${number}:${printing.foiling}`,
        number,
        rarity,
        variantLabel: [printing.edition, printing.foiling].filter(Boolean).join(' / '),
        artist: (printing.artists || []).join(', '),
        image_url: image
      }));
      byPrinting.set(key, candidate);
    }
    for (const entry of byPrinting.values()) {
      if (!bySet.has(entry.setId)) bySet.set(entry.setId, []);
      const setId = entry.setId;
      delete entry.setId;
      bySet.get(setId).push(entry);
    }
  }
  return bySet;
}

function buildOnePieceCards(cards) {
  const bySet = new Map();
  for (const card of cards) {
    const setCode = clean(card.set_code || card.id?.split('-')[0]);
    const out = {
      encyclopediaCard: true,
      id: card.id,
      canonicalId: `onepiece:${card.id}`,
      printingId: card.id,
      name: htmlDecode(card.name),
      number: clean(card.id),
      collector_number: clean(card.id),
      card_number: clean(card.id),
      rarity: clean(card.rarity),
      image_url: localImagePath('onepiece', card.id, card.image_url, 'images') || card.image_url,
      type_line: clean(card.category),
      tags: [card.category, ...(card.colors || []), ...(card.types || []), card.rarity].filter(Boolean),
      fields: [
        field('Category', card.category),
        field('Colors', card.colors),
        field('Cost', card.cost),
        field('Power', card.power),
        field('Counter', card.counter),
        field('Traits', card.types),
        field('Life', card.life),
        field('Number', card.id),
        field('Rarity', card.rarity)
      ].filter(Boolean),
      textBlocks: [textBlock('Effect', htmlDecode(card.effect)), textBlock('Trigger', htmlDecode(card.trigger))].filter(Boolean),
      filterValues: {
        category: card.category || '',
        color: (card.colors || [])[0] || '',
        rarity: card.rarity || ''
      },
      raw: { variants: [] }
    };
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode).push(out);
  }
  return bySet;
}

function buildStarWarsCards(cards) {
  const bySet = new Map();
  const byIdentity = new Map();
  for (const card of cards) {
    const key = `${card.setCode}:${card.name}:${card.subtitle || ''}:${card.type}:${card.cardNumber}`;
    if (!byIdentity.has(key)) byIdentity.set(key, []);
    byIdentity.get(key).push(card);
  }
  for (const [key, variants] of byIdentity.entries()) {
    const card = variants[0];
    const setCode = clean(card.setCode);
    const out = {
      encyclopediaCard: true,
      id: card.uuid,
      canonicalId: `starwars:${card.externalId || card.name}:${card.subtitle || ''}`,
      printingId: card.uuid,
      name: htmlDecode(card.name),
      subtitle: htmlDecode(card.subtitle),
      number: clean(card.cardNumber),
      collector_number: clean(card.cardNumber),
      card_number: clean(card.cardNumber),
      rarity: clean(card.rarity),
      image_url: localImagePath('starwars', card.uuid, card.frontImageUrl, 'images') || card.frontImageUrl,
      image_back_url: localImagePath('starwars', card.uuid, card.backImageUrl, 'images', '-back') || card.backImageUrl,
      type_line: [card.type, card.type2].filter(Boolean).join(' / '),
      tags: [card.type, card.type2, card.arena, ...(card.aspects || []), ...(card.traits || []), card.rarity, card.variantType].filter(Boolean),
      fields: [
        field('Card Type', card.type),
        field('Subtitle', card.subtitle),
        field('Aspects', card.aspects),
        field('Arena', card.arena),
        field('Cost', card.cost),
        field('Power', card.power),
        field('HP', card.hp),
        field('Traits', card.traits),
        field('Keywords', card.keywords),
        field('Unique', card.isUnique ? 'Yes' : ''),
        field('Leader', card.isLeader ? 'Yes' : ''),
        field('Base', card.isBase ? 'Yes' : ''),
        field('Number', card.cardNumber),
        field('Rarity', card.rarity),
        field('Variant', card.variantType)
      ].filter(Boolean),
      textBlocks: [
        textBlock('Card Text', card.text || card.frontText),
        textBlock('Back Text', card.backText),
        textBlock('Epic Action', card.epicAction),
        textBlock('Deploy Box', card.deployBox)
      ].filter(Boolean),
      filterValues: {
        type: card.isLeader ? 'Leader' : card.isBase ? 'Base' : card.type || '',
        aspect: (card.aspects || [])[0] || '',
        arena: card.arena || '',
        rarity: card.rarity || '',
        variant: card.variantType || ''
      },
      raw: {
        variants: variants.map((printing) => variant({
          id: printing.uuid,
          number: printing.cardNumber,
          rarity: printing.rarity,
          variantLabel: printing.variantType,
          image_url: printing.frontImageUrl
        }))
      }
    };
    if (!bySet.has(setCode)) bySet.set(setCode, []);
    bySet.get(setCode).push(out);
  }
  return bySet;
}

function applySetMeta(cards, set) {
  return cards.map((card) => ({
    ...card,
    game: set.game,
    set_name: set.name,
    set_code: set.code
  }));
}

function sortCards(_gameId, cards) {
  return [...cards].sort((left, right) => {
    const numberSort = sortNumber(left.number || left.card_number, right.number || right.card_number);
    if (numberSort !== 0) return numberSort;
    const nameSort = clean(left.name).localeCompare(clean(right.name), undefined, { sensitivity: 'base' });
    if (nameSort !== 0) return nameSort;
    return clean(left.rarity).localeCompare(clean(right.rarity), undefined, { sensitivity: 'base' });
  });
}

function buildFilters(cards) {
  const next = {};
  for (const card of cards) {
    for (const [key, value] of Object.entries(card.filterValues || {})) {
      if (!value) continue;
      if (!next[key]) next[key] = new Set();
      next[key].add(value);
    }
  }
  return Object.fromEntries(Object.entries(next).map(([key, values]) => [key, [...values].sort((a, b) => sortNumber(a, b))]));
}

function builderFor(gameId) {
  if (gameId === 'magic') return buildMagicCards;
  if (gameId === 'pokemon') return buildPokemonCards;
  if (gameId === 'yugioh') return buildYugiohCards;
  if (gameId === 'lorcana') return buildLorcanaCards;
  if (gameId === 'fab') return buildFabCards;
  if (gameId === 'onepiece') return buildOnePieceCards;
  if (gameId === 'starwars') return buildStarWarsCards;
  throw new Error(`Unsupported encyclopedia game ${gameId}`);
}

function sampleSetWithCards(sets, bySet) {
  return sets.find((set) => bySet.get(set.id)?.length || bySet.get(set.code)?.length) || null;
}

function main() {
  fs.rmSync(OUT_ROOT, { recursive: true, force: true });
  ensureDir(OUT_ROOT);

  const manifest = {
    generated_at: GENERATED_AT,
    games: {}
  };

  for (const game of GAMES) {
    const sets = readJson(`${game.sourceDir}/sets.json`, []);
    const printingManifest = game.id === 'magic' ? readJson('mtg/printing-index-manifest.json', {}) : {};
    const cards = game.id === 'magic'
      ? Object.values(printingManifest.shards || {}).flatMap((shard) => readJson(`mtg/${shard.file}`, []).map((row) => expandCompactRow(row, printingManifest.fields || [])))
      : readJson(`${game.sourceDir}/cards.json`, []);
    const sourceManifest = game.id === 'magic' ? printingManifest : readJson(`${game.sourceDir}/cards-manifest.json`, {});
    const normalizedSets = sets.map((set) => ({ ...setBase(game, set), game: game.id }));
    const bySet = builderFor(game.id)(cards, sets);
    const setRoot = path.join(OUT_ROOT, game.id, 'sets');

    let setCount = 0;
    let cardCount = 0;
    let variantCount = 0;

    for (const set of normalizedSets) {
      const setCards = sortCards(game.id, applySetMeta(bySet.get(set.id) || bySet.get(set.code) || [], set));
      if (!setCards.length) continue;
      const payload = {
        game: game.id,
        set: {
          id: set.id,
          code: set.code,
          name: set.name,
          slug: set.slug,
          releaseDate: set.releaseDate,
          sourceCardCount: set.sourceCardCount
        },
        source: {
          cardCatalog: CARD_SOURCE_LABELS[game.id],
          generatedAt: GENERATED_AT,
          sourceManifest
        },
        cards: setCards,
        filters: buildFilters(setCards)
      };
      writeJson(path.join(setRoot, `${set.slug}.json`), payload);
      setCount += 1;
      cardCount += setCards.length;
      variantCount += setCards.reduce((total, card) => total + Math.max(1, card.raw?.variants?.length || 0), 0);
    }

    const sampleSet = sampleSetWithCards(normalizedSets, bySet);
    const sampleCards = sampleSet ? sortCards(game.id, bySet.get(sampleSet.id) || bySet.get(sampleSet.code) || []) : [];

    manifest.games[game.id] = {
      label: game.label,
      sourceDir: game.sourceDir,
      setCount,
      sourceSetCount: sets.length,
      canonicalCardCount: cards.length,
      encyclopediaCardCount: cardCount,
      printingVariantCount: variantCount,
      cardSource: CARD_SOURCE_LABELS[game.id],
      generatedAt: GENERATED_AT,
      sourceManifest,
      sample: sampleSet && sampleCards[0] ? {
        setSlug: sampleSet.slug,
        setName: sampleSet.name,
        cardId: sampleCards[0].id,
        cardName: sampleCards[0].name
      } : null
    };

    console.log(`${game.label}: ${setCount}/${sets.length} sets with cards, ${cards.length} canonical cards, ${variantCount} printings/variants`);
  }

  writeJson(path.join(OUT_ROOT, 'manifest.json'), manifest);
  console.log(`Encyclopedia public data written to ${OUT_ROOT}`);
}

main();
