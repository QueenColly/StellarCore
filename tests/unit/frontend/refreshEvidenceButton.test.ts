import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import {
  REFRESH_STATUS_COPY,
  RefreshEvidenceButton,
  RefreshEvidenceControl,
  requestEvidenceRefresh,
  type RefreshEvidenceStatus,
} from "@/components/dashboard/RefreshEvidenceButton";
import { RatePanelView } from "@/components/dashboard/RatePanel";
import { ReputationSectionView } from "@/components/dashboard/ReputationSection";
import type { RatesApiResult } from "@/types/api/rates";
import type { ReputationApiListResult } from "@/types/api/reputation";
import {
  exposeReactForClassicJsx,
  withTestAppRouter,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

/** Issue #683: an explicit, reader-initiated refresh of displayed evidence. */

function read(relativePath: string): string {
  return readFileSync(new URL(`../../../${relativePath}`, import.meta.url), "utf8");
}

const buttonSource = read("components/dashboard/RefreshEvidenceButton.tsx");
const dashboardSource = read("app/dashboard/page.tsx");

function spyRouter() {
  const calls: string[] = [];
  const router: AppRouterInstance = {
    back: () => calls.push("back"),
    forward: () => calls.push("forward"),
    refresh: () => calls.push("refresh"),
    push: () => calls.push("push"),
    replace: () => calls.push("replace"),
    prefetch: () => calls.push("prefetch"),
  };
  return { router, calls };
}

type ElementWithProps = React.ReactElement<Record<string, unknown>>;

/** Walk a rendered element tree (pure components only) to find the button. */
function findButton(node: React.ReactNode): ElementWithProps | null {
  if (!React.isValidElement(node)) return null;
  const element = node as ElementWithProps;
  if (element.type === "button") return element;
  const children = React.Children.toArray(element.props.children as React.ReactNode);
  for (const child of children) {
    const found = findButton(child);
    if (found) return found;
  }
  return null;
}

test("a manual click requests exactly one server-component refresh", () => {
  const refreshes: string[] = [];
  const statuses: RefreshEvidenceStatus[] = [];
  const started = requestEvidenceRefresh({
    status: "idle",
    refresh: () => refreshes.push("refresh"),
    startTransition: (callback) => callback(),
    setStatus: (status) => statuses.push(status),
  });
  assert.equal(started, true);
  assert.deepEqual(refreshes, ["refresh"]);
  assert.deepEqual(statuses, ["pending"]);
});

test("the rendered control's click handler is what triggers the refresh", () => {
  const clicks: string[] = [];
  const tree = RefreshEvidenceControl({
    status: "idle",
    onRefresh: () => clicks.push("click"),
  });
  const button = findButton(tree);
  assert.ok(button, "a native button is rendered");
  assert.equal(button.props.type, "button");
  assert.equal(button.props.disabled, false);
  (button.props.onClick as () => void)();
  assert.deepEqual(clicks, ["click"]);
});

test("a pending refresh ignores duplicate clicks and disables the button", () => {
  const refreshes: string[] = [];
  const started = requestEvidenceRefresh({
    status: "pending",
    refresh: () => refreshes.push("refresh"),
    startTransition: (callback) => callback(),
    setStatus: () => assert.fail("status must not change while pending"),
  });
  assert.equal(started, false);
  assert.deepEqual(refreshes, []);

  const html = renderToStaticMarkup(
    React.createElement(RefreshEvidenceControl, { status: "pending", onRefresh: () => undefined }),
  );
  assert.match(html, /<button[^>]*disabled=""/);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /Refreshing displayed evidence…/);
  assert.match(html, /Re-reading persisted evidence…/);
});

test("a failed refresh releases the control so it can be used again", () => {
  const statuses: RefreshEvidenceStatus[] = [];
  const started = requestEvidenceRefresh({
    status: "idle",
    refresh: () => {
      throw new Error("router unavailable");
    },
    startTransition: (callback) => callback(),
    setStatus: (status) => statuses.push(status),
  });
  assert.equal(started, false);
  assert.deepEqual(statuses, ["pending", "failed"]);

  for (const status of ["failed", "completed", "idle"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(RefreshEvidenceControl, { status, onRefresh: () => undefined }),
    );
    assert.doesNotMatch(html, /disabled=""/, `${status} must be clickable`);
    assert.match(html, /aria-busy="false"/);
  }
});

