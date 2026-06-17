import {
  ensureCommanderCorpusTables,
  getCommanderCorpusStatus,
  loadCommanderSourceManifest,
  syncCommanderCorpusSources
} from '../server/mtgCommanderCorpus.mjs';
import path from 'node:path';

ensureCommanderCorpusTables();
const manifestPath = path.join(process.cwd(), 'tmp', 'commander-ingest', 'sources.json');
syncCommanderCorpusSources(loadCommanderSourceManifest(manifestPath));
console.log(JSON.stringify(getCommanderCorpusStatus(), null, 2));
