const SECTION_ORDERS = {
  magic: ['Commander', 'Creatures', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Planeswalkers', 'Battles', 'Lands', 'Other'],
  pokemon: ['Pokemon', 'Trainer', 'Energy', 'Other'],
  yugioh: ['Monsters', 'Spells', 'Traps', 'Other'],
  lorcana: ['Characters', 'Actions', 'Songs', 'Items', 'Locations', 'Other'],
  onepiece: ['Leader', 'Characters', 'Events', 'Stages', 'DON!!', 'Other'],
  flesh_and_blood: ['Hero', 'Weapon', 'Equipment', 'Actions', 'Instants', 'Allies', 'Other'],
  starwars: ['Leader', 'Base', 'Units', 'Events', 'Upgrades', 'Other']
};

export function normalizeDeckGame(game) {
  if (game === 'mtg' || game === 'magic_the_gathering') return 'magic';
  if (game === 'fab') return 'flesh_and_blood';
  if (game === 'one_piece') return 'onepiece';
  if (game === 'star_wars' || game === 'star_wars_unlimited') return 'starwars';
  return game || 'magic';
}

export function getDeckSectionOrder(game) {
  const normalizedGame = normalizeDeckGame(game);
  return SECTION_ORDERS[normalizedGame] || SECTION_ORDERS.magic;
}

export function getDeckItemSection(item, game) {
  const normalizedGame = normalizeDeckGame(game);
  const typeLine = String(
    item?.type_line
    || item?.type
    || item?.supertype
    || item?.card_type
    || item?.layout
    || ''
  ).split('//')[0].toLowerCase();

  if (normalizedGame === 'magic') {
    if (item?.is_commander) return 'Commander';
    if (typeLine.includes('land')) return 'Lands';
    if (typeLine.includes('creature')) return 'Creatures';
    if (typeLine.includes('planeswalker')) return 'Planeswalkers';
    if (typeLine.includes('battle')) return 'Battles';
    if (typeLine.includes('instant')) return 'Instants';
    if (typeLine.includes('sorcery')) return 'Sorceries';
    if (typeLine.includes('enchantment')) return 'Enchantments';
    if (typeLine.includes('artifact')) return 'Artifacts';
    return 'Other';
  }

  if (normalizedGame === 'pokemon') {
    if (typeLine.includes('energy')) return 'Energy';
    if (typeLine.includes('trainer')) return 'Trainer';
    if (typeLine.includes('pok')) return 'Pokemon';
    return 'Other';
  }

  if (normalizedGame === 'yugioh') {
    if (typeLine.includes('spell')) return 'Spells';
    if (typeLine.includes('trap')) return 'Traps';
    if (
      typeLine.includes('monster')
      || typeLine.includes('effect')
      || typeLine.includes('fusion')
      || typeLine.includes('synchro')
      || typeLine.includes('xyz')
      || typeLine.includes('link')
      || typeLine.includes('ritual')
      || typeLine.includes('normal')
    ) return 'Monsters';
    return 'Other';
  }

  if (normalizedGame === 'lorcana') {
    if (typeLine.includes('location')) return 'Locations';
    if (typeLine.includes('item')) return 'Items';
    if (typeLine.includes('song')) return 'Songs';
    if (typeLine.includes('action')) return 'Actions';
    if (typeLine.includes('character')) return 'Characters';
    return 'Other';
  }

  if (normalizedGame === 'onepiece') {
    if (typeLine.includes('leader')) return 'Leader';
    if (typeLine.includes('stage')) return 'Stages';
    if (typeLine.includes('event')) return 'Events';
    if (typeLine.includes('don')) return 'DON!!';
    if (typeLine.includes('character')) return 'Characters';
    return 'Other';
  }

  if (normalizedGame === 'flesh_and_blood') {
    if (typeLine.includes('hero')) return 'Hero';
    if (typeLine.includes('weapon')) return 'Weapon';
    if (typeLine.includes('equipment')) return 'Equipment';
    if (typeLine.includes('ally')) return 'Allies';
    if (typeLine.includes('instant')) return 'Instants';
    if (typeLine.includes('action') || typeLine.includes('attack reaction') || typeLine.includes('reaction')) return 'Actions';
    return 'Other';
  }

  if (normalizedGame === 'starwars') {
    if (typeLine.includes('leader')) return 'Leader';
    if (typeLine.includes('base')) return 'Base';
    if (typeLine.includes('upgrade')) return 'Upgrades';
    if (typeLine.includes('event')) return 'Events';
    if (typeLine.includes('unit')) return 'Units';
    return 'Other';
  }

  return 'Other';
}

export function groupDeckItems(items = [], game) {
  const normalizedGame = normalizeDeckGame(game);
  const grouped = items.reduce((acc, item) => {
    const label = getDeckItemSection(item, normalizedGame);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {});

  const orderedLabels = [
    ...getDeckSectionOrder(normalizedGame),
    ...Object.keys(grouped).filter((label) => !getDeckSectionOrder(normalizedGame).includes(label))
  ].filter((label, index, array) => array.indexOf(label) === index);

  return orderedLabels
    .filter((label) => grouped[label]?.length)
    .map((label) => ({
      label,
      totalCards: grouped[label].reduce((sum, item) => sum + (item.quantity || 1), 0),
      items: [...grouped[label]].sort((a, b) => {
        const nameA = String(a?.product_name || a?.name || '').toLowerCase();
        const nameB = String(b?.product_name || b?.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
      })
    }));
}
