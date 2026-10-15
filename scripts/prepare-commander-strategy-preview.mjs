import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const PUBLIC_MTG = path.join(ROOT, 'public', 'data', 'mtg');
const DIST_MTG = path.join(ROOT, 'dist', 'data', 'mtg');
const sourceManifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_MTG, 'mechanical-chemistry', 'strategy-compiler-manifest.json'), 'utf8'));
const previewIds = new Set(sourceManifest.commanders.map((entry) => entry.oracle_id));
const printingManifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_MTG, 'printing-index-manifest.json'), 'utf8'));
const printingShardCache = new Map();
const preferredPrintingCache = new Map();

function printingShardForOracleId(oracleId) {
  const prefix = String(oracleId || '').replace(/[^a-f0-9]/gi, '').slice(0, 2).toLowerCase();
  return /^[a-f0-9]{2}$/.test(prefix) ? prefix : 'other';
}

function loadPrintingShard(shard) {
  if (printingShardCache.has(shard)) return printingShardCache.get(shard);
  const file = printingManifest.shards?.[shard]?.file;
  const rows = file
    ? JSON.parse(fs.readFileSync(path.join(PUBLIC_MTG, file), 'utf8'))
      .map((row) => Object.fromEntries(printingManifest.fields.map((field, index) => [field, row[index]])))
    : [];
  printingShardCache.set(shard, rows);
  return rows;
}

function comparePreferredPrintings(a, b) {
  const aEnglish = String(a.lang || '').toLowerCase() === 'en';
  const bEnglish = String(b.lang || '').toLowerCase() === 'en';
  if (aEnglish !== bEnglish) return aEnglish ? -1 : 1;
  const releaseCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
  if (releaseCompare !== 0) return releaseCompare;
  const setCompare = String(a.set_name || '').localeCompare(String(b.set_name || ''));
  if (setCompare !== 0) return setCompare;
  return String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function getPreferredPrinting(oracleId) {
  if (!oracleId) return null;
  if (preferredPrintingCache.has(oracleId)) return preferredPrintingCache.get(oracleId);
  const preferredPrinting = loadPrintingShard(printingShardForOracleId(oracleId))
    .filter((row) => row.oracle_id === oracleId)
    .sort(comparePreferredPrintings)[0] || null;
  preferredPrintingCache.set(oracleId, preferredPrinting);
  return preferredPrinting;
}

function ensureCopy(source, target) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return true;
}

function localImagePath(value) {
  const match = String(value || '').match(/cards\.scryfall\.io\/(normal|small|large)\/front\/([0-9a-f])\/([0-9a-f])\/([0-9a-f-]+)\.jpg/i);
  return match ? `/data/mtg/images/${match[1]}/${match[2]}${match[3]}/${match[4]}.jpg` : value;
}

function copyLocalImage(url) {
  const normalized = String(url || '').split('?')[0];
  if (!normalized.startsWith('/data/mtg/images/')) return false;
  const relative = normalized.replace(/^\/data\/mtg\//, '');
  return ensureCopy(path.join(PUBLIC_MTG, relative), path.join(DIST_MTG, relative));
}

function localizeCardImages(card) {
  if (!card || typeof card !== 'object') return card;
  const next = { ...card };
  for (const key of ['image_url', 'image_normal', 'image_small', 'image_large']) {
    if (!next[key]) continue;
    next[key] = localImagePath(next[key]);
    copyLocalImage(next[key]);
  }
  const preferredPrinting = getPreferredPrinting(next.oracle_id);
  if (preferredPrinting) {
    next.prices = {
      usd: preferredPrinting.usd ?? null,
      usd_foil: preferredPrinting.usd_foil ?? null,
      usd_etched: preferredPrinting.usd_etched ?? null
    };
    next.market_price = preferredPrinting.usd ?? null;
    next.market_price_scope = String(preferredPrinting.lang || '').toLowerCase() === 'en' ? 'exact' : 'reference';
    next.market_price_source = 'scryfall_catalog';
  }
  return next;
}

fs.mkdirSync(DIST_MTG, { recursive: true });
const commanderManifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_MTG, 'commander-manifest.json'), 'utf8'));
commanderManifest.index_path = 'commanders.json';
commanderManifest.detail_prefix = 'commander-details';
fs.writeFileSync(path.join(DIST_MTG, 'commander-manifest.json'), `${JSON.stringify(commanderManifest, null, 2)}\n`);
const commanders = JSON.parse(fs.readFileSync(path.join(PUBLIC_MTG, 'commanders.json'), 'utf8'))
  .filter((entry) => previewIds.has(entry.oracle_id))
  .map(localizeCardImages);
fs.writeFileSync(path.join(DIST_MTG, 'commanders.json'), `${JSON.stringify(commanders, null, 2)}\n`);

for (const commander of commanders) {
  const detailSource = path.join(PUBLIC_MTG, 'commander-details', `${commander.oracle_id}.json`);
  if (!fs.existsSync(detailSource)) continue;
  const detail = JSON.parse(fs.readFileSync(detailSource, 'utf8'));
  if (detail.commander) detail.commander = localizeCardImages(detail.commander);
  const detailTarget = path.join(DIST_MTG, 'commander-details', `${commander.oracle_id}.json`);
  fs.mkdirSync(path.dirname(detailTarget), { recursive: true });
  fs.writeFileSync(detailTarget, `${JSON.stringify(detail, null, 2)}\n`);
}

const chemistrySource = path.join(PUBLIC_MTG, 'mechanical-chemistry');
const chemistryTarget = path.join(DIST_MTG, 'mechanical-chemistry');
fs.mkdirSync(chemistryTarget, { recursive: true });
for (const name of fs.readdirSync(chemistrySource).filter((value) => value.endsWith('.json'))) {
  const payload = JSON.parse(fs.readFileSync(path.join(chemistrySource, name), 'utf8'));
  for (const strategy of payload.strategies || []) {
    strategy.recommendations = (strategy.recommendations || []).map((card) => {
      const localized = localizeCardImages(card);
      copyLocalImage(localized.image_normal);
      copyLocalImage(localized.image_small);
      copyLocalImage(localized.image_large);
      return localized;
    });
  }
  payload.recommendations = (payload.recommendations || []).map(localizeCardImages);
  fs.writeFileSync(path.join(chemistryTarget, name), `${JSON.stringify(payload, null, 2)}\n`);
}

console.log(JSON.stringify({ preview_commanders: commanders.length, dist_root: DIST_MTG }, null, 2));
