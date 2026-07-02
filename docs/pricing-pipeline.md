# Main Phase Market Pricing Pipeline

This pricing layer separates numbers that were previously getting mixed together.

## Price types

- `market_price`
  - the outside market reference number
- `target_price`
  - the Main Phase Market policy result
- `sell_price`
  - the active store listing price
- `display_price`
  - the number the UI should prefer when it needs one price
- `cost_basis`
  - what we paid or our internal basis

## Design rule

Pages should not decide what a price means.

They should ask the pricing pipeline for the right number.

## Current policy

- use normalized source prices when available
- prefer median / middle-of-market logic for target pricing
- apply a store floor

## Current implementation status

- pricing policy helpers: done
- pricing normalization pipeline: done
- deck-value resolver: done
- pricing snapshot automation: seeded from local catalogs
- external competitor adapters: planned

## Planned external sources

- Card Kingdom
- TCGplayer
- Star City Games

## Why this matters

This keeps these systems from drifting apart:

- deck value
- shop price display
- inventory admin price editing
- future price alerts
- future auto repricing
