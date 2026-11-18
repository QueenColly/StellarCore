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
  ] as const;

  for (const query of invalid) {
    const result = parsePagination(query);
    assert.equal(result.ok, false, JSON.stringify(query));
  }
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
  for (const path of ["anchors", "corridors"]) {
    const source = readFileSync(
      new URL(`../../../app/api/${path}/route.ts`, import.meta.url),
      "utf8",
    );
    assert.match(
      source,
      /readPaginationQuery\(new URL\(request\.url\)\.searchParams\)/,
      `${path} route must pass the request query parameters`,
    );
    assert.match(source, /publicApiJsonResponse/);
    assert.match(source, /getRateLimiter\(\)\.check\(request, Date\.now\(\)\)/);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/);
  }
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
