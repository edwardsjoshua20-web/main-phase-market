import {
  canUseSupabaseFunctionForAction,
  hasSupabaseFunctionBridge,
  invokeSupabaseAction,
  uploadSupabaseFile
} from '@/services/supabaseFunctions';

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
const localAdminUser = {
  id: 'local-admin',
  full_name: 'Local Admin',
  email: 'admin@localhost',
  role: 'admin'
};

async function apiRequest(path, options = {}) {
  const response = await fetch(`${LOCAL_API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
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

const staticGuestMode = !normalizedApiOrigin && !runningOnLocalHost;
const hostedSupabaseMode = staticGuestMode && Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function getStoredSession() {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(SUPABASE_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('Failed to read Supabase session:', error);
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
        const user = await supabaseRequest('/auth/v1/user', {
          headers: { Authorization: `Bearer ${token}` }
        });
        return normalizeHostedUser(user);
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
        if (returnTo) params.set('returnTo', returnTo);
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
          return String(property) === 'CardList'
            ? createHostedCardListClient()
            : createHostedNoopEntityClient(String(property));
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
