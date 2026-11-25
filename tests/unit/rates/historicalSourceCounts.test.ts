import assert from "node:assert/strict";
import test from "node:test";

import {
  computeHistoricalSourceCounts,
  describeBucket,
  describeMismatch,
  formatPercent,
  isNonEmptySlug,
} from "@/lib/rates/historicalSourceCounts";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryObservation,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

function makeObservation(anchorSlug: string): PublicRateHistoryObservation {
  return {
    anchor: { slug: anchorSlug, name: anchorSlug },
    rate: "1.0",
    sourceAmount: "100",
    destinationAmount: "100",
    fee: "0",
    capturedAt: new Date().toISOString(),
  };
}

function makePoint(
  timestamp: string,
  observations: PublicRateHistoryObservation[],
  sourceCount: number,
  freshSourceCount: number = 0,
  medianRate: string | null = null,
): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate,
    state: freshSourceCount >= 2 ? "healthy" : "insufficient_fresh_sources",
    sourceCount,
    freshSourceCount,
    observations,
  };
}

function makeResponse(
  points: PublicRateHistoryPoint[],
  degraded?: StaleEvidenceMetadata,
): PublicRateHistoryResponse {
  return {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: new Date().toISOString(),
    windowDays: 30,
    points,
    degraded,
  };
}

test("computeHistoricalSourceCounts handles empty history", () => {
  const result = computeHistoricalSourceCounts(makeResponse([]));

  assert.equal(result.totalPoints, 0);
  assert.equal(result.empty, true);
  assert.equal(result.buckets.length, 4);
  for (const bucket of result.buckets) {
    assert.equal(bucket.count, 0);
    assert.equal(bucket.percent, null);
    assert.equal(bucket.pointIndices.length, 0);
  }
  assert.equal(result.mismatches.length, 0);
});

test("computeHistoricalSourceCounts deduplicates anchor slugs per point", () => {
  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [makeObservation("a"), makeObservation("a"), makeObservation("b")], 2),
    makePoint("2026-01-02T00:00:00.000Z", [makeObservation("c")], 1),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  assert.equal(result.totalPoints, 2);

  const bucket0 = result.buckets.find((b) => b.label === "0");
  const bucket1 = result.buckets.find((b) => b.label === "1");
  const bucket2 = result.buckets.find((b) => b.label === "2");
  const bucket3 = result.buckets.find((b) => b.label === "3+");

  assert.equal(bucket0?.count, 0);
  assert.equal(bucket1?.count, 1);
  assert.equal(bucket2?.count, 1);
  assert.equal(bucket3?.count, 0);
});

test("computeHistoricalSourceCounts buckets zero observed sources", () => {
  const points = [makePoint("2026-01-01T00:00:00.000Z", [], 0)];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket0 = result.buckets.find((b) => b.label === "0");
  assert.equal(bucket0?.count, 1);
  assert.equal(bucket0?.distinctAnchorCount, 0);
});

test("computeHistoricalSourceCounts buckets one observed source", () => {
  const points = [makePoint("2026-01-01T00:00:00.000Z", [makeObservation("a")], 1)];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket1 = result.buckets.find((b) => b.label === "1");
  assert.equal(bucket1?.count, 1);
  assert.equal(bucket1?.distinctAnchorCount, 1);
});

test("computeHistoricalSourceCounts buckets two observed sources", () => {
  const points = [makePoint("2026-01-01T00:00:00.000Z", [makeObservation("a"), makeObservation("b")], 2)];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket2 = result.buckets.find((b) => b.label === "2");
  assert.equal(bucket2?.count, 1);
  assert.equal(bucket2?.distinctAnchorCount, 2);
});

test("computeHistoricalSourceCounts buckets three or more observed sources", () => {
  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [makeObservation("a"), makeObservation("b"), makeObservation("c")], 3),
    makePoint("2026-01-02T00:00:00.000Z", [makeObservation("a"), makeObservation("b"), makeObservation("c"), makeObservation("d")], 4),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket3 = result.buckets.find((b) => b.label === "3+");
  assert.equal(bucket3?.count, 2);
  assert.equal(bucket3?.distinctAnchorCount, 3);
});

