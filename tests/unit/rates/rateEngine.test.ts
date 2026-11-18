import assert from "node:assert/strict";
import test from "node:test";

import { runRateEngine } from "@/lib/rates/rateEngine";
import { computeRateSourceConfigurationFingerprint } from "@/lib/rates/sourceConfigurationFingerprint";
import type { RateCandidate, RateSnapshotRepository } from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";

const USDC = "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as const;
const USD = "iso4217:USD" as const;
const NOW = new Date("2026-08-27T12:00:00.000Z");
const DIGEST = "b".repeat(64);

function candidate(anchorSlug: string): RateCandidate {
  return Object.freeze({
    anchorSlug,
    corridor: Object.freeze({ slug: "usdc-us-usd-us", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "USD", countryTo: "US" }),
    request: Object.freeze({ sellAsset: USDC, buyAsset: USD, sellAmount: "100", context: "sep31" }),
    configurationDigest: DIGEST,
  });
}

function quote(overrides: Partial<Sep38IndicativePrice> = {}): Sep38IndicativePrice {
  return Object.freeze({
    sellAsset: USDC,
    buyAsset: USD,
    totalPrice: "1",
    price: "1",
    sellAmount: "100",
    buyAmount: "100",
    fee: Object.freeze({ total: "0", asset: USD, details: Object.freeze([]) }),
    ...overrides,
  });
}

test("duplicate anchor/corridor candidates are skipped within one run", async () => {
  let quoteCalls = 0;
  const result = await runRateEngine([candidate("moneygram"), candidate("moneygram")], {
    quote: async () => { quoteCalls += 1; return quote(); },
    repository: repository().value,
    now: () => NOW,
    captureRunId: "run-1",
  });
  assert.equal(quoteCalls, 1);
  assert.deepEqual({ attempted: result.totalAttempted, succeeded: result.succeeded, skipped: result.skipped }, {
    attempted: 1,
    succeeded: 1,
    skipped: 1,
  });
  assert.equal(result.skippedSources[0]?.reason, "DUPLICATE_CANDIDATE");
});

