import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getAutomationJobById, siteAutomationPipelines } from '../src/services/automation/siteAutomationRegistry.js';

const ROOT = process.cwd();
const SITE_DATA_ROOT = path.join(ROOT, 'public', 'data', 'site');
const RUN_HISTORY_PATH = path.join(SITE_DATA_ROOT, 'automation-runs.json');

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
  ensureDir(SITE_DATA_ROOT);
  payload.generatedAt = new Date().toISOString();
  fs.writeFileSync(RUN_HISTORY_PATH, JSON.stringify(payload, null, 2));
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

