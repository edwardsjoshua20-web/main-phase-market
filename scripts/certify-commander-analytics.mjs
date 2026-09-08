import fs from 'node:fs';
import path from 'node:path';
import { db } from '../server/db.mjs';
import {
  getMtgCommanderPage,
  getMtgCommanderPublicSnapshot,
  refreshMtgCommanderEngine
} from '../server/mtgCommanderEngine.mjs';
import {
  COMMANDER_ANALYTICS_VERSION,
  COMMANDER_PRESENTABLE_THEME_SLUGS,
  COMMANDER_SAMPLE_THRESHOLDS,
  getCommanderSampleConfidence
} from '../server/mtgCommanderAnalyticsPolicy.mjs';

process.env.MPM_DISABLE_COMMANDER_PREWARM = '1';

const ACTIVE_SQL = `decks.quality_status = 'valid' AND decks.lifecycle_status = 'active'`;
const CHEMISTRY_SQL = `${ACTIVE_SQL} AND decks.chemistry_weight > 0`;
const EPSILON = 1e-10;
const REPORT_DIR = path.join(process.cwd(), 'tmp', 'commander-analytics-certification');
const REQUIRED_NAMES = [
  'Bruvac the Grandiloquent',
  'Krenko, Mob Boss',
  'Meren of Clan Nel Toth',
  'Edgar Markov',
  "Atraxa, Praetors' Voice"
];
const THEME_DEFINITIONS = [
  { slug: 'mill', label: 'Mill', priority: 100, quality: 'trustworthy', rule: '8+ mill/graveyard-placement signals' },
  { slug: 'petitioners', label: 'Persistent Petitioners', priority: 98, quality: 'trustworthy', rule: '12+ Persistent Petitioners' },
  { slug: 'reanimator', label: 'Reanimator', priority: 96, quality: 'trustworthy', rule: '5+ graveyard-to-battlefield signals' },
  { slug: 'aristocrats', label: 'Aristocrats', priority: 94, quality: 'trustworthy', rule: '6+ sacrifice/death signals' },
  { slug: 'enchantress', label: 'Enchantress', priority: 92, quality: 'trustworthy', rule: '14+ enchantments or 4+ enchantress signals' },
  { slug: 'control', label: 'Control', priority: 90, quality: 'weak', rule: '8+ broad denial/sweeper/counter signals' },
  { slug: 'combo', label: 'Combo', priority: 88, quality: 'weak', rule: '5+ cast/draw-loop/named combo signals' },
  { slug: 'lands', label: 'Lands', priority: 82, quality: 'trustworthy', rule: '40+ lands or 8+ lands-matter signals' },
  { slug: 'artifacts', label: 'Artifacts', priority: 80, quality: 'weak', rule: '18+ artifacts or 8+ artifact-text signals' },
  { slug: 'tokens', label: 'Tokens', priority: 78, quality: 'trustworthy', rule: '8+ token-creation signals' },
  { slug: 'counters', label: '+1/+1 Counters', priority: 76, quality: 'trustworthy', rule: '6+ counter/proliferate signals' },
  { slug: 'spellslinger', label: 'Spellslinger', priority: 70, quality: 'weak', rule: '24+ instants/sorceries' },
  { slug: 'storm', label: 'Storm', priority: 66, quality: 'weak', rule: '3+ storm/copy/cast triggers, or 28+ spells and 1+ trigger' },
  { slug: 'burn', label: 'Burn', priority: 64, quality: 'weak', rule: '6+ direct-damage signals' }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function nearlyEqual(actual, expected, label) {
  assert(Math.abs(Number(actual) - Number(expected)) <= EPSILON, `${label}: expected ${expected}, received ${actual}`);
}

function normalizeText(value) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

function parseColors(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function colorMask(colors) {
  const bits = { W: 1, U: 2, B: 4, R: 8, G: 16 };
  return [...new Set(colors)].reduce((mask, color) => mask | (bits[color] || 0), 0);
}

function classifyType(typeLine) {
  const type = String(typeLine || '').toLowerCase();
  if (type.includes('land')) return 'Land';
  if (type.includes('creature')) return 'Creature';
  if (type.includes('artifact')) return 'Artifact';
  if (type.includes('enchantment')) return 'Enchantment';
  if (type.includes('instant')) return 'Instant';
  if (type.includes('sorcery')) return 'Sorcery';
  if (type.includes('planeswalker')) return 'Planeswalker';
  if (type.includes('battle')) return 'Battle';
  return 'Other';
}

function manaValue(card) {
  if (card?.cmc !== null && card?.cmc !== undefined && card?.cmc !== '' && Number.isFinite(Number(card.cmc))) {
    return Number(card.cmc);
  }
  const symbols = String(card?.mana_cost || '').match(/\{([^}]+)\}/g) || [];
  if (symbols.length === 0) return null;
  return symbols.reduce((total, symbol) => {
    const token = symbol.replace(/[{}]/g, '').toUpperCase();
    if (/^\d+$/.test(token)) return total + Number(token);
    if (['X', 'Y', 'Z'].includes(token)) return total;
    return total + 1;
  }, 0);
}

function categorizeCard(typeLine, oracleText) {
  const type = String(typeLine || '').toLowerCase();
  const text = String(oracleText || '').toLowerCase();
  if (type.includes('land')) {
    return ['enters the battlefield tapped', 'sacrifice', 'search your library', 'return target', 'surveil', 'draw', 'create ', 'each opponent', 'whenever ']
      .some((signal) => text.includes(signal)) ? 'utility lands' : 'lands';
  }
  if (type.includes('creature')) return 'creatures';
  if (type.includes('instant')) return 'instants';
  if (type.includes('sorcery')) return 'sorceries';
  if (type.includes('planeswalker')) return 'planeswalkers';
  if (type.includes('enchantment')) return 'enchantments';
  if (type.includes('artifact')) {
    if (/\{t\}\s*:\s*add\b/.test(text) || text.includes('add one mana') || text.includes('add two mana')) return 'mana artifacts';
    if (['draw', 'search your library', 'destroy target', 'exile target', 'sacrifice', 'whenever ', 'at the beginning', 'create ', 'return target'].some((signal) => text.includes(signal))) return 'utility artifacts';
    return 'artifacts';
  }
  return 'other';
}

function isBasicLand(name, typeLine) {
  const normalized = normalizeText(name);
  return String(typeLine || '').toLowerCase().includes('basic land') || [
    'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
    'snow covered plains', 'snow covered island', 'snow covered swamp', 'snow covered mountain', 'snow covered forest'
  ].includes(normalized);
}

function includesAny(text, values) {
  return values.some((value) => text.includes(value));
}

function inferThemes(cards, includeLegacyTutorSignal = false) {
  const sum = (predicate) => cards.reduce((total, card) => total + (predicate(card) ? card.quantity : 0), 0);
  const totalCards = sum(() => true);
  const spells = sum((card) => card.type.includes('instant') || card.type.includes('sorcery'));
  const artifacts = sum((card) => card.type.includes('artifact'));
  const enchantments = sum((card) => card.type.includes('enchantment'));
  const lands = sum((card) => card.type.includes('land'));
  const burn = sum((card) => includesAny(card.text, ['deals 1 damage', 'deals 2 damage', 'deals 3 damage', 'damage to each opponent', 'damage to any target']));
  const storm = sum((card) => includesAny(card.text, ['storm', 'copy target instant or sorcery spell', 'copy that spell', 'whenever you cast an instant or sorcery spell']));
  const combo = sum((card) => (includeLegacyTutorSignal && card.text.includes('search your library')) || includesAny(card.text, ['you may cast', 'draw a card whenever']) || includesAny(card.name, ['curiosity', 'ophidian eye', 'underworld breach']));
  const mill = sum((card) => includesAny(card.text, ['mill ', 'mills ', 'their graveyard', 'into their graveyard']) || includesAny(card.name, ['mindcrank', 'fraying sanity', 'mesmeric orb', 'maddening cacophony']));
  const petitioners = sum((card) => normalizeText(card.name) === 'persistent petitioners');
  const control = sum((card) => includesAny(card.text, ['counter target', 'return target spell', 'destroy all creatures', 'exile all', 'tap all creatures', "can't attack", "can't cast"]) || card.name.includes('cyclonic rift'));
  const tokens = sum((card) => card.text.includes('create ') && card.text.includes(' token'));
  const landsMatter = sum((card) => includesAny(card.text, ['landfall', 'play an additional land', 'search your library for a land']) || includesAny(card.name, ['scapeshift', 'crucible of worlds']));
  const reanimator = sum((card) => includesAny(card.text, ['return target creature card from your graveyard', 'return target permanent card from your graveyard', 'put target creature card from a graveyard onto the battlefield', 'reanimate', 'from your graveyard to the battlefield']));
  const aristocrats = sum((card) => (card.text.includes('sacrifice') && card.text.includes('creature')) || includesAny(card.text, ['whenever another creature dies', 'whenever a creature dies']));
  const enchantress = sum((card) => includesAny(card.text, ['whenever you cast an enchantment spell', 'whenever an enchantment enters', 'enchantment spells you cast']));
  const counters = sum((card) => includesAny(card.text, ['+1/+1 counter', 'proliferate', 'double the number of each kind of counter']));
  const themes = new Set();
  if (mill >= 8) themes.add('mill');
  if (petitioners >= 12) themes.add('petitioners');
  if (control >= 8) themes.add('control');
  if (spells >= 24) themes.add('spellslinger');
  if (storm >= 3 || (spells >= 28 && storm >= 1)) themes.add('storm');
  if (burn >= 6) themes.add('burn');
  if (combo >= 5) themes.add('combo');
  if (artifacts >= 18 || sum((card) => card.text.includes('artifact')) >= 8) themes.add('artifacts');
  if (tokens >= 8) themes.add('tokens');
  if (lands >= 40 || landsMatter >= 8) themes.add('lands');
  if (reanimator >= 5) themes.add('reanimator');
  if (aristocrats >= 6) themes.add('aristocrats');
  if (enchantments >= 14 || enchantress >= 4) themes.add('enchantress');
  if (counters >= 6) themes.add('counters');
  if (themes.size === 0) {
    if (spells >= Math.max(18, Math.floor(totalCards * 0.22))) themes.add('spellslinger');
    else if (artifacts >= Math.max(14, Math.floor(totalCards * 0.18))) themes.add('artifacts');
    else if (enchantments >= Math.max(12, Math.floor(totalCards * 0.16))) themes.add('enchantress');
    else if (control >= 6) themes.add('control');
  }
  return [...themes];
}

function expectedThemeSummary(decks) {
  const counts = new Map(THEME_DEFINITIONS.map((theme) => [theme.slug, 0]));
  for (const deck of decks) for (const slug of deck.themes) counts.set(slug, (counts.get(slug) || 0) + 1);
  const minimumDeckCount = decks.length >= 8 ? 2 : 1;
  return THEME_DEFINITIONS.filter((theme) => COMMANDER_PRESENTABLE_THEME_SLUGS.has(theme.slug))
    .map((theme) => ({ ...theme, deck_count: counts.get(theme.slug) || 0, prevalence: decks.length ? (counts.get(theme.slug) || 0) / decks.length : 0 }))
    .filter((theme) => theme.deck_count >= minimumDeckCount)
    .sort((a, b) => ((b.priority * 1000 + b.deck_count * 10 + b.prevalence) - (a.priority * 1000 + a.deck_count * 10 + a.prevalence)) || b.deck_count - a.deck_count || a.label.localeCompare(b.label))
    .slice(0, 4);
}

function topRecommendations(stats) {
  return stats.filter((row) => row.weighted_score > 0 && !isBasicLand(row.card_name, row.type_line)).slice(0, 20);
}

function markdownReport(report) {
  const lines = [
    '# Commander Analytics Certification', '',
    `- Status: ${report.certification}`,
    `- Dataset: ${report.dataset_version}`,
    `- Analytics version: ${report.analytics_version}`,
    `- Active source observations: ${report.corpus.active_decks}`,
    `- Unique chemistry configurations: ${report.corpus.unique_configurations}`,
    `- Duplicate source observations: ${report.corpus.duplicate_observations}`,
    `- Active observed deck-card relationships: ${report.corpus.active_relationships}`,
    `- Chemistry deck-card relationships: ${report.corpus.chemistry_relationships}`,
    `- Published commander details: ${report.corpus.commander_details}`,
    `- Stat rows certified: ${report.coverage.stat_rows}`,
    '', '## Sample Policy', '',
    `- Insufficient (1-4): ${report.sample_distribution.insufficient} commanders; derived analytics suppressed.`,
    `- Low confidence (5-9): ${report.sample_distribution.low} commanders; derived analytics suppressed.`,
    `- Usable (10-19): ${report.sample_distribution.usable} commanders.`,
    `- Strong (20+): ${report.sample_distribution.strong} commanders.`,
    '', '## Representative Commanders', '',
    '| Commander | Unique configurations | Source observations | Tier | Top recommendations |',
    '| --- | ---: | ---: | --- | --- |',
    ...report.representative_commanders.map((row) => `| ${row.commander} | ${row.sample_size} | ${row.source_observations} | ${row.confidence_tier} | ${row.top_recommendations.map((card) => `${card.card_name} (${(card.inclusion_rate * 100).toFixed(1)}% / ${(card.global_inclusion_rate * 100).toFixed(1)}%, ${(card.chemistry_score * 100).toFixed(1)})`).join('; ') || 'Suppressed'} |`),
    '', '## Theme Audit', '',
    '| Theme | Triggered decks | Assessment | Rule |',
    '| --- | ---: | --- | --- |',
    ...report.theme_audit.map((row) => `| ${row.label} | ${row.deck_count} | ${row.quality} | ${row.rule} |`),
    '', `Legacy broad tutor-to-Combo false-positive candidates removed: ${report.theme_findings.legacy_tutor_combo_only_decks}.`,
    '', '## Findings', '',
    `- Recommendations: ${report.findings.recommendations}`,
    `- Related commanders: ${report.findings.related_commanders}`,
    `- Average deck: ${report.findings.average_deck}`,
    `- Mana/type handling: ${report.findings.mana_and_types}`,
    '', `## Verdict: ${report.verdict}`, ''
  ];
  return `${lines.join('\n')}\n`;
}

await refreshMtgCommanderEngine();
const snapshot = getMtgCommanderPublicSnapshot();
const indexRows = db.prepare('SELECT * FROM mtg_commander_index WHERE deck_count > 0 ORDER BY deck_count DESC, name_normalized ASC').all();
const activeDeckRows = db.prepare(`SELECT decks.deck_key, decks.commander_oracle_id, decks.content_fingerprint, decks.chemistry_weight FROM mtg_commander_corpus_decks decks WHERE ${ACTIVE_SQL} ORDER BY decks.deck_key`).all();
const chemistryDeckRows = activeDeckRows.filter((row) => Number(row.chemistry_weight || 0) > 0);
const activeCardRows = db.prepare(`
  SELECT cards.deck_key, cards.card_oracle_id, cards.card_name, cards.quantity, cards.is_commander
  FROM mtg_commander_corpus_cards cards
  INNER JOIN mtg_commander_corpus_decks decks ON decks.deck_key = cards.deck_key
  WHERE ${ACTIVE_SQL}
  ORDER BY cards.deck_key, cards.card_oracle_id
`).all();
const chemistryCardRows = db.prepare(`
  SELECT cards.deck_key, cards.card_oracle_id, cards.card_name, cards.quantity, cards.is_commander
  FROM mtg_commander_corpus_cards cards
  INNER JOIN mtg_commander_corpus_decks decks ON decks.deck_key = cards.deck_key
  WHERE ${CHEMISTRY_SQL}
  ORDER BY cards.deck_key, cards.card_oracle_id
`).all();
const lookupRows = db.prepare('SELECT * FROM mtg_card_lookup').all();
const statRows = db.prepare('SELECT * FROM mtg_commander_card_stats ORDER BY commander_oracle_id, weighted_score DESC, deck_count DESC, card_name_lower ASC').all();

assert(activeDeckRows.length > 0, 'Active corpus is empty.');
assert(chemistryDeckRows.length > 0, 'Unique chemistry corpus is empty.');
assert(activeCardRows.length > 0, 'Active deck-card corpus is empty.');
assert(indexRows.length > 0, 'Commander index is empty.');
assert(snapshot.activeDeckCount === activeDeckRows.length && snapshot.indexDeckTotal === activeDeckRows.length, 'Snapshot/index denominator mismatch.');
assert(snapshot.uniqueConfigurationCount === chemistryDeckRows.length, 'Snapshot unique-configuration count mismatch.');
assert(snapshot.duplicateObservationCount === activeDeckRows.length - chemistryDeckRows.length, 'Snapshot duplicate-observation count mismatch.');
assert(snapshot.analyticsVersion === COMMANDER_ANALYTICS_VERSION, 'Snapshot analytics version mismatch.');

const cardLookup = new Map(lookupRows.map((row) => [row.oracle_id, row]));
const commanderCounts = new Map();
const observationCommanderCounts = new Map();
const commanderByDeck = new Map(chemistryDeckRows.map((row) => [row.deck_key, row.commander_oracle_id]));
const observationCommanderByDeck = new Map(activeDeckRows.map((row) => [row.deck_key, row.commander_oracle_id]));
const indexById = new Map(indexRows.map((row) => [row.oracle_id, row]));
const deckCountsByColorMask = new Map();
for (const row of chemistryDeckRows) {
  const mask = Number(indexById.get(row.commander_oracle_id)?.color_mask || 0);
  deckCountsByColorMask.set(mask, (deckCountsByColorMask.get(mask) || 0) + 1);
}
const eligibleDeckCount = (cardOracleId) => {
  const mask = colorMask(parseColors(cardLookup.get(cardOracleId)?.color_identity_json));
  return [...deckCountsByColorMask.entries()].reduce((sum, [deckMask, count]) => (
    (deckMask & mask) === mask ? sum + count : sum
  ), 0);
};
const globalPresence = new Map();
const commanderPresence = new Map();
const decks = new Map(chemistryDeckRows.map((row) => [row.deck_key, { ...row, cards: [] }]));
for (const row of chemistryDeckRows) commanderCounts.set(row.commander_oracle_id, (commanderCounts.get(row.commander_oracle_id) || 0) + 1);
for (const row of activeDeckRows) observationCommanderCounts.set(row.commander_oracle_id, (observationCommanderCounts.get(row.commander_oracle_id) || 0) + 1);

const globalSeen = new Set();
const commanderSeen = new Set();
const observationCommanderPresence = new Map();
const observationSeen = new Set();
for (const row of chemistryCardRows) {
  if (row.is_commander) continue;
  const meta = cardLookup.get(row.card_oracle_id) || {};
  const card = {
    oracle_id: row.card_oracle_id,
    name: String(meta.name || row.card_name || '').toLowerCase(),
    type: String(meta.type_line || '').toLowerCase(),
    text: String(meta.oracle_text || '').toLowerCase(),
    quantity: Number(row.quantity || 0),
    cmc: meta.cmc,
    mana_cost: meta.mana_cost || ''
  };
  decks.get(row.deck_key)?.cards.push(card);
  const globalKey = `${row.deck_key}:${row.card_oracle_id}`;
  if (!globalSeen.has(globalKey)) {
    globalSeen.add(globalKey);
    globalPresence.set(row.card_oracle_id, (globalPresence.get(row.card_oracle_id) || 0) + 1);
  }
  const commanderId = commanderByDeck.get(row.deck_key);
  const commanderKey = `${commanderId}:${row.deck_key}:${row.card_oracle_id}`;
  if (!commanderSeen.has(commanderKey)) {
    commanderSeen.add(commanderKey);
    if (!commanderPresence.has(commanderId)) commanderPresence.set(commanderId, new Map());
    const counts = commanderPresence.get(commanderId);
    counts.set(row.card_oracle_id, (counts.get(row.card_oracle_id) || 0) + 1);
  }
}

for (const row of activeCardRows) {
  if (row.is_commander) continue;
  const commanderId = observationCommanderByDeck.get(row.deck_key);
  if (!commanderId) continue;
  if (!observationCommanderPresence.has(commanderId)) observationCommanderPresence.set(commanderId, new Map());
  const counts = observationCommanderPresence.get(commanderId);
  const key = `${row.deck_key}:${row.card_oracle_id}`;
  if (observationSeen.has(key)) continue;
  observationSeen.add(key);
  counts.set(row.card_oracle_id, (counts.get(row.card_oracle_id) || 0) + 1);
}

const observationCardCount = (commanderId, cardId) => observationCommanderPresence.get(commanderId)?.get(cardId) || 0;

for (const deck of decks.values()) {
  deck.themes = inferThemes(deck.cards);
  deck.legacyThemes = inferThemes(deck.cards, true);
}

const statsByCommander = new Map();
for (const row of statRows) {
  if (!statsByCommander.has(row.commander_oracle_id)) statsByCommander.set(row.commander_oracle_id, []);
  statsByCommander.get(row.commander_oracle_id).push(row);
  const expectedCommanderDecks = commanderCounts.get(row.commander_oracle_id) || 0;
  const expectedCardDecks = commanderPresence.get(row.commander_oracle_id)?.get(row.card_oracle_id) || 0;
  const expectedGlobalDecks = globalPresence.get(row.card_oracle_id) || 0;
  assert(row.total_commander_decks === expectedCommanderDecks, `Commander denominator mismatch for ${row.commander_name}/${row.card_name}`);
  assert(row.total_commander_observations === (observationCommanderCounts.get(row.commander_oracle_id) || 0), `Commander observation denominator mismatch for ${row.commander_name}/${row.card_name}`);
  assert(row.deck_count === expectedCardDecks, `Inclusion count mismatch for ${row.commander_name}/${row.card_name}`);
  assert(row.observation_deck_count === observationCardCount(row.commander_oracle_id, row.card_oracle_id), `Observation inclusion count mismatch for ${row.commander_name}/${row.card_name}`);
  const expectedEligibleDecks = eligibleDeckCount(row.card_oracle_id);
  assert(row.total_global_decks === expectedEligibleDecks, `Color-eligible global denominator mismatch for ${row.commander_name}/${row.card_name}`);
  assert(row.global_deck_count === expectedGlobalDecks, `Global inclusion count mismatch for ${row.commander_name}/${row.card_name}`);
  const inclusion = expectedCardDecks / expectedCommanderDecks;
  const globalInclusion = expectedEligibleDecks > 0 ? expectedGlobalDecks / expectedEligibleDecks : 0;
  const synergy = inclusion - globalInclusion;
  const confidence = Math.tanh(expectedCardDecks / 20);
  nearlyEqual(row.inclusion_rate, inclusion, `Inclusion rate ${row.commander_name}/${row.card_name}`);
  nearlyEqual(row.global_inclusion_rate, globalInclusion, `Global rate ${row.commander_name}/${row.card_name}`);
  nearlyEqual(row.synergy_score, synergy, `Synergy ${row.commander_name}/${row.card_name}`);
  nearlyEqual(row.confidence_score, confidence, `Confidence ${row.commander_name}/${row.card_name}`);
  nearlyEqual(row.weighted_score, synergy * confidence, `Weighted score ${row.commander_name}/${row.card_name}`);
  assert(row.category === categorizeCard(row.type_line, row.oracle_text), `Category mismatch for ${row.card_name}`);
}

const storedStatKeys = new Set(statRows.map((row) => `${row.commander_oracle_id}:${row.card_oracle_id}`));
let expectedStatRows = 0;
for (const [commanderId, cards] of commanderPresence.entries()) {
  for (const cardId of cards.keys()) {
    const card = cardLookup.get(cardId);
    if (categorizeCard(card?.type_line, card?.oracle_text) === 'other') continue;
    expectedStatRows += 1;
    assert(storedStatKeys.has(`${commanderId}:${cardId}`), `Missing stat row for commander ${commanderId}, card ${cardId}`);
  }
}
assert(statRows.length === expectedStatRows, `Stat row coverage mismatch: expected ${expectedStatRows}, received ${statRows.length}`);

const pages = new Map();
const tierCounts = { insufficient: 0, low: 0, usable: 0, strong: 0 };
const themeCounts = new Map(THEME_DEFINITIONS.map((theme) => [theme.slug, 0]));
let legacyTutorComboOnlyDecks = 0;
for (const deck of decks.values()) {
  for (const theme of deck.themes) themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1);
  if (deck.legacyThemes.includes('combo') && !deck.themes.includes('combo')) legacyTutorComboOnlyDecks += 1;
}

