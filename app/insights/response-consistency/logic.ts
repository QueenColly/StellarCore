export type CheckStatus = 'CONSISTENT' | 'MISMATCH' | 'UNKNOWN';

export interface LatestRateResponseShape {
  medianState?: string | null; // e.g., 'healthy' | 'insufficient_fresh_sources'
  median?: number | null;
  sourceCount?: number | null;
  freshSourceCount?: number | null;
  evaluatedAt?: string | null;
  stale?: boolean;
}

export interface RateHistoryPointShape {
  timestamp?: string;
  medianState?: string | null;
  median?: number | null;
  sourceCount?: number | null;
  freshSourceCount?: number | null;
}

export interface RateHistoryResponseShape {
  points?: RateHistoryPointShape[] | null;
  evaluatedAt?: string | null;
  stale?: boolean;
}

export interface ConsistencyCheckItem {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  rawFields: Record<string, unknown>;
}

export interface ResponseConsistencyReport {
  corridorSlug: string;
  latestChecks: ConsistencyCheckItem[];
  historyChecks: ConsistencyCheckItem[];
  historyPointCount: number | null;
  evaluatedAt: string;
}

function evaluateRecordChecks(
  prefix: string,
  record: {
    medianState?: string | null;
    median?: number | null;
    sourceCount?: number | null;
    freshSourceCount?: number | null;
  } | null,
  unavailableReason?: string,
): ConsistencyCheckItem[] {
  if (!record) {
    return [
      {
        id: `${prefix}:unavailable`,
        label: 'Response availability',
        status: 'UNKNOWN',
        detail: unavailableReason ?? 'Response unavailable or incomplete; checks remain unknown.',
        rawFields: {},
      },
    ];
  }

  const checks: ConsistencyCheckItem[] = [];
  const { medianState, median, sourceCount, freshSourceCount } = record;
  const normalizedState = typeof medianState === 'string' ? medianState.trim().toLowerCase() : null;

  // 1. healthy paired with null median
  if (normalizedState === null) {
    checks.push({
      id: `${prefix}:healthy-null-median`,
      label: 'Healthy state vs. median presence',
      status: 'UNKNOWN',
      detail: 'medianState is missing; cannot evaluate.',
      rawFields: { medianState, median },
    });
  } else if (normalizedState === 'healthy' && (median === null || median === undefined)) {
    checks.push({
      id: `${prefix}:healthy-null-median`,
      label: 'Healthy state vs. median presence',
      status: 'MISMATCH',
      detail: 'Response field mismatch: medianState is "healthy" while median is null.',
      rawFields: { medianState, median },
    });
  } else {
    checks.push({
      id: `${prefix}:healthy-null-median`,
      label: 'Healthy state vs. median presence',
      status: 'CONSISTENT',
      detail: 'No mismatch between healthy state and median presence.',
      rawFields: { medianState, median },
    });
  }

  // 2. insufficient_fresh_sources paired with non-null median
  if (normalizedState === null) {
    checks.push({
      id: `${prefix}:insufficient-nonnull-median`,
      label: 'Insufficient fresh sources vs. median presence',
      status: 'UNKNOWN',
      detail: 'medianState is missing; cannot evaluate.',
      rawFields: { medianState, median },
    });
  } else if (
    normalizedState === 'insufficient_fresh_sources' &&
    median !== null &&
    median !== undefined
  ) {
    checks.push({
      id: `${prefix}:insufficient-nonnull-median`,
      label: 'Insufficient fresh sources vs. median presence',
      status: 'MISMATCH',
      detail: 'Response field mismatch: medianState is "insufficient_fresh_sources" while median is non-null.',
      rawFields: { medianState, median },
    });
  } else {
    checks.push({
      id: `${prefix}:insufficient-nonnull-median`,
      label: 'Insufficient fresh sources vs. median presence',
      status: 'CONSISTENT',
      detail: 'No mismatch between insufficient_fresh_sources state and median.',
      rawFields: { medianState, median },
    });
  }

  // 3. Negative or non-finite counters
  const hasSourceCount = sourceCount !== null && sourceCount !== undefined;
  const hasFreshCount = freshSourceCount !== null && freshSourceCount !== undefined;

  if (!hasSourceCount || !hasFreshCount) {
    checks.push({
      id: `${prefix}:counter-validity`,
      label: 'Counter finiteness and non-negativity',
      status: 'UNKNOWN',
      detail: 'One or both source counters are missing; check remains unknown.',
      rawFields: { sourceCount, freshSourceCount },
    });
  } else if (
    typeof sourceCount !== 'number' ||
    typeof freshSourceCount !== 'number' ||
    !Number.isFinite(sourceCount) ||
    !Number.isFinite(freshSourceCount) ||
    sourceCount < 0 ||
    freshSourceCount < 0
  ) {
    checks.push({
      id: `${prefix}:counter-validity`,
      label: 'Counter finiteness and non-negativity',
      status: 'MISMATCH',
      detail: 'Response field mismatch: sourceCount or freshSourceCount is negative or non-finite.',
      rawFields: { sourceCount, freshSourceCount },
    });
  } else {
    checks.push({
      id: `${prefix}:counter-validity`,
      label: 'Counter finiteness and non-negativity',
      status: 'CONSISTENT',
      detail: 'Counters are finite and non-negative.',
      rawFields: { sourceCount, freshSourceCount },
    });

    // 4. freshSourceCount > sourceCount
    checks.push({
      id: `${prefix}:fresh-lte-total`,
      label: 'Fresh source count vs. total source count',
      status: freshSourceCount > sourceCount ? 'MISMATCH' : 'CONSISTENT',
      detail:
        freshSourceCount > sourceCount
          ? `Response field mismatch: freshSourceCount (${freshSourceCount}) exceeds sourceCount (${sourceCount}).`
          : 'freshSourceCount does not exceed sourceCount.',
      rawFields: { freshSourceCount, sourceCount },
    });
  }

  return checks;
}

