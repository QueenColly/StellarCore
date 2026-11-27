import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HistoricalFeeRecordsView } from "@/app/insights/historical-fee-records/HistoricalFeeRecordsView";
import {
  HISTORICAL_FEE_WINDOWS,
  buildFeeSnapshotRows,
  groupFeeRecords,
  listObservedAnchors,
  readRecordedDecimal,
} from "@/lib/rates/historicalFeeRecords";
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
  new URL("../../../app/insights/historical-fee-records/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/historical-fee-records/HistoricalFeeRecordsView.tsx", import.meta.url),
  "utf8",
);
const libSource = readFileSync(
  new URL("../../../lib/rates/historicalFeeRecords.ts", import.meta.url),
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
];

function obs(
  slug: string,
  sourceAmount: string,
  fee: string,
  capturedAt: string,
  name = `Anchor ${slug}`,
): PublicRateHistoryObservation {
  return {
    anchor: { slug, name },
    rate: "5.25",
    sourceAmount,
    destinationAmount: "525.00",
    fee,
    capturedAt,
  };
}

function point(
  timestamp: string,
  observations: readonly PublicRateHistoryObservation[],
  medianRate: string | null = "5.2500000",
): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate,
    state: medianRate === null ? "insufficient_fresh_sources" : "healthy",
    sourceCount: observations.length,
    freshSourceCount: observations.length,
    observations,
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

function render(
  initialHistory: PublicRateHistoryResponse | null,
  options: { initialError?: string | null; initialDays?: number; anchor?: string | null } = {},
): string {
  return renderToStaticMarkup(
    createElement(HistoricalFeeRecordsView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays: options.initialDays ?? 30,
      initialAnchorSlug: options.anchor ?? null,
      initialHistory,
      initialError: options.initialError ?? null,
    }),
  ).replaceAll("<!-- -->", "");
}

const T1 = "2026-11-17T00:00:00.000Z";
const T2 = "2026-11-18T00:00:00.000Z";
const T3 = "2026-11-19T00:00:00.000Z";

// --- grouping logic ---------------------------------------------------------

test("repeated fee strings group per anchor and exact amount with counts and first/last times", () => {
  const points = [
    point(T1, [obs("anchor-a", "100.00", "0.50", "2026-11-17T00:01:00.000Z")]),
    point(T2, [obs("anchor-a", "100.00", "0.50", "2026-11-18T00:01:00.000Z")]),
    point(T3, [obs("anchor-a", "100.00", "0.50", "2026-11-19T00:01:00.000Z")]),
  ];
  const { groups, observationCount, ungroupedCount } = groupFeeRecords(points);
  assert.equal(observationCount, 3);
  assert.equal(ungroupedCount, 0);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0], {
    anchorSlug: "anchor-a",
    anchorName: "Anchor anchor-a",
    sourceAmount: "100.00",
    fee: "0.50",
    count: 3,
    snapshotCount: 3,
    firstRecordedAt: "2026-11-17T00:01:00.000Z",
    lastRecordedAt: "2026-11-19T00:01:00.000Z",
  });
});

test("multiple source amounts for the same anchor are never merged, even if numerically equal", () => {
  const points = [
    point(T1, [
      obs("anchor-a", "100.00", "0.50", T1),
      obs("anchor-a", "1000.00", "0.50", T1),
      obs("anchor-a", "100", "0.50", T1),
    ]),
  ];
  const { groups } = groupFeeRecords(points);
  assert.deepEqual(
    groups.map((g) => g.sourceAmount).sort(),
    ["100", "100.00", "1000.00"],
  );
  assert.ok(groups.every((g) => g.count === 1));
});

test("multiple anchors with identical amount and fee stay in separate groups", () => {
  const points = [
    point(T1, [obs("anchor-b", "100.00", "0.50", T1), obs("anchor-a", "100.00", "0.50", T1)]),
  ];
  const { groups } = groupFeeRecords(points);
  assert.deepEqual(groups.map((g) => g.anchorSlug), ["anchor-a", "anchor-b"]);
  assert.deepEqual(listObservedAnchors(points).map((a) => a.slug), ["anchor-a", "anchor-b"]);
  // Filtering by anchor restricts both grouping and rows.
  assert.deepEqual(groupFeeRecords(points, "anchor-b").groups.map((g) => g.anchorSlug), ["anchor-b"]);
  assert.equal(buildFeeSnapshotRows(points, "anchor-b")[0]?.rows.length, 1);
});

test("a zero fee string is recorded evidence, preserved exactly", () => {
  const points = [point(T1, [obs("anchor-a", "100.00", "0.0000000", T1)])];
  assert.deepEqual(readRecordedDecimal("0.0000000"), { status: "recorded", value: "0.0000000" });
  assert.equal(groupFeeRecords(points).groups[0]?.fee, "0.0000000");
  const html = render(history(points));
  assert.match(html, />0\.0000000</);
});

