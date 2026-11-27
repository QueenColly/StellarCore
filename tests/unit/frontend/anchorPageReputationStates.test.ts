import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import test, { before } from "node:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  PublicReputation,
  ReputationApiDetailResult,
} from "@/types/api/reputation";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/anchors/[slug]/page.tsx", import.meta.url),
  "utf8",
);

type StubState = Readonly<{
  anchorResult: unknown;
  reputationResult: unknown;
}>;

const globals = globalThis as typeof globalThis & { __anchorPageStub?: StubState };

globals.__anchorPageStub = {
  anchorResult: {
    status: 200,
    body: {
      anchor: {
        slug: "anchor-one",
        name: "Anchor One",
        homeDomain: "one.example",
        status: "LIVE",
        seps: [],
        isTransferCapable: false,
        corridors: [{
          slug: "usdc-us-br",
          sourceAsset: "USDC",
          sourceCountry: "US",
          destinationAsset: "BRL",
          destinationCountry: "BR",
        }],
      },
    },
  },
  reputationResult: null,
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/api/reputation" || specifier === "@/lib/api/anchors") {
      return {
        url: `stub:${specifier.slice(2)}`,
        format: "commonjs",
        shortCircuit: true,
      };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith("stub:")) {
      const source = url.endsWith("api/reputation")
        ? "exports.getAnchorReputationApiResult = async () => globalThis.__anchorPageStub.reputationResult;"
        : "exports.getAnchorApiResult = async () => globalThis.__anchorPageStub.anchorResult;";
      return { format: "commonjs", source, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

type AnchorPageFn = (props: {
  params: Promise<Readonly<{ slug: string }>>;
}) => Promise<ReactNode>;

let AnchorPage: AnchorPageFn;

before(async () => {
  const pageModule = await import("@/app/anchors/[slug]/page");
  const pageExport: unknown = pageModule.default;
  AnchorPage = (
    typeof pageExport === "function"
      ? pageExport
      : (pageExport as { default: unknown }).default
  ) as AnchorPageFn;
});

async function renderPage(result: ReputationApiDetailResult): Promise<string> {
  globals.__anchorPageStub = { ...globals.__anchorPageStub!, reputationResult: result };
  const node = await AnchorPage({ params: Promise.resolve({ slug: "anchor-one" }) });
  return renderToStaticMarkup(withTestAppRouter(node));
}

const ANCHOR = { slug: "anchor-one", name: "Anchor One" } as const;

function success(reputation: PublicReputation): ReputationApiDetailResult {
  return { status: 200, body: { reputation } };
}

const NOT_EVALUATED: PublicReputation = {
  anchor: ANCHOR,
  state: "not_evaluated",
  score: null,
  scoreBand: null,
  evidence: null,
  metrics: null,
  computedAt: null,
};

const ESTABLISHED: PublicReputation = {
  anchor: ANCHOR,
  state: "established",
  score: 82,
  scoreBand: "green",
  evidence: { outcomeCount: 41 },
  metrics: {
    fillRate7d: 0.91,
    fillRate30d: 0.88,
    fillRate90d: 0.84,
    settleP50Ms: 1200,
    settleP95Ms: 3400,
    slippageP50: 0.01,
    slippageP95: 0.04,
  },
  computedAt: "2026-11-20T12:00:00.000Z",
};

test("a failed reputation read stays distinct from missing evidence and keeps anchor details", async () => {
  const html = await renderPage({
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "postgres refused at db.internal:5432 using token secret-123",
      },
    },
  });

  assert.match(html, /role="alert"/);
  assert.match(html, /data-reputation-state="error"/);
  assert.match(html, /Unable to load reputation evidence\./);
  assert.match(html, /Reload this page to try again\./);
  assert.match(html, /Other anchor details remain available\./);
  assert.match(html, /Anchor One/);
  assert.match(html, /Synced/);
  assert.match(html, /Advertised interfaces/);
  assert.match(html, /USDC → BRL/);
  assert.doesNotMatch(html, /db\.internal|postgres|secret-123|refused/i);
  assert.doesNotMatch(html, /Not yet evaluated|Insufficient evidence|Established|\/100/);
});

test("a valid not_evaluated result keeps its unscored state without an alert", async () => {
  const html = await renderPage(success(NOT_EVALUATED));

  assert.match(html, /Not yet evaluated/);
  assert.match(html, /This anchor has no persisted evaluation yet\./);
  assert.doesNotMatch(html, /role="alert"|data-reputation-state="error"/);
  assert.doesNotMatch(html, /\/100|Unable to load reputation evidence/);
});

test("an insufficient_evidence result is distinct from a failed read", async () => {
  const html = await renderPage(success({
    ...NOT_EVALUATED,
    state: "insufficient_evidence",
  }));

  assert.match(html, /Insufficient evidence/);
  assert.match(html, /Evidence is too sparse for a published score\./);
  assert.doesNotMatch(html, /role="alert"|\/100/);
});

test("an established result still renders its score, outcomes and metrics", async () => {
  const html = await renderPage(success(ESTABLISHED));

  assert.match(html, /Established/);
  assert.match(html, />82</);
  assert.match(html, /\/100/);
  assert.match(html, /green/);
  assert.match(html, /Outcomes evaluated/);
  assert.match(html, />41</);
  assert.match(html, /Fill rate 7d/);
  assert.doesNotMatch(html, /role="alert"|Unable to load reputation evidence/);
});

test("the page consumes the reputation result without discarding its status", () => {
  assert.match(pageSource, /const reputationResult = await getAnchorReputationApiResult\(slug\);/);
  assert.match(pageSource, /<AnchorReputationSection result=\{reputationResult\} \/>/);
  assert.match(pageSource, /result\.status === 200/);
  assert.doesNotMatch(pageSource, /reputationResult\.status === 200[\s\S]*?notFound\(\)/);
});
