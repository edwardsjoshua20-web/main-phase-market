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

The priority runtime records the priority holder and consecutive passes. An action resets the pass count. In two-player games, two passes resolve the top object when the stack is nonempty, or advance the step when it is empty. Phase 9D generalizes that same authority to every player still in an ordinary free-for-all game. After a resolution, the active player receives priority.

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

The owner choice that replaces a commander's move to hand or library with a move to the command zone is represented as an optional rules replacement. Applying or declining it is explicit; an omitted decision returns `DEPENDS`. Phase 9A adds the distinct post-move state-based choice for graveyard and exile without changing this replacement pipeline.

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

`combatRuntime.js` owns explicit combat state. It tracks the attacking player, each attacker's defender, combat step, attackers and attack targets, blocker assignments, persistent blocked state, damage order, first-strike participation, damage assignments, damage-step count, priority windows, and unsupported restrictions. Phase 9D generalizes the original two-player defender field while retaining it as a compatibility view.

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

## Phase 8D: Special Actions and Land Play

`specialActionRuntime.js` is the canonical special-action authority. It reuses Phase 8C's shared sorcery-style action-point check without treating land play as casting. Ordinary land play requires the active player, their priority, a precombat or postcombat main phase, an empty stack, an exact land in that player's hand, and remaining land-play allowance.

The canonical turn state stores numeric `allowed` and `used` land-play counts keyed to `turnId`. The default allowance is one, execution increments the used count, and the turn owner resets both counts when active-player identity rotates. A trusted runtime source may configure a larger numeric allowance; Oracle/static-effect derivation of additional-land permissions is not certified yet. If such text is detected while the default allowance is exhausted, the runtime returns `UNVERIFIED` rather than a false `NO`.

A legal land action moves the existing object from hand to battlefield through the canonical zone-change pipeline, emits `LandPlayed`, leaves the stack unchanged, retains the active player's action opportunity, and does not advance the phase. Plays from graveyard, library, exile, command, or another unusual zone remain `UNVERIFIED` without a modeled permission.

The framework recognizes unsupported face-up, morph/disguise, suspend, and foretell special-action requests and routes them to the special-action owner for `UNVERIFIED`. Phase 8D does not implement those mechanics, broad Commander behavior, or every Magic special action, and it does not claim Phase 8 complete.

## Phase 8 Certification

Phase 8 was certified as one integrated runtime after 8A through 8D, rather than as four isolated feature slices. The dedicated certification harness covers full ordinary turn progression, turn-based actions, two-player priority, stack resolution, combat timing, first-strike interaction, cleanup repetition, ordinary land play, activated-ability timing, Ward, replacement effects, state-based actions, and the public `magic-rules-runtime-v2` evaluator.

The certified supported surface includes:

- complete ordinary turn rotation, including empty combat and the conditional first-strike damage step;
- instant, sorcery, noninstant permanent, standalone Flash, and ordinary or explicit sorcery-speed activated-ability timing;
- stack response and resolution cycles without advancing the turn early;
- first-strike damage, SBAs, priority, stack interaction, then regular damage after a new pass cycle;
- ordinary draw, maximum-hand-size cleanup, damage clearing, end-of-turn expiry, cleanup exceptions, and stable turn rotation;
- ordinary hand-to-battlefield land play, allowance exhaustion/reset, trusted numeric additional allowance, and stack interaction;
- pending cleanup-discard, replacement, combat-assignment, and Ward-payment choices that block unrelated actions and progression until resolved;
- Ward in main-phase and combat priority windows, using the existing stack and cost owners;
- public natural-language routing for representative timing, land-play, cleanup, and unsupported-special-action questions.

Certification fixed four cross-system defects in canonical owners: replacement and combat assignment choices now register with the shared pending-choice state; unspecified Ward payment now becomes a blocking stack-owned pending choice and does not manufacture priority while resolution is paused; successful combat-window timing answers now retain their `TimingPermissionChecked` provenance trace; and public `in response to` questions preserve both card identities through shared card-name extraction. The certification harness is deterministic and contains 1,648 exhaustive or seeded compositional cases. Its final result is 1,741 verified supported assertions, 17 expected `DEPENDS`, 3 expected `UNVERIFIED`, and 0 incorrect confident rulings.

Expected `DEPENDS` boundaries include omitted choices for cleanup discard, competing or optional replacements, combat damage assignment, and Ward payment, plus public questions missing required turn, phase, stack, priority, or land-allowance facts. Expected `UNVERIFIED` boundaries include dynamic flash-like permissions, mana-ability timing outside the cost owner, unsupported cleanup/untap modifiers, unusual-zone or Oracle-derived extra-land permissions, and special actions other than ordinary land play.

