# Dependency and Secrets Security Audit — 2026-09-25

Deliberate audit of (1) known vulnerabilities in the dependency tree and
(2) accidentally committed secrets across the **full git history**, per #62.
Findings are reported for maintainer triage — nothing is fixed, rotated or
rewritten in this audit, matching the issue's out-of-scope rules.

**Audited revision:** `7c36dc8` (main), 37 commits of history.

## 1. Dependency vulnerability scan

Tool: `npm audit` (npm registry advisory database), lockfile
`package-lock.json` as committed.

Result: **9 vulnerabilities — 1 critical, 8 high, 0 moderate/low.**

| # | Package (installed) | Severity | Advisories | How it reaches us | Runtime exposure |
| - | ------------------- | -------- | ---------- | ----------------- | ---------------- |
| 1 | `next` 15.5.23 | **Critical** | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) (unauthenticated RCE, **Windows-hosted servers**), [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) (unauthenticated RCE in the **Image Optimization API via AVIF**) | direct dependency | **Real.** Production runs on Vercel (Linux), so the Windows RCE applies only to Windows self-hosting — but the Image Optimization RCE is relevant: `next/image` is used (`components/landing/LandingPage.tsx`, `components/ui/ProductHeader.tsx`), so the optimizer endpoint is live. Highest-priority item. |
| 2 | `sharp` 0.34.5 | High | [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) (inherited libvips CVEs), [GHSA-rgj7-g3m4-5g8c](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c) (libheif) | `next` → `sharp` (image optimizer) | **Real.** Same surface as #1 — sharp decodes whatever the optimizer is fed. |
| 3 | `postcss` 8.4.31 | High | [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) (XSS via unescaped `</style>`), [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) / [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) / [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849) (arbitrary file read via `sourceMappingURL`) | `next` → `postcss` (build); the separate `@tailwindcss/postcss` copy is already at a patched 8.5.26 | Build-time only; inputs are our own CSS, not attacker-controlled. Low practical risk, fix rides along with #1. |
| 4 | `fast-uri` 3.1.5 | High | four SSRF/host-confusion advisories (e.g. [GHSA-5jgf-p345-68v8](https://github.com/advisories/GHSA-5jgf-p345-68v8)) | `prisma` → `@prisma/dev` → `@prisma/streams-local` → `ajv` | Dev-CLI only — not in the application bundle. |
| 5 | `js-yaml` 4.3.1 | High | [GHSA-2883-xcg3-v3hh](https://github.com/advisories/GHSA-2883-xcg3-v3hh) (CPU exhaustion on merge keys) | `@eslint/eslintrc` | Dev-only (lint); parses our own config, not untrusted YAML. |
| 6 | `mysql2` 3.15.3 | High | [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr) (auth downgrade leaks plaintext credentials), [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3) (decompression-bomb DoS) | `prisma` CLI (bundled multi-DB support) | Dev-CLI only, and this project talks to **Postgres**, never MySQL — the vulnerable driver is present but unexercised. |
| 7 | `deepmerge-ts` 7.1.5 | High | [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx) (stack exhaustion) | `prisma` → `@prisma/config` | Dev-CLI only; merges our own config. |
| 8–9 | `@prisma/config` 7.9.1, `prisma` 7.9.1 | High (transitive) | flagged solely for depending on #6/#7 | direct dev dependency | Same as #6/#7. |

### Suggested triage order (maintainer decision, not applied here)

1. **`npm audit fix`** resolves #1–#5 within current semver ranges (patched
   `next` 15.5.x, `sharp`, `postcss`, `fast-uri`, `js-yaml`) — non-breaking
   per npm. The `next`/`sharp` pair is the one with a real, unauthenticated
   production surface and is worth doing promptly.
2. The `prisma` chain (#6–#9) has **no non-breaking fix**: npm's suggestion
   (`npm audit fix --force`) would *downgrade* to `prisma@6.19.3`, a semver
   major move backwards. Since every affected path is dev-CLI-only and the
   MySQL driver is unused here, the reasonable options are (a) wait for a
   patched Prisma 7.x and track it, or (b) accept npm's downgrade — (a) looks
   right, but that is a maintainer call.
3. No dependency needs removal; there are no unmaintained/abandoned direct
   dependencies in the tree.

## 2. Secrets scan — full git history

Two passes over **all 37 commits** (every blob ever committed, not just the
working tree):

1. **gitleaks** (default ruleset, ~170 detectors: cloud keys, tokens, PEM
   blocks, generic API keys) run against the full repo history:
   `37 commits scanned … no leaks found`.
2. **A domain-specific manual pass** over `git log --all -p` for patterns
   gitleaks does not know:
   - Stellar **secret seeds** (`S` + 55 base32 chars) — none ever committed;
   - connection strings with embedded credentials
     (`postgres(ql)://user:pass@host`) — every match is the documented
     placeholder in `.env.example`
     (`postgresql://USER:PASSWORD@HOST:PORT/DATABASE` and the earlier
     `user:password@localhost` localhost example); no real host or password
     has ever appeared;
   - JWTs (`eyJhbGciOi…`), `sk_live` keys, Supabase key assignments — none.
3. **Env-file history**: no `.env`, `.env.local` or `.env.production` has
   ever been committed on any branch; only `.env.example` (placeholders) is
   tracked, and `.gitignore` covers the real ones.

**Result: no committed secrets found, current or historical.** Nothing needs
rotation and no history rewrite is warranted.

## Method notes / reproducibility

```bash
npm audit                    # dependency scan (lockfile as committed)
docker run --rm -v "$PWD:/repo:ro" zricethezav/gitleaks:latest git /repo
git log --all -p | grep -E "S[A-D][A-Z2-7]{54}|postgres(ql)?://[^/ ]+:[^@ ]+@|eyJhbGciOi|sk_live"
git log --all --oneline -- .env .env.local .env.production
```

Limitations, stated so they are not mistaken for coverage: `npm audit` only
knows published advisories (no zero-days, no malicious-package heuristics);
gitleaks' entropy rules can miss short, low-entropy passwords — mitigated
here by the manual credential-URL pass; history from squashed/rebased-away
commits that were never pushed to this repository is not observable.


## 3. Raw SQL boundary audit

StellarCore treats every Prisma raw-SQL call as a reviewed security boundary.
Run `npm run audit:sql` to inventory these boundaries and fail on unreviewed
raw-query files, unsafe APIs, or `Prisma.raw` fragments.

### 3.1 Reviewed call sites

| Location | API | Purpose | Review status |
| --- | --- | --- | --- |
| `lib/rates/latestRateRepository.ts` | `Prisma.sql` + `$queryRaw` | Latest rate observation per anchor/corridor | Values are bound parameters; identifiers are constant SQL |\n| `lib/rates/rateHistoryRepository.ts` | `Prisma.sql` + `$queryRaw` | Bounded rate history for one corridor and time range | Corridor/timestamp values are bound parameters; identifiers are constant SQL |
| `lib/reputation/repository.ts` | `Prisma.sql` + `$queryRaw` | Latest rate evidence per corridor for reputation | Values are bound parameters; identifiers are constant SQL |
| `lib/reputation/snapshot.ts` | `Prisma.sql` + `$queryRaw`; reviewed `$executeRawUnsafe` exception | Read-only repeatable-read snapshot setup and identity | The unsafe exception is exactly the constant statement `SET TRANSACTION READ ONLY`; no input or identifier is interpolated |
| `lib/stellar/anchorSync.ts` | tagged `$executeRaw` / `$queryRaw` | Monotonic anchor persistence and sync-order allocation | Interpolated values are Prisma-bound parameters; table/column names are constants |
| `lib/config/environmentGuardDb.ts` | tagged `$queryRaw` | Read deployment environment stamp absent from Prisma schema | Query text is constant |
| `scripts/stamp-database-environment.ts` | tagged `$queryRaw` / `$executeRaw` | Protected operator environment stamping | Values are bound and the statement structure is constant |

No reviewed production boundary may use `Prisma.raw`. New raw-SQL call sites must
be added to the explicit audit allowlist together with tests and documentation.

### 3.2 Approved construction rules

User-controlled values must be passed through Prisma tagged templates or
`Prisma.sql` placeholders. They must never be concatenated into SQL text.

Dynamic identifiers are not accepted from user input. If a future feature truly
requires selecting among identifiers, the identifier must first be mapped from a
closed, reviewed allowlist to a constant SQL fragment. Direct use of
`Prisma.raw` remains blocked by the repository audit.

The single reviewed unsafe-API exception is the exact constant-only transaction
statement in `lib/reputation/snapshot.ts`. Any additional
`$queryRawUnsafe` or `$executeRawUnsafe` usage fails CI until explicitly
reviewed.

### 3.3 Enforcement and regression coverage

`.github/workflows/audit-raw-sql.yml` runs the repository-wide audit on raw-SQL
and application changes. It also executes
`tests/unit/security/rawSqlBoundaries.test.ts`, which feeds adversarial SQL-like
values into the production query builders and verifies that query text is
unchanged while the payload appears only in the bound parameter list.
