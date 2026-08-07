import fs from 'node:fs';
import path from 'node:path';

export function writeAutomationResultIfRequested(payload) {
  const outputPath = process.env.MPM_AUTOMATION_RESULT_PATH;
  if (!outputPath) return;

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2));
}
