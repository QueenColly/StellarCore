import assert from "node:assert/strict";
import test from "node:test";

import {
  ANCHOR_DETERMINISTIC_DOWN_THRESHOLD,
  ANCHOR_RECOVERY_SUCCESS_THRESHOLD,
  ANCHOR_TRANSIENT_DEGRADED_THRESHOLD,
  ANCHOR_TRANSIENT_DOWN_THRESHOLD,
  ANCHOR_TRANSIENT_SUSTAINED_WINDOW_MS,
} from "@/constants/anchorHealth";
import {
  applyAnchorHealthObservation,
  initialAnchorHealthState,
} from "@/lib/stellar/anchorHealth";
import type {
  AnchorFailureClass,
  AnchorHealthObservation,
  AnchorHealthState,
} from "@/types/anchorHealth";

/**
 * #357: table-driven coverage of the anchor availability transition policy
 * (#165), driven by controlled sequences of discovery outcomes.
 *
 * The notation in the tables: `S` is one successful discovery, `T` one
 * transient failure, `D` one deterministic (configuration/protocol) failure,
 * `U` one unclassified failure. Observations are applied one per minute from
 * a fixed origin, so every run is fully deterministic — no wall clock, no
 * randomness, no I/O.
 */

type Outcome = "S" | "T" | "D" | "U";

const ORIGIN_MS = Date.parse("2026-10-20T00:00:00.000Z");
const STEP_MS = 60_000;

function observation(outcome: Outcome, at: Date): AnchorHealthObservation {
  if (outcome === "S") return { outcome: "SUCCESS", occurredAt: at };
  const failureClass: AnchorFailureClass =
    outcome === "T" ? "TRANSIENT" : outcome === "D" ? "DETERMINISTIC" : "UNKNOWN";
  return {
    outcome: "FAILURE",
    occurredAt: at,
    failure: { failureClass, code: `${failureClass}_CODE` },
  };
}

/** Drive one controlled sequence and record each step's published status. */
function run(sequence: readonly Outcome[], from?: AnchorHealthState): {
  statuses: string[];
  final: AnchorHealthState;
} {
  let state = from ?? initialAnchorHealthState("anchor-x");
  const statuses: string[] = [];
  sequence.forEach((outcome, index) => {
    const at = new Date(ORIGIN_MS + index * STEP_MS);
    const transition = applyAnchorHealthObservation(state, observation(outcome, at));
    statuses.push(transition.status);
    state = transition.next;
  });
  return { statuses, final: state };
}

/** A LIVE anchor with established history, built through the policy itself. */
function liveState(): AnchorHealthState {
  return run(["S", "S", "S"]).final;
}

test("consecutive failures: each row of the escalation table holds", () => {
  const table: Array<{
    name: string;
    sequence: Outcome[];
    expected: string[];
  }> = [
    {
      name: "one transient failure never moves a LIVE anchor",
      sequence: ["T"],
      expected: ["LIVE"],
    },
    {
      name: "transient failures degrade at the threshold, not before",
      sequence: ["T", "T"],
      expected: ["LIVE", "DEGRADED"],
    },
    {
      name: "transient failures publish DOWN only at the DOWN threshold",
      sequence: ["T", "T", "T"],
      expected: ["LIVE", "DEGRADED", "DOWN"],
    },
    {
      name: "a deterministic failure degrades at once but needs its threshold for DOWN",
      sequence: ["D", "D"],
      expected: ["DEGRADED", "DOWN"],
    },
    {
      name: "unclassified failures escalate no faster than transient ones",
      sequence: ["U", "U", "U"],
      expected: ["LIVE", "DEGRADED", "DOWN"],
    },
    {
      name: "a deterministic failure confirms an already-degraded outage immediately",
      sequence: ["T", "T", "D"],
      expected: ["LIVE", "DEGRADED", "DOWN"],
    },
    {
      name: "further failures never deepen DOWN",
      sequence: ["T", "T", "T", "T", "D"],
      expected: ["LIVE", "DEGRADED", "DOWN", "DOWN", "DOWN"],
    },
  ];

  // The table encodes the documented thresholds; assert the encoding itself
  // so a threshold change fails here loudly instead of silently skewing rows.
  assert.equal(ANCHOR_TRANSIENT_DEGRADED_THRESHOLD, 2);
  assert.equal(ANCHOR_TRANSIENT_DOWN_THRESHOLD, 3);
  assert.equal(ANCHOR_DETERMINISTIC_DOWN_THRESHOLD, 2);

  for (const row of table) {
    const { statuses } = run(row.sequence, liveState());
    assert.deepEqual(statuses, row.expected, row.name);
  }
});

