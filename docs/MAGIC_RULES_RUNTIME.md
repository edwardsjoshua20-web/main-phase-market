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

The current executable subset is intentionally narrower than the structural parser. It includes destruction, exile, counters, fixed damage, global creature damage, basic P/T modification, protection grants, life changes, draw, discard, mill, sacrifice, fixed token creation, common zone changes, simple library searches, prevention shields, and the certified dies/life-drain trigger shape. Other parsed nodes remain structural until their runtime subsystem is certified.

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

## Phase 5: Typed Effects, Replacement, and Prevention

`effectRuntime.js` executes typed Oracle effect nodes instead of deriving outcomes from card-name or prose patterns. The certified primitives are life changes, draws, discards, mill, sacrifices, fixed token creation, counter modification, common zone changes, destruction, exile, damage, P/T modification, prevention, and simple library searches for supported card classes.

Effects propose events before mutating state. `runtimeState.js` applies registered and static Oracle replacement effects to proposed events, recomputes applicability after each replacement, and commits only the resulting event. Competing replacement effects without an explicit ordering choice return `DEPENDS` and leave state unchanged. Optional replacements without a supplied choice also return `DEPENDS`.

The owner choice that replaces a commander's move to hand or library with a move to the command zone is represented as an optional rules replacement. Applying or declining it is explicit; an omitted decision returns `DEPENDS`. Commander movement from graveyard or exile is reserved for the separate state-based Commander subsystem.

Zone changes preserve stable object identity and emit proposed and committed events. Battlefield departures retain last-known information, `CreatureDied` is emitted only when the final destination is the graveyard, and entries emit `PermanentEnteredBattlefield`. Tokens are ordinary runtime objects with owner, controller, type, subtype, color, power, toughness, abilities, and token identity; state-based actions make them cease to exist outside the battlefield or stack.

Damage prevention is a separate event-stage operation. Finite shields consume only the damage they prevent, protection prevents qualifying damage from protected sources, and combat-only prevention applies only to events explicitly marked as combat damage.

Certified Phase 5 proofs include:

- Divination, Mind Rot, Tome Scour, Raise the Alarm, Unsummon, Rampant Growth, Path to Exile, Dismember, Rest in Peace, and Fog semantic equivalence within the supported subset.
- Blood Artist plus a dying token under Rest in Peace: the token is exiled, no dies event occurs, and no Blood Artist trigger is created.
- Indestructible survives destroy and lethal-damage state checks but does not prevent sacrifice, exile, or zero-toughness state-based actions.
- Sacrifice costs and sacrifice effects use the same event-first zone pipeline while retaining distinct cost metadata.
- Replacement ambiguity produces `DEPENDS` without partial mutation.

The Phase 5 verifier reports parsed, executable, and unsupported Oracle IR separately and blocks certification if any supported case produces an incorrect confident ruling.

## Phase 6: Continuous Effects and Layers

`continuousEffects.js` is the canonical owner for current object characteristics. Runtime objects retain immutable printed/base characteristics and separate copyable values. A derived query evaluates current name, controller, text, supertypes, types, subtypes, colors, abilities, power, toughness, loyalty, and copy state without destructively rewriting the printed card.

Structured continuous effects carry source, controller, layer, optional sublayer, timestamp, duration, dependency keys, applicability, and modification data. The executable layer order is copy, control, text, type, color, abilities, and power/toughness. Power/toughness evaluation applies CDA values, set values, modifiers, counters, and switching in sublayers 7a through 7e.

Supported durations include until end of turn, this turn, source-on-battlefield, as long as, for as long as, while, and indefinite effects. Cleanup removes turn effects through the game-step transition. Battlefield static effects stop when their source leaves; supported characteristic-defining abilities remain available in other zones.

Independent effects within one layer use timestamp order. Explicit read/write dependency keys topologically order basic dependent effects before timestamp fallback. A dependency cycle returns `UNVERIFIED` rather than guessing. Derived values are cached by runtime revision and invalidated by relevant object, zone, counter, attachment, and effect mutations.

Certified Phase 6 proofs include:

- An other-creatures anthem buffs two controlled creatures without buffing itself.
- Losing all abilities removes hexproof for targeting, then cleanup restores the printed ability.
- A land becomes a 3/3 creature while remaining a land, then reverts at cleanup.
- A copy uses copyable 2/2 values without copying a +1/+1 counter; later anthem effects apply to both objects.
- Independent same-layer effects obey timestamp order, while a same-layer dependency overrides timestamp.
- Equipment and Aura bonuses follow attachment state; an illegal Aura goes to the graveyard and Equipment detaches.
- Glorious Anthem, Giant Growth, Clone, Control Magic, Animate Land, Bonesplitter, Flight, Moonlace, and Maro match their generic layer primitives within the supported grammar.

## Phase 7: Executable Combat

`combatRuntime.js` owns explicit two-player combat state. It tracks the attacking and defending players, combat step, attackers and attack targets, blocker assignments, persistent blocked state, damage order, first-strike participation, damage assignments, damage-step count, priority windows, and unsupported restrictions.

The executable sequence is beginning of combat, declare attackers, declare blockers, optional first-strike combat damage, regular combat damage, and end of combat. Attack and block declarations emit normal events, run state-based actions, collect and stack triggers, and open priority. Combat cannot advance while the stack is nonempty.

Attacker legality uses derived controller, creature type, tapped state, summoning sickness, haste, defender, vigilance, and supported attack restrictions. Block legality uses derived controller/type, tapped state, flying, reach, menace, protection, and supported blocking restrictions. Unsupported restrictions fail closed.

