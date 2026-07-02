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

export function runAutomationJobs(jobList = []) {
  const results = [];

  for (const job of jobList) {
    const requirements = Array.isArray(job?.requires) ? job.requires.map(requirementSatisfied) : [];
    const missingRequirements = requirements.filter((entry) => !entry.ok);

    if (missingRequirements.length > 0) {
      results.push({
        id: job.id,
        label: job.label,
        status: 'skipped',
        reason: 'missing-requirements',
        missingRequirements
      });
      continue;
    }

    const result = spawnSync(job.command, job.args || [], {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    if (result.status !== 0) {
      results.push({
        id: job.id,
        label: job.label,
        status: 'failed',
        exitCode: result.status ?? 1
      });
      return {
        ok: false,
        results
      };
    }

    results.push({
      id: job.id,
      label: job.label,
      status: 'completed'
    });
  }

  return {
    ok: true,
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
