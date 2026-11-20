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

test("canonicalizeHostname: normalizes equivalent Unicode and punycode forms consistently", () => {
  const equivalents: [string, string, string][] = [
    ["münchen.de", "xn--mnchen-3ya.de", "xn--mnchen-3ya.de"],
    ["MÜNCHEN.DE", "XN--MNCHEN-3YA.DE", "xn--mnchen-3ya.de"],
    ["münchen.de.", "xn--mnchen-3ya.de.", "xn--mnchen-3ya.de"],
    ["café.fr", "xn--caf-dma.fr", "xn--caf-dma.fr"],
    ["CAFÉ.FR.", "XN--CAF-DMA.FR.", "xn--caf-dma.fr"],
    ["東京.jp", "xn--1lqs71d.jp", "xn--1lqs71d.jp"],
    ["TŌKYŌ.JP", "xn--tky-qxac.jp", "xn--tky-qxac.jp"],
    ["ñandú.uy", "xn--and-6ma2c.uy", "xn--and-6ma2c.uy"],
    ["рф.ru", "xn--p1ai.ru", "xn--p1ai.ru"],
    ["sub.münchen.de", "sub.xn--mnchen-3ya.de", "sub.xn--mnchen-3ya.de"],
  ];

  for (const [unicodeForm, punycodeForm, expectedCanonical] of equivalents) {
    const canonicalUnicode = canonicalizeHostname(unicodeForm);
    const canonicalPunycode = canonicalizeHostname(punycodeForm);

    assert.equal(canonicalUnicode, expectedCanonical);
    assert.equal(canonicalPunycode, expectedCanonical);
    assert.equal(areHostnamesEquivalent(unicodeForm, punycodeForm), true);
  }
});

test("canonicalizeHostname: rejects invalid label and hostname forms", () => {
  const malformedInputs = [
    "",
    "   ",
    "foo..bar.com",
    "..example.com",
    "-example.com",
    "example-.com",
    "sub.-example.com",
    "sub.example-.com",
    "foo bar.com",
    "foo\tbar.com",
    "foo\nbar.com",
    "foo\x00bar.com",
    "foo@bar.com",
    "foo:bar.com",
    "localhost",
    "singlelabel",
    "example.c",
    "example.123",
    "example.c0m",
    "xn--.com",
    "xn---.com",
  ];

  for (const input of malformedInputs) {
    assert.throws(
      () => canonicalizeHostname(input),
      HostnameValidationError,
    );
  }
});

test("canonicalizeHostname: rejects disallowed schemes, ports, and IP literals without broadening network rules", () => {
  const disallowedTargetInputs = [
    "http://example.com",
    "https://example.com",
    "ftp://example.com",
    "file:///etc/passwd",
    "example.com:80",
    "example.com:443",
    "example.com:8080",
    "user:pass@example.com",
    "127.0.0.1",
    "10.0.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "::1",
    "[::1]",
    "fe80::1",
    "0.0.0.0",
  ];

  for (const input of disallowedTargetInputs) {
    assert.throws(
      () => canonicalizeHostname(input),
      HostnameValidationError,
    );
  }
});

test("canonicalizeHostname: error messages do not expose unrelated configuration secrets", () => {
  const secretKey = "CRITICAL_INTERNAL_DB_PASSWORD_SHOULD_NEVER_BE_PRESENT";
  const inputsTriggeringVariousErrors = [
    "bad..invalid.com",
    "bad-label-.invalid.com",
    "-badlabel.invalid.com",
    "bad label.invalid.com",
    "bad\tlabel.invalid.com",
    "invalid",
    "xn--invalid-punycode-!!!.com",
  ];

  for (const input of inputsTriggeringVariousErrors) {
    try {
      canonicalizeHostname(input);
      assert.fail(`Expected canonicalizeHostname to throw for input: ${input}`);
    } catch (err: unknown) {
      assert(err instanceof HostnameValidationError);
      assert.equal(err.message.includes(secretKey), false);
      assert.doesNotMatch(err.message, /process\.env|DATABASE_URL|SECRET|API_KEY|PRIVATE_KEY|STELLAR_/i);
    }
  }
});
