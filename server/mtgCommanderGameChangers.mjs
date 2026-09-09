export const COMMANDER_GAME_CHANGERS_SOURCE = Object.freeze({
  name: 'Magic: The Gathering Commander Format',
  url: 'https://magic.wizards.com/en/formats/commander',
  verifiedAt: '2026-09-09',
  latestUpdateUrl: 'https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-february-9-2026'
});

export const COMMANDER_GAME_CHANGER_NAMES = Object.freeze([
  'Ad Nauseam', 'Ancient Tomb', 'Aura Shards', 'Biorhythm', "Bolas's Citadel",
  'Braids, Cabal Minion', 'Chrome Mox', 'Coalition Victory', 'Consecrated Sphinx',
  'Crop Rotation', 'Cyclonic Rift', 'Demonic Tutor', 'Drannith Magistrate',
  'Enlightened Tutor', 'Farewell', 'Field of the Dead', 'Fierce Guardianship',
  'Force of Will', "Gaea's Cradle", 'Gamble', 'Gifts Ungiven', 'Glacial Chasm',
  'Grand Arbiter Augustin IV', 'Grim Monolith', 'Humility', 'Imperial Seal',
  'Intuition', "Jeska's Will", "Lion's Eye Diamond", "Mishra's Workshop",
  'Mox Diamond', 'Mystical Tutor', 'Narset, Parter of Veils', 'Natural Order',
  'Necropotence', 'Notion Thief', 'Opposition Agent', 'Orcish Bowmasters',
  'Panoptic Mirror', 'Rhystic Study', 'Seedborn Muse', "Serra's Sanctum",
  'Smothering Tithe', 'Survival of the Fittest', "Teferi's Protection",
  'Tergrid, God of Fright', "Thassa's Oracle", 'The One Ring',
  'The Tabernacle at Pendrell Vale', 'Underworld Breach', 'Vampiric Tutor',
  'Worldly Tutor'
]);

function normalizeCardName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

const COMMANDER_GAME_CHANGER_KEYS = new Set(COMMANDER_GAME_CHANGER_NAMES.map(normalizeCardName));

export function isCommanderGameChanger(cardOrName) {
  const name = typeof cardOrName === 'string'
    ? cardOrName
    : cardOrName?.card_name || cardOrName?.name;
  return COMMANDER_GAME_CHANGER_KEYS.has(normalizeCardName(name));
}
