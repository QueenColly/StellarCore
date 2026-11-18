import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAnchorReputation } from "@/lib/reputation/engine";
import type {
  ReputationEvidence,
  ReputationRepository,
} from "@/types/reputation";

const NOW = new Date("2026-08-31T12:00:00.000Z");

test("engine reads one 90-day window and can calculate without persistence", async () => {
  let windowStart: Date | undefined;
  let writes = 0;
  const result = await evaluateAnchorReputation("anchor", {
    evaluatedAt: NOW,
    persist: false,
    repository: repository({
      readEvidence: async (_slug, start) => {
        windowStart = start;
        return sparseEvidence();
      },
      upsertScore: async () => {
        writes += 1;
        return persisted();
      },
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(windowStart?.toISOString(), "2026-06-02T12:00:00.000Z");
  assert.equal(writes, 0);
  if (result.ok) assert.equal(result.persisted, null);
});

test("engine includes the exact 90-day boundary and excludes the next millisecond", async () => {
  const recentOutcomes = outcomes(29, "COMPLETED");
  const boundary = outcomeAtAge("ERROR", 90);
  const justOutside = outcomeAtAge("ERROR", 90, 1);

  const evaluateWith = async (candidate: ReputationEvidence["transferOutcomes"][number]) => {
    const result = await evaluateAnchorReputation("anchor", {
      evaluatedAt: NOW,
      persist: false,
      repository: repository({
        readEvidence: async (_slug, start) => repositoryEvidence([
          ...recentOutcomes,
          ...(candidate.recordedAt >= start ? [candidate] : []),
        ]),
      }),
    });
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("expected reputation evaluation to succeed");
    return result.calculation;
  };

  const atBoundary = await evaluateWith(boundary);
  const beyondBoundary = await evaluateWith(justOutside);

  assert.equal(atBoundary.evidence.outcomeCount, 30);
  assert.equal(atBoundary.metrics.fillRate90d, 0.9667);
  assert.equal(beyondBoundary.evidence.outcomeCount, 29);
  assert.equal(beyondBoundary.metrics.fillRate90d, 1);
});

test("persistence upserts current score rather than appending history", async () => {
  let rowId: string | undefined;
  let writeCount = 0;
  const repo = repository({
    upsertScore: async ({ calculation }) => {
      writeCount += 1;
      rowId ??= "one-current-row";
      return Object.freeze({
        id: rowId,
        anchorSlug: calculation.anchorSlug,
        computedAt: new Date(calculation.computedAt),
      });
    },
  });

  const first = await evaluateAnchorReputation("anchor", { repository: repo, evaluatedAt: NOW });
  const second = await evaluateAnchorReputation("anchor", {
    repository: repo,
    evaluatedAt: new Date(NOW.getTime() + 1_000),
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(writeCount, 2);
  if (first.ok && second.ok) assert.equal(first.persisted?.id, second.persisted?.id);
});

test("missing anchors and repository failures are safely classified", async () => {
  const missing = await evaluateAnchorReputation("missing", {
    repository: repository({ readEvidence: async () => null }),
  });
  const readFailure = await evaluateAnchorReputation("anchor", {
    repository: repository({
      readEvidence: async () => { throw new Error("DATABASE_URL=secret"); },
    }),
  });
  const writeFailure = await evaluateAnchorReputation("anchor", {
    repository: repository({
      upsertScore: async () => { throw new Error("Prisma secret"); },
    }),
  });

  assert.deepEqual(missing, { ok: false, anchorSlug: "missing", code: "ANCHOR_NOT_FOUND" });
  assert.equal(readFailure.ok, false);
  assert.equal(writeFailure.ok, false);
  if (!readFailure.ok) assert.equal(readFailure.code, "EVIDENCE_READ_FAILURE");
  if (!writeFailure.ok) assert.equal(writeFailure.code, "PERSISTENCE_FAILURE");
  assert.equal(JSON.stringify({ readFailure, writeFailure }).includes("secret"), false);
});

test("invalid evaluation time is rejected before repository access", async () => {
  let accessed = false;
  const result = await evaluateAnchorReputation("anchor", {
    evaluatedAt: new Date("invalid"),
    repository: repository({
      readEvidence: async () => {
        accessed = true;
        return sparseEvidence();
      },
    }),
  });
  assert.deepEqual(result, {
    ok: false,
    anchorSlug: "anchor",
    code: "INVALID_EVALUATION_TIME",
  });
  assert.equal(accessed, false);
});

function repository(overrides: Partial<ReputationRepository>): ReputationRepository {
  return Object.freeze({
    readEvidence: async () => sparseEvidence(),
    upsertScore: async () => persisted(),
    ...overrides,
  });
}

function sparseEvidence(): ReputationEvidence {
  return Object.freeze({
    anchorId: "anchor-id",
    anchorSlug: "anchor",
    status: "LIVE",
    corridorSlugs: Object.freeze([]),
    latestRates: Object.freeze([]),
    transferOutcomes: Object.freeze([]),
    snapshot: Object.freeze({
      snapshotId: "100:5:",
      readAt: NOW,
      isolationLevel: "REPEATABLE READ" as const,
    }),
  });
}

function repositoryEvidence(
  transferOutcomes: ReputationEvidence["transferOutcomes"],
): ReputationEvidence {
  return Object.freeze({
    ...sparseEvidence(),
    status: "LIVE",
    corridorSlugs: Object.freeze(["corridor-a"]),
    latestRates: Object.freeze([Object.freeze({
      corridorSlug: "corridor-a",
      capturedAt: NOW,
    })]),
    transferOutcomes: Object.freeze(transferOutcomes),
  });
}

function outcomes(
  count: number,
  status: ReputationEvidence["transferOutcomes"][number]["status"],
): ReputationEvidence["transferOutcomes"][number][] {
  return Array.from({ length: count }, (_, index) => Object.freeze({
    status,
    settlementMs: 1_000,
    slippage: 0,
    recordedAt: new Date(NOW.getTime() - index * 1_000),
  }));
}

function persisted() {
  return Object.freeze({
    id: "score-id",
    anchorSlug: "anchor",
    computedAt: NOW,
  });
}

function outcomeAtAge(
  status: ReputationEvidence["transferOutcomes"][number]["status"],
  days: number,
  extraMilliseconds = 0,
): ReputationEvidence["transferOutcomes"][number] {
  return Object.freeze({
    status,
    settlementMs: 1_000,
    slippage: 0,
    recordedAt: new Date(
      NOW.getTime() - days * 24 * 60 * 60 * 1_000 - extraMilliseconds,
    ),
  });
}
