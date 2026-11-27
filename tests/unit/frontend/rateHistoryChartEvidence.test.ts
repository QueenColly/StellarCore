import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CorridorRateHistoryChart } from "@/components/corridors/CorridorRateHistoryChart";
import {
  classifyHistoryPoints,
  describeStaleFallback,
} from "@/lib/rates/rateHistoryEvidence";
import {
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const chartSource = readFileSync(
  new URL("../../../components/corridors/CorridorRateHistoryChart.tsx", import.meta.url),
  "utf8",
);

function point(overrides: Partial<PublicRateHistoryPoint> = {}): PublicRateHistoryPoint {
  return {
    timestamp: "2026-11-19T10:00:00.000Z",
    medianRate: "5.2500000",
    state: "healthy",
    sourceCount: 3,
    freshSourceCount: 3,
    observations: [
      {
        anchor: { slug: "anchor-a", name: "Anchor Alpha" },
        rate: "5.2400000",
        sourceAmount: "100",
        destinationAmount: "524",
        fee: "0.5",
        capturedAt: "2026-11-19T09:59:00.000Z",
      },
    ],
    ...overrides,
  };
}

function unpublished(timestamp: string): PublicRateHistoryPoint {
  return point({
    timestamp,
    medianRate: null,
    state: "insufficient_fresh_sources",
    sourceCount: 1,
    freshSourceCount: 1,
  });
}

function history(
  points: readonly PublicRateHistoryPoint[],
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
    windowDays: 30,
    points,
  };
}

const STALE: StaleEvidenceMetadata = {
  state: "stale",
  generatedAt: "2026-11-20T12:00:05.000Z",
  expiresAt: "2026-11-21T12:00:05.000Z",
  sourceTimes: ["2026-11-19T09:59:00.000Z", "2026-11-20T11:58:00.000Z"],
  snapshotAgeMs: 3 * 60 * 60 * 1000,
};

function render(value: PublicRateHistoryResponse): string {
  return renderToStaticMarkup(
    createElement(CorridorRateHistoryChart, {
      corridorSlug: "usdc-us-brl-br",
      initialHistory: value,
    }),
  ).replaceAll("<!-- -->", "");
}

// --- #697: empty versus unpublished-median presentation -------------------

test("zero points: says no snapshots were returned and draws no chart", () => {
  const html = render(history([]));
  assert.match(html, /data-testid="rate-history-no-snapshots"/);
  assert.match(html, /role="status"/);
  assert.match(html, /No historical rate snapshots were returned for the 30-day window\./);
  assert.doesNotMatch(html, /<svg/);
  assert.doesNotMatch(html, /rate-history-no-published-median/);
});

test("three points with null medians: shows stored count, requirement and observations", () => {
  const html = render(
    history([
      unpublished("2026-11-17T10:00:00.000Z"),
      unpublished("2026-11-18T10:00:00.000Z"),
      unpublished("2026-11-19T10:00:00.000Z"),
    ]),
  );
  assert.match(html, /data-testid="rate-history-no-published-median"/);
  assert.match(html, /3 stored snapshots in the 30-day window/);
  assert.match(html, /none has a published\s+median rate to plot/);
  assert.match(html, /fresh, independent\s+anchor sources/);
  assert.doesNotMatch(html, /No historical rate snapshots/);
  assert.doesNotMatch(html, /<svg/);
  // Recorded observations stay visible in an open, keyboard-operable disclosure.
  assert.match(html, /<details open="" data-testid="rate-history-unplotted-snapshots"/);
  assert.match(html, /<summary[^>]*focus-visible:outline-2/);
  assert.equal(html.match(/Anchor Alpha \(5\.2400000\)/g)?.length, 3);
  assert.equal(html.match(/<time dateTime="2026-11-1[789]T10:00:00.000Z"/g)?.length, 3);
  assert.match(html, /Not published/);
});

test("mixed null and non-null medians: plots published points and lists the rest", () => {
  const html = render(
    history([
      point({ timestamp: "2026-11-17T10:00:00.000Z" }),
      unpublished("2026-11-18T10:00:00.000Z"),
      point({ timestamp: "2026-11-19T10:00:00.000Z", medianRate: "5.3000000" }),
    ]),
  );
  assert.match(html, /<svg/);
  assert.equal(html.match(/tabindex="0"/gi)?.length, 2, "only published medians are focusable plot points");
  assert.match(html, /1 stored snapshot not plotted \(no published median\)/);
  assert.match(html, /<details data-testid="rate-history-unplotted-snapshots"/);
  assert.doesNotMatch(html, /rate-history-no-published-median|rate-history-no-snapshots/);
});

