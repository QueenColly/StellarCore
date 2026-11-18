import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRuntimeConfig,
  assertRuntimeConfig,
  createTestRuntimeConfig,
  isRuntimeConfigOk,
  isRuntimeConfigError,
  type RuntimeConfig,
  type RuntimeConfigError,
  RuntimeConfigValidationError,
} from "@/lib/config/runtimeConfig";

// Base environment with all optional properties
const baseEnv: Record<string, string | undefined> = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/db",
  CRON_SECRET: "test-secret",
  STELLARCORE_ENVIRONMENT: "development",
  NODE_ENV: "development",
  VERCEL_ENV: undefined,
  RATE_FRESHNESS_THRESHOLD_MS: undefined,
  MIN_FRESH_SOURCES: undefined,
};

function okResult(result: RuntimeConfigError | { ok: true; config: RuntimeConfig }): asserts result is { ok: true; config: RuntimeConfig } {
  assert.equal(result.ok, true);
}

function errorResult(
  result: RuntimeConfigError | { ok: true; config: RuntimeConfig },
  expectedCode: RuntimeConfigError["code"],
): asserts result is RuntimeConfigError & { code: typeof expectedCode } {
  assert.equal(result.ok, false);
  assert.equal(result.code, expectedCode);
}

test("lib/config/runtimeConfig - validateRuntimeConfig", async () => {
  await test("accepts valid development config", () => {
    const result = validateRuntimeConfig(baseEnv);
    okResult(result);
    assert.equal(result.config.environment, "development");
    assert.equal(result.config.databaseUrl, baseEnv.DATABASE_URL);
    assert.equal(result.config.cronSecret, baseEnv.CRON_SECRET);
    assert.equal(result.config.environmentSource, "explicit-env");
  });

  await test("accepts valid production config with CRON_SECRET", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production" };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.environment, "production");
    assert.equal(result.config.cronSecret, "test-secret");
  });

  await test("accepts valid preview config without CRON_SECRET", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "preview", CRON_SECRET: undefined };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.environment, "preview");
    assert.equal(result.config.cronSecret, undefined);
  });

  await test("accepts valid ci config with DATABASE_URL but no CRON_SECRET", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "ci", CRON_SECRET: undefined };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.environment, "ci");
  });

  await test("rejects missing STELLARCORE_ENVIRONMENT when not on Vercel or test", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: undefined, VERCEL_ENV: undefined, NODE_ENV: undefined };
    const result = validateRuntimeConfig(env);
    errorResult(result, "MISSING_RUNTIME_ENVIRONMENT");
  });

  await test("accepts test environment from NODE_ENV=test", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: undefined, VERCEL_ENV: undefined, NODE_ENV: "test" };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.environment, "test");
    assert.equal(result.config.environmentSource, "test-default");
  });

  await test("allows test config without DATABASE_URL until database functionality is used", () => {
    const env = {
      ...baseEnv,
      STELLARCORE_ENVIRONMENT: undefined,
      VERCEL_ENV: undefined,
      NODE_ENV: "test",
      DATABASE_URL: undefined,
    };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.databaseUrl, undefined);
  });

  await test("rejects invalid STELLARCORE_ENVIRONMENT value", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "invalid" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "RUNTIME_ENVIRONMENT_INVALID");
    if (result.code === "RUNTIME_ENVIRONMENT_INVALID") {
      assert.equal(result.environment, "invalid");
    }
  });

  await test("rejects missing DATABASE_URL in production", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", DATABASE_URL: undefined };
    const result = validateRuntimeConfig(env);
    errorResult(result, "MISSING_REQUIRED");
    if (result.code === "MISSING_REQUIRED") {
      assert.equal(result.variable, "DATABASE_URL");
      assert.equal(result.environment, "production");
    }
  });

  await test("rejects missing DATABASE_URL in preview", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "preview", DATABASE_URL: undefined, CRON_SECRET: undefined };
    const result = validateRuntimeConfig(env);
    errorResult(result, "MISSING_REQUIRED");
    if (result.code === "MISSING_REQUIRED") {
      assert.equal(result.variable, "DATABASE_URL");
      assert.equal(result.environment, "preview");
    }
  });

  await test("rejects missing CRON_SECRET in production", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: undefined };
    const result = validateRuntimeConfig(env);
    errorResult(result, "MISSING_REQUIRED");
    if (result.code === "MISSING_REQUIRED") {
      assert.equal(result.variable, "CRON_SECRET");
      assert.equal(result.environment, "production");
    }
  });

  await test("rejects invalid DATABASE_URL scheme", () => {
    const env = { ...baseEnv, DATABASE_URL: "mysql://user:pass@localhost:3306/db" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_DATABASE_URL");
    if (result.code === "INVALID_DATABASE_URL") {
      assert.equal(result.variable, "DATABASE_URL");
      assert.match(result.reason, /postgres/);
    }
  });

  await test("rejects prisma: protocol", () => {
    const env = { ...baseEnv, DATABASE_URL: "prisma://user:pass@localhost:5432/db" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_DATABASE_URL");
    if (result.code === "INVALID_DATABASE_URL") {
      assert.match(result.reason, /PrismaPg/);
    }
  });

  await test("rejects malformed DATABASE_URL", () => {
    const env = { ...baseEnv, DATABASE_URL: "not-a-url" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_DATABASE_URL");
    if (result.code === "INVALID_DATABASE_URL") {
      assert.match(result.reason, /valid URL/);
    }
  });

  await test("rejects invalid RATE_FRESHNESS_THRESHOLD_MS", () => {
    const env = { ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: "not-a-number" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_NUMERIC");
    if (result.code === "INVALID_NUMERIC") {
      assert.equal(result.variable, "RATE_FRESHNESS_THRESHOLD_MS");
      assert.match(result.reason, /positive integer/);
    }
  });

  await test("rejects zero RATE_FRESHNESS_THRESHOLD_MS", () => {
    const env = { ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: "0" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_NUMERIC");
    if (result.code === "INVALID_NUMERIC") {
      assert.match(result.reason, /positive/);
    }
  });

  await test("rejects partially numeric and fractional numeric options", () => {
    for (const value of ["120000ms", "1.5", "+2", " 2 "]) {
      const result = validateRuntimeConfig({ ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: value });
      errorResult(result, "INVALID_NUMERIC");
    }
  });

  await test("rejects negative RATE_FRESHNESS_THRESHOLD_MS", () => {
    const env = { ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: "-100" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_NUMERIC");
    if (result.code === "INVALID_NUMERIC") {
      assert.match(result.reason, /positive/);
    }
  });

  await test("rejects invalid MIN_FRESH_SOURCES", () => {
    const env = { ...baseEnv, MIN_FRESH_SOURCES: "not-a-number" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_NUMERIC");
    if (result.code === "INVALID_NUMERIC") {
      assert.equal(result.variable, "MIN_FRESH_SOURCES");
    }
  });

  await test("rejects zero MIN_FRESH_SOURCES", () => {
    const env = { ...baseEnv, MIN_FRESH_SOURCES: "0" };
    const result = validateRuntimeConfig(env);
    errorResult(result, "INVALID_NUMERIC");
    if (result.code === "INVALID_NUMERIC") {
      assert.match(result.reason, /positive|at least 1/);
    }
  });

  await test("uses default RATE_FRESHNESS_THRESHOLD_MS when not provided", () => {
    const env = { ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: undefined };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.rateFreshnessThresholdMs, 120_000);
  });

  await test("uses default MIN_FRESH_SOURCES when not provided", () => {
    const env = { ...baseEnv, MIN_FRESH_SOURCES: undefined };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.minFreshSources, 2);
  });

  await test("uses VERCEL_ENV when STELLARCORE_ENVIRONMENT not set", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: undefined, VERCEL_ENV: "preview" };
    const result = validateRuntimeConfig(env);
    okResult(result);
    assert.equal(result.config.environment, "preview");
    assert.equal(result.config.environmentSource, "vercel-env");
  });

  await test("rejects empty CRON_SECRET in production", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: "   " };
    const result = validateRuntimeConfig(env);
    errorResult(result, "MISSING_REQUIRED");
    if (result.code === "MISSING_REQUIRED") {
      assert.equal(result.variable, "CRON_SECRET");
    }
  });

  // Regression tests for missing required production environment variables (#380)
  for (const variable of ["DATABASE_URL", "CRON_SECRET"] as const) {
    await test(`rejects missing production ${variable}`, () => {
      const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", [variable]: undefined };
      const result = validateRuntimeConfig(env);
      errorResult(result, "MISSING_REQUIRED");
      if (result.code === "MISSING_REQUIRED") {
        assert.equal(result.variable, variable);
      }
    });
  }
});

