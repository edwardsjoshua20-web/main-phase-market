export const siteAutomationRegistry = [
  {
    id: 'card-backfill-refresh',
    label: 'Card backfill refresh',
    cadence: 'daily',
    owner: 'catalog',
    script: 'npm run automation:cards:refresh',
    outputs: ['public/data/*/cards.json', 'public/data/*/cards-manifest.json'],
    purpose: 'Refresh raw card catalogs for game pipelines before set extraction, image mirroring, and storefront consumption.'
  },
  {
    id: 'homepage-upcoming-releases',
    label: 'Homepage upcoming releases refresh',
    cadence: 'daily',
    owner: 'homepage',
    script: 'npm run automation:homepage',
    outputs: ['public/data/site/upcoming-releases.json'],
    purpose: 'Build one normalized upcoming-release feed for the hero banner and release bar.'
  },
  {
    id: 'catalog-refresh',
    label: 'Catalog refresh',
    cadence: 'every-2-days',
    owner: 'catalog',
    script: 'npm run automation:catalog',
    outputs: ['public/data/*/cards.json', 'public/data/*/sets.json'],
    purpose: 'Refresh local card catalogs and normalized set data for all supported games.'
  },
  {
    id: 'image-repair-sync',
    label: 'Image repair and sync',
    cadence: 'daily',
    owner: 'images',
    script: 'npm run automation:images',
    outputs: ['public/data/*/images', 'public/data/*/mirror-manifest.json'],
    purpose: 'Backfill or repair hosted image mirrors so all user-facing surfaces share the same image pipeline.'
  },
  {
    id: 'pricing-refresh',
    label: 'Pricing refresh',
    cadence: 'daily-morning',
    owner: 'pricing',
    script: 'npm run automation:pricing',
    outputs: ['public/data/site/pricing-sources/*.json', 'public/data/site/pricing-snapshot.json'],
    purpose: 'Refresh normalized source snapshots, then compute Main Phase Market target pricing from the merged source pipeline.'
  },
  {
    id: 'system-health-report',
    label: 'System health report',
    cadence: 'hourly',
    owner: 'operations',
    script: 'npm run automation:health',
    outputs: ['public/data/site/system-health.json'],
    purpose: 'Track freshness and coverage for homepage feeds, catalogs, image mirrors, and pricing so problems are visible before users find them.'
  }
];

export function getAutomationJobById(id) {
  return siteAutomationRegistry.find((job) => job.id === id) || null;
}
