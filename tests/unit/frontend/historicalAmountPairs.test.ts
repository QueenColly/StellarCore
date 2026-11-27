import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { HistoricalAmountPairsView } from "@/app/insights/historical-amount-pairs/HistoricalAmountPairsView";
import {
  HISTORICAL_AMOUNT_PAIR_WINDOWS,
  isInterpretableAmount,
  summarizeHistoricalAmountPairs,
} from "@/lib/rates/historicalAmountPairs";
import type { PublicCorridor } from "@/types/api/corridors";
import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/historical-amount-pairs/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL(
    "../../../app/insights/historical-amount-pairs/HistoricalAmountPairsView.tsx",
    import.meta.url,
  ),
  "utf8",
);

const CORRIDORS: readonly PublicCorridor[] = [
  {
    slug: "usdc-us-brl-br",
    sourceAsset: "USDC",
    sourceCountry: "US",
    destinationAsset: "BRL",
    destinationCountry: "BR",
    anchorCount: 2,
  },
  {
    slug: "xlm-global-usdc-us",
    sourceAsset: "XLM",
    sourceCountry: "GLOBAL",
    destinationAsset: "USDC",
    destinationCountry: "US",
    anchorCount: 1,
  },
];

function observation(
  anchorSlug: string,
  sourceAmount: unknown,
  destinationAmount: unknown,
  capturedAt: string,
  anchorName = "",
): PublicRateHistoryObservation {
  return {
    anchor: { slug: anchorSlug, name: anchorName },
    rate: "5.2500000",
    sourceAmount,
    destinationAmount,
    fee: "0.50",
    capturedAt,
  } as PublicRateHistoryObservation;
}

function point(
  timestamp: string,
  observations: readonly PublicRateHistoryObservation[],
  overrides: Partial<PublicRateHistoryPoint> = {},
): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate: "5.2500000",
    state: "healthy",
    sourceCount: observations.length,
    freshSourceCount: observations.length,
    observations,
    ...overrides,
  };
}

function history(
  points: readonly PublicRateHistoryPoint[],
  windowDays = 30,
  degraded?: StaleEvidenceMetadata,
): PublicRateHistoryResponse {
  return {
    ...(degraded ? { degraded } : {}),
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    windowDays,
    points,
  };
}

function summaryFor(points: readonly PublicRateHistoryPoint[]) {
  const { corridor } = history([]);
  return summarizeHistoricalAmountPairs({ corridor, points });
}

function render(
  initialHistory: PublicRateHistoryResponse | null,
  initialError: string | null = null,
  initialDays = 30,
): string {
  return renderToStaticMarkup(
    createElement(HistoricalAmountPairsView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays,
      initialHistory,
      initialError,
    }),
  ).replaceAll("<!-- -->", "");
}

// --- grouping logic --------------------------------------------------------

test("repeated exact pairs across snapshots form one reproducible group", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100.00", "525.00", "2026-11-19T09:58:00.000Z"),
      observation("anchor-a", "100.00", "525.00", "2026-11-19T09:59:00.000Z"),
    ]),
    point("2026-11-20T10:00:00.000Z", [
      observation("anchor-a", "100.00", "525.00", "2026-11-20T11:00:00.000Z"),
    ]),
  ]);

  assert.equal(summary.pairs.length, 1);
  assert.equal(summary.interpretablePairCount, 1);
  assert.equal(summary.observationCount, 3);
  assert.equal(summary.interpretableObservationCount, 3);

  const pair = summary.pairs[0];
  assert.equal(pair.interpretable, true);
  assert.equal(pair.anchorSlug, "anchor-a");
  assert.equal(pair.sourceAmount, "100.00");
  assert.equal(pair.destinationAmount, "525.00");
  assert.equal(pair.observationCount, 3);
  assert.equal(pair.firstCapturedAt, "2026-11-19T09:58:00.000Z");
  assert.equal(pair.lastCapturedAt, "2026-11-20T11:00:00.000Z");
  assert.deepEqual(pair.snapshotTimestamps, [
    "2026-11-19T10:00:00.000Z",
    "2026-11-20T10:00:00.000Z",
  ]);
});

