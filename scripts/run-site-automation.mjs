import { spawnSync } from 'node:child_process';

const job = String(process.argv[2] || '').trim().toLowerCase();

const JOBS = {
  homepage: [
    ['node', 'scripts/run-homepage-refresh.mjs'],
    ['node', 'scripts/build-site-health-report.mjs']
  ],
  cards: [
    ['node', 'scripts/run-card-backfill-refresh.mjs'],
    ['node', 'scripts/build-site-health-report.mjs']
  ],
  catalog: [
    ['node', 'scripts/run-catalog-refresh.mjs'],
    ['node', 'scripts/build-site-health-report.mjs']
  ],
  images: [
    ['node', 'scripts/run-image-refresh.mjs'],
    ['node', 'scripts/build-site-health-report.mjs']
  ],
  pricing: [
    ['node', 'scripts/run-pricing-source-refresh.mjs'],
    ['node', 'scripts/build-pricing-snapshot.mjs'],
    ['node', 'scripts/build-site-health-report.mjs']
  ],
  health: [
    ['node', 'scripts/build-site-health-report.mjs']
  ]
};

if (!JOBS[job]) {
  console.error(`Unknown automation job "${job}". Expected one of: ${Object.keys(JOBS).join(', ')}`);
  process.exit(1);
}

for (const [command, ...args] of JOBS[job]) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
