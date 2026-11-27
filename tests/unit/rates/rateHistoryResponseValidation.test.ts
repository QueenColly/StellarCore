import assert from "node:assert/strict";
import test from "node:test";
import {
  createRateHistoryLoader,
} from "@/lib/rates/rateHistoryRequests";
import {
  initialRateHistoryPanelState,
  rateHistoryPanelReducer,
  type RateHistoryPanelState,
} from "@/lib/rates/rateHistoryPanelState";
import type { PublicRateHistoryResponse } from "@/types/api/rateHistory";

const CORRIDOR = "usdc-us-brl-br";
const SAFE_ERROR = "Unable to load rate history.";
const MISMATCH_ERROR = "Rate history response did not match the requested window.";
const FAILED_AT = "2026-11-20T12:30:00.000Z";

function validHistory(windowDays = 30): PublicRateHistoryResponse {
  return {
    corridor: {
      slug: CORRIDOR,
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
    },
    evaluatedAt: "2026-11-20T12:00:00.000Z",
    windowDays,
    points: [
      {
        timestamp: "2026-11-20T11:00:00.000Z",
        medianRate: "5.250000000000000000",
        state: "healthy",
        sourceCount: 2,
        freshSourceCount: 2,
        observations: [
          {
            anchor: { slug: "anchor-a", name: "Anchor A" },
            rate: "5.250000000000000000",
            sourceAmount: "100.000000000000000000",
            destinationAmount: "525.000000000000000000",
            fee: "1.000000000000000000",
            capturedAt: "2026-11-20T10:59:50.000Z",
          },
        ],
      },
      {
        timestamp: "2026-11-20T10:00:00.000Z",
        medianRate: null,
        state: "insufficient_fresh_sources",
        sourceCount: 0,
        freshSourceCount: 0,
        observations: [],
      },
    ],
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function mutated(mutate: (root: Record<string, unknown>) => void): unknown {
  const root = structuredClone(validHistory()) as unknown as Record<string, unknown>;
  mutate(root);
  return root;
}

function withPoint(mutate: (point: Record<string, unknown>) => void): unknown {
  return mutated((root) => {
    mutate((root.points as unknown[])[0] as Record<string, unknown>);
  });
}

function withObservation(mutate: (observation: Record<string, unknown>) => void): unknown {
  return withPoint((point) => {
    mutate((point.observations as unknown[])[0] as Record<string, unknown>);
  });
}

async function run(payload: unknown, days = 30) {
  let state: RateHistoryPanelState = initialRateHistoryPanelState(validHistory(30));
  const retained = state.displayed;
  let successCount = 0;

  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: {
      onSuccess: (history) => {
        successCount += 1;
        state = rateHistoryPanelReducer(state, { type: "refresh_succeeded", history });
      },
      onError: (message, requestedDays) => {
        state = rateHistoryPanelReducer(state, {
          type: "refresh_failed",
          message,
          days: requestedDays,
          failedAt: FAILED_AT,
        });
      },
    },
    fetchImpl: async () => jsonResponse(payload),
    setTimer: () => 0,
    clearTimer: () => {},
  });
  await loader.load(days);

  return { state, retained, successCount };
}

async function assertRejected(payload: unknown, message: string, days = 30): Promise<void> {
  const { state, retained, successCount } = await run(payload, days);
  assert.equal(successCount, 0, "malformed payload must never reach onSuccess");
  assert.equal(state.displayed, retained, "the last verified history must be retained");
  assert.deepEqual(state.failure, {
    message,
    requestedDays: days,
    failedAt: FAILED_AT,
  });
  for (const snippet of ["anchor-a", "5.250000000000000000", "not-a-point", "null"]) {
    assert.equal(JSON.stringify(state.failure).includes(snippet), false);
  }
}

test("valid history with a null median and zero observations stays accepted", async () => {
  const payload = validHistory(30);
  const { state, successCount } = await run(payload);

  assert.equal(successCount, 1);
  assert.deepEqual(state.displayed, payload);
  assert.equal(state.failure, null);
  assert.equal(state.displayed.points[1]?.medianRate, null);
  assert.deepEqual(state.displayed.points[1]?.observations, []);
});

test("a genuine empty points array is valid history", async () => {
  const payload = { ...validHistory(30), points: [] } satisfies PublicRateHistoryResponse;
  const { state, successCount } = await run(payload);

  assert.equal(successCount, 1);
  assert.deepEqual(state.displayed.points, []);
  assert.equal(state.failure, null);
});

const malformedPoints: readonly (readonly [string, unknown])[] = [
  ["null point", mutated((root) => {
    (root.points as unknown[])[0] = null;
  })],
  ["string point", mutated((root) => {
    (root.points as unknown[])[0] = "not-a-point";
  })],
  ["missing timestamp", withPoint((point) => {
    delete point.timestamp;
  })],
  ["empty timestamp", withPoint((point) => {
    point.timestamp = "";
  })],
  ["missing medianRate", withPoint((point) => {
    delete point.medianRate;
  })],
  ["numeric medianRate", withPoint((point) => {
    point.medianRate = 5.25;
  })],
  ["missing state", withPoint((point) => {
    delete point.state;
  })],
  ["unknown state", withPoint((point) => {
    point.state = "operating";
  })],
  ["missing sourceCount", withPoint((point) => {
    delete point.sourceCount;
  })],
  ["non-numeric freshSourceCount", withPoint((point) => {
    point.freshSourceCount = "2";
  })],
  ["missing observations", withPoint((point) => {
    delete point.observations;
  })],
];

