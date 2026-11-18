import assert from "node:assert/strict";
import test from "node:test";

import * as anchorDetailRoute from "@/app/api/anchors/[slug]/route";
import * as anchorsRoute from "@/app/api/anchors/route";
import * as corridorDetailRoute from "@/app/api/corridors/[slug]/route";
import * as corridorsRoute from "@/app/api/corridors/route";
import * as rateHistoryRoute from "@/app/api/rates/history/route";
import * as ratesRoute from "@/app/api/rates/route";
import * as reputationDetailRoute from "@/app/api/reputation/[slug]/route";
import { getAnchorApiResult, getAnchorsApiResult } from "@/lib/api/anchors";
import { getCorridorApiResult, getCorridorsApiResult } from "@/lib/api/corridors";
import { publicApiErrorResult } from "@/lib/api/errors";
import {
  publicApiErrorResponse,
  publicApiJsonResponse,
  publicApiUnexpectedErrorResponse,
} from "@/lib/api/http";
import { getRateHistoryApiResult } from "@/lib/api/rateHistory";
import { createRateLimiter } from "@/lib/api/rateLimiter";
import { getRatesApiResult } from "@/lib/api/rates";
import {
  getAnchorReputationApiResult,
  getReputationApiResult,
} from "@/lib/api/reputation";
import { getScheduledRefreshResponse } from "@/lib/scheduled/http";
import type { PublicApiErrorCode } from "@/types/api/errors";

const NO_CACHE_POLICY = "no-store";

function assertNoStorePolicy(response: Response, failureContext: string): void {
  const cacheControl = response.headers.get("cache-control");
  assert.equal(
    cacheControl,
    NO_CACHE_POLICY,
    `Expected '${NO_CACHE_POLICY}' for ${failureContext}, got: '${cacheControl}'`,
  );
  assert.equal(
    response.headers.get("cache-control")?.includes("public"),
    false,
    `Error response must never be marked public for ${failureContext}`,
  );
  assert.equal(
    response.headers.get("cache-control")?.includes("max-age="),
    false,
    `Error response must never include a positive max-age for ${failureContext}`,
  );
}

test("validation errors (400) enforce strict no-store policy across all route handlers", async () => {
  const cases: Array<{ name: string; request: () => Promise<Response> }> = [
    {
      name: "rates: missing corridor parameter",
      request: () => ratesRoute.GET(new Request("http://localhost/api/rates")),
    },
    {
      name: "rates: malformed corridor parameter",
      request: () =>
        ratesRoute.GET(new Request("http://localhost/api/rates?corridor=bad--corridor")),
    },
    {
      name: "rate history: missing corridor parameter",
      request: () =>
        rateHistoryRoute.GET(new Request("http://localhost/api/rates/history")),
    },
    {
      name: "rate history: invalid days parameter",
      request: () =>
        rateHistoryRoute.GET(
          new Request("http://localhost/api/rates/history?corridor=usdc-us-brl-br&days=-5"),
        ),
    },
    {
      name: "anchors: invalid pagination query",
      request: () =>
        anchorsRoute.GET(new Request("http://localhost/api/anchors?limit=999")),
    },
    {
      name: "anchors detail: invalid anchor slug",
      request: () =>
        anchorDetailRoute.GET(
          new Request("http://localhost/api/anchors/bad--slug"),
          { params: Promise.resolve({ slug: "bad--slug" }) },
        ),
    },
    {
      name: "corridors: invalid pagination query",
      request: () =>
        corridorsRoute.GET(new Request("http://localhost/api/corridors?offset=-1")),
    },
    {
      name: "corridors detail: invalid corridor slug",
      request: () =>
        corridorDetailRoute.GET(
          new Request("http://localhost/api/corridors/bad--slug"),
          { params: Promise.resolve({ slug: "bad--slug" }) },
        ),
    },
    {
      name: "reputation detail: invalid anchor slug",
      request: () =>
        reputationDetailRoute.GET(
          new Request("http://localhost/api/reputation/bad--slug"),
          { params: Promise.resolve({ slug: "bad--slug" }) },
        ),
    },
  ];

  for (const { name, request } of cases) {
    const response = await request();
    assert.equal(response.status, 400, `Expected status 400 for ${name}`);
    assertNoStorePolicy(response, name);
  }
});

