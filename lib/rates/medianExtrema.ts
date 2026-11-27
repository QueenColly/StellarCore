import type { PublicRateHistoryPoint } from "@/types/api/rateHistory";

/**
 * Pure, read-only extrema among the published medians a public rate-history
 * response returned (#736).
 *
 * Only snapshots with a complete, finite, positive plain-decimal median and a
 * valid timestamp take part. Values are compared exactly as decimal strings
 * (never through floating point), and the original rate string is preserved
 * for display. Nothing is interpolated, reconstructed from underlying anchor
 * quotes, or rescaled: these are the extrema among returned published
 * medians, not market best prices or a continuous high/low.
 */

export type MedianExclusionReason =
  /** `medianRate` is null: the snapshot did not publish a median. */
  | "unpublished"
  /** `medianRate` is present but not a finite positive plain decimal. */
  | "invalid_median"
  /** The snapshot timestamp is missing or unparseable. */
  | "invalid_timestamp"
  /** A median is present but the snapshot state says it was not publishable. */
  | "inconsistent_state";

export type PublishedMedianSnapshot = Readonly<{
  /** Zero-based position of the snapshot in the returned `points` array. */
  index: number;
  timestamp: string;
  timeMs: number;
  /** The median exactly as the API returned it. */
  medianRate: string;
  sourceCount: number;
  freshSourceCount: number;
}>;

export type MedianExtremumKind = "earliest" | "latest" | "lowest" | "highest";

export type MedianExtremum = Readonly<{
  kind: MedianExtremumKind;
  snapshot: PublishedMedianSnapshot;
}>;

export type MedianExtremaSummary = Readonly<{
  /** Snapshots returned by the API. */
  returned: number;
  /** Snapshots that contributed a published median. */
  included: number;
  excluded: Readonly<Record<MedianExclusionReason, number>>;
  excludedTotal: number;
  /** Null when no snapshot contributed a published median. */
  extrema: Readonly<Record<MedianExtremumKind, MedianExtremum>> | null;
}>;

export const MEDIAN_EXTREMUM_ORDER = [
  "earliest",
  "latest",
  "lowest",
  "highest",
] as const satisfies readonly MedianExtremumKind[];

export const MEDIAN_EXCLUSION_ORDER = [
  "unpublished",
  "invalid_median",
  "invalid_timestamp",
  "inconsistent_state",
] as const satisfies readonly MedianExclusionReason[];

const PLAIN_DECIMAL = /^(\d+)(?:\.(\d+))?$/;

type ParsedDecimal = Readonly<{ integer: string; fraction: string }>;

/**
 * Parses an unsigned plain decimal string ("12", "0.0001", "5.2500000").
 * Returns null for signs, exponents, whitespace, empty strings, non-strings
 * and zero. Leading integer zeros and trailing fraction zeros are normalized
 * only for comparison; the caller keeps the original string.
 */
export function parsePositiveDecimal(value: unknown): ParsedDecimal | null {
  if (typeof value !== "string") return null;
  const match = PLAIN_DECIMAL.exec(value);
  if (!match) return null;
  const integer = match[1].replace(/^0+/, "");
  const fraction = (match[2] ?? "").replace(/0+$/, "");
  if (integer === "" && fraction === "") return null;
  return { integer, fraction };
}

