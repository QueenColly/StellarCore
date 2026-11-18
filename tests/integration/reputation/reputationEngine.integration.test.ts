import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAnchorReputation } from "@/lib/reputation/engine";
import type { ReputationEvidence, ReputationRepository } from "@/types/reputation";

const NOW = new Date("2026-08-31T12:00:00.000Z");

test("controlled evidence composes through calculation and current-score persistence", async () => {
  let persistedCalculation;
  const evidence: ReputationEvidence = Object.freeze({
    anchorId: "controlled-anchor-id",
    anchorSlug: "controlled-anchor",
    status: "LIVE",
    corridorSlugs: Object.freeze(["corridor-a", "corridor-b"]),
    latestRates: Object.freeze([
      Object.freeze({ corridorSlug: "corridor-a", capturedAt: NOW }),
      Object.freeze({
        corridorSlug: "corridor-b",
        capturedAt: new Date(NOW.getTime() - 120_001),
      }),
    ]),
    transferOutcomes: Object.freeze(Array.from({ length: 30 }, (_, index) =>
      Object.freeze({
        status: index < 24 ? "COMPLETED" as const : "ERROR" as const,
        settlementMs: 1_000,
        slippage: 0,
        recordedAt: new Date(NOW.getTime() - index * 1_000),
      }))),
    snapshot: Object.freeze({
      snapshotId: "100:5:",
      readAt: NOW,
      isolationLevel: "REPEATABLE READ" as const,
    }),
  });
  const repository: ReputationRepository = Object.freeze({
    readEvidence: async () => evidence,
    upsertScore: async ({ calculation }) => {
      persistedCalculation = calculation;
      return Object.freeze({
        id: "current-score",
        anchorSlug: calculation.anchorSlug,
        computedAt: new Date(calculation.computedAt),
      });
    },
  });

  const result = await evaluateAnchorReputation("controlled-anchor", {
    repository,
    evaluatedAt: NOW,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.calculation.state, "established");
  assert.equal(result.calculation.score, 75);
  assert.equal(result.calculation.components.transferReliability.score, 80);
  assert.equal(result.calculation.components.rateFreshness.score, 50);
  assert.equal(result.calculation.components.coverage.score, 50);
  assert.equal(persistedCalculation, result.calculation);
});
