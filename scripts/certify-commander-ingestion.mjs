import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mpm-commander-cert-'));
const dbPath = path.join(tempDir, 'certification.db');
process.env.MPM_DB_PATH = dbPath;
process.env.MPM_DISABLE_COMMANDER_PREWARM = '1';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SOURCE = {
  source_id: 'cert-archidekt-5418845',
  source_type: 'fixture',
  source_name: 'archidekt',
  source_deck_id: '5418845',
  source_url: 'https://archidekt.com/decks/5418845',
  location: 'fixture://archidekt/5418845',
  label: 'Archidekt 5418845 ingestion fixture'
};
const DUPLICATE_SOURCE = {
  ...SOURCE,
  source_id: 'cert-archidekt-duplicate-5418845',
  source_deck_id: '95418845',
  source_url: 'https://archidekt.com/decks/95418845',
  location: 'fixture://archidekt/95418845',
  label: 'Independent source observation with identical contents'
};
const INVALID_SOURCE = {
  ...SOURCE,
  source_id: 'cert-archidekt-invalid-leader',
  source_deck_id: 'invalid-leader',
  source_url: 'https://archidekt.com/decks/invalid-leader',
  location: 'fixture://archidekt/invalid-leader',
  label: 'Invalid non-Commander leader fixture'
};
const OBEKA = ['21b76a94-d9f3-4c34-ab24-7e89321b04f0', 1, 'Obeka, Brute Chronologist'];
const SWAMP = ['56719f6a-1a6c-4c0a-8d21-18f7d7350b68', 97, 'Swamp'];
const ARCANE_SIGNET = ['0bc7f093-bef0-4f1a-852c-4b75ebf54838', 1, 'Arcane Signet'];
const SOL_RING = ['6ad8011d-3471-4369-9d68-b264cc027487', 1, 'Sol Ring'];
const COMMAND_TOWER = ['0895c9b7-ae7d-4bb3-af17-3b75deb50a25', 1, 'Command Tower'];

function fixture(source, cards, commander = OBEKA) {
  return {
    decks: [{
      source_name: 'archidekt',
      source_deck_id: source.source_deck_id,
      url: source.source_url,
      name: 'Obeka fixture from current Archidekt source 5418845',
      format: 'Commander',
      theorycrafted: false,
      commanders: [commander],
      cards
    }]
  };
}

