/**
 * Safe request construction for the read-only public API explorer
 * (`/developers/explorer`).
 *
 * The explorer can only issue same-origin GET requests to an explicit
 * allowlist of public endpoints. Callers never supply a URL, method, header,
 * credential, or body: they pick an endpoint id and a small set of constrained
 * parameters, which are validated here against reviewed registry slugs and
 * bounded numeric ranges. Anything else is denied before a request is built.
 *
 * No `/api/internal/**` endpoint and no external anchor endpoint is reachable.
 */

export const EXPLORER_ENDPOINT_IDS = [
  "anchors.list",
  "anchors.detail",
  "corridors.list",
  "corridors.detail",
  "rates.latest",
  "rates.history",
  "reputation.list",
  "reputation.detail",
] as const;

export type ExplorerEndpointId = (typeof EXPLORER_ENDPOINT_IDS)[number];

export type ExplorerParameterName =
  | "anchor"
  | "corridor"
  | "days"
  | "limit"
  | "offset";

export type ExplorerEndpointDefinition = Readonly<{
  id: ExplorerEndpointId;
  label: string;
  pathTemplate: string;
  description: string;
  required: readonly ExplorerParameterName[];
  optional: readonly ExplorerParameterName[];
}>;

/** Supported `days` windows for `/api/rates/history` (the API accepts 1–365). */
export const EXPLORER_HISTORY_DAYS = Object.freeze([1, 7, 30, 90, 365] as const);
export const EXPLORER_DEFAULT_HISTORY_DAYS = 30;
/** Matches the public directory APIs' MAX_PAGE_LIMIT. */
export const EXPLORER_MAX_LIMIT = 100;
/** Explorer-side ceiling; the registries are far smaller than this. */
export const EXPLORER_MAX_OFFSET = 1_000;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 100;
const POSITIVE_INTEGER = /^[1-9][0-9]{0,5}$/;
const NON_NEGATIVE_INTEGER = /^(?:0|[1-9][0-9]{0,5})$/;

export const EXPLORER_ENDPOINTS: Readonly<Record<ExplorerEndpointId, ExplorerEndpointDefinition>> =
  Object.freeze({
    "anchors.list": Object.freeze({
      id: "anchors.list",
      label: "List anchors",
      pathTemplate: "/api/anchors",
      description: "Synchronized anchor directory with optional pagination.",
      required: Object.freeze([]),
      optional: Object.freeze(["limit", "offset"] as const),
    }),
    "anchors.detail": Object.freeze({
      id: "anchors.detail",
      label: "Anchor detail",
      pathTemplate: "/api/anchors/:anchor",
      description: "One reviewed anchor with its associated corridors.",
      required: Object.freeze(["anchor"] as const),
      optional: Object.freeze([]),
    }),
    "corridors.list": Object.freeze({
      id: "corridors.list",
      label: "List corridors",
      pathTemplate: "/api/corridors",
      description: "Reviewed corridor directory with optional pagination.",
      required: Object.freeze([]),
      optional: Object.freeze(["limit", "offset"] as const),
    }),
    "corridors.detail": Object.freeze({
      id: "corridors.detail",
      label: "Corridor detail",
      pathTemplate: "/api/corridors/:corridor",
      description: "One reviewed corridor with its associated anchors.",
      required: Object.freeze(["corridor"] as const),
      optional: Object.freeze([]),
    }),
    "rates.latest": Object.freeze({
      id: "rates.latest",
      label: "Latest rates",
      pathTemplate: "/api/rates?corridor=:corridor",
      description: "Latest persisted observations, freshness, and median sufficiency.",
      required: Object.freeze(["corridor"] as const),
      optional: Object.freeze([]),
    }),
    "rates.history": Object.freeze({
      id: "rates.history",
      label: "Rate history",
      pathTemplate: "/api/rates/history?corridor=:corridor&days=:days",
      description: "Persisted median history points over a bounded window.",
      required: Object.freeze(["corridor"] as const),
      optional: Object.freeze(["days"] as const),
    }),
    "reputation.list": Object.freeze({
      id: "reputation.list",
      label: "List reputation",
      pathTemplate: "/api/reputation",
      description: "Reputation evaluation state for every reviewed anchor.",
      required: Object.freeze([]),
      optional: Object.freeze([]),
    }),
    "reputation.detail": Object.freeze({
      id: "reputation.detail",
      label: "Anchor reputation",
      pathTemplate: "/api/reputation/:anchor",
      description: "Reputation evaluation state for one reviewed anchor.",
      required: Object.freeze(["anchor"] as const),
      optional: Object.freeze([]),
    }),
  });

