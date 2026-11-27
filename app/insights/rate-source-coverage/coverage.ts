/**
 * Route-local interpretation helpers for /insights/rate-source-coverage.
 *
 * Everything here reads the existing public GET responses (`/api/corridors`,
 * `/api/rates?corridor=`) and explains them. Nothing is computed that the API
 * did not report: the median is never derived locally, a single observation is
 * never promoted to a published median, and reviewed candidate configuration
 * is never equated with fresh independent observations.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;

export type CoverageCorridorOption = Readonly<{
  slug: string;
  label: string;
}>;

export type CoverageObservation = Readonly<{
  anchorSlug: string;
  anchorName: string;
  capturedAt: string;
  freshnessState: "fresh" | "stale" | "future" | "invalid";
  eligibleForMedian: boolean;
  exclusionReason: string | null;
}>;

export type CoverageRates = Readonly<{
  corridorSlug: string;
  corridorLabel: string;
  evaluatedAt: string;
  state: "healthy" | "insufficient_fresh_sources";
  medianRate: string | null;
  sourceCount: number;
  freshSourceCount: number;
  candidateCount: number;
  uniqueAnchorCount: number;
  minimumFreshIndependentSources: number;
  observations: readonly CoverageObservation[];
  stale: Readonly<{ generatedAt: string | null }> | null;
}>;

export type CoverageExplanationKind =
  | "missing"
  | "stale"
  | "excluded"
  | "invalid"
  | "insufficient"
  | "registry_limit"
  | "published";

export type CoverageExplanation = Readonly<{
  kind: CoverageExplanationKind;
  text: string;
}>;

export type CoverageSummary = Readonly<{
  medianPublished: boolean;
  shortfall: number;
  counts: Readonly<{
    fresh: number;
    stale: number;
    future: number;
    invalid: number;
    excluded: number;
  }>;
  explanations: readonly CoverageExplanation[];
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
  return typeof value === "string"
    && value.length > 0
    && value.length <= MAX_SLUG_LENGTH
    && SLUG_PATTERN.test(value);
}

function corridorLabel(record: Record<string, unknown>): string {
  const parts = [record.sourceAsset, record.sourceCountry, record.destinationAsset, record.destinationCountry];
  if (!parts.every(isString)) return String(record.slug ?? "");
  return `${parts[0]} (${parts[1]}) → ${parts[2]} (${parts[3]})`;
}

/** Parse `/api/corridors` into selectable options, dropping malformed entries. */
export function parseCorridorOptions(body: unknown): readonly CoverageCorridorOption[] | null {
  if (!isRecord(body) || !Array.isArray(body.corridors)) return null;
  const seen = new Set<string>();
  const options: CoverageCorridorOption[] = [];
  for (const entry of body.corridors) {
    if (!isRecord(entry) || !isSafeCorridorSlug(entry.slug) || seen.has(entry.slug)) continue;
    seen.add(entry.slug);
    options.push(Object.freeze({ slug: entry.slug, label: corridorLabel(entry) }));
  }
  return Object.freeze(options);
}

/**
 * Build the only request this page sends for a selection. The slug must be a
 * safe slug *and* one of the options returned by `/api/corridors`.
 */
export function buildRatesPath(
  slug: unknown,
  options: readonly CoverageCorridorOption[],
): string | null {
  if (!isSafeCorridorSlug(slug)) return null;
  if (!options.some((option) => option.slug === slug)) return null;
  return `/api/rates?${new URLSearchParams({ corridor: slug }).toString()}`;
}

const FRESHNESS_STATES = new Set(["fresh", "stale", "future", "invalid"]);

