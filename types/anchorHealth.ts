import type { AnchorStatus } from "@/app/generated/prisma/enums";

/**
 * Failure taxonomy for SEP-1 discovery evidence.
 *
 * TRANSIENT: transport-class failures that can recover without any
 * configuration change (timeouts, DNS/socket errors, 5xx responses, oversized
 * or truncated responses). They only justify a destructive health transition
 * after repeated or sustained evidence.
 *
 * DETERMINISTIC: configuration- or protocol-class failures that will not
 * recover on retry without the anchor changing its published state (invalid
 * home domain, unparseable TOML, structurally invalid data, missing required
 * fields, or a 4xx response for the TOML). They justify a faster escalation
 * path.
 *
 * UNKNOWN: failures whose cause could not be classified (an unexpected error
 * escaping discovery). They follow the transient escalation path and never
 * escalate faster than classified evidence.
 */
export type AnchorFailureClass = "TRANSIENT" | "DETERMINISTIC" | "UNKNOWN";

/**
 * One bounded health-evidence record persisted per anchor. It contains only
 * counters and timestamps â€” no error text â€” so the state machine can make
 * deterministic transitions across process restarts and horizontal runs.
 */
export type AnchorHealthState = Readonly<{
  anchorSlug: string;
  /** Last published (persisted) anchor status. */
  status: AnchorStatus;
  /** Consecutive discovery failures since the last success. */
  consecutiveFailures: number;
  /** Class of the most recent failure, null after a success. */
  lastFailureClass: AnchorFailureClass | null;
  /** SEP-1 error code of the most recent failure, null after a success. */
  lastFailureCode: string | null;
  /** Consecutive discovery successes since the last failure. */
  consecutiveSuccesses: number;
  /** Timestamp of the most recent observation of any kind. */
  lastObservedAt: Date | null;
  /** Timestamp of the most recent successful discovery. */
  lastSuccessAt: Date | null;
  /** Timestamp of the most recent failure. */
  lastFailureAt: Date | null;
  /** Timestamp of the most recent status transition, null if none recorded. */
  lastTransitionAt: Date | null;
}>;

/**
 * Input to one state-machine step: one new observation plus the time it
 * occurred. Failure observations carry their classified evidence.
 */
export type AnchorHealthObservation = Readonly<{
  outcome: "SUCCESS" | "FAILURE";
  occurredAt: Date;
  failure?: Readonly<{
    failureClass: AnchorFailureClass;
    code: string;
  }>;
}>;

/**
 * Result of one state-machine step. `statusChanged` is true only when the
 * published status differs from the input state's status.
 */
export type AnchorHealthTransition = Readonly<{
  status: AnchorStatus;
  statusChanged: boolean;
  next: AnchorHealthState;
}>;

/**
 * Outcome of recording one observation through the persistence boundary.
 * ANCHOR_NOT_FOUND means no anchor row exists for the slug, so there is no
 * published status to update.
 */
export type AnchorEvidenceOutcome =
  | Readonly<{ kind: "RECORDED"; status: AnchorStatus; statusChanged: boolean }>
  | Readonly<{ kind: "ANCHOR_NOT_FOUND" }>;

/**
 * Bounded per-anchor transition record for a sync run summary. It reports the
 * observed health status and whether it changed; it makes no claim about
 * transfer success or trustworthiness.
 */
export type AnchorStatusTransition = Readonly<{
  slug: string;
  status: AnchorStatus;
  statusChanged: boolean;
}>;