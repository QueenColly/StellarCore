import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  MAX_PAGE_LIMIT,
  NO_PAGINATION,
  NO_PAGINATION_QUERY,
  paginate,
  parsePagination,
  readPaginationQuery,
} from "@/lib/api/pagination";

test("no pagination parameters preserve the unpaginated default", () => {
  assert.deepEqual(parsePagination(NO_PAGINATION_QUERY), {
    ok: true,
    pagination: NO_PAGINATION,
  });
  assert.deepEqual(parsePagination({ limit: null, offset: null }), {
    ok: true,
    pagination: { limit: null, offset: 0 },
  });
});

test("query parameters are read only from the documented limit and offset names", () => {
  const parameters = new URLSearchParams("limit=2&offset=1&page=9&cursor=abc");
  assert.deepEqual(readPaginationQuery(parameters), { limit: "2", offset: "1" });
  assert.deepEqual(readPaginationQuery(new URLSearchParams("size=2")), {
    limit: null,
    offset: null,
  });
});

test("valid limits and offsets parse as bounded integers", () => {
  assert.deepEqual(parsePagination({ limit: "1", offset: null }), {
    ok: true,
    pagination: { limit: 1, offset: 0 },
  });
  assert.deepEqual(parsePagination({ limit: null, offset: "3" }), {
    ok: true,
    pagination: { limit: null, offset: 3 },
  });
  assert.deepEqual(parsePagination({ limit: "0", offset: "-1" }), {
    ok: false,
    message: `limit must be a positive integer no greater than ${MAX_PAGE_LIMIT}.`,
  });
});

test("malformed, zero, negative, and oversized values are rejected before repository access", () => {
  const invalid = [
    { limit: "", offset: null },
    { limit: "0", offset: null },
    { limit: "-1", offset: null },
    { limit: "2.5", offset: null },
    { limit: "abc", offset: null },
    { limit: " 2", offset: null },
    { limit: String(MAX_PAGE_LIMIT + 1), offset: null },
    { limit: null, offset: "" },
    { limit: null, offset: "-1" },
    { limit: null, offset: "1.5" },
    { limit: null, offset: "abc" },
    { limit: null, offset: " " },
    { limit: ["10", "20"], offset: null },
    { limit: null, offset: ["0", "5"] },
    { limit: null, offset: "9007199254740992" },
    { limit: null, offset: "9007199254740993" },
    { limit: null, offset: "999999999999999999999999999999999999999999999" },
    { limit: null, offset: "1e20" },
    { limit: null, offset: "Infinity" },
    { limit: null, offset: "NaN" },
  ] as const;

  for (const query of invalid) {
    const result = parsePagination(query);
    assert.equal(result.ok, false, JSON.stringify(query));
  }
});

test("safe integer boundary 9007199254740991 is accepted as valid offset", () => {
  const result = parsePagination({ limit: null, offset: "9007199254740991" });
  assert.deepEqual(result, {
    ok: true,
    pagination: { limit: null, offset: 9007199254740991 },
  });
});

test("offsets outside safe integer range (9007199254740992 and 9007199254740993) are rejected", () => {
  const result1 = parsePagination({ limit: null, offset: "9007199254740992" });
  assert.deepEqual(result1, {
    ok: false,
    message: "offset must be a non-negative integer.",
  });

  const result2 = parsePagination({ limit: null, offset: "9007199254740993" });
  assert.deepEqual(result2, {
    ok: false,
    message: "offset must be a non-negative integer.",
  });
});

test("duplicate query parameters are captured as arrays and fail pagination parsing", () => {
  const repeated = new URLSearchParams("limit=10&limit=20&offset=5&offset=15");
  assert.deepEqual(readPaginationQuery(repeated), {
    limit: ["10", "20"],
    offset: ["5", "15"],
  });
  const parsed = parsePagination(readPaginationQuery(repeated));
  assert.equal(parsed.ok, false);
});

test("the documented maximum limit is accepted", () => {
  assert.deepEqual(parsePagination({ limit: String(MAX_PAGE_LIMIT), offset: null }), {
    ok: true,
    pagination: { limit: MAX_PAGE_LIMIT, offset: 0 },
  });
});

test("both list routes read limit and offset from the request URL and keep caching disabled", () => {
  const handlerSource = readFileSync(
    new URL("../../../lib/api/requestHandlers.ts", import.meta.url),
    "utf8",
  );

  for (const [path, handler] of [
    ["anchors", "handleAnchorsRequest"],
    ["corridors", "handleCorridorsRequest"],
  ] as const) {
    const source = readFileSync(
      new URL(`../../../app/api/${path}/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      new RegExp(`return ${handler}\\(request\\)`),
      `${path} route must delegate the complete request`,
    );
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }

  assert.equal(
    [...handlerSource.matchAll(/readPaginationQuery\(new URL\(request\.url\)\.searchParams\)/g)].length,
    2,
    "both handlers must parse pagination from the request URL",
  );
  assert.equal(
    [...handlerSource.matchAll(/getRateLimiter\(\)\.check\(request, Date\.now\(\)\)/g)].length,
    4,
    "all shared public handlers must retain rate limiting",
  );
  assert.match(handlerSource, /publicApiJsonResponse/);
});

test("paginate slices deterministically without mutating the source", () => {
  const items = Object.freeze(["a", "b", "c", "d"]);

  assert.deepEqual(paginate(items, NO_PAGINATION), ["a", "b", "c", "d"]);
  assert.deepEqual(paginate(items, { limit: 2, offset: 0 }), ["a", "b"]);
  assert.deepEqual(paginate(items, { limit: 2, offset: 2 }), ["c", "d"]);
  assert.deepEqual(paginate(items, { limit: 2, offset: 3 }), ["d"]);
  assert.deepEqual(paginate(items, { limit: 2, offset: 10 }), []);
  assert.deepEqual(paginate(items, { limit: null, offset: 2 }), ["c", "d"]);
  assert.deepEqual([...items], ["a", "b", "c", "d"]);
  assert.equal(Object.isFrozen(paginate(items, { limit: 2, offset: 0 })), true);
});
