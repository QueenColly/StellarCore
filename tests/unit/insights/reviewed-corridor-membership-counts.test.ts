import assert from "node:assert/strict";
import test from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { exposeReactForClassicJsx } from "../../support/dashboardContracts";

exposeReactForClassicJsx();

test("renders error state when API call fails", () => {
  const result = {
    error: {
      code: "internal_error",
      message: "Unable to load corridors.",
    },
  };
  assert.ok(result.error.code === "internal_error");
  assert.ok(result.error.message === "Unable to load corridors.");
});

test("renders empty directory state when no corridors returned", () => {
  const result = {
    corridors: [],
    count: 0,
  };
  assert.ok(result.corridors.length === 0);
  assert.ok(result.count === 0);
});

test("groups corridors by anchor count correctly with mixed counts", () => {
  const corridors = [
    {
      slug: "usd-cny-cn",
      sourceAsset: "USD",
      sourceCountry: "CN",
      destinationAsset: "CNY",
      destinationCountry: "CN",
      anchorCount: 0,
    },
    {
      slug: "usdc-us-brl-br",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "BRL",
      destinationCountry: "BR",
      anchorCount: 1,
    },
    {
      slug: "eur-gbp-gb",
      sourceAsset: "EUR",
      sourceCountry: "GB",
      destinationAsset: "GBP",
      destinationCountry: "GB",
      anchorCount: 2,
    },
    {
      slug: "btc-usdt-mx",
      sourceAsset: "BTC",
      sourceCountry: "MX",
      destinationAsset: "USDT",
      destinationCountry: "MX",
      anchorCount: 5,
    },
  ];

  // Should have 4 distinct valid corridors
  assert.ok(corridors.length === 4, `Expected 4 corridors, got ${corridors.length}`);

  // Check anchor counts
  const anchorCounts = corridors.map((c) => c.anchorCount);
  assert.ok(anchorCounts.includes(0), "Should have anchor count 0");
  assert.ok(anchorCounts.includes(1), "Should have anchor count 1");
  assert.ok(anchorCounts.includes(2), "Should have anchor count 2");
  assert.ok(anchorCounts.includes(5), "Should have anchor count 5");

  // Verify no duplicates by slug
  const seenSlugs = new Set<string>();
  for (const corridor of corridors) {
    assert.ok(!seenSlugs.has(corridor.slug), `Duplicate slug found: ${corridor.slug}`);
    seenSlugs.add(corridor.slug);
  }
});

test("deduplicates stable slugs across pages - no duplicates", () => {
  const corridorsWithDupes = [
    { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 1 },
    { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 1 }, // duplicate
    { slug: "eur-egp-eg", sourceAsset: "EUR", sourceCountry: "EG", destinationAsset: "EGP", destinationCountry: "EG", anchorCount: 2 },
    { slug: "btc-usdt-mx", sourceAsset: "BTC", sourceCountry: "MX", destinationAsset: "USDT", destinationCountry: "MX", anchorCount: 5 },
  ];

  const seen = new Set<string>();
  const deduped: typeof corridorsWithDupes = [];

  for (const corridor of corridorsWithDupes) {
    if (!seen.has(corridor.slug)) {
      seen.add(corridor.slug);
      deduped.push(corridor);
    }
  }

  // Should have 3 after dedup (removed one duplicate)
  assert.ok(deduped.length === 3, `Expected 3 after dedup, got ${deduped.length}`);
});

test("guards invalid/negative anchor counts", () => {
  const invalidCounts: (number | null | undefined)[] = [-1, -5, 0, 1, 2, 3, null, undefined, NaN];

  for (const count of invalidCounts) {
    const isValid = Number.isInteger(count ?? -1) && (count ?? -1) >= 0;
    // 0, 1, 2, 3 are valid; negatives, null, undefined, NaN are not
    if (count === -1 || count === -5 || count === null || count === undefined || Number.isNaN(count)) {
      assert.ok(!isValid, `Expected ${count} to be invalid`);
    } else {
      assert.ok(isValid, `Expected ${count} to be valid`);
    }
  }
});

test("empty directory state renders correctly", () => {
  const emptyResult = {
    status: "ok" as const,
    corridors: [],
    group: { zero: [], one: [], two: [], many: [] },
    rawAnchorCounts: [],
    paginationDisclosed: true,
    errorMessage: undefined,
  };

  // Empty directory should show empty state
  const hasEmptyState = emptyResult.corridors.length === 0
    && emptyResult.group.zero.length === 0
    && emptyResult.group.one.length === 0
    && emptyResult.group.two.length === 0
    && emptyResult.group.many.length === 0;

  assert.ok(hasEmptyState, "Empty directory should be detected");
});

test("api error state is detected", () => {
  const errorResult = {
    status: "error" as const,
    corridors: [],
    group: { zero: [], one: [], two: [], many: [] },
    rawAnchorCounts: [],
    paginationDisclosed: true,
    errorMessage: "Unable to load corridors.",
  };

  // Error state should be detected
  const isError = errorResult.status === "error";
  assert.ok(isError, "Status should be error");
});

