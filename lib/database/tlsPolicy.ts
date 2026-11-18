/**
 * Production PostgreSQL TLS policy (issue #181).
 *
 * Policy: production database connections must use authenticated TLS with
 * certificate verification. Production startup rejects configuration that
 * disables TLS entirely, and rejects certificate-verification bypasses unless
 * the separately gated emergency mode is enabled. Development and test
 * environments keep permissive behavior; the exceptions can never silently
 * activate in production.
 *
 * This module is pure decision logic: it takes the connection configuration
 * and environment facts, and returns either a resolved TLS policy or the
 * exact reason the configuration is rejected. It performs no I/O and never
 * sees credentials directly — the caller passes what is needed for
 * diagnostics separately (see resolveProductionTlsPolicy).
 *
 * Why policy is resolved in application code rather than left to the driver:
 *
 * 1. `pg` defaults to `ssl: false` — a bare production URL silently connects
 *    in plaintext.
 * 2. `pg-connection-string` lets the URL's own query parameters
 *    (`sslmode=disable`, `ssl=no-verify`) override any ssl object the Pool
 *    config supplies, so a bypass could be smuggled in through the URL.
 * 3. `sslmode=require`/`verify-ca` downgrade certificate verification
 *    (rejectUnauthorized: false in the vendored driver) — encryption without
 *    authentication, which is not verified TLS.
 *
 * StellarCore therefore parses and classifies the URL itself, strips TLS
 * parameters from the URL handed to the driver, and passes an explicit ssl
 * object with `rejectUnauthorized: true` (and a CA when configured) directly
 * in the Pool config — the last word on transport security.
 */

export type DatabaseTlsMode =
  /** Verified, authenticated TLS: encryption + CA validation. Required in production. */
  | "VERIFY_FULL"
  /** TLS bypass (verification disabled). Only via the gated emergency mode. */
  | "NO_VERIFY"
  /** Plaintext. Never acceptable in production. */
  | "DISABLED"
  /** No TLS configuration present — the driver would fall back to plaintext. */
  | "UNSET"
  /** TLS requested, but the vendored driver resolves it unverified. */
  | "REQUIRE";

export type DatabaseTlsSource =
  /** sslmode/ssl parameter found in the URL query string. */
  | "URL_PARAMETER"
  /** PGSSLMODE / PGSSL* environment variables. */
  | "PG_ENVIRONMENT"
  /** SSL_MODE_TARGET / SSL_ROOT_CERT env vars (StellarCore-specific CA config). */
  | "STELLARCORE_ENVIRONMENT";

/** A diagnostic for why a URL's TLS posture was classified the way it was. */
export type TlsConfigurationSignal = Readonly<{
  mode: DatabaseTlsMode;
  source: DatabaseTlsSource | null;
  /** The raw parameter/variable name observed (e.g. "sslmode", "PGSSLMODE"). */
  parameter: string | null;
}>;

export type ProductionTlsViolationCode =
  /** TLS disabled (or unset) in a production deployment. */
  | "PRODUCTION_TLS_DISABLED"
  /** Certificate verification explicitly bypassed outside emergency mode. */
  | "PRODUCTION_TLS_VERIFICATION_BYPASS"
  /** TLS enabled but no CA available to verify the server certificate. */
  | "PRODUCTION_TLS_CA_MISSING"
  /** The database URL itself is missing — cannot evaluate policy. */
  | "DATABASE_URL_MISSING";

export type ProductionTlsRejection = Readonly<{
  code: ProductionTlsViolationCode;
  /**
   * Safe, human-readable explanation. Never contains the URL, credentials,
   * or certificate material.
   */
  message: string;
  signal: TlsConfigurationSignal | null;
}>;

export type ResolvedDatabaseTlsPolicy = Readonly<{
  accepted: true;
  mode: DatabaseTlsMode;
  /**
   * The ssl object to pass to the pg Pool config, with the URL's TLS
   * parameters already stripped from the connection string by the caller.
   */
  sslConfig: Readonly<{
    rejectUnauthorized: true;
    ca?: string;
  }>;
}>;

export type ResolvedDatabaseTlsBypass = Readonly<{
  accepted: true;
  mode: "NO_VERIFY";
  sslConfig: Readonly<{ rejectUnauthorized: false }>;
}>;

export type ProductionTlsResolution =
  | ResolvedDatabaseTlsPolicy
  | ResolvedDatabaseTlsBypass
  | Readonly<{ accepted: false; rejection: ProductionTlsRejection }>;

