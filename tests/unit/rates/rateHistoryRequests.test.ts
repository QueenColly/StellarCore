import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createRateHistoryLoader } from "@/lib/rates/rateHistoryRequests";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

const CORRIDOR = "usdc-us-brl-br";

function history(windowDays: number, marker = `${windowDays}d`): PublicRateHistoryResponse {
  return {
    corridor: {
      slug: CORRIDOR,
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: `2026-10-01T00:00:00.000Z#${marker}`,
    windowDays,
    points: [],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type PendingRequest = {
  url: string;
  signal: AbortSignal;
  respond: (response: Response) => Promise<void>;
  fail: (error: Error) => Promise<void>;
};

/**
 * A fetch double whose responses are released explicitly by the test, in any
 * order. Like real fetch, a pending request rejects with AbortError when its
 * signal aborts.
 */
function controlledFetch() {
  const requests: PendingRequest[] = [];
  const fetchImpl = (url: string, init: { signal: AbortSignal }) =>
    new Promise<Response>((resolve, reject) => {
      const onAbort = () => reject(new DOMException("The operation was aborted.", "AbortError"));
      if (init.signal.aborted) onAbort();
      init.signal.addEventListener("abort", onAbort, { once: true });
      requests.push({
        url,
        signal: init.signal,
        respond: async (response) => {
          resolve(response);
          await flush();
        },
        fail: async (error) => {
          reject(error);
          await flush();
        },
      });
    });
  return { requests, fetchImpl };
}

/** Manual timers so timeouts fire only when the test says so. */
function manualTimers() {
  let nextId = 0;
  const pending = new Map<number, () => void>();
  return {
    setTimer: (callback: () => void) => {
      const id = ++nextId;
      pending.set(id, callback);
      return id;
    },
    clearTimer: (handle: unknown) => {
      pending.delete(handle as number);
    },
    fireAll: async () => {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const callback of callbacks) callback();
      await flush();
    },
    get size() {
      return pending.size;
    },
  };
}

async function flush() {
  for (let i = 0; i < 10; i += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Mirrors the chart's state transitions so assertions read like UI state. */
function panelState() {
  const state = {
    history: null as PublicRateHistoryResponse | null,
    error: null as string | null,
    loading: false,
    settledCount: 0,
  };
  return {
    state,
    callbacks: {
      onSuccess: (data: PublicRateHistoryResponse) => {
        state.history = data;
        state.loading = false;
        state.settledCount += 1;
      },
      onError: (message: string) => {
        state.error = message;
        state.loading = false;
        state.settledCount += 1;
      },
    },
    begin: () => {
      state.loading = true;
      state.error = null;
    },
  };
}

function setup() {
  const network = controlledFetch();
  const timers = manualTimers();
  const panel = panelState();
  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: panel.callbacks,
    fetchImpl: network.fetchImpl,
    setTimer: timers.setTimer,
    clearTimer: timers.clearTimer,
  });
  const select = (days: number) => {
    panel.begin();
    void loader.load(days);
  };
  return { network, timers, panel, loader, select };
}

test("a slow earlier response cannot overwrite a newer response that completed first", async () => {
  const { network, panel, select } = setup();

  select(30);
  select(90);
  assert.equal(network.requests.length, 2);

  await network.requests[1]!.respond(jsonResponse(history(90)));
  assert.equal(panel.state.history?.windowDays, 90);
  assert.equal(panel.state.loading, false);

  await network.requests[0]!.respond(jsonResponse(history(30)));
  assert.equal(panel.state.history?.windowDays, 90, "stale 30D response must be discarded");
  assert.equal(panel.state.settledCount, 1);
});

test("sequencing discards a late response even when the transport ignores abort", async () => {
  const releases: Array<(response: Response) => void> = [];
  const panel = panelState();
  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: panel.callbacks,
    fetchImpl: () => new Promise<Response>((resolve) => releases.push(resolve)),
    setTimer: () => 0,
    clearTimer: () => {},
  });

  panel.begin();
  void loader.load(30);
  panel.begin();
  void loader.load(90);

  releases[1]!(jsonResponse(history(90)));
  await flush();
  releases[0]!(jsonResponse(history(30)));
  await flush();

  assert.equal(panel.state.history?.windowDays, 90);
  assert.equal(panel.state.settledCount, 1);
});

