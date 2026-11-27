import type { ApiErrorEnvelope, ApiResult } from "./types.js";

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export function createClient(options: Readonly<{ baseUrl: string; fetchImpl?: FetchLike }>) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;

  async function get<T, C extends string = string>(path: string): Promise<ApiResult<T, C>> {
    const response = await fetchImpl(`${baseUrl}${path}`, { method: "GET", headers: { accept: "application/json" } });
    let raw: unknown = null;
    try { raw = await response.json(); } catch { raw = null; }

    if (response.ok) {
      return { ok: true, status: response.status, data: raw as T };
    }
    const error = isErrorEnvelope(raw) ? (raw.error as ApiErrorEnvelope<C>["error"]) : null;
    return { ok: false, status: response.status, error, raw };
  }

  return { get };
}

function isErrorEnvelope(value: unknown): value is ApiErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value
    && typeof (value as { error?: unknown }).error === "object" && (value as { error?: unknown }).error !== null
    && typeof (value as { error: { code?: unknown } }).error.code === "string"
    && typeof (value as { error: { message?: unknown } }).error.message === "string";
}

export function formatApiError(result: Readonly<{ status: number; error: { code: string; message: string } | null }>): string {
  if (result.error) return `${result.status} ${result.error.code}: ${result.error.message}`;
  return `${result.status} unexpected error response`;
}
