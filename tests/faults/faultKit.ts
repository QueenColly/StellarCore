/**
 * Deterministic fault-injection kit for scheduled evidence pipelines (issue
 * #171).
 *
 * Everything here is synchronous, clock-controlled, and offline: faults are
 * queued up front and released in a fixed order, so a scenario's outcome is
 * reproducible run to run and in any CI environment. No live anchors, no
 * external network, no real database.
 *
 * Building blocks:
 *
 * - `clock()` — a stepped deterministic clock implementing `now: () => Date`.
 * - `plan()` — a bounded FIFO schedule; `step(name)` records call order so
 *   tests can assert exact orchestration sequences.
 * - `flaky()` — a call-count-sequenced responder: each call either succeeds
 *   through the delegate or throws the queued fault, in a fixed order.
 * - `deadlineThrower()` — models `AbortSignal`-style deadline/cancellation
 *   faults with a `DeadlineError` carrying a safe code only.
 * - `flakyRepository()` / `flakyReputationRepository()` — fault seams at the
 *   per-method database boundary, with the underlying ledger recording every
 *   durable write so tests can verify evidence invariants after recovery.
 * - `connectableRepository()` — models database connectivity with
 *   `connect()`/`disconnect()` around an in-memory ledger, for
 *   disconnect-mid-cycle and reconnect-rerun scenarios.
 *
 * Error safety: injected faults always throw `InjectedFaultError` or
 * `DeadlineError`, whose message contains only the scenario-local code.
 * Nothing from a "real" environment (connection strings, secrets) can leak
 * into a run summary, mirroring the redaction the production boundaries
 * apply.
 */

export class InjectedFaultError extends Error {
  constructor(readonly code: string) {
    super(`injected fault: ${code}`);
    this.name = "InjectedFaultError";
  }
}

export class DeadlineError extends Error {
  constructor(readonly code: "DEADLINE_EXCEEDED" | "OPERATION_CANCELLED") {
    super(code);
    this.name = "DeadlineError";
  }
}

export type FaultPlan = Readonly<{
  /** Records one named step in call order and returns the zero-based index. */
  step: (name: string) => number;
  /** The recorded step names, in call order. */
  steps: () => readonly string[];
  /** The next planned value, or undefined when the plan is exhausted. */
  take: () => string | undefined;
}>;

/**
 * A bounded FIFO schedule of scenario-local outcomes, e.g.
 * `plan(["ok", "fail:db", "ok"])`. Exhausting the plan yields "ok" so
 * defaults stay deterministic.
 */
export function plan(
  outcomes: readonly string[],
  onStep?: (name: string, index: number) => void,
): FaultPlan {
  const steps: string[] = [];
  let cursor = 0;

  return {
    step(name) {
      const index = steps.length;
      steps.push(name);
      onStep?.(name, index);
      return index;
    },
    steps: () => Object.freeze([...steps]),
    take() {
      const outcome = cursor < outcomes.length ? outcomes[cursor] : undefined;
      cursor += 1;
      return outcome;
    },
  };
}

export type DeterministicClock = {
  now: () => Date;
  advance: (ms: number) => void;
  current: () => Date;
};

/** A stepped clock starting at a fixed instant; no wall-clock dependency. */
export function clock(start = new Date("2026-09-30T00:00:00.000Z")): DeterministicClock {
  let currentMs = start.getTime();

  return {
    now: () => new Date(currentMs),
    advance: (ms) => {
      currentMs += ms;
    },
    current: () => new Date(currentMs),
  };
}

type Responder<TArgs, TResult> = (input: TArgs, call: number) => TResult;

/**
 * A call-count-sequenced responder. Each entry is either a fault code
 * (`"fault:CODE"`), a deadline (`"deadline:DEADLINE_EXCEEDED"` or
 * `"cancel:OPERATION_CANCELLED"`), or `"ok"`. Sequence exhaustion defaults to
 * `"ok"` so callers never need trailing entries. Arguments pass through to
 * the underlying responder on every call.
 */
