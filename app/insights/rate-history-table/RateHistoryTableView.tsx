"use client";

import { useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import {
  createRateHistoryLoader,
  type RateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  describeDataAge,
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import type {
  PublicRateHistoryResponse,
} from "@/types/api/rateHistory";
import type { PublicCorridor } from "@/types/api/corridors";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  initialHistory: PublicRateHistoryResponse | null;
  selectedCorridorSlug: string;
  initialError?: string | null;
}>;

const TIMEFRAME_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

export function RateHistoryTableView({
  corridors,
  initialHistory,
  selectedCorridorSlug,
  initialError = null,
}: Props) {
  const [panel, dispatch] = useReducer(
    rateHistoryPanelReducer,
    initialHistory ?? {
      corridor: {
        slug: selectedCorridorSlug,
        sourceAsset: "",
        sourceCountry: "",
        destinationAsset: "",
        destinationCountry: "",
      },
      evaluatedAt: new Date(0).toISOString(),
      windowDays: 30,
      points: [],
    },
    initialRateHistoryPanelState,
  );

  const { displayed: history, selectedDays, loading, failure } = panel;
  const loaderRef = useRef<RateHistoryLoader | null>(null);

  useEffect(() => {
    if (!selectedCorridorSlug) return;

    const loader = createRateHistoryLoader({
      corridorSlug: selectedCorridorSlug,
      callbacks: {
        onSuccess: (data) => {
          dispatch({ type: "refresh_succeeded", history: data });
        },
        onError: (message, days) => {
          dispatch({
            type: "refresh_failed",
            message,
            days,
            failedAt: new Date().toISOString(),
          });
        },
      },
    });

    loaderRef.current = loader;

    return () => {
      loader.dispose();
      if (loaderRef.current === loader) {
        loaderRef.current = null;
      }
    };
  }, [selectedCorridorSlug]);

  function handleTimeframeChange(days: number) {
    if (days === selectedDays) return;
    dispatch({ type: "refresh_started", days });
    void loaderRef.current?.load(days);
  }

  const selectedCorridor = corridors.find((c) => c.slug === selectedCorridorSlug);
  const currencyPairLabel = selectedCorridor
    ? `${selectedCorridor.sourceAsset} (${selectedCorridor.sourceCountry}) → ${selectedCorridor.destinationAsset} (${selectedCorridor.destinationCountry})`
    : history.corridor.sourceAsset && history.corridor.destinationAsset
      ? `${history.corridor.sourceAsset} (${history.corridor.sourceCountry}) → ${history.corridor.destinationAsset} (${history.corridor.destinationCountry})`
      : selectedCorridorSlug;

  const isDegraded = Boolean(history.degraded);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div>
          <label
            htmlFor="corridor-select"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed Corridor
          </label>
          <div className="mt-1 flex items-center gap-2">
            <select
              id="corridor-select"
              aria-label="Select reviewed corridor"
              className="rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
              value={selectedCorridorSlug}
              onChange={(e) => {
                const nextSlug = e.target.value;
                if (nextSlug && nextSlug !== selectedCorridorSlug) {
                  window.location.href = `/insights/rate-history-table?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
                }
              }}
            >
              {corridors.length === 0 ? (
                <option value="">No corridors available</option>
              ) : (
                corridors.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.sourceAsset} ({c.sourceCountry}) → {c.destinationAsset} ({c.destinationCountry}) [{c.slug}]
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div>
          <span
            id="timeframe-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Time Window
          </span>
          <div
            role="group"
            aria-labelledby="timeframe-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {TIMEFRAME_OPTIONS.map(({ label, days }) => {
              const isActive = selectedDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={isActive}
                  aria-label={`View ${label} rate history`}
                  onClick={() => handleTimeframeChange(days)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    isActive
                      ? "bg-[var(--surface)] text-[var(--white)]"
                      : "text-[var(--muted)] hover:text-[var(--white)]"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {loading ? (
        <div
          role="status"
          aria-live="polite"
          data-testid="rate-history-table-loading"
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]"
        >
          <p className="animate-pulse">Loading rate history observations…</p>
        </div>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="rate-history-table-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Unable to refresh rate history: {failure.message}</p>
            <button
              type="button"
              onClick={() => handleTimeframeChange(failure.requestedDays)}
              className="rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] hover:bg-[rgba(238,143,129,0.2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Retry
            </button>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Still showing the last successful {history.windowDays}-day data ({describeDataAge(history.evaluatedAt, new Date())}).
          </p>
        </div>
      ) : initialError ? (
        <div
          role="alert"
          data-testid="rate-history-table-initial-error"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <span>{initialError}</span>
          <button
            type="button"
            onClick={() => handleTimeframeChange(history.windowDays)}
            className="rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] hover:bg-[rgba(238,143,129,0.2)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Retry request
          </button>
        </div>
      ) : null}

      {isDegraded ? (
        <div
          role="status"
          data-testid="rate-history-table-degraded"
          className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
        >
          <p className="font-medium">
            Displaying verified stale history snapshot from {new Date(history.evaluatedAt).toLocaleString()} due to temporary database unavailability.
          </p>
        </div>
      ) : null}

      {!initialHistory && !history.points.length && initialError ? null : (
        <section
          aria-labelledby="table-summary-heading"
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">Selected Corridor</p>
              <h2
                id="table-summary-heading"
                className="mt-1 text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {currencyPairLabel}
              </h2>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <span className="font-medium text-[var(--white)]">{history.windowDays}-day</span> window · {history.points.length} {history.points.length === 1 ? "history point" : "history points"}
            </div>
          </div>

          {history.points.length === 0 ? (
            <div
              role="status"
              data-testid="rate-history-table-empty"
              className="p-12 text-center text-sm text-[var(--muted)]"
            >
              No rate observations are currently persisted for this corridor in the selected {history.windowDays}-day window.
            </div>
          ) : (
            <div className="mt-4">
              <p id="table-scroll-hint" className="sr-only">
                The rate observations table scrolls horizontally. Use left and right arrow keys to reveal all columns.
              </p>
              <div
                className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                role="region"
                aria-label={`Persisted rate observations for ${currencyPairLabel}`}
                aria-describedby="table-scroll-hint"
                tabIndex={0}
              >
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <caption className="sr-only">
                    Accessible table of persisted rate observations and median states for {currencyPairLabel} over {history.windowDays} days.
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                      <th scope="col" className="px-3 py-2.5 font-medium">Snapshot Timestamp</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Median Rate</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Median State</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Anchor</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Observation Rate</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Fee</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Observation Captured</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.points.flatMap((point, pointIndex) => {
                      const obsCount = point.observations.length;
                      const formattedTime = new Date(point.timestamp).toLocaleString();
                      const medianDisplay = point.medianRate !== null ? point.medianRate : "Unavailable";
                      const stateDisplay = point.state === "healthy" ? "Healthy" : "Insufficient fresh sources";

                      if (obsCount === 0) {
                        return [
                          <tr
                            key={`point-${pointIndex}-empty`}
                            className="border-b border-[var(--ghost)] align-top last:border-0 hover:bg-[rgba(255,255,255,0.02)]"
                          >
                            <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">{formattedTime}</td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--white)] break-all">{medianDisplay}</td>
                            <td className="px-3 py-3 text-xs text-[var(--muted)]">{stateDisplay}</td>
                            <td colSpan={4} className="px-3 py-3 text-xs italic text-[var(--muted)]">
                              No individual anchor observations recorded for this point
                            </td>
                          </tr>,
                        ];
                      }

                      return point.observations.map((obs, obsIndex) => (
                        <tr
                          key={`point-${pointIndex}-obs-${obs.anchor.slug}-${obsIndex}`}
                          className="border-b border-[var(--ghost)] align-top last:border-0 hover:bg-[rgba(255,255,255,0.02)]"
                        >
                          {obsIndex === 0 ? (
                            <>
                              <td
                                rowSpan={obsCount}
                                className="border-r border-[var(--ghost)] px-3 py-3 font-mono text-xs text-[var(--muted)]"
                              >
                                {formattedTime}
                              </td>
                              <td
                                rowSpan={obsCount}
                                className="border-r border-[var(--ghost)] px-3 py-3 font-mono text-xs text-[var(--white)] break-all"
                              >
                                {medianDisplay}
                              </td>
                              <td
                                rowSpan={obsCount}
                                className="border-r border-[var(--ghost)] px-3 py-3 text-xs text-[var(--muted)]"
                              >
                                {stateDisplay}
                              </td>
                            </>
                          ) : null}
                          <td className="px-3 py-3 text-xs text-[var(--white)] font-medium">
                            <Link
                              href={`/anchors/${obs.anchor.slug}`}
                              className="underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
                            >
                              {obs.anchor.name || obs.anchor.slug}
                            </Link>
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-[var(--white)] break-all">
                            {obs.rate}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-[var(--muted)] break-all">
                            {obs.fee || "—"}
                          </td>
                          <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">
                            {new Date(obs.capturedAt).toLocaleString()}
                          </td>
                        </tr>
                      ));
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
