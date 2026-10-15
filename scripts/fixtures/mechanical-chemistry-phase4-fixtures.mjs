import { VALIDATION_COMMANDERS as PHASE3_COMMANDERS } from '../build-mechanical-chemistry.mjs';

export const PHASE4_ADDITIONAL_COMMANDERS = Object.freeze([
  { family: 'Control', archetype: 'Spells-matter control', names: ['Talrand, Sky Summoner'] },
  { family: 'Control', archetype: 'Permission control', names: ['Baral, Chief of Compliance'] },
  { family: 'Control', archetype: 'Flash control', names: ["Nymris, Oona's Trickster"] },
  { family: 'Group slug', archetype: 'Cast punishment', names: ['Kambal, Consul of Allocation'] },
  { family: 'Group slug', archetype: 'Damage amplification', names: ['Torbran, Thane of Red Fell'] },
  { family: 'Group slug', archetype: 'Land punishment', names: ['Zo-Zu the Punisher'] },
  { family: 'Group slug', archetype: 'Incremental life-loss payoff', names: ['Ob Nixilis, Captive Kingpin'] },
  { family: 'Tribal', archetype: 'Elf tribal', names: ['Lathril, Blade of the Elves'] },
  { family: 'Tribal', archetype: 'Dragon copy tribal', names: ['Miirym, Sentinel Wyrm'] },
  { family: 'Tribal', archetype: 'Dragon cost reduction', names: ['The Ur-Dragon'] },
  { family: 'Tribal', archetype: 'Cat combat tribal', names: ['Arahbo, Roar of the World'] },
  { family: 'Graveyard', archetype: 'Creature self-mill', names: ['Sidisi, Brood Tyrant'] },
  { family: 'Graveyard', archetype: 'Creature recursion', names: ['Karador, Ghost Chieftain'] },
  { family: 'Sacrifice', archetype: 'Permanent sacrifice counters', names: ['Mazirek, Kraul Death Priest'] },
  { family: 'Sacrifice', archetype: 'Sacrifice growth/burn', names: ['Juri, Master of the Revue'] },
  { family: 'Partner', archetype: 'Mana/damage partner bridge', names: ['Kydele, Chosen of Kruphix', 'Vial Smasher the Fierce'] },
  { family: 'Partner', archetype: 'Combat/token partner bridge', names: ['Malcolm, Keen-Eyed Navigator', 'Tana, the Bloodsower'] },
  { family: 'Background', archetype: 'Voltron Background pair', names: ['Wilson, Refined Grizzly', 'Raised by Giants'] },
  { family: 'Background', archetype: 'Sacrifice/token Background pair', names: ['Gut, True Soul Zealot', 'Inspiring Leader'] },
  { family: 'Partner', archetype: 'Equipment partner bridge', names: ['Ardenn, Intrepid Archaeologist', 'Rograkh, Son of Rohgahh'] }
]);

function familyFor(archetype) {
  const value = archetype.toLowerCase();
  if (value.includes('partner')) return 'Partner';
  if (value.includes('background')) return 'Background';
  if (value.includes('control')) return 'Control';
  if (value.includes('slug') || value.includes('wheel')) return 'Group slug';
  if (value.includes('tribal') || value.includes('eminence')) return 'Tribal';
  if (value.includes('graveyard') || value.includes('reanimator')) return 'Graveyard';
  if (value.includes('sacrifice') || value.includes('aristocrat')) return 'Sacrifice';
  if (value.includes('token')) return 'Tokens';
  if (value.includes('spell') || value.includes('targeted')) return 'Spellslinger';
  if (value.includes('counter')) return 'Counters';
  if (value.includes('aura') || value.includes('voltron')) return 'Voltron/Auras';
  if (value.includes('blink') || value.includes('etb')) return 'Blink/ETB';
  if (value.includes('artifact')) return 'Artifacts';
  if (value.includes('treasure')) return 'Treasure';
  if (value.includes('land')) return 'Lands';
  if (value.includes('mill')) return 'Mill';
  if (value.includes('combat') || value.includes('attack')) return 'Combat';
  return archetype.split('/')[0].trim();
}

export const PHASE4_COMMANDERS = Object.freeze([
  ...PHASE3_COMMANDERS.map((entry) => ({ ...entry, family: familyFor(entry.archetype) })),
  ...PHASE4_ADDITIONAL_COMMANDERS
]);