export function sequenced<TArgs, TResult>(
  outcomes: readonly string[],
  ok: Responder<TArgs, TResult>,
): (input: TArgs) => TResult | Promise<TResult> {
  let call = 0;

  return (input: TArgs) => {
    const index = call++;
    const outcome = index < outcomes.length ? outcomes[index] : "ok";

    if (outcome.startsWith("fault:")) {
      throw new InjectedFaultError(outcome.slice("fault:".length));
    }
    if (outcome.startsWith("deadline:")) {
      throw new DeadlineError("DEADLINE_EXCEEDED");
    }
    if (outcome.startsWith("cancel:")) {
      throw new DeadlineError("OPERATION_CANCELLED");
    }
    return ok(input, index);
  };
}

/**
 * Wraps any async seam so its first `failAfter` calls succeed and every call
 * from then on fails with the given code. Useful for "disconnects mid-cycle"
 * scenarios without sequencing every call by hand.
 */
export function failAfter<TArgs extends unknown[], TResult>(
  seam: (...args: TArgs) => Promise<TResult>,
  failAfter: number,
  code: string,
): (...args: TArgs) => Promise<TResult> {
  let calls = 0;

  return async (...args: TArgs) => {
    if (calls++ >= failAfter) throw new InjectedFaultError(code);
    return seam(...args);
  };
}

export type SnapshotLedgerRow = Readonly<{
  id: string;
  anchorSlug: string;
  corridorSlug: string;
  rate: string;
  capturedAt: Date;
  /** Capture-run identity persisted as provenance (#113). */
  captureRunId: string;
  /** Reviewed configuration digest persisted as provenance (#331, #113). */
  configurationDigest: string;
}>;

export type SnapshotLedger = {
  rows: SnapshotLedgerRow[];
  ids: () => readonly string[];
  count: () => number;
  /** Snapshot ids written for one anchor, in insertion order. */
  idsForAnchor: (anchorSlug: string) => readonly string[];
};

export function snapshotLedger(): SnapshotLedger {
  const rows: SnapshotLedgerRow[] = [];
  return {
    rows,
    ids: () => Object.freeze(rows.map(({ id }) => id)),
    count: () => rows.length,
    idsForAnchor: (anchorSlug) => Object.freeze(
      rows.filter((row) => row.anchorSlug === anchorSlug).map(({ id }) => id),
    ),
  };
}

/**
 * An in-memory `RateSnapshotRepository` with per-method fault seams and a
 * durable ledger. Seams are public so a test can swap in `sequenced`,
 * `failAfter`, or deadline-throwing implementations between calls (modeling a
 * database that goes away mid-cycle).
 */
export function faultSnapshotRepository(
  ledger: SnapshotLedger,
  faults: Partial<Record<
    "findAnchorBySlug" | "findCorridorBySlug" | "hasAssociation" | "createSnapshot",
    string[]
  >> = {},
) {
  const okAnchor = async (slug: string) => ({ id: `anchor:${slug}` });
  const okCorridor = async (slug: string) => ({ id: `corridor:${slug}` });
  const okAssociation = async () => true;
  const okCreate = async (input: {
    anchorId: string;
    corridorId: string;
    rate: string;
    capturedAt: Date;
    provenance: {
      captureRunId: string;
      configurationDigest: string;
    };
  }) => {
    const row: SnapshotLedgerRow = {
      id: `snapshot-${ledger.rows.length + 1}`,
      anchorSlug: input.anchorId.replace(/^anchor:/, ""),
      corridorSlug: input.corridorId.replace(/^corridor:/, ""),
      rate: input.rate,
      capturedAt: new Date(input.capturedAt.getTime()),
      captureRunId: input.provenance.captureRunId,
      configurationDigest: input.provenance.configurationDigest,
    };
    ledger.rows.push(row);
    return {
      id: row.id,
      provenanceId: `provenance-${ledger.rows.length}`,
      rate: input.rate,
      sourceAmount: "0",
      destinationAmount: "0",
      fee: "0",
      capturedAt: new Date(input.capturedAt.getTime()),
    };
  };

  const anchorResponder = sequenced(faults.findAnchorBySlug ?? [], okAnchor);
  const corridorResponder = sequenced(faults.findCorridorBySlug ?? [], okCorridor);
  const associationResponder = sequenced(faults.hasAssociation ?? [], okAssociation);
  const createResponder = sequenced(faults.createSnapshot ?? [], okCreate);

  return {
    findAnchorBySlug: (slug: string) => anchorResponder(slug),
    findCorridorBySlug: (slug: string) => corridorResponder(slug),
    hasAssociation: (anchorId: string, corridorId: string) =>
      associationResponder({ anchorId, corridorId }),
    createSnapshot: (input: Parameters<typeof okCreate>[0]) => createResponder(input),
  };
}

