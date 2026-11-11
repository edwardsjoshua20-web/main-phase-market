# Kazakari private preview

## Architecture

- UI route: `/private/kazakari` in the existing React/Vite application.
- API owner: `server/kazakariOwner.mjs` behind `/api/local/kazakari/*`.
- Authentication: the existing Supabase session bearer token.
- Authorization: only an email explicitly listed in the backend-only `KAZAKARI_AUTHORIZED_EMAILS` environment variable. Administrator role alone grants no access.
- Current data: a sanitized snapshot from `D:\Projects\Penny-Hunter\data\phase-5-tracking-final.sqlite`.
- Hosted persistence: service-role-only Supabase tables for the current snapshot and each user's watch rules.

The route is not linked from public navigation. Cloudflare Pages `_headers`, runtime metadata, and API response headers all set `noindex`/`noarchive`. The API independently validates authorization; knowing the URL does not grant access.

## Local preparation

```powershell
Set-Location D:\main-phase-market
npm.cmd run kazakari:snapshot
npm.cmd run kazakari:verify
npm.cmd run typecheck
npm.cmd run build
```

The snapshot builder includes only products marked `present` in a publication that is both active and unexpired at export time. It excludes the Phase 5 expiration simulation database and does not infer missing inventory, images, reference prices, or store scope.

## Deployment preparation (not executed)

1. Apply `supabase/migrations/20261111120000_create_kazakari_private_preview.sql`.
2. Set `KAZAKARI_AUTHORIZED_EMAILS=admin@mainphasemarket.net` on the Render API. Do not add family members or other administrators until separately authorized.
3. Build a fresh local snapshot with `npm.cmd run kazakari:snapshot`.
4. With backend-only Supabase credentials present, run `npm.cmd run kazakari:sync`.
5. Deploy the Render API changes, then the Cloudflare Pages frontend.
6. Verify anonymous, authenticated-but-unauthorized, and authorized behavior against the live route and API.

## Planned destination

`https://www.mainphasemarket.net/private/kazakari`

Publishing requires the owner's explicit approval of this destination, the authorization email list, the Supabase migration, the one-time snapshot sync, and the Render/Cloudflare deployment. No deployment, database migration, or hosted data mutation is performed by local preparation.
