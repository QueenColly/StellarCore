"use client";

import { useEffect, useReducer, useRef } from "react";
import Link from "next/link";
import {
  createRateHistoryLoader,
  type RateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import { describeStaleFallback } from "@/lib/rates/rateHistoryEvidence";
import {
  HISTORICAL_AMOUNT_PAIR_WINDOWS,
  summarizeHistoricalAmountPairs,
  type HistoricalAmountPair,
} from "@/lib/rates/historicalAmountPairs";
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
  return Number.isFinite(time) ? new Date(time).toISOString() : "Unknown time";
}

function describeCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function AmountCell({ amount }: Readonly<{ amount: string | null }>) {
  return amount === null ? (
    <span className="italic text-[var(--muted)]">Not interpretable</span>
  ) : (
    <code className="break-all font-mono text-xs text-[var(--white)]">{amount}</code>
  );
}

function SnapshotDrillDown({ pair }: Readonly<{ pair: HistoricalAmountPair }>) {
  if (!pair.interpretable) {
    return <span className="text-xs text-[var(--muted)]">Not available</span>;
  }

  return (
    <div className="space-y-1">
      {pair.snapshotTimestamps.length === 0 ? (
        <span className="text-xs text-[var(--muted)]">No interpretable snapshot time</span>
      ) : (
        <details className="text-xs">
          <summary className="cursor-pointer text-[var(--white)] underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]">
            {describeCount(pair.snapshotTimestamps.length, "snapshot time")}
          </summary>
          <ul className="mt-2 space-y-1 border-l border-[var(--ghost)] pl-3 text-[var(--muted)]">
            {pair.snapshotTimestamps.map((snapshot) => (
              <li key={snapshot}>
                <time dateTime={snapshot}>{formatTimestamp(snapshot)}</time>
              </li>
            ))}
          </ul>
        </details>
      )}
      {pair.uninterpretableSnapshotCount > 0 ? (
        <p className="text-[11px] text-[#f59e0b]">
          {describeCount(pair.uninterpretableSnapshotCount, "contributing snapshot")} had no
          interpretable timestamp.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Read-only table of persisted nominal amount pairs for one reviewed corridor.
 * It groups only the fields already returned by the public history API and
 * explicitly separates empty, stale, partial and failed responses.
 */
export function HistoricalAmountPairsView({
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

  const sourceAsset = history.corridor.sourceAsset || selectedCorridor?.sourceAsset || "";
  const destinationAsset =
    history.corridor.destinationAsset || selectedCorridor?.destinationAsset || "";

  const summary = summarizeHistoricalAmountPairs(history);
  const stale = describeStaleFallback(history);

  const hasPartialEvidence =
    summary.unreadableObservationArrayCount > 0 ||
    summary.uninterpretableSnapshotCount > 0 ||
    summary.uninterpretableObservationCount > 0;

  const hasObservations = summary.observationCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="historical-amount-pairs-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor
          </label>
          <select
            id="historical-amount-pairs-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = `/insights/historical-amount-pairs?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
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

        <div>
          <span
            id="historical-amount-pairs-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="historical-amount-pairs-window-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {HISTORICAL_AMOUNT_PAIR_WINDOWS.map(({ label, days }) => {
              const active = selectedDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Group amount pairs from the ${label} history window`}
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
          data-testid="historical-amount-pairs-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="historical-amount-pairs-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Could not load the {failure.requestedDays}-day history: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The pairs below still describe the last successful ${history.windowDays}-day response.`
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
          data-testid="historical-amount-pairs-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Unable to load rate history{initialError ? `: ${initialError}` : "."} No amount pairs
            are grouped because no history response was loaded.
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
              data-testid="historical-amount-pairs-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Stale fallback: these pairs come from a previously saved copy of the{" "}
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

          {hasPartialEvidence ? (
            <div
              role="status"
              data-testid="historical-amount-pairs-partial"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-semibold">Partial evidence in this response</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {summary.unreadableObservationArrayCount > 0 ? (
                  <li>
                    {describeCount(
                      summary.unreadableObservationArrayCount,
                      "returned snapshot",
                    )} had no readable observations list and contributed no pairs.
                  </li>
                ) : null}
                {summary.uninterpretableObservationCount > 0 ? (
                  <li>
                    {describeCount(
                      summary.uninterpretableObservationCount,
                      "observation",
                    )} had a missing anchor slug or a non-decimal amount and is listed as not
                    interpretable.
                  </li>
                ) : null}
                {summary.uninterpretableSnapshotCount > 0 ? (
                  <li>
                    {describeCount(
                      summary.uninterpretableSnapshotCount,
                      "returned snapshot",
                    )} had no interpretable timestamp.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          <section
            aria-labelledby="historical-amount-pairs-result-heading"
            data-testid="historical-amount-pairs-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="historical-amount-pairs-result-heading"
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

            {!hasObservations ? (
              <p
                role="status"
                data-testid="historical-amount-pairs-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                {summary.snapshotCount === 0
                  ? `No history snapshots were returned for this ${history.windowDays}-day window, so no amount pairs are grouped.`
                  : `${describeCount(summary.snapshotCount, "history snapshot")} were returned for this ${history.windowDays}-day window, but none contained recorded anchor observations.`}
              </p>
            ) : (
              <>
                <dl
                  data-testid="historical-amount-pairs-counts"
                  aria-label="Historical amount pair counts"
                  className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
                >
                  <div className="rounded border border-[var(--ghost)] p-3">
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Interpretable pairs
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--white)]">
                      {summary.interpretablePairCount}
                    </dd>
                  </div>
                  <div className="rounded border border-[var(--ghost)] p-3">
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Recorded observations
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--white)]">
                      {summary.observationCount}
                    </dd>
                  </div>
                  <div className="rounded border border-[var(--ghost)] p-3">
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      Returned snapshots
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--white)]">{summary.snapshotCount}</dd>
                  </div>
                  <div className="rounded border border-[var(--ghost)] p-3">
                    <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                      No published median
                    </dt>
                    <dd className="mt-1 text-sm text-[var(--white)]">
                      {summary.snapshotsWithoutPublishedMedian}
                    </dd>
                  </div>
                </dl>

                <p className="mt-4 text-xs text-[var(--muted)]">
                  Groups use the exact anchor slug and the exact source and destination amount
                  strings. Equal numeric values written differently (for example <code>100</code>{" "}
                  and <code>100.00</code>) are different persisted pairs and are never merged.
                  {summary.snapshotsWithoutPublishedMedian > 0
                    ? ` ${describeCount(summary.snapshotsWithoutPublishedMedian, "returned snapshot")} had no published median; those observations are still grouped because amount pairs do not depend on the median.`
                    : ""}
                </p>

                <p id="historical-amount-pairs-scroll-hint" className="sr-only">
                  The amount pairs table scrolls horizontally. Use left and right arrow keys to
                  reveal all columns.
                </p>
                <div
                  className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  role="region"
                  aria-label={`Persisted amount pairs for ${corridorLabel}`}
                  aria-describedby="historical-amount-pairs-scroll-hint"
                  tabIndex={0}
                >
                  <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Persisted nominal source and destination amount pairs for {corridorLabel}{" "}
                      over {history.windowDays} days, grouped by exact anchor slug and amount
                      strings.
                    </caption>
                    <thead>
                      <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Anchor
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Source amount{sourceAsset ? ` (${sourceAsset})` : ""}
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Destination amount{destinationAsset ? ` (${destinationAsset})` : ""}
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Recorded observations
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Earliest capture (UTC)
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Latest capture (UTC)
                        </th>
                        <th scope="col" className="px-3 py-2.5 font-medium">
                          Contributing snapshots (UTC)
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.pairs.map((pair) => {
                        if (!pair.interpretable) {
                          return (
                            <tr
                              key={pair.key}
                              className="border-b border-[var(--ghost)] align-top last:border-0"
                            >
                              <th scope="row" className="px-3 py-3 font-normal">
                                {pair.anchorSlug ? (
                                  <Link
                                    href={`/anchors/${pair.anchorSlug}`}
                                    className="text-xs text-[var(--white)] underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
                                  >
                                    {pair.anchorName || pair.anchorSlug}
                                  </Link>
                                ) : (
                                  <span className="text-xs italic text-[var(--muted)]">
                                    Anchor not recorded
                                  </span>
                                )}
                              </th>
                              <td className="px-3 py-3">
                                <AmountCell amount={null} />
                              </td>
                              <td className="px-3 py-3">
                                <AmountCell amount={null} />
                              </td>
                              <td className="px-3 py-3 text-xs italic text-[var(--muted)]">
                                Not interpretable as a pair
                              </td>
                              <td className="px-3 py-3 text-xs italic text-[var(--muted)]">
                                Not interpretable
                              </td>
                              <td className="px-3 py-3 text-xs italic text-[var(--muted)]">
                                Not interpretable
                              </td>
                              <td className="px-3 py-3">
                                <SnapshotDrillDown pair={pair} />
                              </td>
                            </tr>
                          );
                        }

                        return (
                          <tr
                            key={pair.key}
                            className="border-b border-[var(--ghost)] align-top last:border-0 hover:bg-[rgba(255,255,255,0.02)]"
                          >
                            <th scope="row" className="px-3 py-3 font-normal">
                              {pair.anchorSlug ? (
                                <Link
                                  href={`/anchors/${pair.anchorSlug}`}
                                  className="text-xs font-medium text-[var(--white)] underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
                                >
                                  {pair.anchorName || pair.anchorSlug}
                                </Link>
                              ) : null}
                              <span className="mt-0.5 block font-mono text-[11px] text-[var(--muted)]">
                                {pair.anchorSlug}
                              </span>
                            </th>
                            <td className="px-3 py-3">
                              <AmountCell amount={pair.sourceAmount} />
                            </td>
                            <td className="px-3 py-3">
                              <AmountCell amount={pair.destinationAmount} />
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--white)]">
                              {pair.observationCount}
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">
                              {pair.firstCapturedAt ? (
                                <time dateTime={pair.firstCapturedAt}>
                                  {formatTimestamp(pair.firstCapturedAt)}
                                </time>
                              ) : (
                                <span className="italic">Not interpretable</span>
                              )}
                              {pair.uninterpretableCaptureCount > 0 ? (
                                <span className="mt-1 block text-[11px] text-[#f59e0b]">
                                  {describeCount(
                                    pair.uninterpretableCaptureCount,
                                    "capture time",
                                  )} not interpretable
                                </span>
                              ) : null}
                            </td>
                            <td className="px-3 py-3 font-mono text-xs text-[var(--muted)]">
                              {pair.lastCapturedAt ? (
                                <time dateTime={pair.lastCapturedAt}>
                                  {formatTimestamp(pair.lastCapturedAt)}
                                </time>
                              ) : (
                                <span className="italic">Not interpretable</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <SnapshotDrillDown pair={pair} />
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
              Amount pairs are evidence of the nominal strings that were persisted, not a quote.
              No currency conversion, profitability, rate inferred from the amounts, or executable
              price is shown. Observations with invalid or missing anchors or amounts are listed
              individually as not interpretable rather than merged into any pair.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
