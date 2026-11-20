# Evidence provenance walkthrough

This document traces one complete evidence journey: how a reviewed
configuration choice becomes a persisted rate observation visible in the
public dashboard. It follows a single SEP-38 indicative-price snapshot from
the reviewed registry through the protected refresh, database persistence,
latest-observation selection, API serialization, and server-rendered
dashboard rendering.

The walkthrough describes **pipeline behavior**, not current production
observations. The reviewed source list contains one Zeam USDC → BRL candidate,
which is insufficient for a median (`MIN_FRESH_SOURCES = 2`). No transfer
outcomes are ingested, and reputation scores remain sparse. These are
statements about the current reviewed configuration and the absence of a
trusted outcome source, not architectural limitations.

For the provenance model, configuration fingerprinting, and redaction rules
in detail, see [rate-provenance.md](rate-provenance.md). For system-wide
architecture, see [architecture.md](architecture.md).

## Journey overview

The following text diagram traces the path from a reviewed configuration entry
to a dashboard-rendered rate observation. Each stage links to the file that
implements it.

```text
┌─────────────────────────────────────────────────────────────────────┐
│  1. REVIEWED REGISTRY (constants/)                                   │
│                                                                     │
│  anchors.ts          corridors.ts         liveRateSources.ts        │
│  ┌───────────┐       ┌──────────────┐      ┌──────────────────┐      │
│  │ slug: zeam │       │ slug: usdc-  │      │ anchorSlug: zeam  │      │
│  │ homeDomain│       │   us-brl-br  │      │ corridorSlug:     │      │
│  │ zeam.money│       │ USDC→BRL/BR  │      │   usdc-us-brl-br  │      │
│  └───────────┘       └──────────────┘      │ sellAsset: USDC   │      │
│         │                   │              │ buyAsset:  BRL    │      │
│         └─────────┬─────────┘              │ sellAmount: 100   │      │
│                   │                        │ countryCode: BR   │      │
│                   ▼                        └────────┬─────────┘      │
│            npm run bootstrap:registry               │                │
│            (scripts/bootstrap-registry.ts)           │                │
│            SEP-1 discovery → upsert anchors,        │                │
│            corridors, anchor_corridors               │                │
│                   │                                  │                │
└───────────────────┼──────────────────────────────────┘                │
                    │                                    │                │
                    ▼                                    │                │
┌───────────────────────────────────────────────────────┼──────────────┐
│  2. PROTECTED REFRESH (lib/scheduled/)                 │              │
│                                                        ▼              │
│  GET /api/internal/cron/refresh                        │              │
│  (app/api/internal/cron/refresh/route.ts)              │              │
│         │                                                             │
│         ▼                                                             │
│  http.ts → cronAuth.ts                                                │
│  Verify Bearer CRON_SECRET (timing-safe, rotation-aware)              │
│         │                                                             │
│         ▼                                                             │
│  refresh.ts → runScheduledRefresh()                                   │
│         │                                                             │
│         ├──► snapshotReviewedLiveRates (snapshotRun.ts)               │
│         │         │                                                   │
│         │         ▼                                                   │
│         │    liveRateSource.ts                                        │
│         │    buildReviewedLiveRateCandidates(sources)                 │
│         │      │ discover SEP-1 TOML → find quote server              │
│         │      │ validate pair via SEP-38 /prices                      │
│         │      │ compute configurationDigest (sourceConfigFingerprint) │
│         │      ▼                                                     │
│         │    rateEngine.ts → runRateEngine()                          │
│         │      │ fetch SEP-38 /price (indicative)                      │
│         │      │ normalize (normalize.ts)                             │
│         │      │ build provenance (provenance.ts)                     │
│         │      ▼                                                     │
│         │    snapshot.ts → persistRateSnapshot()                      │
│         │      │ verify anchor + corridor + association exist        │
│         │      │ $transaction: rate_snapshots + provenance row        │
│         │      ▼                                                     │
│         │    RateSnapshot + RateSnapshotProvenance persisted          │
│         │                                                             │
│         └──► evaluatePersistedAnchorReputations (reputation/run.ts)  │
│                   (separate pipeline, see reputation-methodology.md)   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. LATEST-OBSERVATION SELECTION (lib/rates/)                        │
│                                                                     │
│  latestRateReadModel.ts → readLatestCorridorRate(corridorSlug)       │
│         │                                                           │
│         ▼                                                           │
│  latestRateRepository.ts                                            │
│    LATERAL subquery: newest snapshot per anchor                      │
│    ORDER BY captured_at DESC, id DESC                                │
│         │                                                           │
│         ▼                                                           │
│  selectLatestPerAnchor() → one observation per anchor                │
│         │                                                           │
│         ▼                                                           │
│  freshness.ts → getRateFreshness() at read time                     │
│  median.ts → computeFreshMedian()                                   │
│    filter: fresh only, ≥ MIN_FRESH_SOURCES                           │
│         │                                                           │
│         ▼                                                           │
│  LatestCorridorRate read result                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. API SERIALIZATION (lib/api/)                                    │
│                                                                     │
│  GET /api/rates?corridor=usdc-us-brl-br                              │
│  (app/api/rates/route.ts → requestHandlers.ts)                      │
│         │                                                           │
│         ▼                                                           │
│  rates.ts → getRatesApiResult() → serializeRates()                  │
│    reviewedCandidateConfiguration (reviewedCandidateConfiguration.ts)│
│    medianRequirement (MIN_FRESH_SOURCES)                            │
│    observations with freshness + eligibility                         │
│         │                                                           │
│         ▼                                                           │
│  PublicRatesResponse (JSON, Cache-Control: no-store)               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. DASHBOARD (app/dashboard/ + components/dashboard/)              │
│                                                                     │
│  page.tsx → RatePanel (RatePanel.tsx)                                │
│    calls getRatesApiResult("usdc-us-brl-br")                        │
│    renders: corridor, state badge, median (or null),                │
│    configuration label, observation table with freshness             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## 1. Reviewed registry

The journey begins with three checked-in configuration files that define which
anchors, corridors, and rate sources StellarCore recognizes.

### Anchor registry

[`constants/anchors.ts`](../constants/anchors.ts) exports a frozen, validated
array of `AnchorRegistryEntry` objects. Each entry has a `slug`, `name`, and
`homeDomain`. The current registry contains three anchors: MoneyGram, Cowrie,
and Zeam. Validation in
[`lib/stellar/anchorRegistry.ts`](../lib/stellar/anchorRegistry.ts) rejects
duplicates, invalid slugs, and missing home domains before the array is
exported.

### Corridor registry

[`constants/corridors.ts`](../constants/corridors.ts) exports two frozen
arrays. The `CORRIDOR_REGISTRY` defines corridors by their asset pair and
countries (for example, `usdc-us-brl-br` maps USDC/US to BRL/BR). The
`ANCHOR_CORRIDOR_REGISTRY` maps each anchor slug to the corridors it
supports. Zeam is associated with `usdc-us-brl-br`. Both arrays are validated
by [`lib/stellar/corridorRegistry.ts`](../lib/stellar/corridorRegistry.ts)
against the anchor registry so a corridor cannot reference an unregistered
anchor.

### Reviewed live rate sources

[`constants/liveRateSources.ts`](../constants/liveRateSources.ts) exports
`REVIEWED_LIVE_RATE_SOURCES`, the reviewed list of SEP-38 indicative-price
candidates. The current production state contains one entry:

| Field | Value |
|---|---|
| `anchorSlug` | `zeam` |
| `corridorSlug` | `usdc-us-brl-br` |
| `sellAsset` | `stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| `buyAsset` | `iso4217:BRL` |
| `sellAmount` | `100` |
| `buyDeliveryMethod` | `PIX` |
| `countryCode` | `BR` |
| `context` | `sep31` |