export type ExplorerAllowedValues = Readonly<{
  anchorSlugs: readonly string[];
  corridorSlugs: readonly string[];
}>;

export type ExplorerRequestInput = Readonly<{
  endpoint: string;
  params?: Readonly<Record<string, string | undefined>>;
}>;

export type ExplorerRequest = Readonly<{
  endpoint: ExplorerEndpointId;
  method: "GET";
  /** Same-origin relative path, always starting with `/api/`. */
  path: string;
}>;

export type ExplorerDenialCode =
  | "unknown_endpoint"
  | "unsupported_parameter"
  | "missing_parameter"
  | "invalid_anchor"
  | "invalid_corridor"
  | "invalid_days"
  | "invalid_limit"
  | "invalid_offset"
  | "path_not_allowlisted";

export type ExplorerBuildResult =
  | Readonly<{ ok: true; request: ExplorerRequest }>
  | Readonly<{ ok: false; code: ExplorerDenialCode; message: string }>;

export function isExplorerEndpointId(value: unknown): value is ExplorerEndpointId {
  return typeof value === "string"
    && (EXPLORER_ENDPOINT_IDS as readonly string[]).includes(value);
}

function isSafeSlug(value: string): boolean {
  return value.length > 0 && value.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(value);
}

function deny(code: ExplorerDenialCode, message: string): ExplorerBuildResult {
  return Object.freeze({ ok: false, code, message });
}

/**
 * Build a validated same-origin GET request for an allowlisted endpoint.
 * Empty-string parameters are treated as absent.
 */
export function buildExplorerRequest(
  input: ExplorerRequestInput,
  allowed: ExplorerAllowedValues,
): ExplorerBuildResult {
  if (!isExplorerEndpointId(input.endpoint)) {
    return deny("unknown_endpoint", "Only allowlisted public read-only endpoints can be explored.");
  }

  const definition = EXPLORER_ENDPOINTS[input.endpoint];
  const declared = new Set<string>([...definition.required, ...definition.optional]);
  const params: Partial<Record<ExplorerParameterName, string>> = {};

  for (const [name, raw] of Object.entries(input.params ?? {})) {
    if (raw === undefined || raw === "") continue;
    if (typeof raw !== "string" || !declared.has(name)) {
      return deny("unsupported_parameter", `Parameter "${name}" is not supported for ${definition.label}.`);
    }
    params[name as ExplorerParameterName] = raw;
  }

  for (const name of definition.required) {
    if (params[name] === undefined) {
      return deny("missing_parameter", `Parameter "${name}" is required for ${definition.label}.`);
    }
  }

  if (params.anchor !== undefined
    && (!isSafeSlug(params.anchor) || !allowed.anchorSlugs.includes(params.anchor))) {
    return deny("invalid_anchor", "Choose a reviewed anchor slug.");
  }

  if (params.corridor !== undefined
    && (!isSafeSlug(params.corridor) || !allowed.corridorSlugs.includes(params.corridor))) {
    return deny("invalid_corridor", "Choose a reviewed corridor slug.");
  }

  let days: number | undefined;
  if (definition.optional.includes("days")) {
    const rawDays = params.days ?? String(EXPLORER_DEFAULT_HISTORY_DAYS);
    days = POSITIVE_INTEGER.test(rawDays) ? Number(rawDays) : Number.NaN;
    if (!(EXPLORER_HISTORY_DAYS as readonly number[]).includes(days)) {
      return deny("invalid_days", `days must be one of ${EXPLORER_HISTORY_DAYS.join(", ")}.`);
    }
  }

  if (params.limit !== undefined
    && (!POSITIVE_INTEGER.test(params.limit) || Number(params.limit) > EXPLORER_MAX_LIMIT)) {
    return deny("invalid_limit", `limit must be an integer from 1 to ${EXPLORER_MAX_LIMIT}.`);
  }

  if (params.offset !== undefined
    && (!NON_NEGATIVE_INTEGER.test(params.offset) || Number(params.offset) > EXPLORER_MAX_OFFSET)) {
    return deny("invalid_offset", `offset must be an integer from 0 to ${EXPLORER_MAX_OFFSET}.`);
  }

  const path = composePath(definition.id, params, days);
  if (!isAllowlistedExplorerPath(path)) {
    return deny("path_not_allowlisted", "The constructed request is not allowlisted.");
  }

  return Object.freeze({
    ok: true,
    request: Object.freeze({ endpoint: definition.id, method: "GET", path }),
  });
}

