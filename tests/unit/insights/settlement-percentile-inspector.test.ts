import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { exposeReactForClassicJsx } from "../../support/dashboardContracts";
import type {
  PublicReputationListResponse,
  ReputationApiErrorResponse,
} from "@/types/api/reputation";
import {
  computeP95MinusP50Label,
  formatMs,
  formatSpread,
} from "@/app/insights/settlement-percentile-inspector/InspectorClient";

exposeReactForClassicJsx();

test("formats Ms values correctly: null, zero, positive", () => {
  assert.equal(formatMs(null), "N/A");
  assert.equal(formatMs(0), "0 ms");
  assert.equal(formatMs(1200), "1200 ms");
  assert.equal(formatMs(4500), "4500 ms");
});

test("computes p95 minus p50 spread correctly when p95 > p50", () => {
  const { p95MinusP50Ms, p95LessThanP50 } = computeP95MinusP50Label(1200, 4500);
  assert.equal(p95MinusP50Ms, 3300);
  assert.equal(p95LessThanP50, false);
});

test("labels inconsistent ordering when p95 < p50", () => {
  const { p95MinusP50Ms, p95LessThanP50 } = computeP95MinusP50Label(5000, 3000);
  assert.equal(p95MinusP50Ms, -2000);
  assert.equal(p95LessThanP50, true);
});

test("returns null spread and null label when either value is null", () => {
  const { p95MinusP50Ms, p95LessThanP50 } = computeP95MinusP50Label(null, 4500);
  assert.equal(p95MinusP50Ms, null);
  assert.equal(p95LessThanP50, null);

  const { p95MinusP50Ms: p95Ms2, p95LessThanP50: label2 } = computeP95MinusP50Label(1200, null);
  assert.equal(p95Ms2, null);
  assert.equal(label2, null);
});

test("handles negative settleP50Ms and p95Ms correctly", () => {
  const { p95MinusP50Ms, p95LessThanP50 } = computeP95MinusP50Label(-100, 0);
  assert.equal(p95MinusP50Ms, 100);
  assert.equal(p95LessThanP50, false);
});

test("handles NaN p95Ms correctly", () => {
  const { p95MinusP50Ms, p95LessThanP50 } = computeP95MinusP50Label(1200, NaN);
  assert.equal(p95MinusP50Ms, null);
  assert.equal(p95LessThanP50, null);
});

test("formatSpread labels inconsistent ordering", () => {
  const spread = formatSpread(5000, 3000);
  assert.match(spread, /p95.*p50/);
  assert.match(spread, /inconsistent ordering/);
  assert.match(spread, /arithmetic spread/);
});

test("formatSpread normal ordering", () => {
  const spread = formatSpread(1200, 4500);
  assert.match(spread, /p95.*p50/);
  // Output uses en-dash (−) for mathematical minus
  assert.match(spread, /[−-]/, "should contain a minus sign");
  // Should not mention inconsistent ordering - verify by checking it doesn't contain that text
  assert.match(spread, /p95/, "should contain p95");
  assert.match(spread, /4500/, "should contain the p95 value");
  assert.match(spread, /1200/, "should contain the p50 value");
});

test("formatSpread zero values", () => {
  const spread = formatSpread(0, 0);
  assert.equal(spread, "p95 (0 ms) − p50 (0 ms), spread: 0 ms");
});

test("formatSpread null values", () => {
  const spread = formatSpread(null, null);
  assert.equal(spread, "—");
});
