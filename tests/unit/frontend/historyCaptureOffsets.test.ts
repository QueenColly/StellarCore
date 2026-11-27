import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CaptureOffsetsView,
  MAX_OFFSET_ROWS,
} from "@/app/insights/history-capture-offsets/CaptureOffsetsView";
import {
  formatOffsetMs,
  parseZonedInstant,
  summarizeCaptureOffsets,
} from "@/lib/rates/captureOffsets";
import {
  rateHistoryPanelReducer,
  type RateHistoryPanelState,
} from "@/lib/rates/rateHistoryPanelState";
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
  new URL("../../../app/insights/history-capture-offsets/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/history-capture-offsets/CaptureOffsetsView.tsx", import.meta.url),
  "utf8",
);
const libSource = readFileSync(
  new URL("../../../lib/rates/captureOffsets.ts", import.meta.url),
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

const P = "2026-11-18T12:00:00.000Z";

function obs(capturedAt: string, slug = "anchor-a"): PublicRateHistoryObservation {
  return {
    anchor: { slug, name: slug === "anchor-a" ? "Anchor A" : "Anchor B" },
    rate: "5.25",
    sourceAmount: "100",
    destinationAmount: "525",
    fee: "0",
    capturedAt,
  };
}

function point(
  timestamp: string,
  observations: readonly PublicRateHistoryObservation[],
  medianRate: string | null = "5.25",
  sourceCount = observations.length,
): PublicRateHistoryPoint {
  return {
    timestamp,
    medianRate,
    state: medianRate === null ? "insufficient_fresh_sources" : "healthy",
    sourceCount,
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
  initialError: string | null = null,
  initialDays = 30,
): string {
  return renderToStaticMarkup(
    createElement(CaptureOffsetsView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays,
      initialHistory,
      initialError,
    }),
  ).replaceAll("<!-- -->", "");
}

// --- logic -----------------------------------------------------------------

test("equal timestamps produce a zero offset", () => {
  const s = summarizeCaptureOffsets([point(P, [obs(P)])]);
  assert.equal(s.entries[0].offsetMs, 0);
  assert.equal(s.entries[0].relation, "equal");
  assert.equal(s.equal, 1);
  assert.equal(formatOffsetMs(0), "0 ms");
});

test("observation before and after the point are signed, never clamped", () => {
  const s = summarizeCaptureOffsets([
    point(P, [obs("2026-11-18T11:59:58.500Z"), obs("2026-11-18T12:00:03.000Z", "anchor-b")]),
  ]);
  assert.equal(s.entries[0].offsetMs, -1500);
  assert.equal(s.entries[0].relation, "capture_before_point");
  assert.equal(s.entries[1].offsetMs, 3000);
  assert.equal(s.entries[1].relation, "capture_after_point");
  assert.equal(s.captureBeforePoint, 1);
  assert.equal(s.captureAfterPoint, 1);
  assert.equal(formatOffsetMs(-1500), "−1,500 ms");
  assert.equal(formatOffsetMs(3000), "+3,000 ms");
});

test("timezone-offset strings for the same instant compare equal and keep raw strings", () => {
  const s = summarizeCaptureOffsets([point(P, [obs("2026-11-18T13:00:00+01:00")])]);
  assert.equal(s.entries[0].offsetMs, 0);
  assert.equal(s.entries[0].capturedAt, "2026-11-18T13:00:00+01:00");
  assert.equal(s.entries[0].capturedAtUtc, P);
});

test("invalid dates are unavailable, never Invalid Date or a guessed zone", () => {
  for (const bad of ["not-a-date", "", "2026-11-18 12:00:00", "2026-11-18T12:00:00", "2026-13-40T99:00:00Z"]) {
    assert.equal(parseZonedInstant(bad), null, bad);
  }
  const s = summarizeCaptureOffsets([
    point(P, [obs("garbage"), { ...obs(P), capturedAt: undefined as unknown as string }]),
    point("bad-point", [obs(P), obs("also-bad")]),
  ]);
  assert.deepEqual(
    s.entries.map((e) => e.unavailable),
    ["invalid_capture_timestamp", "invalid_capture_timestamp", "invalid_point_timestamp", "both_invalid"],
  );
  assert.equal(s.valid, 0);
  assert.equal(s.missingOrInvalid, 4);
  assert.ok(s.entries.every((e) => e.offsetMs === null && e.relation === null));
});

test("empty snapshots, incomplete snapshots and null medians are disclosed, not filled", () => {
  const s = summarizeCaptureOffsets([
    point(P, [], null, 2),
    point("2026-11-18T13:00:00.000Z", [obs("2026-11-18T13:00:01.000Z")], null, 3),
  ]);
  assert.equal(s.points, 2);
  assert.equal(s.emptyPoints, 1);
  assert.equal(s.incompletePoints, 2);
  assert.equal(s.nullMedianPoints, 2);
  assert.equal(s.observations, 1);
  assert.equal(s.entries[0].pointMedianPublished, false);
  assert.equal(summarizeCaptureOffsets(null).points, 0);
});

test("changing windows replaces the displayed response wholesale, never mixing", () => {
  const first = history([point(P, [obs(P)])], 7);
  const second = history([point("2026-10-01T00:00:00.000Z", [obs("2026-10-01T00:00:05.000Z")])], 90);
  let state: RateHistoryPanelState = { displayed: first, selectedDays: 7, loading: false, failure: null };
  state = rateHistoryPanelReducer(state, { type: "refresh_started", days: 90 });
  state = rateHistoryPanelReducer(state, { type: "refresh_succeeded", history: second });
  const s = summarizeCaptureOffsets(state.displayed.points);
  assert.equal(state.displayed.windowDays, 90);
  assert.deepEqual(s.entries.map((e) => e.offsetMs), [5000]);
  assert.match(viewSource, /createRateHistoryLoader/);
});

// --- view ------------------------------------------------------------------

test("renders an accessible, responsive table with labelled timestamps", () => {
  const html = render(
    history([point(P, [obs("2026-11-18T11:59:58.500Z"), obs("2026-11-18T13:00:03+01:00", "anchor-b")])]),
  );
  assert.match(html, /<div class="mt-5 overflow-x-auto" tabindex="0" aria-label="Capture offsets table, scrollable">/);
  assert.match(html, /<caption[^>]*>Signed offset = observation capture time − point snapshot time \(2 observations\)<\/caption>/);
  assert.match(html, /<th scope="col"[^>]*>Point snapshot time<\/th>/);
  assert.match(html, /<th scope="col"[^>]*>Observation capture time<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>Anchor A<span[^>]*>Snapshot #1<\/span><\/th>/);
  assert.match(html, /−1,500 ms/);
  assert.match(html, /\+3,000 ms/);
  assert.match(html, /<time dateTime="2026-11-18T12:00:03.000Z"[^>]*>2026-11-18T13:00:03\+01:00<\/time>/);
  assert.match(html, /UTC 2026-11-18T12:00:03.000Z/);
  assert.match(html, /<dl data-testid="capture-offsets-counts" aria-label="Observed capture offset counts"/);
  assert.match(html, /not transport latency,\s+ingest delay, clock failure, uptime or pricing quality/);
  assert.match(html, /<label for="capture-offsets-corridor"[^>]*>Reviewed corridor \(configuration\)<\/label>/);
});

test("malformed timestamps render as Unavailable, never Invalid Date", () => {
  const html = render(history([point("bad-point", [obs("garbage")])]));
  assert.match(html, /Unavailable<span[^>]*>raw: garbage<\/span>/);
  assert.match(html, /Both timestamps missing or invalid/);
  assert.doesNotMatch(html, /Invalid Date|NaN/);
});

test("empty history and snapshots without observations render distinct states", () => {
  const empty = render(history([]));
  assert.match(empty, /data-testid="capture-offsets-empty"/);
  assert.doesNotMatch(empty, /<table/);

  const noObs = render(history([point(P, [], null, 2)]));
  assert.match(noObs, /data-testid="capture-offsets-no-observations"/);
  assert.match(noObs, /Incomplete evidence: 1 snapshot\(s\)/);
  assert.match(noObs, /no published median; their\s+observations are still listed/);
});

test("large responses disclose truncation instead of silently dropping rows", () => {
  const many = Array.from({ length: MAX_OFFSET_ROWS + 5 }, (_, i) =>
    point(new Date(Date.parse(P) + i * 60_000).toISOString(), [obs(P)]),
  );
  const html = render(history(many));
  assert.match(html, new RegExp(`showing first ${MAX_OFFSET_ROWS} of ${MAX_OFFSET_ROWS + 5} observations`));
});

test("stale fallback is a status, distinct from request failure", () => {
  const html = render(
    history([point(P, [obs(P)])], 30, {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    }),
  );
  assert.match(html, /role="status" data-testid="capture-offsets-stale"/);
  assert.match(html, /not a fresh read/);
  assert.doesNotMatch(html, /role="alert"/);

  const unverified = render(history([point(P, [obs(P)])], 30, { state: "stale" } as unknown as StaleEvidenceMetadata));
  assert.match(unverified, /metadata is missing or malformed/);
});

test("request failure shows an alert and no fabricated offsets", () => {
  const html = render(null, "Unable to read rate history.");
  assert.match(html, /role="alert" data-testid="capture-offsets-initial-error"/);
  assert.match(html, /This is a request\s+failure, not missing evidence/);
  assert.doesNotMatch(html, /capture-offsets-result/);
});

test("changed window is pressed and the result labels its own window", () => {
  const html = render(history([point(P, [obs(P)])], 90), null, 90);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>90 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>7 days<\/button>/);
  assert.match(html, />90-day<\/span>/);
});

test("page reads only public API helpers and never clamps offsets", () => {
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /id="main-content"/);
  assert.doesNotMatch(pageSource + viewSource + libSource, /prisma|\.create\(|\.update\(|\.delete\(/i);
  assert.doesNotMatch(libSource, /Math\.max\(\s*0/);
});
