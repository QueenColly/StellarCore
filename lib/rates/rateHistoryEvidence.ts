import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

/**
 * Pure, read-only interpretations of a public rate-history response.
 *
 * Nothing here recomputes a median or rescales a rate: every value is derived
 * from fields the API already returned, and malformed fields are surfaced as
 * such instead of being repaired or guessed.
 */

const NUMERIC_STRING_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * True when `medianRate` is a complete, finite, positive numeric string.
 * Rejects malformed strings (e.g., "1.25oops"), non-positive values, NaN, Infinity.
 * Accepts valid scientific notation (e.g., "1.25e-5", "5E2").
 */
export function isPublishedMedian(medianRate: unknown): medianRate is string {
  return (
    typeof medianRate === "string" &&
    NUMERIC_STRING_PATTERN.test(medianRate) &&
    (() => {
      const num = Number(medianRate);
      return Number.isFinite(num) && num > 0;
    })()
  );
}

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

// ---------------------------------------------------------------------------
// Chart presentation (#697)
// ---------------------------------------------------------------------------

export type PlottableHistoryPoint = Readonly<{
  point: PublicRateHistoryPoint;
  originalIndex: number;
  rate: number;
  time: number;
}>;

export type HistoryChartPresentation =
  /** (a) the API returned no snapshots for the window. */
  | "no_snapshots"
  /** (b) snapshots exist but none carries a plottable published median. */
  | "no_published_median"
  /** (c) at least one published median is plotted. */
  | "plotted";

export type HistoryPointClassification = Readonly<{
  presentation: HistoryChartPresentation;
  snapshotCount: number;
  plottable: readonly PlottableHistoryPoint[];
  /** Snapshots whose medianRate is null (no published median). */
  unpublishedCount: number;
  /** Snapshots whose medianRate or timestamp is present but unusable. */
  invalidCount: number;
  /** Original indices of every snapshot that is not plotted. */
  unplottedIndices: readonly number[];
}>;

export function classifyHistoryPoints(
  points: readonly PublicRateHistoryPoint[],
): HistoryPointClassification {
  const plottable: PlottableHistoryPoint[] = [];
  const unplottedIndices: number[] = [];
  let unpublishedCount = 0;
  let invalidCount = 0;

  points.forEach((point, index) => {
    const time = new Date(point.timestamp).getTime();
    if (point.medianRate === null) {
      unpublishedCount += 1;
      unplottedIndices.push(index);
      return;
    }
    if (!isPublishedMedian(point.medianRate) || !Number.isFinite(time)) {
      invalidCount += 1;
      unplottedIndices.push(index);
      return;
    }
    plottable.push({
      point,
      originalIndex: index,
      rate: Number.parseFloat(point.medianRate),
      time,
    });
  });

  const presentation: HistoryChartPresentation =
    points.length === 0
      ? "no_snapshots"
      : plottable.length === 0
        ? "no_published_median"
        : "plotted";

  return {
    presentation,
    snapshotCount: points.length,
    plottable,
    unpublishedCount,
    invalidCount,
    unplottedIndices,
  };
}

// ---------------------------------------------------------------------------
// Stale fallback disclosure (#699)
// ---------------------------------------------------------------------------

export type StaleFallbackDisclosure =
  | Readonly<{ kind: "fresh" }>
  | Readonly<{
      kind: "stale";
      /** When the last-known-good payload was originally generated. */
      generatedAt: string;
      /** When the fallback copy stops being eligible for reuse. */
      expiresAt: string | null;
      /** Latest upstream capture time recorded in the payload, if any. */
      latestSourceCapturedAt: string | null;
      /** Age of the payload when the server served it (not the viewer's clock). */
      snapshotAgeMs: number | null;
    }>
  /** `degraded` is present but its metadata is missing or malformed. */
  | Readonly<{ kind: "stale_unverified" }>;

