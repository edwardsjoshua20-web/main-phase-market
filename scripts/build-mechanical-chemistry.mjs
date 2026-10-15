import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import {
  buildMechanicalRecommendations,
  buildSemanticCardProfile,
  MECHANICAL_CHEMISTRY_SCHEMA_VERSION
} from '../src/services/commander/mechanicalChemistryCore.js';

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1))), '..');
const DEFAULT_OUTPUT_ROOT = process.platform === 'win32'
  ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3'
  : path.join(REPO_ROOT, '.devcache', 'mechanical-chemistry', 'phase3');

export const VALIDATION_COMMANDERS = Object.freeze([
  { archetype: 'Aristocrats', names: ['Teysa Karlov'] },
  { archetype: 'Spellslinger', names: ['Mizzix of the Izmagnus'] },
  { archetype: '+1/+1 Counters', names: ["Atraxa, Praetors' Voice"] },
  { archetype: 'Tokens', names: ['Rhys the Redeemed'] },
  { archetype: 'Artifacts', names: ['Urza, Lord High Artificer'] },
  { archetype: 'Enchantments', names: ["Sythis, Harvest's Hand"] },
  { archetype: 'Graveyard/Reanimator', names: ['Muldrotha, the Gravetide'] },
  { archetype: 'Lands', names: ['The Gitrog Monster'] },
  { archetype: 'Tribal', names: ['Wilhelt, the Rotcleaver'] },
  { archetype: 'Voltron', names: ['Sram, Senior Edificer'] },
  { archetype: 'Blink/ETB', names: ['Brago, King Eternal'] },
  { archetype: 'Mill', names: ["Captain N'ghathrod"] },
  { archetype: 'Lifegain', names: ['Karlov of the Ghost Council'] },
  { archetype: 'Combat', names: ['Aurelia, the Warleader'] },
  { archetype: 'Control', names: ['Grand Arbiter Augustin IV'] },
  { archetype: 'Group slug', names: ['Mogis, God of Slaughter'] },
  { archetype: 'Treasure', names: ['Prosper, Tome-Bound'] },
  { archetype: 'Sacrifice', names: ['Korvold, Fae-Cursed King'] },
  { archetype: 'Partner pair', names: ['Thrasios, Triton Hero', 'Tymna the Weaver'] },
  { archetype: 'Background pair', names: ['Karlach, Fury of Avernus', 'Agent of the Iron Throne'] },
  { archetype: 'Narrow tribal / Eminence', names: ['Edgar Markov'] },
  { archetype: 'Narrow tribal / counters', names: ['Giada, Font of Hope'] },
  { archetype: 'Activated ability / tribal tokens', names: ['Krenko, Mob Boss'] },
  { archetype: 'Unusual zone / tribal combat', names: ["Yuriko, the Tiger's Shadow"] },
  { archetype: 'Attack triggers', names: ['Isshin, Two Heavens as One'] },
  { archetype: 'Activated blink', names: ['Roon of the Hidden Realm'] },
  { archetype: 'Replacement effect / tokens', names: ['Chatterfang, Squirrel General'] },
  { archetype: 'Graveyard / sacrifice counters', names: ['Meren of Clan Nel Toth'] },
  { archetype: 'Lands / draw', names: ['Aesi, Tyrant of Gyre Strait'] },
  { archetype: 'Aura tutor / voltron', names: ["Light-Paws, Emperor's Voice"] },
  { archetype: 'Targeted spells', names: ['Zada, Hedron Grinder'] },
  { archetype: 'Wheels / group slug', names: ['Nekusar, the Mindrazer'] },
  { archetype: 'Artifact graveyard / activated', names: ['Osgir, the Reconstructor'] },
  { archetype: 'Cast from exile / spellslinger', names: ['Feather, the Redeemed'] },
  { archetype: 'Mill / unusual zone', names: ['Grolnok, the Omnivore'] },
  { archetype: '-1/-1 counters / tokens', names: ['Hapatra, Vizier of Poisons'] },
  { archetype: 'Noncreature graveyard combat', names: ['Narset, Enlightened Exile'] },
  { archetype: 'Dungeon / graveyard', names: ['Sefris of the Hidden Ways'] },
  { archetype: 'ETB doubling', names: ['Yarok, the Desecrated'] },
  { archetype: 'Graveyard spellslinger', names: ['Kess, Dissident Mage'] }
]);

function parseArgs(argv) {
  const args = { outputRoot: DEFAULT_OUTPUT_ROOT, publishPreview: false, limit: 120 };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--output-root') args.outputRoot = path.resolve(argv[++index]);
    else if (value === '--publish-preview') args.publishPreview = true;
    else if (value === '--limit') args.limit = Math.max(20, Number(argv[++index]) || 120);
  }
  return args;
}

function assertSafeStorage(target) {
  const resolved = path.resolve(target);
  if (process.platform === 'win32' && /^c:/i.test(resolved.replace(/\\/g, '/'))) {
    throw new Error(`Mechanical Chemistry artifacts may not be written to C:. Refusing ${resolved}`);
  }
  return resolved;
}

function readJson(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }

