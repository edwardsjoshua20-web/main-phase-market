import fs from 'node:fs';
import path from 'node:path';

export function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing env file: ${filePath}`);
  }

  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

export function readSupabaseUploadConfig(projectRoot = process.cwd()) {
  const envPath = path.join(projectRoot, '.env.local');
  const fileEnv = fs.existsSync(envPath) ? readEnvFile(envPath) : {};
  const env = {
    ...fileEnv,
    ...Object.fromEntries(
      Object.entries(process.env).filter(([, value]) => typeof value === 'string' && value.length > 0)
    )
  };
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucketName = env.SUPABASE_PUBLIC_BUCKET || 'main-phase-market-public';

  return {
    envPath,
    env,
    supabaseUrl,
    serviceRoleKey,
    bucketName
  };
}

export function hasSupabaseUploadConfig(projectRoot = process.cwd()) {
  try {
    const config = readSupabaseUploadConfig(projectRoot);
    return Boolean(config.supabaseUrl && config.serviceRoleKey);
  } catch {
    return false;
  }
}

export function toStorageBaseUrl(supabaseUrl, bucketName) {
  return `${String(supabaseUrl || '').replace(/\/+$/, '')}/storage/v1/object/${bucketName}`;
}

export function contentTypeFor(filePath) {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.avif':
      return 'image/avif';
    case '.txt':
      return 'text/plain; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}

export function shouldSkipFile(relativePath, { includeImages = false } = {}) {
  if (/^data\/mtg\/search\/.+\.json$/i.test(relativePath)) {
    return true;
  }

  if (!includeImages && relativePath.includes('/images/')) {
    return true;
  }

  return false;
}

function fileModifiedBeforeThreshold(stats, options = {}) {
  const threshold = Number(options.modifiedSinceMs || 0);
  return Number.isFinite(threshold) && threshold > 0 && stats.mtimeMs < threshold;
}

export function toObjectKey(relativePath) {
  return String(relativePath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function collectFilesFromDirectory(currentDir, publicRoot, accumulator, options = {}) {
  for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
    const fullPath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      collectFilesFromDirectory(fullPath, publicRoot, accumulator, options);
      continue;
    }

    const stats = fs.statSync(fullPath);
    if (fileModifiedBeforeThreshold(stats, options)) {
      continue;
    }

    const relativePath = path.relative(publicRoot, fullPath).split(path.sep).join('/');
    if (shouldSkipFile(relativePath, options)) {
      continue;
    }

    accumulator.set(relativePath, {
      fullPath,
      relativePath,
      size: stats.size
    });
  }
}

export function collectPublicFilesByRelativePaths(relativePaths = [], options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const publicRoot = path.join(projectRoot, 'public');
  const collected = new Map();

  for (const relativePathInput of relativePaths) {
    const relativePath = String(relativePathInput || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
    if (!relativePath) {
      continue;
    }

    const fullPath = path.join(publicRoot, relativePath);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const stats = fs.statSync(fullPath);
    if (stats.isDirectory()) {
      collectFilesFromDirectory(fullPath, publicRoot, collected, options);
      continue;
    }

    if (fileModifiedBeforeThreshold(stats, options)) {
      continue;
    }

    if (shouldSkipFile(relativePath, options)) {
      continue;
    }

    collected.set(relativePath, {
      fullPath,
      relativePath,
      size: stats.size
    });
  }

  return [...collected.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

const TRANSIENT_UPLOAD_STATUSES = new Set([429, 500, 502, 503, 504, 520]);
const TRANSIENT_NETWORK_CODES = new Set([
  'ECONNRESET',
  'ECONNREFUSED',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_SOCKET'
]);

export class PublicDataUploadError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = 'PublicDataUploadError';
    this.objectPath = options.objectPath || null;
    this.status = Number.isFinite(Number(options.status)) ? Number(options.status) : null;
    this.attempt = Number(options.attempt || 0);
    this.transient = Boolean(options.transient);
  }
}

export function isTransientUploadFailure(error) {
  if (error instanceof PublicDataUploadError) return error.transient;
  const code = String(error?.code || error?.cause?.code || '').toUpperCase();
  if (TRANSIENT_NETWORK_CODES.has(code)) return true;
  const message = String(error?.message || error || '');
  return /fetch failed|network|socket|connection reset|timed?\s*out|timeout/i.test(message);
}

function uploadAttemptCount(options = {}) {
  const value = Number(options.maxAttempts || process.env.MPM_PUBLIC_UPLOAD_MAX_ATTEMPTS || 4);
  return Number.isInteger(value) && value > 0 ? value : 4;
}

function retryDelayMs(attempt, options = {}) {
  const base = Math.max(0, Number(options.retryBaseDelayMs ?? process.env.MPM_PUBLIC_UPLOAD_RETRY_BASE_MS ?? 500));
  const ceiling = Math.max(base, Number(options.retryMaxDelayMs ?? process.env.MPM_PUBLIC_UPLOAD_RETRY_MAX_MS ?? 8_000));
  return Math.min(ceiling, base * (2 ** Math.max(0, attempt - 1)));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function uploadFile({ file, storageBaseUrl, serviceRoleKey, ...options }) {
  const fileBuffer = fs.readFileSync(file.fullPath);
  const objectPath = file.objectPath || file.relativePath;
  const targetUrl = `${storageBaseUrl}/${toObjectKey(objectPath)}`;
  const maxAttempts = uploadAttemptCount(options);
  const fetchImpl = options.fetchImpl || fetch;
  const sleepImpl = options.sleepImpl || sleep;
  const logger = options.logger || console;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetchImpl(targetUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          'x-upsert': 'true',
          'Content-Type': contentTypeFor(file.fullPath)
        },
        body: fileBuffer
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new PublicDataUploadError(
          `Upload failed for ${objectPath}: ${response.status} ${errorText}`,
          {
            objectPath,
            status: response.status,
            attempt,
            transient: TRANSIENT_UPLOAD_STATUSES.has(response.status)
          }
        );
      }

      if (attempt > 1) logger.log(`Upload recovered for ${objectPath} on attempt ${attempt}/${maxAttempts}.`);
      return { objectPath, attempts: attempt, status: response.status };
    } catch (cause) {
      const error = cause instanceof PublicDataUploadError
        ? cause
        : new PublicDataUploadError(`Upload failed for ${objectPath}: ${cause?.message || cause}`, {
            cause,
            objectPath,
            attempt,
            transient: isTransientUploadFailure(cause)
          });
      const retry = error.transient && attempt < maxAttempts;
      logger.warn(
        `Upload ${retry ? 'retry' : 'failure'} for ${objectPath} `
        + `(attempt ${attempt}/${maxAttempts}, status=${error.status || error.cause?.code || 'network'}).`
      );
      if (!retry) throw error;
      await sleepImpl(retryDelayMs(attempt, options));
    }
  }

  throw new PublicDataUploadError(`Upload failed for ${objectPath}.`, { objectPath });
}

export async function uploadCollectedFiles(files, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const quietProgress = Boolean(options.quietProgress);
  const config = options.config || readSupabaseUploadConfig(projectRoot);
  const storageBaseUrl = toStorageBaseUrl(config.supabaseUrl, config.bucketName);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  console.log(`Uploading ${files.length} files to bucket "${config.bucketName}"...`);
  console.log(`Total bytes: ${totalBytes}`);

  let uploaded = 0;
  for (const file of files) {
    uploaded += 1;
    if (!quietProgress || uploaded === 1 || uploaded === files.length || uploaded % 50 === 0) {
      console.log(`[${uploaded}/${files.length}] ${file.relativePath}`);
    }
    await uploadFile({
      file,
      storageBaseUrl,
      serviceRoleKey: config.serviceRoleKey,
      fetchImpl: options.fetchImpl,
      sleepImpl: options.sleepImpl,
      logger: options.logger,
      maxAttempts: options.maxAttempts,
      retryBaseDelayMs: options.retryBaseDelayMs,
      retryMaxDelayMs: options.retryMaxDelayMs
    });
  }

  console.log('Upload complete.');
  return {
    uploadedCount: files.length,
    totalBytes,
    bucketName: config.bucketName
  };
}

export async function uploadPublicDataSelection(selection = {}, options = {}) {
  const relativePaths = Array.isArray(selection.relativePaths) ? selection.relativePaths : [];
  const files = collectPublicFilesByRelativePaths(relativePaths, options);
  if (files.length === 0) {
    return {
      uploadedCount: 0,
      totalBytes: 0,
      skipped: true
    };
  }

  return uploadCollectedFiles(files, options);
}
