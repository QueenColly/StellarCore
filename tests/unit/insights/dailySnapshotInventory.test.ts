import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { DailySnapshotInventoryView } from "@/app/insights/daily-snapshot-inventory/DailySnapshotInventoryView";
import {
  resolveInventoryWindowDays,
  selectReviewedCorridorSlug,
} from "@/app/insights/daily-snapshot-inventory/selection";
import {
  DAILY_SNAPSHOT_INVENTORY_WINDOWS,
  summarizeDailySnapshotInventory,
  utcDayKey,
} from "@/lib/rates/dailySnapshotInventory";
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
  new URL("../../../app/insights/daily-snapshot-inventory/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL(
    "../../../app/insights/daily-snapshot-inventory/DailySnapshotInventoryView.tsx",
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

const EVALUATED_AT = "2026-11-20T12:00:00.000Z";

function observation(capturedAt = "2026-11-19T09:58:00.000Z"): PublicRateHistoryObservation {
  return {
    anchor: { slug: "anchor-a", name: "Anchor Alpha" },
    rate: "5.2500000",
    sourceAmount: "100.00",
    destinationAmount: "525.00",
    fee: "0.50",
    capturedAt,
  };
}

function point(
  timestamp: string,
  observations: readonly PublicRateHistoryObservation[] = [observation()],
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
  windowDays = 7,
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
    evaluatedAt: EVALUATED_AT,
    windowDays,
    points,
  };
}

function summaryFor(points: readonly PublicRateHistoryPoint[], windowDays = 7) {
  return summarizeDailySnapshotInventory(history(points, windowDays));
}

function daySummary(summary: ReturnType<typeof summaryFor>, day: string) {
  const found = summary.days.find((entry) => entry.day === day);
  assert.ok(found, `expected a row for ${day}`);
  return found;
}

function render(
  initialHistory: PublicRateHistoryResponse | null,
  options: Readonly<{
    initialError?: string | null;
    initialDays?: number;
    initialDegraded?: StaleEvidenceMetadata;
  }> = {},
): string {
  return renderToStaticMarkup(
    createElement(DailySnapshotInventoryView, {
      corridors: CORRIDORS,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialDays: options.initialDays ?? 7,
      initialHistory,
      initialError: options.initialError ?? null,
      initialDegraded: options.initialDegraded,
    }),
  ).replaceAll("<!-- -->", "");
}

// --- pure grouping ---------------------------------------------------------

test("the offered windows are exactly 7, 30 and 90 days", () => {
  assert.deepEqual(
    DAILY_SNAPSHOT_INVENTORY_WINDOWS.map((window) => window.days),
    [7, 30, 90],
  );
});

test("the covered UTC days intersect the exact requested interval", () => {
  const summary = summaryFor([]);
  assert.ok(summary.window);
  assert.equal(summary.window.requestedStartUtc, "2026-11-13T12:00:00.000Z");
  assert.equal(summary.window.requestedEndUtc, EVALUATED_AT);
  assert.equal(summary.window.firstDay, "2026-11-13");
  assert.equal(summary.window.lastDay, "2026-11-20");
  // A 7-day interval that starts at noon touches eight UTC dates.
  assert.equal(summary.window.coveredDayCount, 8);
  assert.equal(summary.days.length, 8);
  assert.equal(summary.days[0].day, "2026-11-20");
  assert.equal(summary.days[7].day, "2026-11-13");
  assert.equal(summary.daysWithoutReturnedSnapshots, 8);
});

test("points on either side of UTC midnight belong to separate days", () => {
  const summary = summaryFor([
    point("2026-11-19T23:59:59.999Z"),
    point("2026-11-20T00:00:00.000Z"),
  ]);

  assert.equal(daySummary(summary, "2026-11-19").snapshotRecordCount, 1);
  assert.equal(daySummary(summary, "2026-11-20").snapshotRecordCount, 1);
  assert.equal(summary.daysWithReturnedSnapshots, 2);
});

test("a timezone-offset instant is assigned to its UTC calendar day", () => {
  // 2026-11-19T23:30:00-05:00 is 2026-11-20T04:30:00Z.
  const summary = summaryFor([point("2026-11-19T23:30:00.000-05:00")]);

  assert.equal(daySummary(summary, "2026-11-20").snapshotRecordCount, 1);
  assert.equal(daySummary(summary, "2026-11-19").snapshotRecordCount, 0);
  assert.equal(utcDayKey(Date.parse("2026-11-19T23:30:00.000-05:00")), "2026-11-20");
});

