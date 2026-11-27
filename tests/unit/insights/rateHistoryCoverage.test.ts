import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRateHistoryPath,
  formatDuration,
  isSafeCorridorSlug,
  parseCorridorOptions,
  parseRateHistoryBody,
  readApiErrorMessage,
  summarizeRateHistoryCoverage,
  SUPPORTED_WINDOWS,
} from "@/app/insights/rate-history-coverage/coverage";
import { RateHistoryCoverageView } from "@/app/insights/rate-history-coverage/RateHistoryCoverageView";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

function readFixture(domain: string, name: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../../contracts/api/v1/fixtures/${domain}/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).body;
}

function render(state: Parameters<typeof RateHistoryCoverageView>[0]["state"]): string {
  return renderToStaticMarkup(React.createElement(RateHistoryCoverageView, { state }));
}

const clientSource = readFileSync(
  new URL("../../../app/insights/rate-history-coverage/RateHistoryCoverageClient.tsx", import.meta.url),
  "utf8",
);

test("corridor options come from /api/corridors and drop unsafe slugs", () => {
  const options = parseCorridorOptions(readFixture("corridors", "list-success"));
  assert.ok(options && options.length > 0);
  assert.ok(options.every((option) => isSafeCorridorSlug(option.slug)));

  const hostile = parseCorridorOptions({
    corridors: [
      {
        slug: "usdc-us-brl-br",
        sourceAsset: "USDC",
        sourceCountry: "US",
        destinationAsset: "BRL",
        destinationCountry: "BR",
      },
      { slug: "../internal" },
      { slug: "x?y=1" },
      { slug: 42 },
      { slug: "usdc-us-brl-br" }, // duplicate dropped
    ],
  });
  assert.deepEqual(hostile?.map(({ slug }) => slug), ["usdc-us-brl-br"]);
  assert.equal(hostile?.[0]?.label, "USDC (US) → BRL (BR)");
  assert.deepEqual(parseCorridorOptions(readFixture("corridors", "list-empty")), []);
  assert.equal(parseCorridorOptions({ error: {} }), null);
  assert.equal(parseCorridorOptions(null), null);
});

test("rate history path is built only for validated corridors and supported 7/30/90 windows", () => {
  const options = [{ slug: "usdc-us-brl-br", label: "USDC (US) → BRL (BR)" }];

  for (const days of SUPPORTED_WINDOWS) {
    assert.equal(
      buildRateHistoryPath("usdc-us-brl-br", days, options),
      `/api/rates/history?corridor=usdc-us-brl-br&days=${days}`,
    );
  }

  // Reject unsupported windows and unknown / hostile slugs
  for (const days of [0, 1, 14, 60, 365, -7, 100]) {
    assert.equal(buildRateHistoryPath("usdc-us-brl-br", days, options), null);
  }
  for (const slug of ["", "unknown", "../internal", "usdc-us-brl-br&x=1", "bad--slug"]) {
    assert.equal(buildRateHistoryPath(slug, 30, options), null);
  }
});

test("parses rate history responses safely and extracts points", () => {
  const rawBody = {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-19T12:00:00.000Z",
    windowDays: 30,
    points: [
      {
        timestamp: "2026-10-18T10:00:00.000Z",
        medianRate: "5.2500",
        state: "healthy",
        sourceCount: 3,
        freshSourceCount: 3,
      },
      {
        timestamp: "2026-10-19T10:00:00.000Z",
        medianRate: null,
        state: "insufficient_fresh_sources",
        sourceCount: 1,
        freshSourceCount: 1,
      },
      {
        timestamp: "not-a-valid-date", // malformed timestamp safely dropped
        medianRate: "5.3000",
        state: "healthy",
        sourceCount: 2,
        freshSourceCount: 2,
      },
    ],
  };

  const parsed = parseRateHistoryBody(rawBody);
  assert.ok(parsed);
  assert.equal(parsed.corridorSlug, "usdc-us-brl-br");
  assert.equal(parsed.corridorLabel, "USDC (US) → BRL (BR)");
  assert.equal(parsed.windowDays, 30);
  assert.equal(parsed.points.length, 2); // 2 valid, 1 malformed ignored
  assert.equal(parsed.points[0].medianRate, "5.2500");
  assert.equal(parsed.points[1].medianRate, null);
  assert.equal(parsed.stale, null);

  // Stale header parsing
  const staleFromHeader = parseRateHistoryBody(rawBody, "stale");
  assert.ok(staleFromHeader?.stale);

  // Stale body parsing
  const staleFromBody = parseRateHistoryBody({
    ...rawBody,
    degraded: { generatedAt: "2026-10-19T11:00:00.000Z" },
  });
  assert.equal(staleFromBody?.stale?.generatedAt, "2026-10-19T11:00:00.000Z");

  // Rejects invalid bodies
  assert.equal(parseRateHistoryBody(null), null);
  assert.equal(parseRateHistoryBody({ corridor: { slug: "" } }), null);
  assert.equal(parseRateHistoryBody({ ...rawBody, points: "not-an-array" }), null);
});

