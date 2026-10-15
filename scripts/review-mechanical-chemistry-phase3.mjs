import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3' : path.resolve('.devcache', 'mechanical-chemistry', 'phase3');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: report output: ${ROOT}`);
const read = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, name), 'utf8'));
const write = (name, payload) => fs.writeFileSync(path.join(ROOT, name), `${JSON.stringify(payload, null, 2)}\n`);
const build = read('build-report.json');
const verification = read('phase3-verification.json');
const recommendationByArchetype = new Map();
for (const entry of build.commanders.filter((row) => row.status === 'built')) {
  recommendationByArchetype.set(entry.archetype, read(path.join('recommendations', `${entry.identity}.json`)));
}

// Deliberately human-authored judgments. These labels are reporting data, never scorer inputs.
const MANUAL_HIDDEN_REVIEW = [
  ['Aristocrats', "Zahur, Glory's Past", 'excellent overlooked interaction', 'A zero-mana sacrifice outlet repeatedly creates the exact death events Teysa doubles.'],
  ['Spellslinger', 'Snap', 'excellent overlooked interaction', 'The spell advances the instant/sorcery plan and refunds mana by untapping lands.'],
  ['+1/+1 Counters', 'Recon Craft Theta', 'plausible', 'Counter placement and proliferation are real links, though opportunity cost needs deck-context review.'],
  ['Tokens', 'Anointed Procession', 'excellent overlooked interaction', 'A persistent token multiplier directly scales both Rhys activations.'],
  ['Artifacts', 'Sai, Master Thopterist', 'excellent overlooked interaction', 'Artifact casts become more artifacts, directly increasing Urza mana and board resources.'],
  ['Enchantments', 'Argothian Enchantress', 'excellent overlooked interaction', 'Every enchantment cast supplies another draw payoff alongside Sythis.'],
  ['Graveyard/Reanimator', 'Oracle of Tragedy', 'plausible', 'Repeatable ETB/death graveyard loading is reusable by Muldrotha, but card-quality context still matters.'],
  ['Lands', 'Skola Grovedancer', 'plausible', 'It rewards lands reaching the graveyard, but its payoff is secondary to Gitrog’s draw engine.'],
  ['Voltron', 'Ethereal Armor', 'excellent overlooked interaction', 'It is an Aura and scales the attached threat with the same enchantment density Sram rewards.'],
  ['Blink/ETB', "Gossip's Talent", 'plausible', 'Its ETB interaction is mechanically aligned, with mode and opportunity-cost caveats.'],
  ['Mill', 'Call of the Nightwing', 'plausible', 'Cipher can repeatedly make Horror bodies that satisfy the commander’s tribal combat plan.'],
  ['Lifegain', "Ajani's Pridemate", 'excellent overlooked interaction', 'Each life-gain event becomes the exact +1/+1 counter payoff Karlov also uses.'],
  ['Combat', "Raiyuu, Storm's Edge", 'excellent overlooked interaction', 'An attack trigger creates another combat, multiplying Aurelia’s core sequence.'],
  ['Group slug', 'Forge Boss', 'questionable', 'It shares sacrifice pressure but does not reinforce Mogis’s upkeep choice as directly as the score suggests.'],
  ['Treasure', 'Tainted Adversary', 'questionable', 'The token-multiplier reading is technically present but depends on an expensive optional payment and Zombie context.'],
  ['Sacrifice', 'Juri, Master of the Revue', 'excellent overlooked interaction', 'It rewards every sacrifice and converts accumulated value into a death payoff.'],
  ['Partner pair', 'Smothering Tithe', 'generic but acceptable', 'Powerful mana support for activated abilities, but not unique to the pair.'],
  ['Background pair', 'Genji Glove', 'excellent overlooked interaction', 'Its own attack trigger creates another combat for Karlach and the Background death-pressure plan.'],
  ['Blink/ETB', 'Strict Proctor', 'false positive', 'ETB trigger suppression was incorrectly parsed as ETB doubling; Phase 3 now adds a major conflict and removes it from the Top 10.'],
  ['Blink/ETB', "Illusionist's Gambit", 'false positive', 'The extra combat occurs on an opponent’s turn; Phase 3 now prevents it from counting as your commander’s attack multiplier.']
];

