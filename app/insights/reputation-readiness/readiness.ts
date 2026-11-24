/**
 * Route-local interpretation helpers for /insights/reputation-readiness.
 *
 * Reads only the public GET /api/reputation response. A null score stays
 * unavailable: it is never replaced by zero, estimated, or derived from
 * outcome counts or metrics. Outcome counts are shown only when the API
 * returned an evidence object.
 */

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type ReadinessState = "not_evaluated" | "insufficient_evidence" | "established";

export type ReadinessEntry = Readonly<{
  anchorSlug: string;
  anchorName: string;
  state: ReadinessState;
  /** Exactly as returned; null means unavailable. */
  score: number | null;
  scoreBand: string | null;
  /** null when the API returned no evidence object. */
  outcomeCount: number | null;
  computedAt: string | null;
}>;

export type ReadinessList = Readonly<{
  entries: readonly ReadinessEntry[];
  stale: Readonly<{ generatedAt: string | null }> | null;
}>;

export type ReadinessDescription = Readonly<{
  stateLabel: string;
  scoreLabel: string;
  outcomeLabel: string;
  thresholdNote: string;
  href: string | null;
}>;

const STATES = new Set<ReadinessState>(["not_evaluated", "insufficient_evidence", "established"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

export function parseReadinessEntry(value: unknown): ReadinessEntry | null {
  if (!isRecord(value) || !isRecord(value.anchor)) return null;
  const { slug, name } = value.anchor;
  if (!isString(slug) || slug.length === 0 || slug.length > 100) return null;
  if (!isString(value.state) || !STATES.has(value.state as ReadinessState)) return null;

  const score = typeof value.score === "number" && Number.isFinite(value.score) ? value.score : null;
  const outcomeCount = isRecord(value.evidence)
    && typeof value.evidence.outcomeCount === "number"
    && Number.isInteger(value.evidence.outcomeCount)
    && value.evidence.outcomeCount >= 0
    ? value.evidence.outcomeCount
    : null;

  return Object.freeze({
    anchorSlug: slug,
    anchorName: isString(name) && name.trim() ? name : slug,
    state: value.state as ReadinessState,
    score,
    scoreBand: isString(value.scoreBand) ? value.scoreBand : null,
    outcomeCount,
    computedAt: isString(value.computedAt) ? value.computedAt : null,
  });
}

/** Parse a GET /api/reputation 200 body; null when the shape is unusable. */
export function parseReadinessList(body: unknown, evidenceHeader: string | null = null): ReadinessList | null {
  if (!isRecord(body) || !Array.isArray(body.reputation)) return null;
  const entries = body.reputation
    .map(parseReadinessEntry)
    .filter((entry): entry is ReadinessEntry => entry !== null);
  const degraded = isRecord(body.degraded) && body.degraded.state === "stale";
  return Object.freeze({
    entries: Object.freeze(entries),
    stale: degraded || evidenceHeader === "stale"
      ? Object.freeze({
          generatedAt: isRecord(body.degraded) && isString(body.degraded.generatedAt)
            ? body.degraded.generatedAt
            : null,
        })
      : null,
  });
}

export function anchorDetailHref(slug: string): string | null {
  return SLUG_PATTERN.test(slug) && slug.length <= 100 ? `/anchors/${encodeURIComponent(slug)}` : null;
}

export function describeReadiness(entry: ReadinessEntry, minimumOutcomes: number): ReadinessDescription {
  // Only an established state with a numeric score from the API is shown as a score.
  const scoreLabel = entry.state === "established" && entry.score !== null
    ? `${entry.score}${entry.scoreBand ? ` (${entry.scoreBand})` : ""}`
    : "Unavailable";

  const outcomeLabel = entry.outcomeCount === null
    ? "No outcome evidence recorded"
    : `${entry.outcomeCount} of ${minimumOutcomes} minimum recorded outcomes`;

  let stateLabel: string;
  let thresholdNote: string;
  switch (entry.state) {
    case "not_evaluated":
      stateLabel = "Not evaluated";
      thresholdNote = "No reputation evaluation has been recorded for this anchor yet.";
      break;
    case "insufficient_evidence":
      stateLabel = "Insufficient evidence";
      if (entry.outcomeCount !== null && entry.outcomeCount >= minimumOutcomes) {
        thresholdNote = "The outcome minimum is met, but no score was published: the evaluated evidence did not satisfy the other prerequisites (an associated corridor and a latest rate observation).";
      } else if (entry.outcomeCount !== null) {
        thresholdNote = `${minimumOutcomes - entry.outcomeCount} more recorded outcomes are needed before a score can be considered. Meeting the minimum alone does not guarantee a score.`;
      } else {
        thresholdNote = "Evaluated without outcome evidence; a score cannot be published.";
      }
      break;
    case "established":
      stateLabel = "Established";
      thresholdNote = entry.score === null
        ? "Reported as established, but the API returned no score; it is shown as unavailable."
        : "Score published by the reputation engine from the evaluated evidence.";
      break;
  }

  return Object.freeze({
    stateLabel,
    scoreLabel,
    outcomeLabel,
    thresholdNote,
    href: anchorDetailHref(entry.anchorSlug),
  });
}

export function readApiErrorMessage(body: unknown): string | null {
  if (!isRecord(body) || !isRecord(body.error) || !isString(body.error.message)) return null;
  return body.error.message.slice(0, 300);
}
