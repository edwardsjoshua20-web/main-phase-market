import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import {
  PublicDataUploadError,
  readSupabaseUploadConfig,
  toObjectKey,
  toStorageBaseUrl,
  uploadCollectedFiles
} from './lib/supabase-public-data-upload.mjs';

const LEGACY_DETAIL_PREFIX = 'data/mtg/commander-details';
const MANIFEST_PATH = 'data/mtg/commander-manifest.json';

function datasetPaths(datasetVersion) {
  const datasetRoot = `data/mtg/commander-datasets/${datasetVersion}`;
  return {
    datasetRoot,
    indexPath: `${datasetRoot}/commanders.json`,
    detailPrefix: `${datasetRoot}/commander-details`
  };
}

function authHeaders(config) {
  return {
    Authorization: `Bearer ${config.serviceRoleKey}`,
    apikey: config.serviceRoleKey
  };
}

function writePublicationTelemetry(statePath, values) {
  if (!statePath || !fs.existsSync(statePath)) return;
  const database = new Database(statePath);
  try {
    const table = database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'mtg_commander_pipeline_meta'"
    ).get();
    if (!table) return;
    const statement = database.prepare(`
      INSERT INTO mtg_commander_pipeline_meta (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    const transaction = database.transaction(() => {
      for (const [key, value] of Object.entries(values)) {
        statement.run(key, value == null ? '' : String(value));
      }
    });
    transaction();
    database.pragma('wal_checkpoint(TRUNCATE)');
  } finally {
    database.close();
  }
}

async function listRemoteDetails(config, detailPrefix, fetchImpl = fetch) {
  const endpoint = `${String(config.supabaseUrl).replace(/\/+$/, '')}/storage/v1/object/list/${encodeURIComponent(config.bucketName)}`;
  const rowsByName = new Map();
  let offset = 0;
  while (true) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        ...authHeaders(config),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prefix: detailPrefix,
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' }
      })
    });
    if (!response.ok) {
      throw new PublicDataUploadError(
        `Could not list Commander detail objects at ${detailPrefix}: ${response.status} ${await response.text()}`,
        { objectPath: detailPrefix, status: response.status, transient: response.status >= 500 }
      );
    }
    const rows = await response.json();
    const page = Array.isArray(rows) ? rows.filter((row) => String(row?.name || '').endsWith('.json')) : [];
    for (const row of page) rowsByName.set(row.name, row);
    if (!Array.isArray(rows) || rows.length < 1000) break;
    offset += rows.length;
  }
  return rowsByName;
}

async function readRemoteJson(config, objectPath, options = {}) {
  const endpoint = `${toStorageBaseUrl(config.supabaseUrl, config.bucketName)}/${toObjectKey(objectPath)}`;
  const response = await (options.fetchImpl || fetch)(endpoint, { headers: authHeaders(config) });
  if (response.status === 404 && options.allowMissing) return null;
  if (!response.ok) {
    throw new PublicDataUploadError(
      `Could not verify hosted ${objectPath}: ${response.status} ${await response.text()}`,
      { objectPath, status: response.status, transient: response.status >= 500 }
    );
  }
  return response.json();
}

function localPublicationFiles(projectRoot, manifest) {
  const legacyDetailsDir = path.join(projectRoot, 'public', ...LEGACY_DETAIL_PREFIX.split('/'));
  const indexFile = path.join(projectRoot, 'public', 'data', 'mtg', 'commanders.json');
  const manifestFile = path.join(projectRoot, 'public', ...MANIFEST_PATH.split('/'));
  const names = fs.readdirSync(legacyDetailsDir).filter((name) => name.endsWith('.json')).sort();
  const paths = datasetPaths(manifest.dataset_version);
  return {
    names,
    paths,
    index: {
      fullPath: indexFile,
      relativePath: 'data/mtg/commanders.json',
      objectPath: paths.indexPath,
      size: fs.statSync(indexFile).size
    },
    manifest: {
      fullPath: manifestFile,
      relativePath: MANIFEST_PATH,
      objectPath: MANIFEST_PATH,
      cacheControl: 'no-cache, max-age=0',
      size: fs.statSync(manifestFile).size
    },
    details: names.map((name) => {
      const fullPath = path.join(legacyDetailsDir, name);
      return {
        fullPath,
        relativePath: `${LEGACY_DETAIL_PREFIX}/${name}`,
        objectPath: `${paths.detailPrefix}/${name}`,
        size: fs.statSync(fullPath).size,
        name
      };
    })
  };
}

function remoteObjectMatchesLocal(row, file) {
  if (!row) return false;
  const remoteSize = Number(row?.metadata?.size ?? row?.metadata?.contentLength ?? row?.size);
  return !Number.isFinite(remoteSize) || remoteSize === file.size;
}

function publicationFailureDetails(error) {
  return {
    publication_status: 'failed',
    last_publication_error: String(error?.message || error || 'Unknown publication failure'),
    last_publication_failed_object_path: error?.objectPath || error?.cause?.objectPath || ''
  };
}

export async function publishCommanderDataset(options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const config = options.config || readSupabaseUploadConfig(projectRoot);
  const fetchImpl = options.fetchImpl || fetch;
  const statePath = options.statePath || process.env.MPM_DB_PATH || '';
  const logger = options.logger || console;
  if (!config.supabaseUrl || !config.serviceRoleKey) throw new Error('Supabase public-data credentials are required.');

  const manifestFile = path.join(projectRoot, 'public', ...MANIFEST_PATH.split('/'));
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (!manifest.dataset_version) throw new Error('Commander manifest is missing dataset_version.');
  const files = localPublicationFiles(projectRoot, manifest);
  const localIndex = JSON.parse(fs.readFileSync(files.index.fullPath, 'utf8'));
  if (files.names.length !== Number(manifest.detail_count || 0)) {
    throw new Error(`Local Commander detail count ${files.names.length} does not match manifest ${manifest.detail_count}.`);
  }

  const publicBefore = await readRemoteJson(config, MANIFEST_PATH, { fetchImpl, allowMissing: true });
  const attemptTime = new Date().toISOString();
  writePublicationTelemetry(statePath, {
    last_publication_attempt_time: attemptTime,
    latest_built_dataset_id: manifest.dataset_version,
    current_public_dataset_id: publicBefore?.dataset_version || '',
    publication_status: 'publishing',
    last_publication_error: '',
    last_publication_failed_object_path: ''
  });

  try {
    const remoteBefore = await listRemoteDetails(config, files.paths.detailPrefix, fetchImpl);
    const pendingDetails = files.details.filter((file) => !remoteObjectMatchesLocal(remoteBefore.get(file.name), file));
    logger.log(
      `Commander publication ${manifest.dataset_version}: `
      + `${pendingDetails.length} detail uploads pending, ${files.details.length - pendingDetails.length} resumable skips.`
    );

    if (pendingDetails.length > 0) {
      await uploadCollectedFiles(pendingDetails, {
        projectRoot,
        config,
        fetchImpl,
        sleepImpl: options.sleepImpl,
        logger,
        quietProgress: true,
        maxAttempts: options.maxAttempts,
        retryBaseDelayMs: options.retryBaseDelayMs,
        retryMaxDelayMs: options.retryMaxDelayMs
      });
    }

    const remoteAfter = await listRemoteDetails(config, files.paths.detailPrefix, fetchImpl);
    const missing = files.details.filter((file) => !remoteObjectMatchesLocal(remoteAfter.get(file.name), file));
    const localNameSet = new Set(files.names);
    const extra = [...remoteAfter.keys()].filter((name) => !localNameSet.has(name));
    if (missing.length > 0 || extra.length > 0 || remoteAfter.size !== files.names.length) {
      throw new PublicDataUploadError(
        `Hosted Commander details disagree with local snapshot: missing=${missing.length}, extra=${extra.length}.`,
        { objectPath: missing[0]?.objectPath || files.paths.detailPrefix }
      );
    }

    await uploadCollectedFiles([files.index], {
      projectRoot,
      config,
      fetchImpl,
      sleepImpl: options.sleepImpl,
      logger,
      quietProgress: true,
      maxAttempts: options.maxAttempts,
      retryBaseDelayMs: options.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs
    });
    const hostedIndex = await readRemoteJson(config, files.paths.indexPath, { fetchImpl });
    if (!Array.isArray(hostedIndex) || hostedIndex.length !== localIndex.length) {
      throw new PublicDataUploadError(
        `Hosted Commander index count ${Array.isArray(hostedIndex) ? hostedIndex.length : 'invalid'} does not match local index ${localIndex.length}.`,
        { objectPath: files.paths.indexPath }
      );
    }
    if (hostedIndex.some((row) => row.dataset_version !== manifest.dataset_version || row.analytics_version !== manifest.analytics_version)) {
      throw new PublicDataUploadError('Hosted Commander index contains a mixed or unexpected dataset version.', {
        objectPath: files.paths.indexPath
      });
    }

    const publicationTime = new Date().toISOString();
    const committedManifest = {
      ...manifest,
      index_path: files.paths.indexPath.replace(/^data\/mtg\//, ''),
      detail_prefix: files.paths.detailPrefix.replace(/^data\/mtg\//, ''),
      last_publication_time: publicationTime
    };
    fs.writeFileSync(manifestFile, `${JSON.stringify(committedManifest)}\n`);
    files.manifest.size = fs.statSync(manifestFile).size;

    // The manifest is the public commit pointer and must always be the final upload.
    await uploadCollectedFiles([files.manifest], {
      projectRoot,
      config,
      fetchImpl,
      sleepImpl: options.sleepImpl,
      logger,
      quietProgress: true,
      maxAttempts: options.maxAttempts,
      retryBaseDelayMs: options.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs
    });
    const hostedManifest = await readRemoteJson(config, MANIFEST_PATH, { fetchImpl });
    if (
      hostedManifest.dataset_version !== committedManifest.dataset_version
      || hostedManifest.index_path !== committedManifest.index_path
      || hostedManifest.detail_prefix !== committedManifest.detail_prefix
      || Number(hostedManifest.detail_count || 0) !== files.names.length
    ) {
      throw new PublicDataUploadError('Hosted Commander manifest did not commit the verified snapshot.', {
        objectPath: MANIFEST_PATH
      });
    }

    writePublicationTelemetry(statePath, {
      last_publication_time: publicationTime,
      last_successful_publication_time: publicationTime,
      current_public_dataset_id: committedManifest.dataset_version,
      latest_built_dataset_id: committedManifest.dataset_version,
      publication_status: 'published',
      last_publication_error: '',
      last_publication_failed_object_path: ''
    });

    return {
      status: 'PASS',
      dataset_version: committedManifest.dataset_version,
      previous_public_dataset_version: publicBefore?.dataset_version || null,
      resumed_details: files.details.length - pendingDetails.length,
      uploaded_details: pendingDetails.length,
      published_details: files.details.length,
      index_path: committedManifest.index_path,
      detail_prefix: committedManifest.detail_prefix,
      publication_time: publicationTime
    };
  } catch (error) {
    writePublicationTelemetry(statePath, publicationFailureDetails(error));
    throw error;
  }
}

async function main() {
  const result = await publishCommanderDataset();
  console.log(JSON.stringify(result, null, 2));
}

const isDirectRun = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
