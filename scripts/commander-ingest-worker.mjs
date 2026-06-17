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
const statusPath = path.join(ingestDir, 'status.json');
const downloadsDir = path.join(ingestDir, 'downloads');

function parseArgs(argv) {
  const args = { limit: Number.POSITIVE_INFINITY };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--limit') args.limit = Number(argv[i + 1]) || Number.POSITIVE_INFINITY;
    if (token === '--source') args.source = argv[i + 1];
  }
  return args;
}

function writeStatusFile(payload) {
  fs.mkdirSync(ingestDir, { recursive: true });
  fs.writeFileSync(statusPath, JSON.stringify(payload, null, 2));
}

async function main() {
  ensureCommanderCorpusTables();
  const args = parseArgs(process.argv.slice(2));
  const manifestEntries = loadCommanderSourceManifest(manifestPath);
  syncCommanderCorpusSources(manifestEntries);

  const statusBefore = getCommanderCorpusStatus();
  const queued = statusBefore.sources.filter((source) => {
    if (args.source && source.source_id !== args.source) return false;
    return source.status !== 'done';
  }).slice(0, Number.isFinite(args.limit) ? args.limit : undefined);

  const results = [];
  for (const source of queued) {
    try {
      const result = await processCommanderCorpusSource(source.source_id, { downloadsDir });
      results.push(result);
    } catch (error) {
      results.push({
        source_id: source.source_id,
        status: 'error',
        error: error.message
      });
    }
  }

  const finalStatus = {
    generated_at: new Date().toISOString(),
    processed_sources: results,
    corpus: getCommanderCorpusStatus()
  };
  writeStatusFile(finalStatus);

  console.log(JSON.stringify(finalStatus, null, 2));
}

main().catch((error) => {
  console.error('Commander ingest worker failed:', error);
  process.exitCode = 1;
});
