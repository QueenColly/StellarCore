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
  computeHistoricalSourceCounts,
  describeBucket,
  describeMismatch,
  formatPercent,
  type HistoricalSourceCounts,
  type SourceCountBucket,
  type SourceCountMismatch,
} from "@/lib/rates/historicalSourceCounts";
import { describeStaleFallback, formatEvidencePercent } from "@/lib/rates/rateHistoryEvidence";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  initialDays: number;
  initialHistory: PublicRateHistoryResponse | null;
  initialError?: string | null;
}>;

const TIMEFRAME_OPTIONS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const NO_HISTORY_EVALUATED_AT = new Date(0).toISOString();

function formatTimestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "Unknown time";
}

function describeShare(share: SourceCountBucket): string {
  return share.count === 0 && share.percent === null
    ? `${share.count} of 0 returned snapshots`
    : `${share.count} of ${share.pointIndices.length + share.count} returned snapshots (${formatPercent(share.percent)})`;
}

export function HistoricalSourceCountsView({
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
  const hasHistory = initialHistory !== null || history.evaluatedAt !== NO_HISTORY_EVALUATED_AT;
  const loaderRef = useRef<RateHistoryLoader | null>(null);

  useEffect(() => {
    if (!selectedCorridorSlug) return;

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

  const breakdown = computeHistoricalSourceCounts(history);
  const stale = describeStaleFallback(history);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="historical-source-counts-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor
          </label>
          <select
            id="historical-source-counts-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = `/insights/historical-source-counts?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
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
            id="historical-source-counts-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="historical-source-counts-window-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {TIMEFRAME_OPTIONS.map(({ label, days }) => {
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
          data-testid="historical-source-counts-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="historical-source-counts-refresh-error"
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
          data-testid="historical-source-counts-initial-error"
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
              data-testid="historical-source-counts-stale"
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
            aria-labelledby="historical-source-counts-result-heading"
            data-testid="historical-source-counts-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="historical-source-counts-result-heading"
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

            {breakdown.empty ? (
              <p
                role="status"
                data-testid="historical-source-counts-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                No stored snapshots were returned for this {history.windowDays}-day window, so no
                distribution is computed.
              </p>
            ) : (
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
                  {breakdown.buckets.map((bucket) => (
                    <div key={bucket.label} className="rounded border border-[var(--ghost)] p-3">
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        {describeBucket(bucket.label)}
                      </dt>
                      <dd className="mt-1 text-sm font-mono text-[var(--white)]">{bucket.count}</dd>
                      <dd className="mt-1 text-xs text-[var(--muted)]">
                        {formatPercent(bucket.percent)} of returned snapshots
                      </dd>
                    </div>
                  ))}
                </div>

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                      Distribution of distinct observed anchor counts ({breakdown.totalPoints} snapshots)
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th scope="col" className="px-3 py-2 font-medium">Bucket</th>
                        <th scope="col" className="px-3 py-2 font-medium">Snapshots</th>
                        <th scope="col" className="px-3 py-2 font-medium">Share of returned snapshots</th>
                      </tr>
                    </thead>
                    <tbody>
                      {breakdown.buckets.map((bucket) => (
                        <tr key={bucket.label} className="border-b border-[var(--ghost)] last:border-0">
                          <th scope="row" className="px-3 py-2 font-normal text-[var(--white)]">
                            {describeBucket(bucket.label)}
                          </th>
                          <td className="px-3 py-2 font-mono text-xs">
                            {bucket.count} / {breakdown.totalPoints}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {formatPercent(bucket.percent)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {breakdown.mismatches.length > 0 ? (
                  <div data-testid="historical-source-counts-mismatches" className="mt-5">
                    <h4 className="text-sm font-medium text-[var(--white)]">
                      Reported sourceCount mismatches (data-quality warnings)
                    </h4>
                    <ul className="mt-2 space-y-1 text-xs text-[var(--muted)]">
                      {breakdown.mismatches.map((mismatch) => (
                        <li key={`${mismatch.timestamp}-${mismatch.index}`}>
                          <time dateTime={mismatch.timestamp}>{formatTimestamp(mismatch.timestamp)}</time>
                          {": "}
                          {describeMismatch(mismatch)}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Mismatches are surfaced as reported by the API; they are not corrected or used to
                      infer uptime, independent-source eligibility, successful median, or transfer activity.
                    </p>
                  </div>
                ) : null}

                <div className="mt-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                      Raw snapshots by distinct anchor count ({breakdown.totalPoints} total)
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th scope="col" className="px-3 py-2 font-medium">Snapshot timestamp</th>
                        <th scope="col" className="px-3 py-2 font-medium">Distinct anchors observed</th>
                        <th scope="col" className="px-3 py-2 font-medium">Reported sourceCount</th>
                        <th scope="col" className="px-3 py-2 font-medium">Bucket</th>
                        <th scope="col" className="px-3 py-2 font-medium">Anchor slugs</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.points.map((point, index) => {
                        const slugs = point.observations
                          .map((o) => o.anchor.slug)
                          .filter((s): s is string => typeof s === "string" && s.trim().length > 0);
                        const distinctSlugs = [...new Set(slugs)].sort();
                        const bucketLabel = (() => {
                          if (distinctSlugs.length === 0) return "0";
                          if (distinctSlugs.length === 1) return "1";
                          if (distinctSlugs.length === 2) return "2";
                          return "3+";
                        })();
                        const mismatch = breakdown.mismatches.find((m) => m.index === index);
                        const isMismatch = !!mismatch;

                        return (
                          <tr
                            key={index}
                            className={`border-b border-[var(--ghost)] last:border-0 ${
                              isMismatch ? "bg-[rgba(238,143,129,0.05)]" : ""
                            }`}
                          >
                            <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                              {formatTimestamp(point.timestamp)}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--white)]">
                              {distinctSlugs.length}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                              {point.sourceCount}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--white)]">
                              {bucketLabel}
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-[var(--muted)] break-all">
                              {distinctSlugs.length === 0
                                ? "—"
                                : distinctSlugs.join(", ")}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              Every bucket sums to the returned snapshot count; zero points produce no inferred
              percentages. This is an aggregate distribution of distinct observed source counts only
              — not a measure of continuous availability, independent-source eligibility, successful
              median, or transfer activity.
            </p>
          </section>
        </>
      )}
    </div>
  );
}