import { getCatalogAssetUrl } from '@/config/publicAssetUrls';
import { getLocalJsonIfAvailable, postLocalJsonIfAvailable } from '@/lib/catalogApi';

const manifestUrl = getCatalogAssetUrl('mtg', 'manifest.json');

const manifestCache = {
  promise: null,
  value: null
};

const bucketCache = new Map();
const allBucketsCache = {
  promise: null,
  value: null
};
const oracleBucketIndexCache = {
  promise: null,
  value: null
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCanonicalName(row) {
  const rawName = String(row?.name || '').trim();
  if (!rawName.includes('//')) return rawName;

  const parts = rawName
    .split('//')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return rawName;

  const normalizedParts = parts.map((part) => normalizeText(part));
  const firstPart = normalizedParts[0];
  if (firstPart && normalizedParts.every((part) => part === firstPart)) {
    return parts[0];
  }

  return rawName;
}

function getCanonicalNormalizedName(row) {
  const canonicalName = getCanonicalName(row);
  return normalizeText(canonicalName) || row.name_normalized || '';
}

function bucketForQuery(query) {
  const normalized = normalizeText(query);
  const first = normalized[0];

  if (!first) return 'other';
  if (/[a-z]/.test(first)) return first;
  if (/[0-9]/.test(first)) return '0-9';
  return 'other';
}

async function loadManifest() {
  if (manifestCache.value) {
    return manifestCache.value;
  }

  if (!manifestCache.promise) {
    manifestCache.promise = fetch(manifestUrl).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load MTG manifest: ${response.status}`);
      }
      const manifest = await response.json();
      manifestCache.value = manifest;
      return manifest;
    });
  }

  return manifestCache.promise;
}

async function loadBucket(bucket) {
  if (bucketCache.has(bucket)) {
    return bucketCache.get(bucket);
  }

  const promise = loadManifest().then(async (manifest) => {
    const bucketInfo = manifest.buckets?.[bucket];
    const bucketFiles = Array.isArray(bucketInfo?.files) && bucketInfo.files.length > 0
      ? bucketInfo.files
      : bucketInfo?.file
        ? [bucketInfo.file]
        : [];

    if (bucketFiles.length === 0) {
      return [];
    }

    const bucketRows = await Promise.all(
      bucketFiles.map(async (bucketFile) => {
        const response = await fetch(getCatalogAssetUrl('mtg', bucketFile));
        if (!response.ok) {
          throw new Error(`Failed to load MTG bucket ${bucket}: ${response.status}`);
        }

        return response.json();
      })
    );

    return bucketRows.flat();
  });

  bucketCache.set(bucket, promise);
  return promise;
}

async function loadAllBuckets() {
  if (allBucketsCache.value) {
    return allBucketsCache.value;
  }

  if (!allBucketsCache.promise) {
    allBucketsCache.promise = loadManifest().then(async (manifest) => {
      const bucketNames = Object.keys(manifest.buckets || {});
      const bucketRows = await Promise.all(bucketNames.map((bucket) => loadBucket(bucket)));
      const allRows = bucketRows.flat();
      allBucketsCache.value = allRows;
      return allRows;
    });
  }

  return allBucketsCache.promise;
}

async function loadOracleBucketIndex() {
  if (oracleBucketIndexCache.value) {
    return oracleBucketIndexCache.value;
  }

  if (!oracleBucketIndexCache.promise) {
    oracleBucketIndexCache.promise = fetch(getCatalogAssetUrl('mtg', 'oracle-buckets.json')).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load MTG oracle bucket index: ${response.status}`);
      }

      const index = await response.json();
      oracleBucketIndexCache.value = index;
      return index;
    });
  }

  return oracleBucketIndexCache.promise;
}

async function loadRowsForOracleIds(oracleIds) {
  if (!oracleIds?.size) return [];

  try {
    const oracleBucketIndex = await loadOracleBucketIndex();
    const bucketNames = new Set();

    for (const oracleId of oracleIds) {
      const buckets = oracleBucketIndex?.[oracleId] || [];
      for (const bucket of buckets) {
        bucketNames.add(bucket);
      }
    }

    if (bucketNames.size === 0) {
      return [];
    }

    const rowsByBucket = await Promise.all([...bucketNames].map((bucket) => loadBucket(bucket)));
    return rowsByBucket.flat().filter((row) => oracleIds.has(row.oracle_id));
  } catch {
    return loadAllBuckets().then((rows) => rows.filter((row) => oracleIds.has(row.oracle_id)));
  }
}

