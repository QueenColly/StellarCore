"use client";

import { useEffect, useReducer, useRef } from "react";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import {
  createRateHistoryLoader,
  type RateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
} from "@/lib/rates/rateHistoryPanelState";
import {
  DAILY_SNAPSHOT_INVENTORY_WINDOWS,
  summarizeDailySnapshotInventory,
} from "@/lib/rates/dailySnapshotInventory";
import type { PublicCorridor } from "@/types/api/corridors";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";
import { corridorOptionLabel, corridorPairLabel } from "./labels";

type Props = Readonly<{
  corridors: readonly PublicCorridor[];
  selectedCorridorSlug: string;
  initialDays: number;
  initialHistory: PublicRateHistoryResponse | null;
  initialError?: string | null;
  initialDegraded?: StaleEvidenceMetadata | undefined;
}>;

const NO_HISTORY_EVALUATED_AT = new Date(0).toISOString();

function describeCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function SnapshotCoverageNote({
  snapshotRecordCount,
  duplicateTimestampRecordCount,
}: Readonly<{
  snapshotRecordCount: number;
  duplicateTimestampRecordCount: number;
}>) {
  if (snapshotRecordCount === 0) {
    return (
      <span className="text-xs text-[var(--muted)]">
        No returned snapshots — not downtime
      </span>
    );
  }

  return (
    <span className="text-xs text-[var(--white)]">
      {describeCount(snapshotRecordCount, "returned snapshot record")}
      {duplicateTimestampRecordCount > 0 ? (
        <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
          Includes {describeCount(duplicateTimestampRecordCount, "duplicate-timestamp record")}{" "}
          counted separately.
        </span>
      ) : null}
    </span>
  );
}

/**
 * Read-only daily inventory of returned snapshot records for one reviewed
 * corridor. It groups only the point timestamps already returned by the public
 * rate-history API, counts every observation row, and labels a day without
 * returned snapshots as absent evidence rather than downtime.
 */
