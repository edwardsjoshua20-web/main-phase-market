export function getDeckCardIdentityKeys(card, normalizeName) {
  const keys = [];
  const oracleId = String(card?.oracle_id || '').trim().toLowerCase();
  if (oracleId) keys.push(`oracle:${oracleId}`);
  const name = normalizeName(card?.product_name || card?.name || '');
  if (name) keys.push(`name:${name}`);
  return keys;
}

export function reconcileDeckImport(results, currentItems, normalizeName) {
  const currentByIdentity = new Map(
    currentItems.flatMap((item) => getDeckCardIdentityKeys(item, normalizeName).map((key) => [key, item]))
  );
  const requestedIdentities = new Set();
  const already = [];
  const willAdd = [];
  const unresolved = [];

  results.forEach((result) => {
    if (!result.card) {
      unresolved.push(result);
      return;
    }
    const identityKeys = getDeckCardIdentityKeys(result.card, normalizeName);
    identityKeys.forEach((key) => requestedIdentities.add(key));
    const existing = identityKeys.map((key) => currentByIdentity.get(key)).find(Boolean);
    const currentQuantity = existing?.quantity || 0;
    const missingQuantity = Math.max(0, result.qty - currentQuantity);
    if (!missingQuantity) already.push({ ...result, existing, currentQuantity });
    else willAdd.push({ ...result, existing, currentQuantity, missingQuantity });
  });

  const extras = currentItems.filter((item) => (
    !getDeckCardIdentityKeys(item, normalizeName).some((key) => requestedIdentities.has(key))
  ));
  return { already, willAdd, unresolved, extras };
}
