**Main Phase Market**

**About**

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```env
VITE_APP_BACKEND_PROVIDER=local
VITE_LOCAL_API_URL=http://127.0.0.1:8787
VITE_API_ORIGIN=
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_publishable_key
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
SUPABASE_PUBLIC_BUCKET=your_public_bucket_name
ALLOW_REMOTE_CONNECTIONS=false
ALLOWED_ORIGIN_HOSTS=
MTG_SOURCE_PATH=
```

Run the app: `npm run dev`

**Run locally**

- `npm install`
- `npm run dev:backend`
- `npm run dev`

**Platform Folders**

To make infrastructure work easier to find, the repo now has:

- `supabase/`
- `cloudflare/`
- `docs/platform-layout.md`

Use `supabase/` for database/auth/storage setup.

Use `cloudflare/` for DNS/CDN/WAF/edge setup.

For public deployment:

- point the frontend at your hosted API with `VITE_API_ORIGIN`
- set `ALLOW_REMOTE_CONNECTIONS=true` on the backend host
- set `ALLOWED_ORIGIN_HOSTS=yourdomain.com,www.yourdomain.com`
- set `SUPABASE_PUBLIC_BUCKET` if you want uploads to land in Supabase storage instead of local disk

Fastest production path:

- frontend on Cloudflare Pages
- backend on Render
- deployment notes: `docs/deploy-cloudflare-render.md`
