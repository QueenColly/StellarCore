import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

export type PublicRateHistoryObservation = Readonly<{
  anchor: Readonly<{
    slug: string;
    name: string;
  }>;
  rate: string;
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  capturedAt: string;
}>;

export type PublicRateHistoryPoint = Readonly<{
  timestamp: string;
  medianRate: string | null;
  state: "healthy" | "insufficient_fresh_sources";
  sourceCount: number;
  freshSourceCount: number;
  observations: readonly PublicRateHistoryObservation[];
}>;

export type PublicRateHistoryResponse = Readonly<{
  degraded?: StaleEvidenceMetadata;
  corridor: Readonly<{
    slug: string;
    sourceAsset: string;
    sourceCountry: string;
    destinationAsset: string;
    destinationCountry: string;
  }>;
  evaluatedAt: string;
  windowDays: number;
  points: readonly PublicRateHistoryPoint[];
}>;

export type RateHistoryApiErrorCode =
  | "missing_corridor"
  | "invalid_corridor"
  | "invalid_days"
  | "corridor_not_found"
  | "internal_error";

export type RateHistoryApiErrorResponse = Readonly<{
  error: Readonly<{
    code: RateHistoryApiErrorCode;
    message: string;
  }>;
}>;

export type RateHistoryApiResult =
  | Readonly<{ status: 200; body: PublicRateHistoryResponse; degraded?: StaleEvidenceMetadata }>
  | Readonly<{
      status: 400 | 404 | 500;
      body: RateHistoryApiErrorResponse;
    }>;