test("unequal source and destination amounts stay separate pairs", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100.00", "525.00", "2026-11-19T09:58:00.000Z"),
      observation("anchor-a", "200.00", "1050.00", "2026-11-19T09:59:00.000Z"),
    ]),
  ]);

  assert.equal(summary.interpretablePairCount, 2);
  assert.deepEqual(
    summary.pairs.map((pair) => [pair.sourceAmount, pair.destinationAmount]),
    [
      ["100.00", "525.00"],
      ["200.00", "1050.00"],
    ],
  );
});

test("two anchors with identical amounts are never combined", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z", "Anchor Alpha"),
      observation("anchor-b", "100", "525", "2026-11-19T09:59:00.000Z", "Anchor Beta"),
    ]),
  ]);

  assert.equal(summary.interpretablePairCount, 2);
  assert.deepEqual(
    summary.pairs.map((pair) => [pair.anchorSlug, pair.observationCount]),
    [
      ["anchor-a", 1],
      ["anchor-b", 1],
    ],
  );
  assert.deepEqual(
    summary.pairs.map((pair) => pair.anchorName),
    ["Anchor Alpha", "Anchor Beta"],
  );
});

test("alternate decimal string representations are distinct pairs, not normalised", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100", "525", "2026-11-19T09:56:00.000Z"),
      observation("anchor-a", "100.0", "525.0", "2026-11-19T09:57:00.000Z"),
      observation("anchor-a", "100.00", "525.00", "2026-11-19T09:58:00.000Z"),
      observation("anchor-a", "100.000", "525.000", "2026-11-19T09:59:00.000Z"),
    ]),
  ]);

  assert.equal(summary.interpretablePairCount, 4);
  assert.deepEqual(
    summary.pairs.map((pair) => pair.sourceAmount),
    ["100", "100.0", "100.00", "100.000"],
  );
  assert.deepEqual(
    summary.pairs.map((pair) => pair.destinationAmount),
    ["525", "525.0", "525.00", "525.000"],
  );
  assert.equal(isInterpretableAmount("100.000"), true);
});

test("malformed or missing amounts are not interpretable and are never merged", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100", "525", "2026-11-19T09:55:00.000Z"),
      observation("anchor-a", "abc", "525", "2026-11-19T09:56:00.000Z"),
      observation("anchor-a", "100", "525.00", "2026-11-19T09:57:00.000Z"),
      observation("anchor-a", "", "", "2026-11-19T09:58:00.000Z"),
      observation("anchor-a", null, "525", "2026-11-19T09:59:00.000Z"),
      observation("anchor-a", "-1", "525", "2026-11-19T10:00:00.000Z"),
    ]),
  ]);

  assert.equal(summary.interpretablePairCount, 2);
  assert.equal(summary.uninterpretableObservationCount, 4);
  for (const pair of summary.pairs.filter((entry) => !entry.interpretable)) {
    assert.equal(pair.sourceAmount, null);
    assert.equal(pair.destinationAmount, null);
    assert.equal(pair.firstCapturedAt, null);
    assert.equal(pair.lastCapturedAt, null);
    assert.deepEqual(pair.snapshotTimestamps, []);
  }
  assert.equal(isInterpretableAmount("abc"), false);
  assert.equal(isInterpretableAmount(""), false);
  assert.equal(isInterpretableAmount("-1"), false);
});

test("an observation without a stable anchor slug is not interpretable", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("", "100", "525", "2026-11-19T09:58:00.000Z"),
    ]),
  ]);

  assert.equal(summary.interpretablePairCount, 0);
  assert.equal(summary.uninterpretableObservationCount, 1);
  assert.equal(summary.pairs[0].anchorSlug, null);
});

test("multiple observations in one snapshot produce one drill-down snapshot time", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z", [
      observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z"),
      observation("anchor-a", "100", "525", "2026-11-19T09:59:00.000Z"),
    ]),
  ]);

  const pair = summary.pairs[0];
  assert.equal(pair.observationCount, 2);
  assert.deepEqual(pair.snapshotTimestamps, ["2026-11-19T10:00:00.000Z"]);
});

