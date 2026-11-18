
import { publicApiErrorResult } from "@/lib/api/errors";
import type { PublicApiErrorCode } from "@/types/api/errors";

export type PublicApiHttpResult = Readonly<{
  status: number;
  body: unknown;
}>;

export function clientDisconnectedResponse(): Response {
  return new Response(null, {
    status: 499,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function respondUnlessRequestAborted(
  request: Request,
  operation: () => Promise<Response>,
): Promise<Response> {
  if (request.signal.aborted) {
    return clientDisconnectedResponse();
  }

  try {
    const response = await operation();

    return request.signal.aborted
      ? clientDisconnectedResponse()
      : response;
  } catch (error) {
    if (request.signal.aborted) {
      return clientDisconnectedResponse();
    }

    throw error;
  }
}

export function publicApiJsonResponse(
  result: PublicApiHttpResult,
  headers: Readonly<Record<string, string>> = {},
): Response {
  const isError = result.status >= 400;
  const mergedHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (isError && key.toLowerCase() === "cache-control") {
      continue;
    }

    mergedHeaders[key] = value;
  }

  const hasCacheControl = Object.keys(mergedHeaders).some(
    (key) => key.toLowerCase() === "cache-control",
  );

  if (isError || !hasCacheControl) {
    mergedHeaders["Cache-Control"] = "no-store";
  }

  return Response.json(result.body, {
    status: result.status,
    headers: mergedHeaders,
  });
}

export function readQueryParameter(
  parameters: URLSearchParams,
  name: string,
): string | readonly string[] | null {
  const values = parameters.getAll(name);

  if (values.length === 0) {
    return null;
  }

  if (values.length === 1) {
    return values[0]!;
  }

  return Object.freeze(values);
}

export function publicApiErrorResponse<Code extends PublicApiErrorCode>(
  code: Code,
  message: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return publicApiJsonResponse(
    publicApiErrorResult(code, message),
    headers,
  );
}

export function publicApiUnexpectedErrorResponse(
  _error?: unknown,
  message: string = "An unexpected error occurred.",
  headers: Readonly<Record<string, string>> = {},
): Response {
  return publicApiErrorResponse(
    "internal_error",
    message,
    headers,
  );
}
