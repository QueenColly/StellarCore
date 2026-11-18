import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  describeDataAge,
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
  type RateHistoryPanelEvent,
  type RateHistoryPanelState,
} from "@/lib/rates/rateHistoryPanelState";
import { createRateHistoryLoader } from "@/lib/rates/rateHistoryRequests";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

const CORRIDOR = "usdc-us-brl-br";

function history(windowDays: number, evaluatedAt: string, medianRate = "5.1000"): PublicRateHistoryResponse {
  return {
    corridor: {
      slug: CORRIDOR,
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt,
    windowDays,
    points: [
      {
        timestamp: evaluatedAt,
        medianRate,
        state: "healthy",
        sourceCount: 3,
        freshSourceCount: 3,
        observations: [],
      },
    ],
  };
}

function run(state: RateHistoryPanelState, ...events: RateHistoryPanelEvent[]) {
  return events.reduce(rateHistoryPanelReducer, state);
}

const initial = history(30, "2026-10-01T12:00:00.000Z", "5.1000");

test("initial state shows the server-rendered history with no failure", () => {
  const state = initialRateHistoryPanelState(initial);
  assert.equal(state.displayed, initial);
  assert.equal(state.selectedDays, 30);
  assert.equal(state.loading, false);
  assert.equal(state.failure, null);
});

test("success → failure → success: failure retains data, later success replaces it", () => {
  const refreshed = history(90, "2026-10-01T12:05:00.000Z", "5.2000");
  let state = run(
    initialRateHistoryPanelState(initial),
    { type: "refresh_started", days: 90 },
    { type: "refresh_succeeded", history: refreshed },
  );
  assert.equal(state.displayed, refreshed);
  assert.equal(state.failure, null);

  state = run(
    state,
    { type: "refresh_started", days: 7 },
    { type: "refresh_failed", message: "Unable to load rate history.", days: 7, failedAt: "2026-10-01T12:20:00.000Z" },
  );
  assert.equal(state.displayed, refreshed, "failed refresh must not replace the last successful data");
  assert.equal(state.displayed.points[0]?.medianRate, "5.2000");
  assert.equal(state.loading, false, "loading settles after the failure");
  assert.deepEqual(state.failure, {
    message: "Unable to load rate history.",
    requestedDays: 7,
    failedAt: "2026-10-01T12:20:00.000Z",
  });

  const recovered = history(7, "2026-10-01T12:30:00.000Z", "5.3000");
  state = run(state, { type: "refresh_started", days: 7 }, { type: "refresh_succeeded", history: recovered });
  assert.equal(state.displayed, recovered, "a later success replaces the retained values");
  assert.equal(state.selectedDays, 7);
  assert.equal(state.failure, null, "a later success clears the failure notice");
});

test("after a failure the selection falls back to the window actually displayed", () => {
  const state = run(
    initialRateHistoryPanelState(initial),
    { type: "refresh_started", days: 90 },
    { type: "refresh_failed", message: "boom", days: 90, failedAt: "2026-10-01T12:01:00.000Z" },
  );
  // Retained 30-day data must not be labelled as the 90-day window, and 90D must be retryable.
  assert.equal(state.selectedDays, 30);
  assert.equal(state.displayed.windowDays, 30);
  assert.equal(state.failure?.requestedDays, 90);
});

test("while retrying after a failure, the earlier failure and retained data stay visible", () => {
  const state = run(
    initialRateHistoryPanelState(initial),
    { type: "refresh_started", days: 90 },
    { type: "refresh_failed", message: "boom", days: 90, failedAt: "2026-10-01T12:01:00.000Z" },
    { type: "refresh_started", days: 90 },
  );
  assert.equal(state.loading, true);
  assert.equal(state.displayed, initial);
  assert.equal(state.failure?.message, "boom");
});

test("repeated failures keep the original successful data, not an intermediate value", () => {
  const state = run(
    initialRateHistoryPanelState(initial),
    { type: "refresh_started", days: 90 },
    { type: "refresh_failed", message: "first", days: 90, failedAt: "2026-10-01T12:01:00.000Z" },
    { type: "refresh_started", days: 7 },
    { type: "refresh_failed", message: "second", days: 7, failedAt: "2026-10-01T12:02:00.000Z" },
  );
  assert.equal(state.displayed, initial);
  assert.equal(state.failure?.message, "second");
  assert.equal(state.failure?.requestedDays, 7);
});

test("describeDataAge reports the age of retained data deterministically", () => {
  const evaluatedAt = "2026-10-01T12:00:00.000Z";
  const at = (iso: string) => describeDataAge(evaluatedAt, new Date(iso));
  assert.equal(at("2026-10-01T12:00:30.000Z"), "less than a minute old");
  assert.equal(at("2026-10-01T12:01:00.000Z"), "1 minute old");
  assert.equal(at("2026-10-01T12:45:00.000Z"), "45 minutes old");
  assert.equal(at("2026-10-01T13:00:00.000Z"), "1 hour old");
  assert.equal(at("2026-10-01T17:59:00.000Z"), "5 hours old");
  assert.equal(at("2026-10-03T12:00:00.000Z"), "2 days old");
  assert.equal(describeDataAge("not-a-date", new Date()), "of unknown age");
});

test("loader + reducer: transient API failure between successes never blanks the panel", async () => {
  const responses: Array<() => Response> = [
    () => jsonResponse(history(90, "2026-10-01T12:05:00.000Z", "5.2000")),
    () => jsonResponse({ error: { code: "internal_error", message: "Temporary outage." } }, 500),
    () => jsonResponse(history(7, "2026-10-01T12:30:00.000Z", "5.3000")),
  ];
  let state = initialRateHistoryPanelState(initial);
  const dispatch = (event: RateHistoryPanelEvent) => {
    state = rateHistoryPanelReducer(state, event);
  };
  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: {
      onSuccess: (data) => dispatch({ type: "refresh_succeeded", history: data }),
      onError: (message, days) =>
        dispatch({ type: "refresh_failed", message, days, failedAt: "2026-10-01T12:20:00.000Z" }),
    },
    fetchImpl: async () => responses.shift()!(),
    setTimer: () => 0,
    clearTimer: () => {},
  });
  const select = async (days: number) => {
    dispatch({ type: "refresh_started", days });
    await loader.load(days);
  };

  await select(90);
  assert.equal(state.displayed.points[0]?.medianRate, "5.2000");

  await select(7);
  assert.equal(state.displayed.points[0]?.medianRate, "5.2000", "retained after failure");
  assert.equal(state.displayed.windowDays, 90);
  assert.equal(state.failure?.message, "Temporary outage.");
  assert.equal(state.loading, false);

  await select(7);
  assert.equal(state.displayed.points[0]?.medianRate, "5.3000");
  assert.equal(state.failure, null);
});

test("the chart keeps rendering retained data alongside the refresh-failure notice", () => {
  const source = readFileSync(
    new URL("../../../components/corridors/CorridorRateHistoryChart.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /useReducer\(\s*rateHistoryPanelReducer/);
  assert.match(source, /data-testid="rate-history-refresh-failure"/);
  assert.match(source, /Still showing the last successful/);
  assert.match(source, /describeDataAge\(/);
  assert.match(source, /data-testid="rate-history-displayed-window"/);
  // The failure notice must not be a ternary branch that replaces the chart.
  assert.match(source, /\{failure \? \([\s\S]*?\) : null\}/);
  assert.doesNotMatch(source, /\berror \?/);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