test("in order completion still only applies the latest selection", async () => {
  const { network, panel, select } = setup();

  select(30);
  select(90);
  await network.requests[0]!.respond(jsonResponse(history(30)));
  assert.equal(panel.state.history, null, "superseded response is ignored");
  assert.equal(panel.state.loading, true, "loading stays on while the active request is pending");

  await network.requests[1]!.respond(jsonResponse(history(90)));
  // Re-read through a call: the assertion above narrowed the property to null.
  const latest = ((): PublicRateHistoryResponse | null => panel.state.history)();
  assert.equal(latest?.windowDays, 90);
  assert.equal(panel.state.loading, false);
});

test("starting a new request aborts the superseded one", () => {
  const { network, select } = setup();

  select(30);
  select(90);
  select(7);
  assert.equal(network.requests[0]!.signal.aborted, true);
  assert.equal(network.requests[1]!.signal.aborted, true);
  assert.equal(network.requests[2]!.signal.aborted, false);
  assert.match(network.requests[2]!.url, /corridor=usdc-us-brl-br&days=7$/);
});

test("a stale failure cannot surface an error over a newer success", async () => {
  const { network, panel, select } = setup();

  select(30);
  select(90);
  await network.requests[1]!.respond(jsonResponse(history(90)));
  await network.requests[0]!.respond(
    jsonResponse({ error: { code: "internal_error", message: "boom" } }, 500),
  );
  assert.equal(panel.state.error, null);
  assert.equal(panel.state.history?.windowDays, 90);
});

test("loading settles with the API error message when the active request fails", async () => {
  const { network, panel, select } = setup();

  select(30);
  await network.requests[0]!.respond(
    jsonResponse({ error: { code: "invalid_days", message: "Unsupported history window." } }, 400),
  );
  assert.equal(panel.state.loading, false);
  assert.equal(panel.state.error, "Unsupported history window.");
});

test("loading settles with a generic message on network failure", async () => {
  const { network, panel, select } = setup();

  select(30);
  await network.requests[0]!.fail(new TypeError(""));
  assert.equal(panel.state.loading, false);
  assert.equal(panel.state.error, "Unable to load rate history.");
});

test("a request that never responds times out instead of loading forever", async () => {
  const { network, timers, panel, select } = setup();

  select(30);
  assert.equal(timers.size, 1);
  await timers.fireAll();

  assert.equal(network.requests[0]!.signal.aborted, true);
  assert.equal(panel.state.loading, false);
  assert.equal(panel.state.error, "Rate history request timed out.");
});

test("timers are cleared once the active request settles", async () => {
  const { network, timers, select } = setup();

  select(30);
  await network.requests[0]!.respond(jsonResponse(history(30)));
  assert.equal(timers.size, 0);
});

test("a response for a different window is rejected rather than shown as the selection", async () => {
  const { network, panel, select } = setup();

  select(30);
  await network.requests[0]!.respond(jsonResponse(history(7)));
  assert.equal(panel.state.history, null);
  assert.equal(panel.state.loading, false);
  assert.equal(panel.state.error, "Rate history response did not match the requested window.");
});

test("disposing the loader aborts the pending request and suppresses late updates", async () => {
  const { network, panel, loader, select } = setup();

  select(30);
  loader.dispose();
  assert.equal(network.requests[0]!.signal.aborted, true);
  await flush();
  assert.equal(panel.state.settledCount, 0);

  select(90);
  assert.equal(network.requests.length, 1, "a disposed loader starts no new requests");
});

test("rapid reversed sequences always converge on the last selection", async () => {
  const { network, panel, select } = setup();
  const selections = [7, 30, 90, 30, 7];

  for (const days of selections) select(days);
  for (let i = network.requests.length - 1; i >= 0; i -= 1) {
    await network.requests[i]!.respond(jsonResponse(history(selections[i]!, `req-${i}`)));
  }

  assert.equal(panel.state.history?.evaluatedAt.endsWith("#req-4"), true);
  assert.equal(panel.state.settledCount, 1);
  assert.equal(panel.state.loading, false);
});

test("the corridor chart routes timeframe requests through the sequenced loader", () => {
  const source = readFileSync(
    new URL("../../../components/corridors/CorridorRateHistoryChart.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /createRateHistoryLoader\(/);
  assert.match(source, /loader\.dispose\(\)/);
  assert.doesNotMatch(source, /\bfetch\(/, "the chart must not issue unsequenced requests");
});