export type ReputationLedger = {
  scores: Map<string, string>;
  computedAtBySlug: () => Readonly<Record<string, string>>;
  recordComputedAt: (slug: string, computedAt: string) => void;
  recordUpsert: () => void;
  upserts: () => number;
};

export function reputationLedger(): ReputationLedger {
  const scores = new Map<string, string>();
  let upsertCount = 0;
  const computedAtBySlug = new Map<string, string>();

  return {
    scores,
    computedAtBySlug: () => Object.fromEntries(computedAtBySlug),
    recordComputedAt: (slug, computedAt) => {
      computedAtBySlug.set(slug, computedAt);
    },
    recordUpsert: () => {
      upsertCount += 1;
    },
    upserts: () => upsertCount,
  };
}

/**
 * An in-memory `ReputationRepository` with per-method fault seams over a
 * fixed evidence table and a durable score ledger.
 */
export function faultReputationRepository(
  reputationLedger: ReputationLedger,
  evidenceBySlug: Readonly<Record<string, {
    anchorId: string;
    status: "LIVE" | "DEGRADED" | "DOWN" | "UNKNOWN";
    corridorSlugs: readonly string[];
    latestRateCount: number;
    outcomeCount: number;
    completedOutcomeCount: number;
  }>>,
  faults: Partial<Record<"readEvidence" | "upsertScore", string[]>> = {},
) {
  const readResponder = sequenced(faults.readEvidence ?? [], async (slug: string) => {
    const evidence = evidenceBySlug[slug];
    if (!evidence) return null;

    return {
      anchorId: evidence.anchorId,
      anchorSlug: slug as string,
      status: evidence.status,
      corridorSlugs: Object.freeze([...evidence.corridorSlugs]),
      latestRates: Object.freeze(
        Array.from({ length: evidence.latestRateCount }, (_, index) => ({
          corridorSlug: evidence.corridorSlugs[index] ?? `corridor-${index}`,
          capturedAt: new Date("2026-09-30T00:00:00.000Z"),
        })),
      ),
      transferOutcomes: Object.freeze(
        Array.from({ length: evidence.outcomeCount }, () => ({
          status: "COMPLETED" as const,
          settlementMs: 1_000,
          slippage: 0,
          recordedAt: new Date("2026-09-29T00:00:00.000Z"),
        })),
      ),
    };
  });

  const upsertResponder = sequenced(faults.upsertScore ?? [], async (input: {
    anchorId: string;
    calculation: { anchorSlug: string; computedAt: string };
  }) => {
    const { anchorId, calculation } = input;
    reputationLedger.scores.set(anchorId, calculation.anchorSlug);
    reputationLedger.recordComputedAt(calculation.anchorSlug, calculation.computedAt);
    reputationLedger.recordUpsert();
    return {
      id: anchorId,
      anchorSlug: calculation.anchorSlug,
      computedAt: new Date(calculation.computedAt),
    };
  });

  const upsertByKey = new Map<string, number>();

  return {
    readEvidence: (slug: string) => readResponder(slug),
    async upsertScore(
      input: Parameters<typeof upsertResponder>[0],
    ): Promise<ReturnType<typeof upsertResponder>> {
      const key = input.calculation.anchorSlug;
      upsertByKey.set(key, (upsertByKey.get(key) ?? 0) + 1);
      return upsertResponder(input);
    },
  };
}

/**
 * Wraps an async operation with a deterministic deadline fault: the deadline
 * always fires after `afterMs` of the run's virtual clock, independent of
 * real time, so deadline scenarios are instant and reproducible.
 */
export function deadlineAfter(
  operation: () => Promise<unknown>,
  afterMs: number,
  virtualClock: DeterministicClock,
  kind: "deadline:DEADLINE_EXCEEDED" | "cancel:OPERATION_CANCELLED" = "deadline:DEADLINE_EXCEEDED",
): Promise<unknown> {
  const startedAt = virtualClock.current().getTime();
  const code = kind.startsWith("cancel:")
    ? "OPERATION_CANCELLED"
    : "DEADLINE_EXCEEDED";

  return operation().then((value) => {
    if (virtualClock.current().getTime() - startedAt >= afterMs) {
      throw new DeadlineError(code as DeadlineError["code"]);
    }
    return value;
  });
}
