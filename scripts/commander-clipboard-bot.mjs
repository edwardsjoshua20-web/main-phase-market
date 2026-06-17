import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const DEFAULT_API_BASE = process.env.COMMANDER_IMPORT_API || 'http://127.0.0.1:8787/api/local/mtg/commanders';
const DEFAULT_INTERVAL_MS = 1500;
const DEFAULT_REBUILD_EVERY = 10;

function parseArgs(argv) {
  const args = {
    apiBase: DEFAULT_API_BASE,
    intervalMs: DEFAULT_INTERVAL_MS,
    rebuildEvery: DEFAULT_REBUILD_EVERY
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--api-base') args.apiBase = String(argv[i + 1] || args.apiBase);
    if (token === '--interval') args.intervalMs = Math.max(500, Number(argv[i + 1]) || args.intervalMs);
    if (token === '--rebuild-every') args.rebuildEvery = Math.max(1, Number(argv[i + 1]) || args.rebuildEvery);
  }

  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readClipboardText() {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-Command', 'Get-Clipboard -Raw'],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || 'Failed to read clipboard');
  }

  return String(result.stdout || '').replace(/\r/g, '');
}

function countDeckLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\d+\s+/.test(line))
    .length;
}

function looksLikeCommanderDeckText(text) {
  const value = String(text || '');
  if (!value.trim()) return false;
  if (countDeckLines(value) < 20) return false;
  return /\n\s*\n\s*\d+\s+.+/.test(value) || /\nSIDEBOARD:\s*\n/i.test(value);
}

function fingerprint(text) {
  return crypto.createHash('sha1').update(String(text || '')).digest('hex');
}

async function importDeckText(apiBase, text) {
  const response = await fetch(`${apiBase}/import-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      deckName: 'Clipboard import',
      refresh: false
    })
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Clipboard import failed');
  }

  return payload;
}

async function rebuildCommanderData(apiBase) {
  const response = await fetch(`${apiBase}/rebuild`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || 'Commander rebuild failed');
  }

  return payload;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let lastSeenHash = '';
  let pendingHash = '';
  let pendingText = '';
  let pendingStableReads = 0;
  let importedCount = 0;

  console.log(`[clipboard-bot] watching clipboard every ${args.intervalMs}ms`);
  console.log(`[clipboard-bot] api: ${args.apiBase}`);
  console.log(`[clipboard-bot] rebuild every ${args.rebuildEvery} successful imports`);

  while (true) {
    try {
      const text = readClipboardText();
      const currentHash = fingerprint(text);

      if (currentHash === lastSeenHash) {
        pendingHash = '';
        pendingText = '';
        pendingStableReads = 0;
      } else if (looksLikeCommanderDeckText(text)) {
        if (currentHash !== pendingHash) {
          pendingHash = currentHash;
          pendingText = text;
          pendingStableReads = 1;
        } else {
          pendingStableReads += 1;
        }
      } else {
        pendingHash = '';
        pendingText = '';
        pendingStableReads = 0;
      }

      if (pendingHash && pendingStableReads >= 2) {
        lastSeenHash = pendingHash;
        const stableText = pendingText;
        pendingHash = '';
        pendingText = '';
        pendingStableReads = 0;
        const payload = await importDeckText(args.apiBase, stableText);
        const deck = payload?.deck || {};
        importedCount += 1;

        console.log(
          `[clipboard-bot] imported #${importedCount}: ${deck.commander_name || 'Unknown commander'} | ${deck.quality_status || 'unknown'} | cards=${deck.total_cards ?? '?'} | unresolved=${deck.unresolved_cards ?? '?'} | notes=${deck.validation_notes || 'ok'}`
        );

        if (importedCount % args.rebuildEvery === 0) {
          console.log('[clipboard-bot] rebuilding commander data...');
          await rebuildCommanderData(args.apiBase);
          console.log('[clipboard-bot] rebuild complete');
        }
      }
    } catch (error) {
      console.error(`[clipboard-bot] ${error.message}`);
    }

    await sleep(args.intervalMs);
  }
}

main().catch((error) => {
  console.error('[clipboard-bot] fatal:', error);
  process.exitCode = 1;
});
