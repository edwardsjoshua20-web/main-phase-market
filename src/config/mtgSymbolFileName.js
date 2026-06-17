const SPECIAL_SYMBOL_FILE_NAMES = {
  '½': 'HALF.svg',
  'Â½': 'HALF.svg',
  '∞': 'INFINITY.svg',
  'âˆž': 'INFINITY.svg'
};

export function getMtgSymbolFileName(token) {
  const normalizedToken = String(token || '').trim().toUpperCase();
  if (!normalizedToken) {
    return '';
  }

  const specialFileName = SPECIAL_SYMBOL_FILE_NAMES[normalizedToken];
  if (specialFileName) {
    return specialFileName;
  }

  const compactToken = normalizedToken.replace(/[^A-Z0-9]/g, '');
  return compactToken ? `${compactToken}.svg` : '';
}

