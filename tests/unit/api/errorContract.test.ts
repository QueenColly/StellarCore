import assert from "node:assert/strict";
import test from "node:test";

import * as anchorDetailRoute from "@/app/api/anchors/[slug]/route";
import * as corridorDetailRoute from "@/app/api/corridors/[slug]/route";
import * as rateHistoryRoute from "@/app/api/rates/history/route";
import * as ratesRoute from "@/app/api/rates/route";
import * as reputationDetailRoute from "@/app/api/reputation/[slug]/route";
import { publicApiErrorEnvelope, publicApiErrorResult } from "@/lib/api/errors";
import { publicApiJsonResponse } from "@/lib/api/http";
import { getRatesApiResult } from "@/lib/api/rates";
import {
  PUBLIC_API_ERROR_CODES,
  PUBLIC_API_ERROR_STATUS_BY_CODE,
} from "@/types/api/errors";

test("public error registry covers documented HTTP classes and current validation codes", () => {
  assert.deepEqual([...new Set(Object.values(PUBLIC_API_ERROR_STATUS_BY_CODE))].sort(), [
    400, 404, 429, 500, 503,
  ]);
  assert.equal(PUBLIC_API_ERROR_STATUS_BY_CODE.invalid_days, 400);
  assert.equal(PUBLIC_API_ERROR_STATUS_BY_CODE.rate_limited, 429);
  assert.equal(PUBLIC_API_ERROR_STATUS_BY_CODE.upstream_unavailable, 503);
  for (const code of PUBLIC_API_ERROR_CODES) assert.match(code, /^[a-z0-9_]+$/);
});

test("error envelope is exactly error.code and error.message", () => {
  const envelope = publicApiErrorEnvelope("internal_error", "Unable to load.");
  assert.deepEqual(envelope, {
    error: { code: "internal_error", message: "Unable to load." },
  });
  assert.deepEqual(Object.keys(envelope), ["error"]);
  assert.deepEqual(Object.keys(envelope.error).sort(), ["code", "message"]);
  assert.equal(Object.isFrozen(envelope), true);
  assert.equal(Object.isFrozen(envelope.error), true);
});

test("status is derived from code and shared serializer preserves additional safe headers", async () => {
  const result = publicApiErrorResult("corridor_not_found", "Corridor not found.");
  const response = publicApiJsonResponse(result, { "X-Evidence-State": "stale" });
  assert.equal(response.status, 404);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-evidence-state"), "stale");
  assert.deepEqual(await response.json(), {
    error: { code: "corridor_not_found", message: "Corridor not found." },
  });
});

test("representative public routes use the same validation envelope", async () => {
  const cases = [
    await anchorDetailRoute.GET(
      new Request("http://localhost/api/anchors/bad--slug"),
      { params: Promise.resolve({ slug: "bad--slug" }) },
    ),
    await corridorDetailRoute.GET(
      new Request("http://localhost/api/corridors/bad--slug"),
      { params: Promise.resolve({ slug: "bad--slug" }) },
    ),
    await reputationDetailRoute.GET(
      new Request("http://localhost/api/reputation/bad--slug"),
      { params: Promise.resolve({ slug: "bad--slug" }) },
    ),
    await ratesRoute.GET(new Request("http://localhost/api/rates")),
    await rateHistoryRoute.GET(
      new Request("http://localhost/api/rates/history?corridor=usdc-us-brl-br&days=bad"),
    ),
  ];

  const expected = [
    "invalid_anchor_slug",
    "invalid_corridor_slug",
    "invalid_anchor_slug",
    "missing_corridor",
    "invalid_days",
  ];

  for (let index = 0; index < cases.length; index += 1) {
    const response = cases[index]!;
    assert.equal(response.status, 400);
    const body = await response.json() as { error: { code: string; message: string } };
    assert.deepEqual(Object.keys(body), ["error"]);
    assert.deepEqual(Object.keys(body.error).sort(), ["code", "message"]);
    assert.equal(body.error.code, expected[index]);
  }
});

test("unknown exceptions are reported internally but never leak into the client envelope", async () => {
  const secret = new Error(
    "postgresql://admin:super-secret@private-db.internal/core JWT=eyJ.secret.payload",
  );
  const reported: unknown[] = [];

  const result = await getRatesApiResult("usdc-us-brl-br", {
    readLatestRate: async () => { throw secret; },
    reportError: (error, context) => reported.push({ error, context }),
    staleEvidenceStore: {
      read: async () => null,
      write: async () => {},
    },
  });

  assert.equal(result.status, 500);
  assert.equal(reported.length, 1);
  assert.equal((reported[0] as { error: unknown }).error, secret);

  const serialized = JSON.stringify(result.body);
  assert.equal(serialized.includes("super-secret"), false);
  assert.equal(serialized.includes("private-db.internal"), false);
  assert.equal(serialized.includes("eyJ.secret.payload"), false);
  assert.deepEqual(result.body, {
    error: {
      code: "internal_error",
      message: "Unable to read rates.",
    },
  });
});
