import { db } from '../server/db.mjs';

function startsWithDeckUrl(location) {
  return String(location || '').startsWith('https://archidekt.com/decks/');
}

function cleanQueue() {
  const queued = db.prepare(`
    SELECT source_id, location
    FROM mtg_commander_corpus_sources
    WHERE status = 'queued' AND source_name = 'archidekt'
  `).all();

  const deleteIds = new Set();
  const seenLocations = new Set();

  for (const row of queued) {
    const location = String(row.location || '').trim();
    if (!row.source_id || !location || !startsWithDeckUrl(location)) {
      deleteIds.add(row.source_id);
      continue;
    }
    if (seenLocations.has(location)) {
      deleteIds.add(row.source_id);
      continue;
    }
    seenLocations.add(location);
  }

  const duplicateProcessed = db.prepare(`
    SELECT q.source_id
    FROM mtg_commander_corpus_sources q
    WHERE q.status = 'queued'
      AND q.source_name = 'archidekt'
      AND EXISTS (
        SELECT 1 FROM mtg_commander_corpus_sources s
        WHERE s.location = q.location
          AND s.status <> 'queued'
      )
  `).all();

  for (const row of duplicateProcessed) {
    deleteIds.add(row.source_id);
  }

  const deleteList = [...deleteIds].filter(Boolean);
  if (deleteList.length === 0) {
    return { deleted: 0, queuedBefore: queued.length };
  }

  const deleteStmt = db.prepare(`DELETE FROM mtg_commander_corpus_sources WHERE source_id = ?`);
  const tx = db.transaction((ids) => {
    for (const id of ids) deleteStmt.run(id);
  });
  tx(deleteList);

  return { deleted: deleteList.length, queuedBefore: queued.length };
}

function purgeQueue() {
  const result = db.prepare(`
    DELETE FROM mtg_commander_corpus_sources
    WHERE status = 'queued' AND source_name = 'archidekt'
  `).run();
  return { deleted: Number(result.changes || 0) };
}

const mode = process.argv.includes('--purge') ? 'purge' : 'clean';
if (mode === 'purge') {
  const result = purgeQueue();
  console.log(`[queue-purge] deleted=${result.deleted}`);
} else {
  const result = cleanQueue();
  console.log(`[queue-clean] queued_before=${result.queuedBefore} deleted=${result.deleted}`);
}
