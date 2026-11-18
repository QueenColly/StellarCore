> Whatever action you can do yourself, Please do youself, this includes starting apps and verification

# Repository Guidelines

## Project Structure & Module Organization

StellarCore is planned as a Next.js 15 App Router application. Keep routes and API handlers in `app/`; reusable UI in `components/`; browser-side behavior in `hooks/`; and domain logic in `lib/stellar`, `lib/rates`, and `lib/reputation`. Shared types belong in `types/`, constants in `constants/`, Prisma files in `prisma/`, maintenance jobs in `scripts/`, and static assets in `public/`. Place unit, integration, and Playwright tests under `tests/unit`, `tests/integration`, and `tests/e2e`. Until scaffolding is complete, treat `README.md` as the product and architecture specification.

## Build, Test, and Development Commands

After `package.json` is introduced, use the documented npm workflow:

- `npm install` installs locked dependencies.
- `npm run dev` starts the local Next.js server.
- `npm run build` creates a production build and catches route/type failures.
- `npm test` runs Vitest unit and integration tests.
- `npm run audit:config` checks repository-controlled registry relationships offline; run it for anchor, corridor, membership, or reviewed rate-source changes.
- `npm run audit:compatibility` verifies current public API serializers against the versioned compatibility contracts and fails on breaking regressions.
- `npm run contract:update` updates canonical API fixtures only for intentional reviewed contract changes.
- `npm run registry:print` prints a read-only, human-readable summary of the checked-in anchor, corridor, membership, and reviewed rate-source registries; it touches no database and performs no network requests.
- `npm run audit:integrity` runs the read-only evidence-graph integrity audit against the configured database; it prints a bounded JSON report with stable record keys and remediation guidance, performs no writes, and exits nonzero when findings exist.
- `npm run audit:sql` inventories reviewed Prisma raw-SQL boundaries and fails on new unreviewed raw-query files, unsafe raw APIs, or `Prisma.raw` fragments.
- `npm run verify:sep10` runs the opt-in live SEP-10 check against Stellar's official test anchor; it is never part of tests or builds.
- `npm run benchmark:latest-observations` seeds synthetic snapshots into the database named by `BENCHMARK_DATABASE_URL` (a throwaway database, never production) and records `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` for the latest-observation queries; it is never part of tests or builds. The database-backed differential test for those queries runs only with `RUN_LATEST_OBSERVATION_DATABASE_INTEGRATION=1`.
- `npx playwright test` runs browser-level user flows.
- `npx prisma migrate dev` applies local schema migrations.
- `npx prisma migrate deploy` applies committed migrations only from a protected production/CI step.
- `npm run bootstrap:registry` explicitly synchronizes the reviewed anchor/corridor registries for a new database.
- `npm run stamp:environment` stamps a database with its explicit environment identity (operator tooling; run from the protected migration workflow, never from application runtime).
- `npm run release:manifest` generates the release SBOM (CycloneDX) and build provenance into `dist-release/`.
- `npm run verify:release` verifies release artifacts against the current checkout and fails closed on digest drift or secret leakage.
- Property/fuzz suites for untrusted SEP parsing live in `tests/property/`; run them with `npx tsx --test tests/property/sep1Property.test.ts tests/property/sep38Property.test.ts tests/property/regressionCorpus.test.ts` and reproduce failures with the printed `SEED`.

Do not add undocumented scripts; update this guide and the README when commands change.

## Coding Style & Naming Conventions

Use strict TypeScript, two-space indentation, and functional React components. Name components in PascalCase (`AnchorCard.tsx`), hooks with a `use` prefix (`useLiveRates.ts`), and utility modules in lower camel case. Follow Next.js route names (`app/anchors/[id]/page.tsx`). Keep Stellar data and scoring logic independent of UI code. Centralize GSAP registration in `lib/gsap.ts` and shared motion values in `constants/animation.ts`. Run the configured formatter and linter before submitting changes once those tools are added.

## Testing Guidelines

Write Vitest tests for normalization, median pricing, staleness, and reputation scoring. Add integration coverage for API routes and Playwright coverage for corridor selection and rate comparison. Use descriptive `*.test.ts` unit names and `*.spec.ts` E2E names. Mock external anchors; tests must not depend on live network responses. The integrity database integration suite is opt-in via `RUN_INTEGRITY_DATABASE_INTEGRATION=1` and must never point at production.

## Commit & Pull Request Guidelines

No commit convention is established yet. Use concise, imperative subjects, optionally with Conventional Commit prefixes, for example `feat: add SEP-38 quote normalization`. Keep commits focused. Pull requests should explain behavior and architecture changes, link the relevant issue, list verification commands, and include screenshots or recordings for UI and animation work. Note schema, environment, accessibility, and reduced-motion impacts explicitly.

## Security & Configuration

Copy `.env.example` to `.env.local`; never commit credentials, private keys, Supabase secrets, or production anchor tokens. Validate external TOML and quote data at trust boundaries, and apply timeouts and rate limits to outbound requests.
