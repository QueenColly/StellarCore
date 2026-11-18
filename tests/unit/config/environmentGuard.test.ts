import assert from "node:assert/strict";
import test from "node:test";

const TEST_ENV = process.env as Record<string, string | undefined>;

import {
  EnvironmentIsolationError,
  isEnvironmentPairingAllowed,
  resolveRuntimeEnvironment,
  verifyEnvironmentPairing,
  type DatabaseEnvironmentId,
} from "@/lib/config/environmentGuard";
import {
  assertDatabaseEnvironmentMatchesRuntime,
  resetEnvironmentGuardCacheForTests,
} from "@/lib/config/environmentGuardDb";

const ENVIRONMENTS: readonly DatabaseEnvironmentId[] = [
  "production",
  "preview",
  "development",
  "test",
  "ci",
];

test("every environment pairing is allowed only when runtime and database identities match", () => {
  for (const runtime of ENVIRONMENTS) {
    for (const database of ENVIRONMENTS) {
      assert.equal(
        isEnvironmentPairingAllowed(runtime, database),
        runtime === database,
        `${runtime} -> ${database}`,
      );
    }
  }
});

function verdictCode(verdict: ReturnType<typeof verifyEnvironmentPairing>): string | null {
  return verdict.ok ? null : verdict.code;
}

test("verifyEnvironmentPairing fails closed for missing, invalid, and mismatched stamps", () => {
  assert.deepEqual(verifyEnvironmentPairing("preview", "production"), {
    ok: false,
    code: "ENVIRONMENT_MISMATCH",
    runtimeEnvironment: "preview",
    databaseEnvironment: "production",
  });
  assert.equal(
    verdictCode(verifyEnvironmentPairing("production", null)),
    "DATABASE_STAMP_MISSING",
  );
  assert.equal(
    verdictCode(verifyEnvironmentPairing("production", undefined)),
    "DATABASE_STAMP_MISSING",
  );
  assert.equal(
    verdictCode(verifyEnvironmentPairing("production", "")),
    "DATABASE_STAMP_MISSING",
  );
  assert.equal(
    verdictCode(verifyEnvironmentPairing("production", "staging")),
    "DATABASE_STAMP_INVALID",
  );
  // Same identity passes, case-insensitively.
  assert.deepEqual(verifyEnvironmentPairing("preview", "Preview"), {
    ok: true,
    environment: "preview",
  });
});

test("runtime identity resolution is explicit-only and never hostname-derived", () => {
  assert.deepEqual(resolveRuntimeEnvironment({ STELLARCORE_ENVIRONMENT: "preview" }), {
    ok: true,
    environment: "preview",
  });
  assert.deepEqual(resolveRuntimeEnvironment({ VERCEL_ENV: "preview" }), {
    ok: true,
    environment: "preview",
  });
  assert.deepEqual(resolveRuntimeEnvironment({ NODE_ENV: "test" }), {
    ok: true,
    environment: "test",
  });
  assert.equal(
    verdictCode(resolveRuntimeEnvironment({})),
    "RUNTIME_ENVIRONMENT_MISSING",
  );
  assert.equal(
    verdictCode(resolveRuntimeEnvironment({ STELLARCORE_ENVIRONMENT: "prod" })),
    "RUNTIME_ENVIRONMENT_INVALID",
  );
  assert.equal(
    resolveRuntimeEnvironment({ STELLARCORE_ENVIRONMENT: "PRODUCTION" }).ok,
    true,
  );
});

test("test and ci runtimes are allowed only with matching isolated database identities", () => {
  assert.equal(isEnvironmentPairingAllowed("test", "test"), true);
  assert.equal(isEnvironmentPairingAllowed("ci", "ci"), true);
  assert.equal(isEnvironmentPairingAllowed("test", "production"), false);
  assert.equal(isEnvironmentPairingAllowed("ci", "production"), false);
});

