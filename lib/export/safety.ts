const SECRET_KEYS = new Set([
  "password",
  "passwd",
  "api_key",
  "apikey",
  "secret",
  "client_secret",
  "access_token",
  "refresh_token",
  "token",
  "authorization",
  "cookie",
  "session",
  "database_url",
  "connection_string",
  "private_key",
  "signing_key",
]);

const CREDENTIAL_URL =
  /^(?:postgres(?:ql)?|mysql|redis|mongodb):\/\/[^\s/@:]*:\S+@/i;
const BEARER = /^bearer\s+[a-z0-9._~+\/-]+=*$/i;
const JWT = /^eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+$/i;

export function assertExportSafe(value: unknown, path = "root"): void {
  if (typeof value === "string") {
    if (CREDENTIAL_URL.test(value) || BEARER.test(value) || JWT.test(value)) {
      throw new Error(`SECRET_DETECTED at ${path}`);
    }
    return;
  }
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) {
    value.forEach((child, index) => assertExportSafe(child, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = key.toLowerCase().replaceAll("-", "_");
    if (SECRET_KEYS.has(normalized)) {
      throw new Error(`SECRET_DETECTED at ${path}.${key}`);
    }
    assertExportSafe(child, `${path}.${key}`);
  }
}
