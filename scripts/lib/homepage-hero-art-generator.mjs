import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { readSupabaseUploadConfig, toObjectKey, toStorageBaseUrl } from './supabase-public-data-upload.mjs';

const CANVAS_WIDTH = 3840;
const CANVAS_HEIGHT = 960;
const HERO_OUTPUT_RELATIVE_DIR = 'data/site/hero';
const HERO_OUTPUT_PUBLIC_DIR = path.join('public', 'data', 'site', 'hero');
const GAME_DATA_PATHS = {
  magic: 'mtg',
  pokemon: 'pokemon',
  yugioh: 'yugioh',
  lorcana: 'lorcana',
  fab: 'fab',
  onepiece: 'onepiece',
  starwars: 'starwars'
};

const GAME_ACCENTS = {
  magic: ['#4c1d95', '#7c2d12'],
  pokemon: ['#1d4ed8', '#ca8a04'],
  yugioh: ['#581c87', '#991b1b'],
  lorcana: ['#7c2d12', '#1d4ed8'],
  fab: ['#7f1d1d', '#92400e'],
  onepiece: ['#1d4ed8', '#991b1b'],
  starwars: ['#0f766e', '#854d0e'],
  other: ['#334155', '#475569']
};

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath, fallback = []) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'release';
}

function normalizeGame(game) {
  if (game === 'mtg') return 'magic';
  return GAME_DATA_PATHS[game] ? game : 'other';
}

function releaseCode(release = {}) {
  return String(release.code || release.set_code || release.id?.split(':').pop() || '').toUpperCase();
}

function releaseName(release = {}) {
  return String(release.name || release.set_name || release.setName || '').trim();
}

