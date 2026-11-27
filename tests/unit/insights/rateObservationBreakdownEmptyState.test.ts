import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RateObservationBreakdownView } from "@/app/insights/rate-observation-breakdown/RateObservationBreakdownView";
import type { CorridorsApiResult, PublicCorridor } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import { exposeReactForClassicJsx, fixtureAsApiResult } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const corridorResult = fixtureAsApiResult<CorridorsApiResult>("corridors.list.success");
if (corridorResult.status !== 200) {
  throw new Error("corridors.list.success must be a successful canonical fixture");
}
const corridors: readonly PublicCorridor[] = corridorResult.body.corridors;
const selectedCorridorSlug = corridors.find(({ slug }) => slug === "usdc-us-brl-br")!.slug;

function render(ratesResult: RatesApiResult): string {
  return renderToStaticMarkup(
    React.createElement(RateObservationBreakdownView, {
      corridors,
      selectedCorridorSlug,
      ratesResult,
    }),
  );
}

test("a valid empty observation set is a successful read, not an outage or a zero rate", () => {
  const result = fixtureAsApiResult<RatesApiResult>("rates.empty.success");
  if (result.status !== 200) throw new Error("rates.empty.success must be a successful canonical fixture");

  const html = render(result);

  assert.match(html, /data-breakdown-state="empty-observations"/);
  assert.match(html, /No individual rate observations are currently persisted for this corridor\./);
  assert.match(html, /data-breakdown-state="valid-no-data-note"/);
  assert.match(html, /This is a successful read with no persisted observations\. It is not an API failure and not a zero rate\./);
  assert.doesNotMatch(html, /data-breakdown-state="rates-unavailable"/);
});

test("the empty-result note does not soften an actual failed retrieval", () => {
  const result = fixtureAsApiResult<RatesApiResult>("rates.error_500");
  if (result.status === 200) throw new Error("rates.error_500 must be a failed canonical fixture");

  const html = render(result);

  assert.match(html, /data-breakdown-state="rates-unavailable"/);
  assert.match(html, /Unable to load observations: Unable to read rates\./);
  assert.match(html, /A failed read is not treated as absent evidence or as a zero value\./);
  assert.doesNotMatch(html, /data-breakdown-state="valid-no-data-note"/);
  assert.doesNotMatch(html, /No individual rate observations are currently persisted for this corridor\./);
});