test("summarizes distinct UTC calendar dates and handles UTC timezone boundaries", () => {
  const history = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-20T12:00:00.000Z",
    windowDays: 7,
    points: [
      // Multiple points on the same UTC date
      { timestamp: "2026-10-18T01:00:00.000Z", medianRate: "5.20", state: "healthy" },
      { timestamp: "2026-10-18T14:30:00.000Z", medianRate: "5.21", state: "healthy" },
      // UTC boundary test: 23:59:59Z vs 00:00:01Z on next day
      { timestamp: "2026-10-18T23:59:59.000Z", medianRate: "5.22", state: "healthy" },
      { timestamp: "2026-10-19T00:00:01.000Z", medianRate: "5.23", state: "healthy" },
      // Later date
      { timestamp: "2026-10-20T12:00:00.000Z", medianRate: null, state: "insufficient_fresh_sources" },
    ],
  })!;

  const summary = summarizeRateHistoryCoverage(history);
  assert.equal(summary.totalPoints, 5);
  // Distinct UTC dates must be 3: 2026-10-18, 2026-10-19, 2026-10-20
  assert.deepEqual(summary.distinctUtcDates, [
    "2026-10-18",
    "2026-10-19",
    "2026-10-20",
  ]);
  assert.equal(summary.distinctUtcDateCount, 3);
  assert.equal(summary.pointsWithMedian, 4);
  assert.equal(summary.pointsWithoutMedian, 1);
  assert.equal(summary.healthyCount, 4);
  assert.equal(summary.insufficientSourcesCount, 1);
  assert.equal(summary.uptimePercentage, null);
});

test("identifies chronological gaps between consecutive returned observations", () => {
  const history = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-25T12:00:00.000Z",
    windowDays: 30,
    points: [
      // Day 1
      { timestamp: "2026-10-10T12:00:00.000Z", medianRate: "5.20", state: "healthy" },
      // Day 2 (24h later: exactly 24h, not > 24h threshold)
      { timestamp: "2026-10-11T12:00:00.000Z", medianRate: "5.21", state: "healthy" },
      // Day 5 (3 days later = 72h > 24h: gap detected)
      { timestamp: "2026-10-14T12:00:00.000Z", medianRate: "5.22", state: "healthy" },
      // Day 10 (6 days later = 144h > 24h: second gap)
      { timestamp: "2026-10-20T12:00:00.000Z", medianRate: null, state: "insufficient_fresh_sources" },
    ],
  })!;

  const summary = summarizeRateHistoryCoverage(history);
  assert.equal(summary.gaps.length, 2);

  // Gap 1: from 2026-10-11 to 2026-10-14 (3 days)
  const gap1 = summary.gaps[0];
  assert.equal(gap1.fromTimestamp, "2026-10-11T12:00:00.000Z");
  assert.equal(gap1.toTimestamp, "2026-10-14T12:00:00.000Z");
  assert.equal(gap1.durationMs, 3 * 86_400_000);
  assert.equal(gap1.durationFormatted, "3d");
  assert.equal(gap1.message, "No stored observation in the interval");
  assert.match(gap1.inferenceNote, /cannot be inferred/i);

  // Gap 2: from 2026-10-14 to 2026-10-20 (6 days)
  const gap2 = summary.gaps[1];
  assert.equal(gap2.fromTimestamp, "2026-10-14T12:00:00.000Z");
  assert.equal(gap2.toTimestamp, "2026-10-20T12:00:00.000Z");
  assert.equal(gap2.durationMs, 6 * 86_400_000);
  assert.equal(gap2.durationFormatted, "6d");
});

test("handles sparse windows, single observation, and unordered points safely", () => {
  // Empty points
  const emptyHistory = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-19T12:00:00.000Z",
    windowDays: 7,
    points: [],
  })!;
  const emptySummary = summarizeRateHistoryCoverage(emptyHistory);
  assert.equal(emptySummary.totalPoints, 0);
  assert.equal(emptySummary.distinctUtcDateCount, 0);
  assert.equal(emptySummary.gaps.length, 0);
  assert.equal(emptySummary.oldestPointTimestamp, null);
  assert.equal(emptySummary.newestPointTimestamp, null);

  // Single point (cannot have gaps between points)
  const singleHistory = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-19T12:00:00.000Z",
    windowDays: 7,
    points: [{ timestamp: "2026-10-18T10:00:00.000Z", medianRate: "5.25", state: "healthy" }],
  })!;
  const singleSummary = summarizeRateHistoryCoverage(singleHistory);
  assert.equal(singleSummary.totalPoints, 1);
  assert.equal(singleSummary.distinctUtcDateCount, 1);
  assert.equal(singleSummary.gaps.length, 0);

  // Unordered points: must sort chronologically before detecting gaps
  const unorderedHistory = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-19T12:00:00.000Z",
    windowDays: 30,
    points: [
      { timestamp: "2026-10-15T12:00:00.000Z", medianRate: "5.25", state: "healthy" },
      { timestamp: "2026-10-01T12:00:00.000Z", medianRate: "5.20", state: "healthy" }, // earlier
      { timestamp: "2026-10-02T12:00:00.000Z", medianRate: "5.21", state: "healthy" },
    ],
  })!;
  const unorderedSummary = summarizeRateHistoryCoverage(unorderedHistory);
  assert.equal(unorderedSummary.oldestPointTimestamp, "2026-10-01T12:00:00.000Z");
  assert.equal(unorderedSummary.newestPointTimestamp, "2026-10-15T12:00:00.000Z");
  assert.equal(unorderedSummary.gaps.length, 1);
  assert.equal(unorderedSummary.gaps[0].fromTimestamp, "2026-10-02T12:00:00.000Z");
  assert.equal(unorderedSummary.gaps[0].toTimestamp, "2026-10-15T12:00:00.000Z");
});

