import type {
  PublicReputation,
  PublicReputationListResponse,
  PublicReputationScoreBand,
} from "@/types/api/reputation";

/**
 * Pure, read-only distribution of reputation states in a public reputation
 * list response (#737).
 *
 * Counts describe only the records the API returned. Unpublished states
 * (`insufficient_evidence`, `not_evaluated`) are never given a band or a
 * score, and an `established` record whose published score or band is
 * missing or malformed is reported as inconsistent rather than re-rated.
 * Nothing here recomputes a score or band from metrics or thresholds.
 */

export type ReputationDistributionCategory =
  | "established"
  | "established_inconsistent"
  | "insufficient_evidence"
  | "not_evaluated"
  | "unknown_state";

export type EstablishedInconsistency = "null_score" | "invalid_score" | "missing_band" | "malformed_band";

export type ClassifiedReputation = Readonly<{
  slug: string;
  name: string;
  category: ReputationDistributionCategory;
  /** Published band; only set for `established` records with valid fields. */
  band: PublicReputationScoreBand | null;
  /** Published score; only set for `established` records with valid fields. */
  score: number | null;
  inconsistency: EstablishedInconsistency | null;
  /** Raw state string as returned, for display of unknown states. */
  rawState: string;
  computedAt: string | null;
}>;

export type DistributionShare = Readonly<{
  count: number;
  denominator: number;
  /** Percentage of the denominator, or null when the denominator is zero. */
  percent: number | null;
}>;

export type ReputationStateDistribution = Readonly<{
  /** Records returned in the response. All state proportions use this. */
  returned: number;
  /** `count` as reported by the API, or null when missing or malformed. */
  reportedCount: number | null;
  /** True when the reported count disagrees with the returned records. */
  countMismatch: boolean;
  states: Readonly<Record<ReputationDistributionCategory, DistributionShare>>;
  /** Band shares; the denominator is valid published established records only. */
  bands: Readonly<Record<PublicReputationScoreBand, DistributionShare>>;
  records: readonly ClassifiedReputation[];
  earliestComputedAt: string | null;
  latestComputedAt: string | null;
}>;

export const REPUTATION_BANDS_ORDER = ["green", "amber", "red"] as const;
export const REPUTATION_CATEGORY_ORDER = [
  "established",
  "established_inconsistent",
  "insufficient_evidence",
  "not_evaluated",
  "unknown_state",
] as const satisfies readonly ReputationDistributionCategory[];

function isValidTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function isBand(value: unknown): value is PublicReputationScoreBand {
  return value === "green" || value === "amber" || value === "red";
}

function readText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback;
}

export function classifyReputation(record: PublicReputation): ClassifiedReputation {
  const anchor: unknown = record.anchor;
  const anchorRecord = (anchor && typeof anchor === "object" ? anchor : {}) as Record<string, unknown>;
  const slug = readText(anchorRecord.slug, "unknown-anchor");
  const name = readText(anchorRecord.name, slug);
  const state: unknown = record.state;
  const score: unknown = record.score;
  const band: unknown = record.scoreBand;
  const computedAt = isValidTimestamp(record.computedAt) ? record.computedAt : null;
  const base = { slug, name, rawState: typeof state === "string" ? state : "unknown", computedAt };

  if (state === "insufficient_evidence" || state === "not_evaluated") {
    return { ...base, category: state, band: null, score: null, inconsistency: null };
  }
  if (state !== "established") {
    return { ...base, category: "unknown_state", band: null, score: null, inconsistency: null };
  }

  let inconsistency: EstablishedInconsistency | null = null;
  if (score === null || score === undefined) inconsistency = "null_score";
  else if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 100) {
    inconsistency = "invalid_score";
  } else if (band === null || band === undefined) inconsistency = "missing_band";
  else if (!isBand(band)) inconsistency = "malformed_band";

  if (inconsistency !== null) {
    return { ...base, category: "established_inconsistent", band: null, score: null, inconsistency };
  }
  return {
    ...base,
    category: "established",
    band: band as PublicReputationScoreBand,
    score: score as number,
    inconsistency: null,
  };
}

function share(count: number, denominator: number): DistributionShare {
  return { count, denominator, percent: denominator === 0 ? null : (count / denominator) * 100 };
}

export function summarizeReputationStates(
  response: Pick<PublicReputationListResponse, "reputation" | "count">,
): ReputationStateDistribution {
  const list: unknown = response.reputation;
  const records = (Array.isArray(list) ? (list as PublicReputation[]) : []).map(classifyReputation);
  const returned = records.length;
  const rawCount: unknown = response.count;
  const reportedCount =
    typeof rawCount === "number" && Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : null;

  const countOf = (category: ReputationDistributionCategory) =>
    records.filter((r) => r.category === category).length;
  const states = Object.fromEntries(
    REPUTATION_CATEGORY_ORDER.map((category) => [category, share(countOf(category), returned)]),
  ) as Record<ReputationDistributionCategory, DistributionShare>;

  const published = records.filter((r) => r.category === "established");
  const bands = Object.fromEntries(
    REPUTATION_BANDS_ORDER.map((band) => [
      band,
      share(published.filter((r) => r.band === band).length, published.length),
    ]),
  ) as Record<PublicReputationScoreBand, DistributionShare>;

  const times = records
    .map((r) => r.computedAt)
    .filter((t): t is string => t !== null)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return {
    returned,
    reportedCount,
    countMismatch: reportedCount !== returned,
    states,
    bands,
    records,
    earliestComputedAt: times[0] ?? null,
    latestComputedAt: times.at(-1) ?? null,
  };
}

/** "66.7%" style label, or "—" when there is no denominator. */
export function formatSharePercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(1))}%`;
}

export function describeReputationCategory(category: ReputationDistributionCategory): string {
  switch (category) {
    case "established":
      return "Established (published band)";
    case "established_inconsistent":
      return "Established with inconsistent published fields";
    case "insufficient_evidence":
      return "Insufficient evidence (unpublished)";
    case "not_evaluated":
      return "Not evaluated (unpublished)";
    case "unknown_state":
      return "Unrecognised state";
  }
}

export function describeEstablishedInconsistency(reason: EstablishedInconsistency): string {
  switch (reason) {
    case "null_score":
      return "established state but no published score";
    case "invalid_score":
      return "published score is outside the 0–100 contract";
    case "missing_band":
      return "established state but no published band";
    case "malformed_band":
      return "published band is not green, amber, or red";
  }
}
