# Production PostgreSQL TLS policy (issue #181)

StellarCore requires authenticated, certificate-verified TLS for production
PostgreSQL connections. Database credentials and evidence traffic must never
silently fall back to unverified transport. This document is the normative
policy; the implementation is `lib/database/tlsPolicy.ts` (pure decision
logic), `lib/database/tlsPolicyRuntime.ts` (environment and CA wiring), and
`lib/dbClient.ts` (enforcement at client construction).

## Why application-level policy

The vendored driver (`pg` via `@prisma/adapter-pg`) has three behaviors that
make driver-default transport unsafe for production evidence traffic:

1. **Plaintext by default.** `pg`'s ssl default is `false`; a URL without TLS
   parameters connects in plaintext.
2. **URL parameters override Pool config.** `pg-connection-string` lets
   `sslmode`/`ssl` query parameters in `DATABASE_URL` produce an ssl config
   that takes precedence over anything supplied in the Pool configuration —
   a bypass could be smuggled in through the URL.
3. **Downgrade semantics.** `sslmode=require` and `sslmode=verify-ca` resolve
   to unverified transport (`rejectUnauthorized: false`) in the vendored
   driver, and `ssl=no-verify`/`sslmode=no-verify` do so explicitly.

StellarCore therefore classifies the URL and environment itself, strips all
TLS parameters from the connection string handed to the driver, and passes an
explicit ssl object — `rejectUnauthorized: true`, plus a CA when configured —
directly in the Pool config. The application, not the URL, has the last word
on transport security.

## Policy

| Runtime | URL / env TLS posture | Outcome |
|---|---|---|
| Production | None (plain URL) | ✅ Policy supplies verified TLS (`rejectUnauthorized: true`) |
| Production | `sslmode=verify-full` | ✅ Verified TLS honored |
| Production | `sslmode=require` or `verify-ca` | ✅ Upgraded to policy-owned verified TLS; URL TLS parameters are stripped before driver construction |
| Production | `ssl=no-verify` / `sslmode=no-verify` / `prefer` | ❌ Rejected — verification bypass |
| Production | `sslmode=disable` / `ssl=0` | ❌ Rejected — plaintext, never permitted (even with the emergency gate) |
| Production | `PGSSLMODE` variants | Same as the equivalent URL posture |
| Development / test | Any posture | ✅ Honored as requested (plaintext stays usable locally) |

Rejection diagnostics are safe: they name the policy code
(`PRODUCTION_TLS_DISABLED`, `PRODUCTION_TLS_VERIFICATION_BYPASS`) and quote no
URL, credential, or certificate material. This is enforced by unit tests that
serialize every rejection and assert credential and hostname absence.

## CA configuration (provider-compatible, no committed secrets)

Two optional variables supply a provider CA when the server does not chain to
public roots:

- `STELLARCORE_DB_CA` — the PEM certificate inline.
- `STELLARCORE_DB_CA_PATH` — a filesystem path to the PEM.

Precedence: inline CA wins; the file path is read only when no inline CA is
set and the file exists. CA material flows only into the ssl config object;
it is never logged, never serialized into diagnostics, and never committed to
the repository. Managed providers whose certificates chain to public roots
(Vercel Postgres, Supabase direct connections, most managed Postgres) need no
CA configuration at all — Node's trust store verifies them.

## Emergency mode (separately gated)

A certificate-verification bypass exists for narrowly scoped operational
incidents (for example, a provider rotating to an interim certificate that
cannot be pinned immediately). It is inert unless the environment variable

```
STELLARCORE_DB_TLS_EMERGENCY_BYPASS=allow-unverified
```

is set to exactly that value. Behavior when active:

- A bypass-class URL (`ssl=no-verify`) resolves to an explicit
  `rejectUnauthorized: false` configuration.
- The process prints one warning line: `Database TLS: certificate-verification
  emergency bypass is ACTIVE for this process.`
- Plaintext (`sslmode=disable`) remains rejected even under the gate — the
  gate authorizes unverified TLS, never unencrypted transport.
- The gate is disabled by any other value, including `1`, `true`, or case
  variants.

This mode is a deliberate, loud exception. It is not a supported production
posture; monitoring should alert on its activation.

## Exceptions and their limits

Development and test runtimes use the validated `STELLARCORE_ENVIRONMENT`
identity from the shared runtime configuration boundary and keep permissive behavior: local
Postgres without TLS keeps working, and explicitly requested TLS modes are
honored. The exception cannot silently activate in production: the decision
branches exclusively on `NODE_ENV`/`STELLARCORE_DEPLOYMENT` values, and the
same configuration that resolves to plaintext in development resolves to a
hard rejection in production (covered by tests).

## Environment variables

| Variable | Purpose | Safety notes |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection. Keep it free of TLS parameters; policy owns transport. | Never committed; never logged. |
| `STELLARCORE_DB_CA_PATH` | File path to the provider CA PEM when the server does not chain to public roots. | Path only; the certificate is loaded into the ssl config at runtime and never logged. |
| `STELLARCORE_DB_CA` | Inline provider CA PEM (fallback when no path is configured). | Certificate material; never committed, never logged. |
| `STELLARCORE_DB_TLS_EMERGENCY_BYPASS` | Gated verification bypass; must equal exactly `allow-unverified` to activate. | Inert by default; activation prints a process warning; never enables plaintext. |

Mirror these names (without values) in `.env.example` when provisioning a new
environment; CA values and the bypass belong in the platform's secret store,
not in repository files.

## Runtime interaction with Prisma

`lib/dbClient.ts` resolves the policy before constructing the `PrismaPg`
adapter and passes:

- `connectionString`: the sanitized URL (all `sslmode`, `ssl`, `sslrootcert`,
  `sslcert`, `sslkey`, `sslnegotiation`, `uselibpqcompat` parameters removed;
  all other parameters preserved).
- `ssl`: the policy-resolved object (`rejectUnauthorized: true` plus optional
  `ca`), which the driver applies verbatim because the URL contributes no TLS
  fields.

A policy rejection throws before the adapter is constructed, so production
startup fails fast with the safe diagnostic.

## Manual verified-TLS integration check

The default suite never requires a live server. To run the gated live check
against a TLS-capable PostgreSQL endpoint:

```bash
RUN_DATABASE_TLS_INTEGRATION=1 \
DATABASE_TLS_URL="postgres://...tls-enabled-endpoint..." \
[DATABASE_TLS_CA="$(cat provider-ca.pem)"] \
npx tsx --test tests/integration/database/tlsLive.database.integration.test.ts
```

The live test asserts policy acceptance (`VERIFY_FULL`,
`rejectUnauthorized: true`), a real connection, and
`current_setting('ssl') = 'on'` over the authenticated transport. The second
gated case proves a plaintext-forcing URL is rejected before any driver
connection is attempted.

## Scope

#151 owns pool/acquisition/statement budgets and #124 owns database roles.
This policy governs transport security only: it does not redesign
credentials, provider networking, or connection lifecycle.
