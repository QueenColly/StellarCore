import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { NetworkMap } from "@/components/landing/LandingPage";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

type Corridor = Parameters<typeof NetworkMap>[0]["reviewedCorridors"][number];

const CORRIDORS: readonly Corridor[] = [
  { slug: "usdc-us-br", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "BRL", countryTo: "BR" },
  { slug: "usdc-us-ng", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "NGN", countryTo: "NG" },
  { slug: "usdc-us-us", assetCodeFrom: "USDC", countryFrom: "US", assetCodeTo: "USDC", countryTo: "US" },
];

function render(corridors: readonly Corridor[]): string {
  return renderToStaticMarkup(createElement(NetworkMap, { reviewedCorridors: corridors }));
}

function corridorHrefs(html: string): string[] {
  return [...html.matchAll(/<a[^>]+href="([^"]+)"/g)].map((match) => match[1]!);
}

test("every reviewed corridor label links to its matching detail route", () => {
  const html = render(CORRIDORS);

  assert.deepEqual(corridorHrefs(html), [
    "/corridors/usdc-us-br",
    "/corridors/usdc-us-ng",
    "/corridors/usdc-us-us",
  ]);
  for (const corridor of CORRIDORS) {
    assert.ok(html.includes(`${corridor.assetCodeFrom} · ${corridor.countryFrom} → ${corridor.assetCodeTo} · ${corridor.countryTo}`));
  }
  assert.equal(html.match(/view reviewed corridor evidence/g)?.length ?? 0, CORRIDORS.length);
  assert.match(html, /aria-label="Reviewed corridor configuration"/);
  assert.match(html, /cross-country geography/);
  assert.match(html, /local geography/);
});

test("corridor links expose hover and visible keyboard focus styling", () => {
  const html = render(CORRIDORS);
  const anchors = html.match(/<a class="[^"]+" href="\/corridors\/[^"]+"/g) ?? [];

  assert.equal(anchors.length, CORRIDORS.length);
  for (const anchor of anchors) {
    assert.match(anchor, /hover:text-\[var\(--accent\)\]/);
    assert.match(anchor, /focus-visible:text-\[var\(--accent\)\]/);
    assert.match(anchor, /focus-visible:outline-2/);
    assert.match(anchor, /focus-visible:outline-\[var\(--accent\)\]/);
  }
});

test("the decorative map and configuration-only captions remain non-interactive", () => {
  const html = render(CORRIDORS);
  const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>") + 6);

  assert.match(svg, /^<svg[^>]*aria-hidden="true"[^>]*focusable="false"/);
  assert.doesNotMatch(svg, /<a\b/);
  assert.doesNotMatch(html, /onClick|onKeyDown/);
  assert.match(html, /Reviewed configuration/);
  assert.match(html, /Persisted observations: dashboard only/);
  assert.match(html, /Configuration ≠ observation/);
  assert.match(html, /Persisted observations are not plotted on this landing-page map/);
});

test("empty and short reviewed corridor lists render safely", () => {
  const empty = render([]);
  assert.deepEqual(corridorHrefs(empty), []);
  assert.match(empty, /<ul class="map-corridor-list"[^>]*><\/ul>/);

  const single = render([CORRIDORS[0]!]);
  assert.deepEqual(corridorHrefs(single), ["/corridors/usdc-us-br"]);
});
