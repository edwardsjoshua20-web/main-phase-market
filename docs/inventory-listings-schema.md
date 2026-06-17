# Inventory Listings Schema

This app now treats sellable singles as `inventory listings`, not as the MTG catalog itself.

## Current app-owned model

Each inventory listing should represent stock you physically own and can sell.

Core fields:

- `listing_id`
- `name`
- `game`
- `set_name`
- `card_number`
- `rarity`
- `condition`
- `quantity`
- `sell_price`
- `cost_basis`
- `location`
- `status`
- `image_url`

Catalog snapshot fields:

- `catalog_oracle_id`
- `catalog_lang`
- `catalog_finish`
- `finish`
- `finish_label`
- `language`

Computed behavior:

- `in_stock` is true when `quantity > 0` and `status === 'active'`
- duplicate stock merges should use the listing key, not only the card name

## Current legacy storage

Until the owned database migration is complete, inventory listings are stored in the old Base44 `Card` entity and adapted in:

- [inventoryListings.js](/C:/Users/Admin/Desktop/main-phase-market/src/services/inventoryListings.js)
- [cardInventorySnapshot.js](/C:/Users/Admin/Desktop/main-phase-market/src/components/admin/cardInventorySnapshot.js)

Legacy field mapping:

- `listing_id <- id`
- `sell_price <- price`
- `cost_basis <- cost`
- `catalog_oracle_id <- parsed from description`
- `catalog_lang <- parsed from sku/description`
- `catalog_finish <- parsed from sku/description`

## Target owned database table

When this app moves to Supabase, the singles inventory table should store these fields directly instead of reconstructing them from legacy strings:

- `id`
- `catalog_oracle_id`
- `catalog_scryfall_id`
- `catalog_name`
- `catalog_set_code`
- `catalog_set_name`
- `catalog_collector_number`
- `catalog_lang`
- `catalog_finish`
- `condition`
- `quantity`
- `sell_price`
- `cost_basis`
- `location`
- `status`
- `image_url`
- `created_at`
- `updated_at`
