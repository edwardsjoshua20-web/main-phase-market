import fs from 'node:fs';
import path from 'node:path';

let db;
let classifyCommanderRejectionReason;
let ensureCommanderCorpusTables;
let processCommanderCorpusSource;
let revalidateStoredCommanderDecks;
let getMtgCommanderPublicSnapshot;
let refreshMtgCommanderEngine;

function parseArgs(argv) {
  const args = { apply: false, concurrency: 6, delay: 0, limit: Number.POSITIVE_INFINITY, retryErrors: false };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') args.apply = true;
    if (argv[index] === '--concurrency') args.concurrency = Math.max(1, Number(argv[index + 1]) || 6);
    if (argv[index] === '--limit') args.limit = Math.max(1, Number(argv[index + 1]) || 1);
    if (argv[index] === '--delay') args.delay = Math.max(0, Number(argv[index + 1]) || 0);
    if (argv[index] === '--retry-errors') args.retryErrors = true;
    if (argv[index] === '--baseline-backup') args.baselineBackup = argv[index + 1];
  }
  return args;
}

function corpusCounts() {
  return db.prepare(`
    SELECT
      COUNT(*) stored,
      SUM(CASE WHEN lifecycle_status = 'active' AND quality_status = 'valid' THEN 1 ELSE 0 END) active,
      SUM(CASE WHEN lifecycle_status = 'quarantined' THEN 1 ELSE 0 END) quarantined,
      SUM(CASE WHEN lifecycle_status = 'retired' THEN 1 ELSE 0 END) retired
    FROM mtg_commander_corpus_decks
  `).get();
}

function rejectionCounts() {
  return db.prepare(`
    SELECT COALESCE(rejection_reason, 'other') reason, COUNT(*) count
    FROM mtg_commander_corpus_decks
    WHERE lifecycle_status = 'quarantined'
    GROUP BY COALESCE(rejection_reason, 'other')
    ORDER BY count DESC, reason ASC
  `).all();
}

function writeReports(report) {
  const outputDir = path.join(process.cwd(), 'tmp', 'commander-ingest');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'revalidation-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  const reasons = report.remaining_rejection_reasons
    .map((row) => `| ${row.reason} | ${row.count} |`)
    .join('\n');
  fs.writeFileSync(path.join(outputDir, 'revalidation-report.md'), `# Commander Corpus Revalidation\n\n` +
    `Generated: ${report.generated_at}\n\n` +
    `| State | Before | After |\n|---|---:|---:|\n` +
    `| Stored | ${report.before.stored} | ${report.after.stored} |\n` +
    `| Active | ${report.before.active} | ${report.after.active} |\n` +
    `| Quarantined | ${report.before.quarantined} | ${report.after.quarantined} |\n` +
    `| Retired | ${report.before.retired} | ${report.after.retired} |\n\n` +
    `Recovered: ${report.recovered}\n\n` +
    `## Remaining Rejection Reasons\n\n| Reason | Count |\n|---|---:|\n${reasons}\n`);
}

async function processWithRetry(sourceId, delay) {
  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await processCommanderCorpusSource(sourceId);
    } catch (error) {
      lastError = error;
      const isRateLimited = /429 Too Many Requests/i.test(String(error?.message || error));
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, isRateLimited ? attempt * 5000 : attempt * 750));
      }
    }
  }
  throw lastError;
}

