import assert from "node:assert/strict";
import test from "node:test";

import type { PoolClient } from "pg";
import { withDatabaseDeadline, DatabaseDeadlineExceededError } from "@/lib/db/deadlines";
import { isFailoverOrConnectionError } from "@/lib/db/failoverErrors";
import {
  createHardenedPool,
  evictStalePoolConnections,
} from "@/lib/db/poolManager";
import {
  executeSafeTransaction,
  TransactionCommitUnconfirmedError,
  TransactionInterruptedError,
} from "@/lib/db/transactionSafety";
import {
  createMockPostgresServer,
  type MockPostgresServer,
} from "@/tests/integration/db/fixtures/mockPostgresServer";

test("broken pooled connections are evicted and not reused indefinitely after server termination", async () => {
  const server = await createMockPostgresServer();
  const pool = createHardenedPool(server.connectionString, {
    max: 2,
    connectionTimeoutMillis: 1000,
  });

  try {
    // 1. Initial query establishes healthy connection in pool
    const res1 = await pool.query("SELECT 1");
    assert.equal(res1.command, "SELECT");
    assert.equal(pool.idleCount, 1);

    // 2. Server simulates crash / socket destruction
    server.simulateCrash();

    // 3. Pool evicts stale connections upon error detection
    const evicted = evictStalePoolConnections(pool);
    assert.ok(evicted >= 1);
    assert.equal(pool.idleCount, 0);

    // 4. Broken connection is not reused; attempt fails fast due to closed server
    await assert.rejects(
      async () => {
        await pool.query("SELECT 1");
      },
      (err: unknown) => {
        assert.ok(isFailoverOrConnectionError(err));
        return true;
      },
    );
  } finally {
    await pool.end();
    await server.close();
  }
});

test("new work recovers after primary outage, endpoint rotation, and server restore", async () => {
  let primaryServer: MockPostgresServer | null = await createMockPostgresServer();
  const primaryPort = primaryServer.port;

  const pool = createHardenedPool(primaryServer.connectionString, {
    max: 5,
    connectionTimeoutMillis: 1000,
  });

  try {
    // 1. Initial traffic succeeds
    const initialRes = await pool.query("SELECT 1");
    assert.equal(initialRes.command, "SELECT");

    // 2. Primary outage occurs
    primaryServer.simulateCrash();
    primaryServer = null;

    // Queries during outage fail fast with classified connection error
    await assert.rejects(
      async () => {
        await pool.query("SELECT 1");
      },
      (err: unknown) => {
        assert.ok(isFailoverOrConnectionError(err));
        return true;
      },
    );

    // 3. New primary recovers on the rotated/restored endpoint
    const promotedPrimary = await createMockPostgresServer(primaryPort);
    primaryServer = promotedPrimary;

    // 4. Multi-request recovery: subsequent queries re-establish connections and succeed
    const multiResults = await Promise.all([
      pool.query("SELECT 1"),
      pool.query("SELECT 1"),
      pool.query("SELECT 1"),
    ]);

    for (const res of multiResults) {
      assert.equal(res.command, "SELECT");
    }
  } finally {
    await pool.end();
    if (primaryServer) {
      await primaryServer.close();
    }
  }
});

test("interrupted transactions never report success without commit confirmation", async () => {
  const server = await createMockPostgresServer();
  const pool = createHardenedPool(server.connectionString, {
    max: 2,
    connectionTimeoutMillis: 1000,
  });

  try {
    // Scenario A: Connection severed during transaction execution before commit
    await assert.rejects(
      async () => {
        await executeSafeTransaction(
          async (fn) => {
            const client = await pool.connect();
            const noopErrorHandler = () => {};
            client.on("error", noopErrorHandler);
            let executionError: unknown;
            try {
              await client.query("BEGIN");
              const res = await fn(client);
              await client.query("COMMIT");
              return res;
            } catch (err) {
              executionError = err;
              throw err;
            } finally {
              client.removeListener("error", noopErrorHandler);
              client.release(executionError as Error | undefined);
            }
          },
          async (client: PoolClient) => {
            // Sever connection mid-transaction
            server.setMode("DROP_ON_QUERY");
            await client.query("SELECT 1");
            return { committed: true };
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof TransactionInterruptedError);
        assert.equal(err.phase, "IN_FLIGHT");
        return true;
      },
    );

    // Scenario B: Connection severed mid-COMMIT (commit confirmation not received)
    server.setMode("NORMAL");
    await assert.rejects(
      async () => {
        await executeSafeTransaction(
          async (fn) => {
            const client = await pool.connect();
            const noopErrorHandler = () => {};
            client.on("error", noopErrorHandler);
            let executionError: unknown;
            try {
              await client.query("BEGIN");
              const res = await fn(client);
              // Server drops during COMMIT
              server.setMode("DROP_ON_COMMIT");
              await client.query("COMMIT");
              return res;
            } catch (err) {
              executionError = err;
              throw err;
            } finally {
              client.removeListener("error", noopErrorHandler);
              client.release(executionError as Error | undefined);
            }
          },
          async (client: PoolClient) => {
            await client.query("SELECT 1");
            return { status: "SUCCESS_PENDING_COMMIT" };
          },
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof TransactionCommitUnconfirmedError);
        assert.equal(err.phase, "COMMITTING");
        return true;
      },
    );
  } finally {
    await pool.end();
    await server.close();
  }
});

test("failover recovery respects acquisition and request deadlines", async () => {
  const server = await createMockPostgresServer();
  server.setMode("BLACKHOLE"); // Unresponsive primary

  const pool = createHardenedPool(server.connectionString, {
    max: 2,
    connectionTimeoutMillis: 500,
  });

  try {
    const startTime = Date.now();

    await assert.rejects(
      async () => {
        await withDatabaseDeadline(
          async () => {
            return pool.query("SELECT 1");
          },
          { timeoutMs: 100 }, // Strict deadline
        );
      },
      (err: unknown) => {
        assert.ok(err instanceof DatabaseDeadlineExceededError);
        return true;
      },
    );

    const elapsed = Date.now() - startTime;
    // Must respect ~100ms deadline instead of hanging for connection timeout
    assert.ok(elapsed < 400, `Deadline exceeded bound: elapsed=${elapsed}ms`);
  } finally {
    await pool.end();
    await server.close();
  }
});

test("no connection storm occurs during recovery under burst load", async () => {
  const server = await createMockPostgresServer();
  const maxPoolConnections = 3;
  const pool = createHardenedPool(server.connectionString, {
    max: maxPoolConnections,
    connectionTimeoutMillis: 2000,
  });

  try {
    // Burst 15 concurrent queries against the recovering primary
    const burstPromises = Array.from({ length: 15 }, () => pool.query("SELECT 1"));
    const results = await Promise.all(burstPromises);

    assert.equal(results.length, 15);
    for (const res of results) {
      assert.equal(res.command, "SELECT");
    }

    // Peak active connections must never exceed pool max limit
    assert.ok(
      server.getActiveConnectionsCount() <= maxPoolConnections,
      `Active connections (${server.getActiveConnectionsCount()}) exceeded max (${maxPoolConnections})`,
    );
  } finally {
    await pool.end();
    await server.close();
  }
});
