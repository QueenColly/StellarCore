"use client";

import { useMemo, useState } from "react";

import {
  filterSnapshotsBySource,
  formatSnapshotTimestampUtc,
  summarizeSnapshots,
  type SnapshotOverlapSummary,
  type SnapshotSourceFilter,
} from "@/lib/rates/snapshotSourceOverlap";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

type Props = Readonly<{
  history: PublicRateHistoryResponse;
  stale?: StaleEvidenceMetadata;
}>;

const SOURCE_FILTERS: ReadonlyArray<
  Readonly<{ value: SnapshotSourceFilter; label: string }>
> = [
  { value: "all", label: "All snapshots" },
  { value: "single", label: "Single-source snapshots" },
  { value: "multiple", label: "Multiple-source snapshots" },
];

export function SnapshotSourceOverlapPanel({ history, stale }: Props) {
  const [sourceFilter, setSourceFilter] = useState<SnapshotSourceFilter>("all");
  const summaries = useMemo(() => summarizeSnapshots(history), [history]);
  const visible = useMemo(
    () => filterSnapshotsBySource(summaries, sourceFilter),
    [summaries, sourceFilter],
  );

  return (
    <section
      aria-labelledby="snapshot-source-overlap-heading"
      className="mt-10"
      data-testid="snapshot-source-overlap-panel"
    >
      <div>
        <p className="eyebrow">Snapshot source overlap</p>
        <h2
          id="snapshot-source-overlap-heading"
          className="mt-2 text-2xl"
          style={{ fontFamily: "var(--display)" }}
        >
          Concurrent anchor observations in rate snapshots
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Lists the anchors recorded at each persisted rate-snapshot point.
          Co-observation is recorded evidence; it is not evidence of
          eligibility by itself.
        </p>
      </div>

      {stale ? (
        <div
          className="mt-5 rounded-lg border border-[rgba(243,184,100,0.4)] bg-[rgba(243,184,100,0.08)] p-4 text-xs text-[#f3b864]"
          data-state="stale"
          role="status"
        >
          Stale snapshot data: this view shows last-known-good observations.
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-[var(--muted)]">
          Filter
        </span>
        <div
          className="inline-flex rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-1 text-xs"
          role="group"
          aria-label="Snapshot source filter"
        >
          {SOURCE_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sourceFilter === option.value}
              onClick={() => setSourceFilter(option.value)}
              className={`rounded px-3 py-1 font-medium transition-colors ${
                sourceFilter === option.value
                  ? "bg-[var(--ghost)] text-[var(--white)]"
                  : "text-[var(--muted)] hover:text-[var(--white)]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span
          className="text-xs text-[var(--muted)]"
          data-testid="snapshot-filter-count"
        >
          {visible.length} of {summaries.length} snapshots
        </span>
      </div>

      {history.points.length === 0 ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="snapshot-overlap-empty"
        >
          No snapshots recorded in this window.
        </p>
      ) : visible.length === 0 ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="snapshot-overlap-empty"
        >
          No snapshots match the selected source filter.
        </p>
      ) : (
        <ul
          className="mt-6 space-y-4"
          data-testid="snapshot-overlap-list"
          aria-label="Rate snapshots with observed anchors"
        >
          {visible.map((summary, index) => (
            <SnapshotOverlapRow
              key={`${summary.timestamp}-${index}`}
              summary={summary}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function SnapshotOverlapRow({
  summary,
}: Readonly<{ summary: SnapshotOverlapSummary }>) {
  return (
    <li
      className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4"
      data-testid="snapshot-overlap-row"
    >
      <dl className="grid gap-3 text-xs text-[var(--muted)] sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <dt className="font-medium uppercase tracking-wide">
            UTC timestamp
          </dt>
          <dd
            className="mt-1 font-mono text-[var(--white)]"
            data-testid="snapshot-utc-timestamp"
          >
            {formatSnapshotTimestampUtc(summary.timestamp)}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide">
            Distinct observed anchors
          </dt>
          <dd
            className="mt-1 text-[var(--white)]"
            data-testid="snapshot-distinct-anchor-count"
          >
            {summary.distinctObservedAnchorCount}
          </dd>
        </div>
        <div>
          <dt className="font-medium uppercase tracking-wide">
            Published median
          </dt>
          <dd
            className="mt-1 text-[var(--white)]"
            data-testid="snapshot-published-median"
          >
            {summary.medianRate || "Median unavailable"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 text-xs text-[var(--muted)]">
        <p className="font-medium uppercase tracking-wide">Observed anchors</p>
        {summary.anchors.length === 0 ? (
          <p className="mt-1">None recorded for this snapshot.</p>
        ) : (
          <ul
            className="mt-1 flex flex-wrap gap-2"
            aria-label="Observed anchors in this snapshot"
          >
            {summary.anchors.map((anchor) => (
              <li
                key={anchor.slug}
                className="rounded border border-[var(--ghost)] bg-[var(--black)] px-2 py-0.5 text-[10px] text-[var(--white)]"
              >
                {anchor.name || anchor.slug || "—"}
                {anchor.slug && anchor.slug !== anchor.name ? (
                  <span className="ml-1 text-[var(--muted)]">{anchor.slug}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p
        className="mt-4 text-[10px] leading-relaxed text-[var(--muted)]"
        data-testid="snapshot-state"
      >
        Persisted snapshot state: {snapshotStateLabel(summary.state)}
      </p>
    </li>
  );
}

function snapshotStateLabel(state: SnapshotOverlapSummary["state"]): string {
  switch (state) {
    case "healthy":
      return "healthy";
    case "insufficient_fresh_sources":
      return "insufficient fresh sources";
    default:
      return "unknown";
  }
}
