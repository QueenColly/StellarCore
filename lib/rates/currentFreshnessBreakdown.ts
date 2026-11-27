import type {
  PublicRateObservation,
  PublicRatesResponse,
} from "@/types/api/rates";
import type { RateFreshnessState } from "@/types/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

const FRESHNESS_STATES: readonly RateFreshnessState[] = Object.freeze([
  "fresh",
  "stale",
  "future",
  "invalid",
]);

export type FreshnessAgeSummary = Readonly<{
  count: number;
  agesMs: readonly number[];
  nullAgeCount: number;
  hasNegativeAge: boolean;
}>;

export type FreshnessStateGroup = Readonly<{
  state: RateFreshnessState;
  count: number;
  agesMs: readonly number[];
  nullAgeCount: number;
  hasNegativeAge: boolean;
  eligibleForMedianCount: number;
}>;

export type CurrentFreshnessBreakdown = Readonly<{
  corridor: PublicRatesResponse["corridor"];
  evaluatedAt: string;
  totalObservations: number;
  groups: readonly FreshnessStateGroup[];
  eligibleForMedianCount: number;
  notEligibleForMedianCount: number;
  degraded?: StaleEvidenceMetadata;
  empty: boolean;
}>;

function summarizeAges(observations: readonly PublicRateObservation[]): FreshnessAgeSummary {
  const agesMs: number[] = [];
  let nullAgeCount = 0;
  let hasNegativeAge = false;

  for (const observation of observations) {
    const age = observation.freshness.ageMs;
    if (age === null) {
      nullAgeCount += 1;
      continue;
    }
    if (!Number.isFinite(age)) continue;
    agesMs.push(age);
    if (age < 0) hasNegativeAge = true;
  }

  return Object.freeze({ count: agesMs.length, agesMs: Object.freeze(agesMs), nullAgeCount, hasNegativeAge });
}

function groupByFreshnessState(
  observations: readonly PublicRateObservation[],
): Readonly<Record<RateFreshnessState, FreshnessStateGroup>> {
  const groups: Partial<Record<RateFreshnessState, FreshnessStateGroup>> = {};

  for (const state of FRESHNESS_STATES) {
    const matching = observations.filter((o) => o.freshness.state === state);
    const ageSummary = summarizeAges(matching);
    const eligibleForMedianCount = matching.filter((o) => o.eligibleForMedian).length;
    groups[state] = Object.freeze({
      state,
      count: matching.length,
      agesMs: ageSummary.agesMs,
      nullAgeCount: ageSummary.nullAgeCount,
      hasNegativeAge: ageSummary.hasNegativeAge,
      eligibleForMedianCount,
    });
  }

  return groups as Readonly<Record<RateFreshnessState, FreshnessStateGroup>>;
}

/**
 * Pure, read-only breakdown of the API's explicit freshness classifications.
 *
 * Counts derive solely from `freshness.state` as returned by the API. Age values
 * are reported as provided; null and negative ages are surfaced conservatively
 * without recomputing statuses against the browser clock. `eligibleForMedian` is
 * reported independently of freshness and never used to infer a state.
 */
export function computeCurrentFreshnessBreakdown(
  response: PublicRatesResponse,
): CurrentFreshnessBreakdown {
  const { observations, evaluatedAt, degraded } = response;
  const groups = groupByFreshnessState(observations);
  const totalObservations = observations.length;
  const eligibleForMedianCount = observations.filter((o) => o.eligibleForMedian).length;

  return Object.freeze({
    corridor: response.corridor,
    evaluatedAt,
    totalObservations,
    groups: Object.freeze(FRESHNESS_STATES.map((state) => groups[state]!)),
    eligibleForMedianCount,
    notEligibleForMedianCount: totalObservations - eligibleForMedianCount,
    degraded,
    empty: totalObservations === 0,
  });
}

export function formatAgeMs(ageMs: number | null): string {
  if (ageMs === null) return "age not reported";
  if (!Number.isFinite(ageMs)) return "age not reported";
  if (ageMs < 0) return `${Math.abs(ageMs)} ms (negative, as reported)`;
  if (ageMs < 1000) return `${ageMs} ms`;
  return `${(ageMs / 1000).toFixed(2)} s`;
}

export function describeFreshnessState(state: RateFreshnessState): string {
  switch (state) {
    case "fresh":
      return "Fresh";
    case "stale":
      return "Stale";
    case "future":
      return "Future";
    case "invalid":
      return "Invalid";
  }
}

export function isValidFreshnessState(value: unknown): value is RateFreshnessState {
  return typeof value === "string" && FRESHNESS_STATES.includes(value as RateFreshnessState);
}

export function describeDegraded(metadata: StaleEvidenceMetadata | null | undefined): string {
  if (!metadata) return "Fresh evidence";
  const age = metadata.snapshotAgeMs;
  const ageText =
    typeof age === "number" && Number.isFinite(age) && age >= 0
      ? `, ${age} ms old at evaluation`
      : "";
  return `Stale fallback copy generated ${metadata.generatedAt}${ageText}; expires ${metadata.expiresAt}.`;
}
