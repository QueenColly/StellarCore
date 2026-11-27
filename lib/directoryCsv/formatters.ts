import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor } from "@/types/api/corridors";
import type { DirectoryType } from "./types";

/**
 * Official CSV headers for reviewed anchor summaries.
 * Note: Status is explicitly named "Last Persisted Sync Status" so it is not
 * confused with live operational uptime or service reliability.
 */
export const ANCHOR_CSV_HEADERS: readonly string[] = Object.freeze([
  "Slug",
  "Name",
  "Home Domain",
  "Last Persisted Sync Status",
  "Advertised SEPs",
  "Advertised Transfer Interface",
  "Corridor Count",
]);

/**
 * Official CSV headers for reviewed corridor summaries.
 */
export const CORRIDOR_CSV_HEADERS: readonly string[] = Object.freeze([
  "Slug",
  "Source Asset",
  "Source Country",
  "Destination Asset",
  "Destination Country",
  "Anchor Count",
]);

/**
 * Converts a public anchor summary into a row array aligned with ANCHOR_CSV_HEADERS.
 */
export function formatAnchorRow(anchor: PublicAnchorSummary): readonly unknown[] {
  const seps = Array.isArray(anchor.seps)
    ? anchor.seps.map((s) => `SEP-${s}`).join("; ")
    : "";
  return Object.freeze([
    anchor.slug ?? "",
    anchor.name ?? "",
    anchor.homeDomain ?? "",
    anchor.status ?? "UNKNOWN",
    seps,
    anchor.isTransferCapable,
    anchor.corridorCount,
  ]);
}

/**
 * Converts a public corridor summary into a row array aligned with CORRIDOR_CSV_HEADERS.
 */
export function formatCorridorRow(corridor: PublicCorridor): readonly unknown[] {
  return Object.freeze([
    corridor.slug ?? "",
    corridor.sourceAsset ?? "",
    corridor.sourceCountry ?? "",
    corridor.destinationAsset ?? "",
    corridor.destinationCountry ?? "",
    corridor.anchorCount,
  ]);
}

/**
 * Generates a stable, resource-identifying filename.
 * E.g. stellar-anchors-directory-2026-11-24.csv
 */
export function generateDirectoryCsvFilename(
  type: DirectoryType,
  date: Date = new Date(),
): string {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `stellar-${type}-directory-${yyyy}-${mm}-${dd}.csv`;
}
