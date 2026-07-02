import { importPricingSourceSnapshot, VALID_PRICING_SOURCES } from './lib/pricing-source-pipeline.mjs';

const [, , sourceArg, inputPathArg] = process.argv;

function usage() {
  console.error('Usage: node scripts/import-pricing-source-snapshot.mjs <cardkingdom|tcgplayer|starcitygames> <inputPath>');
  process.exit(1);
}

function main() {
  if (!sourceArg || !inputPathArg) usage();
  if (![...VALID_PRICING_SOURCES].includes(String(sourceArg || '').trim().toLowerCase().replace(/[^a-z]/g, ''))) {
    throw new Error(`Invalid pricing source "${sourceArg}". Expected one of: ${[...VALID_PRICING_SOURCES].join(', ')}`);
  }
  console.log(JSON.stringify(importPricingSourceSnapshot(sourceArg, inputPathArg), null, 2));
}

main();
