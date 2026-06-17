# Backend Function Inventory

This file classifies the ejected Base44 backend functions by actual frontend usage and migration value.

## Frontend-Invoked Functions

These are the only function names currently invoked by the frontend code:

- `backfillPokemonCardPhase1`
- `buildCommanderStats`
- `createCheckout`
- `fetchEDHRecSynergy`
- `getOrderStatus`
- `getShippingRates`
- `importArchidektData`
- `importSynergyWithOracleJoin`
- `processBulkImport`
- `runContinuousIngestion`
- `runMagicCardV2RebuildJob`
- `searchPokemonCards`
- `sendProductRequest`
- `simulateDeck`

## Keep / Rewrite / Remove

### Rewrite First

These are required for storefront parity or paid flows and should be rebuilt first on your own backend:

- `create-checkout` / `createCheckout`
  - Used by: `src/pages/Checkout.jsx`
  - Why it matters: Stripe checkout cannot stay vendor-hosted forever.
- `stripe-webhook` / `stripeWebhook`
  - Used indirectly by checkout completion.
  - Why it matters: order completion and payment confirmation depend on it.
- `get-shipping-rates` / `getShippingRates`
  - Used by: `src/pages/Checkout.jsx`
  - Why it matters: live checkout price calculation.
- `get-order-status` / `getOrderStatus`
  - Used by: `src/pages/OrderStatus.jsx`
  - Why it matters: customer post-purchase tracking.
- `send-product-request` / `sendProductRequest`
  - Used by: `src/pages/Shop.jsx`, `src/pages/mobile/MobileShop.jsx`
  - Why it matters: customer lead/request workflow.

### Keep If The Feature Still Matters

These power admin or advanced features that still exist in the app. Rewrite them only if you want to preserve those workflows:

- `search-pokemon-cards` / `searchPokemonCards`
  - Used by: `src/components/admin/CardForm.jsx`, `src/pages/AdvancedDeckBuilder.jsx`, `src/pages/DeckBuilder.jsx`
  - Keep if admin card lookup or deckbuilder search still matters.
- `fetch-edh-rec-synergy` / `fetchEDHRecSynergy`
  - Used by: `src/pages/AdminDecklistIngestion.jsx`
- `build-commander-stats` / `buildCommanderStats`
  - Used by: `src/components/admin/CommanderStatsPanel.jsx`, `src/components/admin/CommanderIngestionPanel.jsx`
- `import-archidekt-data` / `importArchidektData`
  - Used by: `src/components/admin/ArchidektImportPanel.jsx`
- `import-synergy-with-oracle-join` / `importSynergyWithOracleJoin`
  - Used by: `src/components/admin/ArchidektImportPanel.jsx`
- `process-bulk-import` / `processBulkImport`
  - Used by: `src/components/admin/CommanderIngestionPanel.jsx`
- `run-continuous-ingestion` / `runContinuousIngestion`
  - Used by: `src/components/admin/BootstrapIngestionPanel.jsx`
- `run-magic-card-v2-rebuild-job` / `runMagicCardV2RebuildJob`
  - Used by: `src/components/admin/MagicCardV2RebuildPanel.jsx`
- `simulate-deck` / `simulateDeck`
  - Used by: `src/pages/AdvancedDeckBuilder.jsx`

### Likely Remove

These are not invoked by the current frontend and look like migration clutter, diagnostics, one-off import jobs, or scheduled maintenance helpers:

- `audit-non-mtg-counts` / `auditNonMtgCounts`
- `backfill-oracle-ids` / `backfillOracleIds`
- `backfill-pokemon-types` / `backfillPokemonTypes`
- `bulk-import-pokemon-cards` / `bulkImportPokemonCards`
- `cache-commander-synergies` / `cacheCommanderSynergies`
- `check-price-alerts` / `checkPriceAlerts`
- `consolidate-inventory` / `consolidateInventory`
- `count-card-records` / `countCardRecords`
- `generate-commander-synergy` / `generateCommanderSynergy`
- `get-commander-page` / `getCommanderPage`
- `get-dollar-card-stats` / `getDollarCardStats`
- `get-synergy-recommendations` / `getSynergyRecommendations`
- `import-batch-file` / `importBatchFile`
- `import-flesh-and-blood-cards` / `importFleshAndBloodCards`
- `import-lorcana-cards` / `importLorcanaCards`
- `import-magic-card-v2-batch` / `importMagicCardV2Batch`
- `import-magic-cards` / `importMagicCards`
- `import-magic-cards-auto` / `importMagicCardsAuto`
- `import-one-piece-cards` / `importOnePieceCards`
- `import-pokemon-cards-from-git-hub` / `importPokemonCardsFromGitHub`
- `import-pokemon-cards-small` / `importPokemonCardsSmall`
- `import-yugioh-cards` / `importYugiohCards`
- `ingest-deck` / `ingestDeck`
- `inspect-magic-card-v2-batch1-oracle-shapes` / `inspectMagicCardV2Batch1OracleShapes`
- `inspect-magic-card-v2-batch1-oracle-text` / `inspectMagicCardV2Batch1OracleText`
- `mtg-rules-engine` / `mtgRulesEngine`
- `run-scheduled-ingestion` / `runScheduledIngestion`
- `run-scheduled-stats-rebuild` / `runScheduledStatsRebuild`
- `seed-commander-synergies` / `seedCommanderSynergies`
- `send-order-email` / `sendOrderEmail`
- `sync-card-prices` / `syncCardPrices`
- `sync-upcoming-sets` / `syncUpcomingSets`
- `test-email` / `testEmail`
- `test-guest-checkout` / `testGuestCheckout`
- `upload-and-parse-decklists` / `uploadAndParseDecklists`
- `verify-magic-card-v2-batch` / `verifyMagicCardV2Batch`
- `verify-pokemon-card-phase1-mapping` / `verifyPokemonCardPhase1Mapping`

