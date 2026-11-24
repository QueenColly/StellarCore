import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import CompareAnchorsPage, { AnchorComparison } from "@/app/compare/anchors/page";
import type { PublicAnchorSummary } from "@/types/api/anchors";

exposeReactForClassicJsx();

const a: PublicAnchorSummary = {
  slug: "anchor-first", name: "First Reviewed Anchor", homeDomain: "first.example",
  status: "LIVE", seps: [1, 24], corridorCount: 2, isTransferCapable: true,
};
const b: PublicAnchorSummary = {
  slug: "anchor-second", name: "Second Reviewed Anchor", homeDomain: "second.example",
  status: "UNKNOWN", seps: [], corridorCount: 0, isTransferCapable: false,
};

test("anchor comparison page renders accessible selections without fake identities", () => {
  const markup = renderToStaticMarkup(<CompareAnchorsPage />);
  assert.match(markup, /Compare two anchors/);
  assert.match(markup, /Select anchors/);
  assert.match(markup, /Anchor A/);
  assert.match(markup, /Anchor B/);
  assert.match(markup, /Loading reviewed anchors/);
  assert.match(markup, /disabled/);
  assert.doesNotMatch(markup, /anchor-1|example\.stellar\.org/);
});

test("anchor comparison presents only selected persisted evidence", () => {
  const markup = renderToStaticMarkup(<AnchorComparison first={a} second={b} />);
  assert.match(markup, /First Reviewed Anchor/);
  assert.match(markup, /Second Reviewed Anchor/);
  assert.match(markup, /first\.example/);
  assert.match(markup, /second\.example/);
  assert.match(markup, /Last sync successful/);
  assert.match(markup, /Last sync unknown/);
  assert.match(markup, /SEP-24/);
  assert.match(markup, /No transfer interface advertised/);
  assert.match(markup, /Reviewed corridor count/);
  assert.match(markup, /href="\/anchors\/anchor-first"/);
  assert.match(markup, /href="\/anchors\/anchor-second"/);
  assert.match(markup, /No price, rate, liquidity, or operational claims/);
});

test("comparison control is keyboard reachable and stays on existing route", () => {
  const markup = renderToStaticMarkup(<CompareAnchorsPage />);
  assert.match(markup, /id="anchor-compare-a"/);
  assert.match(markup, /id="anchor-compare-b"/);
  assert.match(markup, /focus-visible/);
  assert.doesNotMatch(markup, /\/compare\/anchors\/result/);
});
