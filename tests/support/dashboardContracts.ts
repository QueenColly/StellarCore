import * as React from "react";
import { loadAllFixtures } from "@/lib/api/compatibility/manifest";
import type { CompatibilityFixture } from "@/lib/api/compatibility/types";

/**
 * Shared dashboard API contract support.
 *
 * Fixtures are the canonical, synthetic API contract fixtures under
 * `contracts/api/v1/fixtures/` (no production data or secrets). They are loaded
 * here rather than copied, so dashboard tests and the compatibility gate assert
 * against the same response shapes.
 */

export type FieldType = "string" | "number" | "boolean" | "array" | "object";

export type ConsumedField = Readonly<{
  /** Dot path from the response body; `[]` steps into every array element. */
  path: string;
  type: FieldType;
  /** Key must be present but its value may be null. */
  nullable?: boolean;
  /** Key may be absent (the UI treats absence as "not applicable"). */
  optional?: boolean;
}>;

export type DashboardPanelContract = Readonly<{
  panel: string;
  endpoint: string;
  successFixtures: readonly string[];
  emptyFixtures: readonly string[];
  errorFixtures: readonly string[];
  emptyMessage: string;
  /** Every field the panel's view reads from a successful response. */
  consumedFields: readonly ConsumedField[];
}>;

export const DASHBOARD_PANEL_CONTRACTS: readonly DashboardPanelContract[] = [
  {
    panel: "AnchorsSection",
    endpoint: "GET /api/anchors",
    successFixtures: ["anchors.list.success"],
    emptyFixtures: ["anchors.list.empty"],
    errorFixtures: ["anchors.list.error_500"],
    emptyMessage: "No anchors are currently persisted.",
    consumedFields: [
      { path: "count", type: "number" },
      { path: "anchors", type: "array" },
      { path: "anchors[].slug", type: "string" },
      { path: "anchors[].name", type: "string" },
      { path: "anchors[].homeDomain", type: "string" },
      { path: "anchors[].status", type: "string" },
      { path: "anchors[].seps", type: "array" },
      { path: "anchors[].corridorCount", type: "number" },
      { path: "anchors[].isTransferCapable", type: "boolean" },
    ],
  },
  {
    panel: "CorridorsSection",
    endpoint: "GET /api/corridors",
    successFixtures: ["corridors.list.success"],
    emptyFixtures: ["corridors.list.empty"],
    errorFixtures: ["corridors.list.error_500"],
    emptyMessage: "No corridors are currently persisted.",
    consumedFields: [
      { path: "count", type: "number" },
      { path: "corridors", type: "array" },
      { path: "corridors[].slug", type: "string" },
      { path: "corridors[].sourceAsset", type: "string" },
      { path: "corridors[].sourceCountry", type: "string" },
      { path: "corridors[].destinationAsset", type: "string" },
      { path: "corridors[].destinationCountry", type: "string" },
      { path: "corridors[].anchorCount", type: "number" },
    ],
  },
  {
    panel: "RatePanel",
    endpoint: "GET /api/rates?corridor=:slug",
    successFixtures: ["rates.healthy.success", "rates.insufficient.success"],
    emptyFixtures: ["rates.empty.success"],
    errorFixtures: ["rates.error_400_missing", "rates.error_400_invalid", "rates.error_404", "rates.error_500"],
    emptyMessage: "No rate observations are currently persisted for this corridor.",
    consumedFields: [
      { path: "corridor.sourceAsset", type: "string" },
      { path: "corridor.sourceCountry", type: "string" },
      { path: "corridor.destinationAsset", type: "string" },
      { path: "corridor.destinationCountry", type: "string" },
      { path: "evaluatedAt", type: "string" },
      { path: "state", type: "string" },
      { path: "medianRate", type: "string", nullable: true },
      { path: "sourceCount", type: "number" },
      { path: "freshSourceCount", type: "number" },
      { path: "reviewedCandidateConfiguration.candidateCount", type: "number" },
      { path: "reviewedCandidateConfiguration.uniqueAnchorCount", type: "number" },
      { path: "medianRequirement.minimumFreshIndependentSources", type: "number" },
      { path: "observations", type: "array" },
      { path: "observations[].anchor.slug", type: "string" },
      { path: "observations[].anchor.name", type: "string" },
      { path: "observations[].rate", type: "string" },
      { path: "observations[].fee", type: "string" },
      { path: "observations[].capturedAt", type: "string" },
      { path: "observations[].freshness.state", type: "string" },
      { path: "observations[].eligibleForMedian", type: "boolean" },
      { path: "observations[].exclusionReason", type: "string", optional: true },
    ],
  },
  {
    panel: "ReputationSection",
    endpoint: "GET /api/reputation",
    successFixtures: ["reputation.list.success"],
    emptyFixtures: ["reputation.list.empty"],
    errorFixtures: ["reputation.list.error_500"],
    emptyMessage: "No anchors are currently persisted.",
    consumedFields: [
      { path: "count", type: "number" },
      { path: "reputation", type: "array" },
      { path: "reputation[].anchor.slug", type: "string" },
      { path: "reputation[].anchor.name", type: "string" },
      { path: "reputation[].state", type: "string" },
      { path: "reputation[].score", type: "number", nullable: true },
      { path: "reputation[].scoreBand", type: "string", nullable: true },
      { path: "reputation[].evidence", type: "object", nullable: true },
      { path: "reputation[].evidence.outcomeCount", type: "number" },
      { path: "reputation[].metrics", type: "object", nullable: true },
      { path: "reputation[].metrics.fillRate7d", type: "number", nullable: true },
      { path: "reputation[].metrics.fillRate30d", type: "number", nullable: true },
      { path: "reputation[].metrics.fillRate90d", type: "number", nullable: true },
      { path: "reputation[].metrics.settleP50Ms", type: "number", nullable: true },
      { path: "reputation[].metrics.settleP95Ms", type: "number", nullable: true },
      { path: "reputation[].metrics.slippageP50", type: "number", nullable: true },
      { path: "reputation[].computedAt", type: "string", nullable: true },
    ],
  },
];