## Duplicate Function Clutter

The eject process created duplicate naming variants for almost every function. These pairs should not coexist in the owned project:

- `audit-non-mtg-counts` and `auditNonMtgCounts`
- `backfill-oracle-ids` and `backfillOracleIds`
- `backfill-pokemon-card-phase1` and `backfillPokemonCardPhase1`
- `backfill-pokemon-types` and `backfillPokemonTypes`
- `build-commander-stats` and `buildCommanderStats`
- `bulk-import-pokemon-cards` and `bulkImportPokemonCards`
- `cache-commander-synergies` and `cacheCommanderSynergies`
- `check-price-alerts` and `checkPriceAlerts`
- `consolidate-inventory` and `consolidateInventory`
- `count-card-records` and `countCardRecords`
- `create-checkout` and `createCheckout`
- `fetch-edh-rec-synergy` and `fetchEDHRecSynergy`
- `generate-commander-synergy` and `generateCommanderSynergy`
- `get-commander-page` and `getCommanderPage`
- `get-dollar-card-stats` and `getDollarCardStats`
- `get-order-status` and `getOrderStatus`
- `get-shipping-rates` and `getShippingRates`
- `get-synergy-recommendations` and `getSynergyRecommendations`
- `import-archidekt-data` and `importArchidektData`
- `import-batch-file` and `importBatchFile`
- `import-flesh-and-blood-cards` and `importFleshAndBloodCards`
- `import-lorcana-cards` and `importLorcanaCards`
- `import-magic-card-v2-batch` and `importMagicCardV2Batch`
- `import-magic-cards` and `importMagicCards`
- `import-magic-cards-auto` and `importMagicCardsAuto`
- `import-one-piece-cards` and `importOnePieceCards`
- `import-pokemon-cards-from-git-hub` and `importPokemonCardsFromGitHub`
- `import-pokemon-cards-small` and `importPokemonCardsSmall`
- `import-synergy-with-oracle-join` and `importSynergyWithOracleJoin`
- `import-yugioh-cards` and `importYugiohCards`
- `ingest-deck` and `ingestDeck`
- `inspect-magic-card-v2-batch1-oracle-shapes` and `inspectMagicCardV2Batch1OracleShapes`
- `inspect-magic-card-v2-batch1-oracle-text` and `inspectMagicCardV2Batch1OracleText`
- `mtg-rules-engine` and `mtgRulesEngine`
- `process-bulk-import` and `processBulkImport`
- `run-continuous-ingestion` and `runContinuousIngestion`
- `run-magic-card-v2-rebuild-job` and `runMagicCardV2RebuildJob`
- `run-scheduled-ingestion` and `runScheduledIngestion`
- `run-scheduled-stats-rebuild` and `runScheduledStatsRebuild`
- `search-pokemon-cards` and `searchPokemonCards`
- `seed-commander-synergies` and `seedCommanderSynergies`
- `send-order-email` and `sendOrderEmail`
- `send-product-request` and `sendProductRequest`
- `simulate-deck` and `simulateDeck`
- `stripe-webhook` and `stripeWebhook`
- `sync-card-prices` and `syncCardPrices`
- `sync-upcoming-sets` and `syncUpcomingSets`
- `test-email` and `testEmail`
- `test-guest-checkout` and `testGuestCheckout`
- `upload-and-parse-decklists` and `uploadAndParseDecklists`
- `verify-magic-card-v2-batch` and `verifyMagicCardV2Batch`
- `verify-pokemon-card-phase1-mapping` and `verifyPokemonCardPhase1Mapping`

## Recommended Cleanup Order

1. Keep exactly one canonical folder per surviving function, preferably the kebab-case version.
2. Rewrite the storefront-critical functions first:
   - `create-checkout`
   - `stripe-webhook`
   - `get-shipping-rates`
   - `get-order-status`
   - `send-product-request`
3. Freeze or remove the unused diagnostic/import one-offs.
4. Only preserve the commander/admin ingestion stack if you actually plan to keep those admin screens live after migration.
