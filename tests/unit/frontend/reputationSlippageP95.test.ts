import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReputationSectionView } from "@/components/dashboard/ReputationSection";
import {
  REPUTATION_METRIC_ROWS,
  ReputationMetricsList,
} from "@/components/reputation/ReputationMetricsList";
import type {
  PublicReputationDetailResponse,
  PublicReputationMetrics,
  ReputationApiListResult,
} from "@/types/api/reputation";
import {
  exposeReactForClassicJsx,
  fixtureAsApiResult,
  loadContractFixture,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const anchorPageSource = readFileSync(
  new URL("../../../app/anchors/[slug]/page.tsx", import.meta.url),
  "utf8",
);

const BASE_METRICS: PublicReputationMetrics = {
  fillRate7d: 0.9,
  fillRate30d: 0.85,
  fillRate90d: 0.8,
  settleP50Ms: 1000,
  settleP95Ms: 4000,
  slippageP50: 0.001,
  slippageP95: 0.015,
};

function renderMetrics(metrics: PublicReputationMetrics): string {
  return renderToStaticMarkup(createElement(ReputationMetricsList, { metrics }));
}

function metricCell(html: string, key: string): string {
  const match = html.match(new RegExp(`data-metric="${key}"><dt>([^<]*)</dt><dd[^>]*>(.*?)</dd>`));
  assert.ok(match, `metric row ${key} rendered`);
  return `${match[1]}=${match[2]}`;
}

test("slippage p95 row renders directly after slippage p50 with a clear label", () => {
  const keys = REPUTATION_METRIC_ROWS.map((row) => row.key);
  assert.equal(keys.indexOf("slippageP95"), keys.indexOf("slippageP50") + 1);

  const html = renderMetrics(BASE_METRICS);
  assert.ok(html.indexOf("Slippage p50") < html.indexOf("Slippage p95"));
  assert.equal(metricCell(html, "slippageP95"), "Slippage p95=0.015");
});

test("slippage p95 preserves API units: zero and positive values are rendered verbatim", () => {
  assert.equal(metricCell(renderMetrics({ ...BASE_METRICS, slippageP95: 0 }), "slippageP95"), "Slippage p95=0");
  assert.equal(
    metricCell(renderMetrics({ ...BASE_METRICS, slippageP95: 0.0234 }), "slippageP95"),
    "Slippage p95=0.0234",
  );
});

test("null slippage p95 uses the same placeholder policy as p50 and an accessible label", () => {
  const html = renderMetrics({ ...BASE_METRICS, slippageP50: null, slippageP95: null });
  assert.match(html, /<span aria-label="Slippage p50 not available">—<\/span>/);
  assert.match(html, /<span aria-label="Slippage p95 not available">—<\/span>/);
  assert.doesNotMatch(metricCell(html, "slippageP95"), /=0/);
});

test("metric grid is responsive: single column on narrow screens, two columns above", () => {
  const html = renderMetrics(BASE_METRICS);
  assert.match(html, /<dl[^>]*class="[^"]*grid-cols-1[^"]*min-\[360px\]:grid-cols-2/);
});

test("dashboard cards render p95 for established, null for insufficient, nothing for missing metrics", () => {
  const result = fixtureAsApiResult<ReputationApiListResult>("reputation.list.success");
  const html = renderToStaticMarkup(createElement(ReputationSectionView, { result }));

  const cards = html.split("<article").slice(1);
  const card = (name: string) => {
    const found = cards.find((value) => value.includes(`>${name}</a>`));
    assert.ok(found, `card for ${name}`);
    return found;
  };

  // established fixture: slippageP95 = 0.015
  assert.equal(metricCell(card("Zeam"), "slippageP95"), "Slippage p95=0.015");
  // insufficient_evidence fixture: metrics present, slippageP95 = null
  assert.match(card("Cowrie"), /aria-label="Slippage p95 not available"/);
  assert.match(card("Cowrie"), /Evidence is too sparse for a published score\./);
  // not_evaluated fixture: metrics null => no metrics list, no fabricated values
  assert.doesNotMatch(card("MoneyGram"), /Slippage p95/);
  assert.match(card("MoneyGram"), /This anchor has no persisted evaluation yet\./);
});

test("anchor detail fixtures: established p95 positive, insufficient p95 null, not-evaluated has no metrics", () => {
  const detail = (name: string) =>
    loadContractFixture(name).body as unknown as PublicReputationDetailResponse;

  const established = detail("reputation.detail.established_200").reputation;
  assert.ok(established.metrics);
  assert.equal(metricCell(renderMetrics(established.metrics), "slippageP95"), "Slippage p95=0.015");

  const insufficient = detail("reputation.detail.insufficient_200").reputation;
  assert.ok(insufficient.metrics);
  assert.match(renderMetrics(insufficient.metrics), /aria-label="Slippage p95 not available"/);

  assert.equal(detail("reputation.detail.not_evaluated_200").reputation.metrics, null);
});

test("anchor detail reputation evidence renders the shared metrics list including p95", () => {
  assert.match(
    anchorPageSource,
    /import \{ ReputationMetricsList \} from "@\/components\/reputation\/ReputationMetricsList"/,
  );
  assert.match(
    anchorPageSource,
    /reputation\.metrics \? <ReputationMetricsList metrics=\{reputation\.metrics\} \/> : null/,
  );
  // No bespoke slippage formatting that could diverge from the dashboard.
  assert.doesNotMatch(anchorPageSource, /slippageP50|slippageP95/);
});
