import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const MTG_ROOT = path.join(PROJECT_ROOT, 'public', 'data', 'mtg');
const SEARCH_ROOT = path.join(MTG_ROOT, 'search');
const OUTPUT_ROOT = path.join(MTG_ROOT, 'printing-index');
const MANIFEST_PATH = path.join(MTG_ROOT, 'manifest.json');
const OUTPUT_MANIFEST_PATH = path.join(MTG_ROOT, 'printing-index-manifest.json');

const PRINTING_FIELDS = [
  'id',
  'oracle_id',
  'name',
  'lang',
  'released_at',
  'set_code',
  'set_name',
  'collector_number',
  'rarity',
  'image_normal',
  'usd',
  'usd_foil',
  'usd_etched',
  'finishes',
  'highres_image'
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function shardForOracleId(oracleId) {
  const prefix = String(oracleId || '').replace(/[^a-f0-9]/gi, '').slice(0, 2).toLowerCase();
  return /^[a-f0-9]{2}$/.test(prefix) ? prefix : 'other';
}

function compactPrinting(row = {}) {
  return [
    row.id || null,
    row.oracle_id || null,
    row.name || null,
    row.lang || null,
    row.released_at || null,
    row.set_code || null,
    row.set_name || null,
    row.collector_number || null,
    row.rarity || null,
    row.image_normal || row.image_small || null,
    row.prices?.usd ?? null,
    row.prices?.usd_foil ?? null,
    row.prices?.usd_etched ?? null,
    Array.isArray(row.finishes) ? row.finishes : [],
    Boolean(row.highres_image)
  ];
}

function main() {
  const catalogManifest = readJson(MANIFEST_PATH);
  const shards = new Map();
  let printingCount = 0;

  for (const bucketInfo of Object.values(catalogManifest.buckets || {})) {
    if (!bucketInfo?.file) continue;
    const rows = readJson(path.join(MTG_ROOT, bucketInfo.file));

    for (const row of rows) {
      if (!row?.id || !row?.name) continue;
      const shard = shardForOracleId(row.oracle_id);
      if (!shards.has(shard)) shards.set(shard, []);
      shards.get(shard).push(compactPrinting(row));
      printingCount += 1;
    }
  }

  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  const manifest = {
    generated_at: new Date().toISOString(),
    source_manifest_generated_at: catalogManifest.generated_at || null,
    printing_count: printingCount,
    fields: PRINTING_FIELDS,
    shards: {}
  };

  for (const [shard, rows] of [...shards.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    rows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[4]).localeCompare(String(b[4])));
    const file = `printing-index/${shard}.json`;
    writeJson(path.join(MTG_ROOT, file), rows);
    manifest.shards[shard] = { file, count: rows.length };
  }

  writeJson(OUTPUT_MANIFEST_PATH, manifest);
  console.log(`MTG printing index complete: ${printingCount} printings across ${shards.size} shards.`);
}

main();