function scoreRow(row, normalizedQuery) {
  const name = getCanonicalNormalizedName(row);
  const searchText = row.search_text || '';

  if (name === normalizedQuery) return 1000;
  if (name.startsWith(normalizedQuery)) return 750;
  if (name.split(' ').some((part) => part.startsWith(normalizedQuery))) return 500;
  if (searchText.includes(normalizedQuery)) return 250;
  return 0;
}

function isEnglish(row) {
  return String(row.lang || '').toLowerCase() === 'en';
}

function compareReleaseDesc(a, b) {
  return String(b.released_at || '').localeCompare(String(a.released_at || ''));
}

function compareCollector(a, b) {
  return String(a.collector_number || '').localeCompare(String(b.collector_number || ''), undefined, { numeric: true, sensitivity: 'base' });
}

function toNumericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = Number.parseFloat(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

function compareNumeric(actualValue, op, expectedValue) {
  const actual = toNumericValue(actualValue);
  const expected = toNumericValue(expectedValue);
  if (actual === null || expected === null) return false;
  if (op === '=') return actual === expected;
  if (op === '>=') return actual >= expected;
  if (op === '<=') return actual <= expected;
  if (op === '>') return actual > expected;
  if (op === '<') return actual < expected;
  return false;
}

function getCardColors(row) {
  const colors = Array.isArray(row?.colors) ? row.colors : [];
  return [...new Set(colors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
}

function matchesColorFilter(row, filters) {
  const selectedColors = Array.isArray(filters.colors) ? filters.colors.filter(Boolean) : [];
  if (!selectedColors.length) return true;

  const rowColors = getCardColors(row);
  const normalizedRowColors = [...new Set(rowColors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
  const normalizedSelectedColors = [...new Set(selectedColors.map((color) => String(color || '').toUpperCase()).filter(Boolean))].sort();
  const rowSet = new Set(normalizedRowColors);

  if (filters.colorMode === 'exactly') {
    if (normalizedRowColors.length !== normalizedSelectedColors.length) return false;
    return normalizedSelectedColors.every((color) => rowSet.has(color));
  }

  if (filters.colorMode === 'at_most') {
    return normalizedRowColors.every((color) => normalizedSelectedColors.includes(color));
  }

  return normalizedSelectedColors.every((color) => rowSet.has(color));
}

function compareColorPriority(a, b, filters) {
  const selectedColors = Array.isArray(filters?.colors) ? filters.colors.filter(Boolean).map((color) => String(color).toUpperCase()) : [];
  if (!selectedColors.length) return 0;

  const aColors = getCardColors(a);
  const bColors = getCardColors(b);
  const aExact = aColors.length === selectedColors.length && selectedColors.every((color) => aColors.includes(color));
  const bExact = bColors.length === selectedColors.length && selectedColors.every((color) => bColors.includes(color));

  if (aExact !== bExact) {
    return aExact ? -1 : 1;
  }

  if (aColors.length !== bColors.length) {
    return aColors.length - bColors.length;
  }

  return 0;
}

function matchesTextFilter(value, query) {
  if (!query) return true;
  return normalizeText(value).includes(normalizeText(query));
}

function matchesAdvancedFilters(row, filters) {
  if (!row) return false;
  if (!matchesColorFilter(row, filters)) return false;

  if (!matchesTextFilter(getCanonicalName(row), filters.name)) return false;
  if (!matchesTextFilter(row.oracle_text || '', filters.oracleText)) return false;
  if (!matchesTextFilter(row.type_line || '', filters.typeLine)) return false;
  if (filters.set && !matchesTextFilter(`${row.set_code || ''} ${row.set_name || ''}`, filters.set)) return false;
  if (filters.rarity && String(row.rarity || '').toLowerCase() !== String(filters.rarity).toLowerCase()) return false;

  const keywords = Array.isArray(filters.keywords) ? filters.keywords.filter(Boolean) : [];
  if (keywords.length) {
    const haystack = normalizeText(`${row.oracle_text || ''} ${row.type_line || ''}`);
    const everyKeywordMatches = keywords.every((keyword) => haystack.includes(normalizeText(keyword)));
    if (!everyKeywordMatches) return false;
  }

  if (filters.cmc && !compareNumeric(row.cmc, filters.cmcOp || '=', filters.cmc)) return false;
  if (filters.power && !compareNumeric(row.power, filters.powerOp || '=', filters.power)) return false;
  if (filters.toughness && !compareNumeric(row.toughness, filters.toughnessOp || '=', filters.toughness)) return false;

  return true;
}

function sortLanguageCodes(languageCodes = []) {
  return [...new Set(languageCodes.map((code) => String(code || '').toUpperCase()).filter(Boolean))]
    .sort((a, b) => {
      if (a === 'EN' && b !== 'EN') return -1;
      if (b === 'EN' && a !== 'EN') return 1;
      return a.localeCompare(b);
    });
}

function buildAdvancedGroupedResults(rows, englishImageIndexes, filters = {}) {
  const groups = new Map();

  for (const row of rows) {
    const groupKey = [
      row.oracle_id || getCanonicalName(row),
      row.set_code || row.set_name || 'UNK',
      row.collector_number || ''
    ].join('::');

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }

    groups.get(groupKey).push(row);
  }

  return [...groups.entries()]
    .map(([groupKey, variants]) => {
      const sortedVariants = [...variants].sort(compareExactPrintings);
      const primaryRow =
        sortedVariants.find((row) => isEnglish(row) && hasDisplayableImage(row, englishImageIndexes)) ||
        sortedVariants.find((row) => hasDisplayableImage(row, englishImageIndexes)) ||
        sortedVariants[0];

      const primary = formatResult(primaryRow, englishImageIndexes);
      const languageCodes = sortLanguageCodes(sortedVariants.map((row) => row.lang));

      return {
        ...primary,
        groupKey,
        languageCodes,
        variantCount: languageCodes.length || 1
      };
    })
    .sort((a, b) => {
      const colorCompare = compareColorPriority(a, b, filters);
      if (colorCompare !== 0) return colorCompare;
      const nameCompare = String(a.name || '').localeCompare(String(b.name || ''));
      if (nameCompare !== 0) return nameCompare;
      const releaseCompare = String(b.released_at || '').localeCompare(String(a.released_at || ''));
      if (releaseCompare !== 0) return releaseCompare;
      return String(a.set_name || '').localeCompare(String(b.set_name || ''));
    });
}

function normalizeAdvancedPayload(payload, englishImageIndexes, filters, page, limit) {
  if (Array.isArray(payload)) {
    const groupedResults = buildAdvancedGroupedResults(payload, englishImageIndexes, filters || {});
    const total = groupedResults.length;
    const start = page * limit;
    const end = start + limit;
    return {
      results: groupedResults.slice(start, end),
      total,
      page,
      limit,
      hasMore: end < total
    };
  }

  if (Array.isArray(payload?.results) && payload.results.every((row) => row?.groupKey && Array.isArray(row?.languageCodes))) {
    return payload;
  }

  if (Array.isArray(payload?.results)) {
    const groupedResults = buildAdvancedGroupedResults(payload.results, englishImageIndexes, filters || {});
    const total = Number.isFinite(payload.total) ? payload.total : groupedResults.length;
    return {
      results: groupedResults,
      total,
      page: Number.isFinite(payload.page) ? payload.page : page,
      limit: Number.isFinite(payload.limit) ? payload.limit : limit,
      hasMore: typeof payload.hasMore === 'boolean' ? payload.hasMore : ((page + 1) * limit) < total
    };
  }

  return payload;
}

function compareExactPrintings(a, b) {
  if (isEnglish(a) !== isEnglish(b)) {
    return isEnglish(a) ? -1 : 1;
  }

  const releaseCompare = compareReleaseDesc(a, b);
  if (releaseCompare !== 0) return releaseCompare;

  const setCompare = String(a.set_name || '').localeCompare(String(b.set_name || ''));
  if (setCompare !== 0) return setCompare;

  return compareCollector(a, b);
}

function compareRankedRows(a, b) {
  if (b.score !== a.score) return b.score - a.score;

  const aName = getCanonicalNormalizedName(a.row);
  const bName = getCanonicalNormalizedName(b.row);
  if (aName !== bName) {
    return aName.localeCompare(bName);
  }

  return compareExactPrintings(a.row, b.row);
}

function dedupeByName(items) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = getCanonicalNormalizedName(item.row);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  return unique;
}

function buildEnglishImageIndexes(rows) {
  const byOracleAndSet = new Map();
  const byOracle = new Map();

  for (const row of rows) {
    if (!isEnglish(row) || !row.oracle_id) continue;
    const imageUrl = row.image_normal || row.image_small || null;
    if (!imageUrl) continue;

    const setKey = `${row.oracle_id}::${row.set_code || ''}`;
    if (!byOracleAndSet.has(setKey)) {
      byOracleAndSet.set(setKey, imageUrl);
    }

    if (!byOracle.has(row.oracle_id)) {
      byOracle.set(row.oracle_id, imageUrl);
    }
  }

  return { byOracleAndSet, byOracle };
}

function getEnglishFallbackImage(row, indexes) {
  if (!row?.oracle_id || !indexes) return null;
  const setKey = `${row.oracle_id}::${row.set_code || ''}`;
  return indexes.byOracleAndSet.get(setKey) || indexes.byOracle.get(row.oracle_id) || null;
}

function hasDisplayableImage(row, indexes = null) {
  const directImageUrl = row?.image_normal || row?.image_small || null;
  if (directImageUrl) return true;
  return Boolean(!isEnglish(row) ? getEnglishFallbackImage(row, indexes) : null);
}

function mergePreferValue(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      if (value.length > 0) return value;
      continue;
    }

    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  for (const value of values) {
    if (value !== undefined) return value;
  }

  return undefined;
}

function mergeMtgPrintingRows(primaryRow = {}, fallbackRow = {}) {
  return {
    ...fallbackRow,
    ...primaryRow,
    id: mergePreferValue(primaryRow.id, fallbackRow.id),
    oracle_id: mergePreferValue(primaryRow.oracle_id, fallbackRow.oracle_id),
    name: mergePreferValue(primaryRow.name, fallbackRow.name),
    lang: mergePreferValue(primaryRow.lang, fallbackRow.lang),
    set_name: mergePreferValue(primaryRow.set_name, fallbackRow.set_name),
    set_code: mergePreferValue(primaryRow.set_code, fallbackRow.set_code),
    collector_number: mergePreferValue(primaryRow.collector_number, fallbackRow.collector_number, primaryRow.card_number, fallbackRow.card_number),
    rarity: mergePreferValue(primaryRow.rarity, fallbackRow.rarity),
    image_small: mergePreferValue(primaryRow.image_small, fallbackRow.image_small),
    image_normal: mergePreferValue(primaryRow.image_normal, fallbackRow.image_normal),
    image_art_crop: mergePreferValue(primaryRow.image_art_crop, fallbackRow.image_art_crop),
    image_png: mergePreferValue(primaryRow.image_png, fallbackRow.image_png),
    prices: {
      usd: mergePreferValue(primaryRow.prices?.usd, fallbackRow.prices?.usd) ?? null,
      usd_foil: mergePreferValue(primaryRow.prices?.usd_foil, fallbackRow.prices?.usd_foil) ?? null,
      usd_etched: mergePreferValue(primaryRow.prices?.usd_etched, fallbackRow.prices?.usd_etched) ?? null
    },
    type_line: mergePreferValue(primaryRow.type_line, fallbackRow.type_line),
    mana_cost: mergePreferValue(primaryRow.mana_cost, fallbackRow.mana_cost),
    oracle_text: mergePreferValue(primaryRow.oracle_text, fallbackRow.oracle_text),
    power: mergePreferValue(primaryRow.power, fallbackRow.power, ''),
    toughness: mergePreferValue(primaryRow.toughness, fallbackRow.toughness, ''),
    loyalty: mergePreferValue(primaryRow.loyalty, fallbackRow.loyalty, ''),
    colors: mergePreferValue(primaryRow.colors, fallbackRow.colors, []),
    color_identity: mergePreferValue(primaryRow.color_identity, fallbackRow.color_identity, []),
    finishes: mergePreferValue(primaryRow.finishes, fallbackRow.finishes, []),
    released_at: mergePreferValue(primaryRow.released_at, fallbackRow.released_at),
    highres_image: Boolean(primaryRow.highres_image || fallbackRow.highres_image),
    legal_commander: Boolean(primaryRow.legal_commander || fallbackRow.legal_commander),
    can_be_commander: Boolean(primaryRow.can_be_commander || fallbackRow.can_be_commander)
  };
}

function mergePrintingCollections(primaryRows = [], fallbackRows = []) {
  if (!primaryRows.length) return fallbackRows;
  if (!fallbackRows.length) return primaryRows;

  const rowsById = new Map();

  for (const row of fallbackRows) {
    rowsById.set(row.id, row);
  }

  for (const row of primaryRows) {
    const existing = rowsById.get(row.id);
    rowsById.set(row.id, existing ? mergeMtgPrintingRows(row, existing) : row);
  }

  return [...rowsById.values()];
}

function formatResult(row, englishImageIndexes = null) {
  const directImageUrl = row.image_normal || row.image_small || null;
  const englishFallbackImage = !isEnglish(row) ? getEnglishFallbackImage(row, englishImageIndexes) : null;
  const displayImageUrl = directImageUrl || englishFallbackImage;
  const canonicalName = getCanonicalName(row);

  return {
    id: row.id,
    oracle_id: row.oracle_id,
    name: canonicalName,
    raw_name: row.name,
    lang: row.lang || 'unknown',
    set_name: row.set_name || 'Unknown Set',
    set_code: row.set_code || 'UNK',
    card_number: row.collector_number || '',
    rarity: row.rarity || '',
    image_url: displayImageUrl,
    raw_image_url: directImageUrl,
    english_image_url: englishFallbackImage,
    image_small: row.image_small || row.image_normal || null,
    image_art_crop: row.image_art_crop || null,
    highres_image: Boolean(row.highres_image),
    has_localized_image: Boolean(directImageUrl),
    price: row.prices?.usd ? Number.parseFloat(row.prices.usd) : null,
    allPrices: {
      usd: row.prices?.usd ? Number.parseFloat(row.prices.usd) : null,
      usd_foil: row.prices?.usd_foil ? Number.parseFloat(row.prices.usd_foil) : null,
      usd_etched: row.prices?.usd_etched ? Number.parseFloat(row.prices.usd_etched) : null
    },
    allFinishes: row.finishes || [],
    type: row.type_line || '',
    mana_cost: row.mana_cost || '',
    cmc: row.cmc ?? 0,
    power: row.power ?? '',
    toughness: row.toughness ?? '',
    loyalty: row.loyalty ?? '',
    colors: row.colors || [],
    color_identity: row.color_identity || [],
    oracle_text: row.oracle_text || '',
    released_at: row.released_at || null,
    legal_commander: Boolean(row.legal_commander),
    can_be_commander: Boolean(row.can_be_commander),
    finishes: row.finishes || [],
    finish: 'nonfoil',
    finishLabel: 'Normal',
    game: 'magic'
  };
}

export async function searchMtgCatalog(query, limit = 50) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/mtg/search', { query, limit });
    if (Array.isArray(payload)) {
      return payload;
    }
  } catch {
    // Fall through to local file scan.
  }

  const bucket = bucketForQuery(normalizedQuery);
  const rows = await loadBucket(bucket);
  const englishImageIndexes = buildEnglishImageIndexes(rows);
  const rankedRows = rows
    .map((row) => ({ row, score: scoreRow(row, normalizedQuery) }))
    .filter((item) => item.score > 0)
    .sort(compareRankedRows);

  const exactMatches = rankedRows
    .map(({ row }) => row)
    .filter((row) => getCanonicalNormalizedName(row) === normalizedQuery)
    .sort(compareExactPrintings);

  const exactMatchOracleIds = new Set(
    exactMatches
      .map((row) => row.oracle_id)
      .filter(Boolean)
  );

  const allRows = exactMatchOracleIds.size > 0 ? await loadRowsForOracleIds(exactMatchOracleIds) : rows;
  const allEnglishImageIndexes = allRows === rows ? englishImageIndexes : buildEnglishImageIndexes(allRows);

  const exactPrintingFamily = exactMatchOracleIds.size > 0 ?
    allRows
      .filter((row) => exactMatchOracleIds.has(row.oracle_id))
      .sort(compareExactPrintings) :
    [];

  const finalRows = (exactPrintingFamily.length > 0 ? exactPrintingFamily : exactMatches.length > 0 ? exactMatches : rankedRows.map(({ row }) => row))
    .filter((row) => hasDisplayableImage(row, allEnglishImageIndexes))
    .slice(0, limit)
    .map((row) => formatResult(row, allEnglishImageIndexes));

  return finalRows;
}

