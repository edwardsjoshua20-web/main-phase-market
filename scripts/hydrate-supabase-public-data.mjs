import fs from 'node:fs';
import path from 'node:path';
import { readSupabaseUploadConfig, toObjectKey, toStorageBaseUrl } from './lib/supabase-public-data-upload.mjs';

const GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];
const SITE_FILES = [
  'data/site/upcoming-releases.json',
  'data/site/system-health.json',
  'data/site/automation-runs.json',
  'data/site/pricing-snapshot.json'
];
const GAME_FILES = GAMES.flatMap((game) => [
  `data/${game}/cards.json`,
  `data/${game}/cards-manifest.json`,
  `data/${game}/manifest.json`,
  `data/${game}/sets.json`,
  `data/${game}/mirror-manifest.json`
]);

function writeFile(projectRoot, relativePath, buffer) {
  const targetPath = path.join(projectRoot, 'public', relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, buffer);
}

async function downloadIfPresent({ storageBaseUrl, serviceRoleKey, relativePath, projectRoot }) {
  const response = await fetch(`${storageBaseUrl}/${toObjectKey(relativePath)}`, {
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey
    }
  });

  if (!response.ok) {
    const detail = await response.text();
    const missingObject = response.status === 404
      || (response.status === 400 && /object not found|not_found/i.test(detail));
    if (missingObject) {
      return { relativePath, status: 'missing' };
    }
    throw new Error(`Storage download failed for ${relativePath}: ${response.status} ${detail}`);
  }

  const content = Buffer.from(await response.arrayBuffer());
  writeFile(projectRoot, relativePath, content);
  return { relativePath, status: 'downloaded', bytes: content.length };
}

async function listPricingSourceFiles({ supabaseUrl, bucketName, serviceRoleKey }) {
  const endpoint = `${String(supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/list/${encodeURIComponent(bucketName)}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      prefix: 'data/site/pricing-sources',
      limit: 1000,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    })
  });

  if (!response.ok) {
    throw new Error(`Could not list pricing-source objects: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  return Array.isArray(rows)
    ? rows
      .filter((entry) => String(entry?.name || '').endsWith('.json'))
      .map((entry) => `data/site/pricing-sources/${entry.name}`)
    : [];
}

async function main() {
  const projectRoot = process.cwd();
  const config = readSupabaseUploadConfig(projectRoot);

  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to hydrate public data.');
  }

  const pricingFiles = await listPricingSourceFiles(config);
  const requestedPaths = [...new Set([...SITE_FILES, ...GAME_FILES, ...pricingFiles])];
  const storageBaseUrl = toStorageBaseUrl(config.supabaseUrl, config.bucketName);
  const results = [];

  for (const relativePath of requestedPaths) {
    results.push(await downloadIfPresent({
      storageBaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      relativePath,
      projectRoot
    }));
  }

  const downloaded = results.filter((result) => result.status === 'downloaded');
  const missing = results.filter((result) => result.status === 'missing');
  console.log(JSON.stringify({
    status: 'ok',
    bucket: config.bucketName,
    downloaded: downloaded.length,
    missing: missing.length,
    bytes: downloaded.reduce((total, result) => total + Number(result.bytes || 0), 0),
    requestedPaths
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
