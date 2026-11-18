/**
 * Shared `limit`/`offset` handling for the public directory APIs. Both route
 * handlers stay thin: they pass the raw query strings here and the API module
 * owns validation, so pagination is optional and never changes the response
 * shape. When neither parameter is supplied the full registry is returned
 * exactly as before.
 */

import { readQueryParameter } from "@/lib/api/http";

export const MAX_PAGE_LIMIT = 100;

const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;
const NON_NEGATIVE_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;

export type PaginationQuery = Readonly<{
  limit: string | readonly string[] | null;
  offset: string | readonly string[] | null;
}>;

export type Pagination = Readonly<{
  limit: number | null;
  offset: number;
}>;

export type PaginationParseResult =
  | Readonly<{ ok: true; pagination: Pagination }>
  | Readonly<{ ok: false; message: string }>;

export const NO_PAGINATION: Pagination = Object.freeze({ limit: null, offset: 0 });

export const NO_PAGINATION_QUERY: PaginationQuery = Object.freeze({
  limit: null,
  offset: null,
});

export function readPaginationQuery(parameters: URLSearchParams): PaginationQuery {
  return Object.freeze({
    limit: readQueryParameter(parameters, "limit"),
    offset: readQueryParameter(parameters, "offset"),
  });
}

export function parsePagination(query: PaginationQuery): PaginationParseResult {
  const limit = parseLimit(query.limit);
  if (!limit.ok) return limit;

  const offset = parseOffset(query.offset);
  if (!offset.ok) return offset;

  if (limit.value === null && offset.value === 0) {
    return Object.freeze({ ok: true, pagination: NO_PAGINATION });
  }

  return Object.freeze({
    ok: true,
    pagination: Object.freeze({ limit: limit.value, offset: offset.value }),
  });
}

export function paginate<T>(
  items: readonly T[],
  pagination: Pagination,
): readonly T[] {
  const sliced = pagination.limit === null
    ? items.slice(pagination.offset)
    : items.slice(pagination.offset, pagination.offset + pagination.limit);

  return Object.freeze(sliced);
}

function parseLimit(
  raw: string | readonly string[] | null,
): Readonly<{ ok: true; value: number | null }> | Readonly<{ ok: false; message: string }> {
  if (raw === null) return Object.freeze({ ok: true, value: null });
  if (typeof raw !== "string") {
    return Object.freeze({
      ok: false,
      message: `limit must be a positive integer no greater than ${MAX_PAGE_LIMIT}.`,
    });
  }
  if (!POSITIVE_INTEGER_PATTERN.test(raw)) {
    return Object.freeze({
      ok: false,
      message: `limit must be a positive integer no greater than ${MAX_PAGE_LIMIT}.`,
    });
  }

  const value = Number(raw);
  if (value > MAX_PAGE_LIMIT) {
    return Object.freeze({
      ok: false,
      message: `limit must be a positive integer no greater than ${MAX_PAGE_LIMIT}.`,
    });
  }

  return Object.freeze({ ok: true, value });
}

function parseOffset(
  raw: string | readonly string[] | null,
): Readonly<{ ok: true; value: number }> | Readonly<{ ok: false; message: string }> {
  if (raw === null) return Object.freeze({ ok: true, value: 0 });
  if (typeof raw !== "string") {
    return Object.freeze({
      ok: false,
      message: "offset must be a non-negative integer.",
    });
  }
  if (!NON_NEGATIVE_INTEGER_PATTERN.test(raw)) {
    return Object.freeze({
      ok: false,
      message: "offset must be a non-negative integer.",
    });
  }

  return Object.freeze({ ok: true, value: Number(raw) });
}

