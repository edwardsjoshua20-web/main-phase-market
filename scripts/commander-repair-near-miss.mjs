import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.mjs';
import { refreshMtgCommanderEngine } from '../server/mtgCommanderEngine.mjs';

const mtgSearchDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'search');
const BASIC_NAME_BY_COLOR = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
  C: 'Wastes',
};
const COLOR_PRIORITY = ['U', 'W', 'B', 'R', 'G', 'C'];

function readJson(filePath) {
  let text = fs.readFileSync(filePath, 'utf8');
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  return JSON.parse(text);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadCardLookup() {
  const basicsByName = new Map();
  const commandersByOracleId = new Map();
  const files = fs.existsSync(mtgSearchDir)
    ? fs.readdirSync(mtgSearchDir).filter((file) => file.endsWith('.json'))
    : [];

  for (const file of files) {
    const rows = readJson(path.join(mtgSearchDir, file));
    for (const row of rows) {
      if (!row?.oracle_id || !row?.name) continue;

      const normalizedName = normalizeText(row.name);
      if (Object.values(BASIC_NAME_BY_COLOR).includes(row.name) && !basicsByName.has(row.name)) {
        basicsByName.set(row.name, {
          oracle_id: row.oracle_id,
          card_name: row.name,
        });
      }

      if (!commandersByOracleId.has(row.oracle_id)) {
        commandersByOracleId.set(row.oracle_id, {
          oracle_id: row.oracle_id,
          name: row.name,
          color_identity: Array.isArray(row.color_identity)
            ? row.color_identity.map((color) => String(color || '').toUpperCase()).filter(Boolean)
            : [],
          normalized_name: normalizedName,
        });
      }
    }
  }

  return { basicsByName, commandersByOracleId };
}

function chooseFallbackBasic(colorIdentity, existingBasics) {
  const allowedColors = (Array.isArray(colorIdentity) && colorIdentity.length
    ? colorIdentity
    : ['C']
  ).filter((color) => BASIC_NAME_BY_COLOR[color]);

  if (!allowedColors.length) {
    return null;
  }

  const rankedExisting = [...existingBasics.entries()]
    .filter(([name]) => allowedColors.includes(
      Object.entries(BASIC_NAME_BY_COLOR).find(([, basicName]) => basicName === name)?.[0] || ''
    ))
    .sort((a, b) => b[1] - a[1]);

  if (rankedExisting.length) {
    return rankedExisting[0][0];
  }

  const preferredColor = COLOR_PRIORITY.find((color) => allowedColors.includes(color)) || allowedColors[0];
  return BASIC_NAME_BY_COLOR[preferredColor] || null;
}

const candidateDecks = db.prepare(`
  SELECT deck_key, commander_oracle_id, commander_name, total_cards, validation_notes
  FROM mtg_commander_corpus_decks
  WHERE quality_status = 'invalid'
    AND unresolved_cards = 0
    AND validation_notes IN ('size:99', 'size:98')
`).all();

const deckBasicsStmt = db.prepare(`
  SELECT cards.card_name, cards.quantity
  FROM mtg_commander_corpus_cards cards
  WHERE cards.deck_key = ?
    AND cards.is_commander = 0
    AND cards.card_name IN ('Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes')
`);

const upsertCardStmt = db.prepare(`
  INSERT INTO mtg_commander_corpus_cards (
    deck_key, card_oracle_id, card_name, quantity, is_commander
  ) VALUES (
    @deck_key, @card_oracle_id, @card_name, @quantity, 0
  )
  ON CONFLICT(deck_key, card_oracle_id, is_commander) DO UPDATE SET
    quantity = mtg_commander_corpus_cards.quantity + excluded.quantity,
    card_name = COALESCE(excluded.card_name, mtg_commander_corpus_cards.card_name)
`);

const updateDeckStmt = db.prepare(`
  UPDATE mtg_commander_corpus_decks
  SET total_cards = 100,
      quality_status = 'repaired',
      validation_notes = ?
  WHERE deck_key = ?
`);

const { basicsByName, commandersByOracleId } = loadCardLookup();

const repairDeckTx = db.transaction((deck, basicName, addedCount) => {
  const basicCard = basicsByName.get(basicName);
  if (!basicCard) {
    throw new Error(`Missing basic metadata for ${basicName}`);
  }

  upsertCardStmt.run({
    deck_key: deck.deck_key,
    card_oracle_id: basicCard.oracle_id,
    card_name: basicCard.card_name,
    quantity: addedCount,
  });

  updateDeckStmt.run(
    `repaired:add_basic:${basicName}:${addedCount},from:${deck.validation_notes || 'unknown'}`,
    deck.deck_key
  );
});

let repaired = 0;
let skipped = 0;
const skippedDetails = [];

for (const deck of candidateDecks) {
  const commander = commandersByOracleId.get(deck.commander_oracle_id);
  if (!commander) {
    skipped += 1;
    skippedDetails.push({ deck_key: deck.deck_key, reason: 'missing_commander_lookup', commander_name: deck.commander_name });
    continue;
  }

  const existingBasics = new Map(
    deckBasicsStmt.all(deck.deck_key).map((row) => [row.card_name, Number(row.quantity || 0)])
  );

  const fallbackBasic = chooseFallbackBasic(commander.color_identity, existingBasics);
  if (!fallbackBasic || !basicsByName.has(fallbackBasic)) {
    skipped += 1;
    skippedDetails.push({ deck_key: deck.deck_key, reason: 'missing_basic_choice', commander_name: deck.commander_name });
    continue;
  }

  const missingCount = Math.max(0, 100 - Number(deck.total_cards || 0));
  if (missingCount < 1 || missingCount > 2) {
    skipped += 1;
    skippedDetails.push({ deck_key: deck.deck_key, reason: `unsupported_missing_count:${missingCount}`, commander_name: deck.commander_name });
    continue;
  }

  repairDeckTx(deck, fallbackBasic, missingCount);
  repaired += 1;
}

await refreshMtgCommanderEngine();

console.log(JSON.stringify({
  candidates: candidateDecks.length,
  repaired,
  skipped,
  skippedDetails: skippedDetails.slice(0, 20),
}, null, 2));
