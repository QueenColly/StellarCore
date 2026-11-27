import type { PublicRateHistoryPoint } from "@/types/api/rateHistory";

/**
 * Pure, read-only interpretation of recorded fee evidence in a public
 * rate-history response (#738).
 *
 * Every row traces to one returned `points[].observations[]` entry. Fee and
 * source-amount strings are preserved exactly as recorded: nothing is parsed
 * into a number, normalized, converted between currencies, ranked across
 * anchors, or differenced. Repeated fee strings are grouped only within the
 * same anchor slug and the exact same source-amount string. Missing or
 * malformed fields are reported as unavailable, never as zero.
 */

/** History windows supported by the historical fee records view. */
export const HISTORICAL_FEE_WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const DECIMAL_PATTERN = /^-?\d+(?:\.\d+)?$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/i;

export type RecordedDecimal =
  | Readonly<{ status: "recorded"; value: string }>
  | Readonly<{ status: "unavailable"; reason: "missing" | "malformed" }>;

export type RecordedTimestamp =
  | Readonly<{ status: "recorded"; value: string }>
  | Readonly<{ status: "unavailable" }>;

export function readRecordedDecimal(value: unknown): RecordedDecimal {
  if (value === undefined || value === null || value === "") {
    return { status: "unavailable", reason: "missing" };
  }
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value)) {
    return { status: "unavailable", reason: "malformed" };
  }
  return { status: "recorded", value };
}

export function readRecordedTimestamp(value: unknown): RecordedTimestamp {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime())
    ? { status: "recorded", value }
    : { status: "unavailable" };
}

function readAnchor(value: unknown): Readonly<{ slug: string | null; name: string | null }> {
  if (!value || typeof value !== "object") return { slug: null, name: null };
  const record = value as Record<string, unknown>;
  const slug = typeof record.slug === "string" && SLUG_PATTERN.test(record.slug) ? record.slug : null;
  const name = typeof record.name === "string" && record.name.trim() !== "" ? record.name : null;
  return { slug, name };
}

export type FeeObservationRow = Readonly<{
  /** Index of the snapshot in `points`. */
  pointIndex: number;
  /** Index of the observation in `points[pointIndex].observations`. */
  observationIndex: number;
  anchorSlug: string | null;
  anchorName: string | null;
  fee: RecordedDecimal;
  sourceAmount: RecordedDecimal;
  capturedAt: RecordedTimestamp;
}>;

export type FeeSnapshotRows = Readonly<{
  pointIndex: number;
  timestamp: RecordedTimestamp;
  /** Published median exactly as returned; null is preserved as "no published median". */
  medianRate: string | null;
  state: string;
  /** Observations returned for this snapshot before the anchor filter is applied. */
  returnedObservationCount: number;
  rows: readonly FeeObservationRow[];
}>;

function observationsOf(point: PublicRateHistoryPoint): readonly unknown[] {
  const observations: unknown = point.observations;
  return Array.isArray(observations) ? observations : [];
}

/**
 * Lists each returned snapshot with its observation rows, optionally limited
 * to one anchor slug. Snapshots are kept even when they hold no matching
 * observation so empty snapshots remain visible as evidence.
 */
export function buildFeeSnapshotRows(
  points: readonly PublicRateHistoryPoint[],
  anchorSlug: string | null = null,
): readonly FeeSnapshotRows[] {
  return points.map((point, pointIndex) => {
    const observations = observationsOf(point);
    const rows: FeeObservationRow[] = [];
    observations.forEach((raw, observationIndex) => {
      const record = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
      const anchor = readAnchor(record.anchor);
      if (anchorSlug !== null && anchor.slug !== anchorSlug) return;
      rows.push({
        pointIndex,
        observationIndex,
        anchorSlug: anchor.slug,
        anchorName: anchor.name,
        fee: readRecordedDecimal(record.fee),
        sourceAmount: readRecordedDecimal(record.sourceAmount),
        capturedAt: readRecordedTimestamp(record.capturedAt),
      });
    });
    const median: unknown = point.medianRate;
    const state: unknown = point.state;
    return {
      pointIndex,
      timestamp: readRecordedTimestamp(point.timestamp),
      medianRate: typeof median === "string" ? median : null,
      state: typeof state === "string" ? state : "unknown",
      returnedObservationCount: observations.length,
      rows,
    };
  });
}

