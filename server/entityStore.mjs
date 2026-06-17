import crypto from 'node:crypto';
import { db } from './db.mjs';

const selectByEntityStmt = db.prepare(`
  SELECT id, data, created_date, updated_date
  FROM entity_records
  WHERE entity_name = ?
`);

const selectByEntityIdStmt = db.prepare(`
  SELECT id, data, created_date, updated_date
  FROM entity_records
  WHERE entity_name = ? AND id = ?
`);

const upsertStmt = db.prepare(`
  INSERT INTO entity_records (entity_name, id, data, created_date, updated_date)
  VALUES (@entity_name, @id, @data, @created_date, @updated_date)
  ON CONFLICT(entity_name, id) DO UPDATE SET
    data = excluded.data,
    updated_date = excluded.updated_date
`);

const deleteStmt = db.prepare(`
  DELETE FROM entity_records
  WHERE entity_name = ? AND id = ?
`);

function parseRow(row) {
  const data = JSON.parse(row.data);
  return {
    ...data,
    id: data.id || row.id,
    created_date: data.created_date || row.created_date,
    updated_date: data.updated_date || row.updated_date
  };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

    return matchesCondition(record[key], value);
  });
}

function sortRecords(records, sort) {
  if (!sort) {
    return records;
  }

  const direction = sort.startsWith('-') ? -1 : 1;
  const field = sort.replace(/^-/, '');

  return [...records].sort((a, b) => compareValues(a[field], b[field]) * direction);
}

export function listEntities(entityName, { sort = '-created_date', limit, skip = 0 } = {}) {
  const rows = selectByEntityStmt.all(entityName).map(parseRow);
  const sorted = sortRecords(rows, sort);
  const start = Math.max(0, Number(skip) || 0);
  const end = limit ? start + Number(limit) : undefined;
  return sorted.slice(start, end);
}

export function filterEntities(entityName, filter, { sort = '-created_date', limit, skip = 0 } = {}) {
  const rows = listEntities(entityName, { sort, skip: 0 });
  const filtered = rows.filter((row) => matchesFilter(row, filter));
  const start = Math.max(0, Number(skip) || 0);
  const end = limit ? start + Number(limit) : undefined;
  return filtered.slice(start, end);
}

export function getEntityById(entityName, id) {
  const row = selectByEntityIdStmt.get(entityName, id);
  return row ? parseRow(row) : null;
}

export function createEntity(entityName, payload) {
  const timestamp = new Date().toISOString();
  const record = {
    ...payload,
    id: payload.id || crypto.randomUUID(),
    created_date: payload.created_date || timestamp,
    updated_date: timestamp
  };

  upsertStmt.run({
    entity_name: entityName,
    id: record.id,
    data: JSON.stringify(record),
    created_date: record.created_date,
    updated_date: record.updated_date
  });

  return record;
}

export function updateEntity(entityName, id, updates) {
  const current = getEntityById(entityName, id);
  if (!current) {
    throw new Error(`Record not found for ${entityName}:${id}`);
  }

  const next = {
    ...current,
    ...updates,
    id,
    updated_date: new Date().toISOString()
  };

  upsertStmt.run({
    entity_name: entityName,
    id,
    data: JSON.stringify(next),
    created_date: next.created_date,
    updated_date: next.updated_date
  });

  return next;
}

export function deleteEntity(entityName, id) {
  deleteStmt.run(entityName, id);
  return { success: true, id };
}

export function replaceEntityRows(entityName, rows) {
  const deleteAllStmt = db.prepare(`DELETE FROM entity_records WHERE entity_name = ?`);
  const transaction = db.transaction((records) => {
    deleteAllStmt.run(entityName);
    records.forEach((record) => {
      const timestamp = record.updated_date || record.created_date || new Date().toISOString();
      const normalized = {
        ...record,
        id: record.id || crypto.randomUUID(),
        created_date: record.created_date || timestamp,
        updated_date: record.updated_date || timestamp
      };

      upsertStmt.run({
        entity_name: entityName,
        id: normalized.id,
        data: JSON.stringify(normalized),
        created_date: normalized.created_date,
        updated_date: normalized.updated_date
      });
    });
  });

  transaction(rows);
}

export function normalizeEntityName(name) {
  return String(name || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
    .replace(/^./, (chr) => chr.toUpperCase());
}

export function buildRegexContains(value) {
  return { $regex: escapeRegex(value), $options: 'i' };
}
