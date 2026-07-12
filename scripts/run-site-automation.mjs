import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { getAutomationJobById, siteAutomationPipelines } from '../src/services/automation/siteAutomationRegistry.js';
import { publishAutomationPipeline } from './lib/site-automation-publish.mjs';
import { resolveRuntimeSiteDataRoot, getRuntimeAutomationRunsPath } from './lib/runtime-site-data-paths.mjs';

const ROOT = process.cwd();
const SITE_DATA_ROOT = resolveRuntimeSiteDataRoot(ROOT);
const RUN_HISTORY_PATH = getRuntimeAutomationRunsPath(ROOT);

const job = String(process.argv[2] || '').trim().toLowerCase();

const JOBS = Object.fromEntries(
  Object.entries(siteAutomationPipelines).map(([pipelineId, pipeline]) => [
    pipelineId,
    {
      ...pipeline,
      steps: pipeline.steps.map((jobId) => {
        const jobDefinition = getAutomationJobById(jobId);
        if (!jobDefinition) {
          throw new Error(`Automation pipeline "${pipelineId}" references unknown job "${jobId}".`);
        }

        return {
          jobId: jobDefinition.id,
          label: jobDefinition.label,
          commands: jobDefinition.commands
        };
      })
    }
  ])
);

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function escapePowerShellLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function writeJsonViaPowerShell(filePath, serialized) {
  const tempPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  fs.writeFileSync(tempPath, serialized);
  const scriptPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.ps1`);

  try {
    const script = [
      `$target = '${escapePowerShellLiteral(filePath)}'`,
      `$source = '${escapePowerShellLiteral(tempPath)}'`,
      `$content = [System.IO.File]::ReadAllText($source)`,
      `[System.IO.Directory]::CreateDirectory([System.IO.Path]::GetDirectoryName($target)) | Out-Null`,
      `[System.IO.File]::WriteAllText($target, $content, [System.Text.UTF8Encoding]::new($false))`
    ].join('\r\n');
    fs.writeFileSync(scriptPath, script);
    const result = spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], {
      stdio: 'pipe',
      windowsHide: true
    });

    if (result.status !== 0) {
      const stderr = result.stderr?.toString?.().trim();
      throw new Error(stderr || `PowerShell fallback write failed for ${filePath}`);
    }
    const persisted = fs.readFileSync(filePath, 'utf8');
    if (persisted !== serialized) {
      throw new Error(`PowerShell fallback wrote unexpected content for ${filePath}`);
    }
  } finally {
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      // Best-effort temp cleanup only.
    }
    try {
      fs.rmSync(scriptPath, { force: true });
    } catch {
      // Best-effort temp cleanup only.
    }
  }
}

function safeWriteJsonFile(filePath, payload, { retries = 4, delayMs = 75 } = {}) {
  ensureDir(path.dirname(filePath));
  const serialized = JSON.stringify(payload, null, 2);
  if (process.platform === 'win32') {
    writeJsonViaPowerShell(filePath, serialized);
    return;
  }
  const tempPath = path.join(os.tmpdir(), `mpm-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.tmp`);

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      fs.writeFileSync(tempPath, serialized);
      fs.renameSync(tempPath, filePath);
      return;
    } catch (error) {
      try {
        if (fs.existsSync(tempPath)) {
          fs.rmSync(tempPath, { force: true });
        }
      } catch {
        // Best-effort temp cleanup only.
      }

      const code = String(error?.code || '').toUpperCase();
      const retryable = ['EPERM', 'EBUSY', 'EACCES'].includes(code);
      if (process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES', 'EXDEV'].includes(code)) {
        writeJsonViaPowerShell(filePath, serialized);
        return;
      }
      if (!retryable || attempt === retries) {
        throw error;
      }
      sleep(delayMs * (attempt + 1));
    }
  }
}

function readRunHistory() {
  if (!fs.existsSync(RUN_HISTORY_PATH)) {
    return {
      generatedAt: null,
      jobs: {}
    };
  }

  try {
    const payload = JSON.parse(fs.readFileSync(RUN_HISTORY_PATH, 'utf8'));
    return {
      generatedAt: payload?.generatedAt || null,
      jobs: payload?.jobs && typeof payload.jobs === 'object' ? payload.jobs : {}
    };
  } catch {
    return {
      generatedAt: null,
      jobs: {}
    };
  }
}

function writeRunHistory(payload) {
  payload.generatedAt = new Date().toISOString();
  safeWriteJsonFile(RUN_HISTORY_PATH, payload);
}

function commandToString([command, ...args]) {
  return [command, ...args].join(' ');
}

function updateJobRun(jobId, label, patch, recentRun = null) {
  const history = readRunHistory();
  const current = history.jobs[jobId] || {
    jobId,
    label,
    lastStatus: 'missing',
    lastStartedAt: null,
    lastFinishedAt: null,
    lastSucceededAt: null,
    lastFailedAt: null,
    lastDurationMs: null,
    lastExitCode: null,
    lastError: null,
    recentRuns: []
  };

  const next = {
    ...current,
    label,
    ...patch
  };

  if (recentRun) {
    next.recentRuns = [recentRun, ...(Array.isArray(current.recentRuns) ? current.recentRuns : [])].slice(0, 10);
  }

  history.jobs[jobId] = next;
  writeRunHistory(history);
}

function executeCommand(commandSpec) {
  const commandStartedAt = Date.now();
  const result = spawnSync(commandSpec[0], commandSpec.slice(1), {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  return {
    command: commandToString(commandSpec),
    exitCode: result.status ?? 1,
    durationMs: Date.now() - commandStartedAt,
    error: result.error?.message || null
  };
}

if (!JOBS[job]) {
  console.error(`Unknown automation job "${job}". Expected one of: ${Object.keys(JOBS).join(', ')}`);
  process.exit(1);
}

for (const step of JOBS[job].steps) {
  const startedAt = new Date().toISOString();

  updateJobRun(step.jobId, step.label, {
    lastStatus: 'running',
    lastStartedAt: startedAt,
    lastError: null
  });

  const stepStartedAt = Date.now();
  const commandResults = [];
  let stepExitCode = 0;
  let stepError = null;

  for (const commandSpec of step.commands) {
    const commandResult = executeCommand(commandSpec);
    commandResults.push(commandResult);

    if (commandResult.exitCode !== 0 || commandResult.error) {
      stepExitCode = commandResult.exitCode || 1;
      stepError = commandResult.error || `Command failed: ${commandResult.command}`;
      break;
    }
  }

  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - stepStartedAt;
  const succeeded = stepExitCode === 0 && !stepError;

  updateJobRun(
    step.jobId,
    step.label,
    {
      lastStatus: succeeded ? 'ok' : 'failed',
      lastFinishedAt: finishedAt,
      lastSucceededAt: succeeded ? finishedAt : (readRunHistory().jobs?.[step.jobId]?.lastSucceededAt || null),
      lastFailedAt: succeeded ? (readRunHistory().jobs?.[step.jobId]?.lastFailedAt || null) : finishedAt,
      lastDurationMs: durationMs,
      lastExitCode: stepExitCode,
      lastError: succeeded ? null : stepError
    },
    {
      pipeline: job,
      status: succeeded ? 'ok' : 'failed',
      startedAt,
      finishedAt,
      durationMs,
      exitCode: stepExitCode,
      error: succeeded ? null : stepError,
      commands: commandResults
    }
  );

  if (!succeeded) {
    process.exit(stepExitCode || 1);
  }
}

if (JOBS[job].steps.some((step) => step.jobId === 'system-health-report')) {
  const finalHealthBuild = executeCommand(['node', 'scripts/build-site-health-report.mjs']);
  if (finalHealthBuild.exitCode !== 0 || finalHealthBuild.error) {
    process.exit(finalHealthBuild.exitCode || 1);
  }
}

const publishPipelineIds = [
  job,
  ...(JOBS[job].steps.some((step) => step.jobId === 'system-health-report') && job !== 'health' ? ['health'] : [])
];

const publishResults = [];
for (const pipelineId of publishPipelineIds) {
  publishResults.push(await publishAutomationPipeline(pipelineId, {
    projectRoot: ROOT,
    quietProgress: true
  }));
}

const publishStatus = publishResults.some((result) => result.status === 'ok')
  ? 'ok'
  : publishResults.some((result) => result.status === 'failed')
    ? 'failed'
    : 'skipped';
const publishReason = publishResults.find((result) => result.reason)?.reason || null;
const publishedCount = publishResults.reduce((sum, result) => sum + Number(result.uploadedCount || 0), 0);

for (const step of JOBS[job].steps) {
  updateJobRun(step.jobId, step.label, {
    lastPublishAt: new Date().toISOString(),
    lastPublishStatus: publishStatus,
    lastPublishReason: publishReason,
    lastPublishedCount: publishedCount
  });
}

