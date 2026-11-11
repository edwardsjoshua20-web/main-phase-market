import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildKazakariSnapshot, writeKazakariSnapshot } from './build-kazakari-preview-snapshot.mjs';
import { createKazakariOwner, isKazakariAuthorized, sanitizeKazakariWatchRule } from '../server/kazakariOwner.mjs';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.runtime', 'kazakari-preview-tests');
const snapshotPath = path.join(testRoot, 'snapshot.json');
fs.mkdirSync(testRoot, { recursive: true });

const snapshot = buildKazakariSnapshot({ generatedAt: '2026-11-11T20:00:00.000Z' });
assert.equal(snapshot.schemaVersion, 1);
assert.equal(snapshot.summary.activePublications, 2);
assert.equal(snapshot.summary.currentProducts, 298);
assert.equal(snapshot.summary.qualifyingDeals, 10);
assert.equal(snapshot.summary.storeSpecificProducts, 0);
assert.equal(snapshot.summary.pennyObservations, 0);
assert.ok(snapshot.products.every((product) => product.priceScope === 'advertised'));
assert.ok(snapshot.products.every((product) => product.imageUrl === null));
assert.ok(snapshot.publications.every((publication) => publication.status === 'active'));
assert.ok(snapshot.publications.every((publication) => Date.parse(publication.validTo) >= Date.parse(snapshot.generatedAt)));
writeKazakariSnapshot(snapshot, snapshotPath);
const snapshotText = fs.readFileSync(snapshotPath, 'utf8');
assert.equal(JSON.parse(snapshotText).summary.currentProducts, 298);
assert.doesNotMatch(snapshotText, /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret|credential)\b/i);
assert.doesNotMatch(snapshotText, /\b(sk_(live|test)_|sb_(secret|publishable)_|eyJ[a-zA-Z0-9_-]{20,})/);
assert.doesNotMatch(snapshotText, /@[a-z0-9.-]+\.[a-z]{2,}\b/i);

assert.equal(isKazakariAuthorized({ role: 'admin', email: 'admin@mainphasemarket.net' }, 'admin@mainphasemarket.net'), true);
assert.equal(isKazakariAuthorized({ role: 'admin', email: 'other-admin@example.com' }, 'admin@mainphasemarket.net'), false);
assert.equal(isKazakariAuthorized({ role: 'member', email: 'family@example.com' }, 'admin@mainphasemarket.net'), false);
assert.equal(isKazakariAuthorized({ role: 'member', email: 'ADMIN@MAINPHASEMARKET.NET' }, 'admin@mainphasemarket.net'), true);
assert.throws(() => sanitizeKazakariWatchRule({ name: '', minimumDiscount: 50 }), /name is required/i);
assert.throws(() => sanitizeKazakariWatchRule({ name: 'Bad', minimumDiscount: 101 }), /between 0 and 100/i);

const environment = { KAZAKARI_SNAPSHOT_PATH: snapshotPath };
const owner = createKazakariOwner({ getEnvValue: (name) => environment[name] || '', runtimeDataRoot: testRoot });
const actor = { id: 'local-test-user', email: 'admin@mainphasemarket.net', role: 'admin' };
assert.equal((await owner.getSnapshot()).summary.qualifyingDeals, 10);
assert.deepEqual(await owner.listWatches(actor), []);
const created = await owner.createWatch(actor, { name: 'Tools 50%+', retailer: 'home-depot', minimumDiscount: 50 });
assert.equal(created.name, 'Tools 50%+');
assert.equal((await owner.listWatches(actor)).length, 1);
assert.equal(await owner.deleteWatch(actor, created.id), true);
assert.equal((await owner.listWatches(actor)).length, 0);

const appSource = fs.readFileSync(path.join(repoRoot, 'src', 'App.jsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(repoRoot, 'src', 'features', 'kazakari', 'KazakariPage.jsx'), 'utf8');
const serverSource = fs.readFileSync(path.join(repoRoot, 'server', 'index.mjs'), 'utf8');
const headers = fs.readFileSync(path.join(repoRoot, 'public', '_headers'), 'utf8');
assert.match(appSource, /path="\/private\/kazakari"/);
assert.match(pageSource, /minimumDiscount.*50/);
assert.match(pageSource, /Store-specific observation/);
assert.match(pageSource, /Advertised promotion/);
assert.match(pageSource, /Push notifications are not implemented/);
assert.match(serverSource, /requireKazakariAccess[\s\S]*!allowRemoteConnections\(\) && isLoopbackAddress/);
assert.match(headers, /X-Robots-Tag: noindex, nofollow/);

const migration = fs.readFileSync(path.join(repoRoot, 'supabase', 'migrations', '20261111120000_create_kazakari_private_preview.sql'), 'utf8');
const createdTables = [...migration.matchAll(/create table if not exists public\.([a-z0-9_]+)/gi)].map((match) => match[1]).sort();
assert.deepEqual(createdTables, ['kazakari_preview_snapshots', 'kazakari_watch_rules']);
assert.match(migration, /alter table public\.kazakari_preview_snapshots enable row level security/i);
assert.match(migration, /alter table public\.kazakari_watch_rules enable row level security/i);
assert.match(migration, /revoke all on table public\.kazakari_preview_snapshots from anon, authenticated/i);
assert.match(migration, /revoke all on table public\.kazakari_watch_rules from anon, authenticated/i);
assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete|all).*\s+to\s+(anon|authenticated)/i);

console.log(JSON.stringify({
  passed: 37,
  source: snapshot.source,
  summary: snapshot.summary,
  checks: ['snapshot', 'sensitive-data-scan', 'expiration-filter', 'owner-only-allowlist', 'production-auth-required', 'watch-crud', 'route', 'noindex', 'evidence-labels', 'migration-scope', 'rls'],
}, null, 2));
