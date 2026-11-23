export type ApiErrorEnvelope<C extends string = string> = Readonly<{
  error: Readonly<{ code: C; message: string }>;
}>;

export type ApiResult<T, C extends string = string> =
  | Readonly<{ ok: true; status: number; data: T }>
  | Readonly<{ ok: false; status: number; error: ApiErrorEnvelope<C>["error"] | null; raw: unknown }>;

export type AnchorSummary = Readonly<{
  slug: string; name: string; homeDomain: string;
  status: "LIVE" | "DEGRADED" | "DOWN" | "UNKNOWN";
  seps: readonly number[]; isTransferCapable: boolean; corridorCount: number;
}>;
export type AnchorsResponse = Readonly<{ anchors: readonly AnchorSummary[]; count: number }>;
export type AnchorDetail = Readonly<AnchorSummary & { corridors: readonly Readonly<{ slug: string; sourceAsset: string; sourceCountry: string; destinationAsset: string; destinationCountry: string }>[] }>;
export type AnchorResponse = Readonly<{ anchor: AnchorDetail }>;

export type CorridorDetail = Readonly<{
  slug: string; sourceAsset: string; sourceCountry: string; destinationAsset: string; destinationCountry: string;
  anchorCount: number;
  anchors: readonly Readonly<{ slug: string; name: string; homeDomain: string; status: AnchorSummary["status"]; seps: readonly number[]; isTransferCapable: boolean }>[];
}>;
export type CorridorResponse = Readonly<{ corridor: CorridorDetail }>;

export type RateObservation = Readonly<{
  anchor: Readonly<{ slug: string; name: string }>;
  rate: string; sourceAmount: string; destinationAmount: string; fee: string; capturedAt: string;
  freshness: Readonly<{ state: "fresh" | "stale"; ageMs: number | null }>;
  eligibleForMedian: boolean; exclusionReason?: "stale" | "invalid";
}>;
export type RatesResponse = Readonly<{
  corridor: Readonly<{ slug: string; sourceAsset: string; sourceCountry: string; destinationAsset: string; destinationCountry: string }>;
  evaluatedAt: string; state: "healthy" | "insufficient_fresh_sources"; medianRate: string | null;
  sourceCount: number; freshSourceCount: number;
  reviewedCandidateConfiguration: Readonly<{ candidateCount: number; uniqueAnchorCount: number }>;
  medianRequirement: Readonly<{ minimumFreshIndependentSources: number }>;
  observations: readonly RateObservation[];
}>;

export type RateHistoryPoint = Readonly<{
  timestamp: string; medianRate: string | null; state: "healthy" | "insufficient_fresh_sources";
  sourceCount: number; freshSourceCount: number; observations: readonly Readonly<{ anchor: Readonly<{ slug: string; name: string }>; rate: string; sourceAmount: string; destinationAmount: string; fee: string; capturedAt: string }>[];
}>;
export type RateHistoryResponse = Readonly<{
  corridor: RatesResponse["corridor"]; evaluatedAt: string; windowDays: number; points: readonly RateHistoryPoint[];
}>;

export type Reputation = Readonly<{
  anchor: Readonly<{ slug: string; name: string }>;
  state: "not_evaluated" | "insufficient_evidence" | "established";
  score: number | null; scoreBand: "green" | "amber" | "red" | null;
  evidence: Readonly<{ outcomeCount: number }> | null;
  metrics: Readonly<{ fillRate7d: number | null; fillRate30d: number | null; fillRate90d: number | null; settleP50Ms: number | null; settleP95Ms: number | null; slippageP50: number | null; slippageP95: number | null }> | null;
  computedAt: string | null;
}>;
export type ReputationListResponse = Readonly<{ reputation: readonly Reputation[]; count: number }>;
export type ReputationDetailResponse = Readonly<{ reputation: Reputation }>;
