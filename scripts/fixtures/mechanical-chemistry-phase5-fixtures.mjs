import { PHASE4_COMMANDERS, PHASE4_FIXTURES } from './mechanical-chemistry-phase4-fixtures.mjs';

export const PHASE5_ADDITIONAL_COMMANDERS = Object.freeze([
  { family: 'Graveyard', archetype: 'Creature encore graveyard', names: ['Araumi of the Dead Tide'] },
  { family: 'Graveyard', archetype: 'Creature-count graveyard', names: ['Old Stickfingers'] },
  { family: 'Graveyard', archetype: 'Selective creature graveyard copy', names: ['The Mimeoplasm'] },
  { family: 'Sacrifice', archetype: 'Creature sacrifice and counters', names: ['Yawgmoth, Thran Physician'] },
  { family: 'Sacrifice', archetype: 'Activated sacrifice copying', names: ['Ashnod the Uncaring'] },
  { family: 'Sacrifice', archetype: 'Artifact conversion engine', names: ['Jan Jansen, Chaos Crafter'] },
  { family: 'Control', archetype: 'Asymmetrical spell tax', names: ['Lavinia, Azorius Renegade'] },
  { family: 'Control', archetype: 'Artifact activated control engine', names: ['Shorikai, Genesis Engine'] },
  { family: 'Blink/ETB', archetype: 'Modal ETB interaction', names: ['Ertai Resurrected'] },
  { family: 'Blink/ETB', archetype: 'Creature blink and counter ETB', names: ['Emiel the Blessed'] },
  { family: 'Tribal', archetype: 'Merfolk explore tribal', names: ['Hakbal of the Surging Soul'] },
  { family: 'Tribal', archetype: 'Elf and Wolf attack tribal', names: ['Voja, Jaws of the Conclave'] },
  { family: 'Background', archetype: 'Sacrifice graveyard token Background', names: ['Sivriss, Nightmare Speaker', 'Cloakwood Hermit'] },
  { family: 'Background', archetype: 'Spell recursion graveyard Background', names: ['Gale, Waterdeep Prodigy', 'Scion of Halaster'] },
  { family: 'Background', archetype: 'Blink card-flow Background', names: ["Abdel Adrian, Gorion's Ward", 'Candlekeep Sage'] },
  { family: 'Partner', archetype: 'Combat lifegain partner', names: ['Bruse Tarl, Boorish Herder', 'Ikra Shidiqi, the Usurper'] }
]);

const PHASE5_CASES = Object.freeze([
  ['Buried Alive', "Stitcher's Supplier", 'Entomb', 'Arcane Signet', 'Phantom Monster', "Tormod's Crypt", 'Life from the Loam', 'Mind Funeral', 'Cryptic Command'],
  ['Buried Alive', "Stitcher's Supplier", 'Satyr Wayfinder', 'Arcane Signet', 'Grizzly Bears', "Tormod's Crypt", 'Counterspell', 'Mindcrank', 'Living Death'],
  ['Lively Dirge', 'Entomb', 'Buried Alive', 'Arcane Signet', 'Grizzly Bears', "Tormod's Crypt", 'Swords to Plowshares', 'Mind Funeral', 'The Cruelty of Gix'],
  ['Nest of Scarabs', 'Ophiomancer', 'Blood Artist', 'Arcane Signet', 'Walking Corpse', "Grafdigger's Cage", 'Counterspell', "Altar's Reap", 'Living Death'],
  ['Ruthless Knave', 'Trading Post', "Breya's Apprentice", 'Arcane Signet', 'Phantom Monster', 'Stony Silence', 'Swords to Plowshares', 'Krark-Clan Ironworks', 'Ertai Resurrected'],
  ['Thousand-Year Elixir', 'Ichor Wellspring', 'Marionette Master', 'Arcane Signet', 'Hill Giant', 'Stony Silence', 'Counterspell', 'Shatter', 'Trading Post'],
  ['Drannith Magistrate', "Dovin's Veto", 'Counterspell', 'Arcane Signet', 'Phantom Monster', 'Rule of Law', 'Lightning Bolt', 'Cancel', 'Ertai Resurrected'],
  ['Tolarian Kraken', 'Unwinding Clock', 'Voltaic Key', 'Arcane Signet', 'Phantom Monster', 'Stony Silence', 'Lightning Bolt', 'Panharmonicon', 'Cryptic Command'],
  ['Panharmonicon', 'Ghostly Flicker', 'Displace', 'Arcane Signet', 'Phantom Monster', 'Torpor Orb', 'Swords to Plowshares', 'Cancel', 'Ertai Resurrected'],
  ['Panharmonicon', 'Eternal Witness', 'Cloudshift', 'Arcane Signet', 'Grizzly Bears', 'Torpor Orb', 'Counterspell', 'Pacifism', 'Hushbringer'],
  ['Svyelun of Sea and Sky', 'Deeproot Elite', 'Merfolk Mistbinder', 'Arcane Signet', 'Grizzly Bears', "Grafdigger's Cage", 'Lightning Bolt', 'Common Bond', 'Cryptic Command'],
  ['Hollowhenge Overlord', 'Maskwood Nexus', 'Realmwalker', 'Arcane Signet', 'Grizzly Bears', 'Solemnity', 'Counterspell', 'Common Bond', 'Aurelia, the Warleader'],
  ['Pawn of Ulamog', 'Pitiless Plunderer', "Stitcher's Supplier", 'Arcane Signet', 'Grizzly Bears', "Tormod's Crypt", 'Counterspell', "Altar's Reap", 'Living Death'],
  ['Frantic Search', 'Consider', 'Secrets of the Dead', 'Arcane Signet', 'Phantom Monster', "Tormod's Crypt", 'Lightning Bolt', 'Mind Funeral', 'Cryptic Command'],
  ['Panharmonicon', 'Cloudshift', 'Ephemerate', 'Arcane Signet', 'Phantom Monster', 'Torpor Orb', 'Lightning Bolt', 'Deputy of Acquittals', 'Ertai Resurrected'],
  ['Savage Beating', "Duelist's Heritage", 'Loxodon Warhammer', 'Arcane Signet', 'Hill Giant', 'Sulfuric Vortex', 'Counterspell', 'Giant Growth', 'Adriana, Captain of the Guard']
]);

export const PHASE5_COMMANDERS = Object.freeze([...PHASE4_COMMANDERS, ...PHASE5_ADDITIONAL_COMMANDERS]);

export const PHASE5_FIXTURES = Object.freeze([
  ...PHASE4_FIXTURES,
  ...PHASE5_CASES.map(([obvious_positive, strong_support, moderate_support, generic_utility, weak_negative, anti_synergy, illegal_negative, false_positive_trap, uncertainty_probe]) => ({
    obvious_positive, strong_support, moderate_support, generic_utility, weak_negative, anti_synergy, illegal_negative, false_positive_trap, uncertainty_probe
  }))
]);
