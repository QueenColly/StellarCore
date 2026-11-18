/**
 * Evidence thresholds for anchor availability transitions.
 *
 * The policy is documented in docs/anchor-health-policy.md and implemented by
 * the pure state machine in lib/stellar/anchorHealth.ts. All thresholds are
 * architectural invariants expressed as bounded counters and windows; they are
 * never derived from unbounded history.
 */

/**
 * Consecutive transient discovery failures required before a previously
 * healthy (LIVE) anchor transitions to DEGRADED.
 */
export const ANCHOR_TRANSIENT_DEGRADED_THRESHOLD = 2;

/**
 * Consecutive transient discovery failures required before a previously
 * healthy (LIVE) anchor transitions to DOWN. With the default refresh
 * cadence (daily cron) this requires three consecutive failed sync runs,
 * so one transient timeout never publishes DOWN.
 */
export const ANCHOR_TRANSIENT_DOWN_THRESHOLD = 3;

/**
 * Consecutive deterministic (configuration/protocol) failures required before
 * a previously healthy (LIVE) anchor transitions to DOWN. Deterministic
 * failures do not recover on retry without the anchor changing its published
 * state, so a shorter path is justified.
 */
export const ANCHOR_DETERMINISTIC_DOWN_THRESHOLD = 2;

/**
 * Time window over which transient failures are considered sustained. When
 * the first recorded failure is older than this window, a further transient
 * failure may escalate immediately because the evidence already spans a
 * long period, regardless of run cadence.
 */
export const ANCHOR_TRANSIENT_SUSTAINED_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Consecutive successful discoveries required before a DOWN or DEGRADED
 * anchor returns to LIVE. A single success after an outage is treated as a
 * recovery signal only after it repeats, so a one-off flap does not flip the
 * published status back and forth.
 */
export const ANCHOR_RECOVERY_SUCCESS_THRESHOLD = 2;