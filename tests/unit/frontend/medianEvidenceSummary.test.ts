import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MedianEvidenceSummaryView } from "@/app/insights/median-evidence-summary/MedianEvidenceSummaryView";
import {
  MEDIAN_SUMMARY_WINDOWS,
  classifyMedianSnapshot,
  formatEvidencePercent,
  summarizeMedianEvidence,
} from "@/lib/rates/rateHistoryEvidence";
import type { PublicCorridor } from "@/types/api/corridors";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/median-evidence-summary/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/median-evidence-summary/MedianEvidenceSummaryView.tsx", import.meta.url),
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

function point(
  timestamp: string,
  state: PublicRateHistoryPoint["state"],
  medianRate: string | null,
): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate,
    state,
    sourceCount: 3,
    freshSourceCount: state === "healthy" ? 3 : 1,
    observations: [],
  };
}

const published = (t: string) => point(t, "healthy", "5.2500000");
const unpublished = (t: string) => point(t, "insufficient_fresh_sources", null);

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
    createElement(MedianEvidenceSummaryView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays,
      initialHistory,
      initialError,
    }),
  ).replaceAll("<!-- -->", "");
}

// --- summary logic ---------------------------------------------------------

test("zero points: denominators are zero and no percentage is invented", () => {
  const summary = summarizeMedianEvidence([]);
  assert.equal(summary.total, 0);
  assert.deepEqual(summary.published, { count: 0, denominator: 0, percent: null });
  assert.equal(formatEvidencePercent(summary.published.percent), "—");
});

test("all null medians: every snapshot is unpublished", () => {
  const summary = summarizeMedianEvidence([
    unpublished("2026-11-18T00:00:00.000Z"),
    unpublished("2026-11-19T00:00:00.000Z"),
  ]);
  assert.deepEqual(summary.unpublished, { count: 2, denominator: 2, percent: 100 });
  assert.equal(summary.published.count, 0);
  assert.equal(summary.inconsistent.count, 0);
});

test("mixed states: counts and percentages share the returned-snapshot denominator", () => {
  const summary = summarizeMedianEvidence([
    published("2026-11-17T00:00:00.000Z"),
    published("2026-11-18T00:00:00.000Z"),
    unpublished("2026-11-19T00:00:00.000Z"),
  ]);
  assert.equal(summary.published.count, 2);
  assert.equal(summary.published.denominator, 3);
  assert.equal(formatEvidencePercent(summary.published.percent), "66.7%");
  assert.equal(formatEvidencePercent(summary.unpublished.percent), "33.3%");
});

test("conflicting state and median fields are inconsistent evidence, never a guessed median", () => {
  const cases: Array<[PublicRateHistoryPoint, string]> = [
    [point("2026-11-17T00:00:00.000Z", "healthy", null), "healthy_without_median"],
    [point("2026-11-18T00:00:00.000Z", "insufficient_fresh_sources", "5.1"), "insufficient_with_median"],
    [point("2026-11-19T00:00:00.000Z", "healthy", "abc"), "unparseable_median"],
    [
      { ...published("2026-11-20T00:00:00.000Z"), state: "unknown" as unknown as PublicRateHistoryPoint["state"] },
      "unknown_state",
    ],
  ];
  for (const [input, reason] of cases) {
    const classified = classifyMedianSnapshot(input, 0);
    assert.equal(classified.category, "inconsistent", reason);
    assert.equal(classified.inconsistency, reason);
    assert.equal(classified.medianRate, null, `${reason} must not surface a median`);
  }
  const summary = summarizeMedianEvidence(cases.map(([input]) => input));
  assert.deepEqual(summary.inconsistent, { count: 4, denominator: 4, percent: 100 });
});

test("supported windows are exactly 7, 30 and 90 days", () => {
  assert.deepEqual(MEDIAN_SUMMARY_WINDOWS.map((w) => w.days), [7, 30, 90]);
});

// --- view ------------------------------------------------------------------

