import { isValidCorridorSlug } from "@/lib/api/corridors";
import type { PublicCorridor } from "@/types/api/corridors";
import { DAILY_SNAPSHOT_INVENTORY_WINDOWS } from "@/lib/rates/dailySnapshotInventory";

/** Next.js supplies repeated query keys as arrays; only the first value is used. */
export type InventorySearchParams = Readonly<
  Record<string, string | readonly string[] | undefined>
>;

export const DEFAULT_INVENTORY_WINDOW_DAYS = 30;

/** A window is accepted only when the view actually offers it. */
export function resolveInventoryWindowDays(
  value: string | readonly string[] | undefined,
): number {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    return DEFAULT_INVENTORY_WINDOW_DAYS;
  }
  const parsed = Number.parseInt(raw, 10);
  return DAILY_SNAPSHOT_INVENTORY_WINDOWS.some((window) => window.days === parsed)
    ? parsed
    : DEFAULT_INVENTORY_WINDOW_DAYS;
}

/**
 * Resolve a requested corridor against the reviewed directory only. An
 * unvalidated or unknown slug never reaches the rate-history read.
 */
export function selectReviewedCorridorSlug(
  params: InventorySearchParams | null | undefined,
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
