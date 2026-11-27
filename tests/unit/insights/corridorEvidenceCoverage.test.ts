import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CORRIDOR_COVERAGE_BATCH_SIZE,
  classifyCorridorCoverage,
  loadCorridorEvidenceCoverage,
  parseBatchParam,
  type CorridorCoverageDependencies,
} from "@/app/insights/corridor-evidence-coverage/coverage";
import { CorridorCoverageView } from "@/app/insights/corridor-evidence-coverage/CorridorCoverageView";
import type { CorridorsApiResult, PublicCorridor } from "@/types/api/corridors";
import type { PublicRatesResponse, RatesApiResult } from "@/types/api/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

/** Issue #682: deterministic cross-corridor persisted-evidence coverage. */

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

function rateFixture(name: string): RatesApiResult {
  const raw = JSON.parse(read(`contracts/api/v1/fixtures/rates/${name}.json`)) as {
    expectedStatus: number;
    body: unknown;
  };
  return { status: raw.expectedStatus, body: raw.body } as RatesApiResult;
}

function successBody(name: string): PublicRatesResponse {
  const result = rateFixture(name);
  if (result.status !== 200) throw new Error(`${name} is not a success fixture`);
  return result.body;
}

function corridor(slug: string, anchorCount = 2): PublicCorridor {
  const [source, sourceCountry, destination, destinationCountry] = slug.toUpperCase().split("-");
  return {
    slug,
    sourceAsset: source!,
    sourceCountry: sourceCountry!,
    destinationAsset: destination!,
    destinationCountry: destinationCountry!,
    anchorCount,
  };
}

const STALE: StaleEvidenceMetadata = {
  state: "stale",
  generatedAt: "2026-08-28T12:00:05.000Z",
  expiresAt: "2026-08-28T12:05:05.000Z",
  sourceTimes: ["2026-08-28T11:59:50.000Z"],
  snapshotAgeMs: 30_000,
};

const CORRIDORS = [
  corridor("usdc-us-brl-br"),
  corridor("usdc-us-mxn-mx"),
  corridor("usdc-us-ngn-ng"),
  corridor("usdc-us-kes-ke"),
  corridor("usdc-us-php-ph", 1),
];

const RATES_BY_SLUG: Readonly<Record<string, RatesApiResult | Error>> = {
  "usdc-us-brl-br": rateFixture("healthy-success"),
  "usdc-us-mxn-mx": rateFixture("insufficient-success"),
  "usdc-us-ngn-ng": rateFixture("empty-success"),
  "usdc-us-kes-ke": rateFixture("error-internal-500"),
  "usdc-us-php-ph": new Error("connection reset"),
};

