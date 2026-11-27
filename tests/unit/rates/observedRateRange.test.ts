import assert from "node:assert/strict";
import test from "node:test";

import {
  parseObservedRate,
  summarizeObservedRateRange,
  summarizePointRates,
} from "@/lib/rates/observedRateRange";
import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

const SNAPSHOT_TIMESTAMP = "2026-08-28T12:00:00.000Z";

function observation(
  slug: string,
  rate: string,
): PublicRateHistoryObservation {
  return Object.freeze({
    anchor: Object.freeze({ slug, name: slug }),
    rate,
    sourceAmount: "100",
    destinationAmount: "31.2",
    fee: "0",
    capturedAt: SNAPSHOT_TIMESTAMP,
  });
}

function pointWith(
  observations: readonly PublicRateHistoryObservation[],
  medianRate: string | null = null,
): PublicRateHistoryPoint {
  return Object.freeze({
    timestamp: SNAPSHOT_TIMESTAMP,
    medianRate,
    state: "healthy",
    sourceCount: observations.length,
    freshSourceCount: observations.length,
    observations: Object.freeze([...observations]),
  });
}

function responseWith(
  points: readonly PublicRateHistoryPoint[],
): PublicRateHistoryResponse {
  return Object.freeze({
    corridor: Object.freeze({
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    }),
    evaluatedAt: SNAPSHOT_TIMESTAMP,
    windowDays: 30,
    points,
  });
}

test("two valid distinct anchor rates produce a min, max, and absolute range", () => {
  const point = pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "0.325")]);
  const pointSummary = summarizePointRates(point);
  assert.equal(pointSummary.isQualified, true);
  assert.equal(pointSummary.minRate?.original, "0.31");
  assert.equal(pointSummary.maxRate?.original, "0.325");

  const summary = summarizeObservedRateRange(responseWith([point]));
  assert.equal(summary.pointCount, 1);
  assert.equal(summary.qualifiedPointCount, 1);
  assert.equal(summary.excludedPointCount, 0);
  assert.equal(summary.snapshots[0]?.minRate ?? null, "0.31");
  assert.equal(summary.snapshots[0]?.maxRate ?? null, "0.325");
  assert.equal(summary.snapshots[0]?.range ?? null, "0.015");
});

test("identical rates across distinct anchors yield a zero range", () => {
  const summary = summarizeObservedRateRange(
    responseWith([pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "0.31")])]),
  );
  assert.equal(summary.qualifiedPointCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, "0.31");
  assert.equal(summary.snapshots[0]?.maxRate ?? null, "0.31");
  assert.equal(summary.snapshots[0]?.range ?? null, "0");
});

test("one anchor does not qualify", () => {
  const point = pointWith([observation("anchor-a", "0.31")]);
  const pointSummary = summarizePointRates(point);
  assert.equal(pointSummary.isQualified, false);
  assert.equal(pointSummary.minRate, null);
  assert.equal(pointSummary.maxRate, null);

  const summary = summarizeObservedRateRange(responseWith([point]));
  assert.equal(summary.pointCount, 1);
  assert.equal(summary.qualifiedPointCount, 0);
  assert.equal(summary.excludedPointCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, null);
  assert.equal(summary.snapshots[0]?.maxRate ?? null, null);
  assert.equal(summary.snapshots[0]?.range ?? null, null);
});

test("duplicate anchor entries do not count as distinct rates", () => {
  const summary = summarizeObservedRateRange(
    responseWith([pointWith([observation("anchor-a", "0.31"), observation("anchor-a", "0.325")])]),
  );
  assert.equal(summary.qualifiedPointCount, 0);
  assert.equal(summary.excludedPointCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, null);
});

test("a duplicate anchor followed by a second anchor yields two rates", () => {
  const summary = summarizeObservedRateRange(
    responseWith([
      pointWith([observation("anchor-a", "0.31"), observation("anchor-a", "0.325"), observation("anchor-b", "0.5")]),
    ]),
  );
  assert.equal(summary.qualifiedPointCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, "0.31");
  assert.equal(summary.snapshots[0]?.maxRate ?? null, "0.5");
  assert.equal(summary.snapshots[0]?.range ?? null, "0.19");
});

