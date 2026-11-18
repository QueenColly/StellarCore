import type { CorridorRegistryEntry } from "@/types/corridor";
import type { RateSnapshotProvenanceInput } from "@/types/rateProvenance";
import type {
  Sep38IndicativePrice,
  Sep38IndicativePriceRequest,
} from "@/types/sep38";

export type NormalizedRateObservation = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  capturedAt: Date;
}>;

export type RateFreshnessState = "fresh" | "stale" | "future" | "invalid";

export type RateFreshness = Readonly<{
  state: RateFreshnessState;
  ageMs: number | null;
}>;

export type MedianSource = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  capturedAt: Date | string;
}>;

export type MedianExclusionReason =
  | "stale"
  | "future_timestamp"
  | "invalid_timestamp"
  | "invalid_rate";

export type MedianSourceResult = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  capturedAt: Date | string;
  included: boolean;
  exclusionReason?: MedianExclusionReason;
}>;

export type MedianResult = Readonly<{
  state: "healthy" | "insufficient_fresh_sources";
  median: string | null;
  freshSourceCount: number;
  sources: readonly MedianSourceResult[];
}>;

export type PersistedRateSnapshot = Readonly<{
  id: string;
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  capturedAt: Date;
}>;

export type RateSnapshotPersistenceCode =
  | "ANCHOR_NOT_FOUND"
  | "CORRIDOR_NOT_FOUND"
  | "ASSOCIATION_NOT_FOUND"
  | "PERSISTENCE_FAILURE"
  | "ENVIRONMENT_MISMATCH";

export type RateSnapshotPersistenceResult =
  | Readonly<{ ok: true; snapshot: PersistedRateSnapshot }>
  | Readonly<{ ok: false; code: RateSnapshotPersistenceCode }>;

export type RateSnapshotRepository = Readonly<{
  findAnchorBySlug: (slug: string) => Promise<Readonly<{ id: string }> | null>;
  findCorridorBySlug: (slug: string) => Promise<Readonly<{ id: string }> | null>;
  hasAssociation: (anchorId: string, corridorId: string) => Promise<boolean>;
  createSnapshot: (input: Readonly<{
    anchorId: string;
    corridorId: string;
    rate: string;
    sourceAmount: string;
    destinationAmount: string;
    fee: string;
    capturedAt: Date;
    /** Capture-time provenance written in the same transaction (#113). */
    provenance: RateSnapshotProvenanceInput;
  }>) => Promise<Readonly<{
    id: string;
    rate: { toString(): string } | string;
    sourceAmount: { toString(): string } | string;
    destinationAmount: { toString(): string } | string;
    fee: { toString(): string } | string;
    capturedAt: Date;
    provenanceId: string;
  }>>;
}>;

export type RateCandidate = Readonly<{
  anchorSlug: string;
  corridor: CorridorRegistryEntry;
  request: Sep38IndicativePriceRequest;
  /**
   * Deterministic digest of the reviewed source configuration this candidate
   * was built from (#331). Persisted as capture-time provenance (#113); never
   * recomputed from the current registry after the fact.
   */
  configurationDigest: string;
}>;

export type RateQuoteProvider = (
  candidate: RateCandidate,
) => Promise<Sep38IndicativePrice>;

export type RateEngineFailure = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  phase: "QUOTE" | "NORMALIZATION" | "PERSISTENCE";
  code: string;
}>;

export type RateEngineSkippedSource = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  reason: "DUPLICATE_CANDIDATE";
}>;

export type RateEngineResult = Readonly<{
  /** Capture-run identity shared by every snapshot persisted in this run. */
  captureRunId: string;
  totalCandidates: number;
  totalAttempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  snapshotsPersisted: number;
  snapshots: readonly PersistedRateSnapshot[];
  failures: readonly RateEngineFailure[];
  skippedSources: readonly RateEngineSkippedSource[];
}>;