for (const indexRow of indexRows) {
  const count = commanderCounts.get(indexRow.oracle_id) || 0;
  const observationCount = observationCommanderCounts.get(indexRow.oracle_id) || 0;
  assert(indexRow.deck_count === observationCount, `Commander index observation count mismatch for ${indexRow.name}`);
  assert(indexRow.unique_configuration_count === count, `Commander index unique count mismatch for ${indexRow.name}`);
  const policy = getCommanderSampleConfidence(count);
  tierCounts[policy.tier] += 1;
  const page = getMtgCommanderPage(indexRow.oracle_id);
  pages.set(indexRow.oracle_id, page);
  assert(page.total_decks === observationCount, `Detail observation count mismatch for ${indexRow.name}`);
  assert(page.unique_configuration_count === count, `Detail unique count mismatch for ${indexRow.name}`);
  assert(page.sample_confidence.tier === policy.tier, `Confidence tier mismatch for ${indexRow.name}`);
  assert(page.has_analytics_data === policy.analytics_eligible, `Analytics gate mismatch for ${indexRow.name}`);
  const expectedRank = 1 + indexRows.filter((candidate) => candidate.deck_count > observationCount).length;
  assert(page.commander.rank === (policy.ranking_eligible ? expectedRank : null), `Ranking gate mismatch for ${indexRow.name}`);

  if (!policy.analytics_eligible) {
    for (const key of ['top_synergy_cards', 'new_cards', 'game_changers', 'categories', 'related_commanders', 'average_deck_sections', 'theme_options']) {
      assert(Array.isArray(page[key]) && page[key].length === 0, `${key} leaked through sample gate for ${indexRow.name}`);
    }
    assert(page.average_deck_profile.total_decks === 0, `Average profile leaked through sample gate for ${indexRow.name}`);
    continue;
  }

  const expectedTop = topRecommendations(statsByCommander.get(indexRow.oracle_id) || []).map((row) => row.card_oracle_id);
  assert(JSON.stringify(page.top_synergy_cards.map((row) => row.oracle_id)) === JSON.stringify(expectedTop), `Recommendation ordering mismatch for ${indexRow.name}`);
  const commanderDecks = [...decks.values()].filter((deck) => deck.commander_oracle_id === indexRow.oracle_id);
  const expectedThemes = expectedThemeSummary(commanderDecks);
  assert(JSON.stringify(page.theme_options.map((theme) => [theme.slug, theme.deck_count])) === JSON.stringify(expectedThemes.map((theme) => [theme.slug, theme.deck_count])), `Theme summary mismatch for ${indexRow.name}`);

  const typeTotals = new Map();
  const manaTotals = new Map();
  let totalCards = 0;
  for (const deck of commanderDecks) {
    for (const card of deck.cards) {
      const type = classifyType(card.type);
      typeTotals.set(type, (typeTotals.get(type) || 0) + card.quantity);
      totalCards += card.quantity;
      const cardManaValue = manaValue(card);
      if (type !== 'Land' && cardManaValue !== null) {
        const bucket = Math.min(cardManaValue, 7);
        manaTotals.set(bucket, (manaTotals.get(bucket) || 0) + card.quantity);
      }
    }
  }
  assert(page.average_deck_profile.total_decks === count, `Average profile denominator mismatch for ${indexRow.name}`);
  nearlyEqual(page.average_deck_profile.average_cards, Number((totalCards / count).toFixed(1)), `Average card count ${indexRow.name}`);
  assert(page.average_deck_profile.average_cards > 90 && page.average_deck_profile.average_cards <= 100, `Average profile has an implausible deck size for ${indexRow.name}`);
  for (const entry of page.average_deck_profile.type_distribution) {
    assert(entry.total_quantity === (typeTotals.get(entry.name) || 0), `Type total mismatch for ${indexRow.name}/${entry.name}`);
  }
  for (const entry of page.average_deck_profile.mana_curve) {
    assert(entry.total_quantity === (manaTotals.get(entry.bucket) || 0), `Mana curve mismatch for ${indexRow.name}/${entry.mana}`);
  }
  assert(page.average_deck_kind === 'synthetic_profile', `Average-deck provenance missing for ${indexRow.name}`);

  const signature = (statsByCommander.get(indexRow.oracle_id) || []).filter((row) => row.weighted_score > 0 && !isBasicLand(row.card_name, row.type_line)).slice(0, 8).map((row) => row.card_oracle_id);
  const expectedRelated = indexRows.map((candidate) => {
    if (candidate.oracle_id === indexRow.oracle_id || candidate.unique_configuration_count < COMMANDER_SAMPLE_THRESHOLDS.usable || candidate.color_mask !== indexRow.color_mask) return null;
    const candidateCards = new Set((statsByCommander.get(candidate.oracle_id) || []).map((row) => row.card_oracle_id));
    const shared = signature.filter((id) => candidateCards.has(id)).length;
    return shared >= 2 ? { id: candidate.oracle_id, shared, decks: candidate.deck_count, name: candidate.name_normalized } : null;
  }).filter(Boolean).sort((a, b) => b.shared - a.shared || b.decks - a.decks || a.name.localeCompare(b.name)).slice(0, 6);
  assert(JSON.stringify(page.related_commanders.map((row) => [row.oracle_id, row.shared_cards])) === JSON.stringify(expectedRelated.map((row) => [row.id, row.shared])), `Related commander mismatch for ${indexRow.name}`);
}

