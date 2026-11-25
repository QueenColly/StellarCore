import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MedianExtremaView } from "@/app/insights/median-extrema/MedianExtremaView";
import {
  comparePositiveDecimals,
  parsePositiveDecimal,
  summarizeMedianExtrema,
} from "@/lib/rates/medianExtrema";
import type { PublicCorridor } from "@/types/api/corridors";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/median-extrema/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/median-extrema/MedianExtremaView.tsx", import.meta.url),
  "utf8",
);
const libSource = readFileSync(
  new URL("../../../lib/rates/medianExtrema.ts", import.meta.url),
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

function point(timestamp: string, medianRate: string | null): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate,
    state: medianRate === null ? "insufficient_fresh_sources" : "healthy",
    sourceCount: 3,
    freshSourceCount: medianRate === null ? 1 : 3,
    observations: [
      {
        anchor: { slug: "anchor-a", name: "Anchor A" },
        rate: "999.0",
        sourceAmount: "100",
        destinationAmount: "99900",
        fee: "0",
        capturedAt: timestamp,
      },
    ],
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
  initialError: string | null = null,
  initialDays = 30,
): string {
  return renderToStaticMarkup(
    createElement(MedianExtremaView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays,
      initialHistory,
      initialError,
    }),
  ).replaceAll("<!-- -->", "");
}

const T1 = "2026-11-17T00:00:00.000Z";
const T2 = "2026-11-18T00:00:00.000Z";
const T3 = "2026-11-19T00:00:00.000Z";
const T4 = "2026-11-20T00:00:00.000Z";

// --- logic -----------------------------------------------------------------

test("no snapshots: no extrema and nothing excluded", () => {
  const summary = summarizeMedianExtrema([]);
  assert.equal(summary.returned, 0);
  assert.equal(summary.included, 0);
  assert.equal(summary.excludedTotal, 0);
  assert.equal(summary.extrema, null);
});

test("all-null medians: no extrema, every snapshot counted as unpublished", () => {
  const summary = summarizeMedianExtrema([point(T1, null), point(T2, null)]);
  assert.equal(summary.extrema, null);
  assert.equal(summary.excluded.unpublished, 2);
  assert.equal(summary.excludedTotal, 2);
});

test("mixed valid/null: extrema come only from published medians, preserving strings", () => {
  const summary = summarizeMedianExtrema([
    point(T1, null),
    point(T2, "5.2500000"),
    point(T3, null),
    point(T4, "5.10"),
  ]);
  assert.equal(summary.included, 2);
  assert.equal(summary.excluded.unpublished, 2);
  const e = summary.extrema!;
  assert.equal(e.earliest.snapshot.medianRate, "5.2500000");
  assert.equal(e.earliest.snapshot.index, 1);
  assert.equal(e.latest.snapshot.medianRate, "5.10");
  assert.equal(e.latest.snapshot.index, 3);
  assert.equal(e.lowest.snapshot.medianRate, "5.10");
  assert.equal(e.highest.snapshot.medianRate, "5.2500000");
  // Never reuses underlying anchor quote values.
  assert.notEqual(e.highest.snapshot.medianRate, "999.0");
});

test("value ties resolve to the earliest timestamp, then returned order", () => {
  const summary = summarizeMedianExtrema([
    point(T3, "5.0"),
    point(T1, "5.00"),
    point(T2, "6"),
    point(T1, "5"),
    point(T4, "6.000"),
  ]);
  const e = summary.extrema!;
  // 5.0 / 5.00 / 5 tie: T1 wins, and of the two T1 snapshots index 1 comes first.
  assert.equal(e.lowest.snapshot.index, 1);
  assert.equal(e.lowest.snapshot.medianRate, "5.00");
  // 6 / 6.000 tie: T2 is earlier.
  assert.equal(e.highest.snapshot.index, 2);
  // Earliest timestamp tie (two at T1): first returned wins.
  assert.equal(e.earliest.snapshot.index, 1);
  assert.equal(e.latest.snapshot.index, 4);
});

test("latest timestamp tie resolves to the first returned snapshot", () => {
  const e = summarizeMedianExtrema([point(T4, "1"), point(T4, "2")]).extrema!;
  assert.equal(e.latest.snapshot.index, 0);
});

test("shuffled timestamps: earliest/latest follow time, not array order", () => {
  const e = summarizeMedianExtrema([
    point(T3, "3"),
    point(T1, "1"),
    point(T4, "4"),
    point(T2, "2"),
  ]).extrema!;
  assert.equal(e.earliest.snapshot.timestamp, T1);
  assert.equal(e.latest.snapshot.timestamp, T4);
  assert.equal(e.lowest.snapshot.medianRate, "1");
  assert.equal(e.highest.snapshot.medianRate, "4");
});

