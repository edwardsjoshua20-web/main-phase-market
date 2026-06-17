# Supabase Migration Map

This file maps the Base44 entity schemas in `base44/entities/` to the CSV backups in `Data Exports/`.

## Rules Used

- Canonical entity names were matched case-insensitively across duplicate schema files.
- `id`, `created_date`, `updated_date`, `created_by`, `created_by_id`, and `is_sample` were treated as Base44 system columns and not schema mismatches.
- A `0`-byte CSV is treated as an important empty table: the schema is required, but there are currently no rows to import.

## High-Priority Findings

- `CommanderCardStat_export.csv` is missing required schema field `commander_oracle_id`.
- `MagicCard_export.csv` is missing schema field `oracle_id`.
- `CartItem_export.csv`, `Collection_export.csv`, `DeckCard_export.csv`, `DeckRecord_export.csv`, `ForumReply_export.csv`, `PokemonCardCache_export.csv`, `RawDecklist_export.csv`, `SourceMapping_export.csv`, `UnmatchedCard_export.csv`, and `Wishlist_export.csv` are `0` bytes on purpose because those tables are currently unused. They still must be created in Supabase.
- `ImportProgress`, `IngestionState`, and `User` have schemas but no CSV export files in the backup folder.

## Entity To CSV Map

| Entity | Schema File | CSV Export | Status | Notes |
| --- | --- | --- | --- | --- |
| `CardList` | `card-list.jsonc` | `CardList_export.csv` | Good | Required fields present. |
| `Card` | `card.jsonc` | `Card_export.csv` | Good | Core storefront inventory table. |
| `CartItem` | `cart-item.jsonc` | `CartItem_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `Collection` | `collection.jsonc` | `Collection_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `CommanderCardStat` | `CommanderCardStat.jsonc` | `CommanderCardStat_export.csv` | Needs fix | Missing required `commander_oracle_id`. |
| `CommanderSynergyCache` | `commander-synergy-cache.jsonc` | `CommanderSynergyCache_export.csv` | Good | Required fields present. |
| `CommanderSynergy` | `CommanderSynergy.jsonc` | `CommanderSynergy_export.csv` | Good | Required fields present. |
| `Commander` | `commander.jsonc` | `Commander_export.csv` | Good | Required fields present. |
| `CommunityDeck` | `CommunityDeck.jsonc` | `CommunityDeck_export.csv` | Good | Required fields present. |
| `DeckCard` | `DeckCard.jsonc` | `DeckCard_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `DeckComment` | `DeckComment.jsonc` | `DeckComment_export.csv` | Good | Required fields present. |
| `DeckRecord` | `DeckRecord.jsonc` | `DeckRecord_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `FleshAndBloodCard` | `flesh-and-blood-card.jsonc` | `FleshAndBloodCard_export.csv` | Good | Required fields present. |
| `ForumPost` | `ForumPost.jsonc` | `ForumPost_export.csv` | Good | Required fields present. |
| `ForumReply` | `ForumReply.jsonc` | `ForumReply_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `ImportJob` | `ImportJob.jsonc` | `ImportJob_export.csv` | Good | Required fields present. |
| `ImportProgress` | `import-progress.jsonc` | None | Missing export | Schema exists but no CSV backup was found. |
| `IngestionState` | `IngestionState.jsonc` | None | Missing export | Schema exists but no CSV backup was found. |
| `LorcanaCard` | `lorcana-card.jsonc` | `LorcanaCard_export.csv` | Good | Required fields present. |
| `MagicCardV2RebuildJob` | `MagicCardV2RebuildJob.jsonc` | `MagicCardV2RebuildJob_export.csv` | Good | Required fields present. |
| `MagicCardV2` | `MagicCardV2.jsonc` | `MagicCardV2_export.csv` | Good | Strong candidate for Supabase import as-is. |
| `MagicCard` | `MagicCard.jsonc` | `MagicCard_export.csv` | Needs review | Missing non-required but important `oracle_id`. |
| `OnePieceCard` | `one-piece-card.jsonc` | `OnePieceCard_export.csv` | Good | Required fields present. |
| `Order` | `order.jsonc` | `Order_export.csv` | Good | Required fields present. |
| `PokemonCardCache` | `pokemon-card-cache.jsonc` | `PokemonCardCache_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `PokemonCard` | `PokemonCard.jsonc` | `PokemonCard_export.csv` | Good | Required fields present. |
| `PriceAlert` | `PriceAlert.jsonc` | `PriceAlert_export.csv` | Good | Required fields present. |
| `Product` | `product.jsonc` | `Product_export.csv` | Good | Core storefront product table. |
| `RawDecklist` | `RawDecklist.jsonc` | `RawDecklist_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `SourceMapping` | `SourceMapping.jsonc` | `SourceMapping_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `UnmatchedCard` | `UnmatchedCard.jsonc` | `UnmatchedCard_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `User` | `user.jsonc` | None | Missing export | Base44 auth-profile schema only; likely becomes Supabase auth profile table later. |
| `Wishlist` | `wishlist.jsonc` | `Wishlist_export.csv` | Empty but required | No rows currently exported; create table and leave empty. |
| `YugiohCard` | `yugioh-card.jsonc` | `YugiohCard_export.csv` | Good | Required fields present. |

## Supabase Import Order

1. Import reference and inventory tables first:
   - `Product`
   - `Card`
   - `MagicCard`
   - `MagicCardV2`
   - `PokemonCard`
   - `YugiohCard`
   - `LorcanaCard`
   - `OnePieceCard`
   - `FleshAndBloodCard`
2. Import user-facing feature tables next:
   - `Order`
   - `CommunityDeck`
   - `ForumPost`
   - `DeckComment`
   - `PriceAlert`
   - `CardList`
3. Import admin and ingestion tables after the core app is live:
   - `Commander`
   - `CommanderSynergy`
   - `CommanderSynergyCache`
   - `CommanderCardStat`
   - `ImportJob`
   - `MagicCardV2RebuildJob`
   - `DeckRecord`
   - `DeckCard`
   - `RawDecklist`
   - `SourceMapping`
   - `UnmatchedCard`
   - `PokemonCardCache`
4. Create every `0`-byte table from schema even when there is no data to import yet.

## Recommended Next Data Actions

1. Create all intentionally empty tables in Supabase even when their CSV export has no rows.
2. Confirm whether `ImportProgress`, `IngestionState`, and `User` need export coverage or can be recreated by app logic/auth.
3. Decide whether `MagicCard` or `MagicCardV2` is the long-term canonical MTG search table, because keeping both in Supabase is possible but expensive.
4. Treat `CommanderCardStat` and `MagicCard` as pre-import cleanup tables because they already have schema/header mismatches.
