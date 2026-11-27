import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildAnchorCorridorMatrix,
  fetchAllPaginated,
  isSafeSlug,
  anchorDetailHref,
  corridorDetailHref,
  formatCorridorLabel,
} from "@/app/insights/anchor-corridor-matrix/matrix";
import { MatrixView } from "@/app/insights/anchor-corridor-matrix/MatrixView";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

function getFixture(domain: "anchors" | "corridors", name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../../contracts/api/v1/fixtures/${domain}/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).body;
}

function render(state: Parameters<typeof MatrixView>[0]["state"]): string {
  return renderToStaticMarkup(
    withTestAppRouter(React.createElement(MatrixView, { state })),
  );
}

test("buildAnchorCorridorMatrix correctly identifies reviewed, not_reviewed, and unknown associations", () => {
  const anchorsData = getFixture("anchors", "list-success").anchors; // cowrie, moneygram, zeam
  const corridorsData = getFixture("corridors", "list-success").corridors; // ngnt-ng-ngn-ng, usdc-us-brl-br
  const corridorDetail = getFixture("corridors", "detail-success").corridor; // usdc-us-brl-br has cowrie and zeam

  const corridorDetailsBySlug = {
    "usdc-us-brl-br": corridorDetail,
    "ngnt-ng-ngn-ng": null, // failed / missing detail
  };

  const matrix = buildAnchorCorridorMatrix({
    rawAnchors: anchorsData,
    rawCorridors: corridorsData,
    corridorDetailsBySlug,
  });

  assert.equal(matrix.anchors.length, 3);
  assert.equal(matrix.corridors.length, 2);
  assert.equal(matrix.hasUnknownCells, true);

  // Cowrie in usdc-us-brl-br -> reviewed
  const cowrie = matrix.anchors.find((a) => a.slug === "cowrie");
  assert.ok(cowrie);
  assert.equal(cowrie.memberships["usdc-us-brl-br"].state, "reviewed");
  assert.equal(cowrie.memberships["usdc-us-brl-br"].label, "Reviewed association");

  // MoneyGram in usdc-us-brl-br -> not_reviewed
  const moneygram = matrix.anchors.find((a) => a.slug === "moneygram");
  assert.ok(moneygram);
  assert.equal(moneygram.memberships["usdc-us-brl-br"].state, "not_reviewed");
  assert.equal(moneygram.memberships["usdc-us-brl-br"].label, "Not reviewed");

  // All anchors in ngnt-ng-ngn-ng -> unknown
  assert.equal(cowrie.memberships["ngnt-ng-ngn-ng"].state, "unknown");
  assert.equal(cowrie.memberships["ngnt-ng-ngn-ng"].label, "Unknown (data unavailable)");
  assert.equal(moneygram.memberships["ngnt-ng-ngn-ng"].state, "unknown");
});

