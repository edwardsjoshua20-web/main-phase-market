# Supabase Storage Buckets

## Required bucket

Create one public bucket for app-uploaded files:

- name: `main-phase-market-public`
- public: `true`

## Current usage

This bucket is used for:

- member avatar uploads
- admin image uploads that go through `/api/local/files/upload`

## Required backend env

Set on the backend host:

```env
SUPABASE_PUBLIC_BUCKET=main-phase-market-public
```

## Expected public path structure

- `uploads/avatars/...`

## Notes

- If `SUPABASE_PUBLIC_BUCKET` is not set, uploads fall back to the backend filesystem.
- For full cutover off machine-local storage, make sure this bucket exists before public launch.
