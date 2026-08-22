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
  'title-graphic',
  'three-card-composite',
  'ineligible'
]);

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
    if (mode !== 'title-graphic' && sourceAssets.length === 0) {
      fail(`${release.game}:${release.name} generated hero has no recorded source assets.`);
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
