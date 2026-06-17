import {
  canUseSupabaseFunctionForAction,
  hasSupabaseFunctionBridge,
  invokeSupabaseAction,
  uploadSupabaseFile
} from '@/services/supabaseFunctions';

const rawApiOrigin =
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_API_ORIGIN) ||
  '';

const normalizedApiOrigin = String(rawApiOrigin || '').trim().replace(/\/+$/, '');
const LOCAL_API_BASE = normalizedApiOrigin ? `${normalizedApiOrigin}/api/local` : '/api/local';
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

export const localBackend = {
  app: {
    hasSessionToken() {
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
      return Promise.resolve(!staticGuestMode);
    },
    getCurrentUser() {
      if (staticGuestMode) {
        return Promise.resolve(null);
      }
      return apiRequest('/auth/me');
    },
    redirectToLogin() {
      return Promise.resolve();
    },
    logout() {
      return apiRequest('/auth/logout', { method: 'POST' });
    },
    updateProfile(updates) {
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
