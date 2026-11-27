import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CorridorDetailView,
  CorridorPageError,
} from "@/app/corridors/[slug]/CorridorDetailView";
import type { CorridorApiResult } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import type { RateHistoryApiResult } from "@/types/api/rateHistory";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

/**
 * Issue #681: a latest-rate read failure on an existing corridor must not nest
 * a second `<main>` or duplicate `id="main-content"`.
 */

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

function fixture<T>(domain: string, name: string): T {
  const raw = JSON.parse(read(`contracts/api/v1/fixtures/${domain}/${name}.json`)) as {
    expectedStatus: number;
    body: unknown;
  };
  return { status: raw.expectedStatus, body: raw.body } as T;
}

const corridorResult = fixture<CorridorApiResult>("corridors", "detail-success");
if (corridorResult.status !== 200) throw new Error("expected corridor detail success fixture");
const corridor = corridorResult.body.corridor;

const historySuccess: RateHistoryApiResult = {
  status: 200,
  body: {
    corridor: {
      slug: corridor.slug,
      sourceAsset: corridor.sourceAsset,
      sourceCountry: corridor.sourceCountry,
      destinationAsset: corridor.destinationAsset,
      destinationCountry: corridor.destinationCountry,
    },
    evaluatedAt: "2026-08-28T12:00:00.000Z",
    windowDays: 7,
    points: [
      {
        timestamp: "2026-08-27T12:00:00.000Z",
        medianRate: "5.250000000000000000",
        state: "healthy",
        sourceCount: 2,
        freshSourceCount: 2,
        observations: [],
      },
    ],
  },
};

const historyFailure: RateHistoryApiResult = {
  status: 500,
  body: { error: { code: "internal_error", message: "Unable to read rate history." } },
};

function render(ratesResult: RatesApiResult, historyResult: RateHistoryApiResult): string {
  return renderToStaticMarkup(
    withTestAppRouter(
      React.createElement(CorridorDetailView, { corridor, ratesResult, historyResult }),
    ),
  );
}

function count(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

function assertSingleMain(html: string): void {
  assert.equal(count(html, /<main[\s>]/g), 1, "exactly one <main>");
  assert.equal(count(html, /id="main-content"/g), 1, "exactly one main-content id");
}

function assertCorridorContext(html: string): void {
  assert.match(html, /<h1[^>]*>USDC \(US\) → BRL \(BR\)<\/h1>/);
  assert.match(html, /<nav aria-label="Breadcrumb"/);
  assert.match(html, /aria-current="page">usdc-us-brl-br</);
  assert.match(html, /id="anchors-heading"/);
  assert.match(html, /href="\/anchors\/cowrie"/);
}

test("successful rate retrieval renders rate evidence inside the single main", () => {
  const html = render(fixture<RatesApiResult>("rates", "healthy-success"), historySuccess);
  assertSingleMain(html);
  assertCorridorContext(html);
  assert.match(html, /Latest rate evidence/);
  assert.doesNotMatch(html, /role="alert"/);
});

for (const name of ["error-internal-500", "error-corridor-not-found-404"]) {
  test(`non-200 rate retrieval (${name}) keeps one main and a rate-specific alert`, () => {
    const ratesResult = fixture<RatesApiResult>("rates", name);
    assert.notEqual(ratesResult.status, 200);
    const html = render(ratesResult, historySuccess);

    assertSingleMain(html);
    assertCorridorContext(html);

    // The alert is a bounded region inside main, after the anchors section.
    const mainStart = html.indexOf("<main");
    const mainEnd = html.indexOf("</main>");
    const alertAt = html.indexOf('role="alert"');
    assert.ok(alertAt > mainStart && alertAt < mainEnd, "alert is inside the page main");
    assert.ok(alertAt > html.indexOf('id="anchors-heading"'), "anchors stay above the alert");
    assert.match(html, /<section aria-labelledby="rate-evidence-heading"[^>]*data-evidence-state="unavailable"/);
    assert.match(html, /Latest rate evidence/);
    if (ratesResult.status !== 200) {
      assert.ok(html.includes(ratesResult.body.error.message));
    }
    assert.match(html, /The corridor itself exists/);

    // The rate section fabricates no median, stale value or rate, and there is
    // no false 404. (The independently successful history chart may show its
    // own persisted points, so only the latest-rate section is checked.)
    const rateSection = html.slice(
      html.indexOf('<section aria-labelledby="rate-evidence-heading"'),
      html.indexOf("</section>", html.indexOf('aria-labelledby="rate-evidence-heading"')),
    );
    assert.doesNotMatch(rateSection, /Median rate|5\.25|data-evidence-state="stale"|<table/);
    assert.doesNotMatch(html, /Corridor not found — StellarCore|This page could not be found/);
  });
}

test("history still renders when it succeeded but the latest-rate read failed", () => {
  const html = render(fixture<RatesApiResult>("rates", "error-internal-500"), historySuccess);
  assertSingleMain(html);
  assert.match(html, /role="alert"/);
  // The history chart's timeframe control is present.
  assert.match(html, />7D</);
});

test("history failure is independent of a successful latest-rate read", () => {
  const html = render(fixture<RatesApiResult>("rates", "healthy-success"), historyFailure);
  assertSingleMain(html);
  assert.match(html, /Latest rate evidence/);
  assert.doesNotMatch(html, />7D</);
  assert.doesNotMatch(html, /role="alert"/);
});

test("both rate and history failures still yield one main with corridor context", () => {
  const html = render(fixture<RatesApiResult>("rates", "error-internal-500"), historyFailure);
  assertSingleMain(html);
  assertCorridorContext(html);
  assert.equal(count(html, /role="alert"/g), 1);
});

test("top-level corridor-fetch failure keeps its own single main and alert", () => {
  const html = renderToStaticMarkup(
    React.createElement(CorridorPageError, { message: "Unable to load corridor." }),
  );
  assertSingleMain(html);
  assert.match(html, /role="alert"[^>]*>Unable to load corridor\.</);
});

test("the route only uses the nested-main error helper for the corridor-fetch failure", () => {
  const page = read("app/corridors/[slug]/page.tsx");
  const view = read("app/corridors/[slug]/CorridorDetailView.tsx");
  assert.equal(count(page, /<CorridorPageError /g), 1);
  assert.match(page, /status === 404 \|\| corridorResult\.status === 400\) notFound\(\)/);
  assert.doesNotMatch(view, /<CorridorPageError /);
  assert.match(view, /<CorridorRateUnavailable message=\{ratesResult\.body\.error\.message\} \/>/);
});
