import type { AnchorStatus } from "@/app/generated/prisma/enums";
import {
  ANCHOR_DETERMINISTIC_DOWN_THRESHOLD,
  ANCHOR_RECOVERY_SUCCESS_THRESHOLD,
  ANCHOR_TRANSIENT_DEGRADED_THRESHOLD,
  ANCHOR_TRANSIENT_DOWN_THRESHOLD,
  ANCHOR_TRANSIENT_SUSTAINED_WINDOW_MS,
} from "@/constants/anchorHealth";
import type {
  AnchorFailureClass,
  AnchorHealthObservation,
  AnchorHealthState,
  AnchorHealthTransition,
} from "@/types/anchorHealth";

/**
 * Maps one discovery failure to its evidence class.
 *
 * Transport-class SEP-1 codes are TRANSIENT. Structure/protocol-class codes
 * are DETERMINISTIC. An HTTP_FAILURE is refined by status: server-side (5xx)
 * or statusless responses are TRANSIENT, while a 4xx response means the TOML
 * is gone or blocked by policy and will not recover on retry, so it is
 * DETERMINISTIC. Anything else â€” including errors that are not
 * Sep1DiscoveryError â€” is UNKNOWN and escalates no faster than classified
 * transient evidence.
 */
export function classifyAnchorFailure(error: unknown): AnchorFailureClass {
  if (typeof error !== "object" || error === null) return "UNKNOWN";

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;

  if (
    code === "INVALID_HOME_DOMAIN"
    || code === "INVALID_TOML"
    || code === "INVALID_DATA"
    || code === "MISSING_REQUIRED_DATA"
  ) {
    return "DETERMINISTIC";
  }

  if (
    code === "TIMEOUT"
    || code === "NETWORK_FAILURE"
    || code === "RESPONSE_TOO_LARGE"
  ) {
    return "TRANSIENT";
  }

  if (code === "HTTP_FAILURE") {
    const status = "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

    if (typeof status === "number" && status >= 400 && status < 500) {
      return "DETERMINISTIC";
    }

    return "TRANSIENT";
  }

  return "UNKNOWN";
}

/**
 * Creates the initial health state for an anchor that has never been
 * observed. Status UNKNOWN means no evidence exists yet, not that the anchor
 * is unhealthy.
 */
export function initialAnchorHealthState(anchorSlug: string): AnchorHealthState {
  return {
    anchorSlug,
    status: "UNKNOWN",
    consecutiveFailures: 0,
    lastFailureClass: null,
    lastFailureCode: null,
    consecutiveSuccesses: 0,
    lastObservedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastTransitionAt: null,
  };
}

/**
 * Applies one observation to the persisted state and returns the resulting
 * published status. The function is pure: identical inputs always produce an
 * identical next state, and no I/O occurs here. Persistence is the caller's
 * responsibility, so transitions are deterministic across process restarts
 * and horizontal execution.
 *
 * Transition policy (docs/anchor-health-policy.md):
 *
 * - SUCCESS evidence increments the consecutive-success counter and resets
 *   the failure counters. Recovery from DOWN or DEGRADED requires
 *   ANCHOR_RECOVERY_SUCCESS_THRESHOLD consecutive successes; the first
 *   success publishes DEGRADED. A first-ever success for an anchor with no
 *   established history publishes LIVE directly.
 * - A LIVE anchor degrades only after ANCHOR_TRANSIENT_DEGRADED_THRESHOLD
 *   consecutive transient failures, and goes DOWN only after
 *   ANCHOR_TRANSIENT_DOWN_THRESHOLD consecutive failures (or immediately when
 *   the first failure already spans the sustained window). One transient
 *   timeout therefore never publishes DOWN or DEGRADED.
 * - DETERMINISTIC configuration/protocol failures reach DOWN after
 *   ANCHOR_DETERMINISTIC_DOWN_THRESHOLD consecutive failures because retrying
 *   cannot fix them.
 * - UNKNOWN-class failures follow the transient path: they must never
 *   escalate faster than classified evidence.
 * - An anchor already DOWN stays DOWN on further failures; only recovery
 *   evidence changes its status.
 * - An anchor with no established history (UNKNOWN) never publishes DEGRADED
 *   from failures alone; it requires the full DOWN threshold.
 */
export function applyAnchorHealthObservation(
  state: AnchorHealthState,
  observation: AnchorHealthObservation,
): AnchorHealthTransition {
  if (observation.outcome === "SUCCESS") {
    return applySuccess(state, observation.occurredAt);
  }

  return applyFailure(state, observation);
}

