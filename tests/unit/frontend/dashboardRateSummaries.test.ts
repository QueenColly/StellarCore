import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { describe } from "node:test";

import { serializeRates } from "@/lib/api/rates";
import { computeFreshMedian } from "@/lib/rates/median";
import { formatRate, formatRateTick } from "@/lib/rates/formatting";
import type { LatestCorridorRate } from "@/types/latestRates";

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

const ratePanelSource = read("components/dashboard/RatePanel.tsx");
const corridorRateEvidenceSource = read("components/corridors/CorridorRateEvidence.tsx");
const chartSource = read("components/corridors/CorridorRateHistoryChart.tsx");

describe("Dashboard rate summaries and formatting", () => {
  describe("RatePanel component layout and presentation", () => {
    test("RatePanel preserves exact medianRate presentation without zero coercion", () => {
      assert.match(
        ratePanelSource,
        /medianRate === null \? "Median unavailable" : medianRate/,
        "RatePanel must display the exact medianRate string without coercing to zero",
      );
      assert.doesNotMatch(
        ratePanelSource,
        /medianRate \?\? "—"/,
        "RatePanel must not use stale placeholder convention",
      );
    });

    test("RatePanel includes break-words on median rate to prevent layout overflow", () => {
      assert.match(
        ratePanelSource,
        /className=\{[\s\S]*?break-words[\s\S]*?\}/,
        "RatePanel must apply break-words to median rate container to prevent extreme values overflowing the grid",
      );
    });

    test("RatePanel applies break-all to observation rate and fee table cells", () => {
      assert.match(
        ratePanelSource,
        /<td className="[^"]*text-\[var\(--white\)\] break-all">\{observation\.rate\}<\/td>/,
        "Rate observation cell must apply break-all for extreme magnitude rate strings",
      );
      assert.match(
        ratePanelSource,
        /<td className="[^"]*text-\[var\(--muted\)\] break-all">\{observation\.fee\}<\/td>/,
        "Fee observation cell must apply break-all for extreme fee precision strings",
      );
    });
  });

  describe("CorridorRateEvidence component layout and presentation", () => {
    test("CorridorRateEvidence preserves exact medianRate and applies break-words", () => {
      assert.match(
        corridorRateEvidenceSource,
        /\{rates\.medianRate \?\? "Median unavailable"\}/,
        "CorridorRateEvidence must render the exact median rate or explain unavailability",
      );
      assert.match(
        corridorRateEvidenceSource,
        /<dd className="[^"]*break-words"[^>]*>[\s\S]*?rates\.medianRate/,
        "CorridorRateEvidence must apply break-words to prevent large numbers overflowing the card",
      );
    });

    test("CorridorRateEvidence applies break-all to observation table cells", () => {
      assert.match(
        corridorRateEvidenceSource,
        /<td className="[^"]*break-all">\{observation\.rate\}<\/td>/,
        "CorridorRateEvidence table must apply break-all to prevent extreme rates overflowing table columns",
      );
    });
  });

  describe("CorridorRateHistoryChart tick formatting", () => {
    test("chart imports formatRateTick and avoids naive toFixed(4) truncation", () => {
      assert.match(
        chartSource,
        /import \{ formatRateTick \} from "@\/lib\/rates\/formatting"/,
        "CorridorRateHistoryChart must import formatRateTick helper",
      );
      assert.match(
        chartSource,
        /label:\s*formatRateTick\(yMax\)/,
        "Chart yMax tick must use formatRateTick",
      );
      assert.doesNotMatch(
        chartSource,
        /label:\s*yMax\.toFixed\(4\)/,
        "Chart must not use naive toFixed(4) which truncates small rates to 0.0000",
      );
    });

    test("formatRateTick never displays small nonzero rates as 0.0000", () => {
      const smallTick = formatRateTick(0.00001234);
      assert.notEqual(smallTick, "0.0000");
      assert.match(smallTick, /^0\.0+12/);

      const microTick = formatRateTick(0.000001);
      assert.notEqual(microTick, "0.0000");
      assert.match(microTick, /^0\.0+1/);
    });

    test("formatRateTick formats large values compactly to fit within chart margins", () => {
      const millionTick = formatRateTick(1000000);
      assert.equal(millionTick, "1M");
      assert.ok(millionTick.length <= 6, "compact tick must not overflow 65px chart padding");

      const fiveMillionTick = formatRateTick(5000000);
      assert.equal(fiveMillionTick, "5M");
    });
  });

  describe("Read model serialization with extreme values", () => {
    test("serializeRates preserves extreme micro-rates without truncation", () => {
      const now = new Date();
      const mockResult: LatestCorridorRate = {
        ok: true,
        corridor: {
          slug: "usdc-us-brl-br",
          assetCodeFrom: "USDC",
          countryFrom: "US",
          assetCodeTo: "BRL",
          countryTo: "BR",
        },
        evaluatedAt: now.toISOString(),
        state: "healthy",
        median: "0.00001234",
        totalIndependentSources: 1,
        freshSourceCount: 1,
        observations: [
          {
            snapshotId: "snap-1",
            anchorSlug: "anchor-1",
            anchorName: "Anchor One",
            rate: "0.00001234",
            sourceAmount: "100.00",
            destinationAmount: "0.001234",
            fee: "0.0000001",
            capturedAt: now.toISOString(),
            freshnessState: "fresh",
            ageMs: 500,
            included: true,
          },
        ],
        exclusions: [],
      };

      const serialized = serializeRates(mockResult);
      assert.equal(serialized.medianRate, "0.00001234");
      assert.equal(serialized.observations[0]?.rate, "0.00001234");
      assert.equal(serialized.observations[0]?.fee, "0.0000001");
      assert.notEqual(serialized.medianRate, "0");
      assert.notEqual(serialized.medianRate, "0.00");
    });

    test("computeFreshMedian computes exact medians for extreme micro-rates", () => {
      const now = new Date();
      const sources = [
        {
          anchorSlug: "anchor-a",
          corridorSlug: "usdc-us-brl-br",
          rate: "0.00001230",
          capturedAt: now,
        },
        {
          anchorSlug: "anchor-b",
          corridorSlug: "usdc-us-brl-br",
          rate: "0.00001234",
          capturedAt: now,
        },
        {
          anchorSlug: "anchor-c",
          corridorSlug: "usdc-us-brl-br",
          rate: "0.00001240",
          capturedAt: now,
        },
      ];

      const medianResult = computeFreshMedian(sources, now);
      assert.equal(medianResult.state, "healthy");
      assert.equal(medianResult.median, "0.00001234");
      assert.notEqual(medianResult.median, "0");
    });

    test("computeFreshMedian computes exact medians for extreme large rates", () => {
      const now = new Date();
      const sources = [
        {
          anchorSlug: "anchor-a",
          corridorSlug: "usdc-us-brl-br",
          rate: "999999999999.98",
          capturedAt: now,
        },
        {
          anchorSlug: "anchor-b",
          corridorSlug: "usdc-us-brl-br",
          rate: "999999999999.99",
          capturedAt: now,
        },
        {
          anchorSlug: "anchor-c",
          corridorSlug: "usdc-us-brl-br",
          rate: "1000000000000.00",
          capturedAt: now,
        },
      ];

      const medianResult = computeFreshMedian(sources, now);
      assert.equal(medianResult.state, "healthy");
      assert.equal(medianResult.median, "999999999999.99");
    });

    test("formatRate formats serialized median rates with grouping and precision preservation", () => {
      const microFormatted = formatRate("0.00001234");
      assert.equal(microFormatted, "0.00001234");

      const largeFormatted = formatRate("999999999999.99");
      assert.equal(largeFormatted, "999,999,999,999.99");
    });
  });
});
