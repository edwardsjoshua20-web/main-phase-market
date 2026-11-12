import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.resolve(process.argv[2] || 'D:\\main-phase-market-kazakari-deploy\\server\\data\\kazakari-preview.json');
const evidencePath = path.resolve(process.argv[3] || 'D:\\Projects\\Penny-Hunter\\data\\phase13-controlled-observations.json');
if (!/^D:\\/i.test(snapshotPath) || !/^D:\\/i.test(evidencePath)) throw new Error('Kazakari Phase 13 files must remain on D:.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
let enrichedReferencePrices = 0;

for (const observation of evidence.observations || []) {
  const product = (snapshot.products || []).find((item) => item.retailer === observation.retailer && String(item.productId) === String(observation.internetItemNumber));
  if (!product) continue;
  if (Number.isFinite(observation.referencePrice) && observation.referencePrice >= observation.observedPrice) {
    product.regularPrice = observation.referencePrice;
    product.discountPercent = Math.round(((observation.referencePrice - observation.observedPrice) / observation.referencePrice) * 10000) / 100;
    product.discountBasis = 'exact-reference-price';
    product.referencePriceSource = observation.sourceUrl;
    product.referencePriceVerifiedAt = observation.observedAt;
    enrichedReferencePrices += 1;
  }
}

snapshot.phase13 = evidence;
snapshot.summary.phase13SelectedStoreObservations = (evidence.observations || []).length;
snapshot.summary.phase13KentuckyObservations = (evidence.observations || []).filter((item) => item.storeZip?.startsWith('40')).length;
snapshot.summary.phase13ReferencePricesEnriched = enrichedReferencePrices;
if (Date.parse(evidence.generatedAt) > Date.parse(snapshot.generatedAt || 0)) snapshot.generatedAt = evidence.generatedAt;
const temp = `${snapshotPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
fs.renameSync(temp, snapshotPath);
console.log(JSON.stringify({ snapshotPath, observations: evidence.observations?.length || 0, enrichedReferencePrices }, null, 2));
