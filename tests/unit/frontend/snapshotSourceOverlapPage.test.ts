import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../../../app/insights/snapshot-source-overlap/page.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL(
    "../../../components/insights/SnapshotSourceOverlapPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("the standalone snapshot source overlap page queries the existing read-only history GET", () => {
  assert.match(pageSource, /getRateHistoryApiResult/);
  assert.match(pageSource, /paramValue\(params\.corridor\)/);
  assert.match(pageSource, /paramValue\(params\.days\)/);
});

test("the page renders the history error response honestly as an alert", () => {
  assert.match(pageSource, /result\.status !== 200/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /result\.body\.error\.message/);
});

test("the panel derives its rows from the public rate history response", () => {
  assert.match(panelSource, /summarizeSnapshots/);
  assert.match(panelSource, /filterSnapshotsBySource/);
  assert.match(panelSource, /formatSnapshotTimestampUtc/);
});

test("the panel shows UTC timestamps, distinct observed counts, and published medians separately", () => {
  assert.match(panelSource, /UTC timestamp/);
  assert.match(panelSource, /Distinct observed anchors/);
  assert.match(panelSource, /Published median/);
  assert.match(panelSource, /Median unavailable/);
  assert.match(panelSource, /Observed anchors/);
});

test("the panel exposes single-source and multiple-source snapshot filters", () => {
  assert.match(panelSource, /Single-source snapshots/);
  assert.match(panelSource, /Multiple-source snapshots/);
  assert.match(panelSource, /aria-label="Snapshot source filter"/);
  assert.match(panelSource, /aria-pressed=\{sourceFilter === option\.value\}/);
  assert.match(panelSource, /setSourceFilter/);
});

test("empty, missing, and filterless states are labelled honestly", () => {
  assert.match(panelSource, /No snapshots recorded in this window\./);
  assert.match(panelSource, /No snapshots match the selected source filter\./);
  assert.match(panelSource, /None recorded for this snapshot\./);
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
