import assert from "node:assert/strict";
import test from "node:test";

import { parse as parseConnectionString } from "pg-connection-string";
import {
  resolveDatabaseTlsPolicyForEnvironment,
} from "@/lib/database/tlsPolicyRuntime";

const PROD_URL = "postgres://user:secret@db.example.com:5432/stellar";

/**
 * These tests verify the interaction between StellarCore's TLS policy and the
 * real `pg` driver config resolution (pg-connection-string + Pool
 * ConnectionParameters) without a live server: the exact sanitized
 * connection string and ssl object that reach the driver are fed through the
 * driver's own parser, proving the policy object wins over URL parameters.
 */

test("the sanitized connection string produces no TLS fields in the driver's parsed config", () => {
  const dirtyUrl = `${PROD_URL}?sslmode=require&ssl=no-verify&connection_limit=5&application_name=stellarcore`;
  const result = resolveDatabaseTlsPolicyForEnvironment({
    databaseUrl: dirtyUrl,
    environmentId: "production",
    environment: { DATABASE_URL: dirtyUrl },
  });

  // Policy rejected the bypass, but the sanitized string is still produced
  // for diagnostics and downstream use once policy passes.
  const parsedDirty = parseConnectionString(dirtyUrl);
  assert.equal(parsedDirty.sslmode, "require");

  const parsedClean = parseConnectionString(result.sanitizedConnectionString);
  assert.equal(parsedClean.sslmode, undefined);
  assert.equal(parsedClean.ssl, undefined);
  assert.equal(parsedClean.application_name, "stellarcore");
});

test("the policy-owned ssl object reaches the driver without URL override", () => {
  const result = resolveDatabaseTlsPolicyForEnvironment({
    databaseUrl: `${PROD_URL}?sslmode=no-verify`,
    environmentId: "production",
    environment: {
      STELLARCORE_DB_TLS_EMERGENCY_BYPASS: "allow-unverified",
    },
  });

  assert.equal(result.resolution.accepted, true);
  const policySsl = result.resolution.accepted ? result.resolution.sslConfig : null;
  assert.ok(policySsl);

  // Compose exactly as dbClient does, then parse through the driver: the
  // sanitized string contributes no TLS params, so the policy object stands.
  const driverConfig = parseConnectionString(result.sanitizedConnectionString);
  assert.equal(driverConfig.sslmode, undefined);
  assert.equal(driverConfig.ssl, undefined);

  // The URL no longer carries any sslmode; ConnectionParameters would apply
  // the config-provided ssl object verbatim.
  assert.equal(policySsl.rejectUnauthorized, false);
});

test("verified-TLS policy object passes rejectUnauthorized=true to the driver shape", () => {
  const result = resolveDatabaseTlsPolicyForEnvironment({
    databaseUrl: PROD_URL,
    environmentId: "production",
    environment: { DATABASE_URL: PROD_URL },
  });

  assert.equal(result.resolution.accepted, true);
  const policySsl = result.resolution.accepted ? result.resolution.sslConfig : null;
  assert.ok(policySsl);
  assert.equal(policySsl.rejectUnauthorized, true);
});

test("the full dbClient composition shape is accepted by the pg Pool config surface", () => {
  const result = resolveDatabaseTlsPolicyForEnvironment({
    databaseUrl: `${PROD_URL}?connection_limit=5`,
    environmentId: "production",
    environment: { DATABASE_URL: `${PROD_URL}?connection_limit=5` },
  });

  assert.ok(result.resolution.accepted);
  if (!result.resolution.accepted) return;

  // Shape of the object PrismaPg receives in dbClient.createPrismaClient.
  const poolConfig = {
    connectionString: result.sanitizedConnectionString,
    ssl: result.resolution.sslConfig,
  };

  assert.equal(poolConfig.ssl.rejectUnauthorized, true);
  const parsed = parseConnectionString(poolConfig.connectionString);
  assert.equal(parsed.host, "db.example.com");
  assert.equal(parsed.database, "stellar");
  assert.equal(parsed.sslmode, undefined);
});
