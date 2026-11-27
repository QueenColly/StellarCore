import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

/**
 * Read-only UTC calendar-day inventory of the snapshot records actually
 * returned by the public corridor rate-history API.
 *
 * Only fields already present in the response are used. A returned point is a
 * persisted snapshot record; the public API exposes no stable snapshot
 * identity, so two records with the same timestamp stay two separate records.
 * Nothing here derives a rate, median, uptime, operating hours or missing
 * source claim, and a day with no returned snapshot is never described as
 * downtime.
 */

/** History windows supported by the daily snapshot inventory view. */
export const DAILY_SNAPSHOT_INVENTORY_WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const MILLISECONDS_PER_DAY = 86_400_000;

export type DailySnapshotInventoryDay = Readonly<{
  /** UTC calendar date, `YYYY-MM-DD`. */
  day: string;
  /** Inclusive start of that UTC day, as an ISO instant. */
  startUtc: string;
  /** Exclusive end of that UTC day, as an ISO instant. */
  endUtcExclusive: string;
  /** Every returned point whose timestamp falls in this UTC day. */
  snapshotRecordCount: number;
  /** Observations recorded by those returned points. */
  observationRecordCount: number;
  /** Records beyond the first one for a repeated exact timestamp that day. */
  duplicateTimestampRecordCount: number;
}>;

export type DailySnapshotInventoryWindow = Readonly<{
  /** `evaluatedAt - windowDays`, exactly as read by the history API. */
  requestedStartUtc: string;
  requestedEndUtc: string;
  firstDay: string;
  lastDay: string;
  /** UTC calendar dates intersecting the requested interval. */
  coveredDayCount: number;
}>;

export type DailySnapshotInventorySummary = Readonly<{
  window: DailySnapshotInventoryWindow | null;
  /** Covered UTC days, most recent first. */
  days: readonly DailySnapshotInventoryDay[];
  /** False only when the response's `points` field is not an array. */
  pointsReadable: boolean;
  totalSnapshotRecords: number;
  assignedSnapshotRecords: number;
  unassignedSnapshotRecords: number;
  outsideWindowSnapshotRecords: number;
  totalObservationRecords: number;
  assignedObservationRecords: number;
  unassignedObservationRecords: number;
  outsideWindowObservationRecords: number;
  snapshotsWithoutPublishedMedian: number;
  /** Returned snapshot records whose `observations` was missing or not an array. */
  unreadableObservationArrayCount: number;
  duplicateTimestampRecordCount: number;
  daysWithReturnedSnapshots: number;
  daysWithoutReturnedSnapshots: number;
}>;

