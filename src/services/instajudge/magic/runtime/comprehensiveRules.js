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
  timing: [
    { ruleId: 'CR-117', section: '117', title: 'Timing and Priority', enginePrimitive: 'timing', canonicalMeaning: 'Priority and timing permissions determine when players can take game actions.', keywords: ['priority', 'timing'], effectiveDate: '2026-09-16', sourceVersion: MAGIC_CR_VERSION }
  ],
  casting: [
    { ruleId: 'CR-601', section: '601', title: 'Casting Spells', enginePrimitive: 'casting', canonicalMeaning: 'Casting announces a spell, chooses modes and targets, determines and pays costs, then completes the cast.', keywords: ['cast', 'cost', 'target'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
  ],
  costs: [
    { ruleId: 'CR-118', section: '118', title: 'Costs', enginePrimitive: 'costs', canonicalMeaning: 'A cost must be paid in full; unsupported or unspecified payments cannot be assumed.', keywords: ['cost', 'pay'], effectiveDate: '2026-09-17', sourceVersion: MAGIC_CR_VERSION }
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
