import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCurrentFreshnessBreakdown,
  formatAgeMs,
  describeFreshnessState,
  describeDegraded,
  isValidFreshnessState,
} from "@/lib/rates/currentFreshnessBreakdown";
import type { PublicRateObservation, PublicRatesResponse } from "@/types/api/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

function makeObservation(
  anchorSlug: string,
  state: "fresh" | "stale" | "future" | "invalid",
  ageMs: number | null,
  eligibleForMedian: boolean,
): PublicRateObservation {
  return {
    anchor: { slug: anchorSlug, name: anchorSlug },
    rate: "1.0",
    sourceAmount: "100",
    destinationAmount: "100",
    fee: "0",
    capturedAt: new Date().toISOString(),
    freshness: { state, ageMs },
    eligibleForMedian,
    exclusionReason: eligibleForMedian ? undefined : "stale",
  };
}

function makeResponse(observations: PublicRateObservation[], degraded?: StaleEvidenceMetadata): PublicRatesResponse {
  return {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: new Date().toISOString(),
    state: "healthy",
    medianRate: "1.0",
    sourceCount: observations.length,
    freshSourceCount: observations.filter((o) => o.freshness.state === "fresh").length,
    reviewedCandidateConfiguration: { candidateCount: 2, uniqueAnchorCount: 2 },
    medianRequirement: { minimumFreshIndependentSources: 2 },
    observations,
    degraded,
  };
}

test("computeCurrentFreshnessBreakdown groups all four states", () => {
  const observations = [
    makeObservation("a", "fresh", 1000, true),
    makeObservation("b", "stale", 200000, false),
    makeObservation("c", "future", -5000, false),
    makeObservation("d", "invalid", null, false),
  ];
  const result = computeCurrentFreshnessBreakdown(makeResponse(observations));

  assert.equal(result.totalObservations, 4);
  assert.equal(result.groups.length, 4);

  const fresh = result.groups.find((g) => g.state === "fresh");
  assert.ok(fresh);
  assert.equal(fresh.count, 1);
  assert.deepEqual(fresh.agesMs, [1000]);
  assert.equal(fresh.nullAgeCount, 0);
  assert.equal(fresh.hasNegativeAge, false);
  assert.equal(fresh.eligibleForMedianCount, 1);

  const stale = result.groups.find((g) => g.state === "stale");
  assert.ok(stale);
  assert.equal(stale.count, 1);
  assert.deepEqual(stale.agesMs, [200000]);
  assert.equal(stale.nullAgeCount, 0);
  assert.equal(stale.hasNegativeAge, false);
  assert.equal(stale.eligibleForMedianCount, 0);

  const future = result.groups.find((g) => g.state === "future");
  assert.ok(future);
  assert.equal(future.count, 1);
  assert.deepEqual(future.agesMs, [-5000]);
  assert.equal(future.nullAgeCount, 0);
  assert.equal(future.hasNegativeAge, true);
  assert.equal(future.eligibleForMedianCount, 0);

  const invalid = result.groups.find((g) => g.state === "invalid");
  assert.ok(invalid);
  assert.equal(invalid.count, 1);
  assert.deepEqual(invalid.agesMs, []);
  assert.equal(invalid.nullAgeCount, 1);
  assert.equal(invalid.hasNegativeAge, false);
  assert.equal(invalid.eligibleForMedianCount, 0);
});

test("computeCurrentFreshnessBreakdown handles null ages conservatively", () => {
  const observations = [
    makeObservation("a", "fresh", null, true),
    makeObservation("b", "fresh", 500, true),
  ];
  const result = computeCurrentFreshnessBreakdown(makeResponse(observations));

  const fresh = result.groups.find((g) => g.state === "fresh");
  assert.ok(fresh);
  assert.equal(fresh.count, 2);
  assert.deepEqual(fresh.agesMs, [500]);
  assert.equal(fresh.nullAgeCount, 1);
  assert.equal(fresh.hasNegativeAge, false);
});

test("computeCurrentFreshnessBreakdown handles negative ages conservatively", () => {
  const observations = [
    makeObservation("a", "fresh", -100, true),
    makeObservation("b", "future", -5000, false),
  ];
  const result = computeCurrentFreshnessBreakdown(makeResponse(observations));

  const fresh = result.groups.find((g) => g.state === "fresh");
  assert.ok(fresh);
  assert.equal(fresh.hasNegativeAge, true);

  const future = result.groups.find((g) => g.state === "future");
  assert.ok(future);
  assert.equal(future.hasNegativeAge, true);
});

