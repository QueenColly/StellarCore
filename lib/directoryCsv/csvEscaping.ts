/**
 * Deterministic CSV escaping and formula injection neutralization for directory exports (#642).
 *
 * Implements RFC 4180 compliant CSV formatting with defense against spreadsheet formula injection (CSV Injection).
 * Cells beginning with =, +, -, @, \t, \r, or | are sanitized by prepending a single quote.
 */

const FORMULA_PREFIXES = ["=", "+", "-", "@", "\t", "\r", "|"] as const;

/**
 * Neutralizes spreadsheet formula injection by prepending a single quote if the string
 * starts with dangerous formula execution triggers in spreadsheet software (Excel, Calc, Sheets).
 */
export function sanitizeForFormulaInjection(raw: string): string {
  if (raw.length === 0) return raw;
  const firstChar = raw[0];
  for (const prefix of FORMULA_PREFIXES) {
    if (firstChar === prefix) {
      return `'${raw}`;
    }
  }
  return raw;
}

/**
 * Escapes a single value for CSV output:
 * 1. Converts null/undefined to empty string.
 * 2. Formats arrays and booleans cleanly.
 * 3. Applies formula injection neutralization.
 * 4. Quotes cells containing commas, double quotes, newlines, carriage returns, or starting quotes.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str: string;
  if (Array.isArray(value)) {
    str = value.join("; ");
  } else if (typeof value === "boolean") {
    str = value ? "true" : "false";
  } else {
    str = String(value);
  }

  const sanitized = sanitizeForFormulaInjection(str);

  // RFC 4180 quoting rule: if string contains quote, comma, semicolon, CRLF, or begins with formula neutralization quote
  if (
    sanitized.includes('"') ||
    sanitized.includes(",") ||
    sanitized.includes(";") ||
    sanitized.includes("\n") ||
    sanitized.includes("\r") ||
    sanitized.startsWith("'")
  ) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }

  return sanitized;
}

/**
 * Formats a single CSV row with deterministic cell escaping.
 */
export function serializeCsvRow(cells: readonly unknown[]): string {
  return cells.map(escapeCsvCell).join(",");
}

/**
 * Serializes headers and data rows to a deterministic CSV string.
 * Uses standard CRLF line terminators.
 */
export function serializeCsv(
  headers: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const headerLine = serializeCsvRow(headers);
  const dataLines = rows.map(serializeCsvRow);
  return [headerLine, ...dataLines].join("\r\n");
}
