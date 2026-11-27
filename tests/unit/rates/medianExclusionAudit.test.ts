import assert from "node:assert/strict";
import test from "node:test";

import {
  formatObservationTimestampUtc,
  REASON_NOT_REPORTED,
  summarizeMedianExclusions,
} from "@/lib/rates/medianExclusionAudit";
import type {
  PublicRateObservation,
  PublicRatesResponse,
} from "@/types/api/rates";

const CAPTURED_AT = "2026-08-28T12:00:00.000Z";

function observation(
  input: Partial<
    Readonly<{
      slug: string;
      rate: string;
      eligibleForMedian: boolean;
      exclusionReason: string;
      capturedAt: string;
      freshnessState: string;
    }>
  > = {},
): PublicRateObservation {
  const { slug, ...fields } = input;
  return Object.freeze({
    rate: "0.31",
    sourceAmount: "100",
    destinationAmount: "31.2",
    fee: "0",
    capturedAt: CAPTURED_AT,
    freshness: Object.freeze({ state: "fresh", ageMs: null }),
    eligibleForMedian: false,
    ...fields,
    anchor: Object.freeze({ slug: slug ?? "", name: slug ?? "" }),
  }) as PublicRateObservation;
}

function ratesResponse(
  observations: readonly PublicRateObservation[],
  medianRate: string | null = "0.31",
): PublicRatesResponse {
  return Object.freeze({
    corridor: Object.freeze({
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    }),
    evaluatedAt: "2026-08-28T12:00:00.000Z",
    state: "healthy",
    medianRate,
    sourceCount: observations.length,
    freshSourceCount: 0,
    reviewedCandidateConfiguration: Object.freeze({
      candidateCount: 1,
      uniqueAnchorCount: 2,
    }),
    medianRequirement: Object.freeze({
      minimumFreshIndependentSources: 2,
    }),
    observations: Object.freeze([...observations]),
  });
}

test("eligible and excluded observations are counted separately and grouped by recorded exclusion reason", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse([
      observation({ slug: "anchor-a", eligibleForMedian: true }),
      observation({ slug: "anchor-b", exclusionReason: "stale" }),
      observation({ slug: "anchor-c", exclusionReason: "invalid_rate" }),
    ]),
  );
  assert.equal(summary.observedCount, 3);
  assert.equal(summary.eligibleCount, 1);
  assert.equal(summary.excludedCount, 2);
  assert.deepEqual(
    summary.groups.map((group) => group.reason),
    ["invalid_rate", "stale"],
  );
  assert.deepEqual(
    summary.groups.map((group) => group.count),
    [1, 1],
  );
  assert.deepEqual(summary.groups[0]?.entries, [
    Object.freeze({ slug: "anchor-c", capturedAt: CAPTURED_AT }),
  ]);
});

test("recorded reasons for fresh, stale, future, and invalid observations group by their recorded reason", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse([
      observation({ slug: "a", exclusionReason: "stale", freshnessState: "stale" }),
      observation({ slug: "b", exclusionReason: "stale", freshnessState: "stale" }),
      observation({ slug: "c", exclusionReason: "future_timestamp", freshnessState: "future" }),
      observation({ slug: "d", exclusionReason: "invalid_timestamp", freshnessState: "invalid" }),
      observation({ slug: "e", exclusionReason: "invalid_rate", freshnessState: "invalid" }),
    ]),
  );
  assert.deepEqual(
    summary.groups.map((group) => group.reason),
    ["future_timestamp", "invalid_rate", "invalid_timestamp", "stale"],
  );
  assert.deepEqual(
    summary.groups.map((group) => group.count),
    [1, 1, 1, 2],
  );
});

test("missing or unknown reasons are preserved as Reason not reported", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse([
      observation({ slug: "a" }),
      observation({ slug: "b", exclusionReason: undefined }),
      observation({
        slug: "c",
        exclusionReason: "some_new_reason",
      }),
    ]),
  );
  assert.equal(summary.observedCount, 3);
  assert.equal(summary.eligibleCount, 0);
  assert.equal(summary.excludedCount, 3);
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0]?.reason, REASON_NOT_REPORTED);
  assert.equal(summary.groups[0]?.count, 3);
});

test("duplicate anchors appear as separate entries per observation", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse([
      observation({ slug: "anchor-a", exclusionReason: "stale" }),
      observation({ slug: "anchor-a", exclusionReason: "stale" }),
    ]),
  );
  assert.equal(summary.excludedCount, 2);
  assert.equal(summary.groups.length, 1);
  assert.equal(summary.groups[0]?.reason, "stale");
  assert.equal(summary.groups[0]?.count, 2);
  assert.deepEqual(
    summary.groups[0]?.entries.map((entry) => entry.slug),
    ["anchor-a", "anchor-a"],
  );
});

test("null median responses still summarize exclusions", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse(
      [observation({ slug: "a", eligibleForMedian: true }), observation({ slug: "b", exclusionReason: "stale" })],
      null,
    ),
  );
  assert.equal(summary.observedCount, 2);
  assert.equal(summary.eligibleCount, 1);
  assert.equal(summary.excludedCount, 1);
  assert.equal(summary.groups[0]?.reason, "stale");
});

test("zero observations produce a zeroed audit", () => {
  assert.deepEqual(summarizeMedianExclusions(ratesResponse([], null)), {
    observedCount: 0,
    eligibleCount: 0,
    excludedCount: 0,
    groups: [],
  });
});

test("missing eligible flags and reasons stay honest (not eligible, not inferred)", () => {
  const summary = summarizeMedianExclusions(
    ratesResponse([
      observation({ slug: "a", eligibleForMedian: undefined }),
      observation({ slug: "b", eligibleForMedian: undefined }),
    ]),
  );
  assert.equal(summary.observedCount, 2);
  assert.equal(summary.eligibleCount, 0);
  assert.equal(summary.excludedCount, 2);
});

test("formatObservationTimestampUtc renders UTC and falls back for missing or invalid values", () => {
  assert.equal(
    formatObservationTimestampUtc("2026-08-28T12:00:00.000Z"),
    "2026-08-28T12:00:00.000Z",
  );
  assert.equal(
    formatObservationTimestampUtc("2026-08-28T14:00:00+02:00"),
    "2026-08-28T12:00:00.000Z",
  );
  assert.equal(formatObservationTimestampUtc(""), "—");
  assert.equal(formatObservationTimestampUtc("not-a-date"), "not-a-date");
});
