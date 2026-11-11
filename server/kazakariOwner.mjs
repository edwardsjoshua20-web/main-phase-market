import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

function normalizedEmails(value = '') {
  return new Set(String(value).split(',').map((item) => item.trim().toLowerCase()).filter(Boolean));
}

export function isKazakariAuthorized(actor, allowlistValue = '') {
  const email = String(actor?.email || actor?.profile?.email || actor?.user?.email || '').trim().toLowerCase();
  return Boolean(email) && normalizedEmails(allowlistValue).has(email);
}

export function sanitizeKazakariWatchRule(input = {}) {
  const minimumDiscount = Number(input.minimumDiscount ?? 50);
  if (!Number.isFinite(minimumDiscount) || minimumDiscount < 0 || minimumDiscount > 100) {
    const error = new Error('Minimum discount must be between 0 and 100.');
    error.status = 400;
    throw error;
  }
  const text = (value, maximum) => {
    const normalized = String(value ?? '').trim();
    return normalized ? normalized.slice(0, maximum) : null;
  };
  const name = text(input.name, 100);
  if (!name) {
    const error = new Error('Watch name is required.');
    error.status = 400;
    throw error;
  }
  return {
    name,
    enabled: input.enabled !== false,
    retailer: text(input.retailer, 40),
    category: text(input.category, 160),
    storeId: text(input.storeId, 40),
    productId: text(input.productId, 80),
    minimumDiscount,
    newlyDiscounted: input.newlyDiscounted !== false,
    priceDrops: input.priceDrops !== false,
    endOfClearance: input.endOfClearance !== false,
  };
}

function supabaseConfig(getEnvValue) {
  return {
    url: String(getEnvValue('SUPABASE_URL') || '').trim().replace(/\/+$/, ''),
    key: String(getEnvValue('SUPABASE_SERVICE_ROLE_KEY') || '').trim(),
  };
}

async function supabaseRequest(getEnvValue, resource, options = {}) {
  const { url, key } = supabaseConfig(getEnvValue);
  if (!url || !key) return null;
  const response = await fetch(`${url}/rest/v1/${resource}`, {
    ...options,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const responseText = await response.text();
  if (!response.ok) {
    const error = new Error(responseText || `Kazakari persistence request failed: ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return responseText ? JSON.parse(responseText) : null;
}

function readJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(temporary, filePath);
}

function normalizeWatchRow(row) {
  return {
    id: String(row.id),
    name: String(row.name),
    enabled: Boolean(row.enabled),
    retailer: row.retailer ?? null,
    category: row.category ?? null,
    storeId: row.store_id ?? row.storeId ?? null,
    productId: row.product_id ?? row.productId ?? null,
    minimumDiscount: Number(row.minimum_discount ?? row.minimumDiscount ?? 50),
    newlyDiscounted: Boolean(row.newly_discounted ?? row.newlyDiscounted),
    priceDrops: Boolean(row.price_drops ?? row.priceDrops),
    endOfClearance: Boolean(row.end_of_clearance ?? row.endOfClearance),
    createdAt: String(row.created_at ?? row.createdAt),
  };
}

export function createKazakariOwner({ getEnvValue, runtimeDataRoot }) {
  const localSnapshotPath = () => path.resolve(
    getEnvValue('KAZAKARI_SNAPSHOT_PATH') || path.join(process.cwd(), 'server', 'data', 'kazakari-preview.json')
  );
  const localWatchPath = path.join(runtimeDataRoot, 'kazakari-watch-rules.json');

  async function getSnapshot() {
    const filePath = localSnapshotPath();
    if (fs.existsSync(filePath)) return readJson(filePath, null);
    const rows = await supabaseRequest(getEnvValue, 'kazakari_preview_snapshots?select=payload,generated_at&id=eq.current&limit=1');
    const payload = Array.isArray(rows) ? rows[0]?.payload : null;
    if (!payload) {
      const error = new Error('The Kazakari preview snapshot is not configured.');
      error.status = 503;
      throw error;
    }
    return payload;
  }

  async function listWatches(actor) {
    if (actor.id !== 'local-admin' && actor.id !== 'local-test-user') {
      const rows = await supabaseRequest(
        getEnvValue,
        `kazakari_watch_rules?select=*&user_id=eq.${encodeURIComponent(actor.id)}&order=created_at.asc`
      );
      if (rows !== null) return rows.map(normalizeWatchRow);
    }
    return readJson(localWatchPath, []).filter((item) => item.userId === actor.id).map(normalizeWatchRow);
  }

  async function createWatch(actor, input) {
    const rule = sanitizeKazakariWatchRule(input);
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(), user_id: actor.id, name: rule.name, enabled: rule.enabled,
      retailer: rule.retailer, category: rule.category, store_id: rule.storeId, product_id: rule.productId,
      minimum_discount: rule.minimumDiscount, newly_discounted: rule.newlyDiscounted,
      price_drops: rule.priceDrops, end_of_clearance: rule.endOfClearance, created_at: now, updated_at: now,
    };
    if (actor.id !== 'local-admin' && actor.id !== 'local-test-user') {
      const rows = await supabaseRequest(getEnvValue, 'kazakari_watch_rules', {
        method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(record),
      });
      if (rows !== null) return normalizeWatchRow(Array.isArray(rows) ? rows[0] : rows);
    }
    const local = readJson(localWatchPath, []);
    local.push({ ...record, userId: actor.id });
    writeJsonAtomic(localWatchPath, local);
    return normalizeWatchRow(record);
  }

  async function deleteWatch(actor, id) {
    if (actor.id !== 'local-admin' && actor.id !== 'local-test-user') {
      const rows = await supabaseRequest(
        getEnvValue,
        `kazakari_watch_rules?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(actor.id)}`,
        { method: 'DELETE', headers: { Prefer: 'return=representation' } }
      );
      if (rows !== null) return Array.isArray(rows) && rows.length > 0;
    }
    const local = readJson(localWatchPath, []);
    const retained = local.filter((item) => !(String(item.id) === String(id) && item.userId === actor.id));
    if (retained.length === local.length) return false;
    writeJsonAtomic(localWatchPath, retained);
    return true;
  }

  return { getSnapshot, listWatches, createWatch, deleteWatch };
}