function composePath(
  id: ExplorerEndpointId,
  params: Partial<Record<ExplorerParameterName, string>>,
  days: number | undefined,
): string {
  const query = new URLSearchParams();
  const segment = (value: string | undefined) => encodeURIComponent(value ?? "");

  switch (id) {
    case "anchors.list":
    case "corridors.list": {
      if (params.limit !== undefined) query.set("limit", params.limit);
      if (params.offset !== undefined) query.set("offset", params.offset);
      const base = id === "anchors.list" ? "/api/anchors" : "/api/corridors";
      const text = query.toString();
      return text ? `${base}?${text}` : base;
    }
    case "anchors.detail":
      return `/api/anchors/${segment(params.anchor)}`;
    case "corridors.detail":
      return `/api/corridors/${segment(params.corridor)}`;
    case "rates.latest":
      query.set("corridor", params.corridor ?? "");
      return `/api/rates?${query.toString()}`;
    case "rates.history":
      query.set("corridor", params.corridor ?? "");
      query.set("days", String(days));
      return `/api/rates/history?${query.toString()}`;
    case "reputation.list":
      return "/api/reputation";
    case "reputation.detail":
      return `/api/reputation/${segment(params.anchor)}`;
  }
}

const ALLOWLISTED_PATH_PATTERNS: readonly RegExp[] = Object.freeze([
  /^\/api\/anchors(?:\?limit=[1-9][0-9]*(?:&offset=(?:0|[1-9][0-9]*))?|\?offset=(?:0|[1-9][0-9]*))?$/,
  /^\/api\/corridors(?:\?limit=[1-9][0-9]*(?:&offset=(?:0|[1-9][0-9]*))?|\?offset=(?:0|[1-9][0-9]*))?$/,
  /^\/api\/anchors\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/api\/corridors\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/api\/rates\?corridor=[a-z0-9]+(?:-[a-z0-9]+)*$/,
  /^\/api\/rates\/history\?corridor=[a-z0-9]+(?:-[a-z0-9]+)*&days=[1-9][0-9]*$/,
  /^\/api\/reputation$/,
  /^\/api\/reputation\/[a-z0-9]+(?:-[a-z0-9]+)*$/,
]);

/**
 * Final defense-in-depth check applied both when a request is built and
 * immediately before it is sent. Rejects absolute URLs, protocol-relative
 * URLs, traversal, internal endpoints, and anything outside the allowlist.
 */
export function isAllowlistedExplorerPath(path: unknown): path is string {
  if (typeof path !== "string" || path.length > 512) return false;
  if (!path.startsWith("/api/") || path.startsWith("//")) return false;
  if (path.startsWith("/api/internal")) return false;
  if (path.includes("..") || path.includes("\\") || path.includes("#")) return false;
  return ALLOWLISTED_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

/** Copyable request examples. The origin is display-only; requests stay relative. */
export function explorerRequestExamples(
  request: ExplorerRequest,
  origin: string,
): Readonly<{ curl: string; fetch: string }> {
  const safeOrigin = /^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?$/.test(origin)
    ? origin
    : "http://localhost:3000";
  const url = `${safeOrigin}${request.path}`;
  return Object.freeze({
    curl: `curl -sS -H 'Accept: application/json' '${url}'`,
    fetch: `const response = await fetch("${request.path}", { method: "GET", headers: { Accept: "application/json" } });\nconst body = await response.json();`,
  });
}
