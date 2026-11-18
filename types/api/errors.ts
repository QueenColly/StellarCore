export const PUBLIC_API_ERROR_CODES = [
  "missing_corridor",
  "invalid_corridor",
  "invalid_days",
  "invalid_corridor_slug",
  "invalid_anchor_slug",
  "anchor_not_found",
  "corridor_not_found",
  "invalid_pagination",
  "rate_limited",
  "internal_error",
  "upstream_unavailable",
] as const;

export type PublicApiErrorCode = (typeof PUBLIC_API_ERROR_CODES)[number];
export type PublicApiErrorStatus = 400 | 404 | 429 | 500 | 503;

export const PUBLIC_API_ERROR_STATUS_BY_CODE = {
  missing_corridor: 400,
  invalid_corridor: 400,
  invalid_days: 400,
  invalid_corridor_slug: 400,
  invalid_anchor_slug: 400,
  anchor_not_found: 404,
  corridor_not_found: 404,
  invalid_pagination: 400,
  rate_limited: 429,
  internal_error: 500,
  upstream_unavailable: 503,
} as const satisfies Readonly<Record<PublicApiErrorCode, PublicApiErrorStatus>>;

export type PublicApiErrorEnvelope<Code extends PublicApiErrorCode = PublicApiErrorCode> = Readonly<{
  error: Readonly<{ code: Code; message: string }>;
}>;

export type PublicApiErrorResult<Code extends PublicApiErrorCode = PublicApiErrorCode> = Readonly<{
  status: (typeof PUBLIC_API_ERROR_STATUS_BY_CODE)[Code];
  body: PublicApiErrorEnvelope<Code>;
}>;
