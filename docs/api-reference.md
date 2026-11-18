# Public API Reference

This document describes the **current public HTTP API** of StellarCore as
implemented under `app/api/`. It was produced by reading the route handlers,
the API service layer in `lib/api/`, and the serializers' unit tests — **not**
by copying README examples.

> **Provenance and limitations.** The response examples below were derived from
> the serializers and their unit tests (which run offline against in-memory
> repositories), not captured from a live database. A local `.env.local` is not
> present in this workspace and the connected Supabase instance was
> unreachable during authoring, so live responses could not be captured.
> Every example is therefore labelled as "derived from the serializer/unit
> tests", and nullable/empty/error states are shown exactly as the
> implementation produces them — nothing is fabricated.

## Conventions

- **Base URL:** the deployed root (e.g. `https://api.example.com` in Vercel
  production). Locally Next.js serves these at `http://localhost:3000`.
- **Methods:** all public routes are `GET` only. There are no `POST`/`PUT`
  `PATCH`/`DELETE` handlers for any route below.
- **Caching:** every public response (and the internal cron route) is sent
  with `Cache-Control: no-store`. Route handlers export
  `export const dynamic = "force-dynamic"` to prevent freshness caching.
- **Content type:** all responses are JSON via `Response.json(...)`.
- **Slug validation:** anchor slugs and corridor slugs must match
  `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` and be at most 100 characters.
- **Error envelope:** every error response has the shape:

```json
{ "error": { "code": "snake_case_code", "message": "Human-readable message." } }
```