test("missing resource errors (404) enforce strict no-store policy across all entities", async () => {
  const emptyRepo = Object.freeze({
    findAll: async () => [],
    findBySlug: async () => null,
  });

  const anchor404Result = await getAnchorApiResult("missing-anchor", {
    repository: emptyRepo,
  });
  const anchor404Response = publicApiJsonResponse(anchor404Result);
  assert.equal(anchor404Response.status, 404);
  assertNoStorePolicy(anchor404Response, "anchor not found (404)");

  const corridor404Result = await getCorridorApiResult("missing-corridor", {
    repository: emptyRepo,
  });
  const corridor404Response = publicApiJsonResponse(corridor404Result);
  assert.equal(corridor404Response.status, 404);
  assertNoStorePolicy(corridor404Response, "corridor not found (404)");

  const rates404Result = await getRatesApiResult("usdc-us-brl-br", {
    readLatestRate: async (slug) => ({
      ok: false,
      corridorSlug: slug,
      code: "CORRIDOR_NOT_FOUND",
    }),
  });
  const rates404Response = publicApiJsonResponse(rates404Result);
  assert.equal(rates404Response.status, 404);
  assertNoStorePolicy(rates404Response, "rate corridor not found (404)");

  const history404Result = await getRateHistoryApiResult("usdc-us-brl-br", "30", {
    readHistory: async (slug) => ({
      ok: false,
      corridorSlug: slug,
      code: "CORRIDOR_NOT_FOUND",
    }),
  });
  const history404Response = publicApiJsonResponse(history404Result);
  assert.equal(history404Response.status, 404);
  assertNoStorePolicy(history404Response, "rate history corridor not found (404)");

  const rep404Result = await getAnchorReputationApiResult("missing-anchor", {
    repository: emptyRepo,
  });
  const rep404Response = publicApiJsonResponse(rep404Result);
  assert.equal(rep404Response.status, 404);
  assertNoStorePolicy(rep404Response, "anchor reputation not found (404)");
});

test("rate limit failures (429) enforce strict no-store policy", async () => {
  const limiter = createRateLimiter(1, 60_000);
  const request = new Request("http://localhost/api/rates?corridor=usdc-us-brl-br", {
    headers: { "x-forwarded-for": "198.51.100.42" },
  });

  const first = await limiter.check(request, 1000);
  assert.equal(first.allowed, true);

  const second = await limiter.check(request, 1001);
  assert.equal(second.allowed, false);
  if (!second.allowed) {
    assert.equal(second.response.status, 429);
    assertNoStorePolicy(second.response, "rate limiter exceeded (429)");
  }
});

