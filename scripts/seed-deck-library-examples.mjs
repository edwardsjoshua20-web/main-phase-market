import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, 'utf8').split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^\s*([^#][^=]+)=(.*)$/);
    return match ? [[match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
  }));
}

const env = { ...loadEnv(path.join(repoRoot, '.env.local')), ...process.env };
const supabaseUrl = String(env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
const ownerEmail = process.argv.find((argument) => argument.startsWith('--owner='))?.slice('--owner='.length) || 'admin@mainphasemarket.net';

if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase service credentials are required.');

const headers = {
  apikey: serviceRoleKey,
  Authorization: `Bearer ${serviceRoleKey}`,
  'Content-Type': 'application/json',
};

async function request(pathname, options = {}) {
  const response = await fetch(`${supabaseUrl}${pathname}`, { ...options, headers: { ...headers, ...(options.headers || {}) } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

function readCatalog(game) {
  const payload = JSON.parse(fs.readFileSync(path.join(repoRoot, 'public', 'data', game, 'cards.json'), 'utf8'));
  return Array.isArray(payload) ? payload : payload.cards || payload.data || [];
}

function catalogCard(game, name) {
  const card = readCatalog(game).find((candidate) => candidate.name === name);
  if (!card) throw new Error(`Catalog card not found: ${game}/${name}`);
  return card;
}

function onePieceImageUrl(card) {
  const extension = path.extname(new URL(card.image_url).pathname) || '.png';
  const prefix = String(card.id).slice(0, 2).toLowerCase();
  return `${supabaseUrl}/storage/v1/object/public/main-phase-market-public/data/onepiece/images/${prefix}/${encodeURIComponent(card.id)}${extension}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function itemFromCard(game, card) {
  if (game === 'pokemon') return { product_id: `pokemon:${card.id}`, api_id: card.id, product_name: card.name, product_image: card.images?.large || card.images?.small || '', image_url: card.images?.large || '', product_type: game, game, type: card.supertype || '', type_line: card.supertype || '', set_name: String(card.id).split('-')[0], collector_number: card.number || '', rarity: card.rarity || '', quantity: 1 };
  if (game === 'yugioh') return { product_id: `yugioh:${card.id}`, api_id: String(card.id), product_name: card.name, product_image: card.card_images?.[0]?.image_url || '', image_url: card.card_images?.[0]?.image_url || '', product_type: game, game, type: card.type || '', type_line: card.type || '', set_name: card.card_sets?.[0]?.set_name || '', set_code: card.card_sets?.[0]?.set_code || '', rarity: card.card_sets?.[0]?.set_rarity || '', quantity: 1 };
  if (game === 'lorcana') return { product_id: `lorcana:${card.id}`, api_id: card.id, product_name: `${card.name}${card.version ? ` - ${card.version}` : ''}`, product_image: card.image_uris?.digital?.large || card.image_uris?.digital?.normal || '', image_url: card.image_uris?.digital?.large || '', product_type: game, game, type: Array.isArray(card.type) ? card.type.join(' ') : card.type || '', type_line: Array.isArray(card.type) ? card.type.join(' ') : card.type || '', set_name: card.set?.name || '', set_code: card.set?.code || '', collector_number: card.collector_number || '', rarity: card.rarity || '', quantity: 1 };
  if (game === 'flesh_and_blood') return { product_id: `fab:${card.unique_id}`, api_id: card.unique_id, product_name: card.name, product_image: card.printings?.[0]?.image_url || '', image_url: card.printings?.[0]?.image_url || '', product_type: game, game, type: card.type_text || card.types?.join(' ') || '', type_line: card.type_text || card.types?.join(' ') || '', set_code: card.printings?.[0]?.set_id || '', collector_number: card.printings?.[0]?.id || '', rarity: card.printings?.[0]?.rarity || '', quantity: 1 };
  if (game === 'onepiece') {
    const imageUrl = onePieceImageUrl(card);
    return { product_id: `onepiece:${card.id}`, api_id: card.id, product_name: card.name, product_image: imageUrl, image_url: imageUrl, product_type: game, game, type: card.category || '', type_line: card.category || '', set_code: card.set_code || '', rarity: card.rarity || '', quantity: 1 };
  }
  return { product_id: `starwars:${card.uuid}`, api_id: card.uuid, product_name: `${card.name}${card.subtitle ? ` - ${card.subtitle}` : ''}`, product_image: card.frontImageUrl || '', image_url: card.frontImageUrl || '', product_type: game, game, type: card.type || '', type_line: card.type2 || card.type || '', set_code: card.setCode || '', collector_number: card.cardNumber || '', rarity: card.rarity || '', quantity: 1 };
}

const existing = await request(`/rest/v1/saved_decks?select=*&owner_email=eq.${encodeURIComponent(ownerEmail)}&order=created_at.asc`);
const sourceDeck = existing.find((deck) => deck.name.toLowerCase() === 'goblins' && ['magic', 'mtg'].includes(String(deck.game).toLowerCase()));
if (!sourceDeck) throw new Error(`The Goblins source deck was not found for ${ownerEmail}.`);

const definitions = [
  { name: 'Example - Krenko Commander', game: 'magic', format: sourceDeck.format || 'commander', commanderName: sourceDeck.commander_name || '', items: sourceDeck.deck_payload?.items || [] },
  { name: 'Example - Pikachu', game: 'pokemon', format: 'standard', items: [itemFromCard('pokemon', catalogCard('pokemon', 'Pikachu'))] },
  { name: 'Example - Dark Magician', game: 'yugioh', format: 'advanced', items: [itemFromCard('yugioh', catalogCard('yugioh', 'Dark Magician'))] },
  { name: 'Example - Mickey Mouse', game: 'lorcana', format: 'core_constructed', items: [itemFromCard('lorcana', catalogCard('lorcana', 'Mickey Mouse'))] },
  { name: 'Example - Bravo', game: 'flesh_and_blood', format: 'classic_constructed', items: [itemFromCard('flesh_and_blood', catalogCard('fab', 'Bravo, Showstopper'))] },
  { name: 'Example - Straw Hat Crew', game: 'onepiece', format: 'standard', items: [itemFromCard('onepiece', catalogCard('onepiece', 'Monkey.D.Luffy'))] },
  { name: 'Example - Luke Skywalker', game: 'starwars', format: 'premier', items: [itemFromCard('starwars', catalogCard('starwars', 'Luke Skywalker'))] },
];

const results = [];
for (const definition of definitions) {
  const found = existing.find((deck) => deck.name === definition.name && deck.source === 'deck-library-example');
  if (found) {
    const currentItems = found.deck_payload?.items || [];
    if (stableJson(currentItems) !== stableJson(definition.items)) {
      await request(`/rest/v1/saved_decks?id=eq.${encodeURIComponent(found.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ deck_payload: { ...found.deck_payload, items: definition.items } }),
      });
      results.push({ game: definition.game, name: definition.name, id: found.id, status: 'updated' });
    } else {
      results.push({ game: definition.game, name: definition.name, id: found.id, status: 'existing' });
    }
    continue;
  }

  const record = {
    user_id: sourceDeck.user_id,
    owner_email: ownerEmail,
    name: definition.name,
    game: definition.game,
    format: definition.format,
    commander_name: definition.commanderName || '',
    source: 'deck-library-example',
    tags: ['qa-example', 'private'],
    deck_payload: {
      user_email: ownerEmail,
      name: definition.name,
      description: 'Private QA example deck using real MainPhase catalog data.',
      game: definition.game,
      deck_format: definition.format,
      commander_name: definition.commanderName || '',
      items: definition.items,
      estimated_cost: definition.game === 'magic' ? sourceDeck.deck_payload?.estimated_cost || 0 : 0,
      example_qa: true,
      visibility: 'private',
      is_public: false,
    },
  };
  const created = await request('/rest/v1/saved_decks', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record) });
  results.push({ game: definition.game, name: definition.name, id: created[0].id, status: 'created' });
}

console.log(JSON.stringify({ ownerEmail, examples: results }, null, 2));
