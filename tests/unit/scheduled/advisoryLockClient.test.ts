import assert from "node:assert/strict";
import test from "node:test";
import type { PoolClient } from "pg";

import { withAdvisoryLock, describeLockKey } from "@/lib/scheduled/advisoryLockClient";
import { LOCK_REGISTRY } from "@/lib/scheduled/advisoryLockKey";

// ---------------------------------------------------------------------------
// Mock pool client factory
// ---------------------------------------------------------------------------

type QueryLog = { sql: string; params: unknown[] }[];

function mockClient(acquires: boolean, log?: QueryLog): PoolClient {
  const _log = log ?? [];
  return {
    query: async (sql: string, params?: unknown[]) => {
      _log.push({ sql, params: params ?? [] });
      if (/pg_try_advisory_lock/.test(sql)) {
        return { rows: [{ acquired: acquires }] };
      }
      return { rows: [] };
    },
    release: () => undefined,
  } as unknown as PoolClient;
}

function deps(client: PoolClient, released: { called: boolean }) {
  return Object.freeze({
    checkoutClient: async () => client,
    releaseClient: (_: PoolClient) => { released.called = true; },
  });
}

// ---------------------------------------------------------------------------
// Acquire path
// ---------------------------------------------------------------------------

test("withAdvisoryLock executes body when lock is acquired and returns result", async () => {
  const log: QueryLog = [];
  const released = { called: false };
  const client = mockClient(true, log);
  const key = LOCK_REGISTRY[0]!.derivedKey;

  const outcome = await withAdvisoryLock(key, async () => 42, deps(client, released));

  assert.ok("result" in outcome);
  assert.equal((outcome as { result: number }).result, 42);
  assert.ok(outcome.lock.acquired);
  assert.equal(outcome.lock.key, key);
  assert.ok(released.called);
});

test("withAdvisoryLock issues try-acquire and unlock SQL with the correct key", async () => {
  const log: QueryLog = [];
  const released = { called: false };
  const client = mockClient(true, log);
  const key = LOCK_REGISTRY[0]!.derivedKey;

  await withAdvisoryLock(key, async () => undefined, deps(client, released));

  assert.equal(log.length, 2);
  assert.ok(log[0]!.sql.includes("pg_try_advisory_lock"));
  assert.deepEqual(log[0]!.params, [key.toString()]);
  assert.ok(log[1]!.sql.includes("pg_advisory_unlock"));
  assert.deepEqual(log[1]!.params, [key.toString()]);
});

// ---------------------------------------------------------------------------
// Skip path (already_held)
// ---------------------------------------------------------------------------

test("withAdvisoryLock skips body and returns already_held when lock is not acquired", async () => {
  const released = { called: false };
  const client = mockClient(false);
  const key = LOCK_REGISTRY[0]!.derivedKey;
  let bodyCalled = false;

  const outcome = await withAdvisoryLock(key, async () => { bodyCalled = true; return 1; }, deps(client, released));

  assert.equal(bodyCalled, false);
  assert.equal(outcome.lock.acquired, false);
  assert.ok("reason" in outcome.lock && outcome.lock.reason === "already_held");
  assert.ok(released.called, "client must still be released on skip path");
});

// ---------------------------------------------------------------------------
// Error propagation and cleanup
// ---------------------------------------------------------------------------

test("withAdvisoryLock releases the client even when body throws", async () => {
  const released = { called: false };
  const client = mockClient(true);
  const key = LOCK_REGISTRY[0]!.derivedKey;

  await assert.rejects(
    () => withAdvisoryLock(key, async () => { throw new Error("body error"); }, deps(client, released)),
    /body error/,
  );

  assert.ok(released.called, "client must be released after body throw");
});

test("withAdvisoryLock releases the client even when unlock query throws", async () => {
  const released = { called: false };
  const badUnlockClient: PoolClient = {
    query: async (sql: string) => {
      if (/pg_try_advisory_lock/.test(sql)) return { rows: [{ acquired: true }] };
      throw new Error("connection lost");
    },
    release: () => undefined,
  } as unknown as PoolClient;

  const outcome = await withAdvisoryLock(
    LOCK_REGISTRY[0]!.derivedKey,
    async () => "ok",
    {
      checkoutClient: async () => badUnlockClient,
      releaseClient: (_: PoolClient) => { released.called = true; },
    },
  );

  // Body still succeeded; unlock error is swallowed (connection drop = auto-release)
  assert.ok("result" in outcome);
  assert.equal((outcome as { result: string }).result, "ok");
  assert.ok(released.called);
});

// ---------------------------------------------------------------------------
// describeLockKey
// ---------------------------------------------------------------------------

test("describeLockKey formats a registered key with its logical name and domain", () => {
  const key = LOCK_REGISTRY[0]!.derivedKey;
  const desc = describeLockKey(key);
  assert.ok(desc.includes(key.toString()));
  assert.ok(desc.includes(LOCK_REGISTRY[0]!.logicalName));
  assert.ok(desc.includes(LOCK_REGISTRY[0]!.domainId.toString()));
});

test("describeLockKey formats an unknown key with <unknown> placeholder", () => {
  const desc = describeLockKey(0n);
  assert.ok(desc.includes("0"));
  assert.ok(desc.includes("<unknown>"));
  assert.equal(desc.includes("DATABASE_URL"), false);
});

test("describeLockKey output for all registry entries contains neither DATABASE_URL nor secrets", () => {
  for (const entry of LOCK_REGISTRY) {
    const desc = describeLockKey(entry.derivedKey);
    assert.equal(desc.includes("DATABASE_URL"), false);
    assert.equal(desc.includes("password"), false);
  }
});