export async function searchMtgCatalogAdvanced(filters, options = {}) {
  const limit = Math.max(1, Math.min(options.limit || 100, 250));
  const page = Math.max(0, options.page || 0);
  const hasFilters = Boolean(
    filters?.name ||
    filters?.oracleText ||
    filters?.typeLine ||
    filters?.keywords?.length ||
    filters?.colors?.length ||
    filters?.cmc ||
    filters?.rarity ||
    filters?.set ||
    filters?.power ||
    filters?.toughness
  );

  if (!hasFilters) {
    return { results: [], total: 0, page, limit, hasMore: false };
  }

  try {
    const payload = await postLocalJsonIfAvailable('/api/local/mtg/advanced-search', { filters, limit, page });
    if (payload) {
      if (Array.isArray(payload?.results) && payload.results.every((row) => row?.groupKey && Array.isArray(row?.languageCodes))) {
        return payload;
      }

      const englishImageIndexes = buildEnglishImageIndexes(await loadAllBuckets());
      return normalizeAdvancedPayload(payload, englishImageIndexes, filters, page, limit);
    }
  } catch {
    // Fall back to static catalog scan.
  }

  try {
    const rows = await loadAllBuckets();
    const englishImageIndexes = buildEnglishImageIndexes(rows);
    const matchedRows = rows
      .filter((row) => hasDisplayableImage(row, englishImageIndexes))
      .filter((row) => matchesAdvancedFilters(row, filters || {}))
      .sort((a, b) => {
        const colorCompare = compareColorPriority(a, b, filters || {});
        if (colorCompare !== 0) return colorCompare;
        return compareExactPrintings(a, b);
      });
    const groupedResults = buildAdvancedGroupedResults(matchedRows, englishImageIndexes, filters || {});
    const total = groupedResults.length;
    const start = page * limit;
    const end = start + limit;

    return {
      results: groupedResults.slice(start, end),
      total,
      page,
      limit,
      hasMore: end < total
    };
  } catch {
    return { results: [], total: 0, page, limit, hasMore: false };
  }
}

