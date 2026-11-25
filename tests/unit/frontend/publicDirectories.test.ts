import assert from "node:assert/strict";
import test from "node:test";
import { loadPublicAnchors, loadPublicCorridors, type DirectoryFetch } from "@/lib/watchlist/publicDirectories";

const anchor = {
  slug: "first-anchor", name: "First Anchor", homeDomain: "first.example",
  status: "LIVE", seps: [1, 24], isTransferCapable: true, corridorCount: 1,
};
const corridor = {
  slug: "usd-us-brl-br", sourceAsset: "USDC", sourceCountry: "US",
  destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 1,
};

function response(body: unknown, status = 200): DirectoryFetch {
  return async () => Response.json(body, { status });
}

test("browser anchor GET accepts only validated reviewed identities", async () => {
  const ok = await loadPublicAnchors(undefined, response({ anchors: [anchor], count: 1 }));
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.items[0]?.slug, "first-anchor");
  const empty = await loadPublicAnchors(undefined, response({ anchors: [], count: 0 }));
  assert.equal(empty.ok, true);
  if (empty.ok) assert.deepEqual(empty.items, []);
});

test("browser corridor GET returns validated read-only routes", async () => {
  const ok = await loadPublicCorridors(undefined, response({ corridors: [corridor], count: 1 }));
  assert.equal(ok.ok, true);
  if (ok.ok) assert.equal(ok.items[0]?.destinationAsset, "BRL");
});

test("non-200 responses and malformed data remain errors, not empty states", async () => {
  const unavailable = await loadPublicAnchors(undefined, response({ error: { code: "internal_error" } }, 500));
  assert.equal(unavailable.ok, false);
  const malformed = await loadPublicAnchors(undefined, response({ anchors: [{ ...anchor, slug: "javascript:evil" }] }));
  assert.equal(malformed.ok, false);
  const wrongEnvelope = await loadPublicCorridors(undefined, response({ corridors: null }));
  assert.equal(wrongEnvelope.ok, false);
});

test("unexpected network failures do not escape client-directory consumers", async () => {
  const failed: DirectoryFetch = async () => { throw new Error("untrusted error detail"); };
  const result = await loadPublicCorridors(undefined, failed);
  assert.deepEqual(result, { ok: false, message: "Unable to load reviewed corridors." });
});
