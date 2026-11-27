import {
  isAllowlistedExplorerPath,
  type ExplorerEndpointId,
  type ExplorerRequest,
} from "@/lib/developerExplorer/endpoints";

/** Responses larger than this are summarized instead of rendered. */
export const EXPLORER_MAX_BODY_BYTES = 512 * 1024;

export type ExplorerStatusClass = "success" | "client_error" | "server_error" | "other";

export type ExplorerOutcome =
  | Readonly<{
      kind: "response";
      endpoint: ExplorerEndpointId;
      path: string;
      status: number;
      statusClass: ExplorerStatusClass;
      /** Parsed JSON, or null when the body was empty, oversized, or not JSON. */
      body: unknown;
      bodyProblem: "empty" | "invalid_json" | "too_large" | null;
      /** `X-Evidence-State` response header, when present. */
      evidenceHeader: string | null;
      durationMs: number;
    }>
  | Readonly<{
      kind: "network_error";
      endpoint: ExplorerEndpointId;
      path: string;
      message: string;
    }>
  | Readonly<{
      kind: "denied";
      endpoint: ExplorerEndpointId;
      path: string;
      message: string;
    }>;

export type ExplorerFetch = (
  input: string,
  init: Readonly<{
    method: "GET";
    credentials: "omit";
    cache: "no-store";
    redirect: "error";
    headers: Readonly<Record<string, string>>;
    signal?: AbortSignal;
  }>,
) => Promise<Pick<Response, "status" | "headers" | "text">>;

export function classifyStatus(status: number): ExplorerStatusClass {
  if (status >= 200 && status < 300) return "success";
  if (status >= 400 && status < 500) return "client_error";
  if (status >= 500 && status < 600) return "server_error";
  return "other";
}

/**
 * Send one allowlisted, same-origin GET. Credentials are omitted, redirects are
 * refused, no body or custom header is sent, and the path is re-checked
 * against the allowlist immediately before the request leaves the browser.
 */
