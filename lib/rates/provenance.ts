import { randomUUID } from "node:crypto";

import type {
  RateSnapshotProvenanceInput,
  RateSnapshotProvenanceTrace,
  PersistedRateSnapshotProvenance,
} from "@/types/rateProvenance";

export type RateSnapshotProvenanceErrorCode =
  | "INVALID_CAPTURE_RUN_ID"
  | "INVALID_SOURCE_TYPE"
  | "INVALID_ANCHOR"
  | "INVALID_CORRIDOR"
  | "INVALID_CONFIGURATION_DIGEST"
  | "INVALID_REQUEST_SHAPE_VERSION"
  | "INVALID_TIMESTAMP";

export class RateSnapshotProvenanceError extends Error {
  constructor(readonly code: RateSnapshotProvenanceErrorCode) {
    super(code);
    this.name = "RateSnapshotProvenanceError";
  }
}

/** Mirrors the reviewed stable-slug rule used by rate normalization. */
const STABLE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONFIGURATION_DIGEST = /^[0-9a-f]{64}$/;
const MAX_IDENTITY_LENGTH = 128;

/**
 * Mints a capture-run identity for one rate-engine run. Every snapshot
 * persisted by the same run shares this identifier, which is what makes a
 * partial run's persisted rows groupable without a competing run ledger.
 *
 * The run-ledger boundary (#113 dependency): provenance stores this as a
 * plain string, deliberately without a foreign key, so the Wave 9 durable
 * refresh-run ledger can later mint compatible identifiers without a schema
 * migration or a second ledger implementation.
 */
export function mintRateCaptureRunId(): string {
  return randomUUID();
}

/**
 * Normalizes reviewed capture inputs into an immutable provenance record.
 *
 * Redaction guarantee: the record is constructed field by field from the
 * explicit parameter list, so credentials, authorization headers, private
 * keys, raw remote payloads, and credential-bearing URLs can never enter
 * persisted provenance even if a caller passes a richer object.
 */
export function buildRateSnapshotProvenance(
  input: RateSnapshotProvenanceInput,
): RateSnapshotProvenanceInput {
  const capturedAt =
    input.capturedAt instanceof Date
      ? new Date(input.capturedAt.getTime())
      : new Date(input.capturedAt);
  if (!Number.isFinite(capturedAt.getTime())) {
    throw new RateSnapshotProvenanceError("INVALID_TIMESTAMP");
  }

  return Object.freeze({
    captureRunId: requireIdentity(input.captureRunId, "INVALID_CAPTURE_RUN_ID"),
    sourceType: requireIdentity(input.sourceType, "INVALID_SOURCE_TYPE"),
    anchorSlug: requireSlug(input.anchorSlug, "INVALID_ANCHOR"),
    corridorSlug: requireSlug(input.corridorSlug, "INVALID_CORRIDOR"),
    configurationDigest: requireConfigurationDigest(input.configurationDigest),
    requestShapeVersion: requireIdentity(
      input.requestShapeVersion,
      "INVALID_REQUEST_SHAPE_VERSION",
    ),
    capturedAt,
  });
}

export type { RateSnapshotProvenanceTrace, PersistedRateSnapshotProvenance };

function requireIdentity(
  value: string,
  code: RateSnapshotProvenanceErrorCode,
): string {
  if (typeof value !== "string") throw new RateSnapshotProvenanceError(code);
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > MAX_IDENTITY_LENGTH) {
    throw new RateSnapshotProvenanceError(code);
  }
  return normalized;
}

function requireSlug(
  value: string,
  code: RateSnapshotProvenanceErrorCode,
): string {
  const normalized = requireIdentity(value, code);
  if (!STABLE_SLUG.test(normalized)) throw new RateSnapshotProvenanceError(code);
  return normalized;
}

function requireConfigurationDigest(value: string): string {
  if (typeof value !== "string" || !CONFIGURATION_DIGEST.test(value)) {
    throw new RateSnapshotProvenanceError("INVALID_CONFIGURATION_DIGEST");
  }
  return value;
}