function applySuccess(
  state: AnchorHealthState,
  occurredAt: Date,
): AnchorHealthTransition {
  const priorStatus = state.status;
  const consecutiveSuccesses = state.consecutiveSuccesses + 1;
  const nextStatus = nextSuccessStatus(priorStatus, consecutiveSuccesses);
  const statusChanged = nextStatus !== priorStatus;

  return {
    status: nextStatus,
    statusChanged,
    next: Object.freeze({
      anchorSlug: state.anchorSlug,
      status: nextStatus,
      consecutiveFailures: 0,
      lastFailureClass: null,
      lastFailureCode: null,
      consecutiveSuccesses,
      lastObservedAt: occurredAt,
      lastSuccessAt: occurredAt,
      lastFailureAt: state.lastFailureAt,
      lastTransitionAt: statusChanged ? occurredAt : state.lastTransitionAt,
    }),
  };
}

function applyFailure(
  state: AnchorHealthState,
  observation: AnchorHealthObservation,
): AnchorHealthTransition {
  const occurredAt = observation.occurredAt;
  const failure = observation.failure;
  const failureClass: AnchorFailureClass = failure?.failureClass ?? "UNKNOWN";
  const failureCode = failure?.code ?? "UNKNOWN";
  const priorStatus = state.status;
  const consecutiveFailures = state.consecutiveFailures + 1;
  const nextStatus = nextFailureStatus(
    priorStatus,
    consecutiveFailures,
    failureClass,
    state,
    occurredAt,
  );
  const statusChanged = nextStatus !== priorStatus;

  return {
    status: nextStatus,
    statusChanged,
    next: Object.freeze({
      anchorSlug: state.anchorSlug,
      status: nextStatus,
      consecutiveFailures,
      lastFailureClass: failureClass,
      lastFailureCode: failureCode,
      consecutiveSuccesses: 0,
      lastObservedAt: occurredAt,
      lastSuccessAt: state.lastSuccessAt,
      lastFailureAt: occurredAt,
      lastTransitionAt: statusChanged ? occurredAt : state.lastTransitionAt,
    }),
  };
}

function nextFailureStatus(
  priorStatus: AnchorStatus,
  consecutiveFailures: number,
  failureClass: AnchorFailureClass,
  state: AnchorHealthState,
  occurredAt: Date,
): AnchorStatus {
  // Further failures never deepen an already-published DOWN status; only
  // recovery evidence changes it.
  if (priorStatus === "DOWN") return "DOWN";

  if (priorStatus === "UNKNOWN") {
    return consecutiveFailures >= ANCHOR_TRANSIENT_DOWN_THRESHOLD
      ? "DOWN"
      : "UNKNOWN";
  }

  if (priorStatus === "LIVE") {
    if (failureClass === "DETERMINISTIC") {
      return consecutiveFailures >= ANCHOR_DETERMINISTIC_DOWN_THRESHOLD
        ? "DOWN"
        : "DEGRADED";
    }

    if (consecutiveFailures >= ANCHOR_TRANSIENT_DOWN_THRESHOLD) {
      return "DOWN";
    }

    if (
      consecutiveFailures >= ANCHOR_TRANSIENT_DEGRADED_THRESHOLD
      || transientEvidenceSustained(state, occurredAt)
    ) {
      return "DEGRADED";
    }

    return "LIVE";
  }

  // DEGRADED: deterministic failures confirm the outage immediately;
  // transient evidence escalates with the same consecutive threshold the
  // LIVE path requires to publish DOWN.
  if (failureClass === "DETERMINISTIC") {
    return "DOWN";
  }

  return consecutiveFailures >= ANCHOR_TRANSIENT_DOWN_THRESHOLD
    ? "DOWN"
    : "DEGRADED";
}

function nextSuccessStatus(
  priorStatus: AnchorStatus,
  consecutiveSuccesses: number,
): AnchorStatus {
  if (priorStatus === "LIVE") return "LIVE";

  if (consecutiveSuccesses >= ANCHOR_RECOVERY_SUCCESS_THRESHOLD) {
    return "LIVE";
  }

  // A first positive observation for an anchor with no established history
  // publishes LIVE: there is no prior healthy claim to protect from flapping.
  if (priorStatus === "UNKNOWN") {
    return "LIVE";
  }

  // DOWN or DEGRADED with one success moves to the intermediate state, which
  // still requires repeated evidence before LIVE.
  return "DEGRADED";
}

function transientEvidenceSustained(
  state: AnchorHealthState,
  occurredAt: Date,
): boolean {
  if (!state.lastFailureAt) return false;

  const elapsed = occurredAt.getTime() - state.lastFailureAt.getTime();

  return Number.isFinite(elapsed)
    && elapsed >= ANCHOR_TRANSIENT_SUSTAINED_WINDOW_MS;
}