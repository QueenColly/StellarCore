import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRatesPath,
  parseCorridorOptions,
  parseRatesBody,
  readApiErrorMessage,
  summarizeCoverage,
} from "@/app/insights/rate-source-coverage/coverage";
import { CoverageView } from "@/app/insights/rate-source-coverage/CoverageView";
import type { PublicRatesResponse } from "@/types/api/rates";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

/** Fixture bodies are read as rate responses; error fixtures also carry `error`. */
type FixtureBody = PublicRatesResponse & Readonly<{ error: Readonly<{ message: string }> }>;

exposeReactForClassicJsx();

function fixtureBody(domain: string, name: string): FixtureBody {
  return JSON.parse(readFileSync(
    new URL(`../../../contracts/api/v1/fixtures/${domain}/${name}.json`, import.meta.url),
    "utf8",
  )).body;
}

function render(state: Parameters<typeof CoverageView>[0]["state"]): string {
  return renderToStaticMarkup(React.createElement(CoverageView, { state }));
}

const clientSource = readFileSync(
  new URL("../../../app/insights/rate-source-coverage/CoverageClient.tsx", import.meta.url),
  "utf8",
);

test("corridor options come from /api/corridors and drop unsafe slugs", () => {
  const options = parseCorridorOptions(fixtureBody("corridors", "list-success"));
  assert.ok(options && options.length > 0);
  assert.ok(options.every((option) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(option.slug)));

  const hostile = parseCorridorOptions({
    corridors: [
      { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR" },
      { slug: "../internal" },
      { slug: "x?y=1" },
      { slug: 42 },
      { slug: "usdc-us-brl-br" },
    ],
  });
  assert.deepEqual(hostile?.map(({ slug }) => slug), ["usdc-us-brl-br"]);
  assert.equal(hostile?.[0]?.label, "USDC (US) → BRL (BR)");
  assert.deepEqual(parseCorridorOptions(fixtureBody("corridors", "list-empty")), []);
  assert.equal(parseCorridorOptions({ error: {} }), null);
});

test("rates path is built only for a validated slug from the corridor list", () => {
  const options = [{ slug: "usdc-us-brl-br", label: "x" }];
  assert.equal(buildRatesPath("usdc-us-brl-br", options), "/api/rates?corridor=usdc-us-brl-br");
  for (const slug of ["", "unknown", "../internal", "usdc-us-brl-br&x=1", null, 7]) {
    assert.equal(buildRatesPath(slug, options), null, String(slug));
  }
});

test("displays configuration, observations, fresh count, requirement, state, and null median truthfully", () => {
  const rates = parseRatesBody(fixtureBody("rates", "insufficient-success"));
  assert.ok(rates);
  const html = render({ kind: "ready", rates });

  const step = (key: string) => html.match(new RegExp(`data-coverage-step="${key}"[\\s\\S]*?<dd[^>]*>(\\d+)</dd>`))?.[1];
  assert.equal(step("candidates"), "1");
  assert.equal(step("persisted"), "2");
  assert.equal(step("fresh"), "1");
  assert.equal(step("required"), "2");
  assert.match(html, /data-coverage-state="insufficient_fresh_sources"/);
  assert.match(html, /insufficient fresh sources/);
  assert.match(html, /Not published \(null\)/);
});

test("a single fresh observation is never promoted to a published median", () => {
  const body = fixtureBody("rates", "insufficient-success");
  const rates = parseRatesBody(body)!;
  const summary = summarizeCoverage(rates);
  assert.equal(summary.medianPublished, false);
  assert.equal(summary.shortfall, 1);
  const html = render({ kind: "ready", rates });
  // The lone fresh observation's rate must not appear as the median.
  const median = html.match(/data-testid="coverage-median"[^>]*>([^<]*)</)?.[1];
  assert.equal(median, "Not published (null)");
  assert.doesNotMatch(html, /5\.24/);
});

test("candidate count is never equated with fresh independent observations", () => {
  const body = {
    ...fixtureBody("rates", "insufficient-success"),
    reviewedCandidateConfiguration: { candidateCount: 3, uniqueAnchorCount: 3 },
    sourceCount: 1,
    freshSourceCount: 0,
    observations: [fixtureBody("rates", "insufficient-success").observations[1]],
  };
  const rates = parseRatesBody(body)!;
  const summary = summarizeCoverage(rates);
  const text = summary.explanations.map(({ text: t }) => t).join(" ");
  assert.match(text, /3 reviewed candidates configured, but only 1 latest persisted observation exist/);
  assert.match(text, /0 fresh independent observations of 2 required \(2 more needed\)/);
  assert.match(text, /Configuration is not proof/);
  const html = render({ kind: "ready", rates });
  assert.match(html, /Not an observation\./);
});

test("explains missing, stale, invalid, excluded, and registry-limited evidence", () => {
  const base = fixtureBody("rates", "insufficient-success");
  const fresh = base.observations[0];
  const rates = parseRatesBody({
    ...base,
    reviewedCandidateConfiguration: { candidateCount: 1, uniqueAnchorCount: 1 },
    sourceCount: 4,
    freshSourceCount: 0,
    observations: [
      base.observations[1],
      { ...fresh, anchor: { slug: "a", name: "A" }, freshness: { state: "future", ageMs: null }, eligibleForMedian: false, exclusionReason: "future_timestamp" },
      { ...fresh, anchor: { slug: "b", name: "B" }, freshness: { state: "invalid", ageMs: null }, eligibleForMedian: false, exclusionReason: "invalid_timestamp" },
      { ...fresh, anchor: { slug: "c", name: "C" }, eligibleForMedian: false, exclusionReason: "invalid_rate" },
    ],
  })!;
  const kinds = summarizeCoverage(rates).explanations.map(({ kind }) => kind);
  for (const kind of ["stale", "invalid", "excluded", "registry_limit", "insufficient"]) {
    assert.ok(kinds.includes(kind as never), kind);
  }

  const empty = parseRatesBody(fixtureBody("rates", "empty-success"))!;
  const emptySummary = summarizeCoverage(empty);
  assert.equal(emptySummary.explanations[0]?.kind, "missing");
  assert.match(render({ kind: "ready", rates: empty }), /No rate observations are currently persisted/);
});

test("healthy responses report the API-provided median only", () => {
  const body = fixtureBody("rates", "healthy-success");
  const rates = parseRatesBody(body)!;
  const summary = summarizeCoverage(rates);
  assert.equal(summary.medianPublished, true);
  assert.ok(summary.explanations.some(({ kind }) => kind === "published"));
  const html = render({ kind: "ready", rates });
  assert.match(html, new RegExp(`data-testid="coverage-median"[^>]*>${body.medianRate!.replace(/\./g, "\\.")}<`));
});

test("stale snapshots are labelled from degraded metadata or the evidence header", () => {
  const body = {
    ...fixtureBody("rates", "healthy-success"),
    degraded: { state: "stale", generatedAt: "2026-08-28T11:58:00.000Z", expiresAt: "2026-08-28T12:03:00.000Z", sourceTimes: [], snapshotAgeMs: 1 },
  };
  assert.match(render({ kind: "ready", rates: parseRatesBody(body)! }), /data-evidence-state="stale"/);
  const headerOnly = parseRatesBody(fixtureBody("rates", "healthy-success"), "stale")!;
  assert.ok(headerOnly.stale);
  assert.equal(parseRatesBody(fixtureBody("rates", "healthy-success"))!.stale, null);
});

test("errors, malformed bodies, idle, and loading render readable states", () => {
  assert.equal(readApiErrorMessage(fixtureBody("rates", "error-internal-500")), fixtureBody("rates", "error-internal-500").error.message);
  assert.equal(parseRatesBody({ medianRate: 1 }), null);
  assert.equal(parseRatesBody(fixtureBody("rates", "error-corridor-not-found-404")), null);
  assert.match(render({ kind: "error", message: "Corridor not found." }), /role="alert"[\s\S]*Corridor not found\./);
  assert.match(render({ kind: "idle" }), /Select a corridor/);
  assert.match(render({ kind: "loading" }), /aria-busy="true"/);
});

test("client fetches on explicit selection only, with no polling", () => {
  assert.doesNotMatch(clientSource, /setInterval|setTimeout|refreshInterval/);
  assert.match(clientSource, /fetch\("\/api\/corridors"/);
  assert.match(clientSource, /buildRatesPath\(slug, options\)/);
  assert.doesNotMatch(clientSource, /\/api\/internal/);
  assert.match(clientSource, /<label htmlFor="coverage-corridor"/);
});
