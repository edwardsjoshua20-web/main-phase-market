import fs from 'node:fs';
import path from 'node:path';
import {
  ensureCommanderCorpusTables,
  getCommanderCorpusStatus,
  loadCommanderSourceManifest,
  processCommanderCorpusSource,
  syncCommanderCorpusSources
} from '../server/mtgCommanderCorpus.mjs';

const repoRoot = process.cwd();
const ingestDir = path.join(repoRoot, 'tmp', 'commander-ingest');
const manifestPath = path.join(ingestDir, 'sources.json');
const statusPath = path.join(ingestDir, 'daemon-status.json');
const downloadsDir = path.join(ingestDir, 'downloads');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv) {
  const args = {
    pollMs: 30000,
    batchSize: 3
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--poll-ms') args.pollMs = Math.max(5000, Number(argv[i + 1]) || args.pollMs);
    if (token === '--batch-size') args.batchSize = Math.max(1, Number(argv[i + 1]) || args.batchSize);
  }

  return args;
}

function writeStatus(payload) {
  fs.mkdirSync(ingestDir, { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

async function tick(args) {
  const manifestEntries = loadCommanderSourceManifest(manifestPath);
  syncCommanderCorpusSources(manifestEntries);
  const statusBefore = getCommanderCorpusStatus();
  const queued = statusBefore.sources
    .filter((source) => source.status !== 'done' && source.status !== 'running')
    .slice(0, args.batchSize);

  const processed = [];
  for (const source of queued) {
    try {
      processed.push(await processCommanderCorpusSource(source.source_id, { downloadsDir }));
    } catch (error) {
      processed.push({
        source_id: source.source_id,
        status: 'error',
        error: error.message
      });
    }
  }

  writeStatus({
    generated_at: new Date().toISOString(),
    poll_ms: args.pollMs,
    processed,
    corpus: getCommanderCorpusStatus()
  });
}

async function main() {
  ensureCommanderCorpusTables();
  const args = parseArgs(process.argv.slice(2));

  while (true) {
    await tick(args);
    await sleep(args.pollMs);
  }
}

main().catch((error) => {
  console.error('Commander ingest daemon failed:', error);
  process.exitCode = 1;
});
