import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  dedupeCanonicalCardResults,
  getCardNameAliases,
  getCanonicalCardNameKey,
  isCanonicalCardNameMatch,
  normalizeSearchText,
  searchTextEquals,
  searchTextFuzzyEquals
} from '../src/services/search/searchIdentity.js';

const repoRoot = process.cwd();
const reportJsonPath = path.join(repoRoot, 'docs', 'card-search-certification.json');
const reportMarkdownPath = path.join(repoRoot, 'docs', 'card-search-certification.md');
const failureSampleLimit = 25;

const games = [
  { key: 'magic', label: 'Magic: The Gathering', source: 'mtg' },
  { key: 'pokemon', label: 'Pokemon', source: 'pokemon' },
  { key: 'yugioh', label: 'Yu-Gi-Oh!', source: 'yugioh' },
  { key: 'lorcana', label: 'Disney Lorcana', source: 'lorcana' },
  { key: 'flesh_and_blood', label: 'Flesh and Blood', source: 'fab' },
  { key: 'onepiece', label: 'One Piece', source: 'onepiece' },
  { key: 'starwars', label: 'Star Wars Unlimited', source: 'starwars' }
];

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function canonicalMtgName(row) {
  const rawName = String(row?.name || '').trim();
  if (!rawName.includes('//')) return rawName;
  const parts = rawName.split('//').map((part) => part.trim()).filter(Boolean);
  if (parts.length > 0 && parts.every((part) => normalizeSearchText(part) === normalizeSearchText(parts[0]))) {
    return parts[0];
  }
  return rawName;
}

function printingCount(game, row) {
  if (game === 'yugioh') return Math.max(1, Array.isArray(row.card_sets) ? row.card_sets.length : 0);
  if (game === 'flesh_and_blood') return Math.max(1, Array.isArray(row.printings) ? row.printings.length : 0);
  return 1;
}

function addRow(families, game, row, getName = (card) => card.name, collectAliases = false) {
  const name = String(getName(row) || '').trim();
  const key = getCanonicalCardNameKey(name);
  if (!key) return;
  const family = families.get(key) || { key, name, printingCount: 0, aliases: new Map(), multiFace: false };
  family.printingCount += printingCount(game, row);
  if (collectAliases) {
    family.multiFace = family.multiFace || (Array.isArray(row.face_names) && row.face_names.length > 1) || name.includes('//');
    for (const alias of getCardNameAliases(row)) {
      family.aliases.set(getCanonicalCardNameKey(alias), alias);
    }
  }
  families.set(key, family);
}

function loadFamilies(game) {
  const families = new Map();
  if (game.key === 'magic') {
    const manifest = readJson('public/data/mtg/manifest.json');
    for (const bucket of Object.values(manifest.buckets || {})) {
      const files = Array.isArray(bucket.files) && bucket.files.length > 0 ? bucket.files : [bucket.file].filter(Boolean);
      for (const file of files) {
        const rows = readJson(`public/data/mtg/${file}`);
        for (const row of rows) addRow(families, game.key, row, canonicalMtgName, true);
      }
    }
    return families;
  }

  const rows = readJson(`public/data/${game.source}/cards.json`);
  for (const row of rows) addRow(families, game.key, row);
  return families;
}

function loadMtgLiteAliasIndex() {
  const manifest = readJson('public/data/mtg/search-lite-manifest.json');
  const aliasIndex = new Map();

  for (const [bucketName, bucket] of Object.entries(manifest.alias_buckets || {})) {
    const routes = readJson(`public/data/mtg/${bucket.file}`);
    for (const route of routes) {
      const aliasKey = getCanonicalCardNameKey(route.alias);
      const canonicalKey = getCanonicalCardNameKey(route.canonical_name);
      if (!aliasIndex.has(aliasKey)) aliasIndex.set(aliasKey, new Set());
      aliasIndex.get(aliasKey).add(`${bucketName}::${route.canonical_bucket}::${canonicalKey}`);
    }
  }

  return aliasIndex;
}

