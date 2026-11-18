import { isValidAnchorSlug } from "@/lib/api/anchors";
import {
  FILE_STALE_EVIDENCE_STORE,
  restoreStaleEvidence,
  saveLastKnownGoodEvidence,
  type StaleEvidenceStore,
} from "@/lib/api/staleEvidence";
import { isTransientDatabaseFailure } from "@/lib/databaseErrors";
import {
  consolePublicApiErrorReporter,
  publicApiErrorResult,
  type PublicApiErrorReporter,
} from "@/lib/api/errors";
import {
  PRISMA_REPUTATION_API_REPOSITORY,
  type ReputationApiAnchorRecord,
  type ReputationApiRepository,
} from "@/lib/api/reputationRepository";
import type {
  PublicReputation,
  PublicReputationDetailResponse,
  PublicReputationListResponse,
  PublicReputationScoreBand,
  PublicReputationState,
  ReputationApiDetailResult,
  ReputationApiListResult,
} from "@/types/api/reputation";

export type ReputationApiDependencies = Readonly<{
  repository?: ReputationApiRepository;
  staleEvidenceStore?: StaleEvidenceStore;
  now?: () => Date;
  reportError?: PublicApiErrorReporter;
  signal?: AbortSignal;
}>;

export async function getReputationApiResult(
  dependencies: ReputationApiDependencies = {},
): Promise<ReputationApiListResult> {
  const now = dependencies.now?.() ?? new Date();
  const store = dependencies.staleEvidenceStore ?? FILE_STALE_EVIDENCE_STORE;
  const key = "reputation-list:v1";
  try {
    const repository = dependencies.repository ?? PRISMA_REPUTATION_API_REPOSITORY;
    const body = serializeReputationList(await repository.findAll());
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new Error("The operation was aborted");
    }
    await saveLastKnownGoodEvidence(store, key, body, reputationSourceTimes(body.reputation), now);
    return Object.freeze({ status: 200, body });
  } catch (error) {
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new Error("The operation was aborted");
    }
    if (isTransientDatabaseFailure(error)) {
      const stale = await restoreStaleEvidence(store, key, now);
      if (stale) {
        return Object.freeze({
          status: 200,
          body: stale.body as unknown as PublicReputationListResponse,
          degraded: stale.metadata,
        });
      }
    }
    reportError(dependencies, error, "reputation.list");
    return publicApiErrorResult("internal_error", "Unable to load reputation.");
  }
}

export async function getAnchorReputationApiResult(
  slug: string,
  dependencies: ReputationApiDependencies = {},
): Promise<ReputationApiDetailResult> {
  if (!isValidAnchorSlug(slug)) {
    return publicApiErrorResult(
      "invalid_anchor_slug",
      "A valid anchor slug is required.",
    );
  }

  const now = dependencies.now?.() ?? new Date();
  const store = dependencies.staleEvidenceStore ?? FILE_STALE_EVIDENCE_STORE;
  const key = `reputation-detail:v1:${slug}`;
  try {
    const repository = dependencies.repository ?? PRISMA_REPUTATION_API_REPOSITORY;
    const record = await repository.findBySlug(slug);
    if (!record) {
      return publicApiErrorResult("anchor_not_found", "Anchor not found.");
    }
    const body = Object.freeze({ reputation: serializeReputation(record) });
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new Error("The operation was aborted");
    }
    await saveLastKnownGoodEvidence(store, key, body, reputationSourceTimes([body.reputation]), now);
    return Object.freeze({
      status: 200,
      body,
    });
  } catch (error) {
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new Error("The operation was aborted");
    }
    if (isTransientDatabaseFailure(error)) {
      const stale = await restoreStaleEvidence(store, key, now);
      if (stale) {
        return Object.freeze({
          status: 200,
          body: stale.body as unknown as PublicReputationDetailResponse,
          degraded: stale.metadata,
        });
      }
    }
    reportError(dependencies, error, "reputation.detail");
    return publicApiErrorResult("internal_error", "Unable to load reputation.");
  }
}

function reputationSourceTimes(records: readonly PublicReputation[]): readonly string[] {
  return records
    .map(({ computedAt }) => computedAt)
    .filter((value): value is string => value !== null && isValidTimestamp(value));
}

function isValidTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function serializeReputationList(
  records: readonly ReputationApiAnchorRecord[],
): PublicReputationListResponse {
  const reputation = Object.freeze([...records]
    .sort((left, right) => left.slug.localeCompare(right.slug))
    .map(serializeReputation));
  return Object.freeze({ reputation, count: reputation.length });
}

export function serializeReputation(record: ReputationApiAnchorRecord): PublicReputation {
  const anchor = Object.freeze({ slug: record.slug, name: record.name });
  const persisted = record.reputationScore;
  if (!persisted) {
    return Object.freeze({
      anchor,
      state: "not_evaluated",
      score: null,
      scoreBand: null,
      evidence: null,
      metrics: null,
      computedAt: null,
    });
  }

  return Object.freeze({
    anchor,
    state: publicState(persisted.state),
    score: safeScore(persisted.compositeScore),
    scoreBand: publicScoreBand(persisted.scoreBand),
    evidence: Object.freeze({ outcomeCount: persisted.sampleSize }),
    metrics: Object.freeze({
      fillRate7d: safeNumber(persisted.fillRate7d),
      fillRate30d: safeNumber(persisted.fillRate30d),
      fillRate90d: safeNumber(persisted.fillRate90d),
      settleP50Ms: safeNumber(persisted.settleP50Ms),
      settleP95Ms: safeNumber(persisted.settleP95Ms),
      slippageP50: safeNumber(persisted.slippageP50),
      slippageP95: safeNumber(persisted.slippageP95),
    }),
    computedAt: persisted.computedAt.toISOString(),
  });
}

function publicState(state: "INSUFFICIENT_DATA" | "OK"): PublicReputationState {
  return state === "OK" ? "established" : "insufficient_evidence";
}

function publicScoreBand(
  scoreBand: "GREEN" | "AMBER" | "RED" | null,
): PublicReputationScoreBand | null {
  return scoreBand?.toLowerCase() as PublicReputationScoreBand | undefined ?? null;
}

function safeScore(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : null;
}

function safeNumber(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

function reportError(
  dependencies: ReputationApiDependencies,
  error: unknown,
  operation: string,
): void {
  (dependencies.reportError ?? consolePublicApiErrorReporter)(error, {
    operation,
    code: "internal_error",
  });
}
