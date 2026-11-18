/**
 * Per-source circuit breakers for the scheduled rate refresh (#167, tested by
 * #356): a source that fails repeatedly stops consuming every run's capacity.
 *
 * The policy is the classic three-phase breaker, kept pure and deterministic
 * so tests drive it with a controlled clock and scripted outcomes:
 *
 *   CLOSED     — normal eligibility; consecutive failures are counted and the
 *                threshold-th one opens the breaker.
 *   OPEN       — every attempt is skipped until the cooldown has elapsed.
 *   HALF_OPEN  — after cooldown, only the configured number of recovery
 *                probes run (one, by default); anything beyond the limit is
 *                skipped. A successful probe closes the breaker; a failed one
 *                re-opens it with a fresh cooldown.
 *
 * Everything here is state-in/state-out over frozen values; nothing reads the
 * real clock or touches storage. A skipped attempt is returned as its own
 * record with its own reason — it is **not** an observation, so nothing
 * downstream can mistake "the breaker refused to try" for "the source
 * answered" (#356's fourth criterion).
 *
 * Deliberately not wired into `rateEngine`/`snapshotRun` here: #167's
 * re-landing owns the integration and the source-selection rules, which #356
 * is explicitly told not to alter. `partitionCandidates` is the seam that
 * wiring will call.
 */

export interface BreakerPolicy {
  /** Consecutive failures that open the breaker. */
  readonly failureThreshold: number;
  /** How long an open breaker refuses attempts before probing, in ms. */
  readonly cooldownMs: number;
  /** Recovery probes allowed per half-open window. */
  readonly recoveryProbeLimit: number;
}

export const DEFAULT_BREAKER_POLICY: BreakerPolicy = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 5 * 60_000,
  recoveryProbeLimit: 1,
});

export type BreakerState = Readonly<
  | { phase: "CLOSED"; consecutiveFailures: number }
  | { phase: "OPEN"; openedAtMs: number; consecutiveFailures: number }
  | { phase: "HALF_OPEN"; probesIssued: number; consecutiveFailures: number }
>;

export const INITIAL_BREAKER_STATE: BreakerState = Object.freeze({
  phase: "CLOSED",
  consecutiveFailures: 0,
});

/** What one attempt may do right now, plus the state that choice produced. */
export type BreakerDecision = Readonly<
  | {
      /** Run the source. `probe: true` marks a half-open recovery probe. */
      attempt: true;
      probe: boolean;
      state: BreakerState;
    }
  | {
      /** Skip the source; nothing about it may count as an observation. */
      attempt: false;
      /** Earliest ms timestamp at which a probe becomes possible. */
      retryAtMs: number;
      state: BreakerState;
    }
>;

/**
 * Decide one attempt at `nowMs`. An OPEN breaker whose cooldown has elapsed
 * becomes HALF_OPEN here (lazily — there is no timer to fire), and HALF_OPEN
 * hands out at most `recoveryProbeLimit` probes.
 */
export function nextAttempt(
  state: BreakerState,
  policy: BreakerPolicy,
  nowMs: number,
): BreakerDecision {
  switch (state.phase) {
    case "CLOSED":
      return Object.freeze({ attempt: true as const, probe: false, state });
    case "OPEN": {
      const retryAtMs = state.openedAtMs + policy.cooldownMs;
      if (nowMs < retryAtMs) {
        return Object.freeze({ attempt: false as const, retryAtMs, state });
      }
      // Cooldown elapsed: this attempt is the first recovery probe.
      return Object.freeze({
        attempt: true as const,
        probe: true,
        state: Object.freeze({
          phase: "HALF_OPEN" as const,
          probesIssued: 1,
          consecutiveFailures: state.consecutiveFailures,
        }),
      });
    }
    case "HALF_OPEN": {
      if (state.probesIssued < policy.recoveryProbeLimit) {
        return Object.freeze({
          attempt: true as const,
          probe: true,
          state: Object.freeze({
            phase: "HALF_OPEN" as const,
            probesIssued: state.probesIssued + 1,
            consecutiveFailures: state.consecutiveFailures,
          }),
        });
      }
      // The window's probes are out; everyone else waits for their verdict.
      return Object.freeze({ attempt: false as const, retryAtMs: nowMs, state });
    }
  }
}

