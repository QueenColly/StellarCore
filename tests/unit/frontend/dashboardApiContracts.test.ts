import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type FunctionComponent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AnchorsSectionView } from "@/components/dashboard/AnchorsSection";
import { CorridorsSectionView } from "@/components/dashboard/CorridorsSection";
import { RatePanelView } from "@/components/dashboard/RatePanel";
import { ReputationSectionView } from "@/components/dashboard/ReputationSection";
import {
  DASHBOARD_PANEL_CONTRACTS,
  consumedFieldCoverage,
  exposeReactForClassicJsx,
  findContractViolations,
  fixtureAsApiResult,
  loadContractFixture,
  type DashboardPanelContract,
} from "../../support/dashboardContracts";

exposeReactForClassicJsx();

type ApiResult = { status: number; body: unknown };

const VIEWS: Record<string, FunctionComponent<{ result: never }>> = {
  AnchorsSection: AnchorsSectionView,
  CorridorsSection: CorridorsSectionView,
  RatePanel: RatePanelView,
  ReputationSection: ReputationSectionView,
};

/** Consumed fields each view renders verbatim, so the markup must contain their fixture values. */
const VERBATIM_FIELDS: Record<string, readonly string[]> = {
  AnchorsSection: ["anchors[].name", "anchors[].homeDomain", "anchors[].slug"],
  CorridorsSection: [
    "corridors[].sourceAsset",
    "corridors[].sourceCountry",
    "corridors[].destinationAsset",
    "corridors[].destinationCountry",
  ],
  RatePanel: ["medianRate", "observations[].anchor.name", "observations[].rate", "observations[].fee"],
  ReputationSection: ["reputation[].anchor.name", "reputation[].score"],
};

/** Endpoint without its query template; e.g. the missing-corridor fixture omits `?corridor=`. */
function routeOf(endpoint: string): string {
  return endpoint.split("?")[0]!;
}