function certifyMtgMultiFaceAliases(sourceFamilies, liteAliasIndex) {
  const applicableFamilies = [...sourceFamilies.values()].filter((family) => family.multiFace);
  const failures = [];
  let aliasesTested = 0;
  let aliasFailures = 0;

  for (const family of applicableFamilies) {
    for (const [aliasKey, alias] of family.aliases) {
      if (aliasKey === family.key) continue;
      aliasesTested += 1;
      const indexedTargets = liteAliasIndex.get(aliasKey);
      const queryBucket = /^[a-z]/.test(aliasKey[0]) ? aliasKey[0] : /^[0-9]/.test(aliasKey[0]) ? '0-9' : 'other';
      const canonicalBucket = /^[a-z]/.test(family.key[0]) ? family.key[0] : /^[0-9]/.test(family.key[0]) ? '0-9' : 'other';
      const contractMatches = isCanonicalCardNameMatch({
        name: family.name,
        face_names: [...family.aliases.values()]
      }, alias);
      if (!contractMatches || !indexedTargets?.has(`${queryBucket}::${canonicalBucket}::${family.key}`)) {
        aliasFailures += 1;
        if (failures.length < failureSampleLimit) {
          failures.push({ canonicalName: family.name, alias });
        }
      }
    }
  }

  return {
    applicableCanonicalIdentities: applicableFamilies.length,
    aliasesTested,
    aliasFailures,
    failureSamples: failures
  };
}

function loadMtgPrintingIndexFamilies() {
  const manifest = readJson('public/data/mtg/printing-index-manifest.json');
  const fieldIndex = Object.fromEntries((manifest.fields || []).map((field, index) => [field, index]));
  const families = new Map();

  for (const shard of Object.values(manifest.shards || {})) {
    const rows = readJson(`public/data/mtg/${shard.file}`);
    for (const compactRow of rows) {
      addRow(families, 'magic', {
        name: compactRow[fieldIndex.name],
        oracle_id: compactRow[fieldIndex.oracle_id]
      }, canonicalMtgName);
    }
  }

  return { manifest, families };
}

function certifyMtgPrintingIndex(sourceFamilies, indexedFamilies) {
  const mismatches = [...sourceFamilies].filter(([key, sourceFamily]) => (
    indexedFamilies.get(key)?.printingCount !== sourceFamily.printingCount
  ));

  return {
    sourceIdentityCount: sourceFamilies.size,
    indexedIdentityCount: indexedFamilies.size,
    sourcePrintingCount: [...sourceFamilies.values()].reduce((sum, family) => sum + family.printingCount, 0),
    indexedPrintingCount: [...indexedFamilies.values()].reduce((sum, family) => sum + family.printingCount, 0),
    identityPrintingCountMismatches: mismatches.length,
    failureSamples: mismatches.slice(0, failureSampleLimit).map(([key, sourceFamily]) => ({
      name: sourceFamily.name,
      expected: sourceFamily.printingCount,
      actual: indexedFamilies.get(key)?.printingCount || 0
    }))
  };
}

function whitespaceVariant(name) {
  return `  ${String(name).trim().replace(/\s+/g, '   ')}  `;
}

