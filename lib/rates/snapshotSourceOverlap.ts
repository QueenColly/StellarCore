import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

export type SnapshotAnchorObservation = Readonly<{
  slug: string;
  name: string;
}>;

export type SnapshotOverlapSummary = Readonly<{
  timestamp: string;
  distinctObservedAnchorCount: number;
  anchors: ReadonlyArray<SnapshotAnchorObservation>;
  medianRate: string | null;
  state: PublicRateHistoryPoint["state"] | null;
}>;

export type SnapshotSourceFilter = "all" | "single" | "multiple";

export function dedupeAnchorsBySlug(
  observations: ReadonlyArray<PublicRateHistoryObservation> | null | undefined,
): ReadonlyArray<SnapshotAnchorObservation> {
  const seen = new Set<string>();
  const anchors: SnapshotAnchorObservation[] = [];
  for (const observation of observations ?? []) {
    if (!observation || typeof observation !== "object") continue;
    const anchor = observation.anchor;
    if (!anchor || typeof anchor !== "object") continue;
    const slug = typeof anchor.slug === "string" ? anchor.slug : "";
    if (seen.has(slug)) continue;
    seen.add(slug);
    anchors.push(
      Object.freeze({
        slug,
        name:
          typeof anchor.name === "string" && anchor.name.trim() !== ""
            ? anchor.name
            : slug,
      }),
    );
  }
  return Object.freeze(anchors);
}

export function summarizeSnapshot(
  point: PublicRateHistoryPoint | null | undefined,
): SnapshotOverlapSummary | null {
  if (!point || typeof point !== "object") return null;
  const anchors = dedupeAnchorsBySlug(point.observations);
  return Object.freeze({
    timestamp: typeof point.timestamp === "string" ? point.timestamp : "",
    distinctObservedAnchorCount: anchors.length,
    anchors,
    medianRate: typeof point.medianRate === "string" ? point.medianRate : null,
    state: point.state ?? null,
  });
}

export function summarizeSnapshots(
  response: PublicRateHistoryResponse | null | undefined,
): ReadonlyArray<SnapshotOverlapSummary> {
  const summaries: SnapshotOverlapSummary[] = [];
  for (const point of response?.points ?? []) {
    const summary = summarizeSnapshot(point);
    if (summary) summaries.push(summary);
  }
  return Object.freeze(summaries);
}

export function isMultipleSourceSummary(
  summary: SnapshotOverlapSummary,
): boolean {
  return summary.distinctObservedAnchorCount > 1;
}

export function filterSnapshotsBySource(
  summaries: readonly SnapshotOverlapSummary[],
  sourceFilter: SnapshotSourceFilter,
): ReadonlyArray<SnapshotOverlapSummary> {
  if (sourceFilter === "single") {
    return Object.freeze(
      summaries.filter((summary) => summary.distinctObservedAnchorCount === 1),
    );
  }
  if (sourceFilter === "multiple") {
    return Object.freeze(
      summaries.filter((summary) => isMultipleSourceSummary(summary)),
    );
  }
  return Object.freeze([...summaries]);
}

export function formatSnapshotTimestampUtc(timestamp: string): string {
  if (typeof timestamp !== "string" || timestamp.trim() === "") return "—";
  const parsed = new Date(timestamp);
  const milliseconds = parsed.getTime();
  if (!Number.isFinite(milliseconds)) return timestamp;
  return parsed.toISOString();
}
