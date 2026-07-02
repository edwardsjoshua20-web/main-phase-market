# Pricing Source Snapshots

This is the bridge between external pricing sources and Main Phase Market pricing policy.

## Flow

1. external adapter fetches rows
2. row is normalized into shared card identity
3. source snapshot lands in `public/data/site/pricing-sources/`
4. pricing merge job combines snapshots
5. pricing policy computes market and target values

## Shared identity fields

- `game`
- `name`
- `set_code`
- `set_name`
- `card_number`
- `finish`
- `language`
- `oracle_id` when available

## Source files

- `public/data/site/pricing-sources/cardkingdom.json`
- `public/data/site/pricing-sources/tcgplayer.json`
- `public/data/site/pricing-sources/starcitygames.json`

## Why this matters

This lets us:

- swap adapters without changing page code
- ingest manual exports before live adapters are done
- test pricing policy with sample data
- keep the automation layer honest
