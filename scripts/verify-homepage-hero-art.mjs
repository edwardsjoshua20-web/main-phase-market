import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'site', 'upcoming-releases.json');
const EXPECTED_WIDTH = 3840;
const EXPECTED_HEIGHT = 960;
const APPROVED_MODES = new Set([
  'identity-image',
  'wide-key-art',
  'product-composition',
  'title-graphic',
  'three-card-composite',
  'ineligible'
]);
const REQUIRED_RELEASE_MODES = {
  'yugioh:MAMS': 'three-card-composite'
};

const MIN_SOURCE = {
  card: { width: 360, height: 500, megapixels: 180000 },
  logo: { width: 900, height: 220, megapixels: 250000 },
  product: { width: 420, height: 420, megapixels: 180000 },
  identityProduct: { width: 760, height: 520, megapixels: 500000 }
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'set';
}

function fail(message) {
  console.error(`[homepage:hero-art:verify] ${message}`);
  process.exitCode = 1;
}

function localPathForGeneratedAsset(release) {
  const generatedPath = String(release.hero_generated_path || '').trim();
  if (!generatedPath) return null;
  return path.join(ROOT, 'public', generatedPath);
}

function assetMegapixels(asset = {}) {
  return Number(asset.width || 0) * Number(asset.height || 0);
}

function projectedOccupancy(asset = {}, targetWidth, targetHeight) {
  const width = Number(asset.width || 0);
  const height = Number(asset.height || 0);
  if (!width || !height) return 0;
  const scale = Math.min(targetWidth / width, targetHeight / height, 1);
  return ((width * scale) * (height * scale)) / (EXPECTED_WIDTH * EXPECTED_HEIGHT);
}

function sourceMeetsMinimum(asset = {}, minimum) {
  return Number(asset.width || 0) >= minimum.width
    && Number(asset.height || 0) >= minimum.height
    && assetMegapixels(asset) >= minimum.megapixels;
}

function isLikelyLogo(asset = {}) {
  const url = String(asset.url || '').toLowerCase();
  return asset.kind === 'logo'
    || url.includes('logo')
    || url.includes('symbol')
    || url.includes('icon')
    || url.endsWith('.svg');
}

function verifySourceAssets(release, mode, sourceAssets) {
  if (mode !== 'ineligible' && sourceAssets.length === 0) {
    fail(`${release.game}:${release.name} ${mode} has no recorded source assets.`);
    return;
  }

  if (mode === 'title-graphic') {
    if (sourceAssets.length === 0) {
      fail(`${release.game}:${release.name} title-graphic is source-less plain title placeholder.`);
      return;
    }
    const hasLogo = sourceAssets.some((asset) => isLikelyLogo(asset) && sourceMeetsMinimum(asset, MIN_SOURCE.logo));
    if (!hasLogo) {
      fail(`${release.game}:${release.name} title-graphic lacks an approved branded identity source.`);
    }
    return;
  }

  if (mode === 'identity-image') {
    const weak = sourceAssets.filter((asset) => {
      const minimum = isLikelyLogo(asset) ? MIN_SOURCE.logo : MIN_SOURCE.identityProduct;
      const occupancy = projectedOccupancy(asset, isLikelyLogo(asset) ? 1380 : 1320, isLikelyLogo(asset) ? 430 : 760);
      return !sourceMeetsMinimum(asset, minimum) || occupancy < (isLikelyLogo(asset) ? 0.045 : 0.09);
    });
    if (weak.length > 0) {
      fail(`${release.game}:${release.name} identity-image uses weak source asset(s): ${weak.map((asset) => `${asset.name || asset.kind}:${asset.width}x${asset.height}`).join(', ')}.`);
    }
    return;
  }

  if (mode === 'product-composition') {
    const weak = sourceAssets.filter((asset) => !sourceMeetsMinimum(asset, MIN_SOURCE.product));
    const occupancy = sourceAssets.reduce((total, asset) => {
      return total + projectedOccupancy(asset, sourceAssets.length > 1 ? 900 : 1180, sourceAssets.length > 1 ? 720 : 760);
    }, 0);
    if (weak.length > 0 || occupancy < 0.075) {
      fail(`${release.game}:${release.name} product-composition has insufficient source quality or visual occupancy.`);
    }
    return;
  }

  if (mode === 'three-card-composite') {
    if (sourceAssets.length < 3) {
      fail(`${release.game}:${release.name} three-card-composite has fewer than three cards.`);
      return;
    }
    const weak = sourceAssets.filter((asset) => !sourceMeetsMinimum(asset, MIN_SOURCE.card));
    if (weak.length > 0) {
      fail(`${release.game}:${release.name} three-card-composite uses weak card source asset(s).`);
    }
  }
}