test("several snapshots on the same UTC day are counted individually", () => {
  const summary = summaryFor([
    point("2026-11-19T01:00:00.000Z"),
    point("2026-11-19T12:00:00.000Z"),
    point("2026-11-19T22:00:00.000Z"),
  ]);

  const day = daySummary(summary, "2026-11-19");
  assert.equal(day.snapshotRecordCount, 3);
  assert.equal(day.observationRecordCount, 3);
  assert.equal(day.duplicateTimestampRecordCount, 0);
});

test("duplicate snapshot timestamps remain separate records, not deduplicated", () => {
  const summary = summaryFor([
    point("2026-11-19T10:00:00.000Z"),
    point("2026-11-19T10:00:00.000Z"),
    point("2026-11-19T10:00:00.000Z"),
  ]);

  const day = daySummary(summary, "2026-11-19");
  assert.equal(day.snapshotRecordCount, 3);
  assert.equal(day.duplicateTimestampRecordCount, 2);
  assert.equal(summary.totalSnapshotRecords, 3);
  assert.equal(summary.assignedSnapshotRecords, 3);
  assert.equal(summary.duplicateTimestampRecordCount, 2);
});

test("an invalid timestamp is never assigned to a calendar day", () => {
  const summary = summaryFor([
    point("not-a-time", [observation(), observation()]),
    point("2026-11-19T10:00:00.000Z"),
  ]);

  assert.equal(daySummary(summary, "2026-11-19").snapshotRecordCount, 1);
  assert.equal(summary.unassignedSnapshotRecords, 1);
  assert.equal(summary.unassignedObservationRecords, 2);
  assert.equal(summary.assignedObservationRecords, 1);
  assert.equal(summary.totalObservationRecords, 3);
  assert.equal(
    summary.days.reduce((total, day) => total + day.snapshotRecordCount, 0),
    summary.assignedSnapshotRecords,
  );
});

test("a valid timestamp outside the exact requested interval is disclosed, not counted", () => {
  const summary = summaryFor([
    point("2026-11-13T11:59:59.999Z"),
    point("2026-11-13T12:00:00.000Z"),
    point("2026-11-20T12:00:00.001Z"),
  ]);

  assert.equal(summary.outsideWindowSnapshotRecords, 2);
  assert.equal(summary.outsideWindowObservationRecords, 2);
  assert.equal(daySummary(summary, "2026-11-13").snapshotRecordCount, 1);
  assert.equal(summary.assignedSnapshotRecords, 1);
});

test("null medians do not change the snapshot or observation counts", () => {
  const summary = summaryFor([
    point(
      "2026-11-19T10:00:00.000Z",
      [observation(), observation()],
      { medianRate: null, state: "insufficient_fresh_sources", freshSourceCount: 0 },
    ),
  ]);

  assert.equal(daySummary(summary, "2026-11-19").snapshotRecordCount, 1);
  assert.equal(daySummary(summary, "2026-11-19").observationRecordCount, 2);
  assert.equal(summary.snapshotsWithoutPublishedMedian, 1);
});

test("an unreadable observations list contributes no observation rows", () => {
  const partialPoint = {
    ...point("2026-11-19T10:00:00.000Z", []),
    observations: undefined as unknown as PublicRateHistoryPoint["observations"],
  };
  const summary = summaryFor([partialPoint]);

  assert.equal(daySummary(summary, "2026-11-19").snapshotRecordCount, 1);
  assert.equal(daySummary(summary, "2026-11-19").observationRecordCount, 0);
  assert.equal(summary.unreadableObservationArrayCount, 1);
  assert.equal(summary.totalObservationRecords, 0);
});

test("a zero-point window keeps every covered day with explicit zero evidence", () => {
  const summary = summaryFor([]);

  assert.equal(summary.totalSnapshotRecords, 0);
  assert.equal(summary.totalObservationRecords, 0);
  assert.equal(summary.daysWithReturnedSnapshots, 0);
  assert.equal(summary.daysWithoutReturnedSnapshots, 8);
  for (const day of summary.days) {
    assert.equal(day.snapshotRecordCount, 0);
    assert.equal(day.observationRecordCount, 0);
  }
});

