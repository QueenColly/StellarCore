# Typed Public API Examples

Self-contained TypeScript examples for StellarCore's **read-only** public GET APIs. These samples are for integration understanding only: they are not an SDK, not a published package, and not a transaction or quote flow.

## Scope

Examples cover:
- `GET /api/anchors`
- `GET /api/anchors/{slug}`
- `GET /api/corridors/{slug}`
- `GET /api/rates?corridor={slug}`
- `GET /api/rates/history?corridor={slug}&days=...`
- `GET /api/reputation`
- `GET /api/reputation/{slug}`

## Safety and evidence rules

- **Read-only only.** No POST/PUT/PATCH/DELETE, no auth, no credentials, no transaction submission.
- **Indicative evidence is not a firm quote.** Rate observations are persisted evidence; do not treat them as executable prices.
- **Missing evidence is not zero.** `medianRate: null`, empty arrays, `score: null`, and `metrics: null` mean evidence is unavailable/insufficient, not a numeric zero.
- **No production data is hardcoded.** Sample fixtures are illustrative and clearly labelled in tests.

## Run / typecheck

From the repository root:

```bash
npx tsc -p examples/typed-public-api/tsconfig.json --noEmit
```

The examples use a caller-supplied base URL:

```bash
STELLARCORE_API_BASE_URL=http://localhost:3000 node --import tsx examples/typed-public-api/anchors.ts
```

## Files

- `types.ts` - narrow public response/error types matching current API shapes.
- `client.ts` - small typed fetch wrapper with explicit success/error discrimination.
- `anchors.ts`, `corridors.ts`, `rates.ts`, `reputation.ts` - runnable examples.
- `fixtures.ts` - deterministic illustrative fixtures used by tests; no network.
