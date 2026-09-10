import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const port = 8798;
const baseUrl = `http://127.0.0.1:${port}/api/public/v1`;
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), LOCAL_API_HOST: '127.0.0.1', MPM_AUTOMATION_SCHEDULER_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true
});

const timings = [];
const observations = { identities: {}, pricing: {}, cacheControl: {} };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(label, pathname, options = {}) {
  const started = performance.now();
  const response = await fetch(`${baseUrl}${pathname}`, options);
  const text = await response.text();
  const elapsedMs = Math.round((performance.now() - started) * 10) / 10;
  timings.push({ label, status: response.status, elapsedMs, bytes: Buffer.byteLength(text) });
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  return { response, payload, text };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/local/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('Verification server did not start.');
}

function post(body) {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

function assertNoPrivateFields(value) {
  const forbidden = /^(cost_basis|margin|customer|inventoryQuantity|quantity_available|dbPath|runtimeSiteDataRoot|service_role|secret)$/i;
  const pending = [value];
  while (pending.length) {
    const current = pending.pop();
    if (!current || typeof current !== 'object') continue;
    for (const [key, item] of Object.entries(current)) {
      assert(!forbidden.test(key), `Response exposed forbidden private field: ${key}.`);
      if (item && typeof item === 'object') pending.push(item);
    }
  }
}

async function main() {
  await waitForServer();

  const searches = [];
  for (const [game, query] of [['magic', 'lightning bolt'], ['pokemon', 'pikachu'], ['yugioh', 'blue-eyes'], ['lorcana', 'ariel']]) {
    const result = await request(`${game} search`, '/catalog/search', post({ game, query, limit: 2 }));
    assert(result.response.ok, `${game} search failed: ${result.text}`);
    assert(result.payload.data.items.length <= 2, `${game} search exceeded limit.`);
    assert(Number.isInteger(result.payload.data.total), `${game} search did not return a total.`);
    for (const item of result.payload.data.items) {
      for (const imageUrl of Object.values(item.image).filter((value) => typeof value === 'string' && value.startsWith('http'))) {
        assert(imageUrl.startsWith('https://'), `${game} returned a non-HTTPS image URL.`);
      }
    }
    assertNoPrivateFields(result.payload);
    observations.cacheControl[`${game}Search`] = result.response.headers.get('cache-control');
    searches.push([game, result.payload]);
  }

  await request('magic warm search', '/catalog/search', post({ game: 'magic', query: 'counterspell', limit: 9 }));
  await request('pokemon warm search', '/catalog/search', post({ game: 'pokemon', query: 'charizard', limit: 9 }));
  await request('yugioh warm search', '/catalog/search', post({ game: 'yugioh', query: 'dark magician', limit: 9 }));

  const mtg = searches[0][1].data.items[0];
  const pokemon = searches[1][1].data.items[0];
  const yugioh = searches[2][1].data.items[0];
  const lorcana = searches[3][1].data.items[0];
  for (const [game, item] of [['magic', mtg], ['pokemon', pokemon], ['yugioh', yugioh], ['lorcana', lorcana]]) {
    assert(item?.identity?.printingId, `${game} search returned no printing identity.`);
    const detail = await request(`${game} detail`, `/catalog/prints/${game}/${encodeURIComponent(item.identity.printingId)}`);
    assert(detail.response.ok, `${game} detail failed: ${detail.text}`);
    assert(detail.payload.data.identity.printingId === item.identity.printingId, `${game} identity did not round-trip.`);
    assert(JSON.stringify(detail.payload.data.identity) === JSON.stringify(item.identity), `${game} canonical identity fields changed between search and detail.`);
    observations.identities[game] = item.identity;
    observations.pricing[game] = detail.payload.data.price;
    assertNoPrivateFields(detail.payload);
  }

  const pageOne = await request('pagination page 1', '/catalog/search', post({ game: 'pokemon', query: 'pikachu', limit: 1 }));
  assert(pageOne.payload.data.nextCursor, 'Expected a pagination cursor.');
  const pageTwo = await request('pagination page 2', '/catalog/search', post({ game: 'pokemon', query: 'pikachu', limit: 1, cursor: pageOne.payload.data.nextCursor }));
  assert(pageTwo.response.ok && pageTwo.payload.data.items.length === 1, 'Second pagination page failed.');
  assert(pageOne.payload.data.items[0].identity.printingId !== pageTwo.payload.data.items[0].identity.printingId, 'Pagination repeated the first printing.');

  const identities = [mtg, pokemon, yugioh, lorcana].map((item) => item.identity);
  const summaries = await request('batch summaries', '/catalog/summaries/batch', post({ identities }));
  assert(summaries.response.ok && summaries.payload.data.items.length === identities.length, 'Batch summaries failed.');
  assertNoPrivateFields(summaries.payload);

  const prices = await request('batch pricing', '/pricing/quotes/batch', post({ identities }));
  assert(prices.response.ok && prices.payload.data.items.length === identities.length, 'Batch pricing failed.');
  assert(prices.payload.data.items.some((item) => Number(item.quote.amount) > 0), 'Pricing batch did not return any covered quote.');
  assertNoPrivateFields(prices.payload);

  const status = await request('service status', '/service/status');
  assert(status.response.ok && status.payload.data.catalogs.length === 7, 'Service status failed.');
  observations.serviceStatus = status.payload.data;
  observations.cacheControl.serviceStatus = status.response.headers.get('cache-control');
  assertNoPrivateFields(status.payload);

  const malformed = await request('malformed input', '/catalog/search', post({ game: 'magic', query: 'x', filters: { madeUp: true } }));
  assert(malformed.response.status === 400 && malformed.payload.error.code === 'unsupported_filter', 'Malformed filter was not rejected.');
  const unsupported = await request('unsupported game', '/catalog/search', post({ game: 'digimon', query: 'agumon' }));
  assert(unsupported.response.status === 400 && unsupported.payload.error.code === 'unsupported_game', 'Unsupported game was not rejected.');
  const missing = await request('missing printing', '/catalog/prints/pokemon/not-a-real-print');
  assert(missing.response.status === 404, 'Missing printing did not return 404.');
  const oversized = await request('oversized summaries', '/catalog/summaries/batch', post({ identities: Array.from({ length: 101 }, () => pokemon.identity) }));
  assert(oversized.response.status === 400, 'Oversized summary batch was not rejected.');
  const oversizedPricing = await request('oversized pricing', '/pricing/quotes/batch', post({ identities: Array.from({ length: 201 }, () => pokemon.identity) }));
  assert(oversizedPricing.response.status === 400, 'Oversized pricing batch was not rejected.');
  const malformedJson = await request('malformed JSON', '/catalog/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert(malformedJson.response.status === 400 && malformedJson.payload.error.code === 'invalid_request', 'Malformed JSON was not rejected with the public error envelope.');
  const oversizedBody = await request('oversized body', '/catalog/search', post({ game: 'magic', query: 'bolt', padding: 'x'.repeat(70_000) }));
  assert(oversizedBody.response.status === 413 && oversizedBody.payload.error.code === 'invalid_request', 'Oversized request body was not rejected.');

  const report = { ok: true, generatedAt: new Date().toISOString(), observations, timings };
  const output = path.join(process.cwd(), '.codex-temp', 'cardstache-public-api-verification.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

try {
  await main();
} finally {
  if (server.exitCode == null) {
    server.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => server.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000))
    ]);
  }
}
