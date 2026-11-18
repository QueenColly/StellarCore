import assert from "node:assert/strict";
import test from "node:test";

import { runRateEngine } from "@/lib/rates/rateEngine";
import {
  parseSep38IndicativePrice,
  Sep38ClientError,
} from "@/lib/stellar/sep38";
import type {
  RateCandidate,
  RateQuoteProvider,
  RateSnapshotRepository,
} from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";

const USDC = "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as const;
const USD = "iso4217:USD" as const;
const NOW = new Date("2026-08-27T12:00:00.000Z");

const CORRIDOR = Object.freeze({
  slug: "usdc-us-usd-us",
  assetCodeFrom: "USDC",
  countryFrom: "US",
  assetCodeTo: "USD",
  countryTo: "US",
});

const REQUEST = Object.freeze({
  sellAsset: USDC,
  buyAsset: USD,
  sellAmount: "100",
  context: "sep31" as const,
});

function candidate(anchorSlug: string): RateCandidate {
  return Object.freeze({
    anchorSlug,
    corridor: CORRIDOR,
    request: REQUEST,
    configurationDigest: "c".repeat(64),
  });
}

/** Structurally valid SEP-38 payloads that parse as JSON but miss required fields. */
const INCOMPLETE_FIXTURES: readonly Readonly<{
  name: string;
  payload: Record<string, unknown>;
}>[] = Object.freeze([
  { name: "missing total_price", payload: complete({ total_price: undefined }) },
  { name: "missing price", payload: complete({ price: undefined }) },
  { name: "missing sell_amount", payload: complete({ sell_amount: undefined }) },
  { name: "missing buy_amount", payload: complete({ buy_amount: undefined }) },
  { name: "missing fee", payload: complete({ fee: undefined }) },
  { name: "missing fee.total", payload: complete({ fee: { asset: USD, details: [] } }) },
  { name: "missing fee.asset", payload: complete({ fee: { total: "1", details: [] } }) },
  { name: "null sell_amount", payload: complete({ sell_amount: null }) },
  { name: "empty payload", payload: {} },
]);

function complete(
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  return {
    total_price: "1",
    price: "1",
    sell_amount: "100",
    buy_amount: "100",
    fee: { total: "1", asset: USD, details: [] },
    ...overrides,
  };
}

for (const { name, payload } of INCOMPLETE_FIXTURES) {
  test(`incomplete but syntactically valid payload is rejected: ${name}`, () => {
    assert.throws(
      () => parseSep38IndicativePrice(payload, REQUEST),
      (error) => error instanceof Sep38ClientError && error.code === "INVALID_DATA",
    );
  });
}

type SnapshotRecord = Readonly<{
  anchorId: string;
  corridorId: string;
  rate: string;
}>;

function makeRepository() {
  const persisted: SnapshotRecord[] = [];
  const repository: RateSnapshotRepository = {
    findAnchorBySlug: async (slug) => ({ id: slug }),
    findCorridorBySlug: async (slug) => ({ id: slug }),
    hasAssociation: async () => true,
    createSnapshot: async (input) => {
      persisted.push(Object.freeze({
        anchorId: input.anchorId,
        corridorId: input.corridorId,
        rate: input.rate,
      }));
      return {
        id: `snapshot-${persisted.length}`,
        provenanceId: `provenance-${persisted.length}`,
        ...input,
      };
    },
  };
  return Object.freeze({ repository, persisted });
}

/**
 * Mirrors the production pipeline: the upstream body arrives as parseable JSON,
 * and the client layer must reject it before an observation can form.
 */
function upstreamPipeline(
  bodies: Readonly<Record<string, string>>,
): RateQuoteProvider {
  return (candidate) => {
    const body = bodies[candidate.anchorSlug];
    if (body === undefined) throw new Sep38ClientError("HTTP_FAILURE", "not found", "");
    return Promise.resolve(
      parseSep38IndicativePrice(JSON.parse(body) as unknown, REQUEST),
    );
  };
}

test("incomplete upstream JSON blocks a candidate without persisting a rate snapshot", async () => {
  const { repository, persisted } = makeRepository();
  const result = await runRateEngine(
    [candidate("incomplete"), candidate("healthy")],
    {
      quote: (candidate) => upstreamPipeline({
        incomplete: JSON.stringify(complete({ price: undefined })),
        healthy: JSON.stringify(complete({})),
      })(candidate),
      repository,
      now: () => NOW,
    },
  );

  assert.equal(result.totalCandidates, 2);
  assert.equal(result.totalAttempted, 2);
  assert.deepEqual(
    result.failures.map(({ anchorSlug, phase }) => ({ anchorSlug, phase })),
    [{ anchorSlug: "incomplete", phase: "QUOTE" }],
  );
  assert.equal(result.snapshots.length, 1);
  assert.equal(result.snapshots[0]?.anchorSlug, "healthy");
  assert.deepEqual(persisted, [{
    anchorId: "healthy",
    corridorId: "usdc-us-usd-us",
    rate: "1",
  }]);
  assert.equal(result.succeeded, 1);
  assert.equal(result.snapshotsPersisted, 1);
});

test("structurally parsed but field-incomplete quotes fail normalization, not persistence", async () => {
  for (const [incomplete, expectedCode] of [
    [{ ...indicative(), price: undefined }, "INVALID_RATE"],
    [{ ...indicative(), sellAmount: undefined }, "INVALID_SOURCE_AMOUNT"],
    [{ ...indicative(), buyAmount: undefined }, "INVALID_DESTINATION_AMOUNT"],
    [{ ...indicative(), fee: { total: undefined, asset: USD, details: [] } }, "INVALID_FEE"],
    [{ ...indicative(), fee: { total: "1", asset: "iso4217:XLM", details: [] } }, "UNSUPPORTED_FEE_ASSET"],
    [{ ...indicative(), sellAsset: "iso4217:EUR" }, "ASSET_MISMATCH"],
  ] as const satisfies readonly (readonly [Record<string, unknown>, string])[]) {
    const { repository, persisted } = makeRepository();
    const result = await runRateEngine([candidate("incomplete")], {
      quote: async () => incomplete as unknown as Sep38IndicativePrice,
      repository,
      now: () => NOW,
    });

    assert.deepEqual(result.failures.map(({ phase, code }) => ({ phase, code })), [{
      phase: "NORMALIZATION",
      code: expectedCode,
    }]);
    assert.equal(result.snapshotsPersisted, 0);
    assert.deepEqual(persisted, []);
  }
});

test("one invalid candidate never suppresses a valid sibling run", async () => {
  const { repository, persisted } = makeRepository();
  const result = await runRateEngine(
    [candidate("invalid"), candidate("valid-1"), candidate("valid-2")],
    {
      quote: async (aCandidate) => {
        if (aCandidate.anchorSlug === "invalid") return null as unknown as Sep38IndicativePrice;
        return indicative();
      },
      repository,
      now: () => NOW,
    },
  );

  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.snapshotsPersisted, 2);
  assert.equal(persisted.length, 2);
});

function indicative(): Sep38IndicativePrice {
  return Object.freeze({
    sellAsset: USDC,
    buyAsset: USD,
    totalPrice: "1",
    price: "1",
    sellAmount: "100",
    buyAmount: "100",
    fee: Object.freeze({ total: "1", asset: USD, details: Object.freeze([]) }),
  });
}
