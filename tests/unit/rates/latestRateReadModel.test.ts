import assert from "node:assert/strict";
import test from "node:test";

import { RATE_FRESHNESS_THRESHOLD_MS } from "@/constants/rates";
import {
  readLatestCorridorRate,
  selectLatestPerAnchor,
} from "@/lib/rates/latestRateReadModel";
import type {
  LatestRateRepository,
  LatestRateRepositoryObservation,
} from "@/types/latestRates";

const CORRIDOR = "usdc-us-brl-br";
const NOW = new Date("2026-08-27T12:00:00.000Z");
const CORRIDOR_RECORD = Object.freeze({
  id: "corridor-id",
  slug: CORRIDOR,
  assetCodeFrom: "USDC",
  countryFrom: "US",
  assetCodeTo: "BRL",
  countryTo: "BR",
});

test("missing corridor and empty history return safe typed states", async () => {
  assert.deepEqual(await readLatestCorridorRate("missing", {
    evaluatedAt: NOW,
    repository: repository([], false),
  }), { ok: false, corridorSlug: "missing", code: "CORRIDOR_NOT_FOUND" });

  const empty = await readLatestCorridorRate(CORRIDOR, {
    evaluatedAt: NOW,
    repository: repository([]),
  });
  assert.equal(empty.ok && empty.state, "insufficient_fresh_sources");
  assert.equal(empty.ok && empty.median, null);
  assert.equal(empty.ok && empty.totalIndependentSources, 0);
  assert.equal(empty.ok && empty.freshSourceCount, 0);
  assert.equal(empty.ok && empty.evaluatedAt, NOW.toISOString());
  assert.deepEqual(empty.ok && empty.observations, []);
  assert.deepEqual(empty.ok && empty.exclusions, []);
});

test("one fresh anchor remains one independent source and has no median", async () => {
  const result = await read([row("one", "snapshot-1", "1", ago(1_000))]);
  assert.equal(result.ok && result.totalIndependentSources, 1);
  assert.equal(result.ok && result.freshSourceCount, 1);
  assert.equal(result.ok && result.median, null);
  assert.equal(result.ok && result.observations[0]?.anchorName, "One Persisted");
  assert.deepEqual(result.ok && result.corridor, {
    slug: CORRIDOR,
    assetCodeFrom: "USDC",
    countryFrom: "US",
    assetCodeTo: "BRL",
    countryTo: "BR",
  });
});

test("same-anchor history selects latest first and never falls back to an older row", async () => {
  const result = await read([
    row("same", "older-fresh", "10", ago(60_000)),
    row("same", "newer-future", "20", new Date(NOW.getTime() + 1)),
  ]);
  assert.equal(result.ok && result.totalIndependentSources, 1);
  assert.equal(result.ok && result.observations[0]?.snapshotId, "newer-future");
  assert.equal(result.ok && result.freshSourceCount, 0);
  assert.equal(result.ok && result.observations[0]?.freshnessState, "future");
});

test("two and three independent fresh anchors produce exact medians", async () => {
  const even = await read([
    row("a", "a1", "0.100000000000000001", ago(1)),
    row("b", "b1", "0.100000000000000002", ago(2)),
  ]);
  assert.equal(even.ok && even.median, "0.1000000000000000015");

  const odd = await read([
    row("a", "a1", "10", ago(1)),
    row("b", "b1", "2", ago(2)),
    row("c", "c1", "3", ago(3)),
  ]);
  assert.equal(odd.ok && odd.median, "3");
});

test("freshness boundary is inclusive and greater ages are stale", async () => {
  const result = await read([
    row("boundary", "b1", "1", ago(RATE_FRESHNESS_THRESHOLD_MS)),
    row("stale", "s1", "2", ago(RATE_FRESHNESS_THRESHOLD_MS + 1)),
  ]);
  assert.equal(result.ok && result.observations[0]?.freshnessState, "fresh");
  assert.equal(result.ok && result.observations[1]?.freshnessState, "stale");
  assert.equal(result.ok && result.freshSourceCount, 1);
});

