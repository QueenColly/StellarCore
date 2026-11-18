import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";
import test from "node:test";

import { getRatesApiResult } from "@/lib/api/rates";

const DATABASE_INTEGRATION_ENABLED = process.env.RUN_RATES_DATABASE_INTEGRATION === "1";
const CAPTURED_AT = new Date("2026-10-19T12:00:00.000Z");

test("READ COMMITTED readers hide an in-flight rate observation until commit", {
  skip: !DATABASE_INTEGRATION_ENABLED,
}, async () => {
  await import("dotenv/config");
  const databaseUrl = process.env.RATES_TEST_DATABASE_URL;
  assert.ok(databaseUrl, "RATES_TEST_DATABASE_URL must point to an isolated test database");
  assert.match(
    decodeURIComponent(new URL(databaseUrl).pathname),
    /test/i,
    "the test database name must include 'test'",
  );
  process.env.DATABASE_URL = databaseUrl;

  const { db } = await import("@/lib/dbClient");
  const suffix = randomUUID().replaceAll("-", "");
  const anchorSlug = `test-rate-capture-${suffix}`;
  const corridorSlug = `test-rate-capture-${suffix}`;
  const writer = new Client({ connectionString: databaseUrl });
  let anchorId: string | undefined;
  let corridorId: string | undefined;
  let transactionOpen = false;

  try {
    const anchor = await db.anchor.create({
      data: {
        slug: anchorSlug,
        name: "Concurrent Rate Capture Fixture",
        homeDomain: `${suffix}.example.com`,
        tomlUrl: `https://${suffix}.example.com/.well-known/stellar.toml`,
      },
      select: { id: true },
    });
    anchorId = anchor.id;
    const corridor = await db.corridor.create({
      data: {
        slug: corridorSlug,
        assetCodeFrom: "USDC",
        countryFrom: "US",
        assetCodeTo: "TEST",
        countryTo: "ZZ",
      },
      select: { id: true },
    });
    corridorId = corridor.id;
    await db.anchorCorridor.create({
      data: { anchorId, corridorId },
    });

    await writer.connect();
    const isolation = await writer.query<{ default_transaction_isolation: string }>(
      "SHOW default_transaction_isolation",
    );
    assert.equal(isolation.rows[0]?.default_transaction_isolation, "read committed");
    await writer.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transactionOpen = true;
    await writer.query(
      `INSERT INTO rate_snapshots
        (anchor_id, corridor_id, rate, source_amount, destination_amount, fee, captured_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [anchorId, corridorId, "1.25", "4", "5", "0", CAPTURED_AT],
    );

    // PostgreSQL READ COMMITTED excludes uncommitted rows; after commit, a new public read sees the complete row.
    const duringCapture = await getRatesApiResult(corridorSlug, {
      now: () => CAPTURED_AT,
    });
    assert.equal(duringCapture.status, 200);
    if (duringCapture.status === 200) {
      assert.equal(duringCapture.body.sourceCount, 0);
      assert.deepEqual(duringCapture.body.observations, []);
      assert.equal(duringCapture.body.medianRate, null);
    }

    await writer.query("COMMIT");
    transactionOpen = false;

    const afterCommit = await getRatesApiResult(corridorSlug, {
      now: () => CAPTURED_AT,
    });
    assert.equal(afterCommit.status, 200);
    if (afterCommit.status === 200) {
      assert.equal(afterCommit.body.sourceCount, 1);
      assert.equal(afterCommit.body.freshSourceCount, 1);
      assert.deepEqual(afterCommit.body.observations, [{
        anchor: { slug: anchorSlug, name: "Concurrent Rate Capture Fixture" },
        rate: "1.25",
        sourceAmount: "4",
        destinationAmount: "5",
        fee: "0",
        capturedAt: CAPTURED_AT.toISOString(),
        freshness: { state: "fresh", ageMs: 0 },
        eligibleForMedian: true,
      }]);
    }
  } finally {
    if (transactionOpen) await writer.query("ROLLBACK");
    await writer.end();
    if (anchorId && corridorId) {
      await db.rateSnapshot.deleteMany({ where: { anchorId, corridorId } });
      await db.anchorCorridor.deleteMany({ where: { anchorId, corridorId } });
    }
    if (anchorId) await db.anchor.deleteMany({ where: { id: anchorId } });
    if (corridorId) await db.corridor.deleteMany({ where: { id: corridorId } });
    await db.$disconnect();
  }
});