test("daily counts always sum to the assigned returned records", () => {
  const summary = summaryFor([
    point("2026-11-18T10:00:00.000Z", [observation(), observation()]),
    point("2026-11-19T10:00:00.000Z", [observation(), observation(), observation()]),
    point("2026-11-19T10:00:00.000Z", [observation()]),
    point("2026-11-21T10:00:00.000Z", [observation()]),
  ]);

  assert.equal(
    summary.days.reduce((total, day) => total + day.snapshotRecordCount, 0),
    summary.assignedSnapshotRecords,
  );
  assert.equal(
    summary.days.reduce((total, day) => total + day.observationRecordCount, 0),
    summary.assignedObservationRecords,
  );
  assert.equal(summary.assignedSnapshotRecords, 3);
  assert.equal(summary.assignedObservationRecords, 6);
  assert.equal(summary.outsideWindowSnapshotRecords, 1);
  assert.equal(summary.totalObservationRecords, 7);
});

// --- selection -------------------------------------------------------------

test("only an exact slug from the reviewed directory reaches the history read", () => {
  assert.equal(selectReviewedCorridorSlug({}, CORRIDORS), CORRIDORS[0].slug);
  assert.equal(
    selectReviewedCorridorSlug({ corridor: "xlm-global-usdc-us" }, CORRIDORS),
    "xlm-global-usdc-us",
  );
  assert.equal(selectReviewedCorridorSlug({ corridor: "unknown" }, CORRIDORS), CORRIDORS[0].slug);

  for (const hostile of ["../internal", "x?y=1", "USDC-US-BRL-BR", "", 42, null]) {
    assert.equal(
      selectReviewedCorridorSlug({ corridor: hostile as string }, CORRIDORS),
      CORRIDORS[0].slug,
      String(hostile),
    );
  }
  assert.equal(
    selectReviewedCorridorSlug({ corridor: ["../internal", "xlm-global-usdc-us"] }, CORRIDORS),
    CORRIDORS[0].slug,
  );
  assert.equal(selectReviewedCorridorSlug({ corridor: "usdc-us-brl-br" }, []), "");
});

test("only the offered history windows are accepted", () => {
  assert.equal(resolveInventoryWindowDays("7"), 7);
  assert.equal(resolveInventoryWindowDays("30"), 30);
  assert.equal(resolveInventoryWindowDays("90"), 90);
  for (const rejected of ["1", "60", "-7", "7.5", "abc", "", undefined]) {
    assert.equal(resolveInventoryWindowDays(rejected), 30, String(rejected));
  }
});

// --- view ------------------------------------------------------------------

test("renders a semantic UTC table with totals and explicit no-snapshot wording", () => {
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z", [observation(), observation()]),
      point("2026-11-20T09:00:00.000Z", [observation()]),
    ]),
  );

  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Daily returned snapshot inventory for USDC \(US\) → BRL \(BR\)"/);
  assert.match(html, /aria-describedby="daily-snapshot-inventory-scroll-hint" tabindex="0"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<th scope="col"[^>]*>UTC calendar day<\/th>/);
  assert.match(html, /<th scope="row"[^>]*>.*2026-11-20/s);
  assert.match(html, /data-inventory-day="2026-11-20" data-inventory-snapshots="1"/);
  assert.match(html, /data-inventory-day="2026-11-19" data-inventory-snapshots="1"/);
  assert.match(html, /Total assigned to UTC days/);
  assert.match(html, /No returned snapshots — not downtime/);
  assert.match(html, /all days in\s+UTC/);
  assert.match(html, /2026-11-13 12:00:00 UTC/);
  assert.match(html, /2026-11-20 12:00:00 UTC/);
  assert.match(html, /intersects 8 UTC calendar days/);
});

test("duplicate timestamp records are visible in the day row and totals", () => {
  const html = render(
    history([
      point("2026-11-19T10:00:00.000Z"),
      point("2026-11-19T10:00:00.000Z"),
    ]),
  );

  assert.match(html, /data-inventory-day="2026-11-19" data-inventory-snapshots="2"/);
  assert.match(html, /Includes 1 duplicate-timestamp record\s+counted separately/);
  assert.match(html, /no stable snapshot identity/);
});

test("invalid timestamps are disclosed and never rendered as a calendar day", () => {
  const html = render(history([point("not-a-time", [observation(), observation()])]));

  assert.match(html, /data-testid="daily-snapshot-inventory-partial"/);
  assert.match(html, /had no interpretable timestamp/);
  assert.match(html, /not assigned to any calendar day/);
  assert.match(html, /Daily rows account for 0 of 1 returned snapshot records and 0 of 2 recorded observations/);
  assert.doesNotMatch(html, /data-inventory-day="not-a-time"/);
});

