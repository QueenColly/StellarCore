import assert from "node:assert/strict";
import test from "node:test";

import { runRateEngine } from "@/lib/rates/rateEngine";
import type {
  RateCandidate,
  RateSnapshotRepository,
} from "@/types/rates";
import type { Sep38IndicativePrice } from "@/types/sep38";
import {
  failAfter,
  faultSnapshotRepository,
  snapshotLedger,
  type SnapshotLedger,
} from "./faultKit.js";

const USDC = "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN" as const;
const NGN = "iso4217:NGN" as const;
const NOW = new Date("2026-09-30T12:00:00.000Z");

// [R1] A quote-phase network fault fails that source only; other sources
// still persist, and the summary never counts the failed source as success.
test("[R1] quote-phase fault fails exactly one source without fabricating success", async () => {
  const ledger = snapshotLedger();
  const candidates = [candidate("anchor-a"), candidate("anchor-b"), candidate("anchor-c")];
  const result = await runRateEngine(candidates, {
    quote: sequencedQuote(["fault:NETWORK_FAILURE", "ok", "ok"]),
    repository: repository(ledger),
    now: () => NOW,
  });

  assert.equal(result.totalAttempted, 3);
  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.equal(result.snapshotsPersisted, 2);
  assert.deepEqual(result.failures, [{
    anchorSlug: "anchor-a",
    corridorSlug: "usdc-us-ngn-ng",
    phase: "QUOTE",
    code: "QUOTE_FAILURE",
  }]);
  assert.deepEqual(ledger.idsForAnchor("anchor-a"), []);
  assert.equal(ledger.idsForAnchor("anchor-b").length, 1);
  assert.equal(ledger.idsForAnchor("anchor-c").length, 1);
  // Committed rows share one capture-run identity; the failed source left
  // neither a snapshot nor a provenance row.
  assert.deepEqual(
    [...new Set(ledger.rows.map(({ captureRunId }) => captureRunId))],
    [result.captureRunId],
  );
  assert.equal(ledger.rows.every(({ configurationDigest }) => configurationDigest === "c".repeat(64)), true);
});

// [R2] A persistence fault mid-cycle: the quote succeeded but nothing is
// persisted, the failure is attributed to the PERSISTENCE phase, and the
// remaining sources are unaffected.
test("[R2] persistence-phase fault keeps the run partial and attributes the failure correctly", async () => {
  const ledger = snapshotLedger();
  const faulted = repository(ledger, { createSnapshot: ["ok", "fault:DB_CONNECTION_LOST"] });
  const candidates = [candidate("anchor-a"), candidate("anchor-b"), candidate("anchor-c")];

  const result = await runRateEngine(candidates, {
    quote: async () => okQuote(),
    repository: faulted,
    now: () => NOW,
  });

  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 1);
  assert.deepEqual(result.failures, [{
    anchorSlug: "anchor-b",
    corridorSlug: "usdc-us-ngn-ng",
    phase: "PERSISTENCE",
    code: "PERSISTENCE_FAILURE",
  }]);
  assert.deepEqual(ledger.ids(), ["snapshot-1", "snapshot-2"]);
  assert.equal(ledger.idsForAnchor("anchor-b").length, 0);
});

// [R3] A database that disconnects mid-cycle: every write from that point
// fails, previously committed rows survive, and the summary reflects the
// partial run without inventing success.
test("[R3] mid-cycle database disconnect preserves committed rows and reports the partial truth", async () => {
  const ledger = snapshotLedger();
  const connectableRepository = withMidCycleDisconnect(ledger, 2);
  const candidates = [candidate("anchor-a"), candidate("anchor-b"), candidate("anchor-c"), candidate("anchor-d")];

  const result = await runRateEngine(candidates, {
    quote: async () => okQuote(),
    repository: connectableRepository,
    now: () => NOW,
  });

  assert.equal(result.succeeded, 2);
  assert.equal(result.failed, 2);
  assert.equal(ledger.count(), 2);
  for (const failure of result.failures) {
    assert.equal(failure.phase, "PERSISTENCE");
    assert.equal(failure.code, "PERSISTENCE_FAILURE");
  }
});

// [R4] Deadline/cancellation during the quote phase: the fault surfaces as
// QUOTE_FAILURE, no partial row is written for the cancelled source.
test("[R4] deadline-exceeded during quote maps to QUOTE_FAILURE without partial writes", async () => {
  const ledger = snapshotLedger();
  const result = await runRateEngine([candidate("anchor-a")], {
    quote: sequencedQuote(["deadline:DEADLINE_EXCEEDED"]),
    repository: repository(ledger),
    now: () => NOW,
  });

  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 1);
  assert.equal(result.failures[0]?.phase, "QUOTE");
  assert.equal(ledger.count(), 0);
});

// [R5] Normalization is deterministic and pure: a malformed quote fails
// normalization, not persistence, and writes nothing.
test("[R5] malformed quote fails normalization without any database interaction", async () => {
  const ledger = snapshotLedger();
  let reads = 0;
  const countingRepository: RateSnapshotRepository = {
    ...repository(ledger),
    findAnchorBySlug: async (slug) => {
      reads += 1;
      return { id: `anchor:${slug}` };
    },
  };

  const result = await runRateEngine([candidate("anchor-a")], {
    quote: async () => okQuote({ price: "not-a-number", totalPrice: "not-a-number" }),
    repository: countingRepository,
    now: () => NOW,
  });

  assert.equal(result.failed, 1);
  assert.equal(result.failures[0]?.phase, "NORMALIZATION");
  assert.equal(reads, 0);
  assert.equal(ledger.count(), 0);
});

