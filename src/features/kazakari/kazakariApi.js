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

function getStoredSession() {
  if (typeof window === 'undefined') return '';
  try {
    return JSON.parse(window.localStorage.getItem(sessionKey) || 'null');
  } catch {
    return null;
  }
}

function getAccessToken() { return getStoredSession()?.access_token || ''; }

function tokenExpiresSoon(token) {
  try {
    const encoded = String(token).split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    const payload = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')));
    return !payload?.exp || Number(payload.exp) * 1000 <= Date.now() + 60_000;
  } catch { return true; }
}

let refreshPromise = null;
async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const current = getStoredSession();
    if (!current?.refresh_token) {
      const error = new Error('Your session expired. Please sign in again.');
      error.status = 401;
      throw error;
    }
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.access_token) {
      const error = new Error('Your session expired. Please sign in again.');
      error.status = 401;
      throw error;
    }
    const session = { ...current, ...payload };
    window.localStorage.setItem(sessionKey, JSON.stringify(session));
    return session.access_token;
  })().finally(() => { refreshPromise = null; });
  return refreshPromise;
}

async function validAccessToken() {
  const token = getAccessToken();
  if (!token) {
    const error = new Error('Please sign in first.');
    error.status = 401;
    throw error;
  }
  return tokenExpiresSoon(token) ? refreshAccessToken() : token;
}

async function request(path, options = {}) {
  const token = getAccessToken();
  if (!token) {
    const error = new Error('Please sign in first.');
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    cache: 'no-store',
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

async function invokeReleaseFunction(action) {
  const call = (token) => fetch(`${supabaseUrl}/functions/v1/kazakari-android-release`, {
    method: 'POST', headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
  });
  let response = await call(await validAccessToken());
  if (response.status === 401 && getStoredSession()?.refresh_token) response = await call(await refreshAccessToken());
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || `Android release request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return payload?.release || null;
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

function currentUserId() {
  const id = getStoredSession()?.user?.id;
  if (!id) { const error = new Error('Please sign in first.'); error.status = 401; throw error; }
  return id;
}

function toPriceObservation(row) {
  return { id: row.id, retailer: row.retailer, productId: row.product_identifier, upc: row.upc, productName: row.product_name,
    storeId: row.store_number, storeZip: row.store_zip, storeAddress: row.store_address, observedPrice: Number(row.observed_price),
    currency: row.currency, priceType: row.price_type, evidenceTier: row.evidence_tier, evidenceMethod: row.evidence_method,
    availabilityStatus: row.availability_status, observedAt: row.observed_at, collectedAt: row.collected_at,
    evidencePath: row.evidence_path, evidenceReference: row.evidence_reference, notes: row.notes, source: row.source };
}

export const kazakariApi = {
  androidRelease() {
    return invokeReleaseFunction('metadata');
  },
  androidDownload() {
    return invokeReleaseFunction('download');
  },
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
  async preferredStores() {
    const rows = await request('kazakari_preferred_stores?select=*&order=retailer,store_number');
    return Array.isArray(rows) ? rows.map((row) => ({ id: row.id, retailer: row.retailer, storeId: row.store_number, zip: row.zip_code, address: row.address })) : [];
  },
  async savePreferredStore(store) {
    const rows = await request('kazakari_preferred_stores?on_conflict=user_id,retailer,store_number&select=*', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: currentUserId(), retailer: store.retailer, store_number: store.storeId, zip_code: store.zip || null, address: store.address || null, updated_at: new Date().toISOString() }),
    });
    return rows?.[0] || null;
  },
  async priceObservations(barcode) {
    const safe = String(barcode || '').replace(/[^0-9]/g, '');
    if (!/^\d{8,14}$/.test(safe)) return [];
    const rows = await request(`kazakari_price_observations?select=*&upc=eq.${encodeURIComponent(safe)}&order=observed_at.desc&limit=50`);
    return Array.isArray(rows) ? rows.map(toPriceObservation) : [];
  },
  async uploadPriceEvidence(file) {
    const token = await validAccessToken();
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) throw new Error('Evidence must be a JPG, PNG, or WebP image under 10 MB.');
    const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `${currentUserId()}/${crypto.randomUUID()}.${extension}`;
    const response = await fetch(`${supabaseUrl}/storage/v1/object/kazakari-price-evidence/${path}`, { method: 'POST', headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}`, 'Content-Type': file.type, 'x-upsert': 'false' }, body: file });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.message || `Evidence upload failed: ${response.status}`);
    return path;
  },
  async createPriceObservation(input) {
    const rows = await request('kazakari_price_observations?select=*', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: currentUserId(), retailer: input.retailer, product_identifier: input.productId || null, upc: input.upc || null,
        product_name: input.productName || null, category: input.category || null, image_url: input.imageUrl || null, product_url: input.productUrl || null,
        store_number: input.storeId, store_zip: input.storeZip || null, store_address: input.storeAddress || null,
        observed_price: input.observedPrice, currency: 'USD', price_type: input.priceType, evidence_tier: input.evidenceTier,
        evidence_method: input.evidenceMethod, availability_status: input.availabilityStatus || 'unknown', observed_at: input.observedAt,
        evidence_path: input.evidencePath || null, evidence_reference: input.evidenceReference || null, notes: input.notes || null, source: 'family-submission' }),
    });
    return toPriceObservation(rows[0]);
  },
};
