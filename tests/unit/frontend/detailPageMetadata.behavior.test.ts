import assert from "node:assert/strict";
import test, { mock } from "node:test";

type AnchorResult = { status: 200 | 400 | 404 | 500; body: unknown };
type CorridorResult = { status: 200 | 400 | 404 | 500; body: unknown };

const anchorResult: { current: AnchorResult } = {
  current: { status: 404, body: { error: { code: "anchor_not_found", message: "Anchor not found." } } },
};
const corridorResult: { current: CorridorResult } = {
  current: { status: 404, body: { error: { code: "corridor_not_found", message: "Corridor not found." } } },
};

mock.module("@/lib/api/anchors", { namedExports: { getAnchorApiResult: async () => anchorResult.current } });
mock.module("@/lib/api/reputation", { namedExports: { getAnchorReputationApiResult: async () => ({ status: 404, body: { error: { code: "not_found", message: "no" } } }) } });
mock.module("@/lib/api/corridors", { namedExports: { getCorridorApiResult: async () => corridorResult.current } });
mock.module("@/lib/api/rates", { namedExports: { getRatesApiResult: async () => ({ status: 500, body: { error: { code: "internal_error", message: "x" } } }) } });
mock.module("@/lib/api/rateHistory", { namedExports: { getRateHistoryApiResult: async () => ({ status: 500, body: { error: { code: "internal_error", message: "x" } } }) } });
mock.module("next/navigation", { namedExports: { notFound: () => { throw new Error("notFound"); } } });
mock.module("next/link", { defaultExport: (props: { children?: unknown }) => props.children });
mock.module("@/components/ui/ProductHeader", { namedExports: { ProductHeader: () => null } });
mock.module("@/components/corridors/CorridorRateEvidence", { namedExports: { CorridorRateEvidence: () => null } });
mock.module("@/components/corridors/CorridorRateHistoryChart", { namedExports: { CorridorRateHistoryChart: () => null } });
mock.module("@/lib/stellar/advertisedCapabilities", { namedExports: { advertisedCapabilities: () => [] } });

async function loadModules() {
  const anchors = await import("../../../app/anchors/[slug]/page.js");
  const corridors = await import("../../../app/corridors/[slug]/page.js");
  return { generateAnchorMetadata: anchors.generateMetadata, generateCorridorMetadata: corridors.generateMetadata };
}

test("anchor metadata is truthful for success, not-found, and read failures", async () => {
  const { generateAnchorMetadata } = await loadModules();
  anchorResult.current = { status: 200, body: { anchor: { name: "Example Anchor", homeDomain: "example.com" } } };
  assert.deepEqual(await generateAnchorMetadata({ params: Promise.resolve({ slug: "example-anchor" }) }), {
    title: "Example Anchor — StellarCore",
    description: "Read-only anchor detail for Example Anchor (example.com).",
  });
  anchorResult.current = { status: 404, body: { error: { code: "anchor_not_found", message: "Anchor not found." } } };
  assert.deepEqual(await generateAnchorMetadata({ params: Promise.resolve({ slug: "missing" }) }), { title: "Anchor not found — StellarCore" });
  anchorResult.current = { status: 400, body: { error: { code: "invalid_anchor_slug", message: "bad" } } };
  assert.deepEqual(await generateAnchorMetadata({ params: Promise.resolve({ slug: "bad slug" }) }), { title: "Anchor not found — StellarCore" });
  anchorResult.current = { status: 500, body: { error: { code: "internal_error", message: "db password leaked" } } };
  const metadata = await generateAnchorMetadata({ params: Promise.resolve({ slug: "example-anchor" }) });
  assert.deepEqual(metadata, { title: "Anchor unavailable — StellarCore" });
  assert.doesNotMatch(JSON.stringify(metadata), /leaked|password|internal_error|db/i);
});

test("corridor metadata is truthful for success, not-found, and read failures", async () => {
  const { generateCorridorMetadata } = await loadModules();
  corridorResult.current = { status: 200, body: { corridor: { sourceAsset: "USDC", destinationAsset: "BRL", sourceCountry: "US", destinationCountry: "BR" } } };
  assert.deepEqual(await generateCorridorMetadata({ params: Promise.resolve({ slug: "usdc-brl" }) }), {
    title: "USDC → BRL — StellarCore",
    description: "Read-only evidence for the US to BR corridor.",
  });
  corridorResult.current = { status: 404, body: { error: { code: "corridor_not_found", message: "Corridor not found." } } };
  assert.deepEqual(await generateCorridorMetadata({ params: Promise.resolve({ slug: "missing" }) }), { title: "Corridor not found — StellarCore" });
  corridorResult.current = { status: 400, body: { error: { code: "invalid_corridor_slug", message: "bad" } } };
  assert.deepEqual(await generateCorridorMetadata({ params: Promise.resolve({ slug: "bad" }) }), { title: "Corridor not found — StellarCore" });
  corridorResult.current = { status: 500, body: { error: { code: "internal_error", message: "secret stack" } } };
  const metadata = await generateCorridorMetadata({ params: Promise.resolve({ slug: "usdc-brl" }) });
  assert.deepEqual(metadata, { title: "Corridor unavailable — StellarCore" });
  assert.doesNotMatch(JSON.stringify(metadata), /secret|stack|internal_error/i);
});