export async function searchMtgCatalogSuggestions(query, limit = 10) {
  const normalizedQuery = normalizeText(query);
  if (!normalizedQuery || normalizedQuery.length < 2) {
    return [];
  }

  const bucket = bucketForQuery(normalizedQuery);
  const rows = await loadBucket(bucket);
  const englishImageIndexes = buildEnglishImageIndexes(rows);

  return dedupeByName(
    rows
      .map((row) => ({ row, score: scoreRow(row, normalizedQuery) }))
      .filter((item) => item.score > 0)
      .sort(compareRankedRows)
  )
    .slice(0, limit)
    .map(({ row }) => formatResult(row, englishImageIndexes));
}

export async function getMtgPrintingsByOracleId(oracleId) {
  if (!oracleId) {
    return [];
  }

  const oracleIds = new Set([oracleId]);
  const staticRowsPromise = loadRowsForOracleIds(oracleIds).catch(() => []);
  let apiRows = [];

  try {
    const rows = await getLocalJsonIfAvailable(`/api/local/mtg/printings/${encodeURIComponent(oracleId)}`);
    if (Array.isArray(rows)) {
      apiRows = rows;
    }
  } catch {
    // Fall back to static bucket lookup.
  }

  const staticRows = await staticRowsPromise;
  const rows = mergePrintingCollections(apiRows, staticRows);
  const englishImageIndexes = buildEnglishImageIndexes(rows);

  return rows
    .filter((row) => hasDisplayableImage(row, englishImageIndexes))
    .sort(compareExactPrintings)
    .map((row) => formatResult(row, englishImageIndexes));
}

export async function getMtgCatalogManifest() {
  return loadManifest();
}
