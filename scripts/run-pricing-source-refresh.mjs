import fs from 'node:fs';
import path from 'node:path';
import { importPricingSourceSnapshot, VALID_PRICING_SOURCES } from './lib/pricing-source-pipeline.mjs';

const manifestPathArg = process.argv[2] || 'config/pricing-source-refresh.json';
const manifestPath = path.resolve(process.cwd(), manifestPathArg);

function readManifest(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function main() {
  const manifest = readManifest(manifestPath);

  if (!manifest) {
    console.log(JSON.stringify({
      status: 'skipped',
      reason: 'manifest-not-found',
      manifest: manifestPath,
      nextStep: 'Create config/pricing-source-refresh.json to wire source acquisition inputs into the pricing pipeline.'
    }, null, 2));
    return;
  }

  const jobs = Array.isArray(manifest?.jobs) ? manifest.jobs : [];
  const results = [];

  for (const job of jobs) {
    if (job?.enabled === false) continue;
    const source = String(job?.source || '').trim().toLowerCase();
    const input = String(job?.input || '').trim();

    if (!VALID_PRICING_SOURCES.has(source) || !input) {
      results.push({
        source,
        status: 'skipped',
        reason: 'invalid-job'
      });
      continue;
    }

    results.push({
      ...importPricingSourceSnapshot(source, input),
      status: 'imported'
    });
  }

  console.log(JSON.stringify({
    status: 'completed',
    manifest: manifestPath,
    processed: results.length,
    results
  }, null, 2));
}

main();
