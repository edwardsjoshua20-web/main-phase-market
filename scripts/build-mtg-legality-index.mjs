import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const sourcePath = process.env.MTG_SOURCE_PATH || path.join(process.cwd(), 'server', 'data', 'mtg', 'source', 'all_cards-latest.json');
const manifestPath = path.join(process.cwd(), 'public', 'data', 'mtg', 'manifest.json');
const outputPath = path.join(process.cwd(), 'public', 'data', 'legality', 'mtg.json');

const SUPPORTED_FORMATS = ['standard', 'pioneer', 'modern', 'legacy', 'vintage', 'pauper', 'commander'];

function parseCardLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === '[' || trimmed === ']') return null;
  const json = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
  return JSON.parse(json);
}

function sameLegalities(left = {}, right = {}) {
  return SUPPORTED_FORMATS.every((format) => String(left[format] || '') === String(right[format] || ''));
}

function stableVersion(value) {
  return `mtg-legality-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16)}`;
}

const sourceManifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : {};
const byOracle = new Map();
let rowsSeen = 0;
let legalityRows = 0;
let conflicts = 0;

const input = fs.createReadStream(sourcePath, { encoding: 'utf8' });
const rl = readline.createInterface({ input, crlfDelay: Infinity });

for await (const line of rl) {
  const card = parseCardLine(line);
  if (!card?.oracle_id || !card.legalities) continue;
  rowsSeen += 1;
  const legalities = Object.fromEntries(
    SUPPORTED_FORMATS.map((format) => [format, String(card.legalities[format] || 'unknown')])
  );
  const existing = byOracle.get(card.oracle_id);
  if (existing) {
    if (!sameLegalities(existing.legalities, legalities)) conflicts += 1;
    continue;
  }
  legalityRows += 1;
  byOracle.set(card.oracle_id, {
    id: card.oracle_id,
    name: card.name || '',
    legalities
  });
}

const records = [...byOracle.values()].sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const sourceGeneratedAt = sourceManifest.generated_at || null;
const sourceVersion = stableVersion({
  sourceGeneratedAt,
  rows: records.length,
  formats: SUPPORTED_FORMATS
});

const payload = {
  schemaVersion: 1,
  generatedAt,
  source: 'Scryfall bulk card legalities via MainPhase MTG catalog source',
  sourceGeneratedAt,
  sourceVersion,
  formats: SUPPORTED_FORMATS,
  cardCount: records.length,
  rowsSeen,
  conflicts,
  records
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`);
console.log(JSON.stringify({
  ok: true,
  outputPath,
  cardCount: records.length,
  rowsSeen,
  legalityRows,
  conflicts,
  sourceVersion
}, null, 2));
