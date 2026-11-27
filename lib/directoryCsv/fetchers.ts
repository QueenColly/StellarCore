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
    Array.isArray(v.seps)
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
    typeof v.destinationCountry === "string"
  );
}

/**
 * Fetches all reviewed anchors from the public GET /api/anchors API using pagination.
 * Stops cleanly when the directory is exhausted or safety limit is reached.
 */
export async function fetchAllAnchors(
  options: DirectoryExportOptions = {},
  fetchImpl: DirectoryFetch = fetch,
): Promise<DirectoryFetchResult<PublicAnchorSummary>> {
  const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, 100);
  const safetyLimit = options.maxLimit ?? DEFAULT_SAFETY_LIMIT;
  const items: PublicAnchorSummary[] = [];
  let offset = 0;
  let isPartial = false;

  while (items.length < safetyLimit) {
    if (options.signal?.aborted) {
      return { ok: false, error: "Export request aborted." };
    }

    const url = `/api/anchors?limit=${pageSize}&offset=${offset}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
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

    const batch = Array.isArray(data?.anchors) ? data.anchors.filter(isAnchorSummary) : [];
    items.push(...batch);

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
  const pageSize = Math.min(options.pageSize ?? DEFAULT_PAGE_SIZE, 100);
  const safetyLimit = options.maxLimit ?? DEFAULT_SAFETY_LIMIT;
  const items: PublicCorridor[] = [];
  let offset = 0;
  let isPartial = false;

  while (items.length < safetyLimit) {
    if (options.signal?.aborted) {
      return { ok: false, error: "Export request aborted." };
    }

    const url = `/api/corridors?limit=${pageSize}&offset=${offset}`;
    let response: Response;
    try {
      response = await fetchImpl(url, {
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

    const batch = Array.isArray(data?.corridors) ? data.corridors.filter(isCorridorSummary) : [];
    items.push(...batch);

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