This certification is not a claim of full Magic rules support. The unsupported areas below remain fail-closed. Phase 9A builds on this certified surface without changing its ordinary-Magic guarantees.

## Phase 9A: Commander Identity and Command Zone

`commanderRuntime.js` is a format adapter over the canonical Magic runtime. `state.format.id` gates Commander behavior, while `state.format.commander.designations` stores stable designation IDs, owner IDs, canonical card identity, current runtime object ID, command-zone membership, command-zone cast count, and movement history. Designation is attached explicitly to the designated object and is never inferred from card name, so another copy of the same card is not automatically a commander. The designation collection supports a two-player setup and does not hardcode exactly one commander.

The command zone is the existing canonical `command` zone, mirrored by each owner's `commandZone` index. A starting commander is registered there through ordinary state initialization, and all later movement uses `moveObjectWithResult`; no Commander-only object store or direct zone mutation was added.

Commander return handling follows the two current CR 903.9 timing models:

- A move to hand or library offers the commander owner an optional replacement before the move. Accepting changes the destination to the command zone; declining commits the original destination; omission creates a centralized `ReplacementChoice` and returns `DEPENDS` without moving the object.
- A move to graveyard or exile commits first, including normal death/zone events, then offers the owner a `CommanderZoneReturnChoice` with `state-based-action` timing. Accepting performs a second canonical move to the command zone; declining leaves the commander where it is; omission leaves the first move committed, registers a centralized blocking pending choice, and returns `DEPENDS`.

Choice ownership comes from the commander designation owner, not the object's current controller. Pending Commander choices block priority, stack resolution, timing actions, and turn progression through the Phase 8 shared pending-choice authority.

A designated commander owned by the acting player may be cast from the command zone at normal supported timing. Casting moves that existing object through the canonical zone pipeline, creates the ordinary `Spell` stack object, and uses ordinary permanent-spell resolution to enter the battlefield. Arbitrary command-zone objects receive no casting permission. Phase 9B extends that same cast transaction with canonical commander-tax calculation.

Phase 9A explicitly defers commander damage, broad multiplayer Commander, color-identity and singleton/deck-construction validation, partner/background/Doctor's companion and other multi-commander mechanics, and broad command-zone abilities. This phase is a foundation, not a claim of full Commander support.

## Phase 9B: Canonical Commander Tax

Commander tax follows CR 903.8: casting a designated commander from the command zone costs an additional `{2}` for each previous time its owner cast that specific designation from the command zone during the game. `state.format.commander.designations[].castsFromCommandZone` remains the sole history owner. It is a nonnegative numeric count keyed by stable designation ID, so zone changes and replacement object identities do not reset it, same-name nondesignated copies do not inherit it, and separate designations can retain independent histories.

`castSpell` obtains the tax from `commanderTaxForCast`, represents a nonzero tax as an `AdditionalCost` containing a generic `ManaCost`, and pays it through the Phase 4 cost owner alongside the printed starting mana requirement and other supported additional costs. The structured `commanderCost` result exposes designation ID, previous command-zone casts, generic tax amount, starting mana requirement, other additional costs, final mana requirement, availability proof, and support status. Printed mana cost is never mutated.

The count increments only after targets and supported costs are accepted and the spell is successfully put on the stack and emitted as cast. It therefore increments before resolution and remains incremented if the spell is later countered. Illegal targets, insufficient or declined payment, pending choices, unsupported modifiers, and failed casting permission leave the count unchanged. Returning a commander to the command zone does not itself increment or reset history.

Tax is imposed only for a cast from the command zone. Casting the designated card from hand has no commander tax and does not increment command-zone history. The tax owner likewise calculates zero for another source zone, but unusual-zone casting permission remains `UNVERIFIED` unless a separate supported effect establishes that permission.

The current cost owner certifies fixed printed mana, fixed generic commander tax, fixed supported additional costs, and exact/insufficient generic mana budgets. It does not yet certify unrestricted generic reductions, dynamic cost modifiers, or alternative costs; those interactions return `UNVERIFIED` before movement or history mutation. This limitation is explicit and does not make commander tax a separate post-payment surcharge.

## Phase 9C: Canonical Commander Combat Damage

Commander damage is stored in the existing player state as `state.players[recipientId].commanderDamage[designationId]`. `commanderRuntime.js` owns all reads and writes, and the key is the Phase 9A stable commander designation rather than card name, controller, owner, card definition, or one transient object ID. This creates a recipient-by-designation matrix: damage dealt to different players remains separate, and combat damage from different commanders never combines toward the threshold.

