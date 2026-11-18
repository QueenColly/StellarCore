import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnchorsSectionView } from "@/components/dashboard/AnchorsSection";
import { CorridorsSectionView } from "@/components/dashboard/CorridorsSection";
import { RatePanelView } from "@/components/dashboard/RatePanel";
import { ReputationSectionView } from "@/components/dashboard/ReputationSection";
import { SectionEmpty, SectionError, SectionSkeleton } from "@/components/dashboard/SectionStates";
import {
  DASHBOARD_PANEL_CONTRACTS,
  exposeReactForClassicJsx,
  fixtureAsApiResult,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

type ApiResult = { status: number; body: unknown };

/** Each evidence view, the component the dashboard suspends on, and its loading label. */
const EVIDENCE_VIEWS: ReadonlyArray<{
  panel: string;
  view: FunctionComponent<{ result: never }>;
  loadingLabel: string;
}> = [
  { panel: "AnchorsSection", view: AnchorsSectionView, loadingLabel: "anchors" },
  { panel: "CorridorsSection", view: CorridorsSectionView, loadingLabel: "corridors" },
  { panel: "RatePanel", view: RatePanelView, loadingLabel: "rates" },
  { panel: "ReputationSection", view: ReputationSectionView, loadingLabel: "reputation" },
];

const dashboardPageSource = readFileSync(new URL("../../../app/dashboard/page.tsx", import.meta.url), "utf8");
const dashboardLoadingSource = readFileSync(new URL("../../../app/dashboard/loading.tsx", import.meta.url), "utf8");

function renderView(view: FunctionComponent<{ result: never }>, fixtureName: string): string {
  return renderToStaticMarkup(createElement(view, { result: fixtureAsApiResult<ApiResult>(fixtureName) as never }));
}

function stateMarkers(html: string): string[] {
  return [...html.matchAll(/data-evidence-state="([a-z]+)"/g)].map((match) => match[1]!);
}

function assertLoading(html: string, label: string) {
  assert.deepEqual(stateMarkers(html), ["loading"]);
  assert.match(html, /^<div role="status" aria-busy="true" data-evidence-state="loading"/);
  assert.match(html, />Loading<span class="sr-only">: <\/span><\/p>/, "visible Loading tag");
  assert.ok(html.includes(`Loading ${label}…`), `names the ${label} view`);
  assert.match(html, /<div aria-hidden="true" class="mt-4 animate-pulse">/, "skeleton is decorative");
  assert.doesNotMatch(html, /role="alert"/);
}

function assertEmpty(html: string, message: string) {
  assert.deepEqual(stateMarkers(html), ["empty"]);
  assert.match(html, /<div role="status" data-evidence-state="empty"/);
  assert.doesNotMatch(html, /aria-busy/, "an empty result is settled, not loading");
  assert.match(html, />No data<span class="sr-only">: <\/span><\/p>/, "visible No data tag");
  assert.ok(html.includes(message));
  assert.doesNotMatch(html, /role="alert"/);
}

function assertUnavailable(html: string, message: string) {
  assert.deepEqual(stateMarkers(html), ["unavailable"]);
  assert.match(html, /^<div role="alert" data-evidence-state="unavailable"/);
  assert.match(html, />Unavailable<span class="sr-only">: <\/span><\/p>/, "visible Unavailable tag");
  assert.ok(html.includes(message));
  assert.ok(html.includes("This does not mean it is absent."));
  assert.doesNotMatch(html, /role="status"/);
}

for (const { panel, view, loadingLabel } of EVIDENCE_VIEWS) {
  const contract = DASHBOARD_PANEL_CONTRACTS.find((candidate) => candidate.panel === panel);
  assert.ok(contract, `no dashboard contract for ${panel}`);

  test(`${panel}: loading state is a labelled, busy status region`, () => {
    const fallback = new RegExp(
      `<Suspense fallback=\\{<SectionSkeleton label="${loadingLabel}" />\\}>\\s*<${panel} />`,
    );
    assert.match(dashboardPageSource, fallback, `dashboard suspends ${panel} on the shared loading state`);
    assertLoading(renderToStaticMarkup(createElement(SectionSkeleton, { label: loadingLabel })), loadingLabel);
  });

  test(`${panel}: valid empty result renders the shared empty state`, () => {
    for (const name of contract.emptyFixtures) {
      assertEmpty(renderView(view, name), contract.emptyMessage);
    }
  });

  test(`${panel}: failed load renders the shared unavailable state`, () => {
    for (const name of contract.errorFixtures) {
      const result = fixtureAsApiResult<{ body: { error: { message: string } } }>(name);
      assertUnavailable(renderView(view, name), result.body.error.message);
    }
  });

  test(`${panel}: present evidence renders no loading, empty, or unavailable state`, () => {
    for (const name of contract.successFixtures) {
      const html = renderView(view, name);
      assert.deepEqual(stateMarkers(html), [], name);
      assert.doesNotMatch(html, /role="(alert|status)"/, name);
    }
  });
}

test("the three states are semantically and visually distinct", () => {
  const loading = renderToStaticMarkup(createElement(SectionSkeleton, { label: "anchors" }));
  const empty = renderToStaticMarkup(createElement(SectionEmpty, { message: "Nothing here." }));
  const unavailable = renderToStaticMarkup(createElement(SectionError, { message: "Unable to load." }));

  const roles = [loading, empty, unavailable].map((html) => html.match(/^<div role="(\w+)"/)?.[1]);
  assert.deepEqual(roles, ["status", "status", "alert"]);
  assert.ok(loading.includes('aria-busy="true"') && !empty.includes("aria-busy"), "loading vs empty differ by busy state");

  const tags = [loading, empty, unavailable].map((html) => html.match(/>([A-Za-z ]+)<span class="sr-only">/)?.[1]);
  assert.deepEqual(tags, ["Loading", "No data", "Unavailable"], "distinct visible tags, not colour alone");

  assert.match(empty, /border-dashed/);
  assert.doesNotMatch(loading, /border-dashed/);
  assert.match(unavailable, /bg-\[rgba\(238,143,129,0\.08\)\]/);
  assert.doesNotMatch(empty, /rgba\(238,143,129/);
});

test("route-level dashboard loading names each evidence view once", () => {
  const labels = [...dashboardLoadingSource.matchAll(/<SectionSkeleton label="([^"]+)" \/>/g)].map((m) => m[1]);
  assert.deepEqual(labels, EVIDENCE_VIEWS.map(({ loadingLabel }) => loadingLabel));
  assert.match(dashboardLoadingSource, /<div aria-hidden="true" className="h-10 w-64 animate-pulse/);
});

test("evidence views use only the shared state components", () => {
  for (const file of ["AnchorsSection", "CorridorsSection", "RatePanel", "ReputationSection"]) {
    const source = readFileSync(new URL(`../../../components/dashboard/${file}.tsx`, import.meta.url), "utf8");
    assert.match(source, /from "@\/components\/dashboard\/SectionStates"/, file);
    assert.doesNotMatch(source, /role="(alert|status)"/, `${file} must not hand-roll state semantics`);
  }
});
