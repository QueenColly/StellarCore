import assert from "node:assert/strict";
import test from "node:test";

import { GET, dynamic } from "@/app/api/rates/route";
import { MIN_FRESH_SOURCES } from "@/constants/rates";
import { getRatesApiResult, serializeRates } from "@/lib/api/rates";
import type { LatestCorridorRate } from "@/types/latestRates";

const CORRIDOR = "usdc-us-brl-br";
const NOW = new Date("2026-08-28T12:00:00.000Z");

test("route rejects missing and malformed corridor parameters safely", async () => {
  const missing = await GET(new Request("http://localhost/api/rates"));
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "missing_corridor",
      message: "A corridor slug is required.",
    },
  });

  for (const value of ["../rates", " USDC ", "a".repeat(101)]) {
    const response = await GET(new Request(
      `http://localhost/api/rates?corridor=${encodeURIComponent(value)}`,
    ));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_corridor");
  }
});

test("route rejects repeated, unsupported, and out-of-range query parameters", async () => {
  const invalidRequests = [
    {
      name: "repeated corridor",
      url: `http://localhost/api/rates?corridor=${CORRIDOR}&corridor=${CORRIDOR}`,
      status: 400,
      code: "invalid_query",
    },
    {
      name: "unsupported parameter",
      url: `http://localhost/api/rates?corridor=${CORRIDOR}&limit=10`,
      status: 400,
      code: "invalid_query",
    },
    {
      name: "oversized corridor",
      url: `http://localhost/api/rates?corridor=${"a".repeat(101)}`,
      status: 400,
      code: "invalid_corridor",
    },
  ] as const;

  for (const value of invalidRequests) {
    const response = await GET(new Request(value.url));
    assert.equal(response.status, value.status, value.name);
    assert.deepEqual(await response.json(), {
      error: {
        code: value.code,
        message: value.code === "invalid_query"
          ? "The query parameters are invalid."
          : "The corridor slug is invalid.",
      },
    }, value.name);
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

test("route is request-dynamic and explicitly prevents freshness caching", async () => {
  assert.equal(dynamic, "force-dynamic");
  const response = await GET(new Request("http://localhost/api/rates?corridor=bad--slug"));
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("service maps unknown corridors and read failures to safe errors", async () => {
  const missing = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async (slug) => ({
      ok: false,
      corridorSlug: slug,
      code: "CORRIDOR_NOT_FOUND",
    }),
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "corridor_not_found");

  const failed = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async () => {
      throw new Error("DATABASE_URL=secret stack trace");
    },
  });
  assert.deepEqual(failed, {
    status: 500,
    body: { error: { code: "internal_error", message: "Unable to read rates." } },
  });
  assert.equal(JSON.stringify(failed).includes("secret"), false);
});

test("aborted reads do not report client disconnects as internal errors", async () => {
  const controller = new AbortController();
  let rejectRead!: (error: Error) => void;
  let reportedErrors = 0;
  const pending = getRatesApiResult(CORRIDOR, {
    signal: controller.signal,
    reportError: () => {
      reportedErrors += 1;
    },
    readLatestRate: () => new Promise((_resolve, reject) => {
      rejectRead = reject;
    }),
  });

  controller.abort();
  rejectRead(new Error("database read interrupted"));
  await assert.rejects(pending);
  assert.equal(reportedErrors, 0);
});

test("one source is a successful insufficient response with string decimals", async () => {
  let usedEvaluationTime: Date | undefined;
  const result = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async (_slug, { evaluatedAt }) => {
      usedEvaluationTime = evaluatedAt;
      return readResult({
        state: "insufficient_fresh_sources",
        median: null,
        totalIndependentSources: 1,
        freshSourceCount: 1,
        observations: [observation(
          "zeam",
          "0.170000000000000001",
          "fresh",
          1_000,
          true,
          undefined,
          "Persisted Zeam Name",
        )],
      });
    },
  });

  assert.equal(usedEvaluationTime, NOW);
  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.equal(result.body.state, "insufficient_fresh_sources");
  assert.equal(result.body.medianRate, null);
  assert.equal(result.body.observations[0]?.anchor.name, "Persisted Zeam Name");
  assert.equal(result.body.observations[0]?.rate, "0.170000000000000001");
  assert.equal(typeof result.body.observations[0]?.rate, "string");
  assert.equal(result.body.evaluatedAt, NOW.toISOString());
  assert.deepEqual(result.body.reviewedCandidateConfiguration, {
    candidateCount: 1,
    uniqueAnchorCount: 1,
  });
  assert.deepEqual(result.body.medianRequirement, {
    minimumFreshIndependentSources: MIN_FRESH_SOURCES,
  });
});

