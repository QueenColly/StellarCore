import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { GET as ratesGet, dynamic as ratesDynamic } from "@/app/api/rates/route";
import { publicApiJsonResponse } from "@/lib/api/http";
import { getRatesApiResult } from "@/lib/api/rates";
import {
  createFileStaleEvidenceStore,
  STALE_EVIDENCE_MAX_AGE_MS,
  staleEvidenceHeaders,
} from "@/lib/api/staleEvidence";
import type { RatesApiResult } from "@/types/api/rates";
import type { LatestCorridorRateReadResult } from "@/types/latestRates";

const CORRIDOR = "usdc-us-brl-br";
const NOW = new Date("2026-10-19T12:00:00.000Z");
const CAPTURED_AT = "2026-10-19T11:59:00.000Z";

/**
 * Directives that would let an intermediary serve the response beyond this
 * process's control. None of them may ever appear on an evidence response,
 * fresh or stale (#238).
 */
const FORBIDDEN_CACHE_DIRECTIVES = [
  "public",
  "private",
  "max-age",
  "s-maxage",
  "immutable",
  "stale-while-revalidate",
  "stale-if-error",
];

/** Exactly how every public read route turns a service result into a Response. */
function respond(result: RatesApiResult): Response {
  return publicApiJsonResponse(
    result,
    staleEvidenceHeaders("degraded" in result ? result.degraded : undefined),
  );
}

function assertOnlyNoStore(response: Response): void {
  const cacheControl = response.headers.get("cache-control");
  assert.equal(cacheControl, "no-store");
  for (const directive of FORBIDDEN_CACHE_DIRECTIVES) {
    assert.equal(
      cacheControl?.includes(directive),
      false,
      `cache-control must not carry ${directive}`,
    );
  }
}

function freshReadResult(): LatestCorridorRateReadResult {
  return Object.freeze({
    ok: true,
    corridor: Object.freeze({
      slug: CORRIDOR,
      assetCodeFrom: "USDC",
      countryFrom: "US",
      assetCodeTo: "BRL",
      countryTo: "BR",
    }),
    evaluatedAt: NOW.toISOString(),
    state: "insufficient_fresh_sources",
    median: null,
    totalIndependentSources: 1,
    freshSourceCount: 1,
    observations: Object.freeze([
      Object.freeze({
        snapshotId: "anchor-a-snapshot",
        anchorSlug: "anchor-a",
        anchorName: "anchor-a persisted",
        rate: "5.400000000000000001",
        sourceAmount: "100.000000000000000001",
        destinationAmount: "540.000000000000000001",
        fee: "1.000000000000000001",
        capturedAt: CAPTURED_AT,
        freshnessState: "fresh" as const,
        ageMs: 60_000,
        included: true,
      }),
    ]),
    exclusions: Object.freeze([]),
  }) as LatestCorridorRateReadResult;
}

const transientFailure = () =>
  Object.assign(new Error("connection pool timed out"), { code: "P2024" });

test("fresh evidence answers no-store with no staleness marking", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stellar-cache-control-"));
  try {
    const store = createFileStaleEvidenceStore(directory);
    const result = await getRatesApiResult(CORRIDOR, {
      now: () => NOW,
      staleEvidenceStore: store,
      readLatestRate: async () => freshReadResult(),
      reportError: () => {},
    });
    const response = respond(result);

    assert.equal(response.status, 200);
    assertOnlyNoStore(response);
    assert.equal(response.headers.get("x-evidence-state"), null);
    assert.equal(response.headers.get("warning"), null);
    const body = (await response.json()) as Record<string, unknown>;
    assert.equal("degraded" in body, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stale evidence stays no-store and declares its freshness explicitly", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stellar-cache-control-"));
  try {
    const store = createFileStaleEvidenceStore(directory);
    // A healthy pass stores the last-known-good snapshot…
    await getRatesApiResult(CORRIDOR, {
      now: () => NOW,
      staleEvidenceStore: store,
      readLatestRate: async () => freshReadResult(),
      reportError: () => {},
    });
    // …then the database fails transiently and the snapshot is served stale.
    const evaluatedAt = new Date(NOW.getTime() + 60_000);
    const result = await getRatesApiResult(CORRIDOR, {
      now: () => evaluatedAt,
      staleEvidenceStore: store,
      readLatestRate: async () => {
        throw transientFailure();
      },
      reportError: () => {},
    });
    const response = respond(result);

    // Status and body are the service's own; the headers are the contract.
    assert.equal(response.status, 200);
    assertOnlyNoStore(response);
    assert.equal(response.headers.get("x-evidence-state"), "stale");
    assert.equal(response.headers.get("x-evidence-generated-at"), NOW.toISOString());
    assert.equal(
      response.headers.get("x-evidence-expires-at"),
      new Date(NOW.getTime() + STALE_EVIDENCE_MAX_AGE_MS).toISOString(),
    );
    assert.equal(response.headers.get("x-evidence-source-time"), CAPTURED_AT);
    assert.equal(response.headers.get("warning"), '110 - "Response is stale"');
    const body = (await response.json()) as { degraded?: { state?: string } };
    assert.equal(body.degraded?.state, "stale");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("unavailable evidence is an error response that still carries no-store", async () => {
  const directory = await mkdtemp(join(tmpdir(), "stellar-cache-control-"));
  try {
    const store = createFileStaleEvidenceStore(directory); // empty: nothing to restore
    const result = await getRatesApiResult(CORRIDOR, {
      now: () => NOW,
      staleEvidenceStore: store,
      readLatestRate: async () => {
        throw transientFailure();
      },
      reportError: () => {},
    });
    const response = respond(result);

    assert.equal(response.status, 500);
    assertOnlyNoStore(response);
    assert.equal(response.headers.get("x-evidence-state"), null);
    assert.equal(response.headers.get("warning"), null);
    const body = (await response.json()) as { error?: { code?: string } };
    assert.equal(body.error?.code, "internal_error");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the rates route itself is dynamic and keeps no-store on its error paths", async () => {
  assert.equal(ratesDynamic, "force-dynamic");

  const missing = await ratesGet(new Request("http://localhost/api/rates"));
  assert.equal(missing.status, 400);
  assertOnlyNoStore(missing);

  const invalid = await ratesGet(
    new Request("http://localhost/api/rates?corridor=bad--slug"),
  );
  assert.equal(invalid.status, 400);
  assertOnlyNoStore(invalid);
});

test("header construction has no cacheable fallback for unknown states", () => {
  // Called without metadata (fresh or error), the helper emits exactly
  // no-store and nothing else an intermediary could latch onto.
  assert.deepEqual(staleEvidenceHeaders(undefined), { "Cache-Control": "no-store" });
});