test("invalid median data is never plotted and is labelled as unreadable", () => {
  const points = [
    point({ timestamp: "2026-11-18T10:00:00.000Z", medianRate: "not-a-number" }),
    point({ timestamp: "2026-11-19T10:00:00.000Z", medianRate: "Infinity" }),
  ];
  const classification = classifyHistoryPoints(points);
  assert.equal(classification.presentation, "no_published_median");
  assert.equal(classification.invalidCount, 2);
  assert.equal(classification.unpublishedCount, 0);

  const html = render(history(points));
  assert.match(html, /2 carried median data that could not be read as a rate/);
  assert.equal(html.match(/Unreadable median value/g)?.length, 2);
  assert.doesNotMatch(html, /<svg/);
});

test("classification keeps original indices and distinguishes the three presentations", () => {
  assert.equal(classifyHistoryPoints([]).presentation, "no_snapshots");
  const mixed = classifyHistoryPoints([unpublished("2026-11-18T10:00:00.000Z"), point()]);
  assert.equal(mixed.presentation, "plotted");
  assert.deepEqual(mixed.unplottedIndices, [0]);
  assert.equal(mixed.plottable[0]?.originalIndex, 1);
});

// --- #699: stale fallback disclosure ---------------------------------------

test("fresh 200: no stale notice", () => {
  const html = render(history([point()]));
  assert.doesNotMatch(html, /rate-history-stale-fallback/);
  assert.equal(describeStaleFallback(history([point()])).kind, "fresh");
});

test("stale 200: semantic notice with original evaluation, generation and capture times", () => {
  const html = render(history([point()], STALE));
  assert.match(html, /role="status" aria-labelledby="rate-history-stale-heading" data-testid="rate-history-stale-fallback" data-stale-kind="stale"/);
  assert.match(html, /Stale fallback: showing a previously saved 30-day history/);
  assert.match(html, /Originally evaluated: <\/dt><dd[^>]*><time dateTime="2026-11-20T12:00:00.000Z"/);
  assert.match(html, /Fallback copy generated: <\/dt><dd[^>]*><time dateTime="2026-11-20T12:00:05.000Z"/);
  assert.match(html, /Latest source capture: <\/dt><dd[^>]*><time dateTime="2026-11-20T11:58:00.000Z"/);
  assert.match(html, /Age when served: <\/dt><dd[^>]*>3 hours/);
  assert.match(html, /not your\s+current viewing time/);
  // A stale fallback is not a failed fetch.
  assert.doesNotMatch(html, /role="alert"/);
});

test("stale 200 with null medians: shows both the stale notice and the unpublished-median state", () => {
  const html = render(history([unpublished("2026-11-19T10:00:00.000Z")], STALE));
  assert.match(html, /data-testid="rate-history-stale-fallback"/);
  assert.match(html, /data-testid="rate-history-no-published-median"/);
  assert.doesNotMatch(html, /rate-history-no-snapshots/);
});

test("stale 200 with zero points: stale notice and no-snapshots state are distinct", () => {
  const html = render(history([], STALE));
  assert.match(html, /data-testid="rate-history-stale-fallback"/);
  assert.match(html, /data-testid="rate-history-no-snapshots"/);
});

test("invalid or incomplete metadata: unverified stale notice, no invented times", () => {
  const malformed = { state: "stale", generatedAt: "not-a-date" } as unknown as StaleEvidenceMetadata;
  assert.equal(describeStaleFallback({ degraded: malformed }).kind, "stale_unverified");
  assert.equal(
    describeStaleFallback({ degraded: { ...STALE, state: "other" } as unknown as StaleEvidenceMetadata }).kind,
    "stale_unverified",
  );

  const html = render(history([point()], malformed));
  assert.match(html, /data-stale-kind="stale_unverified"/);
  assert.match(html, /metadata is missing or malformed/);
  assert.doesNotMatch(html, /Fallback copy generated/);
});

test("partially valid metadata drops only the unreadable fields", () => {
  const partial = describeStaleFallback({
    degraded: {
      ...STALE,
      expiresAt: "bad",
      sourceTimes: ["bad"],
      snapshotAgeMs: -5,
    },
  });
  assert.deepEqual(partial, {
    kind: "stale",
    generatedAt: STALE.generatedAt,
    expiresAt: null,
    latestSourceCapturedAt: null,
    snapshotAgeMs: null,
  });
});

test("failed refresh retains the prior stale response so the notice stays visible", () => {
  const stale = history([point()], STALE);
  let state = initialRateHistoryPanelState(stale);
  state = rateHistoryPanelReducer(state, { type: "refresh_started", days: 7 });
  state = rateHistoryPanelReducer(state, {
    type: "refresh_failed",
    message: "Unable to load rate history.",
    days: 7,
    failedAt: "2026-11-20T13:00:00.000Z",
  });
  assert.equal(state.displayed, stale);
  assert.equal(describeStaleFallback(state.displayed).kind, "stale");

  // The notice is derived from the displayed (retained) response, independently of `failure`.
  assert.match(chartSource, /const staleFallback = describeStaleFallback\(history\);/);
  assert.match(chartSource, /const \{ displayed: history, selectedDays, loading, failure \} = panel;/);
  assert.match(chartSource, /<StaleFallbackNotice\s+disclosure=\{staleFallback\}/);
});