function choosePrinting(existing, next) {
  if (!existing) return next;
  if (existing.lang !== 'en' && next.lang === 'en') return next;
  if (!existing.image_normal && next.image_normal) return next;
  return String(next.released_at || '') > String(existing.released_at || '') ? next : existing;
}

export function loadCanonicalCards() {
  const searchDir = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'search-lite');
  const byOracleId = new Map();
  for (const fileName of fs.readdirSync(searchDir).filter((name) => name.endsWith('.json')).sort()) {
    const rows = readJson(path.join(searchDir, fileName));
    for (const row of rows) {
      if (!row.oracle_id || row.lang !== 'en') continue;
      byOracleId.set(row.oracle_id, choosePrinting(byOracleId.get(row.oracle_id), row));
    }
  }
  const legalityPath = path.join(REPO_ROOT, 'public', 'data', 'legality', 'mtg.json');
  const legality = readJson(legalityPath);
  const legalityByOracleId = new Map((legality.records || []).map((record) => [record.id, record.legalities]));
  return [...byOracleId.values()].map((card) => ({ ...card, legalities: legalityByOracleId.get(card.oracle_id) || { commander: card.legal_commander ? 'legal' : 'unknown' } }));
}

function loadCommunity(commanderId) {
  const detailPath = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'commander-details', `${commanderId}.json`);
  if (!fs.existsSync(detailPath)) return new Map();
  const detail = readJson(detailPath);
  const rows = [
    ...(detail.top_synergy_cards || []), ...(detail.observed_cards || []),
    ...(detail.new_cards || []), ...(detail.game_changers || []),
    ...(detail.categories || []).flatMap((section) => section.cards || [])
  ];
  const result = new Map();
  for (const row of rows) {
    const current = result.get(row.oracle_id);
    if (!current || Number(row.deck_count || 0) > Number(current.deck_count || 0)) result.set(row.oracle_id, row);
  }
  return result;
}

function combinedCommunity(commanders) {
  if (commanders.length !== 1) return new Map();
  return loadCommunity(commanders[0].oracle_id);
}

function buildFeatureIndex(profiles) {
  const index = {};
  for (const profile of profiles) {
    for (const group of ['produces', 'wants', 'rewards', 'enables', 'roles', 'resources']) {
      for (const feature of profile[group] || []) {
        const key = `${group}:${feature.key}`;
        if (!index[key]) index[key] = [];
        index[key].push(profile.oracle_id);
      }
    }
  }
  return index;
}

function summarizeComparison(result) {
  const communityRows = result.recommendations.filter((card) => card.community_inclusion !== null);
  const mechanicalTop = result.recommendations.slice(0, 20);
  const communityTop = [...communityRows].sort((a, b) => Number(b.community_inclusion || 0) - Number(a.community_inclusion || 0)).slice(0, 20);
  const communityIds = new Set(communityTop.map((card) => card.oracle_id));
  return {
    mechanical_top_count: mechanicalTop.length,
    community_top_count: communityTop.length,
    top_20_overlap: mechanicalTop.filter((card) => communityIds.has(card.oracle_id)).length,
    hidden_chemistry_count: result.analysis.hidden_chemistry.length,
    popular_but_weak_count: result.analysis.popular_but_weak_mechanical_fit.length,
    hidden_chemistry_examples: result.analysis.hidden_chemistry.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, reason: card.mechanical_reasons[0]?.explanation })),
    popular_but_weak_examples: result.analysis.popular_but_weak_mechanical_fit.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion }))
  };
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function directorySize(root) {
  let bytes = 0;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    bytes += entry.isDirectory() ? directorySize(target) : fs.statSync(target).size;
  }
  return bytes;
}

function reviewRow(result) {
  return {
    commander: result.commander_profile.commander_names,
    archetype: result.validation_archetype,
    top_10: result.recommendations.slice(0, 10).map((card) => ({
      card_name: card.card_name,
      mechanical_fit: card.mechanical_fit_label,
      mechanical_score: card.mechanical_score,
      confidence: card.confidence,
      commander_centrality: card.commander_centrality,
      role: card.category,
      why_it_works: card.mechanical_reasons[0]?.explanation || null,
      community_inclusion: card.community_inclusion,
      warnings: card.mechanical_penalties.map((penalty) => penalty.explanation)
    }))
  };
}

