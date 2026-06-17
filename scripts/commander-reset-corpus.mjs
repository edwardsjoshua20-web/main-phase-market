import { db } from '../server/db.mjs';
import { ensureCommanderCorpusTables, getCommanderCorpusStatus } from '../server/mtgCommanderCorpus.mjs';

function nowIso() {
  return new Date().toISOString();
}

function printStatus(label, payload) {
  console.log(`\n${label}`);
  console.log(JSON.stringify(payload, null, 2));
}

function main() {
  ensureCommanderCorpusTables();

  const before = getCommanderCorpusStatus();
  printStatus('Before reset', before);

  const tx = db.transaction(() => {
    db.exec(`
      DELETE FROM mtg_commander_card_stats;
      DELETE FROM mtg_commander_index;
      DELETE FROM mtg_commander_corpus_cards;
      DELETE FROM mtg_commander_corpus_decks;
    `);

    db.prepare(`
      UPDATE mtg_commander_corpus_sources
      SET
        status = 'queued',
        downloaded_path = NULL,
        total_decks = 0,
        imported_decks = 0,
        last_error = NULL,
        updated_at = ?,
        last_started_at = NULL,
        last_finished_at = NULL
    `).run(nowIso());

    db.prepare(`
      DELETE FROM mtg_commander_meta
      WHERE key IN (
        'mtg_commander_index_version',
        'mtg_commander_index_row_count',
        'mtg_commander_stats_row_count'
      )
    `).run();
  });

  tx();

  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch {}

  const after = getCommanderCorpusStatus();
  printStatus('After reset', after);
}

main();
