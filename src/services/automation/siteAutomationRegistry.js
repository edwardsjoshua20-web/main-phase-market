export const siteAutomationRegistry = [
  {
    id: 'card-backfill-refresh',
    label: 'Card backfill refresh',
    cadence: 'daily',
    owner: 'catalog',
    runnerJob: 'cards',
    script: 'npm run automation:cards:refresh',
    commands: [
      ['node', 'scripts/run-card-backfill-refresh.mjs']
    ],
    outputs: ['public/data/*/cards.json', 'public/data/*/cards-manifest.json'],
    purpose: 'Refresh raw card catalogs for game pipelines before set extraction, image mirroring, and storefront consumption.'
  },
  {
    id: 'homepage-upcoming-releases',
    label: 'Homepage upcoming releases refresh',
    cadence: 'daily',
    owner: 'homepage',
    runnerJob: 'homepage',
    script: 'npm run automation:homepage',
    commands: [
      ['node', 'scripts/run-homepage-refresh.mjs']
    ],
    outputs: ['public/data/site/upcoming-releases.json'],
    purpose: 'Build one normalized upcoming-release feed for the hero banner and release bar.'
  },
  {
    id: 'catalog-refresh',
    label: 'Catalog refresh',
    cadence: 'every-2-days',
    owner: 'catalog',
    runnerJob: 'catalog',
    script: 'npm run automation:catalog',
    commands: [
      ['node', 'scripts/run-catalog-refresh.mjs']
    ],
    outputs: ['public/data/*/cards.json', 'public/data/*/sets.json'],
    purpose: 'Refresh local card catalogs and normalized set data for all supported games.'
  },
  {
    id: 'image-repair-sync',
    label: 'Image repair and sync',
    cadence: 'daily',
    owner: 'images',
    runnerJob: 'images',
    script: 'npm run automation:images',
    commands: [
      ['node', 'scripts/run-image-refresh.mjs']
    ],
    outputs: ['public/data/*/images', 'public/data/*/mirror-manifest.json'],
    purpose: 'Backfill or repair hosted image mirrors so all user-facing surfaces share the same image pipeline.'
  },
  {
    id: 'pricing-refresh',
    label: 'Pricing refresh',
    cadence: 'daily-morning',
    owner: 'pricing',
    runnerJob: 'pricing',
    script: 'npm run automation:pricing',
    commands: [
      ['node', 'scripts/run-pricing-source-refresh.mjs'],
      ['node', 'scripts/build-pricing-snapshot.mjs']
    ],
    outputs: ['public/data/site/pricing-sources/*.json', 'public/data/site/pricing-snapshot.json'],
    purpose: 'Refresh normalized source snapshots, then compute Main Phase Market target pricing from the merged source pipeline.'
  },
  {
    id: 'system-health-report',
    label: 'System health report',
    cadence: 'hourly',
    owner: 'operations',
    runnerJob: 'health',
    script: 'npm run automation:health',
    commands: [
      ['node', 'scripts/build-site-health-report.mjs']
    ],
    outputs: ['public/data/site/system-health.json'],
    purpose: 'Track freshness and coverage for homepage feeds, catalogs, image mirrors, and pricing so problems are visible before users find them.'
  }
];

export const siteAutomationSections = {
  homepage: ['homepage-upcoming-releases', 'system-health-report'],
  catalogs: ['card-backfill-refresh', 'catalog-refresh'],
  images: ['image-repair-sync'],
  pricing: ['pricing-refresh'],
  readiness: ['system-health-report']
};

export const siteAutomationPipelines = {
  homepage: {
    label: 'Homepage pipeline',
    steps: ['homepage-upcoming-releases', 'system-health-report']
  },
  cards: {
    label: 'Card backfill pipeline',
    steps: ['card-backfill-refresh', 'system-health-report']
  },
  catalog: {
    label: 'Catalog pipeline',
    steps: ['catalog-refresh', 'system-health-report']
  },
  images: {
    label: 'Image pipeline',
    steps: ['image-repair-sync', 'system-health-report']
  },
  pricing: {
    label: 'Pricing pipeline',
    steps: ['pricing-refresh', 'system-health-report']
  },
  health: {
    label: 'Health pipeline',
    steps: ['system-health-report']
  }
};

export function getAutomationJobById(id) {
  return siteAutomationRegistry.find((job) => job.id === id) || null;
}

export function getAutomationPipelineById(id) {
  return siteAutomationPipelines[id] || null;
}

export function getAutomationControlJobMap() {
  return Object.fromEntries(
    siteAutomationRegistry
      .filter((job) => job.id && job.runnerJob)
      .map((job) => [job.id, job.runnerJob])
  );
}
