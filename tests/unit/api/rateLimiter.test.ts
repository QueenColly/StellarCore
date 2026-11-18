import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createRateLimiter,
  getRateLimiter,
  PUBLIC_RATE_LIMIT,
  PUBLIC_RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_ERROR_BODY,
} from "@/lib/api/rateLimiter";

const BASE_URL = "http://localhost/api/anchors";

function requestWithIp(ip: string | null): Request {
  const headers = new Headers();
  if (ip !== null) headers.set("x-forwarded-for", ip);
  return new Request(BASE_URL, { headers });
}

test("production defaults are 100 requests per minute", () => {
  assert.equal(PUBLIC_RATE_LIMIT, 100);
  assert.equal(PUBLIC_RATE_LIMIT_WINDOW_MS, 60_000);
  assert.equal(getRateLimiter(), getRateLimiter());
});

test("requests up to the limit are allowed and exact boundary is enforced", async () => {
  const limiter = createRateLimiter(3, 60_000);
  const now = Date.now();

  for (let i = 0; i < 3; i += 1) {
    assert.deepEqual(await limiter.check(requestWithIp("203.0.113.1"), now), {
      allowed: true,
    });
  }

  const fourth = await limiter.check(requestWithIp("203.0.113.1"), now);
  assert.equal(fourth.allowed, false);
  if (fourth.allowed) return assert.fail("fourth request should be blocked");
  assert.equal(fourth.response.status, 429);
  assert.equal(fourth.response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await fourth.response.json(), RATE_LIMIT_ERROR_BODY);
});

test("different client IPs have independent budgets", async () => {
  const limiter = createRateLimiter(2, 60_000);
  const now = Date.now();

  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.1"), now), {
    allowed: true,
  });
  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.2"), now), {
    allowed: true,
  });
  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.2"), now), {
    allowed: true,
  });
  const blocked = await limiter.check(requestWithIp("198.51.100.2"), now);
  assert.equal(blocked.allowed, false);
  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.1"), now), {
    allowed: true,
  });
});

test("a fresh window resets the budget for the same client", async () => {
  const limiter = createRateLimiter(2, 60_000);
  const windowMs = 60_000;
  const now = 1_700_000_000_000;

  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.9"), now), {
    allowed: true,
  });
  assert.deepEqual(await limiter.check(requestWithIp("198.51.100.9"), now), {
    allowed: true,
  });
  assert.equal(
    (await limiter.check(requestWithIp("198.51.100.9"), now)).allowed,
    false,
  );

  const nextWindow = now + windowMs;
  assert.deepEqual(
    await limiter.check(requestWithIp("198.51.100.9"), nextWindow),
    { allowed: true },
  );
});

test("first entry of x-forwarded-for is used; fallbacks are real-ip then anonymous", async () => {
  const limiter = createRateLimiter(1, 60_000);
  const now = Date.now();

  const proxied = new Request(BASE_URL, {
    headers: { "x-forwarded-for": "198.51.100.7, 10.0.0.1" },
  });
  const realIp = new Request(BASE_URL, { headers: { "x-real-ip": "203.0.113.8" } });
  const bare = new Request(BASE_URL);

  assert.deepEqual(await limiter.check(proxied, now), { allowed: true });
  assert.equal((await limiter.check(proxied, now)).allowed, false, "same ip");
  assert.deepEqual(await limiter.check(realIp, now), { allowed: true });
  assert.equal((await limiter.check(realIp, now)).allowed, false, "same ip");
  assert.deepEqual(await limiter.check(bare, now), { allowed: true });
  assert.equal((await limiter.check(bare, now)).allowed, false, "anonymous");
});

test("every current public GET route enforces the shared limiter", () => {
  const routeFiles = [
    "../../../app/api/anchors/route.ts",
    "../../../app/api/anchors/[slug]/route.ts",
    "../../../app/api/corridors/route.ts",
    "../../../app/api/corridors/[slug]/route.ts",
    "../../../app/api/rates/route.ts",
    "../../../app/api/rates/history/route.ts",
    "../../../app/api/reputation/route.ts",
    "../../../app/api/reputation/[slug]/route.ts",
  ];

  for (const relative of routeFiles) {
    const source = readFileSync(new URL(relative, import.meta.url), "utf8");
    assert.match(source, /@\/lib\/api\/rateLimiter/);
    assert.match(source, /getRateLimiter\(\)\.check\(request, Date\.now\(\)\)/);
  }

  const internalCron = readFileSync(
    new URL("../../../app/api/internal/cron/refresh/route.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(internalCron, /@\/lib\/api\/rateLimiter/);
});