const reviewed = MANUAL_HIDDEN_REVIEW.map(([archetype, cardName, classification, rationale]) => {
  const result = recommendationByArchetype.get(archetype);
  const rank = result?.recommendations.findIndex((entry) => entry.card_name === cardName) ?? -1;
  const card = rank >= 0 ? result.recommendations[rank] : null;
  return {
    archetype, commander: result?.commander_profile?.commander_names || [], card_name: cardName, classification, rationale,
    current_rank: rank >= 0 ? rank + 1 : null, mechanical_fit: card?.mechanical_fit_label || null,
    community_inclusion: card?.community_inclusion ?? null, why_it_works: card?.mechanical_reasons?.[0]?.explanation || null,
    warnings: card?.mechanical_penalties?.map((entry) => entry.explanation) || []
  };
});
write('hidden-chemistry-review.json', {
  generated_at: new Date().toISOString(), methodology: 'Manual classification of representative mechanically high, low/no-community recommendations; classifications are not scorer inputs.',
  counts: Object.fromEntries(['excellent overlooked interaction', 'plausible', 'generic but acceptable', 'questionable', 'false positive'].map((label) => [label, reviewed.filter((row) => row.classification === label).length])),
  reviewed
});

const verificationByArchetype = new Map(verification.rows.map((row) => [row.archetype, row]));
const zeroCommunityRows = [...recommendationByArchetype.entries()].map(([archetype, result]) => {
  const top10 = result.recommendations.slice(0, 10);
  const top20 = result.recommendations.slice(0, 20);
  const reviewedRow = verificationByArchetype.get(archetype);
  return {
    archetype, commander: result.commander_profile.commander_names,
    community_observed_top_20: top20.filter((entry) => entry.community_observation_count > 0).length,
    top_10_commander_specific_rate: Number((top10.filter((entry) => entry.commander_centrality !== 'Generic Utility').length / Math.max(1, top10.length)).toFixed(4)),
    top_20_commander_specific_rate: Number((top20.filter((entry) => entry.commander_centrality !== 'Generic Utility').length / Math.max(1, top20.length)).toFixed(4)),
    top_20_explanation_correctness: Number((top20.filter((entry) => entry.mechanical_reasons?.[0]?.candidate_action && entry.mechanical_reasons?.[0]?.commander_connection && entry.mechanical_reasons?.[0]?.strategic_value).length / Math.max(1, top20.length)).toFixed(4)),
    obvious_positive_rank: reviewedRow?.fixtures?.obvious_positive?.rank ?? null,
    mechanically_justified_without_community: top10.filter((entry) => !entry.community_observation_count).slice(0, 5).map((entry) => ({ card_name: entry.card_name, fit: entry.mechanical_fit_label, confidence: entry.confidence, reason: entry.mechanical_reasons?.[0]?.explanation }))
  };
}).sort((a, b) => a.community_observed_top_20 - b.community_observed_top_20).slice(0, 10);
write('zero-community-results.json', {
  generated_at: new Date().toISOString(), methodology: 'Ten configurations with the fewest observed community cards in their Mechanical Top 20. Mechanical scoring never reads community inclusion.',
  aggregate: {
    commander_count: zeroCommunityRows.length,
    mean_top_10_commander_specific_rate: Number((zeroCommunityRows.reduce((sum, row) => sum + row.top_10_commander_specific_rate, 0) / zeroCommunityRows.length).toFixed(4)),
    mean_top_20_commander_specific_rate: Number((zeroCommunityRows.reduce((sum, row) => sum + row.top_20_commander_specific_rate, 0) / zeroCommunityRows.length).toFixed(4)),
    explanation_correctness: Number((zeroCommunityRows.reduce((sum, row) => sum + row.top_20_explanation_correctness, 0) / zeroCommunityRows.length).toFixed(4)),
    obvious_positive_top_10_recall: Number((zeroCommunityRows.filter((row) => row.obvious_positive_rank && row.obvious_positive_rank <= 10).length / zeroCommunityRows.length).toFixed(4)),
    obvious_positive_top_20_recall: Number((zeroCommunityRows.filter((row) => row.obvious_positive_rank && row.obvious_positive_rank <= 20).length / zeroCommunityRows.length).toFixed(4))
  },
  commanders: zeroCommunityRows
});

console.log(JSON.stringify({ hidden_review_count: reviewed.length, zero_community: read('zero-community-results.json').aggregate }, null, 2));
