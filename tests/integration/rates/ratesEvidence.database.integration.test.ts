import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { RATE_FRESHNESS_THRESHOLD_MS } from "@/constants/rates";
import { GET as getRatesRoute } from "@/app/api/rates/route";
import { getAnchorReputationApiResult } from "@/lib/api/reputation";
import { getRatesApiResult } from "@/lib/api/rates";
import { readLatestCorridorRate } from "@/lib/rates/latestRateReadModel";
import { evaluateAnchorReputation } from "@/lib/reputation/engine";

const DATABASE_INTEGRATION_ENABLED = process.env.RUN_RATES_DATABASE_INTEGRATION === "1";
const NOW = new Date("2026-10-19T12:00:00.000Z");

test("persisted freshness and missing evidence agree with public API reads", {
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
  const corridorSlug = `test-rate-freshness-${suffix}`;
  const emptyCorridorSlug = `test-rate-empty-${suffix}`;
  const anchorIds: string[] = [];
  const corridorIds: string[] = [];

  try {
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
    corridorIds.push(corridor.id);
    const emptyCorridor = await db.corridor.create({
      data: {
        slug: emptyCorridorSlug,
        assetCodeFrom: "USDC",
        countryFrom: "US",
        assetCodeTo: "EMPTY",
        countryTo: "ZZ",
      },
      select: { id: true },
    });
    corridorIds.push(emptyCorridor.id);

    const ages = [
      RATE_FRESHNESS_THRESHOLD_MS - 1,
      RATE_FRESHNESS_THRESHOLD_MS,
      RATE_FRESHNESS_THRESHOLD_MS + 1,
    ];
    const anchors = await Promise.all(ages.map((_, index) => db.anchor.create({
      data: {
        slug: `test-rate-freshness-${index}-${suffix}`,
        name: `Rate Freshness Fixture ${index}`,
        homeDomain: `rate-freshness-${index}-${suffix}.example.com`,
        tomlUrl: `https://rate-freshness-${index}-${suffix}.example.com/.well-known/stellar.toml`,
      },
      select: { id: true, slug: true },
    })));
    anchorIds.push(...anchors.map(({ id }) => id));
    await db.anchorCorridor.createMany({
      data: anchors.map(({ id }) => ({ anchorId: id, corridorId: corridor.id })),
    });
    await db.rateSnapshot.createMany({
      data: anchors.map(({ id }, index) => ({
        anchorId: id,
        corridorId: corridor.id,
        rate: String(index + 1),
        sourceAmount: "1",
        destinationAmount: String(index + 1),
        fee: "0",
        capturedAt: new Date(NOW.getTime() - ages[index]!),
      })),
    });

    const internal = await readLatestCorridorRate(corridorSlug, { evaluatedAt: NOW });
    const publicRates = await getRatesApiResult(corridorSlug, { now: () => NOW });
    const emptyRates = await getRatesApiResult(emptyCorridorSlug, { now: () => NOW });
    const validRouteResponse = await getRatesRoute(new Request(
      `http://localhost/api/rates?corridor=${emptyCorridorSlug}`,
    ));
    const reputation = await getAnchorReputationApiResult(anchors[0]!.slug);
    const reputationSignals = await Promise.all(anchors.map(({ slug }) =>
      evaluateAnchorReputation(slug, { evaluatedAt: NOW, persist: false })));

    assert.equal(internal.ok, true);
    if (internal.ok) {
      assert.equal(internal.evaluatedAt, NOW.toISOString());
      assert.equal(internal.freshSourceCount, 2);
      assert.deepEqual(internal.observations.map(({ freshnessState, ageMs }) => [
        freshnessState,
        ageMs,
      ]), [
        ["fresh", RATE_FRESHNESS_THRESHOLD_MS - 1],
        ["fresh", RATE_FRESHNESS_THRESHOLD_MS],
        ["stale", RATE_FRESHNESS_THRESHOLD_MS + 1],
      ]);
    }

    assert.equal(publicRates.status, 200);
    if (publicRates.status === 200) {
      assert.equal(publicRates.body.evaluatedAt, NOW.toISOString());
      assert.equal(publicRates.body.sourceCount, 3);
      assert.equal(publicRates.body.freshSourceCount, internal.ok ? internal.freshSourceCount : -1);
      assert.equal(publicRates.body.state, "healthy");
      assert.equal(publicRates.body.medianRate, "1.5");
      assert.deepEqual(publicRates.body.observations.map(({ freshness, eligibleForMedian }) => [
        freshness.state,
        freshness.ageMs,
        eligibleForMedian,
      ]), [
        ["fresh", RATE_FRESHNESS_THRESHOLD_MS - 1, true],
        ["fresh", RATE_FRESHNESS_THRESHOLD_MS, true],
        ["stale", RATE_FRESHNESS_THRESHOLD_MS + 1, false],
      ]);
    }

    assert.equal(emptyRates.status, 200);
    if (emptyRates.status === 200) {
      assert.equal(emptyRates.body.evaluatedAt, NOW.toISOString());
      assert.equal(emptyRates.body.state, "insufficient_fresh_sources");
      assert.equal(emptyRates.body.sourceCount, 0);
      assert.equal(emptyRates.body.freshSourceCount, 0);
      assert.equal(emptyRates.body.medianRate, null);
      assert.deepEqual(emptyRates.body.observations, []);
    }

    assert.equal(validRouteResponse.status, 200);
    assert.deepEqual((await validRouteResponse.json()).observations, []);

    assert.deepEqual(reputationSignals.map((signal) => signal.ok
      ? [
          signal.calculation.evidence.latestRateCount,
          signal.calculation.evidence.freshRateCount,
          signal.calculation.components.rateFreshness.score,
        ]
      : null), [
      [1, 1, 100],
      [1, 1, 100],
      [1, 0, 0],
    ]);

    assert.equal(reputation.status, 200);
    if (reputation.status === 200) {
      assert.deepEqual(reputation.body.reputation, {
        anchor: {
          slug: anchors[0]!.slug,
          name: "Rate Freshness Fixture 0",
        },
        state: "not_evaluated",
        score: null,
        scoreBand: null,
        evidence: null,
        metrics: null,
        computedAt: null,
      });
    }
  } finally {
    if (corridorIds.length > 0) {
      await db.rateSnapshot.deleteMany({ where: { corridorId: { in: corridorIds } } });
      await db.transferOutcome.deleteMany({ where: { corridorId: { in: corridorIds } } });
      await db.anchorCorridor.deleteMany({ where: { corridorId: { in: corridorIds } } });
    }
    if (anchorIds.length > 0) {
      await db.reputationScore.deleteMany({ where: { anchorId: { in: anchorIds } } });
      await db.anchor.deleteMany({ where: { id: { in: anchorIds } } });
    }
    if (corridorIds.length > 0) {
      await db.corridor.deleteMany({ where: { id: { in: corridorIds } } });
    }
    await db.$disconnect();
  }
});