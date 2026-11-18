import assert from "node:assert/strict";
import test from "node:test";

import { getRatesApiResult, serializeRates } from "@/lib/api/rates";
import { getRateHistoryApiResult, serializeRateHistory } from "@/lib/api/rateHistory";
import { getReputationApiResult, serializeReputationList } from "@/lib/api/reputation";
import { getCorridorsApiResult, getCorridorApiResult, serializeCorridors, serializeCorridorDetail } from "@/lib/api/corridors";
import { getAnchorsApiResult, serializeAnchors, serializeAnchorDetail } from "@/lib/api/anchors";
import { readLatestCorridorRate } from "@/lib/rates/latestRateReadModel";
import { readCorridorRateHistory } from "@/lib/rates/rateHistoryReadModel";
import type { LatestCorridorRate } from "@/types/latestRates";
import type { CorridorRateHistory } from "@/types/rateHistory";
import type { ReputationApiAnchorRecord } from "@/lib/api/reputationRepository";
import type { CorridorDirectoryRecord, CorridorDetailRecord } from "@/lib/api/corridorRepository";
import type { AnchorDirectoryRecord, AnchorDetailRecord } from "@/lib/api/anchorRepository";
import type { LatestRateRepository, LatestRateRepositoryObservation } from "@/types/latestRates";
import type { RateHistoryRepository, RateHistoryRepositoryObservation } from "@/types/rateHistory";

const NOW = new Date("2026-08-28T12:00:00.000Z");
const CORRIDOR = "usdc-us-brl-br";
const CORRIDOR_ID = "corridor-id";

// ============================================================
// Test fixtures and helpers
// ============================================================

function observation(
  anchorSlug: string,
  id: string,
  rate: string,
  ageMs: number,
  anchorName?: string,
): LatestRateRepositoryObservation {
  return Object.freeze({
    id,
    anchorSlug,
    anchorName: anchorName ?? `${anchorSlug[0]!.toUpperCase()}${anchorSlug.slice(1)} Persisted`,
    rate,
    sourceAmount: "100.000000000000000001",
    destinationAmount: "17.000000000000000001",
    fee: "1.000000000000000001",
    capturedAt: new Date(NOW.getTime() - ageMs),
  });
}

function historyObservation(
  anchorSlug: string,
  id: string,
  rate: string,
  capturedAt: Date,
  anchorName?: string,
): RateHistoryRepositoryObservation {
  return Object.freeze({
    id,
    anchorSlug,
    anchorName: anchorName ?? `${anchorSlug[0]!.toUpperCase()}${anchorSlug.slice(1)} Persisted`,
    rate,
    sourceAmount: "100",
    destinationAmount: "10",
    fee: "0",
    capturedAt,
  });
}

function corridorRecord(slug: string, anchorCount = 1): CorridorDirectoryRecord {
  return Object.freeze({
    slug,
    assetCodeFrom: "USDC",
    countryFrom: "US",
    assetCodeTo: "BRL",
    countryTo: "BR",
    anchorCount,
  });
}

function corridorDetail(
  slug: string,
  anchors: { slug: string; name: string; seps: number[] }[],
): CorridorDetailRecord {
  return Object.freeze({
    slug,
    assetCodeFrom: "USDC",
    countryFrom: "US",
    assetCodeTo: "BRL",
    countryTo: "BR",
    anchors: anchors.map((a) => Object.freeze({
      slug: a.slug,
      name: a.name,
      homeDomain: `${a.slug}.example`,
      status: "LIVE" as const,
      seps: a.seps,
    })),
  });
}

function anchorRecord(slug: string, corridorCount = 1): AnchorDirectoryRecord {
  return Object.freeze({
    slug,
    name: `${slug} name`,
    homeDomain: `${slug}.example`,
    status: "LIVE" as const,
    seps: [1, 38],
    isTransferCapable: true,
    corridorCount,
  });
}

function anchorDetail(
  slug: string,
  corridors: { slug: string; assetCodeFrom: string; countryFrom: string; assetCodeTo: string; countryTo: string }[],
): AnchorDetailRecord {
  return Object.freeze({
    slug,
    name: `${slug} name`,
    homeDomain: `${slug}.example`,
    status: "LIVE" as const,
    seps: [38, 1],
    corridors: corridors.map((c) => Object.freeze({
      slug: c.slug,
      assetCodeFrom: c.assetCodeFrom,
      countryFrom: c.countryFrom,
      assetCodeTo: c.assetCodeTo,
      countryTo: c.countryTo,
    })),
  });
}

