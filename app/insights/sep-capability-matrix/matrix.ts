import type { PublicAnchorStatus } from "@/types/api/anchors";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;

export type CapabilityCellState = "advertised" | "not_advertised" | "unknown";
export type CapabilityCellLabel =
  | "Advertised at last sync"
  | "Not advertised"
  | "Unknown/unavailable";

export type CapabilityCell = Readonly<{
  state: CapabilityCellState;
  label: CapabilityCellLabel;
}>;

export type MatrixRow = Readonly<{
  slug: string;
  name: string;
  homeDomain: string;
  status: PublicAnchorStatus;
  detailHref: string;
  isTransferCapable: boolean;
  capabilities: Readonly<Record<number, CapabilityCell>>;
}>;

export type SepCapabilityMatrix = Readonly<{
  seps: readonly number[];
  rows: readonly MatrixRow[];
  stale: boolean;
}>;

export function isSafeAnchorSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

export function anchorDetailHref(slug: string): string {
  if (!isSafeAnchorSlug(slug)) return "/anchors";
  return `/anchors/${encodeURIComponent(slug)}`;
}

export function readApiErrorMessage(body: unknown): string | null {
  if (typeof body !== "object" || body === null) return null;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "object" && error !== null && typeof (error as { message?: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  if (typeof (body as { message?: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return null;
}

export function parseSepMatrix(
  body: unknown,
  staleHeader?: string | null,
): SepCapabilityMatrix | null {
  if (typeof body !== "object" || body === null || !("anchors" in body)) {
    return null;
  }

  const rawAnchors = (body as { anchors?: unknown }).anchors;
  if (!Array.isArray(rawAnchors)) {
    return null;
  }

  // Collect unique SEPs present in data
  const sepSet = new Set<number>();
  for (const item of rawAnchors) {
    if (typeof item === "object" && item !== null && Array.isArray((item as { seps?: unknown }).seps)) {
      for (const sep of (item as { seps: unknown[] }).seps) {
        if (typeof sep === "number" && Number.isInteger(sep) && sep > 0) {
          sepSet.add(sep);
        }
      }
    }
  }

  const sortedSeps = Array.from(sepSet).sort((a, b) => a - b);

  const rows: MatrixRow[] = [];
  for (const item of rawAnchors) {
    if (typeof item !== "object" || item === null) continue;
    const raw = item as Record<string, unknown>;
    const slug = typeof raw.slug === "string" ? raw.slug : "";
    const name = typeof raw.name === "string" ? raw.name : slug;
    const homeDomain = typeof raw.homeDomain === "string" ? raw.homeDomain : "";
    const status: PublicAnchorStatus =
      raw.status === "LIVE" || raw.status === "DEGRADED" || raw.status === "DOWN"
        ? raw.status
        : "UNKNOWN";
    const isTransferCapable = Boolean(raw.isTransferCapable);

    const anchorSeps = Array.isArray(raw.seps) ? raw.seps : null;

    const capabilities: Record<number, CapabilityCell> = {};
    for (const sep of sortedSeps) {
      if (anchorSeps === null || status === "UNKNOWN") {
        capabilities[sep] = {
          state: "unknown",
          label: "Unknown/unavailable",
        };
      } else if (anchorSeps.includes(sep)) {
        capabilities[sep] = {
          state: "advertised",
          label: "Advertised at last sync",
        };
      } else {
        capabilities[sep] = {
          state: "not_advertised",
          label: "Not advertised",
        };
      }
    }

    rows.push({
      slug,
      name,
      homeDomain,
      status,
      detailHref: anchorDetailHref(slug),
      isTransferCapable,
      capabilities,
    });
  }

  const isStale =
    staleHeader === "true" ||
    staleHeader === "stale" ||
    staleHeader === "degraded";

  return {
    seps: sortedSeps,
    rows,
    stale: isStale,
  };
}
