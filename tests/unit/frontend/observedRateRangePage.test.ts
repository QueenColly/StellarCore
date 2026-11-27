import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL(
    "../../../app/insights/observed-rate-range/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const panelSource = readFileSync(
  new URL(
    "../../../components/insights/ObservedRateRangePanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("the standalone observed rate range page queries the existing read-only history GET", () => {
  assert.match(pageSource, /getRateHistoryApiResult/);
  assert.match(pageSource, /paramValue\(params\.corridor\)/);
  assert.match(pageSource, /paramValue\(params\.days\)/);
});

test("the page renders the history error response honestly as an alert", () => {
  assert.match(pageSource, /result\.status !== 200/);
  assert.match(pageSource, /role="alert"/);
  assert.match(pageSource, /result\.body\.error\.message/);
});

test("the panel derives its range from the public rate history response", () => {
  assert.match(panelSource, /summarizeObservedRateRange/);
  assert.match(panelSource, /useMemo\(\(\) => summarizeObservedRateRange\(history\)/);
});

test("the panel labels its display as a descriptive range of stored indicative values", () => {
  assert.match(panelSource, /Descriptive range of stored indicative values/);
  assert.match(panelSource, /not a median, quote, slippage figure, or market arbitrage claim/);
});

test("the panel displays minimum, maximum, absolute range, and honest empty states", () => {
  assert.match(panelSource, /Qualifying snapshots/);
  assert.match(panelSource, /Nonqualifying snapshots/);
  assert.match(panelSource, /Minimum rate/);
  assert.match(panelSource, /Maximum rate/);
  assert.match(panelSource, /Absolute range/);
  assert.match(panelSource, /Excluded rates/);
  assert.match(panelSource, /No snapshots recorded in this window\./);
  assert.match(panelSource, /No snapshots with two or more valid rates\./);
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

test("each rendered range belongs to an individual snapshot", () => {
  assert.match(panelSource, /summary\.snapshots\.map/);
  assert.match(panelSource, /snapshot\.timestamp/);
  assert.match(panelSource, /snapshot\.range/);
  assert.doesNotMatch(panelSource, /summary\.(minRate|maxRate|range)\b/);
});
