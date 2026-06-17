import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

const BULK_API_URL = 'https://api.scryfall.com/bulk-data';
const OUTPUT_DIR = path.resolve(process.cwd(), 'server/data/mtg/source');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'all_cards-latest.json');

function parseArgs(argv) {
  const args = {
    type: 'all_cards'
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const payload = await fetchJson(BULK_API_URL);
  const bulkEntry = Array.isArray(payload?.data)
    ? payload.data.find((entry) => entry.type === args.type)
    : null;

  if (!bulkEntry?.download_uri) {
    throw new Error(`Could not find Scryfall bulk type: ${args.type}`);
  }

  await downloadFile(bulkEntry.download_uri, OUTPUT_PATH);

  const stats = fs.statSync(OUTPUT_PATH);
  console.log(JSON.stringify({
    type: args.type,
    updated_at: bulkEntry.updated_at || null,
    download_uri: bulkEntry.download_uri,
    output_path: OUTPUT_PATH,
    bytes: stats.size
  }, null, 2));
}

main().catch((error) => {
  console.error('MTG source refresh failed:', error);
  process.exitCode = 1;
});
