import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const MTG_ROOT = path.join(PROJECT_ROOT, 'public', 'data', 'mtg');
const SEARCH_ROOT = path.join(MTG_ROOT, 'search');
const SHARD_ROOT = path.join(MTG_ROOT, 'search-shards');
const MANIFEST_PATH = path.join(MTG_ROOT, 'manifest.json');
const MAX_CARDS_PER_SHARD = 5000;

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function chunkRows(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const buckets = manifest.buckets || {};

  fs.rmSync(SHARD_ROOT, { recursive: true, force: true });
  fs.mkdirSync(SHARD_ROOT, { recursive: true });

  for (const [bucketName, bucketInfo] of Object.entries(buckets)) {
    const sourceFile = bucketInfo.file;
    if (!sourceFile) {
      continue;
    }

    const sourcePath = path.join(MTG_ROOT, sourceFile);
    const rows = readJson(sourcePath);
    const chunks = chunkRows(rows, MAX_CARDS_PER_SHARD);
    const files = [];

    chunks.forEach((chunk, index) => {
      const shardFile = `search-shards/${bucketName}-${String(index + 1).padStart(2, '0')}.json`;
      writeJson(path.join(MTG_ROOT, shardFile), chunk);
      files.push(shardFile);
    });

    buckets[bucketName] = {
      ...bucketInfo,
      files
    };

    console.log(`${bucketName}: ${rows.length} cards -> ${files.length} shard(s)`);
  }

  manifest.generated_at = new Date().toISOString();
  manifest.buckets = buckets;
  writeJson(MANIFEST_PATH, manifest);
}

main();
