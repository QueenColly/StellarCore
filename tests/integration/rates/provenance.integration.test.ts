import assert from "node:assert/strict";
import test from "node:test";

import { computeFreshMedian } from "@/lib/rates/median";
import { runRateEngine } from "@/lib/rates/rateEngine";
import { computeRateSourceConfigurationFingerprint } from "@/lib/rates/sourceConfigurationFingerprint";
import { traceRateSnapshotProvenance } from "@/lib/rates/provenanceRepository";
import type { RateSnapshotProvenanceRepository } from "@/lib/rates/provenanceRepository";
import type { RateCandidate, RateSnapshotRepository } from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";

const USDC = "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as const;
const BRL = "iso4217:BRL" as const;
const NOW = new Date("2026-10-22T09:00:00.000Z");

/**
 * Offline composition test for the auditable lineage chain (#113): reviewed
 * candidate → engine run → snapshot + provenance rows written together →
 * provenance lookup from a snapshot id. No network, no live database.
 */
test("every persisted snapshot traces to its capture run and reviewed configuration (#113)", async () => {
  const store = inMemoryStore();
  const result = await runRateEngine(
    [source("zeam"), source("moneygram")],
    {
      quote: async (candidate) => indicative(candidate),
      repository: store.snapshotRepository,
      now: () => NOW,
      captureRunId: "run-2026-10-22T09:00",
    },
  );

  assert.equal(result.snapshotsPersisted, 2);
  assert.equal(store.snapshots.length, 2);
  assert.equal(store.provenance.length, 2);

  for (const snapshot of store.snapshots) {
    const trace = await traceRateSnapshotProvenance(
      snapshot.id,
      store.provenanceRepository,
    );
    assert.equal(trace.status, "available");
    if (trace.status !== "available") return;

    // Referential integrity: exactly one provenance row per snapshot, keyed
    // to that snapshot id, echoing capture-time truth.
    assert.equal(trace.provenance.snapshotId, snapshot.id);
    assert.equal(trace.provenance.captureRunId, "run-2026-10-22T09:00");
    assert.equal(trace.provenance.sourceType, "sep38_indicative_price");
    assert.equal(trace.provenance.requestShapeVersion, "sep38-indicative-request-v1");
    assert.equal(trace.provenance.anchorSlug, snapshot.anchorSlug);
    assert.equal(trace.provenance.corridorSlug, "usdc-us-brl-br");
    assert.match(trace.provenance.configurationDigest, /^[0-9a-f]{64}$/);
    assert.equal(trace.provenance.capturedAt.getTime(), snapshot.capturedAt.getTime());
  }

  // Provenance is capture-time: both candidates of one run share one run id
  // but keep their own reviewed configuration identity.
  const digests = store.provenance.map(({ configurationDigest }) => configurationDigest);
  assert.equal(new Set(digests).size, 2);

  // The latest-rate read path is unaffected by lineage persistence.
  const median = computeFreshMedian(store.snapshots.map((snapshot) => ({
    anchorSlug: snapshot.anchorSlug,
    corridorSlug: snapshot.corridorSlug,
    rate: snapshot.rate,
    capturedAt: snapshot.capturedAt,
  })), NOW);
  assert.equal(median.state, "healthy");
  assert.equal(median.median, "4.5");
});

test("failed and skipped candidates never appear as snapshots or provenance (#113)", async () => {
  const store = inMemoryStore();
  await runRateEngine(
    [source("offline-anchor"), source("zeam"), source("zeam")],
    {
      quote: async (candidate) => {
        if (candidate.anchorSlug === "offline-anchor") throw new Error("timeout");
        return indicative(candidate);
      },
      repository: store.snapshotRepository,
      now: () => NOW,
      captureRunId: "run-partial",
    },
  );

  assert.deepEqual(store.snapshots.map(({ anchorSlug }) => anchorSlug), ["zeam"]);
  assert.deepEqual(store.provenance.map(({ anchorSlug }) => anchorSlug), ["zeam"]);
  assert.equal(store.provenance[0]?.captureRunId, "run-partial");
});