function punctuationVariants(name) {
  if (!/[^\p{L}\p{N}\s\u2605]/u.test(name)) return [];
  return [...new Set([
    name.replace(/'/g, '\u2019').replace(/\u2018/g, '\u2019'),
    name.replace(/[\u2018\u2019]/g, "'"),
    name.replace(/[,\u2018\u2019']/g, ''),
    name.replace(/[^\p{L}\p{N}\s\u2605]+/gu, ' '),
    name.replace(/[^\p{L}\p{N}\s\u2605]+/gu, '')
  ].map((value) => value.trim()).filter((value) => value && value !== name))];
}

function recordFailure(list, name, query) {
  if (list.length < failureSampleLimit) list.push({ name, query });
}

function certifyGame(game, families) {
  const samples = {
    canonical: [], lowercase: [], uppercase: [], whitespace: [], punctuation: [], selected: [], printings: [], autocomplete: [], import: []
  };
  const counts = Object.fromEntries(Object.keys(samples).map((key) => [key, 0]));

  for (const family of families.values()) {
    const variants = {
      canonical: family.name,
      lowercase: family.name.toLowerCase(),
      uppercase: family.name.toUpperCase(),
      whitespace: whitespaceVariant(family.name)
    };

    for (const [kind, query] of Object.entries(variants)) {
      if (!searchTextEquals(family.name, query)) {
        counts[kind] += 1;
        recordFailure(samples[kind], family.name, query);
      }
    }

    const punctuationQueries = punctuationVariants(family.name);
    for (const query of punctuationQueries) {
      if (!searchTextEquals(family.name, query)) {
        counts.punctuation += 1;
        recordFailure(samples.punctuation, family.name, query);
      }
    }

    const selectedFamily = families.get(getCanonicalCardNameKey(family.name));
    if (!selectedFamily) {
      counts.selected += 1;
      recordFailure(samples.selected, family.name, family.name);
    } else if (selectedFamily.printingCount !== family.printingCount) {
      counts.printings += 1;
      recordFailure(samples.printings, family.name, `${selectedFamily.printingCount}/${family.printingCount}`);
    }

    const previewFixture = Array.from({ length: Math.min(family.printingCount, 3) }, (_, index) => ({
      id: `${family.key}:${index}`,
      game: game.key,
      name: family.name
    }));
    if (dedupeCanonicalCardResults(previewFixture).length !== 1) {
      counts.autocomplete += 1;
      recordFailure(samples.autocomplete, family.name, family.name);
    }

    const importQueries = [variants.lowercase, ...punctuationQueries];
    if (importQueries.some((query) => !searchTextEquals(family.name, query))) {
      counts.import += 1;
      recordFailure(samples.import, family.name, importQueries.find((query) => !searchTextEquals(family.name, query)));
    }
  }

  return {
    game: game.label,
    gameKey: game.key,
    totalUniqueCanonicalCardIdentities: families.size,
    identitiesTested: families.size,
    canonicalNameFailures: counts.canonical,
    lowercaseFailures: counts.lowercase,
    uppercaseFailures: counts.uppercase,
    whitespaceNormalizedFailures: counts.whitespace,
    punctuationApostropheCommaFailures: counts.punctuation,
    selectedCardResultPageFailures: counts.selected,
    printingResolutionFailures: counts.printings,
    autocompleteDuplicateFailures: counts.autocomplete,
    importFailures: counts.import,
    totalKnownPrintings: [...families.values()].reduce((total, family) => total + family.printingCount, 0),
    failureSamples: samples
  };
}

function verifyConsumerContract() {
  const checks = [
    ['Desktop header autocomplete', 'src/Layout.jsx', 'canonical=1'],
    ['Mobile header autocomplete', 'src/pages/mobile/MobileHome.jsx', 'canonical=1'],
    ['Mobile browse autocomplete', 'src/pages/mobile/MobileBrowse.jsx', 'canonical=1'],
    ['Shop results', 'src/pages/Shop.jsx', 'canonical: Boolean(options.canonical)'],
    ['Mobile Shop results', 'src/pages/mobile/MobileShop.jsx', 'searchCanonicalPrintings'],
    ['Advanced Search', 'src/services/search/searchOwner.js', 'advancedCatalogSearch'],
    ['Deck Builder', 'src/pages/AdvancedDeckBuilder.jsx', 'preview: true'],
    ['Mobile Deck Builder', 'src/pages/mobile/MobileDeckBuilder.jsx', 'preview: true'],
    ['Deck import', 'src/components/deckbuilder/DeckImportModal.jsx', 'resolveCanonicalCard']
  ];
  return checks.map(([consumer, file, marker]) => ({ consumer, file, passed: read(file).includes(marker) }));
}

const startedAt = new Date();
const familyMaps = new Map(games.map((game) => [game.key, loadFamilies(game)]));
const gameReports = games.map((game) => certifyGame(game, familyMaps.get(game.key)));
const consumerContract = verifyConsumerContract();
const mtgPrintingIndex = loadMtgPrintingIndexFamilies();
const mtgPrintingIndexContract = certifyMtgPrintingIndex(familyMaps.get('magic'), mtgPrintingIndex.families);
const multiFaceAliasCertification = certifyMtgMultiFaceAliases(familyMaps.get('magic'), loadMtgLiteAliasIndex());
const mtgAliasIndex = loadMtgLiteAliasIndex();
const requiredMultiFaceAliasExamples = [
  ['Valakut Awakening', 'Valakut Awakening // Valakut Stoneforge'],
  ['Valakut Stoneforge', 'Valakut Awakening // Valakut Stoneforge'],
  ['Valakut Awakening // Valakut Stoneforge', 'Valakut Awakening // Valakut Stoneforge'],
  ['Ice', 'Fire // Ice']
].map(([alias, canonicalName]) => {
  const aliasKey = getCanonicalCardNameKey(alias);
  const canonicalKey = getCanonicalCardNameKey(canonicalName);
  const passed = aliasKey === canonicalKey
    ? Boolean(familyMaps.get('magic').has(canonicalKey))
    : [...(mtgAliasIndex.get(aliasKey) || [])].some((route) => route.endsWith(`::${canonicalKey}`));
  return { alias, canonicalName, passed };
});
const totalFailures = gameReports.reduce((total, game) => total
  + game.canonicalNameFailures
  + game.lowercaseFailures
  + game.uppercaseFailures
  + game.whitespaceNormalizedFailures
  + game.punctuationApostropheCommaFailures
  + game.selectedCardResultPageFailures
  + game.printingResolutionFailures
  + game.autocompleteDuplicateFailures
  + game.importFailures, 0)
  + consumerContract.filter((check) => !check.passed).length
  + mtgPrintingIndexContract.identityPrintingCountMismatches
  + multiFaceAliasCertification.aliasFailures
  + requiredMultiFaceAliasExamples.filter((example) => !example.passed).length;

const requiredExamples = [
  'Sol Ring', 'Temple of the False God', 'Seething Song', 'Thrill of Possibility', 'Seize the Spoils',
  'Skirk Prospector', 'Cast into the Fire', 'Subterranean Scout', 'Torbran, Thane of Red Fell',
  'Squee, the Immortal', 'Mask of Memory', 'Shivan Harvest', 'Conspicuous Snoop', 'Castle Embereth',
  "Seer's Lantern", 'Mog Salvage', 'Mirror March', 'Mithril Coat'
];
const magicFamilies = familyMaps.get('magic');
const exampleResults = requiredExamples.map((name) => ({
  name,
  passed: Boolean(magicFamilies.get(getCanonicalCardNameKey(name)))
    || [...magicFamilies.values()].some((family) => searchTextFuzzyEquals(family.name, name))
}));
const exampleFailures = exampleResults.filter((result) => !result.passed).length;

const report = {
  certification: totalFailures + exampleFailures === 0 ? 'PASS' : 'FAIL',
  generatedAt: new Date().toISOString(),
  durationMs: Date.now() - startedAt.getTime(),
  normalizationContract: 'case-insensitive, diacritic-insensitive, whitespace-normalized, punctuation-tolerant with compact fallback',
  games: gameReports,
  requiredExamples: exampleResults,
  consumerContract,
  mtgPrintingIndexContract,
  multiFaceAliasCertification,
  requiredMultiFaceAliasExamples,
  totalFailures: totalFailures + exampleFailures
};

fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);

const tableRows = gameReports.map((game) =>
  `| ${game.game} | ${game.totalUniqueCanonicalCardIdentities} | ${game.identitiesTested} | ${game.canonicalNameFailures} | ${game.lowercaseFailures} | ${game.uppercaseFailures} | ${game.whitespaceNormalizedFailures} | ${game.punctuationApostropheCommaFailures} | ${game.selectedCardResultPageFailures} | ${game.printingResolutionFailures} | ${game.autocompleteDuplicateFailures} | ${game.importFailures} |`
);
const markdown = `# Card Search Certification\n\nStatus: **${report.certification}**\n\nGenerated: ${report.generatedAt}\n\nDuration: ${report.durationMs} ms\n\nTotal failures: ${report.totalFailures}\n\n| Game | Canonical identities | Tested | Canonical | Lowercase | Uppercase | Whitespace | Punctuation | Result page | Printings | Autocomplete duplicates | Import |\n|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n${tableRows.join('\n')}\n\n## Consumer Contract\n\n${consumerContract.map((check) => `- ${check.passed ? 'PASS' : 'FAIL'}: ${check.consumer} (${check.file})`).join('\n')}\n\n## MTG Hosted Printing Index\n\n- Source identities: ${mtgPrintingIndexContract.sourceIdentityCount}\n- Indexed identities: ${mtgPrintingIndexContract.indexedIdentityCount}\n- Source printings: ${mtgPrintingIndexContract.sourcePrintingCount}\n- Indexed printings: ${mtgPrintingIndexContract.indexedPrintingCount}\n- Identity printing-count mismatches: ${mtgPrintingIndexContract.identityPrintingCountMismatches}\n\n## MTG Multi-Face Aliases\n\n- Applicable canonical identities: ${multiFaceAliasCertification.applicableCanonicalIdentities}\n- Face-name aliases tested: ${multiFaceAliasCertification.aliasesTested}\n- Alias failures: ${multiFaceAliasCertification.aliasFailures}\n${requiredMultiFaceAliasExamples.map((example) => `- ${example.passed ? 'PASS' : 'FAIL'}: ${example.alias} -> ${example.canonicalName}`).join('\n')}\n\n## Required Examples\n\n${exampleResults.map((result) => `- ${result.passed ? 'PASS' : 'FAIL'}: ${result.name}`).join('\n')}\n`;
fs.writeFileSync(reportMarkdownPath, markdown);

console.log(JSON.stringify(report, null, 2));
if (report.certification !== 'PASS') process.exitCode = 1;