test("computeHistoricalSourceCounts reports sourceCount mismatches as warnings", () => {
  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [makeObservation("a"), makeObservation("b")], 5),
    makePoint("2026-01-02T00:00:00.000Z", [makeObservation("c")], 0),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  assert.equal(result.mismatches.length, 2);
  assert.equal(result.mismatches[0].reportedSourceCount, 5);
  assert.equal(result.mismatches[0].observedDistinctAnchorCount, 2);
  assert.equal(result.mismatches[1].reportedSourceCount, 0);
  assert.equal(result.mismatches[1].observedDistinctAnchorCount, 1);
});

test("computeHistoricalSourceCounts handles malformed slugs (empty, whitespace)", () => {
  const obsWithEmpty = makeObservation("a");
  const obsWithWhitespace = makeObservation("b");
  (obsWithEmpty as PublicRateHistoryObservation & { anchor: { slug: string } }).anchor.slug = "";
  (obsWithWhitespace as PublicRateHistoryObservation & { anchor: { slug: string } }).anchor.slug = "   ";

  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [obsWithEmpty, obsWithWhitespace, makeObservation("c")], 1),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket1 = result.buckets.find((b) => b.label === "1");
  assert.equal(bucket1?.count, 1);
  assert.equal(result.mismatches.length, 0);
});

test("computeHistoricalSourceCounts ignores null/undefined slugs", () => {
  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [
      { ...makeObservation("a"), anchor: { ...makeObservation("a").anchor, slug: null as unknown as string } },
    ] as unknown as PublicRateHistoryObservation[], 1),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  const bucket0 = result.buckets.find((b) => b.label === "0");
  assert.equal(bucket0?.count, 1);
});

test("computeHistoricalSourceCounts percentages sum to 100", () => {
  const points = [
    makePoint("2026-01-01T00:00:00.000Z", [], 0),
    makePoint("2026-01-02T00:00:00.000Z", [makeObservation("a")], 1),
    makePoint("2026-01-03T00:00:00.000Z", [makeObservation("a"), makeObservation("b")], 2),
    makePoint("2026-01-04T00:00:00.000Z", [makeObservation("a"), makeObservation("b"), makeObservation("c")], 3),
  ];
  const result = computeHistoricalSourceCounts(makeResponse(points));

  let sum = 0;
  for (const bucket of result.buckets) {
    if (bucket.percent !== null) sum += bucket.percent;
  }
  assert.equal(Math.round(sum * 10) / 10, 100.0);
});

test("formatPercent formats null and values correctly", () => {
  assert.equal(formatPercent(null), "—");
  assert.equal(formatPercent(NaN), "—");
  assert.equal(formatPercent(Infinity), "—");
  assert.equal(formatPercent(0), "0.0%");
  assert.equal(formatPercent(33.333), "33.3%");
  assert.equal(formatPercent(100), "100.0%");
});

test("describeBucket returns readable labels", () => {
  assert.equal(describeBucket("0"), "No anchor observations");
  assert.equal(describeBucket("1"), "One distinct anchor");
  assert.equal(describeBucket("2"), "Two distinct anchors");
  assert.equal(describeBucket("3+"), "Three or more distinct anchors");
});

test("describeMismatch formats warning message", () => {
  const mismatch = {
    timestamp: "2026-01-01T00:00:00.000Z",
    index: 0,
    reportedSourceCount: 5,
    observedDistinctAnchorCount: 2,
  };
  assert.equal(
    describeMismatch(mismatch),
    "Snapshot at 2026-01-01T00:00:00.000Z reported sourceCount 5 but 2 distinct anchor slugs were observed.",
  );

  const mismatchSingle = {
    timestamp: "2026-01-01T00:00:00.000Z",
    index: 0,
    reportedSourceCount: 0,
    observedDistinctAnchorCount: 1,
  };
  assert.equal(
    describeMismatch(mismatchSingle),
    "Snapshot at 2026-01-01T00:00:00.000Z reported sourceCount 0 but 1 distinct anchor slug was observed.",
  );
});

test("isNonEmptySlug validates slug strings", () => {
  assert.equal(isNonEmptySlug("valid"), true);
  assert.equal(isNonEmptySlug(""), false);
  assert.equal(isNonEmptySlug("   "), false);
  assert.equal(isNonEmptySlug(null), false);
  assert.equal(isNonEmptySlug(123), false);
  assert.equal(isNonEmptySlug(undefined), false);
});