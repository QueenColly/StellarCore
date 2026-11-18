import assert from "node:assert/strict";
import test from "node:test";

import {
  canonicalizeHostname,
  areHostnamesEquivalent,
  HostnameValidationError,
} from "@/lib/stellar/hostnameCanonicalization";
import { validateAnchorRegistry } from "@/lib/stellar/anchorRegistry";

test("canonicalizeHostname: normalizes lowercase and strips trailing dots", () => {
  assert.equal(canonicalizeHostname("EXAMPLE.COM"), "example.com");
  assert.equal(canonicalizeHostname("example.com."), "example.com");
  assert.equal(canonicalizeHostname("EXAMPLE.COM..."), "example.com");
  assert.equal(canonicalizeHostname("SUB.DOMAIN.EXAMPLE.ORG."), "sub.domain.example.org");
});

test("canonicalizeHostname: handles IDNA / punycode correctly", () => {
  // German umlaut: münchen.de -> xn--mnchen-3ya.de
  const canonical = canonicalizeHostname("münchen.de");
  assert.equal(canonical, "xn--mnchen-3ya.de");

  // Punycode directly resolves to identical canonical representation
  assert.equal(canonicalizeHostname("xn--mnchen-3ya.de"), "xn--mnchen-3ya.de");
  assert.equal(areHostnamesEquivalent("MÜNCHEN.DE.", "xn--mnchen-3ya.de"), true);
});

test("canonicalizeHostname: rejects invalid or ambiguous hostnames", () => {
  // Empty or whitespace
  assert.throws(
    () => canonicalizeHostname(""),
    HostnameValidationError,
  );
  assert.throws(
    () => canonicalizeHostname("   "),
    HostnameValidationError,
  );

  // Consecutive dots (empty labels)
  assert.throws(
    () => canonicalizeHostname("foo..bar.com"),
    HostnameValidationError,
  );

  // Whitespace and control chars
  assert.throws(
    () => canonicalizeHostname("foo bar.com"),
    HostnameValidationError,
  );

  // Leading / trailing hyphens in label
  assert.throws(
    () => canonicalizeHostname("-example.com"),
    HostnameValidationError,
  );
  assert.throws(
    () => canonicalizeHostname("example-.com"),
    HostnameValidationError,
  );

  // Single label (no TLD)
  assert.throws(
    () => canonicalizeHostname("localhost"),
    HostnameValidationError,
  );
});

test("canonicalizeHostname: enforces label and total length limits", () => {
  const longLabel = "a".repeat(64);
  assert.throws(
    () => canonicalizeHostname(`${longLabel}.com`),
    (err: unknown) => err instanceof HostnameValidationError && err.code === "LABEL_TOO_LONG",
  );

  const maxValidLabel = "a".repeat(63);
  assert.equal(canonicalizeHostname(`${maxValidLabel}.com`), `${maxValidLabel}.com`);
});

test("validateAnchorRegistry: detects duplicates across case, trailing dots, and IDN variants", () => {
  const entries = [
    {
      slug: "anchor-one",
      name: "Anchor One",
      homeDomain: "example.com",
    },
    {
      slug: "anchor-two",
      name: "Anchor Two",
      homeDomain: "EXAMPLE.COM.", // Same domain with uppercase and trailing dot
    },
  ];

  assert.throws(
    () => validateAnchorRegistry(entries),
    /Duplicate anchor home domain: "EXAMPLE\.COM\."/,
  );
});

test("validateAnchorRegistry: detects duplicates across Unicode and punycode forms", () => {
  const entries = [
    {
      slug: "anchor-de",
      name: "Anchor DE",
      homeDomain: "xn--mnchen-3ya.de",
    },
    {
      slug: "anchor-de-unicode",
      name: "Anchor DE Unicode",
      homeDomain: "münchen.de",
    },
  ];

  assert.throws(
    () => validateAnchorRegistry(entries),
    /Duplicate anchor home domain: "münchen\.de"/,
  );
});


test("canonicalizeHostname: rejects mixed-script confusables in Unicode and punycode forms", () => {
  const confusable = "pаypal.com"; // Cyrillic small a in an otherwise Latin label.
  assert.throws(
    () => canonicalizeHostname(confusable),
    (err: unknown) =>
      err instanceof HostnameValidationError &&
      err.code === "AMBIGUOUS_UNICODE",
  );

  const punycode = new URL(`https://${confusable}`).hostname;
  assert.throws(
    () => canonicalizeHostname(punycode),
    (err: unknown) =>
      err instanceof HostnameValidationError &&
      err.code === "AMBIGUOUS_UNICODE",
  );
});
