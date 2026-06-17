import fs from 'node:fs';
import path from 'node:path';

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, 'utf8');
  return Object.fromEntries(
    content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const idx = line.indexOf('=');
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

const repoRoot = process.cwd();
const fileEnv = {
  ...parseEnvFile(path.join(repoRoot, '.env.local')),
  ...parseEnvFile(path.join(repoRoot, '.env'))
};

function getEnv(name) {
  return process.env[name] || fileEnv[name] || '';
}

function getBridgeConfig() {
  const url = getEnv('VITE_SUPABASE_URL') || getEnv('SUPABASE_URL');
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');
  return {
    url: String(url || '').replace(/\/+$/, ''),
    serviceRoleKey: String(serviceRoleKey || '')
  };
}

export function isSupabaseDeckBridgeConfigured() {
  const config = getBridgeConfig();
  return Boolean(config.url && config.serviceRoleKey);
}

export function isSupabaseForumBridgeConfigured() {
  return isSupabaseDeckBridgeConfigured();
}

export function isSupabaseProfileBridgeConfigured() {
  return isSupabaseDeckBridgeConfigured();
}

export function isSupabaseEntityStoreConfigured() {
  return isSupabaseDeckBridgeConfigured();
}

export function isSupabaseStorageConfigured() {
  const config = getBridgeConfig();
  return Boolean(config.url && config.serviceRoleKey && getEnv('SUPABASE_PUBLIC_BUCKET'));
}

function buildHeaders() {
  const { serviceRoleKey } = getBridgeConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };
}

function buildAdminHeaders() {
  const { serviceRoleKey } = getBridgeConfig();
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json'
  };
}