test("database and internal failures (500) enforce strict no-store policy", async () => {
  const failingRepo = Object.freeze({
    findAll: async () => {
      throw new Error("PostgreSQL connection refused: sensitive credentials DB_PASS=xyz");
    },
    findBySlug: async () => {
      throw new Error("PostgreSQL connection refused: sensitive credentials DB_PASS=xyz");
    },
  });

  const silentReporter = () => {};

  const anchors500Result = await getAnchorsApiResult({
    repository: failingRepo,
    reportError: silentReporter,
  });
  const anchors500Response = publicApiJsonResponse(anchors500Result);
  assert.equal(anchors500Response.status, 500);
  assertNoStorePolicy(anchors500Response, "anchors repository failure (500)");

  const corridors500Result = await getCorridorsApiResult({
    repository: failingRepo,
    reportError: silentReporter,
  });
  const corridors500Response = publicApiJsonResponse(corridors500Result);
  assert.equal(corridors500Response.status, 500);
  assertNoStorePolicy(corridors500Response, "corridors repository failure (500)");

  const reputation500Result = await getReputationApiResult({
    repository: failingRepo,
    reportError: silentReporter,
  });
  const reputation500Response = publicApiJsonResponse(reputation500Result);
  assert.equal(reputation500Response.status, 500);
  assertNoStorePolicy(reputation500Response, "reputation repository failure (500)");

  const rates500Result = await getRatesApiResult("usdc-us-brl-br", {
    readLatestRate: async () => {
      throw new Error("Database timeout while reading latest rates");
    },
    reportError: silentReporter,
    staleEvidenceStore: {
      read: async () => null,
      write: async () => {},
    },
  });
  const rates500Response = publicApiJsonResponse(rates500Result);
  assert.equal(rates500Response.status, 500);
  assertNoStorePolicy(rates500Response, "rates database failure (500)");

  const history500Result = await getRateHistoryApiResult("usdc-us-brl-br", "30", {
    readHistory: async () => {
      throw new Error("Database timeout while reading rate history");
    },
    reportError: silentReporter,
    staleEvidenceStore: {
      read: async () => null,
      write: async () => {},
    },
  });
  const history500Response = publicApiJsonResponse(history500Result);
  assert.equal(history500Response.status, 500);
  assertNoStorePolicy(history500Response, "rate history database failure (500)");
});

test("unexpected exceptions and unhandled errors enforce strict no-store policy", async () => {
  const unexpectedErrorResponse = publicApiUnexpectedErrorResponse(
    new Error("Unexpected runtime segmentation or unhandled rejection"),
  );
  assert.equal(unexpectedErrorResponse.status, 500);
  assertNoStorePolicy(unexpectedErrorResponse, "unexpected exception helper (500)");

  const cronFailingResponse = await getScheduledRefreshResponse(
    new Request("http://localhost/api/internal/cron/refresh", {
      headers: { authorization: "Bearer secret" },
    }),
    {
      cronSecret: "secret",
      run: async () => {
        throw new Error("Cron job internal failure");
      },
    },
  );
  assert.equal(cronFailingResponse.status, 500);
  assertNoStorePolicy(cronFailingResponse, "cron unexpected run failure (500)");

  const cronUnauthorizedResponse = await getScheduledRefreshResponse(
    new Request("http://localhost/api/internal/cron/refresh"),
    { cronSecret: "secret" },
  );
  assert.equal(cronUnauthorizedResponse.status, 401);
  assertNoStorePolicy(cronUnauthorizedResponse, "cron unauthorized failure (401)");
});

test("upstream service unavailable failures (503) enforce strict no-store policy", () => {
  const upstream503Result = publicApiErrorResult(
    "upstream_unavailable",
    "Upstream anchor quote server is currently unreachable.",
  );
  const upstream503Response = publicApiJsonResponse(upstream503Result);
  assert.equal(upstream503Response.status, 503);
  assertNoStorePolicy(upstream503Response, "upstream unavailable (503)");
});

test("error responses strictly disallow caching overrides from caller headers", () => {
  const errorCodes: PublicApiErrorCode[] = [
    "missing_corridor",
    "invalid_corridor",
    "invalid_days",
    "invalid_corridor_slug",
    "invalid_anchor_slug",
    "anchor_not_found",
    "corridor_not_found",
    "invalid_pagination",
    "rate_limited",
    "internal_error",
    "upstream_unavailable",
  ];

  for (const code of errorCodes) {
    const errorResult = publicApiErrorResult(code, `Sample failure for ${code}`);

    const withPublicCache = publicApiJsonResponse(errorResult, {
      "Cache-Control": "public, max-age=3600, s-maxage=7200",
    });
    assertNoStorePolicy(withPublicCache, `${code} with Cache-Control attempt`);

    const withLowercaseCache = publicApiJsonResponse(errorResult, {
      "cache-control": "max-age=86400, stale-while-revalidate=300",
    });
    assertNoStorePolicy(withLowercaseCache, `${code} with lowercase cache-control attempt`);

    const viaErrorHelper = publicApiErrorResponse(code, `Error for ${code}`, {
      "Cache-Control": "public, max-age=60",
    });
    assertNoStorePolicy(viaErrorHelper, `${code} via publicApiErrorResponse`);
  }
});

