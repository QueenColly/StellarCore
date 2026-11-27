/**
 * Static compile-time allowlist of committed public API v1 contract fixtures (#643).
 *
 * All fixtures are imported statically at build time. No dynamic filesystem paths,
 * glob imports, user-supplied URLs, or runtime credentials are used.
 */

// Anchors fixtures (7)
import anchorsDetailError400 from "@/contracts/api/v1/fixtures/anchors/detail-error-400.json";
import anchorsDetailError404 from "@/contracts/api/v1/fixtures/anchors/detail-error-404.json";
import anchorsDetailError500 from "@/contracts/api/v1/fixtures/anchors/detail-error-500.json";
import anchorsDetailSuccess from "@/contracts/api/v1/fixtures/anchors/detail-success.json";
import anchorsListEmpty from "@/contracts/api/v1/fixtures/anchors/list-empty.json";
import anchorsListError500 from "@/contracts/api/v1/fixtures/anchors/list-error-500.json";
import anchorsListSuccess from "@/contracts/api/v1/fixtures/anchors/list-success.json";

// Corridors fixtures (8)
import corridorsDetailEmptyAnchors from "@/contracts/api/v1/fixtures/corridors/detail-empty-anchors.json";
import corridorsDetailError400 from "@/contracts/api/v1/fixtures/corridors/detail-error-400.json";
import corridorsDetailError404 from "@/contracts/api/v1/fixtures/corridors/detail-error-404.json";
import corridorsDetailError500 from "@/contracts/api/v1/fixtures/corridors/detail-error-500.json";
import corridorsDetailSuccess from "@/contracts/api/v1/fixtures/corridors/detail-success.json";
import corridorsListEmpty from "@/contracts/api/v1/fixtures/corridors/list-empty.json";
import corridorsListError500 from "@/contracts/api/v1/fixtures/corridors/list-error-500.json";
import corridorsListSuccess from "@/contracts/api/v1/fixtures/corridors/list-success.json";

// Rates fixtures (7)
import ratesEmptySuccess from "@/contracts/api/v1/fixtures/rates/empty-success.json";
import ratesErrorCorridorNotFound404 from "@/contracts/api/v1/fixtures/rates/error-corridor-not-found-404.json";
import ratesErrorInternal500 from "@/contracts/api/v1/fixtures/rates/error-internal-500.json";
import ratesErrorInvalidCorridor400 from "@/contracts/api/v1/fixtures/rates/error-invalid-corridor-400.json";
import ratesErrorMissingCorridor400 from "@/contracts/api/v1/fixtures/rates/error-missing-corridor-400.json";
import ratesHealthySuccess from "@/contracts/api/v1/fixtures/rates/healthy-success.json";
import ratesInsufficientSuccess from "@/contracts/api/v1/fixtures/rates/insufficient-success.json";

// Reputation fixtures (9)
import reputationDetailError400 from "@/contracts/api/v1/fixtures/reputation/detail-error-400.json";
import reputationDetailError404 from "@/contracts/api/v1/fixtures/reputation/detail-error-404.json";
import reputationDetailError500 from "@/contracts/api/v1/fixtures/reputation/detail-error-500.json";
import reputationDetailEstablished200 from "@/contracts/api/v1/fixtures/reputation/detail-established-200.json";
import reputationDetailInsufficient200 from "@/contracts/api/v1/fixtures/reputation/detail-insufficient-200.json";
import reputationDetailNotEvaluated200 from "@/contracts/api/v1/fixtures/reputation/detail-not-evaluated-200.json";
import reputationListEmpty from "@/contracts/api/v1/fixtures/reputation/list-empty.json";
import reputationListError500 from "@/contracts/api/v1/fixtures/reputation/list-error-500.json";
import reputationListSuccess from "@/contracts/api/v1/fixtures/reputation/list-success.json";

export type ContractDomain = "anchors" | "corridors" | "rates" | "reputation";

export type FixtureResponseState =
  | "success"
  | "empty"
  | "insufficient_evidence"
  | "invalid_input"
  | "not_found"
  | "server_error";

export type ContractFixture = Readonly<{
  name: string;
  domain: ContractDomain;
  endpoint: string;
  method: string;
  expectedStatus: number;
  description: string;
  body: Record<string, unknown>;
  responseState: FixtureResponseState;
}>;