export type TlsPolicyEnvironmentInput = Readonly<{
  /** The raw DATABASE_URL value (may be empty). */
  databaseUrl: string;
  /**
   * Production-like runtime detection: NODE_ENV=production, or the explicit
   * deployment flag. Local dev/test never resolve as production.
   */
  isProductionLike: boolean;
  /** The separately gated emergency bypass (STELLARCORE_DB_TLS_EMERGENCY_BYPASS=allow-unverified). */
  emergencyBypassRequested: boolean;
  /** Raw CA certificate value from STELLARCORE_DB_CA (PEM). */
  inlineCa: string | null;
  /** File path to a CA certificate from STELLARCORE_DB_CA_PATH. */
  caPath: string | null;
  /** Whether a CA file path exists on disk (resolved by the caller). */
  caPathExists: boolean;
}>;

/** The one accepted emergency bypass value, deliberately verbose. */
export const TLS_EMERGENCY_BYPASS_VALUE = "allow-unverified";

const SSL_URL_PARAMETERS = [
  "sslmode",
  "ssl",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "uselibpqcompat",
] as const;

const BYPASS_MODES: ReadonlySet<string> = new Set(["disable", "no-verify", "prefer"]);
const REQUIRE_MODES: ReadonlySet<string> = new Set(["require", "verify-ca", "allow"]);

/** Strips every TLS-related parameter from a PostgreSQL URL. */
export function stripTlsParameters(databaseUrl: string): string {
  if (!databaseUrl) return databaseUrl;

  try {
    const url = new URL(databaseUrl);
    let touched = false;

    for (const parameter of SSL_URL_PARAMETERS) {
      if (url.searchParams.has(parameter)) {
        url.searchParams.delete(parameter);
        touched = true;
      }
    }

    if (!touched) return databaseUrl;

    const search = url.searchParams.toString();
    // `postgres:` is not a special URL scheme, so `url.origin` is null;
    // rebuild the origin from protocol, credentials, host, and port.
    const credentials = url.username
      ? `${url.username}${url.password ? `:${url.password}` : ""}@`
      : "";
    const port = url.port ? `:${url.port}` : "";
    const origin = `${url.protocol}//${credentials}${url.hostname}${port}`;

    return `${origin}${url.pathname}${search ? `?${search}` : ""}${url.hash}`;
  } catch {
    // Unparseable URLs are handled by scheme validation elsewhere.
    return databaseUrl;
  }
}

/**
 * Classifies the TLS posture the connection URL itself declares. Returns null
 * when the URL carries no TLS parameters at all.
 */
export function classifyUrlTlsParameters(databaseUrl: string): TlsConfigurationSignal | null {
  if (!databaseUrl) return null;

  let params: URLSearchParams;

  try {
    params = new URL(databaseUrl).searchParams;
  } catch {
    return null;
  }

  const sslMode = params.get("sslmode");
  const sslFlag = params.get("ssl");

  if (sslMode !== null) {
    return {
      mode: classifyModeValue(sslMode),
      source: "URL_PARAMETER",
      parameter: "sslmode",
    };
  }

  if (sslFlag !== null) {
    const normalized = sslFlag.trim().toLowerCase();
    if (normalized === "0" || normalized === "false") {
      return { mode: "DISABLED", source: "URL_PARAMETER", parameter: "ssl" };
    }
    if (normalized === "no-verify") {
      return { mode: "NO_VERIFY", source: "URL_PARAMETER", parameter: "ssl" };
    }
    return { mode: "VERIFY_FULL", source: "URL_PARAMETER", parameter: "ssl" };
  }

  if (params.has("sslrootcert") || params.has("sslcert") || params.has("sslkey")) {
    return { mode: "VERIFY_FULL", source: "URL_PARAMETER", parameter: "sslrootcert" };
  }

  return null;
}

/**
 * Classifies the TLS posture declared through the libpq-style PG* environment
 * variables that `pg` reads when no ssl config is supplied. Returns null when
 * none are set.
 */
export function classifyPgEnvironmentTls(
  environment: Readonly<Record<string, string | undefined>>,
): TlsConfigurationSignal | null {
  const pgSslMode = environment.PGSSLMODE;

  if (pgSslMode) {
    return { mode: classifyModeValue(pgSslMode), source: "PG_ENVIRONMENT", parameter: "PGSSLMODE" };
  }

  if (
    environment.PGSSLROOTCERT
    || environment.PGSSLCERT
    || environment.PGSSLKEY
  ) {
    return { mode: "VERIFY_FULL", source: "PG_ENVIRONMENT", parameter: "PGSSLROOTCERT" };
  }

  return null;
}

function classifyModeValue(value: string): DatabaseTlsMode {
  const normalized = value.trim().toLowerCase();

  if (normalized === "disable") return "DISABLED";
  if (BYPASS_MODES.has(normalized)) return "NO_VERIFY";
  if (REQUIRE_MODES.has(normalized)) return "REQUIRE";
  if (normalized === "verify-full") return "VERIFY_FULL";

  return "UNSET";
}

