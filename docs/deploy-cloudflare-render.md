# Cloudflare + Render Deployment

This is the fastest production cutover path away from Base44:

- frontend on Cloudflare Pages
- backend on Render
- data/auth/storage on Supabase

## 1. Supabase

Before deployment:

1. rotate the exposed `SUPABASE_SERVICE_ROLE_KEY`
2. run the SQL migration in:
   - `supabase/migrations/20260427_create_app_entities.sql`
3. create a public storage bucket
   - recommended name: `main-phase-market-public`
4. set the backend env:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_PUBLIC_BUCKET`

If you want the old local SQLite records copied into Supabase, run:

```powershell
npm run supabase:sync:entities
```

## 2. Render backend

Use `render.yaml` or create the service manually.

Required env vars:

- `ALLOW_REMOTE_CONNECTIONS=true`
- `ALLOWED_ORIGIN_HOSTS=yourdomain.com,www.yourdomain.com`
- `PUBLIC_APP_URL=https://yourdomain.com`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_PUBLIC_BUCKET=main-phase-market-public`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `USPS_CONSUMER_KEY=...`
- `USPS_CONSUMER_SECRET=...`

Recommended API domain after deploy:

- `api.yourdomain.com`

## 3. Cloudflare Pages frontend

Build settings:

- framework preset: `Vite`
- build command: `npm run build`
- build output directory: `dist`

Frontend env vars:

- `VITE_APP_BACKEND_PROVIDER=local`
- `VITE_API_ORIGIN=https://api.yourdomain.com`
- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

Recommended public app domain:

- `yourdomain.com`
- `www.yourdomain.com`

## 4. Cloudflare DNS

Point:

- `yourdomain.com` -> Cloudflare Pages project
- `www.yourdomain.com` -> Cloudflare Pages project
- `api.yourdomain.com` -> Render backend

Then enable:

- SSL
- caching for static assets
- WAF
- rate limiting on `/api/local/actions/createCheckout`

## 5. Checkout webhook

In Stripe:

- create a webhook endpoint pointed at your backend domain
- target route should be whatever webhook route you are using in the backend deployment
- set `STRIPE_WEBHOOK_SECRET` on Render

## 6. Final smoke test

Verify on the public domain:

- homepage
- shop search
- card detail
- add to cart
- checkout session creation
- paid order finalization
- forum threads/replies
- profile save
- avatar upload
- deck save/load
- mobile pages
