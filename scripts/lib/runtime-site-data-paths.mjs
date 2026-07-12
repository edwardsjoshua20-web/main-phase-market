import os from 'node:os';
import path from 'node:path';

export function getDefaultRuntimeSiteDataRoot(projectRoot = process.cwd()) {
  if (process.platform === 'win32') {
    return path.join(projectRoot, '.runtime', 'site-data');
  }

  return path.join(os.tmpdir(), 'main-phase-market', 'site-data');
}

export function resolveRuntimeSiteDataRoot(projectRoot = process.cwd()) {
  return process.env.MPM_RUNTIME_SITE_DATA_ROOT || getDefaultRuntimeSiteDataRoot(projectRoot);
}

export function getRuntimeSystemHealthPath(projectRoot = process.cwd()) {
  return path.join(resolveRuntimeSiteDataRoot(projectRoot), 'system-health.json');
}

export function getRuntimeAutomationRunsPath(projectRoot = process.cwd()) {
  return path.join(resolveRuntimeSiteDataRoot(projectRoot), 'automation-runs.json');
}
