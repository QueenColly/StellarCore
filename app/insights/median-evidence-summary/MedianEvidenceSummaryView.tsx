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
  describeInconsistency,
  describeStaleFallback,
  formatEvidencePercent,
  summarizeMedianEvidence,
  type MedianEvidenceShare,
} from "@/lib/rates/rateHistoryEvidence";
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

function describeShare(share: MedianEvidenceShare): string {
  return share.denominator === 0
    ? `${share.count} of 0 returned snapshots`
    : `${share.count} of ${share.denominator} returned snapshots (${formatEvidencePercent(share.percent)})`;
}

/**
 * Read-only, window-level summary of returned rate-history snapshots: how many
 * published a median versus how many did not, and which records contradict
 * themselves. Proportions describe returned snapshots only.
 */
export function MedianEvidenceSummaryView({
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

  const summary = summarizeMedianEvidence(history.points);
  const stale = describeStaleFallback(history);
  const inconsistentSnapshots = summary.snapshots.filter(
    (snapshot) => snapshot.category === "inconsistent",
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="median-summary-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor
          </label>
          <select
            id="median-summary-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = `/insights/median-evidence-summary?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
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
            id="median-summary-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="median-summary-window-label"
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
          data-testid="median-summary-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="median-summary-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Could not load the {failure.requestedDays}-day history: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The summary below still describes the last successful ${history.windowDays}-day response.`
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
          data-testid="median-summary-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Unable to load rate history{initialError ? `: ${initialError}` : "."} No summary is shown
            because no history response was loaded.
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
              data-testid="median-summary-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Stale fallback: these counts come from a previously saved copy of the{" "}
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
            aria-labelledby="median-summary-result-heading"
            data-testid="median-summary-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="median-summary-result-heading"
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

            {summary.total === 0 ? (
              <p
                role="status"
                data-testid="median-summary-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                No stored snapshots were returned for this {history.windowDays}-day window, so no
                proportions are computed.
              </p>
            ) : (
              <>
                <dl
                  data-testid="median-summary-counts"
                  aria-label="Median evidence counts"
                  className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  {(
                    [
                      ["Published median", summary.published],
                      ["No published median", summary.unpublished],
                      ["Inconsistent evidence", summary.inconsistent],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded border border-[var(--ghost)] p-3">
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        {label}
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--white)]">{describeShare(value)}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[420px] border-collapse text-left text-sm">
                    <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                      Returned snapshots by median evidence category ({summary.total} total)
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th scope="col" className="px-3 py-2 font-medium">Category</th>
                        <th scope="col" className="px-3 py-2 font-medium">Snapshots</th>
                        <th scope="col" className="px-3 py-2 font-medium">Share of returned snapshots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        [
                          ["Published median", summary.published],
                          ["No published median", summary.unpublished],
                          ["Inconsistent evidence", summary.inconsistent],
                        ] as const
                      ).map(([label, value]) => (
                        <tr key={label} className="border-b border-[var(--ghost)] last:border-0">
                          <th scope="row" className="px-3 py-2 font-normal text-[var(--white)]">
                            {label}
                          </th>
                          <td className="px-3 py-2 font-mono text-xs">
                            {value.count} / {value.denominator}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {formatEvidencePercent(value.percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {inconsistentSnapshots.length > 0 ? (
                  <div data-testid="median-summary-inconsistent" className="mt-5">
                    <h4 className="text-sm font-medium text-[var(--white)]">
                      Inconsistent snapshots (no median is inferred for these)
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                      {inconsistentSnapshots.map((snapshot) => (
                        <li key={`${snapshot.timestamp}-${snapshot.index}`}>
                          <time dateTime={snapshot.timestamp}>{formatTimestamp(snapshot.timestamp)}</time>
                          {": "}
                          {snapshot.inconsistency ? describeInconsistency(snapshot.inconsistency) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            )}

            <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              Proportions apply only to the snapshots returned for this window. They are not a
              measure of elapsed-time availability: gaps between snapshots are not counted, and a
              published median is indicative evidence, not a firm quote or a transfer guarantee.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
