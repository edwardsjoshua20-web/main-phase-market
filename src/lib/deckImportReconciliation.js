export function getDeckCardIdentityKeys(card, normalizeName) {
  const keys = [];
  const oracleId = String(card?.oracle_id || '').trim().toLowerCase();
  if (oracleId) keys.push(`oracle:${oracleId}`);
  const name = normalizeName(card?.product_name || card?.name || '');
  if (name) keys.push(`name:${name}`);
  return keys;
}

function getPrimaryIdentityKey(card, normalizeName) {
  return getDeckCardIdentityKeys(card, normalizeName)[0] || '';
}

function aggregateResolvedResults(results, normalizeName) {
  const aggregated = new Map();
  const unresolved = [];

  results.forEach((result) => {
    if (!result.card) {
      unresolved.push(result);
      return;
    }
    const key = getPrimaryIdentityKey(result.card, normalizeName);
    if (!key) {
      unresolved.push(result);
      return;
    }
    const existing = aggregated.get(key);
    if (existing) existing.qty += result.qty || 1;
    else aggregated.set(key, { ...result, qty: result.qty || 1 });
  });

  return { resolved: [...aggregated.values()], unresolved };
}

export function reconcileDeckImport(results, currentItems, normalizeName, options = {}) {
  const { getCopyLimit = () => Infinity } = options;
  const aggregated = aggregateResolvedResults(results, normalizeName);
  const requestedIdentities = new Set();
  const already = [];
  const willAdd = [];
  const conflicts = [];

  aggregated.resolved.forEach((result) => {
    const identityKeys = getDeckCardIdentityKeys(result.card, normalizeName);
    identityKeys.forEach((key) => requestedIdentities.add(key));
    const matchingItems = currentItems.filter((item) => (
      getDeckCardIdentityKeys(item, normalizeName).some((key) => identityKeys.includes(key))
    ));
    const existing = matchingItems[0] || null;
    const currentQuantity = matchingItems.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const requestedQuantity = result.qty || 1;
    const copyLimit = getCopyLimit(result.card, { existing, currentItems, requestedQuantity });
    const legalRequestedQuantity = Number.isFinite(copyLimit)
      ? Math.min(requestedQuantity, Math.max(0, copyLimit))
      : requestedQuantity;
    const alreadyQuantity = Math.min(currentQuantity, legalRequestedQuantity);
    const missingQuantity = Math.max(0, legalRequestedQuantity - currentQuantity);
    const conflictQuantity = Math.max(0, requestedQuantity - legalRequestedQuantity);

    if (alreadyQuantity > 0) already.push({ ...result, existing, currentQuantity, requestedQuantity, alreadyQuantity });
    if (missingQuantity > 0) willAdd.push({ ...result, existing, currentQuantity, requestedQuantity, missingQuantity });
    if (conflictQuantity > 0) conflicts.push({ ...result, existing, currentQuantity, requestedQuantity, legalRequestedQuantity, conflictQuantity, copyLimit });
  });

  const extras = currentItems.filter((item) => (
    !getDeckCardIdentityKeys(item, normalizeName).some((key) => requestedIdentities.has(key))
  ));
  return { already, willAdd, unresolved: aggregated.unresolved, conflicts, extras };
}
