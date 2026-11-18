import assert from "node:assert/strict";
import test from "node:test";

import {
  runScheduledRefresh,
  type ScheduledRefreshDependencies,
} from "@/lib/scheduled/refresh";
import { getScheduledRefreshResponse } from "@/lib/scheduled/http";
import type { SuppressionRepository } from "@/lib/scheduled/suppressionRepository";
import type { SafeLiveRateRunSummary } from "@/types/liveRateSource";
import type { ScheduledSuppressionFailureInput } from "@/types/suppression";

const SECRET = "local-test-cron-secret";
const STARTED_AT = new Date("2026-10-19T09:00:00.000Z");
const COMPLETED_AT = new Date("2026-10-19T09:00:01.000Z");

/**
 * Regression guard: a single scheduled run must record each eligible
 * deterministic failure exactly once, including while its HTTP response is
 * generated and serialized. The run records failures before the response is
 * built, so any second write for the same failure in route handling would
 * double-increment the durable suppression counters.
 */

function countingRepository(): Readonly<{
  repository: SuppressionRepository;
  counters: Map<string, number>;
  inputs: ScheduledSuppressionFailureInput[];
}> {
  const counters = new Map<string, number>();
  const inputs: ScheduledSuppressionFailureInput[] = [];
  const repository: SuppressionRepository = Object.freeze({
    listSuppressed: async () => [],
    recordDeterministicFailure: async (input: ScheduledSuppressionFailureInput) => {
      const key = `${input.anchorSlug}\0${input.corridorSlug}`;
      counters.set(key, (counters.get(key) ?? 0) + 1);
      inputs.push(input);
      return {} as never;
    },
    reactivate: async () => null,
  });
  return Object.freeze({ repository, counters, inputs });
}

function mixedFailureSummary(): SafeLiveRateRunSummary {
  return Object.freeze({
    totalCandidates: 4,
    totalAttempted: 4,
    succeeded: 0,
    failed: 4,
    skipped: 0,
    snapshotsPersisted: 0,
    snapshots: [],
    failures: [
      // Eligible: deterministic configuration failure.
      {
        anchorSlug: "anchor-config",
        corridorSlug: "usdc-us-brl-br",
        phase: "NORMALIZATION",
        code: "INVALID_ANCHOR",
      },
      // Eligible: deterministic protocol failure.
      {
        anchorSlug: "anchor-protocol",
        corridorSlug: "usdc-us-brl-br",
        phase: "NORMALIZATION",
        code: "ASSET_MISMATCH",
      },
      // Ineligible: transient quote failure.
      {
        anchorSlug: "anchor-transient",
        corridorSlug: "usdc-us-brl-br",
        phase: "QUOTE",
        code: "QUOTE_FAILURE",
      },
      // Ineligible: normalization failure without a deterministic code.
      {
        anchorSlug: "anchor-unclassified",
        corridorSlug: "usdc-us-brl-br",
        phase: "NORMALIZATION",
        code: "NORMALIZATION_FAILURE",
      },
    ],
    skippedSources: [],
  });
}

function dependencies(
  repository: SuppressionRepository,
): ScheduledRefreshDependencies {
  let clockCalls = 0;
  return Object.freeze({
    snapshotRates: async () => mixedFailureSummary(),
    evaluateReputation: async () =>
      Object.freeze({ attempted: 1, succeeded: 1, failed: 0, failures: [] }) as Awaited<
        ReturnType<ScheduledRefreshDependencies["evaluateReputation"]>
      >,
    suppressions: repository,
    now: () => (clockCalls++ % 2 === 0 ? STARTED_AT : COMPLETED_AT),
  });
}

test("one scheduled run records each eligible deterministic failure exactly once, through response generation", async () => {
  const { repository, counters, inputs } = countingRepository();

  const headers = new Headers({ authorization: `Bearer ${SECRET}` });
  const response = await getScheduledRefreshResponse(
    new Request("http://localhost/api/internal/cron/refresh", { headers }),
    {
      cronSecret: SECRET,
      run: () => runScheduledRefresh(dependencies(repository)),
    },
  );

  assert.equal(response.status, 200);

  // Serializing the response must not write again.
  const body = (await response.json()) as {
    ok: boolean;
    rates: { failed: number; failures: readonly { code: string }[] };
  };
  assert.deepEqual(
    [...counters.values()],
    [1, 1],
    "each eligible failure increments its durable counter exactly once per run",
  );
  assert.equal(inputs.length, 2);

  // Only the two deterministic failures were recorded, with faithful inputs…
  assert.deepEqual(inputs.map((input) => input.anchorSlug).sort(), [
    "anchor-config",
    "anchor-protocol",
  ]);
  assert.deepEqual(
    inputs.find((input) => input.anchorSlug === "anchor-config"),
    {
      anchorSlug: "anchor-config",
      corridorSlug: "usdc-us-brl-br",
      reason: "PERMANENT_CONFIGURATION",
      failureCode: "INVALID_ANCHOR",
      failurePhase: "NORMALIZATION",
      observedAt: STARTED_AT,
    },
  );
  // …and the transient and unclassified failures never touched the counters.
  assert.equal(inputs.some((input) => input.anchorSlug === "anchor-transient"), false);
  assert.equal(inputs.some((input) => input.anchorSlug === "anchor-unclassified"), false);

  // The response shape is unchanged: every failure still appears in the body,
  // eligible or not, in the engine's order.
  assert.equal(body.ok, false);
  assert.equal(body.rates.failed, 4);
  assert.deepEqual(
    body.rates.failures.map(({ code }) => code),
    ["INVALID_ANCHOR", "ASSET_MISMATCH", "QUOTE_FAILURE", "NORMALIZATION_FAILURE"],
  );
});

test("re-serializing the same run result never re-records failures", async () => {
  const { repository, counters } = countingRepository();

  const result = await runScheduledRefresh(dependencies(repository));
  assert.deepEqual([...counters.values()], [1, 1]);

  // Response generation from an already-computed result is pure serialization.
  for (let round = 0; round < 3; round += 1) {
    const headers = new Headers({ authorization: `Bearer ${SECRET}` });
    const response = await getScheduledRefreshResponse(
      new Request("http://localhost/api/internal/cron/refresh", { headers }),
      { cronSecret: SECRET, run: async () => result },
    );
    assert.equal(response.status, 200);
    await response.json();
  }

  assert.deepEqual(
    [...counters.values()],
    [1, 1],
    "route handling must not reapply failures the run already recorded",
  );
});