export function buildMechanicalChemistry(options = {}) {
  const started = performance.now();
  const outputRoot = assertSafeStorage(options.outputRoot || DEFAULT_OUTPUT_ROOT);
  const cards = loadCanonicalCards();
  const cardByName = new Map(cards.map((card) => [card.name, card]));
  const profiledCards = cards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
  const profiles = profiledCards.map(({ legalities, ...profile }) => profile);
  const profileMs = performance.now() - started;
  writeJson(path.join(outputRoot, 'semantic-profiles.json'), { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, card_count: profiles.length, profiles });
  writeJson(path.join(outputRoot, 'feature-index.json'), { schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION, features: buildFeatureIndex(profiles) });

  const commanderResults = [];
  const humanReview = [];
  const disagreementReview = [];
  const zeroCommunityReview = [];
  const previewRoot = path.join(REPO_ROOT, 'public', 'data', 'mtg', 'mechanical-chemistry');
  for (const definition of VALIDATION_COMMANDERS) {
    const commanders = definition.names.map((name) => cardByName.get(name)).filter(Boolean);
    if (commanders.length !== definition.names.length) {
      commanderResults.push({ ...definition, status: 'missing-commander', found: commanders.map((card) => card.name) });
      continue;
    }
    const scoreStarted = performance.now();
    const result = buildMechanicalRecommendations(commanders, profiledCards, {
      communityByOracleId: combinedCommunity(commanders),
      limit: Number(options.limit || 120), perCategory: 12, minimumScore: 20
    });
    result.validation_archetype = definition.archetype;
    result.community_comparison = summarizeComparison(result);
    result.runtime_ms = Number((performance.now() - scoreStarted).toFixed(1));
    const identity = result.commander_profile.commander_identity;
    writeJson(path.join(outputRoot, 'recommendations', `${identity}.json`), result);
    if (options.publishPreview && commanders.length === 1) writeJson(path.join(previewRoot, `${commanders[0].oracle_id}.json`), result);
    commanderResults.push({
      archetype: definition.archetype, names: definition.names, identity, status: 'built',
      recommendation_count: result.recommendations.length,
      category_count: result.categories.length,
      runtime_ms: result.runtime_ms,
      comparison: result.community_comparison
    });
    if (humanReview.length < 20) humanReview.push(reviewRow(result));
    disagreementReview.push({
      commander: definition.names,
      high_mechanical_high_community: result.analysis.obvious_strength.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, classification: 'Likely established strong fit; mechanical and observed evidence agree.' })),
      high_mechanical_low_community: result.analysis.hidden_chemistry.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, classification: card.community_observation_count ? 'Mechanically promising but uncommon; requires human review for opportunity cost or metagame context.' : 'Mechanically justified with no usable local community observation.' })),
      low_mechanical_high_community: result.analysis.popular_but_weak_mechanical_fit.slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, community_inclusion: card.community_inclusion, classification: 'Popular inclusion with weak parsed commander-specific fit; may be a staple, parser gap, or contextual choice.' }))
    });
    zeroCommunityReview.push({
      commander: definition.names,
      recommendations_without_community: result.recommendations.filter((card) => !card.community_observation_count).slice(0, 5).map((card) => ({ card_name: card.card_name, mechanical_score: card.mechanical_score, confidence: card.confidence, mechanical_justification: card.mechanical_reasons[0]?.explanation }))
    });
  }
  writeJson(path.join(outputRoot, 'human-review-top10.json'), { generated_at: new Date().toISOString(), commander_count: humanReview.length, commanders: humanReview });
  writeJson(path.join(outputRoot, 'community-disagreement.json'), { generated_at: new Date().toISOString(), note: 'Community evidence is observational and is not blended into Mechanical Fit.', commanders: disagreementReview });
  writeJson(path.join(outputRoot, 'zero-community-test.json'), { generated_at: new Date().toISOString(), methodology: 'Recommendations are scored from Oracle semantics and canonical legality; rows shown have no local community observation.', commanders: zeroCommunityReview });
  if (options.publishPreview) writeJson(path.join(previewRoot, 'manifest.json'), {
    schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    commander_ids: commanderResults.filter((entry) => entry.status === 'built' && !entry.identity.includes('+')).map((entry) => entry.identity),
    system_derived: true,
    community_signal_blended_into_score: false
  });
  const report = {
    schema_version: MECHANICAL_CHEMISTRY_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: 'MainPhase local canonical MTG search-lite and legality indexes',
    external_requests: 0,
    card_count: cards.length,
    commander_count: commanderResults.filter((entry) => entry.status === 'built').length,
    semantic_profile_ms: Number(profileMs.toFixed(1)),
    total_runtime_ms: Number((performance.now() - started).toFixed(1)),
    forty_commander_recommendation_ms: Number(commanderResults.filter((entry) => entry.status === 'built').reduce((sum, entry) => sum + entry.runtime_ms, 0).toFixed(1)),
    mean_per_commander_recompute_ms: Number((commanderResults.filter((entry) => entry.status === 'built').reduce((sum, entry) => sum + entry.runtime_ms, 0) / Math.max(1, commanderResults.filter((entry) => entry.status === 'built').length)).toFixed(1)),
    memory_rss_mb: Number((process.memoryUsage().rss / 1024 / 1024).toFixed(1)),
    feature_index_size_bytes: fs.statSync(path.join(outputRoot, 'feature-index.json')).size,
    output_root: outputRoot,
    commanders: commanderResults
  };
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  report.artifact_size_bytes = directorySize(outputRoot);
  report.artifact_size_mb = Number((report.artifact_size_bytes / 1024 / 1024).toFixed(2));
  writeJson(path.join(outputRoot, 'build-report.json'), report);
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (value) => value.slice(1)))) {
  const args = parseArgs(process.argv.slice(2));
  console.log(JSON.stringify(buildMechanicalChemistry(args), null, 2));
}
