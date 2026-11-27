import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ReputationStateDistributionView } from "@/app/insights/reputation-state-distribution/ReputationStateDistributionView";
import {
  classifyReputation,
  summarizeReputationStates,
} from "@/lib/reputation/stateDistribution";
import type {
  PublicReputation,
  PublicReputationListResponse,
} from "@/types/api/reputation";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/reputation-state-distribution/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/reputation-state-distribution/ReputationStateDistributionView.tsx", import.meta.url),
  "utf8",
);
const libSource = readFileSync(
  new URL("../../../lib/reputation/stateDistribution.ts", import.meta.url),
  "utf8",
);

const COMPUTED = "2026-11-20T10:00:00.000Z";

function established(slug: string, score: number | null, band: PublicReputation["scoreBand"]): PublicReputation {
  return {
    anchor: { slug, name: `Anchor ${slug}` },
    state: "established",
    score,
    scoreBand: band,
    evidence: { outcomeCount: 50 },
    metrics: null,
    computedAt: COMPUTED,
  };
}

function unpublished(slug: string, state: "insufficient_evidence" | "not_evaluated"): PublicReputation {
  return {
    anchor: { slug, name: `Anchor ${slug}` },
    state,
    score: null,
    scoreBand: null,
    evidence: state === "not_evaluated" ? null : { outcomeCount: 2 },
    metrics: null,
    computedAt: state === "not_evaluated" ? null : "2026-11-19T08:00:00.000Z",
  };
}

function list(
  reputation: readonly PublicReputation[],
  degraded?: StaleEvidenceMetadata,
  count = reputation.length,
): PublicReputationListResponse {
  return { ...(degraded ? { degraded } : {}), reputation, count };
}

function render(response: PublicReputationListResponse | null, error: string | null = null): string {
  return renderToStaticMarkup(
    createElement(ReputationStateDistributionView, { response, error }),
  ).replaceAll("<!-- -->", "");
}

// --- logic -------------------------------------------------------------------

test("no anchors: zero denominators and no invented proportions", () => {
  const summary = summarizeReputationStates(list([]));
  assert.equal(summary.returned, 0);
  assert.deepEqual(summary.states.established, { count: 0, denominator: 0, percent: null });
  assert.deepEqual(summary.bands.red, { count: 0, denominator: 0, percent: null });
  const html = render(list([]));
  assert.match(html, /role="status" data-testid="reputation-distribution-empty"/);
  assert.match(html, /missing evidence, not a request failure/);
  assert.doesNotMatch(html, /role="alert"/);
});

test("all unpublished: no band, never red or zero", () => {
  const summary = summarizeReputationStates(
    list([unpublished("a", "insufficient_evidence"), unpublished("b", "not_evaluated")]),
  );
  assert.equal(summary.states.insufficient_evidence.count, 1);
  assert.equal(summary.states.not_evaluated.count, 1);
  assert.equal(summary.states.established.count, 0);
  assert.equal(summary.bands.red.count, 0);
  assert.ok(summary.records.every((r) => r.band === null && r.score === null));

  const html = render(list([unpublished("a", "insufficient_evidence"), unpublished("b", "not_evaluated")]));
  assert.match(html, /data-testid="reputation-distribution-no-bands"/);
  assert.doesNotMatch(html, /Red band/);
  assert.doesNotMatch(html, /published score 0/);
});

test("mixed established bands use only valid published records as the band denominator", () => {
  const summary = summarizeReputationStates(
    list([
      established("a", 97, "green"),
      established("b", 85, "amber"),
      established("c", 40, "red"),
      established("d", 99, "green"),
      unpublished("e", "insufficient_evidence"),
    ]),
  );
  assert.deepEqual(summary.states.established, { count: 4, denominator: 5, percent: 80 });
  assert.deepEqual(summary.bands.green, { count: 2, denominator: 4, percent: 50 });
  assert.deepEqual(summary.bands.amber, { count: 1, denominator: 4, percent: 25 });
  assert.deepEqual(summary.bands.red, { count: 1, denominator: 4, percent: 25 });
});

test("null score with established state is inconsistent, not reconstructed", () => {
  const record = classifyReputation(established("a", null, "green"));
  assert.equal(record.category, "established_inconsistent");
  assert.equal(record.inconsistency, "null_score");
  assert.equal(record.band, null);
  const html = render(list([established("a", null, "green")]));
  assert.match(html, /established state but no published score/);
  assert.match(html, /data-testid="reputation-distribution-no-bands"/);
});