try {
  const { db } = await import('../server/db.mjs');
  const {
    importCommanderDeckPayload,
    retireCommanderSourceDecks
  } = await import('../server/mtgCommanderCorpus.mjs');
  const {
    getMtgCommanderPublicSnapshot,
    refreshMtgCommanderEngine
  } = await import('../server/mtgCommanderEngine.mjs');

  const initialPayload = fixture(SOURCE, [SWAMP, ARCANE_SIGNET, SOL_RING]);
  const first = importCommanderDeckPayload(SOURCE, initialPayload);
  assert(first.importedDecks === 1, 'First import was not accepted.');
  assert(first.decks.length === 1, 'First import did not create exactly one source deck.');
  const firstDeck = first.decks[0];
  assert(firstDeck.commander_oracle_id === OBEKA[0], 'Commander did not resolve canonically.');
  assert(firstDeck.quality_status === 'valid' && firstDeck.lifecycle_status === 'active', 'Valid deck was not active.');
  assert(firstDeck.total_cards === 100 && firstDeck.unresolved_cards === 0, 'Card normalization totals are incorrect.');
  const firstCards = db.prepare('SELECT card_name, quantity, is_commander FROM mtg_commander_corpus_cards WHERE deck_key = ?').all(firstDeck.deck_key);
  assert(firstCards.reduce((sum, row) => sum + Number(row.quantity || 0), 0) === 100, 'Stored card quantities do not total 100.');

  const repeated = importCommanderDeckPayload(SOURCE, initialPayload);
  assert(repeated.decks.length === 1, 'Idempotent re-import duplicated the source deck.');
  assert(repeated.decks[0].deck_key === firstDeck.deck_key, 'Idempotent re-import changed canonical deck identity.');
  assert(repeated.decks[0].content_hash === firstDeck.content_hash, 'Unchanged re-import changed revision hash.');

  const duplicate = importCommanderDeckPayload(DUPLICATE_SOURCE, fixture(DUPLICATE_SOURCE, [SWAMP, ARCANE_SIGNET, SOL_RING]));
  assert(duplicate.decks.length === 1, 'Independent duplicate observation was not retained.');
  assert(duplicate.decks[0].deck_key !== firstDeck.deck_key, 'Independent source observations collapsed into one source row.');
  assert(duplicate.decks[0].content_fingerprint === firstDeck.content_fingerprint, 'Exact deck configurations received different content fingerprints.');
  const duplicateWeights = db.prepare(`
    SELECT COUNT(*) observation_count, SUM(chemistry_weight) chemistry_weight
    FROM mtg_commander_corpus_decks
    WHERE content_fingerprint = ? AND lifecycle_status = 'active' AND quality_status = 'valid'
  `).get(firstDeck.content_fingerprint);
  assert(duplicateWeights.observation_count === 2, 'Exact duplicate source observations were not both retained.');
  assert(duplicateWeights.chemistry_weight === 1, 'Exact duplicate configurations contributed more than one chemistry sample.');

  const changed = importCommanderDeckPayload(SOURCE, fixture(SOURCE, [SWAMP, ARCANE_SIGNET, COMMAND_TOWER]));
  assert(changed.decks.length === 1, 'Changed source deck created a duplicate row.');
  assert(changed.decks[0].deck_key === firstDeck.deck_key, 'Changed source deck did not update canonical source identity.');
  assert(changed.decks[0].content_hash !== firstDeck.content_hash, 'Changed source deck did not update revision hash.');
  assert(changed.decks[0].content_fingerprint !== firstDeck.content_fingerprint, 'A one-card deck change did not create a distinct content fingerprint.');
  const changedCards = db.prepare('SELECT card_oracle_id FROM mtg_commander_corpus_cards WHERE deck_key = ?').all(firstDeck.deck_key);
  assert(changedCards.some((row) => row.card_oracle_id === COMMAND_TOWER[0]), 'Changed source card was not stored.');
  assert(!changedCards.some((row) => row.card_oracle_id === SOL_RING[0]), 'Replaced source card remained in the canonical deck.');

  const invalid = importCommanderDeckPayload(INVALID_SOURCE, fixture(INVALID_SOURCE, [SWAMP, ARCANE_SIGNET, SOL_RING], ARCANE_SIGNET));
  assert(invalid.importedDecks === 0, 'Non-Commander leader was accepted.');
  assert(invalid.decks[0]?.quality_status === 'invalid' && invalid.decks[0]?.lifecycle_status === 'quarantined', 'Invalid leader was not quarantined.');

  await refreshMtgCommanderEngine();
  const activeSnapshot = getMtgCommanderPublicSnapshot();
  assert(activeSnapshot.activeDeckCount === 2, 'Aggregate did not retain both active source observations.');
  assert(activeSnapshot.uniqueConfigurationCount === 2, 'One-card-different decks did not remain distinct chemistry configurations.');
  assert(activeSnapshot.indexDeckTotal === 2, 'Commander index and active source observations disagree.');
  assert(activeSnapshot.details.get(OBEKA[0])?.total_decks === 2, 'Commander detail source-observation denominator disagrees with corpus.');
  assert(activeSnapshot.details.get(OBEKA[0])?.unique_configuration_count === 2, 'Commander detail chemistry denominator disagrees with corpus.');

  assert(retireCommanderSourceDecks(SOURCE.source_id, 'fixture_retired') === 1, 'Retirement did not affect one source deck.');
  const retired = db.prepare('SELECT * FROM mtg_commander_corpus_decks WHERE deck_key = ?').get(firstDeck.deck_key);
  assert(retired?.lifecycle_status === 'retired', 'Retired source deck remained active.');
  assert(db.prepare('SELECT COUNT(*) count FROM mtg_commander_corpus_decks').get().count === 3, 'Retirement deleted source or quarantine audit evidence.');

  await refreshMtgCommanderEngine();
  const retiredSnapshot = getMtgCommanderPublicSnapshot();
  assert(retiredSnapshot.activeDeckCount === 1 && retiredSnapshot.indexDeckTotal === 1, 'Retired or quarantined decks contributed to aggregates.');
  assert(retiredSnapshot.uniqueConfigurationCount === 1, 'Remaining exact configuration did not retain one chemistry representative.');

  console.log(JSON.stringify({
    certification: 'PASS',
    fixture_source: SOURCE.source_url,
    first_import: 'valid_active',
    canonical_commander: OBEKA[2],
    normalized_card_total: 100,
    idempotent_reimport: true,
    exact_duplicate_observations_retained: 2,
    exact_duplicate_chemistry_weight: 1,
    one_card_difference_is_distinct: true,
    changed_source_updates_same_record: true,
    invalid_leader_quarantined: true,
    retired_row_preserved_and_excluded: true,
    aggregate_consistency: true
  }, null, 2));
  db.close();
} finally {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (error) {
    if (error?.code !== 'EPERM') throw error;
  }
}
