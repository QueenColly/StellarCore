import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupeAnchorsBySlug,
  filterSnapshotsBySource,
  formatSnapshotTimestampUtc,
  isMultipleSourceSummary,
  summarizeSnapshot,
  summarizeSnapshots,
} from "@/lib/rates/snapshotSourceOverlap";
import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

const SNAPSHOT_TIMESTAMP = "2026-08-28T12:00:00.000Z";

function observation(
  slug: string,
  name: string = slug,
): PublicRateHistoryObservation {
  return Object.freeze({
    anchor: Object.freeze({ slug, name }),
    rate: "0.312",
    sourceAmount: "100",
    destinationAmount: "31.2",
    fee: "0",
    capturedAt: SNAPSHOT_TIMESTAMP,
  });
}

function rawObservation(
  anchor: Partial<Readonly<{ slug: string; name: string }>>,
): PublicRateHistoryObservation {
  return Object.freeze({ anchor }) as unknown as PublicRateHistoryObservation;
}

function pointWith(
  observations: readonly PublicRateHistoryObservation[],
  medianRate: string | null = "0.312",
  state: PublicRateHistoryPoint["state"] = "healthy",
): PublicRateHistoryPoint {
  return Object.freeze({
    timestamp: SNAPSHOT_TIMESTAMP,
    medianRate,
    state,
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

test("repeated anchor entries inside one snapshot collapse to the distinct slug count", () => {
  const summary = summarizeSnapshot(
    pointWith([observation("anchor-a", "Anchor A"), observation("anchor-a", "Anchor A")]),
  );
  assert.equal(summary?.distinctObservedAnchorCount, 1);
  assert.equal(summary?.anchors.length, 1);
});

test("one, two, and three anchors produce distinct observed anchor counts of one, two, and three", () => {
  const one = summarizeSnapshot(pointWith([observation("anchor-a")]));
  const two = summarizeSnapshot(
    pointWith([observation("anchor-a"), observation("anchor-b")]),
  );
  const three = summarizeSnapshot(
    pointWith([observation("anchor-a"), observation("anchor-b"), observation("anchor-c")]),
  );
  assert.equal(one?.distinctObservedAnchorCount, 1);
  assert.equal(two?.distinctObservedAnchorCount, 2);
  assert.equal(three?.distinctObservedAnchorCount, 3);
  assert.equal(isMultipleSourceSummary(one!), false);
  assert.equal(isMultipleSourceSummary(two!), true);
  assert.equal(isMultipleSourceSummary(three!), true);
});

test("null and missing fields stay honest: null medians and empty timestamps survive derivation", () => {
  const summary = summarizeSnapshot(
    pointWith([observation("anchor-a")], null, "insufficient_fresh_sources"),
  );
  assert.equal(summary?.medianRate, null);
  assert.equal(summary?.state, "insufficient_fresh_sources");
  assert.equal(summary?.timestamp, SNAPSHOT_TIMESTAMP);
  const missingTimestamp = summarizeSnapshot(
    pointWith([observation("anchor-a")], null),
  );
  assert.equal(missingTimestamp?.timestamp, SNAPSHOT_TIMESTAMP);
});

test("unknown slugs display the slug when the name is missing", () => {
  const summary = summarizeSnapshot(
    pointWith([rawObservation({ slug: "not-in-registry" })]),
  );
  assert.deepEqual(summary?.anchors, [
    Object.freeze({ slug: "not-in-registry", name: "not-in-registry" }),
  ]);
});

test("missing slugs are still deduplicated without inventing a name", () => {
  const summary = summarizeSnapshot(
    pointWith([rawObservation({ name: "Ghost Observation" }), rawObservation({ name: "Ghost Observation" })]),
  );
  assert.equal(summary?.distinctObservedAnchorCount, 1);
  assert.equal(summary?.anchors[0]?.slug, "");
  assert.equal(summary?.anchors[0]?.name, "Ghost Observation");
});

test("an empty points list yields an empty summary list", () => {
  assert.deepEqual(summarizeSnapshots(responseWith([])), []);
  assert.deepEqual(summarizeSnapshots(null), []);
});

test("summarizeSnapshots derives one summary per persisted point", () => {
  const summaries = summarizeSnapshots(
    responseWith([
      pointWith([observation("anchor-a")]),
      pointWith([observation("anchor-a"), observation("anchor-b")]),
    ]),
  );
  assert.equal(summaries.length, 2);
  assert.equal(summaries[0]?.distinctObservedAnchorCount, 1);
  assert.equal(summaries[1]?.distinctObservedAnchorCount, 2);
});

test("single and multiple source filters partition snapshots by distinct anchor count", () => {
  const summaries = summarizeSnapshots(
    responseWith([
      pointWith([observation("anchor-a")]),
      pointWith([observation("anchor-a"), observation("anchor-b")]),
      pointWith([observation("anchor-a"), observation("anchor-b"), observation("anchor-c")]),
    ]),
  );
  const singles = filterSnapshotsBySource(summaries, "single");
  const multiples = filterSnapshotsBySource(summaries, "multiple");
  const all = filterSnapshotsBySource(summaries, "all");
  assert.equal(singles.length, 1);
  assert.equal(singles[0]?.distinctObservedAnchorCount, 1);
  assert.equal(multiples.length, 2);
  assert.ok(multiples.every((summary) => summary.distinctObservedAnchorCount > 1));
  assert.equal(all.length, 3);
});

test("formatSnapshotTimestampUtc renders UTC and falls back to raw values when unparseable", () => {
  assert.equal(
    formatSnapshotTimestampUtc("2026-08-28T12:00:00.000Z"),
    "2026-08-28T12:00:00.000Z",
  );
  assert.equal(
    formatSnapshotTimestampUtc("2026-08-28T14:00:00+02:00"),
    "2026-08-28T12:00:00.000Z",
  );
  assert.equal(formatSnapshotTimestampUtc(""), "—");
  assert.equal(formatSnapshotTimestampUtc("not-a-date"), "not-a-date");
});

test("dedupeAnchorsBySlug ignores malformed observation entries defensively", () => {
  assert.deepEqual(dedupeAnchorsBySlug(null), []);
  assert.deepEqual(dedupeAnchorsBySlug(undefined), []);
  assert.deepEqual(
    dedupeAnchorsBySlug([
      rawObservation({}),
      rawObservation({ slug: "a" }),
      rawObservation({ slug: "a" }),
    ]).map((anchor) => anchor.slug),
    ["", "a"],
  );
});
