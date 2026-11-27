import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RatePanelView } from "@/components/dashboard/RatePanel";
import type { RatesApiResult } from "@/types/api/rates";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const ratePanelSource = readFileSync(
  new URL("../../../components/dashboard/RatePanel.tsx", import.meta.url),
  "utf8",
);

function fixture(name: string): RatesApiResult {
  const raw = JSON.parse(
    readFileSync(
      new URL(`../../../contracts/api/v1/fixtures/rates/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as { expectedStatus: number; body: unknown };
  return { status: raw.expectedStatus, body: raw.body } as RatesApiResult;
}

function render(result: RatesApiResult): string {
  return renderToStaticMarkup(
    withTestAppRouter(React.createElement(RatePanelView, { result })),
  );
}

function assertFeaturedLink(html: string): void {
  const match = html.match(
    /<a([^>]*data-testid="featured-corridor-evidence-link"[^>]*)>View corridor evidence/,
  );
  assert.ok(match, "featured corridor evidence link is rendered");
  assert.match(match[1]!, /href="\/corridors\/usdc-us-brl-br"/);
}

test("featured link derives its href from the existing featured-corridor constant", () => {
  assert.match(ratePanelSource, /const FEATURED_CORRIDOR_SLUG = "usdc-us-brl-br";/);
  assert.match(
    ratePanelSource,
    /`\/corridors\/\$\{encodeURIComponent\(FEATURED_CORRIDOR_SLUG\)\}`/,
  );
});

for (const name of ["healthy-success", "insufficient-success", "empty-success"]) {
  test(`featured corridor evidence link renders for ${name}`, () => {
    const html = render(fixture(name));
    assertFeaturedLink(html);
    assert.equal(html.match(/featured-corridor-evidence-link/g)?.length, 1);
  });
}

test("link stays available when the median is null and no live price is promised", () => {
  const html = render(fixture("insufficient-success"));
  assert.match(html, /Median unavailable/);
  assertFeaturedLink(html);
  assert.doesNotMatch(html, /live price/i);
  assert.doesNotMatch(html, /live rate/i);
});

test("link stays available when no observation is persisted", () => {
  const html = render(fixture("empty-success"));
  assert.match(html, /No rate observations are currently persisted/);
  assertFeaturedLink(html);
});

test("link stays available when the rates response is unavailable", () => {
  for (const name of ["error-internal-500", "error-corridor-not-found-404"]) {
    const html = render(fixture(name));
    assert.match(html, /data-evidence-state="unavailable"/);
    assertFeaturedLink(html);
  }
});

test("link is a native keyboard-focusable anchor with a visible focus style", () => {
  const html = render(fixture("healthy-success"));
  const anchor = html.match(/<a[^>]*featured-corridor-evidence-link[^>]*>/)?.[0] ?? "";
  assert.ok(anchor.startsWith("<a"), "rendered as a native anchor element");
  assert.doesNotMatch(anchor, /tabindex="-1"/);
  assert.match(anchor, /focus-visible:outline-2/);
  assert.match(anchor, /focus-visible:outline-\[var\(--accent\)\]/);
  assert.match(html, /<span aria-hidden="true">→<\/span>/);
});

test("median, freshness, observation, and insufficient-evidence copy are unchanged", () => {
  const html = render(fixture("insufficient-success"));
  assert.match(html, /1 fresh independent observation of 2 required/);
  assert.match(html, /2 latest persisted anchor observations/);
  assert.match(html, /No median is published until the fresh independent-observation\s+requirement is met\./);
  assert.match(html, /data-testid="rate-evidence-freshness"/);
});
