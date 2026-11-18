import assert from "node:assert/strict";
import test from "node:test";

import { assertExportSafe } from "@/lib/export/safety";

test("assertExportSafe passes for safe primitive values", () => {
  assert.doesNotThrow(() => assertExportSafe("hello"));
  assert.doesNotThrow(() => assertExportSafe(123));
  assert.doesNotThrow(() => assertExportSafe(true));
  assert.doesNotThrow(() => assertExportSafe(null));
  assert.doesNotThrow(() => assertExportSafe(undefined));
});

test("assertExportSafe passes for safe objects without secret keys", () => {
  assert.doesNotThrow(() =>
    assertExportSafe({ name: "test", count: 5, enabled: true })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ nested: { value: "ok", another: 42 } })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ array: ["a", "b", { c: 1 }] })
  );
});

test("assertExportSafe detects secret keys at root level", () => {
  for (const key of [
    "password",
    "passwd",
    "api_key",
    "apikey",
    "secret",
    "client_secret",
    "access_token",
    "refresh_token",
    "token",
    "authorization",
    "cookie",
    "session",
    "database_url",
    "connection_string",
    "private_key",
    "signing_key",
  ]) {
    assert.throws(
      () => assertExportSafe({ [key]: "secret-value" }),
      /SECRET_DETECTED at root\./,
      `should detect secret key: ${key}`,
    );
  }
});

test("assertExportSafe detects secret keys in nested objects", () => {
  assert.throws(
    () => assertExportSafe({ config: { password: "nested-secret" } }),
    /SECRET_DETECTED at root\.config\.password/,
  );
  assert.throws(
    () => assertExportSafe({ outer: { inner: { api_key: "deep-secret" } } }),
    /SECRET_DETECTED at root\.outer\.inner\.api_key/,
  );
  assert.throws(
    () => assertExportSafe({ data: { credentials: { secret: "deep" } } }),
    /SECRET_DETECTED at root\.data\.credentials\.secret/,
  );
});

test("assertExportSafe detects secret keys in arrays", () => {
  assert.throws(
    () => assertExportSafe({ users: [{ name: "a", password: "secret" }] }),
    /SECRET_DETECTED at root\.users\[0\]\.password/,
  );
  assert.throws(
    () => assertExportSafe({ tokens: ["token1", { access_token: "secret" }] }),
    /SECRET_DETECTED at root\.tokens\[1\]\.access_token/,
  );
  assert.throws(
    () => assertExportSafe({ items: [{ nested: { client_secret: "x" } }] }),
    /SECRET_DETECTED at root\.items\[0\]\.nested\.client_secret/,
  );
});

test("assertExportSafe detects secret keys with hyphenated names (normalized to underscore)", () => {
  assert.throws(
    () => assertExportSafe({ "api-key": "value" }),
    /SECRET_DETECTED at root\.api-key/,
  );
  assert.throws(
    () => assertExportSafe({ config: { "private-key": "value" } }),
    /SECRET_DETECTED at root\.config\.private-key/,
  );
});

test("assertExportSafe detects credential URLs in string values", () => {
  assert.throws(
    () => assertExportSafe({ url: "postgresql://user:pass@host/db" }),
    /SECRET_DETECTED at root\.url/,
  );
  assert.throws(
    () => assertExportSafe({ conn: "postgres://user:secret@localhost:5432/db" }),
    /SECRET_DETECTED at root\.conn/,
  );
  assert.throws(
    () => assertExportSafe({ db: "mysql://user:pass@host/db" }),
    /SECRET_DETECTED at root\.db/,
  );
  assert.throws(
    () => assertExportSafe({ redis: "redis://:password@host:6379" }),
    /SECRET_DETECTED at root\.redis/,
  );
  assert.throws(
    () => assertExportSafe({ mongo: "mongodb://user:pass@host/db" }),
    /SECRET_DETECTED at root\.mongo/,
  );
});

test("assertExportSafe detects bearer tokens in string values", () => {
  assert.throws(
    () => assertExportSafe({ auth: "Bearer abc123" }),
    /SECRET_DETECTED at root\.auth/,
  );
  assert.throws(
    () => assertExportSafe({ header: "bearer token123==" }),
    /SECRET_DETECTED at root\.header/,
  );
});

