import assert from "node:assert/strict";
import test from "node:test";
import { createClient, formatApiError } from "../../../examples/typed-public-api/client.js";
import { anchorDetailOk, anchorsEmpty, anchorsOk, corridorOk, historyEmpty, ratesInsufficient, reputationInsufficient, reputationListOk } from "../../../examples/typed-public-api/fixtures.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("typed client handles 200 anchors responses including empty arrays", async () => {
  const client = createClient({ baseUrl: "https://example.test", fetchImpl: async () => jsonResponse(anchorsOk) });
  const result = await client.get<typeof anchorsOk>("/api/anchors");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.count, 1);

  const empty = createClient({ baseUrl: "https://example.test", fetchImpl: async () => jsonResponse(anchorsEmpty) });
  const emptyResult = await empty.get<typeof anchorsEmpty>("/api/anchors");
  assert.equal(emptyResult.ok, true);
  if (emptyResult.ok) assert.deepEqual(emptyResult.data.anchors, []);
});

test("typed client exposes 400/404/500 as explicit error branches", async () => {
  for (const status of [400, 404, 500] as const) {
    const client = createClient({
      baseUrl: "https://example.test",
      fetchImpl: async () => jsonResponse({ error: { code: status === 500 ? "internal_error" : "bad_request", message: "msg" } }, status),
    });
    const result = await client.get("/api/anchors/bad");
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, status);
      assert.equal(result.error?.message, "msg");
      assert.match(formatApiError(result), new RegExp(String(status)));
    }
  }
});

test("typed fixtures preserve null/insufficient evidence without coercing to zero", async () => {
  const ratesClient = createClient({ baseUrl: "https://example.test", fetchImpl: async () => jsonResponse(ratesInsufficient) });
  const rates = await ratesClient.get<typeof ratesInsufficient>("/api/rates?corridor=usdc-us-brl-br");
  assert.equal(rates.ok, true);
  if (rates.ok) {
    assert.equal(rates.data.medianRate, null);
    assert.equal(rates.data.state, "insufficient_fresh_sources");
    assert.notEqual(rates.data.medianRate, "0");
  }

  const repClient = createClient({ baseUrl: "https://example.test", fetchImpl: async () => jsonResponse(reputationInsufficient) });
  const rep = await repClient.get<typeof reputationInsufficient>("/api/reputation/example-anchor");
  assert.equal(rep.ok, true);
  if (rep.ok) {
    assert.equal(rep.data.reputation.score, null);
    assert.equal(rep.data.reputation.metrics, null);
    assert.equal(rep.data.reputation.state, "insufficient_evidence");
  }
});

test("fixtures cover representative read-only endpoint shapes", () => {
  assert.equal(anchorDetailOk.anchor.slug, "example-anchor");
  assert.equal(corridorOk.corridor.anchorCount, 1);
  assert.deepEqual(historyEmpty.points, []);
  assert.equal(reputationListOk.count, 1);
});
