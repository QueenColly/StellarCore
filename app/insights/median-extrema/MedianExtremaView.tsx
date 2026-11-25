"use client";

import { useEffect, useReducer, useRef } from "react";
import {
  createRateHistoryLoader,
  type RateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import {
  MEDIAN_SUMMARY_WINDOWS,
  describeStaleFallback,
} from "@/lib/rates/rateHistoryEvidence";
import {
  MEDIAN_EXCLUSION_ORDER,
  MEDIAN_EXTREMUM_ORDER,
  describeExclusion,
  describeExtremum,
  summarizeMedianExtrema,
  type PublishedMedianSnapshot,
} from "@/lib/rates/medianExtrema";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  initialDays: number;
  initialHistory: PublicRateHistoryResponse | null;
  initialError?: string | null;
}>;

const NO_HISTORY_EVALUATED_AT = new Date(0).toISOString();

function formatTimestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "Unknown time";
}

function describeSource(snapshot: PublishedMedianSnapshot, returned: number): string {
  return `Snapshot #${snapshot.index + 1} of ${returned} returned · ${snapshot.freshSourceCount} of ${snapshot.sourceCount} sources fresh`;
}

/**
 * Read-only extrema among the published medians returned for a corridor and
 * window: four actual snapshots, with original rate strings, timestamps and a
 * reference back to their position in the returned history.
 */
