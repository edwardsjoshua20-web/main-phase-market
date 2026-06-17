# Supabase

This folder is the home for anything that belongs to the Supabase side of Main Phase Market.

Use this folder for:
- database schema and migrations
- row-level security policies
- storage bucket setup
- auth configuration
- edge functions that belong to Supabase
- environment variable templates

Current repo files already tied to Supabase:
- `/.env.example`
- `/src/services/backend.js`
- `/src/services/providers/supabaseBackend.js`
- `/src/config/appAssets.js`

Recommended next files to add here:
- `migrations/`
- `policies/`
- `seed.sql`
- `storage-buckets.md`
- `edge-functions/`

What should not live here:
- Archidekt ingest bots
- MTG catalog builders
- commander simulation engine
- long-running workers

Those stay in the custom backend until we deliberately migrate them.