export async function executeExplorerRequest(
  request: ExplorerRequest,
  fetchImpl: ExplorerFetch,
  options: Readonly<{ signal?: AbortSignal; now?: () => number }> = {},
): Promise<ExplorerOutcome> {
  const now = options.now ?? (() => Date.now());
  if (request.method !== "GET" || !isAllowlistedExplorerPath(request.path)) {
    return Object.freeze({
      kind: "denied",
      endpoint: request.endpoint,
      path: request.path,
      message: "Request blocked: only allowlisted same-origin GET requests are permitted.",
    });
  }

  const startedAt = now();
  let response: Pick<Response, "status" | "headers" | "text">;
  try {
    response = await fetchImpl(request.path, {
      method: "GET",
      credentials: "omit",
      cache: "no-store",
      redirect: "error",
      headers: Object.freeze({ Accept: "application/json" }),
      signal: options.signal,
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    return Object.freeze({
      kind: "network_error",
      endpoint: request.endpoint,
      path: request.path,
      message: "The request could not reach StellarCore. Check your connection and try again.",
    });
  }

  let text = "";
  let readFailed = false;
  try {
    text = await response.text();
  } catch {
    readFailed = true;
  }

  let body: unknown = null;
  let bodyProblem: "empty" | "invalid_json" | "too_large" | null = null;
  if (readFailed) {
    bodyProblem = "invalid_json";
  } else if (text.trim() === "") {
    bodyProblem = "empty";
  } else if (text.length > EXPLORER_MAX_BODY_BYTES) {
    bodyProblem = "too_large";
  } else {
    try {
      body = JSON.parse(text);
    } catch {
      bodyProblem = "invalid_json";
    }
  }

  return Object.freeze({
    kind: "response",
    endpoint: request.endpoint,
    path: request.path,
    status: response.status,
    statusClass: classifyStatus(response.status),
    body,
    bodyProblem,
    evidenceHeader: response.headers.get("x-evidence-state"),
    durationMs: Math.max(0, Math.round(now() - startedAt)),
  });
}

export type EvidenceNoticeKind =
  | "persisted"
  | "stale"
  | "insufficient"
  | "empty"
  | "error"
  | "unavailable";

export type EvidenceNotice = Readonly<{
  kind: EvidenceNoticeKind;
  title: string;
  detail: string;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Safely read the public error envelope `{ error: { code, message } }`. */
export function readErrorEnvelope(body: unknown): Readonly<{ code: string; message: string }> | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return Object.freeze({ code: code.slice(0, 80), message: message.slice(0, 300) });
}

/**
 * Explain an outcome using only fields the public API actually returned:
 * `degraded` / `X-Evidence-State` for stale snapshots, `state`, `medianRate`,
 * `freshSourceCount`, and `medianRequirement` for rate sufficiency, history
 * point states, reputation evaluation states, and `count`/array lengths for
 * empty results. Nothing is inferred beyond those fields.
 */
export function describeEvidence(outcome: ExplorerOutcome): readonly EvidenceNotice[] {
  if (outcome.kind === "denied") {
    return [{ kind: "error", title: "Request blocked", detail: outcome.message }];
  }
  if (outcome.kind === "network_error") {
    return [{ kind: "unavailable", title: "Network error", detail: outcome.message }];
  }

  if (outcome.statusClass !== "success") {
    const envelope = readErrorEnvelope(outcome.body);
    const detail = envelope
      ? `${envelope.code}: ${envelope.message}`
      : `HTTP ${outcome.status} with no readable error envelope.`;
    if (outcome.statusClass === "server_error") {
      return [{
        kind: "unavailable",
        title: `Server error (${outcome.status})`,
        detail: `${detail} Evidence could not be loaded; this does not mean it is absent.`,
      }];
    }
    return [{ kind: "error", title: `Request rejected (${outcome.status})`, detail }];
  }

  if (outcome.bodyProblem !== null || !isRecord(outcome.body)) {
    const reason = outcome.bodyProblem === "too_large"
      ? "The response was too large to display."
      : outcome.bodyProblem === "empty"
        ? "The response body was empty."
        : "The response body was not valid JSON.";
    return [{ kind: "unavailable", title: "Unreadable response", detail: reason }];
  }

  const body = outcome.body;
  const notices: EvidenceNotice[] = [];

  const degraded = isRecord(body.degraded) && body.degraded.state === "stale";
  if (degraded || outcome.evidenceHeader === "stale") {
    const generatedAt = isRecord(body.degraded) && typeof body.degraded.generatedAt === "string"
      ? ` generated at ${body.degraded.generatedAt}`
      : "";
    notices.push({
      kind: "stale",
      title: "Stale evidence",
      detail: `This is a last-known-good snapshot${generatedAt}, served because the live read failed. It is not current.`,
    });
  }

  switch (outcome.endpoint) {
    case "rates.latest": {
      const fresh = readNumber(body, "freshSourceCount");
      const required = isRecord(body.medianRequirement)
        ? readNumber(body.medianRequirement, "minimumFreshIndependentSources")
        : null;
      const observations = Array.isArray(body.observations) ? body.observations.length : 0;
      if (observations === 0) {
        notices.push({ kind: "empty", title: "No observations", detail: "No rate observations are persisted for this corridor." });
      }
      if (body.state === "insufficient_fresh_sources" || body.medianRate === null) {
        notices.push({
          kind: "insufficient",
          title: "Insufficient evidence",
          detail: `medianRate is null: ${fresh ?? "unknown"} fresh independent observation(s) of ${required ?? "unknown"} required.`,
        });
      }
      break;
    }
    case "rates.history": {
      const points = Array.isArray(body.points) ? body.points : [];
      if (points.length === 0) {
        notices.push({ kind: "empty", title: "No history points", detail: "No persisted history exists in this window." });
      } else {
        const insufficient = points.filter(
          (point) => isRecord(point) && point.state === "insufficient_fresh_sources",
        ).length;
        if (insufficient > 0) {
          notices.push({
            kind: "insufficient",
            title: "Insufficient evidence",
            detail: `${insufficient} of ${points.length} history point(s) have no published median (insufficient fresh sources).`,
          });
        }
      }
      break;
    }
    case "reputation.list":
    case "reputation.detail": {
      const entries = outcome.endpoint === "reputation.list"
        ? (Array.isArray(body.reputation) ? body.reputation : [])
        : (isRecord(body.reputation) ? [body.reputation] : []);
      if (entries.length === 0) {
        notices.push({ kind: "empty", title: "No reputation entries", detail: "The response contains no reputation records." });
      }
      const pending = entries.filter(
        (entry) => isRecord(entry) && entry.state !== "established",
      ).length;
      if (pending > 0) {
        notices.push({
          kind: "insufficient",
          title: "Insufficient evidence",
          detail: `${pending} of ${entries.length} anchor(s) are not_evaluated or insufficient_evidence; their score is null.`,
        });
      }
      break;
    }
    case "anchors.list":
    case "corridors.list": {
      const key = outcome.endpoint === "anchors.list" ? "anchors" : "corridors";
      const list = Array.isArray(body[key]) ? body[key] : [];
      if (list.length === 0) {
        notices.push({ kind: "empty", title: "Empty result", detail: `No ${key} matched this request.` });
      }
      break;
    }
    case "anchors.detail":
    case "corridors.detail":
      break;
  }

  if (!notices.some((notice) => notice.kind === "stale")) {
    notices.unshift({
      kind: "persisted",
      title: "Persisted evidence",
      detail: "Read from StellarCore's persisted store for this request.",
    });
  }

  return notices;
}
