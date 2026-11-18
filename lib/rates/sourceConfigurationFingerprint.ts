import { createHash } from "node:crypto";

import type { ReviewedLiveRateSource } from "@/types/liveRateSource";

/**
 * Version tag embedded in every fingerprinted material (#331). Bump this
 * string whenever the field-selection rules or canonicalization change so old
 * and new digests can never be confused; the digest format itself stays
 * "64 lowercase hex characters".
 */
export const RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION =
  "stellarcore-rate-source-config-v1";

/**
 * The complete allowlist of reviewed, non-secret rate-source fields that
 * identify a configuration. Field-selection rules:
 *
 * - Included: reviewed identity (anchorSlug, corridorSlug), reviewed SEP-38
 *   request shape (sellAsset, buyAsset, sellAmount, buyDeliveryMethod,
 *   countryCode, context). These are checked into `constants/liveRateSources.ts`
 *   and reviewed through configuration PRs.
 * - Excluded: credentials and secrets of any kind (bearer tokens,
 *   authorization headers, API keys, private keys, cookies). The reviewed
 *   source model never carries them, and the allowlist pick below guarantees
 *   an unexpected secret-bearing key can never enter the fingerprint input.
 * - Excluded: volatile runtime values (quote-server URLs discovered from
 *   live SEP-1 TOML, network timing, timeouts, retries, deployment revision,
 *   capturedAt/clock values, environment variables).
 *
 * Because only allowlisted keys are read, equivalent configurations produce
 * the same digest regardless of object key order, and changing any meaningful
 * reviewed field changes the digest.
 */
export const RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS = Object.freeze([
  "anchorSlug",
  "buyAsset",
  "buyDeliveryMethod",
  "context",
  "corridorSlug",
  "countryCode",
  "sellAmount",
  "sellAsset",
] as const satisfies readonly (keyof ReviewedLiveRateSource)[]);

export type RateSourceConfigurationFingerprintField =
  (typeof RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS)[number];

/**
 * Computes a deterministic SHA-256 fingerprint (64 lowercase hex characters)
 * over the canonicalized, allowlisted fields of one reviewed rate-source
 * configuration. Pure, offline, and secret-free by construction.
 */
export function computeRateSourceConfigurationFingerprint(
  source: ReviewedLiveRateSource,
): string {
  const material = Object.freeze({
    version: RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION,
    source: canonicalize(pickFingerprintFields(source)),
  });
  return createHash("sha256")
    .update(JSON.stringify(material))
    .digest("hex");
}

/**
 * Reads only the allowlisted fields. Absent optional fields and explicit
 * `undefined` values are dropped so `{}` and `{ buyDeliveryMethod: undefined }`
 * fingerprint identically.
 */
function pickFingerprintFields(
  source: ReviewedLiveRateSource,
): Record<string, string> {
  const picked: Record<string, string> = {};
  for (const field of RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.length > 0) {
      picked[field] = value;
    }
  }
  return picked;
}

/** Recursively orders object keys so serialization is order-independent. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}
