# Card backfill automation config

Card backfills now have a declared automation layer too.

## Config files

- live config: `config/card-backfill-refresh.json`
- example config: `config/card-backfill-refresh.example.json`

## Entry point

- `npm run automation:cards:refresh`

## Purpose

This is the layer that restores or refreshes raw card catalogs before:

- set extraction
- image mirroring
- search consumption
- health reporting

## Why this matters

This gives the project a cleaner sequence:

1. card backfill
2. set extraction
3. image mirroring
4. pricing refresh
5. health report

That is much closer to a real business pipeline than scattered script usage.
