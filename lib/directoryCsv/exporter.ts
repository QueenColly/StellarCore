import type { PublicAnchorSummary } from "@/types/api/anchors";
import type { PublicCorridor } from "@/types/api/corridors";
import { serializeCsv } from "./csvEscaping";
import {
  ANCHOR_CSV_HEADERS,
  CORRIDOR_CSV_HEADERS,
  formatAnchorRow,
  formatCorridorRow,
  generateDirectoryCsvFilename,
} from "./formatters";
import { fetchAllAnchors, fetchAllCorridors, type DirectoryFetch } from "./fetchers";
import type {
  DirectoryExportOptions,
  DirectoryExportResult,
  DirectoryType,
} from "./types";

/**
 * Builds a deterministic CSV string for a list of anchor summaries.
 */
export function buildAnchorsCsv(anchors: readonly PublicAnchorSummary[]): string {
  const rows = anchors.map(formatAnchorRow);
  return serializeCsv(ANCHOR_CSV_HEADERS, rows);
}

/**
 * Builds a deterministic CSV string for a list of corridor summaries.
 */
export function buildCorridorsCsv(corridors: readonly PublicCorridor[]): string {
  const rows = corridors.map(formatCorridorRow);
  return serializeCsv(CORRIDOR_CSV_HEADERS, rows);
}

/**
 * End-to-end export helper: fetches directory entries using existing public GET list APIs,
 * applies pagination safely up to the safety limit, formats headers/values, and neutralizes formula injection.
 */
export async function exportDirectoryAsCsv(
  type: DirectoryType,
  options: DirectoryExportOptions = {},
  fetchImpl?: DirectoryFetch,
): Promise<DirectoryExportResult<PublicAnchorSummary | PublicCorridor>> {
  const filename = generateDirectoryCsvFilename(type);

  if (type === "anchors") {
    const fetchResult = await fetchAllAnchors(options, fetchImpl);
    if (!fetchResult.ok) {
      return { ok: false, type: "anchors", error: fetchResult.error };
    }
    const csv = buildAnchorsCsv(fetchResult.items);
    return {
      ok: true,
      type: "anchors",
      items: fetchResult.items,
      totalRetrieved: fetchResult.totalCount,
      isPartial: fetchResult.isPartial,
      safetyLimit: fetchResult.safetyLimit,
      csv,
      filename,
    };
  }

  const fetchResult = await fetchAllCorridors(options, fetchImpl);
  if (!fetchResult.ok) {
    return { ok: false, type: "corridors", error: fetchResult.error };
  }
  const csv = buildCorridorsCsv(fetchResult.items);
  return {
    ok: true,
    type: "corridors",
    items: fetchResult.items,
    totalRetrieved: fetchResult.totalCount,
    isPartial: fetchResult.isPartial,
    safetyLimit: fetchResult.safetyLimit,
    csv,
    filename,
  };
}