Combat damage uses the existing `DamageProposed`/`DamageDealt` replacement and prevention pipeline. Creature damage is marked for the shared SBA engine; player damage changes life through the same event path. Deathtouch sets lethal-damage state, lifelink gains life as part of the damage result, protection prevents qualifying damage, and indestructible remains owned by the SBA engine.

Blocked state persists after blockers leave combat. A blocked attacker without trample assigns no damage to its attack target; a trampling attacker with no remaining blockers may assign through. Multiple blockers, blocker order, and trample splits require explicit assignments whenever the choice changes the result. Missing choices return `DEPENDS`.

Certified Phase 7 proofs include:

- basic 2/2 into 3/3 combat with simultaneous damage and SBA cleanup;
- first strike plus deathtouch killing a 6/6 before regular damage;
- unblocked double strike dealing damage in both combat damage steps;
- trample and deathtouch/trample lethal-assignment thresholds;
- flying, reach, menace, vigilance, haste, summoning sickness, and defender legality;
- lifelink, protection blocking and prevention, and indestructible versus deathtouch;
- removed blockers, multiple blockers, attack triggers, and priority-window pauses;
- Serra Angel, Typhoid Rats, Youthful Knight, Colossal Dreadmaw, Fencing Ace, and Healer's Hawk parity.

## Phase 8A: Canonical Turn Progression Skeleton

`turnStructure.js` defines the canonical `MagicTurnState`, thirteen turn steps, phase mapping, turn-based-action hooks, and per-step priority policy. `turnRuntime.js` is the sole progression owner. The former coarse stack-runtime step progression now delegates to it.

The turn owner orchestrates combat by calling the Phase 7 combat API for beginning combat, attacker and blocker declarations, conditional first-strike damage, regular damage, and end combat. It does not duplicate combat legality, assignment, triggers, priority windows, or state-based actions.

Phase 8A originally left untap, the normal draw, and cleanup as deferred turn-based-action hooks. Phase 8B implements those hooks in the same canonical turn owner without creating stack objects for them.

## Phase 8B: Turn-Based Actions and Cleanup

The active player's ordinary permanents untap before upkeep without a priority window. Unsupported untap restrictions, optional untaps, phasing, and stun-counter handling fail closed as `UNVERIFIED`. The draw-step action reuses the typed draw, replacement, event, and zone-change pipeline to move the known top library card before draw-step priority.

Cleanup uses each player's canonical `maximumHandSize` (default 7). Supplied discard choices execute through the typed discard pipeline; missing choices create a pending choice and return `DEPENDS` without advancing the turn. Cleanup removes marked damage without removing counters, expires Phase 6 `until-end-of-turn` effects, then runs existing SBA and trigger collection. If an SBA or trigger occurs, conditional priority opens and another cleanup iteration is required after the stack/priority interaction finishes. Active-player rotation occurs only after cleanup is stable.

Phase 8B does not certify exhaustive untap/replacement interactions or arbitrary cleanup-trigger resolution. Turn-based actions remain canonical runtime actions, never artificial stack objects; Phase 8C adds the supported general timing layer below.

## Phase 8C: Canonical Timing Permission

`stackRuntime.js` now owns one structured `checkTimingPermission` authority for casting and activated-ability timing. It returns stable reason codes together with the required timing mode and a snapshot of the current timing state. Complete supported state produces a proven allow or denial; missing public scenario facts return `DEPENDS`; unsupported card text returns `UNVERIFIED`.

Certified spell timing covers instants, sorceries, ordinary noninstant permanent spells, and standalone Flash. Sorcery timing requires the acting player to be active, in a precombat or postcombat main phase, with priority and an empty stack. Instant timing requires the acting player to hold priority in a real runtime priority window. Casting restrictions and flash-like permissions that cannot be represented safely fail closed.

Certified activated-ability timing covers ordinary activated abilities and explicit `Activate only as a sorcery` restrictions parsed into Oracle IR. Mana-ability timing remains with the existing cost/payment machinery and is not broadened here. After a spell is cast or an ability is activated, the acting player retains priority; after stack resolution, the active player receives priority through the existing stack owner.

Combat permissions consume the Phase 7 combat runtime's actual beginning-of-combat, post-attackers, post-blockers, and first-strike damage priority windows. They do not synthesize priority during declaration actions. Cleanup consumes the Phase 8B cleanup state: stable cleanup denies priority, while an SBA or trigger can open the existing exceptional cleanup priority window and require another cleanup iteration.

Phase 8C does not add land plays, special actions, multiplayer priority, arbitrary casting permissions/restrictions, exhaustive mana-ability timing, or UI behavior. Those boundaries remain fail-closed and this phase does not claim the larger turn/timing program complete.

## Deliberately Unsupported

X, hybrid, Phyrexian, alternate-cost, and unrestricted cost-reduction calculations remain unsupported. Multiplayer combat/priority and ambiguous multiplayer trigger ordering are not certified. Special actions, arbitrary replacement/prevention scopes, arbitrary text changes, copy exceptions, face-down/copy interactions, merges, complete dependency inference, unusual attack/block permissions, banding, planeswalker/battle attack targets, automatic spell continuation through combat windows, exhaustive untap restrictions and replacement interactions, Commander modifications, unrestricted search criteria, and variable or modal token instructions also remain uncertified. These return `UNVERIFIED`, or `DEPENDS` when a supported primitive only lacks required state or a required choice.

Land plays and the remaining special-action layer remain deferred beyond Phase 8C.