test("snapshot and capture timestamps that cannot be parsed are not used as evidence", () => {
  const summary = summaryFor([
    point("not-a-time", [
      observation("anchor-a", "100", "525", "also-not-a-time"),
      observation("anchor-a", "100", "525", "2026-11-19T09:59:00.000Z"),
    ]),
  ]);

  const pair = summary.pairs[0];
  assert.equal(pair.observationCount, 2);
  assert.equal(pair.interpretableCaptureCount, 1);
  assert.equal(pair.uninterpretableCaptureCount, 1);
  assert.equal(pair.firstCapturedAt, "2026-11-19T09:59:00.000Z");
  assert.equal(pair.lastCapturedAt, "2026-11-19T09:59:00.000Z");
  assert.equal(pair.uninterpretableSnapshotCount, 2);
  assert.deepEqual(pair.snapshotTimestamps, []);
  assert.equal(summary.uninterpretableSnapshotCount, 1);
});

test("snapshots without a published median still contribute their observations", () => {
  const summary = summaryFor([
    point(
      "2026-11-19T10:00:00.000Z",
      [observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z")],
      { medianRate: null, state: "insufficient_fresh_sources", freshSourceCount: 0 },
    ),
  ]);

  assert.equal(summary.snapshotsWithoutPublishedMedian, 1);
  assert.equal(summary.interpretablePairCount, 1);
  assert.equal(summary.observationCount, 1);
});

test("empty history and unreadable observation arrays are counted, not guessed", () => {
  const empty = summaryFor([]);
  assert.equal(empty.snapshotCount, 0);
  assert.equal(empty.observationCount, 0);
  assert.equal(empty.interpretablePairCount, 0);

  const partialPoint = {
    ...point("2026-11-19T10:00:00.000Z", []),
    observations: undefined as unknown as PublicRateHistoryPoint["observations"],
  };
  const partial = summaryFor([partialPoint]);
  assert.equal(partial.snapshotCount, 1);
  assert.equal(partial.unreadableObservationArrayCount, 1);
  assert.equal(partial.observationCount, 0);
  assert.equal(partial.interpretablePairCount, 0);
});

test("supported windows are exactly 7, 30 and 90 days", () => {
  assert.deepEqual(
    HISTORICAL_AMOUNT_PAIR_WINDOWS.map((window) => window.days),
    [7, 30, 90],
  );
});

// --- view ------------------------------------------------------------------

test("renders a semantic, horizontally scrollable table with exact strings", () => {
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z", [
        observation("anchor-a", "100.00", "525.00", "2026-11-19T09:58:00.000Z", "Anchor Alpha"),
        observation("anchor-a", "100.00", "525.00", "2026-11-19T09:59:00.000Z", "Anchor Alpha"),
      ]),
      point("2026-11-20T10:00:00.000Z", [
        observation("anchor-a", "100.00", "525.00", "2026-11-20T11:00:00.000Z", "Anchor Alpha"),
      ]),
    ]),
  );

  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Persisted amount pairs for USDC \(US\) → BRL \(BR\)"/);
  assert.match(html, /id="historical-amount-pairs-scroll-hint"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /<table/);
  assert.match(html, /<caption[^>]*>Persisted nominal source and destination amount pairs/);
  assert.match(html, /<th scope="col"[^>]*>Anchor<\/th>/);
  assert.match(html, /<th scope="col"[^>]*>Source amount \(USDC\)<\/th>/);
  assert.match(html, /<th scope="col"[^>]*>Destination amount \(BRL\)<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>.*Anchor Alpha/s);
  assert.match(html, /<code[^>]*>100\.00<\/code>/);
  assert.match(html, /<code[^>]*>525\.00<\/code>/);
  assert.match(html, /2 snapshot times/);
  assert.match(html, /2026-11-19T09:58:00\.000Z/);
  assert.match(html, /2026-11-20T11:00:00\.000Z/);
  assert.match(html, /no currency conversion/i);
  assert.match(html, /not a quote/);
});

test("alternate representations are displayed verbatim as separate rows", () => {
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z", [
        observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z"),
        observation("anchor-a", "100.00", "525.00", "2026-11-19T09:59:00.000Z"),
      ]),
    ]),
  );

  assert.match(html, /<code[^>]*>100<\/code>/);
  assert.match(html, /<code[^>]*>100\.00<\/code>/);
  assert.match(html, /<code[^>]*>525<\/code>/);
  assert.match(html, /<code[^>]*>525\.00<\/code>/);
});

