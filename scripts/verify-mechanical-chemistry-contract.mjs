import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadCanonicalCards, VALIDATION_COMMANDERS } from './build-mechanical-chemistry.mjs';
import { buildCommanderSemanticProfile, buildSemanticCardProfile, checkMechanicalCandidateLegality } from '../src/services/commander/mechanicalChemistryCore.js';

const OUTPUT_ROOT = process.platform === 'win32' ? 'D:\\DevCache\\main-phase-market\\mechanical-chemistry\\phase3' : path.resolve('.devcache', 'mechanical-chemistry', 'phase3');
if (process.platform === 'win32' && /^c:/i.test(path.resolve(OUTPUT_ROOT).replace(/\\/g, '/'))) throw new Error(`Refusing C: output: ${OUTPUT_ROOT}`);
const rawCards = loadCanonicalCards();
const cards = rawCards.map((card) => ({ ...card, ...buildSemanticCardProfile(card) }));
const byName = new Map(cards.map((card) => [card.name, card]));
const oracleIds = new Set(cards.map((card) => card.oracle_id));
const checks = [];
const check = (id, condition, detail) => { assert.ok(condition, `${id}: ${detail}`); checks.push({ id, status: 'PASS', detail }); };

check('canonical-pool-size', cards.length >= 30000, `${cards.length} canonical English Oracle cards`);
check('canonical-oracle-uniqueness', oracleIds.size === cards.length, `${oracleIds.size}/${cards.length} unique Oracle ids`);
check('legality-attached', cards.every((card) => card.legalities && typeof card.legalities.commander === 'string'), 'Every profile carries a Commander legality value.');
check('validation-commanders-found', VALIDATION_COMMANDERS.every((entry) => entry.names.every((name) => byName.has(name))), 'All 40 configuration commanders exist in the canonical pool.');

const partnerDefinition = VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Partner pair');
const backgroundDefinition = VALIDATION_COMMANDERS.find((entry) => entry.archetype === 'Background pair');
const partner = buildCommanderSemanticProfile(partnerDefinition.names.map((name) => byName.get(name)));
const background = buildCommanderSemanticProfile(backgroundDefinition.names.map((name) => byName.get(name)));
check('partner-members-preserved', partner.members.length === 2, partner.commander_names.join(' + '));
check('partner-identity-union', ['W', 'U', 'B', 'G'].every((color) => partner.color_identity.includes(color)) && partner.color_identity.length === 4, partner.color_identity.join(''));
check('background-members-preserved', background.members.length === 2, background.commander_names.join(' + '));
check('background-identity-union', background.color_identity.join('') === 'BR', background.color_identity.join(''));

const teysa = buildCommanderSemanticProfile(byName.get('Teysa Karlov'));
check('off-color-rejected', !checkMechanicalCandidateLegality(teysa, byName.get('Counterspell')).legal, 'Counterspell is outside Teysa color identity.');
check('unknown-legality-fails-closed', !checkMechanicalCandidateLegality(teysa, { ...byName.get('Viscera Seer'), legalities: undefined, legal_commander: undefined }).legal, 'Unknown legality is ineligible.');

const report = { schema_version: 3, status: 'PASS', generated_at: new Date().toISOString(), card_count: cards.length, checks };
fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_ROOT, 'legality-corpus-contract.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