const PHASE3_CASES = [
  ['Pitiless Plunderer', 'Pawn of Ulamog', 'Healing Salve', 'Counterspell', "Basri's Lieutenant"],
  ['Frantic Search', 'Fact or Fiction', 'Phantom Monster', 'Swords to Plowshares', 'Opt'],
  ['Evolution Sage', 'Thrummingbird', 'Grizzly Bears', 'Lightning Bolt', 'Common Bond'],
  ['Anointed Procession', 'Second Harvest', 'Healing Salve', 'Counterspell', 'Raise the Alarm'],
  ['Sai, Master Thopterist', 'Thought Monitor', 'Phantom Monster', 'Lightning Bolt', 'Cancel'],
  ["Enchantress's Presence", 'Mesa Enchantress', 'Grizzly Bears', 'Counterspell', 'Pacifism'],
  ["Stitcher's Supplier", 'Satyr Wayfinder', 'Grizzly Bears', 'Lightning Bolt', "Tormod's Crypt"],
  ['Life from the Loam', 'World Shaper', 'Grizzly Bears', 'Counterspell', 'Evolving Wilds'],
  ['Carrion Feeder', 'Diregraf Captain', 'Unsummon', 'Lightning Bolt', 'Walking Corpse'],
  ['Flickering Ward', 'All That Glitters', 'Healing Salve', 'Counterspell', 'Pacifism'],
  ['Panharmonicon', 'Cloudblazer', 'Healing Salve', 'Lightning Bolt', 'Deputy of Acquittals'],
  ['Bruvac the Grandiloquent', 'Mind Funeral', 'Negate', 'Lightning Bolt', 'Tome Scour'],
  ['Soul Warden', "Ajani's Pridemate", 'Healing Salve', 'Counterspell', 'Revitalize'],
  ['Combat Celebrant', 'Adriana, Captain of the Guard', 'Healing Salve', 'Counterspell', 'Relentless Assault'],
  ['Counterspell', 'Azorius Signet', 'Ornithopter', 'Lightning Bolt', 'Cancel'],
  ['Sulfuric Vortex', 'Roiling Vortex', 'Ornithopter', 'Counterspell', 'Lava Axe'],
  ['Xorn', 'Big Score', 'Shock', 'Counterspell', "Pirate's Pillage"],
  ['Viscera Seer', 'Mayhem Devil', 'Grizzly Bears', 'Counterspell', "Altar's Reap"],
  ['Birds of Paradise', 'Seedborn Muse', 'Grizzly Bears', 'Lightning Bolt', 'Divination'],
  ['Professional Face-Breaker', 'Morbid Opportunist', 'Duress', 'Swords to Plowshares', 'Fervent Strike'],
  ['Captivating Vampire', 'Blood Artist', 'Walking Corpse', 'Counterspell', 'Vampire Noble'],
  ['Righteous Valkyrie', 'Youthful Valkyrie', 'Healing Salve', 'Counterspell', 'Serra Angel'],
  ['Skirk Prospector', 'Goblin Instigator', 'Shock', 'Counterspell', 'Goblin Hero'],
  ['Ingenious Infiltrator', 'Moon-Circuit Hacker', 'Cancel', 'Lightning Bolt', 'Phantom Ninja'],
  ['Aurelia, the Warleader', 'Adriana, Captain of the Guard', 'Duress', 'Counterspell', 'Hill Giant'],
  ['Panharmonicon', 'Cloudblazer', 'Healing Salve', 'Lightning Bolt', 'Momentary Blink'],
  ['Parallel Lives', 'Squirrel Nest', 'Grizzly Bears', 'Counterspell', 'Acorn Harvest'],
  ['Viscera Seer', 'Sakura-Tribe Elder', 'Grizzly Bears', 'Counterspell', 'Raise Dead'],
  ['Exploration', 'Tireless Provisioner', 'Grizzly Bears', 'Swords to Plowshares', 'Evolving Wilds'],
  ['Ethereal Armor', 'Sram, Senior Edificer', 'Healing Salve', 'Counterspell', 'Pacifism'],
  ['Expedite', 'Defiant Strike', 'Hill Giant', 'Counterspell', 'Young Pyromancer'],
  ['Underworld Dreams', 'Windfall', 'Ornithopter', 'Swords to Plowshares', 'Divination'],
  ['Faithless Looting', 'Myr Retriever', 'Grizzly Bears', 'Counterspell', 'Shatter'],
  ['Defiant Strike', 'Expedite', 'Hill Giant', 'Counterspell', 'Young Pyromancer'],
  ['Mesmeric Orb', 'Satyr Wayfinder', 'Grizzly Bears', 'Lightning Bolt', 'Bruvac the Grandiloquent'],
  ['Fume Spitter', 'Nest of Scarabs', 'Grizzly Bears', 'Counterspell', 'Common Bond'],
  ['Faithless Looting', "Sevinne's Reclamation", 'Grizzly Bears', 'Doom Blade', 'Relentless Assault'],
  ['Radiant Solar', "Stitcher's Supplier", 'Grizzly Bears', 'Lightning Bolt', 'Raise Dead'],
  ['Panharmonicon', 'Cloudblazer', 'Grizzly Bears', 'Lightning Bolt', 'Momentary Blink'],
  ['Frantic Search', 'Fact or Fiction', 'Phantom Monster', 'Swords to Plowshares', 'Opt']
];