test("lib/config/runtimeConfig - assertRuntimeConfig", async () => {
  await test("returns config when valid", () => {
    const config = assertRuntimeConfig(baseEnv);
    assert.equal(config.environment, "development");
    assert.equal(config.databaseUrl, baseEnv.DATABASE_URL);
  });

  await test("throws RuntimeConfigValidationError when invalid", () => {
    const env = { ...baseEnv, DATABASE_URL: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => error instanceof RuntimeConfigValidationError,
    );
  });

  await test("throws error with bounded message (no secrets)", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        assert.equal(error.name, "RuntimeConfigValidationError");
        assert.ok(!error.message.includes("test-secret"), "message should not contain secret");
        assert.ok(error.message.includes("CRON_SECRET"), "message should mention variable");
        assert.ok(error.message.includes("production"), "message should mention environment");
        return true;
      },
    );
  });

  await test("throws error with variable name for missing required", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", DATABASE_URL: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        assert.equal(error.name, "RuntimeConfigValidationError");
        assert.ok(error.message.includes("DATABASE_URL"), "message should mention variable");
        assert.ok(error.message.includes("production"), "message should mention environment");
        return true;
      },
    );
  });

  await test("throws error with reason for invalid DATABASE_URL", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", DATABASE_URL: "mysql://x" };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        assert.equal(error.name, "RuntimeConfigValidationError");
        assert.ok(error.message.includes("postgres"), "message should mention expected protocol");
        return true;
      },
    );
  });
});

