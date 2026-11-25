import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const pageSource = readFileSync(
  new URL("../../../app/insights/anchor-asset-pairs/page.tsx", import.meta.url),
  "utf8",
);
const panelSource = readFileSync(
  new URL(
    "../../../components/insights/AnchorAssetPairsPanel.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("the standalone anchor asset-pair page selects from the public directory and fetches detail", () => {
  assert.match(pageSource, /getAnchorsApiResult\(\)/);
  assert.match(pageSource, /getAnchorApiResult\(resolvedSlug\)/);
  assert.match(pageSource, /anchors\[0\]\?\.slug/);
});

test("the page renders directory and detail error responses honestly as alerts", () => {
  assert.match(pageSource, /directoryResult\.status !== 200/);
  assert.match(pageSource, /detailResult && detailResult\.status !== 200/);
  assert.match(pageSource, /directoryResult\.body\.error\.message/);
  assert.match(pageSource, /detailResult\.body\.error\.message/);
  assert.match(pageSource, /role="alert"/);
});

test("the panel derives groups from the public anchor detail response", () => {
  assert.match(panelSource, /summarizeAnchorAssetPairs\(anchorDetail\)/);
  assert.match(panelSource, /useRouter\(\)/);
  assert.match(panelSource, /router\.push\(\s*`\/insights\/anchor-asset-pairs\?anchor=/);
});

test("the panel offers a labeled, keyboard-accessible anchor select", () => {
  assert.match(panelSource, /label[\s\S]*Select anchor/);
  assert.match(panelSource, /aria-label="Anchor"/);
  assert.match(panelSource, /value=\{selectedSlug \?\? ""\}/);
  assert.match(panelSource, /anchor\.name \|\| anchor\.slug/);
});

test("the panel displays asset pairs, country pairs, and corridor links per group", () => {
  assert.match(panelSource, /displayText\(group\.sourceAsset\)/);
  assert.match(panelSource, /displayText\(group\.destinationAsset\)/);
  assert.match(panelSource, /displayText\(pair\.sourceCountry\)/);
  assert.match(panelSource, /displayText\(pair\.destinationCountry\)/);
  assert.match(panelSource, /href=\{`\/corridors\/\$\{slug\}`\}/);
});

test("the view labels honest empty and zero-association states", () => {
  assert.match(panelSource, /No reviewed anchors are currently recorded\./);
  assert.match(panelSource, /No reviewed corridor associations for this anchor\./);
  assert.match(panelSource, /Reviewed registry membership only: corridor rows persisted on this anchor\./);
});

test("the view makes no operational, transfer, firm-quote, or reputation claims", () => {
  const combined = `${pageSource}\n${panelSource}`;
  for (const forbidden of ["operational", "transfer", "firm quote", "reputation"]) {
    assert.doesNotMatch(combined, new RegExp(forbidden, "i"), `found forbidden claim: ${forbidden}`);
  }
});
