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

## Phase 4: Stack, Priority, Costs, and Ward

`stackRuntime.js` owns executable `Spell`, `ActivatedAbility`, and `TriggeredAbility` stack objects. Each object carries its runtime ID, source object, controller, targets, modes, costs, chosen values, effect IR, order, and rule references. The top of `state.stack` resolves first.

The two-player priority runtime records the priority holder and consecutive passes. An action resets the pass count. Two passes resolve the top object when the stack is nonempty, or advance the step when it is empty. After a resolution, the active player receives priority.

`costSystem.js` owns typed fixed costs and payment results. The certified cost nodes are `ManaCost`, `LifeCost`, `TapCost`, `SacrificeCost`, `DiscardCost`, `AdditionalCost`, and `TriggeredPaymentCost`. Mana retains generic, white, blue, black, red, green, and colorless quantities. Payment is always one of `paid`, `unpaid`, `cannot-pay`, or `unspecified`; an unspecified outcome needed by a ruling returns `DEPENDS`.

The casting order used by the runtime is:

1. announce and create the spell object;
2. retain chosen modes, targets, and values;
3. determine and pay supported costs;
4. put the spell on the stack and emit `SpellCast`;
5. emit one first-class `TargetChosen` event per target;
6. collect and place resulting triggers in APNAP order;
7. give the active player priority.

Ward is a generic `TargetChosen` subscriber. An opponent-controlled spell or ability targeting a permanent with Ward creates a `TriggeredAbility` above its source stack object. The Ward trigger contains a `TriggeredPaymentCost` and a `CounterUnlessPaid` effect. A paid cost leaves the source object on the stack; unpaid or cannot-pay counters it through the generic counter primitive; unspecified payment returns `DEPENDS`. Ward never changes target legality.

Certified Phase 4 proofs cover generic `Destroy target creature` and Murder parity for paid, unpaid, cannot-pay, and unspecified Ward; LIFO response stacks; counter and counter-counter operations; APNAP trigger placement; response windows; empty-stack step advancement; and instant, sorcery, and activated-ability timing.

## Deliberately Unsupported

X, hybrid, Phyrexian, alternate-cost, and unrestricted cost-reduction calculations remain unsupported. Multiplayer priority and ambiguous multiplayer trigger ordering are not certified. Special actions, replacement/prevention choices, continuous layers, combat, complete turn progression, and Commander modifications also remain uncertified. These return `UNVERIFIED`, or `DEPENDS` when a supported primitive only lacks required state.

The next phase should broaden typed effect execution and replacement/prevention choices on the same stack/event foundation, without restoring pattern verdicts.