async function supabaseRequest(resourcePath, { method = 'GET', body } = {}) {
  const { url } = getBridgeConfig();
  if (!url) {
    throw new Error('Supabase URL is not configured.');
  }

  const response = await fetch(`${url}${resourcePath}`, {
    method,
    headers: buildHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function supabaseAdminRequest(resourcePath, { method = 'GET', body } = {}) {
  const { url } = getBridgeConfig();
  if (!url) {
    throw new Error('Supabase URL is not configured.');
  }

  const response = await fetch(`${url}${resourcePath}`, {
    method,
    headers: buildAdminHeaders(),
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase admin request failed: ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function uploadSupabasePublicFile(filePath, buffer, mimeType = 'application/octet-stream') {
  const { url, serviceRoleKey } = getBridgeConfig();
  const bucket = String(getEnv('SUPABASE_PUBLIC_BUCKET') || '').trim();

  if (!url || !serviceRoleKey || !bucket) {
    throw new Error('Supabase storage is not configured.');
  }

  const normalizedPath = String(filePath || '').replace(/^\/+/, '');
  const response = await fetch(`${url}/storage/v1/object/${bucket}/${encodeURIComponent(normalizedPath).replace(/%2F/g, '/')}`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': mimeType,
      'x-upsert': 'true'
    },
    body: buffer
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Supabase storage upload failed: ${response.status}`);
  }

  return {
    file_url: `${url}/storage/v1/object/public/${bucket}/${normalizedPath}`,
    bucket,
    path: normalizedPath
  };
}

function encode(value) {
  return encodeURIComponent(String(value ?? ''));
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }

  return String(a ?? '').localeCompare(String(b ?? ''));
}

function matchesCondition(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('$regex' in expected) {
      const flags = expected.$options || '';
      const regex = new RegExp(expected.$regex, flags);
      return regex.test(String(actual ?? ''));
    }

    if ('$in' in expected) {
      const haystack = Array.isArray(actual) ? actual : [actual];
      return expected.$in.some((item) => haystack.includes(item));
    }
  }

  return actual === expected;
}

function matchesFilter(record, filter) {
  if (!filter || Object.keys(filter).length === 0) {
    return true;
  }

  if (Array.isArray(filter.$or)) {
    return filter.$or.some((entry) => matchesFilter(record, entry));
  }

  return Object.entries(filter).every(([key, value]) => {
    if (key === '$or') {
      return true;
    }

    return matchesCondition(record?.[key], value);
  });
}

function sortRecords(records, sort) {
  if (!sort) {
    return records;
  }

  const direction = String(sort).startsWith('-') ? -1 : 1;
  const field = String(sort).replace(/^-/, '');

  return [...records].sort((a, b) => compareValues(a?.[field], b?.[field]) * direction);
}

function sliceRecords(records, limit, skip = 0) {
  const start = Math.max(0, Number(skip) || 0);
  const end = limit ? start + Number(limit) : undefined;
  return records.slice(start, end);
}

function commanderNameFromItems(items = []) {
  return items.find((item) => item?.is_commander)?.product_name || null;
}

function normalizeDeckPayload(row) {
  const payload = row?.deck_payload && typeof row.deck_payload === 'object' ? row.deck_payload : {};
  return {
    id: row.id,
    user_email: row.owner_email || payload.user_email || '',
    name: row.name || payload.name || 'Untitled Deck',
    description: payload.description || '',
    deck_format: row.format || payload.deck_format || 'casual',
    estimated_cost: payload.estimated_cost || 0,
    items: Array.isArray(payload.items) ? payload.items : [],
    game: row.game || payload.game || 'mtg',
    source: row.source || payload.source || 'supabase',
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_date: row.created_at,
    updated_date: row.updated_at
  };
}

function buildSavedDeckRecord(payload, existing = null) {
  const basePayload = existing?.deck_payload && typeof existing.deck_payload === 'object'
    ? { ...existing.deck_payload }
    : {};

  const mergedPayload = {
    ...basePayload,
    ...payload,
    items: Array.isArray(payload.items) ? payload.items : (basePayload.items || []),
    estimated_cost:
      payload.estimated_cost ??
      basePayload.estimated_cost ??
      0,
    description: payload.description ?? basePayload.description ?? '',
    user_email: payload.user_email ?? existing?.owner_email ?? basePayload.user_email ?? ''
  };

  return {
    name: payload.name ?? existing?.name ?? basePayload.name ?? 'Untitled Deck',
    game: payload.game ?? existing?.game ?? basePayload.game ?? 'mtg',
    format: payload.deck_format ?? existing?.format ?? basePayload.deck_format ?? 'casual',
    commander_name: commanderNameFromItems(mergedPayload.items),
    source: payload.source ?? existing?.source ?? basePayload.source ?? 'local-backend',
    tags: Array.isArray(payload.tags) ? payload.tags : (existing?.tags || []),
    owner_email: payload.user_email ?? existing?.owner_email ?? basePayload.user_email ?? '',
    deck_payload: mergedPayload
  };
}

export async function listSupabaseCardLists(filter = {}, sort = '-created_date', limit, skip = 0) {
  const params = new URLSearchParams();
  params.set('select', '*');

  if (filter?.user_email) {
    params.set('owner_email', `eq.${filter.user_email}`);
  }

  const ascending = !String(sort || '').startsWith('-');
  const sortField = String(sort || '-created_date').replace(/^-/, '');
  const remoteSortField = sortField === 'updated_date'
    ? 'updated_at'
    : sortField === 'created_date'
      ? 'created_at'
      : 'created_at';
  params.set('order', `${remoteSortField}.${ascending ? 'asc' : 'desc'}`);

  if (limit !== undefined && limit !== null) {
    const start = Math.max(0, Number(skip) || 0);
    const end = start + Number(limit) - 1;
    params.set('offset', String(start));
    params.set('limit', String(Number(limit)));
    params.set('range', `${start}-${end}`);
  }

  const rows = await supabaseRequest(`/rest/v1/saved_decks?${params.toString()}`);
  return (rows || []).map(normalizeDeckPayload);
}

export async function getSupabaseCardListById(id) {
  const rows = await supabaseRequest(`/rest/v1/saved_decks?select=*&id=eq.${encode(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? normalizeDeckPayload(row) : null;
}

export async function createSupabaseCardList(payload) {
  const record = buildSavedDeckRecord(payload);
  const rows = await supabaseRequest('/rest/v1/saved_decks', {
    method: 'POST',
    body: record
  });
  return normalizeDeckPayload(Array.isArray(rows) ? rows[0] : rows);
}

function normalizeGenericEntityRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    id: data.id || row.id,
    created_date: data.created_date || row.created_date || row.created_at,
    updated_date: data.updated_date || row.updated_date || row.updated_at
  };
}

function buildGenericEntityRecord(entityName, payload, existing = null) {
  const timestamp = new Date().toISOString();
  const createdDate = payload?.created_date || existing?.created_date || timestamp;
  const updatedDate = timestamp;
  const id = payload?.id || existing?.id || globalThis.crypto?.randomUUID?.() || `${Date.now()}`;
  const data = {
    ...(existing || {}),
    ...(payload || {}),
    id,
    created_date: createdDate,
    updated_date: updatedDate
  };

  return {
    entity_name: entityName,
    id,
    created_date: createdDate,
    updated_date: updatedDate,
    data
  };
}

export async function listSupabaseEntityRecords(entityName, { sort = '-created_date', limit, skip = 0 } = {}) {
  const params = new URLSearchParams();
  params.set('select', '*');
  params.set('entity_name', `eq.${entityName}`);
  params.set('order', 'created_date.desc');

  const rows = await supabaseRequest(`/rest/v1/app_entities?${params.toString()}`);
  const normalized = (rows || []).map(normalizeGenericEntityRow);
  return sliceRecords(sortRecords(normalized, sort), limit, skip);
}

export async function filterSupabaseEntityRecords(entityName, filter = {}, { sort = '-created_date', limit, skip = 0 } = {}) {
  const rows = await listSupabaseEntityRecords(entityName, { sort, skip: 0 });
  const filtered = rows.filter((row) => matchesFilter(row, filter));
  return sliceRecords(filtered, limit, skip);
}

export async function getSupabaseEntityRecordById(entityName, id) {
  const rows = await supabaseRequest(
    `/rest/v1/app_entities?select=*&entity_name=eq.${encode(entityName)}&id=eq.${encode(id)}&limit=1`
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? normalizeGenericEntityRow(row) : null;
}

export async function createSupabaseEntityRecord(entityName, payload = {}) {
  const record = buildGenericEntityRecord(entityName, payload);
  const rows = await supabaseRequest('/rest/v1/app_entities', {
    method: 'POST',
    body: record
  });
  return normalizeGenericEntityRow(Array.isArray(rows) ? rows[0] : rows);
}

export async function updateSupabaseEntityRecord(entityName, id, updates = {}) {
  const current = await getSupabaseEntityRecordById(entityName, id);
  if (!current) {
    throw new Error(`Record not found for ${entityName}:${id}`);
  }

  const record = buildGenericEntityRecord(entityName, { ...updates, id }, current);
  const rows = await supabaseRequest(
    `/rest/v1/app_entities?entity_name=eq.${encode(entityName)}&id=eq.${encode(id)}`,
    {
      method: 'PATCH',
      body: {
        created_date: record.created_date,
        updated_date: record.updated_date,
        data: record.data
      }
    }
  );

  return normalizeGenericEntityRow(Array.isArray(rows) ? rows[0] : rows);
}

export async function deleteSupabaseEntityRecord(entityName, id) {
  await supabaseRequest(
    `/rest/v1/app_entities?entity_name=eq.${encode(entityName)}&id=eq.${encode(id)}`,
    { method: 'DELETE' }
  );
  return { success: true, id };
}

export async function updateSupabaseCardList(id, updates) {
  const currentRows = await supabaseRequest(`/rest/v1/saved_decks?select=*&id=eq.${encode(id)}&limit=1`);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) {
    throw new Error(`Record not found for CardList:${id}`);
  }

  const record = buildSavedDeckRecord(updates, current);
  const rows = await supabaseRequest(`/rest/v1/saved_decks?id=eq.${encode(id)}`, {
    method: 'PATCH',
    body: record
  });
  return normalizeDeckPayload(Array.isArray(rows) ? rows[0] : rows);
}

export async function deleteSupabaseCardList(id) {
  await supabaseRequest(`/rest/v1/saved_decks?id=eq.${encode(id)}`, {
    method: 'DELETE'
  });
  return { success: true, id };
}

function normalizeForumThread(row) {
  return {
    id: row.id,
    title: row.title || '',
    content: row.content || '',
    game: row.game || 'magic',
    category: row.category || 'general',
    tags: Array.isArray(row.tags) ? row.tags : [],
    author_id: row.author_id || null,
    author_name: row.author_name || row.author_email || 'Unknown',
    author_email: row.author_email || '',
    is_pinned: Boolean(row.is_pinned),
    is_solved: Boolean(row.is_solved),
    view_count: Number(row.view_count || 0),
    reply_count: Number(row.reply_count || 0),
    likes: Number(row.likes || 0),
    liked_by: Array.isArray(row.liked_by) ? row.liked_by : [],
    last_reply_at: row.last_reply_at || null,
    last_reply_by: row.last_reply_by || '',
    created_date: row.created_at || null,
    updated_date: row.updated_at || null
  };
}

function buildForumThreadRecord(payload, existing = null) {
  const record = {
    title: payload.title ?? existing?.title ?? '',
    content: payload.content ?? existing?.content ?? '',
    game: payload.game ?? existing?.game ?? 'magic',
    category: payload.category ?? existing?.category ?? 'general',
    tags: Array.isArray(payload.tags) ? payload.tags : (existing?.tags || []),
    author_id: payload.author_id ?? existing?.author_id ?? null,
    author_name: payload.author_name ?? existing?.author_name ?? '',
    author_email: payload.author_email ?? existing?.author_email ?? '',
    is_pinned: payload.is_pinned ?? existing?.is_pinned ?? false,
    view_count: payload.view_count ?? existing?.view_count ?? 0,
    reply_count: payload.reply_count ?? existing?.reply_count ?? 0,
    likes: payload.likes ?? existing?.likes ?? 0,
    liked_by: Array.isArray(payload.liked_by) ? payload.liked_by : (existing?.liked_by || [])
  };

  const resolvedIsSolved = payload.is_solved ?? existing?.is_solved;
  if (resolvedIsSolved !== undefined) {
    record.is_solved = resolvedIsSolved;
  }

  const resolvedLastReplyAt = payload.last_reply_at ?? existing?.last_reply_at;
  if (resolvedLastReplyAt !== undefined && resolvedLastReplyAt !== null && resolvedLastReplyAt !== '') {
    record.last_reply_at = resolvedLastReplyAt;
  }

  const resolvedLastReplyBy = payload.last_reply_by ?? existing?.last_reply_by;
  if (resolvedLastReplyBy !== undefined && resolvedLastReplyBy !== null && resolvedLastReplyBy !== '') {
    record.last_reply_by = resolvedLastReplyBy;
  }

  return record;
}

function forumThreadSortField(sort) {
  const field = String(sort || '-created_date').replace(/^-/, '');
  if (field === 'likes') return 'likes';
  if (field === 'updated_date') return 'updated_at';
  if (field === 'last_reply_at') return 'last_reply_at';
  return 'created_at';
}

export async function listSupabaseForumPosts(filter = {}, sort = '-created_date', limit, skip = 0) {
  const params = new URLSearchParams();
  params.set('select', '*');

  if (filter?.id) {
    params.set('id', `eq.${encode(filter.id)}`);
  }
  if (filter?.game) {
    params.set('game', `eq.${encode(filter.game)}`);
  }
  if (filter?.category) {
    params.set('category', `eq.${encode(filter.category)}`);
  }
  if (filter?.author_email) {
    params.set('author_email', `eq.${encode(filter.author_email)}`);
  }

  const ascending = !String(sort || '').startsWith('-');
  params.set('order', `${forumThreadSortField(sort)}.${ascending ? 'asc' : 'desc'}`);

  if (limit !== undefined && limit !== null) {
    params.set('offset', String(Math.max(0, Number(skip) || 0)));
    params.set('limit', String(Number(limit)));
  }

  const rows = await supabaseRequest(`/rest/v1/forum_threads?${params.toString()}`);
  return (rows || []).map(normalizeForumThread);
}

export async function getSupabaseForumPostById(id) {
  const rows = await supabaseRequest(`/rest/v1/forum_threads?select=*&id=eq.${encode(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? normalizeForumThread(row) : null;
}

export async function createSupabaseForumPost(payload) {
  const rows = await supabaseRequest('/rest/v1/forum_threads', {
    method: 'POST',
    body: buildForumThreadRecord(payload)
  });
  return normalizeForumThread(Array.isArray(rows) ? rows[0] : rows);
}

export async function updateSupabaseForumPost(id, updates) {
  const currentRows = await supabaseRequest(`/rest/v1/forum_threads?select=*&id=eq.${encode(id)}&limit=1`);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) {
    throw new Error(`Record not found for ForumPost:${id}`);
  }

  const rows = await supabaseRequest(`/rest/v1/forum_threads?id=eq.${encode(id)}`, {
    method: 'PATCH',
    body: buildForumThreadRecord(updates, current)
  });
  return normalizeForumThread(Array.isArray(rows) ? rows[0] : rows);
}

export async function deleteSupabaseForumPost(id) {
  await supabaseRequest(`/rest/v1/forum_threads?id=eq.${encode(id)}`, {
    method: 'DELETE'
  });
  return { success: true, id };
}

function normalizeForumReply(row) {
  return {
    id: row.id,
    post_id: row.thread_id,
    author_id: row.author_id || null,
    author_name: row.author_name || row.author_email || 'Unknown',
    author_email: row.author_email || '',
    content: row.content || '',
    likes: Number(row.likes || 0),
    liked_by: Array.isArray(row.liked_by) ? row.liked_by : [],
    is_accepted_answer: Boolean(row.is_accepted_answer),
    created_date: row.created_at || null,
    updated_date: row.updated_at || null
  };
}

function buildForumReplyRecord(payload, existing = null) {
  const record = {
    thread_id: payload.post_id ?? existing?.thread_id ?? null,
    author_id: payload.author_id ?? existing?.author_id ?? null,
    author_name: payload.author_name ?? existing?.author_name ?? '',
    author_email: payload.author_email ?? existing?.author_email ?? '',
    content: payload.content ?? existing?.content ?? '',
    likes: payload.likes ?? existing?.likes ?? 0,
    liked_by: Array.isArray(payload.liked_by) ? payload.liked_by : (existing?.liked_by || [])
  };

  const resolvedAccepted = payload.is_accepted_answer ?? existing?.is_accepted_answer;
  if (resolvedAccepted !== undefined) {
    record.is_accepted_answer = resolvedAccepted;
  }

  return record;
}

export async function listSupabaseForumReplies(filter = {}, sort = 'created_date', limit, skip = 0) {
  const params = new URLSearchParams();
  params.set('select', '*');

  if (filter?.post_id) {
    params.set('thread_id', `eq.${encode(filter.post_id)}`);
  }
  if (filter?.id) {
    params.set('id', `eq.${encode(filter.id)}`);
  }

  const ascending = !String(sort || '').startsWith('-');
  const sortField = String(sort || 'created_date').replace(/^-/, '') === 'updated_date' ? 'updated_at' : 'created_at';
  params.set('order', `${sortField}.${ascending ? 'asc' : 'desc'}`);

  if (limit !== undefined && limit !== null) {
    params.set('offset', String(Math.max(0, Number(skip) || 0)));
    params.set('limit', String(Number(limit)));
  }

  const rows = await supabaseRequest(`/rest/v1/forum_replies?${params.toString()}`);
  return (rows || []).map(normalizeForumReply);
}

export async function createSupabaseForumReply(payload) {
  const rows = await supabaseRequest('/rest/v1/forum_replies', {
    method: 'POST',
    body: buildForumReplyRecord(payload)
  });
  return normalizeForumReply(Array.isArray(rows) ? rows[0] : rows);
}

export async function updateSupabaseForumReply(id, updates) {
  const currentRows = await supabaseRequest(`/rest/v1/forum_replies?select=*&id=eq.${encode(id)}&limit=1`);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;
  if (!current) {
    throw new Error(`Record not found for ForumReply:${id}`);
  }

  const rows = await supabaseRequest(`/rest/v1/forum_replies?id=eq.${encode(id)}`, {
    method: 'PATCH',
    body: buildForumReplyRecord(updates, current)
  });
  return normalizeForumReply(Array.isArray(rows) ? rows[0] : rows);
}

export async function deleteSupabaseForumReply(id) {
  await supabaseRequest(`/rest/v1/forum_replies?id=eq.${encode(id)}`, {
    method: 'DELETE'
  });
  return { success: true, id };
}

function normalizeUserProfile(row, fallback = {}) {
  return {
    id: row?.id || fallback.id || 'local-admin',
    full_name: row?.full_name || fallback.full_name || 'Local Admin',
    email: row?.email || fallback.email || 'admin@localhost',
    role: fallback.role || 'admin',
    avatar_url: row?.avatar_url || fallback.avatar_url || '',
    bio: row?.bio || fallback.bio || '',
    favorite_game: row?.favorite_game || fallback.favorite_game || ''
  };
}

async function findSupabaseAuthUserByEmail(email) {
  const payload = await supabaseAdminRequest('/auth/v1/admin/users?page=1&per_page=200');
  const users = Array.isArray(payload?.users) ? payload.users : [];
  return users.find((user) => String(user?.email || '').toLowerCase() === String(email || '').toLowerCase()) || null;
}

async function ensureSupabaseAuthUserByEmail(email, fallback = {}) {
  const existing = await findSupabaseAuthUserByEmail(email);
  if (existing?.id) {
    return existing;
  }

  try {
    const payload = await supabaseAdminRequest('/auth/v1/admin/users', {
      method: 'POST',
      body: {
        email,
        email_confirm: true,
        user_metadata: {
          full_name: fallback.full_name || 'Local Admin'
        }
      }
    });
    return payload?.user || payload;
  } catch (error) {
    const recovered = await findSupabaseAuthUserByEmail(email);
    if (recovered?.id) {
      return recovered;
    }
    throw error;
  }
}

export async function getSupabaseUserProfileByEmail(email, fallback = {}) {
  const rows = await supabaseRequest(`/rest/v1/user_profiles?select=*&email=eq.${encode(email)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return normalizeUserProfile(row, { ...fallback, email });
}

export async function updateSupabaseUserProfileByEmail(email, updates = {}, fallback = {}) {
  const currentRows = await supabaseRequest(`/rest/v1/user_profiles?select=*&email=eq.${encode(email)}&limit=1`);
  const current = Array.isArray(currentRows) ? currentRows[0] : null;

  const record = {
    email,
    full_name: updates.full_name ?? current?.full_name ?? fallback.full_name ?? 'Local Admin',
    avatar_url: updates.avatar_url ?? current?.avatar_url ?? fallback.avatar_url ?? '',
    bio: updates.bio ?? current?.bio ?? fallback.bio ?? '',
    favorite_game: updates.favorite_game ?? current?.favorite_game ?? fallback.favorite_game ?? ''
  };

  if (current?.id) {
    const rows = await supabaseRequest(`/rest/v1/user_profiles?id=eq.${encode(current.id)}`, {
      method: 'PATCH',
      body: record
    });
    return normalizeUserProfile(Array.isArray(rows) ? rows[0] : rows, { ...fallback, email });
  }

  const authUser = await ensureSupabaseAuthUserByEmail(email, fallback);
  if (!authUser?.id) {
    throw new Error(`Could not provision auth user for ${email}`);
  }

  const insertRecord = {
    ...record,
    id: authUser.id
  };

  const rows = await supabaseRequest('/rest/v1/user_profiles', {
    method: 'POST',
    body: insertRecord
  });
  return normalizeUserProfile(Array.isArray(rows) ? rows[0] : rows, { ...fallback, email });
}
