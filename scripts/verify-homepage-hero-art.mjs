import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = process.cwd();
const MANIFEST_PATH = path.join(ROOT, 'public', 'data', 'site', 'upcoming-releases.json');
const EXPECTED_WIDTH = 3840;
const EXPECTED_HEIGHT = 960;
const APPROVED_MODES = new Set([
  'wide-key-art',
  'three-card-composite',
  'three-product-composite',
  'product-card-composite',
  'ineligible'
]);

function fail(message) {
  console.error(`[homepage:hero-art:verify] ${message}`);
  process.exitCode = 1;
}

function localPathForGeneratedAsset(release) {
  const generatedPath = String(release.hero_generated_path || '').trim();
  if (!generatedPath) return null;
  return path.join(ROOT, 'public', generatedPath);
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
    if (!APPROVED_MODES.has(mode)) {
      fail(`${release.game}:${release.name} has missing/invalid hero_visual_mode.`);
      continue;
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

    const filePath = localPathForGeneratedAsset(release);
    if (!filePath || !fs.existsSync(filePath)) {
      fail(`${release.game}:${release.name} generated hero file is missing: ${release.hero_generated_path || '(blank)'}`);
      continue;
    }

    const metadata = await sharp(filePath).metadata();
    if (metadata.width !== EXPECTED_WIDTH || metadata.height !== EXPECTED_HEIGHT) {
      fail(`${release.game}:${release.name} generated hero has ${metadata.width}x${metadata.height}; expected ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`);
    }

    if (fs.statSync(filePath).size < 30000) {
      fail(`${release.game}:${release.name} generated hero is suspiciously small.`);
    }

    const sourceAssets = Array.isArray(release.hero_source_assets) ? release.hero_source_assets : [];
    if (sourceAssets.length === 0) {
      fail(`${release.game}:${release.name} composite has no recorded source assets.`);
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
