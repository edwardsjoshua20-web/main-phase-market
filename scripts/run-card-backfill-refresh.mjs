import { readAutomationManifest, runAutomationJobs } from './lib/automation-job-runner.mjs';
import { writeAutomationResultIfRequested } from './lib/automation-result-output.mjs';

const DEFAULT_MANIFEST = 'config/card-backfill-refresh.json';
const manifest = readAutomationManifest(DEFAULT_MANIFEST, process.argv[2]);

if (!manifest.found) {
  console.log(JSON.stringify({
    status: 'skipped',
    reason: 'manifest-not-found',
    manifest: manifest.manifestPath,
    nextStep: 'Create config/card-backfill-refresh.json to declare card backfill jobs.'
  }, null, 2));
  process.exit(0);
}

const jobs = Array.isArray(manifest.payload?.jobs)
  ? manifest.payload.jobs.filter((job) => job?.enabled !== false)
  : [];

const outcome = runAutomationJobs(jobs, {
  failFast: manifest.payload?.failFast !== false
});
const payload = {
  manifest: manifest.manifestPath,
  results: outcome.results
};
writeAutomationResultIfRequested(payload);
console.log(JSON.stringify(payload, null, 2));
if (!outcome.ok) process.exit(1);
