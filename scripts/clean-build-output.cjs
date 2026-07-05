const fs = require('node:fs');
const path = require('node:path');
const rootDir = 'D:/main-phase-market';
const targets = ['dist', 'cf-dist'];
for (const target of targets) {
  const fullPath = path.join(rootDir, target);
  try {
    fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch (error) {
    console.warn(`Failed to remove ${fullPath} on first pass: ${error.message}`);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } catch (finalError) {
      console.error(`Unable to remove ${fullPath}: ${finalError.message}`);
      process.exitCode = 1;
    }
  }
}
