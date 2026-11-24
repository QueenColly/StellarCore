import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import CompareCorridorsPage, { CorridorComparison } from "@/app/compare/corridors/page";
import type { PublicCorridor } from "@/types/api/corridors";

exposeReactForClassicJsx();

const first: PublicCorridor = {
  slug: "usd-us-brl-br", sourceAsset: "USDC", sourceCountry: "US",
  destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 2,
};
const second: PublicCorridor = {
  slug: "eur-fr-ngn-ng", sourceAsset: "EUR", sourceCountry: "FR",
  destinationAsset: "NGN", destinationCountry: "NG", anchorCount: 0,
};

test("corridor page renders accessible selectors with no invented options", () => {
  const markup = renderToStaticMarkup(<CompareCorridorsPage />);
  assert.match(markup, /Compare two corridors/);
  assert.match(markup, /Select corridors/);
  assert.match(markup, /Corridor A/);
  assert.match(markup, /Corridor B/);
  assert.match(markup, /Loading reviewed corridors/);
  assert.doesNotMatch(markup, /corridor-3|corridor-4/);
});

test("comparison displays actual source, destination and persisted association counts", () => {
  const markup = renderToStaticMarkup(<CorridorComparison first={first} second={second} />);
  assert.match(markup, /USDC/);
  assert.match(markup, /BRL/);
  assert.match(markup, /EUR/);
  assert.match(markup, /NGN/);
  assert.match(markup, /Source asset/);
  assert.match(markup, /Source country/);
  assert.match(markup, /Destination asset/);
  assert.match(markup, /Destination country/);
  assert.match(markup, /Associated anchors/);
  assert.match(markup, /href="\/corridors\/usd-us-brl-br"/);
  assert.match(markup, /No price, rate, liquidity, or operational claims/);
});

test("comparison does not link to a missing result page", () => {
  const markup = renderToStaticMarkup(<CompareCorridorsPage />);
  assert.match(markup, /id="corridor-compare-a"/);
  assert.match(markup, /id="corridor-compare-b"/);
  assert.match(markup, /focus-visible/);
  assert.doesNotMatch(markup, /\/compare\/corridors\/result/);
});