test("formatDuration formats days, hours, minutes accurately", () => {
  assert.equal(formatDuration(0), "< 1m");
  assert.equal(formatDuration(30_000), "< 1m");
  assert.equal(formatDuration(60_000), "1m");
  assert.equal(formatDuration(3600_000), "1h");
  assert.equal(formatDuration(3660_000), "1h 1m");
  assert.equal(formatDuration(86_400_000), "1d");
  assert.equal(formatDuration(90_000_000), "1d 1h");
  assert.equal(formatDuration(-1), "0s");
});

test("renders ready state truthful markup and never extrapolates an uptime percentage", () => {
  const history = parseRateHistoryBody({
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-10-20T12:00:00.000Z",
    windowDays: 30,
    points: [
      { timestamp: "2026-10-01T10:00:00.000Z", medianRate: "5.20", state: "healthy" },
      { timestamp: "2026-10-05T10:00:00.000Z", medianRate: null, state: "insufficient_fresh_sources" },
      { timestamp: "2026-10-06T10:00:00.000Z", medianRate: "5.25", state: "healthy" },
    ],
  })!;

  const html = render({ kind: "ready", history });

  // Summary counts
  assert.match(html, /data-coverage-metric="total-points"[\s\S]*?>3</);
  assert.match(html, /data-coverage-metric="published-medians"[\s\S]*?>2</);
  assert.match(html, /data-coverage-metric="null-medians"[\s\S]*?>1</);
  assert.match(html, /data-coverage-metric="distinct-dates"[\s\S]*?>3</);

  // Corridor label and window
  assert.match(html, /USDC \(US\) → BRL \(BR\)/);
  assert.match(html, /30-day lookback window/);

  // Uptime non-extrapolation disclosure
  assert.match(html, /data-testid="uptime-disclosure"/);
  assert.match(html, /Live-rate uptime is deliberately not extrapolated/);

  // Must NOT contain any fake uptime percentage like "99%", "66%", "uptime: "
  assert.doesNotMatch(html, /uptime:\s*\d+%/i);
  assert.doesNotMatch(html, />\d+(\.\d+)?%\s*(uptime)?</i);

  // Gap between Oct 1 and Oct 5
  assert.match(html, /data-testid="coverage-gaps"/);
  assert.match(html, /No stored observation in the interval/);
  assert.match(html, /4d/);

  // Distinct dates chips
  assert.match(html, /data-testid="observed-utc-dates"/);
  assert.match(html, />2026-10-01</);
  assert.match(html, />2026-10-05</);
  assert.match(html, />2026-10-06</);
});

test("renders degraded snapshot banner when evidence is stale", () => {
  const history = parseRateHistoryBody(
    {
      corridor: {
        slug: "usdc-us-brl-br",
        sourceAsset: "USDC",
        sourceCountry: "US",
        destinationAsset: "BRL",
        destinationCountry: "BR",
      },
      evaluatedAt: "2026-10-20T12:00:00.000Z",
      windowDays: 7,
      points: [{ timestamp: "2026-10-18T10:00:00.000Z", medianRate: "5.20", state: "healthy" }],
    },
    "stale",
  )!;

  const html = render({ kind: "ready", history });
  assert.match(html, /data-evidence-state="stale"/);
  assert.match(html, /Stale snapshot/);
  assert.match(html, /The live read failed; these historical records may not be current/);
});

test("renders idle, loading, and error states gracefully", () => {
  const idleHtml = render({ kind: "idle" });
  assert.match(idleHtml, /Select a corridor/);

  const loadingHtml = render({ kind: "loading" });
  assert.match(loadingHtml, /rate-history coverage/);

  const errorHtml = render({
    kind: "error",
    message: "Corridor rate history could not be found.",
  });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /data-evidence-state="unavailable"/);
  assert.match(errorHtml, /Corridor rate history could not be found/);
});

test("client component fetches on explicit user interaction only with no background polling", () => {
  assert.doesNotMatch(clientSource, /setInterval/);
  assert.doesNotMatch(clientSource, /setTimeout/);
  assert.match(clientSource, /handleCorridorChange/);
  assert.match(clientSource, /handleWindowChange/);
});
