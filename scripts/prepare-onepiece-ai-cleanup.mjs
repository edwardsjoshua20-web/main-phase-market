import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const imageRoot = path.join(projectRoot, 'public', 'data', 'onepiece', 'images');
const cardsPath = path.join(projectRoot, 'public', 'data', 'onepiece', 'cards.json');
const tmpRoot = path.join(projectRoot, 'tmp', 'imagegen', 'onepiece-cleanup');
const outputRoot = path.join(projectRoot, 'output', 'imagegen', 'onepiece-cleaned');
const reviewRoot = path.join(projectRoot, 'output', 'imagegen', 'onepiece-cleaned-review');
const promptPath = path.join(tmpRoot, 'cleanup-prompt.txt');
const manifestPath = path.join(tmpRoot, 'jobs.json');
const runnerPath = path.join(tmpRoot, 'run-onepiece-ai-cleanup.ps1');
const readmePath = path.join(tmpRoot, 'README.txt');

const promptText = `Use case: precise-object-edit
Asset type: trading card image restoration for local archive review
Primary request: Remove only the SAMPLE watermark from this One Piece card image and reconstruct the pixels hidden by the watermark naturally.
Style/medium: preserve the original scanned/printed card image exactly
Constraints: change only the SAMPLE watermark area; keep card art, frame, borders, text, icons, rarity marks, power, cost, life, effect text, colors, proportions, cropping, and resolution unchanged; do not add or remove any other content; do not sharpen, recolor, upscale, denoise, or stylize the image
Avoid: any remaining watermark fragments, blurry text, altered card text, invented symbols, changed borders, changed numbers, color shifts, repainting outside the watermark area, extra cleanup, extra logos, or any watermark`;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function inferExtension(sourceUrl) {
  try {
    const pathname = new URL(String(sourceUrl || '')).pathname.toLowerCase();
    return path.extname(pathname) || '.png';
  } catch {
    return '.png';
  }
}

function buildJobs() {
  const cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));

  return cards.map((card) => {
    const id = String(card?.id || '').trim();
    const ext = inferExtension(card?.image_url).toLowerCase();
    const prefix = id.slice(0, 2).toLowerCase();
    const relative = path.join(prefix, `${encodeURIComponent(id)}${ext}`);
    const inputPath = path.join(imageRoot, relative);
    const outputPath = path.join(outputRoot, relative);
    const reviewPath = path.join(reviewRoot, relative);
    return {
      id,
      ext: ext.replace(/^\./, '') || 'png',
      inputPath,
      relative,
      outputPath,
      reviewPath
    };
  }).filter((job) => fs.existsSync(job.inputPath)).sort((a, b) => a.relative.localeCompare(b.relative));
}

function buildRunner(jobs) {
  return `param(
  [int]$Start = 0,
  [int]$Limit = 25,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$python = $env:IMAGE_GEN_PYTHON
if ([string]::IsNullOrWhiteSpace($python)) {
  Write-Host "Set IMAGE_GEN_PYTHON to your Python executable before running this script." -ForegroundColor Yellow
  Write-Host "Example: $env:IMAGE_GEN_PYTHON='C:\\\\Path\\\\To\\\\python.exe'" -ForegroundColor Yellow
  exit 1
}

if (-not (Test-Path -LiteralPath $python)) {
  Write-Host "IMAGE_GEN_PYTHON does not point to an existing executable: $python" -ForegroundColor Red
  exit 1
}

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
  Write-Host "OPENAI_API_KEY is not set." -ForegroundColor Red
  exit 1
}

$imageGen = 'C:\\Users\\Admin\\.codex\\skills\\.system\\imagegen\\scripts\\image_gen.py'
$promptFile = '${promptPath.replaceAll('\\', '\\\\')}'
$jobsPath = '${manifestPath.replaceAll('\\', '\\\\')}'

if (-not (Test-Path -LiteralPath $imageGen)) {
  Write-Host "image_gen.py not found: $imageGen" -ForegroundColor Red
  exit 1
}

$jobs = Get-Content -LiteralPath $jobsPath -Raw | ConvertFrom-Json
$selected = $jobs | Select-Object -Skip $Start -First $Limit

if (-not $selected -or $selected.Count -eq 0) {
  Write-Host "No jobs selected. Check -Start and -Limit." -ForegroundColor Yellow
  exit 0
}

Write-Host "Running $($selected.Count) One Piece cleanup jobs starting at index $Start" -ForegroundColor Cyan

foreach ($job in $selected) {
  $outDir = Split-Path -Parent $job.outputPath
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null

  $args = @(
    $imageGen,
    'edit',
    '--image', $job.inputPath,
    '--prompt-file', $promptFile,
    '--quality', 'high',
    '--input-fidelity', 'high',
    '--output-format', $job.ext,
    '--out', $job.outputPath,
    '--no-augment'
  )

  if ($Force) {
    $args += '--force'
  }

  Write-Host ("Cleaning " + $job.relative) -ForegroundColor Green
  & $python @args
  if ($LASTEXITCODE -ne 0) {
    Write-Host ("Failed on " + $job.relative) -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host "Batch complete. Build the review page next with:" -ForegroundColor Cyan
Write-Host "npm.cmd run onepiece:ai-clean:review" -ForegroundColor White
`;
}

function buildReadme(jobCount) {
  return `One Piece AI cleanup staging

Input images:
${imageRoot}

Cleaned output folder:
${outputRoot}

Review output folder:
${reviewRoot}

Prompt file:
${promptPath}

Job manifest:
${manifestPath}

PowerShell runner:
${runnerPath}

Total queued images:
${jobCount}

Suggested workflow:
1. Set your Python path:
   $env:IMAGE_GEN_PYTHON='C:\\Path\\To\\python.exe'
2. Set your API key:
   $env:OPENAI_API_KEY='...'
3. Run a small review batch first:
   powershell -ExecutionPolicy Bypass -File "${runnerPath}" -Start 0 -Limit 20
4. Build the comparison page:
   npm.cmd run onepiece:ai-clean:review
5. Open the review page and inspect quality before running larger batches.

Notes:
- This workflow is non-destructive. Originals stay in place.
- Cleaned copies are written under output/imagegen/onepiece-cleaned.
- Only replace live images after manual review.`;
}

function main() {
  if (!fs.existsSync(imageRoot)) {
    throw new Error(`One Piece image folder not found: ${imageRoot}`);
  }

  ensureDir(tmpRoot);
  ensureDir(outputRoot);
  ensureDir(reviewRoot);

  const jobs = buildJobs();
  fs.writeFileSync(promptPath, promptText, 'utf8');
  fs.writeFileSync(manifestPath, JSON.stringify(jobs, null, 2), 'utf8');
  fs.writeFileSync(runnerPath, buildRunner(jobs), 'utf8');
  fs.writeFileSync(readmePath, buildReadme(jobs.length), 'utf8');

  console.log('Prepared One Piece AI cleanup workflow.');
  console.log(JSON.stringify({
    jobs: jobs.length,
    prompt_path: promptPath,
    manifest_path: manifestPath,
    runner_path: runnerPath,
    review_output_root: reviewRoot,
    cleaned_output_root: outputRoot,
    sample_input: jobs[0]?.inputPath || null
  }, null, 2));
}

main();
