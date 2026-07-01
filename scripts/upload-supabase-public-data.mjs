import fs from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = process.cwd();
const ENV_PATH = path.join(PROJECT_ROOT, '.env.local');
const PUBLIC_ROOT = path.join(PROJECT_ROOT, 'public');
const DATA_ROOT = path.join(PUBLIC_ROOT, 'data');

function readEnvFile(filePath) {
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

function toStorageBaseUrl(supabaseUrl, bucketName) {
  return `${String(supabaseUrl || '').replace(/\/+$/, '')}/storage/v1/object/${bucketName}`;
}

function contentTypeFor(filePath) {
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

function shouldSkipFile(relativePath, { includeImages = false } = {}) {
  // Legacy MTG bucket files are too large for Supabase's single-object upload limit.
  // The app uses manifest bucket shards instead: data/mtg/search-shards/*.json.
  if (/^data\/mtg\/search\/.+\.json$/i.test(relativePath)) {
    return true;
  }

  if (!includeImages && relativePath.includes('/images/')) {
    return true;
  }

  return false;
}

function toObjectKey(relativePath) {
  return String(relativePath || '')
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function collectFiles(rootDir, uploadPrefix = '', options = {}) {
  const files = [];
  const normalizedUploadPrefix = String(uploadPrefix || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');

  function walk(currentDir) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }

      const relativePath = path.relative(PUBLIC_ROOT, fullPath).split(path.sep).join('/');
      if (shouldSkipFile(relativePath, options)) {
        continue;
      }

      if (normalizedUploadPrefix && relativePath !== normalizedUploadPrefix && !relativePath.startsWith(`${normalizedUploadPrefix}/`)) {
        continue;
      }

      files.push({
        fullPath,
        relativePath,
        size: fs.statSync(fullPath).size
      });
    }
  }

  walk(rootDir);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function uploadFile({ file, storageBaseUrl, serviceRoleKey }) {
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

async function main() {
  const env = readEnvFile(ENV_PATH);
  const uploadPrefix = process.argv[2] || '';
  const includeImages = process.argv.includes('--include-images');
  const quietProgress = process.argv.includes('--quiet-progress');
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
  const bucketName = env.SUPABASE_PUBLIC_BUCKET || 'main-phase-market-public';

  if (!supabaseUrl) {
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_URL in .env.local');
  }

  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY in .env.local');
  }

  if (!fs.existsSync(DATA_ROOT)) {
    throw new Error(`Missing data directory: ${DATA_ROOT}`);
  }

  const files = collectFiles(DATA_ROOT, uploadPrefix, { includeImages });
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const storageBaseUrl = toStorageBaseUrl(supabaseUrl, bucketName);

  console.log(`Uploading ${files.length} files to bucket "${bucketName}"...`);
  if (uploadPrefix) {
    console.log(`Prefix: ${uploadPrefix}`);
  }
  if (includeImages) {
    console.log('Including image assets in upload.');
  }
  console.log(`Total bytes: ${totalBytes}`);

  let uploaded = 0;
  for (const file of files) {
    uploaded += 1;
    if (!quietProgress || uploaded === 1 || uploaded === files.length || uploaded % 50 === 0) {
      console.log(`[${uploaded}/${files.length}] ${file.relativePath}`);
    }
    await uploadFile({ file, storageBaseUrl, serviceRoleKey });
  }

  console.log('Upload complete.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
