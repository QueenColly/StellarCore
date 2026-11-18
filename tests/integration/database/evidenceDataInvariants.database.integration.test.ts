import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const ENABLED = process.env.RUN_EVIDENCE_CONSTRAINT_DATABASE_INTEGRATION === "1";

test("PostgreSQL enforces rate and reputation evidence boundaries", {
  skip: !ENABLED,
}, async () => {
  await import("dotenv/config");
  const { db } = await import("@/lib/dbClient");
  const suffix = randomUUID().replaceAll("-", "");
  const anchorSlug = `test-evidence-${suffix}`;
  const corridorSlug = `test-evidence-corridor-${suffix}`;

  try {
    const anchor = await db.anchor.create({
      data: {
        slug: anchorSlug,
        name: "Evidence Constraint Fixture",
        homeDomain: `${suffix}.example.com`,
        tomlUrl: `https://${suffix}.example.com/.well-known/stellar.toml`,
      },
      select: { id: true },
    });
    const corridor = await db.corridor.create({
      data: {
        slug: corridorSlug,
        assetCodeFrom: "USDC",
        countryFrom: "US",
        assetCodeTo: "USD",
        countryTo: "US",
      },
      select: { id: true },
    });

    const snapshot = await db.rateSnapshot.create({
      data: {
        anchorId: anchor.id,
        corridorId: corridor.id,
        rate: "0.000000000000000001",
        sourceAmount: "0.000000000000000001",
        destinationAmount: "0.000000000000000001",
        fee: "0",
      },
      select: { id: true },
    });

    for (const [column, value] of [
      ["rate", "0"],
      ["source_amount", "-1"],
      ["destination_amount", "0"],
      ["fee", "-0.000000000000000001"],
    ] as const) {
      await assert.rejects(
        db.$executeRawUnsafe(
          `UPDATE rate_snapshots SET ${column} = $1::numeric WHERE id = $2::uuid`,
          value,
          snapshot.id,
        ),
      );
    }

    const score = await db.reputationScore.create({
      data: {
        anchorId: anchor.id,
        compositeScore: null,
        scoreBand: null,
        sampleSize: 0,
        state: "INSUFFICIENT_DATA",
      },
      select: { id: true },
    });

    const validStates = [
      [0, "red"],
      [79.999, "red"],
      [80, "amber"],
      [94.999, "amber"],
      [95, "green"],
      [100, "green"],
    ] as const;
    for (const [value, band] of validStates) {
      await db.$executeRawUnsafe(
        `UPDATE reputation_scores SET state = 'ok', sample_size = 30,
          composite_score = $1, score_band = $2::reputation_score_band,
          fill_rate_7d = 0, fill_rate_30d = 1, fill_rate_90d = NULL,
          settle_p50_ms = 0, settle_p95_ms = 0,
          slippage_p50 = -0.02, slippage_p95 = 0.01
        WHERE id = $3::uuid`,
        value,
        band,
        score.id,
      );
    }

    const invalidUpdates = [
      "composite_score = -0.001",
      "composite_score = 100.001",
      "fill_rate_7d = -0.001",
      "fill_rate_30d = 1.001",
      "settle_p50_ms = -1",
      "settle_p50_ms = 2, settle_p95_ms = 1",
      "slippage_p50 = 2, slippage_p95 = 1",
      "sample_size = -1",
      "state = 'ok', sample_size = 29",
      "state = 'ok', composite_score = NULL, score_band = NULL, sample_size = 30",
      "state = 'insufficient_data', composite_score = 0, score_band = 'red'",
      "state = 'ok', composite_score = 80, score_band = 'red', sample_size = 30",
    ];
    for (const update of invalidUpdates) {
      await assert.rejects(
        db.$executeRawUnsafe(
          `UPDATE reputation_scores SET ${update} WHERE id = $1::uuid`,
          score.id,
        ),
      );
    }
  } finally {
    await db.reputationScore.deleteMany({ where: { anchor: { slug: anchorSlug } } });
    await db.rateSnapshot.deleteMany({ where: { anchor: { slug: anchorSlug } } });
    await db.anchor.deleteMany({ where: { slug: anchorSlug } });
    await db.corridor.deleteMany({ where: { slug: corridorSlug } });
    await db.$disconnect();
  }
});
