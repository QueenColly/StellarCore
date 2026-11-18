import { RATE_FRESHNESS_THRESHOLD_MS } from "@/constants/rates";
import type { RateFreshness } from "@/types/rates";

export function getRateFreshness(
  capturedAt: Date | string,
  now: Date = new Date(),
): RateFreshness {
  const capturedMs = capturedAt instanceof Date
    ? capturedAt.getTime()
    : Date.parse(capturedAt);
  const nowMs = now.getTime();

  if (!Number.isFinite(capturedMs) || !Number.isFinite(nowMs)) {
    return Object.freeze({ state: "invalid", ageMs: null });
  }

  const ageMs = nowMs - capturedMs;
  if (ageMs < 0) return Object.freeze({ state: "future", ageMs });
  return Object.freeze({
    state: ageMs <= RATE_FRESHNESS_THRESHOLD_MS ? "fresh" : "stale",
    ageMs,
  });
}
