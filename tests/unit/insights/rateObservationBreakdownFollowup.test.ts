import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RateObservationBreakdownView } from "@/app/insights/rate-observation-breakdown/RateObservationBreakdownView";
import type { CorridorsApiResult, PublicCorridor } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import { exposeReactForClassicJsx, fixtureAsApiResult } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/rate-observation-breakdown/page.tsx", import.meta.url),
  "utf8",
);

const corridorResult = fixtureAsApiResult<CorridorsApiResult>("corridors.list.success");
if (corridorResult.status !== 200) {
  throw new Error("corridors.list.success must be a successful canonical fixture");
}
const corridors: readonly PublicCorridor[] = corridorResult.body.corridors;
const selectedCorridorSlug = corridors.find(({ slug }) => slug === "usdc-us-brl-br")!.slug;

function healthyRates(): RatesApiResult {
  return fixtureAsApiResult<RatesApiResult>("rates.healthy.success");
}

function render(ratesResult: RatesApiResult): string {
  return renderToStaticMarkup(
    React.createElement(RateObservationBreakdownView, {
      corridors,
      selectedCorridorSlug,
      ratesResult,
    }),
  );
}

test("captured values are labelled as source timestamps and results are announced", () => {
  const html = render(healthyRates());
  assert.match(html, /<th scope="col"[^>]*>Captured \(source timestamp\)<\/th>/);
  assert.match(pageSource, /aria-label="Observation evidence" aria-live="polite"/);
});

test("empty raw observation fields are reported as absent, never as zero", () => {
  const rates = healthyRates();
  if (rates.status !== 200) throw new Error("healthy fixture must be a successful rates response");
  const patched: RatesApiResult = {
    ...rates,
    body: {
      ...rates.body,
      observations: [
        {
          ...rates.body.observations[0],
          sourceAmount: "",
          destinationAmount: "",
          fee: "",
          rate: "",
        },
        rates.body.observations[1],
      ],
    },
  };
  const html = render(patched);
  assert.equal(html.match(/Not reported/g)?.length, 4);
  assert.doesNotMatch(html, />0</);
  assert.match(html, /data-observation-slug="cowrie"[^>]*data-captured-at="2026-08-28T11:59:50\.000Z"/);
});

test("multiple observations keep distinct anchor identity and provenance timestamps", () => {
  const html = render(healthyRates());
  assert.match(html, /data-observation-slug="cowrie"[^>]*data-captured-at="2026-08-28T11:59:50\.000Z"/);
  assert.match(html, /data-observation-slug="zeam"[^>]*data-captured-at="2026-08-28T11:59:45\.000Z"/);
  assert.match(html, /dateTime="2026-08-28T11:59:50\.000Z">2026-08-28 11:59:50 UTC/);
  assert.match(html, /dateTime="2026-08-28T11:59:45\.000Z">2026-08-28 11:59:45 UTC/);
});

test("the fee stays verbatim with no invented denomination", () => {
  const html = render(healthyRates());
  assert.match(html, /Fee \(as reported\)/);
  assert.match(html, />1\.000000000000000000</);
  assert.match(html, />1\.500000000000000000</);
  assert.match(html, /the API does not provide a fee denomination, so no currency unit is added/);
});