function reputationRecord(
  slug: string,
  name: string,
  hasScore = true,
): ReputationApiAnchorRecord {
  return Object.freeze({
    slug,
    name,
    reputationScore: hasScore ? Object.freeze({
      compositeScore: 80,
      scoreBand: "AMBER" as const,
      fillRate7d: 0.8,
      fillRate30d: 0.8,
      fillRate90d: 0.8,
      settleP50Ms: 1_000,
      settleP95Ms: 2_000,
      slippageP50: 0.01,
      slippageP95: 0.02,
      sampleSize: 30,
      state: "OK" as const,
      computedAt: new Date("2026-08-31T12:00:00.000Z"),
    }) : null,
  });
}

function repo(history: readonly LatestRateRepositoryObservation[]): LatestRateRepository {
  return {
    findCorridorBySlug: async () => ({
      id: CORRIDOR_ID,
      slug: CORRIDOR,
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
    }),
    findLatestObservations: async () => history,
  };
}

function historyRepo(history: readonly RateHistoryRepositoryObservation[]): RateHistoryRepository {
  return {
    findCorridorBySlug: async () => ({
      id: CORRIDOR_ID,
      slug: CORRIDOR,
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
    }),
    findHistoryObservations: async () => history,
  };
}

async function getRatesWithRepo(history: readonly LatestRateRepositoryObservation[]) {
  return getRatesApiResult(CORRIDOR, {
    now: () => NOW,
    readLatestRate: (slug, { evaluatedAt }) =>
      readLatestCorridorRate(slug, { repository: repo(history), evaluatedAt }),
  });
}

async function getHistoryWithRepo(history: readonly RateHistoryRepositoryObservation[], days = "30") {
  return getRateHistoryApiResult(CORRIDOR, days, {
    now: () => NOW,
    readHistory: (slug, { evaluatedAt, days: d }) =>
      readCorridorRateHistory(slug, { repository: historyRepo(history), evaluatedAt, days: d }),
  });
}

// ============================================================
// GET /api/rates - observations ordered by anchorSlug
// ============================================================

