import assert from "node:assert/strict";
import test from "node:test";

import {
  RATE_CAPTURE_SOURCE_TYPE,
  SEP38_INDICATIVE_REQUEST_SHAPE_VERSION,
} from "@/constants/rateProvenance";
import {
  buildRateSnapshotProvenance,
  mintRateCaptureRunId,
  RateSnapshotProvenanceError,
} from "@/lib/rates/provenance";
import type { RateSnapshotProvenanceInput } from "@/types/rateProvenance";

const DIGEST = "e".repeat(64);
const CAPTURED_AT = new Date("2026-10-22T09:00:00.000Z");

function input(
  overrides: Partial<RateSnapshotProvenanceInput> = {},
): RateSnapshotProvenanceInput {
  return {
    captureRunId: "run-1",
    sourceType: RATE_CAPTURE_SOURCE_TYPE,
    anchorSlug: "zeam",
    corridorSlug: "usdc-us-brl-br",
    configurationDigest: DIGEST,
    requestShapeVersion: SEP38_INDICATIVE_REQUEST_SHAPE_VERSION,
    capturedAt: CAPTURED_AT,
    ...overrides,
  };
}

test("builder normalizes, freezes, and copies the capture timestamp (#113)", () => {
  const provenance = buildRateSnapshotProvenance(input());
  assert.deepEqual(provenance, {
    captureRunId: "run-1",
    sourceType: "sep38_indicative_price",
    anchorSlug: "zeam",
    corridorSlug: "usdc-us-brl-br",
    configurationDigest: DIGEST,
    requestShapeVersion: "sep38-indicative-request-v1",
    capturedAt: CAPTURED_AT,
  });
  assert.equal(Object.isFrozen(provenance), true);
  assert.notEqual(provenance.capturedAt, CAPTURED_AT);
  assert.equal(provenance.capturedAt.getTime(), CAPTURED_AT.getTime());
});

test("equivalent inputs produce identical provenance records (#113)", () => {
  assert.deepEqual(
    buildRateSnapshotProvenance(input()),
    buildRateSnapshotProvenance(input()),
  );
});

test("invalid identifiers fail closed with specific safe codes (#113)", () => {
  const cases: readonly [Partial<RateSnapshotProvenanceInput>, string][] = [
    [{ captureRunId: "  " }, "INVALID_CAPTURE_RUN_ID"],
    [{ captureRunId: "x".repeat(129) }, "INVALID_CAPTURE_RUN_ID"],
    [{ sourceType: "" }, "INVALID_SOURCE_TYPE"],
    [{ anchorSlug: "Zeam Anchor" }, "INVALID_ANCHOR"],
    [{ anchorSlug: "" }, "INVALID_ANCHOR"],
    [{ corridorSlug: "usdc_us_br" }, "INVALID_CORRIDOR"],
    [{ configurationDigest: "not-a-digest" }, "INVALID_CONFIGURATION_DIGEST"],
    [{ configurationDigest: DIGEST.toUpperCase() }, "INVALID_CONFIGURATION_DIGEST"],
    [{ requestShapeVersion: "" }, "INVALID_REQUEST_SHAPE_VERSION"],
    [{ capturedAt: new Date("nonsense") }, "INVALID_TIMESTAMP"],
  ];

  for (const [overrides, code] of cases) {
    assert.throws(
      () => buildRateSnapshotProvenance(input(overrides)),
      (error: unknown) =>
        error instanceof RateSnapshotProvenanceError && error.code === code,
      code,
    );
  }
});

test("persisted provenance can never contain secrets or raw payload material (#113)", () => {
  const polluted = {
    ...input(),
    apiKey: "secret-api-key",
    authorization: "Bearer secret-token",
    quoteServer: "https://user:pass@anchor.zeam.money/sep38?token=secret",
    rawResponse: "{\"price\":\"5.4\"}",
    headers: { authorization: "Bearer secret-token" },
  } as unknown as RateSnapshotProvenanceInput;

  const provenance = buildRateSnapshotProvenance(polluted);
  const serialized = JSON.stringify(provenance);
  assert.equal(serialized.includes("secret"), false);
  assert.equal(serialized.includes("quoteServer"), false);
  assert.equal(serialized.includes("rawResponse"), false);
  assert.equal(serialized.includes("apiKey"), false);
  assert.equal(serialized.includes("authorization"), false);
  assert.equal(
    JSON.stringify(provenance),
    JSON.stringify(buildRateSnapshotProvenance(input())),
  );
});

test("minted capture-run ids are unique UUIDs usable as run identity (#113)", () => {
  const first = mintRateCaptureRunId();
  const second = mintRateCaptureRunId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.notEqual(first, second);
});