export function MedianExtremaView({
  corridors,
  selectedCorridorSlug,
  initialDays,
  initialHistory,
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
      evaluatedAt: NO_HISTORY_EVALUATED_AT,
      windowDays: initialDays,
      points: [],
    },
    initialRateHistoryPanelState,
  );
  const { displayed: history, selectedDays, loading, failure } = panel;
  // The placeholder above is never a real response: it is only replaced by a successful load.
  const hasHistory = initialHistory !== null || history.evaluatedAt !== NO_HISTORY_EVALUATED_AT;
  const loaderRef = useRef<RateHistoryLoader | null>(null);

  useEffect(() => {
    const loader = createRateHistoryLoader({
      corridorSlug: selectedCorridorSlug,
      callbacks: {
        onSuccess: (data) => dispatch({ type: "refresh_succeeded", history: data }),
        onError: (message, days) =>
          dispatch({
            type: "refresh_failed",
            message,
            days,
            failedAt: new Date().toISOString(),
          }),
      },
    });
    loaderRef.current = loader;
    return () => {
      loader.dispose();
      if (loaderRef.current === loader) loaderRef.current = null;
    };
  }, [selectedCorridorSlug]);

  function handleWindowChange(days: number, force = false) {
    if (!force && days === selectedDays && hasHistory) return;
    dispatch({ type: "refresh_started", days });
    void loaderRef.current?.load(days);
  }

  const selectedCorridor = corridors.find((c) => c.slug === selectedCorridorSlug);
  const corridorLabel = selectedCorridor
    ? `${selectedCorridor.sourceAsset} (${selectedCorridor.sourceCountry}) → ${selectedCorridor.destinationAsset} (${selectedCorridor.destinationCountry})`
    : selectedCorridorSlug;

  const summary = summarizeMedianExtrema(history.points);
  const stale = describeStaleFallback(history);
  const extrema = summary.extrema;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="median-extrema-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor (configuration)
          </label>
          <select
            id="median-extrema-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = `/insights/median-extrema?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
              }
            }}
          >
            {corridors.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.sourceAsset} ({c.sourceCountry}) → {c.destinationAsset} ({c.destinationCountry}) [{c.slug}]
              </option>
            ))}
          </select>
        </div>

        <div>
          <span
            id="median-extrema-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="median-extrema-window-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {MEDIAN_SUMMARY_WINDOWS.map(({ label, days }) => {
              const active = selectedDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={active}
                  onClick={() => handleWindowChange(days)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
                    active
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
        <p
          role="status"
          aria-live="polite"
          data-testid="median-extrema-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="median-extrema-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Request failed: could not load the {failure.requestedDays}-day history: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The extrema below still describe the last successful ${history.windowDays}-day response.`
              : "No history response has been loaded yet."}
          </p>
          <button
            type="button"
            onClick={() => handleWindowChange(failure.requestedDays, true)}
            className="mt-2 rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Retry
          </button>
        </div>
      ) : null}

      {!hasHistory ? (
        <div
          role="alert"
          data-testid="median-extrema-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Unable to load rate history{initialError ? `: ${initialError}` : "."} This is a request
            failure, not missing evidence: no extrema are shown because no history response was
            loaded.
          </p>
          {!failure ? (
            <button
              type="button"
              onClick={() => handleWindowChange(initialDays, true)}
              className="mt-2 rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            >
              Retry request
            </button>
          ) : null}
        </div>
      ) : (
        <>
          {stale.kind !== "fresh" ? (
            <div
              role="status"
              data-testid="median-extrema-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Stale fallback: these extrema come from a previously saved copy of the{" "}
                {history.windowDays}-day history, not a fresh read.
              </p>
              <p className="mt-1">
                {stale.kind === "stale" ? (
                  <>
                    Copy generated{" "}
                    <time dateTime={stale.generatedAt}>{formatTimestamp(stale.generatedAt)}</time>;
                    originally evaluated{" "}
                    <time dateTime={history.evaluatedAt}>{formatTimestamp(history.evaluatedAt)}</time>.
                  </>
                ) : (
                  "The fallback metadata is missing or malformed, so its generation time cannot be confirmed."
                )}
              </p>
            </div>
          ) : null}

          <section
            aria-labelledby="median-extrema-result-heading"
            data-testid="median-extrema-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="median-extrema-result-heading"
                className="text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {corridorLabel}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--white)]">{history.windowDays}-day</span>{" "}
                window · evaluated{" "}
                <time dateTime={history.evaluatedAt}>{formatTimestamp(history.evaluatedAt)}</time>
              </p>
            </div>

            {summary.returned === 0 ? (
              <p
                role="status"
                data-testid="median-extrema-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                No stored snapshots were returned for this {history.windowDays}-day window, so there
                are no published medians to compare.
              </p>
            ) : (
              <>
                <p
                  data-testid="median-extrema-counts"
                  className="mt-4 text-sm text-[var(--muted)]"
                >
                  Observed evidence:{" "}
                  <span className="text-[var(--white)]">
                    {summary.included} of {summary.returned} returned snapshots
                  </span>{" "}
                  carry a valid published median; {summary.excludedTotal} excluded.
                </p>

                {extrema === null ? (
                  <p
                    role="status"
                    data-testid="median-extrema-none-published"
                    className="mt-4 rounded border border-[var(--ghost)] p-4 text-sm text-[var(--muted)]"
                  >
                    None of the {summary.returned} returned snapshots carries a valid published
                    median, so no earliest, latest, lowest or highest value is shown. Unpublished
                    medians stay unpublished; nothing is filled in.
                  </p>
                ) : (
                  <>
                    <ul
                      data-testid="median-extrema-cards"
                      aria-label="Published median extrema"
                      className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                    >
                      {MEDIAN_EXTREMUM_ORDER.map((kind) => {
                        const { snapshot } = extrema[kind];
                        const headingId = `median-extrema-card-${kind}`;
                        return (
                          <li key={kind}>
                            <article
                              aria-labelledby={headingId}
                              data-testid={`median-extrema-card-${kind}`}
                              className="h-full rounded border border-[var(--ghost)] p-3"
                            >
                              <h4
                                id={headingId}
                                className="text-[11px] uppercase tracking-wide text-[var(--muted)]"
                              >
                                {describeExtremum(kind)}
                              </h4>
                              <p className="mt-1 break-all font-mono text-base text-[var(--white)]">
                                {snapshot.medianRate}
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                <time dateTime={snapshot.timestamp}>
                                  {formatTimestamp(snapshot.timestamp)}
                                </time>
                              </p>
                              <p className="mt-1 text-xs text-[var(--muted)]">
                                {describeSource(snapshot, summary.returned)}
                              </p>
                            </article>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-5 overflow-x-auto">
                      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                        <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                          Published median extrema among {summary.included} of {summary.returned}{" "}
                          returned snapshots
                        </caption>
                        <thead>
                          <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                            <th scope="col" className="px-3 py-2 font-medium">Position</th>
                            <th scope="col" className="px-3 py-2 font-medium">Published median</th>
                            <th scope="col" className="px-3 py-2 font-medium">Snapshot time</th>
                            <th scope="col" className="px-3 py-2 font-medium">Source snapshot</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MEDIAN_EXTREMUM_ORDER.map((kind) => {
                            const { snapshot } = extrema[kind];
                            return (
                              <tr key={kind} className="border-b border-[var(--ghost)] last:border-0">
                                <th scope="row" className="px-3 py-2 font-normal text-[var(--white)]">
                                  {describeExtremum(kind)}
                                </th>
                                <td className="break-all px-3 py-2 font-mono text-xs">
                                  {snapshot.medianRate}
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  <time dateTime={snapshot.timestamp}>{snapshot.timestamp}</time>
                                </td>
                                <td className="px-3 py-2 text-xs">
                                  {describeSource(snapshot, summary.returned)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {summary.excludedTotal > 0 ? (
                  <div data-testid="median-extrema-excluded" className="mt-5">
                    <h4 className="text-sm font-medium text-[var(--white)]">
                      Excluded snapshots ({summary.excludedTotal}; no median is inferred for these)
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                      {MEDIAN_EXCLUSION_ORDER.filter((reason) => summary.excluded[reason] > 0).map(
                        (reason) => (
                          <li key={reason}>
                            {describeExclusion(reason)}: {summary.excluded[reason]}
                          </li>
                        ),
                      )}
                    </ul>
                  </div>
                ) : null}
              </>
            )}

            <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              These are extrema among the published medians returned for this window only. They are
              not market best prices and not a continuous high or low: values between snapshots are
              not interpolated, and a published median is indicative evidence, not a firm quote or a
              transfer guarantee. Ties resolve to the earliest snapshot, then to its returned order.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
