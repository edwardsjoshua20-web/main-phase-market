import { requestPrivateLocalApi } from '@/services/providers/localBackend';

const fallbackSupabaseUrl = 'https://wwvvyrhlybwijqlhubdv.supabase.co';
const fallbackSupabaseAnonKey = 'sb_publishable_tWMznF-RAJFLR1XiQC7KEQ_VGoezQU9';
const sessionKey = 'mpm.supabase.session';
const runningOnLocalHost = typeof window !== 'undefined' && ['localhost', '127.0.0.1'].includes(window.location.hostname);

const supabaseUrl = String(
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_URL) || fallbackSupabaseUrl
).trim().replace(/\/+$/, '');

const supabaseAnonKey = String(
  (/** @type {{ env?: Record<string, string> }} */ (import.meta).env?.VITE_SUPABASE_ANON_KEY) || fallbackSupabaseAnonKey
).trim();

function getAccessToken() {
  if (typeof window === 'undefined') return '';
  try {
    return JSON.parse(window.localStorage.getItem(sessionKey) || 'null')?.access_token || '';
  } catch {
    return '';
  }
}

async function request(path, options = {}) {
  const token = getAccessToken();
  if (!token) {
    const error = new Error('Please sign in first.');
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch { payload = text; }
  }
  if (!response.ok) {
    const error = new Error(payload?.message || payload?.error || text || `Kazakari data request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function toWatch(row) {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    retailer: row.retailer,
    category: row.category,
    storeId: row.store_id,
    productId: row.product_id,
    minimumDiscount: row.minimum_discount == null ? null : Number(row.minimum_discount),
    newlyDiscounted: row.newly_discounted,
    priceDrops: row.price_drops,
    endOfClearance: row.end_of_clearance,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromWatch(rule) {
  return {
    name: rule.name,
    enabled: rule.enabled !== false,
    retailer: rule.retailer || null,
    category: rule.category || null,
    store_id: rule.storeId || null,
    product_id: rule.productId || null,
    minimum_discount: Number(rule.minimumDiscount ?? 50),
    newly_discounted: rule.newlyDiscounted !== false,
    price_drops: rule.priceDrops !== false,
    end_of_clearance: rule.endOfClearance !== false,
  };
}

export const kazakariApi = {
  async snapshot() {
    if (runningOnLocalHost) return requestPrivateLocalApi('/kazakari/snapshot');
    const rows = await request('kazakari_preview_snapshots?select=payload&id=eq.current&limit=1');
    if (!Array.isArray(rows) || !rows[0]?.payload) {
      const error = new Error('The Kazakari product snapshot is not available.');
      error.status = 404;
      throw error;
    }
    return rows[0].payload;
  },
  async watches() {
    if (runningOnLocalHost) return (await requestPrivateLocalApi('/kazakari/watches')).watches || [];
    const rows = await request('kazakari_watch_rules?select=*&order=created_at.asc');
    return Array.isArray(rows) ? rows.map(toWatch) : [];
  },
  async createWatch(rule) {
    if (runningOnLocalHost) {
      const result = await requestPrivateLocalApi('/kazakari/watches', { method: 'POST', body: JSON.stringify(rule) });
      return result.watch;
    }
    const rows = await request('kazakari_watch_rules?select=*', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(fromWatch(rule)),
    });
    return toWatch(rows[0]);
  },
  deleteWatch(id) {
    if (runningOnLocalHost) return requestPrivateLocalApi(`/kazakari/watches/${encodeURIComponent(id)}`, { method: 'DELETE' });
    return request(`kazakari_watch_rules?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
};
