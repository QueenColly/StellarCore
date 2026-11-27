/**
 * Pure parsing and interpretation helpers for /insights/reviewed-geography.
 *
 * Derives country occurrence and reviewed corridor pairings solely from
 * the public `/api/corridors` response.
 *
 * Crucial constraints:
 * - Distinguishes source and destination direction.
 * - Counts each corridor once per role (does not treat anchorCount as operational provider count).
 * - Uses a controlled, documented country name mapping (no invented coordinates or geocoding).
 * - Clearly distinguishes reviewed directory configuration from live availability.
 */

import type { PublicCorridor, PublicCorridorsResponse } from "@/types/api/corridors";

export const CONTROLLED_COUNTRY_NAMES: Readonly<Record<string, string>> = Object.freeze({
  AE: "United Arab Emirates",
  AR: "Argentina",
  AU: "Australia",
  BR: "Brazil",
  CA: "Canada",
  CH: "Switzerland",
  CL: "Chile",
  CO: "Colombia",
  DE: "Germany",
  ES: "Spain",
  EU: "European Union",
  FR: "France",
  GB: "United Kingdom",
  GH: "Ghana",
  IN: "India",
  IT: "Italy",
  JP: "Japan",
  KE: "Kenya",
  KR: "South Korea",
  MX: "Mexico",
  NG: "Nigeria",
  NL: "Netherlands",
  PE: "Peru",
  PH: "Philippines",
  RW: "Rwanda",
  SG: "Singapore",
  TZ: "Tanzania",
  UG: "Uganda",
  US: "United States",
  ZA: "South Africa",
});

export function getCountryDisplayName(countryCode: string): string {
  const upper = String(countryCode || "").trim().toUpperCase();
  if (!upper) return "Unknown";
  const knownName = CONTROLLED_COUNTRY_NAMES[upper];
  return knownName ? `${knownName} (${upper})` : upper;
}

export type CountryRole = "both" | "source_only" | "destination_only";

export type ReviewedCorridorEntry = Readonly<{
  slug: string;
  sourceAsset: string;
  sourceCountry: string;
  destinationAsset: string;
  destinationCountry: string;
  isDomestic: boolean;
  anchorCount: number;
}>;

export type CountrySummary = Readonly<{
  countryCode: string;
  displayName: string;
  role: CountryRole;
  sourceCorridors: readonly ReviewedCorridorEntry[];
  destinationCorridors: readonly ReviewedCorridorEntry[];
  totalUniqueCorridors: number;
}>;

export type ReviewedGeographyIndex = Readonly<{
  totalCorridorsLoaded: number;
  uniqueCountriesCount: number;
  sourceOnlyCountriesCount: number;
  destinationOnlyCountriesCount: number;
  bothRolesCountriesCount: number;
  domesticCorridorsCount: number;
  crossBorderCorridorsCount: number;
  countries: readonly CountrySummary[];
}>;

export function parseCorridorsResponse(data: unknown): readonly PublicCorridor[] | null {
  if (!data || typeof data !== "object") return null;
  const res = data as Partial<PublicCorridorsResponse>;
  if (!Array.isArray(res.corridors)) return null;

  const validCorridors: PublicCorridor[] = [];
  for (const item of res.corridors) {
    if (
      item &&
      typeof item.slug === "string" &&
      typeof item.sourceAsset === "string" &&
      typeof item.sourceCountry === "string" &&
      typeof item.destinationAsset === "string" &&
      typeof item.destinationCountry === "string"
    ) {
      validCorridors.push({
        slug: item.slug,
        sourceAsset: item.sourceAsset,
        sourceCountry: item.sourceCountry.trim().toUpperCase(),
        destinationAsset: item.destinationAsset,
        destinationCountry: item.destinationCountry.trim().toUpperCase(),
        anchorCount: typeof item.anchorCount === "number" ? item.anchorCount : 0,
      });
    }
  }

  return Object.freeze(validCorridors);
}

