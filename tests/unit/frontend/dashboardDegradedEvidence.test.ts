import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RatePanelView } from "@/components/dashboard/RatePanel";
import { ReputationSectionView } from "@/components/dashboard/ReputationSection";
import {
  formatSnapshotAge,
  readDegradedMetadata,
} from "@/components/dashboard/StaleEvidenceNotice";
import type { RatesApiResult } from "@/types/api/rates";
import type { ReputationApiListResult } from "@/types/api/reputation";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

/**
 * Deterministic fixture-based view tests for issue #680: a degraded (stale
 * fallback) 200 must be labelled, never mistaken for a fresh read, while
 * ordinary fresh 200 renders stay byte-for-byte unchanged.
 */

function fixture<T>(domain: string, name: string): T {
  const raw = JSON.parse(
    readFileSync(
      new URL(`../../../contracts/api/v1/fixtures/${domain}/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as { expectedStatus: number; body: unknown };
  return { status: raw.expectedStatus, body: raw.body } as T;
}

const rateFixture = (name: string) => fixture<RatesApiResult>("rates", name);
const reputationFixture = (name: string) =>
  fixture<ReputationApiListResult>("reputation", name);

// Synthetic metadata: generated well before any test run, so a passing test
// proves the view never substitutes the current time.
const STALE: StaleEvidenceMetadata = Object.freeze({
  state: "stale",
  generatedAt: "2026-08-28T12:00:05.000Z",
  expiresAt: "2026-08-28T12:05:05.000Z",
  sourceTimes: Object.freeze(["2026-08-28T11:59:45.000Z", "2026-08-28T11:59:50.000Z"]),
  snapshotAgeMs: 95_000,
});

function degradedRates(name: string, carrier: "result" | "body"): RatesApiResult {
  const base = rateFixture(name);
  assert.equal(base.status, 200);
  if (base.status !== 200) throw new Error("expected success fixture");
  return carrier === "result"
    ? { status: 200, body: base.body, degraded: STALE }
    : { status: 200, body: { ...base.body, degraded: STALE } };
}

function degradedReputation(name: string, carrier: "result" | "body"): ReputationApiListResult {
  const base = reputationFixture(name);
  if (base.status !== 200) throw new Error("expected success fixture");
  return carrier === "result"
    ? { status: 200, body: base.body, degraded: STALE }
    : { status: 200, body: { ...base.body, degraded: STALE } };
}

const renderRates = (result: RatesApiResult) =>
  renderToStaticMarkup(withTestAppRouter(React.createElement(RatePanelView, { result })));
const renderReputation = (result: ReputationApiListResult) =>
  renderToStaticMarkup(
    withTestAppRouter(React.createElement(ReputationSectionView, { result })),
  );

function assertStaleNotice(html: string): void {
  assert.match(html, /data-testid="stale-evidence-notice"/);
  assert.match(html, /data-evidence-state="stale"/);
  // Non-colour-only: a visible text tag and an accessible status role.
  assert.match(html, /role="status"[^>]*data-evidence-state="stale"/);
  assert.match(html, />Stale fallback</);
  assert.match(html, /retained last-known-good snapshot/);
  assert.match(html, /not re-read\s+or re-verified now/);
  // Original generation time from metadata, rendered by the safe UTC formatter.
  assert.match(html, /<time dateTime="2026-08-28T12:00:05.000Z">2026-08-28 12:00:05 UTC<\/time>/);
  assert.match(html, /1 minute 35 seconds/);
  assert.match(html, /<time dateTime="2026-08-28T12:05:05.000Z">/);
}

// ---------------------------------------------------------------------------
// Metadata detection
// ---------------------------------------------------------------------------

test("degraded metadata is read from the result first, then from the body", () => {
  assert.equal(readDegradedMetadata({ status: 200, body: {} } as never), null);
  assert.deepEqual(readDegradedMetadata({ degraded: STALE, body: {} }), STALE);
  assert.deepEqual(readDegradedMetadata({ body: { degraded: STALE } }), STALE);
  // Malformed or non-stale metadata is not treated as a fallback.
  assert.equal(readDegradedMetadata({ body: { degraded: { state: "fresh" } } }), null);
  assert.equal(readDegradedMetadata({ degraded: "stale", body: null }), null);
});

test("snapshot age is formatted from server metadata only", () => {
  assert.equal(formatSnapshotAge(0), "0 seconds");
  assert.equal(formatSnapshotAge(1_000), "1 second");
  assert.equal(formatSnapshotAge(60_000), "1 minute");
  assert.equal(formatSnapshotAge(95_000), "1 minute 35 seconds");
  assert.equal(formatSnapshotAge(-1), null);
  assert.equal(formatSnapshotAge(Number.NaN), null);
  assert.equal(formatSnapshotAge(undefined), null);
});

// ---------------------------------------------------------------------------
// Rate panel
// ---------------------------------------------------------------------------

test("rate panel: fresh 200 render has no stale notice and keeps its original copy", () => {
  const html = renderRates(rateFixture("healthy-success"));
  assert.doesNotMatch(html, /stale-evidence-notice|Stale fallback|Retained|retained/);
  assert.doesNotMatch(html, /data-evidence-freshness/);
  assert.match(html, /Evaluated <time/);
  assert.match(html, />Median rate</);
  assert.match(html, />healthy</);
});

for (const carrier of ["result", "body"] as const) {
  test(`rate panel: degraded 200 (metadata on ${carrier}) shows a stale notice`, () => {
    const html = renderRates(degradedRates("healthy-success", carrier));
    assertStaleNotice(html);
    assert.match(html, /data-evidence-freshness="stale"/);
  });
}

test("rate panel: a retained healthy median is not presented as newly verified", () => {
  const html = renderRates(degradedRates("healthy-success", "result"));
  // The previously validated median stays visible...
  assert.match(html, /5\.250000000000000000/);
  // ...but labelled as retained, with the original evaluation time.
  assert.match(html, /Median rate \(retained snapshot\)/);
  assert.match(html, /Retained: healthy/);
  assert.doesNotMatch(html, />healthy</);
  assert.match(html, /Originally evaluated <time dateTime="2026-08-28T12:00:00.000Z">/);
  assert.match(html, /not re-evaluated/);
  assert.doesNotMatch(html, /Evaluated <time/);
});

test("rate panel: degraded insufficient_fresh_sources keeps the null-median explanation", () => {
  const html = renderRates(degradedRates("insufficient-success", "body"));
  assertStaleNotice(html);
  assert.match(html, /Median unavailable/);
  assert.match(html, /Retained: insufficient fresh sources/);
  assert.match(html, /No median is published until the fresh independent-observation/);
});

test("rate panel: null median (fresh) is distinct from stale fallback", () => {
  const html = renderRates(rateFixture("insufficient-success"));
  assert.match(html, /Median unavailable/);
  assert.match(html, />insufficient fresh sources</);
  assert.doesNotMatch(html, /stale-evidence-notice/);
});

test("rate panel: legitimate empty result is distinct from stale fallback", () => {
  const html = renderRates(rateFixture("empty-success"));
  assert.match(html, /data-evidence-state="empty"/);
  assert.doesNotMatch(html, /stale-evidence-notice/);
});

test("rate panel: error results render unavailable, never a stale notice", () => {
  for (const name of ["error-internal-500", "error-corridor-not-found-404"]) {
    const html = renderRates(rateFixture(name));
    assert.match(html, /data-evidence-state="unavailable"/);
    assert.doesNotMatch(html, /stale-evidence-notice|data-evidence-state="stale"/);
  }
});

// ---------------------------------------------------------------------------
// Reputation section
// ---------------------------------------------------------------------------

test("reputation: fresh 200 render has no stale notice and keeps its original copy", () => {
  const html = renderReputation(reputationFixture("list-success"));
  assert.doesNotMatch(html, /stale-evidence-notice|Stale fallback|Retained|retained/);
  assert.match(html, />Established</);
  assert.match(html, />95</);
  assert.match(html, /Computed /);
});

for (const carrier of ["result", "body"] as const) {
  test(`reputation: degraded 200 (metadata on ${carrier}) shows a stale notice`, () => {
    const html = renderReputation(degradedReputation("list-success", carrier));
    assertStaleNotice(html);
    assert.match(html, /reputation evaluations/);
  });
}

test("reputation: a retained established score is not presented as a new evaluation", () => {
  const html = renderReputation(degradedReputation("list-success", "result"));
  assert.match(html, />95</);
  assert.match(html, /retained score/);
  assert.match(html, /Retained: Established/);
  assert.doesNotMatch(html, />Established</);
  assert.match(html, /Originally computed <time dateTime="2026-08-28T12:00:00.000Z">/);
  assert.match(html, /not a new evaluation/);
  // Null-score states stay distinct and are labelled as retained too.
  assert.match(html, /Retained: Insufficient evidence/);
  assert.match(html, /Retained: Not yet evaluated/);
});

test("reputation: null scores (fresh) keep their explanatory copy without a stale notice", () => {
  const html = renderReputation(reputationFixture("list-success"));
  assert.match(html, /This anchor has no persisted evaluation yet\./);
  assert.match(html, /Evidence is too sparse for a published score\./);
  assert.doesNotMatch(html, /stale-evidence-notice/);
});

test("reputation: degraded empty list shows both the stale notice and the empty state", () => {
  const html = renderReputation(degradedReputation("list-empty", "body"));
  assertStaleNotice(html);
  assert.match(html, /data-evidence-state="empty"/);
});

test("reputation: error results render unavailable, never a stale notice", () => {
  const html = renderReputation(reputationFixture("list-error-500"));
  assert.match(html, /data-evidence-state="unavailable"/);
  assert.doesNotMatch(html, /stale-evidence-notice/);
});
