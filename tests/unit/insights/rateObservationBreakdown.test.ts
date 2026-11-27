import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RateObservationBreakdownView } from "@/app/insights/rate-observation-breakdown/RateObservationBreakdownView";
import {
  corridorOptionLabel,
  corridorPairLabel,
  selectReviewedCorridorSlug,
} from "@/app/insights/rate-observation-breakdown/selection";
import type { CorridorsApiResult } from "@/types/api/corridors";
import type { PublicCorridor } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import { exposeReactForClassicJsx, fixtureAsApiResult } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/rate-observation-breakdown/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/rate-observation-breakdown/RateObservationBreakdownView.tsx", import.meta.url),
  "utf8",
);

const corridorResult = fixtureAsApiResult<CorridorsApiResult>("corridors.list.success");
if (corridorResult.status !== 200) {
  throw new Error("corridors.list.success must be a successful canonical fixture");
}
const corridors: readonly PublicCorridor[] = corridorResult.body.corridors;
const selectedSlug = corridors.find(({ slug }) => slug === "usdc-us-brl-br")!.slug;

function ratesFixture(name: string): RatesApiResult {
  return fixtureAsApiResult<RatesApiResult>(name);
}

function render(
  ratesResult: RatesApiResult | null,
  options: Readonly<{ corridors?: readonly PublicCorridor[]; selectedCorridorSlug?: string }> = {},
): string {
  const availableCorridors = options.corridors ?? corridors;
  return renderToStaticMarkup(
    React.createElement(RateObservationBreakdownView, {
      corridors: availableCorridors,
      selectedCorridorSlug: options.selectedCorridorSlug ?? selectReviewedCorridorSlug({}, availableCorridors),
      ratesResult,
    }),
  );
}

function medianMarker(html: string): { state: string | undefined; text: string | undefined } {
  return {
    state: html.match(/data-breakdown-median="([^"]+)"/)?.[1],
    text: html.match(/data-breakdown-median="[^"]+"[^>]*>([^<]*)</)?.[1],
  };
}

