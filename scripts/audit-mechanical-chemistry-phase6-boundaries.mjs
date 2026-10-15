import fs from 'node:fs';
import path from 'node:path';
import { loadCanonicalCards } from './build-mechanical-chemistry.mjs';
import { buildMechanicalRecommendations, buildSemanticCardProfile } from '../src/services/commander/mechanicalChemistryCore.js';

const pairs = [
  ['Baral, Chief of Compliance', 'Mystical Dispute'],
  ['Kambal, Consul of Allocation', 'Esper Sentinel'],
  ['Rhys the Redeemed', 'Anointed Procession'],
  ['Krenko, Mob Boss', 'Skirk Prospector'],
  ['Karador, Ghost Chieftain', "Stitcher's Supplier"],
];
const raw = loadCanonicalCards();
const byName = new Map(raw.map((card) => [card.name, card]));
const cards = raw.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const phase4Root = 'D:/DevCache/main-phase-market/mechanical-chemistry/phase4';
const phase4Build = JSON.parse(fs.readFileSync(path.join(phase4Root, 'build-report.json'), 'utf8'));
const rows = [];
for (const [commanderName, cardName] of pairs) {
  const currentResult = buildMechanicalRecommendations([byName.get(commanderName)], cards, { limit: 5000, minimumScore: 16 });
  const current = currentResult.recommendations.find((card) => card.card_name === cardName);
  const buildRow = phase4Build.commanders.find((entry) => entry.names.length === 1 && entry.names[0] === commanderName);
  const frozen = JSON.parse(fs.readFileSync(path.join(phase4Root, 'recommendations', `${buildRow.identity}.json`), 'utf8'));
  const phase4 = frozen.recommendations.find((card) => card.card_name === cardName);
  rows.push({
    commander: commanderName,
    card: cardName,
    phase4: phase4 ? { rank: frozen.recommendations.indexOf(phase4) + 1, score: phase4.mechanical_score, ranking_score: phase4.ranking_score, reasons: phase4.mechanical_reasons, components: phase4.score_components } : null,
    current: current ? { rank: currentResult.recommendations.indexOf(current) + 1, score: current.mechanical_score, ranking_score: current.ranking_score, reasons: current.mechanical_reasons, components: current.score_components } : null,
  });
}
console.log(JSON.stringify(rows, null, 2));
