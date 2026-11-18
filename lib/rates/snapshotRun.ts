import { REVIEWED_LIVE_RATE_SOURCES } from "@/constants/liveRateSources";
import { assertCurrentStellarCoreConfiguration } from "@/lib/config/currentStellarCoreConfiguration";
import {
  buildReviewedLiveRateCandidates,
  fetchReviewedIndicativeRate,
  formatLiveRateRunSummary,
} from "@/lib/rates/liveRateSource";
import { runRateEngine } from "@/lib/rates/rateEngine";
import { PRISMA_RATE_SNAPSHOT_REPOSITORY } from "@/lib/rates/snapshot";
import { PRISMA_SUPPRESSION_REPOSITORY } from "@/lib/scheduled/suppressionRepository";
import type {
  PreparedLiveRateCandidate,
  ReviewedLiveRateSource,
  SafeLiveRateRunSummary,
} from "@/types/liveRateSource";
import type { ScheduledSourceIdentity } from "@/types/suppression";

export type SnapshotReviewedLiveRatesDependencies = Readonly<{
  assertConfiguration: () => void;
  buildCandidates: (
    sources?: readonly ReviewedLiveRateSource[],
  ) => Promise<readonly PreparedLiveRateCandidate[]>;
  listSuppressed?: () => Promise<readonly ScheduledSourceIdentity[]>;
  executeCandidates: (
    candidates: readonly PreparedLiveRateCandidate[],
  ) => Promise<SafeLiveRateRunSummary>;
}>;

/**
 * Runs the reviewed production rate-source boundary once. This is intentionally
 * shared by the CLI and the authenticated scheduler so they cannot drift.
 */
export async function snapshotReviewedLiveRates(
  dependencies: SnapshotReviewedLiveRatesDependencies = DEFAULT_DEPENDENCIES,
): Promise<SafeLiveRateRunSummary> {
  dependencies.assertConfiguration();

  const suppressed = await (
    dependencies.listSuppressed ??
    (async () => Object.freeze([] as ScheduledSourceIdentity[]))
  )();
  const suppressedKeys = new Set(
    suppressed.map(({ anchorSlug, corridorSlug }) =>
      `${anchorSlug}\0${corridorSlug}`),
  );
  const eligibleSources = REVIEWED_LIVE_RATE_SOURCES.filter(
    ({ anchorSlug, corridorSlug }) =>
      !suppressedKeys.has(`${anchorSlug}\0${corridorSlug}`),
  );

  const candidates = await dependencies.buildCandidates(eligibleSources);
  const summary = await dependencies.executeCandidates(candidates);
  if (suppressed.length === 0) return summary;

  return Object.freeze({
    ...summary,
    totalCandidates: summary.totalCandidates + suppressed.length,
    suppressed: suppressed.length,
  });
}

const DEFAULT_DEPENDENCIES = Object.freeze({
  assertConfiguration: assertCurrentStellarCoreConfiguration,
  buildCandidates: buildReviewedLiveRateCandidates,
  listSuppressed: PRISMA_SUPPRESSION_REPOSITORY.listSuppressed,
  executeCandidates: async (candidates) => formatLiveRateRunSummary(
    await runRateEngine(candidates, {
      quote: fetchReviewedIndicativeRate,
      repository: PRISMA_RATE_SNAPSHOT_REPOSITORY,
    }),
  ),
}) satisfies SnapshotReviewedLiveRatesDependencies;
