import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExplorerResult } from "@/app/developers/explorer/ExplorerResult";
import {
  buildExplorerRequest,
  EXPLORER_ENDPOINT_IDS,
  explorerRequestExamples,
  isAllowlistedExplorerPath,
  type ExplorerRequest,
} from "@/lib/developerExplorer/endpoints";
import {
  describeEvidence,
  executeExplorerRequest,
  type ExplorerFetch,
  type ExplorerOutcome,
} from "@/lib/developerExplorer/response";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

const ALLOWED = {
  anchorSlugs: ["moneygram", "cowrie", "zeam"],
  corridorSlugs: ["usdc-us-usd-us", "usdc-us-brl-br"],
} as const;

function pathFor(endpoint: string, params: Record<string, string | undefined> = {}): string {
  const result = buildExplorerRequest({ endpoint, params }, ALLOWED);
  assert.ok(result.ok, result.ok ? "" : result.message);
  return result.request.path;
}

function denialFor(endpoint: string, params: Record<string, string | undefined> = {}): string {
  const result = buildExplorerRequest({ endpoint, params }, ALLOWED);
  assert.equal(result.ok, false, `expected denial for ${endpoint} ${JSON.stringify(params)}`);
  return result.ok ? "" : result.code;
}

function fixture(domain: string, name: string): { status: number; body: unknown } {
  const raw = JSON.parse(readFileSync(
    new URL(`../../../contracts/api/v1/fixtures/${domain}/${name}.json`, import.meta.url),
    "utf8",
  )) as { expectedStatus: number; body: unknown };
  return { status: raw.expectedStatus, body: raw.body };
}

function fakeFetch(
  status: number,
  text: string,
  headers: Record<string, string> = {},
  calls: Array<{ input: string; init: Parameters<ExplorerFetch>[1] }> = [],
): ExplorerFetch {
  return async (input, init) => {
    calls.push({ input, init });
    return { status, headers: new Headers(headers), text: async () => text };
  };
}

// --- safe endpoint construction -------------------------------------------

test("builds exactly the allowlisted public GET paths", () => {
  assert.equal(pathFor("anchors.list"), "/api/anchors");
  assert.equal(pathFor("anchors.list", { limit: "10", offset: "20" }), "/api/anchors?limit=10&offset=20");
  assert.equal(pathFor("corridors.list", { offset: "0" }), "/api/corridors?offset=0");
  assert.equal(pathFor("anchors.detail", { anchor: "zeam" }), "/api/anchors/zeam");
  assert.equal(pathFor("corridors.detail", { corridor: "usdc-us-brl-br" }), "/api/corridors/usdc-us-brl-br");
  assert.equal(pathFor("rates.latest", { corridor: "usdc-us-brl-br" }), "/api/rates?corridor=usdc-us-brl-br");
  assert.equal(pathFor("rates.history", { corridor: "usdc-us-brl-br" }), "/api/rates/history?corridor=usdc-us-brl-br&days=30");
  assert.equal(pathFor("rates.history", { corridor: "usdc-us-brl-br", days: "7" }), "/api/rates/history?corridor=usdc-us-brl-br&days=7");
  assert.equal(pathFor("reputation.list"), "/api/reputation");
  assert.equal(pathFor("reputation.detail", { anchor: "cowrie" }), "/api/reputation/cowrie");
});

test("every built request is a same-origin relative GET that passes the allowlist", () => {
  for (const endpoint of EXPLORER_ENDPOINT_IDS) {
    const result = buildExplorerRequest(
      { endpoint, params: { anchor: "zeam", corridor: "usdc-us-brl-br" } },
      ALLOWED,
    );
    // Endpoints that do not accept a parameter must reject it rather than drop it.
    if (!result.ok) {
      assert.equal(result.code, "unsupported_parameter");
      continue;
    }
    assert.equal(result.request.method, "GET");
    assert.ok(result.request.path.startsWith("/api/"));
    assert.ok(!result.request.path.startsWith("/api/internal"));
    assert.ok(isAllowlistedExplorerPath(result.request.path));
  }
});

test("denies unknown endpoints, including internal and external targets", () => {
  for (const endpoint of [
    "internal.snapshot",
    "/api/internal/rates/snapshot",
    "https://anchor.example/sep38/prices",
    "rates.post",
    "",
    "__proto__",
  ]) {
    assert.equal(denialFor(endpoint), "unknown_endpoint");
  }
});

test("denies parameters that the endpoint does not declare", () => {
  assert.equal(denialFor("reputation.list", { anchor: "zeam" }), "unsupported_parameter");
  assert.equal(denialFor("rates.latest", { corridor: "usdc-us-brl-br", days: "7" }), "unsupported_parameter");
  assert.equal(denialFor("anchors.detail", { anchor: "zeam", limit: "1" }), "unsupported_parameter");
  for (const name of ["url", "method", "headers", "body", "credentials", "authorization", "token", "amount", "account"]) {
    assert.equal(denialFor("anchors.list", { [name]: "x" }), "unsupported_parameter", name);
  }
});