function dependencies(
  corridors: CorridorsApiResult = { status: 200, body: { corridors: CORRIDORS, count: CORRIDORS.length } },
  rates: Readonly<Record<string, RatesApiResult | Error>> = RATES_BY_SLUG,
): CorridorCoverageDependencies & { rateReads: string[] } {
  const rateReads: string[] = [];
  return {
    rateReads,
    readCorridors: async () => corridors,
    readRates: async (slug) => {
      rateReads.push(slug);
      const result = rates[slug];
      if (!result) throw new Error(`unexpected slug ${slug}`);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("classification derives only from public response fields", () => {
  const healthy = classifyCorridorCoverage(CORRIDORS[0]!, rateFixture("healthy-success"));
  assert.equal(healthy.state, "eligible_median");
  assert.ok(healthy.kind === "evaluated");
  assert.equal(healthy.medianRate, "5.250000000000000000");
  assert.equal(healthy.sourceCount, 2);
  assert.equal(healthy.freshSourceCount, 2);
  assert.equal(healthy.minimumRequired, 2);
  assert.equal(healthy.candidateCount, 1);
  assert.equal(healthy.degraded, null);

  const insufficient = classifyCorridorCoverage(CORRIDORS[1]!, rateFixture("insufficient-success"));
  assert.equal(insufficient.state, "insufficient_fresh");
  assert.ok(insufficient.kind === "evaluated");
  assert.equal(insufficient.medianRate, null, "a missing median stays null, never zero");

  const empty = classifyCorridorCoverage(CORRIDORS[2]!, rateFixture("empty-success"));
  assert.equal(empty.state, "configured_only");
  assert.ok(empty.kind === "evaluated");
  assert.equal(empty.sourceCount, 0);
  assert.equal(empty.medianRate, null);

  const failed = classifyCorridorCoverage(CORRIDORS[3]!, rateFixture("error-internal-500"));
  assert.equal(failed.state, "rates_unavailable");
  assert.ok(failed.kind === "unavailable");
  assert.equal(failed.message, "Unable to read rates.");
});

test("degraded metadata on the result or body is surfaced, not hidden", () => {
  const body = successBody("healthy-success");
  for (const result of [
    { status: 200, body, degraded: STALE },
    { status: 200, body: { ...body, degraded: STALE } },
  ] as RatesApiResult[]) {
    const row = classifyCorridorCoverage(CORRIDORS[0]!, result);
    assert.ok(row.kind === "evaluated");
    assert.deepEqual(row.degraded, STALE);
  }
});

test("a healthy state with a null median is never shown as an eligible median", () => {
  const row = classifyCorridorCoverage(CORRIDORS[0]!, {
    status: 200,
    body: { ...successBody("healthy-success"), medianRate: null },
  });
  assert.equal(row.state, "insufficient_fresh");
});

test("one corridor's failure is visible and does not hide the others", async () => {
  const deps = dependencies();
  const report = await loadCorridorEvidenceCoverage(deps);
  assert.equal(report.kind, "ready");
  if (report.kind !== "ready") return;
  assert.deepEqual(
    report.rows.map(({ corridor: { slug }, state }) => [slug, state]),
    [
      ["usdc-us-brl-br", "eligible_median"],
      ["usdc-us-mxn-mx", "insufficient_fresh"],
      ["usdc-us-ngn-ng", "configured_only"],
      ["usdc-us-kes-ke", "rates_unavailable"],
      ["usdc-us-php-ph", "rates_unavailable"],
    ],
  );

  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  assert.equal(html.match(/<tr[^>]*data-corridor=/g)?.length, 5);
  assert.match(html, /data-coverage-state="eligible_median"/);
  assert.match(html, /data-coverage-state="insufficient_fresh"/);
  assert.match(html, /data-coverage-state="configured_only"/);
  assert.equal(html.match(/data-coverage-state="rates_unavailable"/g)?.length, 2);
  assert.match(html, /Unable to read rates\. Other corridors are unaffected\./);
  assert.match(html, /Showing all 5 reviewed corridors\./);
});

test("missing medians render Unavailable, never zero", async () => {
  const report = await loadCorridorEvidenceCoverage(dependencies());
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  const medians = [...html.matchAll(/data-testid="coverage-median">([^<]*)</g)].map((match) => match[1]);
  assert.deepEqual(medians, [
    "5.250000000000000000",
    "Unavailable",
    "Unavailable",
    "Unavailable",
    "Unavailable",
  ]);
  assert.ok(medians.every((value) => value !== "0"));
});

test("rows link to existing corridor detail pages and show evaluation timestamps", async () => {
  const report = await loadCorridorEvidenceCoverage(dependencies());
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  for (const { slug } of CORRIDORS) {
    assert.match(html, new RegExp(`href="/corridors/${slug}"`));
  }
  assert.match(html, /<time dateTime="2026-08-28T12:00:00.000Z">2026-08-28 12:00:00 UTC<\/time>/);
  assert.match(html, /1 candidate \/ 1 anchor/);
  assert.match(html, /2 reviewed anchor members/);
  assert.match(html, /1 reviewed anchor member</);
  // Keyboard-reachable scroll region with an accessible table.
  assert.match(html, /role="region" aria-label="Corridor evidence coverage" tabindex="0"/);
  assert.match(html, /<th scope="row"/);
  assert.match(html, /<caption class="sr-only">/);
});

test("stale/degraded rows are labelled with the snapshot generation time", async () => {
  const report = await loadCorridorEvidenceCoverage(
    dependencies(undefined, {
      ...RATES_BY_SLUG,
      "usdc-us-brl-br": { status: 200, body: successBody("healthy-success"), degraded: STALE },
    }),
  );
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  assert.match(html, /Stale fallback snapshot from <time dateTime="2026-08-28T12:00:05.000Z">/);
});

test("rate reads are bounded to one explicit batch and the limit is explained", async () => {
  const many = Array.from({ length: CORRIDOR_COVERAGE_BATCH_SIZE * 2 + 1 }, (_, index) =>
    corridor(`usdc-us-c${index}-zz`),
  );
  const rates = Object.fromEntries(many.map(({ slug }) => [slug, rateFixture("empty-success")]));

  const first = dependencies({ status: 200, body: { corridors: many, count: many.length } }, rates);
  const report = await loadCorridorEvidenceCoverage(first);
  assert.equal(first.rateReads.length, CORRIDOR_COVERAGE_BATCH_SIZE);
  assert.ok(report.kind === "ready");
  assert.equal(report.batchCount, 3);
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  assert.match(html, new RegExp(`Showing corridors 1–${CORRIDOR_COVERAGE_BATCH_SIZE} of ${many.length}\\.`));
  assert.match(html, new RegExp(`at most ${CORRIDOR_COVERAGE_BATCH_SIZE} corridors are evaluated per view`));
  assert.match(html, /<nav aria-label="Corridor coverage batches"/);
  assert.match(html, /href="\/insights\/corridor-evidence-coverage\?batch=2"/);
  assert.match(html, /aria-current="page"[^>]*>Batch 1</);

  const last = dependencies({ status: 200, body: { corridors: many, count: many.length } }, rates);
  const lastReport = await loadCorridorEvidenceCoverage(last, 3);
  assert.deepEqual(last.rateReads, [many.at(-1)!.slug]);
  assert.ok(lastReport.kind === "ready" && lastReport.batch === 3);

  // Out-of-range batches clamp to the last real batch instead of fanning out.
  const clamped = dependencies({ status: 200, body: { corridors: many, count: many.length } }, rates);
  const clampedReport = await loadCorridorEvidenceCoverage(clamped, 999);
  assert.ok(clampedReport.kind === "ready" && clampedReport.batch === 3);
  assert.equal(clamped.rateReads.length, 1);
});

test("the batch query parameter is parsed strictly", () => {
  assert.equal(parseBatchParam(undefined), 1);
  assert.equal(parseBatchParam("2"), 2);
  assert.equal(parseBatchParam("0"), 1);
  assert.equal(parseBatchParam("-1"), 1);
  assert.equal(parseBatchParam("2.5"), 1);
  assert.equal(parseBatchParam("1e3"), 1);
  assert.equal(parseBatchParam("99999"), 1);
  assert.equal(parseBatchParam(["2", "3"]), 1);
});

test("an empty corridor directory is distinct from failure and zero observations", async () => {
  const empty = dependencies({ status: 200, body: { corridors: [], count: 0 } });
  const report = await loadCorridorEvidenceCoverage(empty);
  assert.deepEqual(report, { kind: "empty" });
  assert.deepEqual(empty.rateReads, []);
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  assert.match(html, /data-evidence-state="empty"/);
  assert.match(html, /No reviewed corridors are currently persisted\./);
});

test("a corridor directory failure is reported without any rate reads", async () => {
  const failed = dependencies({
    status: 500,
    body: { error: { code: "internal_error", message: "Unable to load corridors." } },
  });
  const report = await loadCorridorEvidenceCoverage(failed);
  assert.deepEqual(report, { kind: "corridors_unavailable", message: "Unable to load corridors." });
  assert.deepEqual(failed.rateReads, []);
  const html = renderToStaticMarkup(React.createElement(CorridorCoverageView, { report }));
  assert.match(html, /role="alert"/);
  assert.match(html, /does not mean corridors or evidence are absent/);

  const thrown = await loadCorridorEvidenceCoverage({
    readCorridors: async () => {
      throw new Error("boom");
    },
    readRates: async () => assert.fail("no rate reads"),
  });
  assert.equal(thrown.kind, "corridors_unavailable");
});

test("the page uses only existing read APIs, never polls, and disclaims transfer routes", () => {
  const page = read("app/insights/corridor-evidence-coverage/page.tsx");
  assert.match(page, /getCorridorsApiResult\(\)/);
  assert.match(page, /getRatesApiResult\(slug\)/);
  assert.doesNotMatch(page, /"use client"|setInterval|fetch\(|prisma/i);
  assert.match(page, /No corridor here represents a verified,\s+available transfer route/);
  assert.match(page, /nothing on this page measures live uptime/);
  assert.equal(page.match(/<main[\s>]/g)?.length, 1);
  assert.equal(page.match(/<h1[\s>]/g)?.length, 1);
});
