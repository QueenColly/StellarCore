import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";

import {
  runScheduledRefresh,
  type ScheduledRefreshDependencies,
} from "@/lib/scheduled/refresh";
import type { SafeLiveRateRunSummary } from "@/types/liveRateSource";
import type { ReputationEvaluationRunSummary } from "@/lib/reputation/run";
import type { ScheduledRefreshResult } from "@/types/scheduled";
import type { RateEngineFailure } from "@/types/rates";

const RUN_1_STARTED_AT = new Date("2026-10-21T00:00:00.000Z");
const RUN_1_COMPLETED_AT = new Date("2026-10-21T00:00:01.000Z");
const RUN_2_STARTED_AT = new Date("2026-10-21T00:05:00.000Z");
const RUN_2_COMPLETED_AT = new Date("2026-10-21T00:05:01.000Z");
const INDEPENDENT_RUN_STARTED_AT = new Date("2026-10-22T00:00:00.000Z");
const INDEPENDENT_RUN_COMPLETED_AT = new Date("2026-10-22T00:00:01.000Z");

function rateSummary(overrides: Partial<SafeLiveRateRunSummary> = {}): SafeLiveRateRunSummary {
  return Object.freeze({
    totalCandidates: 1,
    totalAttempted: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
    snapshotsPersisted: 1,
    snapshots: [],
    failures: [],
    skippedSources: [],
    ...overrides,
  });
}

function reputationSummary(overrides: Partial<ReputationEvaluationRunSummary> = {}): ReputationEvaluationRunSummary {
  return Object.freeze({
    attempted: 3,
    succeeded: 3,
    failed: 0,
    failures: [],
    ...overrides,
  });
}

function baseDependencies(overrides: Partial<ScheduledRefreshDependencies> = {}): ScheduledRefreshDependencies {
  return Object.freeze({
    snapshotRates: async () => rateSummary(),
    evaluateReputation: async () => reputationSummary(),
    now: () => RUN_1_STARTED_AT,
    ...overrides,
  });
}

test("retry preserves the original logical run identity", async () => {
  const logicalRunId = randomUUID();
  const failures: readonly RateEngineFailure[] = [
    { anchorSlug: "zeam", corridorSlug: "usdc-us-brl-br", phase: "QUOTE", code: "QUOTE_FAILURE" },
  ];

  let attemptNumber = 0;
  let nowCallCount = 0;
  const runResults: ScheduledRefreshResult[] = [];

  const deps = baseDependencies({
    snapshotRates: async () => {
      attemptNumber += 1;
      if (attemptNumber === 1) {
        return rateSummary({
          succeeded: 0,
          failed: 1,
          snapshotsPersisted: 0,
          failures,
        });
      }
      return rateSummary();
    },
    now: () => {
      const result = nowCallCount < 2 ? RUN_1_STARTED_AT : RUN_2_STARTED_AT;
      nowCallCount += 1;
      return result;
    },
    runId: logicalRunId,
    attempt: 1,
  });

  const firstAttempt = await runScheduledRefresh(deps);
  runResults.push(firstAttempt);

  const secondAttempt = await runScheduledRefresh({
    ...deps,
    attempt: 2,
  });
  runResults.push(secondAttempt);

  assert.equal(runResults.length, 2);
  assert.equal(firstAttempt.runId, logicalRunId);
  assert.equal(secondAttempt.runId, logicalRunId);
  assert.equal(firstAttempt.attempt, 1);
  assert.equal(secondAttempt.attempt, 2);
  assert.equal(firstAttempt.startedAt, RUN_1_STARTED_AT.toISOString());
  assert.equal(secondAttempt.startedAt, RUN_2_STARTED_AT.toISOString());
  assert.notEqual(firstAttempt.completedAt, secondAttempt.completedAt);
});

test("attempt-level metadata remains distinguishable from logical-run metadata", async () => {
  const logicalRunId = randomUUID();
  const failures: readonly RateEngineFailure[] = [
    { anchorSlug: "zeam", corridorSlug: "usdc-us-brl-br", phase: "QUOTE", code: "QUOTE_FAILURE" },
  ];

  let attemptNumber = 0;
  let nowCallCount = 0;
  const runResults: ScheduledRefreshResult[] = [];

  const deps = baseDependencies({
    snapshotRates: async () => {
      attemptNumber += 1;
      if (attemptNumber === 1) {
        return rateSummary({
          succeeded: 0,
          failed: 1,
          snapshotsPersisted: 0,
          failures,
        });
      }
      return rateSummary();
    },
    now: () => {
      const result = nowCallCount < 2 ? RUN_1_STARTED_AT : RUN_2_STARTED_AT;
      nowCallCount += 1;
      return result;
    },
    runId: logicalRunId,
    attempt: 1,
  });

  const firstAttempt = await runScheduledRefresh(deps);
  runResults.push(firstAttempt);

  const secondAttempt = await runScheduledRefresh({
    ...deps,
    attempt: 2,
  });
  runResults.push(secondAttempt);

  assert.equal(firstAttempt.runId, logicalRunId);
  assert.equal(secondAttempt.runId, logicalRunId);
  assert.equal(firstAttempt.attempt, 1);
  assert.equal(secondAttempt.attempt, 2);
  assert.notEqual(firstAttempt.startedAt, secondAttempt.startedAt);
  assert.notEqual(firstAttempt.completedAt, secondAttempt.completedAt);
  assert.equal(firstAttempt.rates.failed, 1);
  assert.equal(secondAttempt.rates.failed, 0);
});

