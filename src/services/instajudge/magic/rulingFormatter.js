const RULE_TITLE_BY_MECHANIC = Object.freeze({
  targeting: 'Targets',
  protection: 'Protection',
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

export function selectRelevantRules(mechanics = [], rules = []) {
  const wanted = new Set(
    mechanics
      .map((mechanic) => RULE_TITLE_BY_MECHANIC[mechanic] || mechanic)
      .map((title) => String(title).toLowerCase())
  );
  const selected = rules.filter((rule) => wanted.has(String(rule.title || '').toLowerCase()));
  return selected.length ? selected.slice(0, 4) : rules.slice(0, 3);
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
