import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const dataDir = path.resolve(process.cwd(), 'server', 'data');
const dbPath = path.join(dataDir, 'main-phase-market.db');

fs.mkdirSync(dataDir, { recursive: true });

export const db = new Database(dbPath, {
  timeout: 15000
});

db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 15000');

db.exec(`
  CREATE TABLE IF NOT EXISTS entity_records (
    entity_name TEXT NOT NULL,
    id TEXT NOT NULL,
    data TEXT NOT NULL,
    created_date TEXT NOT NULL,
    updated_date TEXT NOT NULL,
    PRIMARY KEY (entity_name, id)
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_entity_records_entity_created
  ON entity_records (entity_name, created_date DESC);
`);

export function getDbPath() {
  return dbPath;
}
