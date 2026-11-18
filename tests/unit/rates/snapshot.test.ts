import assert from "node:assert/strict";
import test from "node:test";

import { buildRateSnapshotProvenance } from "@/lib/rates/provenance";
import { persistRateSnapshot } from "@/lib/rates/snapshot";
import type { RateSnapshotProvenanceInput } from "@/types/rateProvenance";
import type {
  NormalizedRateObservation,
  RateSnapshotRepository,
} from "@/types/rates";

const OBSERVATION: NormalizedRateObservation = Object.freeze({
  anchorSlug: "moneygram",
  corridorSlug: "usdc-us-usd-us",
  rate: "1.01",
  sourceAmount: "100",
  destinationAmount: "101",
  fee: "1",
  capturedAt: new Date("2026-08-27T12:00:00.000Z"),
});

const DIGEST = "a".repeat(64);

const PROVENANCE: RateSnapshotProvenanceInput = buildRateSnapshotProvenance({
  captureRunId: "run-1",
  sourceType: "sep38_indicative_price",
  anchorSlug: "moneygram",
  corridorSlug: "usdc-us-usd-us",
  configurationDigest: DIGEST,
  requestShapeVersion: "sep38-indicative-request-v1",
  capturedAt: OBSERVATION.capturedAt,
});

test("snapshot persistence resolves stable slugs and requires an existing association", async () => {
  const state = repository();
  await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value);
  assert.deepEqual(state.lookups, ["anchor:moneygram", "corridor:usdc-us-usd-us", "association:a:c"]);

  state.associated = false;
  assert.deepEqual(await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value), {
    ok: false,
    code: "ASSOCIATION_NOT_FOUND",
  });
});

test("missing anchor and missing corridor return safe structured failures", async () => {
  const missingAnchor = repository();
  missingAnchor.anchorExists = false;
  assert.deepEqual(await persistRateSnapshot(OBSERVATION, PROVENANCE, missingAnchor.value), { ok: false, code: "ANCHOR_NOT_FOUND" });

  const missingCorridor = repository();
  missingCorridor.corridorExists = false;
  assert.deepEqual(await persistRateSnapshot(OBSERVATION, PROVENANCE, missingCorridor.value), { ok: false, code: "CORRIDOR_NOT_FOUND" });
});

test("repeated legitimate observations append historical snapshots", async () => {
  const state = repository();
  const first = await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value);
  const second = await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value);
  assert.equal(first.ok && first.snapshot.id, "snapshot-1");
  assert.equal(second.ok && second.snapshot.id, "snapshot-2");
  assert.equal(state.rows.length, 2);
});

test("provenance is persisted alongside every snapshot, never without one (#113)", async () => {
  const state = repository();
  await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value);
  assert.equal(state.rows.length, 1);
  assert.equal(state.provenanceRows.length, 1);
  const [provenanceRow] = state.provenanceRows;
  assert.ok(provenanceRow);
  assert.equal(provenanceRow.snapshotId, "snapshot-1");
  assert.deepEqual(
    {
      captureRunId: provenanceRow.captureRunId,
      sourceType: provenanceRow.sourceType,
      anchorSlug: provenanceRow.anchorSlug,
      corridorSlug: provenanceRow.corridorSlug,
      configurationDigest: provenanceRow.configurationDigest,
      requestShapeVersion: provenanceRow.requestShapeVersion,
    },
    {
      captureRunId: "run-1",
      sourceType: "sep38_indicative_price",
      anchorSlug: "moneygram",
      corridorSlug: "usdc-us-usd-us",
      configurationDigest: DIGEST,
      requestShapeVersion: "sep38-indicative-request-v1",
    },
  );
  assert.equal(
    (provenanceRow.capturedAt as Date).getTime(),
    OBSERVATION.capturedAt.getTime(),
  );
});

test("database constraint failures remain bounded persistence failures", async () => {
  const state = repository();
  state.value = {
    ...state.value,
    createSnapshot: async () => {
      throw new Error("check constraint leaked supplied evidence=secret");
    },
  };

  const result = await persistRateSnapshot(OBSERVATION, PROVENANCE, state.value);
  assert.deepEqual(result, { ok: false, code: "PERSISTENCE_FAILURE" });
  assert.doesNotMatch(JSON.stringify(result), /constraint|evidence|secret/);
});

function repository() {
  const rows: Array<Record<string, unknown>> = [];
  const provenanceRows: Array<Record<string, unknown>> = [];
  const lookups: string[] = [];
  const state = {
    rows,
    provenanceRows,
    lookups,
    anchorExists: true,
    corridorExists: true,
    associated: true,
    value: undefined as unknown as RateSnapshotRepository,
  };
  state.value = {
    findAnchorBySlug: async (slug) => {
      lookups.push(`anchor:${slug}`);
      return state.anchorExists ? { id: "a" } : null;
    },
    findCorridorBySlug: async (slug) => {
      lookups.push(`corridor:${slug}`);
      return state.corridorExists ? { id: "c" } : null;
    },
    hasAssociation: async (anchorId, corridorId) => {
      lookups.push(`association:${anchorId}:${corridorId}`);
      return state.associated;
    },
    createSnapshot: async (input) => {
      const id = `snapshot-${rows.length + 1}`;
      rows.push(input);
      provenanceRows.push({ snapshotId: id, ...input.provenance });
      return { id, provenanceId: `provenance-${provenanceRows.length}`, ...input };
    },
  };
  return state;
}
