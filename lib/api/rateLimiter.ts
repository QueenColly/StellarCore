/**
 * Minimal in-memory fixed-window rate limiter for public GET API routes.
 *
 * Design constraints:
 * - No Redis, database, or external service. Each serverless instance keeps its
 *   own in-memory window, so the limit is per-instance, not globally shared.
 * - Clients are identified by IP. On Vercel and behind typical proxies the
 *   client IP is the first entry of the `x-forwarded-for` header; when absent
 *   we fall back to `x-real-ip`, then to the constant "anonymous" so the
 *   limiter never rejects a well-behaved request due to a missing header.
 * - Fixed-window semantics: requests within a window of `windowMs` are counted;
 *   once the window elapses the count resets. Windows are keyed by
 *   `floor(now / windowMs)` so they do not require per-key timers and cannot
 *   leak memory after the window passes.
 */

export const PUBLIC_RATE_LIMIT = 100;
export const PUBLIC_RATE_LIMIT_WINDOW_MS = 60_000;

export const RATE_LIMIT_ERROR_BODY = Object.freeze({
  error: Object.freeze({
    code: "rate_limited",
    message: "Too many requests. Please try again later.",
  }),
});

export type RateLimitDecision = Readonly<{
  allowed: true;
} | {
  allowed: false;
  response: Response;
}>;

export type RateLimiter = Readonly<{
  check: (request: Request, now: number) => Promise<RateLimitDecision>;
}>;

export function createRateLimiter(
  limit: number = PUBLIC_RATE_LIMIT,
  windowMs: number = PUBLIC_RATE_LIMIT_WINDOW_MS,
): RateLimiter {
  const requestCounts = new Map<string, number>();
  let activeWindow: number | undefined;

  /**
   * A single fixed-window remembered at a time is enough: when `now` crosses
   * into a new window every key's previous count is stale, so we reset instead
   * of tracking per-key windows.
   */
  return {
    async check(request: Request, now: number): Promise<RateLimitDecision> {
      const window = Math.floor(now / windowMs);

      if (activeWindow === undefined || window !== activeWindow) {
        requestCounts.clear();
        activeWindow = window;
      }

      const clientKey = clientIp(request);
      const count = requestCounts.get(clientKey) ?? 0;
      if (count >= limit) {
        return Object.freeze({
          allowed: false,
          response: Response.json(RATE_LIMIT_ERROR_BODY, {
            status: 429,
            headers: Object.freeze({ "Cache-Control": "no-store" }),
          }),
        });
      }

      requestCounts.set(clientKey, count + 1);
      return Object.freeze({ allowed: true });
    },
  };
}

let limiter: RateLimiter | undefined;

/** Process-wide singleton so all public routes share one request budget. */
export function getRateLimiter(): RateLimiter {
  limiter ??= createRateLimiter();
  return limiter;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "anonymous";
}