test("computeCurrentFreshnessBreakdown handles no observations", () => {
  const result = computeCurrentFreshnessBreakdown(makeResponse([]));

  assert.equal(result.totalObservations, 0);
  assert.equal(result.empty, true);
  assert.equal(result.eligibleForMedianCount, 0);
  assert.equal(result.notEligibleForMedianCount, 0);
  for (const group of result.groups) {
    assert.equal(group.count, 0);
    assert.equal(group.agesMs.length, 0);
    assert.equal(group.nullAgeCount, 0);
    assert.equal(group.hasNegativeAge, false);
    assert.equal(group.eligibleForMedianCount, 0);
  }
});

test("computeCurrentFreshnessBreakdown handles duplicate anchors", () => {
  const observations = [
    makeObservation("a", "fresh", 1000, true),
    makeObservation("a", "stale", 200000, false),
    makeObservation("b", "fresh", 500, true),
  ];
  const result = computeCurrentFreshnessBreakdown(makeResponse(observations));

  assert.equal(result.totalObservations, 3);
  const fresh = result.groups.find((g) => g.state === "fresh");
  assert.equal(fresh?.count, 2);
  const stale = result.groups.find((g) => g.state === "stale");
  assert.equal(stale?.count, 1);
});

test("computeCurrentFreshnessBreakdown separates eligibleForMedian from freshness", () => {
  const observations = [
    makeObservation("a", "fresh", 1000, true),
    makeObservation("b", "fresh", 500, false),
    makeObservation("c", "stale", 200000, true),
    makeObservation("d", "stale", 300000, false),
  ];
  const result = computeCurrentFreshnessBreakdown(makeResponse(observations));

  assert.equal(result.eligibleForMedianCount, 2);
  assert.equal(result.notEligibleForMedianCount, 2);

  const fresh = result.groups.find((g) => g.state === "fresh");
  assert.equal(fresh?.eligibleForMedianCount, 1);

  const stale = result.groups.find((g) => g.state === "stale");
  assert.equal(stale?.eligibleForMedianCount, 1);
});

test("computeCurrentFreshnessBreakdown exposes degraded fallback metadata", () => {
  const degraded: StaleEvidenceMetadata = {
    state: "stale",
    generatedAt: "2026-01-01T12:00:00.000Z",
    expiresAt: "2026-01-01T12:05:00.000Z",
    sourceTimes: ["2026-01-01T11:59:00.000Z"],
    snapshotAgeMs: 60000,
  };
  const result = computeCurrentFreshnessBreakdown(makeResponse([], degraded));

  assert.ok(result.degraded);
  assert.equal(result.degraded?.generatedAt, "2026-01-01T12:00:00.000Z");
  assert.equal(result.degraded?.snapshotAgeMs, 60000);
});

test("formatAgeMs formats milliseconds, seconds, null, and negative values", () => {
  assert.equal(formatAgeMs(500), "500 ms");
  assert.equal(formatAgeMs(2500), "2.50 s");
  assert.equal(formatAgeMs(null), "age not reported");
  assert.equal(formatAgeMs(-100), "100 ms (negative, as reported)");
  assert.equal(formatAgeMs(NaN), "age not reported");
  assert.equal(formatAgeMs(Infinity), "age not reported");
});

test("describeFreshnessState returns readable labels", () => {
  assert.equal(describeFreshnessState("fresh"), "Fresh");
  assert.equal(describeFreshnessState("stale"), "Stale");
  assert.equal(describeFreshnessState("future"), "Future");
  assert.equal(describeFreshnessState("invalid"), "Invalid");
});

test("describeDegraded formats fallback metadata", () => {
  const metadata: StaleEvidenceMetadata = {
    state: "stale",
    generatedAt: "2026-01-01T12:00:00.000Z",
    expiresAt: "2026-01-01T12:05:00.000Z",
    sourceTimes: [],
    snapshotAgeMs: 60000,
  };
  assert.equal(
    describeDegraded(metadata),
    "Stale fallback copy generated 2026-01-01T12:00:00.000Z, 60000 ms old at evaluation; expires 2026-01-01T12:05:00.000Z.",
  );
  assert.equal(describeDegraded(undefined), "Fresh evidence");
  assert.equal(describeDegraded(null), "Fresh evidence");
});

test("isValidFreshnessState validates known states", () => {
  assert.equal(isValidFreshnessState("fresh"), true);
  assert.equal(isValidFreshnessState("stale"), true);
  assert.equal(isValidFreshnessState("future"), true);
  assert.equal(isValidFreshnessState("invalid"), true);
  assert.equal(isValidFreshnessState("unknown"), false);
  assert.equal(isValidFreshnessState(null), false);
  assert.equal(isValidFreshnessState(123), false);
});