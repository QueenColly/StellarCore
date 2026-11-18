import assert from "node:assert/strict";
import test from "node:test";

import * as anchorsRoute from "@/app/api/anchors/route";
import * as corridorsRoute from "@/app/api/corridors/route";
import * as ratesRoute from "@/app/api/rates/route";
import * as rateHistoryRoute from "@/app/api/rates/history/route";
import type { AnchorDirectoryRecord, AnchorDirectoryRepository } from "@/lib/api/anchorRepository";
import type { CorridorDirectoryRecord, CorridorDirectoryRepository } from "@/lib/api/corridorRepository";
import type { LatestCorridorRate } from "@/types/latestRates";
import type { CorridorRateHistory } from "@/types/rateHistory";

const CORRIDOR = "usdc-us-brl-br";
const CONFLICTING_CORRIDOR = "eurc-us-eur-eu";
const NOW = new Date("2026-08-28T12:00:00.000Z");

const mockLatestRate: LatestCorridorRate = Object.freeze({
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
});

const mockRateHistory: CorridorRateHistory = Object.freeze({
  ok: true,
  corridor: Object.freeze({
    slug: CORRIDOR,
    sourceAsset: "USDC",
    sourceCountry: "US",
    destinationAsset: "BRL",
    destinationCountry: "BR",
  }),
  evaluatedAt: NOW.toISOString(),
  windowDays: 30,
  points: Object.freeze([]),
});

const mockAnchorRecord: AnchorDirectoryRecord = Object.freeze({
  slug: "zeam",
  name: "Zeam",
  homeDomain: "zeam.example",
  status: "LIVE",
  seps: Object.freeze([1, 24, 38]),
  corridorCount: 1,
});

const mockAnchorRepo: AnchorDirectoryRepository = Object.freeze({
  findAll: async () => [mockAnchorRecord],
  findBySlug: async () => null,
});

const mockCorridorRecord: CorridorDirectoryRecord = Object.freeze({
  slug: CORRIDOR,
  assetCodeFrom: "USDC",
  countryFrom: "US",
  assetCodeTo: "BRL",
  countryTo: "BR",
  anchorCount: 1,
});

const mockCorridorRepo: CorridorDirectoryRepository = Object.freeze({
  findAll: async () => [mockCorridorRecord],
});

test("GET /api/rates rejects repeated identical corridor parameters safely", async () => {
  const response = await ratesRoute.GET(
    new Request(`http://localhost/api/rates?corridor=${CORRIDOR}&corridor=${CORRIDOR}`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates rejects repeated conflicting valid corridor parameters safely", async () => {
  const response = await ratesRoute.GET(
    new Request(`http://localhost/api/rates?corridor=${CORRIDOR}&corridor=${CONFLICTING_CORRIDOR}`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates prevents validation bypass when valid and invalid corridor values are mixed in either order", async () => {
  const validThenInvalid = await ratesRoute.GET(
    new Request(`http://localhost/api/rates?corridor=${CORRIDOR}&corridor=bad--corridor`),
  );
  assert.equal(validThenInvalid.status, 400);
  assert.deepEqual(await validThenInvalid.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });

  const invalidThenValid = await ratesRoute.GET(
    new Request(`http://localhost/api/rates?corridor=bad--corridor&corridor=${CORRIDOR}`),
  );
  assert.equal(invalidThenValid.status, 400);
  assert.deepEqual(await invalidThenValid.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates baseline remains consistent for single valid corridor parameter", async () => {
  const response = await ratesRoute.GET(
    new Request(`http://localhost/api/rates?corridor=${CORRIDOR}`),
    {
      now: () => NOW,
      readLatestRate: async () => mockLatestRate,
    },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.corridor.slug, CORRIDOR);
  assert.equal(data.state, "insufficient_fresh_sources");
});

test("GET /api/rates/history rejects repeated identical corridor parameters safely", async () => {
  const response = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&corridor=${CORRIDOR}&days=30`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates/history rejects repeated conflicting corridor parameters safely", async () => {
  const response = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&corridor=${CONFLICTING_CORRIDOR}&days=30`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates/history prevents corridor validation bypass in either parameter order", async () => {
  const validThenInvalid = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&corridor=bad--corridor&days=30`),
  );
  assert.equal(validThenInvalid.status, 400);
  assert.deepEqual(await validThenInvalid.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });

  const invalidThenValid = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=bad--corridor&corridor=${CORRIDOR}&days=30`),
  );
  assert.equal(invalidThenValid.status, 400);
  assert.deepEqual(await invalidThenValid.json(), {
    error: {
      code: "invalid_corridor",
      message: "The corridor slug is invalid.",
    },
  });
});

test("GET /api/rates/history rejects repeated identical days parameters safely", async () => {
  const response = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&days=30&days=30`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_days",
      message: "The days parameter must be an integer between 1 and 365.",
    },
  });
});

test("GET /api/rates/history rejects repeated conflicting valid days parameters safely", async () => {
  const response = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&days=30&days=60`),
  );
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), {
    error: {
      code: "invalid_days",
      message: "The days parameter must be an integer between 1 and 365.",
    },
  });
});

