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

    const relativePath = path.relative(publicRoot, fullPath).split(path.sep).join('/');
    if (shouldSkipFile(relativePath, options)) {
      continue;
    }

    accumulator.set(relativePath, {
      fullPath,
      relativePath,
      size: fs.statSync(fullPath).size
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

export async function uploadFile({ file, storageBaseUrl, serviceRoleKey }) {
  const fileBuffer = fs.readFileSync(file.fullPath);
  const targetUrl = `${storageBaseUrl}/${toObjectKey(file.relativePath)}`;

  const response = await fetch(targetUrl, {
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
    throw new Error(`Upload failed for ${file.relativePath}: ${response.status} ${errorText}`);
  }
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
    await uploadFile({ file, storageBaseUrl, serviceRoleKey: config.serviceRoleKey });
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