test("lib/config/runtimeConfig - createTestRuntimeConfig", async () => {
  await test("creates valid test config with defaults", () => {
    const config = createTestRuntimeConfig();
    assert.equal(config.environment, "test");
    assert.equal(config.databaseUrl, "postgresql://test:test@localhost:5432/test");
    assert.equal(config.cronSecret, "test-secret");
    assert.equal(config.rateFreshnessThresholdMs, 120_000);
    assert.equal(config.minFreshSources, 2);
    assert.equal(config.environmentSource, "test-default");
  });

  await test("allows overriding environment", () => {
    const config = createTestRuntimeConfig({ environment: "production" });
    assert.equal(config.environment, "production");
  });

  await test("allows overriding databaseUrl", () => {
    const config = createTestRuntimeConfig({ databaseUrl: "postgresql://custom:custom@localhost:5432/custom" });
    assert.equal(config.databaseUrl, "postgresql://custom:custom@localhost:5432/custom");
  });

  await test("allows overriding cronSecret", () => {
    const config = createTestRuntimeConfig({ cronSecret: "custom-secret" });
    assert.equal(config.cronSecret, "custom-secret");
  });

  await test("allows overriding numeric options", () => {
    const config = createTestRuntimeConfig({
      rateFreshnessThresholdMs: 60_000,
      minFreshSources: 3,
    });
    assert.equal(config.rateFreshnessThresholdMs, 60_000);
    assert.equal(config.minFreshSources, 3);
  });

  await test("returns frozen config", () => {
    const config = createTestRuntimeConfig();
    assert.equal(Object.isFrozen(config), true);
  });
});

test("lib/config/runtimeConfig - type guards", async () => {
  await test("isRuntimeConfigOk returns true for ok result", () => {
    const result = validateRuntimeConfig(baseEnv);
    assert.equal(isRuntimeConfigOk(result), true);
  });

  await test("isRuntimeConfigOk returns false for error result", () => {
    const result = validateRuntimeConfig({ ...baseEnv, DATABASE_URL: "invalid" });
    assert.equal(isRuntimeConfigOk(result), false);
  });

  await test("isRuntimeConfigError returns true for error result", () => {
    const result = validateRuntimeConfig({ ...baseEnv, DATABASE_URL: "invalid" });
    assert.equal(isRuntimeConfigError(result), true);
  });

  await test("isRuntimeConfigError returns false for ok result", () => {
    const result = validateRuntimeConfig(baseEnv);
    assert.equal(isRuntimeConfigError(result), false);
  });
});

test("lib/config/runtimeConfig - RuntimeConfigValidationError", async () => {
  await test("has correct name", () => {
    assert.throws(
      () => assertRuntimeConfig({ ...baseEnv, DATABASE_URL: "invalid" }),
      (error: Error) => error.name === "RuntimeConfigValidationError",
    );
  });

  await test("exposes error code", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        const e = error as RuntimeConfigValidationError;
        assert.equal(e.code, "MISSING_REQUIRED");
        return true;
      },
    );
  });

  await test("exposes variable for relevant errors", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        const e = error as RuntimeConfigValidationError;
        assert.equal(e.variable, "CRON_SECRET");
        return true;
      },
    );
  });

  await test("exposes environment for relevant errors", () => {
    const env = { ...baseEnv, STELLARCORE_ENVIRONMENT: "production", CRON_SECRET: undefined };
    assert.throws(
      () => assertRuntimeConfig(env),
      (error: Error) => {
        const e = error as RuntimeConfigValidationError;
        assert.equal(e.environment, "production");
        return true;
      },
    );
  });

  await test("exposes reason for numeric errors", () => {
    assert.throws(
      () => assertRuntimeConfig({ ...baseEnv, RATE_FRESHNESS_THRESHOLD_MS: "invalid" }),
      (error: Error) => {
        const e = error as RuntimeConfigValidationError;
        assert.equal(e.reason, "must be a positive integer");
        return true;
      },
    );
  });
});