test("renders an accessible summary list and simple table with denominators", () => {
  const html = render(
    history([
      published("2026-11-17T00:00:00.000Z"),
      published("2026-11-18T00:00:00.000Z"),
      unpublished("2026-11-19T00:00:00.000Z"),
    ]),
  );
  assert.match(html, /<dl data-testid="median-summary-counts" aria-label="Median evidence counts"/);
  assert.match(html, /2 of 3 returned snapshots \(66\.7%\)/);
  assert.match(html, /1 of 3 returned snapshots \(33\.3%\)/);
  assert.match(html, /<caption[^>]*>Returned snapshots by median evidence category \(3 total\)<\/caption>/);
  assert.match(html, /<th scope="col"[^>]*>Share of returned snapshots<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>Published median<\/th><td[^>]*>2 \/ 3<\/td><td[^>]*>66\.7%<\/td>/);
  assert.match(html, /not a\s+measure of elapsed-time availability/);
  assert.match(html, /not a firm quote or a transfer guarantee/);
});

test("zero points renders an honest empty state without proportions", () => {
  const html = render(history([]));
  assert.match(html, /data-testid="median-summary-empty"/);
  assert.match(html, /no\s+proportions are computed/);
  assert.doesNotMatch(html, /<table/);
});

test("all-null response reports zero published medians, not missing data", () => {
  const html = render(history([unpublished("2026-11-18T00:00:00.000Z"), unpublished("2026-11-19T00:00:00.000Z")]));
  assert.match(html, /0 of 2 returned snapshots \(0%\)/);
  assert.match(html, /2 of 2 returned snapshots \(100%\)/);
  assert.doesNotMatch(html, /median-summary-empty/);
});

test("inconsistent records are listed with their reason", () => {
  const html = render(history([point("2026-11-17T00:00:00.000Z", "healthy", null)]));
  assert.match(html, /data-testid="median-summary-inconsistent"/);
  assert.match(html, /State is healthy but no median was published/);
  assert.match(html, /no median is inferred for these/);
});

test("stale fallback responses are labelled with generation and evaluation times", () => {
  const html = render(
    history([published("2026-11-19T00:00:00.000Z")], 30, {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    }),
  );
  assert.match(html, /data-testid="median-summary-stale"/);
  assert.match(html, /<time dateTime="2026-11-20T12:00:05.000Z"/);
  assert.match(html, /not a fresh read/);
});

test("partial stale response with malformed metadata is labelled unverified", () => {
  const html = render(
    history([published("2026-11-19T00:00:00.000Z")], 30, { state: "stale" } as unknown as StaleEvidenceMetadata),
  );
  assert.match(html, /metadata is missing or malformed/);
});

test("initial request error shows an alert and no fabricated summary", () => {
  const html = render(null, "Unable to read rate history.");
  assert.match(html, /role="alert" data-testid="median-summary-initial-error"/);
  assert.match(html, /Unable to load rate history: Unable to read rate history\./);
  assert.match(html, /no history response\s+was loaded/);
  assert.doesNotMatch(html, /median-summary-result/);
  assert.match(html, /Retry request/);
});

test("changed window: the selected window is pressed and the summary labels its own window", () => {
  const html = render(history([published("2026-11-19T00:00:00.000Z")], 90), null, 90);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>90 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>7 days<\/button>/);
  assert.match(html, />90-day<\/span>/);
  // Window changes reuse the sequenced loader so stale responses cannot overwrite newer ones.
  assert.match(viewSource, /createRateHistoryLoader/);
  assert.match(viewSource, /rateHistoryPanelReducer/);
});

test("corridor selector is labelled and the page reads only public API helpers", () => {
  const html = render(history([]));
  assert.match(html, /<label for="median-summary-corridor"/);
  assert.match(html, /<select id="median-summary-corridor"/);
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /id="main-content"/);
  assert.doesNotMatch(pageSource + viewSource, /prisma|\.create\(|\.update\(|\.delete\(/i);
});
