import assert from "node:assert/strict";
import test from "node:test";

import * as ratesRoute from "@/app/api/rates/route";
import * as rateHistoryRoute from "@/app/api/rates/history/route";
import * as reputationRoute from "@/app/api/reputation/route";
import * as reputationDetailRoute from "@/app/api/reputation/[slug]/route";
import { respondUnlessRequestAborted } from "@/lib/api/http";

test("evidence API handlers return 499 when client disconnects before invocation", async () => {
  const controller = new AbortController();
  controller.abort();

  const routes = [
    {
      name: "/api/rates",
      invoke: () =>
        ratesRoute.GET(
          new Request("http://localhost/api/rates?corridor=usdc-us-brl-br", {
            signal: controller.signal,
          }),
        ),
    },
    {
      name: "/api/rates/history",
      invoke: () =>
        rateHistoryRoute.GET(
          new Request("http://localhost/api/rates/history?corridor=usdc-us-brl-br&days=30", {
            signal: controller.signal,
          }),
        ),
    },
    {
      name: "/api/reputation",
      invoke: () =>
        reputationRoute.GET(
          new Request("http://localhost/api/reputation", {
            signal: controller.signal,
          }),
        ),
    },
    {
      name: "/api/reputation/[slug]",
      invoke: () =>
        reputationDetailRoute.GET(
          new Request("http://localhost/api/reputation/test-anchor", {
            signal: controller.signal,
          }),
          { params: Promise.resolve({ slug: "test-anchor" }) },
        ),
    },
  ];

  for (const { name, invoke } of routes) {
    const response = await invoke();
    assert.equal(response.status, 499, `${name} must return 499 on pre-aborted request`);
    assert.equal(
      response.headers.get("cache-control"),
      "no-store",
      `${name} must set Cache-Control: no-store`,
    );
    const body = await response.text();
    assert.equal(body, "", `${name} must have empty body on client disconnect`);
  }
});

test("evidence API handlers return 499 when client disconnects during processing", async () => {
  const routes = [
    {
      name: "/api/rates",
      invoke: (signal: AbortSignal) =>
        ratesRoute.GET(
          new Request("http://localhost/api/rates?corridor=usdc-us-brl-br", { signal }),
        ),
    },
    {
      name: "/api/rates/history",
      invoke: (signal: AbortSignal) =>
        rateHistoryRoute.GET(
          new Request("http://localhost/api/rates/history?corridor=usdc-us-brl-br&days=30", {
            signal,
          }),
        ),
    },
    {
      name: "/api/reputation",
      invoke: (signal: AbortSignal) =>
        reputationRoute.GET(new Request("http://localhost/api/reputation", { signal })),
    },
    {
      name: "/api/reputation/[slug]",
      invoke: (signal: AbortSignal) =>
        reputationDetailRoute.GET(
          new Request("http://localhost/api/reputation/test-anchor", { signal }),
          { params: Promise.resolve({ slug: "test-anchor" }) },
        ),
    },
  ];

  for (const { name, invoke } of routes) {
    const controller = new AbortController();
    queueMicrotask(() => {
      controller.abort();
    });

    const response = await invoke(controller.signal);
    assert.equal(response.status, 499, `${name} must return 499 when aborted in-flight`);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = await response.text();
    assert.equal(body, "", `${name} must have empty body`);
  }
});

test("normal requests without disconnect proceed with standard validation and status codes", async () => {
  // Missing corridor should return standard 400 validation error, not 499
  const response = await ratesRoute.GET(new Request("http://localhost/api/rates"));
  assert.equal(response.status, 400);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const json = await response.json() as { error: { code: string } };
  assert.equal(json.error.code, "missing_corridor");
});

test("in-flight work that completes after disconnect cannot return success", async () => {
  const controller = new AbortController();
  let releaseWork!: () => void;
  const work = new Promise<void>((resolve) => {
    releaseWork = resolve;
  });
  const request = new Request("http://localhost/api/evidence", {
    signal: controller.signal,
  });

  const responsePromise = respondUnlessRequestAborted(request, async () => {
    await work;
    return Response.json({ success: true });
  });
  controller.abort();
  releaseWork();

  const response = await responsePromise;
  assert.equal(response.status, 499);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
});

test("in-flight abort rejection becomes an empty disconnect response", async () => {
  const controller = new AbortController();
  const request = new Request("http://localhost/api/evidence", {
    signal: controller.signal,
  });

  const responsePromise = respondUnlessRequestAborted(request, async () => {
    await Promise.resolve();
    controller.abort();
    throw new Error("request aborted");
  });

  const response = await responsePromise;
  assert.equal(response.status, 499);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(await response.text(), "");
});
