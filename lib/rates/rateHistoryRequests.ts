import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

export const RATE_HISTORY_REQUEST_TIMEOUT_MS = 10_000;

const DEFAULT_ERROR_MESSAGE = "Unable to load rate history.";
const TIMEOUT_ERROR_MESSAGE = "Rate history request timed out.";
const MISMATCH_ERROR_MESSAGE = "Rate history response did not match the requested window.";
const MALFORMED_ERROR_MESSAGE = DEFAULT_ERROR_MESSAGE;

/** Windows offered by the chart; a 200 echoing any other value is not usable. */
const SUPPORTED_WINDOW_DAYS: ReadonlySet<number> = new Set([7, 30, 90]);

type FetchLike = (input: string, init: { signal: AbortSignal }) => Promise<Response>;
type UnknownRecord = Readonly<Record<string, unknown>>;
type RateHistoryValidation = "valid" | "mismatch" | "malformed";

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHistoryObservation(value: unknown): boolean {
  // Only the fields the chart reads from an observation are checked here.
  return (
    isRecord(value) &&
    isRecord(value.anchor) &&
    typeof value.anchor.name === "string" &&
    typeof value.rate === "string"
  );
}

function isHistoryPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.timestamp === "string" &&
    value.timestamp.length > 0 &&
    (value.medianRate === null || typeof value.medianRate === "string") &&
    (value.state === "healthy" || value.state === "insufficient_fresh_sources") &&
    typeof value.sourceCount === "number" &&
    Number.isInteger(value.sourceCount) &&
    value.sourceCount >= 0 &&
    typeof value.freshSourceCount === "number" &&
    Number.isInteger(value.freshSourceCount) &&
    value.freshSourceCount >= 0 &&
    Array.isArray(value.observations) &&
    value.observations.every(isHistoryObservation)
  );
}

/**
 * Validates only the response fields consumed by the chart. A genuine empty
 * points array, a null median, and zero observations are all valid evidence.
 */
function validateRateHistoryResponse(
  value: unknown,
  corridorSlug: string,
  days: number,
): RateHistoryValidation {
  if (!isRecord(value) || !isRecord(value.corridor)) return "mismatch";
  if (
    value.corridor.slug !== corridorSlug ||
    value.windowDays !== days ||
    !Array.isArray(value.points)
  ) {
    return "mismatch";
  }
  if (
    !SUPPORTED_WINDOW_DAYS.has(days) ||
    typeof value.evaluatedAt !== "string" ||
    value.evaluatedAt.length === 0 ||
    !value.points.every(isHistoryPoint)
  ) {
    return "malformed";
  }
  return "valid";
}

export type RateHistoryLoaderCallbacks = Readonly<{
  onSuccess: (history: PublicRateHistoryResponse, days: number) => void;
  onError: (message: string, days: number) => void;
}>;

export type RateHistoryLoaderOptions = Readonly<{
  corridorSlug: string;
  callbacks: RateHistoryLoaderCallbacks;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}>;

export type RateHistoryLoader = Readonly<{
  load: (days: number) => Promise<void>;
  dispose: () => void;
}>;

/**
 * Sequences client-side rate-history requests for one chart panel.
 *
 * Only the most recent `load` may report a result: starting a new request aborts
 * the previous one, and any response that still arrives late is discarded by its
 * sequence number. Every active request settles with exactly one callback —
 * success, error, or timeout — so the caller's loading state cannot hang.
 */
export function createRateHistoryLoader(options: RateHistoryLoaderOptions): RateHistoryLoader {
  const {
    corridorSlug,
    callbacks,
    fetchImpl = (input, init) => fetch(input, init),
    timeoutMs = RATE_HISTORY_REQUEST_TIMEOUT_MS,
    setTimer = (callback, ms) => setTimeout(callback, ms),
    clearTimer = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  } = options;

  let sequence = 0;
  let activeController: AbortController | null = null;
  let disposed = false;

  async function load(days: number): Promise<void> {
    if (disposed) return;

    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestId = ++sequence;
    const isCurrent = () => !disposed && requestId === sequence;

    let timedOut = false;
    const timer = setTimer(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(
        `/api/rates/history?corridor=${encodeURIComponent(corridorSlug)}&days=${days}`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error?.message ?? DEFAULT_ERROR_MESSAGE);
      }
      let data: unknown;
      try {
        data = await response.json();
      } catch {
        throw new Error(MALFORMED_ERROR_MESSAGE);
      }
      if (!isCurrent()) return;

      const validation = validateRateHistoryResponse(data, corridorSlug, days);
      if (validation === "mismatch") {
        throw new Error(MISMATCH_ERROR_MESSAGE);
      }
      if (validation === "malformed") {
        throw new Error(MALFORMED_ERROR_MESSAGE);
      }
      callbacks.onSuccess(data as PublicRateHistoryResponse, days);
    } catch (err) {
      if (!isCurrent()) return;
      if (timedOut) {
        callbacks.onError(TIMEOUT_ERROR_MESSAGE, days);
        return;
      }
      callbacks.onError(err instanceof Error && err.message ? err.message : DEFAULT_ERROR_MESSAGE, days);
    } finally {
      clearTimer(timer);
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function dispose() {
    disposed = true;
    activeController?.abort();
    activeController = null;
  }

  return { load, dispose };
}