test("invalid amounts render as not interpretable with no capture times", () => {
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z", [
        observation("anchor-a", "abc", "525", "2026-11-19T09:58:00.000Z"),
      ]),
    ]),
  );

  assert.match(html, /Not interpretable as a pair/);
  assert.match(html, /Not interpretable/);
  assert.match(html, /data-testid="historical-amount-pairs-partial"/);
  assert.doesNotMatch(html, /2026-11-19T09:58:00\.000Z<\/time>/);
});

test("empty responses show an explicit empty state and no table", () => {
  const empty = render(history([]));
  assert.match(empty, /data-testid="historical-amount-pairs-empty"/);
  assert.match(empty, /No history snapshots were returned/);
  assert.doesNotMatch(empty, /<table/);

  const snapshotWithoutObservations = render(history([point("2026-11-19T10:00:00.000Z", [])]));
  assert.match(snapshotWithoutObservations, /none contained recorded anchor observations/);
  assert.doesNotMatch(snapshotWithoutObservations, /<table/);
});

test("stale fallback responses are labelled with their generation time", () => {
  const html = render(
    history(
      [point("2026-11-19T10:00:00.000Z", [observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z")])],
      30,
      {
        state: "stale",
        generatedAt: "2026-11-20T12:00:05.000Z",
        expiresAt: "2026-11-21T12:00:05.000Z",
        sourceTimes: [],
        snapshotAgeMs: 1000,
      },
    ),
  );

  assert.match(html, /data-testid="historical-amount-pairs-stale"/);
  assert.match(html, /<time dateTime="2026-11-20T12:00:05\.000Z"/);
  assert.match(html, /not a fresh read/);
});

test("partial responses report unreadable snapshots while grouping what is readable", () => {
  const unreadablePoint = {
    ...point("2026-11-19T11:00:00.000Z", []),
    observations: undefined as unknown as PublicRateHistoryPoint["observations"],
  };
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z", [
        observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z"),
      ]),
      unreadablePoint,
    ]),
  );

  assert.match(html, /data-testid="historical-amount-pairs-partial"/);
  assert.match(html, /had no readable observations list and contributed no pairs/);
  assert.match(html, /<code[^>]*>100<\/code>/);
});

test("null median responses are explicitly counted, not treated as missing history", () => {
  const html = render(
    history([
      point(
        "2026-11-19T10:00:00.000Z",
        [observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z")],
        { medianRate: null, state: "insufficient_fresh_sources", freshSourceCount: 0 },
      ),
    ]),
  );

  assert.match(html, /No published median/);
  assert.match(html, /had no published median; those observations are still grouped/);
  assert.equal((html.match(/data-testid="historical-amount-pairs-empty"/g) ?? []).length, 0);
});

test("initial request errors show an alert and no fabricated groups", () => {
  const html = render(null, "Unable to read rate history.");
  assert.match(html, /role="alert" data-testid="historical-amount-pairs-initial-error"/);
  assert.match(html, /Unable to load rate history: Unable to read rate history\./);
  assert.match(html, /No amount pairs\s+are grouped/);
  assert.doesNotMatch(html, /historical-amount-pairs-result/);
  assert.match(html, /Retry request/);
});

test("the selected window is pressed and the view labels its own window", () => {
  const html = render(
    history(
      [point("2026-11-19T10:00:00.000Z", [observation("anchor-a", "100", "525", "2026-11-19T09:58:00.000Z")])],
      90,
    ),
    null,
    90,
  );

  assert.match(html, /aria-label="Group amount pairs from the 7 days history window"/);
  assert.match(html, /aria-label="Group amount pairs from the 90 days history window"/);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>90 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>7 days<\/button>/);
  assert.match(html, />90-day<\/span>/);
});

test("page reads only public GET helpers and touches no persistence layer", () => {
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /<nav aria-label="Breadcrumb"/);
  assert.doesNotMatch(
    pageSource + viewSource,
    /prisma|fetch\(|\.create\(|\.update\(|\.delete\(|rateHistoryRepository/i,
  );
});
