import {
  PUBLIC_API_ERROR_STATUS_BY_CODE,
  type PublicApiErrorCode,
  type PublicApiErrorEnvelope,
  type PublicApiErrorResult,
} from "@/types/api/errors";

export function publicApiErrorEnvelope<Code extends PublicApiErrorCode>(
  code: Code,
  message: string,
): PublicApiErrorEnvelope<Code> {
  return Object.freeze({ error: Object.freeze({ code, message }) });
}

export function publicApiErrorResult<Code extends PublicApiErrorCode>(
  code: Code,
  message: string,
): PublicApiErrorResult<Code> {
  return Object.freeze({
    status: PUBLIC_API_ERROR_STATUS_BY_CODE[code],
    body: publicApiErrorEnvelope(code, message),
  });
}

export type PublicApiErrorReporter = (
  error: unknown,
  context: Readonly<{ operation: string; code: PublicApiErrorCode }>,
) => void;

export const consolePublicApiErrorReporter: PublicApiErrorReporter = (error, context) => {
  console.error(
    `[stellarcore:public-api] ${context.operation} failed (${context.code})`,
    error,
  );
};
