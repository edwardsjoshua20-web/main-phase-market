# Cloudflare

This folder is the home for anything that belongs to the Cloudflare side of Main Phase Market.

Use this folder for:
- DNS notes
- cache rules
- WAF and bot protection notes
- rate limiting rules
- Pages deployment config
- Workers config
- public edge environment templates

Recommended first responsibilities for Cloudflare:
- domain and DNS
- HTTPS / SSL
- CDN caching
- bot protection
- rate limiting
- reverse proxy in front of the public app

What should not live here:
- SQLite database files
- commander ingest queue data
- MTG deck bots
- heavy server-side simulation code

Those belong to the custom backend, not Cloudflare.
