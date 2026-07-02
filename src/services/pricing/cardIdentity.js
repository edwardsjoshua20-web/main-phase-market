function cleanText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeGame(value) {
  const raw = cleanText(value);
  if (raw === 'mtg') return 'magic';
  if (raw === 'yu-gi-oh' || raw === 'yugioh') return 'yugioh';
  if (raw === 'one-piece' || raw === 'onepiece') return 'onepiece';
  if (raw === 'flesh-and-blood' || raw === 'fleshandblood' || raw === 'fab') return 'fab';
  if (raw === 'star-wars' || raw === 'starwars') return 'starwars';
  return raw || 'unknown';
}

export function normalizeFinish(value) {
  const raw = cleanText(value);
  if (!raw || raw === 'normal' || raw === 'non-foil' || raw === 'nonfoil') return 'nonfoil';
  if (raw.includes('etched')) return 'etched';
  if (raw.includes('foil')) return 'foil';
  return raw;
}

export function buildCardIdentity(input = {}) {
  const game = normalizeGame(input.game || input.source_game);
  const name = cleanText(input.name || input.product_name);
  const setCode = cleanText(input.set_code || input.pack_id || input.set_id);
  const setName = cleanText(input.set_name || input.series);
  const cardNumber = cleanText(input.card_number || input.collector_number || input.number || input.id);
  const finish = normalizeFinish(input.finish || input.finishLabel);
  const language = cleanText(input.lang || input.language || 'en') || 'en';
  const oracleId = cleanText(input.oracle_id);
  const apiId = cleanText(input.api_id || input.id || input.unique_id);

  return {
    game,
    name,
    setCode,
    setName,
    cardNumber,
    finish,
    language,
    oracleId,
    apiId,
    key: [
      game,
      oracleId || apiId || name,
      setCode || setName || 'na',
      cardNumber || 'na',
      finish || 'nonfoil',
      language || 'en'
    ].join('::')
  };
}

export function buildSourceRowIdentity(input = {}) {
  return buildCardIdentity(input).key;
}
