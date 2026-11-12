import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.resolve(process.argv[2] || 'D:\\main-phase-market-kazakari-deploy\\server\\data\\kazakari-preview.json');
const phase8Path = path.resolve(process.argv[3] || 'D:\\Projects\\Penny-Hunter\\data\\phase8-export.json');
if (!/^D:\\/i.test(snapshotPath) || !/^D:\\/i.test(phase8Path)) throw new Error('Kazakari Phase 8 files must remain on D:.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const phase8 = JSON.parse(fs.readFileSync(phase8Path, 'utf8'));
const productsById = new Map(snapshot.products.map((product) => [String(product.productId), product]));
const safePhase8 = {
  generatedAt: phase8.generatedAt,
  summary: phase8.summary,
  priceIntelligence: phase8.priceIntelligence,
  pennyReports: phase8.pennyReports,
  pennyCandidates: phase8.pennyCandidates,
};
const safePhase9 = {
  generatedAt: phase8.generatedAt,
  currentPennies: phase8.phase9?.currentPennies || phase8.pennyReports || [],
  pennyPredictions: (phase8.phase9?.pennyPredictions || []).map((prediction) => {
    const product = productsById.get(String(prediction.productId));
    return { ...prediction, productName: prediction.productName || product?.productName || null, imageUrl: prediction.imageUrl || product?.imageUrl || null, category: product?.category || null, regularPrice: prediction.regularPrice ?? product?.regularPrice ?? null };
  }),
  verificationDiagnostics: phase8.phase9?.verificationDiagnostics || {},
  collectorStatus: phase8.phase9?.collectorStatus || [],
  predictionOutcomes: phase8.phase9?.predictionOutcomes || {},
  predictionLastCalculatedAt: phase8.phase9?.predictionLastCalculatedAt || null,
};
snapshot.schemaVersion = 3;
snapshot.phase8 = safePhase8;
snapshot.phase9 = safePhase9;
snapshot.summary.communityPennyReports = Number(phase8.summary?.pennyReports || 0);
snapshot.summary.exactPennyMatches = Number(phase8.summary?.exactMatches || 0);
snapshot.summary.independentlyVerifiedPrices = Number(phase8.summary?.independentlyVerifiedPrices || 0);
snapshot.summary.pennyPredictionCandidates = safePhase9.pennyPredictions.length;
snapshot.summary.questionablePennyReports = Number(safePhase9.verificationDiagnostics?.questionableReports || 0);
const temp = `${snapshotPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
fs.renameSync(temp, snapshotPath);
console.log(JSON.stringify({ snapshotPath, schemaVersion: snapshot.schemaVersion, products: snapshot.products.length, phase8: snapshot.summary }, null, 2));
