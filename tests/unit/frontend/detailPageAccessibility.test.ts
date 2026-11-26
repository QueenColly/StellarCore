import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

const anchorPage = read("app/anchors/[slug]/page.tsx");
// The corridor route fetches in page.tsx and renders its markup from the colocated view.
const corridorPage = read("app/corridors/[slug]/page.tsx") + read("app/corridors/[slug]/CorridorDetailView.tsx");
const rateEvidence = read("components/corridors/CorridorRateEvidence.tsx");
const globalStyles = read("app/globals.css");

const DETAIL_PAGES: readonly Readonly<{ page: string; source: string }>[] = [
  { page: "anchor detail", source: anchorPage },
  { page: "corridor detail", source: corridorPage },
];

test("both detail pages expose one main landmark that the shared skip link can reach", () => {
  for (const { page, source } of DETAIL_PAGES) {
    assert.match(source, /<ProductHeader current="detail"/, `${page} must render the shared header in detail context`);
    assert.match(source, /id="main-content"/, `${page} must expose the skip-link target`);
  }

  assert.match(
    read("components/ui/ProductHeader.tsx"),
    /className="skip-link" href="#main-content"/,
  );
});

test("both detail pages expose exactly one h1 and a labelled breadcrumb", () => {
  for (const { page, source } of DETAIL_PAGES) {
    assert.equal(
      source.match(/<h1[\s>]/g)?.length ?? 0,
      1,
      `${page} must have a single h1`,
    );
    assert.match(source, /<nav aria-label="Breadcrumb"/, `${page} must label its breadcrumb`);
    assert.match(source, /aria-current="page"/, `${page} must mark the current breadcrumb`);
  }
});

test("every interactive destination on the detail pages has a visible focus state", () => {
  for (const { page, source } of DETAIL_PAGES) {
    const links = source.match(/className="[^"]*"/g) ?? [];
    const interactiveStyles = links.filter((value) => /focus-visible:/.test(value));
    assert.ok(interactiveStyles.length > 0, `${page} must style focus on its interactive cards`);
    assert.match(source, /focus-visible:outline-2/);
    assert.match(source, /focus-visible:outline-\[var\(--accent\)\]/);
  }

  assert.match(
    globalStyles,
    /:where\(a, button, input, select, textarea, \[tabindex\]\):focus-visible \{ outline: 2px solid var\(--accent\);/,
    "the global focus-visible outline must remain the baseline",
  );
});

test("the corridor rate table is reachable and scrollable by keyboard alone", () => {
  assert.match(rateEvidence, /role="region"/);
  assert.match(rateEvidence, /aria-label="Persisted rate observations"/);
  assert.match(rateEvidence, /aria-describedby="rate-observations-scroll-hint"/);
  assert.match(rateEvidence, /className="sr-only"/);
  assert.match(rateEvidence, /arrow keys/);
  assert.match(rateEvidence, /tabIndex=\{0\}/);
  assert.match(rateEvidence, /focus-visible:outline-\[var\(--accent\)\]/);
});

test("detail pages do not trap keyboard focus or suppress the global outline", () => {
  for (const { page, source } of DETAIL_PAGES) {
    assert.doesNotMatch(source, /onKeyDown|onKeyUp|onKeyPress/, `${page} must not intercept keys`);
    assert.doesNotMatch(source, /tabIndex=\{-1\}/, `${page} must not remove focusability`);
    assert.doesNotMatch(source, /outline:\s*none|outline-none/, `${page} must not hide focus`);
  }
});

test("detail-page changes stay out of the landing and dashboard component trees", () => {
  assert.doesNotMatch(anchorPage, /@\/components\/(landing|dashboard)\//);
  assert.doesNotMatch(corridorPage, /@\/components\/(landing|dashboard)\//);
});

test("the anchor detail page renders real API data with an explicit 404 path", () => {
  assert.match(anchorPage, /getAnchorApiResult\(slug\)/);
  assert.match(anchorPage, /getAnchorReputationApiResult\(slug\)/);
  assert.match(anchorPage, /notFound\(\)/);
  assert.doesNotMatch(anchorPage, /mock|hardcoded|placeholder data/i);
});