test("a retry does not create a duplicate logical result", async () => {
  const logicalRunId = randomUUID();
  const persistedSnapshots: string[] = [];

  let attemptNumber = 0;
  let nowCallCount = 0;
  const runResults: ScheduledRefreshResult[] = [];

  const deps = baseDependencies({
    snapshotRates: async () => {
      attemptNumber += 1;
      if (attemptNumber === 1) {
        persistedSnapshots.push("snapshot-1");
        return rateSummary({ snapshotsPersisted: 1 });
      }
      persistedSnapshots.push("snapshot-2");
      return rateSummary({ snapshotsPersisted: 1 });
    },
    now: () => {
      const result = nowCallCount < 2 ? RUN_1_STARTED_AT : RUN_2_STARTED_AT;
      nowCallCount += 1;
      return result;
    },
    runId: logicalRunId,
    attempt: 1,
  });

  const firstAttempt = await runScheduledRefresh(deps);
  runResults.push(firstAttempt);

  const secondAttempt = await runScheduledRefresh({
    ...deps,
    attempt: 2,
  });
  runResults.push(secondAttempt);

  assert.equal(runResults.filter((r) => r.runId === logicalRunId).length, 2);
  assert.equal(new Set(runResults.map((r) => r.runId)).size, 1);
  assert.equal(firstAttempt.runId, secondAttempt.runId);
  assert.equal(firstAttempt.attempt, 1);
  assert.equal(secondAttempt.attempt, 2);
  assert.deepEqual(persistedSnapshots, ["snapshot-1", "snapshot-2"]);
});

test("independent scheduled runs receive distinct logical run identities", async () => {
  const run1Deps = baseDependencies({
    snapshotRates: async () => rateSummary(),
    now: () => RUN_1_STARTED_AT,
  });
  const run2Deps = baseDependencies({
    snapshotRates: async () => rateSummary(),
    now: () => RUN_2_STARTED_AT,
  });
  const independentRunDeps = baseDependencies({
    snapshotRates: async () => rateSummary(),
    now: () => INDEPENDENT_RUN_STARTED_AT,
  });

  const run1 = await runScheduledRefresh(run1Deps);
  const run2 = await runScheduledRefresh(run2Deps);
  const independentRun = await runScheduledRefresh(independentRunDeps);

  assert.notEqual(run1.runId, run2.runId);
  assert.notEqual(run1.runId, independentRun.runId);
  assert.notEqual(run2.runId, independentRun.runId);
  assert.equal(run1.attempt, 1);
  assert.equal(run2.attempt, 1);
  assert.equal(independentRun.attempt, 1);
});

test("retry of failed rate ingestion preserves logical run identity while reputation evaluates", async () => {
  const logicalRunId = randomUUID();
  const rateFailure: readonly RateEngineFailure[] = [
    { anchorSlug: "zeam", corridorSlug: "usdc-us-brl-br", phase: "QUOTE", code: "QUOTE_FAILURE" },
  ];

  let attemptNumber = 0;
  let nowCallCount = 0;
  const runResults: ScheduledRefreshResult[] = [];

  const deps = baseDependencies({
    snapshotRates: async () => {
      attemptNumber += 1;
      if (attemptNumber === 1) {
        return rateSummary({
          succeeded: 0,
          failed: 1,
          snapshotsPersisted: 0,
          failures: rateFailure,
        });
      }
      return rateSummary();
    },
    evaluateReputation: async ({ evaluatedAt }) => {
      return reputationSummary();
    },
    now: () => {
      const result = nowCallCount < 2 ? RUN_1_STARTED_AT : RUN_2_STARTED_AT;
      nowCallCount += 1;
      return result;
    },
    runId: logicalRunId,
    attempt: 1,
  });

  const firstAttempt = await runScheduledRefresh(deps);
  runResults.push(firstAttempt);

  const secondAttempt = await runScheduledRefresh({
    ...deps,
    attempt: 2,
  });
  runResults.push(secondAttempt);

  assert.equal(firstAttempt.runId, logicalRunId);
  assert.equal(secondAttempt.runId, logicalRunId);
  assert.equal(firstAttempt.ok, false);
  assert.equal(secondAttempt.ok, true);
  assert.equal(firstAttempt.attempt, 1);
  assert.equal(secondAttempt.attempt, 2);
  assert.equal(firstAttempt.rates.failed, 1);
  assert.equal(secondAttempt.rates.failed, 0);
  assert.equal(firstAttempt.reputation.succeeded, 3);
  assert.equal(secondAttempt.reputation.succeeded, 3);
});