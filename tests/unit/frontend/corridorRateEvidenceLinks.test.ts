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

function rates(observations: readonly PublicRateObservation[]): PublicRatesResponse {
  return {
    corridor: {
      slug: "usdc-us-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-11-20T12:00:05.000Z",
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

function anchorHrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
}

test("each persisted observation links to its own anchor evidence detail", () => {
  const html = render(rates([
    observation("anchor-one", "Anchor One"),
    observation("anchor-two", "Anchor Two"),
  ]));

  assert.deepEqual(anchorHrefs(html), ["/anchors/anchor-one", "/anchors/anchor-two"]);
  assert.equal(html.match(/view anchor evidence details/g)?.length ?? 0, 2);
  assert.match(html, /href="\/anchors\/anchor-one"[^>]*>Anchor One/);
  assert.match(html, /href="\/anchors\/anchor-two"[^>]*>Anchor Two/);
  assert.doesNotMatch(html, /href="(?:https?:)?\/\//);
});

test("links keep keyboard focus visible and the table remains scrollable", () => {
  const html = render(rates([observation("anchor-one", "Anchor One")]));

  for (const anchor of html.match(/<a class="[^"]+" href="\/anchors\/[^"]+"/g) ?? []) {
    assert.match(anchor, /focus-visible:outline-2/);
    assert.match(anchor, /focus-visible:outline-\[var\(--accent\)\]/);
    assert.match(anchor, /underline/);
  }
  assert.match(html, /role="region" aria-label="Persisted rate observations"/);
  assert.match(html, /aria-describedby="rate-observations-scroll-hint"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /min-w-\[680px\]/);
  assert.match(html, /Freshness/);
  assert.match(html, /Included/);
  assert.match(html, /fresh/);
});

test("blank names fall back to the reviewed slug and blank slugs render plain text", () => {
  const html = render(rates([
    observation("anchor-one", "   "),
    observation("", ""),
  ]));

  assert.deepEqual(anchorHrefs(html), ["/anchors/anchor-one"]);
  assert.match(html, />anchor-one<span class="sr-only">/);
  assert.match(html, /<td class="px-3 py-3 text-\[var\(--white\)\]">Unavailable<\/td>/);
});

test("unsafe slug characters cannot turn an observation link into an external target", () => {
  const html = render(rates([observation("https://example.com", "Anchor One")]));

  assert.deepEqual(anchorHrefs(html), ["/anchors/https%3A%2F%2Fexample.com"]);
  assert.doesNotMatch(html, /href="https:\/\//);
});

test("empty observations keep the existing empty state", () => {
  const html = render(rates([]));

  assert.deepEqual(anchorHrefs(html), []);
  assert.match(html, /No rate observations are currently persisted for this corridor\./);
  assert.doesNotMatch(html, /view anchor evidence details/);
});