test("requires required parameters", () => {
  assert.equal(denialFor("rates.latest"), "missing_parameter");
  assert.equal(denialFor("rates.history", { days: "7" }), "missing_parameter");
  assert.equal(denialFor("anchors.detail"), "missing_parameter");
  assert.equal(denialFor("reputation.detail", { anchor: "" }), "missing_parameter");
});

test("only reviewed slugs are accepted; traversal and injection are denied", () => {
  for (const corridor of [
    "unknown-corridor",
    "../internal",
    "usdc-us-brl-br/../../internal",
    "usdc-us-brl-br&days=1",
    "usdc-us-brl-br?x=1",
    "USDC-US-BRL-BR",
    "usdc%2Fbrl",
    " usdc-us-brl-br",
    "a".repeat(101),
  ]) {
    assert.equal(denialFor("rates.latest", { corridor }), "invalid_corridor", corridor);
  }
  for (const anchor of ["unreviewed", "zeam/../internal", "zeam#x", "https://evil.example"]) {
    assert.equal(denialFor("anchors.detail", { anchor }), "invalid_anchor", anchor);
  }
});

test("history days are restricted to supported windows", () => {
  for (const days of ["0", "2", "366", "-1", "7.5", "1e2", "30 ", "abc", "007"]) {
    assert.equal(denialFor("rates.history", { corridor: "usdc-us-brl-br", days }), "invalid_days", days);
  }
});

test("pagination is bounded and integer-only", () => {
  for (const limit of ["0", "101", "-1", "1.5", "abc", "10abc"]) {
    assert.equal(denialFor("anchors.list", { limit }), "invalid_limit", limit);
  }
  for (const offset of ["-1", "1001", "1.5", "01", "x"]) {
    assert.equal(denialFor("corridors.list", { offset }), "invalid_offset", offset);
  }
});

test("allowlist guard rejects anything outside the explicit path set", () => {
  for (const path of [
    "/api/internal/rates/snapshot",
    "/api/internal",
    "//evil.example/api/rates",
    "https://evil.example/api/rates",
    "/api/rates?corridor=usdc-us-brl-br&extra=1",
    "/api/rates/../internal",
    "/api/anchors/zeam/../../internal",
    "/api/reputation/",
    "/api/anchors\\zeam",
    "/api/rates#frag",
    "/dashboard",
    42,
    null,
  ]) {
    assert.equal(isAllowlistedExplorerPath(path), false, String(path));
  }
});

