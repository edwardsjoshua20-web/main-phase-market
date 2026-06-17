import { handleCors } from '../_shared/cors.ts';
import { errorResponse, jsonResponse } from '../_shared/http.ts';
import { storageUpload } from '../_shared/rest.ts';

function decodeBase64Upload(data = '') {
  const match = String(data || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid upload payload');
  }

  return {
    mimeType: match[1],
    buffer: Uint8Array.from(atob(match[2]), (char) => char.charCodeAt(0))
  };
}

function fileExtensionFromMime(mimeType = '') {
  const normalized = String(mimeType || '').toLowerCase();
  if (normalized === 'image/png') return '.png';
  if (normalized === 'image/webp') return '.webp';
  if (normalized === 'image/gif') return '.gif';
  return '.jpg';
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) {
    return cors;
  }

  try {
    const payload = await req.json();
    const filename = String(payload.filename || 'upload').trim();
    const { mimeType, buffer } = decodeBase64Upload(String(payload.data || ''));
    const extension = fileExtensionFromMime(mimeType);
    const safeBaseName = filename.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'upload';
    const storagePath = `avatars/${safeBaseName}-${crypto.randomUUID().slice(0, 8)}${extension}`;
    const uploaded = await storageUpload(storagePath, buffer, mimeType);

    return jsonResponse({
      ...uploaded,
      mime_type: mimeType,
      size: buffer.length,
      storage: 'supabase'
    });
  } catch (error) {
    console.error('upload-public-file error:', error);
    return errorResponse(error);
  }
});
