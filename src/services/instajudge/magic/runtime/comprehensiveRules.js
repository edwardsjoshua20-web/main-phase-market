export const MAGIC_CR_VERSION = 'structured-cr-primitives-2026-09';

const RULES_BY_PRIMITIVE = Object.freeze({
  targeting: [
    { ruleId: 'CR-115', section: '115', title: 'Targets', enginePrimitive: 'targeting', canonicalMeaning: 'Targets are chosen for spells and abilities and checked again on resolution.', keywords: ['target', 'legal target'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  protection: [
    { ruleId: 'CR-702.16', section: '702.16', title: 'Protection', enginePrimitive: 'protection', canonicalMeaning: 'Protection restricts damage, enchanting/equipping, blocking, and targeting from matching qualities.', keywords: ['protection'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  stack: [
    { ruleId: 'CR-405', section: '405', title: 'Stack', enginePrimitive: 'stack', canonicalMeaning: 'Spells and abilities use the stack and resolve last-in, first-out.', keywords: ['stack', 'resolve'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  resolving: [
    { ruleId: 'CR-608', section: '608', title: 'Resolving Spells and Abilities', enginePrimitive: 'resolving', canonicalMeaning: 'Resolving spells and abilities follow instructions and re-check target legality.', keywords: ['resolve', 'legal target'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  damage: [
    { ruleId: 'CR-120', section: '120', title: 'Damage', enginePrimitive: 'damage', canonicalMeaning: 'Damage to creatures is marked and later evaluated by state-based actions.', keywords: ['damage'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  combat: [
    { ruleId: 'CR-506', section: '506', title: 'Combat Phase', enginePrimitive: 'combat', canonicalMeaning: 'Combat proceeds through beginning, attacker declaration, blocker declaration, combat damage, and end steps with priority between turn-based actions.', keywords: ['combat', 'combat phase'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  attackers: [
    { ruleId: 'CR-508', section: '508', title: 'Declare Attackers Step', enginePrimitive: 'attackers', canonicalMeaning: 'Attackers are declared simultaneously, must satisfy attack restrictions, and tap unless an effect such as vigilance says otherwise.', keywords: ['attack', 'attacker', 'vigilance'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  blockers: [
    { ruleId: 'CR-509', section: '509', title: 'Declare Blockers Step', enginePrimitive: 'blockers', canonicalMeaning: 'Blocks are declared simultaneously and must satisfy evasion, protection, menace, and other blocking restrictions.', keywords: ['block', 'blocker', 'flying', 'reach', 'menace'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  trample: [
    { ruleId: 'CR-702.19', section: '702.19', title: 'Trample', enginePrimitive: 'trample', canonicalMeaning: 'A trampling attacker may assign excess combat damage to its attack target only after assigning lethal damage to its blockers.', keywords: ['trample', 'excess damage'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  'first-double-strike': [
    { ruleId: 'CR-702.4-702.7', section: '702.4, 702.7', title: 'Double Strike and First Strike', enginePrimitive: 'first-double-strike', canonicalMeaning: 'First strike and double strike can create an additional combat damage step, with double strike participating in both steps if still eligible.', keywords: ['first strike', 'double strike'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  'state-based-actions': [
    { ruleId: 'CR-704', section: '704', title: 'State-Based Actions', enginePrimitive: 'state-based-actions', canonicalMeaning: 'State-based actions clean up lethal damage, zero toughness, life totals, illegal attachments, and related game states.', keywords: ['sba', 'lethal damage', 'dies'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  triggers: [
    { ruleId: 'CR-603', section: '603', title: 'Triggered Abilities', enginePrimitive: 'triggers', canonicalMeaning: 'Triggered abilities watch for events and create triggered objects for each matching event.', keywords: ['when', 'whenever', 'trigger'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  lki: [
    { ruleId: 'CR-113.7a', section: '113.7a', title: 'Last Known Information', enginePrimitive: 'lki', canonicalMeaning: 'Leaves-the-battlefield abilities can use the object state immediately before it left.', keywords: ['last known information', 'dies'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  replacement: [
    { ruleId: 'CR-614', section: '614', title: 'Replacement Effects', enginePrimitive: 'replacement-effects', canonicalMeaning: 'Replacement effects modify events before they occur; choices are required where applicable.', keywords: ['instead', 'would'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  continuous: [
    { ruleId: 'CR-613', section: '613', title: 'Continuous Effects', enginePrimitive: 'continuous-effects', canonicalMeaning: 'Continuous effects are applied through the layer system.', keywords: ['layers', 'continuous effect'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  layers: [
    { ruleId: 'CR-613.1', section: '613.1', title: 'Interaction of Continuous Effects', enginePrimitive: 'layers', canonicalMeaning: 'Continuous effects apply in copy, control, text, type, color, ability, and power/toughness layer order.', keywords: ['layer', 'continuous effect'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  timestamps: [
    { ruleId: 'CR-613.7', section: '613.7', title: 'Timestamp Order', enginePrimitive: 'timestamps', canonicalMeaning: 'Independent effects in the same layer or sublayer normally apply in timestamp order.', keywords: ['timestamp'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  dependencies: [
    { ruleId: 'CR-613.8', section: '613.8', title: 'Dependency Order', enginePrimitive: 'dependencies', canonicalMeaning: 'A dependent effect applies after the effect on which it depends, before timestamp fallback.', keywords: ['dependency', 'depends on'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  cda: [
    { ruleId: 'CR-604.3', section: '604.3', title: 'Characteristic-Defining Abilities', enginePrimitive: 'characteristic-defining-abilities', canonicalMeaning: 'Characteristic-defining abilities function in applicable zones and apply in their designated layers or sublayers.', keywords: ['characteristic-defining ability', 'cda'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  copy: [
    { ruleId: 'CR-707', section: '707', title: 'Copying Objects', enginePrimitive: 'copy-effects', canonicalMeaning: 'Copy effects use copyable values rather than counters or later continuous modifications.', keywords: ['copy', 'copyable values'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  control: [
    { ruleId: 'CR-611.2', section: '611.2', title: 'Continuous Effects from Resolving Spells and Abilities', enginePrimitive: 'control-effects', canonicalMeaning: 'Control-changing continuous effects alter controller without changing ownership and obey their duration and timestamp.', keywords: ['gain control', 'controller'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  attachments: [
    { ruleId: 'CR-301.5', section: '301.5', title: 'Equipment', enginePrimitive: 'attachments', canonicalMeaning: 'Equipment and Aura continuous effects follow their attachment state; illegal attachments are handled by state-based actions.', keywords: ['attach', 'equip', 'enchant'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  timing: [
    { ruleId: 'CR-117', section: '117', title: 'Timing and Priority', enginePrimitive: 'timing', canonicalMeaning: 'Priority and timing permissions determine when players can take game actions.', keywords: ['priority', 'timing'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  casting: [
    { ruleId: 'CR-601', section: '601', title: 'Casting Spells', enginePrimitive: 'casting', canonicalMeaning: 'Casting announces a spell, chooses modes and targets, determines and pays costs, then completes the cast.', keywords: ['cast', 'cost', 'target'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  costs: [
    { ruleId: 'CR-118', section: '118', title: 'Costs', enginePrimitive: 'costs', canonicalMeaning: 'A cost must be paid in full; unsupported or unspecified payments cannot be assumed.', keywords: ['cost', 'pay'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  effects: [
    { ruleId: 'CR-609', section: '609', title: 'Effects', enginePrimitive: 'effects', canonicalMeaning: 'One-shot effects change game state as instructed and create the corresponding game events.', keywords: ['effect', 'resolve'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  zones: [
    { ruleId: 'CR-400', section: '400', title: 'Zones', enginePrimitive: 'zones', canonicalMeaning: 'Objects move between zones as discrete game events and become new objects where the rules specify.', keywords: ['zone', 'hand', 'graveyard', 'exile', 'library'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  prevention: [
    { ruleId: 'CR-615', section: '615', title: 'Prevention Effects', enginePrimitive: 'prevention', canonicalMeaning: 'Prevention effects modify damage events before damage is dealt.', keywords: ['prevent', 'damage'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  ward: [
    { ruleId: 'CR-702.21', section: '702.21', title: 'Ward', enginePrimitive: 'ward', canonicalMeaning: 'Ward triggers when an opponent-controlled spell or ability targets the permanent and counters that stack object unless the ward cost is paid.', keywords: ['ward'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  commander: [
    { ruleId: 'CR-903', section: '903', title: 'Commander', enginePrimitive: 'commander', canonicalMeaning: 'Commander modifies deck construction, the command zone, commander tax, and commander damage.', keywords: ['commander', 'command zone'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ]
});

export function rulesForPrimitives(primitives = []) {
  const seen = new Set();
  const selected = [];
  for (const primitive of primitives) {
    for (const rule of RULES_BY_PRIMITIVE[primitive] || []) {
      if (seen.has(rule.ruleId)) continue;
      seen.add(rule.ruleId);
      selected.push({
        ...rule,
        slug: `cr-${rule.ruleId.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        path: null,
        synthetic: true
      });
    }
  }
  return selected;
}
