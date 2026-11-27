import type {
  PublicRateObservation,
  PublicRatesResponse,
} from "@/types/api/rates";

const MEDIAN_EXCLUSION_REASONS: ReadonlySet<string> = new Set([
  "stale",
  "future_timestamp",
  "invalid_timestamp",
  "invalid_rate",
]);

export const REASON_NOT_REPORTED = "Reason not reported";

export type ExclusionGroupEntry = Readonly<{
  slug: string;
  capturedAt: string;
}>;

export type ExclusionGroup = Readonly<{
  reason: string;
  count: number;
  entries: ReadonlyArray<ExclusionGroupEntry>;
}>;

export type MedianExclusionAudit = Readonly<{
  observedCount: number;
  eligibleCount: number;
  excludedCount: number;
  groups: ReadonlyArray<ExclusionGroup>;
}>;

type MutableGroup = {
  reason: string;
  count: number;
  entries: ExclusionGroupEntry[];
};

export function summarizeMedianExclusions(
  response: PublicRatesResponse | null | undefined,
): MedianExclusionAudit {
  const observations = response?.observations ?? [];
  const groups = new Map<string, MutableGroup>();
  let eligibleCount = 0;
  let excludedCount = 0;

  for (const observation of observations) {
    if (observation?.eligibleForMedian === true) {
      eligibleCount += 1;
      continue;
    }
    excludedCount += 1;

    const reason = exclusionReasonLabel(observation);
    let group = groups.get(reason);
    if (!group) {
      group = { reason, count: 0, entries: [] };
      groups.set(reason, group);
    }
    group.count += 1;
    group.entries.push(
      Object.freeze({
        slug: textValue(observation?.anchor?.slug),
        capturedAt: textValue(observation?.capturedAt),
      }),
    );
  }

  return Object.freeze({
    observedCount: observations.length,
    eligibleCount,
    excludedCount,
    groups: Object.freeze(
      [...groups.values()].sort((left, right) =>
        left.reason.localeCompare(right.reason),
      ),
    ),
  });
}

export function formatObservationTimestampUtc(timestamp: string): string {
  if (typeof timestamp !== "string" || timestamp.trim() === "") return "—";
  const parsed = new Date(timestamp);
  const milliseconds = parsed.getTime();
  if (!Number.isFinite(milliseconds)) return timestamp;
  return parsed.toISOString();
}

function exclusionReasonLabel(
  observation: PublicRateObservation | null | undefined,
): string {
  const reason = observation?.exclusionReason;
  return typeof reason === "string" && MEDIAN_EXCLUSION_REASONS.has(reason)
    ? reason
    : REASON_NOT_REPORTED;
}

function textValue(value: string | null | undefined): string {
  return typeof value === "string" ? value : "";
}
