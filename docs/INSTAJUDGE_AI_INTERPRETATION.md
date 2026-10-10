# InstaJudge AI interpretation

InstaJudge uses Cloudflare Workers AI as its bounded conversational layer for typed freeform input. The model may produce natural judge dialogue and propose structured operations, but it never adjudicates, mutates canonical state directly, or supplies authoritative Magic facts.

## Runtime path

Guided quick replies use the zero-AI path:

`InstaJudge UI -> deterministic collector -> canonical state -> deterministic engine when needed`

Typed input uses that same fast path only when it cleanly satisfies the active structured answer contract, such as `mine` for turn, `upkeep` for phase, or `yes` for a pending confirmation. The router does not try to maintain a phrase list for social speech, corrections, or rules questions; every other typed message is a conversational deviation.

Typed deviations use the conversational path:

`InstaJudge UI -> InstaJudge Owner -> /api/instajudge/interpret -> Workers AI conversational envelope -> schema validator -> deterministic action/state adapter -> canonical state or engine gateway -> guided collector resume`

The conversational envelope keeps visible speech separate from authority:

* `reply` is the model-generated player-facing conversational response. A valid reply is preserved rather than replaced by collector input-repair copy.
* `intent` describes the conversational purpose.
* `proposedActions` contains only allowlisted, non-executable proposals.
* `rulesRequest` may request the deterministic `evaluate_magic_question` gateway operation.
* `conversationControl` tells the owner whether natural conversation should continue while the collector waits silently, or whether a correction/rules detour should suspend and later resume it. The primary values are `continue_conversation`, `hold_collector`, `suspend_for_correction`, `suspend_for_rules`, and `resume_collector`; older collector-named values remain parse-compatible only.
* `interpretation` retains the strict semantic state evidence contract.

The owner validates every proposal. Corrections remain pending until deterministic confirmation, validated state statements pass through the deterministic adapter, and only the engine gateway may produce a ruling. The collector stays pending silently while a side conversation continues for any number of turns. Its state and quick replies remain available, but the judge does not verbally reclaim the conversation; a valid button or direct structured answer resumes the deterministic flow.

The endpoint is hosted by the existing `main-phase-market-cardstache-api` Worker at `/api/instajudge/interpret`. The browser receives no Cloudflare credential; the Worker uses its `AI` binding.

## Configuration

`wrangler.cardstache-api.toml` defines the `AI` binding and the configurable `INSTAJUDGE_AI_MODEL`. The default is `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, an active Workers AI model with JSON mode support. The lower-cost fallback candidate is `@cf/meta/llama-3.1-8b-instruct-fp8-fast`, but Cloudflare's current JSON-mode support list does not explicitly certify that FP8-fast variant, so it should be evaluated before changing the default.

The optional frontend variable `VITE_INSTAJUDGE_INTERPRET_API_URL` overrides the production endpoint. No secret belongs in this variable.

Local browser and Wrangler execution are fail-closed by default. A local browser requires `VITE_INSTAJUDGE_ALLOW_LIVE_AI=true`, and the Worker requires `INSTAJUDGE_ALLOW_LIVE_AI=true`, before any live inference request is permitted. Production requests retain the existing enabled-by-default behavior unless `INSTAJUDGE_ALLOW_LIVE_AI=false` is explicitly configured there.

Live smoke and evaluation scripts additionally require `INSTAJUDGE_LIVE_AI_MAX_CALLS` to be an explicit positive integer at least as large as the script's planned call count. The per-process gate increments before every fetch and refuses calls beyond that ceiling.

An optional Workers Rate Limiting binding named `INSTAJUDGE_RATE_LIMITER` can replace the Worker's conservative isolate-local fallback. Adding that binding requires an account-specific namespace ID and is intentionally not fabricated in source control.

## Failure behavior

Requests are capped at 24 KiB, messages at 4,000 characters, context at six 500-character entries, and model execution at twenty seconds. Canonical state, active/suspended collector metadata, pending corrections, pending rules work, card references, and judge identity are projected into bounded context. Invalid model output, unresolved cards, timeouts, missing bindings, and endpoint failures fail closed into the existing deterministic guided collector. Players do not see infrastructure errors.

Corrections produce a confirmation choice in the existing conversation. Canonical state changes only after `Yes, change it`.

One typed conversational deviation consumes at most one interpretation call. Button clicks and obvious direct structured text answers consume zero AI calls. A rules request may invoke the deterministic local engine after interpretation; it does not create a second AI call.

## Verification

Run deterministic mocked coverage with:

`npm run instajudge:ai:verify`

Run the optional live smoke only when an endpoint is deliberately available:

`$env:INSTAJUDGE_ALLOW_LIVE_AI='true'; $env:INSTAJUDGE_LIVE_AI_MAX_CALLS='1'; $env:INSTAJUDGE_INTERPRET_API_URL='http://127.0.0.1:8787/api/instajudge/interpret'; npm run instajudge:ai:smoke`

Workers AI usage, including Wrangler local development, consumes the Cloudflare account's Workers AI allocation.

## Offline historical regression

The post-repair historical corpus is frozen in `scripts/fixtures/instajudge-ai-historical-misses.json`. It contains the exact 35 semantic misses from the saved 108-case run, including the saved model output and explicit unavailable markers for historical normalization, validator, and fallback fields that were not recorded by that run.

Run the corpus and adversarial firewall checks without any network or model call:

`npm run instajudge:ai:historical`

This result is an offline deterministic-pipeline score, not a new Workers AI accuracy claim.

## Proposed live micro-certification

Do not run this list as part of normal verification. When a live allocation is deliberately approved, these eight inputs distinguish the remaining interpretation classes with minimal spend:

1. `First strike damage already happened.` Expected: combat / first-strike-combat-damage, between-damage-steps context, stackEmpty null.
2. `Before blockers are declared.` Expected: combat / declare-attackers, before-blockers context, stackEmpty null.
3. `Divination, then Negate, then Cancel on top.` Expected stack top-to-bottom: Cancel, Negate, Divination.
4. `It's upkeep.` Expected: beginning / upkeep; turn, priority, and stack remain null; no ambiguity.
5. `I meant declare blockers.` With a correctable prior step, expected correction field `step` and value `declare-blockers`.
6. `I cast Divin.` Expected raw card text `Divin`, no punctuation in the candidate key, and ambiguity between safe Search Owner candidates.
7. `There is an ability on the stack.` Expected stackEmpty false plus source ambiguity; no placeholder stack identity.
8. `My Grizzly Bears attacks and their Grizzly Bears blocks it.` Expected two distinct same-name combat objects with user/opponent provenance and no unrelated scalar facts.
