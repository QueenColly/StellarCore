import type {
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";

/**
 * Read-only grouping of the nominal source/destination amount pairs that were
 * actually persisted in a public rate-history response.
 *
 * Only fields already returned by the public API are used. Amount strings are
 * compared verbatim: `"100"`, `"100.0"` and `"100.00"` are three distinct
 * pairs. Nothing here converts currencies, derives a rate from the amounts, or
 * describes a pair as an executable price.
 */

/** History windows supported by the historical amount pairs view. */
export const HISTORICAL_AMOUNT_PAIR_WINDOWS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

/**
 * A non-negative decimal amount, exactly as persisted. The pattern is
 * deliberately strict (no exponents, signs or thousands separators) and never
 * rewrites the string, so distinct representations stay separate groups.
 */
const AMOUNT_PATTERN = /^\d+(?:\.\d+)?$/;

export function isInterpretableAmount(value: unknown): value is string {
  return typeof value === "string" && AMOUNT_PATTERN.test(value);
}

function timestampMs(value: unknown): number | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type HistoricalAmountPair = Readonly<{
  /** Stable identity of this group within one response. */
  key: string;
  /** Exact anchor slug, or null when the observation did not record one. */
  anchorSlug: string | null;
  anchorName: string;
  sourceAsset: string;
  destinationAsset: string;
  /** Exact persisted source amount string; null when not interpretable. */
  sourceAmount: string | null;
  /** Exact persisted destination amount string; null when not interpretable. */
  destinationAmount: string | null;
  /** True only when both amount strings are valid decimals and a slug exists. */
  interpretable: boolean;
  observationCount: number;
  /** Earliest valid capture time, normalised to UTC ISO, or null. */
  firstCapturedAt: string | null;
  /** Latest valid capture time, normalised to UTC ISO, or null. */
  lastCapturedAt: string | null;
  /** Observations in the group whose capturedAt could be interpreted. */
  interpretableCaptureCount: number;
  /** Observations in the group whose capturedAt could not be interpreted. */
  uninterpretableCaptureCount: number;
  /** Unique snapshot times (UTC ISO) that contributed to this group. */
  snapshotTimestamps: readonly string[];
  /** Contributions whose snapshot timestamp could not be interpreted. */
  uninterpretableSnapshotCount: number;
}>;

export type HistoricalAmountPairsSummary = Readonly<{
  pairs: readonly HistoricalAmountPair[];
  interpretablePairCount: number;
  observationCount: number;
  interpretableObservationCount: number;
  uninterpretableObservationCount: number;
  snapshotCount: number;
  /** Returned snapshots whose medianRate was null (still scanned for amounts). */
  snapshotsWithoutPublishedMedian: number;
  /** Returned snapshots whose own timestamp could not be interpreted. */
  uninterpretableSnapshotCount: number;
  /** Returned snapshots whose observations field was missing or not an array. */
  unreadableObservationArrayCount: number;
}>;

type CaptureRange = {
  firstMs: number | null;
  lastMs: number | null;
};

type PairBuilder = {
  anchorSlug: string;
  anchorName: string;
  sourceAsset: string;
  destinationAsset: string;
  sourceAmount: string;
  destinationAmount: string;
  observationCount: number;
  interpretableCaptureCount: number;
  uninterpretableCaptureCount: number;
  capture: CaptureRange;
  snapshotTimes: Map<number, string>;
  uninterpretableSnapshotCount: number;
};

function addCapture(capture: CaptureRange, ms: number): void {
  if (capture.firstMs === null || ms < capture.firstMs) capture.firstMs = ms;
  if (capture.lastMs === null || ms > capture.lastMs) capture.lastMs = ms;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finalizePair(builder: PairBuilder): HistoricalAmountPair {
  const snapshotTimes = [...builder.snapshotTimes.entries()]
    .sort(([leftMs], [rightMs]) => leftMs - rightMs)
    .map(([, iso]) => iso);

  return {
    key: `${builder.anchorSlug}\u001f${builder.sourceAmount}\u001f${builder.destinationAmount}`,
    anchorSlug: builder.anchorSlug,
    anchorName: builder.anchorName,
    sourceAsset: builder.sourceAsset,
    destinationAsset: builder.destinationAsset,
    sourceAmount: builder.sourceAmount,
    destinationAmount: builder.destinationAmount,
    interpretable: true,
    observationCount: builder.observationCount,
    firstCapturedAt:
      builder.capture.firstMs === null ? null : new Date(builder.capture.firstMs).toISOString(),
    lastCapturedAt:
      builder.capture.lastMs === null ? null : new Date(builder.capture.lastMs).toISOString(),
    interpretableCaptureCount: builder.interpretableCaptureCount,
    uninterpretableCaptureCount: builder.uninterpretableCaptureCount,
    snapshotTimestamps: snapshotTimes,
    uninterpretableSnapshotCount: builder.uninterpretableSnapshotCount,
  };
}

function uninterpretablePair(
  key: string,
  anchorSlug: string | null,
  anchorName: string,
  sourceAsset: string,
  destinationAsset: string,
): HistoricalAmountPair {
  return {
    key,
    anchorSlug,
    anchorName,
    sourceAsset,
    destinationAsset,
    sourceAmount: null,
    destinationAmount: null,
    interpretable: false,
    observationCount: 1,
    firstCapturedAt: null,
    lastCapturedAt: null,
    interpretableCaptureCount: 0,
    uninterpretableCaptureCount: 0,
    snapshotTimestamps: [],
    uninterpretableSnapshotCount: 0,
  };
}

/**
 * Groups every returned observation in one corridor by exact anchor slug and
 * exact source/destination amount strings.
 *
 * Invalid or missing amounts are never merged into a valid pair and are never
 * merged with each other: each such contribution is reported on its own as not
 * interpretable, without capture times.
 */
export function summarizeHistoricalAmountPairs(
  history: Pick<PublicRateHistoryResponse, "points" | "corridor">,
): HistoricalAmountPairsSummary {
  const sourceAsset = history.corridor?.sourceAsset ?? "";
  const destinationAsset = history.corridor?.destinationAsset ?? "";
  const rawPoints: unknown = history.points;
  const points: readonly unknown[] = Array.isArray(rawPoints) ? rawPoints : [];

  const builders = new Map<string, PairBuilder>();
  const uninterpretable: HistoricalAmountPair[] = [];
  let observationCount = 0;
  let interpretableObservationCount = 0;
  let snapshotCount = 0;
  let snapshotsWithoutPublishedMedian = 0;
  let uninterpretableSnapshotCount = 0;
  let unreadableObservationArrayCount = 0;

  points.forEach((rawPoint, pointIndex) => {
    snapshotCount += 1;

    if (!isRecord(rawPoint)) {
      uninterpretableSnapshotCount += 1;
      return;
    }

    const point = rawPoint as unknown as PublicRateHistoryPoint;
    const snapshotMs = timestampMs((rawPoint as Record<string, unknown>).timestamp);
    if (snapshotMs === null) uninterpretableSnapshotCount += 1;
    if ((rawPoint as Record<string, unknown>).medianRate === null) {
      snapshotsWithoutPublishedMedian += 1;
    }

    const rawObservations: unknown = point.observations;
    if (!Array.isArray(rawObservations)) {
      unreadableObservationArrayCount += 1;
      return;
    }

    rawObservations.forEach((rawObservation, observationIndex) => {
      observationCount += 1;

      if (!isRecord(rawObservation)) {
        uninterpretable.push(
          uninterpretablePair(
            `uninterpretable:${pointIndex}:${observationIndex}`,
            null,
            "",
            sourceAsset,
            destinationAsset,
          ),
        );
        return;
      }

      const observation = rawObservation as Record<string, unknown>;
      const anchor = observation.anchor;
      const anchorSlug =
        isRecord(anchor) && typeof anchor.slug === "string" && anchor.slug.length > 0
          ? anchor.slug
          : null;
      const anchorName =
        isRecord(anchor) && typeof anchor.name === "string" ? anchor.name : "";
      const sourceAmount = observation.sourceAmount;
      const destinationAmount = observation.destinationAmount;

      if (
        anchorSlug === null ||
        !isInterpretableAmount(sourceAmount) ||
        !isInterpretableAmount(destinationAmount)
      ) {
        uninterpretable.push(
          uninterpretablePair(
            `uninterpretable:${pointIndex}:${observationIndex}`,
            anchorSlug,
            anchorName,
            sourceAsset,
            destinationAsset,
          ),
        );
        return;
      }

      interpretableObservationCount += 1;

      const key = `${anchorSlug}\u001f${sourceAmount}\u001f${destinationAmount}`;
      let builder = builders.get(key);
      if (!builder) {
        builder = {
          anchorSlug,
          anchorName,
          sourceAsset,
          destinationAsset,
          sourceAmount,
          destinationAmount,
          observationCount: 0,
          interpretableCaptureCount: 0,
          uninterpretableCaptureCount: 0,
          capture: { firstMs: null, lastMs: null },
          snapshotTimes: new Map<number, string>(),
          uninterpretableSnapshotCount: 0,
        };
        builders.set(key, builder);
      } else if (!builder.anchorName && anchorName) {
        builder.anchorName = anchorName;
      }

      builder.observationCount += 1;

      const capturedMs = timestampMs(observation.capturedAt);
      if (capturedMs === null) {
        builder.uninterpretableCaptureCount += 1;
      } else {
        builder.interpretableCaptureCount += 1;
        addCapture(builder.capture, capturedMs);
      }

      if (snapshotMs === null) {
        builder.uninterpretableSnapshotCount += 1;
      } else if (!builder.snapshotTimes.has(snapshotMs)) {
        builder.snapshotTimes.set(snapshotMs, new Date(snapshotMs).toISOString());
      }
    });
  });

  const interpretablePairs = [...builders.values()]
    .map(finalizePair)
    .sort(
      (left, right) =>
        compareText(left.anchorSlug ?? "", right.anchorSlug ?? "") ||
        compareText(left.sourceAmount ?? "", right.sourceAmount ?? "") ||
        compareText(left.destinationAmount ?? "", right.destinationAmount ?? ""),
    );

  return {
    pairs: [...interpretablePairs, ...uninterpretable],
    interpretablePairCount: interpretablePairs.length,
    observationCount,
    interpretableObservationCount,
    uninterpretableObservationCount: observationCount - interpretableObservationCount,
    snapshotCount,
    snapshotsWithoutPublishedMedian,
    uninterpretableSnapshotCount,
    unreadableObservationArrayCount,
  };
}

/** True when the response returned the expected snapshot array. */
export function hasReadableHistoryPoints(
  history: Pick<PublicRateHistoryResponse, "points">,
): boolean {
  return Array.isArray(history.points);
}