test("quote and normalization failures are isolated and safely classified", async () => {
  const result = await runRateEngine(
    [candidate("quote-fails"), candidate("normalize-fails"), candidate("succeeds")],
    {
      quote: async (source) => {
        if (source.anchorSlug === "quote-fails") throw new Error("Bearer secret");
        if (source.anchorSlug === "normalize-fails") return quote({ price: "0" });
        return quote();
      },
      repository: repository().value,
      now: () => NOW,
      captureRunId: "run-1",
    },
  );
  assert.equal(result.succeeded, 1);
  assert.deepEqual(result.failures.map(({ anchorSlug, phase, code }) => ({ anchorSlug, phase, code })), [
    { anchorSlug: "quote-fails", phase: "QUOTE", code: "QUOTE_FAILURE" },
    { anchorSlug: "normalize-fails", phase: "NORMALIZATION", code: "INVALID_RATE" },
  ]);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("persistence failure does not prevent a later source from succeeding", async () => {
  const base = repository();
  const store: RateSnapshotRepository = {
    ...base.value,
    createSnapshot: async (input) => {
      if (input.anchorId === "broken") throw new Error("DATABASE_URL=secret");
      return base.value.createSnapshot(input);
    },
    findAnchorBySlug: async (slug) => ({ id: slug === "broken" ? "broken" : slug }),
  };
  const result = await runRateEngine([candidate("broken"), candidate("healthy")], {
    quote: async () => quote(),
    repository: store,
    now: () => NOW,
    captureRunId: "run-1",
  });
  assert.equal(result.succeeded, 1);
  assert.deepEqual(result.failures, [{
    anchorSlug: "broken",
    corridorSlug: "usdc-us-usd-us",
    phase: "PERSISTENCE",
    code: "PERSISTENCE_FAILURE",
  }]);
});

test("every persisted snapshot carries capture-time provenance sharing one run id (#113)", async () => {
  const state = repository();
  const result = await runRateEngine([candidate("anchor-a"), candidate("anchor-b")], {
    quote: async () => quote(),
    repository: state.value,
    now: () => NOW,
    captureRunId: "run-2026-08-27",
  });
  assert.equal(result.captureRunId, "run-2026-08-27");
  assert.equal(state.provenanceRows.length, 2);
  for (const provenance of state.provenanceRows) {
    assert.equal(provenance.captureRunId, "run-2026-08-27");
    assert.equal(provenance.sourceType, "sep38_indicative_price");
    assert.equal(provenance.requestShapeVersion, "sep38-indicative-request-v1");
    assert.equal(provenance.configurationDigest, DIGEST);
    assert.equal((provenance.capturedAt as Date).getTime(), NOW.getTime());
  }
  assert.deepEqual(
    state.provenanceRows.map(({ anchorSlug, corridorSlug }) => ({ anchorSlug, corridorSlug })),
    [
      { anchorSlug: "anchor-a", corridorSlug: "usdc-us-usd-us" },
      { anchorSlug: "anchor-b", corridorSlug: "usdc-us-usd-us" },
    ],
  );
});

test("failed and skipped candidates never produce snapshot or provenance rows (#113)", async () => {
  const state = repository();
  await runRateEngine(
    [candidate("quote-fails"), candidate("dup"), candidate("dup")],
    {
      quote: async (source) => {
        if (source.anchorSlug === "quote-fails") throw new Error("offline");
        return quote();
      },
      repository: state.value,
      now: () => NOW,
      captureRunId: "run-2",
    },
  );
  assert.equal(state.rows.length, 1);
  assert.equal(state.provenanceRows.length, 1);
});

test("a candidate with an unusable configuration digest fails closed without a row (#331, #113)", async () => {
  const state = repository();
  const invalid = { ...candidate("bad-digest"), configurationDigest: "not-a-digest" };
  const result = await runRateEngine([invalid], {
    quote: async () => quote(),
    repository: state.value,
    now: () => NOW,
    captureRunId: "run-3",
  });
  assert.equal(result.succeeded, 0);
  assert.deepEqual(result.failures, [{
    anchorSlug: "bad-digest",
    corridorSlug: "usdc-us-usd-us",
    phase: "NORMALIZATION",
    code: "INVALID_CONFIGURATION_DIGEST",
  }]);
  assert.equal(state.rows.length, 0);
  assert.equal(state.provenanceRows.length, 0);
});

test("without an explicit run id the engine mints one that stays stable within the run (#113)", async () => {
  const state = repository();
  const result = await runRateEngine([candidate("anchor-a"), candidate("anchor-b")], {
    quote: async () => quote(),
    repository: state.value,
    now: () => NOW,
  });
  assert.match(result.captureRunId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(
    [...new Set(state.provenanceRows.map(({ captureRunId }) => captureRunId))],
    [result.captureRunId],
  );
});

test("configuration digests reflect the reviewed source configuration (#331)", () => {
  const digest = computeRateSourceConfigurationFingerprint({
    anchorSlug: "moneygram",
    corridorSlug: "usdc-us-usd-us",
    sellAsset: USDC,
    buyAsset: USD,
    sellAmount: "100",
    context: "sep31",
  });
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.notEqual(digest, DIGEST);
});

function repository(): Readonly<{
  value: RateSnapshotRepository;
  rows: Array<Record<string, unknown>>;
  provenanceRows: Array<Record<string, unknown>>;
}> {
  let count = 0;
  const rows: Array<Record<string, unknown>> = [];
  const provenanceRows: Array<Record<string, unknown>> = [];
  const value: RateSnapshotRepository = {
    findAnchorBySlug: async (slug) => ({ id: slug }),
    findCorridorBySlug: async (slug) => ({ id: slug }),
    hasAssociation: async () => true,
    createSnapshot: async (input) => {
      count += 1;
      rows.push(input);
      provenanceRows.push({ ...input.provenance });
      return { id: `snapshot-${count}`, provenanceId: `provenance-${count}`, ...input };
    },
  };
  return Object.freeze({ value, rows, provenanceRows });
}
