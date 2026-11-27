import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MIN_REPUTATION_OUTCOMES } from "@/constants/reputation";
import type {
  PublicReputationListResponse,
  ReputationApiErrorResponse,
} from "@/types/api/reputation";
import {
  anchorDetailHref,
  describeReadiness,
  parseReadinessEntry,
  parseReadinessList,
  readApiErrorMessage,
} from "@/app/insights/reputation-readiness/readiness";
import { ReadinessView } from "@/app/insights/reputation-readiness/ReadinessView";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

type FixtureBody = PublicReputationListResponse & ReputationApiErrorResponse;

function fixtureBody(name: string): FixtureBody {
  return JSON.parse(readFileSync(
    new URL(`../../../contracts/api/v1/fixtures/reputation/${name}.json`, import.meta.url),
    "utf8",
  )).body;
}

function render(state: Parameters<typeof ReadinessView>[0]["state"]): string {
  return renderToStaticMarkup(withTestAppRouter(
    React.createElement(ReadinessView, { state, minimumOutcomes: MIN_REPUTATION_OUTCOMES }),
  ));
}

function card(html: string, state: string): string {
  return html.match(new RegExp(`<li[^>]*data-readiness-state="${state}"[\\s\\S]*?</li>`))?.[0] ?? "";
}

const pageSource = readFileSync(
  new URL("../../../app/insights/reputation-readiness/page.tsx", import.meta.url),
  "utf8",
);

test("distinguishes not evaluated, insufficient evidence, and established", () => {
  const list = parseReadinessList(fixtureBody("list-success"))!;
  const html = render({ kind: "ready", list });
  assert.match(card(html, "not_evaluated"), /Not evaluated/);
  assert.match(card(html, "insufficient_evidence"), /Insufficient evidence/);
  assert.match(card(html, "established"), /Established/);
});

test("null scores stay unavailable and are never replaced by zero or estimates", () => {
  const list = parseReadinessList(fixtureBody("list-success"))!;
  const html = render({ kind: "ready", list });
  for (const state of ["not_evaluated", "insufficient_evidence"]) {
    const score = card(html, state).match(/data-testid="readiness-score"[^>]*>([^<]*)</)?.[1];
    assert.equal(score, "Unavailable", state);
  }
  assert.equal(card(html, "established").match(/data-testid="readiness-score"[^>]*>([^<]*)</)?.[1], "95 (green)");

  // Even with metrics and a large outcome count, a null score is never computed.
  const entry = parseReadinessEntry({
    ...fixtureBody("list-success").reputation[2],
    state: "insufficient_evidence",
    score: null,
    scoreBand: null,
  })!;
  assert.equal(entry.score, null);
  assert.equal(describeReadiness(entry, MIN_REPUTATION_OUTCOMES).scoreLabel, "Unavailable");

  // A non-established state never displays a score, even if one leaked into the payload.
  const leaked = parseReadinessEntry({ ...fixtureBody("list-success").reputation[0], score: 0 })!;
  assert.equal(describeReadiness(leaked, MIN_REPUTATION_OUTCOMES).scoreLabel, "Unavailable");

  const establishedNull = parseReadinessEntry({ ...fixtureBody("list-success").reputation[2], score: null })!;
  assert.equal(describeReadiness(establishedNull, MIN_REPUTATION_OUTCOMES).scoreLabel, "Unavailable");
});

test("outcome counts appear only when evidence exists", () => {
  const list = parseReadinessList(fixtureBody("list-success"))!;
  const html = render({ kind: "ready", list });
  const notEvaluated = card(html, "not_evaluated");
  assert.match(notEvaluated, /No outcome evidence recorded/);
  assert.doesNotMatch(notEvaluated, /role="progressbar"/);
  assert.doesNotMatch(notEvaluated, /\d+ of \d+ minimum/);

  const insufficient = card(html, "insufficient_evidence");
  assert.match(insufficient, new RegExp(`5 of ${MIN_REPUTATION_OUTCOMES} minimum recorded outcomes`));
  assert.match(insufficient, /role="progressbar"/);
  assert.match(insufficient, /Not computed|UTC/);
});

test("threshold is explained as necessary but not sufficient", () => {
  assert.match(pageSource, /MIN_REPUTATION_OUTCOMES/);
  assert.match(pageSource, /necessary but not sufficient/);
  assert.match(pageSource, /associated reviewed corridor/);
  assert.match(pageSource, /latest rate observation/);

  const metThreshold = parseReadinessEntry({
    anchor: { slug: "cowrie", name: "Cowrie" },
    state: "insufficient_evidence",
    score: null,
    scoreBand: null,
    evidence: { outcomeCount: MIN_REPUTATION_OUTCOMES + 4 },
    metrics: null,
    computedAt: "2026-08-28T12:00:00.000Z",
  })!;
  const note = describeReadiness(metThreshold, MIN_REPUTATION_OUTCOMES).thresholdNote;
  assert.match(note, /outcome minimum is met, but no score was published/);

  const below = describeReadiness(parseReadinessList(fixtureBody("list-success"))!.entries[0]!, MIN_REPUTATION_OUTCOMES);
  assert.match(below.thresholdNote, /25 more recorded outcomes/);
  assert.match(below.thresholdNote, /does not guarantee a score/);
});

test("each anchor links to the existing detail route with a safe slug", () => {
  const html = render({ kind: "ready", list: parseReadinessList(fixtureBody("list-success"))! });
  for (const slug of ["cowrie", "moneygram", "zeam"]) {
    assert.match(html, new RegExp(`href="/anchors/${slug}"`));
  }
  assert.equal(anchorDetailHref("../internal"), null);
  assert.equal(anchorDetailHref("zeam?x=1"), null);
});

test("handles empty, degraded, 500, malformed, and loading states", () => {
  assert.match(render({ kind: "ready", list: parseReadinessList(fixtureBody("list-empty"))! }), /No reputation records/);

  const degraded = parseReadinessList({
    ...fixtureBody("list-success"),
    degraded: { state: "stale", generatedAt: "2026-08-28T11:58:00.000Z", expiresAt: "x", sourceTimes: [], snapshotAgeMs: 1 },
  })!;
  assert.match(render({ kind: "ready", list: degraded }), /data-evidence-state="stale"[\s\S]*Degraded/);
  assert.ok(parseReadinessList(fixtureBody("list-success"), "stale")!.stale);

  const errorBody = fixtureBody("list-error-500");
  const message = readApiErrorMessage(errorBody)!;
  const errorHtml = render({ kind: "error", status: 500, message });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /no score is implied/);
  assert.doesNotMatch(errorHtml, /readiness-score/);

  assert.equal(parseReadinessList({ error: {} }), null);
  assert.equal(parseReadinessEntry({ anchor: { slug: "x" }, state: "great" }), null);
  assert.match(render({ kind: "loading" }), /aria-busy="true"/);
});

test("no fabricated reputation values appear in route sources", () => {
  for (const file of ["readiness.ts", "ReadinessView.tsx", "ReadinessClient.tsx", "page.tsx"]) {
    const source = readFileSync(new URL(`../../../app/insights/reputation-readiness/${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /score\s*\?\?\s*0|score\s*\|\|\s*0|Math\.random/, file);
    assert.doesNotMatch(source, /\/api\/internal/, file);
  }
});