const PHASE4_CASES = [
  ['Frantic Search', 'Murmuring Mystic', 'Phantom Monster', 'Lightning Bolt', 'Cancel'],
  ['Mystical Dispute', 'Counterspell', 'Phantom Monster', 'Lightning Bolt', 'Cancel'],
  ['Wavebreak Hippocamp', 'Fact or Fiction', 'Walking Corpse', 'Lightning Bolt', 'Divination'],
  ['Esper Sentinel', 'Painful Quandary', 'Grizzly Bears', 'Lightning Bolt', 'Healing Salve'],
  ['Solphim, Mayhem Dominus', 'Sulfuric Vortex', 'Ornithopter', 'Counterspell', 'Lava Axe'],
  ['Ankh of Mishra', 'Manabarbs', 'Goblin Hero', 'Counterspell', 'Stone Rain'],
  ['All Will Be One', 'Impact Tremors', 'Hill Giant', 'Counterspell', 'Lava Axe'],
  ['Parallel Lives', 'Elvish Archdruid', 'Walking Corpse', 'Counterspell', 'Elvish Visionary'],
  ['Lathliss, Dragon Queen', 'Dragon Tempest', 'Grizzly Bears', 'Swords to Plowshares', 'Shivan Dragon'],
  ['Lathliss, Dragon Queen', "Herald's Horn", 'Walking Corpse', 'Black Lotus', 'Shivan Dragon'],
  ['Regal Caracal', 'Feline Sovereign', 'Grizzly Bears', 'Counterspell', 'Savannah Lions'],
  ['Undead Butler', "Stitcher's Supplier", 'Grizzly Bears', 'Lightning Bolt', 'Mind Funeral'],
  ["Stitcher's Supplier", 'Buried Alive', 'Grizzly Bears', 'Lightning Bolt', 'Tome Scour'],
  ['Viscera Seer', 'Sakura-Tribe Elder', 'Grizzly Bears', 'Counterspell', "Altar's Reap"],
  ['Carrion Feeder', 'Goblin Bombardment', 'Hill Giant', 'Counterspell', 'Bone Splinters'],
  ['Niv-Mizzet, the Firemind', 'Treasure Cruise', 'Grizzly Bears', 'Swords to Plowshares', 'Divination'],
  ['Corsair Captain', 'Professional Face-Breaker', 'Walking Corpse', 'Swords to Plowshares', 'Hill Giant'],
  ['Strong Back', 'Rancor', 'Walking Corpse', 'Doom Blade', 'Giant Growth'],
  ['Aurelia, the Warleader', 'Impact Tremors', 'Hill Giant', 'Counterspell', 'Raise the Alarm'],
  ['Ethereal Armor', 'Colossus Hammer', 'Walking Corpse', 'Doom Blade', 'Bone Saw']
];

export const PHASE4_FIXTURES = Object.freeze([
  ...PHASE3_CASES.map(([obvious_positive, strong_support, weak_negative, illegal_negative, false_positive_trap]) => ({ obvious_positive, strong_support, moderate_support: strong_support, generic_utility: 'Arcane Signet', weak_negative, anti_synergy: false_positive_trap, illegal_negative, false_positive_trap })),
  ...PHASE4_CASES.map(([obvious_positive, strong_support, weak_negative, illegal_negative, false_positive_trap]) => ({ obvious_positive, strong_support, moderate_support: strong_support, generic_utility: 'Arcane Signet', weak_negative, anti_synergy: false_positive_trap, illegal_negative, false_positive_trap, uncertainty_probe: 'Cryptic Command' }))
]);
