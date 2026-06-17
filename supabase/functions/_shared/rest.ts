import { requireEnv } from './env.ts';

const supabaseUrl = requireEnv('SUPABASE_URL').replace(/\/+$/, '');
const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

function buildHeaders(contentType = 'application/json') {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: 'return=representation',
    'Content-Type': contentType
  };
}

export async function restRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      ...buildHeaders(),
      ...(init.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || text || `Supabase REST request failed: ${response.status}`);
  }

  return payload;
}

export async function storageUpload(path: string, buffer: Uint8Array, mimeType: string) {
  const bucket = getEnv('PUBLIC_BUCKET') || requireEnv('SUPABASE_PUBLIC_BUCKET');
  const response = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(path).replace(/%2F/g, '/')}`,
    {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true'
      },
      body: buffer
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase storage upload failed: ${response.status}`);
  }

  return {
    file_url: `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`,
    bucket,
    path
  };
}
