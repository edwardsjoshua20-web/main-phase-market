# Supabase Functions Cutover

This is the Cloudflare + Supabase path for the launch-critical actions that used to live only in the local Node backend.

## Functions Added

- `create-checkout`
- `finalize-checkout-session`
- `get-shipping-rates`
- `get-order-status`
- `send-product-request`
- `upload-public-file`

## What They Replace

These functions cover the launch-critical `backend.actions.invoke(...)` calls from the storefront:

- checkout session creation
- checkout finalization on the success page
- shipping rate lookup
- customer order lookup
- customer product requests
- avatar / image upload path used by the current frontend

## Required Supabase Secrets

Set these in Supabase project secrets before deploying functions:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PUBLIC_BUCKET`
- `PUBLIC_APP_URL`
- `STRIPE_SECRET_KEY`
- `RESEND_API_KEY` (optional)
- `USPS_CONSUMER_KEY` (optional)
- `USPS_CONSUMER_SECRET` (optional)
- `USPS_ORIGIN_ZIP` (optional, defaults to `40272`)

## Frontend Environment

For Cloudflare Pages:

```env
VITE_APP_BACKEND_PROVIDER=local
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Notes:

- The app still uses the `local` provider for the broader auth/data layer right now.
- The critical actions above now jump straight to Supabase Functions whenever `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are present.
- That means checkout/shipping/order lookup/product request/upload no longer have to wait on `127.0.0.1:8787`.

## Deploy Commands

From the repo root after linking Supabase CLI to the correct project:

```powershell
supabase functions deploy create-checkout
supabase functions deploy finalize-checkout-session
supabase functions deploy get-shipping-rates
supabase functions deploy get-order-status
supabase functions deploy send-product-request
supabase functions deploy upload-public-file
```

## Still Not Fully Removed From Local Backend

This change does **not** finish the whole two-platform migration by itself.

Still remaining after this slice:

- generic auth/profile provider swap
- generic entity CRUD provider swap
- TCG search endpoints and MTG printings
- any admin-only ingestion tools you still want to keep

## Launch Impact

This is the important part:

- the paid flow now has a Supabase-side home
- shipping lookup now has a Supabase-side home
- order lookup now has a Supabase-side home
- customer request flow now has a Supabase-side home
- uploads now have a Supabase-side home

That removes the ugliest launch blocker first.