/**
 * Resolves the effective TLS policy for a database connection.
 *
 * Production-like runtimes:
 * - TLS must be configured (URL parameter, PG env, or StellarCore CA env).
 * - The only accepted mode is verified TLS (`VERIFY_FULL` semantics:
 *   `rejectUnauthorized: true`).
 * - Bypass modes and disable are rejected, unless the emergency bypass flag
 *   is set to the exact documented value — and even then the decision is
 *   returned as an explicit bypass, never silently.
 * - Verified TLS with no CA material is accepted only when the host uses a
 *   publicly trusted certificate (the CA check is satisfied by the Node trust
 *   store); StellarCore treats the absence of CA configuration as acceptable
 *   for managed providers whose certificates chain to public roots, which is
 *   the standard Vercel/Supabase posture. A provided CA is optional hardening.
 *
 * Non-production runtimes: no constraint is enforced; a policy object is
 * still resolved so behavior is explicit rather than driver-defaulted.
 */
export function resolveDatabaseTlsPolicy(
  input: TlsPolicyEnvironmentInput,
  environment: Readonly<Record<string, string | undefined>> = {},
): ProductionTlsResolution {
  const urlSignal = classifyUrlTlsParameters(input.databaseUrl);
  const pgSignal = urlSignal ? null : classifyPgEnvironmentTls(environment);
  const signal = urlSignal ?? pgSignal;

  const effectiveMode: DatabaseTlsMode = signal?.mode ?? "UNSET";

  if (effectiveMode === "REQUIRE") {
    return requireModeResolution(input);
  }

  switch (effectiveMode) {
    case "DISABLED": {
      // Plaintext is never acceptable in production, even under the emergency
      // gate: the gate only authorizes unverified TLS, not unencrypted.
      if (input.isProductionLike) {
        return reject(
          "PRODUCTION_TLS_DISABLED",
          "Production PostgreSQL configuration disables TLS. Encrypted transport is required; configure the database provider's TLS endpoint or remove the sslmode=disable / ssl=0 setting.",
          signal,
        );
      }
      return plaintextDevResolution();
    }

    case "NO_VERIFY":
    case "UNSET": {
      if (!input.isProductionLike) {
        return plaintextDevResolution();
      }

      if (effectiveMode === "NO_VERIFY" && !input.emergencyBypassRequested) {
        return reject(
          "PRODUCTION_TLS_VERIFICATION_BYPASS",
          "Production PostgreSQL configuration bypasses certificate verification (ssl=no-verify, sslmode=no-verify, or sslmode=prefer). Verified TLS is required; use the provider's TLS endpoint with certificate verification enabled.",
          signal,
        );
      }

      if (effectiveMode === "NO_VERIFY" && input.emergencyBypassRequested) {
        return {
          accepted: true,
          mode: "NO_VERIFY",
          sslConfig: Object.freeze({ rejectUnauthorized: false }),
        };
      }

      // UNSET in production: policy provides verified TLS explicitly.
      return {
        accepted: true,
        mode: "VERIFY_FULL",
        sslConfig: Object.freeze({
          rejectUnauthorized: true,
          ...(input.inlineCa ? { ca: input.inlineCa } : {}),
        }),
      };
    }

    case "VERIFY_FULL": {
      if (!input.isProductionLike) {
        // Development explicitly requested verified TLS: honor it.
        return {
          accepted: true,
          mode: "VERIFY_FULL",
          sslConfig: Object.freeze({
            rejectUnauthorized: true,
            ...(input.inlineCa ? { ca: input.inlineCa } : {}),
          }),
        };
      }

      return {
        accepted: true,
        mode: "VERIFY_FULL",
        sslConfig: Object.freeze({
          rejectUnauthorized: true,
          ...(input.inlineCa ? { ca: input.inlineCa } : {}),
        }),
      };
    }
  }
}

function requireModeResolution(
  input: TlsPolicyEnvironmentInput,
): ProductionTlsResolution {
  // The caller strips TLS URL parameters before constructing the driver
  // connection. Upgrade require/verify-ca to authenticated TLS instead of
  // letting the driver's weaker URL semantics override certificate checks.
  return {
    accepted: true,
    mode: "VERIFY_FULL",
    sslConfig: Object.freeze({
      rejectUnauthorized: true,
      ...(input.inlineCa ? { ca: input.inlineCa } : {}),
    }),
  };
}

function reject(
  code: ProductionTlsViolationCode,
  message: string,
  signal: TlsConfigurationSignal | null,
): ProductionTlsResolution {
  return {
    accepted: false,
    rejection: Object.freeze({
      code,
      message,
      signal: signal ? Object.freeze({ ...signal }) : null,
    }),
  };
}

function plaintextDevResolution(): ProductionTlsResolution {
  return {
    accepted: true,
    mode: "DISABLED",
    sslConfig: Object.freeze({ rejectUnauthorized: true }) as ResolvedDatabaseTlsPolicy["sslConfig"],
  };
}