test("guard failures are bounded and secret-free even when URLs leak into inputs", () => {
  const error = new EnvironmentIsolationError(
    "ENVIRONMENT_MISMATCH",
    "preview",
    "production",
  );
  const message = error.message;
  assert.match(message, /ENVIRONMENT_MISMATCH/);
  assert.match(message, /runtime=preview/);
  assert.match(message, /database=production/);
  assert.doesNotMatch(message, /postgres/i);
  assert.doesNotMatch(message, /password/i);
  assert.doesNotMatch(message, /@/);
});

test("stamp verification fails closed without a database stamp and never falls back", async () => {
  resetEnvironmentGuardCacheForTests();
  const previous = TEST_ENV.STELLARCORE_ENVIRONMENT;
  TEST_ENV.STELLARCORE_ENVIRONMENT = "test";
  const failingClient = {
    $queryRaw: async () => {
      const error = new Error("relation does not exist") as Error & { code?: string };
      error.code = "42P01";
      throw error;
    },
  };

  await assert.rejects(
    () =>
      assertDatabaseEnvironmentMatchesRuntime(failingClient as never),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentIsolationError);
      assert.equal(error.code, "DATABASE_STAMP_MISSING");
      // The raw driver message must not leak into the guard error.
      assert.doesNotMatch(error.message, /relation does not exist/);
      return true;
    },
  );
  if (previous === undefined) delete TEST_ENV.STELLARCORE_ENVIRONMENT;
  else TEST_ENV.STELLARCORE_ENVIRONMENT = previous;
});

test("stamp verification passes once and caches the verified pairing", async () => {
  resetEnvironmentGuardCacheForTests();
  const previous = TEST_ENV.STELLARCORE_ENVIRONMENT;
  TEST_ENV.STELLARCORE_ENVIRONMENT = "test";
  let reads = 0;
  const client = {
    $queryRaw: async () => {
      reads += 1;
      return [{ environment: "test" }];
    },
  };

  const first = await assertDatabaseEnvironmentMatchesRuntime(client as never);
  const second = await assertDatabaseEnvironmentMatchesRuntime(client as never);
  assert.equal(first.databaseEnvironment, "test");
  assert.equal(second.databaseEnvironment, "test");
  assert.equal(reads, 1, "verification must be cached after the first pass");
  resetEnvironmentGuardCacheForTests();
  if (previous === undefined) delete TEST_ENV.STELLARCORE_ENVIRONMENT;
  else TEST_ENV.STELLARCORE_ENVIRONMENT = previous;
});

test("mismatched stamps throw a typed isolation error", async () => {
  resetEnvironmentGuardCacheForTests();
  const previous = TEST_ENV.STELLARCORE_ENVIRONMENT;
  TEST_ENV.STELLARCORE_ENVIRONMENT = "test";
  const client = {
    $queryRaw: async () => [{ environment: "production" }],
  };

  await assert.rejects(
    () => assertDatabaseEnvironmentMatchesRuntime(client as never),
    (error: unknown) => {
      assert.ok(error instanceof EnvironmentIsolationError);
      assert.equal(error.code, "ENVIRONMENT_MISMATCH");
      assert.equal(error.databaseEnvironment, "production");
      return true;
    },
  );
  resetEnvironmentGuardCacheForTests();
  if (previous === undefined) delete TEST_ENV.STELLARCORE_ENVIRONMENT;
  else TEST_ENV.STELLARCORE_ENVIRONMENT = previous;
});

test("preview deployments cannot claim production environment or freshness (#381)", () => {
  // Missing environment identity fails safely rather than defaulting to production
  const missingResult = resolveRuntimeEnvironment({});
  assert.equal(missingResult.ok, false);
  if (!missingResult.ok) {
    assert.equal(missingResult.code, "RUNTIME_ENVIRONMENT_MISSING");
  }

  // Preview environment is never paired with production database or claimed as production
  assert.equal(isEnvironmentPairingAllowed("preview", "production"), false);
  assert.equal(isEnvironmentPairingAllowed("test", "production"), false);
  assert.equal(isEnvironmentPairingAllowed("production", "preview"), false);

  const pairingVerdict = verifyEnvironmentPairing("preview", "production");
  assert.equal(pairingVerdict.ok, false);
  if (!pairingVerdict.ok) {
    assert.equal(pairingVerdict.code, "ENVIRONMENT_MISMATCH");
  }
});

