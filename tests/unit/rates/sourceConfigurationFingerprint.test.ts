import assert from "node:assert/strict";
import test from "node:test";

import {
  RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS,
  RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION,
  computeRateSourceConfigurationFingerprint,
} from "@/lib/rates/sourceConfigurationFingerprint";
import type { ReviewedLiveRateSource } from "@/types/liveRateSource";

const SOURCE: ReviewedLiveRateSource = Object.freeze({
  anchorSlug: "zeam",
  corridorSlug: "usdc-us-brl-br",
  sellAsset: "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
  buyAsset: "iso4217:BRL",
  sellAmount: "100",
  buyDeliveryMethod: "PIX",
  countryCode: "BR",
  context: "sep31",
});

test("digest format is 64 lowercase hex characters with an explicit version (#331)", () => {
  const digest = computeRateSourceConfigurationFingerprint(SOURCE);
  assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(
    RATE_SOURCE_CONFIGURATION_FINGERPRINT_VERSION,
    "stellarcore-rate-source-config-v1",
  );
});

test("equivalent configurations fingerprint identically regardless of key order (#331)", () => {
  const reordered = Object.freeze({
    context: "sep31",
    countryCode: "BR",
    buyDeliveryMethod: "PIX",
    sellAmount: "100",
    buyAsset: "iso4217:BRL",
    sellAsset: "stellar:USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    corridorSlug: "usdc-us-brl-br",
    anchorSlug: "zeam",
  }) as ReviewedLiveRateSource;

  assert.equal(
    computeRateSourceConfigurationFingerprint(SOURCE),
    computeRateSourceConfigurationFingerprint(reordered),
  );
});

test("absent and undefined optional fields are the same configuration (#331)", () => {
  const minimal: ReviewedLiveRateSource = Object.freeze({
    anchorSlug: "zeam",
    corridorSlug: "usdc-us-brl-br",
    sellAsset: SOURCE.sellAsset,
    buyAsset: SOURCE.buyAsset,
    sellAmount: "100",
    context: "sep31",
  });
  const withUndefined = {
    ...minimal,
    buyDeliveryMethod: undefined,
    countryCode: undefined,
  } as ReviewedLiveRateSource;

  assert.equal(
    computeRateSourceConfigurationFingerprint(minimal),
    computeRateSourceConfigurationFingerprint(withUndefined),
  );
  assert.notEqual(
    computeRateSourceConfigurationFingerprint(minimal),
    computeRateSourceConfigurationFingerprint(SOURCE),
  );
});

test("changing any meaningful reviewed field changes the digest (#331)", () => {
  const baseline = computeRateSourceConfigurationFingerprint(SOURCE);
  const mutations: readonly ReviewedLiveRateSource[] = [
    { ...SOURCE, anchorSlug: "moneygram" },
    { ...SOURCE, corridorSlug: "usdc-us-ngn-ng" },
    { ...SOURCE, sellAsset: "stellar:USDC:GOTHERISSUER" },
    { ...SOURCE, buyAsset: "iso4217:NGN" },
    { ...SOURCE, sellAmount: "1000" },
    { ...SOURCE, buyDeliveryMethod: "BANK" },
    { ...SOURCE, countryCode: "NG" },
    { ...SOURCE, context: "sep6" },
  ];

  const digests = mutations.map(computeRateSourceConfigurationFingerprint);
  for (const digest of digests) {
    assert.match(digest, /^[0-9a-f]{64}$/);
    assert.notEqual(digest, baseline);
  }
  assert.equal(new Set(digests).size, digests.length);
});

test("secrets and volatile runtime fields never enter the fingerprint input (#331)", () => {
  const polluted = {
    ...SOURCE,
    // Secret-shaped and volatile fields must be ignored entirely: the helper
    // reads only the documented allowlist.
    apiKey: "super-secret-token",
    authorization: "Bearer secret-token",
    privateKey: "SECRETKEY",
    quoteServer: "https://anchor.zeam.money/sep38",
    timeoutMs: 30_000,
    retries: 3,
    capturedAt: "2026-10-22T00:00:00.000Z",
    headers: { authorization: "Bearer secret-token" },
    url: "https://user:pass@example.com/path?token=secret",
  } as unknown as ReviewedLiveRateSource;

  const clean = computeRateSourceConfigurationFingerprint(SOURCE);
  assert.equal(computeRateSourceConfigurationFingerprint(polluted), clean);
  assert.equal(JSON.stringify(polluted).includes("secret-token"), true);
  assert.equal(clean.includes("secret"), false);
});

test("the documented allowlist is exactly the reviewed field set (#331)", () => {
  assert.deepEqual([...RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS], [
    "anchorSlug",
    "buyAsset",
    "buyDeliveryMethod",
    "context",
    "corridorSlug",
    "countryCode",
    "sellAmount",
    "sellAsset",
  ]);
  assert.deepEqual(
    [...RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS].sort(),
    [...RATE_SOURCE_CONFIGURATION_FINGERPRINT_FIELDS],
  );
});
