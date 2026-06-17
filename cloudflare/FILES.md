# Cloudflare File Map

Cloudflare is not fully wired into this repo yet, but these areas are where it will matter:

- `/server/mtgCommanderCorpus.mjs`
  - Already detects Cloudflare block pages while scraping external sites.

- `/public/`
  - Static assets that can be cached aggressively behind Cloudflare.

- `/dist/`
  - Production frontend build output that can sit behind Cloudflare Pages or another origin.

Target ownership for Cloudflare:
- DNS
- SSL
- CDN caching
- WAF
- bot protection
- rate limiting
- edge routing