for (const [label, payload] of malformedPoints) {
  test(`a ${label} is rejected before onSuccess`, async () => {
    await assertRejected(payload, SAFE_ERROR);
  });
}

const missingEssentialFields: readonly (readonly [string, unknown, string])[] = [
  ["evaluatedAt", mutated((root) => {
    delete root.evaluatedAt;
  }), SAFE_ERROR],
  ["corridor", mutated((root) => {
    delete root.corridor;
  }), MISMATCH_ERROR],
  ["corridor slug", mutated((root) => {
    (root.corridor as Record<string, unknown>).slug = "another-corridor";
  }), MISMATCH_ERROR],
  ["points", mutated((root) => {
    delete root.points;
  }), MISMATCH_ERROR],
  ["windowDays", mutated((root) => {
    delete root.windowDays;
  }), MISMATCH_ERROR],
];

for (const [label, payload, message] of missingEssentialFields) {
  test(`a response missing ${label} uses the safe error path`, async () => {
    await assertRejected(payload, message);
  });
}

test("an unexpected window is rejected without replacing retained history", async () => {
  await assertRejected(
    mutated((root) => {
      root.windowDays = 7;
    }),
    MISMATCH_ERROR,
  );
  await assertRejected(validHistory(14), SAFE_ERROR, 14);
});

const malformedObservations: readonly (readonly [string, unknown])[] = [
  ["non-array observations", withPoint((point) => {
    point.observations = null;
  })],
  ["null observation", withPoint((point) => {
    (point.observations as unknown[])[0] = null;
  })],
  ["missing anchor", withObservation((observation) => {
    delete observation.anchor;
  })],
  ["missing anchor name", withObservation((observation) => {
    delete (observation.anchor as Record<string, unknown>).name;
  })],
  ["non-string rate", withObservation((observation) => {
    observation.rate = 5.25;
  })],
];

for (const [label, payload] of malformedObservations) {
  test(`a ${label} is rejected before onSuccess`, async () => {
    await assertRejected(payload, SAFE_ERROR);
  });
}

test("unparseable 200 JSON is reported with the fixed safe message", async () => {
  let state: RateHistoryPanelState = initialRateHistoryPanelState(validHistory(30));
  const retained = state.displayed;
  let successCount = 0;

  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: {
      onSuccess: () => {
        successCount += 1;
      },
      onError: (message, days) => {
        state = rateHistoryPanelReducer(state, {
          type: "refresh_failed",
          message,
          days,
          failedAt: FAILED_AT,
        });
      },
    },
    fetchImpl: async () => new Response("{ not json", {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    setTimer: () => 0,
    clearTimer: () => {},
  });
  await loader.load(30);

  assert.equal(successCount, 0);
  assert.equal(state.displayed, retained);
  assert.equal(state.failure?.message, SAFE_ERROR);
  assert.doesNotMatch(state.failure?.message ?? "", /not json/);
});

test("an aborted stale malformed response cannot overwrite a newer success", async () => {
  const requests: Array<{ signal: AbortSignal; release: (response: Response) => void }> = [];
  let state: RateHistoryPanelState = initialRateHistoryPanelState(validHistory(30));
  let successCount = 0;
  let errorCount = 0;

  const loader = createRateHistoryLoader({
    corridorSlug: CORRIDOR,
    callbacks: {
      onSuccess: (history) => {
        successCount += 1;
        state = rateHistoryPanelReducer(state, { type: "refresh_succeeded", history });
      },
      onError: (message, days) => {
        errorCount += 1;
        state = rateHistoryPanelReducer(state, {
          type: "refresh_failed",
          message,
          days,
          failedAt: FAILED_AT,
        });
      },
    },
    fetchImpl: (_input, init) => new Promise<Response>((resolve) => {
      requests.push({ signal: init.signal, release: resolve });
    }),
    setTimer: () => 0,
    clearTimer: () => {},
  });

  state = rateHistoryPanelReducer(state, { type: "refresh_started", days: 30 });
  void loader.load(30);
  state = rateHistoryPanelReducer(state, { type: "refresh_started", days: 90 });
  void loader.load(90);

  assert.equal(requests[0]!.signal.aborted, true);
  assert.equal(requests[1]!.signal.aborted, false);

  requests[1]!.release(jsonResponse(validHistory(90)));
  await new Promise<void>((resolve) => setImmediate(resolve));

  // Simulate a transport that ignores abort and returns malformed data late.
  requests[0]!.release(jsonResponse(mutated((root) => {
    (root.points as unknown[])[0] = null;
  })));
  await new Promise<void>((resolve) => setImmediate(resolve));

  assert.equal(successCount, 1);
  assert.equal(errorCount, 0);
  assert.equal(state.displayed.windowDays, 90);
  assert.equal(state.failure, null);
});
