import fs from 'node:fs';
import path from 'node:path';
import { getRuntimeAutomationRunsPath, getRuntimeSystemHealthPath } from './runtime-site-data-paths.mjs';
import { hasSupabaseUploadConfig, uploadPublicDataSelection } from './supabase-public-data-upload.mjs';

const GAMES = ['magic', 'pokemon', 'yugioh', 'onepiece', 'lorcana', 'fab', 'starwars'];

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) {
    return null;
  }

  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function buildPublishSelection(pipelineId) {
  switch (pipelineId) {
    case 'homepage':
      return {
        relativePaths: ['data/site/upcoming-releases.json']
      };
    case 'cards':
      return {
        relativePaths: GAMES.flatMap((game) => [
          `data/${game}/cards.json`,
          `data/${game}/cards-manifest.json`,
          `data/${game}/manifest.json`
        ])
      };
    case 'catalog':
      return {
        relativePaths: GAMES.flatMap((game) => [
          `data/${game}/cards.json`,
          `data/${game}/cards-manifest.json`,
          `data/${game}/manifest.json`,
          `data/${game}/sets.json`
        ])
      };
    case 'images':
      return {
        relativePaths: GAMES.flatMap((game) => [
          `data/${game}/images`
        ]),
        includeImages: true
      };
    case 'pricing':
      return {
        relativePaths: [
          'data/site/pricing-sources',
          'data/site/pricing-snapshot.json'
        ]
      };
    case 'health':
      return {
        relativePaths: [
          'data/site/system-health.json',
          'data/site/automation-runs.json'
        ]
      };
    default:
      return {
        relativePaths: []
      };
  }
}

function mirrorRuntimeArtifacts(projectRoot = process.cwd()) {
  const publicSiteRoot = path.join(projectRoot, 'public', 'data', 'site');
  const mirrored = [];

  const runtimeSystemHealthPath = getRuntimeSystemHealthPath(projectRoot);
  const publicSystemHealthPath = path.join(publicSiteRoot, 'system-health.json');
  if (copyIfExists(runtimeSystemHealthPath, publicSystemHealthPath)) {
    mirrored.push('data/site/system-health.json');
  }

  const runtimeAutomationRunsPath = getRuntimeAutomationRunsPath(projectRoot);
  const publicAutomationRunsPath = path.join(publicSiteRoot, 'automation-runs.json');
  if (copyIfExists(runtimeAutomationRunsPath, publicAutomationRunsPath)) {
    mirrored.push('data/site/automation-runs.json');
  }

  return mirrored;
}

export async function publishAutomationPipeline(pipelineId, options = {}) {
  const projectRoot = options.projectRoot || process.cwd();
  const quietProgress = Boolean(options.quietProgress);
  const selection = buildPublishSelection(pipelineId);
  const modifiedSinceMs = pipelineId === 'images'
    ? Number(options.modifiedSinceMs || 0)
    : 0;
  const mirroredArtifacts = pipelineId === 'health' ? mirrorRuntimeArtifacts(projectRoot) : [];
  const effectiveSelection = {
    ...selection,
    relativePaths: [...new Set([...(selection.relativePaths || []), ...mirroredArtifacts])]
  };

  if (!effectiveSelection.relativePaths?.length) {
    return {
      status: 'skipped',
      reason: 'no-publish-targets',
      pipelineId,
      mirroredArtifacts
    };
  }

  if (!hasSupabaseUploadConfig(projectRoot)) {
    return {
      status: 'skipped',
      reason: 'supabase-upload-not-configured',
      pipelineId,
      mirroredArtifacts,
      relativePaths: effectiveSelection.relativePaths
    };
  }

  const uploadResult = await uploadPublicDataSelection(effectiveSelection, {
    projectRoot,
    includeImages: Boolean(effectiveSelection.includeImages),
    modifiedSinceMs,
    quietProgress
  });

  return {
    status: 'ok',
    pipelineId,
    mirroredArtifacts,
    relativePaths: effectiveSelection.relativePaths,
    includeImages: Boolean(effectiveSelection.includeImages),
    modifiedSinceMs: modifiedSinceMs || null,
    ...uploadResult
  };
}