The canonical damage pipeline performs Commander accounting only after replacement and prevention processing commits actual damage to a player. The committed `Damage` event must carry `metadata.combat === true`, its source must resolve to a designated commander, and its post-prevention amount must be greater than zero. Noncombat damage, life loss, damage to permanents, fully prevented damage, and combat damage from same-name nondesignated copies therefore add nothing. Supported amount-changing replacements contribute their final amount; unsupported replacement semantics remain `UNVERIFIED`.

Trample and double strike require no Commander-specific assignment rules. The Phase 7/8 combat owner supplies only the actual player assignment to the shared damage pipeline, so blocker damage is excluded and both completed double-strike damage steps accumulate naturally. If assignment is pending or a commander leaves before a later damage step, no uncommitted damage is recorded. Lifelink and later life gain change life totals but never reduce Commander-damage history.

After committed damage is recorded, the ordinary state-based-action owner checks each recipient/designation total. A player with 21 or more combat damage from one designation loses through the existing `PlayerLost` event with Commander-damage provenance. The loss is not a trigger, replacement, or mid-assignment shortcut. Totals persist across turns, zone changes, object recreation within the designation lineage, recasting, countering, and control changes; a stolen commander still deals damage under its original stable designation.

The public scenario compiler represents explicit prior totals, recipient, same-versus-different designations, incoming combat or noncombat damage, prevention, life gain, and an explicit control change. Ambiguous history or designation identity returns `DEPENDS`. Unsupported replacement and copy/face-down identity edges return `UNVERIFIED`. Structured results expose designation ID, commander display identity, recipient, prior total, actual counted damage, new total, threshold, SBA loss, and support status.

## Phase 9D: Free-for-All Multiplayer Commander

`multiplayerRuntime.js` is the shared ordering authority for ordinary three-to-five-player free-for-all games. The canonical game state carries an explicit stable `turnOrder`, the players still in game, active player, next eligible player, and ordered `nonactivePlayers`. The legacy singular `nonactivePlayer` remains a compatibility view of the first ordered nonactive player in two-player and existing consumers; map/object iteration never determines turn or priority order.

Turn rotation and priority consume the same ordered in-game sequence. Turns skip players who have left. Priority passes to the next eligible player, and a stack object resolves or an empty step advances only after every player still in the game passes in succession without an intervening action. Any action resets the pass count. After resolution and the existing SBA/trigger checkpoints, priority returns to the active player; if the active player has left, a retained turn-order anchor keeps the rest of that turn structurally valid and priority moves to the next eligible player.

APNAP ordering is exposed canonically as active player followed by nonactive players in turn order. Simultaneous multiplayer choices are gathered in that sequence but committed once, after every required choice is known. Simultaneous triggers are put on the stack by controller in APNAP order, so later nonactive-player groups are above earlier groups. A material, unspecified order among one player's own simultaneous triggers creates a `TriggerOrderChoice` and returns `DEPENDS` rather than selecting an arbitrary order.

Combat retains one attacking player but stores `attackTarget` per attacker. Different creatures may attack different opponents in the same combat. Block legality derives the defending player from the attacked relationship, preventing one opponent from blocking for another in ordinary free-for-all. Damage continues through the canonical event pipeline, preserving independent life totals and the Phase 9C recipient-by-designation Commander-damage matrix.

Player loss invokes a distinct leaves-game operation rather than exile, destruction, or another zone change. Owned objects in represented zones leave the game, stack objects and pending triggers controlled by the leaving player cease, future turns and priority skip that player, and supported control effects are removed so a foreign object reverts to its proven base controller. Unknown control history returns `UNVERIFIED`. Multiple losses discovered by one SBA check are collected before leaves-game cleanup, preventing iteration-order winner artifacts. One remaining player produces the canonical last-player-standing result; zero remaining players are recorded as an unverified game result rather than assigning an invented winner.

Supported typed effects enumerate every in-game opponent for “each opponent” and every in-game player for “each player.” An unnamed “target opponent” among multiple legal opponents returns `DEPENDS`. Phase 9B commander-tax history remains designation-owned and unchanged; Phase 9C Commander damage remains independently keyed by recipient and designation when another player leaves.

The Phase 9D verifier covers turn rotation, player removal, N-player priority, APNAP choices and triggers, Ward and response stacks, multiple defenders, blocking ownership, independent combat damage, each-opponent and each-player effects, target ambiguity, leaves-game object/control cleanup, active-player departure, last-player results, simultaneous losses, public natural-language routing, and a deterministic three-to-five-player composition matrix.

## Phase 9 Certification: Integrated Commander Runtime

Phase 9 is certified as one combined Commander runtime across the accepted 9A through 9D owners. The final harness tests collisions among designation identity, command-zone movement, tax history, Commander damage, owner/controller separation, N-player turn and priority order, APNAP trigger placement, multi-defender combat, first-strike priority, Ward, replacement processing, pending choices, state-based losses, and player departure. It contains 3,837 assertions, 864 deterministic three-to-five-player compositions, 14 public natural-language cases, 3,819 verified supported results, 15 expected `DEPENDS`, 2 expected `UNVERIFIED`, and 0 incorrect confident rulings.