test("header behavior is consistent across all failure types", async () => {
  const rateLimitDecision = await createRateLimiter(0).check(
    new Request("http://localhost/api/rates"),
    1000,
  );
  if (rateLimitDecision.allowed) {
    assert.fail("expected rate limiter with limit 0 to block");
  }

  const failures: Response[] = [
    await ratesRoute.GET(new Request("http://localhost/api/rates")),
    await getScheduledRefreshResponse(
      new Request("http://localhost/api/internal/cron/refresh"),
      { cronSecret: "test-secret" },
    ),
    publicApiJsonResponse(publicApiErrorResult("anchor_not_found", "Not found.")),
    rateLimitDecision.response,
    publicApiUnexpectedErrorResponse(new Error("Database failure")),
    publicApiJsonResponse(publicApiErrorResult("upstream_unavailable", "Unavailable")),
  ];

  const statuses = failures.map((r) => r.status);
  assert.deepEqual(statuses, [400, 401, 404, 429, 500, 503]);

  for (let i = 0; i < failures.length; i++) {
    const failure = failures[i]!;
    assertNoStorePolicy(failure, `failure status ${failure.status}`);
  }
});

test("error responses preserve non-cacheable safe headers while enforcing no-store", () => {
  const errorResult = publicApiErrorResult("corridor_not_found", "Corridor not found.");
  const response = publicApiJsonResponse(errorResult, {
    "X-Evidence-State": "stale",
    "X-Custom-Diagnostic": "corridor-lookup-v1",
    "Retry-After": "60",
  });

  assert.equal(response.status, 404);
  assertNoStorePolicy(response, "404 with custom headers");
  assert.equal(response.headers.get("x-evidence-state"), "stale");
  assert.equal(response.headers.get("x-custom-diagnostic"), "corridor-lookup-v1");
  assert.equal(response.headers.get("retry-after"), "60");
});

test("successful public responses retain intended caching policies", () => {
  const successResult = Object.freeze({
    status: 200,
    body: Object.freeze({ status: "ok", data: [1, 2, 3] }),
  });

  const customCachePolicy = "public, max-age=300, s-maxage=600, stale-while-revalidate=60";
  const responseWithCache = publicApiJsonResponse(successResult, {
    "Cache-Control": customCachePolicy,
  });

  assert.equal(responseWithCache.status, 200);
  assert.equal(
    responseWithCache.headers.get("cache-control"),
    customCachePolicy,
    "Successful public response should retain its intended Cache-Control policy",
  );

  const lowercasePolicy = "public, max-age=60";
  const responseWithLowercase = publicApiJsonResponse(successResult, {
    "cache-control": lowercasePolicy,
  });

  assert.equal(responseWithLowercase.status, 200);
  assert.equal(
    responseWithLowercase.headers.get("cache-control"),
    lowercasePolicy,
    "Successful public response should retain lowercase cache-control header",
  );

  const defaultResponse = publicApiJsonResponse(successResult);
  assert.equal(defaultResponse.status, 200);
  assert.equal(
    defaultResponse.headers.get("cache-control"),
    NO_CACHE_POLICY,
    "Successful response defaults to no-store when no caching policy is explicitly provided",
  );
});

test("cache-control assertions are provider-independent", () => {
  const result = publicApiErrorResult("internal_error", "Internal error.");
  const response = publicApiJsonResponse(result);

  assert.equal(response instanceof Response, true);
  assert.equal(response.headers instanceof Headers, true);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-vercel-cache"), null);
  assert.equal(response.headers.get("cf-cache-status"), null);
});
