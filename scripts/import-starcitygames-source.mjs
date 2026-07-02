import { importPricingSourceSnapshot } from './lib/pricing-source-pipeline.mjs';

const [, , inputPathArg] = process.argv;

function usage() {
  console.error('Usage: node scripts/import-starcitygames-source.mjs <inputPath>');
  process.exit(1);
}

function main() {
  if (!inputPathArg) usage();
  console.log(JSON.stringify(importPricingSourceSnapshot('starcitygames', inputPathArg), null, 2));
}

main();
