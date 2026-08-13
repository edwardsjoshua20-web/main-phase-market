import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Readable } from 'node:stream';
import zlib from 'node:zlib';
import { getGameSourceConfig, resolveConfiguredSourcePath } from './lib/source-registry.mjs';

const BULK_API_URL = getGameSourceConfig('magic', 'bulkApi')?.url || 'https://api.scryfall.com/bulk-data';
const OUTPUT_PATH = resolveConfiguredSourcePath('magic', 'catalogSource');
const OUTPUT_DIR = path.dirname(OUTPUT_PATH);

function parseArgs(argv) {
  const args = {
    type: getGameSourceConfig('magic', 'bulkApi')?.bulkType || 'all_cards'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--type') args.type = String(argv[i + 1] || args.type);
  }

  return args;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Main Phase Market MTG Source Refresh'
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Main Phase Market MTG Source Refresh'
    }
  });

  if (!response.ok) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  const fileStream = fs.createWriteStream(tempPath);
  const responseStream = Readable.fromWeb(response.body);

  await new Promise((resolve, reject) => {
    responseStream.pipe(fileStream);
    responseStream.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  fs.renameSync(tempPath, outputPath);
}

async function downloadJsonlGzipAsJsonArray(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Main Phase Market MTG Source Refresh',
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Download failed for ${url}: ${response.status} ${response.statusText}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const tempPath = `${outputPath}.tmp`;
  const output = fs.createWriteStream(tempPath);
  const gunzip = zlib.createGunzip();
  const input = Readable.fromWeb(response.body).pipe(gunzip);
  const lines = readline.createInterface({
    input,
    crlfDelay: Infinity
  });

  let count = 0;
  output.write('[\n');

  for await (const line of lines) {
    const trimmed = String(line || '').trim();
    if (!trimmed) continue;
    if (count > 0) output.write(',\n');
    output.write(trimmed);
    count += 1;
  }

  output.write('\n]\n');

  await new Promise((resolve, reject) => {
    output.end(resolve);
    output.on('error', reject);
    gunzip.on('error', reject);
  });

  if (count === 0) {
    fs.rmSync(tempPath, { force: true });
    throw new Error(`Scryfall JSONL feed was empty: ${url}`);
  }

  fs.renameSync(tempPath, outputPath);
  return count;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await fetchJson(BULK_API_URL);
  const bulkEntry = Array.isArray(payload?.data)
    ? payload.data.find((entry) => entry.type === args.type)
    : null;

  const downloadUri = bulkEntry?.download_uri || bulkEntry?.jsonl_download_uri || null;
  if (!downloadUri) {
    throw new Error(`Could not find Scryfall bulk type: ${args.type}`);
  }

  const convertedRows = bulkEntry.jsonl_download_uri && !bulkEntry.download_uri
    ? await downloadJsonlGzipAsJsonArray(downloadUri, OUTPUT_PATH)
    : null;

  if (convertedRows == null) {
    await downloadFile(downloadUri, OUTPUT_PATH);
  }

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(JSON.stringify({
    type: args.type,
    updated_at: bulkEntry.updated_at || null,
    download_uri: downloadUri,
    output_path: OUTPUT_PATH,
    bytes: stats.size,
    converted_rows: convertedRows
  }, null, 2));
}

main().catch((error) => {
  console.error('MTG source refresh failed:', error);
  process.exitCode = 1;
});
