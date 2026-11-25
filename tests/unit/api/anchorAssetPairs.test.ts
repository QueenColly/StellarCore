import assert from "node:assert/strict";
import test from "node:test";

import { summarizeAnchorAssetPairs } from "@/lib/api/anchorAssetPairs";
import type {
  PublicAnchorCorridor,
  PublicAnchorDetail,
} from "@/types/api/anchors";

function corridor(
  slug: string,
  sourceAsset: string,
  destinationAsset: string,
  sourceCountry: string,
  destinationCountry: string,
): PublicAnchorCorridor {
  return Object.freeze({
    slug,
    sourceAsset,
    sourceCountry,
    destinationAsset,
    destinationCountry,
  });
}

function detail(corridors: readonly PublicAnchorCorridor[]): PublicAnchorDetail {
  return Object.freeze({
    slug: "anchor-a",
    name: "Anchor A",
    homeDomain: "anchor-a.example.com",
    status: "LIVE",
    seps: [1, 38],
    isTransferCapable: true,
    corridors: Object.freeze([...corridors]),
  });
}

test("one asset pair across countries produces a single group with distinct sorted country pairs", () => {
  const summary = summarizeAnchorAssetPairs(
    detail([
      corridor("cor-1", "USDC", "BRL", "US", "BR"),
      corridor("cor-2", "USDC", "BRL", "BR", "US"),
      corridor("cor-3", "USDC", "BRL", "US", "BR"),
    ]),
  );
  assert.equal(summary.length, 1);
  assert.equal(summary[0]?.sourceAsset, "USDC");
  assert.equal(summary[0]?.destinationAsset, "BRL");
  assert.deepEqual(summary[0]?.countryPairs, [
    Object.freeze({ sourceCountry: "BR", destinationCountry: "US" }),
    Object.freeze({ sourceCountry: "US", destinationCountry: "BR" }),
  ]);
});

test("multiple asset pairs produce separate groups sorted by source and destination asset", () => {
  const summary = summarizeAnchorAssetPairs(
    detail([
      corridor("cor-usdc", "USDC", "BRL", "US", "BR"),
      corridor("cor-ngn", "NGN", "USD", "NG", "US"),
    ]),
  );
  assert.equal(summary.length, 2);
  assert.deepEqual(
    summary.map((group) => group.sourceAsset),
    ["NGN", "USDC"],
  );
  assert.deepEqual(summary[0]?.corridorSlugs, ["cor-ngn"]);
  assert.deepEqual(summary[1]?.corridorSlugs, ["cor-usdc"]);
});

test("repeated slugs collapse within and across asset-pair groups", () => {
  const summary = summarizeAnchorAssetPairs(
    detail([
      corridor("cor-1", "USDC", "BRL", "US", "BR"),
      corridor("cor-1", "USDC", "BRL", "US", "BR"),
      corridor("cor-2", "NGN", "USD", "NG", "US"),
      corridor("cor-2", "NGN", "USD", "NG", "US"),
    ]),
  );
  assert.deepEqual(
    summary.map((group) => [group.sourceAsset, group.destinationAsset]),
    [
      ["NGN", "USD"],
      ["USDC", "BRL"],
    ],
  );
  assert.deepEqual(summary[0]?.corridorSlugs, ["cor-2"]);
  assert.deepEqual(summary[1]?.corridorSlugs, ["cor-1"]);
});

test("an anchor with no corridor associations yields no groups", () => {
  assert.deepEqual(summarizeAnchorAssetPairs(detail([])), []);
});

test("unknown or missing asset codes are preserved as recorded (empty strings)", () => {
  const missingAssets = { slug: "cor-1" } as unknown as PublicAnchorCorridor;
  const summary = summarizeAnchorAssetPairs(detail([missingAssets]));
  assert.equal(summary.length, 1);
  assert.equal(summary[0]?.sourceAsset, "");
  assert.equal(summary[0]?.destinationAsset, "");
  assert.deepEqual(summary[0]?.corridorSlugs, ["cor-1"]);

  const missingSlug = {
    sourceAsset: "USDC",
  } as unknown as PublicAnchorCorridor;
  const bySlug = summarizeAnchorAssetPairs(detail([missingSlug, missingSlug]));
  assert.equal(bySlug.length, 1);
  assert.equal(bySlug[0]?.sourceAsset, "USDC");
  assert.equal(bySlug[0]?.corridorSlugs.length, 0);
});

test("null or missing details yield no groups", () => {
  assert.deepEqual(summarizeAnchorAssetPairs(null), []);
  assert.deepEqual(summarizeAnchorAssetPairs(undefined), []);
});
