export function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['\u2018\u2019\u02bc]/gu, '')
    .replace(/[^\p{L}\p{N}\u2605]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeSearchCompactText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '');
}

export function searchTextEquals(value, query) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedValue || !normalizedQuery) return false;
  return normalizedValue === normalizedQuery
    || normalizeSearchCompactText(normalizedValue) === normalizeSearchCompactText(normalizedQuery);
}

export function searchTextStartsWith(value, query) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedValue || !normalizedQuery) return false;
  return normalizedValue.startsWith(normalizedQuery)
    || normalizeSearchCompactText(normalizedValue).startsWith(normalizeSearchCompactText(normalizedQuery));
}

export function searchTextIncludes(value, query) {
  const normalizedValue = normalizeSearchText(value);
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedValue || !normalizedQuery) return false;
  return normalizedValue.includes(normalizedQuery)
    || normalizeSearchCompactText(normalizedValue).includes(normalizeSearchCompactText(normalizedQuery));
}

function isWithinOneEdit(left, right) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  return edits + (leftIndex < left.length || rightIndex < right.length ? 1 : 0) <= 1;
}

export function searchTextFuzzyEquals(value, query) {
  const left = normalizeSearchCompactText(value);
  const right = normalizeSearchCompactText(query);
  if (left.length < 5 || right.length < 5 || left[0] !== right[0]) return false;
  return isWithinOneEdit(left, right);
}

export function getCanonicalCardName(card = {}) {
  return String(card.name || card.product_name || '').trim();
}

export function getCardNameAliases(cardOrName = '') {
  const card = typeof cardOrName === 'string' ? { name: cardOrName } : (cardOrName || {});
  const canonicalName = getCanonicalCardName(card);
  const aliases = [
    canonicalName,
    card.printed_name,
    ...(Array.isArray(card.face_names) ? card.face_names : []),
    ...(Array.isArray(card.alternate_names) ? card.alternate_names : []),
    ...canonicalName.split(/\s*\/\/\s*/)
  ];
  const seen = new Set();

  return aliases
    .map((alias) => String(alias || '').trim())
    .filter((alias) => {
      const key = normalizeSearchText(alias);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function getCanonicalCardNameKey(cardOrName = '') {
  const name = typeof cardOrName === 'string' ? cardOrName : getCanonicalCardName(cardOrName);
  return normalizeSearchText(name);
}

export function isCanonicalCardNameMatch(cardOrName, query) {
  return getCardNameAliases(cardOrName).some((alias) => searchTextEquals(alias, query));
}

export function dedupeCanonicalCardResults(results = [], limit = Infinity) {
  const seen = new Set();
  const canonical = [];

  for (const card of results) {
    const nameKey = getCanonicalCardNameKey(card);
    const gameKey = normalizeSearchText(card.game || card.product_type || 'unknown');
    const identityKey = `${gameKey}::${nameKey}`;
    if (!nameKey || seen.has(identityKey)) continue;
    seen.add(identityKey);
    canonical.push({
      ...card,
      canonical_name: getCanonicalCardName(card),
      canonical_name_key: nameKey
    });
    if (canonical.length >= limit) break;
  }

  return canonical;
}

export function buildCanonicalCardNameIndex(rows = [], getName = getCanonicalCardName) {
  const index = new Map();

  for (const row of rows) {
    const key = getCanonicalCardNameKey(getName(row));
    if (!key) continue;
    const family = index.get(key);
    if (family) family.push(row);
    else index.set(key, [row]);
  }

  return index;
}