test("copyable examples use the request path and a sanitized display origin", () => {
  const request: ExplorerRequest = { endpoint: "rates.latest", method: "GET", path: "/api/rates?corridor=usdc-us-brl-br" };
  const ok = explorerRequestExamples(request, "https://stellarcore.example");
  assert.equal(ok.curl, "curl -sS -H 'Accept: application/json' 'https://stellarcore.example/api/rates?corridor=usdc-us-brl-br'");
  assert.match(ok.fetch, /fetch\("\/api\/rates\?corridor=usdc-us-brl-br"/);
  const hostile = explorerRequestExamples(request, "https://x.example'; rm -rf /");
  assert.match(hostile.curl, /'http:\/\/localhost:3000\/api\/rates/);
});

// --- execution ------------------------------------------------------------

test("sends a credential-free, body-free GET with no custom headers beyond Accept", async () => {
  const calls: Array<{ input: string; init: Parameters<ExplorerFetch>[1] }> = [];
  const fx = fixture("rates", "healthy-success");
  await executeExplorerRequest(
    { endpoint: "rates.latest", method: "GET", path: "/api/rates?corridor=usdc-us-brl-br" },
    fakeFetch(200, JSON.stringify(fx.body), {}, calls),
  );
  assert.equal(calls.length, 1);
  const { input, init } = calls[0]!;
  assert.equal(input, "/api/rates?corridor=usdc-us-brl-br");
  assert.equal(init.method, "GET");
  assert.equal(init.credentials, "omit");
  assert.equal(init.redirect, "error");
  assert.equal(init.cache, "no-store");
  assert.deepEqual(Object.keys(init.headers), ["Accept"]);
  assert.equal("body" in init, false);
});

test("tampered requests are blocked before fetch is called", async () => {
  let called = false;
  const outcome = await executeExplorerRequest(
    { endpoint: "rates.latest", method: "GET", path: "/api/internal/rates/snapshot" },
    async () => { called = true; throw new Error("must not be called"); },
  );
  assert.equal(called, false);
  assert.equal(outcome.kind, "denied");
  const forgedMethod = await executeExplorerRequest(
    { endpoint: "rates.latest", method: "POST" as "GET", path: "/api/rates?corridor=usdc-us-brl-br" },
    async () => { called = true; throw new Error("must not be called"); },
  );
  assert.equal(called, false);
  assert.equal(forgedMethod.kind, "denied");
});

test("handles network errors, empty bodies, and invalid JSON safely", async () => {
  const request: ExplorerRequest = { endpoint: "reputation.list", method: "GET", path: "/api/reputation" };
  const network = await executeExplorerRequest(request, async () => { throw new TypeError("Failed to fetch"); });
  assert.equal(network.kind, "network_error");
  assert.equal(describeEvidence(network)[0]?.kind, "unavailable");

  const empty = await executeExplorerRequest(request, fakeFetch(200, ""));
  assert.equal(empty.kind === "response" && empty.bodyProblem, "empty");
  assert.equal(describeEvidence(empty)[0]?.kind, "unavailable");

  const invalid = await executeExplorerRequest(request, fakeFetch(502, "<html>bad gateway</html>"));
  assert.equal(invalid.kind === "response" && invalid.bodyProblem, "invalid_json");
  assert.equal(invalid.kind === "response" && invalid.statusClass, "server_error");
  assert.equal(describeEvidence(invalid)[0]?.kind, "unavailable");
});

// --- evidence interpretation ----------------------------------------------

function outcomeFrom(
  endpoint: ExplorerOutcome["endpoint"],
  status: number,
  body: unknown,
  evidenceHeader: string | null = null,
): ExplorerOutcome {
  return {
    kind: "response",
    endpoint,
    path: "/api/x",
    status,
    statusClass: status < 300 ? "success" : status < 500 ? "client_error" : "server_error",
    body,
    bodyProblem: null,
    evidenceHeader,
    durationMs: 1,
  };
}

const kinds = (outcome: ExplorerOutcome) => describeEvidence(outcome).map(({ kind }) => kind);

test("distinguishes persisted, stale, and insufficient evidence from response fields", () => {
  const healthy = fixture("rates", "healthy-success");
  assert.deepEqual(kinds(outcomeFrom("rates.latest", 200, healthy.body)), ["persisted"]);

  const insufficient = fixture("rates", "insufficient-success");
  assert.deepEqual(kinds(outcomeFrom("rates.latest", 200, insufficient.body)), ["persisted", "insufficient"]);
  assert.match(
    describeEvidence(outcomeFrom("rates.latest", 200, insufficient.body))[1]!.detail,
    /1 fresh independent observation\(s\) of 2 required/,
  );

  const staleBody = {
    ...(healthy.body as object),
    degraded: { state: "stale", generatedAt: "2026-08-28T11:58:00.000Z", expiresAt: "2026-08-28T12:03:00.000Z", sourceTimes: [], snapshotAgeMs: 1 },
  };
  assert.deepEqual(kinds(outcomeFrom("rates.latest", 200, staleBody)), ["stale"]);
  assert.deepEqual(kinds(outcomeFrom("rates.latest", 200, healthy.body, "stale")), ["stale"]);

  const reputation = fixture("reputation", "list-success");
  assert.deepEqual(kinds(outcomeFrom("reputation.list", 200, reputation.body)), ["persisted", "insufficient"]);
});

test("empty results are reported as empty, not as errors", () => {
  assert.deepEqual(kinds(outcomeFrom("anchors.list", 200, fixture("anchors", "list-empty").body)), ["persisted", "empty"]);
  assert.deepEqual(kinds(outcomeFrom("reputation.list", 200, fixture("reputation", "list-empty").body)), ["persisted", "empty"]);
  assert.ok(kinds(outcomeFrom("rates.latest", 200, fixture("rates", "empty-success").body)).includes("empty"));
  assert.deepEqual(
    kinds(outcomeFrom("rates.history", 200, { corridor: {}, evaluatedAt: "x", windowDays: 30, points: [] })),
    ["persisted", "empty"],
  );
});

test("4xx and 5xx fixtures map to rejected and unavailable states", () => {
  const dir = new URL("../../../contracts/api/v1/fixtures/", import.meta.url);
  for (const domain of readdirSync(dir)) {
    for (const file of readdirSync(new URL(`${domain}/`, dir))) {
      const fx = fixture(domain, file.replace(/\.json$/, ""));
      if (fx.status < 400) continue;
      const notice = describeEvidence(outcomeFrom("rates.latest", fx.status, fx.body))[0]!;
      assert.equal(notice.kind, fx.status >= 500 ? "unavailable" : "error", file);
      assert.match(notice.detail, /:/);
    }
  }
});

test("result view renders status, notices, and JSON without executing content", () => {
  const html = renderToStaticMarkup(React.createElement(ExplorerResult, {
    outcome: outcomeFrom("rates.latest", 200, {
      ...(fixture("rates", "insufficient-success").body as object),
      corridor: { slug: "<script>alert(1)</script>" },
    }),
  }));
  assert.match(html, /HTTP 200/);
  assert.match(html, /data-evidence-notice="insufficient"/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);

  const idle = renderToStaticMarkup(React.createElement(ExplorerResult, { outcome: null }));
  assert.match(idle, /data-explorer-state="idle"/);
});

test("explorer sources never reference internal endpoints or write methods", () => {
  for (const file of [
    "app/developers/explorer/page.tsx",
    "app/developers/explorer/ExplorerClient.tsx",
    "app/developers/explorer/ExplorerResult.tsx",
    "lib/developerExplorer/response.ts",
  ]) {
    const source = readFileSync(new URL(`../../../${file}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\/api\/internal\/[a-z]/, file);
    assert.doesNotMatch(source, /method:\s*"(POST|PUT|PATCH|DELETE)"/, file);
  }
});
