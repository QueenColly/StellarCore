"use client";

import { useEffect, useReducer, useRef, useState } from "react";
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
  HISTORICAL_FEE_WINDOWS,
  buildFeeSnapshotRows,
  describeRecordedDecimal,
  groupFeeRecords,
  listObservedAnchors,
  type RecordedDecimal,
  type RecordedTimestamp,
} from "@/lib/rates/historicalFeeRecords";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  initialDays: number;
  initialAnchorSlug?: string | null;
  initialHistory: PublicRateHistoryResponse | null;
  initialError?: string | null;
}>;

const NO_HISTORY_EVALUATED_AT = new Date(0).toISOString();
const ALL_ANCHORS = "";

function formatTimestamp(value: string): string {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "Unknown time";
}

function RecordedTime({ value }: Readonly<{ value: RecordedTimestamp }>) {
  return value.status === "recorded" ? (
    <time dateTime={value.value}>{formatTimestamp(value.value)}</time>
  ) : (
    <span className="italic">Unavailable</span>
  );
}

function RecordedValue({ value }: Readonly<{ value: RecordedDecimal }>) {
  return value.status === "recorded" ? (
    <span className="break-all font-mono">{value.value}</span>
  ) : (
    <span className="italic text-[#f59e0b]">{describeRecordedDecimal(value)}</span>
  );
}

function AnchorLabel({ slug, name }: Readonly<{ slug: string | null; name: string | null }>) {
  if (slug === null) return <span className="italic">Unavailable anchor</span>;
  return (
    <Link
      href={`/anchors/${slug}`}
      className="underline underline-offset-2 hover:text-[var(--accent)] focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
    >
      {name ?? slug}
      {name ? <span className="ml-1 font-mono text-[var(--muted)]">({slug})</span> : null}
    </Link>
  );
}

const cellClass = "px-3 py-2.5 align-top text-xs";
const headClass = "px-3 py-2 font-medium";

/**
 * Read-only inspector for fee strings recorded in historical rate snapshots.
 * Every row traces to one returned `points[].observations[]` entry.
 */
