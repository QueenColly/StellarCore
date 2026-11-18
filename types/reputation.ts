export type ReputationAnchorStatus = "LIVE" | "DEGRADED" | "DOWN" | "UNKNOWN";
export type ReputationTransferStatus =
  | "COMPLETED"
  | "PARTIAL"
  | "REFUNDED"
  | "EXPIRED"
  | "ERROR";

export type ReputationEvidence = Readonly<{
  anchorId: string;
  anchorSlug: string;
  status: ReputationAnchorStatus;
  corridorSlugs: readonly string[];
  latestRates: readonly Readonly<{
    corridorSlug: string;
    capturedAt: Date | string;
  }>[];
  transferOutcomes: readonly Readonly<{
    status: ReputationTransferStatus;
    settlementMs: number;
    slippage: number;
    recordedAt: Date | string;
  }>[];
  /**
   * Identity of the single PostgreSQL snapshot the whole evidence set was read
   * from. See lib/reputation/snapshot.ts. Transactional coherence proves only
   * that the rows were observed at one database point in time; it is not
   * evidence about quote correctness, anchor availability, or transfer success.
   */
  snapshot: ReputationSnapshotContext;
}>;

export type ReputationSnapshotContext = Readonly<{
  /** PostgreSQL snapshot identifier from `pg_current_snapshot()` (txid:xip). */
  snapshotId: string;
  /** Server-side transaction start time of the snapshot read. */
  readAt: Date | string;
  /** Isolation level the evidence was read under. */
  isolationLevel: "REPEATABLE READ" | "SERIALIZABLE";
}>;

export type ReputationComponentName =
  | "availability"
  | "rateFreshness"
  | "coverage"
  | "transferReliability";

export type ReputationComponent = Readonly<{
  weight: number;
  score: number;
  earnedPoints: number;
}>;

export type ReputationCalculation = Readonly<{
  anchorSlug: string;
  computedAt: string;
  state: "insufficient_evidence" | "established";
  score: number | null;
  scoreBand: "GREEN" | "AMBER" | "RED" | null;
  components: Readonly<Record<ReputationComponentName, ReputationComponent>>;
  evidence: Readonly<{
    corridorCount: number;
    latestRateCount: number;
    freshRateCount: number;
    outcomeCount: number;
    completedOutcomeCount: number;
    minimumOutcomeCount: number;
  }>;
  metrics: Readonly<{
    fillRate7d: number | null;
    fillRate30d: number | null;
    fillRate90d: number | null;
    settleP50Ms: number | null;
    settleP95Ms: number | null;
    slippageP50: number | null;
    slippageP95: number | null;
  }>;
}>;

export type PersistedReputationScore = Readonly<{
  id: string;
  anchorSlug: string;
  computedAt: Date;
}>;

export type ReputationPersistenceInput = Readonly<{
  anchorId: string;
  calculation: ReputationCalculation;
}>;

export type ReputationEvidenceReadErrorCode =
  | "EVIDENCE_READ_FAILURE"
  | "EVIDENCE_READ_SERIALIZATION_FAILURE";

export type ReputationEvidenceReadFailure = Readonly<{
  code: ReputationEvidenceReadErrorCode;
  /** Bounded, secret-free retry classification for callers. */
  retryable: boolean;
  /** Number of read attempts made, bounded by REPUTATION_EVIDENCE_MAX_READ_ATTEMPTS. */
  attempts: number;
}>;

export type ReputationRepository = Readonly<{
  readEvidence: (
    anchorSlug: string,
    outcomeWindowStart: Date,
  ) => Promise<ReputationEvidence | ReputationEvidenceReadFailure | null>;
  upsertScore: (
    input: ReputationPersistenceInput,
  ) => Promise<PersistedReputationScore>;
}>;

export type ReputationEvaluationResult =
  | Readonly<{
      ok: true;
      calculation: ReputationCalculation;
      persisted: PersistedReputationScore | null;
      /** Snapshot identity the winning evidence set was read from. */
      snapshot: ReputationSnapshotContext;
    }>
  | Readonly<{
      ok: false;
      anchorSlug: string;
      code:
        | "ANCHOR_NOT_FOUND"
        | "INVALID_EVALUATION_TIME"
        | "EVIDENCE_READ_FAILURE"
        | "EVIDENCE_READ_SERIALIZATION_FAILURE"
        | "PERSISTENCE_FAILURE";
    }>;

/** Bounded retry ceiling; exceeded attempts surface as a typed failure. */
export const REPUTATION_EVIDENCE_MAX_READ_ATTEMPTS = 3;
