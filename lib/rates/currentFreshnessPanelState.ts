import type { PublicRatesResponse } from "@/types/api/rates";

export type CurrentFreshnessRefreshFailure = Readonly<{
  message: string;
  failedAt: string;
}>;

export type CurrentFreshnessPanelState = Readonly<{
  displayed: PublicRatesResponse;
  loading: boolean;
  failure: CurrentFreshnessRefreshFailure | null;
}>;

export type CurrentFreshnessPanelEvent =
  | Readonly<{ type: "refresh_started" }>
  | Readonly<{ type: "refresh_succeeded"; rates: PublicRatesResponse }>
  | Readonly<{ type: "refresh_failed"; message: string; failedAt: string }>;

const NO_RATES_EVALUATED_AT = new Date(0).toISOString();

export function placeholderRates(corridorSlug: string): PublicRatesResponse {
  return {
    corridor: {
      slug: corridorSlug,
      sourceAsset: "",
      sourceCountry: "",
      destinationAsset: "",
      destinationCountry: "",
    },
    evaluatedAt: NO_RATES_EVALUATED_AT,
    state: "insufficient_fresh_sources",
    medianRate: null,
    sourceCount: 0,
    freshSourceCount: 0,
    reviewedCandidateConfiguration: {
      candidateCount: 0,
      uniqueAnchorCount: 0,
    },
    medianRequirement: {
      minimumFreshIndependentSources: 2,
    },
    observations: [],
  };
}

export function initialCurrentFreshnessPanelState(
  rates: PublicRatesResponse,
): CurrentFreshnessPanelState {
  return { displayed: rates, loading: false, failure: null };
}

export function currentFreshnessPanelReducer(
  state: CurrentFreshnessPanelState,
  event: CurrentFreshnessPanelEvent,
): CurrentFreshnessPanelState {
  switch (event.type) {
    case "refresh_started":
      return { ...state, loading: true };
    case "refresh_succeeded":
      return {
        displayed: event.rates,
        loading: false,
        failure: null,
      };
    case "refresh_failed":
      return {
        displayed: state.displayed,
        loading: false,
        failure: { message: event.message, failedAt: event.failedAt },
      };
  }
}