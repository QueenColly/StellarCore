import assert from "node:assert/strict";
import test from "node:test";

import {
  breakerKey,
  DEFAULT_BREAKER_POLICY,
  INITIAL_BREAKER_STATE,
  nextAttempt,
  partitionCandidates,
  recordFailure,
  recordSuccess,
  type BreakerPolicy,
  type BreakerState,
} from "@/lib/rates/sourceBreaker";

/**
 * #356: cooldown expiry and the half-open recovery-probe limit, driven with a
 * controlled clock (plain ms numbers) and deterministic scripted outcomes.
 */

const POLICY: BreakerPolicy = Object.freeze({
  failureThreshold: 3,
  cooldownMs: 60_000,
  recoveryProbeLimit: 1,
});

/** Scripted outcomes: fail the state `n` times at `nowMs`. */
function failTimes(state: BreakerState, n: number, nowMs: number): BreakerState {
  let next = state;
  for (let i = 0; i < n; i += 1) {
    next = recordFailure(next, POLICY, nowMs);
  }
  return next;
}

test("failures below the threshold keep the source closed and eligible", () => {
  const state = failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold - 1, 1_000);
  assert.equal(state.phase, "CLOSED");
  const decision = nextAttempt(state, POLICY, 2_000);
  assert.ok(decision.attempt && !decision.probe, "still a normal attempt, not a probe");
});

test("an open breaker skips every attempt before cooldown expiry", () => {
  const openedAt = 10_000;
  const open = failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold, openedAt);
  assert.equal(open.phase, "OPEN");

  // Repeated cycles inside the cooldown: skipped every time, with the same
  // honest retry time, and the state does not drift.
  for (const nowMs of [openedAt, openedAt + 1, openedAt + 30_000, openedAt + 59_999]) {
    const decision = nextAttempt(open, POLICY, nowMs);
    assert.equal(decision.attempt, false, `still open at +${nowMs - openedAt}ms`);
    if (!decision.attempt) {
      assert.equal(decision.retryAtMs, openedAt + POLICY.cooldownMs);
      assert.equal(decision.state, open);
    }
  }
});

test("after cooldown, only the allowed recovery probe runs", () => {
  const openedAt = 10_000;
  const open = failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold, openedAt);
  const afterCooldown = openedAt + POLICY.cooldownMs;

  const first = nextAttempt(open, POLICY, afterCooldown);
  assert.ok(first.attempt && first.probe, "the first attempt after cooldown is the probe");

  // The window's single probe is out: the next attempt is skipped, not run.
  const second = nextAttempt(first.state, POLICY, afterCooldown + 1);
  assert.equal(second.attempt, false, "a second probe must not run while the first is out");
});

test("a higher probe limit allows exactly that many probes, no more", () => {
  const policy: BreakerPolicy = Object.freeze({ ...POLICY, recoveryProbeLimit: 2 });
  let state: BreakerState = Object.freeze({
    phase: "OPEN",
    openedAtMs: 0,
    consecutiveFailures: 3,
  });

  const outcomes: boolean[] = [];
  for (let i = 0; i < 4; i += 1) {
    const decision = nextAttempt(state, policy, policy.cooldownMs + i);
    outcomes.push(decision.attempt);
    state = decision.state;
  }
  assert.deepEqual(outcomes, [true, true, false, false]);
});

test("a successful probe returns the source to normal eligibility", () => {
  const open = failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold, 10_000);
  const probe = nextAttempt(open, POLICY, 10_000 + POLICY.cooldownMs);
  assert.ok(probe.attempt && probe.probe);

  const recovered = recordSuccess();
  assert.deepEqual(recovered, INITIAL_BREAKER_STATE);

  // Normal attempts again — not probes — and the failure count starts fresh:
  // the next single failure must not re-open the breaker.
  const decision = nextAttempt(recovered, POLICY, 10_000 + POLICY.cooldownMs + 1);
  assert.ok(decision.attempt && !decision.probe);
  assert.equal(recordFailure(recovered, POLICY, 200_000).phase, "CLOSED");
});

