"use client";

import { useEffect, useReducer, useRef } from "react";
import {
  createRatesLoader,
  type RatesLoader,
} from "@/lib/rates/currentFreshnessRequests";
import {
  initialCurrentFreshnessPanelState,
  currentFreshnessPanelReducer,
  placeholderRates,
} from "@/lib/rates/currentFreshnessPanelState";
import {
  computeCurrentFreshnessBreakdown,
  describeFreshnessState,
  describeDegraded,
  formatAgeMs,
  type CurrentFreshnessBreakdown,
  type FreshnessStateGroup,
} from "@/lib/rates/currentFreshnessBreakdown";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRatesResponse } from "@/types/api/rates";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  initialRates: PublicRatesResponse | null;
  initialError?: string | null;
}>;

const NO_RATES_EVALUATED_AT = new Date(0).toISOString();

function formatTimestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "Unknown time";
}

function describeGroupCount(group: FreshnessStateGroup): string {
  return `${group.count} observation${group.count === 1 ? "" : "s"}`;
}

export function CurrentFreshnessBreakdownView({
  corridors,
  selectedCorridorSlug,
  initialRates,
  initialError = null,
}: Props) {
  const [panel, dispatch] = useReducer(
    currentFreshnessPanelReducer,
    initialRates ?? placeholderRates(selectedCorridorSlug),
    initialCurrentFreshnessPanelState,
  );
  const { displayed: rates, loading, failure } = panel;
  const hasRates = initialRates !== null || rates.evaluatedAt !== NO_RATES_EVALUATED_AT;
  const loaderRef = useRef<RatesLoader | null>(null);

  useEffect(() => {
    const loader = createRatesLoader({
      corridorSlug: selectedCorridorSlug,
      callbacks: {
        onSuccess: (data) => dispatch({ type: "refresh_succeeded", rates: data }),
        onError: (message) =>
          dispatch({
            type: "refresh_failed",
            message,
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

  function handleRetry() {
    dispatch({ type: "refresh_started" });
    void loaderRef.current?.load();
  }

  const breakdown = computeCurrentFreshnessBreakdown(rates);
  const selectedCorridor = corridors.find((c) => c.slug === selectedCorridorSlug);
  const corridorLabel = selectedCorridor
    ? `${selectedCorridor.sourceAsset} (${selectedCorridor.sourceCountry}) → ${selectedCorridor.destinationAsset} (${selectedCorridor.destinationCountry})`
    : selectedCorridorSlug;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <label
          htmlFor="freshness-breakdown-corridor"
          className="block text-xs uppercase tracking-wide text-[var(--muted)]"
        >
          Reviewed corridor
        </label>
        <select
          id="freshness-breakdown-corridor"
          className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          value={selectedCorridorSlug}
          onChange={(event) => {
            const nextSlug = event.target.value;
            if (nextSlug && nextSlug !== selectedCorridorSlug) {
              window.location.href = `/insights/current-freshness-breakdown?corridor=${encodeURIComponent(nextSlug)}`;
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

      {loading ? (
        <p
          role="status"
          aria-live="polite"
          data-testid="freshness-breakdown-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading current rates…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="freshness-breakdown-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Could not refresh current rates: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasRates
              ? `The breakdown below still describes the last successful evaluation at ${formatTimestamp(rates.evaluatedAt)}.`
              : "No rates response has been loaded yet."}
          </p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Retry
          </button>
        </div>
      ) : initialError ? (
        <div
          role="alert"
          data-testid="freshness-breakdown-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>Unable to load current rates{initialError ? `: ${initialError}` : "."}.</p>
          <button
            type="button"
            onClick={handleRetry}
            className="mt-2 rounded border border-[rgba(238,143,129,0.4)] px-2.5 py-1 text-xs text-[var(--white)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
          >
            Retry request
          </button>
        </div>
      ) : null}

      {Boolean(rates.degraded) ? (
        <div
          role="status"
          data-testid="freshness-breakdown-degraded"
          className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
        >
          <p className="font-medium">
            Displaying a verified stale copy of the latest rates due to temporary database unavailability.
          </p>
          <p className="mt-1 text-xs">{describeDegraded(rates.degraded)}</p>
        </div>
      ) : null}

      {!hasRates ? null : (
        <section
          aria-labelledby="freshness-breakdown-result-heading"
          data-testid="freshness-breakdown-result"
          className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Selected Corridor
              </p>
              <h2
                id="freshness-breakdown-result-heading"
                className="mt-1 text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {corridorLabel}
              </h2>
            </div>
            <div className="text-right text-xs text-[var(--muted)]">
              <p className="font-medium text-[var(--white)]">
                Evaluated <time dateTime={rates.evaluatedAt}>{formatTimestamp(rates.evaluatedAt)}</time>
              </p>
            </div>
          </div>

          {breakdown.empty ? (
            <div
              role="status"
              data-testid="freshness-breakdown-empty"
              className="p-12 text-center text-sm text-[var(--muted)]"
            >
              No rate observations are currently persisted for this corridor, so no freshness
              classifications are available.
            </div>
          ) : (
            <>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[breakdown.groups[0], breakdown.groups[1], breakdown.groups[2], breakdown.groups[3]].map(
                  (group) => (
                    <div
                      key={group.state}
                      className="rounded border border-[var(--ghost)] p-3"
                    >
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        {describeFreshnessState(group.state)}
                      </dt>
                      <dd className="mt-1 text-sm font-mono text-[var(--white)]">
                        {describeGroupCount(group)}
                      </dd>
                      <dd className="mt-1 text-xs text-[var(--muted)]">
                        {group.nullAgeCount > 0
                          ? `${group.nullAgeCount} without reported age`
                          : "all ages reported"}
                      </dd>
                      {group.hasNegativeAge ? (
                        <dd className="mt-1 text-xs text-[rgba(238,143,129,0.9)]">
                          Negative age values present (as reported)
                        </dd>
                      ) : null}
                      <dd className="mt-1 text-xs text-[var(--muted)]">
                        {group.eligibleForMedianCount} eligible for median
                      </dd>
                    </div>
                  ),
                )}
              </div>

              <div className="mt-6 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
                <h3 className="text-sm font-medium text-[var(--white)]">
                  Median eligibility (reported independently of freshness)
                </h3>
                <dl className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Eligible for median
                    </dt>
                    <dd className="mt-1 font-mono text-[var(--white)]">
                      {breakdown.eligibleForMedianCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Not eligible for median
                    </dt>
                    <dd className="mt-1 font-mono text-[var(--white)]">
                      {breakdown.notEligibleForMedianCount}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  Eligibility is taken directly from each observation&apos;s `eligibleForMedian` field and
                  is not derived from freshness state. A stale or future observation may still be
                  marked eligible, and a fresh observation may be ineligible.
                </p>
              </div>

              <div className="mt-6 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                  <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                    Recorded observations ({breakdown.totalObservations} total)
                  </caption>
                  <thead>
                    <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                      <th scope="col" className="px-3 py-2 font-medium">Anchor</th>
                      <th scope="col" className="px-3 py-2 font-medium">Freshness state</th>
                      <th scope="col" className="px-3 py-2 font-medium">Age</th>
                      <th scope="col" className="px-3 py-2 font-medium">Eligible for median</th>
                      <th scope="col" className="px-3 py-2 font-medium">Captured at</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rates.observations.map((observation, index) => (
                      <tr
                        key={index}
                        className="border-b border-[var(--ghost)] last:border-0"
                      >
                        <td className="px-3 py-2 font-medium text-[var(--white)]">
                          {observation.anchor.name || observation.anchor.slug}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--white)]">
                          {describeFreshnessState(observation.freshness.state)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                          {formatAgeMs(observation.freshness.ageMs)}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                          {observation.eligibleForMedian ? "Yes" : "No"}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--muted)]">
                          {new Date(observation.capturedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
                Counts and ages are reported exactly as the API returned them. Freshness state is
                not treated as operational uptime, no median is recomputed, and no status is
                evaluated against the browser clock.
              </p>
            </>
          )}
        </section>
      )}
    </div>
  );
}
