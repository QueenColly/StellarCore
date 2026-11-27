/**
 * Route-local interpretation helpers for /insights/rate-history-coverage.
 *
 * Everything here reads the existing public GET responses (`/api/corridors`,
 * `/api/rates/history?corridor=&days=`) and provides an honest overview of
 * which periods have persisted observations and where gaps exist between them.
 *
 * Nothing is simulated, estimated, or invented:
 * - Live-rate uptime percentages are deliberately not extrapolated.
 * - Capture schedules are not assumed or implied.
 * - Missing observations are reported as absence of stored data, not endpoint failures.
 */

import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;

export const SUPPORTED_WINDOWS = [7, 30, 90] as const;
export type SupportedWindow = (typeof SUPPORTED_WINDOWS)[number];
export const DEFAULT_WINDOW: SupportedWindow = 30;

/** Default gap threshold between observations (24 hours in milliseconds). */
export const DEFAULT_GAP_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export type CoverageCorridorOption = Readonly<{
  slug: string;
  label: string;
}>;

export type ParsedHistoryPoint = Readonly<{
  timestamp: string;
  timestampMs: number;
  medianRate: string | null;
  state: "healthy" | "insufficient_fresh_sources";
  sourceCount: number;
  freshSourceCount: number;
}>;

export type ParsedRateHistory = Readonly<{
  corridorSlug: string;
  corridorLabel: string;
  evaluatedAt: string;
  windowDays: number;
  points: readonly ParsedHistoryPoint[];
  stale: Readonly<{ generatedAt: string | null }> | null;
}>;

export type RateHistoryGap = Readonly<{
  fromTimestamp: string;
  toTimestamp: string;
  durationMs: number;
  durationFormatted: string;
  fromUtcDate: string;
  toUtcDate: string;
  message: string;
  inferenceNote: string;
}>;

export type RateHistoryCoverageSummary = Readonly<{
  totalPoints: number;
  pointsWithMedian: number;
  pointsWithoutMedian: number;
  healthyCount: number;
  insufficientSourcesCount: number;
  distinctUtcDates: readonly string[];
  distinctUtcDateCount: number;
  gaps: readonly RateHistoryGap[];
  oldestPointTimestamp: string | null;
  newestPointTimestamp: string | null;
  uptimePercentage: null;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function isSafeCorridorSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SLUG_LENGTH &&
    SLUG_PATTERN.test(value)
  );
}

export function isValidWindow(value: unknown): value is SupportedWindow {
  return typeof value === "number" && SUPPORTED_WINDOWS.includes(value as SupportedWindow);
}

function corridorLabel(record: Record<string, unknown>): string {
  const parts = [
    record.sourceAsset,
    record.sourceCountry,
    record.destinationAsset,
    record.destinationCountry,
  ];
  if (!parts.every(isString)) return String(record.slug ?? "");
  return `${parts[0]} (${parts[1]}) → ${parts[2]} (${parts[3]})`;
}

/** Parse `/api/corridors` into selectable options, dropping malformed entries. */
export function parseCorridorOptions(
  body: unknown,
): readonly CoverageCorridorOption[] | null {
  if (!isRecord(body) || !Array.isArray(body.corridors)) return null;
  const seen = new Set<string>();
  const options: CoverageCorridorOption[] = [];
  for (const entry of body.corridors) {
    if (!isRecord(entry) || !isSafeCorridorSlug(entry.slug)) continue;
    if (seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    options.push(
      Object.freeze({
        slug: entry.slug,
        label: corridorLabel(entry),
      }),
    );
  }
  return Object.freeze(options);
}

/** Build safe `/api/rates/history` path only for valid corridor option and supported window. */
export function buildRateHistoryPath(
  slug: string,
  days: number,
  options: readonly CoverageCorridorOption[],
): string | null {
  if (!isSafeCorridorSlug(slug)) return null;
  if (!isValidWindow(days)) return null;
  if (!options.some((option) => option.slug === slug)) return null;
  return `/api/rates/history?corridor=${encodeURIComponent(slug)}&days=${days}`;
}

export function readApiErrorMessage(body: unknown): string | null {
  if (isRecord(body) && isRecord(body.error) && typeof body.error.message === "string") {
    return body.error.message;
  }
  return null;
}

function parseTimestamp(raw: unknown): { iso: string; ms: number } | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null;
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) return null;
  return { iso: new Date(ms).toISOString(), ms };
}

export function formatDuration(ms: number): string {
  if (ms < 0) return "0s";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0 || (days > 0 && minutes > 0)) parts.push(`${hours}h`);
  if (days === 0 && minutes > 0) parts.push(`${minutes}m`);
  if (parts.length === 0) return "< 1m";
  return parts.join(" ");
}

