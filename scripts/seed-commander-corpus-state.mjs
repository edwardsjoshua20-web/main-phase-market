import path from 'node:path';
import { getDbPath } from '../server/db.mjs';
import {
  exportCommanderCorpusState,
  uploadCommanderCorpusState
} from './lib/commander-corpus-state.mjs';

const outputPath = path.join(process.cwd(), 'tmp', 'commander-state-seed', 'commander-corpus.db');
const exported = exportCommanderCorpusState(getDbPath(), outputPath);
const uploaded = await uploadCommanderCorpusState(outputPath);

console.log(JSON.stringify({ status: 'PASS', exported, uploaded }, null, 2));
