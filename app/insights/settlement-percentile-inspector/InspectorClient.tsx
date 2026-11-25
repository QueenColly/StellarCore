/**
 * Settlement percentile inspector client.
 *
 * Reads only the public GET /api/reputation response for selected anchors.
 * Does not query any database, SEP network, or settlement engine.
 * All values are taken directly from the API response; no inference or calculation.
 */

/* eslint-disable */

import { isValidAnchorSlug } from "@/lib/api/anchors";
import type {
  PublicReputation,
  PublicReputationListResponse,
  PublicReputationDetailResponse,
  ReputationApiListResult,
  ReputationApiDetailResult,
} from "@/types/api/reputation";

/** Parses a single anchor's public reputation from a detail response body. */
function parseAnchorReputation(value: unknown): PublicReputation | null {
  if (!isRecord(value) || !isRecord(value.reputation)) return null;
  const rep = value.reputation;
  if (!isRecord(rep.anchor)) return null;
  const { slug, name } = rep.anchor;
  if (!isString(slug) || slug.length === 0 || slug.length > 100) return null;
  if (!isString(rep.state) || rep.state.length === 0) return null;

  const metrics = isRecord(rep.metrics)
    ? Object.freeze({
        fillRate7d: safeNumber(rep.metrics.fillRate7d),
        fillRate30d: safeNumber(rep.metrics.fillRate30d),
        fillRate90d: safeNumber(rep.metrics.fillRate90d),
        settleP50Ms: safeNumber(rep.metrics.settleP50Ms),
        settleP95Ms: safeNumber(rep.metrics.settleP95Ms),
        slippageP50: safeNumber(rep.metrics.slippageP50),
        slippageP95: safeNumber(rep.metrics.slippageP95),
      })
    : null;

  const evidence = isRecord(rep.evidence)
    ? Object.freeze({
        outcomeCount:
          typeof rep.evidence.outcomeCount === "number" &&
          Number.isInteger(rep.evidence.outcomeCount) &&
          rep.evidence.outcomeCount >= 0
            ? rep.evidence.outcomeCount
            : null,
      })
    : null;

  return Object.freeze({
    anchor: Object.freeze({
      slug,
      name: isString(rep.anchor.name) && rep.anchor.name.trim() ? rep.anchor.name : slug,
    }),
    state: rep.state,
    score:
      typeof rep.score === "number" && Number.isFinite(rep.score) ? rep.score : null,
    scoreBand: isString(rep.scoreBand) ? rep.scoreBand : null,
    evidence,
    metrics,
    computedAt: isString(rep.computedAt) ? rep.computedAt : null,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function safeNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  return value;
}

/** Parses a GET /api/reputation 200 list body. */
export function parseReputationList(body: unknown) {
  if (!isRecord(body) || !Array.isArray(body.reputation)) return null;
  const entries = body.reputation
    .map(parseAnchorReputation)
    .filter((entry): entry is NonNullable<typeof entries[0]> => entry !== null);
  const degraded =
    isRecord(body.degraded) && body.degraded.state === "stale";
  return {
    entries: Object.freeze(entries),
    stale: degraded
      ? { generatedAt: isString(body.degraded.generatedAt)
          ? body.degraded.generatedAt
          : null }
      : undefined,
  };
}

/** Determines if p95 < p50 based on directly returned values. */
export function computeP95MinusP50Label(
  p50Ms: number | null,
  p95Ms: number | null,
) {
  if (p50Ms === null || p95Ms === null) {
    return { p95MinusP50Ms: null, p95LessThanP50: null };
  }
  // Check for NaN - NaN comparisons always return false
  if (!Number.isFinite(p50Ms) || !Number.isFinite(p95Ms)) {
    return { p95MinusP50Ms: null, p95LessThanP50: null };
  }
  const p50 = p50Ms;
  const p95 = p95Ms;
  const spread = p95 - p50;
  const p95LessThanP50 = p95 < p50;
  return { p95MinusP50Ms: spread, p95LessThanP50 };
}

/** Format milliseconds to a human-readable string, or show N/A for null. */
export function formatMs(value: number | null): string {
  if (value === null) return "N/A";
  if (value === 0) return "0 ms";
  return `${value} ms`;
}

/** Format the spread, labeling inconsistent ordering. */
export function formatSpread(p50Ms: number | null, p95Ms: number | null): string {
  if (p50Ms === null || p95Ms === null) return "—";
  const spread = p95Ms - p50Ms;
  if (p95Ms < p50Ms) {
    return `p95 (${formatMs(p95Ms)}) < p50 (${formatMs(p50Ms)}), inconsistent ordering — spread: ${formatMs(spread)} arithmetic spread`;
  }
  return `p95 (${formatMs(p95Ms)}) − p50 (${formatMs(p50Ms)}), spread: ${formatMs(spread)}`;
}
