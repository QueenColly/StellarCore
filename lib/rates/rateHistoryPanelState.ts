import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

/**
 * Refresh state for the corridor rate-history panel.
 *
 * `displayed` is always the latest *successful* response. A failed refresh never
 * replaces or clears it; instead it records `failure`, and the panel keeps
 * showing the retained data labelled with its own window and evaluation time.
 * `selectedDays` falls back to the displayed window after a failure, so the
 * controls never claim a window that is not on screen and the failed window can
 * be retried. A later success replaces the retained data and clears the failure.
 */
export type RateHistoryRefreshFailure = Readonly<{
  message: string;
  requestedDays: number;
  failedAt: string;
}>;

export type RateHistoryPanelState = Readonly<{
  displayed: PublicRateHistoryResponse;
  selectedDays: number;
  loading: boolean;
  failure: RateHistoryRefreshFailure | null;
}>;

export type RateHistoryPanelEvent =
  | Readonly<{ type: "refresh_started"; days: number }>
  | Readonly<{ type: "refresh_succeeded"; history: PublicRateHistoryResponse }>
  | Readonly<{ type: "refresh_failed"; message: string; days: number; failedAt: string }>;

export function initialRateHistoryPanelState(history: PublicRateHistoryResponse): RateHistoryPanelState {
  return { displayed: history, selectedDays: history.windowDays, loading: false, failure: null };
}

export function rateHistoryPanelReducer(
  state: RateHistoryPanelState,
  event: RateHistoryPanelEvent,
): RateHistoryPanelState {
  switch (event.type) {
    case "refresh_started":
      // Keep any earlier failure visible until this attempt settles.
      return { ...state, selectedDays: event.days, loading: true };
    case "refresh_succeeded":
      return {
        displayed: event.history,
        selectedDays: event.history.windowDays,
        loading: false,
        failure: null,
      };
    case "refresh_failed":
      return {
        displayed: state.displayed,
        selectedDays: state.displayed.windowDays,
        loading: false,
        failure: { message: event.message, requestedDays: event.days, failedAt: event.failedAt },
      };
  }
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Human-readable age of retained data, e.g. "3 minutes old". */
export function describeDataAge(evaluatedAt: string, now: Date): string {
  const evaluatedMs = new Date(evaluatedAt).getTime();
  if (!Number.isFinite(evaluatedMs)) return "of unknown age";
  const ageMs = now.getTime() - evaluatedMs;
  if (ageMs < MINUTE_MS) return "less than a minute old";
  const [value, unit] =
    ageMs < HOUR_MS
      ? [Math.floor(ageMs / MINUTE_MS), "minute"]
      : ageMs < DAY_MS
        ? [Math.floor(ageMs / HOUR_MS), "hour"]
        : [Math.floor(ageMs / DAY_MS), "day"];
  return `${value} ${unit}${value === 1 ? "" : "s"} old`;
}