test("the page reads only the existing public corridors and rates read models", () => {
  assert.match(pageSource, /await getCorridorsApiResult\(\)/);
  assert.match(pageSource, /await getRatesApiResult\(selectedCorridorSlug\)/);
  assert.match(pageSource, /selectReviewedCorridorSlug\(params, corridors\)/);
  assert.match(pageSource, /<RateObservationBreakdownView/);
  assert.doesNotMatch(pageSource, /\/api\/internal|fetch\(|process\.env/);
  assert.match(pageSource, /persisted indicative SEP-38 data, not executable prices, live offers, or firm quotes/);
  assert.match(pageSource, /never a transfer instruction/);
});

test("only an exact slug from the reviewed corridor directory reaches the rates read", () => {
  assert.equal(selectReviewedCorridorSlug({}, corridors), corridors[0].slug);
  assert.equal(selectReviewedCorridorSlug({ corridor: selectedSlug }, corridors), selectedSlug);
  assert.equal(selectReviewedCorridorSlug({ corridor: "unknown-corridor" }, corridors), corridors[0].slug);

  for (const hostile of ["../internal", "x?y=1", "USDC-US-BRL-BR", "", 42, null]) {
    assert.equal(
      selectReviewedCorridorSlug({ corridor: hostile as string }, corridors),
      corridors[0].slug,
      String(hostile),
    );
  }
  assert.equal(
    selectReviewedCorridorSlug({ corridor: ["../internal", selectedSlug] }, corridors),
    corridors[0].slug,
  );
  assert.equal(selectReviewedCorridorSlug({ corridor: [selectedSlug, "../internal"] }, corridors), selectedSlug);
  assert.equal(selectReviewedCorridorSlug({ corridor: selectedSlug }, []), "");

  assert.equal(corridorPairLabel(corridors[1]), "USDC (US) → BRL (BR)");
  assert.equal(corridorOptionLabel(corridors[1]), "USDC (US) → BRL (BR) [usdc-us-brl-br]");
});

test("healthy observations render every reported amount, fee, rate, anchor, and source timestamp", () => {
  const html = render(ratesFixture("rates.healthy.success"), { selectedCorridorSlug: selectedSlug });

  assert.match(html, /Source amount \(USDC\)/);
  assert.match(html, /Destination amount \(BRL\)/);
  assert.match(html, /Fee \(as reported\)/);
  assert.match(html, /100\.000000000000000000/);
  assert.match(html, /524\.000000000000000000/);
  assert.match(html, /526\.000000000000000000/);
  assert.match(html, /1\.000000000000000000/);
  assert.match(html, /1\.500000000000000000/);
  assert.match(html, /5\.240000000000000000/);
  assert.match(html, /5\.260000000000000000/);
  assert.equal(html.match(/data-observation-slug=/g)?.length, 2);
  assert.match(html, /data-observation-slug="cowrie"[^>]*data-captured-at="2026-08-28T11:59:50\.000Z"/);
  assert.match(html, /data-observation-slug="zeam"[^>]*data-captured-at="2026-08-28T11:59:45\.000Z"/);
  assert.match(html, /dateTime="2026-08-28T11:59:50\.000Z">2026-08-28 11:59:50 UTC/);
  assert.match(html, /dateTime="2026-08-28T11:59:45\.000Z">2026-08-28 11:59:45 UTC/);
  assert.match(html, /href="\/anchors\/cowrie"/);
  assert.match(html, /href="\/anchors\/zeam"/);
  assert.match(html, />Included</);

  assert.deepEqual(medianMarker(html), { state: "published", text: "5.250000000000000000" });
});

test("a null median and an excluded observation stay separate from the eligible row", () => {
  const html = render(ratesFixture("rates.insufficient.success"), { selectedCorridorSlug: selectedSlug });

  assert.deepEqual(medianMarker(html), { state: "null", text: "Not published" });
  assert.match(html, /No median is published: 1 of 2 required fresh independent sources are available\./);
  assert.match(html, /No individual row below is promoted to a median on this page\./);
  assert.doesNotMatch(html, /data-breakdown-median="published"/);

  assert.match(html, /data-observation-slug="cowrie"/);
  assert.match(html, /data-observation-slug="zeam"/);
  assert.match(html, /5\.240000000000000000/);
  assert.match(html, /5\.100000000000000000/);
  assert.match(html, /Excluded — stale/);
});

test("a legitimately empty observation set is not an API failure or a zero median", () => {
  const empty = render(ratesFixture("rates.empty.success"), { selectedCorridorSlug: selectedSlug });
  assert.match(empty, /data-breakdown-state="empty-observations"/);
  assert.match(empty, /No individual rate observations are currently persisted for this corridor\./);
  assert.doesNotMatch(empty, /role="alert"/);
  assert.doesNotMatch(empty, /<table/);
  assert.deepEqual(medianMarker(empty), { state: "null", text: "Not published" });
  assert.doesNotMatch(empty, /data-breakdown-median="published"/);
});

test("a failed rates read is an explicit unavailable state and shows no inferred values", () => {
  const failed = render(ratesFixture("rates.error_500"), { selectedCorridorSlug: selectedSlug });
  assert.match(failed, /role="alert"/);
  assert.match(failed, /data-breakdown-state="rates-unavailable"/);
  assert.match(failed, /Unable to load observations: Unable to read rates\./);
  assert.match(failed, /A failed read is not treated as absent evidence or as a zero value\./);
  assert.doesNotMatch(failed, /data-breakdown-state="observations"/);
  assert.doesNotMatch(failed, /No individual rate observations are currently persisted/);
  assert.doesNotMatch(failed, /<table/);
  assert.equal(medianMarker(failed).state, undefined);
});

test("no reviewed corridors is distinct from a failed corridors read", () => {
  const empty = render(null, { corridors: [] });
  assert.match(empty, /No reviewed corridors are currently available\./);
  assert.doesNotMatch(empty, /<select|role="alert"|<table/);
  assert.match(pageSource, /data-breakdown-state="corridors-unavailable"/);
  assert.match(pageSource, /Unable to load reviewed corridors:/);
});

test("fees keep the API's raw form without an invented denomination", () => {
  const html = render(ratesFixture("rates.healthy.success"), { selectedCorridorSlug: selectedSlug });
  assert.match(html, /Fee \(as reported\)/);
  assert.match(html, />1\.000000000000000000</);
  assert.match(html, />1\.500000000000000000</);
  assert.match(html, /the API does not provide a fee denomination, so no currency unit is added/);
  assert.doesNotMatch(html, /Fee \((USDC|BRL)\)|Fee denomination:|fee in (USDC|BRL)/);
});

test("selection and table stay keyboard accessible and responsive", () => {
  const html = render(ratesFixture("rates.healthy.success"), { selectedCorridorSlug: selectedSlug });

  assert.match(html, /<form[^>]*method="get"[^>]*action="\/insights\/rate-observation-breakdown"|<form[^>]*action="\/insights\/rate-observation-breakdown"[^>]*method="get"/);
  assert.match(html, /<label for="breakdown-corridor"/);
  assert.match(html, /<select id="breakdown-corridor"[^>]*name="corridor"/);
  assert.match(html, /value="usdc-us-brl-br" selected=""/);
  assert.match(html, /<button type="submit"/);
  assert.match(html, /Use the arrow keys to choose a reviewed corridor/);
  assert.match(html, /role="region" aria-label="Persisted rate observations for USDC \(US\) → BRL \(BR\)"/);
  assert.match(html, /aria-describedby="breakdown-scroll-hint" tabindex="0"/);
  assert.match(html, /use the left and right arrow keys to reveal every column/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<th scope="col"/);
  assert.match(html, /<th scope="row"/);
  assert.doesNotMatch(viewSource, /onKeyDown|onKeyUp|onKeyPress|tabIndex=\{-1\}/);
});

test("the view reports values as recorded rather than calculating a quote or rate", () => {
  const html = render(ratesFixture("rates.healthy.success"), { selectedCorridorSlug: selectedSlug });
  assert.match(html, /not executable prices, live offers, or firm quotes/);
  assert.match(html, /Source and destination amounts are recorded evidence, not a transfer instruction/);
  assert.doesNotMatch(viewSource, /\b(parseFloat|parseInt|Number|BigInt)\s*\(/);
  assert.doesNotMatch(viewSource, /\.toFixed\(|\*=|Math\./);
});

test("a degraded API response is labelled as a persisted snapshot, not current evidence", () => {
  const healthy = ratesFixture("rates.healthy.success");
  if (healthy.status !== 200) throw new Error("fixture must be successful");
  const degraded: RatesApiResult = {
    ...healthy,
    degraded: {
      state: "stale",
      generatedAt: "2026-08-28T11:58:00.000Z",
      expiresAt: "2026-08-28T12:03:00.000Z",
      sourceTimes: [],
      snapshotAgeMs: 120000,
    },
  };
  const html = render(degraded, { selectedCorridorSlug: selectedSlug });
  assert.match(html, /data-evidence-state="stale"/);
  assert.match(html, /persisted last-known-good snapshot because the current read was unavailable/);
});