test("a zero-point window renders the day grid with explicit empty evidence", () => {
  const html = render(history([]));

  assert.match(html, /data-testid="daily-snapshot-inventory-empty"/);
  assert.match(html, /No snapshot records were returned for this 7-day window/);
  assert.doesNotMatch(html, /role="alert"/);
  assert.equal((html.match(/data-inventory-day=/g) ?? []).length, 8);
  assert.equal((html.match(/No returned snapshots — not downtime/g) ?? []).length, 8);
  assert.match(html, /Days without returned snapshots<\/dt><dd[^>]*>8<\/dd>/);
});

test("null median returns are still counted and explained", () => {
  const html = render(
    history([
      point(
        "2026-11-19T10:00:00.000Z",
        [observation()],
        { medianRate: null, state: "insufficient_fresh_sources", freshSourceCount: 0 },
      ),
    ]),
  );

  assert.match(html, /1 returned snapshot record\s+had no published median/);
  assert.match(html, /still counted because this inventory does not depend on a median/);
  assert.equal((html.match(/data-inventory-snapshots="1"/g) ?? []).length, 1);
});

test("a stale response is labelled as a persisted copy with its generation time", () => {
  const html = render(
    history([point("2026-11-19T10:00:00.000Z")], 7, {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    }),
  );

  assert.match(html, /data-evidence-state="stale"/);
  assert.match(html, /persisted last-known-good copy/);
  assert.match(html, /not a fresh read/);
  assert.match(html, /2026-11-20 12:00:05 UTC/);
  assert.match(html, /data-inventory-day="2026-11-19" data-inventory-snapshots="1"/);
});

test("a server-provided degraded result is labelled even when the body omits it", () => {
  const html = render(history([point("2026-11-19T10:00:00.000Z")]), {
    initialDegraded: {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [],
      snapshotAgeMs: 1000,
    },
  });

  assert.match(html, /data-testid="daily-snapshot-inventory-stale"/);
  assert.match(html, /persisted last-known-good copy/);
});

test("an initial failure shows an alert with no table or invented counts", () => {
  const html = render(null, { initialError: "Unable to read rate history." });

  assert.match(html, /role="alert" data-testid="daily-snapshot-inventory-initial-error"/);
  assert.match(html, /Unable to load rate history: Unable to read rate history\./);
  assert.match(html, /No daily\s+counts are shown/);
  assert.match(html, /Retry request/);
  assert.doesNotMatch(html, /<table|daily-snapshot-inventory-result/);
});

test("the selected window is pressed and the controls are labelled", () => {
  const html = render(history([point("2026-11-19T10:00:00.000Z")], 30), { initialDays: 30 });

  assert.match(html, /<label for="daily-snapshot-inventory-corridor"/);
  assert.match(html, /Inventory snapshot records from the 7 days history window/);
  assert.match(html, /<button type="button" aria-pressed="true"[^>]*>30 days<\/button>/);
  assert.match(html, /<button type="button" aria-pressed="false"[^>]*>90 days<\/button>/);
  assert.match(html, />30-day<\/span>/);
});

test("the page reads only existing public GET helpers and touches no persistence layer", () => {
  assert.match(pageSource, /await getCorridorsApiResult\(\)/);
  assert.match(pageSource, /await getRateHistoryApiResult\(selectedCorridorSlug, String\(days\)\)/);
  assert.match(pageSource, /selectReviewedCorridorSlug\(params, corridors\)/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /<nav aria-label="Breadcrumb"/);
  assert.doesNotMatch(
    pageSource + viewSource,
    /prisma|rateHistoryRepository|fetch\(|process\.env|\.create\(|\.update\(|\.delete\(/i,
  );
});

test("the view claims no downtime, uptime, rate, or missing-source inference", () => {
  const html = render(history([point("2026-11-19T10:00:00.000Z")]));

  assert.match(html, /It is not evidence of\s+downtime, an outage, missing sources, or zero activity/);
  assert.match(html, /No median, rate, operating\s+hours, uptime, or interpolation is derived/);
  assert.doesNotMatch(viewSource, /\b(parseFloat|BigInt|toFixed|Math\.)/);
});
