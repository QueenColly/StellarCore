import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGeographyIndex,
  getCountryDisplayName,
  parseCorridorsResponse,
} from "@/app/insights/reviewed-geography/geography";
import type { PublicCorridor } from "@/types/api/corridors";

test("getCountryDisplayName returns controlled mapping or uppercase code", () => {
  assert.equal(getCountryDisplayName("US"), "United States (US)");
  assert.equal(getCountryDisplayName("ng"), "Nigeria (NG)");
  assert.equal(getCountryDisplayName("GH"), "Ghana (GH)");
  assert.equal(getCountryDisplayName("XX"), "XX");
  assert.equal(getCountryDisplayName(""), "Unknown");
});

test("parseCorridorsResponse safely extracts valid corridor items", () => {
  assert.equal(parseCorridorsResponse(null), null);
  assert.equal(parseCorridorsResponse({}), null);
  assert.equal(parseCorridorsResponse({ corridors: "not-an-array" }), null);

  const raw = {
    corridors: [
      {
        slug: "usdc-ngn",
        sourceAsset: "USDC",
        sourceCountry: "us",
        destinationAsset: "NGN",
        destinationCountry: "ng",
        anchorCount: 3,
      },
      {
        slug: "corrupt-row",
        sourceAsset: 123, // invalid
      },
    ],
    count: 1,
  };

  const parsed = parseCorridorsResponse(raw);
  assert.ok(parsed);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].slug, "usdc-ngn");
  assert.equal(parsed[0].sourceCountry, "US");
  assert.equal(parsed[0].destinationCountry, "NG");
  assert.equal(parsed[0].anchorCount, 3);
});

test("buildGeographyIndex computes deterministic country roles, domestic and cross-border counts", () => {
  const fixtures: readonly PublicCorridor[] = [
    // Cross-border US -> NG
    {
      slug: "usdc-us-ngn-ng",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "NGN",
      destinationCountry: "NG",
      anchorCount: 2,
    },
    // Domestic US -> US
    {
      slug: "usdc-us-usd-us",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "USD",
      destinationCountry: "US",
      anchorCount: 1,
    },
    // Cross-border NG -> GH
    {
      slug: "ngn-ng-ghs-gh",
      sourceAsset: "NGN",
      sourceCountry: "NG",
      destinationAsset: "GHS",
      destinationCountry: "GH",
      anchorCount: 1,
    },
    // Source-only CA -> NG
    {
      slug: "cad-ca-ngn-ng",
      sourceAsset: "CAD",
      sourceCountry: "CA",
      destinationAsset: "NGN",
      destinationCountry: "NG",
      anchorCount: 1,
    },
    // Destination-only US -> PH
    {
      slug: "usdc-us-php-ph",
      sourceAsset: "USDC",
      sourceCountry: "US",
      destinationAsset: "PHP",
      destinationCountry: "PH",
      anchorCount: 2,
    },
  ];

  const index = buildGeographyIndex(fixtures);

  assert.equal(index.totalCorridorsLoaded, 5);
  assert.equal(index.domesticCorridorsCount, 1);
  assert.equal(index.crossBorderCorridorsCount, 4);
  assert.equal(index.uniqueCountriesCount, 5); // US, NG, GH, CA, PH

  // Role Breakdown
  // US: appears as source (3) and dest (1) -> "both"
  // NG: appears as source (1) and dest (2) -> "both"
  // GH: appears as dest (1) -> "destination_only"
  // PH: appears as dest (1) -> "destination_only"
  // CA: appears as source (1) -> "source_only"
  assert.equal(index.bothRolesCountriesCount, 2);
  assert.equal(index.sourceOnlyCountriesCount, 1);
  assert.equal(index.destinationOnlyCountriesCount, 2);

  const us = index.countries.find((c) => c.countryCode === "US");
  assert.ok(us);
  assert.equal(us.role, "both");
  assert.equal(us.sourceCorridors.length, 3);
  assert.equal(us.destinationCorridors.length, 1);
  assert.equal(us.totalUniqueCorridors, 3); // usdc-us-ngn-ng, usdc-us-usd-us, usdc-us-php-ph

  const ca = index.countries.find((c) => c.countryCode === "CA");
  assert.ok(ca);
  assert.equal(ca.role, "source_only");
  assert.equal(ca.sourceCorridors.length, 1);
  assert.equal(ca.destinationCorridors.length, 0);

  const ph = index.countries.find((c) => c.countryCode === "PH");
  assert.ok(ph);
  assert.equal(ph.role, "destination_only");
  assert.equal(ph.sourceCorridors.length, 0);
  assert.equal(ph.destinationCorridors.length, 1);
});

test("buildGeographyIndex handles empty input gracefully", () => {
  const index = buildGeographyIndex([]);
  assert.equal(index.totalCorridorsLoaded, 0);
  assert.equal(index.uniqueCountriesCount, 0);
  assert.equal(index.domesticCorridorsCount, 0);
  assert.equal(index.crossBorderCorridorsCount, 0);
  assert.equal(index.countries.length, 0);
});
