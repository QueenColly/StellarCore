"use client";

import { useMemo } from "react";

import { summarizeObservedRateRange } from "@/lib/rates/observedRateRange";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";
import type { StaleEvidenceMetadata } from "@/types/api/staleEvidence";

type Props = Readonly<{
  history: PublicRateHistoryResponse;
  stale?: StaleEvidenceMetadata;
}>;

const DESCRIPTIVE_RANGE_LABEL =
  "Descriptive range of stored indicative values; not a median, quote, slippage figure, or market arbitrage claim.";

export function ObservedRateRangePanel({ history, stale }: Props) {
  const summary = useMemo(() => summarizeObservedRateRange(history), [history]);

  return (
    <section
      aria-labelledby="observed-rate-range-heading"
      className="mt-10"
      data-testid="observed-rate-range-panel"
    >
      <div>
        <p className="eyebrow">Observed rate range</p>
        <h2
          id="observed-rate-range-heading"
          className="mt-2 text-2xl"
          style={{ fontFamily: "var(--display)" }}
        >
          Cross-anchor rate ranges
        </h2>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          {DESCRIPTIVE_RANGE_LABEL}
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

      {summary.pointCount === 0 ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="observed-rate-range-empty"
        >
          No snapshots recorded in this window.
        </p>
      ) : summary.qualifiedPointCount === 0 ? (
        <p
          className="mt-6 text-sm text-[var(--muted)]"
          data-testid="observed-rate-range-empty"
        >
          No snapshots with two or more valid rates.
        </p>
      ) : (
        <dl className="mt-6 grid gap-3 text-xs text-[var(--muted)] sm:grid-cols-2 lg:grid-cols-4">
          <RateRangeMetric
            label="Snapshots with rates"
            value={String(summary.qualifiedPointCount)}
            testId="observed-rate-qualified-points"
          />
          <RateRangeMetric
            label="Snapshots without rates"
            value={String(summary.excludedPointCount)}
            testId="observed-rate-excluded-points"
          />
          <RateRangeMetric
            label="Minimum rate"
            value={summary.minRate ?? "No qualifying snapshots"}
            testId="observed-rate-min"
          />
          <RateRangeMetric
            label="Maximum rate"
            value={summary.maxRate ?? "No qualifying snapshots"}
            testId="observed-rate-max"
          />
          <RateRangeMetric
            label="Absolute range"
            value={summary.range ?? "No qualifying snapshots"}
            testId="observed-rate-range"
          />
          <RateRangeMetric
            label="Excluded rates"
            value={String(summary.excludedRateCount)}
            testId="observed-rate-excluded-rates"
          />
        </dl>
      )}
    </section>
  );
}

function RateRangeMetric({
  label,
  value,
  testId,
}: Readonly<{ label: string; value: string; testId: string }>) {
  return (
    <div className="rounded-lg border border-[var(--ghost)] bg-[var(--surface)] p-4">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </dt>
      <dd
        className="mt-1 font-mono text-[var(--white)]"
        data-testid={testId}
      >
        {value}
      </dd>
    </div>
  );
}
