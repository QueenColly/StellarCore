/**
 * Capture-time provenance for one persisted rate snapshot (#113).
 *
 * A provenance record links a `RateSnapshot` back to the capture run and the
 * reviewed source/configuration identity that produced it, without storing
 * secrets, authorization material, or raw remote payloads.
 */

/**
 * Normalized, immutable provenance input for a capture. Built by
 * `buildRateSnapshotProvenance` (lib/rates/provenance.ts) from the reviewed
 * candidate at capture time; never reconstructed later from the current
 * registry.
 */
export type RateSnapshotProvenanceInput = Readonly<{
  /** Durable capture-run identity shared by every snapshot of one run. */
  captureRunId: string;
  /** Reviewed source type, e.g. `sep38_indicative_price`. */
  sourceType: string;
  /** Anchor slug as selected at capture time. */
  anchorSlug: string;
  /** Corridor slug as selected at capture time. */
  corridorSlug: string;
  /** Deterministic digest of the reviewed source configuration (#331). */
  configurationDigest: string;
  /** Version of the request shape used for the candidate. */
  requestShapeVersion: string;
  /** Instant the observation was captured (matches the snapshot). */
  capturedAt: Date;
}>;

/** Provenance row as read back from storage. */
export type PersistedRateSnapshotProvenance = RateSnapshotProvenanceInput &
  Readonly<{
    id: string;
    snapshotId: string;
    /** Instant the provenance row was written. */
    recordedAt: Date;
  }>;

/**
 * Result of tracing a snapshot identifier to its provenance.
 *
 * - `available`: capture-time provenance exists and is returned verbatim.
 * - `SNAPSHOT_NOT_FOUND`: no snapshot with that identifier exists.
 * - `PROVENANCE_UNAVAILABLE`: the snapshot predates provenance persistence
 *   (legacy row); its lineage is truthfully unknown, never inferred.
 */
export type RateSnapshotProvenanceTrace =
  | Readonly<{ status: "available"; provenance: PersistedRateSnapshotProvenance }>
  | Readonly<{
      status: "unavailable";
      reason: "SNAPSHOT_NOT_FOUND" | "PROVENANCE_UNAVAILABLE";
    }>;