let fixtureIndex: ReadonlyMap<string, CompatibilityFixture> | null = null;

export function loadContractFixture(name: string): CompatibilityFixture {
  fixtureIndex ??= new Map(loadAllFixtures().map((fixture) => [fixture.name, fixture]));
  const fixture = fixtureIndex.get(name);
  if (!fixture) {
    throw new Error(`Canonical contract fixture "${name}" not found in contracts/api/v1/fixtures.`);
  }
  return fixture;
}

/**
 * Returns a fixture as the `{ status, body }` API result a dashboard view
 * consumes. Bodies are deep-cloned so tests can mutate them safely.
 */
export function fixtureAsApiResult<TResult>(name: string): TResult {
  const fixture = loadContractFixture(name);
  return { status: fixture.expectedStatus, body: structuredClone(fixture.body) } as TResult;
}

function typeOf(value: unknown): FieldType | "null" | "undefined" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const type = typeof value;
  return type === "string" || type === "number" || type === "boolean" || type === "object"
    ? type
    : "undefined";
}

type Resolved = Readonly<{ location: string; present: boolean; value: unknown }>;

/**
 * Resolves a consumed-field path. Paths under a null parent are skipped: the
 * parent's own `nullable` entry already covers that case.
 */
function resolvePath(body: unknown, path: string): Resolved[] {
  let frontier: Resolved[] = [{ location: "body", present: true, value: body }];
  for (const segment of path.split(".")) {
    const isArrayStep = segment.endsWith("[]");
    const key = isArrayStep ? segment.slice(0, -2) : segment;
    const next: Resolved[] = [];
    for (const item of frontier) {
      if (item.value === null || typeof item.value !== "object") continue;
      const record = item.value as Record<string, unknown>;
      const present = Object.prototype.hasOwnProperty.call(record, key);
      const value = record[key];
      const location = `${item.location}.${key}`;
      if (!isArrayStep) {
        next.push({ location, present, value });
      } else if (Array.isArray(value)) {
        value.forEach((element, index) => next.push({ location: `${location}[${index}]`, present: true, value: element }));
      } else {
        next.push({ location, present, value });
      }
    }
    frontier = next;
  }
  return frontier;
}

/** Lists every consumed field that is missing, renamed away, or of the wrong type. */
export function findContractViolations(body: unknown, fields: readonly ConsumedField[]): string[] {
  const violations: string[] = [];
  for (const field of fields) {
    for (const { location, present, value } of resolvePath(body, field.path)) {
      if (!present) {
        if (!field.optional) violations.push(`${location}: missing (${field.path})`);
        continue;
      }
      const actual = typeOf(value);
      if (actual === "null" && field.nullable) continue;
      if (actual !== field.type) {
        violations.push(`${location}: expected ${field.type}${field.nullable ? " | null" : ""}, got ${actual}`);
      }
    }
  }
  return violations;
}

/** Counts how many concrete values each consumed field resolved to across bodies. */
export function consumedFieldCoverage(
  bodies: readonly unknown[],
  fields: readonly ConsumedField[],
): ReadonlyMap<string, number> {
  return new Map(
    fields.map((field) => [
      field.path,
      bodies.flatMap((body) => resolvePath(body, field.path)).filter((item) => item.present).length,
    ]),
  );
}

/**
 * tsx compiles component JSX with the classic runtime (tsconfig keeps
 * `jsx: preserve` for Next), so `React` must be reachable as a global when
 * dashboard views are rendered outside Next.
 */
export function exposeReactForClassicJsx(): void {
  (globalThis as { React?: typeof React }).React ??= React;
}