/** Exact comparison of two parsed positive decimals: -1, 0 or 1. */
export function comparePositiveDecimals(a: ParsedDecimal, b: ParsedDecimal): number {
  if (a.integer.length !== b.integer.length) {
    return a.integer.length < b.integer.length ? -1 : 1;
  }
  if (a.integer !== b.integer) return a.integer < b.integer ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const fa = a.fraction.padEnd(width, "0");
  const fb = b.fraction.padEnd(width, "0");
  if (fa === fb) return 0;
  return fa < fb ? -1 : 1;
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

type Candidate = Readonly<{ snapshot: PublishedMedianSnapshot; parsed: ParsedDecimal }>;

/** Earlier timestamp first, then earlier position in the returned array. */
function chronological(a: Candidate, b: Candidate): number {
  if (a.snapshot.timeMs !== b.snapshot.timeMs) return a.snapshot.timeMs - b.snapshot.timeMs;
  return a.snapshot.index - b.snapshot.index;
}

function pick(
  candidates: readonly Candidate[],
  better: (candidate: Candidate, current: Candidate) => boolean,
): Candidate {
  let chosen = candidates[0];
  for (const candidate of candidates.slice(1)) {
    if (better(candidate, chosen)) chosen = candidate;
  }
  return chosen;
}

export function summarizeMedianExtrema(
  points: readonly PublicRateHistoryPoint[] | null | undefined,
): MedianExtremaSummary {
  const list: readonly unknown[] = Array.isArray(points) ? points : [];
  const excluded: Record<MedianExclusionReason, number> = {
    unpublished: 0,
    invalid_median: 0,
    invalid_timestamp: 0,
    inconsistent_state: 0,
  };
  const candidates: Candidate[] = [];

  list.forEach((raw, index) => {
    const point = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (point.medianRate === null || point.medianRate === undefined) {
      excluded.unpublished += 1;
      return;
    }
    const parsed = parsePositiveDecimal(point.medianRate);
    if (!parsed) {
      excluded.invalid_median += 1;
      return;
    }
    const timeMs = parseTimestamp(point.timestamp);
    if (timeMs === null) {
      excluded.invalid_timestamp += 1;
      return;
    }
    if (point.state !== "healthy") {
      excluded.inconsistent_state += 1;
      return;
    }
    candidates.push({
      parsed,
      snapshot: {
        index,
        timestamp: point.timestamp as string,
        timeMs,
        medianRate: point.medianRate as string,
        sourceCount: readCount(point.sourceCount),
        freshSourceCount: readCount(point.freshSourceCount),
      },
    });
  });

  const excludedTotal = MEDIAN_EXCLUSION_ORDER.reduce((sum, reason) => sum + excluded[reason], 0);

  if (candidates.length === 0) {
    return { returned: list.length, included: 0, excluded, excludedTotal, extrema: null };
  }

  // Earliest: smallest timestamp; ties go to the earlier returned position.
  const earliest = pick(candidates, (c, cur) => chronological(c, cur) < 0);
  // Latest: largest timestamp; ties go to the earlier returned position.
  const latest = pick(
    candidates,
    (c, cur) => c.snapshot.timeMs > cur.snapshot.timeMs,
  );
  // Value ties resolve to the chronologically earliest snapshot, then position.
  const lowest = pick(candidates, (c, cur) => {
    const order = comparePositiveDecimals(c.parsed, cur.parsed);
    return order < 0 || (order === 0 && chronological(c, cur) < 0);
  });
  const highest = pick(candidates, (c, cur) => {
    const order = comparePositiveDecimals(c.parsed, cur.parsed);
    return order > 0 || (order === 0 && chronological(c, cur) < 0);
  });

  return {
    returned: list.length,
    included: candidates.length,
    excluded,
    excludedTotal,
    extrema: {
      earliest: { kind: "earliest", snapshot: earliest.snapshot },
      latest: { kind: "latest", snapshot: latest.snapshot },
      lowest: { kind: "lowest", snapshot: lowest.snapshot },
      highest: { kind: "highest", snapshot: highest.snapshot },
    },
  };
}

export function describeExtremum(kind: MedianExtremumKind): string {
  switch (kind) {
    case "earliest":
      return "Earliest published median";
    case "latest":
      return "Latest published median";
    case "lowest":
      return "Lowest published median";
    case "highest":
      return "Highest published median";
  }
}

export function describeExclusion(reason: MedianExclusionReason): string {
  switch (reason) {
    case "unpublished":
      return "No published median (null)";
    case "invalid_median":
      return "Malformed, zero or negative median";
    case "invalid_timestamp":
      return "Missing or invalid timestamp";
    case "inconsistent_state":
      return "Median present but snapshot state is not healthy";
  }
}
