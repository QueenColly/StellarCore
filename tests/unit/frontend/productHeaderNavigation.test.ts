import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductHeader } from "@/components/ui/ProductHeader";

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

test("ProductHeader on home does not label dashboard as current page", () => {
  const html = renderToStaticMarkup(React.createElement(ProductHeader, { current: "home" }));
  assert.match(html, /href="#main-content"/, "Skip link must be present");
  assert.match(html, /href="#evidence-model"/, "Evidence model link must be present on home");
  assert.match(html, /href="\/dashboard"/, "Dashboard link must be present");
  assert.doesNotMatch(html, /aria-current="page"/, "Dashboard link must not have aria-current on home");
});

test("ProductHeader on dashboard labels dashboard link as current page", () => {
  const html = renderToStaticMarkup(React.createElement(ProductHeader, { current: "dashboard" }));
  assert.match(html, /href="#main-content"/, "Skip link must be present");
  assert.match(html, /href="\/"/, "Home link must be present");
  assert.match(html, /aria-current="page"/, "Dashboard link must have aria-current on dashboard");
  assert.match(html, /<a[^>]*aria-current="page"[^>]*href="\/dashboard"/, "Dashboard link must be marked aria-current='page'");
});

test("ProductHeader on detail does not label dashboard link as current page", () => {
  const html = renderToStaticMarkup(React.createElement(ProductHeader, { current: "detail" }));
  assert.match(html, /href="#main-content"/, "Skip link must be present");
  assert.match(html, /href="\/"/, "Home link must be present");
  assert.match(html, /href="\/dashboard"/, "Dashboard link must be present");
  assert.doesNotMatch(html, /aria-current="page"/, "Detail context must not set aria-current on dashboard link");
});

test("anchor and corridor detail pages use detail context for ProductHeader", () => {
  const anchorSource = read("app/anchors/[slug]/page.tsx");
  const corridorSource =
    read("app/corridors/[slug]/page.tsx") + read("app/corridors/[slug]/CorridorDetailView.tsx");
  const dashboardSource = read("app/dashboard/page.tsx");

  assert.match(anchorSource, /<ProductHeader current="detail"/, "anchor detail page must use current='detail'");
  assert.doesNotMatch(anchorSource, /<ProductHeader current="dashboard"/, "anchor detail page must not use current='dashboard'");
  assert.match(corridorSource, /<ProductHeader current="detail"/, "corridor detail page must use current='detail'");
  assert.doesNotMatch(corridorSource, /<ProductHeader current="dashboard"/, "corridor detail page must not use current='dashboard'");
  assert.match(dashboardSource, /<ProductHeader current="dashboard"/, "dashboard page must use current='dashboard'");
});