test("legacy snapshots without provenance trace truthfully as unavailable, never guessed (#113)", async () => {
  const store = inMemoryStore();

  // A legacy row written before provenance existed: snapshot only.
  store.snapshots.push({
    id: "legacy-snapshot",
    anchorSlug: "zeam",
    corridorSlug: "usdc-us-brl-br",
    rate: "5.3",
    sourceAmount: "100",
    destinationAmount: "530",
    fee: "0",
    capturedAt: new Date("2026-09-01T00:00:00.000Z"),
    anchorId: "anchor:zeam",
    corridorId: "corridor:usdc-us-brl-br",
  });

  const legacy = await traceRateSnapshotProvenance(
    "legacy-snapshot",
    store.provenanceRepository,
  );
  assert.deepEqual(legacy, {
    status: "unavailable",
    reason: "PROVENANCE_UNAVAILABLE",
  });

  const unknown = await traceRateSnapshotProvenance(
    "does-not-exist",
    store.provenanceRepository,
  );
  assert.deepEqual(unknown, {
    status: "unavailable",
    reason: "SNAPSHOT_NOT_FOUND",
  });
});

type StoreSnapshot = Readonly<{
  id: string;
  anchorId: string;
  corridorId: string;
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  sourceAmount: string;
  destinationAmount: string;
  fee: string;
  capturedAt: Date;
}>;

function inMemoryStore() {
  const snapshots: StoreSnapshot[] = [];
  const provenance: Array<Readonly<{
    id: string;
    snapshotId: string;
    captureRunId: string;
    sourceType: string;
    anchorSlug: string;
    corridorSlug: string;
    configurationDigest: string;
    requestShapeVersion: string;
    capturedAt: Date;
    recordedAt: Date;
  }>> = [];

  const snapshotRepository: RateSnapshotRepository = {
    findAnchorBySlug: async (slug) => ({ id: `anchor:${slug}` }),
    findCorridorBySlug: async (slug) => ({ id: `corridor:${slug}` }),
    hasAssociation: async () => true,
    createSnapshot: async (input) => {
      const id = `snapshot-${snapshots.length + 1}`;
      snapshots.push(Object.freeze({
        id,
        anchorId: input.anchorId,
        corridorId: input.corridorId,
        anchorSlug: input.provenance.anchorSlug,
        corridorSlug: input.provenance.corridorSlug,
        rate: input.rate,
        sourceAmount: input.sourceAmount,
        destinationAmount: input.destinationAmount,
        fee: input.fee,
        capturedAt: new Date(input.capturedAt.getTime()),
      }));
      provenance.push(Object.freeze({
        id: `provenance-${provenance.length + 1}`,
        snapshotId: id,
        captureRunId: input.provenance.captureRunId,
        sourceType: input.provenance.sourceType,
        anchorSlug: input.provenance.anchorSlug,
        corridorSlug: input.provenance.corridorSlug,
        configurationDigest: input.provenance.configurationDigest,
        requestShapeVersion: input.provenance.requestShapeVersion,
        capturedAt: new Date(input.provenance.capturedAt.getTime()),
        recordedAt: new Date(NOW.getTime()),
      }));
      return { id, provenanceId: `provenance-${provenance.length}`, ...input };
    },
  };

  const provenanceRepository: RateSnapshotProvenanceRepository = {
    findProvenanceBySnapshotId: async (snapshotId) =>
      provenance.find((row) => row.snapshotId === snapshotId) ?? null,
    snapshotExists: async (snapshotId) =>
      snapshots.some((row) => row.id === snapshotId),
  };

  return { snapshots, provenance, snapshotRepository, provenanceRepository };
}

function source(anchorSlug: string): RateCandidate {
  return Object.freeze({
    anchorSlug,
    corridor: Object.freeze({
      slug: "usdc-us-brl-br",
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
    }),
    request: Object.freeze({
      sellAsset: USDC,
      buyAsset: BRL,
      sellAmount: "100",
      context: "sep31" as const,
    }),
    configurationDigest: computeRateSourceConfigurationFingerprint({
      anchorSlug,
      corridorSlug: "usdc-us-brl-br",
      sellAsset: USDC,
      buyAsset: BRL,
      sellAmount: "100",
      context: "sep31",
    }),
  });
}

function indicative(candidate: RateCandidate): Sep38IndicativePrice {
  // Arithmetically consistent quotes: sell_amount = price * buy_amount.
  const price = candidate.anchorSlug === "zeam" ? "5" : "4";
  const buyAmount = candidate.anchorSlug === "zeam" ? "20" : "25";
  return Object.freeze({
    sellAsset: USDC,
    buyAsset: BRL,
    totalPrice: price,
    price,
    sellAmount: "100",
    buyAmount,
    fee: Object.freeze({ total: "0", asset: BRL, details: Object.freeze([]) }),
  });
}
