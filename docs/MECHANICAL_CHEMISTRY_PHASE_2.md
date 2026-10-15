# Mechanical Chemistry Phase 2 — Precision Hardening

Status: local prototype only; **not approved for broad customer exposure**.

## Scope and constraints

- Deterministic Oracle-text scoring only. Community inclusion remains a separately displayed observation and is never part of Mechanical Fit.
- Canonical Commander legality remains fail-closed and commander pairs remain intact.
- No LLM calls, external fetches, ingestion changes, named-card scoring exceptions, optimizer, or Build Me a Deck feature.
- Phase 2 artifacts are written to `D:\DevCache\main-phase-market\mechanical-chemistry\phase2`.

## False-positive audit

The dominant Phase 1 causes were broad type-derived events receiving the same weight as explicit Oracle actions, role labels being accepted without a matching semantic edge, conditional triggers being treated as reliable engines, unpriced setup dependencies, and generic utility being allowed to look commander-central.

- **Basri's Lieutenant / Teysa Karlov:** shared death/token events were real but conditional on another creature carrying a counter. Phase 1 overvalued that shared event and the broad payoff role. Phase 2 marks the trigger and token output conditional, records the other-creature/counter setup, downgrades the role edge, and moved the card from rank 1 to outside the first 250 reviewed candidates.
- **Generic instants / Mizzix:** the mere act of casting an instant or sorcery was treated as a direct engine edge. Type-derived cast events are now conditional-support edges. The reviewed generic cantrip finished at rank 77 or lower in the hardened runs and outside the 120-card generated artifact.
- Remaining broad classes are documented below. No card-name checks exist in production scoring.

## Scoring model

Every positive edge has an explicit strength tier: `direct_engine`, `strong_support`, `conditional_support`, `generic_utility`, or `weak_thematic_overlap`. Tier multipliers are applied before confidence and constraints. Role matches are weighted by commander-specific role relevance (`core`, `important_support`, `optional`, `generic_utility`), and strategic role bonuses require a real semantic connection.

Repeatability records repeatable, once-per-turn, once-per-game, ETB-only, death-only, attack-only, combat-damage-only, tap, sacrifice, discard, graveyard, opponent-action, and threshold conditions. Repeatable direct engines receive a bonus; one-shot engine pieces receive a role-aware penalty, while removal, interaction, wipes, and finishers are exempt from a universal one-shot penalty.

Efficiency uses mana value, colored-pip pressure, estimated activation cost, and additional sacrifice/discard cost. Low-cost core enablers receive a modest bonus; expensive non-finisher support receives cost pressure. This is intentionally not curve optimization.

Dependencies are recorded as self-contained, one dependency, or multiple dependencies. The model distinguishes commander-supplied, strategy-likely, and unsupported requirements. An alternative tribal requirement is not treated as multiple mandatory tribes.

Commander centrality is emitted separately as a 0–100 score and `Commander-Central`, `Strategy-Specific`, or `Generic Utility`. Generic ramp/removal remains eligible but cannot masquerade as unique chemistry.

Negative edges cover graveyard shutdown/replacement, death-to-exile replacement, token suppression, artifact depletion, forced discard, spell taxes, ability shutdown, counter shutdown, lifegain shutdown, and token hate. Each penalty carries an explanation.

Within-role competition groups candidates by role plus leading semantic features. A dominated card receives a small, explicit penalty when a peer has materially higher fit/reliability at comparable or lower cost. This is a rank adjustment, not deck optimization.

Confidence is separate from fit. It uses independent strong edges, parser certainty, commander-profile certainty, dependencies, and conditional delivery. Community data is excluded.

Explanations now retain three source fields: candidate action, commander connection, and strategic value. Display text is generated from the scored edge.

## Validation and precision

