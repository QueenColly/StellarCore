import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWLISTED_FIXTURES,
  DOMAINS,
  classifyResponseState,
  getAllowlistedFixture,
  getFixturesByDomain,
} from "@/app/developers/contracts/fixtures";
import manifest from "@/contracts/api/v1/manifest.json";

test("allowlist contains all 31 committed public API v1 fixtures exactly matching manifest.json", () => {
  assert.equal(ALLOWLISTED_FIXTURES.length, 31);
  assert.equal(manifest.totalFixtures, 31);

  // Every fixture in the allowlist must have a corresponding entry in manifest.json
  const manifestNames = new Set(manifest.fixtures.map((f: { name: string }) => f.name));
  for (const fixture of ALLOWLISTED_FIXTURES) {
    assert.ok(
      manifestNames.has(fixture.name),
      `Fixture ${fixture.name} should exist in manifest.json`,
    );
  }
});

test("all four contract domains are populated with fixtures", () => {
  assert.deepEqual(DOMAINS, ["anchors", "corridors", "rates", "reputation"]);

  const anchors = getFixturesByDomain("anchors");
  const corridors = getFixturesByDomain("corridors");
  const rates = getFixturesByDomain("rates");
  const reputation = getFixturesByDomain("reputation");

  assert.equal(anchors.length, 7);
  assert.equal(corridors.length, 8);
  assert.equal(rates.length, 7);
  assert.equal(reputation.length, 9);
});

test("fixture response states distinguish success, empty, insufficient-evidence, and errors", () => {
  // Success states
  assert.equal(classifyResponseState(200, "anchors.detail.success", {}), "success");
  assert.equal(classifyResponseState(200, "rates.healthy.success", { state: "healthy" }), "success");

  // Empty states
  assert.equal(classifyResponseState(200, "anchors.list.empty", { anchors: [] }), "empty");
  assert.equal(classifyResponseState(200, "corridors.detail.empty_anchors", { count: 0 }), "empty");

  // Insufficient evidence states
  assert.equal(
    classifyResponseState(200, "rates.insufficient.success", { state: "insufficient_fresh_sources" }),
    "insufficient_evidence",
  );
  assert.equal(
    classifyResponseState(200, "reputation.detail.insufficient_200", { status: "INSUFFICIENT_EVIDENCE" }),
    "insufficient_evidence",
  );
  assert.equal(
    classifyResponseState(200, "reputation.detail.not_evaluated_200", { status: "NOT_EVALUATED" }),
    "insufficient_evidence",
  );

  // Error states
  assert.equal(classifyResponseState(400, "anchors.detail.error_400", {}), "invalid_input");
  assert.equal(classifyResponseState(404, "rates.error_404", {}), "not_found");
  assert.equal(classifyResponseState(500, "reputation.list.error_500", {}), "server_error");
});

test("getAllowlistedFixture strictly protects against arbitrary or unallowlisted lookups", () => {
  // Valid lookup
  const valid = getAllowlistedFixture("anchors.detail.success");
  assert.ok(valid);
  assert.equal(valid.expectedStatus, 200);
  assert.equal(valid.domain, "anchors");

  // Non-existent or path-traversal names return null
  assert.equal(getAllowlistedFixture("../contracts/api/v1/manifest.json"), null);
  assert.equal(getAllowlistedFixture("internal.cron.refresh"), null);
  assert.equal(getAllowlistedFixture("unlisted.fixture.identifier"), null);
  assert.equal(getAllowlistedFixture(""), null);
});

test("every allowlisted fixture has valid JSON body, description, and endpoint structure", () => {
  for (const fixture of ALLOWLISTED_FIXTURES) {
    assert.ok(typeof fixture.name === "string" && fixture.name.length > 0);
    assert.ok(typeof fixture.endpoint === "string" && fixture.endpoint.startsWith("GET /api/"));
    assert.equal(fixture.method, "GET");
    assert.ok(typeof fixture.description === "string" && fixture.description.length > 0);
    assert.ok(typeof fixture.body === "object" && fixture.body !== null);
  }
});
