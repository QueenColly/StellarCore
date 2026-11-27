import type { CorridorsApiResult, PublicCorridor } from "@/types/api/corridors";
import type { RatesApiResult } from "@/types/api/rates";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

/**
 * Cross-corridor persisted rate-evidence coverage.
 *
 * Every count and state below is derived only from existing public response
 * fields (`GET /api/corridors` and `GET /api/rates`). Nothing is guessed: a
 * missing median stays `null` ("Unavailable"), never zero, and no row implies
 * a verified transfer route or live uptime.
 */

/** Maximum rate reads per page render. Bounds server-side fan-out. */
export const CORRIDOR_COVERAGE_BATCH_SIZE = 6;

/** Upper bound on the batch query parameter, so hostile input cannot loop. */
export const MAX_CORRIDOR_COVERAGE_BATCH = 1_000;

export type CoverageState =
  | "configured_only"
  | "insufficient_fresh"
  | "eligible_median"
  | "rates_unavailable";

export type CorridorCoverageRow =
  | Readonly<{
      kind: "evaluated";
      corridor: PublicCorridor;
      state: Exclude<CoverageState, "rates_unavailable">;
      candidateCount: number;
      uniqueAnchorCount: number;
      sourceCount: number;
      freshSourceCount: number;
      minimumRequired: number;
      medianRate: string | null;
      evaluatedAt: string;
      degraded: StaleEvidenceMetadata | null;
    }>
  | Readonly<{
      kind: "unavailable";
      corridor: PublicCorridor;
      state: "rates_unavailable";
      message: string;
    }>;

export type CorridorCoverageReport =
  | Readonly<{ kind: "corridors_unavailable"; message: string }>
  | Readonly<{ kind: "empty" }>
  | Readonly<{
      kind: "ready";
      rows: readonly CorridorCoverageRow[];
      totalCorridors: number;
      batch: number;
      batchCount: number;
      batchSize: number;
      firstIndex: number;
    }>;

export type CorridorCoverageDependencies = Readonly<{
  readCorridors: () => Promise<CorridorsApiResult>;
  readRates: (slug: string) => Promise<RatesApiResult>;
}>;

/** Parse the 1-based `batch` query parameter; anything unexpected is batch 1. */
export function parseBatchParam(value: string | readonly string[] | undefined): number {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,3}$/.test(value)) return 1;
  const parsed = Number(value);
  return parsed <= MAX_CORRIDOR_COVERAGE_BATCH ? parsed : 1;
}

function isStaleMetadata(value: unknown): value is StaleEvidenceMetadata {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<StaleEvidenceMetadata>;
  return candidate.state === "stale"
    && typeof candidate.generatedAt === "string"
    && typeof candidate.expiresAt === "string";
}

function degradedOf(result: Extract<RatesApiResult, { status: 200 }>): StaleEvidenceMetadata | null {
  if (isStaleMetadata(result.degraded)) return result.degraded;
  if (isStaleMetadata(result.body.degraded)) return result.body.degraded;
  return null;
}

/** Classify one corridor from its rates read result. */
export function classifyCorridorCoverage(
  corridor: PublicCorridor,
  result: RatesApiResult,
): CorridorCoverageRow {
  if (result.status !== 200) {
    return Object.freeze({
      kind: "unavailable",
      corridor,
      state: "rates_unavailable",
      message: result.body.error.message,
    });
  }

  const body = result.body;
  const state: Exclude<CoverageState, "rates_unavailable"> =
    body.sourceCount === 0
      ? "configured_only"
      : body.state === "healthy" && body.medianRate !== null
        ? "eligible_median"
        : "insufficient_fresh";

  return Object.freeze({
    kind: "evaluated",
    corridor,
    state,
    candidateCount: body.reviewedCandidateConfiguration.candidateCount,
    uniqueAnchorCount: body.reviewedCandidateConfiguration.uniqueAnchorCount,
    sourceCount: body.sourceCount,
    freshSourceCount: body.freshSourceCount,
    minimumRequired: body.medianRequirement.minimumFreshIndependentSources,
    // Only an eligible median is shown; a null median is never coerced to 0.
    medianRate: state === "eligible_median" ? body.medianRate : null,
    evaluatedAt: body.evaluatedAt,
    degraded: degradedOf(result),
  });
}

/**
 * Read the corridor directory, then at most one bounded batch of rate reads.
 * A thrown or failed rate read marks only that corridor unavailable.
 */
export async function loadCorridorEvidenceCoverage(
  dependencies: CorridorCoverageDependencies,
  requestedBatch = 1,
  batchSize = CORRIDOR_COVERAGE_BATCH_SIZE,
): Promise<CorridorCoverageReport> {
  let corridorsResult: CorridorsApiResult;
  try {
    corridorsResult = await dependencies.readCorridors();
  } catch {
    return { kind: "corridors_unavailable", message: "Unable to load corridors." };
  }
  if (corridorsResult.status !== 200) {
    return { kind: "corridors_unavailable", message: corridorsResult.body.error.message };
  }

  const corridors = corridorsResult.body.corridors;
  if (corridors.length === 0) return { kind: "empty" };

  const size = Math.max(1, Math.floor(batchSize));
  const batchCount = Math.ceil(corridors.length / size);
  const batch = Math.min(Math.max(1, requestedBatch), batchCount);
  const firstIndex = (batch - 1) * size;
  const selected = corridors.slice(firstIndex, firstIndex + size);

  const rows = await Promise.all(
    selected.map(async (corridor) => {
      try {
        return classifyCorridorCoverage(corridor, await dependencies.readRates(corridor.slug));
      } catch {
        return classifyCorridorCoverage(corridor, {
          status: 500,
          body: { error: { code: "internal_error", message: "Unable to read rates." } },
        });
      }
    }),
  );

  return {
    kind: "ready",
    rows,
    totalCorridors: corridors.length,
    batch,
    batchCount,
    batchSize: size,
    firstIndex,
  };
}

export const COVERAGE_STATE_LABEL: Readonly<Record<CoverageState, string>> = Object.freeze({
  configured_only: "Configured only",
  insufficient_fresh: "Stored, insufficient fresh sources",
  eligible_median: "Eligible median",
  rates_unavailable: "Rate API unavailable",
});