export function classifyResponseState(
  expectedStatus: number,
  name: string,
  body: unknown,
): FixtureResponseState {
  if (expectedStatus >= 500) return "server_error";
  if (expectedStatus === 404) return "not_found";
  if (expectedStatus === 400) return "invalid_input";

  const lowerName = name.toLowerCase();
  if (lowerName.includes("empty")) return "empty";
  if (
    lowerName.includes("insufficient") ||
    lowerName.includes("not_evaluated") ||
    lowerName.includes("not-evaluated")
  ) {
    return "insufficient_evidence";
  }

  // Check body details if available
  if (typeof body === "object" && body !== null) {
    const b = body as Record<string, unknown>;
    if (b.state === "insufficient_fresh_sources") return "insufficient_evidence";
    if (b.status === "NOT_EVALUATED" || b.status === "INSUFFICIENT_EVIDENCE") {
      return "insufficient_evidence";
    }
    if (b.count === 0 || (Array.isArray(b.anchors) && b.anchors.length === 0)) {
      return "empty";
    }
  }

  return "success";
}

function createFixtureEntry(raw: {
  name: string;
  domain: string;
  endpoint: string;
  method: string;
  expectedStatus: number;
  description: string;
  body: unknown;
}): ContractFixture {
  const domain = raw.domain as ContractDomain;
  const responseState = classifyResponseState(
    raw.expectedStatus,
    raw.name,
    raw.body,
  );
  return Object.freeze({
    name: raw.name,
    domain,
    endpoint: raw.endpoint,
    method: raw.method,
    expectedStatus: raw.expectedStatus,
    description: raw.description,
    body: raw.body as Record<string, unknown>,
    responseState,
  });
}

/**
 * The exhaustive, immutable build-time allowlist of all 31 public API v1 contract fixtures.
 */
export const ALLOWLISTED_FIXTURES: readonly ContractFixture[] = Object.freeze([
  // Anchors (7)
  createFixtureEntry(anchorsDetailSuccess),
  createFixtureEntry(anchorsListSuccess),
  createFixtureEntry(anchorsListEmpty),
  createFixtureEntry(anchorsDetailError400),
  createFixtureEntry(anchorsDetailError404),
  createFixtureEntry(anchorsDetailError500),
  createFixtureEntry(anchorsListError500),

  // Corridors (8)
  createFixtureEntry(corridorsDetailSuccess),
  createFixtureEntry(corridorsListSuccess),
  createFixtureEntry(corridorsListEmpty),
  createFixtureEntry(corridorsDetailEmptyAnchors),
  createFixtureEntry(corridorsDetailError400),
  createFixtureEntry(corridorsDetailError404),
  createFixtureEntry(corridorsDetailError500),
  createFixtureEntry(corridorsListError500),

  // Rates (7)
  createFixtureEntry(ratesHealthySuccess),
  createFixtureEntry(ratesInsufficientSuccess),
  createFixtureEntry(ratesEmptySuccess),
  createFixtureEntry(ratesErrorInvalidCorridor400),
  createFixtureEntry(ratesErrorMissingCorridor400),
  createFixtureEntry(ratesErrorCorridorNotFound404),
  createFixtureEntry(ratesErrorInternal500),

  // Reputation (9)
  createFixtureEntry(reputationListSuccess),
  createFixtureEntry(reputationDetailEstablished200),
  createFixtureEntry(reputationDetailInsufficient200),
  createFixtureEntry(reputationDetailNotEvaluated200),
  createFixtureEntry(reputationListEmpty),
  createFixtureEntry(reputationDetailError400),
  createFixtureEntry(reputationDetailError404),
  createFixtureEntry(reputationDetailError500),
  createFixtureEntry(reputationListError500),
]);

export const DOMAINS: readonly ContractDomain[] = Object.freeze([
  "anchors",
  "corridors",
  "rates",
  "reputation",
]);

export const RESPONSE_STATES: readonly FixtureResponseState[] = Object.freeze([
  "success",
  "empty",
  "insufficient_evidence",
  "invalid_input",
  "not_found",
  "server_error",
]);

/**
 * Returns fixtures grouped by domain.
 */
export function getFixturesByDomain(domain: ContractDomain): readonly ContractFixture[] {
  return ALLOWLISTED_FIXTURES.filter((f) => f.domain === domain);
}

/**
 * Safely looks up an allowlisted fixture by its exact identifier.
 * Returns null if not in allowlist; never executes dynamic paths or external lookups.
 */
export function getAllowlistedFixture(name: string): ContractFixture | null {
  const match = ALLOWLISTED_FIXTURES.find((f) => f.name === name);
  return match ?? null;
}
