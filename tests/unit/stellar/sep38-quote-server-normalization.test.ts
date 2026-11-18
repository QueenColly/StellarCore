import assert from "node:assert/strict";
import test from "node:test";

import { normalizeSep38QuoteServer, Sep38ClientError } from "@/lib/stellar/sep38";
import { runRateEngine } from "@/lib/rates/rateEngine";
import type { RateCandidate, RateSnapshotRepository } from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";

const USDC = "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as const;
const USD = "iso4217:USD" as const;

const EQUIVALENT_VARIANTS: readonly string[] = Object.freeze([
  "https://anchor.example/sep38/",
  "https://anchor.example/sep38//",
  "https://ANCHOR.EXAMPLE/sep38/",
  "https://anchor.example:443/sep38",
  "https://anchor.example/sep38",
]);

function invalid(
  value: string,
  expectation: (error: Sep38ClientError) => boolean = () => true,
): void {
  assert.throws(() => normalizeSep38QuoteServer(value), (error) => {
    assert.ok(error instanceof Sep38ClientError);
    assert.equal(error.code, "INVALID_QUOTE_SERVER");
    assert.ok(expectation(error));
    return true;
  });
}

test("equivalent quote-server variants collapse to one canonical evidence source identity", () => {
  const normalized = new Set(EQUIVALENT_VARIANTS.map((variant) =>
    normalizeSep38QuoteServer(variant)));

  assert.deepEqual([...normalized], ["https://anchor.example/sep38"]);
});

test("normalization is idempotent so source identity stays stable across repeated runs", () => {
  for (const variant of EQUIVALENT_VARIANTS) {
    const once = normalizeSep38QuoteServer(variant);
    assert.equal(normalizeSep38QuoteServer(once), once);
  }

  const firstRun = EQUIVALENT_VARIANTS.map(normalizeSep38QuoteServer);
  const secondRun = EQUIVALENT_VARIANTS.map(normalizeSep38QuoteServer);
  assert.deepEqual(secondRun, firstRun);
});

test("meaningfully different quote servers are not collapsed incorrectly", () => {
  const identities = [
    normalizeSep38QuoteServer("https://anchor.example/sep38"),
    normalizeSep38QuoteServer("https://anchor.example/sep38x"),
    normalizeSep38QuoteServer("https://other-anchor.example/sep38"),
    normalizeSep38QuoteServer("https://anchor.example/v2/sep38"),
  ];

  assert.equal(new Set(identities).size, identities.length);
});

test("credentials, queries, and fragments are rejected safely under current policy", () => {
  const secret = "s3cret-value";

  for (const value of [
    `https://user:${secret}@anchor.example/sep38`,
    `https://anchor.example/sep38?token=${secret}`,
    `https://anchor.example/sep38#${secret}`,
  ]) {
    invalid(value, (error) =>
      !error.message.includes(secret) && !error.endpoint.includes(secret));
  }
});

test("insecure or unresolvable-capable hosts are rejected by the documented policy", () => {
  for (const value of [
    "http://anchor.example/sep38",
    "https://localhost/sep38",
    "https://127.0.0.1/sep38",
    "https://8.8.8.8/sep38",
    "https://anchor.example:8443/sep38",
    "not-a-url",
  ]) {
    invalid(value);
  }
});

test("rejected input is reported with a redacted public endpoint instead of the raw URL", () => {
  invalid("https://user:secret@anchor.example/sep38", (error) => {
    assert.equal(error.endpoint, "https://anchor.example/sep38");
    return true;
  });
});

test("duplicate candidate identity skips re-ingesting the same reviewed source in one run", async () => {
  let observedIdentities = 0;
  const quote: RateCandidate = Object.freeze({
    anchorSlug: "moneygram",
    corridor: Object.freeze({
      slug: "usdc-us-usd-us",
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "USD",
      countryTo: "US",
    }),
    request: Object.freeze({
      sellAsset: USDC,
      buyAsset: USD,
      sellAmount: "100",
      context: "sep31",
    }),
    configurationDigest: "d".repeat(64),
  });

  const result = await runRateEngine([quote, quote], {
    quote: (candidate) => {
      observedIdentities += 1;
      return Promise.resolve(indicative(candidate));
    },
    repository: repository(),
    now: () => new Date("2026-08-27T12:00:00.000Z"),
  });

  assert.equal(observedIdentities, 1);
  assert.equal(result.skipped, 1);
  assert.equal(result.skippedSources[0]?.reason, "DUPLICATE_CANDIDATE");
  assert.equal(result.snapshotsPersisted, 1);
});

function indicative(candidate: RateCandidate): Sep38IndicativePrice {
  return Object.freeze({
    sellAsset: candidate.request.sellAsset,
    buyAsset: candidate.request.buyAsset,
    totalPrice: "1",
    price: "1",
    sellAmount: candidate.request.sellAmount ?? "100",
    buyAmount: "100",
    fee: Object.freeze({ total: "0", asset: candidate.request.buyAsset, details: Object.freeze([]) }),
  });
}

function repository(): RateSnapshotRepository {
  let count = 0;
  return {
    findAnchorBySlug: async (slug) => ({ id: slug }),
    findCorridorBySlug: async (slug) => ({ id: slug }),
    hasAssociation: async () => true,
    createSnapshot: async (input) => ({
      id: `snapshot-${++count}`,
      provenanceId: `provenance-${count}`,
      ...input,
    }),
  };
}
