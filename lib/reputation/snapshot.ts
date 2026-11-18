import { Prisma } from "@/app/generated/prisma/client";
import type { ReputationSnapshotContext } from "@/types/reputation";

/**
 * Transactional snapshot boundary for reputation evidence reads (#135).
 *
 * Every reputation evaluation must observe anchor state, corridor membership,
 * latest rate observations, and transfer outcomes from exactly one PostgreSQL
 * snapshot. The read runs in one explicit read-only REPEATABLE READ
 * transaction so all statements share one snapshot regardless of concurrent
 * rate capture, registry reconciliation, or outcome ingestion.
 *
 * Isolation semantics (documented contract):
 * - REPEATABLE READ gives the whole evidence set a single consistent snapshot
 *   taken at the first statement of the transaction. The transaction is also
 *   explicitly switched to READ ONLY before any evidence query, so PostgreSQL
 *   itself rejects accidental writes on this path.
 * - No external SEP/network request ever runs inside the transaction: the
 *   callback receives only the transaction client, and the bounded Prisma
 *   interactive-transaction timeout caps how long the transaction can live.
 * - Transient serialization/lock failures are retried a bounded number of
 *   times. A retry re-runs the entire snapshot read from scratch, so a retry
 *   can never mix rows from two different snapshots: either the complete
 *   evidence set comes from one snapshot, or the caller receives a typed,
 *   secret-free failure.
 *
 * Read-only enforcement: SET TRANSACTION READ ONLY is executed before the
 * snapshot identity or evidence is read, so PostgreSQL rejects accidental
 * writes for the lifetime of the transaction.
 */

export const REPUTATION_SNAPSHOT_ISOLATION = "REPEATABLE READ" as const;

/** Bounded retry ceiling for transient snapshot-read failures. */
export const REPUTATION_SNAPSHOT_MAX_ATTEMPTS = 3;

/** Bounded interactive-transaction lifetime for the evidence snapshot read. */
const SNAPSHOT_TRANSACTION_TIMEOUT_MS = 10_000;
const SNAPSHOT_TRANSACTION_MAX_WAIT_MS = 2_000;

export type ReputationSnapshotErrorCode =
  | "EVIDENCE_READ_FAILURE"
  | "EVIDENCE_READ_SERIALIZATION_FAILURE";

export type ReputationSnapshotFailure = Readonly<{
  code: ReputationSnapshotErrorCode;
  /** Whether the read may be retried; retries re-run the entire snapshot. */
  retryable: boolean;
  /** Number of bounded attempts consumed before this failure. */
  attempts: number;
}>;

export type ReputationSnapshotRead<T> =
  | Readonly<{
      ok: true;
      value: T;
      /** Snapshot identity available to #134's evidence-manifest persistence. */
      snapshot: ReputationSnapshotContext;
    }>
  | Readonly<{ ok: false; failure: ReputationSnapshotFailure }>;

type PrismaDb = Readonly<{
  $transaction: <R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options: Readonly<{
      isolationLevel: typeof Prisma.TransactionIsolationLevel.RepeatableRead;
      maxWait: number;
      timeout: number;
    }>,
  ) => Promise<R>;
}>;

type SnapshotIdentity = Readonly<{ snapshotId: string; readAt: Date }>;

/**
 * Reads a coherent value inside one read-only REPEATABLE READ snapshot.
 * `read` receives the transaction client and MUST only run database queries;
 * it must never perform network or SEP requests.
 */
export async function readInReputationSnapshot<T>(
  db: PrismaDb,
  read: (tx: Prisma.TransactionClient, identity: SnapshotIdentity) => Promise<T>,
): Promise<ReputationSnapshotRead<T>> {
  let lastFailure: ReputationSnapshotFailure = Object.freeze({
    code: "EVIDENCE_READ_FAILURE",
    retryable: false,
    attempts: 1,
  });

  for (let attempt = 1; attempt <= REPUTATION_SNAPSHOT_MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const identity = await readSnapshotIdentity(tx);
        return Object.freeze({ value: await read(tx, identity), identity });
      }, {
        isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
        maxWait: SNAPSHOT_TRANSACTION_MAX_WAIT_MS,
        timeout: SNAPSHOT_TRANSACTION_TIMEOUT_MS,
      });

      return Object.freeze({
        ok: true,
        value: result.value,
        snapshot: Object.freeze({
          snapshotId: result.identity.snapshotId,
          readAt: result.identity.readAt,
          isolationLevel: REPUTATION_SNAPSHOT_ISOLATION,
        }),
      });
    } catch (error) {
      if (isReputationSnapshotAbort(error)) {
        // The callback signalled a typed read failure (e.g. the anchor
        // disappeared mid-evaluation); do not retry, it is deterministic.
        lastFailure = Object.freeze({
          code: "EVIDENCE_READ_FAILURE",
          retryable: false,
          attempts: attempt,
        });
        break;
      }

      const transient = isTransientSnapshotError(error);
      lastFailure = Object.freeze({
        code: transient ? "EVIDENCE_READ_SERIALIZATION_FAILURE" : "EVIDENCE_READ_FAILURE",
        retryable: transient,
        attempts: attempt,
      });
      if (!transient) break;
    }
  }

  return Object.freeze({ ok: false, failure: lastFailure });
}

/**
 * Reads the PostgreSQL snapshot identity of the current transaction. Runs as
 * the first statement of the REPEATABLE READ transaction, so the returned
 * identity names the exact snapshot the evidence set is read from.
 */
export async function readSnapshotIdentity(
  tx: Prisma.TransactionClient,
): Promise<SnapshotIdentity> {
  const rows = await tx.$queryRaw<{ snapshot_id: string; read_at: Date }[]>(Prisma.sql`
    SELECT pg_current_snapshot()::text AS "snapshot_id",
           timezone('utc', now()) AS "read_at"
  `);
  const [row] = rows;
  if (!row || typeof row.snapshot_id !== "string" || !row.snapshot_id) {
    throw new Error("REPUTATION_SNAPSHOT_IDENTITY_UNAVAILABLE");
  }
  const readAt = row.read_at instanceof Date ? row.read_at : new Date(row.read_at);
  if (Number.isNaN(readAt.getTime())) {
    throw new Error("REPUTATION_SNAPSHOT_IDENTITY_UNAVAILABLE");
  }
  return Object.freeze({ snapshotId: row.snapshot_id, readAt });
}

/** Error thrown by snapshot readers to abort with a typed, non-retryable failure. */
export class ReputationSnapshotAbort extends Error {
  constructor(message = "REPUTATION_SNAPSHOT_ABORTED") {
    super(message);
    this.name = "ReputationSnapshotAbort";
  }
}

export function isReputationSnapshotAbort(error: unknown): boolean {
  return error instanceof ReputationSnapshotAbort;
}

/**
 * Classifies PostgreSQL errors. Only serialization failures (40001), deadlock
 * victims (40P01), and lock timeouts (55P03) are transient; everything else
 * fails immediately so callers never silently reread a different snapshot.
 */
export function isTransientSnapshotError(error: unknown): boolean {
  const sqlState = readSqlState(error);
  return sqlState === "40001" || sqlState === "40P01" || sqlState === "55P03";
}

function readSqlState(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}
