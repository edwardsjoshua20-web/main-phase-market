# Mechanical Chemistry Engine — Phase 1

## Boundary

Mechanical Chemistry is a Commander-owned, deterministic recommendation signal. It does not modify or import the InstaJudge runtime, construct 100-card decks, blend community popularity into its score, call external APIs, or deploy data.

The three signals remain independent:

- Mechanical Chemistry: structured Oracle-text relationships.
- Community Inclusion / Observation Count: what the local corpus observed.
- Statistical Affinity: community co-occurrence relative to its baseline.

## Reusable infrastructure audit

- `src/services/legality`: suitable and canonical. The engine follows its fail-closed Commander legality semantics, then applies combined commander color identity and excludes the commander cards themselves.
- `public/data/mtg/search-lite`: suitable canonical local Oracle/card pool. The precompute deduplicates printings by `oracle_id` and never requires community appearance.
- `public/data/legality/mtg.json`: suitable P0 legality index generated from the canonical catalog source.
- `server/mtgCommanderEngine.mjs` and published commander details: suitable for separate community inclusion, observation, and affinity fields.
- `src/services/instajudge/magic/runtime/oracleSemantics.js`: mature rules-execution IR, but too tightly coupled to InstaJudge scenario/runtime state for this read-only recommender. It was audited but not changed or imported.
- InstaJudge targeting, stack, turn, combat, replacement, prevention, attachment, and continuous-effect runtimes are likewise useful references but not safe shared dependencies for this phase.

## Semantic schemas

`buildSemanticCardProfile` emits canonical identity, card/type text, mana value, color identity, types/subtypes, and evidence-bearing arrays for:

- `produces`, `wants`, `rewards`, `enables`
- `roles`, `constraints`
- `zones`, `trigger_patterns`, `resources`, `themes`

Each feature is `{ key, confidence, evidence[] }`. No recommendation is keyed to a named card.

`buildCommanderSemanticProfile` preserves every commander member, joins their canonical Oracle IDs into a stable identity, unions color identity and semantic features, and infers only relevant support roles. Partner and Background pairs are never collapsed.

## Scoring and explanations

The scorer applies weighted, inspectable edges:

- produces a wanted resource or rewarded event
- consumes commander output
- amplifies a commander plan/output
- supplies a referenced object type or tribe
- protects an engine, adds redundancy, or fills a support role
- subtracts expensive, symmetrical, unsupported tribal, and unsupported graveyard dependencies

The internal 0–100 value is for ordering and tests. UI uses `Excellent`, `Strong`, `Moderate`, or `Limited Mechanical Fit`; it does not present a probability. Every surfaced result includes structured relationship, feature, weight, and a deterministic explanation sentence.

## Role model

Supported categories are Ramp, Card Draw, Removal, Board Wipes, Protection, Recursion, Token Generation, Sacrifice Outlets, Graveyard Setup, Payoffs, Finishers, Enablers, Tutors, Interaction, and Mana Fixing. Empty categories are omitted.

## Legality

The scorer rejects before scoring when canonical identity is missing, Commander legality is unknown/non-legal, color identity exceeds the complete commander/pair identity, or the candidate is one of the commanders. Unknown legality fails closed.

## Precompute/index design

`scripts/build-mechanical-chemistry.mjs` performs an offline pipeline:

1. Load local canonical search-lite and legality indexes.
2. Deduplicate to one row per Oracle identity.
3. Build cached semantic profiles and inverted feature indexes.
4. Filter by legality/color first.
5. Score the full eligible pool for each commander.
6. Store per-commander result sets and an audit report.

The required artifact root is `D:\DevCache\main-phase-market\mechanical-chemistry`. The script refuses C: output on Windows. `--publish-preview` additionally writes local preview JSON under the D: repository's `public/data/mtg/mechanical-chemistry`; it performs no network or deployment action.

On the current 32,233-card canonical pool, semantic profiling took about 1.1 seconds and the complete 20-commander build about 17 seconds. Individual commander scoring was roughly 0.7–0.9 seconds. The resulting feature index supports later incremental recompute by changed Oracle IDs instead of page-request all-pairs scoring.

## Validation set and gold cases

The verifier covers 20 strategy slots: Teysa Karlov, Mizzix of the Izmagnus, Atraxa, Rhys, Urza, Sythis, Muldrotha, Gitrog, Wilhelt, Sram, Brago, Captain N'ghathrod, Karlov, Aurelia, Grand Arbiter, Mogis, Prosper, Korvold, Thrasios + Tymna, and Karlach + Agent of the Iron Throne.

Every case has a manually selected obvious positive, weak/irrelevant comparison, and illegal/off-color candidate. The verifier checks positive-over-weak ordering, structured reasons, illegality exclusion, pair preservation, combined identities, fail-closed legality, and signal separation. The current report passes 128/128 assertions.

Representative successes include:

- Pitiless Plunderer → Teysa: supplies token/death economy and payoff roles.
- Frantic Search → Mizzix: is an instant/sorcery cast event and supplies card flow.
- Life from the Loam → Gitrog: populates the graveyard with lands and supports repeatable land recursion.
- Panharmonicon → Brago: amplifies creature/artifact enter events Brago repeats.
- Bruvac → Captain N'ghathrod: multiplies the opponent-mill event the commander consumes.
- Xorn → Prosper: amplifies both token creation and Treasure output.

## Community comparison and disagreement

The build report records top-20 overlap plus internal Hidden Chemistry and Popular-but-Weak candidates. The current local community corpus is thin for several validation commanders, so `null` community inclusion means unobserved/not available, not proven zero adoption. Disagreement examples must therefore be manually reviewed before customer exposure.

Plausible hidden examples include Xorn with Prosper, Jaheira with Rhys, and extra-combat pieces with Karlach. Known false-positive pressure remains around broad role matching and cards that technically create a trigger but do so inefficiently or conditionally. Mana value, symmetry, tribal dependency, and graveyard dependency penalties reduce but do not eliminate these cases. This phase is a trustworthy prototype, not a claim that every top-120 result is editorially perfect.

## Local prototype

Commander detail pages load a separate optional Mechanical Chemistry artifact. The section appears only when precomputed data exists, provides role filters, shows a fit label and concrete first reason, and displays community inclusion separately. Existing community co-occurrence is relabeled `Statistical Affinity` in card tiles so it is not confused with mechanical fit.

No Build Me a Deck feature, commit, push, deployment, external source, or ingestion-rate change is included.
