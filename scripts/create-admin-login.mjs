import fs from 'node:fs';
import path from 'node:path';

const envText = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
const env = Object.fromEntries(
  envText
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((line) => !line.trim().startsWith('#') && line.includes('='))
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const url = String(env.VITE_SUPABASE_URL || env.SUPABASE_URL || '').replace(/\/+$/, '');
const key = env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!url || !key) throw new Error('Missing Supabase admin config');

const email = 'admin@mainphasemarket.net';
const password = 'MainPhaseAdmin!2026';
const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json'
};

const listRes = await fetch(`${url}/auth/v1/admin/users?page=1&per_page=200`, { headers });
const list = await listRes.json();
let user = (list.users || []).find((u) => String(u.email || '').toLowerCase() === email.toLowerCase());

if (user?.id) {
  const updRes = await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Main Phase Admin',
        role: 'admin'
      }
    })
  });
  const upd = await updRes.json();
  user = upd.user || upd;
} else {
  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Main Phase Admin',
        role: 'admin'
      }
    })
  });
  const created = await createRes.json();
  user = created.user || created;
}

const profileHeaders = { ...headers, Prefer: 'return=representation' };
const existingProfileRes = await fetch(`${url}/rest/v1/user_profiles?select=*&email=eq.${encodeURIComponent(email)}&limit=1`, { headers: profileHeaders });
const existingProfiles = await existingProfileRes.json();
const profileBody = {
  id: user.id,
  email,
  full_name: 'Main Phase Admin',
  avatar_url: '',
  bio: '',
  favorite_game: 'magic'
};

if (Array.isArray(existingProfiles) && existingProfiles[0]?.id) {
  await fetch(`${url}/rest/v1/user_profiles?id=eq.${encodeURIComponent(existingProfiles[0].id)}`, {
    method: 'PATCH',
    headers: profileHeaders,
    body: JSON.stringify(profileBody)
  });
} else {
  await fetch(`${url}/rest/v1/user_profiles`, {
    method: 'POST',
    headers: profileHeaders,
    body: JSON.stringify(profileBody)
  });
}

console.log(JSON.stringify({ ok: true, email, userId: user.id }, null, 2));