test("persisted corridor and anchor identity do not require static registry entries", async () => {
  const corridorSlug = "persisted-asset-aa-fiat-bb";
  const result = await getRatesApiResult(corridorSlug, {
    now: () => NOW,
    readLatestRate: async () => readResult({
      corridor: Object.freeze({
        slug: corridorSlug,
        assetCodeFrom: "PERSISTED",
        countryFrom: "AA",
        assetCodeTo: "FIAT",
        countryTo: "BB",
      }),
      totalIndependentSources: 1,
      freshSourceCount: 1,
      observations: [observation(
        "persisted-anchor",
        "1.250000000000000001",
        "fresh",
        1_000,
        true,
        undefined,
        "Persisted Anchor Name",
      )],
    }),
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(result.body.corridor, {
    slug: corridorSlug,
    sourceAsset: "PERSISTED",
    sourceCountry: "AA",
    destinationAsset: "FIAT",
    destinationCountry: "BB",
  });
  assert.deepEqual(result.body.observations[0]?.anchor, {
    slug: "persisted-anchor",
    name: "Persisted Anchor Name",
  });
  assert.deepEqual(result.body.reviewedCandidateConfiguration, {
    candidateCount: 0,
    uniqueAnchorCount: 0,
  });
  assert.equal(result.body.sourceCount, 1);
  assert.equal(result.body.freshSourceCount, 1);
  assert.equal(result.body.medianRate, null);
});

test("configured candidates without observations do not become persisted evidence", async () => {
  const result = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async () => readResult({ observations: Object.freeze([]) }),
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(result.body.reviewedCandidateConfiguration, {
    candidateCount: 1,
    uniqueAnchorCount: 1,
  });
  assert.equal(result.body.sourceCount, 0);
  assert.equal(result.body.freshSourceCount, 0);
  assert.deepEqual(result.body.observations, []);
  assert.deepEqual(result.body.corridor, {
    slug: CORRIDOR,
    sourceAsset: "USDC",
    sourceCountry: "US",
    destinationAsset: "BRL",
    destinationCountry: "BR",
  });
  assert.equal(result.body.state, "insufficient_fresh_sources");
  assert.equal(result.body.medianRate, null);
  assert.equal(result.body.evaluatedAt, NOW.toISOString());
  assert.deepEqual(result.body.observations, []);
  assert.equal(JSON.stringify(result.body.observations).includes(NOW.toISOString()), false);
});

test("empty evidence and failed reads remain distinct public outcomes", async () => {
  const empty = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async () => readResult({ observations: Object.freeze([]) }),
  });
  const failed = await getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: async () => {
      throw new Error("DATABASE_URL=secret");
    },
  });

  assert.equal(empty.status, 200);
  if (empty.status === 200) {
    assert.deepEqual(empty.body.observations, []);
    assert.equal(empty.body.sourceCount, 0);
    assert.equal(empty.body.medianRate, null);
  }
  assert.deepEqual(failed, {
    status: 500,
    body: { error: { code: "internal_error", message: "Unable to read rates." } },
  });
  assert.notDeepEqual(empty, failed);
  assert.equal(JSON.stringify(failed).includes("secret"), false);
});

