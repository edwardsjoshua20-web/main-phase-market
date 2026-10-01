import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { publishCommanderDataset } from './publish-mtg-commander-public-data.mjs';
import { PublicDataUploadError, uploadFile } from './lib/supabase-public-data-upload.mjs';

const quietLogger = { log() {}, warn() {}, error() {} };
const config = {
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'test-key',
  bucketName: 'test-public'
};

function makeProject() {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mpm-commander-publication-'));
  const dataDir = path.join(projectRoot, 'public', 'data', 'mtg');
  const detailsDir = path.join(dataDir, 'commander-details');
  fs.mkdirSync(detailsDir, { recursive: true });
  const rows = [
    { oracle_id: 'alpha', name: 'Alpha', deck_count: 2, dataset_version: 'dataset-test', analytics_version: 'analytics-test' },
    { oracle_id: 'beta', name: 'Beta', deck_count: 1, dataset_version: 'dataset-test', analytics_version: 'analytics-test' }
  ];
  fs.writeFileSync(path.join(dataDir, 'commanders.json'), `${JSON.stringify(rows)}\n`);
  for (const row of rows) {
    fs.writeFileSync(path.join(detailsDir, `${row.oracle_id}.json`), `${JSON.stringify({ ...row, detail: true })}\n`);
  }
  fs.writeFileSync(path.join(dataDir, 'commander-manifest.json'), `${JSON.stringify({
    dataset_version: 'dataset-test',
    analytics_version: 'analytics-test',
    detail_count: 2,
    active_deck_count: 3,
    unique_content_configuration_count: 3,
    index_deck_total: 3
  })}\n`);
  return projectRoot;
}