function dedupeAssets(assets = []) {
  const seen = new Set();
  return assets.filter((asset) => {
    if (!asset?.url) return false;
    const key = String(asset.url).trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isLikelyLogoOrSymbol(url = '') {
  const lower = String(url || '').toLowerCase();
  return lower.includes('logo')
    || lower.includes('symbol')
    || lower.includes('icon')
    || lower.endsWith('.svg');
}

function isLikelyOfficialIdentityAsset(asset = {}) {
  const text = `${asset.name || ''} ${asset.url || ''}`.toLowerCase();
  return ['product', 'pack', 'wrapper', 'deck', 'box', 'set image', 'set logo', 'key art', 'promo', 'hero', 'large image']
    .some((needle) => text.includes(needle));
}

function xmlEscape(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function isRemoteUrl(url = '') {
  return /^https?:\/\//i.test(String(url));
}

function resolveLocalPublicAsset(projectRoot, url = '') {
  const value = String(url || '').trim();
  if (!value || isRemoteUrl(value)) return null;
  const normalized = value.replace(/^\/+/, '');
  const fullPath = path.join(projectRoot, 'public', normalized);
  return fs.existsSync(fullPath) ? fullPath : null;
}

async function fetchImageBuffer(projectRoot, asset) {
  const localPath = resolveLocalPublicAsset(projectRoot, asset.url);
  if (localPath) {
    return fs.readFileSync(localPath);
  }

  if (!isRemoteUrl(asset.url)) {
    return null;
  }

  const response = await fetch(asset.url, {
    headers: {
      'User-Agent': 'MainPhaseMarketHeroAutomation/1.0'
    }
  });

  if (!response.ok) {
    return null;
  }

  return Buffer.from(await response.arrayBuffer());
}

async function inspectAsset(projectRoot, asset) {
  try {
    const buffer = await fetchImageBuffer(projectRoot, asset);
    if (!buffer?.length) return null;
    const image = sharp(buffer, { animated: false });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height) return null;
    const stats = await sharp(buffer, { animated: false })
      .resize({ width: 320, withoutEnlargement: true })
      .greyscale()
      .stats();
    const luma = stats.channels[0] || {};
    return {
      ...asset,
      buffer,
      width: metadata.width,
      height: metadata.height,
      ratio: metadata.width / metadata.height,
      megapixels: metadata.width * metadata.height,
      lumaMean: luma.mean || 0,
      lumaStdev: luma.stdev || 0
    };
  } catch {
    return null;
  }
}

function getCardImageFromYugioh(card) {
  const image = Array.isArray(card?.card_images) ? card.card_images[0] : null;
  return image?.image_url || image?.image_url_cropped || image?.image_url_small || null;
}

function getCardImageFromMagic(card) {
  return card?.image_uris?.large
    || card?.image_uris?.normal
    || card?.image_uris?.art_crop
    || card?.image_large
    || card?.image_normal
    || card?.image_url
    || null;
}

function magicCardsForRelease(cards, release) {
  const code = releaseCode(release).toLowerCase();
  if (!code) return [];
  return cards
    .filter((card) => {
      const setCode = String(card?.set || card?.set_code || card?.setCode || '').toLowerCase();
      return setCode === code;
    })
    .map((card) => ({
      kind: 'card',
      name: card.name,
      url: getCardImageFromMagic(card)
    }))
    .filter((asset) => asset.url);
}

function ygoCardsForRelease(cards, release) {
  const code = releaseCode(release);
  const name = releaseName(release).toLowerCase();
  return cards
    .filter((card) => (card.card_sets || []).some((set) => {
      const setCode = String(set?.set_code || '').toUpperCase();
      const setName = String(set?.set_name || '').toLowerCase();
      return (code && setCode.startsWith(`${code}-`)) || (name && setName === name);
    }))
    .map((card) => ({
      kind: 'card',
      name: card.name,
      url: getCardImageFromYugioh(card)
    }))
    .filter((asset) => asset.url);
}

function fabCardsForRelease(cards, release) {
  const code = releaseCode(release);
  return cards
    .map((card) => {
      const printing = (card.printings || []).find((entry) => String(entry?.set_id || '').toUpperCase() === code && entry?.image_url);
      return printing ? {
        kind: 'card',
        name: card.name,
        url: printing.image_url
      } : null;
    })
    .filter(Boolean);
}

function lorcanaCardsForRelease(cards, release) {
  const code = releaseCode(release);
  const name = releaseName(release).toLowerCase();
  return cards
    .filter((card) => {
      const set = card?.set || {};
      return String(set.code || '').toUpperCase() === code || String(set.name || '').toLowerCase() === name;
    })
    .map((card) => ({
      kind: 'card',
      name: card.name,
      url: card.image_uris?.digital?.large || card.image_uris?.digital?.normal || card.image_uris?.large || card.image_url
    }))
    .filter((asset) => asset.url);
}

function starwarsCardsForRelease(cards, release) {
  const code = releaseCode(release);
  return cards
    .filter((card) => String(card.setCode || card.set_code || '').toUpperCase() === code)
    .map((card) => ({
      kind: 'card',
      name: card.name,
      url: card.frontImageUrl || card.image_url
    }))
    .filter((asset) => asset.url);
}

function onePieceCardsForRelease(cards, release) {
  const code = releaseCode(release);
  return cards
    .filter((card) => String(card.pack_id || card.set_code || '').toUpperCase() === code)
    .map((card) => ({
      kind: 'card',
      name: card.name,
      url: card.image_url
    }))
    .filter((asset) => asset.url);
}

function getCardAssetsForRelease(projectRoot, release) {
  const game = normalizeGame(release.game);
  const dataDir = GAME_DATA_PATHS[game];
  if (!dataDir) return [];

  const cards = readJsonIfExists(path.join(projectRoot, 'public', 'data', dataDir, 'cards.json'), []);
  if (!Array.isArray(cards) || cards.length === 0) return [];

  if (game === 'yugioh') return ygoCardsForRelease(cards, release);
  if (game === 'magic') return magicCardsForRelease(cards, release);
  if (game === 'fab') return fabCardsForRelease(cards, release);
  if (game === 'lorcana') return lorcanaCardsForRelease(cards, release);
  if (game === 'starwars') return starwarsCardsForRelease(cards, release);
  if (game === 'onepiece') return onePieceCardsForRelease(cards, release);
  return [];
}

function getApprovedSourceAssetsForRelease(release = {}) {
  const assets = Array.isArray(release.hero_source_assets)
    ? release.hero_source_assets
    : Array.isArray(release.approved_hero_source_assets)
      ? release.approved_hero_source_assets
      : [];

  return dedupeAssets(assets.map((asset) => ({
    kind: asset.kind || 'product',
    name: asset.name || 'approved hero source',
    url: asset.url || asset.image_url || asset.src
  })));
}

function getApprovedSourceMode(release = {}) {
  return String(release.hero_source_mode || release.approved_hero_source_mode || '').trim().toLowerCase();
}

function getBaseAssetsForRelease(release) {
  return dedupeAssets([
    { kind: 'premium', name: 'hero', url: release.hero_image_url || release.heroImageUrl },
    { kind: 'premium', name: 'promo', url: release.promo_image_url || release.promoImageUrl },
    { kind: 'premium', name: 'key art', url: release.key_art || release.keyArt },
    { kind: 'product', name: 'set image', url: release.set_image_url || release.set_image || release.image_url },
    { kind: 'product', name: 'large image', url: release.image_large || release.images?.large },
    { kind: 'logo', name: 'set logo', url: release.set_logo || release.images?.logo }
  ]);
}

function assetProjectedSize(asset, targetWidth, targetHeight) {
  const scale = Math.min(targetWidth / asset.width, targetHeight / asset.height, 1);
  const width = Math.round(asset.width * scale);
  const height = Math.round(asset.height * scale);
  return {
    width,
    height,
    occupancy: (width * height) / (CANVAS_WIDTH * CANVAS_HEIGHT)
  };
}

function visualOccupancyForAsset(asset, mode = 'identity') {
  if (mode === 'wide') {
    return (2580 * CANVAS_HEIGHT) / (CANVAS_WIDTH * CANVAS_HEIGHT);
  }
  const isLogo = asset.kind === 'logo' || isLikelyLogoOrSymbol(asset.url);
  const targetWidth = isLogo ? 1380 : 1320;
  const targetHeight = isLogo ? 430 : 760;
  return assetProjectedSize(asset, targetWidth, targetHeight).occupancy;
}

function hasStrongSourceDimensions(asset) {
  if (asset.kind === 'card') return asset.width >= 360 && asset.height >= 500 && asset.megapixels >= 180000;
  if (asset.kind === 'logo') return asset.width >= 900 && asset.height >= 220 && asset.megapixels >= 250000;
  return asset.width >= 760 && asset.height >= 520 && asset.megapixels >= 500000;
}

function hasMeaningfulContrast(asset, minimumMean = 18, minimumStdev = 18) {
  return Number(asset.lumaMean || 0) >= minimumMean && Number(asset.lumaStdev || 0) >= minimumStdev;
}

function selectIdentityAssets(assets) {
  const usable = assets
    .filter((asset) => ['product', 'logo'].includes(asset.kind))
    .filter((asset) => isLikelyOfficialIdentityAsset(asset))
    .filter((asset) => hasStrongSourceDimensions(asset))
    .filter((asset) => {
      const occupancy = visualOccupancyForAsset(asset, 'identity');
      const isLogo = asset.kind === 'logo' || isLikelyLogoOrSymbol(asset.url);
      if (!isLogo && asset.ratio > 1.45) return false;
      return isLogo ? occupancy >= 0.045 : occupancy >= 0.09;
    })
    .sort((a, b) => {
      const kindDelta = (a.kind === 'product' ? 1 : 0) - (b.kind === 'product' ? 1 : 0);
      if (kindDelta !== 0) return -kindDelta;
      return b.megapixels - a.megapixels;
    });
  return usable.slice(0, 2);
}

function selectWideKeyArtAsset(assets) {
  return assets.find((asset) => {
    if (!['premium', 'product'].includes(asset.kind)) return false;
    if (isLikelyLogoOrSymbol(asset.url)) return false;
    if (!hasMeaningfulContrast(asset, 18, 22)) return false;
    return asset.width >= 1400 && asset.height >= 650 && asset.ratio >= 1.55 && asset.ratio <= 2.45;
  }) || null;
}

function scoreCompositeAsset(asset) {
  let score = 0;
  if (asset.kind === 'card') score += 40;
  if (asset.kind === 'product') score += 34;
  if (asset.kind === 'logo') score += 15;
  if (asset.megapixels >= 300000) score += 12;
  if (asset.width >= 500 || asset.height >= 500) score += 8;
  if (asset.kind === 'logo') score -= 8;
  return score;
}

function selectThreeCardFallback(assets) {
  const usable = assets.filter((asset) => asset.width >= 140 && asset.height >= 140 && asset.megapixels >= 40000);
  const cards = usable
    .filter((asset) => asset.kind === 'card')
    .filter((asset) => hasStrongSourceDimensions(asset))
    .sort((a, b) => scoreCompositeAsset(b) - scoreCompositeAsset(a))
    .slice(0, 3);

  return cards.length >= 3
    ? { mode: 'three-card-composite', assets: cards, reason: 'last-resort-card-composite' }
    : { mode: 'ineligible', assets: cards, reason: usable.length > 0 ? 'no-strong-identity-assets' : 'no-usable-assets' };
}

function selectProductComposition(assets) {
  const products = assets
    .filter((asset) => asset.kind === 'product')
    .filter((asset) => isLikelyOfficialIdentityAsset(asset))
    .filter((asset) => asset.width >= 420 && asset.height >= 420 && asset.megapixels >= 180000)
    .filter((asset) => hasMeaningfulContrast(asset))
    .sort((a, b) => scoreCompositeAsset(b) - scoreCompositeAsset(a))
    .slice(0, 2);

  if (products.length === 0) {
    return { mode: 'ineligible', assets: [], reason: 'no-strong-product-assets' };
  }

  const occupancy = products.reduce((total, asset) => {
    const projected = assetProjectedSize(asset, products.length > 1 ? 900 : 1180, products.length > 1 ? 720 : 760);
    return total + projected.occupancy;
  }, 0);

  return occupancy >= 0.075
    ? { mode: 'product-composition', assets: products, reason: 'official-product-composition' }
    : { mode: 'ineligible', assets: products, reason: 'insufficient-product-visual-occupancy' };
}

function selectApprovedTitleGraphicSource(assets) {
  const logo = assets
    .filter((asset) => asset.kind === 'logo')
    .filter((asset) => hasStrongSourceDimensions(asset))
    .filter((asset) => visualOccupancyForAsset(asset, 'identity') >= 0.045)
    .sort((a, b) => b.megapixels - a.megapixels)[0];

  return logo
    ? { mode: 'title-graphic', assets: [logo], reason: 'branded-title-graphic' }
    : { mode: 'ineligible', assets: [], reason: 'no-approved-branded-title-source' };
}

function selectApprovedSourceComposition(assets, mode) {
  if (mode === 'three-card-composite') {
    const cards = assets
      .filter((asset) => asset.kind === 'card')
      .filter((asset) => hasStrongSourceDimensions(asset))
      .slice(0, 3);

    return cards.length >= 3
      ? { mode: 'three-card-composite', assets: cards, reason: 'approved-source-card-composite' }
      : { mode: 'ineligible', assets: cards, reason: 'approved-card-source-unusable' };
  }

  if (mode === 'identity-image' || mode === 'approved-identity-image') {
    const identityAssets = selectIdentityAssets(assets);
    return identityAssets.length > 0
      ? { mode: 'identity-image', assets: identityAssets, reason: 'approved-identity-image' }
      : { mode: 'ineligible', assets: [], reason: 'approved-identity-source-unusable' };
  }

  if (mode === 'wide-key-art' || mode === 'approved-wide-key-art') {
    const wideKeyArt = selectWideKeyArtAsset(assets);
    return wideKeyArt
      ? { mode: 'wide-key-art', assets: [wideKeyArt], reason: 'approved-wide-key-art' }
      : { mode: 'ineligible', assets: [], reason: 'approved-wide-source-unusable' };
  }

  return { mode: 'ineligible', assets: [], reason: 'no-approved-source-mode' };
}

function backgroundSvg(game) {
  const [accentA, accentB] = GAME_ACCENTS[game] || GAME_ACCENTS.other;
  return Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#020617"/>
          <stop offset="0.46" stop-color="#0f172a"/>
          <stop offset="1" stop-color="#111827"/>
        </linearGradient>
        <radialGradient id="a" cx="78%" cy="45%" r="55%">
          <stop offset="0" stop-color="${accentA}" stop-opacity="0.72"/>
          <stop offset="0.42" stop-color="${accentB}" stop-opacity="0.38"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="shade" x1="0" x2="1">
          <stop offset="0" stop-color="#020617" stop-opacity="0.98"/>
          <stop offset="0.42" stop-color="#020617" stop-opacity="0.90"/>
          <stop offset="0.70" stop-color="#020617" stop-opacity="0.24"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="3840" height="960" fill="url(#bg)"/>
      <rect x="1340" width="2500" height="960" fill="url(#a)"/>
      <path d="M2260 0 L3840 0 L3840 960 L1900 960 Z" fill="#ffffff" opacity="0.035"/>
      <path d="M2600 -120 L3900 700" stroke="#ffffff" stroke-opacity="0.08" stroke-width="36"/>
      <path d="M2370 1040 L3860 160" stroke="#ffffff" stroke-opacity="0.06" stroke-width="26"/>
      <rect width="3840" height="960" fill="url(#shade)"/>
    </svg>
  `);
}

async function prepareCardLayer(asset, index, count) {
  const height = count >= 3 ? 735 : 760;
  const angle = [-9, 3, 11][index] || 0;
  const image = await sharp(asset.buffer)
    .resize({ height, withoutEnlargement: true })
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toBuffer();
  const metadata = await sharp(image).metadata();
  const baseLeft = count === 1 ? 2630 : count === 2 ? 2380 + (index * 430) : 2190 + (index * 430);
  const top = Math.round((CANVAS_HEIGHT - metadata.height) / 2) + [-12, -34, 24][index];
  return {
    input: image,
    left: Math.max(1880, Math.round(baseLeft)),
    top: Math.max(40, top)
  };
}

async function prepareProductLayer(asset, index, count, hasCards) {
  const angle = count === 1 ? -2 : [-7, 5, 10][index] || 0;
  const targetWidth = hasCards ? 760 : count === 1 ? 1180 : 900;
  const targetHeight = hasCards ? 660 : count === 1 ? 760 : 720;
  const image = await sharp(asset.buffer)
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: 'inside',
      withoutEnlargement: true
    })
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 92 })
    .toBuffer();
  const metadata = await sharp(image).metadata();
  const productPositions = count === 1
    ? [2440]
    : count === 2
      ? [2350, 2940]
      : [2190, 2700, 3190];
  return {
    input: image,
    left: hasCards ? 2920 : productPositions[index],
    top: Math.round((CANVAS_HEIGHT - metadata.height) / 2) + ([-4, -28, 22][index] || 0)
  };
}

async function prepareIdentityLayer(asset, index, count) {
  const isLogo = asset.kind === 'logo' || isLikelyLogoOrSymbol(asset.url);
  const width = isLogo ? 1380 : count > 1 ? 1020 : 1320;
  const height = isLogo ? 430 : count > 1 ? 720 : 760;
  const angle = count > 1 && !isLogo ? [-3, 4][index] || 0 : 0;
  const image = await sharp(asset.buffer)
    .resize({ width, height, fit: 'inside', withoutEnlargement: true })
    .rotate(angle, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 94 })
    .toBuffer();
  const metadata = await sharp(image).metadata();
  const left = count > 1 ? [2180, 2860][index] : 2380;
  const top = Math.round((CANVAS_HEIGHT - metadata.height) / 2) + (count > 1 ? [-18, 28][index] || 0 : 0);
  return {
    input: image,
    left: Math.max(1900, left),
    top: Math.max(54, top),
    width: metadata.width,
    height: metadata.height
  };
}

function shadowLayer(left, top, width, height) {
  return {
    input: Buffer.from(`<svg width="${width + 120}" height="${height + 120}" xmlns="http://www.w3.org/2000/svg"><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="34" stdDeviation="30" flood-color="#000" flood-opacity="0.46"/></filter><rect x="60" y="50" width="${width}" height="${height}" rx="34" fill="#111827" opacity="0.08" filter="url(#s)"/></svg>`),
    left: left - 60,
    top: top - 50
  };
}

async function composeIdentityHero(projectRoot, release, assets, outputRelativePath) {
  const layers = [];
  for (let index = 0; index < assets.length; index += 1) {
    const layer = await prepareIdentityLayer(assets[index], index, assets.length);
    layers.push(shadowLayer(layer.left, layer.top, layer.width, layer.height), layer);
  }

  const fullOutputPath = path.join(projectRoot, 'public', outputRelativePath);
  ensureDir(path.dirname(fullOutputPath));
  await sharp(backgroundSvg(normalizeGame(release.game)))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .composite(layers)
    .webp({ quality: 88, effort: 5 })
    .toFile(fullOutputPath);

  const metadata = await sharp(fullOutputPath).metadata();
  return {
    path: fullOutputPath,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(fullOutputPath).size
  };
}

function wrapTitleLines(title, maxChars = 15) {
  const words = String(title || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

async function composeTitleHero(projectRoot, release, outputRelativePath, assets = []) {
  const game = normalizeGame(release.game);
  const [accentA, accentB] = GAME_ACCENTS[game] || GAME_ACCENTS.other;
  const titleLines = wrapTitleLines(releaseName(release), 16);
  const code = releaseCode(release);
  const titleText = titleLines.map((line, index) => `
    <text x="2200" y="${342 + index * 116}" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="104" font-weight="900" letter-spacing="1.5">${xmlEscape(line.toUpperCase())}</text>
  `).join('');
  const titleLayer = Buffer.from(`
    <svg width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="line" x1="0" x2="1">
          <stop offset="0" stop-color="${accentA}"/>
          <stop offset="1" stop-color="${accentB}"/>
        </linearGradient>
        <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="26" stdDeviation="28" flood-color="#000" flood-opacity="0.48"/>
        </filter>
      </defs>
      <g filter="url(#glow)">
        <rect x="2100" y="224" width="1420" height="452" rx="0" fill="#020617" opacity="0.52"/>
        <rect x="2100" y="224" width="7" height="452" fill="url(#line)"/>
        ${titleText}
        ${code ? `<text x="2206" y="724" fill="#cbd5e1" font-family="Inter, Arial, sans-serif" font-size="42" font-weight="800" letter-spacing="10">${xmlEscape(code)}</text>` : ''}
      </g>
    </svg>
  `);

  const fullOutputPath = path.join(projectRoot, 'public', outputRelativePath);
  ensureDir(path.dirname(fullOutputPath));
  const composites = [{ input: titleLayer, left: 0, top: 0 }];

  const logo = assets.find((asset) => asset.kind === 'logo');
  if (logo) {
    const logoImage = await sharp(logo.buffer)
      .resize({ width: 1200, height: 360, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 94 })
      .toBuffer();
    const metadata = await sharp(logoImage).metadata();
    composites.push({
      input: logoImage,
      left: Math.max(2100, Math.round(2780 - (metadata.width / 2))),
      top: Math.max(92, Math.round(150 - (metadata.height / 2)))
    });
  }

  await sharp(backgroundSvg(game))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .composite(composites)
    .webp({ quality: 88, effort: 5 })
    .toFile(fullOutputPath);

  const metadata = await sharp(fullOutputPath).metadata();
  return {
    path: fullOutputPath,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(fullOutputPath).size
  };
}

async function composeWideHero(projectRoot, release, asset, outputRelativePath) {
  const visualWidth = 2580;
  const visualLeft = CANVAS_WIDTH - visualWidth;
  const mask = Buffer.from(`
    <svg width="${visualWidth}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${visualWidth} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" x2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0"/>
          <stop offset="0.26" stop-color="#fff" stop-opacity="0.18"/>
          <stop offset="0.48" stop-color="#fff" stop-opacity="0.82"/>
          <stop offset="1" stop-color="#fff" stop-opacity="1"/>
        </linearGradient>
      </defs>
      <rect width="${visualWidth}" height="${CANVAS_HEIGHT}" fill="url(#fade)"/>
    </svg>
  `);
  const wideImage = await sharp(asset.buffer)
    .resize({ width: visualWidth, height: CANVAS_HEIGHT, fit: 'cover', position: 'right' })
    .composite([{ input: mask, blend: 'dest-in' }])
    .webp({ quality: 92 })
    .toBuffer();
  const glaze = Buffer.from(`
    <svg width="${visualWidth}" height="${CANVAS_HEIGHT}" viewBox="0 0 ${visualWidth} ${CANVAS_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="shade" x1="0" x2="1">
          <stop offset="0" stop-color="#020617" stop-opacity="0.74"/>
          <stop offset="0.34" stop-color="#020617" stop-opacity="0.34"/>
          <stop offset="1" stop-color="#020617" stop-opacity="0.08"/>
        </linearGradient>
      </defs>
      <rect width="${visualWidth}" height="${CANVAS_HEIGHT}" fill="url(#shade)"/>
    </svg>
  `);
  const fullOutputPath = path.join(projectRoot, 'public', outputRelativePath);
  ensureDir(path.dirname(fullOutputPath));
  await sharp(backgroundSvg(normalizeGame(release.game)))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .composite([
      { input: wideImage, left: visualLeft, top: 0 },
      { input: glaze, left: visualLeft, top: 0 }
    ])
    .webp({ quality: 86, effort: 5 })
    .toFile(fullOutputPath);

  const metadata = await sharp(fullOutputPath).metadata();
  return {
    path: fullOutputPath,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(fullOutputPath).size
  };
}

async function composeHero(projectRoot, release, assets, outputRelativePath) {
  const cards = assets.filter((asset) => asset.kind === 'card');
  const products = assets.filter((asset) => asset.kind === 'product');
  const layers = [];

  for (let index = 0; index < products.length; index += 1) {
    const layer = await prepareProductLayer(products[index], index, products.length, cards.length > 0);
    layers.push(shadowLayer(layer.left, layer.top, 760, 640), layer);
  }

  for (let index = 0; index < cards.length; index += 1) {
    const layer = await prepareCardLayer(cards[index], index, cards.length);
    layers.push(shadowLayer(layer.left, layer.top, 470, 660), layer);
  }

  const fullOutputPath = path.join(projectRoot, 'public', outputRelativePath);
  ensureDir(path.dirname(fullOutputPath));
  await sharp(backgroundSvg(normalizeGame(release.game)))
    .resize(CANVAS_WIDTH, CANVAS_HEIGHT)
    .composite(layers)
    .webp({ quality: 86, effort: 5 })
    .toFile(fullOutputPath);

  const metadata = await sharp(fullOutputPath).metadata();
  return {
    path: fullOutputPath,
    width: metadata.width,
    height: metadata.height,
    bytes: fs.statSync(fullOutputPath).size
  };
}

function publicUrlForGeneratedAsset(projectRoot, relativePath) {
  try {
    const config = readSupabaseUploadConfig(projectRoot);
    if (config.supabaseUrl && config.bucketName) {
      const storageBaseUrl = toStorageBaseUrl(config.supabaseUrl, config.bucketName)
        .replace('/storage/v1/object/', '/storage/v1/object/public/');
      return `${storageBaseUrl}/${toObjectKey(relativePath)}`;
    }
  } catch {
    // Local-only generation can still use the public-relative path.
  }
  return `/${relativePath}`;
}

async function classifyRelease(projectRoot, release) {
  const approvedSourceMode = getApprovedSourceMode(release);
  const approvedSourceAssets = getApprovedSourceAssetsForRelease(release);
  const baseAssets = getBaseAssetsForRelease(release);
  const cardAssets = getCardAssetsForRelease(projectRoot, release);
  const approvedInspected = [];
  const inspected = [];

  for (const asset of approvedSourceAssets.slice(0, 6)) {
    const result = await inspectAsset(projectRoot, asset);
    if (result) {
      approvedInspected.push(result);
      inspected.push(result);
    }
  }

  for (const asset of dedupeAssets([...baseAssets, ...cardAssets]).slice(0, 18)) {
    if (approvedSourceAssets.some((approvedAsset) => approvedAsset.url === asset.url)) continue;
    const result = await inspectAsset(projectRoot, asset);
    if (result) inspected.push(result);
  }

  const game = normalizeGame(release.game);
  const slug = `${game}-${slugify(releaseName(release) || release.id)}.webp`;
  const outputRelativePath = `${HERO_OUTPUT_RELATIVE_DIR}/${slug}`;

  if (approvedSourceMode) {
    const approvedSourceSelection = selectApprovedSourceComposition(approvedInspected, approvedSourceMode);
    if (approvedSourceSelection.mode === 'three-card-composite' || approvedSourceSelection.mode === 'product-composition') {
      const output = await composeHero(projectRoot, release, approvedSourceSelection.assets, outputRelativePath);
      return {
        mode: approvedSourceSelection.mode,
        eligible: true,
        heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
        generatedPath: outputRelativePath,
        generatedWidth: output.width,
        generatedHeight: output.height,
        generatedBytes: output.bytes,
        sourceAssets: approvedSourceSelection.assets,
        reason: approvedSourceSelection.reason
      };
    }

    if (approvedSourceSelection.mode === 'identity-image') {
      const output = await composeIdentityHero(projectRoot, release, approvedSourceSelection.assets, outputRelativePath);
      return {
        mode: approvedSourceSelection.mode,
        eligible: true,
        heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
        generatedPath: outputRelativePath,
        generatedWidth: output.width,
        generatedHeight: output.height,
        generatedBytes: output.bytes,
        sourceAssets: approvedSourceSelection.assets,
        reason: approvedSourceSelection.reason
      };
    }

    if (approvedSourceSelection.mode === 'wide-key-art') {
      const output = await composeWideHero(projectRoot, release, approvedSourceSelection.assets[0], outputRelativePath);
      return {
        mode: approvedSourceSelection.mode,
        eligible: true,
        heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
        generatedPath: outputRelativePath,
        generatedWidth: output.width,
        generatedHeight: output.height,
        generatedBytes: output.bytes,
        sourceAssets: approvedSourceSelection.assets,
        reason: approvedSourceSelection.reason
      };
    }

    return {
      mode: 'ineligible',
      eligible: false,
      heroImageUrl: null,
      sourceAssets: approvedSourceSelection.assets,
      reason: approvedSourceSelection.reason
    };
  }

  const identityAssets = selectIdentityAssets(inspected);
  if (identityAssets.length > 0) {
    const output = await composeIdentityHero(projectRoot, release, identityAssets, outputRelativePath);
    return {
      mode: 'identity-image',
      eligible: true,
      heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
      generatedPath: outputRelativePath,
      generatedWidth: output.width,
      generatedHeight: output.height,
      generatedBytes: output.bytes,
      sourceAssets: identityAssets,
      reason: 'official-identity-image'
    };
  }

  const wideKeyArt = selectWideKeyArtAsset(inspected);
  if (wideKeyArt) {
    const output = await composeWideHero(projectRoot, release, wideKeyArt, outputRelativePath);
    return {
      mode: 'wide-key-art',
      eligible: true,
      heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
      generatedPath: outputRelativePath,
      generatedWidth: output.width,
      generatedHeight: output.height,
      generatedBytes: output.bytes,
      sourceAssets: [wideKeyArt],
      reason: 'blended-wide-key-art'
    };
  }

  const productComposition = selectProductComposition(inspected);
  if (productComposition.mode !== 'ineligible') {
    const output = await composeHero(projectRoot, release, productComposition.assets, outputRelativePath);
    return {
      mode: productComposition.mode,
      eligible: true,
      heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
      generatedPath: outputRelativePath,
      generatedWidth: output.width,
      generatedHeight: output.height,
      generatedBytes: output.bytes,
      sourceAssets: productComposition.assets,
      reason: productComposition.reason
    };
  }

  const composition = selectThreeCardFallback(inspected);
  if (composition.mode !== 'ineligible') {
    const output = await composeHero(projectRoot, release, composition.assets, outputRelativePath);
    return {
      mode: composition.mode,
      eligible: true,
      heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
      generatedPath: outputRelativePath,
      generatedWidth: output.width,
      generatedHeight: output.height,
      generatedBytes: output.bytes,
      sourceAssets: composition.assets,
      reason: composition.reason
    };
  }

  const titleGraphic = selectApprovedTitleGraphicSource(inspected);
  if (titleGraphic.mode !== 'ineligible') {
    const output = await composeTitleHero(projectRoot, release, outputRelativePath, titleGraphic.assets);
    return {
      mode: titleGraphic.mode,
      eligible: true,
      heroImageUrl: publicUrlForGeneratedAsset(projectRoot, outputRelativePath),
      generatedPath: outputRelativePath,
      generatedWidth: output.width,
      generatedHeight: output.height,
      generatedBytes: output.bytes,
      sourceAssets: titleGraphic.assets,
      reason: titleGraphic.reason
    };
  }

  return {
    mode: 'ineligible',
    eligible: false,
    heroImageUrl: null,
    sourceAssets: [...productComposition.assets, ...composition.assets, ...titleGraphic.assets],
    reason: titleGraphic.reason || composition.reason || productComposition.reason
  };
}

export async function applyHeroArtworkToReleases(releases = [], options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  ensureDir(path.join(projectRoot, HERO_OUTPUT_PUBLIC_DIR));

  const results = [];
  const nextReleases = [];

  for (const release of releases) {
    const classification = await classifyRelease(projectRoot, release);
    results.push({
      id: release.id,
      game: release.game,
      name: release.name,
      mode: classification.mode,
      eligible: classification.eligible,
      heroImageUrl: classification.heroImageUrl,
      generatedPath: classification.generatedPath || null,
      reason: classification.reason,
      sourceAssets: classification.sourceAssets.map((asset) => ({
        kind: asset.kind,
        name: asset.name,
        url: asset.url,
        width: asset.width,
        height: asset.height
      }))
    });

    nextReleases.push({
      ...release,
      hero_image_url: classification.heroImageUrl,
      hero_visual_mode: classification.mode,
      hero_eligible: classification.eligible,
      hero_art_reason: classification.reason,
      hero_generated_path: classification.generatedPath || null,
      hero_generated_width: classification.generatedWidth || null,
      hero_generated_height: classification.generatedHeight || null,
      hero_source_assets: classification.sourceAssets.map((asset) => ({
        kind: asset.kind,
        name: asset.name,
        url: asset.url,
        width: asset.width,
        height: asset.height
      }))
    });
  }

  return {
    releases: nextReleases,
    results
  };
}
