import { createLiveAiRequestGate } from './lib/instajudge-live-ai-safety.mjs';

const endpoint = process.env.INSTAJUDGE_INTERPRET_API_URL;
if (!endpoint) {
  console.log('SKIP: set INSTAJUDGE_INTERPRET_API_URL to run the optional live Workers AI smoke test.');
  process.exit(0);
}

const liveAi = createLiveAiRequestGate({ scriptName: 'instajudge:ai:smoke', plannedCalls: 1 });
const response = await liveAi.fetch(endpoint, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    game: 'magic', message: 'I cast Divination, he responds with Negate, then I Cancel his Negate.',
    knownState: {}, pendingQuestion: null, recentContext: []
  })
});
const body = await response.json();
if (!response.ok) throw new Error(`Workers AI smoke failed (${response.status}): ${JSON.stringify(body)}`);
console.log(JSON.stringify({ model: body.model, usage: body.usage || null, interpretation: body.interpretation }, null, 2));