test("GET /api/rates/history prevents days validation bypass when valid and invalid values are mixed in either order", async () => {
  const validThenInvalid = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&days=30&days=invalid`),
  );
  assert.equal(validThenInvalid.status, 400);
  assert.deepEqual(await validThenInvalid.json(), {
    error: {
      code: "invalid_days",
      message: "The days parameter must be an integer between 1 and 365.",
    },
  });

  const invalidThenValid = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&days=invalid&days=30`),
  );
  assert.equal(invalidThenValid.status, 400);
  assert.deepEqual(await invalidThenValid.json(), {
    error: {
      code: "invalid_days",
      message: "The days parameter must be an integer between 1 and 365.",
    },
  });
});

test("GET /api/rates/history baseline remains consistent for single valid parameters", async () => {
  const response = await rateHistoryRoute.GET(
    new Request(`http://localhost/api/rates/history?corridor=${CORRIDOR}&days=30`),
    {
      now: () => NOW,
      readHistory: async () => mockRateHistory,
    },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.corridor.slug, CORRIDOR);
  assert.equal(data.windowDays, 30);
});

test("GET /api/anchors rejects repeated identical limit and offset parameters safely", async () => {
  const repeatedLimit = await anchorsRoute.GET(
    new Request("http://localhost/api/anchors?limit=10&limit=10"),
  );
  assert.equal(repeatedLimit.status, 400);
  assert.deepEqual(await repeatedLimit.json(), {
    error: {
      code: "invalid_pagination",
      message: "limit must be a positive integer no greater than 100.",
    },
  });

  const repeatedOffset = await anchorsRoute.GET(
    new Request("http://localhost/api/anchors?offset=5&offset=5"),
  );
  assert.equal(repeatedOffset.status, 400);
  assert.deepEqual(await repeatedOffset.json(), {
    error: {
      code: "invalid_pagination",
      message: "offset must be a non-negative integer.",
    },
  });
});

test("GET /api/anchors rejects repeated conflicting limit and offset parameters safely", async () => {
  const conflictingLimit = await anchorsRoute.GET(
    new Request("http://localhost/api/anchors?limit=10&limit=25"),
  );
  assert.equal(conflictingLimit.status, 400);
  assert.equal((await conflictingLimit.json()).error.code, "invalid_pagination");

  const conflictingOffset = await anchorsRoute.GET(
    new Request("http://localhost/api/anchors?offset=5&offset=15"),
  );
  assert.equal(conflictingOffset.status, 400);
  assert.equal((await conflictingOffset.json()).error.code, "invalid_pagination");
});

