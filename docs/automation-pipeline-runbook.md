# Main Phase Market Automation Pipeline Runbook

This is the automation layer for keeping the site fresh without hand-editing pages.

## Core rule

Automations should not be hidden magic.

Each job needs:

- a clear purpose
- a script entry point
- an expected output
- a cadence
- a failure surface

## Current automation families

### 1. Homepage upcoming releases

Purpose:

- build one normalized release feed for the homepage hero banner and release bar

Entry point:

- `npm run automation:homepage`

Current output:

- `public/data/site/upcoming-releases.json`

Current source:

- local per-game set manifests that already exist in `public/data/*/sets.json`

Future source expansion:

- Supabase `Product` preorder records
- vendor release calendars
- internal preorder campaign records

### 2. Catalog refresh

Purpose:

- keep local card/set catalogs current

Entry point:

- `npm run automation:catalog`

Current scope:

- FAB set extraction
- Lorcana set extraction

Planned expansion:

- Pokémon set extraction once local source is restored in this repo copy
- One Piece / Star Wars / Yu-Gi-Oh set extraction once their local data roots are present
- upload/sync step after validation

### 3. Image repair and sync

Purpose:

- ensure user-facing card images are mirrored and available through the shared image pipeline

Entry point:

- `npm run automation:images`

Current scope:

- FAB image mirror
- Lorcana image mirror

Planned expansion:

- One Piece repair/sync
- Pokémon repair/sync
- Star Wars repair/sync
- Yu-Gi-Oh repair/sync
- validation manifests for missing image coverage

### 4. Pricing refresh

Purpose:

- compute Main Phase Market sell prices from external market references

Desired sources:

- Card Kingdom
- TCGplayer
- Star City Games

Desired policy:

- collect market reference values
- normalize by card identity / set / finish / condition
- compute a target price for Main Phase Market instead of exposing three side-by-side competitor prices

Current status:

- architecture registered
- source adapters not implemented yet in this repo

### 5. System health report

Purpose:

- surface stale or missing automation outputs before users discover the problem in the UI

Entry point:

- `npm run automation:health`

Current output:

- `public/data/site/system-health.json`

Current checks:

- homepage release feed freshness
- per-game catalog presence and freshness
- image mirror manifest presence and freshness
- pricing source snapshot freshness
- merged pricing snapshot freshness

Design note:

- the main automation families now rebuild the system health report after they run
- local API health now includes the system report payload when available

## Scheduling recommendation

- Homepage release refresh: daily
- Pricing refresh: every morning
- Catalog refresh: every 2 days
- Image repair/sync: daily

## Design rule

Frontend pages should consume outputs from automations.

They should not be responsible for inventing fallback business logic every time a feed is incomplete.

That means:

- `src/services/homepage/*` consumes normalized release data
- `src/services/search/*` consumes normalized catalog data
- image surfaces consume shared image resolution
- admin/inventory flows consume normalized price/catalog inputs
- operations views and local diagnostics consume normalized health data
