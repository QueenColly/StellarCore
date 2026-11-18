import type { MedianExclusionReason, RateFreshnessState } from "@/types/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

export type PublicRateObservation = Readonly<{
  anchor: Readonly<{
    slug: string;
    name: string;
  }>;
  rate: string;
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  capturedAt: string;
  freshness: Readonly<{
    state: RateFreshnessState;
    ageMs: number | null;
  }>;
  eligibleForMedian: boolean;
  exclusionReason?: MedianExclusionReason;
}>;

export type PublicReviewedCandidateConfiguration = Readonly<{
  candidateCount: number;
  uniqueAnchorCount: number;
}>;

export type PublicMedianRequirement = Readonly<{
  minimumFreshIndependentSources: number;
}>;

export type PublicRatesResponse = Readonly<{
  degraded?: StaleEvidenceMetadata;
  corridor: Readonly<{
    slug: string;
    sourceAsset: string;
    sourceCountry: string;
    destinationAsset: string;
    destinationCountry: string;
  }>;
  evaluatedAt: string;
  state: "healthy" | "insufficient_fresh_sources";
  medianRate: string | null;
  sourceCount: number;
  freshSourceCount: number;
  reviewedCandidateConfiguration: PublicReviewedCandidateConfiguration;
  medianRequirement: PublicMedianRequirement;
  observations: readonly PublicRateObservation[];
}>;

export type RatesApiErrorCode =
  | "missing_corridor"
  | "invalid_corridor"
  | "invalid_query"
  | "corridor_not_found"
  | "internal_error";

export type RatesApiErrorResponse = Readonly<{
  error: Readonly<{
    code: RatesApiErrorCode;
    message: string;
  }>;
}>;

export type RatesApiResult =
  | Readonly<{ status: 200; body: PublicRatesResponse; degraded?: StaleEvidenceMetadata }>
  | Readonly<{ status: 400 | 404 | 500; body: RatesApiErrorResponse }>;
