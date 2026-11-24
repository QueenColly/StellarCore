import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { RateHistoryTableView } from "@/app/insights/rate-history-table/RateHistoryTableView";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";
import type { PublicCorridor } from "@/types/api/corridors";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const pageSource = readFileSync(
  new URL("../../../app/insights/rate-history-table/page.tsx", import.meta.url),
  "utf8",
);
const viewSource = readFileSync(
  new URL("../../../app/insights/rate-history-table/RateHistoryTableView.tsx", import.meta.url),
  "utf8",
);

const MOCK_CORRIDORS: readonly PublicCorridor[] = [
  {
    slug: "usdc-us-brl-br",
    sourceAsset: "USDC",
    sourceCountry: "US",
    destinationAsset: "BRL",
    destinationCountry: "BR",
    anchorCount: 2,
  },
  {
    slug: "xlm-global-usdc-us",
    sourceAsset: "XLM",
    sourceCountry: "GLOBAL",
    destinationAsset: "USDC",
    destinationCountry: "US",
    anchorCount: 1,
  },
];

test("standalone rate history table page exists and references valid public endpoints", () => {
  assert.match(pageSource, /import \{ getCorridorsApiResult \} from "@\/lib\/api\/corridors"/);
  assert.match(pageSource, /import \{ getRateHistoryApiResult \} from "@\/lib\/api\/rateHistory"/);
  assert.match(pageSource, /<RateHistoryTableView/);
  assert.match(pageSource, /id="main-content"/);
  assert.match(pageSource, /<nav aria-label="Breadcrumb"/);
});

test("renders accessible table markup with region, caption, and column headers", () => {
  const history: PublicRateHistoryResponse = {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    windowDays: 30,
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    points: [
      {
        timestamp: "2026-11-19T10:00:00.000Z",
        medianRate: "5.2500000",
        state: "healthy",
        sourceCount: 1,
        freshSourceCount: 1,
        observations: [
          {
            anchor: { slug: "anchor-a", name: "Anchor Alpha" },
            rate: "5.2500000",
            sourceAmount: "100.00",
            destinationAmount: "525.00",
            fee: "0.50",
            capturedAt: "2026-11-19T09:59:00.000Z",
          },
        ],
      },
    ],
  };

  const html = renderToStaticMarkup(
    createElement(RateHistoryTableView, {
      corridors: MOCK_CORRIDORS,
      initialHistory: history,
      selectedCorridorSlug: "usdc-us-brl-br",
    }),
  );

  assert.match(html, /role="region"/);
  assert.match(html, /aria-label="Persisted rate observations for USDC \(US\) → BRL \(BR\)"/);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /<table/);
  assert.match(html, /<caption/);
  assert.match(html, /scope="col"/);
  assert.match(html, /Anchor Alpha/);
  assert.match(html, /5\.2500000/);
  assert.match(html, /Healthy/);
});

test("renders missing median as 'Unavailable' rather than 0 or empty", () => {
  const historyWithNullMedian: PublicRateHistoryResponse = {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    windowDays: 7,
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    points: [
      {
        timestamp: "2026-11-19T08:00:00.000Z",
        medianRate: null,
        state: "insufficient_fresh_sources",
        sourceCount: 1,
        freshSourceCount: 0,
        observations: [
          {
            anchor: { slug: "anchor-b", name: "Anchor Beta" },
            rate: "5.1000000",
            sourceAmount: "100.00",
            destinationAmount: "510.00",
            fee: "",
            capturedAt: "2026-11-19T07:55:00.000Z",
          },
        ],
      },
    ],
  };

  const html = renderToStaticMarkup(
    createElement(RateHistoryTableView, {
      corridors: MOCK_CORRIDORS,
      initialHistory: historyWithNullMedian,
      selectedCorridorSlug: "usdc-us-brl-br",
    }),
  );

  assert.match(html, /Unavailable/);
  assert.doesNotMatch(html, />0\.0000000</);
  assert.match(html, /Insufficient fresh sources/);
  assert.match(html, /—/);
});

test("handles multiple anchor observations per history point correctly", () => {
  const historyWithMultiSources: PublicRateHistoryResponse = {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    windowDays: 30,
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    points: [
      {
        timestamp: "2026-11-19T12:00:00.000Z",
        medianRate: "5.2000000",
        state: "healthy",
        sourceCount: 2,
        freshSourceCount: 2,
        observations: [
          {
            anchor: { slug: "anchor-a", name: "Anchor Alpha" },
            rate: "5.2100000",
            sourceAmount: "100.00",
            destinationAmount: "521.00",
            fee: "0.20",
            capturedAt: "2026-11-19T11:58:00.000Z",
          },
          {
            anchor: { slug: "anchor-b", name: "Anchor Beta" },
            rate: "5.1900000",
            sourceAmount: "100.00",
            destinationAmount: "519.00",
            fee: "0.15",
            capturedAt: "2026-11-19T11:59:00.000Z",
          },
        ],
      },
    ],
  };

  const html = renderToStaticMarkup(
    createElement(RateHistoryTableView, {
      corridors: MOCK_CORRIDORS,
      initialHistory: historyWithMultiSources,
      selectedCorridorSlug: "usdc-us-brl-br",
    }),
  );

  assert.match(html, /Anchor Alpha/);
  assert.match(html, /Anchor Beta/);
  assert.match(html, /5\.2100000/);
  assert.match(html, /5\.1900000/);
  assert.match(html, /5\.2000000/);
});

test("displays empty state when points array is empty", () => {
  const emptyHistory: PublicRateHistoryResponse = {
    corridor: {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    windowDays: 90,
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    points: [],
  };

  const html = renderToStaticMarkup(
    createElement(RateHistoryTableView, {
      corridors: MOCK_CORRIDORS,
      initialHistory: emptyHistory,
      selectedCorridorSlug: "usdc-us-brl-br",
    }),
  );

  assert.match(html, /No rate observations are currently persisted for this corridor/);
});

test("displays error state and retry button when initialError is present", () => {
  const html = renderToStaticMarkup(
    createElement(RateHistoryTableView, {
      corridors: MOCK_CORRIDORS,
      initialHistory: null,
      selectedCorridorSlug: "usdc-us-brl-br",
      initialError: "Failed to connect to history repository",
    }),
  );

  assert.match(html, /Failed to connect to history repository/);
  assert.match(html, /Retry request/);
});

test("does not import or touch chart or CSV export modules", () => {
  assert.doesNotMatch(viewSource, /CorridorRateHistoryChart/);
  assert.doesNotMatch(viewSource, /historyCsv/);
  assert.doesNotMatch(pageSource, /CorridorRateHistoryChart/);
  assert.doesNotMatch(pageSource, /historyCsv/);
});
