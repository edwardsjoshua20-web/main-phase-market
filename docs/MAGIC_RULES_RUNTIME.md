# Magic Rules Runtime

`MagicRulesRuntime` is the only authority allowed to issue deterministic Magic interaction rulings. The Search Owner resolves exact card identities before execution. Legacy pattern evaluators are not part of the ruling path.

## Phase 1: Scenario Compiler

`scenarioCompiler.js` converts a user description into a versioned `MagicScenario` structure containing players, objects, zones, actions, targets, choices, sequence, and supplied turn context.

Generic permanents and tokens are first-class objects. They are never sent through card-name search. Card references accepted by the compiler are the canonical cards already resolved upstream.

Certified examples include:

- an opponent-controlled generic creature with Ward `{2}`
- a Murder cast action targeting that object
- an explicit unpaid ward-cost choice
- two distinct generic 1/1 creature tokens
- named Blood Artist and Pyroclasm objects alongside generic objects

## Phase 2: Oracle Semantic IR

`oracleSemantics.js` emits a typed, versioned `OracleSemanticIR`. It includes spell, activated, and triggered abilities with typed target, cost, condition, mode, event, and effect nodes.

The current executable subset is intentionally narrower than the structural parser. Destruction, exile, counters, fixed damage, global creature damage, basic P/T modification, protection grants, and the certified dies/life-drain trigger shape are executable. Other parsed nodes remain structural until their runtime subsystem is certified.

`ORACLE_GRAMMAR_CAPABILITIES` is the canonical capability declaration. Unsupported grammar is not treated as executable.

## Phase 3: State, Events, Triggers, and SBAs

`runtimeState.js` owns the canonical versioned game state:

- players and player zones
- stable object IDs and object registry
- battlefield, stack, and pending trigger state
- turn, phase, step, active player, and priority holder
- replacement, prevention, and continuous-effect registries
- first-class proposed and committed events

The event foundation emits zone-change, permanent, death, damage, life, trigger, and resolution events. Trigger collection subscribes typed Oracle trigger nodes to matching events and uses last-known snapshots for simultaneous battlefield departures.

The certified SBA subset repeats until stable and covers zero toughness, lethal damage, deathtouch-marked damage, life loss, poison loss, opposing +1/+1 and -1/-1 counter cancellation, and token ceasing outside battlefield/stack zones.

## Certified Compositions

- Generic dies watcher + two generic 1/1 tokens + global 2 damage: three death events and three trigger instances.
- Blood Artist + two generic 1/1 tokens + Pyroclasm: the same three-event, three-trigger result.
- Gods Willing granting black protection in response to Murder: target re-check prevents Murder from resolving against Serra Angel.
- Arc Trail with one target becoming illegal: the remaining legal target is still affected.

## Deliberately Unsupported

Ward cost/trigger execution, priority passing, general stack execution, replacement/prevention choice, continuous layers, combat, turn progression, and Commander modifications remain uncertified. These return `UNVERIFIED`, or `DEPENDS` when a supported primitive only lacks required state.

The next phase should implement stack/priority and costs on top of the compiled scenario, typed Oracle IR, and event state rather than restoring pattern verdicts.
