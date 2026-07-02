# Pricing source acquisition pipeline

This project now treats pricing as a two-stage pipeline instead of one big script:

1. Source acquisition
2. Price merge and publication

## Stage 1: source acquisition

Each market source lands in its own normalized snapshot:

- `public/data/site/pricing-sources/cardkingdom.json`
- `public/data/site/pricing-sources/tcgplayer.json`
- `public/data/site/pricing-sources/starcitygames.json`

All source imports now flow through one shared ingestion layer:

- `scripts/lib/pricing-source-pipeline.mjs`

That shared layer handles:

- csv/json input parsing
- field normalization
- game/finish/language normalization
- writing source snapshots into one canonical directory

## Stage 2: price merge and publication

Once source snapshots exist, the pricing publish step runs:

- `scripts/build-pricing-snapshot.mjs`

That step:

- loads all source snapshots
- builds card identity keys
- merges matching rows
- applies the site pricing policy
- writes `public/data/site/pricing-snapshot.json`

## Scheduled automation structure

The daily pricing automation now runs in this order:

1. `npm run pricing:refresh:sources`
2. `npm run automation:pricing`

Internally, `automation:pricing` now means:

1. refresh source snapshots
2. rebuild merged site pricing

## Config-driven intake

Use this example as the template for scheduled source intake:

- `config/pricing-source-refresh.example.json`

Create a real file at:

- `config/pricing-source-refresh.json`

This repo now includes a working starter config that points at the template/demo imports so the pricing automation runs end-to-end immediately. Replace those input paths with your real morning source files when you switch from seeded data to live acquisition.

Example shape:

```json
{
  "jobs": [
    { "source": "cardkingdom", "input": "imports/cardkingdom/latest.csv", "enabled": true },
    { "source": "tcgplayer", "input": "imports/tcgplayer/latest.csv", "enabled": true },
    { "source": "starcitygames", "input": "imports/starcitygames/latest.csv", "enabled": true }
  ]
}
```

## Why this matters

This keeps the system structured:

- acquisition is separate from pricing policy
- each source is isolated but normalized
- site pricing only depends on normalized snapshots
- future bots can feed the same intake layer without touching storefront code

That is the foundation for adding:

- approved export adapters
- scheduled collectors
- validation and freshness checks
- alerting when a source feed goes stale
