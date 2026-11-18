# StellarCore

**The intelligence layer for Stellar anchors.**

Read-only anchor, corridor, rate, and reputation visibility for Stellar.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Built on Stellar](https://img.shields.io/badge/Built%20on-Stellar-7C3AED)](https://stellar.org)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)](https://typescriptlang.org)
[![Drips Wave](https://img.shields.io/badge/Drips%20Wave-7-00d4b4)](https://drips.network/wave)

---

## The Problem

The Stellar network has dozens of anchors — companies like MoneyGram, Cowrie, and others that handle USDC off-ramps to local currencies across Nigeria, Kenya, Ghana, Mexico, and more. But there is no single source of truth for:

- Which anchors support a given corridor
- What reviewed rate observations are currently available
- Whether enough independently verifiable evidence exists to publish a reputation score
- Which anchors are live, degraded, or down

Developers and users are left checking anchor websites one at a time. StellarCore provides a reviewed, read-only view of the data it has actually persisted.

---

## What StellarCore Does

StellarCore synchronizes a reviewed anchor and corridor registry, discovers anchor metadata through SEP-1, stores reviewed SEP-38 indicative-rate observations, calculates reputation from persisted evidence, and exposes read-only APIs plus a public dashboard.

The implementation separates architectural behavior from current production state:

- **Architectural invariants:** rate medians require `MIN_FRESH_SOURCES=2`; reputation uses the documented fixed weights and requires at least 30 outcomes in 90 days before publishing a score.
- **Current production state:** the reviewed USDC → BRL rate source is Zeam only, so it is insufficient for a median. The `TransferOutcome` model and scoring logic exist, but there is no trusted production outcome-ingestion source; reputation therefore remains sparse with null scores.
- **Planned/Future:** outcome ingestion is contingent on a legitimate, authorized source with durable provenance. StellarCore does not execute transfers, use customer authentication contexts, or create firm production quotes.

> Think of it as **Google Flights for Stellar anchors** — pick a corridor, see every option, trust the data.

---

## Architecture

```mermaid
graph TB
    subgraph FE["StellarCore Frontend (Next.js)"]
        UI["Public /dashboard\nAnchors · Corridors · Rates · Reputation"]
    end

    subgraph BROWSER["Browser / API Consumer"]
        USER["User / Developer"]
        CLIENT["REST API Client\nfetch · axios · SDK"]
    end

    subgraph BACKEND["Backend Services"]
        BOOTSTRAP["Manual registry bootstrap\nSEP-1 discovery · registry upsert"]
        REFRESH["Authenticated daily refresh\nreviewed SEP-38 indicative rates"]
        REPENG["Reputation engine\npersisted evidence only"]
        MEDIAN["Median pricing\nfresh independent sources only"]
        ROUTES["Next.js Route Handlers\n/api/anchors · /api/rates · /api/reputation"]
    end

    subgraph DB["PostgreSQL · Supabase"]
        ANCHORS[("anchors")]
        CORRIDORS[("corridors")]
        RATES[("rate_snapshots")]
        OUTCOMES[("transfer_outcomes")]
        SCORES[("reputation_scores")]
        JUNCTION[("anchor_corridors")]
    end

    subgraph PUBAPI["Public REST API"]
        PA1["GET /api/anchors"]
        PA2["GET /api/rates"]
        PA3["GET /api/corridors"]
        PA4["GET /api/reputation and /api/reputation/:slug"]
    end

    subgraph STELLAR["Stellar Network"]
        TOML["SEP-1 TOML Files\nanchor.homeDomain/.well-known"]
        SEP38["SEP-38 Quote Endpoints\npublic indicative prices only"]
    end

    USER -->|renders| UI
    UI --> ROUTES
    CLIENT -->|REST calls| PUBAPI
    ROUTES -->|Prisma queries| DB
    PUBAPI -->|query results| DB
    BOOTSTRAP -->|fetch TOML| TOML
    REFRESH -->|fetch indicative prices| SEP38
    REPENG -->|read outcomes| OUTCOMES
    REPENG -->|write scores| SCORES
    MEDIAN -->|read snapshots| RATES
    BOOTSTRAP -->|upsert| ANCHORS
    BACKEND --> DB
```

## How It Works

### 1. Anchor Discovery

StellarCore reads the Stellar network's TOML files. Every Stellar anchor publishes a `stellar.toml` file at their home domain that declares what SEPs they support, what assets they handle, and what endpoints they expose.

```
GET https://anchor.example.com/.well-known/stellar.toml
```

The bootstrap synchronization parses the reviewed registry's TOML files and extracts:

- Supported SEPs (`SEP_6`, `SEP_24`, `SEP_31`, `SEP_38`)
- Supported currencies and asset codes
- API endpoints for rate quotes
- Transfer instruction URLs

`isTransferCapable` is derived from `SEP_6`, `SEP_24`, or `SEP_31`. It is stored metadata, not proof that StellarCore can execute or observe transfers. The public dashboard shows persisted anchors and reviewed corridor associations; it does not infer new corridors from a TOML file.

```typescript
// lib/stellar/anchors.ts

const TRANSFER_SEPS = [6, 24, 31]

export function transferCapable(anchor: Anchor): boolean {
  return anchor.seps?.some((sep) => TRANSFER_SEPS.includes(sep)) ?? false
}
```

### 2. Live Rate Aggregation (SEP-38)

The rate engine stores individual observations from explicitly reviewed SEP-38 indicative-price candidates. It does not call firm-quote endpoints and does not execute transfers.

**Current production state:** the reviewed source list contains one Zeam USDC → BRL candidate. This is an observation about the current reviewed configuration, not a requirement of the architecture.

For each reviewed candidate, StellarCore first validates the pair through the
anchor's SEP-38 `/prices` endpoint, then reads an indicative price from
`/price`. It does not call the firm `/quote` lifecycle.

Rates are stored as timestamped snapshots. A rate is considered **stale** when it is older than `RATE_FRESHNESS_THRESHOLD_MS` (default: 120 seconds).

#### Staleness-Aware Median

The rate engine computes a median across fresh, independent sources when the architectural minimum is met:

```
Illustrative sources for one corridor:

  Anchor A:  ₦1,612  (fresh · 18s old)
  Anchor B:  ₦1,608  (fresh · 41s old)
  Anchor C:  ₦1,590  (stale · 140s old)  ← excluded
  Anchor D:  ₦1,615  (fresh · 12s old)

Fresh sources:  [1608, 1612, 1615]
Sorted median:   1612
```

`MIN_FRESH_SOURCES=2` is an architectural invariant. With fewer than two fresh independent sources, the API returns `insufficient_fresh_sources` and a null median. The current single reviewed Zeam source therefore remains insufficient even when fresh.

### 3. Reputation Scoring

StellarCore's first reputation engine uses only evidence already persisted by
StellarCore. It is not an external endorsement or a claim about an anchor's
legal, custodial, or financial trustworthiness.

| Component | Weight | Definition |
|---|---:|---|
| Availability | 20% | Last synchronized status: `LIVE` 100, `DEGRADED` 50, `DOWN`/`UNKNOWN` 0. |
| Rate freshness | 15% | Fresh latest observations divided by latest observations for synchronized corridors. |
| Coverage | 15% | Synchronized corridors with a fresh latest observation divided by all synchronized corridors. |
| Transfer reliability | 50% | `COMPLETED` outcomes divided by all outcomes in the trailing 90 days. |

Missing evidence scores zero for its component; weight is never redistributed.
Only `COMPLETED` is success. `PARTIAL`, `REFUNDED`, `EXPIRED`, and `ERROR` are
failures. Rate freshness reuses the shared 120-second rule and selects at most
one latest observation per synchronized corridor at one evaluation timestamp.

A score is published only when there are at least 30 outcomes in the 90-day
window, at least one synchronized corridor, and at least one latest rate
observation. Otherwise `compositeScore` and `scoreBand` remain null and the
persisted state is `INSUFFICIENT_DATA`. Established results use state `OK` and
bands `GREEN` (95–100), `AMBER` (80–94), or `RED` (0–79).

Ratios use integer basis-point arithmetic with explicit half-up rounding; the
0–100 result is deterministic and bounded. Stored 7/30/90-day fill rates report
the completed-outcome ratio. Settlement and slippage p50/p95 metrics use
completed outcomes in the trailing 30 days and deterministic nearest-rank
percentiles; they are explanatory metrics, not hidden score inputs.

The schema has one `ReputationScore` per anchor (`anchorId` is unique), so each
calculation upserts the current row and advances `computedAt`; it does not append
historical scores. The engine is run by the authenticated scheduled-refresh
boundary and remains independent of the public, read-only reputation API.

`TransferOutcome` is implemented data modeling, not a production evidence feed. StellarCore has no trusted production outcome-ingestion source today and does not infer outcomes from Horizon or a successful on-chain payment. SEP-6 and SEP-24 history is customer-scoped where authentication applies; SEP-31 lifecycle access is scoped to authorized participants and partner anchors. Until a legitimate, authorized source with provenance exists, sparse reputation is the intended result and established scores are not supported by sufficient evidence.

**Planned/Future:** a transfer-outcome ingestion boundary may be considered only after a trusted source, authorization model, privacy review, and durable provenance design are available. It will not be a promised public write API.

### 4. The Public API

StellarCore exposes persisted anchors, corridors, rates, and reputation through public read-only JSON endpoints. These endpoints do not synchronize anchors, request customer authorization, create transfers, or write outcome evidence.

### 5. The Dashboard

The server-rendered `/dashboard` consumes the same bounded read models as the public API. It shows persisted observations, freshness, null medians where evidence is insufficient, and null reputation scores where outcome evidence is sparse.

---

## Data Flow

### Anchor Sync Flow

```
The manual, protected registry-bootstrap workflow runs `npm run bootstrap:registry`:

  1. Read anchor registry (constants/anchors.ts)
  2. For each anchor:
       → Fetch stellar.toml from homeDomain
       → Parse SEPs, assets, and endpoints
       → Run transferCapable() → true / false
       → Upsert into anchors table
  3. For each anchor + corridor pair:
       → Upsert into anchor_corridors table
  4. Exit nonzero if discovery or persistence fails
```

### Rate Snapshot Flow

```
An external scheduler invokes GET /api/internal/cron/refresh:

  1. Require exactly: Authorization: Bearer <CRON_SECRET>
       → Missing, malformed, or invalid credentials return safe 401 JSON.
  2. Build only reviewed SEP-38 indicative-price candidates.
       → No firm quote endpoint is called.
  3. Fetch each prepared public indicative price and append an individual
     RateSnapshot for each successful observation.
  4. Evaluate every persisted anchor at the one run start timestamp.
       → Each calculation upserts its single current ReputationScore.
  5. Return a bounded, no-store JSON run summary.

Rate preparation failures are returned as a safe rate failure while reputation
evaluation still runs. A fatal reputation-run failure returns a safe HTTP 500;
```

### Reputation Computation Flow

```
For one persisted anchor at one evaluation timestamp:

  1. Read synchronized corridors and last persisted anchor status.
  2. Select one latest RateSnapshot per synchronized corridor.
  3. Read TransferOutcome rows from the trailing 90 days.
  4. Reuse shared freshness semantics and normalize bounded evidence counts.
  5. Calculate the four documented weighted components with basis-point math.
  6. If evidence thresholds are unmet:
       → compositeScore = null
       → scoreBand = null
       → state = INSUFFICIENT_DATA
     Otherwise persist the 0–100 score, band, and state = OK.
  7. Upsert the anchor's single current ReputationScore row.
```

---

## Database Schema

The source of truth is [prisma/schema.prisma](prisma/schema.prisma). It models
anchors, corridors, reviewed anchor–corridor associations, individual rate
snapshots, transfer-outcome evidence, and one current reputation score per
anchor. Freshness is calculated at read time; it is not stored on a snapshot.

`TransferOutcome` supports the scoring model but has no production writer. Its
presence in the schema must not be read as a claim that StellarCore collects
customer transfers, independently verifies off-chain settlement, or has
established reputation evidence.

---

## Project Structure

```
stellarcore/
├── app/                    # Landing page, /dashboard, public read APIs, internal cron route
├── components/dashboard/   # Dashboard sections and bounded state views
├── constants/              # Reviewed anchor, corridor, rate-source, and scoring configuration
├── lib/
│   ├── stellar/            # SEP-1 discovery, SEP-10 boundary, SEP-38 client
│   ├── rates/              # Candidate preparation, snapshots, and latest-rate read model
│   ├── reputation/         # Evidence reads, deterministic scoring, and score persistence
│   └── scheduled/          # Internal cron authorization and orchestration
├── prisma/                 # Schema and committed migration history
├── scripts/                # Bootstrap, snapshot, and verification utilities
├── tests/                  # Unit and controlled integration coverage
└── .github/workflows/      # Manual production migration and registry-bootstrap workflows
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Framework | Next.js 15 (App Router) | Full-stack React with API routes and SSR |
| Language | TypeScript (strict) | Type safety across the full stack |
| Styling | Tailwind CSS v4 | Utility-first, consistent design tokens |
| Database | Prisma Postgres via Vercel (production) | Relational data for rates and reputation; local development may use a compatible PostgreSQL database |
| ORM | Prisma | Type-safe database queries |
| Data Fetching | Server-rendered read models | Dashboard and public APIs read persisted data |
| Blockchain | @stellar/stellar-sdk | SEP-1 parsing, SEP-10 authentication boundary, SEP-38 indicative prices |
| Testing | Node test runner via `tsx` | Unit and controlled integration coverage |
| Deployment | Vercel | Zero-config Next.js hosting with cron support |
| Production operations | GitHub Actions + Vercel | Manual migrations/bootstrap and authenticated daily refresh |

---

## Environment Variables

```bash
# .env.example

# Explicit runtime environment identity.
# One of: production, preview, development, test, ci.
STELLARCORE_ENVIRONMENT="development"

# Server-only application/runtime PostgreSQL connection for this environment.
# Required outside tests. Must use postgres:// or postgresql://.
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"

# Required in production; never expose to the client.
CRON_SECRET="replace-with-a-random-server-only-secret"

# Optional rate-engine settings.
RATE_FRESHNESS_THRESHOLD_MS="120000"
MIN_FRESH_SOURCES="2"

# Optional writable directory for bounded last-known-good public evidence snapshots.
STALE_EVIDENCE_DIRECTORY="/path/to/writable/stale-evidence"
```

`STELLARCORE_ENVIRONMENT` declares the runtime identity explicitly. Valid
values are `production`, `preview`, `development`, `test`, and `ci`.
When it is absent on Vercel, `VERCEL_ENV` is used; test runs may fall back to
`NODE_ENV=test`. Runtime identity is never inferred from hostnames or database
URL contents.

`DATABASE_URL` is server-only. The application runtime uses the connection
appropriate to its deployment environment; local development may use a
compatible PostgreSQL database. Separately, the protected production migration
workflow supplies its direct Prisma Postgres credential through its GitHub
Actions `DATABASE_URL` secret. Neither credential belongs in client code,
repository files, or logs. The URL must use `postgres://` or `postgresql://`.

`CRON_SECRET` is required in production and optional in non-production
environments. `RATE_FRESHNESS_THRESHOLD_MS` and `MIN_FRESH_SOURCES` are
optional positive integers with defaults of 120000 and 2 respectively.

`STALE_EVIDENCE_DIRECTORY` is optional. By default, the Node.js runtime stores
verified public read snapshots in its temporary directory under
`stellarcore-stale-evidence`. On multi-instance or serverless deployments this
store is local to a warm instance; use a writable shared mount if fallback must
survive instance replacement. If the store is unavailable, corrupt, or older
than five minutes, the APIs fail closed.

---

## Getting Started

### Prerequisites

- Node.js 22.x
- PostgreSQL accessible through a direct connection URL

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/stellarcore.git
cd stellarcore

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Fill in DATABASE_URL. CRON_SECRET is needed only when exercising the refresh route.

# 4. Run database migrations
npx prisma migrate dev

# 5. Bootstrap the reviewed anchor and corridor registry
npm run bootstrap:registry

# 6. Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Hit a snag during setup? See [docs/troubleshooting.md](docs/troubleshooting.md) for verified workarounds.

### Running Sync Jobs Locally

```bash
# Bootstrap the reviewed anchor and corridor registry
npm run bootstrap:registry

# Manually verify reviewed live SEP-38 sources and append snapshots
npm run snapshot:rates

# Read the latest persisted rate per independent anchor without writing
npm run verify:latest-rates

# Recompute current reputation rows from the local database
npm run verify:reputation

# Print a human-readable summary of the checked-in registries
npm run registry:print
```

### Running Tests

```bash
# Unit and integration tests
npm test

# Pure offline audit of reviewed registry relationships
npm run audit:config

# Public API compatibility contract gate
npm run audit:compatibility

# Read-only persisted evidence integrity audit
npm run audit:integrity

# Update canonical API contract fixtures (intentional reviewed changes only)
npm run contract:update

# Human-readable inspection of the checked-in anchor/corridor registry
npm run registry:print

# Type check only
npx tsc --noEmit

# Opt-in live SEP-10 verification against the official Stellar test anchor
npm run verify:sep10

# Opt-in: latest-observation queries against a throwaway PostgreSQL database
RUN_LATEST_OBSERVATION_DATABASE_INTEGRATION=1 DATABASE_URL=postgresql://... \
  npm test -- tests/integration/rates/latestObservationsDifferential.database.integration.test.ts

# Opt-in: reproducible latest-observation benchmark (throwaway database only)
BENCHMARK_DATABASE_URL=postgresql://... npm run benchmark:latest-observations
```

`snapshot:rates` is an opt-in network-backed check; it discovers only reviewed
registry sources, verifies their advertised SEP-38 pair, and appends individual
rate snapshots. It is not run by tests, builds, postinstall, or dev startup.

`audit:config` performs a pure, deterministic check of the checked-in anchor,
corridor, membership, and reviewed rate-source relationships. It requires no
database, network, or environment secrets. Registry bootstrap and reviewed rate
snapshot preparation run the same preflight before operational work begins.
Passing this audit means only that repository-controlled configuration is
internally coherent; it does not establish current anchor reachability, SEP
advertisement, quote availability, fresh observations, or transfer support.
Live discovery, rate-engine validation, and persisted-association checks remain
independent defense-in-depth boundaries.

`audit:compatibility` verifies that StellarCore's public API serializers and error
envelopes conform to versioned compatibility contracts (`contracts/api/v1/`). It
detects accidental breaking changes such as field removals, renames, type or
nullability regressions, status-code changes, and ordering changes. Compatible
additive fields are reported separately. Intentional contract changes must use
`npm run contract:update` and the reviewed manifest workflow documented in
[`docs/api-compatibility.md`](docs/api-compatibility.md).

`registry:print` is a read-only companion to `audit:config`. It prints the
checked-in anchors with their home domains, the corridors mapped to each anchor,
and which corridors have a reviewed live rate source. It requires no database,
network, or environment secrets and writes nothing. The registry does not store
SEP support — that is discovered from each anchor's `stellar.toml` during
`bootstrap:registry` — so the script says so rather than guessing.

`verify:latest-rates` is an opt-in local database read. It selects the latest
snapshot per independent anchor, evaluates freshness at read time, computes the
exact median when enough sources exist, and verifies the snapshot count is
unchanged. It performs no SEP-38 request or database write.

`verify:reputation` is a local-database-only calculation for Cowrie,
MoneyGram, and Zeam. It uses one evaluation timestamp, performs no live network
request, upserts each anchor's single current `ReputationScore`, and prints only
safe structured evidence and results.

The latest-observation reads behind `GET /api/rates` and reputation evidence
take the newest snapshot per anchor (or per corridor) with a bounded lateral
lookup instead of walking each group's history. The database-backed test
compares them against the previous `DISTINCT ON` queries, kept verbatim in
`tests/support/legacyLatestObservationQueries.ts`, on empty groups, uneven
histories, tied timestamps, stale-only anchors and historically associated
anchors, then compares the complete public rate and reputation outputs at a
fixed evaluation time. It also asserts that rows visited do not grow with
history depth (a row count, never a wall-clock time). It is skipped unless
`RUN_LATEST_OBSERVATION_DATABASE_INTEGRATION=1`, and it creates and removes its
own uniquely named rows, so run it only against a database you can afford to
write to.

`benchmark:latest-observations` seeds deterministic synthetic snapshots and
records `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for both forms of each query
across a history-depth sweep and a group-count sweep. It reads
`BENCHMARK_DATABASE_URL`, never `DATABASE_URL`, refuses a database that holds
any anchor or corridor it did not create, and deletes only its own rows. Set
`BENCHMARK_COLD_RESTART_COMMAND` (for example `podman restart my-postgres`) to
add a cold-`shared_buffers` measurement. Flags: `--scenario <name>`,
`--runs <n>`, `--out <file>`, `--plans-dir <dir>`. Results, method and caveats
are in [docs/benchmarks/latest-observations.md](docs/benchmarks/latest-observations.md).
It is not run by `npm test`, builds, or `postinstall`, and must never be pointed
at production.

`verify:sep10` generates an unfunded ephemeral authentication key in memory,
prints safe verification metadata only, and never prints or persists the secret
seed, challenge XDR, JWT, or Authorization header. It is not run by `npm test`,
the production build, or `postinstall`.

SEP-10 contract notes: the signer callback must return the challenge it was
given with signatures added; StellarCore compares the SDK transaction hash of
the returned body with the original challenge before any token POST. When a
client domain was requested, the returned token's `client_domain` claim must be
present, well formed, and equal to it; otherwise no such claim is required.
Token claims are decoded, not cryptographically verified: decoding is not JWT
signature verification, and the SEP-10 signing key is not assumed to be the JWT
verification key.

## Production deployment

StellarCore targets Vercel Node.js functions with managed PostgreSQL and Prisma ORM. The full staged deployment procedure is in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); it does not provision or deploy infrastructure.

- Use Node.js 22.x and `npm run build`; existing `postinstall` generates Prisma Client.
- Set server-only `DATABASE_URL` and `CRON_SECRET`; `DIRECT_URL` is not used.
- Apply tracked migrations only through the manual **Deploy production migrations** GitHub Actions workflow (`.github/workflows/deploy-production-migrations.yml`, `workflow_dispatch` only), which runs `npx prisma migrate deploy` — never ordinary Vercel builds or previews. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- Synchronize the reviewed registry through the manual **Bootstrap production registry** GitHub Actions workflow (`.github/workflows/bootstrap-production-registry.yml`, `workflow_dispatch` only), which runs `npm run bootstrap:registry` once after migration and before the first refresh; it is idempotent and may be re-run after a reviewed registry change. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
- The Hobby-compatible Vercel Cron calls the authenticated refresh route daily at `0 0 * * *`.
- Keep production database and cron secrets out of preview deployments until isolated preview infrastructure exists.

---

## API Reference

All public endpoints return JSON and are read-only.


### Public API error contract

All public API failures use one bounded envelope:

```json
{
  "error": {
    "code": "corridor_not_found",
    "message": "Corridor not found."
  }
}
```

The top level contains only `error`; the error object contains only stable
`code` and bounded human-readable `message`. Successful payload shapes are
unchanged. Unknown exceptions are reported through a server-side reporter seam
and never serialized to clients.

| HTTP | Codes |
|---|---|
| 400 | `missing_corridor`, `invalid_corridor`, `invalid_days`, `invalid_corridor_slug`, `invalid_anchor_slug` |
| 404 | `anchor_not_found`, `corridor_not_found` |
| 429 | `rate_limited` (reserved for throttling) |
| 500 | `internal_error` |
| 503 | `upstream_unavailable` (reserved for bounded dependency failures) |

Responses never expose stack traces, ORM/database messages, raw upstream
responses, credentials, JWTs, or private endpoint details. Dynamic evidence
routes retain their stale-evidence response headers when serving a verified
last-known-good payload.

### `GET /api/anchors`

Returns the public directory of anchors currently persisted by StellarCore,
ordered by slug ascending. The static anchor registry is synchronization input
only; a registry entry that has never been synchronized does not appear here.

```json
{
  "anchors": [
    {
      "slug": "zeam",
      "name": "Zeam",
      "homeDomain": "zeam.money",
      "status": "LIVE",
      "seps": [1, 10, 24, 31, 38],
      "isTransferCapable": true,
      "corridorCount": 1
    }
  ],
  "count": 1
}
```

`status` is the stored result of the last synchronization/discovery condition;
it is not a guarantee of current quote health. GET requests do not refresh it.
`seps` contains only stored discovered SEP numbers, sorted numerically.
`isTransferCapable` is an advertised-interface classification derived from that
persisted SEP list: it is true only when SEP-6, SEP-24, or SEP-31 appears in
the list from StellarCore's last successful SEP-1 synchronization. It does not
verify current operation, authorize StellarCore to use an interface, or provide
transfer-outcome evidence. `corridorCount` counts persisted `AnchorCorridor`
associations, not live quotes or fresh rate sources.

An empty database returns HTTP 200 with `{"anchors":[],"count":0}`.

### `GET /api/anchors/[slug]`

Returns one persisted anchor by its stable slug, with its synchronized corridor
relationships ordered by corridor slug. The bounded query does not load rate
snapshots, transfer outcomes, reputation history, or registry-only mappings.

```json
{
  "anchor": {
    "slug": "zeam",
    "name": "Zeam",
    "homeDomain": "zeam.money",
    "status": "LIVE",
    "seps": [1, 10, 24, 31, 38],
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

Anchor slugs must be 1–100 characters of lowercase ASCII letters or digits,
with single hyphens as separators. Malformed slugs return HTTP 400 with
`invalid_anchor_slug`; valid unknown slugs return HTTP 404 with
`anchor_not_found`. Unexpected reads return HTTP 500 with `internal_error` and
no database details. Both anchor routes are dynamic and send
`Cache-Control: no-store`. They are GET-only and perform no synchronization,
live SEP calls, authentication, or writes.

### `GET /api/rates?corridor=<slug>`

Returns the latest persisted rate observation per independent anchor for the
requested stable corridor slug. The endpoint reads existing snapshots only and
never performs live SEP-38 requests.

Corridor labels and observation anchor identity come from the persisted
`Corridor` and `Anchor` rows related to that evidence. Current reviewed
candidate counts remain independently derived from static reviewed rate-source
configuration, while freshness, eligibility, counts, and the median are
evaluated from persisted observations at request time.

When two or more fresh independent observations are persisted, a healthy
aggregation returns HTTP 200. The following is illustrative, not current
production state:

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
  "medianRate": "0.175",
  "sourceCount": 2,
  "freshSourceCount": 2,
  "reviewedCandidateConfiguration": {
    "candidateCount": 2,
    "uniqueAnchorCount": 2
  },
  "medianRequirement": {
    "minimumFreshIndependentSources": 2
  },
  "observations": []
}
```

A valid corridor with fewer than two fresh independent sources also returns
HTTP 200, with `state: "insufficient_fresh_sources"` and `medianRate: null`.
`reviewedCandidateConfiguration` describes only reviewed static configuration
for the requested corridor: `candidateCount` is the number of matching reviewed
entries, while `uniqueAnchorCount` counts the distinct anchor slugs represented
by those entries. It is not evidence that a source is operational, has returned
a price, or is eligible for a median. `medianRequirement` reports the
architectural minimum fresh independent observations required for a median.

The response distinguishes reviewed configuration from persisted observations:
`sourceCount` is the number of anchors represented by the latest persisted
observations, `freshSourceCount` is the number of those observations currently
eligible for the median, and `state` / `medianRate` are calculated exclusively
from that persisted freshness evidence. The current reviewed USDC/US → BRL/BR
configuration contains one Zeam candidate, so it cannot produce a median even
when that observation is fresh.

Freshness is evaluated dynamically on every request. Responses include
`Cache-Control: no-store` so changing source age cannot be hidden by caching.

The latest rates, rate history, and reputation GETs may serve a bounded
last-known-good response only for recognized transient PostgreSQL connectivity
or connection-pool errors. Such responses preserve their original
`evaluatedAt`, `computedAt`, and `capturedAt` values and include a `degraded`
object with `state: "stale"`, the snapshot `generatedAt`, source evidence
times, expiry, and snapshot age. They also send `X-Evidence-State: stale` and an HTTP
`Warning: 110` header. All responses remain `no-store`. Fallback snapshots are
never read by rate aggregation or reputation evaluation code.

Errors use stable codes:

| HTTP | Code | Meaning |
|---|---|---|
| 400 | `missing_corridor` | The corridor query parameter is absent or empty. |
| 400 | `invalid_corridor` | The corridor slug is malformed or too long. |
| 400 | `invalid_query` | A query parameter is repeated or unsupported. |
| 404 | `corridor_not_found` | No persisted corridor matches the slug. |
| 500 | `internal_error` | The persisted-rate read failed safely. |

### `GET /api/reputation`

Returns every persisted anchor in slug order with its latest persisted
reputation evaluation, if one exists. This is a read model over `Anchor` and
optional `ReputationScore` only: GET requests do not run the engine, inspect
rate or transfer history, synchronize anchors, or make network calls.

```json
{
  "reputation": [
    {
      "anchor": { "slug": "zeam", "name": "Zeam" },
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
      "computedAt": "2026-08-31T13:54:41.719Z"
    }
  ],
  "count": 1
}
```

### `GET /api/reputation/[slug]`

Returns the same bounded reputation representation for one persisted anchor.
A valid unknown anchor returns HTTP 404 with `anchor_not_found`; a malformed
slug returns HTTP 400 with `invalid_anchor_slug`.

Public states map persisted data explicitly:

| Public state | Meaning |
|---|---|
| `not_evaluated` | The anchor exists but has no persisted `ReputationScore`; all score, evidence, metrics, and `computedAt` fields are null. |
| `insufficient_evidence` | The latest persisted evaluation is sparse (`INSUFFICIENT_DATA`); `score` and `scoreBand` remain null. |
| `established` | The latest persisted evaluation is `OK`; the persisted score, band, outcome count, and metrics are returned. |

`scoreBand` is lower-case `green`, `amber`, or `red`; it is mapped from the
persisted engine result rather than recalculated. `evidence.outcomeCount` is the
persisted score sample size. The metric fields are persisted explanatory values,
not request-time recomputations. Component scores and corridor/freshness counts
are not exposed because the current schema does not persist them.

`computedAt` is the timestamp of the latest completed reputation evaluation, not
a live-health timestamp. Both routes are dynamic, use `Cache-Control: no-store`,
and return safe HTTP 500 `internal_error` responses for repository failures.
They never expose UUIDs, database enums, raw errors, or environment values.

### `GET /api/corridors`

Returns the public directory of corridors currently persisted in StellarCore,
ordered by slug ascending. This is database-backed discovery: the reviewed
registry supplies synchronization input, while only synchronized `Corridor`
rows appear in this response.

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

`anchorCount` is the number of synchronized `AnchorCorridor` associations. It
does not represent fresh rate sources, a healthy median, or anchors currently
available for live quotes. This endpoint performs no rate reads or live Stellar
requests.

An empty database is a successful state and returns HTTP 200 with
`{"corridors":[],"count":0}`. Unexpected database failures return HTTP 500
with `{"error":{"code":"internal_error","message":"Unable to load corridors."}}`.
The route is dynamic and sends `Cache-Control: no-store`, so directory changes
are visible without relying on accidental Next.js caching.

### `GET /api/corridors/[slug]`

Returns one persisted corridor and the anchors linked to it through
StellarCore's persisted reviewed configuration. The bounded read uses only the
persisted `Corridor`, `AnchorCorridor`, and `Anchor` relationships.

```json
{
  "corridor": {
    "slug": "usdc-us-brl-br",
    "sourceAsset": "USDC",
    "sourceCountry": "US",
    "destinationAsset": "BRL",
    "destinationCountry": "BR",
    "anchorCount": 1,
    "anchors": [
      {
        "slug": "zeam",
        "name": "Zeam",
        "homeDomain": "zeam.money",
        "status": "LIVE",
        "seps": [1, 10, 24, 31, 38],
        "isTransferCapable": true
      }
    ]
  }
}
```

Associated anchors are persisted reviewed relationships, not evidence that an
anchor is currently reachable, quoting, operational for the corridor, or able
to provide a firm quote or transfer. `status` is persisted synchronization and
discovery state. `seps` are persisted synchronized SEP metadata, and
`isTransferCapable` is derived from that SEP list using SEP-6, SEP-24, or
SEP-31; it is not current transfer availability or verified transfer success.

The detail route accepts corridor slugs of 1–100 lowercase alphanumeric
characters and single-hyphen separators. Malformed slugs return HTTP 400 with
`invalid_corridor_slug`; valid unknown persisted corridors return HTTP 404 with
`corridor_not_found`; unexpected reads return HTTP 500 with `internal_error`.
A persisted corridor with no associated anchors remains a successful response
with `anchorCount: 0` and `anchors: []`. The endpoint is GET-only, dynamic,
uses `Cache-Control: no-store`, and performs no rate, reputation, transfer,
authentication, or live Stellar reads.

---

## Contributing

StellarCore is community-maintained. Every anchor, corridor, and feature addition is a welcome contribution.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch protection and pull request workflow.

### Adding an Anchor

1. Fork the repository and create a branch.
2. Propose a reviewed registry change in `constants/anchors.ts` and, when needed, `constants/corridors.ts`.
3. Include tests appropriate to the change and open a PR with the source used for the review.

### Adding a Corridor

1. Add the corridor definition to `constants/corridors.ts`.
2. Associate it only with reviewed anchor support.
3. Open a PR with evidence for the association.

### Code Contributions

- Fork the repo
- Create a branch off `main`
- Write tests for all new logic
- Ensure `npx tsc --noEmit` and `npm test` pass
- Open a PR with a clear description of the change

---

## Drips Wave

StellarCore participates in the Stellar Development Foundation's [Drips Wave](https://drips.network/wave) program. Community contributors can pick up open issues and earn points that convert to USDC rewards.

Browse open issues at [github.com/YOUR_USERNAME/stellarcore/issues](https://github.com/YOUR_USERNAME/stellarcore/issues) and filter by the `drips-wave` label.

### Issue Complexity Levels

| Label | Points | Example Issues |
|---|---|---|
| `complexity: trivial` | 100 | Add anchor, add corridor, fix typo, update anchor logo |
| `complexity: medium` | 150 | Add SEP-38 polling for anchor, write unit tests, add responsive layout |
| `complexity: high` | 200 | Reputation engine, rate aggregation, API rate limiting, corridor world map |

---

## Roadmap

### Implemented

- [x] Prisma schema and committed migrations
- [x] Reviewed anchor and corridor registry with SEP-1 discovery/bootstrap
- [x] Reviewed SEP-38 indicative-rate snapshot support and latest-rate read model
- [x] Staleness-aware median pricing with `MIN_FRESH_SOURCES=2`
- [x] SEP-10 authentication boundary/harness
- [x] Deterministic reputation scoring and public read-only reputation APIs
- [x] Public anchors, corridors, rates, and reputation APIs plus `/dashboard`
- [x] Read-only evidence-graph integrity audit with bounded reports and per-class remediation guidance
- [x] Manual production migration/registry-bootstrap workflows and authenticated daily refresh

### Planned/Future

- [ ] Additional independently reviewed rate sources; a second source is required before a median can be produced
- [ ] A trusted, authorized, provenance-preserving TransferOutcome source, if one becomes available
- [ ] Alerts and other product capabilities supported by verified operational requirements

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Acknowledgements

Built on knowledge earned contributing to [stellar-intel](https://github.com/ezedike-evan/stellar-intel), [Miracle656/Lens](https://github.com/Miracle656/Lens), and [stellar-hooks](https://github.com/dark-princezz/stellar-hooks).

Anchor data sourced from the Stellar network and the [lumenloop/stellar-ecosystem-db](https://github.com/lumenloop/stellar-ecosystem-db) registry.
