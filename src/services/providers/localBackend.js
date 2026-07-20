import {
  canUseSupabaseFunctionForAction,
  hasSupabaseFunctionBridge,
  invokeSupabaseAction,
  uploadSupabaseFile
} from '@/services/supabaseFunctions';
import { getSiteAssetUrl } from '@/config/publicAssetUrls';
import { fetchJsonWithEmbeddedFallback, getEmbeddedSystemHealth } from '@/services/siteStaticSnapshots';

const fallbackSupabaseUrl = 'https://wwvvyrhlybwijqlhubdv.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_tWMznF-RAJFLR1XiQC7KEQ_VGoezQU9';

const rawApiOrigin =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_API_ORIGIN) ||
  '';

const rawSupabaseUrl =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_URL) ||
  fallbackSupabaseUrl;

const rawSupabaseAnonKey =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_ANON_KEY) ||
  fallbackSupabaseAnonKey;

const normalizedApiOrigin = String(rawApiOrigin || '').trim().replace(/\/+$/, '');
const LOCAL_API_BASE = normalizedApiOrigin ? `${normalizedApiOrigin}/api/local` : '/api/local';
const SUPABASE_URL = String(rawSupabaseUrl || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(rawSupabaseAnonKey || '').trim();
const SUPABASE_SESSION_KEY = 'mpm.supabase.session';
const CANONICAL_HOST = 'www.mainphasemarket.net';
const SUPPORTED_PUBLIC_HOSTS = new Set(['mainphasemarket.net', 'www.mainphasemarket.net']);
const localAdminUser = {
  id: 'local-admin',
  full_name: 'Local Admin',
  email: 'admin@localhost',
  role: 'admin'
};

async function apiRequest(path, options = {}) {
  const sessionToken = getSessionToken();
  const response = await fetch(`${LOCAL_API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(errorText || `Local backend request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

async function fetchStaticSystemHealth() {
  const payload = await fetchJsonWithEmbeddedFallback(
    getSiteAssetUrl('system-health.json'),
    getEmbeddedSystemHealth(),
    { cache: 'no-store', bustCache: true }
  );
  return {
    systemHealth: payload
  };
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

function createEntityClient(entityName) {
  const encoded = encodeURIComponent(entityName);

  return {
    list(sort = '-created_date', limit, skip) {
      const params = new URLSearchParams();
      if (sort) params.set('sort', sort);
      if (limit !== undefined) params.set('limit', String(limit));
      if (skip !== undefined) params.set('skip', String(skip));
      return apiRequest(`/entities/${encoded}/list?${params.toString()}`);
    },
    filter(filter = {}, sort = '-created_date', limit, skip) {
      return apiRequest(`/entities/${encoded}/filter`, {
        method: 'POST',
        body: JSON.stringify({ filter, sort, limit, skip })
      });
    },
    create(data) {
      return apiRequest(`/entities/${encoded}`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    update(id, data) {
      return apiRequest(`/entities/${encoded}/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(data)
      });
    },
    delete(id) {
      return apiRequest(`/entities/${encoded}/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
    }
  };
}

const runningOnLocalHost = (() => {
  if (typeof window === 'undefined') {
    return true;
  }
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
})();

const hostedPublicHost = (() => {
  if (typeof window === 'undefined') {
    return false;
  }
  return SUPPORTED_PUBLIC_HOSTS.has(window.location.hostname);
})();
const hostedSupabaseMode = hostedPublicHost && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const staticGuestMode = !normalizedApiOrigin && !runningOnLocalHost && !hostedSupabaseMode;
const hostedStaticDataMode = hostedSupabaseMode && !normalizedApiOrigin;

function buildHostedAutomationControlUnavailable() {
  const activationContract = [
    {
      id: 'backend-host',
      label: 'Backend host',
      value: 'Render service running npm run ops:serve',
      proof: '/api/local/health returns ok'
    },
    {
      id: 'cloudflare-origin',
      label: 'Cloudflare Pages',
      value: 'VITE_API_ORIGIN=https://<render-service>.onrender.com',
      proof: 'Hosted Admin Operations can reach /api/local/admin/automation/control-status'
    },
    {
      id: 'backend-env',
      label: 'Backend env',
      value: 'ALLOW_REMOTE_CONNECTIONS=true, PUBLIC_APP_URL=https://mainphasemarket.net',
      proof: 'Remote bridge readiness check reports remote connections ok'
    },
    {
      id: 'admin-proof',
      label: 'Proof command',
      value: 'npm run ops:check -- --origin https://<render-service>.onrender.com --token <admin-token>',
      proof: 'health ok and automation controls available'
    }
  ];

  return {
    available: false,
    mode: 'hosted-static',
    reason: 'Manual automation controls require the operations backend bridge.',
    scheduler: {
      enabled: false,
      configured: false,
      intervalMs: null,
      startedAt: null,
      lastCheckedAt: null,
      lastTriggeredAt: null,
      checks: 0,
      dueJobs: [],
      jobs: []
    },
    bridge: {
      configured: Boolean(normalizedApiOrigin),
      apiOrigin: normalizedApiOrigin || null,
      activationContract,
      expectedVariable: 'VITE_API_ORIGIN',
      expectedEndpoints: [
        '/api/local/health',
        '/api/local/ops/bridge-readiness',
        '/api/local/admin/automation/control-status',
        '/api/local/admin/automation/:jobId/run'
      ],
      checks: [
        {
          id: 'manual-runner',
          label: 'Manual runner bridge',
          status: 'degraded',
          detail: 'Hosted static mode can read reports, but cannot execute Node automation jobs directly.'
        },
        {
          id: 'audit-log',
          label: 'Audit trail',
          status: 'degraded',
          detail: 'Run audit history requires the operations backend bridge.'
        },
        {
          id: 'single-run-locks',
          label: 'Single-run locks',
          status: 'degraded',
          detail: 'Duplicate-run lock verification requires the operations backend bridge.'
        },
        {
          id: 'dependency-preflight',
          label: 'Dependency preflight',
          status: 'degraded',
          detail: 'Dependency-safe manual runs require the operations backend bridge.'
        },
        {
          id: 'scheduler-map',
          label: 'Scheduler map',
          status: 'degraded',
          detail: 'Autopilot scheduler visibility requires the operations backend bridge.'
        }
      ],
      nextSteps: [
        'Deploy the Node operations backend from render.yaml or another Node-capable host.',
        'Set VITE_API_ORIGIN on Cloudflare Pages to the backend origin.',
        'Redeploy Cloudflare Pages so the hosted admin page uses the bridge.',
        'Verify the bridge with npm.cmd run ops:check -- --origin <backend-origin> --token <admin-token>.'
      ]
    }
  };
}

async function fetchHostedAutomationControlStatus() {
  const token = requireHostedSession();
  const response = await fetch(`${SUPABASE_URL}/functions/v1/automation-status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`
    },
    body: '{}'
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(payload?.error || `Automation status request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function getStoredSession() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SUPABASE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to read Supabase session:', error);
    window.localStorage.removeItem(SUPABASE_SESSION_KEY);
    return null;
  }
}

function storeSession(session) {
  if (typeof window === 'undefined') return;

  if (!session?.access_token) {
    window.localStorage.removeItem(SUPABASE_SESSION_KEY);
    return;
  }

  window.localStorage.setItem(SUPABASE_SESSION_KEY, JSON.stringify(session));
}

function getSessionToken() {
  return getStoredSession()?.access_token || '';
}

function normalizeHostedReturnPath(returnTo) {
  if (typeof window === 'undefined') {
    return '/';
  }

  try {
    const resolved = new URL(returnTo || '/', window.location.origin);
    if (!SUPPORTED_PUBLIC_HOSTS.has(resolved.hostname)) {
      return '/';
    }
    return `${resolved.pathname || '/'}${resolved.search || ''}${resolved.hash || ''}` || '/';
  } catch {
    return '/';
  }
}

export function getCanonicalHostedUrl(pathname = '/') {
  const normalizedPath = String(pathname || '/').trim() || '/';
  if (normalizedPath.startsWith('http://') || normalizedPath.startsWith('https://')) {
    try {
      const resolved = new URL(normalizedPath);
      return `https://${CANONICAL_HOST}${resolved.pathname || '/'}${resolved.search || ''}${resolved.hash || ''}`;
    } catch {
      return `https://${CANONICAL_HOST}/`;
    }
  }
  return `https://${CANONICAL_HOST}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
}

function requireHostedSession() {
  const token = getSessionToken();
  if (!token) {
    const error = new Error('Please sign in first.');
    error.status = 401;
    throw error;
  }
  return token;
}

async function supabaseRequest(path, options = {}) {
  const token = options.auth === false ? '' : getSessionToken();
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    let message = text || `Supabase request failed: ${response.status}`;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error_description || parsed.message || parsed.msg || message;
    } catch {
      // Keep the raw text when Supabase did not send JSON.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function normalizeHostedUser(user) {
  if (!user) return null;
  const metadata = user.user_metadata || {};
  return {
    id: user.id,
    email: user.email || '',
    full_name: metadata.full_name || metadata.name || user.email || 'Member',
    role: metadata.role || 'member',
    avatar_url: metadata.avatar_url || '',
    bio: metadata.bio || '',
    favorite_game: metadata.favorite_game || ''
  };
}

function commanderNameFromItems(items = []) {
  return items.find((item) => item?.is_commander)?.product_name || null;
}

function normalizeHostedDeck(row) {
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
    source: row.source || payload.source || 'supabase-browser',
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_date: row.created_at,
    updated_date: row.updated_at
  };
}

function buildHostedDeckRecord(payload, existing = null) {
  const sessionUser = getStoredSession()?.user || {};
  const basePayload = existing?.deck_payload && typeof existing.deck_payload === 'object'
    ? { ...existing.deck_payload }
    : {};

  const ownerEmail = payload.user_email || existing?.owner_email || basePayload.user_email || sessionUser.email || '';
  const mergedPayload = {
    ...basePayload,
    ...payload,
    items: Array.isArray(payload.items) ? payload.items : (basePayload.items || []),
    estimated_cost: payload.estimated_cost ?? basePayload.estimated_cost ?? 0,
    description: payload.description ?? basePayload.description ?? '',
    user_email: ownerEmail
  };

  return {
    user_id: existing?.user_id || sessionUser.id || null,
    owner_email: ownerEmail,
    name: payload.name ?? existing?.name ?? basePayload.name ?? 'Untitled Deck',
    game: payload.game ?? existing?.game ?? basePayload.game ?? 'mtg',
    format: payload.deck_format ?? existing?.format ?? basePayload.deck_format ?? 'casual',
    commander_name: commanderNameFromItems(mergedPayload.items),
    source: payload.source ?? existing?.source ?? basePayload.source ?? 'supabase-browser',
    tags: Array.isArray(payload.tags) ? payload.tags : (existing?.tags || []),
    deck_payload: mergedPayload
  };
}

async function getHostedDeckRow(id) {
  requireHostedSession();
  const rows = await supabaseRequest(`/rest/v1/saved_decks?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  return Array.isArray(rows) ? rows[0] : null;
}

function createHostedCardListClient() {
  return {
    async list(sort = '-created_date', limit, skip) {
      return this.filter({}, sort, limit, skip);
    },
    async filter(filter = {}, sort = '-created_date', limit, skip = 0) {
      requireHostedSession();
      const params = new URLSearchParams();
      params.set('select', '*');

      const email = filter.user_email || getStoredSession()?.user?.email || '';
      if (email) params.set('owner_email', `eq.${email}`);

      const ascending = !String(sort || '').startsWith('-');
      const sortField = String(sort || '-created_date').replace(/^-/, '');
      const remoteSortField = sortField === 'updated_date'
        ? 'updated_at'
        : sortField === 'created_date'
          ? 'created_at'
          : 'created_at';
      params.set('order', `${remoteSortField}.${ascending ? 'asc' : 'desc'}`);

      if (limit !== undefined && limit !== null) {
        params.set('limit', String(Number(limit)));
        params.set('offset', String(Math.max(0, Number(skip) || 0)));
      }

      const rows = await supabaseRequest(`/rest/v1/saved_decks?${params.toString()}`);
      return (rows || []).map(normalizeHostedDeck);
    },
    async create(data) {
      requireHostedSession();
      const record = buildHostedDeckRecord(data || {});
      const rows = await supabaseRequest('/rest/v1/saved_decks', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      return normalizeHostedDeck(Array.isArray(rows) ? rows[0] : rows);
    },
    async update(id, data) {
      requireHostedSession();
      const current = await getHostedDeckRow(id);
      if (!current) {
        throw new Error(`Record not found for CardList:${id}`);
      }

      const record = buildHostedDeckRecord(data || {}, current);
      const rows = await supabaseRequest(`/rest/v1/saved_decks?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      return normalizeHostedDeck(Array.isArray(rows) ? rows[0] : rows);
    },
    async delete(id) {
      requireHostedSession();
      await supabaseRequest(`/rest/v1/saved_decks?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      return { success: true, id };
    }
  };
}

function encodeHostedFilterValue(value) {
  return encodeURIComponent(String(value ?? ''));
}

function normalizeHostedEntityRow(row) {
  const data = row?.data && typeof row.data === 'object' ? row.data : {};
  return {
    ...data,
    id: row?.id || data.id,
    created_date: data.created_date || row?.created_date || null,
    updated_date: data.updated_date || row?.updated_date || null
  };
}

function buildHostedEntityRecord(entityName, payload = {}, existing = null) {
  const timestamp = new Date().toISOString();
  const id = payload?.id || existing?.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `entity-${Date.now()}`);
  const createdDate = payload?.created_date || existing?.created_date || timestamp;
  const updatedDate = timestamp;
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

function getHostedSortValue(row, field) {
  const value = row?.[field];
  if (value == null) return '';
  if (typeof value === 'number') return value;
  return String(value).toLowerCase();
}

function sortHostedRows(rows, sort = '-created_date') {
  const descending = String(sort || '').startsWith('-');
  const field = String(sort || '-created_date').replace(/^-/, '') || 'created_date';

  return [...rows].sort((a, b) => {
    const aValue = getHostedSortValue(a, field);
    const bValue = getHostedSortValue(b, field);

    if (aValue === bValue) {
      return String(a?.id || '').localeCompare(String(b?.id || ''));
    }

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return descending ? bValue - aValue : aValue - bValue;
    }

    return descending
      ? String(bValue).localeCompare(String(aValue))
      : String(aValue).localeCompare(String(bValue));
  });
}

function matchesHostedFilterValue(rowValue, filterValue) {
  if (filterValue && typeof filterValue === 'object' && !Array.isArray(filterValue)) {
    if ('$regex' in filterValue) {
      const pattern = String(filterValue.$regex || '');
      const flags = String(filterValue.$options || '');
      try {
        return new RegExp(pattern, flags).test(String(rowValue || ''));
      } catch {
        return false;
      }
    }
  }

  if (Array.isArray(filterValue)) {
    return filterValue.includes(rowValue);
  }

  return rowValue === filterValue;
}

function matchesHostedFilter(row, filter = {}) {
  return Object.entries(filter || {}).every(([key, value]) => matchesHostedFilterValue(row?.[key], value));
}

function createHostedEntityClient(entityName) {
  return {
    async list(sort = '-created_date', limit, skip) {
      return this.filter({}, sort, limit, skip);
    },
    async filter(filter = {}, sort = '-created_date', limit, skip = 0) {
      requireHostedSession();
      const params = new URLSearchParams();
      params.set('select', '*');
      params.set('entity_name', `eq.${encodeHostedFilterValue(entityName)}`);
      params.set('order', 'created_date.desc');

      const rows = await supabaseRequest(`/rest/v1/app_entities?${params.toString()}`);
      const filteredRows = (rows || [])
        .map(normalizeHostedEntityRow)
        .filter((row) => matchesHostedFilter(row, filter));
      const sortedRows = sortHostedRows(filteredRows, sort);
      const safeSkip = Math.max(0, Number(skip) || 0);
      const safeLimit = limit == null ? undefined : Math.max(0, Number(limit) || 0);

      return safeLimit == null
        ? sortedRows.slice(safeSkip)
        : sortedRows.slice(safeSkip, safeSkip + safeLimit);
    },
    async create(data) {
      requireHostedSession();
      const record = buildHostedEntityRecord(entityName, data || {});
      const rows = await supabaseRequest('/rest/v1/app_entities', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(record)
      });
      return normalizeHostedEntityRow(Array.isArray(rows) ? rows[0] : rows);
    },
    async update(id, data) {
      requireHostedSession();
      const currentRows = await supabaseRequest(
        `/rest/v1/app_entities?select=*&entity_name=eq.${encodeHostedFilterValue(entityName)}&id=eq.${encodeHostedFilterValue(id)}&limit=1`
      );
      const currentRow = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!currentRow) {
        throw new Error(`Record not found for ${entityName}:${id}`);
      }

      const current = normalizeHostedEntityRow(currentRow);
      const record = buildHostedEntityRecord(entityName, { ...(data || {}), id }, current);
      const rows = await supabaseRequest(
        `/rest/v1/app_entities?entity_name=eq.${encodeHostedFilterValue(entityName)}&id=eq.${encodeHostedFilterValue(id)}`,
        {
          method: 'PATCH',
          headers: { Prefer: 'return=representation' },
          body: JSON.stringify({
            created_date: record.created_date,
            updated_date: record.updated_date,
            data: record.data
          })
        }
      );

      return normalizeHostedEntityRow(Array.isArray(rows) ? rows[0] : rows);
    },
    async delete(id) {
      requireHostedSession();
      await supabaseRequest(
        `/rest/v1/app_entities?entity_name=eq.${encodeHostedFilterValue(entityName)}&id=eq.${encodeHostedFilterValue(id)}`,
        { method: 'DELETE' }
      );
      return { success: true, id };
    }
  };
}

function normalizeHostedForumPost(row) {
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

function buildHostedForumPostRecord(payload, existing = null) {
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
    is_solved: payload.is_solved ?? existing?.is_solved ?? false,
    view_count: payload.view_count ?? existing?.view_count ?? 0,
    reply_count: payload.reply_count ?? existing?.reply_count ?? 0,
    likes: payload.likes ?? existing?.likes ?? 0,
    liked_by: Array.isArray(payload.liked_by) ? payload.liked_by : (existing?.liked_by || [])
  };

  if (payload.last_reply_at ?? existing?.last_reply_at) {
    record.last_reply_at = payload.last_reply_at ?? existing?.last_reply_at;
  }
  if (payload.last_reply_by ?? existing?.last_reply_by) {
    record.last_reply_by = payload.last_reply_by ?? existing?.last_reply_by;
  }

  return record;
}

function createHostedForumPostClient() {
  return {
    async list(sort = '-created_date', limit, skip) {
      return this.filter({}, sort, limit, skip);
    },
    async filter(filter = {}, sort = '-created_date', limit, skip = 0) {
      requireHostedSession();
      const params = new URLSearchParams();
      params.set('select', '*');

      if (filter?.id) params.set('id', `eq.${encodeHostedFilterValue(filter.id)}`);
      if (filter?.game) params.set('game', `eq.${encodeHostedFilterValue(filter.game)}`);
      if (filter?.category) params.set('category', `eq.${encodeHostedFilterValue(filter.category)}`);
      if (filter?.author_email) params.set('author_email', `eq.${encodeHostedFilterValue(filter.author_email)}`);

      const ascending = !String(sort || '').startsWith('-');
      const field = String(sort || '-created_date').replace(/^-/, '');
      const remoteField = field === 'likes'
        ? 'likes'
        : field === 'updated_date'
          ? 'updated_at'
          : field === 'last_reply_at'
            ? 'last_reply_at'
            : 'created_at';
      params.set('order', `${remoteField}.${ascending ? 'asc' : 'desc'}`);

      if (limit !== undefined && limit !== null) {
        params.set('offset', String(Math.max(0, Number(skip) || 0)));
        params.set('limit', String(Number(limit)));
      }

      const rows = await supabaseRequest(`/rest/v1/forum_threads?${params.toString()}`);
      return (rows || []).map(normalizeHostedForumPost);
    },
    async create(data) {
      requireHostedSession();
      const rows = await supabaseRequest('/rest/v1/forum_threads', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(buildHostedForumPostRecord(data || {}))
      });
      return normalizeHostedForumPost(Array.isArray(rows) ? rows[0] : rows);
    },
    async update(id, data) {
      requireHostedSession();
      const currentRows = await supabaseRequest(`/rest/v1/forum_threads?select=*&id=eq.${encodeHostedFilterValue(id)}&limit=1`);
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) {
        throw new Error(`Record not found for ForumPost:${id}`);
      }

      const rows = await supabaseRequest(`/rest/v1/forum_threads?id=eq.${encodeHostedFilterValue(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(buildHostedForumPostRecord(data || {}, current))
      });
      return normalizeHostedForumPost(Array.isArray(rows) ? rows[0] : rows);
    },
    async delete(id) {
      requireHostedSession();
      await supabaseRequest(`/rest/v1/forum_threads?id=eq.${encodeHostedFilterValue(id)}`, {
        method: 'DELETE'
      });
      return { success: true, id };
    }
  };
}

function normalizeHostedForumReply(row) {
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

function buildHostedForumReplyRecord(payload, existing = null) {
  return {
    thread_id: payload.post_id ?? existing?.thread_id ?? null,
    author_id: payload.author_id ?? existing?.author_id ?? null,
    author_name: payload.author_name ?? existing?.author_name ?? '',
    author_email: payload.author_email ?? existing?.author_email ?? '',
    content: payload.content ?? existing?.content ?? '',
    likes: payload.likes ?? existing?.likes ?? 0,
    liked_by: Array.isArray(payload.liked_by) ? payload.liked_by : (existing?.liked_by || []),
    is_accepted_answer: payload.is_accepted_answer ?? existing?.is_accepted_answer ?? false
  };
}

function createHostedForumReplyClient() {
  return {
    async list(sort = 'created_date', limit, skip) {
      return this.filter({}, sort, limit, skip);
    },
    async filter(filter = {}, sort = 'created_date', limit, skip = 0) {
      requireHostedSession();
      const params = new URLSearchParams();
      params.set('select', '*');
      if (filter?.post_id) params.set('thread_id', `eq.${encodeHostedFilterValue(filter.post_id)}`);
      if (filter?.id) params.set('id', `eq.${encodeHostedFilterValue(filter.id)}`);

      const ascending = !String(sort || '').startsWith('-');
      const remoteField = String(sort || 'created_date').replace(/^-/, '') === 'updated_date' ? 'updated_at' : 'created_at';
      params.set('order', `${remoteField}.${ascending ? 'asc' : 'desc'}`);

      if (limit !== undefined && limit !== null) {
        params.set('offset', String(Math.max(0, Number(skip) || 0)));
        params.set('limit', String(Number(limit)));
      }

      const rows = await supabaseRequest(`/rest/v1/forum_replies?${params.toString()}`);
      return (rows || []).map(normalizeHostedForumReply);
    },
    async create(data) {
      requireHostedSession();
      const rows = await supabaseRequest('/rest/v1/forum_replies', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(buildHostedForumReplyRecord(data || {}))
      });
      return normalizeHostedForumReply(Array.isArray(rows) ? rows[0] : rows);
    },
    async update(id, data) {
      requireHostedSession();
      const currentRows = await supabaseRequest(`/rest/v1/forum_replies?select=*&id=eq.${encodeHostedFilterValue(id)}&limit=1`);
      const current = Array.isArray(currentRows) ? currentRows[0] : null;
      if (!current) {
        throw new Error(`Record not found for ForumReply:${id}`);
      }

      const rows = await supabaseRequest(`/rest/v1/forum_replies?id=eq.${encodeHostedFilterValue(id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(buildHostedForumReplyRecord(data || {}, current))
      });
      return normalizeHostedForumReply(Array.isArray(rows) ? rows[0] : rows);
    },
    async delete(id) {
      requireHostedSession();
      await supabaseRequest(`/rest/v1/forum_replies?id=eq.${encodeHostedFilterValue(id)}`, {
        method: 'DELETE'
      });
      return { success: true, id };
    }
  };
}

function createHostedNoopEntityClient(entityName) {
  return {
    list() {
      return Promise.resolve([]);
    },
    filter() {
      return Promise.resolve([]);
    },
    create() {
      return Promise.reject(new Error(`${entityName} is not writable on the hosted frontend yet.`));
    },
    update() {
      return Promise.reject(new Error(`${entityName} is not writable on the hosted frontend yet.`));
    },
    delete() {
      return Promise.reject(new Error(`${entityName} is not writable on the hosted frontend yet.`));
    }
  };
}

export const localBackend = {
  app: {
    hasSessionToken() {
      if (hostedSupabaseMode) {
        return Boolean(getSessionToken());
      }
      return !staticGuestMode;
    },
    getHealthStatus() {
      if (hostedStaticDataMode) {
        return fetchStaticSystemHealth();
      }
      return apiRequest('/health');
    },
    getAutomationControlStatus() {
      if (hostedStaticDataMode) {
        return fetchHostedAutomationControlStatus();
      }
      return apiRequest('/admin/automation/control-status');
    },
    runAutomationJob(jobId) {
      if (hostedStaticDataMode) {
        return Promise.reject(new Error('Manual automation controls require the operations backend bridge.'));
      }
      return apiRequest(`/admin/automation/${encodeURIComponent(jobId)}/run`, {
        method: 'POST',
        body: JSON.stringify({ actor: localAdminUser.email })
      });
    },
    getPublicSettings() {
      return Promise.resolve({
        app_name: 'Main Phase Market',
        auth_required: false,
        backend_provider: 'local'
      });
    }
  },
  auth: {
    isAuthenticated() {
      if (hostedSupabaseMode) {
        return Promise.resolve(Boolean(getSessionToken()));
      }
      return Promise.resolve(!staticGuestMode);
    },
    async getCurrentUser() {
      if (hostedSupabaseMode) {
        const token = requireHostedSession();
        try {
          const user = await supabaseRequest('/auth/v1/user', {
            headers: { Authorization: `Bearer ${token}` }
          });
          return normalizeHostedUser(user);
        } catch (error) {
          if (error?.status === 401 || error?.status === 403) {
            storeSession(null);
          }
          throw error;
        }
      }
      if (staticGuestMode) {
        return Promise.resolve(null);
      }
      return apiRequest('/auth/me');
    },
    async signIn({ email, password } = {}) {
      if (!hostedSupabaseMode) {
        throw new Error('Hosted sign-in is not available in local backend mode.');
      }
      const result = await supabaseRequest('/auth/v1/token?grant_type=password', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email, password })
      });
      storeSession(result);
      return normalizeHostedUser(result.user);
    },
    async signUp({ email, password, full_name } = {}) {
      if (!hostedSupabaseMode) {
        throw new Error('Hosted sign-up is not available in local backend mode.');
      }
      const result = await supabaseRequest('/auth/v1/signup', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({
          email,
          password,
          data: { full_name }
        })
      });
      if (result?.access_token) {
        storeSession(result);
        return normalizeHostedUser(result.user);
      }
      return null;
    },
    redirectToLogin(returnTo) {
      if (hostedSupabaseMode && typeof window !== 'undefined') {
        const params = new URLSearchParams();
        params.set('returnTo', normalizeHostedReturnPath(returnTo));
        window.location.href = `/MemberLogin?${params.toString()}`;
      }
      return Promise.resolve();
    },
    logout() {
      if (hostedSupabaseMode) {
        storeSession(null);
        return Promise.resolve({ success: true });
      }
      return apiRequest('/auth/logout', { method: 'POST' });
    },
    async updateProfile(updates) {
      if (hostedSupabaseMode) {
        const token = requireHostedSession();
        const current = getStoredSession();
        const mergedMetadata = {
          ...(current?.user?.user_metadata || {}),
          ...(updates || {})
        };
        const user = await supabaseRequest('/auth/v1/user', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ data: mergedMetadata })
        });
        storeSession({
          ...current,
          user: {
            ...(current?.user || {}),
            ...user
          }
        });
        return normalizeHostedUser(user);
      }
      return apiRequest('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(updates || {})
      });
    }
  },
  data: new Proxy(
    {},
    {
      get(_target, property) {
        if (hostedSupabaseMode) {
          const entityName = String(property);
          if (entityName === 'CardList') return createHostedCardListClient();
          if (entityName === 'ForumPost') return createHostedForumPostClient();
          if (entityName === 'ForumReply') return createHostedForumReplyClient();
          return createHostedEntityClient(entityName);
        }
        return createEntityClient(String(property));
      }
    }
  ),
  actions: {
    async invoke(name, payload = {}) {
      if (!name) {
        throw new Error('Local backend action name is required.');
      }

      if (hasSupabaseFunctionBridge() && canUseSupabaseFunctionForAction(name)) {
        return invokeSupabaseAction(name, payload);
      }

      return apiRequest(`/actions/${encodeURIComponent(String(name))}`, {
        method: 'POST',
        body: JSON.stringify(payload || {})
      });
    }
  },
  files: {
    async upload({ file }) {
      if (!file) {
        throw new Error('No file provided.');
      }

      const data = await readFileAsDataUrl(file);
      if (hasSupabaseFunctionBridge()) {
        return uploadSupabaseFile({
          filename: file.name || 'upload',
          type: file.type || 'application/octet-stream',
          data
        });
      }

      return apiRequest('/files/upload', {
        method: 'POST',
        body: JSON.stringify({
          filename: file.name || 'upload',
          type: file.type || 'application/octet-stream',
          data
        })
      });
    }
  },
  ai: {
    async invoke() {
      throw new Error('Local AI actions are not implemented yet.');
    }
  },
  email: {
    async send() {
      throw new Error('Local email sending is not implemented yet.');
    }
  },
  activity: {
    async logPageView() {
      return { success: true };
    }
  }
};

