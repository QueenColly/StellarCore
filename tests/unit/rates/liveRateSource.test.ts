import assert from "node:assert/strict";
import test from "node:test";

import { ANCHOR_REGISTRY } from "@/constants/anchors";
import { ANCHOR_CORRIDOR_REGISTRY, CORRIDOR_REGISTRY } from "@/constants/corridors";
import {
  REVIEWED_LIVE_RATE_SOURCES,
  ZEAM_BRL_ASSET,
  ZEAM_USDC_ASSET,
} from "@/constants/liveRateSources";
import {
  buildReviewedLiveRateCandidates,
  fetchReviewedIndicativeRate,
  formatLiveRateRunSummary,
  LiveRateSourceError,
} from "@/lib/rates/liveRateSource";
import type { LiveRateSourceDependencies } from "@/lib/rates/liveRateSource";
import type { RateEngineResult } from "@/types/rates";

const QUOTE_SERVER = "https://anchor.zeam.money/sep38";

function dependencies(pairAdvertised = true): LiveRateSourceDependencies {
  return {
    discover: async (entry) => Object.freeze({
      ...entry,
      tomlUrl: `https://${entry.homeDomain}/.well-known/stellar.toml`,
      organizationName: "ZEAM LIMITED",
      organizationUrl: "https://zeam.money/",
      networkPassphrase: "Public Global Stellar Network ; September 2015",
      seps: Object.freeze([1, 10, 24, 31, 38] as const),
      isTransferCapable: true,
      endpoints: Object.freeze({ anchorQuoteServer: QUOTE_SERVER }),
      assets: Object.freeze([]),
    }),
    prices: async (_server, request) => Object.freeze({
      direction: "sell" as const,
      requestedAsset: request.sellAsset!,
      requestedAmount: request.sellAmount!,
      pairs: pairAdvertised
        ? Object.freeze([Object.freeze({
            sellAsset: ZEAM_USDC_ASSET,
            buyAsset: ZEAM_BRL_ASSET,
            price: "0.18",
            decimals: 2,
          })])
        : Object.freeze([]),
    }),
  };
}

test("Zeam registry and corridor mapping remain minimal and explicit", () => {
  assert.deepEqual(ANCHOR_REGISTRY.find(({ slug }) => slug === "zeam"), {
    slug: "zeam",
    name: "Zeam",
    homeDomain: "zeam.money",
  });
  assert.deepEqual(CORRIDOR_REGISTRY.find(({ slug }) => slug === "usdc-us-brl-br"), {
    slug: "usdc-us-brl-br",
    assetCodeFrom: "USDC",
    countryFrom: "US",
    assetCodeTo: "BRL",
    countryTo: "BR",
  });
  assert.deepEqual(
    ANCHOR_CORRIDOR_REGISTRY.find(({ anchorSlug }) => anchorSlug === "zeam")?.corridorSlugs,
    ["usdc-us-brl-br"],
  );
});

test("candidate construction correlates the exact issuer-bearing SEP-38 pair", async () => {
  const [candidate] = await buildReviewedLiveRateCandidates(
    REVIEWED_LIVE_RATE_SOURCES,
    dependencies(),
  );
  assert.equal(candidate?.quoteServer, QUOTE_SERVER);
  assert.deepEqual(candidate?.request, {
    sellAsset: ZEAM_USDC_ASSET,
    buyAsset: ZEAM_BRL_ASSET,
    sellAmount: "100",
    buyDeliveryMethod: "PIX",
    countryCode: "BR",
    context: "sep31",
  });
});

test("candidate construction rejects a live /prices response without the reviewed pair", async () => {
  await assert.rejects(
    buildReviewedLiveRateCandidates(REVIEWED_LIVE_RATE_SOURCES, dependencies(false)),
    (error) => error instanceof LiveRateSourceError && error.code === "PAIR_NOT_ADVERTISED",
  );
});

test("indicative adapter uses only the prepared public price boundary", async () => {
  const [candidate] = await buildReviewedLiveRateCandidates(
    REVIEWED_LIVE_RATE_SOURCES,
    dependencies(),
  );
  let observedServer = "";
  const quote = await fetchReviewedIndicativeRate(candidate!, async (server, request) => {
    observedServer = server;
    assert.equal(request.context, "sep31");
    return {
      sellAsset: ZEAM_USDC_ASSET,
      buyAsset: ZEAM_BRL_ASSET,
      totalPrice: "0.18",
      price: "0.17",
      sellAmount: "100",
      buyAmount: "17",
      fee: { total: "1", asset: ZEAM_BRL_ASSET, details: [] },
    };
  });
  assert.equal(observedServer, QUOTE_SERVER);
  assert.equal(quote.fee.asset, ZEAM_BRL_ASSET);
});

test("safe summary excludes remote metadata and retains only normalized snapshot fields", () => {
  const result: RateEngineResult = Object.freeze({
    captureRunId: "run-1",
    totalCandidates: 1,
    totalAttempted: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
    snapshotsPersisted: 1,
    snapshots: Object.freeze([Object.freeze({
      id: "snapshot-1",
      anchorSlug: "zeam",
      corridorSlug: "usdc-us-brl-br",
      rate: "0.17",
      sourceAmount: "100",
      destinationAmount: "17",
      fee: "1",
      capturedAt: new Date("2026-08-27T12:00:00.000Z"),
    })]),
    failures: Object.freeze([]),
    skippedSources: Object.freeze([]),
  });
  const summary = formatLiveRateRunSummary(result);
  assert.deepEqual(summary.snapshots, [{
    id: "snapshot-1",
    anchorSlug: "zeam",
    corridorSlug: "usdc-us-brl-br",
    rate: "0.17",
    capturedAt: "2026-08-27T12:00:00.000Z",
  }]);
  assert.equal(JSON.stringify(summary).includes("sourceAmount"), false);
  assert.equal(JSON.stringify(summary).includes("quoteServer"), false);
});
