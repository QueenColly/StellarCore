import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  parseSepMatrix,
  isSafeAnchorSlug,
  anchorDetailHref,
  readApiErrorMessage,
} from "@/app/insights/sep-capability-matrix/matrix";
import { MatrixView } from "@/app/insights/sep-capability-matrix/MatrixView";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

function getFixture(name: string) {
  return JSON.parse(
    readFileSync(
      new URL(`../../../contracts/api/v1/fixtures/anchors/${name}.json`, import.meta.url),
      "utf8",
    ),
  ).body;
}

function render(state: Parameters<typeof MatrixView>[0]["state"]): string {
  return renderToStaticMarkup(
    withTestAppRouter(React.createElement(MatrixView, { state })),
  );
}

test("parseSepMatrix extracts columns from actual SEP numbers and sorts them numerically", () => {
  const data = getFixture("list-success");
  const matrix = parseSepMatrix(data);

  assert.ok(matrix !== null);
  // From fixture: cowrie has [1, 24, 31], moneygram has [1, 24], zeam has [1, 10, 24, 31, 38]
  // Expected unique sorted SEPs: [1, 10, 24, 31, 38]
  assert.deepEqual(matrix.seps, [1, 10, 24, 31, 38]);
  assert.equal(matrix.rows.length, 3);

  // Check Cowrie
  const cowrie = matrix.rows.find((r) => r.slug === "cowrie");
  assert.ok(cowrie);
  assert.equal(cowrie.capabilities[1].state, "advertised");
  assert.equal(cowrie.capabilities[10].state, "not_advertised");
  assert.equal(cowrie.capabilities[24].state, "advertised");
  assert.equal(cowrie.capabilities[31].state, "advertised");
  assert.equal(cowrie.capabilities[38].state, "not_advertised");

  // Check Zeam
  const zeam = matrix.rows.find((r) => r.slug === "zeam");
  assert.ok(zeam);
  assert.equal(zeam.capabilities[1].state, "advertised");
  assert.equal(zeam.capabilities[10].state, "advertised");
  assert.equal(zeam.capabilities[24].state, "advertised");
  assert.equal(zeam.capabilities[31].state, "advertised");
  assert.equal(zeam.capabilities[38].state, "advertised");
});

test("parseSepMatrix marks UNKNOWN anchor status as unknown/unavailable", () => {
  const customData = {
    anchors: [
      {
        slug: "unverified",
        name: "Unverified Anchor",
        status: "UNKNOWN",
        seps: [1, 24],
      },
    ],
  };
  const matrix = parseSepMatrix(customData);
  assert.ok(matrix);
  assert.equal(matrix.rows[0].capabilities[1].state, "unknown");
  assert.equal(matrix.rows[0].capabilities[1].label, "Unknown/unavailable");
});

test("isSafeAnchorSlug and anchorDetailHref enforce safe URLs", () => {
  assert.equal(isSafeAnchorSlug("cowrie"), true);
  assert.equal(isSafeAnchorSlug("money-gram-12"), true);
  assert.equal(isSafeAnchorSlug(""), false);
  assert.equal(isSafeAnchorSlug("../malicious"), false);
  assert.equal(isSafeAnchorSlug("bad/path"), false);

  assert.equal(anchorDetailHref("cowrie"), "/anchors/cowrie");
  assert.equal(anchorDetailHref("../malicious"), "/anchors");
});

test("renders accessible table with row headers, col headers, and links", () => {
  const data = getFixture("list-success");
  const matrix = parseSepMatrix(data)!;
  const html = render({ kind: "ready", matrix });

  // Column headers
  assert.match(html, /<th[^>]*scope="col"[^>]*>Anchor<\/th>/);
  assert.match(html, /<th[^>]*scope="col"[^>]*>SEP-1<\/th>/);
  assert.match(html, /<th[^>]*scope="col"[^>]*>SEP-10<\/th>/);
  assert.match(html, /<th[^>]*scope="col"[^>]*>SEP-24<\/th>/);
  assert.match(html, /<th[^>]*scope="col"[^>]*>SEP-31<\/th>/);
  assert.match(html, /<th[^>]*scope="col"[^>]*>SEP-38<\/th>/);

  // Row headers and links
  assert.match(html, /<th[^>]*scope="row"/);
  assert.match(html, /href="\/anchors\/cowrie"/);
  assert.match(html, /href="\/anchors\/zeam"/);

  // Scrollable container keyboard accessible
  assert.match(html, /tabindex="0"/);
  assert.match(html, /role="region"/);
});

test("explicitly warns that advertised SEPs are not live health, transfers, or quotes", () => {
  const data = getFixture("list-success");
  const matrix = parseSepMatrix(data)!;
  const html = render({ kind: "ready", matrix });

  assert.match(
    html,
    /Last-synced advertisements reflect SEP-1 stellar\.toml data retrieved at last sync/,
  );
  assert.match(
    html,
    /Advertised capabilities are <strong>not<\/strong> live operational health, successful transfers, or current quote availability\./,
  );
});

test("renders empty, degraded, error, and loading states cleanly", () => {
  // Empty
  const emptyMatrix = parseSepMatrix({ anchors: [] })!;
  const emptyHtml = render({ kind: "ready", matrix: emptyMatrix });
  assert.match(emptyHtml, /No reviewed anchors or advertised SEP capabilities found/);

  // Degraded / stale
  const staleMatrix = parseSepMatrix(getFixture("list-success"), "stale")!;
  const staleHtml = render({ kind: "ready", matrix: staleMatrix });
  assert.match(staleHtml, /Degraded: showing last-synced SEP capabilities/);

  // Error
  const errorHtml = render({
    kind: "error",
    status: 500,
    message: "Internal database failure",
  });
  assert.match(errorHtml, /role="alert"/);
  assert.match(errorHtml, /Internal database failure/);

  // Loading
  const loadingHtml = render({ kind: "loading" });
  assert.match(loadingHtml, /role="status"/);
});

test("readApiErrorMessage extracts message cleanly", () => {
  assert.equal(
    readApiErrorMessage({ error: { message: "Invalid slug" } }),
    "Invalid slug",
  );
  assert.equal(readApiErrorMessage({ message: "Not found" }), "Not found");
  assert.equal(readApiErrorMessage(null), null);
  assert.equal(readApiErrorMessage("bad"), null);
});