async function rightSideHasMeaningfulPixels(filePath) {
  const width = EXPECTED_WIDTH - 1900;
  const stats = await sharp(filePath)
    .extract({ left: 1900, top: 0, width, height: EXPECTED_HEIGHT })
    .greyscale()
    .stats();
  const channel = stats.channels[0];
  return channel.mean > 6 && channel.stdev > 12;
}

async function verify() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    fail(`Missing manifest: ${MANIFEST_PATH}`);
    return;
  }

  const payload = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const releases = Array.isArray(payload.releases) ? payload.releases : [];
  if (releases.length === 0) {
    fail('Manifest has no releases.');
    return;
  }

  const heroEligible = releases.filter((release) => release.hero_eligible !== false);
  if (heroEligible.length === 0) {
    fail('No hero-eligible releases remain after quality gating.');
  }

  for (const release of releases) {
    const mode = String(release.hero_visual_mode || '').toLowerCase();
    const gameKey = String(release.game_key || release.game || '').trim();
    const setCode = String(release.set_code || release.code || '').trim();
    const releaseKey = `${gameKey}:${setCode}`;
    const canonicalSlug = String(release.canonical_slug || '').trim();
    const canonicalReleaseKey = String(release.canonical_release_key || '').trim();
    const setDetailHref = String(release.links?.setDetail || release.cta_href || '').trim();
    const expectedSlug = slugify(release.name);
    const expectedHeroPath = `data/site/hero/${gameKey}-${expectedSlug}.webp`;

    if (!gameKey || !canonicalSlug || !canonicalReleaseKey) {
      fail(`${release.game}:${release.name} is missing canonical game/slug/release key identity.`);
    }

    if (canonicalSlug !== expectedSlug) {
      fail(`${release.game}:${release.name} canonical_slug=${canonicalSlug} does not match normalized release name ${expectedSlug}.`);
    }

    if (setCode && !canonicalReleaseKey.includes(setCode)) {
      fail(`${release.game}:${release.name} canonical_release_key=${canonicalReleaseKey} does not include set code ${setCode}.`);
    }

    if (setDetailHref !== `/set/${gameKey}/${canonicalSlug}`) {
      fail(`${release.game}:${release.name} Set Detail route ${setDetailHref || '(blank)'} does not match canonical identity /set/${gameKey}/${canonicalSlug}.`);
    }

    if (!APPROVED_MODES.has(mode)) {
      fail(`${release.game}:${release.name} has missing/invalid hero_visual_mode.`);
      continue;
    }

    if (REQUIRED_RELEASE_MODES[releaseKey] && mode !== REQUIRED_RELEASE_MODES[releaseKey]) {
      fail(`${release.game}:${release.name} must use ${REQUIRED_RELEASE_MODES[releaseKey]} but generated ${mode}.`);
    }

    if (mode === 'ineligible') {
      if (release.hero_eligible !== false) {
        fail(`${release.game}:${release.name} is ineligible but hero_eligible is not false.`);
      }
      continue;
    }

    if (!release.hero_image_url) {
      fail(`${release.game}:${release.name} is hero-eligible without hero_image_url.`);
    }

    if (release.hero_generated_path !== expectedHeroPath) {
      fail(`${release.game}:${release.name} generated path ${release.hero_generated_path || '(blank)'} does not match canonical release identity ${expectedHeroPath}.`);
    }

    const filePath = localPathForGeneratedAsset(release);
    if (!filePath || !fs.existsSync(filePath)) {
      fail(`${release.game}:${release.name} generated hero file is missing: ${release.hero_generated_path || '(blank)'}`);
      continue;
    }

    const metadata = await sharp(filePath).metadata();
    if (metadata.width !== EXPECTED_WIDTH || metadata.height !== EXPECTED_HEIGHT) {
      fail(`${release.game}:${release.name} generated hero has ${metadata.width}x${metadata.height}; expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`);
    }

    const minimumBytes = mode === 'title-graphic' ? 18000 : 30000;
    if (fs.statSync(filePath).size < minimumBytes) {
      fail(`${release.game}:${release.name} generated hero is suspiciously small.`);
    }

    const sourceAssets = Array.isArray(release.hero_source_assets) ? release.hero_source_assets : [];
    verifySourceAssets(release, mode, sourceAssets);

    if (!await rightSideHasMeaningfulPixels(filePath)) {
      fail(`${release.game}:${release.name} generated hero right-side art region is too blank/dark.`);
    }
  }

  if (process.exitCode) return;

  console.log(JSON.stringify({
    status: 'ok',
    generatedAt: payload.generatedAt,
    releaseCount: releases.length,
    heroEligibleCount: heroEligible.length,
    classifications: releases.map((release) => ({
      game: release.game,
      name: release.name,
      mode: release.hero_visual_mode,
      eligible: release.hero_eligible,
      generatedPath: release.hero_generated_path || null
    }))
  }, null, 2));
}

verify().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
});