The suite contains 40 commander configurations and 200 manually selected review fixtures: one obvious positive, moderate fit, weak/irrelevant negative, illegal/off-color negative, and tricky false-positive trap per configuration. It covers aristocrats, spellslinger, counters, tokens, artifacts, enchantments, graveyard, lands, tribal, voltron, blink, mill, lifegain, combat, control, group slug, treasure, sacrifice, partners, Backgrounds, narrow tribes, replacement effects, activated abilities, and unusual zones.

The deterministic verification run passed 204/204 checks over 32,233 canonical cards.

| Metric | Top 10 | Top 20 |
|---|---:|---:|
| Obvious-positive recall | 15.0% | 22.5% |
| Obvious-negative rejection | 100.0% | 100.0% |
| Reviewed false-positive trap rate | 0.0% | 0.0% |

Additional metrics: illegal-card rejection 100%, explanation correctness 100%, partner/Background correctness 100%.

These results are precision-oriented but not a release pass. The known reviewed traps were removed, while the low exact-positive recall and human review show that many semantically similar cards still tie or outrank established strong options. This phase should remain local until the parser better distinguishes resource quality, magnitude, and modality.

## Human review findings

The 20-commander top-10 review report confirms genuine wins (for example, enchantress payoffs for Sythis, proliferate pieces for Atraxa, Ninjas for Yuriko, extra-combat pieces for Karlach/Isshin, and Panharmonicon for Yarok). It also exposes unresolved categories:

- token creation is still too broad for Teysa and some token commanders;
- generic self-mill/graveyard population is too broad for Muldrotha, Narset, Sefris, and Kess;
- all Auras are too close together for Sram/Light-Paws;
- generic counter placement does not yet distinguish +1/+1, -1/-1, loyalty, poison, and other counter kinds strongly enough;
- ETB/blink profiles miss too many specific ETB outputs;
- activated abilities and alternate faces need more modality-aware interpretation;
- the intrinsic strength of outputs (one token versus a scalable engine, one card versus repeatable draw) needs a magnitude model.

## Community disagreement

- **High mechanical / high community:** Contagion Clasp with Atraxa and enchantress effects with Sythis are agreement cases.
- **High mechanical / low community:** Case of the Ransacked Lab with Mizzix and several new/local-data-absent proliferate cards are plausible hidden chemistry, but must be reviewed for opportunity cost and current rules text.
- **Low mechanical / high community:** Arcane Signet is correctly classified as generic utility, while Ashnod's Altar with Teysa and Archmage Emeritus with Mizzix expose parser gaps rather than evidence that the community is wrong.

## Zero-community test

Mechanically justified recommendations are produced without community observations, including Argothian Enchantress/Generous Visitor for Sythis, Contagion-style proliferate pieces for Atraxa, and multiple instant/sorcery payoff engines for Mizzix. This demonstrates independence from observed inclusion. The same report also contains false-positive warnings; absence of community data is not treated as validation.

## Performance

- Canonical cards profiled: 32,233
- Semantic profile build: 1,582.6 ms
- Forty-commander recommendation build: 49,366.7 ms
- Mean per-commander recompute: 1,234.2 ms
- Total artifact size: 205.32 MiB
- Peak measured RSS: 1,038.1 MiB
- Page-request behavior: precomputed/cached artifacts; no request-time full-pool scoring

## Prototype UI

No redesign was made. The existing optional Mechanical Chemistry section already presents the card, Mechanical Fit label, role grouping, scored-edge explanation, and community inclusion separately. Phase 2 was not published to the public preview path because human review does not yet justify broader exposure.

## Release decision and remaining work

Phase 2 materially improves rejection and removes the two known trap classes, but the customer-trust success bar is not yet met because Top-10/Top-20 obvious-positive recall is too low and several broad semantic families remain noisy. Recommended next work is a deterministic magnitude/modality pass (counter type, token amount/scaling, exact zone movement, ETB output, ability subject/target, and repeatable resource rate), followed by another human review cycle. Do not expose Phase 2 broadly before that pass.