test("deduplicates records and applies deterministic alphabetical ordering", () => {
  const rawAnchors = [
    { slug: "zeam", name: "Zeam" },
    { slug: "cowrie", name: "Cowrie" },
    { slug: "zeam", name: "Zeam Duplicate" },
    { slug: "anchor-a", name: "Alpha Anchor" },
  ];

  const rawCorridors = [
    { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR" },
    { slug: "eurc-eu-usd-us", sourceAsset: "EURC", sourceCountry: "EU", destinationAsset: "USD", destinationCountry: "US" },
    { slug: "eurc-eu-usd-us", sourceAsset: "EURC", sourceCountry: "EU", destinationAsset: "USD", destinationCountry: "US" },
  ];

  const matrix = buildAnchorCorridorMatrix({
    rawAnchors,
    rawCorridors,
    corridorDetailsBySlug: {},
  });

  // Unique anchors: 3
  assert.equal(matrix.anchors.length, 3);
  // Sorted by name: Alpha Anchor, Cowrie, Zeam
  assert.equal(matrix.anchors[0].name, "Alpha Anchor");
  assert.equal(matrix.anchors[1].name, "Cowrie");
  assert.equal(matrix.anchors[2].name, "Zeam");

  // Unique corridors: 2, sorted by slug: eurc-eu-usd-us, usdc-us-brl-br
  assert.equal(matrix.corridors.length, 2);
  assert.equal(matrix.corridors[0].slug, "eurc-eu-usd-us");
  assert.equal(matrix.corridors[1].slug, "usdc-us-brl-br");
});

test("isSafeSlug and detail links reject traversal or invalid characters", () => {
  assert.equal(isSafeSlug("usdc-brl"), true);
  assert.equal(isSafeSlug("cowrie"), true);
  assert.equal(isSafeSlug(""), false);
  assert.equal(isSafeSlug("../malicious"), false);
  assert.equal(isSafeSlug("bad?param=1"), false);

  assert.equal(anchorDetailHref("cowrie"), "/anchors/cowrie");
  assert.equal(anchorDetailHref("bad/slug"), "/anchors");
  assert.equal(corridorDetailHref("usdc-brl"), "/corridors/usdc-brl");
  assert.equal(corridorDetailHref("bad/slug"), "/corridors");

  assert.equal(
    formatCorridorLabel({
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    }),
    "USDC (US) → BRL (BR)",
  );
  assert.equal(formatCorridorLabel({ slug: "custom-slug" }), "custom-slug");
});

test("fetchAllPaginated iterates multiple pages until count is reached", async () => {
  let callCount = 0;
  const mockFetch = async (url: string | URL | Request) => {
    callCount++;
    const urlStr = String(url);
    if (urlStr.includes("offset=0")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({
          items: [{ slug: "item-1" }, { slug: "item-2" }],
          count: 3,
        }),
      } as unknown as Response;
    }
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        items: [{ slug: "item-3" }],
        count: 3,
      }),
    } as unknown as Response;
  };

  const result = await fetchAllPaginated<{ slug: string }>("/api/test", "items", {
    fetchFn: mockFetch as unknown as typeof fetch,
  });

  assert.equal(callCount, 2);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[0].slug, "item-1");
  assert.equal(result.items[2].slug, "item-3");
});

test("renders accessible table, semantic headers, and configuration disclaimer", () => {
  const anchorsData = getFixture("anchors", "list-success").anchors;
  const corridorsData = getFixture("corridors", "list-success").corridors;
  const corridorDetail = getFixture("corridors", "detail-success").corridor;

  const matrix = buildAnchorCorridorMatrix({
    rawAnchors: anchorsData,
    rawCorridors: corridorsData,
    corridorDetailsBySlug: {
      "usdc-us-brl-br": corridorDetail,
    },
  });

  const html = render({ kind: "ready", matrix });

  // Column headers with corridor link
  assert.match(html, /<th[^>]*scope="col"[^>]*>Anchor<\/th>/);
  assert.match(html, /href="\/corridors\/usdc-us-brl-br"/);

  // Row headers with anchor link
  assert.match(html, /<th[^>]*scope="row"/);
  assert.match(html, /href="\/anchors\/cowrie"/);

  // Table container
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="region"/);
  assert.match(html, /<caption class="sr-only">Reviewed anchor-to-corridor membership evidence matrix<\/caption>/);

  // Disclaimer notice
  assert.match(html, /Membership represents <strong>reviewed directory configuration<\/strong>/);
  assert.match(html, /It does <strong>not<\/strong> imply live operational status/);

  // Cell state attributes
  assert.match(html, /data-membership-state="reviewed"/);
  assert.match(html, /data-membership-state="unknown"/);
});

test("renders empty, degraded, error, and loading states cleanly", () => {
  // Empty
  const emptyMatrix = buildAnchorCorridorMatrix({
    rawAnchors: [],
    rawCorridors: [],
    corridorDetailsBySlug: {},
  });
  const emptyHtml = render({ kind: "ready", matrix: emptyMatrix });
  assert.match(emptyHtml, /No reviewed anchors or corridors available to display/);

  // Stale
  const staleMatrix = buildAnchorCorridorMatrix({
    rawAnchors: [{ slug: "cowrie", name: "Cowrie" }],
    rawCorridors: [{ slug: "usdc-brl" }],
    corridorDetailsBySlug: {},
    stale: true,
  });
  const staleHtml = render({ kind: "ready", matrix: staleMatrix });
  assert.match(staleHtml, /Degraded: showing last-known-good corridor associations/);

  // Error
  const errorHtml = render({
    kind: "error",
    status: 500,
    message: "Network timeout connecting to corridors service",
  });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Network timeout connecting to corridors service/);

  // Loading
  const loadingHtml = render({ kind: "loading" });
  assert.match(loadingHtml, /role="status"/);
});