test("future, invalid-time, and invalid-rate observations are excluded safely", async () => {
  const result = await read([
    row("future", "f1", "1", new Date(NOW.getTime() + 1)),
    row("invalid-rate", "r1", "1e3", ago(1)),
    row("invalid-time", "t1", "1", "not-a-time"),
  ]);
  assert.equal(result.ok && result.freshSourceCount, 0);
  assert.deepEqual(result.ok && result.exclusions.map(({ exclusionReason }) => exclusionReason), [
    "future_timestamp",
    "invalid_rate",
    "invalid_timestamp",
  ]);
});

test("identical capturedAt values use the greater stable snapshot id", () => {
  const selected = selectLatestPerAnchor([
    row("anchor", "00000000-0000-0000-0000-000000000001", "1", ago(1)),
    row("anchor", "00000000-0000-0000-0000-000000000002", "2", ago(1)),
  ]);
  assert.equal(selected[0]?.id, "00000000-0000-0000-0000-000000000002");
});

test("read results are deeply immutable at object and collection boundaries", async () => {
  const result = await read([row("a", "a1", "1", ago(1))]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(result.ok && Object.isFrozen(result.observations), true);
  assert.equal(result.ok && Object.isFrozen(result.observations[0]), true);
  assert.equal(result.ok && Object.isFrozen(result.exclusions), true);
});

test("repository failures and invalid evaluation times expose only safe codes", async () => {
  const failed = await readLatestCorridorRate(CORRIDOR, {
    evaluatedAt: NOW,
    repository: {
      findCorridorBySlug: async () => { throw new Error("DATABASE_URL=secret"); },
      findLatestObservations: async () => [],
    },
  });
  assert.deepEqual(failed, { ok: false, corridorSlug: CORRIDOR, code: "READ_FAILURE" });
  assert.equal(JSON.stringify(failed).includes("secret"), false);
  assert.deepEqual(await readLatestCorridorRate(CORRIDOR, {
    evaluatedAt: new Date("invalid"),
    repository: repository([]),
  }), { ok: false, corridorSlug: CORRIDOR, code: "INVALID_EVALUATION_TIME" });
});

async function read(history: readonly LatestRateRepositoryObservation[]) {
  return readLatestCorridorRate(CORRIDOR, {
    evaluatedAt: NOW,
    repository: repository(history),
  });
}

function repository(
  history: readonly LatestRateRepositoryObservation[],
  exists = true,
): LatestRateRepository {
  return {
    findCorridorBySlug: async () => exists ? CORRIDOR_RECORD : null,
    findLatestObservations: async () => history,
  };
}

function row(
  anchorSlug: string,
  id: string,
  rate: string,
  capturedAt: Date | string,
): LatestRateRepositoryObservation {
  return Object.freeze({
    id,
    anchorSlug,
    anchorName: `${anchorSlug[0]!.toUpperCase()}${anchorSlug.slice(1)} Persisted`,
    rate,
    sourceAmount: "100",
    destinationAmount: "10",
    fee: "0",
    capturedAt,
  });
}

function ago(milliseconds: number): Date {
  return new Date(NOW.getTime() - milliseconds);
}


test("suppressed sources cannot count toward aggregate freshness or median", async () => {
  const result = await readLatestCorridorRate(CORRIDOR, {
    evaluatedAt: NOW,
    repository: repository([
      row("suppressed", "s1", "1", ago(1)),
      row("healthy", "h1", "3", ago(1)),
    ]),
    listSuppressed: async () => [{
      anchorSlug: "suppressed",
      corridorSlug: CORRIDOR,
    }],
  });

  assert.equal(result.ok && result.totalIndependentSources, 1);
  assert.equal(result.ok && result.freshSourceCount, 1);
  assert.equal(result.ok && result.median, null);
  assert.deepEqual(
    result.ok && result.observations.map(({ anchorSlug }) => anchorSlug),
    ["healthy"],
  );
});
