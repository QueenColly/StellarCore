import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EvidenceStatesGuidePage from "@/app/learn/evidence-states/page";
import { MIN_FRESH_SOURCES, RATE_FRESHNESS_THRESHOLD_MS } from "@/constants/rates";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const guideSource = readFileSync(
  new URL("../../../app/learn/evidence-states/page.tsx", import.meta.url),
  "utf8",
);

function render(): string {
  return renderToStaticMarkup(React.createElement(EvidenceStatesGuidePage));
}

test("the guide is a standalone static page with no API calls or monitoring", () => {
  assert.match(guideSource, /import \{ MIN_FRESH_SOURCES, RATE_FRESHNESS_THRESHOLD_MS \} from "@\/constants\/rates"/);
  assert.match(guideSource, /<ProductHeader current="dashboard" \/>/);
  assert.doesNotMatch(guideSource, /"use client"|useEffect|fetch\(|\/api\/|setInterval|setTimeout/);
  assert.doesNotMatch(guideSource, /reputation|score|POST|PUT|DELETE/);
});

test("the rendered guide has semantic headings, responsive structure, and accessible links", () => {
  const html = render();

  assert.equal(html.match(/<h1\b/g)?.length, 1);
  assert.match(html, /<main id="main-content"/);
  assert.match(html, /href="#main-content">\s*Skip to content/);
  for (const id of [
    "evidence-chain-heading",
    "thresholds-heading",
    "state-boundaries-heading",
    "references-heading",
  ]) {
    assert.match(html, new RegExp(`aria-labelledby="${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /role="region"[^>]*aria-labelledby="state-boundaries-heading"[^>]*aria-describedby="evidence-table-hint"[^>]*tabindex="0"/);
  assert.match(html, /<caption class="sr-only">/);
  assert.match(html, /<th scope="col"/);
  assert.match(html, /<th scope="row"/);
  assert.match(html, /min-w-\[44rem\]/);
  assert.match(html, /grid gap-4 sm:grid-cols-2 xl:grid-cols-5/);
  assert.equal(html.match(/focus-visible:outline-2/g)?.length, 4);
});

test("each evidence layer keeps its can and cannot boundary", () => {
  const html = render();

  for (const id of [
    "reviewed-configuration",
    "synchronized-metadata",
    "persisted-observation",
    "fresh-independent-evidence",
    "published-median",
  ]) {
    assert.match(html, new RegExp(`data-evidence-guide="${id}"`));
  }

  assert.match(html, /does not mean a verified, operational, or safe transfer route/);
  assert.match(html, /Advertised SEP capability is not current service availability/);
  assert.match(html, /not a firm quote, an executable price, a live offer, or a transfer instruction/);
  assert.match(html, /Stale, future-dated, or invalid observations stay visible/);
  assert.match(html, /No individual observation is promoted to a median on this guide/);
});

test("freshness and median copy uses the live constants rather than hard-coded values", () => {
  const html = render();

  assert.match(html, new RegExp(`${RATE_FRESHNESS_THRESHOLD_MS} ms`));
  assert.match(html, new RegExp(`${MIN_FRESH_SOURCES} fresh independent sources`));
  assert.match(html, /The current median requires at least/);
  assert.match(html, /<code>medianRate<\/code> is null/);
  assert.match(html, /<code>insufficient_fresh_sources<\/code>/);
  assert.match(html, /No median is published when the threshold is unmet/);
  assert.doesNotMatch(guideSource, /minimumFreshIndependentSources\s*=\s*2/);
});

test("valid no data, insufficient, stale, failed, and advertised states stay distinct", () => {
  const html = render();

  for (const id of [
    "valid-no-data",
    "insufficient-sources",
    "stale-fallback",
    "failed-retrieval",
    "advertised-capability",
  ]) {
    assert.match(html, new RegExp(`data-evidence-example="${id}"`));
  }

  assert.match(html, /A successful read with no stored observations\./);
  assert.match(html, /It is not an outage and not a zero rate\./);
  assert.match(html, new RegExp(`Fewer than ${MIN_FRESH_SOURCES} fresh, eligible observations from distinct anchors`));
  assert.match(html, /medianRate stays null/);
  assert.match(html, /verified last-known-good snapshot/);
  assert.match(html, /not current evidence and a stale observation is not median-eligible/);
  assert.match(html, /The API reports an error\./);
  assert.match(html, /not the same as an empty result: no value is inferred, substituted, or changed to zero/);
  assert.match(html, /not whether the service is reachable, healthy, or able to complete a transfer now/);
});

test("all examples are labelled as illustrative and contain no quoted prices", () => {
  const html = render();

  assert.match(html, /no live data, no verified rate observations, and no executable prices/);
  assert.match(html, /illustrative examples used only to explain state boundaries/);
  assert.match(html, /None of these examples is live data or a verified rate observation\./);
  assert.doesNotMatch(html, /\b\d+\.\d{4,}\b/);
});

test("internal and technical reference links are keyboard reachable", () => {
  const html = render();

  assert.match(html, /<a class="[^"]*focus-visible:outline-2[^"]*" href="\/dashboard"/);
  assert.match(html, /<a class="[^"]*focus-visible:outline-2[^"]*" href="\/developers\/explorer"/);
  assert.match(
    html,
    /<a class="[^"]*focus-visible:outline-2[^"]*" href="https:\/\/github\.com\/Aboyeji-Isaac\/StellarCore\/blob\/contributions\/docs\/api-reference\.md"/,
  );
  assert.match(
    html,
    /<a class="[^"]*focus-visible:outline-2[^"]*" href="https:\/\/github\.com\/Aboyeji-Isaac\/StellarCore\/blob\/contributions\/docs\/evidence-provenance-walkthrough\.md"/,
  );
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /does not initiate transfers, create firm quotes, or monitor background state/);
});