async function runPool(sourceIds, concurrency, delay) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < sourceIds.length) {
      const sourceId = sourceIds[cursor];
      cursor += 1;
      try {
        results.push(await processWithRetry(sourceId, delay));
      } catch (error) {
        results.push({ source_id: sourceId, status: 'error', error: String(error?.message || error) });
      }
      if (results.length % 100 === 0) {
        console.log(`Revalidated ${results.length}/${sourceIds.length} existing sources.`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, sourceIds.length) }, worker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  process.env.MPM_DISABLE_COMMANDER_PREWARM = '1';
  const priorReportPath = path.join(process.cwd(), 'tmp', 'commander-ingest', 'revalidation-report.json');
  const priorReport = args.retryErrors && fs.existsSync(priorReportPath)
    ? JSON.parse(fs.readFileSync(priorReportPath, 'utf8'))
    : null;
  const databasePath = path.resolve(process.env.MPM_DB_PATH || path.join('server', 'data', 'main-phase-market.db'));
  let backupPath = null;
  if (args.apply) {
    const backupDir = path.join(process.cwd(), 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    backupPath = path.join(backupDir, `commander-corpus-before-revalidation-${Date.now()}.db`);
    fs.copyFileSync(databasePath, backupPath);
  }

  ({ db } = await import('../server/db.mjs'));
  ({
    classifyCommanderRejectionReason,
    ensureCommanderCorpusTables,
    processCommanderCorpusSource,
    revalidateStoredCommanderDecks
  } = await import('../server/mtgCommanderCorpus.mjs'));
  ({
    getMtgCommanderPublicSnapshot,
    refreshMtgCommanderEngine
  } = await import('../server/mtgCommanderEngine.mjs'));
  ensureCommanderCorpusTables();
  const before = corpusCounts();
  const retainedValidation = revalidateStoredCommanderDecks();
  const quarantinedRows = db.prepare(`
    SELECT d.deck_key, d.source_id, d.validation_notes, s.source_type, s.status source_status
    FROM mtg_commander_corpus_decks d
    INNER JOIN mtg_commander_corpus_sources s ON s.source_id = d.source_id
    WHERE d.lifecycle_status = 'quarantined'
    ORDER BY d.imported_at ASC, d.deck_key ASC
  `).all();

  const normalizeReasons = db.transaction((rows) => {
    const update = db.prepare('UPDATE mtg_commander_corpus_decks SET rejection_reason = ? WHERE deck_key = ?');
    for (const row of rows) update.run(classifyCommanderRejectionReason(row.validation_notes) || 'other', row.deck_key);
  });
  normalizeReasons(quarantinedRows);

  const replayableTypes = new Set(['archidekt_deck', 'moxfield_deck', 'url', 'file']);
  const sourceIds = [...new Set(
    quarantinedRows
      .filter((row) => replayableTypes.has(row.source_type))
      .filter((row) => !args.retryErrors || row.source_status === 'error')
      .map((row) => row.source_id)
  )].slice(0, Number.isFinite(args.limit) ? args.limit : undefined);
  const unreplayableDecks = quarantinedRows.filter((row) => !replayableTypes.has(row.source_type));

  if (!args.apply) {
    const preview = {
      mode: 'dry-run',
      before,
      retained_validation: retainedValidation,
      quarantined_rows: quarantinedRows.length,
      replayable_sources: sourceIds.length,
      unreplayable_rows: unreplayableDecks.length,
      rejection_reasons: rejectionCounts()
    };
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  const replayResults = await runPool(sourceIds, args.concurrency, args.delay);
  if (unreplayableDecks.length > 0) {
    const markUnavailable = db.prepare(`
      UPDATE mtg_commander_corpus_decks
      SET rejection_reason = 'source_payload_unavailable', last_validated_at = ?
      WHERE deck_key = ? AND lifecycle_status = 'quarantined'
    `);
    const tx = db.transaction((rows) => {
      const timestamp = new Date().toISOString();
      for (const row of rows) markUnavailable.run(timestamp, row.deck_key);
    });
    tx(unreplayableDecks);
  }

  await refreshMtgCommanderEngine();
  const snapshot = getMtgCommanderPublicSnapshot();
  const after = corpusCounts();
  const initialKeys = new Set(quarantinedRows.map((row) => row.deck_key));
  let recovered = Number(db.prepare(`
    SELECT COUNT(*) count
    FROM mtg_commander_corpus_decks
    WHERE lifecycle_status = 'active'
      AND quality_status = 'valid'
      AND deck_key IN (${[...initialKeys].map(() => '?').join(',') || "''"})
  `).get(...initialKeys).count || 0);
  const baselineBackupPath = args.baselineBackup
    || priorReport?.baseline_backup_path
    || priorReport?.backup_path
    || backupPath;
  if (baselineBackupPath && fs.existsSync(baselineBackupPath)) {
    db.prepare('ATTACH DATABASE ? AS baseline_corpus').run(baselineBackupPath);
    try {
      recovered = Number(db.prepare(`
        SELECT COUNT(*) count
        FROM mtg_commander_corpus_decks current
        INNER JOIN baseline_corpus.mtg_commander_corpus_decks baseline
          ON baseline.deck_key = current.deck_key
        WHERE baseline.quality_status = 'invalid'
          AND current.lifecycle_status = 'active'
          AND current.quality_status = 'valid'
      `).get().count || 0);
    } finally {
      db.exec('DETACH DATABASE baseline_corpus');
    }
  }
  const failures = replayResults.filter((row) => row.status === 'error');
  const report = {
    generated_at: new Date().toISOString(),
    backup_path: backupPath,
    baseline_backup_path: baselineBackupPath,
    before: priorReport?.before || before,
    phase_before: priorReport ? before : null,
    after,
    retained_validation: priorReport?.retained_validation || retainedValidation,
    recovered,
    replayed_sources: replayResults.length,
    replay_failures: failures,
    unreplayable_rows: unreplayableDecks.length,
    remaining_rejection_reasons: rejectionCounts(),
    aggregate_consistency: {
      dataset_version: snapshot.datasetVersion,
      active_decks: snapshot.activeDeckCount,
      index_deck_total: snapshot.indexDeckTotal,
      positive_commanders: snapshot.positiveCommanderCount,
      consistent: snapshot.activeDeckCount === snapshot.indexDeckTotal
    },
    status: failures.length === 0 && snapshot.activeDeckCount === snapshot.indexDeckTotal ? 'PASS' : 'FAIL'
  };
  writeReports(report);
  console.log(JSON.stringify({
    ...report,
    replay_failures: {
      count: failures.length,
      sample: failures.slice(0, 20)
    }
  }, null, 2));
  if (report.status !== 'PASS') process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
