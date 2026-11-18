import {
  RATE_CAPTURE_SOURCE_TYPE,
  SEP38_INDICATIVE_REQUEST_SHAPE_VERSION,
} from "@/constants/rateProvenance";
import { normalizeIndicativeRate, RateNormalizationError } from "@/lib/rates/normalize";
import {
  buildRateSnapshotProvenance,
  mintRateCaptureRunId,
  RateSnapshotProvenanceError,
} from "@/lib/rates/provenance";
import { persistRateSnapshot } from "@/lib/rates/snapshot";
import type {
  RateCandidate,
  RateEngineFailure,
  RateEngineResult,
  RateEngineSkippedSource,
  RateQuoteProvider,
  RateSnapshotRepository,
} from "@/types/rates";

export async function runRateEngine(
  candidates: readonly RateCandidate[],
  dependencies: Readonly<{
    quote: RateQuoteProvider;
    repository: RateSnapshotRepository;
    now?: () => Date;
    /**
     * Capture-run identity persisted with every snapshot of this run. A
     * fresh UUID is minted when omitted so each engine run is distinguishable.
     */
    captureRunId?: string;
  }>,
): Promise<RateEngineResult> {
  const captureRunId = dependencies.captureRunId ?? mintRateCaptureRunId();
  const seen = new Set<string>();
  const snapshots: RateEngineResult["snapshots"][number][] = [];
  const failures: RateEngineFailure[] = [];
  const skippedSources: RateEngineSkippedSource[] = [];
  let totalAttempted = 0;

  for (const candidate of candidates) {
    const key = `${candidate.anchorSlug}\0${candidate.corridor.slug}`;
    if (seen.has(key)) {
      skippedSources.push(Object.freeze({
        anchorSlug: candidate.anchorSlug,
        corridorSlug: candidate.corridor.slug,
        reason: "DUPLICATE_CANDIDATE",
      }));
      continue;
    }
    seen.add(key);
    totalAttempted += 1;

    let quote;
    try {
      quote = await dependencies.quote(candidate);
    } catch {
      failures.push(engineFailure(candidate, "QUOTE", "QUOTE_FAILURE"));
      continue;
    }

    let observation;
    let provenance;
    try {
      observation = normalizeIndicativeRate({
        anchorSlug: candidate.anchorSlug,
        corridor: candidate.corridor,
        request: candidate.request,
        quote,
        capturedAt: dependencies.now?.() ?? new Date(),
      });
      // Capture-time provenance (#113): built here, from the candidate and
      // observation actually used, so it is never reconstructed later. A
      // candidate whose lineage cannot be recorded truthfully never becomes a
      // snapshot row; it fails closed like a normalization error.
      provenance = buildRateSnapshotProvenance({
        captureRunId,
        sourceType: RATE_CAPTURE_SOURCE_TYPE,
        requestShapeVersion: SEP38_INDICATIVE_REQUEST_SHAPE_VERSION,
        anchorSlug: candidate.anchorSlug,
        corridorSlug: candidate.corridor.slug,
        configurationDigest: candidate.configurationDigest,
        capturedAt: observation.capturedAt,
      });
    } catch (error) {
      failures.push(engineFailure(
        candidate,
        "NORMALIZATION",
        error instanceof RateNormalizationError
          ? error.code
          : error instanceof RateSnapshotProvenanceError
            ? error.code
            : "NORMALIZATION_FAILURE",
      ));
      continue;
    }

    const persisted = await persistRateSnapshot(observation, provenance, dependencies.repository);
    if (!persisted.ok) {
      failures.push(engineFailure(candidate, "PERSISTENCE", persisted.code));
      continue;
    }
    snapshots.push(persisted.snapshot);
  }

  return Object.freeze({
    captureRunId,
    totalCandidates: candidates.length,
    totalAttempted,
    succeeded: snapshots.length,
    failed: failures.length,
    skipped: skippedSources.length,
    snapshotsPersisted: snapshots.length,
    snapshots: Object.freeze(snapshots),
    failures: Object.freeze(failures),
    skippedSources: Object.freeze(skippedSources),
  });
}

function engineFailure(
  candidate: RateCandidate,
  phase: RateEngineFailure["phase"],
  code: string,
): RateEngineFailure {
  return Object.freeze({
    anchorSlug: candidate.anchorSlug,
    corridorSlug: candidate.corridor.slug,
    phase,
    code,
  });
}
