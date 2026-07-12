# Main Phase Market ops bridge runbook

The ops bridge is the small backend runner that lets Admin Operations see and eventually kick off business automations safely.

It is separate from Cloudflare Pages because Cloudflare Pages serves the website, but it does not run our Node automation scripts.

## What the bridge owns

- Runtime health endpoint for Admin Operations.
- Automation control status.
- Manual automation run requests.
- Single-run locks so the same job does not stampede itself.
- Automation control audit log.
- Admin-only protection for hosted remote use.
- Runtime-owned automation artifacts under `MPM_RUNTIME_SITE_DATA_ROOT`.

## Local startup

From `D:\main-phase-market`:

```powershell
npm.cmd run dev:backend
```

Default local origin:

```text
http://127.0.0.1:8787
```

Local loopback requests are trusted for development, so the Admin Operations panel can show runner status without a Supabase bearer token.

## Production / hosted startup

Host `server/index.mjs` on a Node-capable service such as Render, a VPS, or another controlled backend host.

Required environment:

```text
ALLOW_REMOTE_CONNECTIONS=true
LOCAL_API_HOST=0.0.0.0
PORT=<provided by host>
MPM_RUNTIME_SITE_DATA_ROOT=/tmp/main-phase-market/site-data
MPM_AUTOMATION_SCHEDULER_ENABLED=true
MPM_EAGER_WARMUP_ENABLED=false
SUPABASE_URL=<project url>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
SUPABASE_PUBLIC_BUCKET=<public bucket name>
```

Recommended environment:

```text
ALLOWED_ORIGIN_HOSTS=mainphasemarket.net,www.mainphasemarket.net,main-phase-market.pages.dev
PUBLIC_APP_URL=https://mainphasemarket.net
```

Then point Cloudflare Pages at the bridge:

```text
VITE_API_ORIGIN=https://<ops-backend-origin>
```

Redeploy Cloudflare Pages after changing `VITE_API_ORIGIN`.

## Verification command

Local:

```powershell
npm.cmd run ops:check
```

Remote:

```powershell
npm.cmd run ops:check -- --origin https://<ops-backend-origin> --token <admin-supabase-access-token>
```

You can also set either of these instead of passing `--token`:

```text
MPM_ADMIN_BEARER_TOKEN=<admin-supabase-access-token>
SUPABASE_ACCESS_TOKEN=<admin-supabase-access-token>
```

The verifier checks:

1. `/api/local/health`
2. `/api/local/admin/automation/control-status`

Expected healthy result:

- health is `ok`
- automation controls are `available`
- runner mode is `local-runner`
- allowed jobs are listed
- running jobs are shown if any locks exist

## Render blueprint

`render.yaml` is configured as the recommended backend blueprint:

```text
buildCommand: npm ci
startCommand: npm run ops:serve
healthCheckPath: /api/local/health
NODE_VERSION=22
LOCAL_API_HOST=0.0.0.0
ALLOW_REMOTE_CONNECTIONS=true
MPM_RUNTIME_SITE_DATA_ROOT=/tmp/main-phase-market/site-data
MPM_AUTOMATION_SCHEDULER_ENABLED=true
MPM_EAGER_WARMUP_ENABLED=false
```

After Render reports the service healthy, copy the Render service URL into Cloudflare Pages:

```text
VITE_API_ORIGIN=https://<render-service>.onrender.com
```

Then redeploy the Cloudflare Pages frontend and verify:

```powershell
npm.cmd run ops:check -- --origin https://<render-service>.onrender.com --token <admin-supabase-access-token>
```

## Admin Operations page expectations

When the bridge is connected, `/AdminOperations` should show:

- pipeline health from the runtime `system-health.json` artifact
- pipeline run history
- pipeline controls as connected
- automation jobs with last success, duration, command, and run state

If the bridge is not connected, the controls should stay disabled instead of pretending they can run.

## Safety rules

- Only allowlisted jobs can run.
- Remote automation control requires an authenticated Supabase admin user.
- Jobs write locks under `<MPM_RUNTIME_SITE_DATA_ROOT>/automation-locks`.
- Manual run attempts write audit entries to `<MPM_RUNTIME_SITE_DATA_ROOT>/automation-control-log.json`.
- Run history and runtime health live under `<MPM_RUNTIME_SITE_DATA_ROOT>`.
- Do not put service-role secrets into Cloudflare Pages frontend variables.

## Current allowlisted jobs

| Admin job | Runner job | Command |
| --- | --- | --- |
| Homepage upcoming releases | `homepage` | `npm run automation:homepage` |
| Card backfill refresh | `cards` | `npm run automation:cards:refresh` |
| Catalog refresh | `catalog` | `npm run automation:catalog` |
| Image repair and sync | `images` | `npm run automation:images` |
| Pricing refresh | `pricing` | `npm run automation:pricing` |
| System health report | `health` | `npm run automation:health` |

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Health check failed: HTTP 403` | Remote bridge does not allow remote connections or origin is blocked. | Set `ALLOW_REMOTE_CONNECTIONS=true` and confirm `ALLOWED_ORIGIN_HOSTS`. |
| `Automation controls: unavailable (HTTP 401/403)` | Missing or non-admin Supabase bearer token. | Log in as admin, use an admin token, and confirm profile role is `admin`. |
| Admin Operations says runner unavailable | Cloudflare Pages does not have `VITE_API_ORIGIN`, or the bridge is offline. | Set `VITE_API_ORIGIN`, redeploy Pages, and run `npm run ops:check`. |
| A job is stuck running | Lock exists for a live PID or stale lock cleanup has not run yet. | Check `<MPM_RUNTIME_SITE_DATA_ROOT>/automation-locks`; stale locks older than the TTL are cleaned automatically. |