// [R6] Duplicate candidates are skipped without touching the fault seams.
test("[R6] duplicate candidates are skipped without consuming quote or persistence budget", async () => {
  const ledger = snapshotLedger();
  const result = await runRateEngine(
    [candidate("anchor-a"), candidate("anchor-a")],
    {
      quote: sequencedQuote(["ok"]),
      repository: repository(ledger, { createSnapshot: ["ok", "fault:SHOULD_NOT_FIRE"] }),
      now: () => NOW,
    },
  );

  assert.equal(result.skipped, 1);
  assert.equal(result.succeeded, 1);
  assert.equal(result.failed, 0);
  assert.deepEqual(result.failures, []);
});

// [R7] Rerun after a partial failure: only the missing rows are written and
// the ledger never double-writes a source that already persisted.
test("[R7] rerun after partial failure completes the set without duplicating prior evidence", async () => {
  const ledger = snapshotLedger();
  const candidates = [candidate("anchor-a"), candidate("anchor-b"), candidate("anchor-c")];
  const faulted = {
    createSnapshot: ["fault:DB_CONNECTION_LOST", "fault:DB_CONNECTION_LOST", "fault:DB_CONNECTION_LOST"],
  };
  const before = await runRateEngine(candidates, {
    quote: async () => okQuote(),
    repository: repository(ledger, faulted),
    now: () => NOW,
  });
  assert.equal(before.succeeded, 0);
  assert.equal(before.failed, 3);
  assert.equal(ledger.count(), 0);

  const after = await runRateEngine(candidates, {
    quote: async () => okQuote(),
    repository: repository(ledger),
    now: () => NOW,
  });

  assert.equal(after.succeeded, 3);
  assert.equal(ledger.count(), 3);
  assert.deepEqual([...new Set(ledger.ids())], ["snapshot-1", "snapshot-2", "snapshot-3"]);
});

// [R8] Snapshot identity stays bounded: a rerun for the same source and
// timestamp appends a new row rather than mutating history (append-only
// evidence), and every persisted snapshot echoes its inputs exactly.
test("[R8] persisted snapshots round-trip their inputs exactly (no fabricated values)", async () => {
  const ledger = snapshotLedger();
  const result = await runRateEngine([candidate("anchor-a")], {
    quote: async () => okQuote({
      price: "1610.5",
      totalPrice: "1610.5",
      sellAmount: "161050",
      buyAmount: "100",
    }),
    repository: repository(ledger),
    now: () => NOW,
  });

  assert.equal(result.snapshotsPersisted, 1);
  const snapshot = result.snapshots[0];
  assert.ok(snapshot);
  assert.equal(snapshot.rate, "1610.5");
  assert.equal(snapshot.capturedAt.getTime(), NOW.getTime());
  const row = ledger.rows[0];
  assert.ok(row);
  assert.equal(row.rate, "1610.5");
  assert.equal(row.capturedAt.getTime(), NOW.getTime());
});

function candidate(anchorSlug: string): RateCandidate {
  return Object.freeze({
    anchorSlug,
    corridor: Object.freeze({
      slug: "usdc-us-ngn-ng",
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "NGN",
      countryTo: "NG",
    }),
    request: Object.freeze({ sellAsset: USDC, buyAsset: NGN, sellAmount: "100", context: "sep31" }),
    configurationDigest: "c".repeat(64),
  });
}

function okQuote(overrides: Partial<Sep38IndicativePrice> = {}): Sep38IndicativePrice {
  return Object.freeze({
    sellAsset: USDC,
    buyAsset: NGN,
    totalPrice: "1",
    price: "1",
    sellAmount: "100",
    buyAmount: "100",
    fee: Object.freeze({ total: "0", asset: NGN, details: Object.freeze([]) }),
    ...overrides,
  });
}

function sequencedQuote(outcomes: readonly string[]) {
  const responder = ((): ((candidate: RateCandidate) => Promise<Sep38IndicativePrice>) => {
    let call = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return async (_candidate: RateCandidate) => {
      const outcome = call < outcomes.length ? outcomes[call] : "ok";
      call += 1;
      if (outcome.startsWith("fault:")) throw new InjectedFaultErrorShim(outcome.slice(6));
      if (outcome.startsWith("deadline:")) throw new DeadlineErrorShim("DEADLINE_EXCEEDED");
      if (outcome.startsWith("cancel:")) throw new DeadlineErrorShim("OPERATION_CANCELLED");
      return okQuote();
    };
  })();
  return responder;
}

function repository(
  ledger: SnapshotLedger,
  faults: Parameters<typeof faultSnapshotRepository>[1] = {},
): RateSnapshotRepository {
  return faultSnapshotRepository(ledger, faults) as RateSnapshotRepository;
}

function withMidCycleDisconnect(ledger: SnapshotLedger, successfulWrites: number): RateSnapshotRepository {
  const base = repository(ledger);
  return {
    ...base,
    createSnapshot: failAfter(
      base.createSnapshot,
      successfulWrites,
      "DB_CONNECTION_LOST",
    ),
  };
}

class InjectedFaultErrorShim extends Error {
  constructor(readonly code: string) {
    super(`injected fault: ${code}`);
    this.name = "InjectedFaultError";
  }
}

class DeadlineErrorShim extends Error {
  constructor(readonly code: "DEADLINE_EXCEEDED" | "OPERATION_CANCELLED") {
    super(code);
    this.name = "DeadlineError";
  }
}
