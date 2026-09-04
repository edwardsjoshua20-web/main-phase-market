import fs from 'node:fs';
import path from 'node:path';
import { getCardNameAliases, getCanonicalCardNameKey } from '../src/services/search/searchIdentity.js';

const PROJECT_ROOT = process.cwd();
const MTG_ROOT = path.join(PROJECT_ROOT, 'public', 'data', 'mtg');
const SEARCH_ROOT = path.join(MTG_ROOT, 'search');
const OUTPUT_ROOT = path.join(MTG_ROOT, 'search-lite');
const ALIAS_OUTPUT_ROOT = path.join(MTG_ROOT, 'search-alias');
const MANIFEST_PATH = path.join(MTG_ROOT, 'manifest.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`);
}

function pickSearchFields(row = {}) {
  return {
    id: row.id,
    oracle_id: row.oracle_id,
    name: row.name,
    name_normalized: row.name_normalized,
    face_names: row.face_names,
    alternate_names: row.alternate_names,
    lang: row.lang,
    set_name: row.set_name,
    set_code: row.set_code,
    collector_number: row.collector_number,
    rarity: row.rarity,
    image_small: row.image_small,
    image_normal: row.image_normal,
    image_art_crop: row.image_art_crop,
    image_png: row.image_png,
    prices: row.prices,
    type_line: row.type_line,
    mana_cost: row.mana_cost,
    oracle_text: row.oracle_text,
    cmc: row.cmc,
    power: row.power,
    toughness: row.toughness,
    loyalty: row.loyalty,
    colors: row.colors,
    color_identity: row.color_identity,
    released_at: row.released_at,
    highres_image: row.highres_image,
    legal_commander: row.legal_commander,
    can_be_commander: row.can_be_commander,
    finishes: row.finishes
  };
}

function isEnglish(row = {}) {
  return String(row.lang || '').toLowerCase() === 'en';
}

function normalizeName(row = {}) {
  return String(row.name_normalized || row.name || '').trim().toLowerCase();
}

function canonicalName(row = {}) {
  const rawName = String(row.name || '').trim();
  const parts = rawName.split(/\s*\/\/\s*/).filter(Boolean);
  if (parts.length < 2) return rawName;
  const firstKey = getCanonicalCardNameKey(parts[0]);
  return firstKey && parts.every((part) => getCanonicalCardNameKey(part) === firstKey)
    ? parts[0]
    : rawName;
}

function bucketForName(value) {
  const normalized = getCanonicalCardNameKey(value);
  const first = normalized[0];
  if (!first) return 'other';
  if (/[a-z]/.test(first)) return first;
  if (/[0-9]/.test(first)) return '0-9';
  return 'other';
}

function compareRepresentativeRows(a = {}, b = {}) {
  if (isEnglish(a) !== isEnglish(b)) return isEnglish(a) ? -1 : 1;
  if (Boolean(a.image_normal || a.image_small) !== Boolean(b.image_normal || b.image_small)) {
    return Boolean(a.image_normal || a.image_small) ? -1 : 1;
  }
  if (Boolean(a.prices?.usd) !== Boolean(b.prices?.usd)) return Boolean(a.prices?.usd) ? -1 : 1;
  return String(b.released_at || '').localeCompare(String(a.released_at || ''));
}

function dedupeRepresentativeRows(rows = []) {
  const grouped = new Map();
  for (const row of rows) {
    const key = normalizeName(row);
    if (!key) continue;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(row);
  }

  return [...grouped.values()]
    .map((variants) => {
      const representative = variants.sort(compareRepresentativeRows)[0];
      const faceNames = new Set();
      const alternateNames = new Set();
      for (const variant of variants) {
        for (const faceName of variant.face_names || []) {
          if (faceName) faceNames.add(faceName);
        }
        for (const alternateName of variant.alternate_names || []) {
          if (alternateName) alternateNames.add(alternateName);
        }
      }
      return {
        ...representative,
        face_names: [...faceNames],
        alternate_names: [...alternateNames]
      };
    })
    .sort((a, b) => normalizeName(a).localeCompare(normalizeName(b)));
}

function main() {
  const manifest = readJson(MANIFEST_PATH);
  const buckets = manifest.buckets || {};
  const liteManifest = {
    generated_at: new Date().toISOString(),
    source_manifest_generated_at: manifest.generated_at || null,
    total_cards_seen: manifest.total_cards_seen || 0,
    imported_cards: manifest.imported_cards || 0,
    buckets: {}
  };

  fs.rmSync(OUTPUT_ROOT, { recursive: true, force: true });
  fs.rmSync(ALIAS_OUTPUT_ROOT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.mkdirSync(ALIAS_OUTPUT_ROOT, { recursive: true });

  const aliasesByBucket = new Map();

  for (const [bucketName, bucketInfo] of Object.entries(buckets)) {
    const sourceFile = bucketInfo.file;
    if (!sourceFile) {
      continue;
    }

    const sourcePath = path.join(MTG_ROOT, sourceFile);
    const rows = dedupeRepresentativeRows(readJson(sourcePath)).map(pickSearchFields);
    const outputFileName = `${bucketName}.json`;
    const outputRelativePath = `search-lite/${outputFileName}`;
    const outputPath = path.join(MTG_ROOT, outputRelativePath);

    writeJson(outputPath, rows);
    liteManifest.buckets[bucketName] = {
      file: outputRelativePath,
      count: rows.length
    };

    for (const row of rows) {
      const resolvedCanonicalName = canonicalName(row);
      const canonicalKey = getCanonicalCardNameKey(resolvedCanonicalName);
      for (const alias of getCardNameAliases(row)) {
        const aliasKey = getCanonicalCardNameKey(alias);
        if (!aliasKey || aliasKey === canonicalKey) continue;
        const aliasBucket = bucketForName(aliasKey);
        if (!aliasesByBucket.has(aliasBucket)) aliasesByBucket.set(aliasBucket, new Map());
        const routeKey = `${aliasKey}\u0000${canonicalKey}`;
        aliasesByBucket.get(aliasBucket).set(routeKey, {
          alias: aliasKey,
          canonical_name: resolvedCanonicalName,
          canonical_bucket: bucketName
        });
      }
    }

    console.log(`${bucketName}: ${rows.length} cards -> ${outputRelativePath}`);
  }

  liteManifest.alias_buckets = {};
  for (const [bucketName, routes] of [...aliasesByBucket].sort(([left], [right]) => left.localeCompare(right))) {
    const outputRelativePath = `search-alias/${bucketName}.json`;
    const entries = [...routes.values()].sort((a, b) => (
      a.alias.localeCompare(b.alias) || a.canonical_name.localeCompare(b.canonical_name)
    ));
    writeJson(path.join(MTG_ROOT, outputRelativePath), entries);
    liteManifest.alias_buckets[bucketName] = { file: outputRelativePath, count: entries.length };
  }

  writeJson(path.join(MTG_ROOT, 'search-lite-manifest.json'), liteManifest);
  console.log('MTG lightweight search build complete.');
}

main();
