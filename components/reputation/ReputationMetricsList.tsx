import type { PublicReputationMetrics } from "@/types/api/reputation";

/**
 * Formats a nullable persisted metric exactly as the public API returns it.
 * `null` means the metric was not computed; it is shown as an em dash with an
 * accessible "Not available" label rather than a fabricated zero.
 */
export function formatReputationMetric(value: number | null): string {
  return value === null ? "—" : String(value);
}

export function formatReputationMs(value: number | null): string {
  return value === null ? "—" : `${value} ms`;
}

type MetricRow = Readonly<{
  key: keyof PublicReputationMetrics;
  label: string;
  format: (value: number | null) => string;
}>;

/** Display order; slippage p95 sits directly beside slippage p50. */
export const REPUTATION_METRIC_ROWS: readonly MetricRow[] = [
  { key: "fillRate7d", label: "Fill rate 7d", format: formatReputationMetric },
  { key: "fillRate30d", label: "Fill rate 30d", format: formatReputationMetric },
  { key: "fillRate90d", label: "Fill rate 90d", format: formatReputationMetric },
  { key: "settleP50Ms", label: "Settlement p50", format: formatReputationMs },
  { key: "settleP95Ms", label: "Settlement p95", format: formatReputationMs },
  { key: "slippageP50", label: "Slippage p50", format: formatReputationMetric },
  { key: "slippageP95", label: "Slippage p95", format: formatReputationMetric },
];

/**
 * Read-only definition list of persisted reputation metrics, shared by the
 * dashboard reputation cards and the anchor detail reputation evidence.
 * Values are rendered verbatim from the public API (no rescaling or rounding).
 */
export function ReputationMetricsList({
  metrics,
}: Readonly<{ metrics: PublicReputationMetrics }>) {
  return (
    <dl
      data-testid="reputation-metrics"
      className="mt-4 grid grid-cols-1 gap-x-3 gap-y-2 border-t border-[var(--ghost)] pt-3 text-xs text-[var(--muted)] min-[360px]:grid-cols-2"
    >
      {REPUTATION_METRIC_ROWS.map(({ key, label, format }) => {
        const value = metrics[key];
        return (
          <div key={key} data-metric={key}>
            <dt>{label}</dt>
            <dd className="text-[var(--white)]">
              {value === null ? (
                <span aria-label={`${label} not available`}>{format(value)}</span>
              ) : (
                format(value)
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
