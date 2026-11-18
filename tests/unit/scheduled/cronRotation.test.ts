import assert from "node:assert/strict";
import test from "node:test";

import {
  CronRotationConfigurationError,
  hasValidCronAuthorization,
  resolveCronRotation,
} from "@/lib/scheduled/cronAuth";
import { getScheduledRefreshResponse } from "@/lib/scheduled/http";

const PRIMARY = "primary-cron-secret";
const PREVIOUS = "previous-cron-secret";

// Fixed instants so overlap decisions are deterministic.
const BEFORE_WINDOW = new Date("2026-09-15T00:00:00.000Z").getTime();
const AFTER_WINDOW = new Date("2026-10-15T00:00:00.000Z").getTime();
const ROTATION_UNTIL = "2026-10-01T00:00:00.000Z";

function withOverlap(now: number): () => number {
  return () => now;
}

test("the current primary secret authenticates normally", () => {
  assert.equal(
    hasValidCronAuthorization(`Bearer ${PRIMARY}`, PRIMARY, undefined, undefined),
    true,
  );
  assert.equal(
    hasValidCronAuthorization(
      `Bearer ${PRIMARY}`,
      PRIMARY,
      PREVIOUS,
      ROTATION_UNTIL,
      withOverlap(BEFORE_WINDOW),
    ),
    true,
  );
});

test("the previous secret authenticates only during an explicitly enabled overlap", () => {
  const active = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    PREVIOUS,
    ROTATION_UNTIL,
    withOverlap(BEFORE_WINDOW),
  );
  assert.equal(active, true);

  // Previous secret configured without a deadline must never authenticate.
  const withoutDeadline = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    PREVIOUS,
    undefined,
  );
  assert.equal(withoutDeadline, false);

  // No previous slot at all must never authenticate.
  const withoutSlot = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    undefined,
    undefined,
  );
  assert.equal(withoutSlot, false);
});

test("the old secret stops working immediately once the overlap window expires", () => {
  const expired = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    PREVIOUS,
    ROTATION_UNTIL,
    withOverlap(AFTER_WINDOW),
  );
  assert.equal(expired, false);

  // Exactly at the deadline the overlap is already closed (strict inequality).
  const atDeadline = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    PREVIOUS,
    ROTATION_UNTIL,
    withOverlap(new Date(ROTATION_UNTIL).getTime()),
  );
  assert.equal(atDeadline, false);

  // Revocation is isolated: removing the rotation configuration revokes the
  // old secret on the next request while the primary keeps working.
  const revoked = hasValidCronAuthorization(
    `Bearer ${PREVIOUS}`,
    PRIMARY,
    undefined,
    undefined,
  );
  assert.equal(revoked, false);
  assert.equal(
    hasValidCronAuthorization(`Bearer ${PRIMARY}`, PRIMARY, undefined, undefined),
    true,
  );
});

test("removing the previous secret revokes it even with a rotation deadline present", () => {
  // A stale deadline alone must not open a door for a removed slot.
  assert.equal(
    hasValidCronAuthorization(
      `Bearer ${PREVIOUS}`,
      PRIMARY,
      undefined,
      ROTATION_UNTIL,
      withOverlap(BEFORE_WINDOW),
    ),
    false,
  );
});

test("duplicate, blank, and malformed configurations fail closed", () => {
  // Duplicate values must never authenticate on either slot.
  assert.equal(
    hasValidCronAuthorization(
      `Bearer ${PRIMARY}`,
      PRIMARY,
      PRIMARY,
      ROTATION_UNTIL,
      withOverlap(BEFORE_WINDOW),
    ),
    false,
  );

  // Blank previous values are treated as unset, never as a wildcard.
  assert.equal(
    hasValidCronAuthorization(
      `Bearer ${PRIMARY}`,
      PRIMARY,
      "   ",
      ROTATION_UNTIL,
      withOverlap(BEFORE_WINDOW),
    ),
    true,
  );
  assert.equal(
    hasValidCronAuthorization(`Bearer ${PREVIOUS}`, PRIMARY, "   ", ROTATION_UNTIL),
    false,
  );

  // Blank primary disables authentication entirely.
  assert.equal(hasValidCronAuthorization(`Bearer ${PRIMARY}`, "   "), false);
  assert.equal(hasValidCronAuthorization(`Bearer ${PRIMARY}`, ""), false);
  assert.equal(hasValidCronAuthorization(`Bearer ${PRIMARY}`, undefined), false);

  // Malformed deadlines reject the previous slot even inside the would-be window.
  for (const badDeadline of ["not-a-date", "", "   ", "2026-13-45T99:00:00Z"]) {
    assert.equal(
      hasValidCronAuthorization(
        `Bearer ${PREVIOUS}`,
        PRIMARY,
        PREVIOUS,
        badDeadline,
        withOverlap(BEFORE_WINDOW),
      ),
      false,
      `deadline should fail closed: ${badDeadline}`,
    );
  }

  // A deadline without a previous slot is inert, not an error state.
  assert.equal(
    hasValidCronAuthorization(
      `Bearer ${PRIMARY}`,
      PRIMARY,
      undefined,
      ROTATION_UNTIL,
    ),
    true,
  );
});