- **Rate limiting:** all eight public routes are rate limited per client IP
  (see [Rate limiting](#rate-limiting) at the end). The single internal cron
  route is **not** rate limited.

---

## Routes at a glance

| Method | Path | Handler | Rate limited |
| ------ | ---- | ------- | ------------ |
| GET | `/api/anchors` | `app/api/anchors/route.ts` | yes |
| GET | `/api/anchors/{slug}` | `app/api/anchors/[slug]/route.ts` | yes |
| GET | `/api/corridors` | `app/api/corridors/route.ts` | yes |
| GET | `/api/corridors/{slug}` | `app/api/corridors/[slug]/route.ts` | yes |
| GET | `/api/rates?corridor={slug}` | `app/api/rates/route.ts` | yes |
| GET | `/api/rates/history?corridor={slug}&days={1..365}` | `app/api/rates/history/route.ts` | yes |
| GET | `/api/reputation` | `app/api/reputation/route.ts` | yes |
| GET | `/api/reputation/{slug}` | `app/api/reputation/[slug]/route.ts` | yes |
| GET | `/api/internal/cron/refresh` | `app/api/internal/cron/refresh/route.ts` | **no** |

---

## GET /api/anchors

List all anchors in the persisted directory, sorted ascending by `slug`
(`localeCompare`).

### 200 OK

Derived from `serializeAnchors` in `lib/api/anchors.ts` and its unit tests.

```json
{
  "anchors": [
    {
      "slug": "cowrie",
      "name": "Cowrie",
      "homeDomain": "cowrie.exchange",
      "status": "LIVE",
      "seps": [1, 6],
      "isTransferCapable": true,
      "corridorCount": 1
    }
  ],
  "count": 1
}
```

Notes on the fields:

- `status` is one of `"LIVE"`, `"DEGRADED"`, `"DOWN"`, `"UNKNOWN"`.
- `seps` is sorted ascending and deduplicated.
- `isTransferCapable` is derived from the persisted SEP numbers
  (`SEP-6`, `SEP-24`, or `SEP-31`), never stored.
- The empty directory is still a `200`:

```json
{ "anchors": [], "count": 0 }
```

### 500 Internal Server Error

When the repository read fails. The error text is intentionally generic and
never contains the underlying exception.

```json
{ "error": { "code": "internal_error", "message": "Unable to load anchors." } }
```

---

## GET /api/anchors/{slug}

Fetch one anchor. The route validates the slug first; an invalid slug is
rejected **before** any repository access.

### 200 OK

Derived from `serializeAnchorDetail` in `lib/api/anchors.ts`.

```json
{
  "anchor": {
    "slug": "zeam",
    "name": "Zeam",
    "homeDomain": "zeam.money",
    "status": "LIVE",
    "seps": [1, 24, 38],
    "isTransferCapable": true,
    "corridors": [
      {
        "slug": "usdc-us-brl-br",
        "sourceAsset": "USDC",
        "sourceCountry": "US",
        "destinationAsset": "BRL",
        "destinationCountry": "BR"
      }
    ]
  }
}
```

An anchor with no mapped corridors returns `"corridors": []` with a `200`.

### 400 Bad Request

Invalid slug (empty, too long, or failing the `[a-z0-9-]` pattern).

```json
{ "error": { "code": "invalid_anchor_slug", "message": "A valid anchor slug is required." } }
```

### 404 Not Found

A syntactically valid but unknown slug.

```json
{ "error": { "code": "anchor_not_found", "message": "Anchor not found." } }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to load anchors." } }
```

---

## GET /api/corridors

List all corridors in the persisted directory, sorted ascending by `slug`.

### 200 OK

Derived from `serializeCorridors` in `lib/api/corridors.ts`.

```json
{
  "corridors": [
    {
      "slug": "usdc-us-brl-br",
      "sourceAsset": "USDC",
      "sourceCountry": "US",
      "destinationAsset": "BRL",
      "destinationCountry": "BR",
      "anchorCount": 1
    }
  ],
  "count": 1
}
```

Empty directory:

```json
{ "corridors": [], "count": 0 }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to load corridors." } }
```

---

## GET /api/corridors/{slug}

Fetch one corridor with its anchors.

### 200 OK

Derived from `serializeCorridorDetail` in `lib/api/corridors.ts`.

```json
{
  "corridor": {
    "slug": "ngnt-ng-ngn-ng",
    "sourceAsset": "NGNT",
    "sourceCountry": "NG",
    "destinationAsset": "NGN",
    "destinationCountry": "NG",
    "anchorCount": 1,
    "anchors": [
      {
        "slug": "cowrie",
        "name": "Cowrie",
        "homeDomain": "cowrie.exchange",
        "status": "LIVE",
        "seps": [1, 6],
        "isTransferCapable": true
      }
    ]
  }
}
```

A corridor with no associated anchors returns `"anchorCount": 0` and
`"anchors": []` with a `200`.

### 400 Bad Request

```json
{ "error": { "code": "invalid_corridor_slug", "message": "A valid corridor slug is required." } }
```

### 404 Not Found

```json
{ "error": { "code": "corridor_not_found", "message": "Corridor not found." } }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to load corridor." } }
```

---

## GET /api/rates?corridor={slug}

Latest corridor rate observations and median. The `corridor` query parameter
is **required**.

### 200 OK — healthy

Derived from `serializeRates` in `lib/api/rates.ts` and `tests/unit/api/ratesApi.test.ts`
(the exact decimal strings are preserved from the persisted decimal columns).

```json
{
  "corridor": {
    "slug": "usdc-us-brl-br",
    "sourceAsset": "USDC",
    "sourceCountry": "US",
    "destinationAsset": "BRL",
    "destinationCountry": "BR"
  },
  "evaluatedAt": "2026-08-28T12:00:00.000Z",
  "state": "healthy",
  "medianRate": "0.1000000000000000015",
  "sourceCount": 4,
  "freshSourceCount": 2,
  "reviewedCandidateConfiguration": {
    "candidateCount": 1,
    "uniqueAnchorCount": 1
  },
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": [
    {
      "anchor": { "slug": "zeam", "name": "Zeam" },
      "rate": "0.100000000000000001",
      "sourceAmount": "100",
      "destinationAmount": "1000",
      "fee": "1",
      "capturedAt": "2026-08-28T11:59:59.000Z",
      "freshness": { "state": "fresh", "ageMs": 1000 },
      "eligibleForMedian": true
    }
  ]
}
```

Notes:

- `state` is `"healthy"` when at least `minimumFreshIndependentSources` (2)
  fresh, valid sources are available, otherwise `"insufficient_fresh_sources"`.
- `medianRate` is `null` when there are fewer than 2 fresh independent
  sources (see below).
- `rate`, `sourceAmount`, `destinationAmount`, and `fee` are **strings**
  preserving decimal precision.
- `observations[].freshness.state` is one of `"fresh"`, `"stale"`,
  `"future"`, `"invalid"`; `ageMs` is `null` for invalid times.
- `exclusionReason` appears only when the observation is **not**
  `eligibleForMedian` (values: `"stale"`, `"future_timestamp"`,
  `"invalid_timestamp"`, `"invalid_rate"`).
- One observation may have both `exclusionReason` and `eligibleForMedian:
  false`. When no exclusion applies, `exclusionReason` is omitted entirely.
- `reviewedCandidateConfiguration` reports how the **reviewed** candidate
  configuration matched this corridor (`candidateCount` and
  `uniqueAnchorCount` are both `0` for corridors without reviewed candidates).
- `medianRequirement.minimumFreshIndependentSources` is the live constant
  `MIN_FRESH_SOURCES` (`2`).

### 200 OK — insufficient fresh sources

Fewer than 2 fresh valid sources (including one source or none). The median is
`null` and `state` is `"insufficient_fresh_sources"` — this is still a `200`.

```json
{
  "corridor": {
    "slug": "usdc-us-brl-br",
    "sourceAsset": "USDC",
    "sourceCountry": "US",
    "destinationAsset": "BRL",
    "destinationCountry": "BR"
  },
  "evaluatedAt": "2026-08-28T12:00:00.000Z",
  "state": "insufficient_fresh_sources",
  "medianRate": null,
  "sourceCount": 1,
  "freshSourceCount": 1,
  "reviewedCandidateConfiguration": {
    "candidateCount": 1,
    "uniqueAnchorCount": 1
  },
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": [
    {
      "anchor": { "slug": "zeam", "name": "Persisted Zeam Name" },
      "rate": "0.170000000000000001",
      "sourceAmount": "100",
      "destinationAmount": "1700",
      "fee": "0",
      "capturedAt": "2026-08-28T11:59:59.000Z",
      "freshness": { "state": "fresh", "ageMs": 1000 },
      "eligibleForMedian": true
    }
  ]
}
```

With **no** observations at all, `sourceCount` and `freshSourceCount` are
`0` and `observations` is `[]` (still `state: "insufficient_fresh_sources"`,
`medianRate: null`).

### 400 Bad Request

`corridor` missing or empty:

```json
{ "error": { "code": "missing_corridor", "message": "A corridor slug is required." } }
```

`corridor` malformed (longer than 100 characters or failing the slug pattern):

```json
{ "error": { "code": "invalid_corridor", "message": "The corridor slug is invalid." } }
```

### 404 Not Found

A syntactically valid but unknown corridor slug.

```json
{ "error": { "code": "corridor_not_found", "message": "Corridor not found." } }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to read rates." } }
```

---

## GET /api/rates/history?corridor={slug}&days={1..365}

Read-only historical corridor-rate points. `corridor` is required; `days`
defaults to 30 and must be an integer from 1 through 365.

### 200 OK

The response preserves exact decimal strings and may contain points whose
`medianRate` is `null` with `state: "insufficient_fresh_sources"`.

```json
{
  "corridor": {
    "slug": "usdc-us-brl-br",
    "sourceAsset": "USDC",
    "sourceCountry": "US",
    "destinationAsset": "BRL",
    "destinationCountry": "BR"
  },
  "evaluatedAt": "2026-09-30T12:00:00.000Z",
  "windowDays": 30,
  "points": [
    {
      "timestamp": "2026-09-30T11:00:00.000Z",
      "medianRate": null,
      "state": "insufficient_fresh_sources",
      "sourceCount": 1,
      "freshSourceCount": 1,
      "observations": [
        {
          "anchor": { "slug": "zeam", "name": "Zeam" },
          "rate": "0.17",
          "sourceAmount": "100",
          "destinationAmount": "17",
          "fee": "1",
          "capturedAt": "2026-09-30T11:00:00.000Z"
        }
      ]
    }
  ]
}
```

On a verified last-known-good fallback, the response retains the same body shape
and includes stale-evidence response headers.

### 400 Bad Request

Missing/malformed corridor uses `missing_corridor` / `invalid_corridor`.
An invalid `days` value uses:

```json
{
  "error": {
    "code": "invalid_days",
    "message": "The days parameter must be an integer between 1 and 365."
  }
}
```

### 404 Not Found

```json
{ "error": { "code": "corridor_not_found", "message": "Corridor not found." } }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to read rate history." } }
```

---

## GET /api/reputation

List reputation results for every anchor in the persisted directory, sorted
ascending by `slug`.

### 200 OK

Derived from `serializeReputation` / `serializeReputationList` in
`lib/api/reputation.ts` and its unit tests. Every anchor is present; anchors
without a persisted reputation score are `"not_evaluated"`.

```json
{
  "reputation": [
    {
      "anchor": { "slug": "cowrie", "name": "Cowrie" },
      "state": "not_evaluated",
      "score": null,
      "scoreBand": null,
      "evidence": null,
      "metrics": null,
      "computedAt": null
    }
  ],
  "count": 1
}
```

### Response states for a single entry

The `state` field is one of three values:

1. **`not_evaluated`** — no persisted reputation score. All of `score`,
   `scoreBand`, `evidence`, `metrics`, `computedAt` are `null` (shown above).

2. **`insufficient_evidence`** — a score row was persisted but the evaluation
   concluded there was not enough evidence (fewer than 30 in-window outcomes,
   or no corridors, or no latest rates). `score`, `scoreBand` are `null`;
   `evidence.outcomeCount` is the persisted sample size and the metrics are
   still serialized (each nullable metric is `null` when nothing was persisted):

```json
{
  "anchor": { "slug": "cowrie", "name": "Cowrie" },
  "state": "insufficient_evidence",
  "score": null,
  "scoreBand": null,
  "evidence": { "outcomeCount": 0 },
  "metrics": {
    "fillRate7d": null,
    "fillRate30d": null,
    "fillRate90d": null,
    "settleP50Ms": null,
    "settleP95Ms": null,
    "slippageP50": null,
    "slippageP95": null
  },
  "computedAt": "2026-08-31T13:54:34.979Z"
}
```

3. **`established`** — a score was produced by the engine. `score` is an
   integer in `0..100`, `scoreBand` is lowercase `"green"` / `"amber"` /
   `"red"`, and metrics are serialized as persisted (individually `null` when
   not available):

```json
{
  "anchor": { "slug": "zeam", "name": "Zeam" },
  "state": "established",
  "score": 95,
  "scoreBand": "green",
  "evidence": { "outcomeCount": 30 },
  "metrics": {
    "fillRate7d": null,
    "fillRate30d": 0.9,
    "fillRate90d": null,
    "settleP50Ms": 1000,
    "settleP95Ms": null,
    "slippageP50": null,
    "slippageP95": 0.02
  },
  "computedAt": "2026-08-31T13:54:34.979Z"
}
```

Empty directory:

```json
{ "reputation": [], "count": 0 }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to load reputation." } }
```

---

## GET /api/reputation/{slug}

Fetch the reputation entry for one anchor. Slug validation happens **before**
repository access.

### 200 OK

Same entry shape as the list route (all three states above), under a
`reputation` key:

```json
{
  "reputation": {
    "anchor": { "slug": "zeam", "name": "Zeam" },
    "state": "established",
    "score": 95,
    "scoreBand": "green",
    "evidence": { "outcomeCount": 30 },
    "metrics": {
      "fillRate7d": null,
      "fillRate30d": 0.9,
      "fillRate90d": null,
      "settleP50Ms": 1000,
      "settleP95Ms": null,
      "slippageP50": null,
      "slippageP95": 0.02
    },
    "computedAt": "2026-08-31T13:54:34.979Z"
  }
}
```

### 400 Bad Request

```json
{ "error": { "code": "invalid_anchor_slug", "message": "A valid anchor slug is required." } }
```

### 404 Not Found

```json
{ "error": { "code": "anchor_not_found", "message": "Anchor not found." } }
```

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to load reputation." } }
```

---

## GET /api/internal/cron/refresh

Internal scheduled refresh (Vercel Cron, `0 0 * * *` per `vercel.json`).
Serves the integration of the rate-ingestion pipeline with reputation
evaluation.

- **Auth:** requires `Authorization: Bearer <CRON_SECRET>`; the secret is
  compared with a SHA-256 digest using `timingSafeEqual`
  (`lib/scheduled/cronAuth.ts`).
- **Not rate limited** — the limiter is deliberately not applied to this route.
- Runs with `export const runtime = "nodejs"`.

### 401 Unauthorized

```json
{ "error": { "code": "unauthorized", "message": "Unauthorized." } }
```

### 200 OK

Body mirrors `ScheduledRefreshResult` (`types/scheduled.ts`), bounded JSON:

```json
{
  "ok": true,
  "startedAt": "2026-08-31T16:00:00.000Z",
  "completedAt": "2026-08-31T16:00:01.000Z",
  "rates": { "attempted": 1, "succeeded": 1, "failed": 0, "skipped": 0, "failures": [] },
  "reputation": { "attempted": 3, "succeeded": 3, "failed": 0, "failures": [] }
}
```

Partial failures keep `ok: false` and report per-phase counts and failure
lists.

### 500 Internal Server Error

```json
{ "error": { "code": "internal_error", "message": "Unable to run scheduled refresh." } }
```

---

## Rate limiting

Introduced in this change set. All **eight** public GET routes
(`/api/anchors`, `/api/anchors/{slug}`, `/api/corridors`,
`/api/corridors/{slug}`, `/api/rates`, `/api/rates/history`, `/api/reputation`,
`/api/reputation/{slug}`) are limited to **100 requests per minute per client
IP** (`lib/api/rateLimiter.ts`).

- **Client identity:** the first entry of the `x-forwarded-for` header, then
  `x-real-ip`, then the constant `"anonymous"`.
- **Algorithm:** in-memory fixed window (60 000 ms) per serverless instance.
  The budget is per-instance, not cluster-wide — on Vercel this is an
  approximation of a global limit, with no external storage required.
- **Enforcement point:** the limiter runs at the top of each route handler,
  before any repository access.

### 429 Too Many Requests

```json
{ "error": { "code": "rate_limited", "message": "Too many requests. Please try again later." } }
```

The interaction with path segments: because each route enforces the shared
`getRateLimiter()` singleton, an overloaded client is rejected on **every**
public route once its per-minute budget is exhausted, not just the one route
it spammed.

Internal cron is exempt: `app/api/internal/cron/refresh/route.ts` does not
call the limiter.

---

## Cross-cutting behavior notes

- **No blue-green or versioned paths.** There is no `/v1` prefix and no legacy
  aliases; the paths above are the only public surface.
- **GET only.** Every route module exports only `GET` and never
  `POST`/`PUT`/`PATCH`/`DELETE`.
- **No cookies, no CORS headers** are set by these handlers.
- **`Cache-Control: no-store`** is set on all success and error responses,
  including the 429 rate-limit response.