export type FeeRecordGroup = Readonly<{
  anchorSlug: string;
  anchorName: string | null;
  /** Exact source-amount string as recorded. */
  sourceAmount: string;
  /** Exact fee string as recorded. */
  fee: string;
  /** Number of observations carrying this anchor / source amount / fee. */
  count: number;
  /** Number of distinct snapshots containing at least one such observation. */
  snapshotCount: number;
  firstRecordedAt: string;
  lastRecordedAt: string;
}>;

export type FeeRecordGrouping = Readonly<{
  groups: readonly FeeRecordGroup[];
  /** Observations considered (after the optional anchor filter). */
  observationCount: number;
  /**
   * Observations left out of grouping because their anchor, fee, source
   * amount, or capture time is missing or malformed. They still appear in
   * the per-snapshot table.
   */
  ungroupedCount: number;
}>;

/**
 * Groups repeated fee strings strictly within the same anchor slug and the
 * same exact source-amount string. No values are compared across groups.
 */
export function groupFeeRecords(
  points: readonly PublicRateHistoryPoint[],
  anchorSlug: string | null = null,
): FeeRecordGrouping {
  type Accumulator = {
    anchorSlug: string;
    anchorName: string | null;
    sourceAmount: string;
    fee: string;
    count: number;
    snapshots: Set<number>;
    first: { value: string; time: number };
    last: { value: string; time: number };
  };
  const groups = new Map<string, Accumulator>();
  let observationCount = 0;
  let ungroupedCount = 0;

  for (const snapshot of buildFeeSnapshotRows(points, anchorSlug)) {
    for (const row of snapshot.rows) {
      observationCount += 1;
      if (
        row.anchorSlug === null ||
        row.fee.status !== "recorded" ||
        row.sourceAmount.status !== "recorded" ||
        row.capturedAt.status !== "recorded"
      ) {
        ungroupedCount += 1;
        continue;
      }
      const key = JSON.stringify([row.anchorSlug, row.sourceAmount.value, row.fee.value]);
      const captured = { value: row.capturedAt.value, time: new Date(row.capturedAt.value).getTime() };
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, {
          anchorSlug: row.anchorSlug,
          anchorName: row.anchorName,
          sourceAmount: row.sourceAmount.value,
          fee: row.fee.value,
          count: 1,
          snapshots: new Set([row.pointIndex]),
          first: captured,
          last: captured,
        });
        continue;
      }
      existing.count += 1;
      existing.snapshots.add(row.pointIndex);
      existing.anchorName ??= row.anchorName;
      if (captured.time < existing.first.time) existing.first = captured;
      if (captured.time > existing.last.time) existing.last = captured;
    }
  }

  // Stable presentation order: by anchor slug, then source amount string, then
  // first-recorded time. This is deliberately not an ordering by fee value.
  const sorted = [...groups.values()].sort(
    (a, b) =>
      a.anchorSlug.localeCompare(b.anchorSlug) ||
      a.sourceAmount.localeCompare(b.sourceAmount) ||
      a.first.time - b.first.time,
  );

  return {
    groups: sorted.map((group) => ({
      anchorSlug: group.anchorSlug,
      anchorName: group.anchorName,
      sourceAmount: group.sourceAmount,
      fee: group.fee,
      count: group.count,
      snapshotCount: group.snapshots.size,
      firstRecordedAt: group.first.value,
      lastRecordedAt: group.last.value,
    })),
    observationCount,
    ungroupedCount,
  };
}

export type ObservedAnchor = Readonly<{ slug: string; name: string | null }>;

/** Distinct anchors that appear in the returned observations, sorted by slug. */
export function listObservedAnchors(points: readonly PublicRateHistoryPoint[]): readonly ObservedAnchor[] {
  const anchors = new Map<string, string | null>();
  for (const snapshot of buildFeeSnapshotRows(points)) {
    for (const row of snapshot.rows) {
      if (row.anchorSlug === null) continue;
      if (!anchors.has(row.anchorSlug) || anchors.get(row.anchorSlug) === null) {
        anchors.set(row.anchorSlug, row.anchorName);
      }
    }
  }
  return [...anchors.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Display text for a recorded decimal string; never substitutes zero. */
export function describeRecordedDecimal(value: RecordedDecimal): string {
  if (value.status === "recorded") return value.value;
  return value.reason === "missing" ? "Unavailable (not recorded)" : "Unavailable (malformed value)";
}
