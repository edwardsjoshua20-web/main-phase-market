import fs from 'node:fs';
import path from 'node:path';
import { legalityOwner } from '../src/services/legality/legalityOwner.js';

const PUBLIC_DATA_ROOT = path.join(process.cwd(), 'public', 'data');
const failures = [];
const observations = [];
const timings = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function manifest(game) {
  const assetGame = game === 'flesh_and_blood' ? 'fab' : game;
  return readJson(path.join(PUBLIC_DATA_ROOT, assetGame, game === 'magic' ? 'manifest.json' : 'cards-manifest.json'), {}) || {};
}

function generatedAt(value) {
  return value?.generated_at || value?.generatedAt || value?.source_meta?.exportedAt || null;
}

function metadata(game) {
  if (game === 'magic') {
    const mtg = readJson(path.join(PUBLIC_DATA_ROOT, 'legality', 'mtg.json'), {}) || {};
    return {
      source: mtg.source,
      sourceVersion: mtg.sourceVersion,
      lastVerified: mtg.generatedAt,
      effectiveDate: mtg.sourceGeneratedAt
    };
  }
  const sourceManifest = manifest(game);
  return {
    source: `${game} MainPhase catalog legality fields`,
    sourceVersion: `${game}-${generatedAt(sourceManifest) || 'unknown'}`,
    lastVerified: generatedAt(sourceManifest),
    effectiveDate: generatedAt(sourceManifest)
  };
}

function loadSource(game) {
  const assetGame = game === 'flesh_and_blood' ? 'fab' : game === 'magic' ? 'legality' : game;
  const fileName = game === 'magic' ? 'mtg.json' : 'cards.json';
  const payload = readJson(path.join(PUBLIC_DATA_ROOT, assetGame, fileName), game === 'magic' ? {} : []);
  if (game === 'magic') return Array.isArray(payload.records) ? payload.records : [];
  return Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
}

function hasRequiredShape(result) {
  return result
    && typeof result.game === 'string'
    && typeof result.canonicalCardId === 'string'
    && typeof result.format === 'string'
    && typeof result.status === 'string'
    && result.status !== ''
    && result.status !== 'undefined'
    && result.sourceVersion != null
    && result.lastVerified != null;
}

function check(label, input, card, expectedStatus, context = {}) {
  const started = performance.now();
  const result = legalityOwner.check(input, {
    card,
    metadata: metadata(input.game),
    indexes: context.indexes
  });
  timings.push({ label, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000 });
  observations.push({ label, input, status: result.status, sourceVersion: result.sourceVersion, reason: result.reason || null });
  assert(hasRequiredShape(result), `${label}: malformed normalized result`);
  assert(result.status === expectedStatus, `${label}: expected ${expectedStatus}, got ${result.status}`);
  return result;
}

const mtgRecords = loadSource('magic');
const mtgMetadata = metadata('magic');
const mtgIndexes = {
  magic: {
    byOracleId: new Map(mtgRecords.map((row) => [row.id, { ...row, sourceVersion: mtgMetadata.sourceVersion, lastVerified: mtgMetadata.lastVerified, effectiveDate: mtgMetadata.effectiveDate }]))
  }
};
assert(mtgRecords.length > 1000, 'MTG legality index is missing or too small.');

const mtgCases = [
  ['MTG legal', 'modern', 'legal'],
  ['MTG banned', 'commander', 'banned'],
  ['MTG restricted', 'vintage', 'restricted'],
  ['MTG not legal', 'standard', 'not_legal'],
  ['MTG Commander legal', 'commander', 'legal']
].map(([label, format, status]) => {
  const record = mtgRecords.find((row) => row.legalities?.[format] === status);
  assert(Boolean(record), `${label}: no representative source record found`);
  return [label, format, status, record];
});

for (const [label, format, status, record] of mtgCases) {
  if (!record) continue;
  check(label, { game: 'magic', canonicalCardId: record.id, format }, { oracle_id: record.id, name: record.name }, status, { indexes: mtgIndexes });
}

