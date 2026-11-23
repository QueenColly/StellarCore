import type { AnchorResponse, AnchorsResponse, CorridorResponse, RateHistoryResponse, RatesResponse, ReputationDetailResponse, ReputationListResponse } from "./types.js";

export const anchorsOk: AnchorsResponse = {
  anchors: [{ slug: "example-anchor", name: "Example Anchor", homeDomain: "example.test", status: "LIVE", seps: [1, 24], isTransferCapable: true, corridorCount: 1 }],
  count: 1,
};
export const anchorsEmpty: AnchorsResponse = { anchors: [], count: 0 };
export const anchorDetailOk: AnchorResponse = { anchor: { ...anchorsOk.anchors[0], corridors: [] } };

export const corridorOk: CorridorResponse = {
  corridor: { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 1, anchors: [{ slug: "example-anchor", name: "Example Anchor", homeDomain: "example.test", status: "LIVE", seps: [1, 24], isTransferCapable: true }] },
};

export const ratesInsufficient: RatesResponse = {
  corridor: { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR" },
  evaluatedAt: "2026-01-01T00:00:00.000Z", state: "insufficient_fresh_sources", medianRate: null, sourceCount: 1, freshSourceCount: 0,
  reviewedCandidateConfiguration: { candidateCount: 2, uniqueAnchorCount: 2 }, medianRequirement: { minimumFreshIndependentSources: 2 }, observations: [],
};

export const historyEmpty: RateHistoryResponse = {
  corridor: ratesInsufficient.corridor, evaluatedAt: "2026-01-01T00:00:00.000Z", windowDays: 30, points: [],
};

export const reputationInsufficient: ReputationDetailResponse = {
  reputation: { anchor: { slug: "example-anchor", name: "Example Anchor" }, state: "insufficient_evidence", score: null, scoreBand: null, evidence: { outcomeCount: 3 }, metrics: null, computedAt: "2026-01-01T00:00:00.000Z" },
};

export const reputationListOk: ReputationListResponse = { reputation: [reputationInsufficient.reputation], count: 1 };