test("feedback never claims data changed or became fresh", () => {
  for (const copy of Object.values(REFRESH_STATUS_COPY)) {
    assert.doesNotMatch(copy, /\b(updated|now fresh|latest data|new data|live)\b/i);
  }
  assert.match(REFRESH_STATUS_COPY.completed, /may be unchanged/);
  const html = renderToStaticMarkup(
    React.createElement(RefreshEvidenceControl, { status: "completed", onRefresh: () => undefined }),
  );
  assert.match(html, /role="status"/);
  assert.match(html, /aria-live="polite"/);
});

test("copy distinguishes re-reading persisted evidence from discovery or capture", () => {
  const html = renderToStaticMarkup(
    React.createElement(RefreshEvidenceControl, { status: "idle", onRefresh: () => undefined }),
  );
  assert.match(html, /Refresh displayed evidence/);
  assert.match(html, /Re-reads what StellarCore has already persisted/);
  assert.match(html, /does not run SEP discovery, capture new rates, request\s+fresh quotes, monitor sources or recalculate reputation/);
  assert.match(html, /aria-describedby="refresh-evidence-hint"/);
  // Keyboard accessible native button with a visible focus style.
  assert.match(html, /<button type="button"/);
  assert.match(html, /focus-visible:outline-2/);
  // No fabricated "last updated" timestamp.
  assert.doesNotMatch(html, /last updated|<time/i);
});

test("mounting the button does not refresh automatically", () => {
  const { router, calls } = spyRouter();
  const html = renderToStaticMarkup(
    React.createElement(
      AppRouterContext.Provider,
      { value: router },
      React.createElement(RefreshEvidenceButton),
    ),
  );
  assert.match(html, /Refresh displayed evidence/);
  assert.deepEqual(calls, []);
  // Only click handlers call refresh; nothing polls or refreshes in an effect.
  assert.doesNotMatch(buttonSource, /setInterval/);
  const executable = buttonSource
    .split("\n")
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .join("\n");
  assert.equal(executable.match(/router\.refresh\(\)/g)?.length, 1);
  assert.match(buttonSource, /refresh: \(\) => router\.refresh\(\)/);
  assert.doesNotMatch(buttonSource, /fetch\(|method: "POST"/);
});

test("the dashboard renders the control in its heading and keeps the four sections", () => {
  assert.match(dashboardSource, /import \{ RefreshEvidenceButton \} from "@\/components\/dashboard\/RefreshEvidenceButton";/);
  const header = dashboardSource.slice(
    dashboardSource.indexOf("<header"),
    dashboardSource.indexOf("</header>"),
  );
  assert.match(header, /<RefreshEvidenceButton \/>/);
  for (const section of ["AnchorsSection", "CorridorsSection", "RatePanel", "ReputationSection"]) {
    assert.match(dashboardSource, new RegExp(`<Suspense fallback=\\{<SectionSkeleton[^>]*/>\\}>\\s*<${section} />`));
  }
  assert.doesNotMatch(dashboardSource, /setInterval|revalidate\s*=/);
});

test("panel error and empty states are preserved alongside the refresh control", () => {
  const fixture = <T,>(domain: string, name: string): T => {
    const raw = JSON.parse(read(`contracts/api/v1/fixtures/${domain}/${name}.json`)) as {
      expectedStatus: number;
      body: unknown;
    };
    return { status: raw.expectedStatus, body: raw.body } as T;
  };

  const rateError = renderToStaticMarkup(withTestAppRouter(
    React.createElement(RatePanelView, { result: fixture<RatesApiResult>("rates", "error-internal-500") }),
  ));
  assert.match(rateError, /data-evidence-state="unavailable"/);
  assert.match(rateError, /Refresh dashboard data/, "existing error-state retry stays in place");

  const rateEmpty = renderToStaticMarkup(withTestAppRouter(
    React.createElement(RatePanelView, { result: fixture<RatesApiResult>("rates", "empty-success") }),
  ));
  assert.match(rateEmpty, /data-evidence-state="empty"/);

  const reputationEmpty = renderToStaticMarkup(withTestAppRouter(
    React.createElement(ReputationSectionView, {
      result: fixture<ReputationApiListResult>("reputation", "list-empty"),
    }),
  ));
  assert.match(reputationEmpty, /data-evidence-state="empty"/);
});
