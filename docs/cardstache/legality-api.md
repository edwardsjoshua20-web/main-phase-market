# MainPhase Legality API Contract for Card Stache

MainPhase Market is the legality authority. Card Stache should call this API for normalized legality instead of reimplementing game and format rules locally.

Base URL:

```text
https://api.mainphasemarket.net/api/public/v1
```

## Single Check

```http
POST /legality/check
Content-Type: application/json
```

Request:

```json
{
  "game": "magic",
  "canonicalCardId": "4457ed35-7c10-48c8-9776-456485fdf070",
  "format": "modern",
  "printingId": "001f88e7-1ea0-43df-b519-551daf5239bd"
}
```

`printingId` is optional unless the game or product model makes legality depend on a specific printing/product.

Response:

```json
{
  "apiVersion": "1",
  "requestId": "request-id",
  "generatedAt": "2026-09-13T00:00:00.000Z",
  "dataVersion": "magic-catalog-...",
  "pricingVersion": "pricing-...",
  "data": {
    "game": "magic",
    "canonicalCardId": "4457ed35-7c10-48c8-9776-456485fdf070",
    "printingId": "001f88e7-1ea0-43df-b519-551daf5239bd",
    "format": "modern",
    "status": "legal",
    "source": "Scryfall catalog legalities",
    "sourceVersion": "mtg-legality-...",
    "lastVerified": "2026-09-13T00:00:00.000Z",
    "effectiveDate": "2026-09-11T23:33:58.935Z"
  }
}
```

## Batch Check

```http
POST /legality/checks/batch
Content-Type: application/json
```

Request:

```json
{
  "identities": [
    { "game": "magic", "canonicalCardId": "4457ed35-7c10-48c8-9776-456485fdf070", "format": "modern" },
    { "game": "yugioh", "canonicalCardId": "80181649", "format": "advanced" }
  ]
}
```

Response:

```json
{
  "data": {
    "items": [
      { "game": "magic", "canonicalCardId": "4457ed35-7c10-48c8-9776-456485fdf070", "format": "modern", "status": "legal" },
      { "game": "yugioh", "canonicalCardId": "80181649", "format": "advanced_tcg", "status": "limited", "restrictionLimit": 1, "region": "TCG" }
    ]
  }
}
```

Batch limit: 1000 identities.

Results are returned in the same order as requested. Unresolved or unsupported game/format combinations return `unknown`, not `not_legal`.

## Statuses

Supported normalized statuses:

```text
legal
banned
restricted
limited
semi_limited
suspended
rotated
not_legal
unknown
```

`unknown` means MainPhase does not currently have enough authoritative source data to answer confidently. Card Stache should display it as unknown/unverified and may refresh later.

## Current Source Coverage

Magic: `standard`, `pioneer`, `modern`, `legacy`, `vintage`, `pauper`, `commander` from MainPhase's Scryfall-backed MTG legality index.

Pokemon: uses source-provided card `legalities` fields when present. Missing format data returns `unknown`.

Yu-Gi-Oh!: uses TCG Advanced `banlist_info.ban_tcg` semantics. `Forbidden` maps to `banned`, `Limited` maps to `limited` with limit 1, and `Semi-Limited` maps to `semi_limited` with limit 2. Other regions/lists return `unknown` until explicitly sourced.

Flesh and Blood: uses source-provided format flags for legal, banned, suspended, restricted, and Living Legend. Living Legend is surfaced as `rotated` rather than flattened into generic banned.

Lorcana, One Piece, and Star Wars Unlimited: return `unknown` until MainPhase has a current official list source in the catalog pipeline.

## Caching

Responses include:

- `dataVersion`
- `sourceVersion`
- `lastVerified`
- `effectiveDate`
- HTTP cache headers with `stale-while-revalidate`

Card Stache should show cached legality immediately when available, then refresh stale records in the background. Card Stache should not infer legality from raw set dates, raw card text, or product metadata.

## Errors

Malformed requests return the standard public API error envelope:

```json
{
  "apiVersion": "1",
  "requestId": "request-id",
  "error": {
    "code": "invalid_request",
    "message": "identities[0].format is required.",
    "retryable": false,
    "retryAfterSeconds": null
  }
}
```

Rate limiting returns `429` and includes `Retry-After`.