test("resolveCronRotation exposes deterministic overlap state with stable error codes", () => {
  const active = resolveCronRotation(
    { primarySecret: PRIMARY, previousSecret: PREVIOUS, rotationUntil: ROTATION_UNTIL },
    withOverlap(BEFORE_WINDOW),
  );
  assert.equal(active.overlapActive, true);
  assert.equal(active.previous, PREVIOUS);
  assert.equal(active.rotationUntil?.toISOString(), ROTATION_UNTIL);

  const expired = resolveCronRotation(
    { primarySecret: PRIMARY, previousSecret: PREVIOUS, rotationUntil: ROTATION_UNTIL },
    withOverlap(AFTER_WINDOW),
  );
  assert.equal(expired.overlapActive, false);
  // The slot remains visible for observability even after expiry.
  assert.equal(expired.previous, PREVIOUS);

  assert.throws(
    () => resolveCronRotation(
      { primarySecret: undefined, previousSecret: undefined, rotationUntil: undefined },
    ),
    (error) =>
      error instanceof CronRotationConfigurationError &&
      error.code === "MISSING_PRIMARY_SECRET",
  );

  assert.throws(
    () => resolveCronRotation(
      { primarySecret: PRIMARY, previousSecret: PRIMARY, rotationUntil: ROTATION_UNTIL },
    ),
    (error) =>
      error instanceof CronRotationConfigurationError &&
      error.code === "DUPLICATE_ROTATION_SECRET",
  );

  assert.throws(
    () => resolveCronRotation(
      { primarySecret: PRIMARY, previousSecret: PREVIOUS, rotationUntil: "nope" },
    ),
    (error) =>
      error instanceof CronRotationConfigurationError &&
      error.code === "INVALID_ROTATION_TIMESTAMP",
  );

  // Previous secret without any deadline is an incomplete rotation.
  assert.throws(
    () => resolveCronRotation(
      { primarySecret: PRIMARY, previousSecret: PREVIOUS, rotationUntil: undefined },
    ),
    (error) =>
      error instanceof CronRotationConfigurationError &&
      error.code === "INVALID_ROTATION_TIMESTAMP",
  );
});

test("verification remains timing-safe through the shared digest comparison", () => {
  // Comparison happens on SHA-256 digests via timingSafeEqual for both slots;
  // a wrong-length bearer value still exercises the same constant-time path.
  assert.equal(hasValidCronAuthorization("Bearer short", PRIMARY), false);
  assert.equal(hasValidCronAuthorization(`Bearer ${PRIMARY} `, PRIMARY), false);
  assert.equal(hasValidCronAuthorization("bearer primary-cron-secret", PRIMARY), false);
  assert.equal(hasValidCronAuthorization(null, PRIMARY), false);
  assert.equal(hasValidCronAuthorization("", PRIMARY), false);
});

test("the HTTP boundary accepts both slots during overlap and rejects after revocation", async () => {
  const request = (secret: string) =>
    new Request("http://localhost/api/internal/cron/refresh", {
      headers: { authorization: `Bearer ${secret}` },
    });

  const overlapResponse = await getScheduledRefreshResponse(request(PREVIOUS), {
    cronSecret: PRIMARY,
    cronPreviousSecret: PREVIOUS,
    cronRotationUntil: ROTATION_UNTIL,
    cronNow: withOverlap(BEFORE_WINDOW),
    run: async () => successfulRun(),
  });
  assert.equal(overlapResponse.status, 200);

  const revokedResponse = await getScheduledRefreshResponse(request(PREVIOUS), {
    cronSecret: PRIMARY,
    cronPreviousSecret: PREVIOUS,
    cronRotationUntil: ROTATION_UNTIL,
    cronNow: withOverlap(AFTER_WINDOW),
    run: async () => successfulRun(),
  });
  assert.equal(revokedResponse.status, 401);
  assert.equal(revokedResponse.headers.get("cache-control"), "no-store");

  const primaryResponse = await getScheduledRefreshResponse(request(PRIMARY), {
    cronSecret: PRIMARY,
    cronPreviousSecret: PREVIOUS,
    cronRotationUntil: ROTATION_UNTIL,
    cronNow: withOverlap(AFTER_WINDOW),
    run: async () => successfulRun(),
  });
  assert.equal(primaryResponse.status, 200);

  // Misconfigured rotation fails closed at the boundary too.
  const misconfigured = await getScheduledRefreshResponse(request(PREVIOUS), {
    cronSecret: PRIMARY,
    cronPreviousSecret: PREVIOUS,
    cronRotationUntil: "not-a-date",
    run: async () => successfulRun(),
  });
  assert.equal(misconfigured.status, 401);
});

test("rotation errors and boundary responses never surface secret values", async () => {
  const sentinel = "super-secret-cron-value";

  let thrown: unknown;
  try {
    resolveCronRotation({
      primarySecret: sentinel,
      previousSecret: sentinel,
      rotationUntil: ROTATION_UNTIL,
    });
  } catch (error) {
    thrown = error;
  }

  assert.ok(thrown instanceof CronRotationConfigurationError);
  const serialized = JSON.stringify(thrown) + String(thrown);
  assert.equal(serialized.includes(sentinel), false);

  const response = await getScheduledRefreshResponse(
    new Request("http://localhost/api/internal/cron/refresh", {
      headers: { authorization: `Bearer wrong` },
    }),
    {
      cronSecret: sentinel,
      cronPreviousSecret: "other-secret-value",
      cronRotationUntil: ROTATION_UNTIL,
      run: async () => successfulRun(),
    },
  );
  const body = await response.text();
  assert.equal(body.includes(sentinel), false);
  assert.equal(body.includes("other-secret-value"), false);
  assert.equal(response.status, 401);
});

function successfulRun() {
  return Object.freeze({
    ok: true,
    runId: "test-run-id",
    startedAt: "2026-09-15T00:00:00.000Z",
    completedAt: "2026-09-15T00:00:01.000Z",
    attempt: 1,
    rates: Object.freeze({ attempted: 1, succeeded: 1, failed: 0, skipped: 0, failures: [] }),
    reputation: Object.freeze({ attempted: 3, succeeded: 3, failed: 0, failures: [] }),
  });
}