test("a failed probe re-opens the breaker with a fresh cooldown", () => {
  const openedAt = 10_000;
  const open = failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold, openedAt);
  const probeAt = openedAt + POLICY.cooldownMs;
  const probe = nextAttempt(open, POLICY, probeAt);
  assert.ok(probe.attempt);

  const reopened = recordFailure(probe.state, POLICY, probeAt);
  assert.equal(reopened.phase, "OPEN");

  // Still refused just before the new cooldown ends, probing again at it.
  const early = nextAttempt(reopened, POLICY, probeAt + POLICY.cooldownMs - 1);
  assert.equal(early.attempt, false);
  const retry = nextAttempt(reopened, POLICY, probeAt + POLICY.cooldownMs);
  assert.ok(retry.attempt && retry.probe);
});

test("skipped probes are not represented as fresh rate observations", () => {
  const healthy = { anchorSlug: "anchor-ok", corridor: { slug: "usdc-us-brl-br" } };
  const broken = { anchorSlug: "anchor-down", corridor: { slug: "usdc-us-brl-br" } };
  const states = new Map<string, BreakerState>([
    [
      breakerKey(broken.anchorSlug, broken.corridor.slug),
      failTimes(INITIAL_BREAKER_STATE, POLICY.failureThreshold, 10_000),
    ],
  ]);

  const nowMs = 20_000; // inside the cooldown
  const partition = partitionCandidates([healthy, broken], states, POLICY, nowMs);

  // The deterministic fake "run": every attempted candidate yields exactly
  // one observation. Skips never enter it.
  const observations = partition.attempts.map(({ candidate }) => ({
    anchorSlug: candidate.anchorSlug,
    corridorSlug: candidate.corridor.slug,
    capturedAtMs: nowMs,
  }));

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.anchorSlug, "anchor-ok");
  assert.deepEqual(partition.skipped, [
    {
      anchorSlug: "anchor-down",
      corridorSlug: "usdc-us-brl-br",
      reason: "SOURCE_BREAKER_OPEN",
      retryAtMs: 10_000 + POLICY.cooldownMs,
    },
  ]);
  // The skip is its own record with its own reason — nothing downstream can
  // read it back as a fresh observation of the source.
  assert.ok(
    observations.every((o) => o.anchorSlug !== "anchor-down"),
    "a skipped source must not appear among observations",
  );
});

test("a full lifecycle under a controlled clock: fail, wait, probe, recover", () => {
  let clock = 0;
  let state: BreakerState = INITIAL_BREAKER_STATE;
  const probe = () => nextAttempt(state, POLICY, clock);

  // Three scripted failures open the breaker at t=3.
  for (const t of [1, 2, 3]) {
    clock = t;
    const decision = nextAttempt(state, POLICY, clock);
    assert.ok(decision.attempt);
    state = recordFailure(decision.state, POLICY, clock);
  }
  assert.equal(state.phase, "OPEN");

  // Scheduled runs inside the cooldown skip without touching the source.
  clock = 3 + POLICY.cooldownMs - 1;
  assert.equal(probe().attempt, false);

  // Cooldown over: the one probe runs and fails; the breaker re-opens.
  clock = 3 + POLICY.cooldownMs;
  let decision = probe();
  assert.ok(decision.attempt && decision.probe);
  state = recordFailure(decision.state, POLICY, clock);
  assert.equal(state.phase, "OPEN");

  // Next window's probe succeeds; the source is ordinary again.
  clock += POLICY.cooldownMs;
  decision = probe();
  assert.ok(decision.attempt && decision.probe);
  state = recordSuccess();
  clock += 1;
  decision = probe();
  assert.ok(decision.attempt && !decision.probe, "recovered sources attempt normally");
});

test("the default policy carries sane bounds", () => {
  assert.ok(DEFAULT_BREAKER_POLICY.failureThreshold >= 1);
  assert.ok(DEFAULT_BREAKER_POLICY.cooldownMs > 0);
  assert.equal(DEFAULT_BREAKER_POLICY.recoveryProbeLimit, 1);
});
