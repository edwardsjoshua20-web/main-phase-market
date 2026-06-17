# Platform Layout

To keep deployment decisions easier to reason about, the repo now has two top-level platform folders:

- `/supabase`
- `/cloudflare`

## Supabase

Put application data and platform setup here:
- auth
- SQL schema
- migrations
- policies
- storage setup
- Supabase edge functions

## Cloudflare

Put edge and delivery setup here:
- DNS notes
- Pages config
- Workers config
- cache rules
- WAF notes
- rate limiting setup

## Keep In The Main App / Custom Backend

These are still custom backend responsibilities:
- `/server`
- `/scripts`
- commander ingest
- Archidekt/Moxfield bots
- simulation engine
- SQLite corpus and search indexes

## Why this split exists

This is not meant to move the whole app into two buckets overnight.

It gives the project a clean place to grow the Supabase and Cloudflare setup without mixing that work into:
- frontend feature code
- ingest workers
- simulation code
- catalog pipelines
