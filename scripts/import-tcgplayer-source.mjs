import { importPricingSourceSnapshot } from './lib/pricing-source-pipeline.mjs';

const [, , inputPathArg] = process.argv;

function usage() {
  console.error('Usage: node scripts/import-tcgplayer-source.mjs <inputPath>');
  process.exit(1);
}

function main() {
  if (!inputPathArg) usage();
  console.log(JSON.stringify(importPricingSourceSnapshot('tcgplayer', inputPathArg), null, 2));
}

main();