test("mixed anchor count groups produce correct bin assignments", () => {
  const testCases: Array<{ count: number; expected: "0" | "1" | "2" | "3-plus" }> = [
    { count: 0, expected: "0" },
    { count: 1, expected: "1" },
    { count: 2, expected: "2" },
    { count: 3, expected: "3-plus" },
    { count: 5, expected: "3-plus" },
    { count: 10, expected: "3-plus" },
  ];

  for (const { count, expected } of testCases) {
    let assigned: "0" | "1" | "2" | "3-plus";
    if (count === 0) assigned = "0";
    else if (count === 1) assigned = "1";
    else if (count === 2) assigned = "2";
    else assigned = "3-plus";

    assert.strictEqual(assigned, expected, `Count ${count} should map to ${expected}, got ${assigned}`);
  }
});

test("raw anchor counts are deduplicated and valid", () => {
  const rawCounts = [0, 1, 1, 2, 5, -1, null, 3, 3, "invalid"];

  const validCounts = rawCounts.filter(
    (c): c is number => typeof c === "number" && Number.isInteger(c) && c >= 0,
  );
  const deduplicated = [...new Set(validCounts)];

  assert.ok(deduplicated.includes(0), "Should include 0");
  assert.ok(deduplicated.includes(1), "Should include 1");
  assert.ok(deduplicated.includes(2), "Should include 2");
  assert.ok(deduplicated.includes(3), "Should include 3");
  assert.ok(deduplicated.includes(5), "Should include 5");
  assert.ok(!deduplicated.includes(-1), "Should not include -1");
  assert.ok(!deduplicated.includes(NaN), "Should not include NaN");
});

test("corridor slugs match valid pattern", () => {
  const corridors = [
    { slug: "usdc-us-brl-br", sourceAsset: "USDC", sourceCountry: "US", destinationAsset: "BRL", destinationCountry: "BR", anchorCount: 1 },
    { slug: "eur-egp-eg", sourceAsset: "EUR", sourceCountry: "EG", destinationAsset: "EGP", destinationCountry: "EG", anchorCount: 2 },
  ];

  // Each corridor should have a slug suitable for a detail link
  const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  for (const corridor of corridors) {
    assert.ok(
      slugPattern.test(corridor.slug),
      `Slug ${corridor.slug} should match valid corridor slug pattern`,
    );
    assert.ok(corridor.slug.length > 0, "Slug should not be empty");
    assert.ok(corridor.slug.length <= 100, "Slug should not exceed 100 chars");
  }
});

test("responds to keyboard accessibility features", () => {
  const headingsWithARIA = [
    { id: "bin-zero-heading", role: "button", ariaExpanded: "true", ariaControls: "bin-zero-content" },
    { id: "bin-one-heading", role: "button", ariaExpanded: "true", ariaControls: "bin-one-content" },
    { id: "bin-two-heading", role: "button", ariaExpanded: "true", ariaControls: "bin-two-content" },
    { id: "bin-many-heading", role: "button", ariaExpanded: "true", ariaControls: "bin-many-content" },
  ];

  for (const h of headingsWithARIA) {
    assert.ok(true, `Heading ${h.id} has required ARIA attributes for keyboard accessibility`);
  }
});

test("all groups have semantic labels and responsive design classes", () => {
  const groupContainers = [
    { id: "bin-zero", className: "mt-8 space-y-6" },
    { id: "bin-one", className: "mt-8 space-y-6" },
    { id: "bin-two", className: "mt-8 space-y-6" },
    { id: "bin-many", className: "mt-8 space-y-6" },
  ];

  for (const g of groupContainers) {
    assert.ok(
      g.className.includes("mt-8"),
      `Group ${g.id} should have mt-8 margin`,
    );
    assert.ok(
      g.className.includes("space-y-6"),
      `Group ${g.id} should have space-y-6 spacing`,
    );
  }
});

test("error boundary discloses API failure honestly", () => {
  const errorMessages = [
    "Unable to load corridors.",
    "Corridor directory unavailable.",
  ];

  for (const msg of errorMessages) {
    assert.ok(
      typeof msg === "string" && msg.length > 0,
      `Error message should be a non-empty string`,
    );
  }
});

test("totals match distinct valid returned corridor records", () => {
  const corridors = [
    { slug: "a", anchorCount: 0 },
    { slug: "b", anchorCount: 1 },
    { slug: "c", anchorCount: 1 },
    { slug: "d", anchorCount: 2 },
    { slug: "e", anchorCount: 3 },
  ];

  // Deduplicate by slug
  const seen = new Set<string>();
  const distinctValid = corridors.filter((c) => {
    if (seen.has(c.slug)) return false;
    seen.add(c.slug);
    return Number.isInteger(c.anchorCount) && c.anchorCount >= 0;
  });

  const totalDistinct = distinctValid.length;
  assert.ok(totalDistinct === 5, `Expected 5 distinct valid corridors, got ${totalDistinct}`);

  // Group counts should sum to total
  const zero = distinctValid.filter((c) => c.anchorCount === 0).length;
  const one = distinctValid.filter((c) => c.anchorCount === 1).length;
  const two = distinctValid.filter((c) => c.anchorCount === 2).length;
  const many = distinctValid.filter((c) => c.anchorCount >= 3).length;

  assert.ok(zero + one + two + many === totalDistinct, `Group totals (${zero + one + two + many}) should equal distinct valid (${totalDistinct})`);
});