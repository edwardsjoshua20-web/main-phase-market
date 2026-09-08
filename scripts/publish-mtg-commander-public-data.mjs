import fs from 'node:fs';
import path from 'node:path';
import {
  readSupabaseUploadConfig,
  uploadPublicDataSelection
} from './lib/supabase-public-data-upload.mjs';

const DETAIL_PREFIX = 'data/mtg/commander-details';

async function listRemoteDetails(config) {
  const endpoint = `${String(config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/list/${encodeURIComponent(config.bucketName)}`;
  const names = [];
  let offset = 0;
  while (true) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prefix: DETAIL_PREFIX,
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })
    });
    if (!response.ok) throw new Error(`Could not list Commander detail objects: ${response.status} ${await response.text()}`);
    const rows = await response.json();
    const page = Array.isArray(rows) ? rows.filter((row) => String(row?.name || '').endsWith('.json')) : [];
    names.push(...page.map((row) => row.name));
    if (!Array.isArray(rows) || rows.length < 1000) break;
    offset += rows.length;
  }
  return names;
}

async function removeRemoteDetails(config, names) {
  const endpoint = `${String(config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(config.bucketName)}`;
  for (let index = 0; index < names.length; index += 100) {
    const prefixes = names.slice(index, index + 100).map((name) => `${DETAIL_PREFIX}/${name}`);
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${config.serviceRoleKey}`,
        apikey: config.serviceRoleKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ prefixes })
    });
    if (!response.ok) throw new Error(`Could not remove stale Commander details: ${response.status} ${await response.text()}`);
  }
}

async function readRemoteJson(config, objectPath) {
  const endpoint = `${String(config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/${encodeURIComponent(config.bucketName)}/${objectPath.split('/').map(encodeURIComponent).join('/')}`;
  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${config.serviceRoleKey}`,
      apikey: config.serviceRoleKey
    }
  });
  if (!response.ok) throw new Error(`Could not verify hosted ${objectPath}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function main() {
  const projectRoot = process.cwd();
  const config = readSupabaseUploadConfig(projectRoot);
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Supabase public-data credentials are required.');

  const detailsDir = path.join(projectRoot, 'public', ...DETAIL_PREFIX.split('/'));
  const localNames = fs.readdirSync(detailsDir).filter((name) => name.endsWith('.json')).sort();
  const manifest = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public', 'data', 'mtg', 'commander-manifest.json'), 'utf8'));
  const localIndex = JSON.parse(fs.readFileSync(path.join(projectRoot, 'public', 'data', 'mtg', 'commanders.json'), 'utf8'));
  if (localNames.length !== Number(manifest.detail_count || 0)) {
    throw new Error(`Local Commander detail count ${localNames.length} does not match manifest ${manifest.detail_count}.`);
  }

  const localSet = new Set(localNames);
  const remoteBefore = await listRemoteDetails(config);
  const staleNames = remoteBefore.filter((name) => !localSet.has(name));
  await uploadPublicDataSelection({
    relativePaths: ['data/mtg/commanders.json', DETAIL_PREFIX]
  }, {
    projectRoot,
    config,
    quietProgress: true
  });
  await removeRemoteDetails(config, staleNames);

  const remoteAfter = await listRemoteDetails(config);
  const remoteSet = new Set(remoteAfter);
  const missing = localNames.filter((name) => !remoteSet.has(name));
  const extra = remoteAfter.filter((name) => !localSet.has(name));
  if (missing.length > 0 || extra.length > 0 || remoteAfter.length !== localNames.length) {
    throw new Error(`Hosted Commander details disagree with local snapshot: missing=${missing.length}, extra=${extra.length}.`);
  }
  const hostedIndex = await readRemoteJson(config, 'data/mtg/commanders.json');
  if (!Array.isArray(hostedIndex) || hostedIndex.length !== localIndex.length) {
    throw new Error(`Hosted Commander index count ${Array.isArray(hostedIndex) ? hostedIndex.length : 'invalid'} does not match local index ${localIndex.length}.`);
  }
  if (hostedIndex.some((row) => row.dataset_version !== manifest.dataset_version || row.analytics_version !== manifest.analytics_version)) {
    throw new Error('Hosted Commander index contains a mixed or unexpected dataset version.');
  }

  await uploadPublicDataSelection({
    relativePaths: ['data/mtg/commander-manifest.json']
  }, {
    projectRoot,
    config,
    quietProgress: true
  });
  const hostedManifest = await readRemoteJson(config, 'data/mtg/commander-manifest.json');
  if (hostedManifest.dataset_version !== manifest.dataset_version || hostedManifest.detail_count !== localNames.length) {
    throw new Error('Hosted Commander manifest did not commit the verified snapshot.');
  }

  console.log(JSON.stringify({
    status: 'PASS',
    dataset_version: manifest.dataset_version,
    removed_stale_details: staleNames.length,
    published_details: localNames.length,
    hosted_details: remoteAfter.length
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