Command-zone certification follows one designation through cast, resolution, death, owner return choice, taxed recast, countering, another return choice, and a third cast. Designation and `castsFromCommandZone` remain stable; successful casts increment at the stack boundary; countered casts remain counted; return movement and ordinary zone changes do not increment or reset history. Commander tax and Commander damage consume the same designation ID but retain independent state. Same-name nondesignated copies inherit neither history.

Commander-damage certification proves recipient-by-designation accounting across multiple opponents and turns, including a stolen commander, first-strike/double-strike combat, trample, player loss at 21, controller departure, and continued play for survivors. Damage to different recipients never combines. State-based loss occurs after committed damage, and player-leaving cleanup does not erase historical totals.

Multiplayer certification proves explicit stable turn order for three through five players, full N-player pass cycles, pass-count reset after an action, APNAP choices and trigger groups, material same-controller trigger-order choices, independent attack targets and blockers, simultaneous losses, active-player departure anchors, and repeated player removals without stale IDs. First-strike damage runs SBAs and opens priority; regular damage waits for the complete surviving-player pass cycle and any material combat-assignment choice.

Pending-choice certification covers Commander return, replacement, Ward payment, trigger order, simultaneous player choice, combat assignment, and inherited Phase 8 cleanup gates. Unresolved choices block spell casting, ability activation, land play, direct priority actions, passing priority, turn progression, and forced stack resolution. Certification fixed the low-level `takePriorityAction` and `castSpell(..., skipTiming: true)` paths so they cannot bypass the centralized pending-choice owner while preserving the established `PENDING_CHOICE` timing result contract.

Public routing fixes distinguish Commander-return obligation questions from affirmative choices, prove generic countered-cast tax questions with a canonical cast/counter transaction, resolve named-recipient and pronoun Commander-damage language, keep separate recipients separate, preserve both named defenders in multiplayer attack questions, and answer post-cast priority from an actual command-zone cast. Ambiguous target-opponent language and unspecified material trigger/choice ordering remain `DEPENDS` rather than selecting the first player.

The residual two-player audit found valid compatibility aliases (`nonactivePlayer` as the first member of canonical `nonactivePlayers`), two-player-only legacy scenario/compiler paths outside multiplayer routing, and the old combat `defendingPlayer` compatibility view beside per-attacker `attackTarget`. Canonical Commander multiplayer behavior uses `turnOrder`, `playersStillInGame`, `nonactivePlayers`, APNAP ordering, and per-attacker defenders. No mechanical replacement of valid aliases was made.

Expected `DEPENDS` boundaries include unidentified target opponents, missing material within-controller trigger order, unresolved simultaneous choices, Commander return/replacement decisions, Ward payment, and combat damage assignment. Expected `UNVERIFIED` boundaries include team multiplayer variants and foreign-object control reversion without provable provenance. Multiple applicable unsupported replacements, unusual-zone casting permission, broad cost reduction/alternative-cost mechanics, and unmodeled active-player-leaving stack or trigger edges also remain fail-closed.

Certification repairs were limited to canonical runtime/compiler/evaluator owners and this dedicated verifier. Phase 8 reports 1,741 supported, 17 `DEPENDS`, 3 `UNVERIFIED`, 1,648 compositions, and 0 incorrect confident. Phase 9A, 9B, 9C, and 9D retain their accepted results with 0 incorrect confident. Phase 10 was not started.

## Deliberately Unsupported

X, hybrid, Phyrexian, alternate-cost, and unrestricted cost-reduction calculations remain unsupported. Team multiplayer variants, Two-Headed Giant, Emperor, Grand Melee, Archenemy, shared-team turns, Limited Range of Influence, multiplayer deck construction/color identity, multi-commander mechanics, and control-reversion histories without a provable base controller are not certified. Special actions beyond ordinary land play, arbitrary replacement/prevention scopes, arbitrary text changes, copy exceptions, face-down/copy interactions, merges, complete dependency inference, unusual attack/block permissions, banding, planeswalker/battle attack targets, automatic spell continuation through combat windows, exhaustive untap restrictions and replacement interactions, Commander rules beyond the Phase 9D free-for-all identity/zone/tax/damage/turn/priority foundation, unrestricted search criteria, and variable or modal token instructions also remain uncertified. These return `UNVERIFIED`, or `DEPENDS` when a supported primitive only lacks required state or a required choice.

Additional-land effect derivation and the remaining special-action layer remain deferred beyond Phase 8D.