test("malformed or missing fees are unavailable, never zero, and are excluded from groups", () => {
  const malformed = { ...obs("anchor-a", "100.00", "0.50", T1), fee: "1,5" };
  const missing = { ...obs("anchor-a", "100.00", "0.50", T1), fee: undefined } as unknown as PublicRateHistoryObservation;
  const badAmount = { ...obs("anchor-a", "abc", "0.50", T1) };
  const points = [point(T1, [malformed, missing, badAmount])];

  assert.deepEqual(readRecordedDecimal("1,5"), { status: "unavailable", reason: "malformed" });
  assert.deepEqual(readRecordedDecimal(undefined), { status: "unavailable", reason: "missing" });
  assert.deepEqual(readRecordedDecimal(""), { status: "unavailable", reason: "missing" });

  const grouping = groupFeeRecords(points);
  assert.equal(grouping.groups.length, 0);
  assert.equal(grouping.ungroupedCount, 3);

  const html = render(history(points));
  assert.match(html, /Unavailable \(malformed value\)/);
  assert.match(html, /Unavailable \(not recorded\)/);
  assert.match(html, /data-testid="fee-groups-empty"/);
  assert.match(html, /3 of 3 observations have an unavailable/);
  assert.doesNotMatch(html, />0<\/span>/);
});

test("decimal strings are preserved without numeric reformatting", () => {
  const points = [point(T1, [obs("anchor-a", "100.1000000", "0.1234567890123456789", T1)])];
  const html = render(history(points));
  assert.match(html, /0\.1234567890123456789/);
  assert.match(html, /100\.1000000/);
  assert.doesNotMatch(libSource, /parseFloat|Number\(row|toFixed/);
});

test("supported windows are exactly 7, 30 and 90 days", () => {
  assert.deepEqual(HISTORICAL_FEE_WINDOWS.map((w) => w.days), [7, 30, 90]);
});

// --- rendering --------------------------------------------------------------

test("every row traces to an observation and shows its snapshot timestamp and provenance", () => {
  const points = [
    point(T1, [obs("anchor-a", "100.00", "0.50", "2026-11-17T00:01:00.000Z")]),
    point(T2, [obs("anchor-b", "250.00", "1.00", "2026-11-18T00:02:00.000Z")]),
  ];
  const html = render(history(points));
  assert.match(html, /<th scope="row"[^>]*><time dateTime="2026-11-17T00:00:00.000Z"/);
  assert.match(html, /<time dateTime="2026-11-18T00:02:00.000Z"/);
  assert.match(html, /href="\/anchors\/anchor-a"/);
  assert.match(html, /href="\/anchors\/anchor-b"/);
  assert.match(html, /Configured corridor \(reviewed registry\)/);
  assert.match(html, /Observed evidence below/);
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
});

test("null-median snapshots keep 'No published median' and empty snapshots stay visible", () => {
  const points = [point(T1, [obs("anchor-a", "100.00", "0.50", T1)], null), point(T2, [])];
  const html = render(history(points));
  assert.match(html, /No published median/);
  assert.match(html, /No observations were returned for this snapshot\./);
  assert.match(html, /<time dateTime="2026-11-18T00:00:00.000Z"/);
});

test("empty history is a missing-evidence status, distinct from a request failure", () => {
  const html = render(history([]));
  assert.match(html, /role="status" data-testid="fee-records-empty"/);
  assert.match(html, /missing evidence, not a request failure/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("anchor filter leaves snapshots without that anchor visibly empty", () => {
  const points = [point(T1, [obs("anchor-a", "100.00", "0.50", T1)])];
  const html = render(history(points), { anchor: "anchor-b" });
  assert.match(html, /No observations from anchor anchor-b in this snapshot\./);
  assert.match(html, /<option value="anchor-b" selected="">anchor-b<\/option>/);
});

test("stale fallback responses are labelled with generation and evaluation times", () => {
  const html = render(
    history([point(T1, [obs("anchor-a", "100.00", "0.50", T1)])], 30, {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    }),
  );
  assert.match(html, /data-testid="fee-records-stale"/);
  assert.match(html, /<time dateTime="2026-11-20T12:00:05.000Z"/);
  assert.match(html, /not a fresh read/);
});

test("initial request error is an operational alert and shows no fabricated records", () => {
  const html = render(null, { initialError: "Unable to read rate history." });
  assert.match(html, /role="alert" data-testid="fee-records-initial-error"/);
  assert.match(html, /Request failed: unable to load rate history \(Unable to read rate history\.\)/);
  assert.match(html, /operational error, not missing evidence/);
  assert.doesNotMatch(html, /fee-records-result/);
  assert.match(html, /Retry request/);
});

test("controls are labelled, keyboard reachable, and the selected window is pressed", () => {
  const html = render(history([point(T1, [obs("anchor-a", "100.00", "0.50", T1)])], 90), {
    initialDays: 90,
  });
  assert.match(html, /<label for="fee-records-corridor"/);
  assert.match(html, /<select id="fee-records-corridor"/);
  assert.match(html, /<label for="fee-records-anchor"/);
  assert.match(html, /<select id="fee-records-anchor"/);
  assert.match(html, /role="group" aria-labelledby="fee-records-window-label"/);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>90 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>7 days<\/button>/);
  assert.match(html, /role="region" aria-label="Grouped fee records table" tabindex="0"/);
  assert.match(html, /<h4 id="fee-groups-heading"/);
  assert.match(viewSource, /createRateHistoryLoader/);
  assert.match(viewSource, /rateHistoryPanelReducer/);
});

test("page uses only public read helpers and makes no ranking or conversion claims", () => {
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /id="main-content"/);
  assert.doesNotMatch(pageSource + viewSource + libSource, /prisma|\.create\(|\.update\(|\.delete\(/i);
  assert.doesNotMatch(viewSource, /cheapest|best fee|lowest fee/i);
});
