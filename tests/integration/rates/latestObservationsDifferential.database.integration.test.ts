import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

import { Prisma } from "@/app/generated/prisma/client";
import { readLatestCorridorRate } from "@/lib/rates/latestRateReadModel";
import {
  PRISMA_LATEST_RATE_REPOSITORY,
  latestObservationsQuery,
} from "@/lib/rates/latestRateRepository";
import { evaluateAnchorReputation } from "@/lib/reputation/engine";
import {
  PRISMA_REPUTATION_REPOSITORY,
  latestCorridorRatesQuery,
} from "@/lib/reputation/repository";
import {
  LEGACY_LATEST_RATE_REPOSITORY,
  LEGACY_REPUTATION_REPOSITORY,
  legacyLatestCorridorRatesQuery,
  legacyLatestObservationsQuery,
} from "../../support/legacyLatestObservationQueries";

const ENABLED = process.env.RUN_LATEST_OBSERVATION_DATABASE_INTEGRATION === "1";
const NOW = new Date("2026-09-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SECOND = 1_000;
const DAY = 24 * 60 * 60 * SECOND;

// Two snapshots with the same captured_at: the one with the greater id must win.
const TIE_LOW = "00000000-0000-4000-8000-0000000000aa";
const TIE_HIGH = "00000000-0000-4000-8000-0000000000bb";

type Fixture = Awaited<ReturnType<typeof createFixture>>;

test("legacy and lateral queries agree on every shape of history", {
  skip: !ENABLED,
}, async () => {
  await import("dotenv/config");
  const { db } = await import("@/lib/dbClient");
  const fixture = await createFixture();

  try {
    const { corridors, anchors } = fixture;

    // Raw rows, exact decimal text and ordering included.
    for (const corridor of [corridors.main, corridors.single, corridors.empty]) {
      const [before, after] = await Promise.all([
        db.$queryRaw(legacyLatestObservationsQuery(corridor.id)),
        db.$queryRaw(latestObservationsQuery(corridor.id)),
      ]);
      assert.deepEqual(serialise(after), serialise(before), `rows for ${corridor.slug}`);
    }
    for (const anchor of Object.values(anchors)) {
      const [before, after] = await Promise.all([
        db.$queryRaw(legacyLatestCorridorRatesQuery(anchor.id)),
        db.$queryRaw(latestCorridorRatesQuery(anchor.id)),
      ]);
      assert.deepEqual(serialise(after), serialise(before), `rows for ${anchor.slug}`);
    }

    // The selection itself, not just agreement: what the contract promises.
    const selected = await PRISMA_LATEST_RATE_REPOSITORY.findLatestObservations(corridors.main.id);
    assert.deepEqual(
      new Set(selected.map(({ id }) => id)),
      new Set([
        fixture.ids.uneven, // newest of five, not the oldest
        TIE_HIGH, // tied timestamp: greater id wins
        fixture.ids.staleNewest, // stale-only anchor still appears, at its newest
        fixture.ids.historical, // anchor not (or no longer) a member of this corridor
        fixture.ids.single,
      ]),
    );
    const precise = selected.find(({ id }) => id === fixture.ids.single);
    // Compared as decimals: Decimal.toString() may render 1e-18, which is the
    // same value and the same text the legacy mapping produced.
    assert.ok(new Prisma.Decimal(precise!.rate).eq("1234.123456789012345678"));
    assert.ok(new Prisma.Decimal(precise!.fee).eq("0.000000000000000001"));
    assert.equal((await PRISMA_LATEST_RATE_REPOSITORY.findLatestObservations(corridors.empty.id)).length, 0);

    // Repositories and the complete public outputs built on them.
    for (const corridor of [corridors.main, corridors.single, corridors.empty]) {
      assert.deepEqual(
        await PRISMA_LATEST_RATE_REPOSITORY.findLatestObservations(corridor.id),
        await LEGACY_LATEST_RATE_REPOSITORY.findLatestObservations(corridor.id),
      );
      assert.deepEqual(
        await readLatestCorridorRate(corridor.slug, { repository: PRISMA_LATEST_RATE_REPOSITORY, evaluatedAt: NOW }),
        await readLatestCorridorRate(corridor.slug, { repository: LEGACY_LATEST_RATE_REPOSITORY, evaluatedAt: NOW }),
        `public rate for ${corridor.slug}`,
      );
    }

    const window = new Date(NOW.getTime() - 90 * DAY);
    for (const anchor of Object.values(anchors)) {
      assert.deepEqual(
        withoutSnapshot(await PRISMA_REPUTATION_REPOSITORY.readEvidence(anchor.slug, window)),
        withoutSnapshot(await LEGACY_REPUTATION_REPOSITORY.readEvidence(anchor.slug, window)),
        `evidence for ${anchor.slug}`,
      );
      assert.deepEqual(
        withoutSnapshot(await evaluateAnchorReputation(anchor.slug, { repository: PRISMA_REPUTATION_REPOSITORY, evaluatedAt: NOW, persist: false })),
        withoutSnapshot(await evaluateAnchorReputation(anchor.slug, { repository: LEGACY_REPUTATION_REPOSITORY, evaluatedAt: NOW, persist: false })),
        `public reputation for ${anchor.slug}`,
      );
    }

    // Historically associated corridor stays visible in the evidence: the
    // anchor quoted the main corridor without being a member of it.
    const historical = await PRISMA_REPUTATION_REPOSITORY.readEvidence(anchors.historical.slug, window);
    assert.ok(historical && !("code" in historical), "historical evidence read should succeed");
    if (!historical || "code" in historical) throw new Error("historical evidence read failed");
    assert.ok(!historical.corridorSlugs.includes(corridors.main.slug));
    assert.ok(historical.latestRates.some(({ corridorSlug }) => corridorSlug === corridors.main.slug));

    // An anchor with no snapshots at all has no latest rates, as before.
    const silent = await PRISMA_REPUTATION_REPOSITORY.readEvidence(anchors.silent.slug, window);
    assert.ok(silent && !("code" in silent), "silent evidence read should succeed");
    if (!silent || "code" in silent) throw new Error("silent evidence read failed");
    assert.equal(silent.latestRates.length, 0);

    // Stale observations are not dropped before the latest is chosen.
    const stale = await readLatestCorridorRate(corridors.main.slug, { repository: PRISMA_LATEST_RATE_REPOSITORY, evaluatedAt: NOW });
    assert.ok(stale.ok && stale.observations.some(({ snapshotId }) => snapshotId === fixture.ids.staleNewest));
  } finally {
    await cleanup(fixture);
  }
});

test("rows visited do not grow with history depth", { skip: !ENABLED }, async () => {
  await import("dotenv/config");
  const { db } = await import("@/lib/dbClient");
  const fixture = await createFixture();

  try {
    const corridor = fixture.corridors.main;
    const anchor = fixture.anchors.uneven;
    const groups = {
      anchors: await db.anchor.count(),
      corridors: await db.corridor.count(),
    };
    const measure = async () => ({
      rates: await snapshotRowsVisited(db, latestObservationsQuery(corridor.id)),
      reputation: await snapshotRowsVisited(db, latestCorridorRatesQuery(anchor.id)),
    });

    await addHistory(db, fixture, 50);
    const shallow = await measure();
    await addHistory(db, fixture, 1_500);
    const deep = await measure();

    // Counting rows, not milliseconds: at most one row per group probe, however
    // deep the history behind it. The legacy queries scale with depth instead.
    assert.deepEqual(deep, shallow);
    assert.ok(deep.rates <= groups.anchors, `rates visited ${deep.rates} rows for ${groups.anchors} anchors`);
    assert.ok(deep.reputation <= groups.corridors, `reputation visited ${deep.reputation} rows for ${groups.corridors} corridors`);
  } finally {
    await cleanup(fixture);
  }
});

async function createFixture() {
  await import("dotenv/config");
  const { db } = await import("@/lib/dbClient");
  const suffix = randomUUID().replaceAll("-", "");
  const anchorData = (key: string) => ({
    slug: `test-latest-${key}-${suffix}`,
    name: `Latest ${key}`,
    homeDomain: `${key}-${suffix}.example.com`,
    tomlUrl: `https://${key}-${suffix}.example.com/.well-known/stellar.toml`,
    status: "LIVE" as const,
  });
  const corridorData = (key: string, code: string) => ({
    slug: `test-latest-${key}-${suffix}`,
    assetCodeFrom: "USDC",
    countryFrom: "US",
    assetCodeTo: code,
    countryTo: "XX",
  });
  const select = { id: true, slug: true } as const;

  const anchors = {
    single: await db.anchor.create({ data: anchorData("single"), select }),
    uneven: await db.anchor.create({ data: anchorData("uneven"), select }),
    tied: await db.anchor.create({ data: anchorData("tied"), select }),
    stale: await db.anchor.create({ data: anchorData("stale"), select }),
    historical: await db.anchor.create({ data: anchorData("historical"), select }),
    silent: await db.anchor.create({ data: anchorData("silent"), select }),
  };
  const corridors = {
    main: await db.corridor.create({ data: corridorData("main", "AAA"), select }),
    single: await db.corridor.create({ data: corridorData("solo", "BBB"), select }),
    empty: await db.corridor.create({ data: corridorData("empty", "CCC"), select }),
  };

  // `historical` quotes the main corridor without a membership row for it.
  await db.anchorCorridor.createMany({
    data: [
      { anchorId: anchors.single.id, corridorId: corridors.main.id },
      { anchorId: anchors.uneven.id, corridorId: corridors.main.id },
      { anchorId: anchors.tied.id, corridorId: corridors.main.id },
      { anchorId: anchors.stale.id, corridorId: corridors.main.id },
      { anchorId: anchors.single.id, corridorId: corridors.single.id },
      { anchorId: anchors.silent.id, corridorId: corridors.empty.id },
    ],
  });

  const ids = {
    single: randomUUID(),
    uneven: randomUUID(),
    staleNewest: randomUUID(),
    historical: randomUUID(),
  };
  const row = (
    anchorId: string,
    corridorId: string,
    capturedAt: Date,
    id: string = randomUUID(),
    rate = "1600.5",
  ) => ({
    id,
    anchorId,
    corridorId,
    rate,
    sourceAmount: "1",
    destinationAmount: rate,
    fee: "0",
    capturedAt,
  });

  await db.rateSnapshot.createMany({
    data: [
      // Exact decimals: 18 places survive the rewrite.
      {
        ...row(anchors.single.id, corridors.main.id, ago(1 * SECOND), ids.single, "1234.123456789012345678"),
        fee: "0.000000000000000001",
      },
      row(anchors.single.id, corridors.main.id, ago(60 * SECOND)),
      // Uneven history: five quotes, the newest must be chosen.
      row(anchors.uneven.id, corridors.main.id, ago(50 * SECOND)),
      row(anchors.uneven.id, corridors.main.id, ago(40 * SECOND)),
      row(anchors.uneven.id, corridors.main.id, ago(30 * SECOND)),
      row(anchors.uneven.id, corridors.main.id, ago(20 * SECOND)),
      row(anchors.uneven.id, corridors.main.id, ago(2 * SECOND), ids.uneven),
      // Tied timestamps: captured_at DESC, id DESC picks the greater id.
      row(anchors.tied.id, corridors.main.id, ago(5 * SECOND), TIE_LOW),
      row(anchors.tied.id, corridors.main.id, ago(5 * SECOND), TIE_HIGH),
      // Stale-only: every quote is days old, and it must still be returned.
      row(anchors.stale.id, corridors.main.id, ago(4 * DAY)),
      row(anchors.stale.id, corridors.main.id, ago(3 * DAY), ids.staleNewest),
      // Historically associated: quotes here with no membership row.
      row(anchors.historical.id, corridors.main.id, ago(3 * SECOND), ids.historical),
      // A second corridor for the same anchor, so groups do not leak.
      row(anchors.single.id, corridors.single.id, ago(9 * SECOND)),
      row(anchors.single.id, corridors.single.id, ago(8 * SECOND)),
    ],
  });

  return { suffix, anchors, corridors, ids };
}

/** Adds `count` older snapshots to every (anchor, main corridor) pair. */
async function addHistory(
  db: Awaited<typeof import("@/lib/dbClient")>["db"],
  fixture: Fixture,
  count: number,
): Promise<void> {
  const base = Date.now();
  await db.$executeRaw`
    INSERT INTO rate_snapshots (anchor_id, corridor_id, rate, source_amount, destination_amount, fee, captured_at)
    SELECT anchor_id, ${fixture.corridors.main.id}::uuid, 1, 1, 1, 0,
           ${new Date(base - 10 * DAY)}::timestamptz - (k * interval '1 second')
      FROM (SELECT unnest(${Object.values(fixture.anchors).map(({ id }) => id)}::uuid[]) AS anchor_id) AS a
     CROSS JOIN generate_series(1, ${count}) AS k`;
  // Index-only scans need a current visibility map and the planner needs
  // statistics; without both this would measure an unrepresentative plan.
  await db.$executeRawUnsafe("VACUUM (ANALYZE) rate_snapshots");
}

type PlanNode = {
  "Node Type": string;
  "Relation Name"?: string;
  "Actual Rows"?: number;
  "Actual Loops"?: number;
  Plans?: PlanNode[];
};

async function snapshotRowsVisited(
  db: Awaited<typeof import("@/lib/dbClient")>["db"],
  query: { text: string; values: unknown[] },
): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ "QUERY PLAN": Array<{ Plan: PlanNode }> }>>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${query.text}`,
    ...query.values,
  );
  let visited = 0;
  const walk = (node: PlanNode) => {
    if (node["Relation Name"] === "rate_snapshots") {
      visited += (node["Actual Rows"] ?? 0) * (node["Actual Loops"] ?? 1);
    }
    node.Plans?.forEach(walk);
  };
  walk(rows[0]!["QUERY PLAN"][0]!.Plan);
  return visited;
}

async function cleanup(fixture: Fixture): Promise<void> {
  const { db } = await import("@/lib/dbClient");
  const anchorIds = Object.values(fixture.anchors).map(({ id }) => id);
  const corridorIds = Object.values(fixture.corridors).map(({ id }) => id);
  await db.rateSnapshot.deleteMany({ where: { anchorId: { in: anchorIds } } });
  await db.anchorCorridor.deleteMany({ where: { anchorId: { in: anchorIds } } });
  await db.reputationScore.deleteMany({ where: { anchorId: { in: anchorIds } } });
  await db.anchor.deleteMany({ where: { id: { in: anchorIds } } });
  await db.corridor.deleteMany({ where: { id: { in: corridorIds } } });
}

/** Decimals and dates as text, so deepEqual compares exact values. */
function serialise(rows: unknown): unknown {
  return JSON.parse(JSON.stringify(rows));
}

function withoutSnapshot<T>(value: T): unknown {
  if (Array.isArray(value)) return value.map(withoutSnapshot);
  if (value === null || typeof value !== "object") return value;

  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== "snapshot")
      .map(([key, entry]) => [key, withoutSnapshot(entry)]),
  );
}