function createStorage(initial = {}) {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, Buffer.from(value)]));
  const failures = new Map();
  const attempts = new Map();
  const uploads = [];

  function objectPathFromUrl(url) {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const marker = `/storage/v1/object/${config.bucketName}/`;
    return pathname.includes(marker) ? pathname.slice(pathname.indexOf(marker) + marker.length) : null;
  }

  async function fetchImpl(url, options = {}) {
    const pathname = decodeURIComponent(new URL(url).pathname);
    if (pathname === `/storage/v1/object/list/${config.bucketName}`) {
      const body = JSON.parse(options.body || '{}');
      const prefix = `${String(body.prefix || '').replace(/\/+$/, '')}/`;
      const rows = [...objects.entries()]
        .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
        .map(([key, value]) => ({ name: key.slice(prefix.length), metadata: { size: value.length } }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return Response.json(rows.slice(Number(body.offset || 0), Number(body.offset || 0) + Number(body.limit || 1000)));
    }

    const objectPath = objectPathFromUrl(url);
    if (!objectPath) return new Response('Not found', { status: 404 });
    if ((options.method || 'GET').toUpperCase() === 'POST') {
      const count = Number(attempts.get(objectPath) || 0) + 1;
      attempts.set(objectPath, count);
      const configuredFailures = failures.get(objectPath) || [];
      if (configuredFailures.length > 0) {
        const status = configuredFailures.shift();
        return new Response(`simulated ${status}`, { status });
      }
      objects.set(objectPath, Buffer.from(options.body));
      uploads.push(objectPath);
      return new Response('ok', { status: 200 });
    }
    if (!objects.has(objectPath)) return new Response('Not found', { status: 404 });
    return new Response(objects.get(objectPath), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return { objects, failures, attempts, uploads, fetchImpl };
}

async function verifyUploadRetries() {
  const projectRoot = makeProject();
  try {
    const filePath = path.join(projectRoot, 'public', 'data', 'mtg', 'commanders.json');
    const file = { fullPath: filePath, relativePath: 'retry.json', size: fs.statSync(filePath).size };
    const storage = createStorage();
    storage.failures.set('retry.json', [520]);
    const result520 = await uploadFile({
      file,
      storageBaseUrl: `${config.supabaseUrl}/storage/v1/object/${config.bucketName}`,
      serviceRoleKey: config.serviceRoleKey,
      fetchImpl: storage.fetchImpl,
      sleepImpl: async () => {},
      logger: quietLogger,
      maxAttempts: 4
    });
    assert.equal(result520.attempts, 2, '520 should retry once and recover');

    file.objectPath = 'retry-503.json';
    storage.failures.set('retry-503.json', [503, 503]);
    const result503 = await uploadFile({
      file,
      storageBaseUrl: `${config.supabaseUrl}/storage/v1/object/${config.bucketName}`,
      serviceRoleKey: config.serviceRoleKey,
      fetchImpl: storage.fetchImpl,
      sleepImpl: async () => {},
      logger: quietLogger,
      maxAttempts: 4
    });
    assert.equal(result503.attempts, 3, '503 should recover after two retries');

    file.objectPath = 'permanent.json';
    storage.failures.set('permanent.json', [400, 200]);
    await assert.rejects(
      uploadFile({
        file,
        storageBaseUrl: `${config.supabaseUrl}/storage/v1/object/${config.bucketName}`,
        serviceRoleKey: config.serviceRoleKey,
        fetchImpl: storage.fetchImpl,
        sleepImpl: async () => {},
        logger: quietLogger,
        maxAttempts: 4
      }),
      (error) => error instanceof PublicDataUploadError && error.status === 400
    );
    assert.equal(storage.attempts.get('permanent.json'), 1, 'permanent 4xx must not retry');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

async function verifyAtomicResumeAndIdempotence() {
  const projectRoot = makeProject();
  const oldManifest = JSON.stringify({ dataset_version: 'old-dataset', detail_count: 1 });
  const storage = createStorage({ 'data/mtg/commander-manifest.json': oldManifest });
  const alphaPath = 'data/mtg/commander-datasets/dataset-test/commander-details/alpha.json';
  const betaPath = 'data/mtg/commander-datasets/dataset-test/commander-details/beta.json';
  try {
    storage.failures.set(betaPath, [400]);
    await assert.rejects(publishCommanderDataset({
      projectRoot,
      config,
      fetchImpl: storage.fetchImpl,
      sleepImpl: async () => {},
      logger: quietLogger
    }));
    assert.equal(JSON.parse(storage.objects.get('data/mtg/commander-manifest.json')).dataset_version, 'old-dataset');
    assert.equal(storage.attempts.get(alphaPath), 1, 'first detail should upload before failure');

    const recovered = await publishCommanderDataset({
      projectRoot,
      config,
      fetchImpl: storage.fetchImpl,
      sleepImpl: async () => {},
      logger: quietLogger
    });
    assert.equal(recovered.resumed_details, 1, 'resume should skip the already verified detail');
    assert.equal(storage.attempts.get(alphaPath), 1, 'resume must not rewrite verified immutable detail');
    assert.equal(storage.attempts.get(betaPath), 2, 'resume should retry the missing detail');
    assert.equal(storage.uploads.at(-1), 'data/mtg/commander-manifest.json', 'manifest must publish last');
    assert.equal(JSON.parse(storage.objects.get('data/mtg/commander-manifest.json')).dataset_version, 'dataset-test');

    const detailBytes = Buffer.from(storage.objects.get(alphaPath));
    const idempotent = await publishCommanderDataset({
      projectRoot,
      config,
      fetchImpl: storage.fetchImpl,
      sleepImpl: async () => {},
      logger: quietLogger
    });
    assert.equal(idempotent.resumed_details, 2, 'idempotent rerun should reuse every immutable detail');
    assert.deepEqual(storage.objects.get(alphaPath), detailBytes, 'idempotent rerun must not corrupt detail data');
    assert.equal(storage.uploads.at(-1), 'data/mtg/commander-manifest.json', 'manifest must remain the final write');
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
}

await verifyUploadRetries();
await verifyAtomicResumeAndIdempotence();

console.log(JSON.stringify({
  status: 'PASS',
  checks: [
    '520 retries once then succeeds',
    '503 retries twice then succeeds',
    'permanent 4xx does not retry',
    'failed publication preserves old manifest',
    'partial publication resumes without re-uploading verified details',
    'manifest is the final upload',
    'idempotent rerun preserves immutable dataset objects'
  ]
}, null, 2));