test("malformed decimals and invalid timestamps are excluded and counted, never repaired", () => {
  const malformed = ["abc", "", " 5", "5 ", "-5", "+5", "1e3", "0", "0.000", "NaN", "Infinity", "5.", ".5", "5,1"];
  const summary = summarizeMedianExtrema([
    ...malformed.map((m) => point(T1, m)),
    point("not-a-date", "5"),
    { ...point(T2, "5"), timestamp: undefined as unknown as string },
    { ...point(T2, "7"), state: "insufficient_fresh_sources" },
    point(T3, "2.5"),
  ]);
  assert.equal(summary.excluded.invalid_median, malformed.length);
  assert.equal(summary.excluded.invalid_timestamp, 2);
  assert.equal(summary.excluded.inconsistent_state, 1);
  assert.equal(summary.included, 1);
  assert.equal(summary.extrema!.highest.snapshot.medianRate, "2.5");
  assert.equal(summarizeMedianExtrema(null).returned, 0);
});

test("large precision numbers compare exactly, without floating-point loss", () => {
  const a = "1.00000000000000000000000000000001";
  const b = "1.00000000000000000000000000000002";
  const big = "123456789012345678901234567890.5";
  const bigger = "123456789012345678901234567891";
  assert.equal(Number(a), Number(b));
  const e = summarizeMedianExtrema([
    point(T1, b),
    point(T2, a),
    point(T3, bigger),
    point(T4, big),
  ]).extrema!;
  assert.equal(e.lowest.snapshot.medianRate, a);
  assert.equal(e.highest.snapshot.medianRate, bigger);
  assert.equal(comparePositiveDecimals(parsePositiveDecimal("007.10")!, parsePositiveDecimal("7.1")!), 0);
  assert.equal(comparePositiveDecimals(parsePositiveDecimal("0.09")!, parsePositiveDecimal("0.1")!), -1);
});

// --- view ------------------------------------------------------------------

test("renders accessible cards and table with original strings and snapshot references", () => {
  const html = render(history([point(T1, null), point(T2, "5.2500000"), point(T3, "4.90")]));
  assert.match(html, /<ul data-testid="median-extrema-cards" aria-label="Published median extrema"/);
  for (const kind of ["earliest", "latest", "lowest", "highest"]) {
    assert.match(html, new RegExp(`<article aria-labelledby="median-extrema-card-${kind}"`));
  }
  assert.match(html, /<h4 id="median-extrema-card-lowest"[^>]*>Lowest published median<\/h4><p[^>]*>4\.90<\/p>/);
  assert.match(html, /<h4 id="median-extrema-card-highest"[^>]*>Highest published median<\/h4><p[^>]*>5\.2500000<\/p>/);
  assert.match(html, /Snapshot #2 of 3 returned · 3 of 3 sources fresh/);
  assert.match(html, /<caption[^>]*>Published median extrema among 2 of 3 returned snapshots<\/caption>/);
  assert.match(html, /<th scope="row"[^>]*>Earliest published median<\/th><td[^>]*>5\.2500000<\/td>/);
  assert.match(html, /<th scope="col"[^>]*>Source snapshot<\/th>/);
  assert.match(html, /No published median \(null\): 1/);
  assert.match(html, /not market best prices and not a continuous high or low/);
  assert.match(html, /not\s+interpolated/);
});

test("empty history shows a distinct empty state", () => {
  const html = render(history([]));
  assert.match(html, /data-testid="median-extrema-empty"/);
  assert.doesNotMatch(html, /<table/);
  assert.doesNotMatch(html, /median-extrema-none-published/);
});

test("all-null history: snapshots returned but no published median, nothing filled in", () => {
  const html = render(history([point(T1, null), point(T2, null)]));
  assert.match(html, /data-testid="median-extrema-none-published"/);
  assert.match(html, /Unpublished\s+medians stay unpublished/);
  assert.match(html, /No published median \(null\): 2/);
  assert.doesNotMatch(html, /median-extrema-empty/);
  assert.doesNotMatch(html, /<table/);
});

test("stale fallback is labelled distinctly from errors", () => {
  const html = render(
    history([point(T3, "5")], 30, {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    }),
  );
  assert.match(html, /role="status" data-testid="median-extrema-stale"/);
  assert.match(html, /not a fresh read/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("request error shows an alert distinct from missing evidence", () => {
  const html = render(null, "Unable to read rate history.");
  assert.match(html, /role="alert" data-testid="median-extrema-initial-error"/);
  assert.match(html, /This is a request\s+failure, not missing evidence/);
  assert.doesNotMatch(html, /median-extrema-result/);
  assert.match(html, /Retry request/);
});

test("changed window: selected window is pressed and the result labels its own window", () => {
  const html = render(history([point(T3, "5")], 90), null, 90);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>90 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>7 days<\/button>/);
  assert.match(html, />90-day<\/span>/);
  assert.match(viewSource, /createRateHistoryLoader/);
  assert.match(viewSource, /rateHistoryPanelReducer/);
});

test("page uses read-only public API helpers and labels configuration", () => {
  const html = render(history([]));
  assert.match(html, /<label for="median-extrema-corridor"[^>]*>Reviewed corridor \(configuration\)<\/label>/);
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /<h1/);
  assert.doesNotMatch(pageSource + viewSource + libSource, /prisma|\.create\(|\.update\(|\.delete\(/i);
  assert.doesNotMatch(libSource, /parseFloat|Number\(point/);
});