test("malformed and nonpositive rates are excluded and counted separately", () => {
  const summary = summarizeObservedRateRange(
    responseWith([
      pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "not-a-rate"), observation("anchor-c", "0")]),
    ]),
  );
  assert.equal(summary.qualifiedPointCount, 0);
  assert.equal(summary.excludedPointCount, 1);
  assert.equal(summary.excludedRateCount, 2);
  assert.equal(summary.snapshots[0]?.minRate ?? null, null);
});

test("huge decimals beyond the bounded Decimal(38,18) bound are excluded", () => {
  const summary = summarizeObservedRateRange(
    responseWith([
      pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "123456789012345678901")]),
    ]),
  );
  assert.equal(summary.qualifiedPointCount, 0);
  assert.equal(summary.excludedRateCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, null);
});

test("zero and zero-valued decimal rates are nonpositive and excluded", () => {
  const pointSummary = summarizePointRates(
    pointWith([observation("anchor-a", "0"), observation("anchor-b", "0.000")]),
  );
  assert.equal(pointSummary.isQualified, false);
  assert.equal(pointSummary.excludedRateCount, 2);
});

test("null medians do not change range derivation", () => {
  const summary = summarizeObservedRateRange(
    responseWith([pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "0.325")], null)]),
  );
  assert.equal(summary.qualifiedPointCount, 1);
  assert.equal(summary.snapshots[0]?.minRate ?? null, "0.31");
  assert.equal(summary.snapshots[0]?.maxRate ?? null, "0.325");
  assert.equal(summary.snapshots[0]?.range ?? null, "0.015");
});

test("extrema from different snapshots are never combined", () => {
  const secondTimestamp = "2026-08-29T12:00:00.000Z";
  const summary = summarizeObservedRateRange(responseWith([
    pointWith([observation("anchor-a", "0.31"), observation("anchor-b", "0.325")]),
    { ...pointWith([observation("anchor-c", "0.80"), observation("anchor-d", "0.85")]), timestamp: secondTimestamp },
  ]));
  assert.equal(summary.qualifiedPointCount, 2);
  assert.deepEqual(summary.snapshots, [
    { timestamp: SNAPSHOT_TIMESTAMP, minRate: "0.31", maxRate: "0.325", range: "0.015" },
    { timestamp: secondTimestamp, minRate: "0.80", maxRate: "0.85", range: "0.05" },
  ]);
});

test("an empty points list yields a zeroed summary", () => {
  const summary = summarizeObservedRateRange(responseWith([]));
  assert.deepEqual(summary, {
    pointCount: 0,
    qualifiedPointCount: 0,
    excludedPointCount: 0,
    excludedRateCount: 0,
    snapshots: [],
  });
});

test("missing points and observations are treated defensively", () => {
  const summary = summarizeObservedRateRange(
    { points: [null] } as unknown as PublicRateHistoryResponse,
  );
  assert.equal(summary.pointCount, 1);
  assert.equal(summary.qualifiedPointCount, 0);
  assert.equal(summary.excludedPointCount, 1);

  const barePoint = {
    timestamp: SNAPSHOT_TIMESTAMP,
    medianRate: null,
    state: "healthy",
    sourceCount: 0,
    freshSourceCount: 0,
  } as unknown as PublicRateHistoryPoint;
  assert.equal(summarizePointRates(barePoint).isQualified, false);
  assert.equal(summarizePointRates(null).isQualified, false);
  assert.equal(summarizeObservedRateRange(null).pointCount, 0);
});

test("parseObservedRate keeps the original string and rejects malformed or zero rates", () => {
  const parsed = parseObservedRate("0.31");
  assert.equal(parsed?.original, "0.31");
  assert.equal(parsed?.decimal.coefficient, 31n);
  assert.equal(parseObservedRate("0"), null);
  assert.equal(parseObservedRate(""), null);
  assert.equal(parseObservedRate("not-a-rate"), null);
});

test("missing anchor identity cannot qualify as an independent source", () => {
  const summary = summarizeObservedRateRange(responseWith([
    pointWith([observation("", "0.2"), observation("anchor-a", "0.3")]),
  ]));
  assert.equal(summary.qualifiedPointCount, 0);
  assert.deepEqual(summary.snapshots, []);
});
