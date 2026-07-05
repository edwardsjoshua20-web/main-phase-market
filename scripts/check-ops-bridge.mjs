import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ORIGIN = 'http://127.0.0.1:8787';

function parseArgs(argv = []) {
  const args = {};

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = value.slice(2).split('=');
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }

  return args;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return Object.fromEntries(
    fs.readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const delimiterIndex = line.indexOf('=');
        const key = line.slice(0, delimiterIndex).trim();
        const value = line.slice(delimiterIndex + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

function loadEnv() {
  return {
    ...parseEnvFile(path.join(process.cwd(), '.env.local')),
    ...parseEnvFile(path.join(process.cwd(), '.env')),
    ...process.env
  };
}

function normalizeOrigin(value) {
  const candidate = String(value || '').trim() || DEFAULT_ORIGIN;

  try {
    const parsed = new URL(candidate);
    parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    throw new Error(`Invalid ops bridge origin: ${candidate}`);
  }
}

function readJsonSafely(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function requestJson(url, token = '') {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    payload: readJsonSafely(text),
    text
  };
}

function summarizeJob(job) {
  const lock = job?.lock;
  if (!lock) {
    return `${job.jobId}: idle`;
  }

  return `${job.jobId}: running since ${lock.startedAt || 'unknown'} (${lock.runnerJob || job.runnerJob})`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const origin = normalizeOrigin(args.origin || env.OPS_API_ORIGIN || env.VITE_API_ORIGIN || env.VITE_LOCAL_API_URL);
  const token = String(args.token || env.MPM_ADMIN_BEARER_TOKEN || env.SUPABASE_ACCESS_TOKEN || '').trim();

  console.log(`Main Phase Market ops bridge check`);
  console.log(`Origin: ${origin}`);
  console.log('');

  const health = await requestJson(`${origin}/api/local/health`);
  if (!health.ok) {
    console.error(`Health check failed: HTTP ${health.status} ${health.statusText}`);
    if (health.payload?.error) {
      console.error(`Reason: ${health.payload.error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Health: ok`);
  if (health.payload?.systemHealth?.generatedAt) {
    console.log(`System health report: ${health.payload.systemHealth.generatedAt}`);
  }

  const controlStatus = await requestJson(`${origin}/api/local/admin/automation/control-status`, token);
  if (!controlStatus.ok) {
    console.error(`Automation controls: unavailable (HTTP ${controlStatus.status} ${controlStatus.statusText})`);
    if (controlStatus.status === 401 || controlStatus.status === 403) {
      console.error('Remote automation controls require an admin Supabase bearer token.');
      console.error('Set MPM_ADMIN_BEARER_TOKEN or SUPABASE_ACCESS_TOKEN, or pass --token <token>.');
    }
    if (controlStatus.payload?.error) {
      console.error(`Reason: ${controlStatus.payload.error}`);
    }
    process.exitCode = 1;
    return;
  }

  const jobs = Array.isArray(controlStatus.payload?.allowedJobs) ? controlStatus.payload.allowedJobs : [];
  const runningJobs = jobs.filter((job) => job?.lock);
  console.log(`Automation controls: ${controlStatus.payload?.available ? 'available' : 'unavailable'}`);
  console.log(`Runner mode: ${controlStatus.payload?.mode || 'unknown'}`);
  console.log(`Allowed jobs: ${jobs.length}`);
  console.log(`Running jobs: ${runningJobs.length}`);

  for (const job of jobs) {
    console.log(`- ${summarizeJob(job)}`);
  }
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exitCode = 1;
});