/** A successful attempt (probe or not) restores normal eligibility. */
export function recordSuccess(): BreakerState {
  return INITIAL_BREAKER_STATE;
}

/**
 * A failed attempt. In CLOSED it counts toward the threshold; reaching it
 * opens the breaker at `nowMs`. In HALF_OPEN the failed probe re-opens the
 * breaker with a fresh cooldown. (A failure reported for an OPEN breaker can
 * only be a late result from before it opened; the cooldown is not re-stamped
 * for it.)
 */
export function recordFailure(
  state: BreakerState,
  policy: BreakerPolicy,
  nowMs: number,
): BreakerState {
  switch (state.phase) {
    case "CLOSED": {
      const consecutiveFailures = state.consecutiveFailures + 1;
      if (consecutiveFailures >= policy.failureThreshold) {
        return Object.freeze({
          phase: "OPEN" as const,
          openedAtMs: nowMs,
          consecutiveFailures,
        });
      }
      return Object.freeze({ phase: "CLOSED" as const, consecutiveFailures });
    }
    case "HALF_OPEN":
      return Object.freeze({
        phase: "OPEN" as const,
        openedAtMs: nowMs,
        consecutiveFailures: state.consecutiveFailures + 1,
      });
    case "OPEN":
      return state;
  }
}

/** The key a breaker is tracked under: one breaker per (anchor, corridor). */
export function breakerKey(anchorSlug: string, corridorSlug: string): string {
  return `${anchorSlug}\u0000${corridorSlug}`;
}

/** The minimal candidate shape the partition needs — `RateCandidate` fits. */
export interface BreakerCandidate {
  readonly anchorSlug: string;
  readonly corridor: { readonly slug: string };
}

/** A skipped source, with its own reason — never an observation. */
export type BreakerSkippedSource = Readonly<{
  anchorSlug: string;
  corridorSlug: string;
  reason: "SOURCE_BREAKER_OPEN";
  /** Earliest ms timestamp at which a recovery probe becomes possible. */
  retryAtMs: number;
}>;

export interface BreakerPartition<C extends BreakerCandidate> {
  /** Candidates to run this cycle; probes are marked. */
  readonly attempts: ReadonlyArray<Readonly<{ candidate: C; probe: boolean }>>;
  /** Candidates the breakers refused — reported, never observed. */
  readonly skipped: readonly BreakerSkippedSource[];
  /** States after the decisions, keyed by [`breakerKey`]. */
  readonly states: ReadonlyMap<string, BreakerState>;
}

/**
 * Apply every candidate's breaker at `nowMs`: the seam a scheduled run calls
 * before it quotes anything. Unknown sources start CLOSED.
 */
export function partitionCandidates<C extends BreakerCandidate>(
  candidates: readonly C[],
  states: ReadonlyMap<string, BreakerState>,
  policy: BreakerPolicy,
  nowMs: number,
): BreakerPartition<C> {
  const attempts: Array<Readonly<{ candidate: C; probe: boolean }>> = [];
  const skipped: BreakerSkippedSource[] = [];
  const next = new Map(states);
  for (const candidate of candidates) {
    const key = breakerKey(candidate.anchorSlug, candidate.corridor.slug);
    const decision = nextAttempt(next.get(key) ?? INITIAL_BREAKER_STATE, policy, nowMs);
    next.set(key, decision.state);
    if (decision.attempt) {
      attempts.push(Object.freeze({ candidate, probe: decision.probe }));
    } else {
      skipped.push(
        Object.freeze({
          anchorSlug: candidate.anchorSlug,
          corridorSlug: candidate.corridor.slug,
          reason: "SOURCE_BREAKER_OPEN" as const,
          retryAtMs: decision.retryAtMs,
        }),
      );
    }
  }
  return Object.freeze({ attempts, skipped, states: next });
}
