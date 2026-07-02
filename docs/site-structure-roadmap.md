# Main Phase Market Site Structure Roadmap

This is the working plan for turning Main Phase Market into a clean, business-grade system instead of a pile of page-specific patches.

## What "good structure" means here

The site should be organized around a few shared pipelines:

1. Image pipeline
   - One shared card image resolver
   - One shared card image component
   - Pages pass card data in; they do not reinvent fallback logic

2. Search pipeline
   - Header search, shop search, commander search, and deck-builder search should use shared search services
   - Page components should not each decide how raw catalog records are normalized

3. Commander pipeline
   - Commander Hub and Commander Detail should consume a shared commander service layer
   - Theme filters, synergy slices, type distribution, and average deck data should be computed in one place

4. Inventory pipeline
   - Card lookup, add-single-card, add-batch-card, and product normalization should run through shared inventory mappers
   - Admin inventory pages should not do ad hoc card-shape conversion

5. Community pipeline
   - Forum threads, replies, deck sharing, and post creation should use one action pipeline
   - UI should only call actions, not reimplement auth/data behavior per page

6. Homepage content pipeline
   - Hero banner, upcoming set releases, featured products, and rotating content should be driven by prepared data
   - Daily/weekly automation should refresh content inputs instead of manual page edits

7. Automation pipeline
   - Scheduled jobs should live as their own layer
   - Pricing refresh, upcoming release refresh, card catalog refresh, and image refresh should be independently runnable

## Current reality

The full repo already has useful building blocks:

- `src/lib/cardImages.js`
- `src/lib/*LocalCatalog.js`
- `src/lib/mtgCommanderCatalog.js`
- `src/services/backend.js`
- `src/services/providers/*`
- `server/*`
- `scripts/*`

But a lot of UI still reaches into those pieces directly and repeats logic across pages.

That means the app works in many places, but its behavior is too page-specific. That is what makes bugs feel random.

## What we changed first

We switched work from the snapshot into the real full repo and created a shared UI image primitive:

- `src/components/cards/CardImage.jsx`

This component now centralizes:

- candidate image fallback rotation
- image exhaustion handling
- fallback rendering
- lazy loading behavior

It has already been wired into key user-facing surfaces:

- Commander Hub
- Commander Detail image tiles
- Shop search result cards
- Deck Builder search/deck image blocks

This is the first real "pipeline over patch" move in the full repo.

## Next phases

### Phase 1: Finish the image pipeline rollout

Move remaining user-facing image usage to the shared component, especially:

- layout/global search results
- mobile header search
- shop card grids
- admin inventory card previews
- deck playtester and stack views

Goal:

- one image rendering path across the site

### Phase 2: Search service extraction

Create dedicated search services/hooks so pages stop mixing UI with catalog normalization.

Target seams:

- `src/services/search/`
- `src/hooks/useHeaderCardSearch.js`
- `src/hooks/useShopSearch.js`
- `src/hooks/useDeckBuilderSearch.js`

Goal:

- search input state in components
- search execution and result shaping in services/hooks

### Phase 3: Commander engine seam cleanup

Commander pages should consume a commander page service instead of orchestrating every data slice inline.

Target seams:

- `src/services/commander/`
- `src/hooks/useCommanderHubData.js`
- `src/hooks/useCommanderDetailPage.js`
- shared view-model shaping for category cards, themes, average deck, and deck rows

Goal:

- fix commander themes, mode switching, and synergy consistency at the source

### Phase 4: Inventory action pipeline

Admin inventory and add-card flows need one consistent "card to inventory item" mapping.

Target seams:

- `src/services/inventory/`
- shared normalization for `product_id`, image, set, rarity, finish, quantity, and pricing

Goal:

- add-single-card and batch-add stop failing silently because the page and data layer disagree about shape

### Phase 5: Community action pipeline

Forum posting, replies, and community sharing should use one action layer with predictable error handling.

Target seams:

- `src/services/community/`

Goal:

- no more spinner-forever behavior on forum actions

### Phase 6: Automation registry

The scheduled systems should be documented and structured like products, not hidden side effects.

Initial automations:

- daily upcoming-set hero refresh
- every-2-days catalog refresh
- pricing refresh bot
- image repair/backfill bot
- commander corpus/synergy refresh

Target seams:

- `src/services/automation/`
- `scripts/`
- `server/`
- Cloudflare/Supabase scheduling docs

Goal:

- every bot has a job, owner, trigger, input, output, and failure surface

## Design rule going forward

For new work, follow this rule:

> Page components render.
> Hooks orchestrate.
> Services normalize.
> Scripts automate.
> Shared primitives handle repeated UI behavior.

If a page is doing too much data shaping, too much branching by game, or too much fallback logic, it needs to be split.

## Immediate next recommendation

After the shared image component rollout, the strongest next quality jump is:

1. finish image-pipeline adoption on remaining user-facing surfaces
2. extract shared search services/hooks
3. extract commander page orchestration into dedicated hooks/services

That sequence improves reliability and speed without breaking business momentum.
