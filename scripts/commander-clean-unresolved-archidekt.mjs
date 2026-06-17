import { db } from '../server/db.mjs';
import { ensureCommanderCorpusTables, getCommanderCorpusStatus } from '../server/mtgCommanderCorpus.mjs';

function main() {
  ensureCommanderCorpusTables();

  const before = getCommanderCorpusStatus();
  const targetRows = db.prepare(`
    SELECT COUNT(*) AS count
    FROM mtg_commander_corpus_decks
    WHERE source_name = 'archidekt'
      AND quality_status = 'invalid'
      AND unresolved_cards > 0
      AND validation_notes NOT LIKE '%,%'
      AND validation_notes LIKE 'unresolved:%'
  `).get();

  const deleteCards = db.prepare(`
    DELETE FROM mtg_commander_corpus_cards
    WHERE deck_key IN (
      SELECT deck_key
      FROM mtg_commander_corpus_decks
      WHERE source_name = 'archidekt'
        AND quality_status = 'invalid'
        AND unresolved_cards > 0
        AND validation_notes NOT LIKE '%,%'
        AND validation_notes LIKE 'unresolved:%'
    )
  `);

  const deleteDecks = db.prepare(`
    DELETE FROM mtg_commander_corpus_decks
    WHERE source_name = 'archidekt'
      AND quality_status = 'invalid'
      AND unresolved_cards > 0
      AND validation_notes NOT LIKE '%,%'
      AND validation_notes LIKE 'unresolved:%'
  `);

  const transaction = db.transaction(() => {
    deleteCards.run();
    deleteDecks.run();
  });

  transaction();

  const after = getCommanderCorpusStatus();

  console.log(JSON.stringify({
    removed_archidekt_invalid_unresolved_only: Number(targetRows?.count || 0),
    before,
    after
  }, null, 2));
}

main();