/** Parse `/api/rates/history` response body into validated structure. */
export function parseRateHistoryBody(
  body: unknown,
  evidenceHeader?: string | null,
): ParsedRateHistory | null {
  if (!isRecord(body) || !isRecord(body.corridor) || !isSafeCorridorSlug(body.corridor.slug)) {
    return null;
  }
  if (!isString(body.evaluatedAt) || typeof body.windowDays !== "number") {
    return null;
  }
  if (!Array.isArray(body.points)) {
    return null;
  }

  const points: ParsedHistoryPoint[] = [];
  for (const rawPoint of body.points) {
    if (!isRecord(rawPoint)) continue;
    const parsedTs = parseTimestamp(rawPoint.timestamp);
    if (!parsedTs) continue;

    const state =
      rawPoint.state === "healthy" ? "healthy" : "insufficient_fresh_sources";
    const medianRate =
      typeof rawPoint.medianRate === "string" ? rawPoint.medianRate : null;
    const sourceCount = isCount(rawPoint.sourceCount) ? rawPoint.sourceCount : 0;
    const freshSourceCount = isCount(rawPoint.freshSourceCount)
      ? rawPoint.freshSourceCount
      : 0;

    points.push(
      Object.freeze({
        timestamp: parsedTs.iso,
        timestampMs: parsedTs.ms,
        medianRate,
        state,
        sourceCount,
        freshSourceCount,
      }),
    );
  }

  let stale: { generatedAt: string | null } | null = null;
  if (evidenceHeader === "stale") {
    stale = { generatedAt: null };
  } else if (isRecord(body.degraded)) {
    const degraded = body.degraded as unknown as StaleEvidenceMetadata;
    stale = {
      generatedAt: typeof degraded.generatedAt === "string" ? degraded.generatedAt : null,
    };
  }

  return Object.freeze({
    corridorSlug: body.corridor.slug,
    corridorLabel: corridorLabel(body.corridor),
    evaluatedAt: body.evaluatedAt,
    windowDays: body.windowDays,
    points: Object.freeze(points),
    stale: stale ? Object.freeze(stale) : null,
  });
}

/**
 * Summarizes rate history coverage deterministically from returned points.
 *
 * Rules:
 * - Distinct UTC dates derive strictly from the UTC date component (YYYY-MM-DD)
 *   of each returned point's timestamp.
 * - Evidence gaps are identified strictly between consecutive returned observations
 *   where the interval exceeds `gapThresholdMs`.
 * - No live-rate uptime percentage or capture schedule is extrapolated.
 */
export function summarizeRateHistoryCoverage(
  history: ParsedRateHistory,
  options: { gapThresholdMs?: number } = {},
): RateHistoryCoverageSummary {
  const gapThresholdMs = options.gapThresholdMs ?? DEFAULT_GAP_THRESHOLD_MS;
  const { points } = history;

  let pointsWithMedian = 0;
  let pointsWithoutMedian = 0;
  let healthyCount = 0;
  let insufficientSourcesCount = 0;

  const utcDatesSet = new Set<string>();

  for (const p of points) {
    if (p.medianRate !== null) {
      pointsWithMedian++;
    } else {
      pointsWithoutMedian++;
    }

    if (p.state === "healthy") {
      healthyCount++;
    } else {
      insufficientSourcesCount++;
    }

    // Extract UTC calendar date YYYY-MM-DD
    const d = new Date(p.timestampMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    utcDatesSet.add(`${year}-${month}-${day}`);
  }

  const distinctUtcDates = Array.from(utcDatesSet).sort();

  // Sort points chronologically ascending for gap detection
  const sortedPoints = [...points].sort((a, b) => a.timestampMs - b.timestampMs);

  const gaps: RateHistoryGap[] = [];
  for (let i = 0; i < sortedPoints.length - 1; i++) {
    const prev = sortedPoints[i];
    const next = sortedPoints[i + 1];
    const intervalMs = next.timestampMs - prev.timestampMs;

    if (intervalMs > gapThresholdMs) {
      const fromDate = new Date(prev.timestampMs);
      const toDate = new Date(next.timestampMs);
      const fromUtcDate = `${fromDate.getUTCFullYear()}-${String(fromDate.getUTCMonth() + 1).padStart(2, "0")}-${String(fromDate.getUTCDate()).padStart(2, "0")}`;
      const toUtcDate = `${toDate.getUTCFullYear()}-${String(toDate.getUTCMonth() + 1).padStart(2, "0")}-${String(toDate.getUTCDate()).padStart(2, "0")}`;

      gaps.push(
        Object.freeze({
          fromTimestamp: prev.timestamp,
          toTimestamp: next.timestamp,
          durationMs: intervalMs,
          durationFormatted: formatDuration(intervalMs),
          fromUtcDate,
          toUtcDate,
          message: "No stored observation in the interval",
          inferenceNote:
            "Observed endpoint failure cannot be inferred from the absence of stored data.",
        }),
      );
    }
  }

  const oldestPointTimestamp =
    sortedPoints.length > 0 ? sortedPoints[0].timestamp : null;
  const newestPointTimestamp =
    sortedPoints.length > 0 ? sortedPoints[sortedPoints.length - 1].timestamp : null;

  return Object.freeze({
    totalPoints: points.length,
    pointsWithMedian,
    pointsWithoutMedian,
    healthyCount,
    insufficientSourcesCount,
    distinctUtcDates: Object.freeze(distinctUtcDates),
    distinctUtcDateCount: distinctUtcDates.length,
    gaps: Object.freeze(gaps),
    oldestPointTimestamp,
    newestPointTimestamp,
    uptimePercentage: null,
  });
}