test("GET /api/rates orders observations by anchorSlug lexicographically", async () => {
  // Provide history in random order - selectLatestPerAnchor should sort by anchorSlug
  const result = await getRatesWithRepo([
    observation("zeam", "zeam-snap", "0.100000000000000001", 1_000),
    observation("anchor-b", "anchor-b-snap", "0.100000000000000002", 2_000),
    observation("anchor-a", "anchor-a-snap", "0.100000000000000003", 3_000),
  ]);

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.observations.map((o) => o.anchor.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

test("GET /api/rates stable tie-breaker: equal timestamps use lexicographically greater snapshot id", async () => {
  const result = await getRatesWithRepo([
    observation("anchor-x", "aaa", "0.1", 1_000),
    observation("anchor-y", "bbb", "0.2", 1_000),
  ]);

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.observations.map((o) => o.anchor.slug),
    ["anchor-x", "anchor-y"],
  );
});

test("serializeRates preserves observation order from input", () => {
  const input: LatestCorridorRate = {
    ok: true,
    corridor: { slug: CORRIDOR, assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "BRL", countryTo: "BR" },
    evaluatedAt: NOW.toISOString(),
    state: "insufficient_fresh_sources",
    median: null,
    totalIndependentSources: 3,
    freshSourceCount: 3,
    observations: [
      { snapshotId: "a", anchorSlug: "zeam", anchorName: "Zeam", rate: "0.1", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 1_000, included: true },
      { snapshotId: "b", anchorSlug: "anchor-b", anchorName: "Anchor B", rate: "0.2", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 2_000, included: true },
      { snapshotId: "c", anchorSlug: "anchor-a", anchorName: "Anchor A", rate: "0.3", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 3_000, included: true },
    ],
    exclusions: [],
  };

  const body = serializeRates(input);

  // serializeRates does NOT re-sort - it preserves input order
  // The read model is responsible for ordering
  assert.deepEqual(
    body.observations.map((o) => o.anchor.slug),
    ["zeam", "anchor-b", "anchor-a"],
  );
});

// ============================================================
// GET /api/rates/history - points ordered by timestamp descending,
// observations within each point ordered by anchorSlug
// ============================================================

test("GET /api/rates/history orders points by timestamp ascending (oldest first)", async () => {
  // Repository returns observations in ASC order; groupObservationsIntoSlices expects ASC input
  // Points are produced in the same order (oldest slice first)
  const result = await getHistoryWithRepo([
    historyObservation("anchor-c", "c1", "0.3", new Date("2026-08-26T12:00:00.000Z")),
    historyObservation("anchor-a", "a1", "0.1", new Date("2026-08-27T12:00:00.000Z")),
    historyObservation("anchor-b", "b1", "0.2", new Date("2026-08-28T12:00:00.000Z")),
  ]);

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.points.map((p) => p.timestamp),
    ["2026-08-26T12:00:00.000Z", "2026-08-27T12:00:00.000Z", "2026-08-28T12:00:00.000Z"],
  );
});

test("GET /api/rates/history orders observations within each point by anchorSlug", async () => {
  const result = await getHistoryWithRepo([
    historyObservation("zeam", "z1", "0.1", NOW),
    historyObservation("anchor-b", "b1", "0.2", NOW),
    historyObservation("anchor-a", "a1", "0.3", NOW),
  ]);

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.points[0]?.observations.map((o) => o.anchor.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

test("serializeRateHistory preserves point and observation order from input", () => {
  const input: CorridorRateHistory = {
    ok: true,
    corridor: { slug: CORRIDOR, sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR" },
    evaluatedAt: NOW.toISOString(),
    windowDays: 30,
    points: [
      {
        timestamp: NOW.toISOString(),
        medianRate: "0.1",
        state: "healthy",
        sourceCount: 3,
        freshSourceCount: 3,
        observations: [
          { anchorSlug: "zeam", anchorName: "Zeam", rate: "0.1", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString() },
          { anchorSlug: "anchor-b", anchorName: "Anchor B", rate: "0.2", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString() },
          { anchorSlug: "anchor-a", anchorName: "Anchor A", rate: "0.3", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString() },
        ],
      },
    ],
  };

  const body = serializeRateHistory(input);

  // Serializer preserves input order
  assert.deepEqual(
    body.points[0]?.observations.map((o) => o.anchor.slug),
    ["zeam", "anchor-b", "anchor-a"],
  );
});

// ============================================================
// GET /api/reputation - list ordered by anchor slug
// ============================================================

test("GET /api/reputation orders anchors by slug lexicographically", async () => {
  const result = await getReputationApiResult({
    repository: {
      findAll: async () => [
        reputationRecord("zeam", "Zeam"),
        reputationRecord("anchor-b", "Anchor B"),
        reputationRecord("anchor-a", "Anchor A"),
      ],
      findBySlug: async () => null,
    },
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.reputation.map((r) => r.anchor.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

test("serializeReputationList orders by anchor slug", () => {
  const body = serializeReputationList([
    reputationRecord("zeam", "Zeam"),
    reputationRecord("anchor-b", "Anchor B"),
    reputationRecord("anchor-a", "Anchor A"),
  ]);

  assert.deepEqual(
    body.reputation.map((r) => r.anchor.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

// ============================================================
// GET /api/corridors - corridors ordered by slug,
// anchors within corridor detail ordered by slug,
// SEPs sorted numerically
// ============================================================

test("GET /api/corridors orders corridors by slug lexicographically", async () => {
  const result = await getCorridorsApiResult({
    repository: {
      findAll: async () => [
        corridorRecord("zeam-corridor"),
        corridorRecord("anchor-b-corridor"),
        corridorRecord("anchor-a-corridor"),
      ],
    },
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.corridors.map((c) => c.slug),
    ["anchor-a-corridor", "anchor-b-corridor", "zeam-corridor"],
  );
});

test("serializeCorridors orders by corridor slug", () => {
  const body = serializeCorridors([
    corridorRecord("zeam-corridor"),
    corridorRecord("anchor-b-corridor"),
    corridorRecord("anchor-a-corridor"),
  ]);

  assert.deepEqual(
    body.corridors.map((c) => c.slug),
    ["anchor-a-corridor", "anchor-b-corridor", "zeam-corridor"],
  );
});

test("GET /api/corridors/[slug] orders anchors by slug lexicographically", async () => {
  const result = await getCorridorApiResult("test-corridor", {
    repository: {
      findBySlug: async () => corridorDetail("test-corridor", [
        { slug: "zeam", name: "Zeam", seps: [38, 1] },
        { slug: "anchor-b", name: "Anchor B", seps: [1, 6] },
        { slug: "anchor-a", name: "Anchor A", seps: [1, 24] },
      ]),
    },
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.corridor.anchors.map((a) => a.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

test("serializeCorridorDetail orders anchors by slug and SEPs numerically", () => {
  const body = serializeCorridorDetail(corridorDetail("test-corridor", [
    { slug: "zeam", name: "Zeam", seps: [38, 1] },
    { slug: "anchor-b", name: "Anchor B", seps: [1, 6] },
    { slug: "anchor-a", name: "Anchor A", seps: [1, 24] },
  ]));

  assert.deepEqual(
    body.anchors.map((a) => a.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
  assert.deepEqual(
    body.anchors[0]?.seps,
    [1, 24],
  );
  assert.deepEqual(
    body.anchors[1]?.seps,
    [1, 6],
  );
  assert.deepEqual(
    body.anchors[2]?.seps,
    [1, 38],
  );
});

// ============================================================
// GET /api/anchors - anchors ordered by slug,
// corridors within anchor detail ordered by slug,
// SEPs sorted numerically
// ============================================================

test("GET /api/anchors orders anchors by slug lexicographically", async () => {
  const result = await getAnchorsApiResult({
    repository: {
      findAll: async () => [
        anchorRecord("zeam"),
        anchorRecord("anchor-b"),
        anchorRecord("anchor-a"),
      ],
      findBySlug: async () => null,
    },
  });

  assert.equal(result.status, 200);
  if (result.status !== 200) return;
  assert.deepEqual(
    result.body.anchors.map((a) => a.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
});

test("serializeAnchors orders by anchor slug and SEPs numerically", () => {
  const body = serializeAnchors([
    anchorRecord("zeam"),
    anchorRecord("anchor-b"),
    anchorRecord("anchor-a"),
  ]);

  assert.deepEqual(
    body.anchors.map((a) => a.slug),
    ["anchor-a", "anchor-b", "zeam"],
  );
  assert.deepEqual(
    body.anchors[0]?.seps,
    [1, 38],
  );
});

test("serializeAnchorDetail orders corridors by slug and SEPs numerically", () => {
  const body = serializeAnchorDetail(anchorDetail("test-anchor", [
    { slug: "zeam-corridor", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "BRL", countryTo: "BR" },
    { slug: "anchor-b-corridor", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "NGN", countryTo: "NG" },
    { slug: "anchor-a-corridor", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "MXN", countryTo: "MX" },
  ]));

  assert.deepEqual(
    body.corridors.map((c) => c.slug),
    ["anchor-a-corridor", "anchor-b-corridor", "zeam-corridor"],
  );
  assert.deepEqual(
    body.seps,
    [1, 38],
  );
});

// ============================================================
// Repeatability: running the same query multiple times yields identical order
// ============================================================

test("repeated GET /api/rates calls with same input yield identical observation order", async () => {
  const history = [
    observation("zeam", "zeam-snap", "0.1", 1_000),
    observation("anchor-b", "anchor-b-snap", "0.2", 2_000),
    observation("anchor-a", "anchor-a-snap", "0.3", 3_000),
  ];

  const results = await Promise.all([
    getRatesWithRepo(history),
    getRatesWithRepo(history),
    getRatesWithRepo(history),
  ]);

  const bodies = results.map((r) => {
    assert.equal(r.status, 200);
    return r.body;
  });

  for (const body of bodies) {
    assert.deepEqual(
      body.observations.map((o) => o.anchor.slug),
      ["anchor-a", "anchor-b", "zeam"],
    );
  }
  // Deep equality across all runs
  assert.deepEqual(bodies[0]!.observations, bodies[1]!.observations);
  assert.deepEqual(bodies[1]!.observations, bodies[2]!.observations);
});

test("repeated serializeRates calls with same input yield identical order", () => {
  const input: LatestCorridorRate = {
    ok: true,
    corridor: { slug: CORRIDOR, assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "BRL", countryTo: "BR" },
    evaluatedAt: NOW.toISOString(),
    state: "insufficient_fresh_sources",
    median: null,
    totalIndependentSources: 3,
    freshSourceCount: 3,
    observations: [
      { snapshotId: "a", anchorSlug: "zeam", anchorName: "Zeam", rate: "0.1", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 1_000, included: true },
      { snapshotId: "b", anchorSlug: "anchor-b", anchorName: "Anchor B", rate: "0.2", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 2_000, included: true },
      { snapshotId: "c", anchorSlug: "anchor-a", anchorName: "Anchor A", rate: "0.3", sourceAmount: "1", destinationAmount: "1", fee: "0", capturedAt: NOW.toISOString(), freshnessState: "fresh", ageMs: 3_000, included: true },
    ],
    exclusions: [],
  };

  const results = [serializeRates(input), serializeRates(input), serializeRates(input)];
  assert.deepEqual(results[0]!.observations, results[1]!.observations);
  assert.deepEqual(results[1]!.observations, results[2]!.observations);
});

test("repeated GET /api/rates/history calls with same input yield identical order", async () => {
  const history = [
    historyObservation("zeam", "z1", "0.1", NOW),
    historyObservation("anchor-b", "b1", "0.2", NOW),
    historyObservation("anchor-a", "a1", "0.3", NOW),
  ];

  const results = await Promise.all([
    getHistoryWithRepo(history),
    getHistoryWithRepo(history),
    getHistoryWithRepo(history),
  ]);

  const bodies = results.map((r) => {
    assert.equal(r.status, 200);
    return r.body;
  });

  for (const body of bodies) {
    assert.deepEqual(
      body.points[0]?.observations.map((o) => o.anchor.slug),
      ["anchor-a", "anchor-b", "zeam"],
    );
  }
  assert.deepEqual(bodies[0]!.points[0]!.observations, bodies[1]!.points[0]!.observations);
  assert.deepEqual(bodies[1]!.points[0]!.observations, bodies[2]!.points[0]!.observations);
});