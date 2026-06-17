# Base44 Exit Cutover Checklist

This is the fastest practical path to get Main Phase Market off Base44 billing.

## What is already migrated

- frontend runs against the local/custom backend provider
- deck saves use Supabase
- forum threads and replies use Supabase
- profile reads and writes use Supabase
- checkout is no longer using Base44 functions
- generic entity storage can now be moved into Supabase through `public.app_entities`

## What still must exist outside Base44

- a hosted frontend build
- a hosted Node backend for `/api/local/*`
- Supabase for database/auth/storage
- Cloudflare for DNS, SSL, CDN, and reverse proxy

## Important reality

Cloudflare is not a drop-in replacement for the current Node backend.

The current backend still handles:

- card search APIs across MTG, Pokemon, FAB, Lorcana, One Piece, Yu-Gi-Oh, and Star Wars
- deck builder data/entity APIs
- Stripe checkout and order completion
- USPS shipping rates
- file uploads
- admin and commander tools

That means the fastest exit is:

1. host the frontend
2. host the Node backend
3. point Cloudflare at them
4. rotate secrets
5. verify flows
6. cancel Base44

## Required environment variables

### Frontend

- `VITE_APP_BACKEND_PROVIDER=local`
- `VITE_API_ORIGIN=https://api.yourdomain.com`
- `VITE_SUPABASE_URL=...`
- `VITE_SUPABASE_ANON_KEY=...`

### Backend

- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_PUBLIC_BUCKET=...`
- `STRIPE_SECRET_KEY=...`
- `STRIPE_WEBHOOK_SECRET=...`
- `USPS_CONSUMER_KEY=...`
- `USPS_CONSUMER_SECRET=...`
- `ALLOW_REMOTE_CONNECTIONS=true`
- `ALLOWED_ORIGIN_HOSTS=yourdomain.com,www.yourdomain.com`

## SQLite-to-Supabase entity migration

If you want existing local entity data copied into Supabase, run:

```powershell
npm run supabase:sync:entities
```

This is intended for the generic app records that used to live only in the local SQLite entity store, such as orders, carts, wishlists, products, and community-related records.

## Recommended production shape

- frontend:
  - static Vite build
  - host on Cloudflare Pages or another static host
- backend:
  - host the current Node app on a Node host
  - examples: Railway, Render, Fly.io, VPS
- Cloudflare:
  - `yourdomain.com` -> frontend
  - `api.yourdomain.com` -> backend
  - enable SSL, caching for static assets, and WAF/rate limiting

## Final verification before canceling Base44

- homepage loads on public domain
- shop search works for each TCG
- card detail works
- add to cart works
- shipping rates load
- Stripe checkout opens
- paid checkout writes order data
- forum create/reply works
- profile save persists after refresh
- avatar upload returns a Supabase storage URL
- deck create/edit/delete persists
- mobile pages load on public domain

## Still strongly recommended

- rotate the exposed Supabase service-role key before public cutover
- remove or archive the old `base44/` folder after the live cutover is verified
