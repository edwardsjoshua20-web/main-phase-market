# MTG Rebuild Schema

This rebuild uses one canonical MTG catalog plus a local-first search index.

## Source

- Source file: `D:\main-phase-market\server\data\mtg\source\all_cards-latest.json`
- Included:
  - Paper-playable cards, including non-English printings
  - Standard printings with images
- Excluded:
  - Tokens
  - Digital-only cards
  - Art series
  - Memorabilia
  - Funny / test / playtest cards
  - Other obvious extras such as emblems and sticker-style non-card rows

## Canonical Row Shape

Each imported MTG row is stored in the generated local catalog/search artifacts with these fields:

- `id`
- `oracle_id`
- `name`
- `name_normalized`
- `face_names`
- `lang`
- `released_at`
- `set_code`
- `set_name`
- `set_type`
- `collector_number`
- `rarity`
- `mana_cost`
- `cmc`
- `type_line`
- `oracle_text`
- `colors`
- `color_identity`
- `keywords`
- `image_small`
- `image_normal`
- `image_art_crop`
- `image_png`
- `legal_commander`
- `can_be_commander`
- `finishes`
- `nonfoil`
- `foil`
- `highres_image`
- `prices.usd`
- `prices.usd_foil`
- `prices.usd_etched`
- `search_text`
- `game`

## Generated Artifacts

The build script writes to `public/data/mtg/`:

- `manifest.json`
  - total imported row count
  - exclusion counts
  - search bucket manifest
- `sets.json`
  - set-level summary for future set browsing
- `search/<bucket>.json`
  - local search buckets keyed by the first normalized character

## Intended Long-Term Tables

When the app moves onto Supabase, keep the same separation:

1. `mtg_cards`
   - canonical print-level MTG catalog
2. `mtg_sets`
   - set metadata for browsing and filtering
3. `inventory_cards`
   - your actual owned MTG inventory, linked to `mtg_cards.id`

## Search Model

- Header search and MTG single-card search use local bucket files only
- No Scryfall API calls are required for MTG name search
- Images come from the imported MTG row image URLs
- Inventory joins happen separately so catalog and stock stay cleanly separated