test("zero is a legitimate published score when the contract allows it", () => {
  const record = classifyReputation(established("a", 0, "red"));
  assert.equal(record.category, "established");
  assert.equal(record.score, 0);
  assert.equal(record.band, "red");
  const html = render(list([established("a", 0, "red")]));
  assert.match(html, /Red band, published score 0/);
});

test("malformed, missing, or out-of-contract band/score fields are inconsistent", () => {
  const malformedBand = { ...established("a", 90, "green"), scoreBand: "purple" } as unknown as PublicReputation;
  assert.equal(classifyReputation(malformedBand).inconsistency, "malformed_band");
  assert.equal(classifyReputation(established("b", 90, null)).inconsistency, "missing_band");
  assert.equal(classifyReputation(established("c", 140, "green")).inconsistency, "invalid_score");
  const unknown = { ...unpublished("d", "not_evaluated"), state: "pending" } as unknown as PublicReputation;
  assert.equal(classifyReputation(unknown).category, "unknown_state");

  const html = render(list([malformedBand, established("e", 96, "green")]));
  assert.match(html, /published band is not green, amber, or red/);
  assert.match(html, /1 of 1 published records \(100%\)/);
  // Rating is never recomputed from thresholds.
  assert.doesNotMatch(libSource, /REPUTATION_BANDS\b|greenMinimum|amberMinimum/);
});

test("stale fallback is labelled with generation time; malformed metadata is unverified", () => {
  const html = render(
    list([established("a", 97, "green")], {
      state: "stale",
      generatedAt: "2026-11-20T12:00:05.000Z",
      expiresAt: "2026-11-21T12:00:05.000Z",
      sourceTimes: [COMPUTED],
      snapshotAgeMs: 3_600_000,
    }),
  );
  assert.match(html, /data-testid="reputation-distribution-stale"/);
  assert.match(html, /<time dateTime="2026-11-20T12:00:05.000Z"/);
  assert.match(html, /1 hour old when served/);
  assert.match(html, /not a fresh read/);

  const unverified = render(
    list([established("a", 97, "green")], { state: "stale" } as unknown as StaleEvidenceMetadata),
  );
  assert.match(unverified, /metadata is missing or malformed/);
});

test("failed fetch is an operational alert, never empty evidence", () => {
  const html = render(null, "Unable to load reputation.");
  assert.match(html, /role="alert" data-testid="reputation-distribution-error"/);
  assert.match(html, /operational error, not missing evidence/);
  assert.match(html, /Unable to load reputation\./);
  assert.doesNotMatch(html, /reputation-distribution-empty|reputation-distribution-states/);
  assert.match(html, /href="\/insights\/reputation-state-distribution"[^>]*>Retry request/);
});

test("completeness: returned-record denominators, count mismatch, and evaluation metadata", () => {
  const html = render(list([established("a", 97, "green"), unpublished("b", "insufficient_evidence")], undefined, 5));
  assert.match(html, /API count: 5/);
  assert.match(html, /may be incomplete/);
  assert.match(html, /only the 2 returned records/);
  assert.match(html, /<time dateTime="2026-11-19T08:00:00.000Z"/);
  assert.match(html, /<time dateTime="2026-11-20T10:00:00.000Z"/);
  assert.match(html, /reviewed configuration/);
});

test("accessible structure: headings, captions, scoped headers, focusable region, linked anchors", () => {
  const html = render(
    list([established("b", 85, "amber"), established("a", 97, "green"), unpublished("c", "not_evaluated")]),
  );
  assert.match(html, /<h3 id="reputation-states-heading"/);
  assert.match(html, /<h3 id="reputation-bands-heading"/);
  assert.match(html, /<h4/);
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
  assert.match(html, /scope="row"/);
  assert.match(html, /role="region" aria-label="Reputation states table" tabindex="0"/);
  assert.match(html, /href="\/anchors\/a"/);
  assert.match(html, /href="\/anchors\/c"/);
  // Alphabetical, not ranked by score.
  assert.ok(html.indexOf('href="/anchors/a"') < html.indexOf('href="/anchors/b"'));
  assert.match(html, /This is not a ranking/);
});

test("page reads only the public reputation list helper and writes nothing", () => {
  assert.match(pageSource, /import \{ getReputationApiResult \} from "@\/lib\/api\/reputation"/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /<nav aria-label="Breadcrumb"/);
  assert.doesNotMatch(pageSource + viewSource + libSource, /prisma|\.create\(|\.update\(|\.delete\(/i);
  assert.doesNotMatch(viewSource, /most trusted|least trusted|best anchor|worst anchor/i);
});
