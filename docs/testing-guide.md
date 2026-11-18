# Testing guide

StellarCore uses Node's built-in test runner through `tsx`. Use Node.js 22.x,
install dependencies with `npm ci`, and run the full suite with:

```bash
npm test
```

The `test` script expands `tests/**/*.test.ts`, so test files must end in
`.test.ts`. Unit tests live under `tests/unit/` and should exercise one module
or subsystem without requiring a database or live network. Integration tests
live under `tests/integration/` and cover boundaries such as the database,
HTTP handlers, or other configured services. Keep the test file near the
subsystem it covers and use descriptive test names that state the behavior and
failure condition.

## Focused tests

Run one file directly with:

```bash
npx tsx --test tests/unit/stellar/sep38.test.ts
```

Filter by test name when a file contains many cases:

```bash
npx tsx --test --test-name-pattern="timeout" tests/unit/stellar/sep38.test.ts
```

`npm run lint` checks the repository, and `npx tsc --noEmit` performs the
TypeScript check without emitting files.

## Property/fuzz tests for untrusted SEP parsing (#141)

`tests/property/` holds deterministic property suites for the SEP-1 TOML and
SEP-38 JSON parsers. Inputs are generated from a seeded xorshift PRNG
(`tests/property/seededGenerator.ts`) and are bounded, so runs are fast,
offline, and fully reproducible.

Run the suites with the default seed:

```bash
npx tsx --test tests/property/sep1Property.test.ts tests/property/sep38Property.test.ts
```

Reproduce (or widen) a run with an explicit seed and iteration count:

```bash
SEED=12345 PROPERTY_ITERATIONS=5000 npx tsx --test tests/property/sep1Property.test.ts
```

A failure prints the seed that produced it; rerun with that exact `SEED` to
replay the same corpus locally. When a generated input exposes a real parser
defect, minimize the input and persist it under
`tests/property/regressions/sep1/` or `tests/property/regressions/sep38/`, then
pin its typed outcome in `tests/property/regressionCorpus.test.ts`. The corpus
suite asserts every pinned fixture forever, so a fixed parser bug cannot
silently regress. Every fixture must have a pinned expectation; the suite
fails on orphan files.

CI runs these suites on every pull request that touches `lib/stellar/**` or
`tests/property/**` (`.github/workflows/property-tests.yml`) with a fixed seed,
plus a daily scheduled sweep with a rotating seed and deeper iteration count.
All property tests are offline: they never call anchors or public networks.

## Database-backed integration tests

Tests that require PostgreSQL are gated behind explicit environment flags and
use isolated synthetic fixtures (randomized slugs, cleaned up in `finally`):

- `RUN_DATABASE_INTEGRATION=1` enables the API/registry database tests.
- `RUN_REPUTATION_DATABASE_INTEGRATION=1` enables the reputation engine and
  snapshot-coherence tests.

Database-backed tests additionally exercise the environment isolation guard
(#143): the runtime identity (e.g. `NODE_ENV=test` resolving to `test`) must
match the database's durable `database_environment` stamp before any evidence
access, and forbidden pairings fail closed.

## Mocking network calls

Unit tests must inject a fetch implementation rather than call an anchor. The
SEP-38 tests are the reference pattern: pass a `fetcher` option, inspect the
requested URL, and return a deterministic `Response`.

```ts
const fetcher = (async (input: Parameters<typeof fetch>[0]) => {
  const url = new URL(String(input));
  assert.equal(url.pathname, "/sep38/info");
  return new Response(JSON.stringify({ assets: [] }), {
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

const result = await getSep38Info("https://anchor.example/sep38", { fetcher });
```

Use explicit status codes, headers, and bodies to model timeout, malformed
JSON, and upstream errors. Do not weaken production validation just to make a
test pass. Live integrations belong in an explicitly configured integration
environment and must not run as part of the default unit suite.
