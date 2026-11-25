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
  describeRelation,
  describeUnavailable,
  formatOffsetMs,
  summarizeCaptureOffsets,
} from "@/lib/rates/captureOffsets";
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

/** Rows rendered in the table; the remainder is disclosed, never silently dropped. */
export const MAX_OFFSET_ROWS = 200;

function TimestampCell({ raw, utc }: Readonly<{ raw: string | null; utc: string | null }>) {
  if (utc === null) {
    return (
      <span className="text-[#ee8f81]">
        Unavailable{raw !== null ? <span className="block break-all font-mono text-[11px]">raw: {raw}</span> : null}
      </span>
    );
  }
  return (
    <>
      <time dateTime={utc} className="break-all font-mono">{raw}</time>
      {raw !== utc ? <span className="block break-all font-mono text-[11px] text-[var(--muted)]">UTC {utc}</span> : null}
    </>
  );
}

/**
 * Read-only table of signed `capturedAt − point.timestamp` differences for the
 * observations a rate-history response returned.
 */
export function CaptureOffsetsView({
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
    // The sequenced loader drops superseded responses, and a success replaces the
    // displayed response wholesale, so two windows are never mixed on screen.
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

  const summary = summarizeCaptureOffsets(history.points);
  const stale = describeStaleFallback(history);
  const rows = summary.entries.slice(0, MAX_OFFSET_ROWS);
  const evaluatedValid = Number.isFinite(new Date(history.evaluatedAt).getTime());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="capture-offsets-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor (configuration)
          </label>
          <select
            id="capture-offsets-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.href = `/insights/history-capture-offsets?corridor=${encodeURIComponent(nextSlug)}&days=${selectedDays}`;
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
            id="capture-offsets-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="capture-offsets-window-label"
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
          data-testid="capture-offsets-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="capture-offsets-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Request failed: could not load the {failure.requestedDays}-day history: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The offsets below still describe only the last successful ${history.windowDays}-day response.`
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
          data-testid="capture-offsets-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Unable to load rate history{initialError ? `: ${initialError}` : "."} This is a request
            failure, not missing evidence: no offsets are shown because no history response was
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
              data-testid="capture-offsets-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Stale fallback: these offsets come from a previously saved copy of the{" "}
                {history.windowDays}-day history, not a fresh read.
              </p>
              <p className="mt-1">
                {stale.kind === "stale" ? (
                  <>
                    Copy generated <time dateTime={stale.generatedAt}>{stale.generatedAt}</time>.
                  </>
                ) : (
                  "The fallback metadata is missing or malformed, so its generation time cannot be confirmed."
                )}
              </p>
            </div>
          ) : null}

          <section
            aria-labelledby="capture-offsets-result-heading"
            data-testid="capture-offsets-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="capture-offsets-result-heading"
                className="text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {corridorLabel}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--white)]">{history.windowDays}-day</span>{" "}
                window · evaluated{" "}
                {evaluatedValid ? (
                  <time dateTime={history.evaluatedAt}>{history.evaluatedAt}</time>
                ) : (
                  "at an unavailable time"
                )}
              </p>
            </div>

            {summary.points === 0 ? (
              <p
                role="status"
                data-testid="capture-offsets-empty"
                className="py-8 text-center text-sm text-[var(--muted)]"
              >
                No stored snapshots were returned for this {history.windowDays}-day window, so there
                are no capture offsets to inspect.
              </p>
            ) : (
              <>
                <dl
                  data-testid="capture-offsets-counts"
                  aria-label="Observed capture offset counts"
                  className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4"
                >
                  {(
                    [
                      ["Valid offsets", summary.valid],
                      ["Missing or invalid", summary.missingOrInvalid],
                      ["Capture after point", summary.captureAfterPoint],
                      ["Capture before point", summary.captureBeforePoint],
                      ["Same instant", summary.equal],
                      ["Observations returned", summary.observations],
                      ["Snapshots returned", summary.points],
                      ["Snapshots without observations", summary.emptyPoints],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className="rounded border border-[var(--ghost)] p-3">
                      <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                        {label}
                      </dt>
                      <dd className="mt-1 font-mono text-sm text-[var(--white)]">{value}</dd>
                    </div>
                  ))}
                </dl>

                {summary.incompletePoints > 0 || summary.nullMedianPoints > 0 ? (
                  <ul
                    data-testid="capture-offsets-incomplete"
                    className="mt-4 space-y-1 text-xs text-[var(--muted)]"
                  >
                    {summary.incompletePoints > 0 ? (
                      <li>
                        Incomplete evidence: {summary.incompletePoints} snapshot(s) returned fewer
                        observations than their recorded source count; only returned observations
                        are inspected.
                      </li>
                    ) : null}
                    {summary.nullMedianPoints > 0 ? (
                      <li>
                        {summary.nullMedianPoints} snapshot(s) have no published median; their
                        observations are still listed, and no median is inferred.
                      </li>
                    ) : null}
                  </ul>
                ) : null}

                {summary.observations === 0 ? (
                  <p
                    role="status"
                    data-testid="capture-offsets-no-observations"
                    className="mt-4 rounded border border-[var(--ghost)] p-4 text-sm text-[var(--muted)]"
                  >
                    The returned snapshots contain no anchor observations, so no capture offset can
                    be computed.
                  </p>
                ) : (
                  <div className="mt-5 overflow-x-auto" tabIndex={0} aria-label="Capture offsets table, scrollable">
                    <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                      <caption className="pb-2 text-left text-xs text-[var(--muted)]">
                        Signed offset = observation capture time − point snapshot time (
                        {rows.length < summary.observations
                          ? `showing first ${rows.length} of ${summary.observations} observations`
                          : `${summary.observations} observations`}
                        )
                      </caption>
                      <thead>
                        <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                          <th scope="col" className="px-3 py-2 font-medium">Anchor</th>
                          <th scope="col" className="px-3 py-2 font-medium">Point snapshot time</th>
                          <th scope="col" className="px-3 py-2 font-medium">Observation capture time</th>
                          <th scope="col" className="px-3 py-2 font-medium">Signed offset</th>
                          <th scope="col" className="px-3 py-2 font-medium">Relation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((entry) => (
                          <tr
                            key={`${entry.pointIndex}-${entry.observationIndex}`}
                            className="border-b border-[var(--ghost)] align-top last:border-0"
                          >
                            <th scope="row" className="px-3 py-2 font-normal text-[var(--white)]">
                              {entry.anchorName}
                              <span className="block text-[11px] text-[var(--muted)]">
                                Snapshot #{entry.pointIndex + 1}
                              </span>
                            </th>
                            <td className="px-3 py-2 text-xs">
                              <TimestampCell raw={entry.pointTimestamp} utc={entry.pointTimestampUtc} />
                            </td>
                            <td className="px-3 py-2 text-xs">
                              <TimestampCell raw={entry.capturedAt} utc={entry.capturedAtUtc} />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                              {formatOffsetMs(entry.offsetMs)}
                            </td>
                            <td className="px-3 py-2 text-xs">
                              {entry.unavailable
                                ? describeUnavailable(entry.unavailable)
                                : describeRelation(entry.relation)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            <p className="mt-5 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              Offsets are computed only from the instants returned in this response. A positive
              value means the observation capture is recorded after the point snapshot; a negative
              value means before, and is shown as is. A difference is not transport latency,
              ingest delay, clock failure, uptime or pricing quality.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
