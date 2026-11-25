import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor } from "@/types/api/corridors";

/** Browser-only GET consumers. Never import server repositories into client components. */
export type DirectoryResult<T> =
  | Readonly<{ ok: true; items: readonly T[] }>
  | Readonly<{ ok: false; message: string }>;

export type DirectoryFetch = (input: string, init: RequestInit) => Promise<Response>;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validSlug(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
    && value.length <= 100 && SLUG_PATTERN.test(value);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function anchor(value: unknown): value is PublicAnchorSummary {
  return record(value)
    && validSlug(value.slug)
    && typeof value.name === "string"
    && typeof value.homeDomain === "string"
    && (value.status === "LIVE" || value.status === "DEGRADED"
      || value.status === "DOWN" || value.status === "UNKNOWN")
    && Array.isArray(value.seps)
    && value.seps.every((sep: unknown) => Number.isSafeInteger(sep) && Number(sep) > 0)
    && typeof value.isTransferCapable === "boolean"
    && Number.isSafeInteger(value.corridorCount)
    && Number(value.corridorCount) >= 0;
}

function corridor(value: unknown): value is PublicCorridor {
  return record(value)
    && validSlug(value.slug)
    && typeof value.sourceAsset === "string"
    && typeof value.destinationAsset === "string"
    && typeof value.sourceCountry === "string"
    && typeof value.destinationCountry === "string"
    && Number.isSafeInteger(value.anchorCount)
    && Number(value.anchorCount) >= 0;
}

async function loadList<T>(
  url: string,
  property: "anchors" | "corridors",
  check: (value: unknown) => value is T,
  signal?: AbortSignal,
  fetchImpl: DirectoryFetch = fetch,
): Promise<DirectoryResult<T>> {
  const message = property === "anchors"
    ? "Unable to load reviewed anchors."
    : "Unable to load reviewed corridors.";
  try {
    const response = await fetchImpl(url, { cache: "no-store", signal });
    if (!response.ok) return { ok: false, message };
    const data: unknown = await response.json();
    if (!record(data)) return { ok: false, message };
    const entries: unknown = data[property];
    if (!Array.isArray(entries) || !entries.every((entry: unknown) => check(entry))) {
      return { ok: false, message };
    }
    return { ok: true, items: Object.freeze([...entries] as T[]) };
  } catch {
    return { ok: false, message };
  }
}

export function loadPublicAnchors(
  signal?: AbortSignal,
  fetchImpl?: DirectoryFetch,
): Promise<DirectoryResult<PublicAnchorSummary>> {
  return loadList("/api/anchors", "anchors", anchor, signal, fetchImpl);
}

export function loadPublicCorridors(
  signal?: AbortSignal,
  fetchImpl?: DirectoryFetch,
): Promise<DirectoryResult<PublicCorridor>> {
  return loadList("/api/corridors", "corridors", corridor, signal, fetchImpl);
}
