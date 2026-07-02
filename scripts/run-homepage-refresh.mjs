import { spawnSync } from 'node:child_process';

const result = spawnSync('node', ['scripts/build-upcoming-releases-manifest.mjs'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
