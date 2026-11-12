import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.resolve(process.argv[2] || 'D:\\main-phase-market-kazakari-deploy\\server\\data\\kazakari-preview.json');
const phase11Path = path.resolve(process.argv[3] || 'D:\\Projects\\Penny-Hunter\\data\\phase11-export.json');
if (!/^D:\\/i.test(snapshotPath) || !/^D:\\/i.test(phase11Path)) throw new Error('Kazakari Phase 11 files must remain on D:.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const phase11 = JSON.parse(fs.readFileSync(phase11Path, 'utf8'));
const generatedAt = Date.parse(phase11.generatedAt);
const freshness = (value) => { const days = Math.max(0, Math.floor((generatedAt - Date.parse(value)) / 86_400_000)); return days <= 14 ? 'recently-reported' : days <= 60 ? 'older-report' : 'historical-report'; };
const reported = phase11.advancePennyItems.filter((item) => item.status === 'reported-penny-list').map((item) => ({
  reportId: `phase11-${item.id}`, retailer: item.retailer, productId: null, matchedProductId: null, sku: null,
  upc: item.productIdentifier, modelNumber: null, productName: item.productName, relevantStore: null,
  reportedPrice: item.reportedPrice, referencePrice: null, imageUrl: null,
  lastObservedAt: item.expectedTransitionDate, evidenceCategory: 'community-reported-penny', evidenceStrength: 'worth-monitoring',
  reasons: ['Exact product appeared on a dated public penny list.', 'No store-level price or availability was supplied.'],
  estimatedTransitionWindow: null, sourceUrl: item.sourceUrl, reportCount: 1, sourceCount: 1,
  firstReportedAt: item.publicationDate, states: {}, matchMethod: null, category: item.category,
  verification: {
    evidenceLabel: 'single-community-report', freshness: freshness(item.expectedTransitionDate),
    ageDays: Math.max(0, Math.floor((generatedAt - Date.parse(item.expectedTransitionDate)) / 86_400_000)),
    identityVerification: 'identifiers-present', exactIdentifiers: [`UPC/SKU ${item.productIdentifier}`],
    productNameConsistent: null, imageVerification: 'unverified', referencePriceProvenance: 'not-supplied',
    independentlyVerifiedReferencePrice: null,
    questionableReasons: ['National list evidence does not establish a store-specific price or local availability.'],
  },
}));
const upcoming = phase11.advancePennyItems.filter((item) => item.status === 'upcoming-penny-list').map((item) => ({
  candidateKey: `${item.retailer}:${item.productIdentifier}:advance-list`, retailer: item.retailer,
  productId: item.productIdentifier, storeId: null, states: [], productName: item.productName, imageUrl: null,
  currentPrice: null, regularPrice: null, lastObservedAt: item.publicationDate || item.sourcePageUpdatedAt,
  mostRecentPriceChange: null, strength: 'scheduled-transition',
  reasons: [`Public advance list names exact identifier ${item.productIdentifier}.`, 'No store-level price or availability has been observed.'],
  estimatedTransitionWindow: item.expectedTransitionDate, source: item.source, category: item.category,
}));
const existingCurrent = (snapshot.phase9?.currentPennies || []).filter((item) => !String(item.reportId || '').startsWith('phase11-'));
const keys = new Set(existingCurrent.map((item) => `${item.retailer || 'home-depot'}:${item.upc || item.sku || item.productId}:${item.lastObservedAt}`));
snapshot.phase9.currentPennies = [...existingCurrent, ...reported.filter((item) => !keys.has(`${item.retailer}:${item.upc}:${item.lastObservedAt}`))];
snapshot.phase9.pennyPredictions = [...(snapshot.phase9?.pennyPredictions || []).filter((item) => !String(item.candidateKey || '').includes(':advance-list')), ...upcoming];
snapshot.phase11 = phase11;
if (Date.parse(phase11.generatedAt) > Date.parse(snapshot.generatedAt || 0)) snapshot.generatedAt = phase11.generatedAt;
snapshot.summary.dollarGeneralExactProducts = Number(phase11.summary?.uniqueExactProducts || 0);
snapshot.summary.upcomingPennyLists = Number(phase11.summary?.upcomingPennyLists || 0);
snapshot.summary.historicalPennyListRecords = Number(phase11.summary?.reportedPennyLists || 0);
const temp = `${snapshotPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
fs.renameSync(temp, snapshotPath);
console.log(JSON.stringify({ snapshotPath, dollarGeneral: phase11.summary, currentPennies: snapshot.phase9.currentPennies.length, pennyPredictions: snapshot.phase9.pennyPredictions.length }, null, 2));
