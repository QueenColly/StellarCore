import type { PublicRateHistoryPoint } from "@/types/api/rateHistory";

/**
 * Pure, read-only signed differences between each returned observation's
 * capture instant and the instant of the history point (snapshot) that
 * contains it (#735).
 *
 *   offsetMs = observation.capturedAt − point.timestamp
 *
 * A positive offset means the observation capture is recorded after the point
 * snapshot; a negative offset means before. Negative values are never clamped.
 * An offset is only a difference between two recorded instants: it is not
 * transport latency, ingest delay, clock failure, uptime or pricing quality.
 *
 * Timestamps must be ISO-8601 with an explicit zone (`Z` or `±hh:mm`), so the
 * same instant written with different offsets compares equal and no local
 * time zone is ever assumed. Anything else is reported as unavailable.
 */

export type OffsetRelation = "capture_before_point" | "equal" | "capture_after_point";

export type OffsetUnavailableReason =
  | "invalid_point_timestamp"
  | "invalid_capture_timestamp"
  | "both_invalid";

export type CaptureOffsetEntry = Readonly<{
  /** Zero-based position of the point in the returned `points` array. */
  pointIndex: number;
  /** Zero-based position of the observation inside its point. */
  observationIndex: number;
  anchorSlug: string;
  anchorName: string;
  /** Raw strings exactly as returned (null when not a string). */
  pointTimestamp: string | null;
  capturedAt: string | null;
  /** UTC-normalized instants, or null when unavailable. */
  pointTimestampUtc: string | null;
  capturedAtUtc: string | null;
  offsetMs: number | null;
  relation: OffsetRelation | null;
  unavailable: OffsetUnavailableReason | null;
  pointMedianPublished: boolean;
}>;

export type CaptureOffsetSummary = Readonly<{
  points: number;
  observations: number;
  valid: number;
  missingOrInvalid: number;
  captureAfterPoint: number;
  captureBeforePoint: number;
  equal: number;
  /** Points that returned no observations at all. */
  emptyPoints: number;
  /** Points that returned fewer observations than their `sourceCount`. */
  incompletePoints: number;
  /** Points whose `medianRate` is null (their observations are still inspected). */
  nullMedianPoints: number;
  entries: readonly CaptureOffsetEntry[];
}>;

const ZONED_ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/** Parses a zoned ISO-8601 instant to epoch milliseconds, or null. */
export function parseZonedInstant(value: unknown): number | null {
  if (typeof value !== "string" || !ZONED_ISO_8601.test(value)) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function summarizeCaptureOffsets(
  points: readonly PublicRateHistoryPoint[] | null | undefined,
): CaptureOffsetSummary {
  const list: readonly unknown[] = Array.isArray(points) ? points : [];
  const entries: CaptureOffsetEntry[] = [];
  let emptyPoints = 0;
  let incompletePoints = 0;
  let nullMedianPoints = 0;

  list.forEach((rawPoint, pointIndex) => {
    const point = asRecord(rawPoint);
    const observations: readonly unknown[] = Array.isArray(point.observations)
      ? point.observations
      : [];
    if (point.medianRate === null || point.medianRate === undefined) nullMedianPoints += 1;
    if (observations.length === 0) emptyPoints += 1;
    if (
      typeof point.sourceCount === "number" &&
      Number.isInteger(point.sourceCount) &&
      observations.length < point.sourceCount
    ) {
      incompletePoints += 1;
    }

    const pointMs = parseZonedInstant(point.timestamp);
    observations.forEach((rawObservation, observationIndex) => {
      const observation = asRecord(rawObservation);
      const anchor = asRecord(observation.anchor);
      const captureMs = parseZonedInstant(observation.capturedAt);
      const offsetMs = pointMs !== null && captureMs !== null ? captureMs - pointMs : null;
      entries.push({
        pointIndex,
        observationIndex,
        anchorSlug: asText(anchor.slug, "unknown-anchor"),
        anchorName: asText(anchor.name, "Unknown anchor"),
        pointTimestamp: typeof point.timestamp === "string" ? point.timestamp : null,
        capturedAt: typeof observation.capturedAt === "string" ? observation.capturedAt : null,
        pointTimestampUtc: pointMs === null ? null : new Date(pointMs).toISOString(),
        capturedAtUtc: captureMs === null ? null : new Date(captureMs).toISOString(),
        offsetMs,
        relation:
          offsetMs === null
            ? null
            : offsetMs > 0
              ? "capture_after_point"
              : offsetMs < 0
                ? "capture_before_point"
                : "equal",
        unavailable:
          offsetMs !== null
            ? null
            : pointMs === null && captureMs === null
              ? "both_invalid"
              : pointMs === null
                ? "invalid_point_timestamp"
                : "invalid_capture_timestamp",
        pointMedianPublished: point.medianRate !== null && point.medianRate !== undefined,
      });
    });
  });

  const count = (relation: OffsetRelation) => entries.filter((e) => e.relation === relation).length;
  const valid = entries.filter((e) => e.offsetMs !== null).length;

  return {
    points: list.length,
    observations: entries.length,
    valid,
    missingOrInvalid: entries.length - valid,
    captureAfterPoint: count("capture_after_point"),
    captureBeforePoint: count("capture_before_point"),
    equal: count("equal"),
    emptyPoints,
    incompletePoints,
    nullMedianPoints,
    entries,
  };
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US");

/** Signed millisecond offset, e.g. "+1,500 ms", "−2,000 ms", "0 ms". Never clamped. */
export function formatOffsetMs(offsetMs: number | null): string {
  if (offsetMs === null) return "Unavailable";
  if (offsetMs === 0) return "0 ms";
  const sign = offsetMs > 0 ? "+" : "−";
  return `${sign}${NUMBER_FORMAT.format(Math.abs(offsetMs))} ms`;
}

export function describeRelation(relation: OffsetRelation | null): string {
  switch (relation) {
    case "capture_after_point":
      return "Capture after point";
    case "capture_before_point":
      return "Capture before point";
    case "equal":
      return "Same instant";
    default:
      return "Unavailable";
  }
}

export function describeUnavailable(reason: OffsetUnavailableReason): string {
  switch (reason) {
    case "invalid_point_timestamp":
      return "Point snapshot timestamp missing or invalid";
    case "invalid_capture_timestamp":
      return "Observation capture timestamp missing or invalid";
    case "both_invalid":
      return "Both timestamps missing or invalid";
  }
}
