import assert from "node:assert/strict";
import test from "node:test";

import {
  syncAnchorRegistry,
  type AnchorSyncDependencies,
  type AnchorSyncResult,
} from "@/lib/stellar/anchorSync";
import type {
  AnchorRegistryEntry,
  DiscoveredAnchor,
} from "@/types/anchor";

const ENTRY = Object.freeze({
  slug: "moneygram",
  name: "MoneyGram",
  homeDomain: "moneygram-SANDBOX.invalid.example",
}) satisfies AnchorRegistryEntry;

type RunOutcome = Readonly<{
  discovery: "OK" | "FAIL";
  persistence: "OK" | "FAIL";
}>;

/**
 * Models the suppression state machine exactly as production wires it:
 * a discovery failure suppresses the source (status DOWN); a recovery run
 * must complete both discovery and persistence before status resets to LIVE.
 */
function makeDependencies(
  runOutcome: (run: number) => RunOutcome,
): Readonly<{ dependencies: AnchorSyncDependencies; statuses: Map<string, string> }> {
  const statuses = new Map<string, string>([["moneygram", "LIVE"]]);
  let run = 0;

  const dependencies: AnchorSyncDependencies = {
    allocateOrder: async () => 1n,
    discover: async (entry) => {
      run += 1;
      if (runOutcome(run).discovery === "FAIL") {
        throw new Error("simulated discovery failure");
      }
      return Object.freeze({ ...entry }) as DiscoveredAnchor;
    },
    persist: async (anchor) => {
      if (runOutcome(run).persistence === "FAIL") {
        throw new Error("simulated persistence failure");
      }
      statuses.set(anchor.slug, "LIVE");
      return {
        slug: anchor.slug,
        name: anchor.name,
        homeDomain: anchor.homeDomain,
        tomlUrl: anchor.tomlUrl,
        seps: [],
        isTransferCapable: true,
        status: "LIVE" as never,
      };
    },
    markDown: async (slug) => {
      if (!statuses.has(slug)) return "NOT_FOUND";
      statuses.set(slug, "DOWN");
      return "MARKED_DOWN";
    },
  };

  return Object.freeze({ dependencies, statuses });
}

function runOnce(
  dependencies: AnchorSyncDependencies,
  entries: readonly AnchorRegistryEntry[],
): Promise<AnchorSyncResult> {
  return syncAnchorRegistry(entries, dependencies);
}

test("a single logical run that fails is counted once and suppresses the source exactly once", async () => {
  const { dependencies, statuses } = makeDependencies(() => ({
    discovery: "FAIL",
    persistence: "OK",
  }));

  const result = await runOnce(dependencies, [ENTRY]);

  assert.equal(statuses.get("moneygram"), "DOWN");
  assert.deepEqual(
    { attempted: result.totalAttempted, succeeded: result.succeeded, failed: result.failed },
    { attempted: 1, succeeded: 0, failed: 1 },
  );
  assert.deepEqual(
    result.failures.map(({ slug, phase, statusUpdate }) => ({ slug, phase, statusUpdate })),
    [{ slug: "moneygram", phase: "DISCOVERY", statusUpdate: "MARKED_DOWN" }],
  );
});

test("suppression persists across repeated failed runs and each run counts itself", async () => {
  const { dependencies, statuses } = makeDependencies(() => ({
    discovery: "FAIL",
    persistence: "OK",
  }));

  const first = await runOnce(dependencies, [ENTRY]);
  const second = await runOnce(dependencies, [ENTRY]);

  assert.equal(statuses.get("moneygram"), "DOWN",
    "a failed run does not reset or clear the suppression state");
  assert.equal(first.failed, 1);
  assert.equal(second.failed, 1);

  let markDownCalls = 0;
  const counting: AnchorSyncDependencies = {
    ...dependencies,
    markDown: async () => {
      markDownCalls += 1;
      return "MARKED_DOWN";
    },
  };
  await runOnce(counting, [ENTRY]);
  assert.equal(markDownCalls, 1,
    "one logical failure never double-marks the source down");
});

test("recovery resets suppression only when discovery and persistence both succeed", async () => {
  const { dependencies, statuses } = makeDependencies((run) => {
    if (run === 1) return { discovery: "FAIL", persistence: "OK" };
    if (run === 2) return { discovery: "OK", persistence: "FAIL" };
    return { discovery: "OK", persistence: "OK" };
  });

  await runOnce(dependencies, [ENTRY]);
  assert.equal(statuses.get("moneygram"), "DOWN");

  await runOnce(dependencies, [ENTRY]);
  assert.equal(statuses.get("moneygram"), "DOWN",
    "discovery success alone does not reset suppression");

  const third = await runOnce(dependencies, [ENTRY]);
  assert.deepEqual(
    { succeeded: third.succeeded, failed: third.failed },
    { succeeded: 1, failed: 0 },
  );
  assert.equal(statuses.get("moneygram"), "LIVE",
    "full recovery resets suppression exactly once");
});

test("recovery-probe failures remain distinguishable from ordinary failed runs", async () => {
  const notFound: AnchorSyncDependencies = {
    allocateOrder: async () => 1n,
    discover: async () => {
      throw new Error("simulated discovery failure");
    },
    persist: async () => {
      throw new Error("must not be reached");
    },
    markDown: async () => "NOT_FOUND",
  };
  const suppressedWriteFailed: AnchorSyncDependencies = {
    ...notFound,
    markDown: async () => {
      throw new Error("the suppression write itself failed");
    },
  };

  const notFoundRun = await runOnce(notFound, [ENTRY]);
  const writeFailedRun = await runOnce(suppressedWriteFailed, [ENTRY]);

  assert.deepEqual(
    notFoundRun.failures.map(({ statusUpdate }) => statusUpdate),
    ["NOT_FOUND"],
  );
  assert.deepEqual(
    writeFailedRun.failures.map(({ statusUpdate }) => statusUpdate),
    ["FAILED"],
  );

  const persistedOnlyFailed: AnchorSyncDependencies = {
    allocateOrder: async () => 1n,
    discover: async (entry) => Object.freeze({ ...entry }) as DiscoveredAnchor,
    persist: async () => {
      throw new Error("simulated persistence failure");
    },
    markDown: async () => "MARKED_DOWN",
  };
  const persistenceRun = await runOnce(persistedOnlyFailed, [ENTRY]);
  assert.deepEqual(
    persistenceRun.failures.map(({ phase, statusUpdate }) => ({ phase, statusUpdate })),
    [{ phase: "PERSISTENCE", statusUpdate: "NOT_ATTEMPTED" }],
    "a persistence failure leaves the suppression write untouched",
  );
});
