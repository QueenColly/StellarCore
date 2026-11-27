import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import EvidenceStatesGuidePage from "@/app/learn/evidence-states/page";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const guideSource = readFileSync(
  new URL("../../../app/learn/evidence-states/page.tsx", import.meta.url),
  "utf8",
);

function render(): string {
  return renderToStaticMarkup(React.createElement(EvidenceStatesGuidePage));
}

test("the guide offers labelled in-page navigation to every major section", () => {
  const html = render();

  assert.match(html, /<nav[^>]*aria-labelledby="guide-nav-heading"[^>]*>/);
  assert.match(html, /data-evidence-guide="jump-nav"/);
  assert.match(html, /<h2 id="guide-nav-heading" class="sr-only">On this page<\/h2>/);

  for (const id of [
    "evidence-chain-heading",
    "thresholds-heading",
    "state-boundaries-heading",
    "references-heading",
  ]) {
    assert.match(html, new RegExp(`href="#${id}"`));
    assert.match(html, new RegExp(`id="${id}"`));
  }
});

test("jump links are keyboard reachable without adding runtime behavior", () => {
  const html = render();

  assert.equal(html.match(/focus-visible:outline-1/g)?.length, 4);
  assert.doesNotMatch(html, /href="#"|href="\/api\//);
  assert.doesNotMatch(guideSource, /"use client"|useEffect|fetch\(|setInterval|setTimeout/);
});
