import type { PublicCorridor } from "@/types/api/corridors";

/** Human-readable asset pair for a reviewed corridor from GET /api/corridors. */
export function corridorPairLabel(corridor: PublicCorridor): string {
  return `${corridor.sourceAsset} (${corridor.sourceCountry}) → ${corridor.destinationAsset} (${corridor.destinationCountry})`;
}

/** Option label keeps the slug visible so selection identity is unambiguous. */
export function corridorOptionLabel(corridor: PublicCorridor): string {
  return `${corridorPairLabel(corridor)} [${corridor.slug}]`;
}
