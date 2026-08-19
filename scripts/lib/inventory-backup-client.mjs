import fs from 'node:fs';
import path from 'node:path';
import { readSupabaseUploadConfig } from './supabase-public-data-upload.mjs';

export function getSupabaseInventoryConfig(projectRoot = process.cwd()) {
  const config = readSupabaseUploadConfig(projectRoot);
  if (!config.supabaseUrl || !config.serviceRoleKey) {
    throw new Error('SUPABASE_URL/VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  }

  return {
    supabaseUrl: String(config.supabaseUrl).replace(/\/+$/, ''),
    serviceRoleKey: config.serviceRoleKey
  };
}

export function serviceHeaders(serviceRoleKey, extra = {}) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    ...extra
  };
}

export async function supabaseJsonRequest(config, relativePath, options = {}) {
  const response = await fetch(`${config.supabaseUrl}${relativePath}`, {
    ...options,
    headers: {
      ...serviceHeaders(config.serviceRoleKey),
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`Supabase request failed (${response.status}) ${relativePath}: ${text.slice(0, 500)}`);
  }
  return payload;
}

export async function createInventoryBackup(config, { reason = 'manual', createdBy = 'local-script' } = {}) {
  const backupId = await supabaseJsonRequest(config, '/rest/v1/rpc/create_inventory_backup', {
    method: 'POST',
    body: JSON.stringify({
      p_reason: reason,
      p_created_by: createdBy
    })
  });

  return typeof backupId === 'string' ? backupId : backupId?.id || backupId;
}

export async function restoreInventoryBackupItems(config, { backupId, entityIds, reason = 'manual-restore' } = {}) {
  if (!backupId) throw new Error('backupId is required.');
  if (!Array.isArray(entityIds) || entityIds.length === 0) {
    throw new Error('At least one explicit entity id is required for restore.');
  }

  return supabaseJsonRequest(config, '/rest/v1/rpc/restore_inventory_backup_items', {
    method: 'POST',
    body: JSON.stringify({
      p_backup_id: backupId,
      p_entity_ids: entityIds,
      p_reason: reason
    })
  });
}

export async function getInventoryBackupRun(config, backupId) {
  const rows = await supabaseJsonRequest(
    config,
    `/rest/v1/inventory_backup_runs?select=*&id=eq.${encodeURIComponent(backupId)}&limit=1`
  );
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function getInventoryBackupItems(config, backupId, entityId = null) {
  const params = new URLSearchParams({
    select: '*',
    backup_id: `eq.${backupId}`,
    order: 'entity_name.asc,entity_id.asc'
  });
  if (entityId) {
    params.set('entity_id', `eq.${entityId}`);
  }
  return supabaseJsonRequest(config, `/rest/v1/inventory_backup_items?${params.toString()}`);
}

export async function getInventoryEntity(config, entityName, entityId) {
  const params = new URLSearchParams({
    select: '*',
    entity_name: `eq.${entityName}`,
    id: `eq.${entityId}`,
    limit: '1'
  });
  const rows = await supabaseJsonRequest(config, `/rest/v1/app_entities?${params.toString()}`);
  return Array.isArray(rows) ? rows[0] || null : null;
}

export async function upsertInventoryEntity(config, row) {
  return supabaseJsonRequest(config, '/rest/v1/app_entities', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify(row)
  });
}

export async function patchInventoryEntityData(config, entityName, entityId, data) {
  const params = new URLSearchParams({
    entity_name: `eq.${entityName}`,
    id: `eq.${entityId}`
  });
  return supabaseJsonRequest(config, `/rest/v1/app_entities?${params.toString()}`, {
    method: 'PATCH',
    headers: {
      Prefer: 'return=representation'
    },
    body: JSON.stringify({
      data,
      updated_date: new Date().toISOString()
    })
  });
}

export async function deleteInventoryEntity(config, entityName, entityId) {
  const params = new URLSearchParams({
    entity_name: `eq.${entityName}`,
    id: `eq.${entityId}`
  });
  return supabaseJsonRequest(config, `/rest/v1/app_entities?${params.toString()}`, {
    method: 'DELETE',
    headers: {
      Prefer: 'return=representation'
    }
  });
}

export async function getInventoryAuditRows(config, entityId) {
  const params = new URLSearchParams({
    select: '*',
    entity_id: `eq.${entityId}`,
    order: 'changed_at.desc',
    limit: '20'
  });
  return supabaseJsonRequest(config, `/rest/v1/inventory_mutation_audit?${params.toString()}`);
}

export function writeJsonArtifact(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}
