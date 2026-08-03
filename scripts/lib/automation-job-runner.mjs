import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceRequirementStatus } from './source-registry.mjs';

function resolvePathMaybe(value) {
  if (!value) return null;
  return path.resolve(process.cwd(), value);
}

function fileExists(filePath) {
  return Boolean(filePath && fs.existsSync(filePath));
}

function requirementSatisfied(requirement = {}) {
  if (requirement.type === 'file-exists') {
    const resolved = resolvePathMaybe(requirement.path);
    return {
      ok: fileExists(resolved),
      type: requirement.type,
      label: requirement.label || requirement.path,
      path: resolved
    };
  }

  if (requirement.type === 'source-exists') {
    const status = sourceRequirementStatus(requirement.game, requirement.key || 'catalogSource');
    return {
      ok: status.type === 'remote' ? true : Boolean(status.exists),
      type: requirement.type,
      label: requirement.label || `${requirement.game}:${requirement.key || 'catalogSource'}`,
      source: status
    };
  }

  return {
    ok: true,
    type: requirement.type || 'unknown',
    label: requirement.label || 'unknown'
  };
}

function nowIso() {
  return new Date().toISOString();
}

function elapsedMs(startedAt) {
  return Date.now() - startedAt;
}

function logJob(event, job, extra = {}) {
  const details = Object.entries(extra)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(' ');
  console.log(`[automation:${event}] ${job?.id || 'unknown'} ${job?.label || ''}${details ? ` ${details}` : ''}`.trim());
}

function commandForPlatform(command) {
  if (process.platform !== 'win32') return command;
  if (command === 'npm') return 'npm.cmd';
  if (command === 'npx') return 'npx.cmd';
  return command;
}

export function runAutomationJobs(jobList = [], options = {}) {
  const failFast = options.failFast !== false;
  const results = [];
  let hasFailure = false;

  for (const job of jobList) {
    const startedAtMs = Date.now();
    const startedAt = nowIso();
    const requirements = Array.isArray(job?.requires) ? job.requires.map(requirementSatisfied) : [];
    const missingRequirements = requirements.filter((entry) => !entry.ok);

    if (missingRequirements.length > 0) {
      const finishedAt = nowIso();
      logJob('skipped', job, { reason: 'missing-requirements', missing: missingRequirements.length });
      results.push({
        id: job.id,
        label: job.label,
        status: 'skipped',
        reason: 'missing-requirements',
        startedAt,
        finishedAt,
        durationMs: elapsedMs(startedAtMs),
        missingRequirements
      });
      continue;
    }

    logJob('started', job, { command: job.command });
    const command = commandForPlatform(job.command);
    const result = spawnSync(command, job.args || [], {
      stdio: 'inherit',
      shell: false
    });

    if (result.status !== 0) {
      hasFailure = true;
      const finishedAt = nowIso();
      logJob('failed', job, { exitCode: result.status ?? 1, durationMs: elapsedMs(startedAtMs) });
      results.push({
        id: job.id,
        label: job.label,
        status: 'failed',
        exitCode: result.status ?? 1,
        startedAt,
        finishedAt,
        durationMs: elapsedMs(startedAtMs)
      });
      if (failFast) {
        return {
          ok: false,
          results
        };
      }
      continue;
    }

    const finishedAt = nowIso();
    logJob('completed', job, { durationMs: elapsedMs(startedAtMs) });
    results.push({
      id: job.id,
      label: job.label,
      status: 'completed',
      startedAt,
      finishedAt,
      durationMs: elapsedMs(startedAtMs)
    });
  }

  return {
    ok: !hasFailure,
    results
  };
}

export function readAutomationManifest(defaultPath, explicitArg) {
  const manifestPath = path.resolve(process.cwd(), explicitArg || defaultPath);
  if (!fs.existsSync(manifestPath)) {
    return {
      found: false,
      manifestPath,
      payload: null
    };
  }

  return {
    found: true,
    manifestPath,
    payload: JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  };
}
