export const REPUTATION_METRIC_KEYS = [
  'fillRate7d',
  'fillRate30d',
  'fillRate90d',
  'settlementP50',
  'settlementP95',
  'slippageP50',
  'slippageP95',
] as const;

export type ReputationMetricKey = (typeof REPUTATION_METRIC_KEYS)[number];
export type FieldPresence = 'PRESENT' | 'NULL' | 'METRICS_OBJECT_UNAVAILABLE';

export interface ReputationMetricsShape {
  fillRate7d?: number | null;
  fillRate30d?: number | null;
  fillRate90d?: number | null;
  settlementP50?: number | null;
  settlementP95?: number | null;
  slippageP50?: number | null;
  slippageP95?: number | null;
}

export interface ReputationEntryInput {
  anchorSlug: string;
  anchorName: string;
  evidenceState: string; // e.g., 'PUBLISHED' | 'UNPUBLISHED' | 'ESTABLISHED'
  computedAt: string | null;
  metrics: ReputationMetricsShape | null | undefined;
}

export interface AnchorMetricAvailabilityRow {
  anchorSlug: string;
  anchorName: string;
  evidenceState: string;
  computedAt: string | null;
  metricsObjectAvailable: boolean;
  fields: Record<ReputationMetricKey, { presence: FieldPresence; rawValue: number | null }>;
  availableCount: number;
}

export interface ReputationAvailabilityAudit {
  rows: AnchorMetricAvailabilityRow[];
  aggregateCounts: Record<ReputationMetricKey, number>;
  totalAnchors: number;
  evaluatedAt: string;
}

/**
 * Availability means a non-null finite numeric field only.
 * Zero (0) explicitly counts as PRESENT; missing/null is NEVER coerced to 0.
 */
export function isNumericMetricPresent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function auditReputationMetricAvailability(
  entries: readonly ReputationEntryInput[],
  evaluatedAt: string = new Date().toISOString(),
): ReputationAvailabilityAudit {
  const aggregateCounts = Object.fromEntries(
    REPUTATION_METRIC_KEYS.map((key) => [key, 0]),
  ) as Record<ReputationMetricKey, number>;

  const rows: AnchorMetricAvailabilityRow[] = entries.map((entry) => {
    const metricsObjectAvailable = entry.metrics !== null && entry.metrics !== undefined;
    let availableCount = 0;

    const fields = Object.fromEntries(
      REPUTATION_METRIC_KEYS.map((key) => {
        if (!metricsObjectAvailable) {
          return [key, { presence: 'METRICS_OBJECT_UNAVAILABLE' as const, rawValue: null }];
        }
        const val = entry.metrics?.[key];
        if (isNumericMetricPresent(val)) {
          aggregateCounts[key] += 1;
          availableCount += 1;
          return [key, { presence: 'PRESENT' as const, rawValue: val }];
        }
        return [key, { presence: 'NULL' as const, rawValue: null }];
      }),
    ) as AnchorMetricAvailabilityRow['fields'];

    return {
      anchorSlug: entry.anchorSlug,
      anchorName: entry.anchorName,
      evidenceState: entry.evidenceState,
      computedAt: entry.computedAt ?? null,
      metricsObjectAvailable,
      fields,
      availableCount,
    };
  });

  return {
    rows,
    aggregateCounts,
    totalAnchors: rows.length,
    evaluatedAt,
  };
}