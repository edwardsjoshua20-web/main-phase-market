import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, 'tmp', 'imagegen', 'onepiece-cleanup', 'jobs.json');
const reviewRoot = path.join(projectRoot, 'output', 'imagegen', 'onepiece-cleaned-review');
const outputPath = path.join(reviewRoot, 'index.html');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function toFileHref(filePath) {
  return filePath.replaceAll('\\', '/');
}

function renderCard(job) {
  const cleanedExists = fileExists(job.outputPath);
  return `
    <article class="card">
      <h2>${job.id}</h2>
      <p class="meta">${job.relative}</p>
      <div class="images">
        <figure>
          <figcaption>Original</figcaption>
          <img src="${toFileHref(job.inputPath)}" alt="Original ${job.id}">
        </figure>
        <figure>
          <figcaption>${cleanedExists ? 'Cleaned' : 'Missing cleaned output'}</figcaption>
          ${cleanedExists
            ? `<img src="${toFileHref(job.outputPath)}" alt="Cleaned ${job.id}">`
            : `<div class="missing">No cleaned file yet</div>`}
        </figure>
      </div>
    </article>
  `;
}

function buildPage(jobs) {
  const completed = jobs.filter((job) => fileExists(job.outputPath)).length;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>One Piece Cleanup Review</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #10131a; color: #eef2ff; }
    header { padding: 20px 24px; border-bottom: 1px solid #2a3040; position: sticky; top: 0; background: rgba(16,19,26,0.96); backdrop-filter: blur(8px); }
    h1 { margin: 0 0 8px; font-size: 28px; }
    p { margin: 0; color: #b9c2d7; }
    main { padding: 20px 24px 40px; display: grid; gap: 18px; }
    .card { background: #171c26; border: 1px solid #2a3040; border-radius: 16px; padding: 16px; }
    .card h2 { margin: 0 0 4px; font-size: 20px; }
    .meta { margin-bottom: 12px; font-size: 13px; color: #93a0bc; }
    .images { display: grid; grid-template-columns: repeat(2, minmax(280px, 1fr)); gap: 16px; align-items: start; }
    figure { margin: 0; }
    figcaption { margin-bottom: 8px; font-size: 13px; color: #c7d1ea; }
    img { width: 100%; max-width: 420px; border-radius: 12px; background: #0d1117; border: 1px solid #31394c; }
    .missing { min-height: 240px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: #0d1117; border: 1px dashed #4c566f; color: #95a2bf; }
    @media (max-width: 900px) { .images { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>One Piece Cleanup Review</h1>
    <p>${completed} of ${jobs.length} cleaned outputs currently available</p>
  </header>
  <main>
    ${jobs.map(renderCard).join('\n')}
  </main>
</body>
</html>`;
}

function main() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Cleanup manifest not found: ${manifestPath}`);
  }

  ensureDir(reviewRoot);
  const jobs = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(outputPath, buildPage(Array.isArray(jobs) ? jobs : []), 'utf8');

  console.log('Built One Piece cleanup review page.');
  console.log(JSON.stringify({ output: outputPath }, null, 2));
}

main();