type DayBuilder = {
  day: string;
  startMs: number;
  snapshotRecordCount: number;
  observationRecordCount: number;
  duplicateTimestampRecordCount: number;
  seenTimestamps: Set<number>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parses a timestamp without rewriting it; a non-finite instant is absent. */
export function parseSnapshotInstant(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const milliseconds = new Date(value).getTime();
  return Number.isFinite(milliseconds) ? milliseconds : null;
}

/** The UTC calendar date (`YYYY-MM-DD`) containing an instant. */
export function utcDayKey(milliseconds: number): string {
  return new Date(milliseconds).toISOString().slice(0, 10);
}

function startOfUtcDay(milliseconds: number): number {
  return Date.UTC(
    new Date(milliseconds).getUTCFullYear(),
    new Date(milliseconds).getUTCMonth(),
    new Date(milliseconds).getUTCDate(),
  );
}

function buildWindow(
  evaluatedAt: string,
  windowDays: number,
): (DailySnapshotInventoryWindow & {
  startMs: number;
  endMs: number;
  builders: DayBuilder[];
}) | null {
  const endMs = parseSnapshotInstant(evaluatedAt);
  if (endMs === null) return null;
  if (!Number.isInteger(windowDays) || windowDays < 1) return null;

  const startMs = endMs - windowDays * MILLISECONDS_PER_DAY;
  const firstDayMs = startOfUtcDay(startMs);
  const lastDayMs = startOfUtcDay(endMs);
  const builders: DayBuilder[] = [];

  for (let cursor = firstDayMs; cursor <= lastDayMs; cursor += MILLISECONDS_PER_DAY) {
    builders.push({
      day: utcDayKey(cursor),
      startMs: cursor,
      snapshotRecordCount: 0,
      observationRecordCount: 0,
      duplicateTimestampRecordCount: 0,
      seenTimestamps: new Set<number>(),
    });
  }

  return {
    requestedStartUtc: new Date(startMs).toISOString(),
    requestedEndUtc: new Date(endMs).toISOString(),
    firstDay: utcDayKey(firstDayMs),
    lastDay: utcDayKey(lastDayMs),
    coveredDayCount: builders.length,
    startMs,
    endMs,
    builders,
  };
}

function emptySummary(pointsReadable: boolean): DailySnapshotInventorySummary {
  return {
    window: null,
    days: [],
    pointsReadable,
    totalSnapshotRecords: 0,
    assignedSnapshotRecords: 0,
    unassignedSnapshotRecords: 0,
    outsideWindowSnapshotRecords: 0,
    totalObservationRecords: 0,
    assignedObservationRecords: 0,
    unassignedObservationRecords: 0,
    outsideWindowObservationRecords: 0,
    snapshotsWithoutPublishedMedian: 0,
    unreadableObservationArrayCount: 0,
    duplicateTimestampRecordCount: 0,
    daysWithReturnedSnapshots: 0,
    daysWithoutReturnedSnapshots: 0,
  };
}

/**
 * Groups each returned snapshot record by its UTC calendar day.
 *
 * Every point record counts once, even when several records share the exact
 * same timestamp. A point whose timestamp cannot be interpreted is counted as
 * unassigned and never placed on a calendar day. A point with a valid
 * timestamp outside the requested UTC days is counted as outside the window.
 */
export function summarizeDailySnapshotInventory(
  history: Pick<PublicRateHistoryResponse, "points" | "evaluatedAt" | "windowDays">,
): DailySnapshotInventorySummary {
  const rawPoints: unknown = history.points;
  const pointsReadable = Array.isArray(rawPoints);
  const points: readonly unknown[] = pointsReadable ? (rawPoints as readonly unknown[]) : [];
  const resolved = buildWindow(history.evaluatedAt, history.windowDays);

  if (resolved === null) {
    const summary = emptySummary(pointsReadable);
    return {
      ...summary,
      totalSnapshotRecords: points.length,
      totalObservationRecords: countAllObservations(points),
    };
  }

  const daysByKey = new Map(resolved.builders.map((builder) => [builder.day, builder]));
  let totalSnapshotRecords = 0;
  let assignedSnapshotRecords = 0;
  let unassignedSnapshotRecords = 0;
  let outsideWindowSnapshotRecords = 0;
  let totalObservationRecords = 0;
  let assignedObservationRecords = 0;
  let unassignedObservationRecords = 0;
  let outsideWindowObservationRecords = 0;
  let snapshotsWithoutPublishedMedian = 0;
  let unreadableObservationArrayCount = 0;

  for (const rawPoint of points) {
    totalSnapshotRecords += 1;

    if (!isRecord(rawPoint)) {
      unassignedSnapshotRecords += 1;
      continue;
    }

    const observations = rawPoint.observations;
    const observationCount = Array.isArray(observations) ? observations.length : 0;
    if (!Array.isArray(observations)) unreadableObservationArrayCount += 1;
    totalObservationRecords += observationCount;

    if (rawPoint.medianRate === null) snapshotsWithoutPublishedMedian += 1;

    const instant = parseSnapshotInstant(rawPoint.timestamp);
    if (instant === null) {
      unassignedSnapshotRecords += 1;
      unassignedObservationRecords += observationCount;
      continue;
    }

    const builder = daysByKey.get(utcDayKey(instant));
    if (!builder || instant < resolved.startMs || instant > resolved.endMs) {
      outsideWindowSnapshotRecords += 1;
      outsideWindowObservationRecords += observationCount;
      continue;
    }

    assignedSnapshotRecords += 1;
    assignedObservationRecords += observationCount;
    builder.snapshotRecordCount += 1;
    builder.observationRecordCount += observationCount;

    if (builder.seenTimestamps.has(instant)) {
      builder.duplicateTimestampRecordCount += 1;
    } else {
      builder.seenTimestamps.add(instant);
    }
  }

  const days = resolved.builders
    .map(
      (builder): DailySnapshotInventoryDay => ({
        day: builder.day,
        startUtc: new Date(builder.startMs).toISOString(),
        endUtcExclusive: new Date(builder.startMs + MILLISECONDS_PER_DAY).toISOString(),
        snapshotRecordCount: builder.snapshotRecordCount,
        observationRecordCount: builder.observationRecordCount,
        duplicateTimestampRecordCount: builder.duplicateTimestampRecordCount,
      }),
    )
    .reverse();

  return {
    window: {
      requestedStartUtc: resolved.requestedStartUtc,
      requestedEndUtc: resolved.requestedEndUtc,
      firstDay: resolved.firstDay,
      lastDay: resolved.lastDay,
      coveredDayCount: resolved.coveredDayCount,
    },
    days: Object.freeze(days),
    pointsReadable,
    totalSnapshotRecords,
    assignedSnapshotRecords,
    unassignedSnapshotRecords,
    outsideWindowSnapshotRecords,
    totalObservationRecords,
    assignedObservationRecords,
    unassignedObservationRecords,
    outsideWindowObservationRecords,
    snapshotsWithoutPublishedMedian,
    unreadableObservationArrayCount,
    duplicateTimestampRecordCount: days.reduce(
      (total, day) => total + day.duplicateTimestampRecordCount,
      0,
    ),
    daysWithReturnedSnapshots: days.filter((day) => day.snapshotRecordCount > 0).length,
    daysWithoutReturnedSnapshots: days.filter((day) => day.snapshotRecordCount === 0).length,
  };
}

function countAllObservations(points: readonly unknown[]): number {
  let total = 0;
  for (const point of points) {
    if (isRecord(point) && Array.isArray(point.observations)) {
      total += point.observations.length;
    }
  }
  return total;
}
