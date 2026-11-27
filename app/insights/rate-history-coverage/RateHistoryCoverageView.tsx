import React from "react";
import { Badge } from "@/components/dashboard/Badge";
import { SectionEmpty, SectionSkeleton } from "@/components/dashboard/SectionStates";
import { EvidenceTimestamp } from "@/components/ui/EvidenceTimestamp";
import {
  summarizeRateHistoryCoverage,
  type ParsedRateHistory,
  type RateHistoryCoverageSummary,
} from "./coverage";

export type RateHistoryCoverageViewState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ kind: "loading" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "ready"; history: ParsedRateHistory }>;

function CoverageError({ message }: Readonly<{ message: string }>) {
  return (
    <div
      role="alert"
      data-evidence-state="unavailable"
      className="rounded-lg border border-[rgba(238,143,129,0.35)] bg-[rgba(238,143,129,0.08)] p-5 text-sm text-[#ee8f81]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">Unavailable</p>
      <p className="mt-2">{message}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Historical evidence could not be loaded. This does not mean it is absent.
      </p>
    </div>
  );
}

export function RateHistoryCoverageView({
  state,
}: Readonly<{ state: RateHistoryCoverageViewState }>) {
  if (state.kind === "idle") {
    return (
      <SectionEmpty message="Select a corridor and lookback window to view its rate-history coverage." />
    );
  }
  if (state.kind === "loading") {
    return <SectionSkeleton label="rate-history coverage" />;
  }
  if (state.kind === "error") {
    return <CoverageError message={state.message} />;
  }

  const { history } = state;
  const summary: RateHistoryCoverageSummary = summarizeRateHistoryCoverage(history);

  const metrics = [
    {
      key: "total-points",
      term: "Total returned points",
      value: summary.totalPoints,
      detail: `Persisted observation points returned in the ${history.windowDays}-day window.`,
      badge: null,
    },
    {
      key: "published-medians",
      term: "Published medians",
      value: summary.pointsWithMedian,
      detail: "Observation points where sufficient independent sources yielded a published median rate.",
      badge: <Badge tone="positive" label="Published" />,
    },
    {
      key: "null-medians",
      term: "Unpublished medians",
      value: summary.pointsWithoutMedian,
      detail: "Observation points with null median due to insufficient fresh sources or empty inputs.",
      badge: <Badge tone="warning" label="Null / Insufficient" />,
    },
    {
      key: "distinct-dates",
      term: "Distinct UTC dates",
      value: summary.distinctUtcDateCount,
      detail: `Calendar dates (UTC) containing at least one recorded observation point.`,
      badge: null,
    },
  ];

  return (
    <div
      className="space-y-6"
      data-testid="rate-history-coverage-view"
      data-window-days={history.windowDays}
    >
      {/* Stale snapshot alert if degraded */}
      {history.stale && (
        <div
          role="status"
          data-evidence-state="stale"
          className="rounded-md border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-3 text-sm text-[#f3b864]"
        >
          Stale snapshot
          {history.stale.generatedAt ? (
            <>
              {" "}
              generated <EvidenceTimestamp value={history.stale.generatedAt} />
            </>
          ) : null}
          . The live read failed; these historical records may not be current.
        </div>
      )}

      {/* Main summary container */}
      <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="text-xl text-[var(--white)]"
              style={{ fontFamily: "var(--display)" }}
            >
              {history.corridorLabel}
            </h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Evaluated <EvidenceTimestamp value={history.evaluatedAt} /> ·{" "}
              {history.windowDays}-day lookback window
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">Evaluated state:</span>
            <Badge
              tone={summary.pointsWithoutMedian === 0 && summary.totalPoints > 0 ? "positive" : "warning"}
              label={
                summary.totalPoints === 0
                  ? "No Data"
                  : summary.pointsWithoutMedian === 0
                    ? "Consistent"
                    : "Sparse / Gaps Present"
              }
            />
          </div>
        </div>

        {/* Uptime non-extrapolation disclaimer */}
        <div
          data-testid="uptime-disclosure"
          className="mt-5 rounded-md border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3 text-xs leading-relaxed text-[var(--muted)]"
        >
          <span className="font-medium text-[var(--white)]">Observation transparency:</span>{" "}
          StellarCore captures rate evidence on demand or according to scheduler policies. The
          absence of a recorded observation during an interval reflects that no stored point
          exists—it does not imply endpoint failure or a scheduled downtime percentage. Live-rate
          uptime is deliberately not extrapolated.
        </div>

        {/* Metric cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="coverage-metrics">
          {metrics.map((m) => (
            <div
              key={m.key}
              data-coverage-metric={m.key}
              className="rounded-md border border-[var(--ghost)] bg-[var(--black)] p-4"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-[var(--muted)]">
                  {m.term}
                </span>
                {m.badge}
              </div>
              <div className="mt-2 text-2xl font-bold text-[var(--white)]">
                {m.value}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {m.detail}
              </p>
            </div>
          ))}
        </div>

        {/* State breakdown */}
        <div className="mt-5 flex flex-wrap items-center gap-4 text-xs text-[var(--muted)]">
          <div>
            Healthy points:{" "}
            <span className="font-medium text-[var(--white)]">
              {summary.healthyCount}
            </span>
          </div>
          <div>·</div>
          <div>
            Insufficient sources points:{" "}
            <span className="font-medium text-[var(--white)]">
              {summary.insufficientSourcesCount}
            </span>
          </div>
          {summary.oldestPointTimestamp && summary.newestPointTimestamp && (
            <>
              <div>·</div>
              <div>
                Span: <EvidenceTimestamp value={summary.oldestPointTimestamp} /> to{" "}
                <EvidenceTimestamp value={summary.newestPointTimestamp} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Chronological Evidence Gaps */}
      <section
        aria-labelledby="gaps-heading"
        data-testid="coverage-gaps"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="gaps-heading"
              className="text-base font-semibold text-[var(--white)]"
            >
              Chronological Evidence Gaps
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Intervals exceeding 24 hours between consecutive returned observations.
            </p>
          </div>
          <span className="text-xs text-[var(--muted)]">
            {summary.gaps.length === 1
              ? "1 gap identified"
              : `${summary.gaps.length} gaps identified`}
          </span>
        </div>

        {summary.gaps.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]" data-testid="no-gaps-message">
            {summary.totalPoints < 2
              ? "At least two returned observation points are required to identify intervals between observations."
              : "No gaps exceeding 24 hours were detected between returned observation points in this window."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--ghost)] text-[var(--muted)]">
                <tr>
                  <th scope="col" className="pb-2 font-medium">From (UTC)</th>
                  <th scope="col" className="pb-2 font-medium">To (UTC)</th>
                  <th scope="col" className="pb-2 font-medium">Duration</th>
                  <th scope="col" className="pb-2 font-medium">Observation Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--ghost)] text-[var(--white)]">
                {summary.gaps.map((gap, idx) => (
                  <tr key={`${gap.fromTimestamp}-${gap.toTimestamp}-${idx}`}>
                    <td className="py-2.5 font-mono">
                      <EvidenceTimestamp value={gap.fromTimestamp} />
                    </td>
                    <td className="py-2.5 font-mono">
                      <EvidenceTimestamp value={gap.toTimestamp} />
                    </td>
                    <td className="py-2.5 font-medium text-[#f3b864]">
                      {gap.durationFormatted}
                    </td>
                    <td className="py-2.5">
                      <span className="inline-block rounded bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                        {gap.message}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Observed UTC Dates */}
      <section
        aria-labelledby="dates-heading"
        data-testid="observed-utc-dates"
        className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3
              id="dates-heading"
              className="text-base font-semibold text-[var(--white)]"
            >
              Distinct Observed UTC Dates ({summary.distinctUtcDateCount})
            </h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Calendar days in UTC where at least one persisted observation was recorded.
            </p>
          </div>
        </div>

        {summary.distinctUtcDates.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--muted)]">
            No observation points returned for the selected window.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {summary.distinctUtcDates.map((date) => (
              <span
                key={date}
                data-testid="utc-date-chip"
                className="rounded-md border border-[var(--ghost)] bg-[var(--black)] px-2.5 py-1 font-mono text-xs text-[var(--white)]"
              >
                {date}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