const manifestPath = path.join(process.cwd(), 'public', 'data', 'mtg', 'commander-manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.analytics_version === COMMANDER_ANALYTICS_VERSION) {
    assert(manifest.dataset_version === snapshot.datasetVersion, 'Published manifest dataset version mismatches current analytics snapshot.');
    assert(manifest.active_deck_count === activeDeckRows.length && manifest.detail_count === indexRows.length, 'Published manifest counts mismatch current analytics snapshot.');
    assert(manifest.unique_content_configuration_count === chemistryDeckRows.length, 'Published manifest unique-configuration count mismatch.');
    assert(manifest.duplicate_observation_count === activeDeckRows.length - chemistryDeckRows.length, 'Published manifest duplicate-observation count mismatch.');

    const publicIndex = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public', 'data', 'mtg', 'commanders.json'), 'utf8'));
    assert(publicIndex.every((row) => row.dataset_version === snapshot.datasetVersion), 'Commander index contains mixed dataset versions.');
    assert(publicIndex.every((row) => row.analytics_version === COMMANDER_ANALYTICS_VERSION), 'Commander index contains mixed analytics versions.');

    const detailsDir = path.join(process.cwd(), 'public', 'data', 'mtg', 'commander-details');
    const detailFiles = fs.readdirSync(detailsDir).filter((fileName) => fileName.endsWith('.json'));
    assert(detailFiles.length === manifest.detail_count, 'Published commander detail file count mismatches manifest.');
    for (const fileName of detailFiles) {
      const detail = JSON.parse(fs.readFileSync(path.join(detailsDir, fileName), 'utf8'));
      assert(detail.dataset_version === snapshot.datasetVersion, `Commander detail ${fileName} has a mismatched dataset version.`);
      assert(detail.analytics_version === COMMANDER_ANALYTICS_VERSION, `Commander detail ${fileName} has a mismatched analytics version.`);
      assert(detail.sample_confidence?.tier, `Commander detail ${fileName} is missing sample confidence metadata.`);
      assert(detail.sample_confidence.deck_count === detail.unique_configuration_count, `Commander detail ${fileName} confidence uses source observations instead of unique configurations.`);
      assert(detail.total_decks === detail.unique_configuration_count + detail.duplicate_observation_count, `Commander detail ${fileName} observation totals are inconsistent.`);
    }
  }
}