export function describeStaleFallback(
  history: Pick<PublicRateHistoryResponse, "degraded">,
): StaleFallbackDisclosure {
  const degraded: unknown = history.degraded;
  if (degraded === undefined || degraded === null) return { kind: "fresh" };
  if (typeof degraded !== "object") return { kind: "stale_unverified" };

  const record = degraded as Record<string, unknown>;
  if (record.state !== "stale" || !isValidTimestamp(record.generatedAt)) {
    return { kind: "stale_unverified" };
  }

  const sourceTimes = Array.isArray(record.sourceTimes)
    ? record.sourceTimes.filter(isValidTimestamp)
    : [];
  const latestSourceCapturedAt =
    sourceTimes.length > 0
      ? sourceTimes.reduce((latest, value) =>
          new Date(value).getTime() > new Date(latest).getTime() ? value : latest,
        )
      : null;

  const age = record.snapshotAgeMs;

  return {
    kind: "stale",
    generatedAt: record.generatedAt,
    expiresAt: isValidTimestamp(record.expiresAt) ? record.expiresAt : null,
    latestSourceCapturedAt,
    snapshotAgeMs:
      typeof age === "number" && Number.isFinite(age) && age >= 0 ? age : null,
  };
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Human-readable duration, e.g. "3 hours". */
export function describeDuration(ms: number): string {
  if (ms < MINUTE_MS) return "less than a minute";
  const [value, unit] =
    ms < HOUR_MS
      ? [Math.floor(ms / MINUTE_MS), "minute"]
      : ms < DAY_MS
        ? [Math.floor(ms / HOUR_MS), "hour"]
        : [Math.floor(ms / DAY_MS), "day"];
  return `${value} ${unit}${value === 1 ? "" : "s"}`;
}

// ---------------------------------------------------------------------------
// Published versus unpublished median summary (#700)
// ---------------------------------------------------------------------------

/** History windows supported by the median evidence summary view. */
export const MEDIAN_SUMMARY_WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export type MedianEvidenceCategory ="published" | "unpublished" | "inconsistent";

export type MedianEvidenceInconsistency =
  | "healthy_without_median"
  | "insufficient_with_median"
  | "unparseable_median"
  | "unknown_state";

export type ClassifiedMedianSnapshot = Readonly<{
  index: number;
  timestamp: string;
  category: MedianEvidenceCategory;
  inconsistency: MedianEvidenceInconsistency | null;
  medianRate: string | null;
  state: string;
  sourceCount: number;
  freshSourceCount: number;
}>;

export type MedianEvidenceShare = Readonly<{
  count: number;
  denominator: number;
  /** Percentage of returned snapshots, or null when the denominator is zero. */
  percent: number | null;
}>;

export type MedianEvidenceSummary = Readonly<{
  total: number;
  published: MedianEvidenceShare;
  unpublished: MedianEvidenceShare;
  inconsistent: MedianEvidenceShare;
  snapshots: readonly ClassifiedMedianSnapshot[];
}>;

/**
 * Classifies one snapshot from its own `state` and `medianRate` fields.
 *
 * Published: state `healthy` with a parseable median.
 * Unpublished: state `insufficient_fresh_sources` with a null median.
 * Anything else contradicts itself and is reported as inconsistent evidence;
 * no median is guessed for it.
 */
export function classifyMedianSnapshot(
  point: PublicRateHistoryPoint,
  index: number,
): ClassifiedMedianSnapshot {
  const state: unknown = point.state;
  const median: unknown = point.medianRate;
  let category: MedianEvidenceCategory;
  let inconsistency: MedianEvidenceInconsistency | null = null;

  if (state !== "healthy" && state !== "insufficient_fresh_sources") {
    category = "inconsistent";
    inconsistency = "unknown_state";
  } else if (median !== null && !isPublishedMedian(median)) {
    category = "inconsistent";
    inconsistency = "unparseable_median";
  } else if (state === "healthy") {
    if (median === null) {
      category = "inconsistent";
      inconsistency = "healthy_without_median";
    } else {
      category = "published";
    }
  } else if (median !== null) {
    category = "inconsistent";
    inconsistency = "insufficient_with_median";
  } else {
    category = "unpublished";
  }

  return {
    index,
    timestamp: String(point.timestamp),
    category,
    inconsistency,
    medianRate: category === "published" ? (median as string) : null,
    state: typeof state === "string" ? state : "unknown",
    sourceCount: point.sourceCount,
    freshSourceCount: point.freshSourceCount,
  };
}

function share(count: number, denominator: number): MedianEvidenceShare {
  return {
    count,
    denominator,
    percent: denominator === 0 ? null : (count / denominator) * 100,
  };
}

export function summarizeMedianEvidence(
  points: readonly PublicRateHistoryPoint[],
): MedianEvidenceSummary {
  const snapshots = points.map(classifyMedianSnapshot);
  const total = snapshots.length;
  const count = (category: MedianEvidenceCategory) =>
    snapshots.filter((snapshot) => snapshot.category === category).length;

  return {
    total,
    published: share(count("published"), total),
    unpublished: share(count("unpublished"), total),
    inconsistent: share(count("inconsistent"), total),
    snapshots,
  };
}

/** "66.7%" style label, or "—" when there is no denominator. */
export function formatEvidencePercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(1))}%`;
}

export function describeInconsistency(reason: MedianEvidenceInconsistency): string {
  switch (reason) {
    case "healthy_without_median":
      return "State is healthy but no median was published";
    case "insufficient_with_median":
      return "State reports insufficient fresh sources but a median value is present";
    case "unparseable_median":
      return "Median value is not a valid decimal";
    case "unknown_state":
      return "Snapshot state is not a recognised value";
  }
}
