import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

export type PublicReputationState =
  | "not_evaluated"
  | "insufficient_evidence"
  | "established";

export type PublicReputationScoreBand = "green" | "amber" | "red";

export type PublicReputationMetrics = Readonly<{
  fillRate7d: number | null;
  fillRate30d: number | null;
  fillRate90d: number | null;
  settleP50Ms: number | null;
  settleP95Ms: number | null;
  slippageP50: number | null;
  slippageP95: number | null;
}>;

export type PublicReputation = Readonly<{
  anchor: Readonly<{
    slug: string;
    name: string;
  }>;
  state: PublicReputationState;
  score: number | null;
  scoreBand: PublicReputationScoreBand | null;
  evidence: Readonly<{
    outcomeCount: number;
  }> | null;
  metrics: PublicReputationMetrics | null;
  computedAt: string | null;
}>;

export type PublicReputationListResponse = Readonly<{
  degraded?: StaleEvidenceMetadata;
  reputation: readonly PublicReputation[];
  count: number;
}>;

export type PublicReputationDetailResponse = Readonly<{
  degraded?: StaleEvidenceMetadata;
  reputation: PublicReputation;
}>;

export type ReputationApiErrorResponse = Readonly<{
  error: Readonly<{
    code: "invalid_anchor_slug" | "anchor_not_found" | "internal_error";
    message: string;
  }>;
}>;

export type ReputationApiListResult =
  | Readonly<{ status: 200; body: PublicReputationListResponse; degraded?: StaleEvidenceMetadata }>
  | Readonly<{ status: 500; body: ReputationApiErrorResponse }>;

export type ReputationApiDetailResult =
  | Readonly<{ status: 200; body: PublicReputationDetailResponse; degraded?: StaleEvidenceMetadata }>
  | Readonly<{ status: 400 | 404 | 500; body: ReputationApiErrorResponse }>;