function render(contract: DashboardPanelContract, result: ApiResult): string {
  const view = VIEWS[contract.panel];
  assert.ok(view, `no view registered for ${contract.panel}`);
  return renderToStaticMarkup(createElement(view, { result: result as never }));
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Collects concrete values at a consumed-field path (skipping nulls). */
function valuesAt(body: unknown, path: string): unknown[] {
  let frontier: unknown[] = [body];
  for (const segment of path.split(".")) {
    const key = segment.replace(/\[\]$/, "");
    frontier = frontier.flatMap((item) => {
      if (item === null || typeof item !== "object") return [];
      const value = (item as Record<string, unknown>)[key];
      return segment.endsWith("[]") && Array.isArray(value) ? value : [value];
    });
  }
  return frontier.filter((value) => value !== null && value !== undefined);
}

/** Applies `mutate` to the parent object of the first non-null location of `path`. */
function mutateFirst(
  body: unknown,
  path: string,
  mutate: (parent: Record<string, unknown>, key: string) => void,
): boolean {
  const segments = path.split(".");
  const leaf = segments.pop()!.replace(/\[\]$/, "");
  let parents: unknown[] = [body];
  for (const segment of segments) {
    const key = segment.replace(/\[\]$/, "");
    parents = parents.flatMap((item) => {
      if (item === null || typeof item !== "object") return [];
      const value = (item as Record<string, unknown>)[key];
      return segment.endsWith("[]") && Array.isArray(value) ? value : [value];
    });
  }
  const parent = parents.find(
    (item): item is Record<string, unknown> =>
      item !== null &&
      typeof item === "object" &&
      (item as Record<string, unknown>)[leaf] !== null &&
      (item as Record<string, unknown>)[leaf] !== undefined,
  );
  if (!parent) return false;
  mutate(parent, leaf);
  return true;
}

function differentlyTyped(value: unknown): unknown {
  if (typeof value === "string") return 42;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return {};
  return "unexpected";
}

for (const contract of DASHBOARD_PANEL_CONTRACTS) {
  const successBodies = contract.successFixtures.map((name) => loadContractFixture(name).body);

  test(`${contract.panel}: every fixture is a canonical ${contract.endpoint} contract`, () => {
    for (const name of [...contract.successFixtures, ...contract.emptyFixtures]) {
      const fixture = loadContractFixture(name);
      assert.equal(fixture.endpoint, contract.endpoint, name);
      assert.equal(fixture.expectedStatus, 200, name);
    }
    for (const name of contract.errorFixtures) {
      const fixture = loadContractFixture(name);
      assert.equal(routeOf(fixture.endpoint), routeOf(contract.endpoint), name);
      assert.ok(fixture.expectedStatus >= 400, `${name} must be an error status`);
    }
  });

  test(`${contract.panel}: success fixtures provide every field the panel consumes`, () => {
    for (const [index, body] of successBodies.entries()) {
      assert.deepEqual(findContractViolations(body, contract.consumedFields), [], contract.successFixtures[index]);
    }
  });

  test(`${contract.panel}: every consumed field is exercised by at least one success fixture`, () => {
    for (const [path, count] of consumedFieldCoverage(successBodies, contract.consumedFields)) {
      assert.ok(count > 0, `${path} is never present in ${contract.successFixtures.join(", ")}`);
    }
  });

  test(`${contract.panel}: contract check detects removed, renamed, and retyped consumed fields`, () => {
    for (const field of contract.consumedFields) {
      const body = successBodies.find((candidate) => valuesAt(candidate, field.path).length > 0);
      assert.ok(body, `no success fixture carries a non-null ${field.path}`);

      const removed = structuredClone(body);
      assert.ok(mutateFirst(removed, field.path, (parent, key) => delete parent[key]));
      if (!field.optional) {
        assert.notDeepEqual(findContractViolations(removed, contract.consumedFields), [], `removed ${field.path}`);
      }

      const renamed = structuredClone(body);
      mutateFirst(renamed, field.path, (parent, key) => {
        parent[`${key}Renamed`] = parent[key];
        delete parent[key];
      });
      if (!field.optional) {
        assert.notDeepEqual(findContractViolations(renamed, contract.consumedFields), [], `renamed ${field.path}`);
      }

      const retyped = structuredClone(body);
      assert.ok(mutateFirst(retyped, field.path, (parent, key) => {
        parent[key] = differentlyTyped(parent[key]);
      }));
      assert.notDeepEqual(findContractViolations(retyped, contract.consumedFields), [], `retyped ${field.path}`);
    }
  });

  test(`${contract.panel}: renders every verbatim consumed value from success fixtures`, () => {
    for (const name of contract.successFixtures) {
      const result = fixtureAsApiResult<ApiResult>(name);
      const html = render(contract, result);
      assert.doesNotMatch(html, /role="alert"/, `${name} must not render an error state`);
      assert.ok(!html.includes(contract.emptyMessage) || contract.panel === "RatePanel", `${name} rendered as empty`);
      for (const path of VERBATIM_FIELDS[contract.panel] ?? []) {
        for (const value of valuesAt(result.body, path)) {
          assert.ok(html.includes(escapeHtml(String(value))), `${name}: ${path} value "${value}" not rendered`);
        }
      }
    }
  });

  test(`${contract.panel}: valid empty results render the empty state, not an error`, () => {
    for (const name of contract.emptyFixtures) {
      const result = fixtureAsApiResult<ApiResult>(name);
      assert.deepEqual(findContractViolations(result.body, contract.consumedFields), [], name);
      assert.equal("error" in (result.body as object), false, `${name} must not carry an error envelope`);

      const html = render(contract, result);
      assert.ok(html.includes(contract.emptyMessage), `${name} must render "${contract.emptyMessage}"`);
      assert.doesNotMatch(html, /role="alert"/, `${name} must not render an error state`);
    }
  });

  test(`${contract.panel}: error payloads keep the envelope and render as errors, not empty results`, () => {
    for (const name of contract.errorFixtures) {
      const result = fixtureAsApiResult<ApiResult>(name);
      const body = result.body as { error?: { code?: unknown; message?: unknown } };
      assert.equal(typeof body.error?.code, "string", `${name}: error.code`);
      assert.equal(typeof body.error?.message, "string", `${name}: error.message`);
      assert.notDeepEqual(
        findContractViolations(result.body, contract.consumedFields),
        [],
        `${name} must not satisfy the success contract`,
      );

      const html = render(contract, result);
      assert.match(html, /role="alert"/, `${name} must render an error state`);
      assert.ok(html.includes(escapeHtml(String(body.error?.message))), `${name}: message not rendered`);
      assert.ok(!html.includes(contract.emptyMessage), `${name} must not render as an empty result`);
    }
  });
}

test("a renamed consumed field is visible as a rendering regression and a contract violation", () => {
  const result = fixtureAsApiResult<ApiResult>("anchors.list.success");
  const body = result.body as { anchors: Array<Record<string, unknown>> };
  const originalName = String(body.anchors[0]!.name);
  body.anchors[0]!.displayName = body.anchors[0]!.name;
  delete body.anchors[0]!.name;

  const contract = DASHBOARD_PANEL_CONTRACTS.find(({ panel }) => panel === "AnchorsSection")!;
  assert.deepEqual(findContractViolations(body, contract.consumedFields), [
    "body.anchors[0].name: missing (anchors[].name)",
  ]);
  assert.ok(!render(contract, result).includes(`>${originalName}<`));
});

test("dashboard panel contracts cover every live-data panel on the dashboard", () => {
  assert.deepEqual(
    DASHBOARD_PANEL_CONTRACTS.map(({ panel }) => panel).sort(),
    Object.keys(VIEWS).sort(),
  );
});
