import { snapshotReviewedLiveRates } from "@/lib/rates/snapshotRun";
import {
  evaluatePersistedAnchorReputations,
  type ReputationEvaluationRunSummary,
} from "@/lib/reputation/run";
import { classifyPermanentScheduledFailure } from "@/lib/scheduled/suppression";
import {
  PRISMA_SUPPRESSION_REPOSITORY,
  type SuppressionRepository,
} from "@/lib/scheduled/suppressionRepository";
import type { SafeLiveRateRunSummary } from "@/types/liveRateSource";
import type { ScheduledRateFailure, ScheduledRefreshResult } from "@/types/scheduled";
import { randomUUID } from "node:crypto";

export type ScheduledRefreshDependencies = Readonly<{
  snapshotRates: () => Promise<SafeLiveRateRunSummary>;
  evaluateReputation: (options: Readonly<{ evaluatedAt: Date }>) => Promise<ReputationEvaluationRunSummary>;
  suppressions?: SuppressionRepository;
  now: () => Date;
  runId?: string;
  attempt?: number;
}>;

/**
 * Executes one scheduler cycle. Rate ingestion intentionally precedes reputation
 * evaluation so the evaluation can use observations written in the same run.
 * A rate preparation failure is isolated; a fatal reputation-run failure reaches
 * the HTTP boundary as a safe 500 response.
 */
export async function runScheduledRefresh(
  dependencies: ScheduledRefreshDependencies = DEFAULT_DEPENDENCIES,
): Promise<ScheduledRefreshResult> {
  const startedAt = dependencies.now();
  const runId = dependencies.runId ?? randomUUID();
  const attempt = dependencies.attempt ?? 1;
  let rates: ScheduledRefreshResult["rates"];

  try {
    const summary = await dependencies.snapshotRates();
    await recordPermanentFailures(
      summary,
      dependencies.suppressions ?? PRISMA_SUPPRESSION_REPOSITORY,
      startedAt,
    );
    rates = toScheduledRates(summary);
  } catch {
    rates = preparationFailure();
  }

  const reputation = await dependencies.evaluateReputation({ evaluatedAt: startedAt });
  const completedAt = dependencies.now();

  return Object.freeze({
    ok: rates.failed === 0 && reputation.failed === 0,
    runId,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
    attempt,
    rates,
    reputation: Object.freeze({
      attempted: reputation.attempted,
      succeeded: reputation.succeeded,
      failed: reputation.failed,
      failures: Object.freeze(reputation.failures.map((failure) => Object.freeze({
        anchorSlug: failure.anchorSlug,
        code: failure.code,
      }))),
    }),
  });
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  snapshotRates: snapshotReviewedLiveRates,
  evaluateReputation: evaluatePersistedAnchorReputations,
  now: () => new Date(),
}) satisfies ScheduledRefreshDependencies;

function toScheduledRates(summary: SafeLiveRateRunSummary): ScheduledRefreshResult["rates"] {
  return Object.freeze({
    attempted: summary.totalAttempted,
    succeeded: summary.succeeded,
    failed: summary.failed,
    skipped: summary.skipped,
    ...(summary.suppressed && summary.suppressed > 0
      ? { suppressed: summary.suppressed }
      : {}),
    failures: Object.freeze(summary.failures.map((failure) => Object.freeze({ ...failure }))),
  });
}

async function recordPermanentFailures(
  summary: SafeLiveRateRunSummary,
  repository: SuppressionRepository,
  observedAt: Date,
): Promise<void> {
  for (const failure of summary.failures) {
    const reason = classifyPermanentScheduledFailure(failure);
    if (!reason) continue;

    await repository.recordDeterministicFailure({
      anchorSlug: failure.anchorSlug,
      corridorSlug: failure.corridorSlug,
      reason,
      failureCode: failure.code,
      failurePhase: failure.phase,
      observedAt,
    });
  }
}

function preparationFailure(): ScheduledRefreshResult["rates"] {
  const failure: ScheduledRateFailure = Object.freeze({
    phase: "PREPARATION",
    code: "LIVE_RATE_PREPARATION_FAILURE",
  });
  return Object.freeze({
    attempted: 0,
    succeeded: 0,
    failed: 1,
    skipped: 0,
    failures: Object.freeze([failure]),
  });
}