export function DailySnapshotInventoryView({
  corridors,
  selectedCorridorSlug,
  initialDays,
  initialHistory,
  initialError = null,
  initialDegraded,
}: Props) {
  const startingHistory: PublicRateHistoryResponse = initialHistory
    ? {
        ...initialHistory,
        ...(initialDegraded ? { degraded: initialDegraded } : {}),
      }
    : {
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
      };

  const [panel, dispatch] = useReducer(
    rateHistoryPanelReducer,
    startingHistory,
    initialRateHistoryPanelState,
  );
  const { displayed: history, selectedDays, loading, failure } = panel;
  const hasHistory =
    initialHistory !== null || history.evaluatedAt !== NO_HISTORY_EVALUATED_AT;
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

  const selectedCorridor = corridors.find((corridor) => corridor.slug === selectedCorridorSlug);
  const corridorLabel = selectedCorridor
    ? corridorPairLabel(selectedCorridor)
    : selectedCorridorSlug;
  const summary = summarizeDailySnapshotInventory(history);
  const stale = history.degraded;
  const hasPartialEvidence =
    summary.unassignedSnapshotRecords > 0 ||
    summary.outsideWindowSnapshotRecords > 0 ||
    summary.unreadableObservationArrayCount > 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
        <div className="min-w-0 max-w-full">
          <label
            htmlFor="daily-snapshot-inventory-corridor"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            Reviewed corridor
          </label>
          <select
            id="daily-snapshot-inventory-corridor"
            className="mt-1 max-w-full rounded border border-[var(--ghost)] bg-[var(--black)] px-3 py-1.5 text-sm text-[var(--white)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            value={selectedCorridorSlug}
            onChange={(event) => {
              const nextSlug = event.target.value;
              if (nextSlug && nextSlug !== selectedCorridorSlug) {
                window.location.assign(
                  `/insights/daily-snapshot-inventory?corridor=${encodeURIComponent(
                    nextSlug,
                  )}&days=${selectedDays}`,
                );
              }
            }}
          >
            {corridors.length === 0 ? (
              <option value="">No corridors available</option>
            ) : (
              corridors.map((corridor) => (
                <option key={corridor.slug} value={corridor.slug}>
                  {corridorOptionLabel(corridor)}
                </option>
              ))
            )}
          </select>
        </div>

        <div>
          <span
            id="daily-snapshot-inventory-window-label"
            className="block text-xs uppercase tracking-wide text-[var(--muted)]"
          >
            History window
          </span>
          <div
            role="group"
            aria-labelledby="daily-snapshot-inventory-window-label"
            className="mt-1 inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--black)] p-0.5"
          >
            {DAILY_SNAPSHOT_INVENTORY_WINDOWS.map(({ label, days }) => {
              const active = selectedDays === days;
              return (
                <button
                  key={days}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Inventory snapshot records from the ${label} history window`}
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
          data-testid="daily-snapshot-inventory-loading"
          className="text-sm text-[var(--muted)]"
        >
          Loading the {selectedDays}-day history…
        </p>
      ) : null}

      {failure ? (
        <div
          role="alert"
          data-testid="daily-snapshot-inventory-refresh-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p className="font-semibold">
            Could not load the {failure.requestedDays}-day history: {failure.message}
          </p>
          <p className="mt-1 text-xs">
            {hasHistory
              ? `The inventory below still describes the last successful ${history.windowDays}-day response.`
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
          data-testid="daily-snapshot-inventory-initial-error"
          className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-4 text-sm text-[#ee8f81]"
        >
          <p>
            Unable to load rate history{initialError ? `: ${initialError}` : "."} No daily
            counts are shown because no history response was loaded.
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
          {stale ? (
            <div
              role="status"
              data-evidence-state="stale"
              data-testid="daily-snapshot-inventory-stale"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-medium">
                Degraded response: the API returned a persisted last-known-good copy of the{" "}
                {history.windowDays}-day history because the current read was unavailable. This
                is not a fresh read.
              </p>
              <p className="mt-1">
                Copy generated <EvidenceTimestamp value={stale.generatedAt} />; the response was
                originally evaluated <EvidenceTimestamp value={history.evaluatedAt} />.
              </p>
            </div>
          ) : null}

          {hasPartialEvidence ? (
            <div
              role="status"
              data-testid="daily-snapshot-inventory-partial"
              className="rounded-lg border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] p-4 text-xs text-[#f59e0b]"
            >
              <p className="font-semibold">Partial evidence in this response</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5">
                {summary.unassignedSnapshotRecords > 0 ? (
                  <li>
                    {describeCount(summary.unassignedSnapshotRecords, "returned snapshot record")}{" "}
                    had no interpretable timestamp. {describeCount(
                      summary.unassignedSnapshotRecords,
                      "record",
                    )}{" "}
                    {summary.unassignedSnapshotRecords === 1 ? "is" : "are"} not assigned to any
                    calendar day.
                  </li>
                ) : null}
                {summary.outsideWindowSnapshotRecords > 0 ? (
                  <li>
                    {describeCount(
                      summary.outsideWindowSnapshotRecords,
                      "returned snapshot record",
                    )}{" "}
                    had a valid timestamp outside the requested UTC days and is excluded from
                    the daily rows.
                  </li>
                ) : null}
                {summary.unreadableObservationArrayCount > 0 ? (
                  <li>
                    {describeCount(
                      summary.unreadableObservationArrayCount,
                      "returned snapshot record",
                    )}{" "}
                    had no readable observations list and contributed no observation rows.
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}

          {summary.totalSnapshotRecords === 0 ? (
            <p
              role="status"
              data-testid="daily-snapshot-inventory-empty"
              className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 text-sm text-[var(--muted)]"
            >
              No snapshot records were returned for this {history.windowDays}-day window. Every
              day below is therefore empty evidence, not downtime.
            </p>
          ) : null}

          <section
            aria-labelledby="daily-snapshot-inventory-result-heading"
            data-testid="daily-snapshot-inventory-result"
            className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--ghost)] pb-4">
              <h3
                id="daily-snapshot-inventory-result-heading"
                className="text-xl text-[var(--white)]"
                style={{ fontFamily: "var(--display)" }}
              >
                {corridorLabel}
              </h3>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-medium text-[var(--white)]">{history.windowDays}-day</span>{" "}
                window · evaluated <EvidenceTimestamp value={history.evaluatedAt} /> · all days in
                UTC
              </p>
            </div>

            {summary.window ? (
              <p
                data-testid="daily-snapshot-inventory-window"
                className="mt-4 text-xs leading-relaxed text-[var(--muted)]"
              >
                Requested interval (UTC):{" "}
                <EvidenceTimestamp value={summary.window.requestedStartUtc} /> to{" "}
                <EvidenceTimestamp value={summary.window.requestedEndUtc} />. This interval
                intersects {describeCount(summary.window.coveredDayCount, "UTC calendar day")} (
                {summary.window.firstDay} through {summary.window.lastDay}); a {history.windowDays}
                -day interval can touch {history.windowDays + 1} UTC dates because it does not
                necessarily start at midnight.
              </p>
            ) : (
              <p
                role="status"
                data-testid="daily-snapshot-inventory-window-unavailable"
                className="mt-4 text-xs text-[#f59e0b]"
              >
                The response did not carry an interpretable evaluation instant, so no UTC
                calendar days can be derived and no daily counts are claimed.
              </p>
            )}

            <dl
              data-testid="daily-snapshot-inventory-totals"
              aria-label="Returned snapshot and observation totals"
              className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            >
              <div className="rounded border border-[var(--ghost)] p-3">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Returned snapshot records
                </dt>
                <dd className="mt-1 text-sm text-[var(--white)]">
                  {summary.totalSnapshotRecords}
                </dd>
              </div>
              <div className="rounded border border-[var(--ghost)] p-3">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Recorded observations
                </dt>
                <dd className="mt-1 text-sm text-[var(--white)]">
                  {summary.totalObservationRecords}
                </dd>
              </div>
              <div className="rounded border border-[var(--ghost)] p-3">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Days with returned snapshots
                </dt>
                <dd className="mt-1 text-sm text-[var(--white)]">
                  {summary.daysWithReturnedSnapshots}
                </dd>
              </div>
              <div className="rounded border border-[var(--ghost)] p-3">
                <dt className="text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  Days without returned snapshots
                </dt>
                <dd className="mt-1 text-sm text-[var(--white)]">
                  {summary.daysWithoutReturnedSnapshots}
                </dd>
              </div>
            </dl>

            <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
              Daily rows account for {summary.assignedSnapshotRecords} of{" "}
              {summary.totalSnapshotRecords} returned snapshot records and{" "}
              {summary.assignedObservationRecords} of {summary.totalObservationRecords} recorded
              observations.
              {summary.unassignedSnapshotRecords > 0
                ? ` ${describeCount(
                    summary.unassignedSnapshotRecords,
                    "snapshot record",
                  )} with no interpretable timestamp ${
                    summary.unassignedSnapshotRecords === 1 ? "was" : "were"
                  } not assigned to a day (${describeCount(
                    summary.unassignedObservationRecords,
                    "observation",
                  )}).`
                : ""}
              {summary.outsideWindowSnapshotRecords > 0
                ? ` ${describeCount(
                    summary.outsideWindowSnapshotRecords,
                    "snapshot record",
                  )} fell outside the requested UTC days (${describeCount(
                    summary.outsideWindowObservationRecords,
                    "observation",
                  )}).`
                : ""}
            </p>

            {summary.snapshotsWithoutPublishedMedian > 0 ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                {describeCount(summary.snapshotsWithoutPublishedMedian, "returned snapshot record")}{" "}
                had no published median. {summary.snapshotsWithoutPublishedMedian === 1 ? "It is" : "They are"}{" "}
                still counted because this inventory does not depend on a median.
              </p>
            ) : null}

            <p id="daily-snapshot-inventory-scroll-hint" className="sr-only">
              The daily inventory table scrolls horizontally. Focus it and use the left and right
              arrow keys to reveal every column.
            </p>
            <div
              className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
              role="region"
              aria-label={`Daily returned snapshot inventory for ${corridorLabel}`}
              aria-describedby="daily-snapshot-inventory-scroll-hint"
              tabIndex={0}
            >
              <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                <caption className="sr-only">
                  Returned snapshot records and recorded observations for {corridorLabel} per UTC
                  calendar day over the {history.windowDays}-day history window, most recent day
                  first.
                </caption>
                <thead>
                  <tr className="border-b border-[var(--ghost)] text-xs uppercase tracking-wide text-[var(--muted)]">
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      UTC calendar day
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Returned snapshot records
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Recorded observations
                    </th>
                    <th scope="col" className="px-3 py-2.5 font-medium">
                      Coverage
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {summary.days.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-[var(--muted)]">
                        No UTC calendar days could be derived from this response.
                      </td>
                    </tr>
                  ) : (
                    summary.days.map((day) => (
                      <tr
                        key={day.day}
                        data-inventory-day={day.day}
                        data-inventory-snapshots={day.snapshotRecordCount}
                        className="border-b border-[var(--ghost)] align-top last:border-0"
                      >
                        <th
                          scope="row"
                          className="whitespace-nowrap px-3 py-3 font-mono text-xs font-medium text-[var(--white)]"
                        >
                          <time dateTime={day.startUtc}>{day.day}</time>
                        </th>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--white)]">
                          {day.snapshotRecordCount}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-[var(--white)]">
                          {day.observationRecordCount}
                        </td>
                        <td className="px-3 py-3">
                          <SnapshotCoverageNote
                            snapshotRecordCount={day.snapshotRecordCount}
                            duplicateTimestampRecordCount={day.duplicateTimestampRecordCount}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[var(--ghost)] text-xs">
                    <th scope="row" className="px-3 py-3 text-left font-semibold text-[var(--white)]">
                      Total assigned to UTC days
                    </th>
                    <td className="px-3 py-3 font-mono text-[var(--white)]">
                      {summary.assignedSnapshotRecords}
                    </td>
                    <td className="px-3 py-3 font-mono text-[var(--white)]">
                      {summary.assignedObservationRecords}
                    </td>
                    <td className="px-3 py-3 text-[var(--muted)]">
                      Sum of the {summary.days.length} daily rows
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-5 space-y-2 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)]">
              <p>
                A day marked <strong>No returned snapshots</strong> only means the public API
                returned no snapshot records for that UTC calendar day. It is not evidence of
                downtime, an outage, missing sources, or zero activity.
              </p>
              <p>
                Every returned point counts as one snapshot record. Two records sharing the exact
                same timestamp are kept as two records because the public API exposes no stable
                snapshot identity that would justify merging them. No median, rate, operating
                hours, uptime, or interpolation is derived on this page.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
