import assert from "node:assert/strict";
import test from "node:test";

import { runScheduledRefresh } from "@/lib/scheduled/refresh";

const EVALUATED_AT = new Date("2026-08-31T17:00:00.000Z");

test("controlled scheduled integration passes one persisted evaluation time from rate ingestion to reputation evaluation", async () => {
  const events: string[] = [];
  const result = await runScheduledRefresh({
    snapshotRates: async () => {
      events.push("rate-persisted");
      return {
        totalCandidates: 1,
        totalAttempted: 1,
        succeeded: 1,
        failed: 0,
        skipped: 0,
        snapshotsPersisted: 1,
        snapshots: [],
        failures: [],
        skippedSources: [],
      };
    },
    evaluateReputation: async ({ evaluatedAt }) => {
      events.push(`reputation:${evaluatedAt.toISOString()}`);
      return { attempted: 2, succeeded: 2, failed: 0, failures: [] };
    },
    now: () => EVALUATED_AT,
  });

  assert.deepEqual(events, ["rate-persisted", "reputation:2026-08-31T17:00:00.000Z"]);
  assert.equal(result.ok, true);
  assert.equal(result.rates.succeeded, 1);
  assert.equal(result.reputation.succeeded, 2);
});