export function buildGeographyIndex(corridors: readonly PublicCorridor[]): ReviewedGeographyIndex {
  const countryMap = new Map<
    string,
    {
      sourceCorridors: Map<string, ReviewedCorridorEntry>;
      destinationCorridors: Map<string, ReviewedCorridorEntry>;
      allCorridorSlugs: Set<string>;
    }
  >();

  let domesticCount = 0;
  let crossBorderCount = 0;

  for (const c of corridors) {
    const src = c.sourceCountry || "UNKNOWN";
    const dst = c.destinationCountry || "UNKNOWN";
    const isDomestic = src === dst;

    if (isDomestic) {
      domesticCount++;
    } else {
      crossBorderCount++;
    }

    const entry: ReviewedCorridorEntry = Object.freeze({
      slug: c.slug,
      sourceAsset: c.sourceAsset,
      sourceCountry: src,
      destinationAsset: c.destinationAsset,
      destinationCountry: dst,
      isDomestic,
      anchorCount: c.anchorCount,
    });

    // Register Source Country
    if (!countryMap.has(src)) {
      countryMap.set(src, {
        sourceCorridors: new Map(),
        destinationCorridors: new Map(),
        allCorridorSlugs: new Set(),
      });
    }
    const srcRecord = countryMap.get(src)!;
    srcRecord.sourceCorridors.set(c.slug, entry);
    srcRecord.allCorridorSlugs.add(c.slug);

    // Register Destination Country
    if (!countryMap.has(dst)) {
      countryMap.set(dst, {
        sourceCorridors: new Map(),
        destinationCorridors: new Map(),
        allCorridorSlugs: new Set(),
      });
    }
    const dstRecord = countryMap.get(dst)!;
    dstRecord.destinationCorridors.set(c.slug, entry);
    dstRecord.allCorridorSlugs.add(c.slug);
  }

  const summaries: CountrySummary[] = [];
  let sourceOnlyCount = 0;
  let destinationOnlyCount = 0;
  let bothRolesCount = 0;

  for (const [code, record] of countryMap.entries()) {
    const hasSource = record.sourceCorridors.size > 0;
    const hasDest = record.destinationCorridors.size > 0;

    let role: CountryRole = "both";
    if (hasSource && !hasDest) {
      role = "source_only";
      sourceOnlyCount++;
    } else if (!hasSource && hasDest) {
      role = "destination_only";
      destinationOnlyCount++;
    } else {
      bothRolesCount++;
    }

    // Sort corridors deterministically by slug
    const sourceList = Array.from(record.sourceCorridors.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug)
    );
    const destList = Array.from(record.destinationCorridors.values()).sort((a, b) =>
      a.slug.localeCompare(b.slug)
    );

    summaries.push(
      Object.freeze({
        countryCode: code,
        displayName: getCountryDisplayName(code),
        role,
        sourceCorridors: Object.freeze(sourceList),
        destinationCorridors: Object.freeze(destList),
        totalUniqueCorridors: record.allCorridorSlugs.size,
      })
    );
  }

  // Sort countries deterministically: highest unique corridor count first, then alphabetical by country code
  summaries.sort((a, b) => {
    if (b.totalUniqueCorridors !== a.totalUniqueCorridors) {
      return b.totalUniqueCorridors - a.totalUniqueCorridors;
    }
    return a.countryCode.localeCompare(b.countryCode);
  });

  return Object.freeze({
    totalCorridorsLoaded: corridors.length,
    uniqueCountriesCount: summaries.length,
    sourceOnlyCountriesCount: sourceOnlyCount,
    destinationOnlyCountriesCount: destinationOnlyCount,
    bothRolesCountriesCount: bothRolesCount,
    domesticCorridorsCount: domesticCount,
    crossBorderCorridorsCount: crossBorderCount,
    countries: Object.freeze(summaries),
  });
}
