import assert from "node:assert/strict";
import test from "node:test";

import { GET, dynamic } from "@/app/api/rates/history/route";
import {
  getRateHistoryApiResult,
  serializeRateHistory,
} from "@/lib/api/rateHistory";
import type { CorridorRateHistory } from "@/types/rateHistory";

const CORRIDOR = "usdc-us-brl-br";
const NOW = new Date("2026-08-28T12:00:00.000Z");

test("route rejects missing and malformed corridor parameters safely", async () => {
  const missing = await GET(new Request("http://localhost/api/rates/history"));
  assert.equal(missing.status, 400);
  assert.deepEqual(await missing.json(), {
    error: {
      code: "missing_corridor",
      message: "A corridor slug is required.",
    },
  });

  for (const value of ["../rates", " USDC ", "a".repeat(101)]) {
    const response = await GET(
      new Request(
        `http://localhost/api/rates/history?corridor=${encodeURIComponent(value)}`,
      ),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_corridor");
  }
});

test("route validates days parameter correctly", async () => {
  for (const invalidDays of ["abc", "-1", "0", "366", "1.5"]) {
    const response = await GET(
      new Request(
        `http://localhost/api/rates/history?corridor=${CORRIDOR}&days=${encodeURIComponent(invalidDays)}`,
      ),
    );
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "invalid_days");
  }
});

test("route is request-dynamic and explicitly prevents caching", async () => {
  assert.equal(dynamic, "force-dynamic");
  const response = await GET(
    new Request("http://localhost/api/rates/history?corridor=bad--slug"),
  );
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("service maps unknown corridors and read failures to safe errors", async () => {
  const missing = await getRateHistoryApiResult(CORRIDOR, "30", {
    now: () => NOW,
    readHistory: async (slug) => ({
      ok: false,
      corridorSlug: slug,
      code: "CORRIDOR_NOT_FOUND",
    }),
  });
  assert.equal(missing.status, 404);
  assert.equal(missing.body.error.code, "corridor_not_found");

  const failed = await getRateHistoryApiResult(CORRIDOR, "30", {
    now: () => NOW,
    readHistory: async () => {
      throw new Error("DATABASE_URL=secret stack trace");
    },
  });
  assert.deepEqual(failed, {
    status: 500,
    body: {
      error: { code: "internal_error", message: "Unable to read rate history." },
    },
  });
  assert.equal(JSON.stringify(failed).includes("secret"), false);
});

test("successful rate history response serializes properly with deep immutability", () => {
  const history: CorridorRateHistory = Object.freeze({
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
    points: Object.freeze([
      Object.freeze({
        timestamp: NOW.toISOString(),
        medianRate: "5.25",
        state: "healthy",
        sourceCount: 2,
        freshSourceCount: 2,
        observations: Object.freeze([
          Object.freeze({
            anchorSlug: "anchor-a",
            anchorName: "Anchor A",
            rate: "5.20",
            sourceAmount: "100",
            destinationAmount: "520",
            fee: "0",
            capturedAt: NOW.toISOString(),
          }),
          Object.freeze({
            anchorSlug: "anchor-b",
            anchorName: "Anchor B",
            rate: "5.30",
            sourceAmount: "100",
            destinationAmount: "530",
            fee: "0",
            capturedAt: NOW.toISOString(),
          }),
        ]),
      }),
    ]),
  });

  const body = serializeRateHistory(history);
  assert.equal(body.windowDays, 30);
  assert.equal(body.points.length, 1);
  assert.equal(body.points[0]?.medianRate, "5.25");
  assert.equal(body.points[0]?.observations[0]?.anchor.name, "Anchor A");
  assert.equal(Object.isFrozen(body), true);
  assert.equal(Object.isFrozen(body.points), true);
  assert.equal(Object.isFrozen(body.points[0]), true);
  assert.equal(Object.isFrozen(body.points[0]?.observations), true);
  assert.equal(Object.isFrozen(body.points[0]?.observations[0]), true);
  assert.doesNotThrow(() => JSON.stringify(body));
});
