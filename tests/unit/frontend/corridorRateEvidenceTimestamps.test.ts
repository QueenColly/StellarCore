import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { CorridorRateEvidence } from "@/components/corridors/CorridorRateEvidence";
import type {
  PublicRateObservation,
  PublicRatesResponse,
} from "@/types/api/rates";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

function observation(
  slug: string,
  name: string,
  overrides: Partial<PublicRateObservation> = {},
): PublicRateObservation {
  return {
    anchor: { slug, name },
    rate: "5.25",
    sourceAmount: "1",
    destinationAmount: "5.25",
    fee: "0",
    capturedAt: "2026-11-20T12:00:00.000Z",
    freshness: { state: "fresh", ageMs: 1000 },
    eligibleForMedian: true,
    ...overrides,
  };
}

function rates(
  evaluatedAt: string,
  observations: readonly PublicRateObservation[],
): PublicRatesResponse {
  return {
    corridor: {
      slug: "usdc-us-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt,
    state: "healthy",
    medianRate: "5.25",
    sourceCount: observations.length,
    freshSourceCount: observations.length,
    reviewedCandidateConfiguration: { candidateCount: 2, uniqueAnchorCount: 2 },
    medianRequirement: { minimumFreshIndependentSources: 2 },
    observations,
  };
}

function render(value: PublicRatesResponse): string {
  return renderToStaticMarkup(createElement(CorridorRateEvidence, { rates: value }));
}

function timeElements(html: string): string[] {
  return html.match(/<time\b[^>]*>[^<]*<\/time>/g) ?? [];
}

test("valid ISO UTC timestamps render explicit UTC with canonical dateTime values", () => {
  const html = render(rates("2026-11-20T12:00:05.000Z", [
    observation("anchor-one", "Anchor One", {
      capturedAt: "2026-11-20T11:59:50.000Z",
    }),
  ]));

  const times = timeElements(html);
  assert.deepEqual(times, [
    '<time dateTime="2026-11-20T12:00:05.000Z">2026-11-20 12:00:05 UTC</time>',
    '<time dateTime="2026-11-20T11:59:50.000Z">2026-11-20 11:59:50 UTC</time>',
  ]);
  assert.doesNotMatch(html, /Invalid Date/);
  assert.doesNotMatch(html, /toLocaleString/);
});

test("timezone-offset ISO input keeps the same UTC instant", () => {
  const html = render(rates("2026-11-20T14:00:00+02:00", [
    observation("anchor-one", "Anchor One", {
      capturedAt: "2026-11-20T07:00:00-05:00",
    }),
  ]));

  const expected =
    '<time dateTime="2026-11-20T12:00:00.000Z">2026-11-20 12:00:00 UTC</time>';
  assert.deepEqual(timeElements(html), [expected, expected]);
  assert.doesNotMatch(html, /14:00:00|07:00:00/);
  assert.doesNotMatch(html, /[+-]\d{2}:\d{2}/);
});

test("missing and invalid timestamps display Unavailable instead of a time element", () => {
  const cases = [
    { evaluatedAt: "", capturedAt: "not-a-timestamp" },
    { evaluatedAt: "2026-13-45T12:00:00Z", capturedAt: "   " },
  ] as const;

  for (const { evaluatedAt, capturedAt } of cases) {
    const html = render(rates(evaluatedAt, [
      observation("anchor-one", "Anchor One", { capturedAt }),
    ]));

    assert.equal(html.match(/<span>Unavailable<\/span>/g)?.length ?? 0, 2);
    assert.deepEqual(timeElements(html), []);
    assert.doesNotMatch(html, /Invalid Date|UTC/);
    assert.match(html, /Freshness/);
  }
});

test("multiple observation rows each retain their own timestamp and evidence labels", () => {
  const html = render(rates("2026-11-20T12:00:05.000Z", [
    observation("anchor-one", "Anchor One", {
      capturedAt: "2026-11-20T12:00:00.000Z",
    }),
    observation("anchor-two", "Anchor Two", {
      capturedAt: "2026-11-20T11:59:30.000Z",
      freshness: { state: "stale", ageMs: 120_000 },
      eligibleForMedian: false,
      exclusionReason: "stale",
    }),
    observation("anchor-three", "Anchor Three", {
      capturedAt: "2026-11-20T13:58:00+02:00",
    }),
  ]));

  assert.deepEqual(timeElements(html), [
    '<time dateTime="2026-11-20T12:00:05.000Z">2026-11-20 12:00:05 UTC</time>',
    '<time dateTime="2026-11-20T12:00:00.000Z">2026-11-20 12:00:00 UTC</time>',
    '<time dateTime="2026-11-20T11:59:30.000Z">2026-11-20 11:59:30 UTC</time>',
    '<time dateTime="2026-11-20T11:58:00.000Z">2026-11-20 11:58:00 UTC</time>',
  ]);
  assert.equal(html.match(/<tr/g)?.length ?? 0, 4);
  assert.match(html, /Included/);
  assert.match(html, /Excluded — stale/);
  assert.match(html, /fresh/);
  assert.match(html, /stale/);
  assert.match(html, /role="region" aria-label="Persisted rate observations"/);
  assert.match(html, /aria-describedby="rate-observations-scroll-hint"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /min-w-\[680px\]/);
});
