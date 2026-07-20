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

## Automation control plane

Supabase is the permanent operational control plane for Main Phase Market:

- `automation_jobs` is the allowlisted job registry.
- `automation_runs` is the durable history, queue, and single-run lock record.
- `automation-dispatch` is the secure Edge Function that records a run and
  dispatches an allowlisted pipeline to the runner workflow.

The catalog/image engines remain Node scripts because they process large card
feeds and image batches. Supabase Cron schedules them and records their state;
the GitHub Actions runner executes the heavy work and publishes its outputs back
to Supabase Storage. This avoids an always-on third-party server while keeping
the source of truth, audit history, and published data inside Supabase.

Before activating the dispatcher, configure these Supabase Edge Function secrets:

- `MPM_AUTOMATION_SHARED_SECRET`
- `GITHUB_AUTOMATION_REPOSITORY`
- `GITHUB_AUTOMATION_TOKEN`
- optional `GITHUB_AUTOMATION_WORKFLOW` (`site-automation.yml` by default)

Configure matching GitHub Actions secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PUBLIC_BUCKET`
- `MPM_AUTOMATION_SHARED_SECRET`
- `MPM_AUTOMATION_DISPATCH_URL` (the `automation-dispatch` Edge Function URL)

Do not expose any service-role key, GitHub token, or shared secret in Cloudflare
Pages frontend variables.
