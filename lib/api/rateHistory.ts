import { readCorridorRateHistory } from "@/lib/rates/rateHistoryReadModel";
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
import type {
  CorridorRateHistory,
  CorridorRateHistoryReadResult,
} from "@/types/rateHistory";
import type {
  PublicRateHistoryObservation,
  PublicRateHistoryPoint,
  PublicRateHistoryResponse,
  RateHistoryApiResult,
} from "@/types/api/rateHistory";

const MAX_CORRIDOR_SLUG_LENGTH = 100;
const CORRIDOR_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MIN_DAYS = 1;
const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

export type RateHistoryApiDependencies = Readonly<{
  readHistory?: (
    corridorSlug: string,
    options: Readonly<{ evaluatedAt: Date; days: number }>,
  ) => Promise<CorridorRateHistoryReadResult>;
  now?: () => Date;
  staleEvidenceStore?: StaleEvidenceStore;
  reportError?: PublicApiErrorReporter;
  signal?: AbortSignal;
}>;

export async function getRateHistoryApiResult(
  corridorParameter: string | readonly string[] | null,
  daysParameter: string | readonly string[] | null = null,
  dependencies: RateHistoryApiDependencies = {},
): Promise<RateHistoryApiResult> {
  const corridorValidation = validateCorridorParameter(corridorParameter);
  if (!corridorValidation.ok) return corridorValidation.result;

  const daysValidation = validateDaysParameter(daysParameter);
  if (!daysValidation.ok) return daysValidation.result;

  const evaluatedAt = dependencies.now?.() ?? new Date();
  const store = dependencies.staleEvidenceStore ?? FILE_STALE_EVIDENCE_STORE;
  const snapshotKey = `rate-history:v1:${corridorValidation.corridorSlug}:${daysValidation.days}`;
  const read = dependencies.readHistory ?? readCorridorRateHistory;
  let result: CorridorRateHistoryReadResult;

  try {
    result = await read(corridorValidation.corridorSlug, {
      evaluatedAt,
      days: daysValidation.days,
    });
  } catch (error) {
    if (dependencies.signal?.aborted) {
      throw dependencies.signal.reason ?? new Error("The operation was aborted");
    }
    if (isTransientDatabaseFailure(error)) {
      const stale = await restoreStaleEvidence(store, snapshotKey, evaluatedAt);
      if (stale) {
        return Object.freeze({
          status: 200,
          body: stale.body as unknown as PublicRateHistoryResponse,
          degraded: stale.metadata,
        });
      }
    }
    reportError(dependencies, error, "rate-history.read");
    return publicApiErrorResult("internal_error", "Unable to read rate history.");
  }

  if (dependencies.signal?.aborted) {
    throw dependencies.signal.reason ?? new Error("The operation was aborted");
  }

  if (!result.ok) {
    if (result.code === "CORRIDOR_NOT_FOUND") {
      return publicApiErrorResult("corridor_not_found", "Corridor not found.");
    }
    if (result.code === "INVALID_WINDOW") {
      return publicApiErrorResult(
        "invalid_days",
        `The days parameter must be an integer between ${MIN_DAYS} and ${MAX_DAYS}.`,
      );
    }
    if (result.code === "DATABASE_UNAVAILABLE") {
      const stale = await restoreStaleEvidence(store, snapshotKey, evaluatedAt);
      if (stale) {
        return Object.freeze({
          status: 200,
          body: stale.body as unknown as PublicRateHistoryResponse,
          degraded: stale.metadata,
        });
      }
    }
    return publicApiErrorResult("internal_error", "Unable to read rate history.");
  }

  try {
    const body = serializeRateHistory(result);
    const sourceTimes = body.points
      .flatMap(({ observations }) => observations.map(({ capturedAt }) => capturedAt))
      .filter(isValidTimestamp);
    await saveLastKnownGoodEvidence(store, snapshotKey, body, sourceTimes, evaluatedAt);
    return Object.freeze({ status: 200, body });
  } catch (error) {
    reportError(dependencies, error, "rate-history.serialize");
    return publicApiErrorResult("internal_error", "Unable to read rate history.");
  }
}

function isValidTimestamp(value: string): boolean {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function serializeRateHistory(
  result: CorridorRateHistory,
): PublicRateHistoryResponse {
  const points = Object.freeze(
    result.points.map((point) => {
      const observations = Object.freeze(
        point.observations.map(
          (obs) =>
            Object.freeze({
              anchor: Object.freeze({
                slug: obs.anchorSlug,
                name: obs.anchorName,
              }),
              rate: obs.rate,
              sourceAmount: obs.sourceAmount,
              destinationAmount: obs.destinationAmount,
              fee: obs.fee,
              capturedAt: obs.capturedAt,
            }) satisfies PublicRateHistoryObservation,
        ),
      );

      return Object.freeze({
        timestamp: point.timestamp,
        medianRate: point.medianRate,
        state: point.state,
        sourceCount: point.sourceCount,
        freshSourceCount: point.freshSourceCount,
        observations,
      }) satisfies PublicRateHistoryPoint;
    }),
  );

  return Object.freeze({
    corridor: Object.freeze({
      slug: result.corridor.slug,
      sourceAsset: result.corridor.sourceAsset,
      sourceCountry: result.corridor.sourceCountry,
      destinationAsset: result.corridor.destinationAsset,
      destinationCountry: result.corridor.destinationCountry,
    }),
    evaluatedAt: result.evaluatedAt,
    windowDays: result.windowDays,
    points,
  });
}

function validateCorridorParameter(
  value: string | readonly string[] | null,
):
  | Readonly<{ ok: true; corridorSlug: string }>
  | Readonly<{ ok: false; result: RateHistoryApiResult }> {
  if (value === null || value === "") {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult("missing_corridor", "A corridor slug is required."),
    });
  }

  if (typeof value !== "string") {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult("invalid_corridor", "The corridor slug is invalid."),
    });
  }

  if (
    value.length > MAX_CORRIDOR_SLUG_LENGTH ||
    !CORRIDOR_SLUG_PATTERN.test(value)
  ) {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult("invalid_corridor", "The corridor slug is invalid."),
    });
  }

  return Object.freeze({ ok: true, corridorSlug: value });
}

function validateDaysParameter(
  value: string | readonly string[] | null,
):
  | Readonly<{ ok: true; days: number }>
  | Readonly<{ ok: false; result: RateHistoryApiResult }> {
  if (value === null || value === "") {
    return Object.freeze({ ok: true, days: DEFAULT_DAYS });
  }

  if (typeof value !== "string") {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult(
        "invalid_days",
        `The days parameter must be an integer between ${MIN_DAYS} and ${MAX_DAYS}.`,
      ),
    });
  }

  if (!/^\d+$/.test(value)) {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult(
        "invalid_days",
        `The days parameter must be an integer between ${MIN_DAYS} and ${MAX_DAYS}.`,
      ),
    });
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
    return Object.freeze({
      ok: false,
      result: publicApiErrorResult(
        "invalid_days",
        `The days parameter must be an integer between ${MIN_DAYS} and ${MAX_DAYS}.`,
      ),
    });
  }

  return Object.freeze({ ok: true, days: parsed });
}

function reportError(
  dependencies: RateHistoryApiDependencies,
  error: unknown,
  operation: string,
): void {
  (dependencies.reportError ?? consolePublicApiErrorReporter)(error, {
    operation,
    code: "internal_error",
  });
}
