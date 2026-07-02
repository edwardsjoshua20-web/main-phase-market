import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_DATA_ROOT = path.join(ROOT, 'public', 'data', 'site');
const OUTPUT_PATH = path.join(ROOT, 'src', 'services', 'siteStaticSnapshots.generated.js');

function readJson(fileName, fallback) {
  const filePath = path.join(SITE_DATA_ROOT, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function toModuleExport(name, value) {
  return `export const ${name} = ${JSON.stringify(value)};`;
}

function main() {
  const systemHealth = readJson('system-health.json', {
    generatedAt: null,
    overallStatus: 'missing',
    sections: {}
  });

  const upcomingReleases = readJson('upcoming-releases.json', {
    generatedAt: null,
    releases: []
  });

  const pricingSnapshot = readJson('pricing-snapshot.json', {
    generatedAt: null,
    status: 'missing',
    games: [],
    sourceSnapshots: {},
    mergedPricingPreview: []
  });

  const output = [
    toModuleExport('embeddedSystemHealth', systemHealth),
    toModuleExport('embeddedUpcomingReleases', upcomingReleases),
    toModuleExport('embeddedPricingSnapshot', pricingSnapshot),
    ''
  ].join('\n');

  fs.writeFileSync(OUTPUT_PATH, output, 'utf8');
  console.log(`Embedded site snapshots written to ${OUTPUT_PATH}`);
}

main();