test("GET /api/anchors prevents pagination validation bypass in either parameter order", async () => {
  for (const [validOrder, invalidOrder] of [
    ["limit=10&limit=bad", "limit=bad&limit=10"],
    ["limit=10&limit=-5", "limit=-5&limit=10"],
    ["offset=5&offset=bad", "offset=bad&offset=5"],
    ["offset=5&offset=-1", "offset=-1&offset=5"],
  ] as const) {
    const firstRes = await anchorsRoute.GET(new Request(`http://localhost/api/anchors?${validOrder}`));
    assert.equal(firstRes.status, 400);
    assert.equal((await firstRes.json()).error.code, "invalid_pagination");

    const secondRes = await anchorsRoute.GET(new Request(`http://localhost/api/anchors?${invalidOrder}`));
    assert.equal(secondRes.status, 400);
    assert.equal((await secondRes.json()).error.code, "invalid_pagination");
  }
});

test("GET /api/anchors baseline remains consistent for single valid pagination parameters", async () => {
  const response = await anchorsRoute.GET(
    new Request("http://localhost/api/anchors?limit=10&offset=0"),
    { repository: mockAnchorRepo },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.count, 1);
  assert.equal(data.anchors[0].slug, "zeam");
});

test("GET /api/corridors rejects repeated identical limit and offset parameters safely", async () => {
  const repeatedLimit = await corridorsRoute.GET(
    new Request("http://localhost/api/corridors?limit=10&limit=10"),
  );
  assert.equal(repeatedLimit.status, 400);
  assert.deepEqual(await repeatedLimit.json(), {
    error: {
      code: "invalid_pagination",
      message: "limit must be a positive integer no greater than 100.",
    },
  });

  const repeatedOffset = await corridorsRoute.GET(
    new Request("http://localhost/api/corridors?offset=5&offset=5"),
  );
  assert.equal(repeatedOffset.status, 400);
  assert.deepEqual(await repeatedOffset.json(), {
    error: {
      code: "invalid_pagination",
      message: "offset must be a non-negative integer.",
    },
  });
});

test("GET /api/corridors rejects repeated conflicting limit and offset parameters safely", async () => {
  const conflictingLimit = await corridorsRoute.GET(
    new Request("http://localhost/api/corridors?limit=10&limit=25"),
  );
  assert.equal(conflictingLimit.status, 400);
  assert.equal((await conflictingLimit.json()).error.code, "invalid_pagination");

  const conflictingOffset = await corridorsRoute.GET(
    new Request("http://localhost/api/corridors?offset=5&offset=15"),
  );
  assert.equal(conflictingOffset.status, 400);
  assert.equal((await conflictingOffset.json()).error.code, "invalid_pagination");
});

test("GET /api/corridors prevents pagination validation bypass in either parameter order", async () => {
  for (const [validOrder, invalidOrder] of [
    ["limit=10&limit=bad", "limit=bad&limit=10"],
    ["limit=10&limit=-5", "limit=-5&limit=10"],
    ["offset=5&offset=bad", "offset=bad&offset=5"],
    ["offset=5&offset=-1", "offset=-1&offset=5"],
  ] as const) {
    const firstRes = await corridorsRoute.GET(new Request(`http://localhost/api/corridors?${validOrder}`));
    assert.equal(firstRes.status, 400);
    assert.equal((await firstRes.json()).error.code, "invalid_pagination");

    const secondRes = await corridorsRoute.GET(new Request(`http://localhost/api/corridors?${invalidOrder}`));
    assert.equal(secondRes.status, 400);
    assert.equal((await secondRes.json()).error.code, "invalid_pagination");
  }
});

test("GET /api/corridors baseline remains consistent for single valid pagination parameters", async () => {
  const response = await corridorsRoute.GET(
    new Request("http://localhost/api/corridors?limit=10&offset=0"),
    { repository: mockCorridorRepo },
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.count, 1);
  assert.equal(data.corridors[0].slug, CORRIDOR);
});