This is the reviewed configuration choice that starts the provenance journey.
StellarCore does not call firm-quote endpoints or execute transfers. The
`context` field records which SEP context the indicative price is relevant to;
it is metadata, not proof that a transfer can be executed or observed.

### Registry bootstrap

`npm run bootstrap:registry` runs
[`scripts/bootstrap-registry.ts`](../scripts/bootstrap-registry.ts), which
calls [`syncAnchorRegistry`](../lib/stellar/anchorSync.ts) and
[`syncCorridorRegistry`](../lib/stellar/corridorSync.ts). For each reviewed
anchor, it fetches and parses the anchor's `stellar.toml` via SEP-1, discovers
supported SEPs and endpoints, and upserts the result into the `anchors`
table. Corridor rows and `anchor_corridors` association rows are upserted
transactionally. This is a manual job, not part of the daily refresh.

The bootstrap writes anchor and corridor rows that later rate-persistence and
read-model queries depend on. A rate snapshot cannot be persisted unless a
matching anchor, corridor, and `anchor_corridors` association all exist (see
[persistence](#rate-engine-and-snapshot-persistence) below).

## 2. Protected refresh

An external scheduler (Vercel Cron in production) calls
`GET /api/internal/cron/refresh` daily. This route is the only entry point
that writes rate snapshots. Public API routes are read-only and never trigger
synchronization. (The `npm run snapshot:rates` CLI script also calls
`snapshotReviewedLiveRates` for manual verification.)

### Authentication

The route handler in
[`app/api/internal/cron/refresh/route.ts`](../app/api/internal/cron/refresh/route.ts)
delegates to
[`lib/scheduled/http.ts`](../lib/scheduled/http.ts), which calls
[`hasValidCronAuthorization`](../lib/scheduled/cronAuth.ts) to verify the
`Authorization: Bearer <CRON_SECRET>` header. Verification is timing-safe
and supports bounded secret rotation via `CRON_SECRET_PREVIOUS` and
`CRON_SECRET_ROTATION_UNTIL`. Any missing, malformed, or invalid credential
returns a 401 JSON response. No other authentication mechanism is accepted.

### Refresh orchestration

On successful authentication,
[`runScheduledRefresh`](../lib/scheduled/refresh.ts) executes two phases:

1. **Rate ingestion** — calls
   [`snapshotReviewedLiveRates`](../lib/rates/snapshotRun.ts), which prepares
   and executes reviewed SEP-38 indicative-price candidates and persists
   snapshots.
2. **Reputation evaluation** — calls
   `evaluatePersistedAnchorReputations`
   ([`lib/reputation/run.ts`](../lib/reputation/run.ts)), which evaluates each
   persisted anchor at the shared run timestamp.

Rate ingestion precedes reputation evaluation so the evaluation can use
observations written in the same run. A rate preparation failure is isolated:
the run summary reports it as a safe failure while reputation evaluation still
runs. A fatal reputation-run failure surfaces as a 500 response.

### Candidate preparation

[`snapshotReviewedLiveRates`](../lib/rates/snapshotRun.ts) first checks for
durable poison-input suppressions (sources that have failed deterministically
and are temporarily excluded). It then calls
[`buildReviewedLiveRateCandidates`](../lib/rates/liveRateSource.ts), which for
each reviewed source:

1. Resolves the anchor from `ANCHOR_REGISTRY` and the corridor from
   `CORRIDOR_REGISTRY`, rejecting unregistered references.
2. Validates that the source's asset identifiers match the corridor definition
   via `validateSourceCorrelation`.
3. Discovers the anchor's SEP-1 TOML to find the `anchorQuoteServer` endpoint.
4. Validates that the desired pair is advertised via the SEP-38 `/prices`
   endpoint.
5. Computes a `configurationDigest` from the reviewed source record using
   [`computeRateSourceConfigurationFingerprint`](../lib/rates/sourceConfigurationFingerprint.ts).

The configuration digest is a deterministic SHA-256 hash over the reviewed
source fields (anchor slug, corridor slug, assets, amount, delivery method,
country, context). It captures the reviewed configuration the candidate was
built from, never the discovered endpoint URL or any runtime value. See
[rate-provenance.md](rate-provenance.md#configuration-fingerprint-331) for the
full canonicalization rules.

### Rate engine and snapshot persistence

The prepared candidates are passed to
[`runRateEngine`](../lib/rates/rateEngine.ts). The engine mints one
`captureRunId` (a UUID) shared by every snapshot persisted in this run. For
each candidate it:

1. Fetches the SEP-38 indicative price via
   [`fetchReviewedIndicativeRate`](../lib/rates/liveRateSource.ts), which calls
   the anchor's `/price` endpoint. This is a public indicative price, not a
   firm quote.
2. Normalizes the response via
   [`normalizeIndicativeRate`](../lib/rates/normalize.ts), which validates asset
   identifiers, checks arithmetic consistency (price, total price, amounts,
   fees), and rejects malformed data with specific error codes.
3. Builds capture-time provenance via
   [`buildRateSnapshotProvenance`](../lib/rates/provenance.ts), which records the
   capture run ID, source type (`sep38_indicative_price`), anchor/corridor
   slugs, configuration digest, request-shape version, and capture timestamp.
4. Persists both rows in a single database transaction via
   [`persistRateSnapshot`](../lib/rates/snapshot.ts).

The persistence boundary in `snapshot.ts` verifies that the anchor, corridor,
and `anchor_corridors` association all exist before writing. The
`createSnapshot` method wraps the snapshot insert and provenance insert in a
Prisma `$transaction`, so a snapshot row can never exist without its lineage
row. The snapshot is written to the `rate_snapshots` table; the provenance to
`rate_snapshot_provenance`.

A candidate that fails at any phase (quote, normalization, persistence)
produces no snapshot and no provenance row. It appears only in the bounded run
summary as a `failures` entry with the anchor slug, corridor slug, phase, and
error code. Skipped candidates (duplicates) appear as `skippedSources`. No
partial or unverified data is persisted.

> **Read-only evidence boundary:** StellarCore calls only the SEP-38
> indicative-price endpoint (`/price`). It does not call the firm-quote
> lifecycle (`/quote`), does not execute transfers, and does not use customer
> authentication contexts. The `context` field on the reviewed source records
> which SEP context the price is relevant to; it is not proof of transfer
> capability or transfer observation.

## 3. Latest-observation selection

When a consumer requests rates, StellarCore does not fetch live data. It reads
persisted snapshots from the database and evaluates freshness at read time.

### Read model

[`readLatestCorridorRate`](../lib/rates/latestRateReadModel.ts) is the entry
point. Given a corridor slug, it:

1. Finds the persisted corridor row by slug. If none exists, returns a
   `CORRIDOR_NOT_FOUND` failure.
2. Queries the latest observation per anchor via
   [`findLatestObservations`](../lib/rates/latestRateRepository.ts), which uses
   a `CROSS JOIN LATERAL` subquery selecting the single newest row per
   `(corridor, anchor)` pair ordered by `captured_at DESC, id DESC`. This is a
   bounded set of index probes, not a walk over the corridor's snapshot
   history.
3. Applies
   [`selectLatestPerAnchor`](../lib/rates/latestRateReadModel.ts) to ensure one
   observation per anchor, with a stable tie-breaker (lexicographic snapshot id
   for identical timestamps).
4. Filters out any observations whose anchor is in durable suppression.
5. Evaluates freshness for each observation via
   [`getRateFreshness`](../lib/rates/freshness.ts), which compares
   `capturedAt` to the evaluation timestamp. An observation is **fresh** if its
   age is at most `RATE_FRESHNESS_THRESHOLD_MS` (default: 120 seconds).
6. Computes the median via
   [`computeFreshMedian`](../lib/rates/median.ts), which includes only fresh,
   valid-rate observations and requires at least `MIN_FRESH_SOURCES` (2) fresh
   independent sources. With fewer than two, the state is
   `insufficient_fresh_sources` and the median is `null`.

### Current production state

The reviewed configuration contains one Zeam candidate for `usdc-us-brl-br`.
Even when that observation is fresh, one fresh source is below the
architectural minimum of two. The read model therefore returns:

- `state`: `insufficient_fresh_sources`
- `median`: `null`
- `freshSourceCount`: 1 (if the observation is fresh)
- `totalIndependentSources`: 1

This is expected behavior, not an error. The API returns HTTP 200 with the
null median and a `state` badge that reads `insufficient fresh sources`.

## 4. API serialization

### Route handler

`GET /api/rates?corridor=<slug>` is handled by
[`app/api/rates/route.ts`](../app/api/rates/route.ts), which delegates to
[`handleRatesRequest`](../lib/api/requestHandlers.ts). The handler applies
rate limiting, validates query parameters (only `corridor` is accepted;
repeated or unsupported parameters return 400 `invalid_query`), and calls
[`getRatesApiResult`](../lib/api/rates.ts).

### Serialization

[`getRatesApiResult`](../lib/api/rates.ts) calls the read model, then
[`serializeRates`](../lib/api/rates.ts) to build the `PublicRatesResponse`. The
serializer maps the internal read model to the public API shape:

| Internal field | Public field |
|---|---|
| `corridor.assetCodeFrom` | `corridor.sourceAsset` |
| `corridor.countryFrom` | `corridor.sourceCountry` |
| `corridor.assetCodeTo` | `corridor.destinationAsset` |
| `corridor.countryTo` | `corridor.destinationCountry` |
| `median` | `medianRate` |
| `totalIndependentSources` | `sourceCount` |
| `freshSourceCount` | `freshSourceCount` |
| `state` | `state` |

The response also includes:

- `reviewedCandidateConfiguration`, computed by
  [`getReviewedCandidateConfiguration`](../lib/rates/reviewedCandidateConfiguration.ts),
  which reads the static `REVIEWED_LIVE_RATE_SOURCES` array to report how many
  reviewed candidates and unique anchors exist for the requested corridor. This
  is configuration metadata, not runtime evidence.
- `medianRequirement`, reporting the architectural `MIN_FRESH_SOURCES` value.
- `observations`, an array where each entry includes the anchor slug and name,
  rate, source/destination amounts, fee, capture timestamp, freshness state and
  age, and whether the observation was eligible for the median (with an
  exclusion reason if not).

All responses include `Cache-Control: no-store` so changing source age cannot
be hidden by caching.

### Illustrative response

The following example shows the shape returned for `usdc-us-brl-br` with one
fresh Zeam observation. This is illustrative of the serialized structure, not
a live production snapshot:

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
      "anchor": { "slug": "zeam", "name": "Zeam" },
      "rate": "0.175",
      "sourceAmount": "100",
      "destinationAmount": "571.428571",
      "fee": "0",
      "capturedAt": "2026-08-28T11:59:50.000Z",
      "freshness": { "state": "fresh", "ageMs": 10000 },
      "eligibleForMedian": true
    }
  ]
}
```

> **Note:** The individual observation has `eligibleForMedian: true` because it
> is fresh and has a valid rate. The median is still `null` because the total
> fresh source count (1) is below `MIN_FRESH_SOURCES` (2). The top-level `state`
> field reports `insufficient_fresh_sources`. An observation only receives an
> `exclusionReason` when it is individually stale, has a future or invalid
> timestamp, or has an invalid rate.

### Stale-evidence fallback

When a transient PostgreSQL connectivity error occurs during a rate read, the
API may serve a bounded last-known-good response from a verified local snapshot
store. The response preserves the original `evaluatedAt` and includes a
`degraded` object with stale-evidence metadata and an `X-Evidence-State:
stale` header. This fallback is read-only and never feeds rate aggregation or
reputation evaluation. See the [README](../README.md) API reference for the
full stale-evidence contract.

## 5. Dashboard

The server-rendered [`/dashboard`](../app/dashboard/page.tsx) page consumes
the same `getRatesApiResult` function as the public API. It renders a
[`RatePanel`](../components/dashboard/RatePanel.tsx) component for the featured
corridor `usdc-us-brl-br`.

### RatePanel rendering

The `RatePanel` server component calls `getRatesApiResult` with the featured
corridor slug and passes the result to `RatePanelView`, a pure render function
that displays:

- **Corridor header** — source asset and country to destination asset and
  country.
- **State badge** — `positive` tone for `healthy`, `warning` tone for
  `insufficient_fresh_sources`.
- **Median rate** — the computed median, or "Median unavailable" when null.
- **Configuration label** — reviewed candidate count and unique anchor count
  from `reviewedCandidateConfiguration`, with an explicit note that
  "Configuration is not proof that a source is operational or currently
  returning a price."
- **Observations** — for each persisted latest observation: anchor name, rate,
  fee, capture timestamp (formatted via `EvidenceTimestamp`), freshness badge
  (`fresh`/`stale`/`future`/`invalid`), and median eligibility.

The dashboard uses `Cache-Control: no-store` (via `export const dynamic =
"force-dynamic"`) and renders server-side, so the UI and public API present
the same persisted evidence and uncertainty semantics. No client-side data
fetching or live SEP-38 requests occur.

### What the dashboard does not show

- No live availability claims. The `status` field on anchors is persisted
  synchronization state, not current operation.
- No transfer outcomes or verified settlement. The `TransferOutcome` model has
  no production writer.
- No inferred reputation scores. When outcome evidence is insufficient,
  `state` is `insufficient_evidence` and the score is `null`.

## Provenance traceability

Every snapshot persisted by the reviewed boundary has a companion
`RateSnapshotProvenance` row written in the same transaction. The provenance
record stores:

| Field | Type | Description |
|---|---|---|
| `captureRunId` | string | UUID shared by all snapshots of one run |
| `sourceType` | string | `sep38_indicative_price` |
| `anchorSlug` | string | Anchor slug as selected at capture time |
| `corridorSlug` | string | Corridor slug as selected at capture time |
| `configurationDigest` | string | SHA-256 of the reviewed source configuration |
| `requestShapeVersion` | string | `sep38-indicative-request-v1` |
| `capturedAt` | timestamp | When the observation was captured |
| `recordedAt` | timestamp | When the provenance row was written |

The provenance record is constructed field by field from an explicit parameter
list in
[`buildRateSnapshotProvenance`](../lib/rates/provenance.ts). Credentials,
authorization headers, private keys, raw remote payloads, and URLs never enter
the record. Invalid identifiers (bad digest, unstable slugs, oversized run IDs,
invalid timestamps) fail closed with specific error codes, and the candidate
becomes a run-summary failure instead of a snapshot row.

Legacy snapshots written before the provenance table existed have no lineage
row. The trace path in
[`traceRateSnapshotProvenance`](../lib/rates/provenanceRepository.ts) reports
those rows as `PROVENANCE_UNAVAILABLE` — never reconstructed from the current
registry.

For the full provenance model, redaction rules, and field-selection
canonicalization, see [rate-provenance.md](rate-provenance.md).

## Read-only evidence boundaries

This walkthrough preserves the following boundaries:

- **No invented live availability.** Anchor `status` is persisted
  synchronization and discovery state, not a guarantee of current quote health.
- **No verified transfers.** StellarCore calls only the SEP-38 indicative-price
  endpoint. It does not call firm quotes, execute transfers, or use customer
  authentication contexts.
- **No unsupported scores.** Reputation scores remain `null` when outcome
  evidence is insufficient. The `TransferOutcome` model has no trusted
  production writer.
- **No backfilled lineage.** Legacy snapshots without provenance rows keep
  unknown lineage, truthfully reported.
- **No median below the architectural minimum.** With fewer than two fresh
  independent sources, the median is `null` and the state is
  `insufficient_fresh_sources`.

## Related documentation

- [rate-provenance.md](rate-provenance.md) — provenance model, configuration
  fingerprinting, redaction rules
- [architecture.md](architecture.md) — system-wide architecture and data flow
- [reputation-methodology.md](reputation-methodology.md) — reputation scoring
  components and thresholds
- [README](../README.md) — API reference, setup, and operational invariants
- [DEPLOYMENT.md](DEPLOYMENT.md) — production deployment procedures
- [runbook-onboarding-rate-source.md](runbook-onboarding-rate-source.md) —
  operational steps for adding a reviewed rate source
