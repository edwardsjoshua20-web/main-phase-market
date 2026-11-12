import fs from 'node:fs';
import path from 'node:path';

const snapshotPath = path.resolve(process.argv[2] || 'D:\\main-phase-market-kazakari-deploy\\server\\data\\kazakari-preview.json');
const phase8Path = path.resolve(process.argv[3] || 'D:\\Projects\\Penny-Hunter\\data\\phase8-export.json');
if (!/^D:\\/i.test(snapshotPath) || !/^D:\\/i.test(phase8Path)) throw new Error('Kazakari Phase 8 files must remain on D:.');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const phase8 = JSON.parse(fs.readFileSync(phase8Path, 'utf8'));
const safePhase8 = {
  generatedAt: phase8.generatedAt,
  summary: phase8.summary,
  priceIntelligence: phase8.priceIntelligence,
  pennyReports: phase8.pennyReports,
  pennyCandidates: phase8.pennyCandidates,
};
snapshot.schemaVersion = 2;
snapshot.phase8 = safePhase8;
snapshot.summary.communityPennyReports = Number(phase8.summary?.pennyReports || 0);
snapshot.summary.exactPennyMatches = Number(phase8.summary?.exactMatches || 0);
snapshot.summary.independentlyVerifiedPrices = Number(phase8.summary?.independentlyVerifiedPrices || 0);
const temp = `${snapshotPath}.${process.pid}.tmp`;
fs.writeFileSync(temp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
fs.renameSync(temp, snapshotPath);
console.log(JSON.stringify({ snapshotPath, schemaVersion: snapshot.schemaVersion, products: snapshot.products.length, phase8: snapshot.summary }, null, 2));
