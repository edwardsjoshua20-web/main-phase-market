# Live Cutover Sequence

Use this exact order to get off Base44 with the least chaos.

## Phase 1: Supabase

1. Rotate `SUPABASE_SERVICE_ROLE_KEY`
2. Run:
   - `supabase/migrations/20260427_create_app_entities.sql`
3. Create public bucket:
   - `main-phase-market-public`
4. Set backend env:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_PUBLIC_BUCKET`

## Phase 2: Data sync

From the repo root:

```powershell
npm run supabase:sync:entities
```

This moves generic app entity data out of the local SQLite store.

## Phase 3: Backend deploy

Deploy the Node backend to Render using:

- `render.yaml`

Set:

- `ALLOW_REMOTE_CONNECTIONS=true`
- `ALLOWED_ORIGIN_HOSTS=yourdomain.com,www.yourdomain.com`
- `PUBLIC_APP_URL=https://yourdomain.com`
- Stripe and USPS secrets

## Phase 4: Frontend deploy

Deploy the frontend to Cloudflare Pages.

Use env vars from:

- `cloudflare/pages.env.example`

## Phase 5: DNS

In Cloudflare:

- `yourdomain.com` -> Pages
- `www.yourdomain.com` -> Pages
- `api.yourdomain.com` -> Render

## Phase 6: Smoke test

Test on the real public domain:

- homepage
- profile save
- avatar upload
- forum post/reply
- deck save/load
- shop search
- add to cart
- checkout
- success page

## Phase 7: Base44

After the smoke test passes:

1. verify no public traffic still depends on Base44
2. cancel Base44
3. optionally archive or remove the old `base44/` folder from the repo later
