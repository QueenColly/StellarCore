import { isValidCorridorSlug } from "@/lib/api/corridors";
import type { PublicCorridor } from "@/types/api/corridors";

/** Next.js supplies repeated query keys as arrays; only the first value is considered. */
export type BreakdownSearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

/** Human-readable asset pair for a reviewed corridor from GET /api/corridors. */
export function corridorPairLabel(corridor: PublicCorridor): string {
  return `${corridor.sourceAsset} (${corridor.sourceCountry}) → ${corridor.destinationAsset} (${corridor.destinationCountry})`;
}

/** Option label keeps the slug visible so selection identity is unambiguous. */
export function corridorOptionLabel(corridor: PublicCorridor): string {
  return `${corridorPairLabel(corridor)} [${corridor.slug}]`;
}

/**
 * Resolve a requested corridor against the reviewed directory only. An
 * unvalidated or unknown slug never reaches the rates read model.
 */
export function selectReviewedCorridorSlug(
  params: BreakdownSearchParams | null | undefined,
  corridors: readonly PublicCorridor[],
): string {
  const fallback = corridors[0]?.slug ?? "";
  const requested = params?.corridor;
  const slug = Array.isArray(requested) ? requested[0] : requested;

  if (typeof slug !== "string" || !isValidCorridorSlug(slug)) {
    return fallback;
  }

  return corridors.some((corridor) => corridor.slug === slug) ? slug : fallback;
}
