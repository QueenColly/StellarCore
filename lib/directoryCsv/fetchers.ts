import type { PublicAnchorSummary, PublicAnchorsResponse } from "@/types/api/anchors";
import type { PublicCorridor, PublicCorridorsResponse } from "@/types/api/corridors";
import type { DirectoryExportOptions, DirectoryFetchResult } from "./types";

export const DEFAULT_PAGE_SIZE = 100;
export const DEFAULT_SAFETY_LIMIT = 1000;

export type DirectoryFetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Validates whether an unknown value conforms to PublicAnchorSummary.
 */
function isAnchorSummary(value: unknown): value is PublicAnchorSummary {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    typeof v.name === "string" &&
    typeof v.homeDomain === "string" &&
    typeof v.status === "string" &&
    ["LIVE", "DEGRADED", "DOWN", "UNKNOWN"].includes(v.status) &&
    Array.isArray(v.seps) && v.seps.every((sep: unknown) => typeof sep === "number" && Number.isSafeInteger(sep) && sep > 0) &&
    typeof v.isTransferCapable === "boolean" &&
    isCount(v.corridorCount)
  );
}

/**
 * Validates whether an unknown value conforms to PublicCorridor.
 */
function isCorridorSummary(value: unknown): value is PublicCorridor {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.slug === "string" &&
    typeof v.sourceAsset === "string" &&
    typeof v.sourceCountry === "string" &&
    typeof v.destinationAsset === "string" &&
    typeof v.destinationCountry === "string" &&
    isCount(v.anchorCount)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPage<T>(value: unknown, key: "anchors" | "corridors", validate: (item: unknown) => item is T, pageSize: number): value is Record<typeof key, T[]> & { count: number } {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const rows = record[key];
  return Array.isArray(rows) && rows.length <= pageSize && record.count === rows.length && rows.every(validate);
}

function validOptions(pageSize: number, safetyLimit: number): boolean {
  return Number.isSafeInteger(pageSize) && pageSize >= 1 && pageSize <= 100
    && Number.isSafeInteger(safetyLimit) && safetyLimit >= 1 && safetyLimit <= DEFAULT_SAFETY_LIMIT;
}

/**
 * Fetches all reviewed anchors from the public GET /api/anchors API using pagination.
 * Stops cleanly when the directory is exhausted or safety limit is reached.
 */
export async function fetchAllAnchors(
  options: DirectoryExportOptions = {},
  fetchImpl: DirectoryFetch = fetch,
): Promise<DirectoryFetchResult<PublicAnchorSummary>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const safetyLimit = options.maxLimit ?? DEFAULT_SAFETY_LIMIT;
  if (!validOptions(pageSize, safetyLimit)) {
    return { ok: false, error: "Invalid export pagination options." };
  }
  const items: PublicAnchorSummary[] = [];
  let offset = 0;
  let isPartial = false;
  const seen = new Set<string>();

  while (items.length < safetyLimit) {
    if (options.signal?.aborted) {
      return { ok: false, error: "Export request aborted." };
    }

    const url = `/api/anchors?limit=${pageSize}&offset=${offset}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: options.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { ok: false, error: `Failed to fetch anchors: ${msg}` };
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error?.message) errorDetail = body.error.message;
      } catch {
        // use default HTTP status
      }
      return { ok: false, error: `Failed to fetch anchors: ${errorDetail}` };
    }

    let data: PublicAnchorsResponse;
    try {
      data = (await response.json()) as PublicAnchorsResponse;
    } catch {
      return { ok: false, error: "Invalid JSON response from anchors API." };
    }

    if (!validPage(data, "anchors", isAnchorSummary, pageSize)) {
      return { ok: false, error: "Invalid anchors API response; export cancelled rather than omitting records." };
    }
    const batch = data.anchors;
    for (const item of batch) {
      if (seen.has(item.slug)) {
        return { ok: false, error: "Directory changed during pagination; retry the export." };
      }
      seen.add(item.slug);
      items.push(item);
    }

    if (batch.length < pageSize) {
      // Reached the end of available records
      break;
    }

    offset += pageSize;
  }

  if (items.length >= safetyLimit) {
    isPartial = true;
  }

  return {
    ok: true,
    items: Object.freeze(items.slice(0, safetyLimit)),
    totalCount: items.length,
    isPartial,
    safetyLimit,
  };
}

/**
 * Fetches all reviewed corridors from the public GET /api/corridors API using pagination.
 * Stops cleanly when the directory is exhausted or safety limit is reached.
 */
export async function fetchAllCorridors(
  options: DirectoryExportOptions = {},
  fetchImpl: DirectoryFetch = fetch,
): Promise<DirectoryFetchResult<PublicCorridor>> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const safetyLimit = options.maxLimit ?? DEFAULT_SAFETY_LIMIT;
  if (!validOptions(pageSize, safetyLimit)) {
    return { ok: false, error: "Invalid export pagination options." };
  }
  const items: PublicCorridor[] = [];
  let offset = 0;
  let isPartial = false;
  const seen = new Set<string>();

  while (items.length < safetyLimit) {
    if (options.signal?.aborted) {
      return { ok: false, error: "Export request aborted." };
    }

    const url = `/api/corridors?limit=${pageSize}&offset=${offset}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
        signal: options.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Network error";
      return { ok: false, error: `Failed to fetch corridors: ${msg}` };
    }

    if (!response.ok) {
      let errorDetail = `HTTP ${response.status}`;
      try {
        const body = await response.json();
        if (body?.error?.message) errorDetail = body.error.message;
      } catch {
        // use default HTTP status
      }
      return { ok: false, error: `Failed to fetch corridors: ${errorDetail}` };
    }

    let data: PublicCorridorsResponse;
    try {
      data = (await response.json()) as PublicCorridorsResponse;
    } catch {
      return { ok: false, error: "Invalid JSON response from corridors API." };
    }

    if (!validPage(data, "corridors", isCorridorSummary, pageSize)) {
      return { ok: false, error: "Invalid corridors API response; export cancelled rather than omitting records." };
    }
    const batch = data.corridors;
    for (const item of batch) {
      if (seen.has(item.slug)) {
        return { ok: false, error: "Directory changed during pagination; retry the export." };
      }
      seen.add(item.slug);
      items.push(item);
    }

    if (batch.length < pageSize) {
      // Reached the end of available records
      break;
    }

    offset += pageSize;
  }

  if (items.length >= safetyLimit) {
    isPartial = true;
  }

  return {
    ok: true,
    items: Object.freeze(items.slice(0, safetyLimit)),
    totalCount: items.length,
    isPartial,
    safetyLimit,
  };
}
