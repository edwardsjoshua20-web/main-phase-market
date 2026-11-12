import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')?.replace(/\/+$/, '') || '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const OWNER_EMAIL = 'admin@mainphasemarket.net';
const BUCKET = 'kazakari-android-releases';

function serviceHeaders(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function requireOwner(request: Request) {
  const authorization = request.headers.get('authorization') || '';
  if (!authorization || authorization === `Bearer ${SERVICE_ROLE_KEY}`) {
    throw new Error('OWNER_AUTH_REQUIRED');
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: serviceHeaders({ Authorization: authorization }),
  });
  if (!response.ok) throw new Error('OWNER_AUTH_REQUIRED');
  const user = await response.json();
  if (String(user?.email || '').trim().toLowerCase() !== OWNER_EMAIL) {
    throw new Error('OWNER_FORBIDDEN');
  }
  return user;
}

async function currentRelease() {
  const params = new URLSearchParams({
    select: 'application_id,version_code,version_name,release_date,storage_path,file_name,sha256,size_bytes,release_notes',
    is_current: 'eq.true',
    limit: '1',
  });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/kazakari_android_releases?${params}`, {
    headers: serviceHeaders(),
  });
  if (!response.ok) throw new Error('RELEASE_LOOKUP_FAILED');
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]) throw new Error('RELEASE_NOT_FOUND');
  return rows[0];
}

function publicRelease(row: Record<string, unknown>) {
  return {
    applicationId: row.application_id,
    versionCode: row.version_code,
    versionName: row.version_name,
    releaseDate: row.release_date,
    fileName: row.file_name,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    notes: row.release_notes,
  };
}

async function createSignedDownload(row: Record<string, unknown>) {
  const encodedPath = String(row.storage_path || '').split('/').map(encodeURIComponent).join('/');
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${BUCKET}/${encodedPath}`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ expiresIn: 120 }),
  });
  if (!response.ok) throw new Error('SIGNED_URL_FAILED');
  const payload = await response.json();
  const signedPath = String(payload?.signedURL || payload?.signedUrl || '');
  if (!signedPath) throw new Error('SIGNED_URL_FAILED');
  const signedUrl = signedPath.startsWith('http') ? signedPath : `${SUPABASE_URL}/storage/v1${signedPath}`;
  return { ...publicRelease(row), signedUrl, expiresInSeconds: 120 };
}

Deno.serve(async (request) => {
  const cors = handleCors(request);
  if (cors) return cors;
  if (request.method !== 'POST') return errorResponse('Only POST is supported.', 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return errorResponse('Android releases are not configured.', 503);

  try {
    await requireOwner(request);
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'metadata');
    const release = await currentRelease();
    if (action === 'metadata') return jsonResponse({ release: publicRelease(release) });
    if (action === 'download') return jsonResponse({ release: await createSignedDownload(release) });
    return errorResponse('Unsupported release action.', 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'UNKNOWN';
    if (code === 'OWNER_AUTH_REQUIRED') return errorResponse('Please sign in to download Kazakari.', 401);
    if (code === 'OWNER_FORBIDDEN') return errorResponse('This account is not authorized for Kazakari.', 403);
    if (code === 'RELEASE_NOT_FOUND') return errorResponse('No Android release is published yet.', 404);
    return errorResponse('The Android release is temporarily unavailable.', 500);
  }
});