test("recovery success: each row of the recovery table holds", () => {
  assert.equal(ANCHOR_RECOVERY_SUCCESS_THRESHOLD, 2);

  const table: Array<{
    name: string;
    sequence: Outcome[];
    expected: string[];
  }> = [
    {
      name: "one success after DOWN publishes the intermediate state, not LIVE",
      sequence: ["T", "T", "T", "S"],
      expected: ["LIVE", "DEGRADED", "DOWN", "DEGRADED"],
    },
    {
      name: "repeated successes complete the recovery to LIVE",
      sequence: ["T", "T", "T", "S", "S"],
      expected: ["LIVE", "DEGRADED", "DOWN", "DEGRADED", "LIVE"],
    },
    {
      name: "a flap during recovery starts the success count over",
      sequence: ["T", "T", "T", "S", "T", "S"],
      expected: ["LIVE", "DEGRADED", "DOWN", "DEGRADED", "DEGRADED", "DEGRADED"],
    },
    {
      name: "a degraded anchor recovers through the same repeated-evidence rule",
      sequence: ["T", "T", "S", "S"],
      expected: ["LIVE", "DEGRADED", "DEGRADED", "LIVE"],
    },
  ];

  for (const row of table) {
    const { statuses } = run(row.sequence, liveState());
    assert.deepEqual(statuses, row.expected, row.name);
  }
});

test("unknown initial state: each row of the no-history table holds", () => {
  const table: Array<{
    name: string;
    sequence: Outcome[];
    expected: string[];
  }> = [
    {
      name: "a first-ever success publishes LIVE directly",
      sequence: ["S"],
      expected: ["LIVE"],
    },
    {
      name: "failures without history never publish DEGRADED",
      sequence: ["T", "T"],
      expected: ["UNKNOWN", "UNKNOWN"],
    },
    {
      name: "an anchor that has never answered goes DOWN only at the full threshold",
      sequence: ["T", "T", "T"],
      expected: ["UNKNOWN", "UNKNOWN", "DOWN"],
    },
    {
      name: "deterministic failures without history follow the same full threshold",
      sequence: ["D", "D"],
      expected: ["UNKNOWN", "UNKNOWN"],
    },
  ];

  for (const row of table) {
    const { statuses } = run(row.sequence);
    assert.deepEqual(statuses, row.expected, row.name);
  }
});

test("sustained transient evidence may degrade without the consecutive count", () => {
  // One old failure, then another transient failure a full window later: the
  // evidence already spans 48h, so DEGRADED is justified at count 2's worth
  // of elapsed time even though the cadence was slow.
  let state = liveState();
  const first = applyAnchorHealthObservation(
    state,
    observation("T", new Date(ORIGIN_MS)),
  );
  assert.equal(first.status, "LIVE");
  state = first.next;

  const second = applyAnchorHealthObservation(
    state,
    observation("T", new Date(ORIGIN_MS + ANCHOR_TRANSIENT_SUSTAINED_WINDOW_MS)),
  );
  assert.equal(second.status, "DEGRADED");
});

test("transitions are deterministic: identical sequences produce identical results", () => {
  const sequences: Outcome[][] = [
    ["T", "T", "T", "S", "S"],
    ["D", "S", "S", "T", "T", "D"],
    ["U", "U", "S", "T", "T", "T", "S", "S"],
  ];
  for (const sequence of sequences) {
    const a = run(sequence, liveState());
    const b = run(sequence, liveState());
    assert.deepEqual(a.statuses, b.statuses);
    assert.deepEqual(JSON.parse(JSON.stringify(a.final)), JSON.parse(JSON.stringify(b.final)));
  }
});

test("every step reports statusChanged exactly when the published status moves", () => {
  let state = liveState();
  const seen: Array<{ status: string; changed: boolean }> = [];
  (["T", "T", "T", "T", "S", "S"] as Outcome[]).forEach((outcome, index) => {
    const transition = applyAnchorHealthObservation(
      state,
      observation(outcome, new Date(ORIGIN_MS + index * STEP_MS)),
    );
    seen.push({ status: transition.status, changed: transition.statusChanged });
    state = transition.next;
  });
  assert.deepEqual(seen, [
    { status: "LIVE", changed: false },
    { status: "DEGRADED", changed: true },
    { status: "DOWN", changed: true },
    { status: "DOWN", changed: false },
    { status: "DEGRADED", changed: true },
    { status: "LIVE", changed: true },
  ]);
});
