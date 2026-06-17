# Supabase File Map

These files in the current app are part of the Supabase migration path:

- `/src/services/providers/supabaseBackend.js`
  - Stub provider for the future Supabase-backed app API.

- `/src/services/backend.js`
  - Chooses whether the app runs against `local`, `base44`, or `supabase`.

- `/.env.example`
  - Already contains Supabase environment variables.

- `/src/config/appAssets.js`
  - Still points at Supabase-hosted storage/media URLs for some assets.

Target ownership for Supabase:
- user accounts
- profile data
- saved decks
- forum data
- inventory/admin records
- order/request records
- file uploads
