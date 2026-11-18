import type { PoolClient } from "pg";

import { resolveKey } from "@/lib/scheduled/advisoryLockKey";

export type AdvisoryLockResult =
  | Readonly<{ acquired: true; key: bigint }>
  | Readonly<{ acquired: false; key: bigint; reason: "already_held" }>;

export type AdvisoryLockClientDependencies = Readonly<{
  /** Returns a checked-out pool client; caller must not release it. */
  checkoutClient: () => Promise<PoolClient>;
  /** Releases the checked-out client back to the pool. */
  releaseClient: (client: PoolClient) => void;
}>;

/**
 * Attempts a non-blocking session-scoped PostgreSQL advisory lock.
 * The checked-out connection is held for the duration of `body`; the lock
 * is released (and the connection returned) in `finally`, even on throw.
 * A lost connection releases the session lock automatically.
 *
 * @param key     — signed int8 key derived by `deriveLockKey`
 * @param body    — work to execute while the lock is held
 * @param deps    — injectable connection factory (default: DATABASE_URL pool)
 */
export async function withAdvisoryLock<T>(
  key: bigint,
  body: () => Promise<T>,
  deps: AdvisoryLockClientDependencies = DEFAULT_DEPENDENCIES,
): Promise<{ result: T; lock: AdvisoryLockResult } | { lock: AdvisoryLockResult }> {
  const client = await deps.checkoutClient();
  let acquired = false;

  try {
    acquired = await tryAcquire(client, key);
    const lock: AdvisoryLockResult = acquired
      ? Object.freeze({ acquired: true, key })
      : Object.freeze({ acquired: false, key, reason: "already_held" as const });

    if (!acquired) return { lock };

    const result = await body();
    return { result, lock };
  } finally {
    if (acquired) {
      await safeRelease(client, key);
    }
    deps.releaseClient(client);
  }
}

/**
 * Sanitized diagnostic string for a raw int8 advisory lock key.
 * Never includes payload data; safe for logs and metrics.
 */
export function describeLockKey(key: bigint): string {
  const descriptor = resolveKey(key);
  if (descriptor) {
    return `advisory_lock(key=${key}, name="${descriptor.logicalName}", domain=${descriptor.domainId})`;
  }
  return `advisory_lock(key=${key}, name=<unknown>)`;
}

async function tryAcquire(client: PoolClient, key: bigint): Promise<boolean> {
  const { rows } = await client.query<{ acquired: boolean }>(
    "SELECT pg_try_advisory_lock($1::bigint) AS acquired",
    [key.toString()],
  );
  return rows[0]?.acquired === true;
}

async function safeRelease(client: PoolClient, key: bigint): Promise<void> {
  try {
    await client.query("SELECT pg_advisory_unlock($1::bigint)", [key.toString()]);
  } catch {
    // Connection loss releases the session lock automatically; swallow here.
  }
}

// The default pool must allow more than one checked-out connection. A one-client
// pool would serialize overlapping callers at checkout, causing the second call
// to wait and run later instead of observing the held advisory lock and returning
// the intended "already_held" result.
function buildDefaultDependencies(): AdvisoryLockClientDependencies {
  let pool: import("pg").Pool | undefined;

  function getPool(): import("pg").Pool {
    if (!pool) {
      // Dynamic require keeps test boundaries that inject dependencies isolated.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require("pg") as typeof import("pg");
      const connectionString = process.env.DATABASE_URL;
      if (!connectionString) throw new Error("DATABASE_URL is not defined");
      pool = new Pool({ connectionString });
    }
    return pool;
  }

  return Object.freeze({
    checkoutClient: () => getPool().connect(),
    releaseClient: (client: PoolClient) => client.release(),
  });
}

const DEFAULT_DEPENDENCIES = buildDefaultDependencies();
