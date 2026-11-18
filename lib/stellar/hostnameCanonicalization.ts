import { domainToASCII, domainToUnicode } from "node:url";

export class HostnameValidationError extends Error {
  readonly code:
    | "INVALID_HOSTNAME"
    | "DISALLOWED_CHARACTERS"
    | "INVALID_LENGTH"
    | "LABEL_TOO_LONG"
    | "MALFORMED_IDN"
    | "AMBIGUOUS_UNICODE";

  constructor(
    code:
      | "INVALID_HOSTNAME"
      | "DISALLOWED_CHARACTERS"
      | "INVALID_LENGTH"
      | "LABEL_TOO_LONG"
      | "MALFORMED_IDN"
      | "AMBIGUOUS_UNICODE",
    message: string,
  ) {
    super(message);
    this.name = "HostnameValidationError";
    this.code = code;
  }
}

const LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const TLD_REGEX = /^[a-z]{2,63}$|^xn--[a-z0-9-]{2,59}$/;

/**
 * Canonicalizes and validates a domain or hostname for anchor trust decisions.
 *
 * Enforces:
 * 1. Trailing dots are stripped.
 * 2. Case is normalized to lowercase.
 * 3. Internationalized Domain Names (IDN / Unicode) are safely converted to canonical ASCII (A-label / punycode).
 * 4. Disallows spaces, control characters, leading/trailing hyphens per label.
 * 5. Bounded label lengths (1..63) and total hostname length (1..253).
 * 6. Disallows consecutive dots (empty labels) or single-label hostnames without a valid TLD.
 */
export function canonicalizeHostname(rawHostname: string): string {
  if (typeof rawHostname !== "string" || !rawHostname.trim()) {
    throw new HostnameValidationError(
      "INVALID_HOSTNAME",
      "Hostname must be a non-empty string",
    );
  }

  const trimmed = rawHostname.trim();

  // Strip trailing dot(s) for FQDN normalization
  let cleaned = trimmed;
  while (cleaned.endsWith(".")) {
    cleaned = cleaned.slice(0, -1);
  }

  if (!cleaned) {
    throw new HostnameValidationError(
      "INVALID_HOSTNAME",
      `Hostname cannot be empty: "${rawHostname}"`,
    );
  }

  // Reject consecutive dots e.g. foo..bar
  if (cleaned.includes("..")) {
    throw new HostnameValidationError(
      "DISALLOWED_CHARACTERS",
      `Hostname contains empty label: "${rawHostname}"`,
    );
  }

  // Reject whitespace or control characters
  if (/[\s\x00-\x1F\x7F]/.test(cleaned)) {
    throw new HostnameValidationError(
      "DISALLOWED_CHARACTERS",
      `Hostname contains invalid whitespace or control characters: "${rawHostname}"`,
    );
  }

  // Convert Unicode IDN to ASCII punycode via standard Node.js IDNA / UTS#46
  let asciiHostname: string;
  try {
    asciiHostname = domainToASCII(cleaned);
  } catch {
    throw new HostnameValidationError(
      "MALFORMED_IDN",
      `Failed to convert internationalized hostname to ASCII: "${rawHostname}"`,
    );
  }

  if (!asciiHostname) {
    throw new HostnameValidationError(
      "MALFORMED_IDN",
      `Invalid internationalized domain name: "${rawHostname}"`,
    );
  }

  // Normalize to lowercase, then decode the canonical A-label form once so
  // visually ambiguous mixed Latin/Cyrillic or Latin/Greek labels fail closed
  // even when the caller supplied punycode directly.
  asciiHostname = asciiHostname.toLowerCase();
  const unicodeHostname = domainToUnicode(asciiHostname);
  for (const label of unicodeHostname.split(".")) {
    const hasLatin = /\p{Script=Latin}/u.test(label);
    const hasCyrillic = /\p{Script=Cyrillic}/u.test(label);
    const hasGreek = /\p{Script=Greek}/u.test(label);
    if (hasLatin && (hasCyrillic || hasGreek)) {
      throw new HostnameValidationError(
        "AMBIGUOUS_UNICODE",
        `Hostname label contains an ambiguous mixed-script form: "${rawHostname}"`,
      );
    }
  }

  // Total length check: 1 to 253 characters
  if (asciiHostname.length < 1 || asciiHostname.length > 253) {
    throw new HostnameValidationError(
      "INVALID_LENGTH",
      `Canonical hostname length must be between 1 and 253 characters (got ${asciiHostname.length}): "${asciiHostname}"`,
    );
  }

  const labels = asciiHostname.split(".");

  // Anchors and SEP services require at least a domain name and TLD (e.g. example.com)
  if (labels.length < 2) {
    throw new HostnameValidationError(
      "INVALID_HOSTNAME",
      `Hostname must contain at least one domain label and a top-level domain: "${rawHostname}"`,
    );
  }

  // Validate each label against LDH rules (letters, digits, hyphen, max 63 chars)
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];

    if (label.length < 1 || label.length > 63) {
      throw new HostnameValidationError(
        "LABEL_TOO_LONG",
        `Hostname label "${label}" exceeds maximum length of 63 characters`,
      );
    }

    if (!LABEL_REGEX.test(label)) {
      throw new HostnameValidationError(
        "DISALLOWED_CHARACTERS",
        `Hostname label "${label}" contains invalid characters or leading/trailing hyphens`,
      );
    }
  }

  // Validate Top-Level Domain (last label)
  const tld = labels[labels.length - 1];
  if (!TLD_REGEX.test(tld)) {
    throw new HostnameValidationError(
      "INVALID_HOSTNAME",
      `Invalid top-level domain in hostname: "${tld}"`,
    );
  }

  return asciiHostname;
}

/**
 * Checks whether two hostname representations are semantically equivalent after canonicalization.
 */
export function areHostnamesEquivalent(hostA: string, hostB: string): boolean {
  try {
    return canonicalizeHostname(hostA) === canonicalizeHostname(hostB);
  } catch {
    return false;
  }
}