export function inspectResponseConsistency(params: {
  corridorSlug: string;
  latest: { ok: boolean; data?: LatestRateResponseShape | null; error?: string };
  history?: { ok: boolean; data?: RateHistoryResponseShape | null; error?: string } | null;
  evaluatedAt?: string;
}): ResponseConsistencyReport {
  const evaluatedAt = params.evaluatedAt ?? new Date().toISOString();

  const latestChecks = evaluateRecordChecks(
    'latest',
    params.latest.ok ? (params.latest.data ?? null) : null,
    params.latest.ok ? undefined : `Latest rate request failed: ${params.latest.error ?? 'unknown error'}`,
  );

  let historyChecks: ConsistencyCheckItem[] = [];
  let historyPointCount: number | null = null;

  if (params.history) {
    if (!params.history.ok || !params.history.data) {
      historyChecks = evaluateRecordChecks(
        'history',
        null,
        `History request failed: ${params.history.error ?? 'unknown error'}`,
      );
    } else if (!Array.isArray(params.history.data.points)) {
      historyChecks = evaluateRecordChecks('history', null, 'History points array is missing.');
    } else if (params.history.data.points.length === 0) {
      historyPointCount = 0;
      historyChecks = [
        {
          id: 'history:empty',
          label: 'History observations',
          status: 'UNKNOWN',
          detail: 'Zero-point history returned; no observations to check.',
          rawFields: { pointCount: 0 },
        },
      ];
    } else {
      historyPointCount = params.history.data.points.length;
      historyChecks = params.history.data.points.flatMap((pt, idx) =>
        evaluateRecordChecks(`history[${idx}]`, pt),
      );
    }
  }

  return {
    corridorSlug: params.corridorSlug,
    latestChecks,
    historyChecks,
    historyPointCount,
    evaluatedAt,
  };
}