const pokemon = loadSource('pokemon');
const pokemonLegal = pokemon.find((row) => String(row.legalities?.standard || '').toLowerCase() === 'legal');
const pokemonRotated = pokemon.find((row) => row.legalities && !Object.prototype.hasOwnProperty.call(row.legalities, 'standard') && Object.keys(row.legalities).length > 0);
if (pokemonLegal) check('Pokemon Standard legal', { game: 'pokemon', canonicalCardId: pokemonLegal.id, format: 'standard' }, pokemonLegal, 'legal');
if (pokemonRotated) check('Pokemon Standard unknown for older card', { game: 'pokemon', canonicalCardId: pokemonRotated.id, format: 'standard' }, pokemonRotated, 'unknown');

const yugioh = loadSource('yugioh');
for (const [label, sourceStatus, expected] of [
  ['Yu-Gi-Oh legal/unlimited', '', 'legal'],
  ['Yu-Gi-Oh Forbidden', 'Forbidden', 'banned'],
  ['Yu-Gi-Oh Limited', 'Limited', 'limited'],
  ['Yu-Gi-Oh Semi-Limited', 'Semi-Limited', 'semi_limited']
]) {
  const row = yugioh.find((card) => String(card.banlist_info?.ban_tcg || '') === sourceStatus);
  if (row) check(label, { game: 'yugioh', canonicalCardId: String(row.id), format: 'advanced' }, row, expected);
}

const fab = loadSource('flesh_and_blood');
for (const [label, predicate, format, expected] of [
  ['FAB legal', (row) => row.cc_legal === true && !row.cc_banned && !row.cc_suspended && !row.cc_restricted && !row.cc_living_legend, 'classic_constructed', 'legal'],
  ['FAB banned', (row) => row.cc_banned === true, 'classic_constructed', 'banned'],
  ['FAB suspended', (row) => row.cc_suspended === true || row.blitz_suspended === true, 'classic_constructed', 'suspended'],
  ['FAB Living Legend', (row) => row.cc_living_legend === true || row.blitz_living_legend === true, 'classic_constructed', 'rotated']
]) {
  const row = fab.find(predicate);
  if (row) check(label, { game: 'flesh_and_blood', canonicalCardId: row.unique_id, format }, row, expected);
}

for (const game of ['lorcana', 'onepiece', 'starwars']) {
  const row = loadSource(game)[0] || {};
  check(`${game} unknown`, { game, canonicalCardId: row.id || row.uuid || row.unique_id || 'missing', format: 'constructed' }, row, 'unknown');
}

const sampleInputs = mtgCases.filter(([, , , record]) => record).slice(0, 4).map(([, format, , record]) => ({ game: 'magic', canonicalCardId: record.id, format }));
const singles = sampleInputs.map((input) => legalityOwner.check(input, { metadata: metadata('magic'), indexes: mtgIndexes }));
const batch = legalityOwner.batch(sampleInputs, {
  metadata: mtgMetadata,
  indexes: mtgIndexes,
  resolveCard: (input) => ({ oracle_id: input.canonicalCardId })
});
assert(JSON.stringify(singles) === JSON.stringify(batch), 'single/batch legality results disagree.');
assert(!observations.some((item) => item.status === 'not_legal' && /unavailable|missing|No canonical/i.test(String(item.reason || ''))), 'unknown source data became not_legal.');

for (const size of [1, 100, 1000]) {
  const inputs = Array.from({ length: size }, (_, index) => {
    const record = mtgRecords[index % mtgRecords.length];
    return { game: 'magic', canonicalCardId: record.id, format: index % 2 === 0 ? 'commander' : 'modern' };
  });
  const started = performance.now();
  const results = legalityOwner.batch(inputs, {
    metadata: mtgMetadata,
    indexes: mtgIndexes,
    resolveCard: (input) => ({ oracle_id: input.canonicalCardId })
  });
  timings.push({ label: `performance:${size}`, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000, checks: results.length });
  assert(results.length === size, `performance batch ${size} returned ${results.length} results`);
}

console.log(JSON.stringify({
  ok: failures.length === 0,
  generatedAt: new Date().toISOString(),
  observations,
  timings
}, null, 2));

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  process.exit(0);
}
