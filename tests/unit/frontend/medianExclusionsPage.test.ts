import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../../../app/insights/median-exclusions/page.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL(
    "../../../components/insights/MedianExclusionsPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("the standalone median exclusion page selects from the reviewed corridor directory and fetches rates", () => {
  assert.match(pageSource, /getCorridorsApiResult\(\)/);
  assert.match(pageSource, /getRatesApiResult\(resolvedSlug\)/);
  assert.match(pageSource, /paramValue\(params\.corridor\)/);
  assert.match(pageSource, /corridors\[0\]\?\.slug/);
});

test("the page renders directory and rates error responses honestly as alerts", () => {
  assert.match(pageSource, /directoryResult\.status !== 200/);
  assert.match(pageSource, /ratesResult !== null && ratesResult\.status !== 200/);
  assert.match(pageSource, /directoryResult\.body\.error\.message/);
  assert.match(pageSource, /ratesResult\.body\.error\.message/);
  assert.match(pageSource, /role="alert"/);
});

test("the panel derives the audit from the public rates response without recomputing the median", () => {
  assert.match(panelSource, /summarizeMedianExclusions\(rates\)/);
  assert.match(panelSource, /The median is not recomputed here/);
});

test("the panel offers a labeled, keyboard-accessible corridor selector", () => {
  assert.match(panelSource, /Select corridor/);
  assert.match(panelSource, /aria-label="Corridor"/);
  assert.match(panelSource, /value=\{selectedSlug \?\? ""\}/);
  assert.match(panelSource, /router\.push\(\s*`\/insights\/median-exclusions\?corridor=/);
});

test("the panel displays observed, eligible, and excluded counts plus the exclusion table", () => {
  assert.match(panelSource, /Observed observations/);
  assert.match(panelSource, /Eligible observations/);
  assert.match(panelSource, /Excluded observations/);
  assert.match(panelSource, /aria-label="Median exclusion groups by reason"/);
  assert.match(panelSource, /Anchor slugs/);
  assert.match(panelSource, /Captured \(UTC\)/);
  assert.match(panelSource, /formatObservationTimestampUtc/);
});

test("the view labels honest empty and zero-observation states and the not-reported reason", () => {
  assert.match(panelSource, /No excluded observations recorded for this corridor\./);
  assert.match(panelSource, /No corridor rates recorded\./);
  assert.match(panelSource, /REASON_NOT_REPORTED/);
});

test("stale snapshots are labelled as last-known-good observations", () => {
  assert.match(panelSource, /Stale snapshot data: this view shows last-known-good observations\./);
  assert.match(panelSource, /data-state="stale"/);
});

test("the view makes no operational, transfer, firm-quote, or reputation claims", () => {
  const combined = `${pageSource}\n${panelSource}`;
  for (const forbidden of ["operational", "transfer", "firm quote", "reputation"]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, "i"), `found forbidden claim: ${forbidden}`);
  }
});