test("assertExportSafe detects JWT tokens in string values", () => {
  assert.throws(
    () =>
      assertExportSafe({
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      }),
    /SECRET_DETECTED at root\.token/,
  );
});

test("assertExportSafe allows non-secret URLs and tokens", () => {
  assert.doesNotThrow(() =>
    assertExportSafe({ url: "https://example.com/api" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ endpoint: "https://api.example.com/v1/data" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ link: "http://localhost:3000/health" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ id: "abc123", reference: "ref-456" })
  );
});

test("assertExportSafe handles empty objects and arrays", () => {
  assert.doesNotThrow(() => assertExportSafe({}));
  assert.doesNotThrow(() => assertExportSafe([]));
  assert.doesNotThrow(() => assertExportSafe({ empty: {} }));
  assert.doesNotThrow(() => assertExportSafe({ empty: [] }));
});

test("assertExportSafe path reporting includes full nested path", () => {
  try {
    assertExportSafe({
      level1: {
        level2: {
          level3: {
            password: "secret",
          },
        },
      },
    });
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(
      error instanceof Error && error.message.includes("root.level1.level2.level3.password"),
      "path should include full nested path",
    );
  }
});

test("assertExportSafe detects multiple secret keys in same object", () => {
  let thrown = false;
  try {
    assertExportSafe({
      password: "pass",
      api_key: "key",
      secret: "secret",
    });
  } catch {
    thrown = true;
  }
  assert.ok(thrown, "should throw on first secret detected");
});

test("assertExportSafe case-insensitive key matching", () => {
  assert.throws(
    () => assertExportSafe({ PASSWORD: "secret" }),
    /SECRET_DETECTED/,
  );
  assert.throws(
    () => assertExportSafe({ Api_Key: "secret" }),
    /SECRET_DETECTED/,
  );
  assert.throws(
    () => assertExportSafe({ DATABASE_URL: "postgresql://user:pass@host/db" }),
    /SECRET_DETECTED/,
  );
});

test("assertExportSafe does not flag similar but non-secret keys", () => {
  assert.doesNotThrow(() =>
    assertExportSafe({ passphrase: "not-a-secret-key" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ passcode: "1234" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ secretive: "value" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ tokenize: "action" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ authorize: "permission" })
  );
  assert.doesNotThrow(() =>
    assertExportSafe({ database: "name" })
  );
});

test("assertExportSafe allows databaseUrl and cronSecret presence booleans in fingerprint", () => {
  // These are the boolean flags used in runtime config fingerprint
  assert.doesNotThrow(() =>
    assertExportSafe({
      secretPresence: {
        databaseUrl: true,
        cronSecret: true,
      },
    })
  );
});

test("assertExportSafe allows safe nested configuration structures", () => {
  const config = {
    environment: "production",
    rateFreshnessThresholdMs: 120000,
    minFreshSources: 2,
    reviewedConfiguration: {
      anchors: [{ slug: "anchor1", name: "Anchor 1" }],
      corridors: [{ slug: "corridor1", sourceAsset: "USDC" }],
    },
    policyIdentifiers: ["policy1", "policy2"],
  };
  assert.doesNotThrow(() => assertExportSafe(config));
});

test("assertExportSafe detects secret in deeply nested array of objects", () => {
  assert.throws(
    () =>
      assertExportSafe({
        data: {
          layers: [
            {
              items: [
                { config: { password: "deep-secret" } },
              ],
            },
          ],
        },
      }),
    /SECRET_DETECTED at root\.data\.layers\[0\]\.items\[0\]\.config\.password/,
  );
});

test("assertExportSafe throws on first secret detected in iteration order", () => {
  let path: string | null = null;
  try {
    assertExportSafe({
      a: { password: "first" },
      b: { api_key: "second" },
    });
  } catch (error) {
    if (error instanceof Error) path = error.message;
  }
  // Should detect one of them (order depends on Object.entries iteration)
  assert.ok(path !== null && path.includes("SECRET_DETECTED"));
});