/** Strictly parse a `/api/rates` 200 body; returns null when required fields are missing. */
export function parseRatesBody(body: unknown, evidenceHeader: string | null = null): CoverageRates | null {
  if (!isRecord(body) || !isRecord(body.corridor)) return null;
  const config = body.reviewedCandidateConfiguration;
  const requirement = body.medianRequirement;
  if (
    !isSafeCorridorSlug(body.corridor.slug)
    || !isString(body.evaluatedAt)
    || (body.state !== "healthy" && body.state !== "insufficient_fresh_sources")
    || !(body.medianRate === null || isString(body.medianRate))
    || !isCount(body.sourceCount)
    || !isCount(body.freshSourceCount)
    || !isRecord(config)
    || !isCount(config.candidateCount)
    || !isCount(config.uniqueAnchorCount)
    || !isRecord(requirement)
    || !isCount(requirement.minimumFreshIndependentSources)
    || !Array.isArray(body.observations)
  ) {
    return null;
  }

  const observations: CoverageObservation[] = [];
  for (const entry of body.observations) {
    if (!isRecord(entry) || !isRecord(entry.anchor) || !isRecord(entry.freshness)) continue;
    const slug = entry.anchor.slug;
    const state = entry.freshness.state;
    if (!isString(slug) || !isString(state) || !FRESHNESS_STATES.has(state)) continue;
    observations.push(Object.freeze({
      anchorSlug: slug,
      anchorName: isString(entry.anchor.name) && entry.anchor.name.trim() ? entry.anchor.name : slug,
      capturedAt: isString(entry.capturedAt) ? entry.capturedAt : "",
      freshnessState: state as CoverageObservation["freshnessState"],
      eligibleForMedian: entry.eligibleForMedian === true,
      exclusionReason: isString(entry.exclusionReason) ? entry.exclusionReason : null,
    }));
  }

  const degraded = isRecord(body.degraded) && body.degraded.state === "stale";
  const stale = degraded || evidenceHeader === "stale"
    ? Object.freeze({
        generatedAt: isRecord(body.degraded) && isString(body.degraded.generatedAt)
          ? body.degraded.generatedAt
          : null,
      })
    : null;

  return Object.freeze({
    corridorSlug: body.corridor.slug,
    corridorLabel: corridorLabel(body.corridor),
    evaluatedAt: body.evaluatedAt,
    state: body.state,
    medianRate: body.medianRate,
    sourceCount: body.sourceCount,
    freshSourceCount: body.freshSourceCount,
    candidateCount: config.candidateCount,
    uniqueAnchorCount: config.uniqueAnchorCount,
    minimumFreshIndependentSources: requirement.minimumFreshIndependentSources,
    observations: Object.freeze(observations),
    stale,
  });
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Explain coverage using only the parsed API fields. */
export function summarizeCoverage(rates: CoverageRates): CoverageSummary {
  const counts = { fresh: 0, stale: 0, future: 0, invalid: 0, excluded: 0 };
  for (const observation of rates.observations) {
    counts[observation.freshnessState] += 1;
    if (!observation.eligibleForMedian) counts.excluded += 1;
  }

  const required = rates.minimumFreshIndependentSources;
  const shortfall = Math.max(0, required - rates.freshSourceCount);
  // Published only when the API itself reports a non-null median.
  const medianPublished = rates.medianRate !== null;
  const explanations: CoverageExplanation[] = [];

  if (rates.sourceCount === 0) {
    explanations.push({
      kind: "missing",
      text: "No latest persisted observation exists for this corridor, so there is nothing to evaluate.",
    });
  } else if (rates.candidateCount > rates.sourceCount) {
    explanations.push({
      kind: "missing",
      text: `${plural(rates.candidateCount, "reviewed candidate")} configured, but only ${plural(rates.sourceCount, "latest persisted observation")} exist. Configuration is not proof a source returned a price.`,
    });
  }

  if (counts.stale > 0) {
    explanations.push({
      kind: "stale",
      text: `${plural(counts.stale, "observation")} ${counts.stale === 1 ? "is" : "are"} stale and cannot count toward the median.`,
    });
  }

  const invalidCount = counts.future + counts.invalid;
  if (invalidCount > 0) {
    explanations.push({
      kind: "invalid",
      text: `${plural(invalidCount, "observation")} ${invalidCount === 1 ? "has" : "have"} a future or invalid timestamp and ${invalidCount === 1 ? "is" : "are"} excluded.`,
    });
  }

  const otherExcluded = rates.observations.filter(
    (observation) => !observation.eligibleForMedian && observation.freshnessState === "fresh",
  ).length;
  if (otherExcluded > 0) {
    explanations.push({
      kind: "excluded",
      text: `${plural(otherExcluded, "fresh observation")} ${otherExcluded === 1 ? "was" : "were"} excluded from the median (for example, an invalid rate).`,
    });
  }

  if (rates.uniqueAnchorCount < required) {
    explanations.push({
      kind: "registry_limit",
      text: `The reviewed registry lists ${plural(rates.uniqueAnchorCount, "independent anchor")} for this corridor, fewer than the ${required} required. Even if every configured source were fresh, a median could not be published until another independent source is reviewed.`,
    });
  }

  if (!medianPublished) {
    explanations.push({
      kind: "insufficient",
      text: `Median not published: ${plural(rates.freshSourceCount, "fresh independent observation")} of ${required} required${shortfall > 0 ? ` (${shortfall} more needed)` : ""}. A single observation is never presented as a median.`,
    });
  } else {
    explanations.push({
      kind: "published",
      text: `Median published from ${plural(rates.freshSourceCount, "fresh independent observation")}, meeting the minimum of ${required}.`,
    });
  }

  return Object.freeze({
    medianPublished,
    shortfall,
    counts: Object.freeze(counts),
    explanations: Object.freeze(explanations),
  });
}

/** Read the public error envelope message, bounded for display. */
export function readApiErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error) || !isString(body.error.message)) return null;
  return body.error.message.slice(0, 300);
}
