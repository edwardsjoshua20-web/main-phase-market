const RULE_TITLE_BY_MECHANIC = Object.freeze({
  targeting: 'Targets',
  protection: 'Protection',
  resolving: 'Resolving Spells and Abilities',
  stack: 'Stack',
  timing: 'Timing Permissions',
  priority: 'Priority',
  destroy: 'State-Based Actions',
  damage: 'Combat Damage',
  'state-based-actions': 'State-Based Actions',
  triggers: 'Triggered Abilities',
  'replacement-effects': 'Replacement Effects',
  commander: 'Commander',
  legality: 'Commander'
});

function syntheticRuleFor(title) {
  return {
    slug: `instajudge-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
    title,
    path: null,
    synthetic: true
  };
}

export function selectRelevantRules(mechanics = [], rules = []) {
  const wantedByKey = new Map();
  for (const mechanic of mechanics) {
    const title = RULE_TITLE_BY_MECHANIC[mechanic] || mechanic;
    const key = String(title).toLowerCase();
    if (!wantedByKey.has(key)) wantedByKey.set(key, title);
  }
  const wanted = new Set(wantedByKey.keys());
  const selected = rules.filter((rule) => wanted.has(String(rule.title || '').toLowerCase()));
  const selectedTitles = new Set(selected.map((rule) => String(rule.title || '').toLowerCase()));
  const supplemental = [...wanted]
    .filter((title) => title && !selectedTitles.has(title))
    .map((title) => syntheticRuleFor(wantedByKey.get(title)));
  const resolved = [...selected, ...supplemental];
  return resolved.length ? resolved.slice(0, 6) : rules.slice(0, 3);
}

export function formatMagicRuling(result) {
  const lines = [result.verdict.toUpperCase(), '', result.summary].filter(Boolean);
  if (result.sequence?.length) {
    lines.push('', ...result.sequence.map((step) => typeof step === 'string' ? step : step.result).filter(Boolean));
  }
  if (result.clarificationNeeded) {
    lines.push('', result.clarificationNeeded);
  }
  return lines.join('\n');
}

export function publicMechanicList(mechanics = []) {
  return [...new Set(mechanics)].map((mechanic) => mechanic.replace(/-/g, ' '));
}