export function HistoricalFeeRecordsView({
  corridors,
  selectedCorridorSlug,
  initialDays,
  initialAnchorSlug = null,
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
  const [anchorSlug, setAnchorSlug] = useState<string | null>(initialAnchorSlug);
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

  function buildHref(corridor: string, days: number, anchor: string | null): string {
    const params = new URLSearchParams({ corridor, days: String(days) });
    if (anchor) params.set("anchor", anchor);
    return `/insights/historical-fee-records?${params.toString()}`;
  }

  function handleWindowChange(days: number, force = false) {
    if (!force && days === selectedDays && hasHistory) return;
    dispatch({ type: "refresh_started", days });
    window.history.replaceState(null, "", buildHref(selectedCorridorSlug, days, anchorSlug));
    void loaderRef.current?.load(days);
  }

  function handleAnchorChange(value: string) {
    const next = value === ALL_ANCHORS ? null : value;
    setAnchorSlug(next);
    window.history.replaceState(null, "", buildHref(selectedCorridorSlug, selectedDays, next));
  }

  const selectedCorridor = corridors.find((c) => c.slug === selectedCorridorSlug);
  const corridorLabel = selectedCorridor
    ? `${selectedCorridor.sourceAsset} (${selectedCorridor.sourceCountry}) → ${selectedCorridor.destinationAsset} (${selectedCorridor.destinationCountry})`
    : selectedCorridorSlug;

  const anchors = listObservedAnchors(history.points);
  const anchorOptions =
    anchorSlug !== null && !anchors.some((a) => a.slug === anchorSlug)
      ? [...anchors, { slug: anchorSlug, name: null }]
      : anchors;
  const snapshots = buildFeeSnapshotRows(history.points, anchorSlug);
  const grouping = groupFeeRecords(history.points, anchorSlug);
  const stale = describeStaleFallback(history);
  const anchorScope = anchorSlug ? `anchor ${anchorSlug}` : "all anchors";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="fee-records-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor
          </label>
          <select
            id="fee-records-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = buildHref(nextSlug, selectedDays, null);
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

        <div className="min-w-0 max-w-full">
          <label
            htmlFor="fee-records-anchor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Anchor (optional)
          </label>
          <select
            id="fee-records-anchor"
            aria-describedby="fee-records-anchor-hint"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={anchorSlug ?? ALL_ANCHORS}
            onChange={(event) => handleAnchorChange(event.target.value)}
          >
            <option value={ALL_ANCHORS}>All anchors with recorded observations</option>
            {anchorOptions.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name ? `${a.name} (${a.slug})` : a.slug}
              </option>
            ))}
          </select>
          <p id="fee-records-anchor-hint" className="sr-only">
            Lists anchors that appear in the returned observations for this window.
          </p>
        </div>

        <div>
          <span
            id="fee-records-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="fee-records-window-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {HISTORICAL_FEE_WINDOWS.map(({ label, days }) => {
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
          data-testid="fee-records-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="fee-records-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Request failed: could not load the {failure.requestedDays}-day history ({failure.message}).
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The records below still come from the last successful ${history.windowDays}-day response.`
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
          data-testid="fee-records-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Request failed: unable to load rate history{initialError ? ` (${initialError})` : ""}.
            This is an operational error, not missing evidence; no fee records are shown.
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
              data-testid="fee-records-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Stale fallback: these records come from a previously saved copy of the{" "}
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
            aria-labelledby="fee-records-result-heading"
            data-testid="fee-records-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <div className="border-b border-[var(--ghost)] pb-4">
              <p className="text-xs uppercase tracking-wide text-[var(--muted)]">
                Configured corridor (reviewed registry)
              </p>
              <h3
                id="fee-records-result-heading"
                className="mt-1 text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {corridorLabel}
              </h3>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Observed evidence below:{" "}
                <span className="font-medium text-[var(--white)]">{history.windowDays}-day</span>{" "}
                window · {anchorScope} · {snapshots.length}{" "}
                {snapshots.length === 1 ? "snapshot" : "snapshots"} · evaluated{" "}
                <time dateTime={history.evaluatedAt}>{formatTimestamp(history.evaluatedAt)}</time>
              </p>
            </div>

            {snapshots.length === 0 ? (
              <p
                role="status"
                data-testid="fee-records-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                No stored snapshots were returned for this {history.windowDays}-day window. This is
                missing evidence, not a request failure, and no fee is assumed.
              </p>
            ) : (
              <>
                <section aria-labelledby="fee-groups-heading" className="mt-5" data-testid="fee-groups">
                  <h4 id="fee-groups-heading" className="text-sm font-medium text-[var(--white)]">
                    Repeated fee strings by anchor and exact source amount
                  </h4>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    A group holds observations from one anchor with the identical source-amount
                    string and the identical fee string. Rows are ordered by anchor and amount, not
                    by fee, and are never compared with each other.
                    {grouping.ungroupedCount > 0
                      ? ` ${grouping.ungroupedCount} of ${grouping.observationCount} observations have an unavailable anchor, fee, source amount, or capture time and are listed only in the snapshot table.`
                      : ""}
                  </p>
                  {grouping.groups.length === 0 ? (
                    <p
                      role="status"
                      data-testid="fee-groups-empty"
                      className="mt-3 text-xs italic text-[var(--muted)]"
                    >
                      No observation with a recorded fee, source amount, and capture time was
                      returned for {anchorScope}.
                    </p>
                  ) : (
                    <div
                      role="region"
                      aria-label="Grouped fee records table"
                      tabIndex={0}
                      className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                    >
                      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                        <caption className="sr-only">
                          Repeated fee strings for {corridorLabel}, {history.windowDays}-day window,
                          grouped by anchor and exact source amount
                        </caption>
                        <thead>
                          <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                            <th scope="col" className={headClass}>Anchor</th>
                            <th scope="col" className={headClass}>Source amount (as recorded)</th>
                            <th scope="col" className={headClass}>Fee (as recorded)</th>
                            <th scope="col" className={headClass}>Observations</th>
                            <th scope="col" className={headClass}>Snapshots</th>
                            <th scope="col" className={headClass}>First recorded</th>
                            <th scope="col" className={headClass}>Last recorded</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grouping.groups.map((group) => (
                            <tr
                              key={`${group.anchorSlug}|${group.sourceAmount}|${group.fee}`}
                              className="border-b border-[var(--ghost)] last:border-0"
                            >
                              <th scope="row" className={`${cellClass} font-normal text-[var(--white)]`}>
                                <AnchorLabel slug={group.anchorSlug} name={group.anchorName} />
                              </th>
                              <td className={`${cellClass} break-all font-mono`}>{group.sourceAmount}</td>
                              <td className={`${cellClass} break-all font-mono text-[var(--white)]`}>{group.fee}</td>
                              <td className={`${cellClass} font-mono`}>{group.count}</td>
                              <td className={`${cellClass} font-mono`}>{group.snapshotCount}</td>
                              <td className={`${cellClass} text-[var(--muted)]`}>
                                <time dateTime={group.firstRecordedAt}>{formatTimestamp(group.firstRecordedAt)}</time>
                              </td>
                              <td className={`${cellClass} text-[var(--muted)]`}>
                                <time dateTime={group.lastRecordedAt}>{formatTimestamp(group.lastRecordedAt)}</time>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section aria-labelledby="fee-snapshots-heading" className="mt-8" data-testid="fee-snapshots">
                  <h4 id="fee-snapshots-heading" className="text-sm font-medium text-[var(--white)]">
                    Recorded observations by snapshot
                  </h4>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    One row per returned observation, with its snapshot timestamp and median exactly
                    as published.
                  </p>
                  <div
                    role="region"
                    aria-label="Recorded fee observations by snapshot table"
                    tabIndex={0}
                    className="mt-3 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
                  >
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <caption className="sr-only">
                        Recorded fee observations for {corridorLabel} by snapshot, {history.windowDays}-day
                        window, {anchorScope}
                      </caption>
                      <thead>
                        <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                          <th scope="col" className={headClass}>Snapshot</th>
                          <th scope="col" className={headClass}>Median rate</th>
                          <th scope="col" className={headClass}>Anchor</th>
                          <th scope="col" className={headClass}>Source amount</th>
                          <th scope="col" className={headClass}>Fee</th>
                          <th scope="col" className={headClass}>Captured</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.flatMap((snapshot) => {
                          const snapshotCell = (
                            <th scope="row" className={`${cellClass} font-normal text-[var(--muted)]`}>
                              <RecordedTime value={snapshot.timestamp} />
                            </th>
                          );
                          const medianCell = (
                            <td className={`${cellClass} break-all font-mono`}>
                              {snapshot.medianRate ?? (
                                <span className="font-sans italic text-[var(--muted)]">No published median</span>
                              )}
                            </td>
                          );
                          if (snapshot.rows.length === 0) {
                            return [
                              <tr
                                key={`snapshot-${snapshot.pointIndex}-empty`}
                                className="border-b border-[var(--ghost)] last:border-0"
                              >
                                {snapshotCell}
                                {medianCell}
                                <td colSpan={4} className={`${cellClass} italic text-[var(--muted)]`}>
                                  {snapshot.returnedObservationCount === 0
                                    ? "No observations were returned for this snapshot."
                                    : `No observations from ${anchorScope} in this snapshot.`}
                                </td>
                              </tr>,
                            ];
                          }
                          return snapshot.rows.map((row) => (
                            <tr
                              key={`snapshot-${row.pointIndex}-obs-${row.observationIndex}`}
                              className="border-b border-[var(--ghost)] last:border-0"
                            >
                              {snapshotCell}
                              {medianCell}
                              <td className={`${cellClass} text-[var(--white)]`}>
                                <AnchorLabel slug={row.anchorSlug} name={row.anchorName} />
                              </td>
                              <td className={cellClass}>
                                <RecordedValue value={row.sourceAmount} />
                              </td>
                              <td className={`${cellClass} text-[var(--white)]`}>
                                <RecordedValue value={row.fee} />
                              </td>
                              <td className={`${cellClass} text-[var(--muted)]`}>
                                <RecordedTime value={row.capturedAt} />
                              </td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}

            <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              Fees are shown as recorded strings in the units each anchor reported. They are not a
              normalized cost, are not converted between currencies, and are not ranked or
              differenced across anchors or source amounts. Recorded values are indicative
              evidence, not a firm quote or a transfer guarantee.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