const representativeIndexRows = REQUIRED_NAMES.map((name) => {
  const row = indexRows.find((candidate) => candidate.name === name);
  assert(row, `Required representative commander missing: ${name}`);
  return row;
});
const usedColors = new Set(representativeIndexRows.map((row) => row.color_mask));
for (const row of indexRows) {
  if (representativeIndexRows.length >= 9) break;
  if (row.deck_count < COMMANDER_SAMPLE_THRESHOLDS.usable || usedColors.has(row.color_mask)) continue;
  usedColors.add(row.color_mask);
  representativeIndexRows.push(row);
}

const representatives = representativeIndexRows.map((row) => {
  const page = pages.get(row.oracle_id);
  return {
    commander: row.name,
    color_identity: parseColors(row.color_identity_json),
    sample_size: row.unique_configuration_count,
    source_observations: row.deck_count,
    confidence_tier: page.sample_confidence.tier,
    top_recommendations: page.top_synergy_cards.slice(0, 5).map((card) => ({
      card_name: card.card_name,
      inclusion_rate: card.inclusion_rate,
      global_inclusion_rate: card.global_inclusion_rate,
      chemistry_score: card.weighted_score
    }))
  };
});

const report = {
  certification: 'PASS',
  verdict: 'READY FOR UI REDESIGN',
  dataset_version: snapshot.datasetVersion,
  analytics_version: COMMANDER_ANALYTICS_VERSION,
  corpus: {
    active_decks: activeDeckRows.length,
    unique_configurations: chemistryDeckRows.length,
    duplicate_observations: activeDeckRows.length - chemistryDeckRows.length,
    active_relationships: activeCardRows.length,
    chemistry_relationships: chemistryCardRows.length,
    commander_details: indexRows.length
  },
  coverage: {
    commander_counts: indexRows.length,
    stat_rows: statRows.length,
    eligible_commander_profiles: tierCounts.usable + tierCounts.strong,
    recommendation_lists: tierCounts.usable + tierCounts.strong,
    theme_profiles: tierCounts.usable + tierCounts.strong,
    related_commander_profiles: tierCounts.usable + tierCounts.strong,
    average_deck_profiles: tierCounts.usable + tierCounts.strong
  },
  sample_thresholds: COMMANDER_SAMPLE_THRESHOLDS,
  sample_distribution: tierCounts,
  representative_commanders: representatives,
  theme_audit: THEME_DEFINITIONS.map((theme) => ({ ...theme, deck_count: themeCounts.get(theme.slug) || 0 })),
  theme_findings: {
    legacy_tutor_combo_only_decks: legacyTutorComboOnlyDecks,
    trustworthy: THEME_DEFINITIONS.filter((theme) => theme.quality === 'trustworthy').map((theme) => theme.slug),
    weak_or_noisy: THEME_DEFINITIONS.filter((theme) => theme.quality === 'weak').map((theme) => theme.slug),
    suppressed_from_presentation: THEME_DEFINITIONS.filter((theme) => !COMMANDER_PRESENTABLE_THEME_SLUGS.has(theme.slug)).map((theme) => theme.slug)
  },
  findings: {
    recommendations: 'Deck-presence inclusion, color-eligible unique-configuration baseline subtraction, tanh card-support weighting, basic-land omission, deterministic ties, and commander sample gating certified. Source observations remain visible but exact duplicate configurations carry zero additional chemistry weight.',
    related_commanders: 'Exact color identity, usable samples, and at least two shared top-eight signature cards are required; ordering is deterministic.',
    average_deck: 'Synthetic profile built from averaged type totals and weighted top-card sections; it is not an observed deck and is marked synthetic_profile.',
    mana_and_types: 'Commander rows are excluded, lands are excluded from the curve, catalog CMC owns multi-face mana value, and unknown metadata is Other rather than Battle.'
  },
  launch_blockers: []
};

fs.mkdirSync(REPORT_DIR, { recursive: true });
fs.writeFileSync(path.join(REPORT_DIR, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(REPORT_DIR, 'report.md'), markdownReport(report));
console.log(JSON.stringify(report, null, 2));