test("serializer exposes an exact healthy median and normalized exclusions", () => {
  const body = serializeRates(readResult({
    state: "healthy",
    median: "0.1000000000000000015",
    totalIndependentSources: 4,
    freshSourceCount: 2,
    observations: [
      observation("zeam", "0.100000000000000001", "fresh", 1, true),
      observation("anchor-b", "0.100000000000000002", "fresh", 2, true),
      observation("anchor-c", "9", "stale", 120_001, false, "stale"),
      observation("anchor-d", "8", "future", -1, false, "future_timestamp"),
    ],
  }));

  assert.equal(body.medianRate, "0.1000000000000000015");
  assert.equal(body.observations[2]?.freshness.state, "stale");
  assert.equal(body.observations[3]?.exclusionReason, "future_timestamp");
  assert.equal(body.sourceCount, 4);
  assert.equal(body.freshSourceCount, 2);
  assert.deepEqual(body.reviewedCandidateConfiguration, {
    candidateCount: 1,
    uniqueAnchorCount: 1,
  });
  assert.deepEqual(body.medianRequirement, {
    minimumFreshIndependentSources: MIN_FRESH_SOURCES,
  });
  assert.deepEqual(Object.keys(body.reviewedCandidateConfiguration).sort(), [
    "candidateCount",
    "uniqueAnchorCount",
  ]);
  assert.equal(JSON.stringify(body).includes("sellAsset"), false);
  assert.equal("snapshotId" in body.observations[0]!, false);
  assert.equal(Object.isFrozen(body), true);
  assert.equal(Object.isFrozen(body.observations), true);
  assert.equal(Object.isFrozen(body.observations[0]), true);
  assert.equal(Object.isFrozen(body.reviewedCandidateConfiguration), true);
  assert.equal(Object.isFrozen(body.medianRequirement), true);
  assert.deepEqual(Object.keys(body).sort(), [
    "corridor",
    "evaluatedAt",
    "freshSourceCount",
    "medianRate",
    "medianRequirement",
    "observations",
    "reviewedCandidateConfiguration",
    "sourceCount",
    "state",
  ]);
  assert.deepEqual(Object.keys(body.corridor).sort(), [
    "destinationAsset",
    "destinationCountry",
    "slug",
    "sourceAsset",
    "sourceCountry",
  ]);
  assert.deepEqual(Object.keys(body.observations[0]!).sort(), [
    "anchor",
    "capturedAt",
    "destinationAmount",
    "eligibleForMedian",
    "fee",
    "freshness",
    "rate",
    "sourceAmount",
  ]);
  assert.doesNotThrow(() => JSON.stringify(body));
  assert.equal(JSON.stringify(body).includes("bigint"), false);
});

function readResult(
  overrides: Partial<LatestCorridorRate>,
): LatestCorridorRate {
  return Object.freeze({
    ok: true,
    corridor: Object.freeze({
      slug: CORRIDOR,
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
    }),
    evaluatedAt: NOW.toISOString(),
    state: "insufficient_fresh_sources",
    median: null,
    totalIndependentSources: 0,
    freshSourceCount: 0,
    observations: Object.freeze([]),
    exclusions: Object.freeze([]),
    ...overrides,
  });
}

function observation(
  anchorSlug: string,
  rate: string,
  freshnessState: "fresh" | "stale" | "future" | "invalid",
  ageMs: number | null,
  included: boolean,
  exclusionReason?: "stale" | "future_timestamp" | "invalid_timestamp" | "invalid_rate",
  anchorName = `${anchorSlug} persisted`,
) {
  return Object.freeze({
    snapshotId: `${anchorSlug}-snapshot`,
    anchorSlug,
    anchorName,
    rate,
    sourceAmount: "100.000000000000000001",
    destinationAmount: "17.000000000000000001",
    fee: "1.000000000000000001",
    capturedAt: freshnessState === "invalid" ? "invalid" : NOW.toISOString(),
    freshnessState,
    ageMs,
    included,
    ...(exclusionReason ? { exclusionReason } : {}),
  });
}
