import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor, PublicCorridorDetail } from "@/types/api/corridors";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;

export type MembershipState = "reviewed" | "not_reviewed" | "unknown";
export type MembershipLabel =
  | "Reviewed association"
  | "Not reviewed"
  | "Unknown (data unavailable)";

export type MembershipCell = Readonly<{
  state: MembershipState;
  label: MembershipLabel;
}>;

export type MatrixAnchorRow = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  detailHref: string;
  memberships: Readonly<Record<string, MembershipCell>>;
}>;

export type MatrixCorridorCol = Readonly<{
  slug: string;
  label: string;
  detailHref: string;
  anchorCount: number;
}>;

export type AnchorCorridorMatrix = Readonly<{
  anchors: readonly MatrixAnchorRow[];
  corridors: readonly MatrixCorridorCol[];
  hasUnknownCells: boolean;
  stale: boolean;
}>;

export function isSafeSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

export function anchorDetailHref(slug: string): string {
  if (!isSafeSlug(slug)) return "/anchors";
  return `/anchors/${encodeURIComponent(slug)}`;
}

export function corridorDetailHref(slug: string): string {
  if (!isSafeSlug(slug)) return "/corridors";
  return `/corridors/${encodeURIComponent(slug)}`;
}

export function formatCorridorLabel(corridor: Partial<PublicCorridor>): string {
  if (
    corridor.sourceAsset &&
    corridor.destinationAsset &&
    corridor.sourceCountry &&
    corridor.destinationCountry
  ) {
    return `${corridor.sourceAsset} (${corridor.sourceCountry}) → ${corridor.destinationAsset} (${corridor.destinationCountry})`;
  }
  return corridor.slug || "Unknown corridor";
}

export function readApiErrorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (
    typeof error === "object" &&
    error !== null &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return (error as { message: string }).message;
  }
  if (typeof (body as { message?: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return null;
}

/**
 * Builds the matrix from parsed list data and optional corridor details.
 * If details for a corridor are null or undefined (e.g. fetch failed or not attempted),
 * all cells for that corridor are labeled as "Unknown (data unavailable)".
 */
export function buildAnchorCorridorMatrix({
  rawAnchors,
  rawCorridors,
  corridorDetailsBySlug,
  stale = false,
}: {
  rawAnchors: readonly unknown[];
  rawCorridors: readonly unknown[];
  corridorDetailsBySlug: Readonly<Record<string, PublicCorridorDetail | null | undefined>>;
  stale?: boolean;
}): AnchorCorridorMatrix {
  // Deduplicate and filter valid anchors
  const anchorMap = new Map<string, { slug: string; name: string; homeDomain: string }>();
  for (const item of rawAnchors) {
    if (typeof item === "object" && item !== null) {
      const a = item as Partial<PublicAnchorSummary>;
      if (typeof a.slug === "string" && isSafeSlug(a.slug)) {
        if (!anchorMap.has(a.slug)) {
          anchorMap.set(a.slug, {
            slug: a.slug,
            name: typeof a.name === "string" && a.name.trim() ? a.name.trim() : a.slug,
            homeDomain: typeof a.homeDomain === "string" ? a.homeDomain : "",
          });
        }
      }
    }
  }

  // Deduplicate and filter valid corridors
  const corridorMap = new Map<string, MatrixCorridorCol>();
  for (const item of rawCorridors) {
    if (typeof item === "object" && item !== null) {
      const c = item as Partial<PublicCorridor>;
      if (typeof c.slug === "string" && isSafeSlug(c.slug)) {
        if (!corridorMap.has(c.slug)) {
          corridorMap.set(c.slug, {
            slug: c.slug,
            label: formatCorridorLabel(c),
            detailHref: corridorDetailHref(c.slug),
            anchorCount: typeof c.anchorCount === "number" ? c.anchorCount : 0,
          });
        }
      }
    }
  }

  // Sort anchors deterministically by name then slug
  const sortedAnchors = Array.from(anchorMap.values()).sort((a, b) => {
    const cmp = a.name.localeCompare(b.name);
    return cmp !== 0 ? cmp : a.slug.localeCompare(b.slug);
  });

  // Sort corridors deterministically by slug
  const sortedCorridors = Array.from(corridorMap.values()).sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );

  let hasUnknownCells = false;

  // Build matrix rows
  const rows: MatrixAnchorRow[] = sortedAnchors.map((anchor) => {
    const memberships: Record<string, MembershipCell> = {};

    for (const corridor of sortedCorridors) {
      const detail = corridorDetailsBySlug[corridor.slug];

      if (detail === undefined || detail === null) {
        // Detail was not fetched or failed
        memberships[corridor.slug] = {
          state: "unknown",
          label: "Unknown (data unavailable)",
        };
        hasUnknownCells = true;
      } else {
        const associatedAnchors = Array.isArray(detail.anchors) ? detail.anchors : [];
        const isAssociated = associatedAnchors.some(
          (cand) => cand && typeof cand.slug === "string" && cand.slug === anchor.slug,
        );

        if (isAssociated) {
          memberships[corridor.slug] = {
            state: "reviewed",
            label: "Reviewed association",
          };
        } else {
          memberships[corridor.slug] = {
            state: "not_reviewed",
            label: "Not reviewed",
          };
        }
      }
    }

    return {
      slug: anchor.slug,
      name: anchor.name,
      homeDomain: anchor.homeDomain,
      detailHref: anchorDetailHref(anchor.slug),
      memberships,
    };
  });

  return {
    anchors: rows,
    corridors: sortedCorridors,
    hasUnknownCells,
    stale,
  };
}

/**
 * Handles bounded pagination fetching for a collection endpoint.
 */
export async function fetchAllPaginated<T>(
  endpoint: string,
  key: string,
  { fetchFn = fetch, signal }: { fetchFn?: typeof fetch; signal?: AbortSignal } = {},
): Promise<{ items: T[]; stale: boolean }> {
  const limit = 50;
  let offset = 0;
  let hasMore = true;
  let isStale = false;
  const items: T[] = [];
  const maxPages = 20; // safe upper bound
  let pageCount = 0;

  while (hasMore && pageCount < maxPages) {
    pageCount++;
    const url = `${endpoint}?limit=${limit}&offset=${offset}`;
    const response = await fetchFn(url, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to load ${endpoint} (HTTP ${response.status})`);
    }

    if (
      response.headers.get("x-evidence-state") === "stale" ||
      response.headers.get("x-stale-evidence") === "true"
    ) {
      isStale = true;
    }

    const body = (await response.json()) as Record<string, unknown>;
    const pageItems = Array.isArray(body?.[key]) ? (body[key] as T[]) : [];
    items.push(...pageItems);

    const totalCount = typeof body?.count === "number" ? body.count : null;
    offset += pageItems.length;

    if (pageItems.length === 0 || (totalCount !== null && offset >= totalCount)) {
      hasMore = false;
    }
  }

  return { items, stale: isStale };
}
