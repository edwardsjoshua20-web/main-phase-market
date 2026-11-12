import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const manifestArgument = process.argv.find((value) => value.startsWith('--manifest='));
if (!manifestArgument) throw new Error('Use --manifest=D:\\path\\to\\release-manifest.local.json');

const manifestPath = path.resolve(manifestArgument.slice('--manifest='.length));
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const apkPath = path.resolve(path.dirname(manifestPath), 'releases', manifest.fileName);
const supabaseUrl = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '');
if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
if (!fs.existsSync(apkPath)) throw new Error(`APK not found: ${apkPath}`);
if (manifest.applicationId !== 'net.mainphasemarket.kazakari') throw new Error('Unexpected Android application ID.');

const bytes = fs.readFileSync(apkPath);
const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha256 !== manifest.sha256 || bytes.length !== manifest.sizeBytes) {
  throw new Error('APK integrity does not match the release manifest.');
}

const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
const storageResponse = await fetch(
  `${supabaseUrl}/storage/v1/object/kazakari-android-releases/${manifest.objectPath.split('/').map(encodeURIComponent).join('/')}`,
  {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/vnd.android.package-archive', 'x-upsert': 'false' },
    body: bytes,
  },
);
if (!storageResponse.ok && storageResponse.status !== 409) {
  throw new Error(`Private APK upload failed (${storageResponse.status}).`);
}

const tableUrl = `${supabaseUrl}/rest/v1/kazakari_android_releases`;
const clearResponse = await fetch(`${tableUrl}?is_current=eq.true`, {
  method: 'PATCH',
  headers: { ...headers, 'Content-Type': 'application/json' },
  body: JSON.stringify({ is_current: false }),
});
if (!clearResponse.ok) throw new Error(`Unable to archive the previous release (${clearResponse.status}).`);

const releaseRow = {
  application_id: manifest.applicationId,
  version_code: manifest.versionCode,
  version_name: manifest.versionName,
  release_date: manifest.releaseDate,
  storage_path: manifest.objectPath,
  file_name: manifest.fileName,
  sha256: manifest.sha256,
  size_bytes: manifest.sizeBytes,
  release_notes: manifest.notes,
  is_current: true,
};
const publishResponse = await fetch(`${tableUrl}?on_conflict=version_code`, {
  method: 'POST',
  headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify(releaseRow),
});
if (!publishResponse.ok) throw new Error(`Unable to publish release metadata (${publishResponse.status}).`);

console.log(JSON.stringify({
  published: true,
  versionName: manifest.versionName,
  versionCode: manifest.versionCode,
  sha256: manifest.sha256,
  storage: 'private',
}, null, 2));
